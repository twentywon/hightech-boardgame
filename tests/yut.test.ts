import { describe, expect, it } from "vitest";
import * as Y from "../src/games/yut/rules";
import { choose, value } from "../src/games/yut/ai";
import { seededRandom } from "../src/core/ai";
import { throwing } from "./yut-fixtures";

const { WAITING: W, FINISHED: F } = Y;
const frozen = (s: Y.State) => JSON.stringify(s);
/** A position with the given stations, `turn` to move with `pending` in hand. */
const position = (mine: number[], theirs: number[], pending: Y.Result[], turn: 0 | 1 = 0): Y.State => ({
  ...Y.createGame(),
  turn,
  pieces: turn === 0 ? [mine, theirs] : [theirs, mine],
  pending,
  throwsLeft: 0,
});

describe("Yut throws", () => {
  it("names a throw by its flat sticks; the marked stick alone is 빽도", () => {
    expect(Y.resultOf([false, false, false, false])).toBe(5);
    expect(Y.resultOf([true, false, false, false])).toBe(-1);
    expect(Y.resultOf([false, false, true, false])).toBe(1);
    expect(Y.resultOf([true, false, true, false])).toBe(2);
    expect(Y.resultOf([true, true, true, false])).toBe(3);
    expect(Y.resultOf([true, true, true, true])).toBe(4);
  });
  it("keeps the throw after 윷 and 모 and gathers the results", () => {
    const random = throwing([4, 5, 3]);
    let s = Y.throwSticks(Y.createGame(), random)!;
    expect([s.thrown, s.throwsLeft, s.pending]).toEqual([4, 1, [4]]);
    expect(Y.moves(s)).toEqual([]);
    s = Y.throwSticks(s, random)!;
    s = Y.throwSticks(s, random)!;
    expect([s.throwsLeft, s.pending, s.turn]).toEqual([0, [4, 5, 3], 0]);
    expect(Y.throwSticks(s, random)).toBeNull();
    expect(Y.moves(s).map((m) => [m.from, m.result, m.to])).toEqual([
      [W, 4, 4],
      [W, 5, 5],
      [W, 3, 3],
    ]);
  });
  it("forfeits a 빽도 that no piece on the board can use", () => {
    const s = Y.throwSticks(Y.createGame(), throwing([-1]))!;
    expect([s.turn, s.throwsLeft, s.pending, s.forfeited]).toEqual([1, 1, [], [-1]]);
  });
  it("throws each result about as often as four even sticks should", () => {
    const random = seededRandom(7),
      seen: Record<string, number> = {};
    for (let i = 0; i < 16000; i++) {
      const r = Y.resultOf(Array.from({ length: 4 }, () => random() < 0.5));
      seen[r] = (seen[r] ?? 0) + 1;
    }
    for (const [r, share] of [[-1, 1], [1, 3], [2, 6], [3, 4], [4, 1], [5, 1]])
      expect(Math.abs(seen[r] / 1000 - share)).toBeLessThan(0.35);
  });
});

describe("Yut roads", () => {
  it("runs round the outer ring and must pass the start to finish", () => {
    expect(Y.route(W, 3)).toEqual([1, 2, 3]);
    expect(Y.route(3, 5)).toEqual([4, 5, 6, 7, 8]);
    expect(Y.route(18, 2)).toEqual([19, 0]);
    expect(Y.route(0, 1)).toEqual([F]);
    expect(Y.route(19, 5)).toEqual([0, F]);
    expect(Y.route(F, 2)).toEqual([]);
  });
  it("turns onto the short road only when the move starts on a corner or the centre", () => {
    expect(Y.route(5, 3)).toEqual([20, 21, 22]);
    expect(Y.route(4, 3)).toEqual([5, 6, 7]);
    expect(Y.route(10, 3)).toEqual([25, 26, 22]);
    expect(Y.route(9, 2)).toEqual([10, 11]);
    // Straight through the centre from either road, but out toward home from the centre itself.
    expect(Y.route(20, 4)).toEqual([21, 22, 23, 24]);
    expect(Y.route(24, 2)).toEqual([15, 16]);
    expect(Y.route(25, 4)).toEqual([26, 22, 27, 28]);
    expect(Y.route(22, 3)).toEqual([27, 28, 0]);
  });
  it("steps back one station with 빽도", () => {
    expect(Y.route(W, -1)).toEqual([]);
    expect(Y.route(7, -1)).toEqual([6]);
    expect(Y.route(1, -1)).toEqual([0]);
    expect(Y.route(20, -1)).toEqual([5]);
    expect(Y.route(25, -1)).toEqual([10]);
    expect(Y.route(27, -1)).toEqual([22]);
  });
  it("counts the steps left along the road a piece would take", () => {
    expect([W, 5, 10, 22, 15, 0, F].map(Y.remaining)).toEqual([21, 12, 7, 4, 6, 1, 0]);
  });
});

