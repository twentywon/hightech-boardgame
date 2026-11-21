import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as R from "../src/games/numbercode/rules";
import { chances, loose, possible, sight, type Sight } from "../src/games/numbercode/deduce";
import { bestGuess, chooseMove } from "../src/games/numbercode/ai";
import { numberCodeConfig } from "../src/games/numbercode/config";
import { shortList } from "../src/games/numbercode/view";
import { codeSubject, frames, lieAt, standAt } from "../src/games/numbercode/layout";

const { tileOf, tileCode, POOL, SAY, STOP, AGAIN, GAP, HELPER, JOKER } = R;
const B = (n: number) => tileOf(n, R.BLACK),
  W = (n: number) => tileOf(n, R.WHITE);
const own = (to: number, extra = -1) => ({ from: -1, to, extra });
const guess = (seat: number, index: number, n: number) => own(tileCode(seat, index), SAY + n);
/** A table laid by hand: each seat's row, the pool, which tiles lie face up, the seat to move and its phase. */
function table(rows: number[][], pool: number[], options: { open?: number[]; seat?: number; phase?: R.Phase; jokers?: boolean; held?: number | null } = {}): R.State {
  const s = R.createGame({ rivals: rows.length - 1, jokers: options.jokers ?? true }, () => 0.5);
  s.rows = rows.map((row) => [...row]);
  s.pool = [...pool];
  s.waiting = [];
  s.open = Array.from({ length: R.TILES }, (_, id) => options.open?.includes(id) ?? false);
  s.seat = options.seat ?? 0;
  s.phase = options.phase ?? (pool.length ? "draw" : "guess");
  s.held = options.held ?? null;
  s.out = rows.map(() => false);
  return s;
}
const after = (s: R.State, ...moves: { from: number; to: number; extra: number }[]) =>
  moves.reduce((state, m) => {
    const next = R.play(state, m);
    expect(next, `${JSON.stringify(m)} in ${state.phase}`).not.toBeNull();
    return next!;
  }, s);

/**
 * Every arrangement of the tiles `view`'s seat cannot see, by brute force: each hidden tile of another row takes an
 * unseen tile of its colour (a joker too, if it is not seen), all different, every row in order, no number said
 * wrongly of it. Returns, for each hidden tile in row order, how many arrangements give it each number.
 */
function bruteForce(view: Sight) {
  const seen = new Set<number>();
  view.rows.forEach((row) => row.forEach((t) => t.known !== null && seen.add(tileOf(t.known, t.colour))));
  for (const id of view.holding) seen.add(id);
  const hidden: { seat: number; index: number; colour: number; misses: readonly number[] }[] = [];
  view.rows.forEach((row, seat) => seat !== view.seat && row.forEach((t, index) => t.known === null && hidden.push({ seat, index, colour: t.colour, misses: t.misses })));
  const counts = hidden.map(() => Array.from({ length: 13 }, () => 0)),
    chosen: number[] = [];
  let total = 0;
  const fits = () =>
    view.rows.every((row, seat) => {
      if (seat === view.seat) return true;
      const ids = row.map((t, index) => (t.known !== null ? tileOf(t.known, t.colour) : chosen[hidden.findIndex((h) => h.seat === seat && h.index === index)]));
      return R.ordered(ids);
    });
  const walk = (k: number) => {
    if (k === hidden.length) {
      if (!fits()) return;
      total++;
      chosen.forEach((id, i) => counts[i][R.numberOf(id)]++);
      return;
    }
    const h = hidden[k];
    for (let id = 0; id < (view.jokers ? 26 : 24); id++) {
      if (R.colourOf(id) !== h.colour || seen.has(id) || chosen.includes(id) || h.misses.includes(R.numberOf(id))) continue;
      chosen.push(id);
      walk(k + 1);
      chosen.pop();
    }
  };
  walk(0);
  return { hidden, counts, total };
}

