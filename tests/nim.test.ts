import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as N from "../src/games/nim/rules";
import { nimConfig } from "../src/games/nim/config";
import { PITCH, RING, cupAt, heapSpot, nimShift, nimSubject, rackOf, ringAt, stackSpot, stacksOf, trayOf } from "../src/games/nim/layout";

const { take } = N;
/** Plays takes in order from a state, failing the test on any refused. */
const after = (state: N.State, ...takes: number[]) =>
  takes.reduce((s, t) => {
    const next = N.play(s, take(t));
    expect(next, `take ${t} with ${N.left(s)} left`).not.toBeNull();
    return next!;
  }, state);
/** Whether the side to move wins against every reply, by searching every line (heaps are small). */
function winning(left: number, most: number, misere: boolean, memo = new Map<number, boolean>()): boolean {
  if (left === 0) return misere; // the other side took the last one
  const known = memo.get(left);
  if (known !== undefined) return known;
  let win = false;
  for (let t = 1; t <= Math.min(most, left) && !win; t++) win = !winning(left - t, most, misere, memo);
  memo.set(left, win);
  return win;
}

describe("nim rules", () => {
  test("with the last one losing, whoever takes the last ring loses; without it, wins", () => {
    const misere = N.createGame("nim", { rings: 5, most: 3, misere: true });
    let s = after(misere, 3, 1);
    expect(s.winner).toBeNull();
    s = after(s, 1);
    expect(s.winner).toBe(1);
    expect(s.takers).toEqual([0, 0, 0, 1, 0]);
    const normal = after(N.createGame("nim", { rings: 5, most: 3, misere: false }), 3, 1, 1);
    expect(normal.winner).toBe(0);
    expect(nimConfig.game.reason(normal)).toBe("앞자리가 마지막 고리를 가져갔습니다.");
    expect(nimConfig.game.reason(s)).toBe("앞자리가 마지막 고리를 가져갔습니다.");
    expect(N.moves(s)).toEqual([]);
  });
  test("the numbers set are used within their bounds, and the defaults otherwise", () => {
    const s = N.createGame("nim", { rings: 37, most: 5, misere: false });
    expect([s.total, s.most, s.misere, s.turn]).toEqual([37, 5, false, 0]);
    const wild = N.createGame("nim", { rings: 400, most: 1, misere: "yes" });
    expect([wild.total, wild.most, wild.misere]).toEqual([N.RINGS.max, N.MOST.min, true]);
    const plain = N.createGame("nim");
    expect([plain.total, plain.most, plain.misere]).toEqual([N.RINGS.value, N.MOST.value, true]);
    // Who moves first: me, the computer, or a coin.
    expect(N.createGame("nim", { first: "computer" }).turn).toBe(1);
    expect(N.createGame("nim", { first: "random" }, () => 0.7).turn).toBe(1);
    expect(N.createGame("nim", { first: "random" }, () => 0.2).turn).toBe(0);
    expect(N.createGame("nim", { first: "me" }).turn).toBe(0);
  });
  test("아이스크림 31 is fixed at 31, at most 3, and the one who eats 31 loses", () => {
    const s = N.createGame("31", { rings: 10, most: 6, misere: false });
    expect([s.mode, s.total, s.most, s.misere]).toEqual(["ice", 31, 3, true]);
    let game = s;
    for (let k = 0; k < 10; k++) game = after(game, 3);
    expect(N.left(game)).toBe(1);
    expect(N.moves(game)).toEqual([take(1)]);
    game = after(game, 1);
    // Ten takes of three by turns, then the eleventh (side 0's) eats 31.
    expect(game.winner).toBe(1);
    expect(nimConfig.game.reason(game)).toBe("앞자리가 31번 아이스크림을 먹었습니다.");
    expect(nimConfig.tableNote("31", {})).toBe("한 번에 1~3개 · 31을 먹으면 패배");
    expect(nimConfig.tableNote("nim", { rings: 12, most: 4, misere: false })).toBe("한 번에 1~4개 · 마지막을 가져가면 승리");
  });
  test("a take of none, of more than the most, of more than are left, or of another shape is refused and changes nothing", () => {
    const s = N.createGame("nim", { rings: 7, most: 3 }),
      before = JSON.stringify(s);
    for (const t of [0, -1, 4, 9]) expect(N.play(s, take(t))).toBeNull();
    expect(N.play(s, { from: 0, to: 1, extra: -1 })).toBeNull();
    expect(N.play(s, { from: -1, to: 1, extra: 2 })).toBeNull();
    expect(N.play(s, { from: -1, to: 0.5, extra: -1 })).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
    const near = after(s, 3, 2);
    expect(N.left(near)).toBe(2);
    expect(N.play(near, take(3))).toBeNull();
    expect(N.moves(near)).toEqual([take(1), take(2)]);
    // The screen says why.
    expect(nimConfig.refusal!(s, take(4))).toBe("한 번에 3개까지만 가져갈 수 있습니다.");
    expect(nimConfig.refusal!(near, take(3))).toBe("남은 것은 2개뿐입니다.");
    expect(nimConfig.refusal!(near, take(2))).toBeNull();
  });
  test("undo rebuilds the game one take back, with who took each ring", () => {
    for (const first of ["me", "computer"]) {
      const start = N.createGame("nim", { rings: 20, most: 4, first });
      const states = [start];
      for (const t of [2, 4, 1, 3, 3, 2]) states.push(after(states[states.length - 1], t));
      for (let k = states.length - 1; k > 0; k--) expect(N.undo(states[k])).toEqual(states[k - 1]);
      expect(N.undo(start)).toBe(start);
      const last = states[states.length - 1];
      const by = first === "me" ? [0, 1] : [1, 0];
      expect(last.takers).toEqual([by[0], by[0], by[1], by[1], by[1], by[1], by[0], by[1], by[1], by[1], by[0], by[0], by[0], by[1], by[1]]);
      expect(N.takenBy(last, 0) + N.takenBy(last, 1)).toBe(15);
    }
    // A finished game too.
    const done = after(N.createGame("31"), ...Array(10).fill(3), 1);
    expect(N.undo(done).winner).toBeNull();
    expect(N.left(N.undo(done))).toBe(1);
  });
  test("the perfect take is there exactly when the side to move can win, and wins against every reply", () => {
    for (const misere of [true, false])
      for (let most = 2; most <= 6; most++) {
        const memo = new Map<number, boolean>();
        for (const total of [5, 6, 7, 9, 10, 13, 21, 22, 31, 36, 50]) {
          const s = N.createGame("nim", { rings: total, most, misere });
          expect(N.perfect(s) !== null, `${total}/${most}/${misere}`).toBe(winning(total, most, misere, memo));
          if (N.perfect(s) === null) continue;
          // The computer at 어려움 against every line the other side can choose.
          const seen = new Map<string, boolean>();
          const holds = (state: N.State): boolean => {
            if (state.winner !== null) return state.winner === 0;
            const key = `${N.left(state)}|${state.turn}`;
            if (!seen.has(key))
              seen.set(key, state.turn === 0 ? holds(N.play(state, N.chooseMove(state, "hard")!)!) : N.moves(state).every((m) => holds(N.play(state, m)!)));
            return seen.get(key)!;
          };
          expect(holds(s), `${total}/${most}/${misere}`).toBe(true);
        }
      }
    // 아이스크림 31: the first to move wins by eating 1 and 2, and then up to 6, 10, … 30.
    const ice = N.createGame("31");
    expect(N.perfect(ice)).toBe(2);
    expect(N.perfect(after(ice, 2, 3))).toBe(1);
  });
  test("어려움 always plays perfectly, taking one where nothing wins; 쉬움 takes at random; 보통 is mostly right", () => {
    const random = seededRandom(31);
    for (let total = 5; total <= 30; total++) {
      const s = N.createGame("nim", { rings: total, most: 3 });
      expect(N.countOf(N.chooseMove(s, "hard", random)!)).toBe(N.perfect(s) ?? 1);
    }
    // 쉬움: every legal take, and only those.
    const s = N.createGame("nim", { rings: 21, most: 4 }),
      seen = new Set<number>();
    for (let k = 0; k < 400; k++) seen.add(N.countOf(N.chooseMove(s, "easy", random)!));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
    const two = after(N.createGame("nim", { rings: 6, most: 4 }), 4);
    for (let k = 0; k < 50; k++) expect(N.countOf(N.chooseMove(two, "easy", random)!)).toBeLessThanOrEqual(2);
    // 보통: the right take about three times in four, else any.
    let right = 0;
    const trials = 4000,
      win = N.createGame("nim", { rings: 22, most: 4 }); // 22 = 4·5 + 2, so 1 is right (last one loses)
    expect(N.perfect(win)).toBe(1);
    for (let k = 0; k < trials; k++) if (N.countOf(N.chooseMove(win, "normal", random)!) === 1) right++;
    const share = right / trials,
      expected = N.NORMAL_RIGHT + (1 - N.NORMAL_RIGHT) / 4;
    expect(Math.abs(share - expected)).toBeLessThan(0.04);
    // The computer reads only the state: a game over has no take.
    expect(N.chooseMove(after(N.createGame("nim", { rings: 5, most: 5, misere: false }), 5), "hard")).toBeNull();
  });
  test("the hint, the tallies and the calls of 아이스크림 31", () => {
    const s = after(N.createGame("31"), 3, 2);
    expect(nimConfig.game.hint(s)).toBe("6번부터 1~3개를 먹으세요. 남은 아이스크림 26개");
    expect(nimConfig.game.tally(s)).toEqual(["3개", "2개"]);
    expect(nimConfig.game.hint(after(N.createGame("nim", { rings: 6, most: 3 }), 3, 2))).toBe("고리를 1개 가져가세요. 남은 고리 1개");
    const cheer = nimConfig.cheer!;
    expect(cheer(s, after(s, 3), "ai")).toBe("6, 7, 8!");
    const end = after(N.createGame("31"), ...Array(10).fill(3));
    expect(cheer(end, after(end, 1), "ai")).toBe("내가 31!");
    expect(cheer(end, after(end, 1), "local")).toBe("앞자리가 31!");
    // Eleven takes leave two, which the twelfth (the computer's) eats.
    const other = after(N.createGame("31"), ...Array(9).fill(3), 1, 1);
    expect(cheer(other, after(other, 2), "ai")).toBe("컴퓨터가 31!");
    expect(cheer(N.createGame("nim"), after(N.createGame("nim"), 2), "ai")).toBeNull();
  });
  test("the settings of the setup: numbers, the rule and who begins, fixed for 아이스크림 31", () => {
    const settings = nimConfig.settings!;
    expect(settings.map((s) => [s.id, s.kind])).toEqual([
      ["rings", "number"],
      ["most", "number"],
      ["misere", "flag"],
      ["first", "choice"],
    ]);
    for (const s of settings.slice(0, 3)) expect(s.fixed).toEqual(["31"]);
    expect(settings[3].ai).toBe(true);
  });
});