describe("Yut moves", () => {
  it("enters one waiting piece and uses up the result", () => {
    const s = Y.move(position([W, W, W, W], [W, W, W, W], [2]), 0, 2)!;
    expect(s.pieces[0]).toEqual([2, W, W, W]);
    expect([s.turn, s.throwsLeft, s.pending]).toEqual([1, 1, []]);
  });
  it("carries stacked pieces together", () => {
    let s = Y.move(position([3, W, W, W], [W, W, W, W], [3, 2]), 1, 3)!;
    expect(s.pieces[0]).toEqual([3, 3, W, W]);
    expect(s.turn).toBe(0);
    s = Y.move(s, 1, 2)!;
    expect(s.pieces[0]).toEqual([5, 5, W, W]);
    expect(s.last).toMatchObject({ count: 2, captured: 0 });
  });
  it("sends captured pieces back and earns another throw", () => {
    const s = Y.move(position([1, W, W, W], [4, 4, 9, W], [3]), 0, 3)!;
    expect(s.pieces).toEqual([[4, W, W, W], [W, W, 9, W]]);
    expect([s.turn, s.throwsLeft, s.last!.captured]).toEqual([0, 1, 2]);
  });
  it("finishes a stack and wins when every piece is home", () => {
    const s = Y.move(position([0, 0, F, F], [3, W, W, W], [1]), 0, 1)!;
    expect(s.pieces[0]).toEqual([F, F, F, F]);
    expect(s.winner).toBe(0);
    expect(Y.moves(s)).toEqual([]);
    expect(Y.throwSticks(s, throwing([1]))).toBeNull();
  });
  it("refuses moves that are not offered and never changes its input", () => {
    const s = position([3, W, F, W], [W, W, W, W], [2, -1]),
      before = frozen(s);
    expect(Y.move(s, 0, 3)).toBeNull();
    expect(Y.move(s, 2, 2)).toBeNull();
    expect(Y.move(s, 1, -1)).toBeNull();
    expect(Y.move({ ...s, throwsLeft: 1 }, 0, 2)).toBeNull();
    expect(Y.moves(s).map((m) => [m.from, m.result, m.to])).toEqual([
      [3, 2, 5],
      [W, 2, 2],
      [3, -1, 2],
    ]);
    Y.move(s, 0, 2);
    Y.throwSticks(s, throwing([1]));
    choose(s);
    expect(frozen(s)).toBe(before);
  });
  it("passes the turn when the last result cannot be used", () => {
    const s = Y.move(position([3, W, W, W], [W, W, W, W], [2, -1]), 0, 2)!;
    // The piece is on the board, so the 빽도 can still be played.
    expect([s.turn, s.pending]).toEqual([0, [-1]]);
    const t = Y.move(position([0, W, W, W], [W, W, W, W], [1, -1]), 0, 1)!;
    expect([t.turn, t.pending, t.forfeited]).toEqual([1, [], [-1]]);
  });
});

describe("Yut computer", () => {
  it("captures, finishes and prefers the station a rival is less likely to reach", () => {
    expect(choose(position([1, W, W, W], [4, 4, W, W], [3, 2]))).toMatchObject({ from: 1, to: 4 });
    expect(choose(position([19, 2, F, F], [W, W, W, W], [2]))).toMatchObject({ from: 19, to: F });
    // One step ahead of a rival needs its 도 (3 in 16); two steps ahead its 개 (6 in 16).
    const s = position([6, W, W, W], [7, W, W, W], [2, 3]);
    expect(value(s, Y.moves(s).find((m) => m.from === 6 && m.result === 2)!)).toBeGreaterThan(
      value(s, Y.moves(s).find((m) => m.from === 6 && m.result === 3)!),
    );
  });
  it("always finishes a game against itself with legal moves only", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const random = seededRandom(seed);
      let s = Y.createGame(),
        steps = 0;
      while (s.winner === null) {
        const next = s.throwsLeft > 0 ? Y.throwSticks(s, random) : Y.move(s, choose(s)!.piece, choose(s)!.result);
        expect(next).not.toBeNull();
        s = next!;
        expect(++steps).toBeLessThan(3000);
      }
      expect(s.pieces[s.winner].every((p) => p === F)).toBe(true);
    }
  });
});