describe("number code: the order of a row", () => {
  test("smaller numbers stand left, a black left of a white of the same number, a joker anywhere", () => {
    let row = [B(2), W(4)];
    row.splice(R.placeFor(row, W(2)), 0, W(2));
    expect(row).toEqual([B(2), W(2), W(4)]);
    row.splice(R.placeFor(row, B(4)), 0, B(4));
    expect(row).toEqual([B(2), W(2), B(4), W(4)]);
    // A numbered tile goes right after its predecessor, so a joker after that stays after it.
    row = [B(1), 25, W(4)];
    row.splice(R.placeFor(row, B(3)), 0, B(3));
    expect(row).toEqual([B(1), B(3), 25, W(4)]);
    expect(R.ordered(row)).toBe(true);
    expect(R.ordered([W(3), B(3)])).toBe(false);
  });
  test("a deal: four each for two or three, three each for four; my jokers wait for me to place them", () => {
    for (const rivals of [1, 2, 3]) {
      const s = R.createGame({ rivals, jokers: true }, seededRandom(rivals * 11));
      expect(s.rows).toHaveLength(rivals + 1);
      expect(s.rows.every((row, seat) => row.length + (seat === 0 ? s.waiting.length : 0) === R.handOf(rivals + 1))).toBe(true);
      expect(s.rows.every(R.ordered)).toBe(true);
      expect(s.pool).toHaveLength(26 - (rivals + 1) * R.handOf(rivals + 1));
      expect(new Set([...s.rows.flat(), ...s.waiting, ...(s.pool as number[])]).size).toBe(26);
    }
    const plain = R.createGame({ rivals: 2, jokers: false }, seededRandom(3));
    expect([...plain.rows.flat(), ...(plain.pool as number[])].every((id) => !R.isJoker(id))).toBe(true);
    // A deal that gives me a joker begins with placing it, at any gap of my row.
    let s: R.State | null = null;
    for (let seed = 1; !s; seed++) {
      const tried = R.createGame({ rivals: 1 }, seededRandom(seed));
      if (tried.waiting.length === 1) s = tried;
    }
    const dealt = s!;
    expect(dealt.phase).toBe("joker");
    expect(R.moves(dealt).filter((m) => m.to >= GAP && m.to < SAY)).toHaveLength(dealt.rows[0].length + 1);
    const placed = after(dealt, own(GAP + 1));
    expect(placed.rows[0][1]).toBe(dealt.waiting[0]);
    expect(placed.phase).toBe("draw");
  });
});

