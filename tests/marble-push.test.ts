import { describe, expect, it } from "vitest";
import { CELLS, COUNT, DIRS, LAYOUTS, QUIET, cellOf, complaint, createGame, layout, lineOf, marblePush, moves, play, refusal, step, type Owner, type State } from "../src/games/push/rules";
import { Search, chooseMove } from "../src/games/push/ai";
import type { Move } from "../src/games/points/types";

/** A position from lists of axial co-ordinates: side 0's marbles, side 1's, and who moves. */
function position(a: [number, number][], b: [number, number][], turn: 0 | 1 = 0, lost: [number, number] = [0, 0]): State {
  const cells: Owner[] = CELLS.map(() => null);
  for (const [q, r] of a) cells[cellOf(q, r)] = 0;
  for (const [q, r] of b) cells[cellOf(q, r)] = 1;
  return { ...createGame(), cells, turn, lost, seen: [] };
}
const at = (q: number, r: number) => cellOf(q, r);
const E = 0,
  NE = 1,
  NW = 2,
  W = 3,
  SW = 4,
  SE = 5;
const mv = (from: number, to: number, dir: number): Move => ({ from, to, extra: dir });
const key = (m: Move) => `${m.from},${m.to},${m.extra}`;

describe("marble push: the board and the layouts", () => {
  it("has 61 cells, five to a side, and neighbours that agree both ways", () => {
    expect(COUNT).toBe(61);
    expect(CELLS.filter((c) => c.r === -4)).toHaveLength(5);
    expect(CELLS.filter((c) => c.r === 0)).toHaveLength(9);
    for (let c = 0; c < COUNT; c++)
      for (let d = 0; d < 6; d++) {
        const n = step(c, d);
        if (n >= 0) expect(step(n, (d + 3) % 6)).toBe(c);
      }
    // A middle cell has six neighbours, a corner three.
    expect(DIRS.filter((_, d) => step(at(0, 0), d) >= 0)).toHaveLength(6);
    expect(DIRS.filter((_, d) => step(at(4, 0), d) >= 0)).toHaveLength(3);
  });
  it("lays fourteen marbles a side in every set-up, each side the other's mirror across the middle row", () => {
    for (const { value } of LAYOUTS) {
      const cells = layout(value);
      expect(cells).toHaveLength(61);
      expect(cells.filter((c) => c === 0)).toHaveLength(14);
      expect(cells.filter((c) => c === 1)).toHaveLength(14);
      CELLS.forEach((c, i) => {
        const turned = cells[cellOf(c.q + c.r, -c.r)];
        expect(turned === null ? null : 1 - turned).toBe(cells[i]);
      });
    }
    // The standard one: side 0 fills the two near rows and the middle three of the third.
    const standard = layout("standard");
    expect(CELLS.filter((c, i) => standard[i] === 0 && c.r === 2).map((c) => c.q)).toEqual([-2, -1, 0]);
  });
  it("offers the standard opening's 44 moves, and gives them in a form that plays", () => {
    const s = createGame("standard"),
      list = moves(s);
    expect(list).toHaveLength(44);
    expect(new Set(list.map(key)).size).toBe(list.length);
    for (const m of list) expect(play(s, m)).not.toBeNull();
  });
  it("finds the lines of a group, at most three long", () => {
    expect(lineOf(at(0, 0), at(2, 0))?.cells).toEqual([at(0, 0), at(1, 0), at(2, 0)]);
    expect(lineOf(at(0, 0), at(0, 0))?.cells).toEqual([at(0, 0)]);
    expect(lineOf(at(0, 0), at(3, 0))).toBeNull();
    expect(lineOf(at(0, 0), at(1, 1))).toBeNull();
  });
});