describe("nim layout", () => {
  test("rings stand on the rod side by side between the tip and the right end board, pushed to the right", () => {
    for (const total of [5, 21, 50]) {
      const rack = rackOf(total);
      expect(ringAt(total, 0).x + RING.width / 2).toBeLessThan(rack.right);
      expect(ringAt(total, 0).x - ringAt(total, 1).x).toBeCloseTo(PITCH);
      // The leftmost ring leaves a bare stretch of rod at the open end.
      expect(ringAt(total, total - 1).x - RING.width / 2 - rack.tip).toBeGreaterThan(1.2);
      // Every ring is in view, also on a phone held sideways with the view moved over.
      const subject = nimSubject(total, 2.4),
        shift = nimShift(total, 2.4);
      expect(rack.leftBoard).toBeGreaterThanOrEqual(-subject.half - shift - 1e-9);
      expect(rack.rightBoard).toBeLessThanOrEqual(subject.half - shift + 1e-9);
    }
  });
  test("each tray holds its side's rings in stacks of five, apart from the other tray and the rack", () => {
    for (const total of [5, 21, 50]) {
      const mine = trayOf(total, 0),
        theirs = trayOf(total, 1);
      expect(mine.z).toBeGreaterThan(0.6);
      expect(theirs.z).toBeLessThan(0);
      const spots = Array.from({ length: Math.max(total, 10) }, (_, k) => stackSpot(total, 0, k));
      expect(spots[4].x).toBe(spots[0].x);
      expect(spots[5].x).toBeGreaterThan(spots[4].x);
      for (const spot of spots.slice(0, stacksOf(total) * 5)) {
        expect(spot.x).toBeGreaterThan(mine.x0);
        expect(spot.x).toBeLessThan(mine.x1);
      }
      // No two rings lie in one place.
      expect(new Set(spots.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)}`)).size).toBe(spots.length);
    }
  });
  test("the scoops stand in rows of eight read left to right, and a bowl's heap never puts two scoops in one place", () => {
    expect(cupAt(2).x).toBeGreaterThan(cupAt(1).x);
    expect(cupAt(9).z).toBeGreaterThan(cupAt(1).z);
    expect(cupAt(9).x).toBe(cupAt(1).x);
    const heap = Array.from({ length: 31 }, (_, k) => heapSpot(k));
    expect(new Set(heap.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)},${s.z.toFixed(3)}`)).size).toBe(31);
  });
});