describe("number code: a turn", () => {
  // Me: 0b 3w 6b 9w; the computer: 1b 4w 7b 10w; the pool: 2b 5w.
  const start = () => table([[B(0), W(3), B(6), W(9)], [B(1), W(4), B(7), W(10)]], [B(2), W(5)], { jokers: false });
  test("a right guess lays the tile face up; stopping puts the drawn tile into my row, hidden, in order", () => {
    let s = after(start(), own(POOL + 1));
    expect(s.held).toBe(W(5));
    expect(s.phase).toBe("guess");
    // Without jokers the joker cannot be said.
    expect(R.moves(s).some((m) => m.extra === SAY + JOKER)).toBe(false);
    s = after(s, guess(1, 1, 4));
    expect(s.open[W(4)]).toBe(true);
    expect(s.phase).toBe("again");
    expect(s.last).toMatchObject({ kind: "right", seat: 0, target: W(4), said: 4 });
    expect(numberCodeConfig.cheer!(start(), s, "ai")).toBe("정답! 4");
    s = after(s, own(STOP));
    expect(s.rows[0]).toEqual([B(0), W(3), W(5), B(6), W(9)]);
    expect(s.open[W(5)]).toBe(false);
    expect([s.seat, s.phase, s.streak]).toEqual([1, "draw", 0]);
  });
  test("a wrong guess puts the drawn tile in face up, notes the number said, and ends the turn", () => {
    expect(R.play(after(start(), own(POOL)), own(AGAIN))).toBeNull();
    const s = after(start(), own(POOL), guess(1, 0, 3));
    expect(s.rows[0]).toEqual([B(0), B(2), W(3), B(6), W(9)]);
    expect(s.open[B(2)]).toBe(true);
    expect(s.open[B(1)]).toBe(false);
    expect(s.misses[B(1)]).toEqual([3]);
    expect([s.seat, s.phase]).toEqual([1, "draw"]);
    expect(numberCodeConfig.cheer!(start(), s, "ai")).toBe("땡!");
  });
  test("after a right guess one may go on, and a second right guess goes on as the first", () => {
    let s = after(start(), own(POOL), guess(1, 0, 1), own(AGAIN));
    expect(s.phase).toBe("guess");
    expect(R.moves(s).some((m) => m.to === STOP)).toBe(false);
    s = after(s, guess(1, 3, 10));
    expect([s.phase, s.streak]).toEqual(["again", 2]);
    // A tile already face up can no longer be pointed at.
    expect(R.play(s, guess(1, 0, 1))).toBeNull();
  });
  test("with the pool empty, a wrong guesser lays one of their own hidden tiles face up instead", () => {
    let s = table([[B(0), W(3)], [B(1), W(4)]], [], { jokers: false });
    expect(s.phase).toBe("guess");
    s = after(s, guess(1, 0, 5));
    expect(s.phase).toBe("reveal");
    expect(s.seat).toBe(0);
    expect(R.moves(s).map((m) => m.to)).toEqual([tileCode(0, 0), tileCode(0, 1), HELPER]);
    s = after(s, own(tileCode(0, 1)));
    expect(s.open[W(3)]).toBe(true);
    expect([s.seat, s.phase]).toEqual([1, "guess"]);
    // With nothing drawn, stopping after a right guess puts nothing in.
    s = table([[B(0), W(3)], [B(1), W(4)]], [], { jokers: false });
    s = after(s, guess(1, 0, 1), own(STOP));
    expect(s.rows[0]).toEqual([B(0), W(3)]);
    expect(s.seat).toBe(1);
  });
  test("a drawn joker is placed where its owner chooses, and goes there", () => {
    let s = table([[B(2), W(5)], [B(1), W(4)]], [25, B(8)]);
    s = after(s, own(POOL));
    expect(s.phase).toBe("joker");
    s = after(s, own(GAP), guess(1, 0, 7));
    expect(s.rows[0]).toEqual([25, B(2), W(5)]);
    expect(s.open[25]).toBe(true);
    // Its number is the joker: said as −.
    s = table([[B(2), W(5)], [B(1), 24]], [], { seat: 0 });
    s = after(s, guess(1, 1, JOKER));
    expect(s.open[24]).toBe(true);
  });
  test("the helper is switched on and off on my turn without counting a move", () => {
    const s = start(),
      on = after(s, own(HELPER));
    expect([on.helper, on.ply, on.phase]).toEqual([true, s.ply, s.phase]);
    expect(after(on, own(HELPER)).helper).toBe(false);
    expect(R.moves({ ...s, seat: 1 }).some((m) => m.to === HELPER)).toBe(false);
  });
});

describe("number code: out and the end", () => {
  test("a player with every tile face up is out; the others play on; the last with a hidden tile wins", () => {
    let s = table([[B(0), W(3)], [B(1)], [W(4), B(7)]], [], { jokers: false });
    s = after(s, guess(1, 0, 1));
    expect(s.out).toEqual([false, true, false]);
    expect(s.winner).toBeNull();
    expect(numberCodeConfig.cheer!(table([[B(0), W(3)], [B(1)], [W(4), B(7)]], [], { jokers: false }), s, "ai")).toBe("왼쪽 컴퓨터 탈락!");
    // No guess may be made of a seat that is out.
    expect(R.moves(s).some((m) => R.codeSeat(m.to) === 1 && m.extra >= SAY)).toBe(false);
    s = after(s, guess(2, 0, 4), guess(2, 1, 7));
    expect(s.winner).toBe(0);
    expect(numberCodeConfig.game.reason(s)).toBe("모든 컴퓨터의 코드를 풀었습니다.");
    expect(R.moves(s)).toEqual([]);
  });
  test("I lose as soon as my own tiles are all face up, whoever is left", () => {
    let s = table([[B(0)], [B(1), W(4)], [W(6)]], [], { jokers: false, seat: 2 });
    s = after(s, guess(0, 0, 0));
    expect(s.winner).toBe(1);
    expect(numberCodeConfig.game.reason(s)).toBe("내 코드가 모두 풀렸습니다. 오른쪽 컴퓨터가 마지막 타일을 맞혔습니다.");
    // Laying my last hidden tile face up myself ends it too.
    s = table([[B(0)], [B(1), W(4)]], [], { jokers: false });
    s = after(s, guess(1, 0, 9), own(tileCode(0, 0)));
    expect(s.winner).toBe(1);
  });
  test("turns pass over seats that are out", () => {
    let s = table([[B(0), W(3)], [B(1)], [W(4), B(7)], [B(9), W(10)]], [B(5)], { jokers: false });
    s = after(s, own(POOL), guess(1, 0, 1), own(STOP));
    expect(s.out[1]).toBe(true);
    expect(s.seat).toBe(2);
  });
});

