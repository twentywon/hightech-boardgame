import { describe, expect, test } from "vitest";
import * as hanoi from "../src/games/hanoi/rules";

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
