import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as hanoi from "../src/games/hanoi/rules";
import * as pour from "../src/games/pour/rules";

describe("water pouring, upgraded", () => {
  test("four vessels: every puzzle drawn can be solved in the fewest pours it names, within its stage's band", () => {
    const kinds = new Set<string>();
    for (let level = 4; level <= pour.STAGE_COUNT; level++)
      for (let seed = 1; seed <= 14; seed++) {
        const start = pour.createGame(level, seededRandom(seed * 13 + level)),
          [low, high] = pour.BANDS4[level - 4],
          way = pour.solve(start)!;
        kinds.add(start.goal.kind);
        expect(pour.vesselsOf(level)).toBe(4);
        expect(start.amounts).toEqual([start.caps[0], 0, 0, 0]);
        expect(start.caps.every((cap, i) => i === 0 || cap < start.caps[i - 1])).toBe(true);
        expect(start.caps[3]).toBeGreaterThanOrEqual(2);
        expect([way.length, start.best >= low && start.best <= high]).toEqual([start.best, true]);
        const end = way.reduce((s, move) => pour.play(s, move)!, start);
        expect(end.winner).toBe(0);
        // Nothing is ever lost.
        expect(end.amounts.reduce((a, b) => a + b)).toBe(start.caps[0]);
        if (start.goal.kind === "thirds") expect(end.amounts.slice(0, 3)).toEqual([1, 2, 3].map(() => start.caps[0] / 3));
        if (start.goal.kind === "split") expect(end.amounts.slice(0, 2)).toEqual([start.caps[0] / 2, start.caps[0] / 2]);
        if (start.goal.kind === "make") expect(end.amounts).toContain(start.goal.amount);
        expect(pour.holding(end.amounts, end.goal)).not.toBeNull();
      }
    // All three kinds of goal come up.
    expect([...kinds].sort()).toEqual(["make", "split", "thirds"]);
  });
  test("a pour among four goes on until one is empty or the other full; the goal of thirds is told and met", () => {
    let state: pour.State = { caps: [12, 7, 5, 3], amounts: [12, 0, 0, 0], goal: { kind: "thirds", amount: 4 }, best: 0, winner: null, last: null, ply: 0 };
    expect(pour.moves(state).map((m) => [m.from, m.to])).toEqual([[0, 1], [0, 2], [0, 3]]);
    state = pour.play(state, { from: 0, to: 2, extra: -1 })!;
    state = pour.play(state, { from: 2, to: 3, extra: -1 })!;
    expect(state.amounts).toEqual([7, 0, 2, 3]);
    expect(pour.goalText(state)).toBe("12·7·5리터 그릇에 4리터씩 나누기");
    const way = pour.solve(state)!;
    const end = way.reduce((s, move) => pour.play(s, move)!, state);
    expect([end.winner, end.amounts.slice(0, 3)]).toEqual([0, [4, 4, 4]]);
    expect(pour.pouring.reason(end)).toMatch(/^성공!/);
    // The old stages are untouched: three vessels.
    expect(pour.createGame(3, seededRandom(5)).caps).toHaveLength(3);
  });
});

describe("tower of Hanoi, upgraded", () => {
  test("the old stages keep their values; '4p' and a count lays a tower on four pegs", () => {
    expect(hanoi.stageOf("5")).toEqual({ pegs: 3, discs: 5 });
    expect(hanoi.stageOf("")).toEqual({ pegs: 3, discs: hanoi.MIN });
    expect(hanoi.stageOf("4p7")).toEqual({ pegs: 4, discs: 7 });
    const start = hanoi.hanoi.create("4p5");
    expect(start.pegs).toEqual([[5, 4, 3, 2, 1], [], [], []]);
    expect(hanoi.moves(start).map((m) => [m.from, m.to])).toEqual([[0, 1], [0, 2], [0, 3]]);
    expect(hanoi.hanoi.create("6").pegs).toHaveLength(3);
  });
  test("four pegs: the hint moves every tower in the fewest moves (13, 17, 25, 33), from a detour as well", () => {
    const fewest: Record<number, number> = { 5: 13, 6: 17, 7: 25, 8: 33 };
    for (const discs of hanoi.FOUR) {
      let state = hanoi.createGame(discs, 4);
      expect(state.best).toBe(fewest[discs]);
      while (state.winner === null) state = hanoi.play(state, hanoi.hint(state)!)!;
      expect(state.ply).toBe(fewest[discs]);
      expect(state.pegs.slice(1).some((peg) => peg.length === discs)).toBe(true);
      expect(hanoi.hint(state)).toBeNull();
    }
    // Two wrong moves, and the hint still leads home.
    let state = hanoi.createGame(6, 4);
    state = hanoi.play(state, { from: 0, to: 3, extra: -1 })!;
    state = hanoi.play(state, { from: 3, to: 0, extra: -1 })!;
    for (let i = 0; i < 60 && state.winner === null; i++) state = hanoi.play(state, hanoi.hint(state)!)!;
    expect([state.winner, state.ply]).toEqual([0, 2 + 17]);
    // A tower on the fourth peg counts as on any other.
    const almost = { ...hanoi.createGame(5, 4), pegs: [[1], [], [], [5, 4, 3, 2]] } as hanoi.State;
    expect(hanoi.hint(almost)).toMatchObject({ from: 0, to: 3 });
    expect(hanoi.play(almost, { from: 0, to: 3, extra: -1 })!.winner).toBe(0);
  });
});