describe("number code: deduction", () => {
  test("a hand-made position: one arrangement without jokers, seven with them", () => {
    // I hold 0b 1w 2b 3w; the computer shows hidden black, hidden white, then 4w face up.
    const s = table([[B(0), W(1), B(2), W(3)], [B(1), W(2), W(4)]], [], { open: [W(4)], jokers: false });
    const plain = chances(sight(s, 0));
    expect(plain.total).toBe(1);
    expect(plain.tiles.map((t) => possible(t.odds))).toEqual([[1], [2]]);
    const jokers = chances(sight({ ...s, jokers: true }, 0));
    expect(jokers.total).toBe(7);
    // Black: 1 (alone, or with the white joker), 3 or 4 (with the white joker), or the black joker (white 0 or 2, or the white joker).
    expect(jokers.tiles[0].odds.map((p) => Math.round(p * 7))).toEqual([0, 2, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 3]);
    expect(jokers.tiles[1].odds.map((p) => Math.round(p * 7))).toEqual([1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4]);
    // A number said wrongly of a tile is ruled out: with the black not 1, it can only be a joker or 3 or 4.
    s.misses[B(1)] = [1];
    const told = chances(sight({ ...s, jokers: true }, 0));
    expect(possible(told.tiles[0].odds)).toEqual([3, 4, JOKER]);
    expect(told.total).toBe(5);
  });
  test("the counts agree with a brute-force count over random positions", () => {
    const random = seededRandom(2024);
    let checked = 0;
    for (let game = 0; game < 60 && checked < 25; game++) {
      let s = R.createGame({ rivals: 1 + (game % 3), jokers: game % 2 === 0 }, random);
      for (let k = 0; k < 4 + (game % 7) && s.winner === null; k++) s = R.play(s, chooseMove(s, "normal", random)!)!;
      if (s.winner !== null) continue;
      const view = sight(s, s.seat),
        hiddenCount = view.rows.reduce((n, row, seat) => n + (seat === view.seat ? 0 : row.filter((t) => t.known === null).length), 0);
      if (hiddenCount > 6) continue;
      const brute = bruteForce(view),
        fast = chances(view);
      expect(fast.total).toBe(brute.total);
      brute.hidden.forEach((h, i) => {
        const odds = fast.tiles.find((t) => t.seat === h.seat && t.index === h.index)!.odds;
        expect(odds.map((p) => Math.round(p * fast.total))).toEqual(brute.counts[i]);
      });
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  }, 60000);
  test("the loose reading keeps a tile between its known neighbours", () => {
    const s = table([[B(5), W(6)], [W(1), B(3), W(8)]], [], { open: [W(1), W(8)], jokers: false });
    expect(possible(loose(sight(s, 0))[0].odds)).toEqual([2, 3, 4, 6, 7, 8]);
  });
  test("the helper's list is short: runs of three or more as a span, the joker as −", () => {
    expect(shortList([0, 1, 2, 3, 7, 9, 10, 12])).toBe("0–3 7 9 10 −");
    expect(shortList([4])).toBe("4");
  });
});

describe("number code: the computer", () => {
  /** The same table with the tiles `seat` cannot see dealt otherwise: same colours, and the numbers said of a place stay with the place. */
  function reshuffled(s: R.State, seat: number, random: () => number): R.State {
    const n: R.State = { ...s, rows: s.rows.map((r) => [...r]), pool: [...s.pool], misses: s.misses.map((m) => [...m]) };
    const places: { get: () => number; set: (id: number) => void }[] = [];
    n.rows.forEach((row, k) => {
      if (k === seat) return;
      row.forEach((id, i) => !s.open[id] && places.push({ get: () => n.rows[k][i], set: (x) => (n.rows[k][i] = x) }));
    });
    n.pool.forEach((id, i) => id !== null && places.push({ get: () => n.pool[i]!, set: (x) => (n.pool[i] = x) }));
    if (n.held !== null && n.seat !== seat) places.push({ get: () => n.held!, set: (x) => (n.held = x) });
    for (const colour of [0, 1]) {
      const mine = places.filter((p) => R.colourOf(p.get()) === colour),
        ids = mine.map((p) => p.get()),
        notes = ids.map((id) => s.misses[id]);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      mine.forEach((p, i) => {
        p.set(ids[i]);
        n.misses[ids[i]] = [...notes[i]];
      });
    }
    return n;
  }
  test("it never reads a hidden tile: tables that look the same to it get the same move", () => {
    const random = seededRandom(77);
    let compared = 0;
    for (let game = 0; game < 8; game++) {
      let s = R.createGame({ rivals: 1 + (game % 3), jokers: game % 3 !== 1 }, random);
      while (s.winner === null && s.ply < 60) {
        if (s.seat !== 0) {
          const other = reshuffled(s, s.seat, random);
          expect(sight(other, s.seat)).toEqual(sight(s, s.seat));
          for (const level of ["easy", "normal", "hard"] as const) expect(chooseMove(other, level, seededRandom(s.ply))).toEqual(chooseMove(s, level, seededRandom(s.ply)));
          compared++;
        }
        s = R.play(s, chooseMove(s, "normal", random)!)!;
      }
    }
    expect(compared).toBeGreaterThan(60);
  }, 60000);
  test("it guesses what it can be sure of, and goes on when it is sure", () => {
    // From where the computer sits my black is 1 and my white 2 (as in the hand-made position above).
    const s = table([[B(1), W(2), W(4)], [B(0), W(1), B(2), W(3)]], [B(9)], { open: [W(4)], jokers: false, seat: 1, phase: "again", held: B(9) });
    s.pool = [null];
    for (const level of ["normal", "hard"] as const) {
      const best = bestGuess(sight(s, 1), level, () => 0)!;
      expect(best.p).toBeCloseTo(1);
      expect(chooseMove(s, level, () => 0)).not.toEqual(own(STOP));
    }
  });
  test("whole games at every level stay legal and quick, four at the table included; the hard computer beats the easy one", () => {
    const random = seededRandom(5);
    let hardWins = 0,
      games = 0,
      slowest = 0;
    for (let game = 0; game < 36; game++) {
      const rivals = 1 + (game % 3);
      let s = R.createGame({ rivals, jokers: game % 2 === 0 }, random);
      // Seat 0 plays easy, every computer hard.
      while (s.winner === null && s.ply < 400) {
        const begun = performance.now(),
          m = chooseMove(s, s.seat === 0 ? "easy" : "hard", random)!;
        slowest = Math.max(slowest, performance.now() - begun);
        const next = R.play(s, m);
        expect(next).not.toBeNull();
        s = next!;
        expect(s.rows.every(R.ordered)).toBe(true);
      }
      expect(s.winner).not.toBeNull();
      games++;
      if (s.winner === 1) hardWins++;
    }
    expect(hardWins / games).toBeGreaterThan(0.6);
    expect(slowest).toBeLessThan(400);
  }, 60000);
});

describe("number code: the table", () => {
  test("every place a test aims at stands inside the view's subject", () => {
    for (const seats of [2, 3, 4]) {
      const subject = codeSubject(seats);
      frames(seats).forEach((_, seat) => {
        for (const n of [3, 8, 13]) {
          if (seats === 4 && n > 10) continue;
          for (let i = 0; i < n; i++)
            for (const pose of [standAt(seats, seat, i, n), lieAt(seats, seat, i, n)]) {
              expect(Math.abs(pose.p[0])).toBeLessThan(subject.half);
              expect(Math.abs(pose.p[2])).toBeLessThan(subject.halfZ);
            }
        }
      });
    }
  });
  test("the setup's words: players, tiles a hand, and the jokers", () => {
    expect(numberCodeConfig.tableNote("", { rivals: "3", jokers: true })).toBe("4명 · 3장씩 · 조커 2장");
    expect(numberCodeConfig.tableNote("", { rivals: "1", jokers: false })).toBe("2명 · 4장씩");
    expect(R.createGame({ rivals: "2" }).seats).toBe(3);
    expect(R.seatNames(4)).toEqual(["나", "왼쪽 컴퓨터", "맞은편 컴퓨터", "오른쪽 컴퓨터"]);
  });
});