describe("marble push: moving", () => {
  it("moves a line along itself, and either end may be named first", () => {
    const s = position([[-1, 1], [0, 1], [1, 1]], [[0, -3]]);
    const a = play(s, mv(at(-1, 1), at(1, 1), E))!,
      b = play(s, mv(at(1, 1), at(-1, 1), E))!;
    expect(a.cells).toEqual(b.cells);
    expect([a.cells[at(0, 1)], a.cells[at(1, 1)], a.cells[at(2, 1)], a.cells[at(-1, 1)]]).toEqual([0, 0, 0, null]);
    expect(a.last).toMatchObject({ inline: true, group: [at(-1, 1), at(0, 1), at(1, 1)], pushed: [], off: -1 });
    // The same line taken the other way: its leading marble is now the left one.
    expect(play(s, mv(at(1, 1), at(-1, 1), W))!.last?.group).toEqual([at(1, 1), at(0, 1), at(-1, 1)]);
    expect(a.turn).toBe(1);
  });
  it("moves a line broadside only into empty cells, and never pushes sideways", () => {
    const s = position([[-2, 2], [-1, 2], [0, 2]], [[0, 1]]);
    // North-west: (-2,1) (-1,1) (0,1) – the last holds the other side's marble.
    expect(play(s, mv(at(-2, 2), at(0, 2), NW))).toBeNull();
    expect(refusal(s, mv(at(-2, 2), at(0, 2), NW))).toContain("비어 있어야");
    const moved = play(s, mv(at(-2, 2), at(0, 2), SE))!;
    expect([at(-2, 3), at(-1, 3), at(0, 3)].map((c) => moved.cells[c])).toEqual([0, 0, 0]);
    expect([at(-2, 2), at(-1, 2), at(0, 2)].map((c) => moved.cells[c])).toEqual([null, null, null]);
    // Off the edge sideways is refused too.
    const rim = position([[-4, 4], [-3, 4]], [[0, 0]]);
    expect(play(rim, mv(at(-4, 4), at(-3, 4), SE))).toBeNull();
    expect(moved.last?.inline).toBe(false);
  });
  it("never takes one's own marble off the board, nor moves into one's own", () => {
    const s = position([[4, 0], [3, 0], [1, 0]], [[-4, 0]]);
    expect(play(s, mv(at(3, 0), at(4, 0), E))).toBeNull();
    expect(refusal(s, mv(at(3, 0), at(4, 0), E))).toContain("판 밖");
    expect(play(s, mv(at(1, 0), at(1, 0), E))).not.toBeNull();
    expect(play(s, mv(at(3, 0), at(3, 0), W))).not.toBeNull();
    expect(play(s, mv(at(1, 0), at(1, 0), E))!.cells[at(2, 0)]).toBe(0);
    expect(refusal(s, mv(at(1, 0), at(3, 0), E))).not.toBeNull();
  });
  it("refuses a group that is not one straight line of my own marbles", () => {
    const s = position([[0, 0], [2, 0], [0, 1]], [[1, 0]]);
    expect(play(s, mv(at(0, 0), at(2, 0), E))).toBeNull();
    expect(play(s, mv(at(0, 0), at(1, 1), E))).toBeNull();
    expect(refusal(s, mv(at(0, 0), at(2, 0), E))).toContain("내 구슬만");
    expect(refusal(s, complaint(1))).toContain("상대 구슬은 고를 수 없습니다");
  });
});

describe("marble push: sumito", () => {
  it("lets two push one and three push one or two", () => {
    const two = position([[-2, 0], [-1, 0]], [[0, 0]]);
    const pushed = play(two, mv(at(-2, 0), at(-1, 0), E))!;
    expect(pushed.cells[at(1, 0)]).toBe(1);
    expect(pushed.cells[at(0, 0)]).toBe(0);
    expect(pushed.last?.pushed).toEqual([at(0, 0)]);
    const three = position([[-3, 0], [-2, 0], [-1, 0]], [[0, 0], [1, 0]]);
    const pushedTwo = play(three, mv(at(-3, 0), at(-1, 0), E))!;
    expect([at(1, 0), at(2, 0)].map((c) => pushedTwo.cells[c])).toEqual([1, 1]);
    expect(pushedTwo.cells[at(-3, 0)]).toBeNull();
  });
  it("refuses one pushing anything, two pushing two and three pushing three", () => {
    const one = position([[-1, 0]], [[0, 0]]);
    expect(play(one, mv(at(-1, 0), at(-1, 0), E))).toBeNull();
    expect(refusal(one, mv(at(-1, 0), at(-1, 0), E))).toContain("하나로는");
    const two = position([[-2, 0], [-1, 0]], [[0, 0], [1, 0]]);
    expect(play(two, mv(at(-2, 0), at(-1, 0), E))).toBeNull();
    expect(refusal(two, mv(at(-2, 0), at(-1, 0), E))).toContain("3개 이상");
    const three = position([[-3, 0], [-2, 0], [-1, 0]], [[0, 0], [1, 0], [2, 0]]);
    expect(play(three, mv(at(-3, 0), at(-1, 0), E))).toBeNull();
    expect(refusal(three, mv(at(-3, 0), at(-1, 0), E))).toContain("밀 수 없습니다");
  });
  it("refuses a push against a marble of my own behind the pushed one", () => {
    const s = position([[-3, 0], [-2, 0], [-1, 0], [1, 0]], [[0, 0]]);
    expect(play(s, mv(at(-3, 0), at(-1, 0), E))).toBeNull();
    expect(refusal(s, mv(at(-3, 0), at(-1, 0), E))).toContain("뒤에 내 구슬");
  });
  it("pushes only the marbles straight ahead: a gap ends the row pushed", () => {
    // Three push one; the other side's second marble stands a cell further on, beyond an empty cell.
    const s = position([[-3, 0], [-2, 0], [-1, 0]], [[0, 0], [2, 0]]);
    const next = play(s, mv(at(-3, 0), at(-1, 0), E))!;
    expect([at(1, 0), at(2, 0)].map((c) => next.cells[c])).toEqual([1, 1]);
    expect(next.last?.pushed).toEqual([at(0, 0)]);
  });
  it("pushes a marble over the edge out of the game", () => {
    const s = position([[2, 0], [3, 0]], [[4, 0]]);
    const next = play(s, mv(at(2, 0), at(3, 0), E))!;
    expect(next.lost).toEqual([0, 1]);
    expect(next.cells[at(4, 0)]).toBe(0);
    expect(next.last?.off).toBe(at(4, 0));
    expect(next.quiet).toBe(0);
    expect(marblePush.tally(next)[0]).toContain("1 / 6");
    expect(marblePush.effect(next)?.removed).toEqual([at(4, 0)]);
  });
  it("is won by the sixth marble pushed off", () => {
    const s = position([[1, 0], [2, 0], [3, 0]], [[4, 0], [-4, 0]], 0, [2, 5]);
    const next = play(s, mv(at(1, 0), at(3, 0), E))!;
    expect(next.winner).toBe(0);
    expect(marblePush.reason(next)).toContain("6개");
    expect(moves(next)).toEqual([]);
    expect(play(next, mv(at(2, 0), at(4, 0), W))).toBeNull();
  });
  it("never changes the state it is given", () => {
    const s = createGame("daisy"),
      copy = JSON.stringify(s);
    for (const m of moves(s).slice(0, 10)) play(s, m);
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe("marble push: draws", () => {
  it("draws when the same position comes up for the third time", () => {
    let s = createGame("standard");
    const there = mv(at(-2, 2), at(-2, 2), NW),
      back = mv(at(-2, 1), at(-2, 1), SE),
      theirs = mv(at(2, -2), at(2, -2), SE),
      home = mv(at(2, -1), at(2, -1), NW);
    for (let round = 0; round < 2; round++) for (const m of [there, theirs, back, home]) s = play(s, m)!;
    expect(s.winner).toBe("draw");
    expect(s.drawn).toBe("repeat");
    expect(marblePush.reason(s)).toContain("비겼습니다");
  });
  it(`draws after ${QUIET} moves in a row without a marble pushed off`, () => {
    // Two lone marbles walk round each other's corners without ever meeting again in the same position.
    let s = position([[-4, 4]], [[4, -4]]);
    s = { ...s, quiet: QUIET - 1 };
    s = play(s, mv(at(-4, 4), at(-4, 4), E))!;
    expect(s.winner).toBe("draw");
    expect(s.drawn).toBe("quiet");
  });
});

describe("marble push: the computer", () => {
  /** A seeded random. */
  const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  it("generates exactly the rules' moves in positions met along random games", () => {
    const random = seeded(7);
    for (const variant of ["standard", "daisy", "inner"]) {
      let s = createGame(variant);
      for (let ply = 0; ply < 80 && s.winner === null; ply++) {
        const legal = moves(s),
          search = new Search(s),
          buffer = new Int32Array(512),
          n = search.generate(s.turn + 1, buffer),
          mine = new Set<string>();
        for (let i = 0; i < n; i++) {
          const m = buffer[i];
          mine.add(key(normal(s, { from: m & 63, to: (m >> 6) & 63, extra: (m >> 12) & 7 })));
          // Made and unmade, the board is as before; made, it is what the rules give.
          const before = Array.from(search.board);
          search.make(m);
          const after = play(s, { from: m & 63, to: (m >> 6) & 63, extra: (m >> 12) & 7 })!;
          expect(Array.from(search.board)).toEqual(after.cells.map((o) => (o === null ? 0 : o + 1)));
          expect(search.lost).toEqual(after.lost);
          search.unmake();
          expect(Array.from(search.board)).toEqual(before);
        }
        expect([...mine].sort()).toEqual(legal.map(key).sort());
        s = play(s, legal[Math.floor(random() * legal.length)])!;
      }
    }
  });
  /** The canonical form `moves` gives a move. */
  function normal(s: State, m: Move): Move {
    const last = play(s, m)!.last!,
      ends = [last.group[0], last.group[last.group.length - 1]];
    return last.inline ? { from: ends[0], to: ends[1], extra: m.extra } : { from: Math.min(...ends), to: Math.max(...ends), extra: m.extra };
  }
  const fixed = (budget: number) => {
    let t = 0;
    return () => (t += budget);
  };
  it("pushes a marble off when it can", () => {
    // Side 1 to move: its two on the right edge row can push my single marble at the corner off; nothing else matters much.
    const s = position([[4, 0], [-1, 2], [0, 2], [-2, 3], [-1, 3], [0, 3]], [[2, 0], [3, 0], [-1, -2], [0, -2], [1, -2]], 1);
    for (const level of ["easy", "normal", "hard"] as const) {
      const m = chooseMove(s, level, seeded(3))!;
      const next = play(s, m)!;
      expect(next.lost[0], level).toBe(1);
    }
  });
  it("saves a marble that would be pushed off when it can", () => {
    // My marble on the right corner has the computer's two in a line behind it; moving it away (or blocking) saves it.
    const s = position([[4, 0], [-1, 2], [0, 2], [-2, 3], [-1, 3], [0, 3]], [[2, 0], [3, 0], [-1, -2], [0, -2], [1, -2]], 0);
    for (const level of ["normal", "hard"] as const) {
      const m = chooseMove(s, level, seeded(5))!,
        next = play(s, m)!;
      // After my move the computer cannot push anything off.
      for (const reply of moves(next)) expect(play(next, reply)!.lost[0], `${level}: ${key(m)}`).toBe(0);
    }
  });
  it("takes the fifth marble when three of its own stand behind two at the edge", () => {
    // Side 0 to move with three in a row behind two of the other side's at the edge: pushing gains a marble now.
    const s = position([[0, 0], [1, 0], [2, 0], [-3, 3]], [[3, 0], [4, 0], [0, -3], [-1, -3]], 0, [0, 4]);
    const m = chooseMove(s, "normal", seeded(1))!;
    expect(play(s, m)!.lost[1]).toBe(5);
  });
  it("answers within its time at every level from the opening", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const start = performance.now();
      const m = chooseMove(createGame("standard"), level);
      expect(m).not.toBeNull();
      expect(performance.now() - start).toBeLessThan({ easy: 600, normal: 1200, hard: 2200 }[level]);
    }
    // With a fixed clock the search goes to its depth and returns a legal move.
    const s = createGame("inner");
    const m = chooseMove(s, "normal", seeded(2), fixed(1), { ms: 1e9, depth: 2, noise: 0 })!;
    expect(play(s, m)).not.toBeNull();
  });
  it("plays whole games against itself that end, every move legal", () => {
    let s = createGame("daisy");
    const random = seeded(11);
    for (let ply = 0; ply < 400 && s.winner === null; ply++) {
      const m = chooseMove(s, "easy", random, fixed(1), { ms: 1e9, depth: 1, noise: 60 })!;
      const next = play(s, m);
      expect(next).not.toBeNull();
      s = next!;
    }
    expect(s.winner).not.toBeNull();
  });
});
