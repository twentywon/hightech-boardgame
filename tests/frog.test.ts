import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as F from "../src/games/frog/rules";
import { FROG_PAINTS, SPACING, SYMBOLS, frogAt, frogSubject, stumpAt } from "../src/games/frog/layout";

const { NONE } = F;
/** A state of a row with the given ribbons and frogs, as a puzzle would have it. */
const row = (ribbons: number[], frogs: number[]): F.State => ({ ribbons, frogs, best: 0, last: null, winner: null, ply: 0, stage: 1 });
/** Colours with how many of each, for comparing a row's frogs and ribbons. */
const tally = (list: number[]) => list.filter((c) => c !== NONE).sort((a, b) => a - b).join(",");

describe("frog hop", () => {
  test("a frog hops to the next stump if it is empty, or jumps over exactly one frog onto the empty stump beyond", () => {
    // 0: red, 1: empty, 2: orange, 3: yellow, 4: empty, 5: empty, 6: green.
    const state = row([0, 1, 2, NONE, 3, NONE, 4], [0, NONE, 1, 2, NONE, NONE, 3]);
    expect(F.targets(state, 0)).toEqual([1]);
    // Orange: a hop onto the empty stump at its left, or a jump over yellow onto stump 4.
    expect(F.targets(state, 2)).toEqual([1, 4]);
    // Yellow: a jump over orange onto stump 1, or a hop onto 4.
    expect(F.targets(state, 3)).toEqual([1, 4]);
    expect(F.targets(state, 6)).toEqual([5]);
    expect(F.targets(state, 1)).toEqual([]);
    // Never over two frogs: with three in a row and the gap beyond, the far one cannot reach it.
    const crowd = row([0, 1, 2, NONE], [0, 1, 2, NONE]);
    expect(F.targets(crowd, 0)).toEqual([]);
    expect(F.targets(crowd, 1)).toEqual([3]);
    expect(F.targets(crowd, 2)).toEqual([3]);
    // Never over an empty stump.
    const lone = row([0, NONE, NONE], [0, NONE, NONE]);
    expect(F.targets(lone, 0)).toEqual([1]);
  });
  test("moves lists every hop and jump, and exactly those play", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const state = F.createGame(1 + (seed % 4), seededRandom(seed * 17)),
        before = JSON.stringify(state),
        n = state.frogs.length,
        listed = F.moves(state);
      expect(listed.length).toBeGreaterThan(0);
      for (let from = -2; from < n + 2; from++)
        for (let to = -2; to < n + 2; to++) {
          const move = { from, to, extra: -1 },
            inList = listed.some((m) => m.from === from && m.to === to && m.extra === -1),
            next = F.play(state, move);
          expect(next !== null).toBe(inList);
          if (!next) continue;
          // The frog went from its stump to the empty one; nothing else moved.
          expect(state.frogs[from]).not.toBe(NONE);
          expect(state.frogs[to]).toBe(NONE);
          expect(Math.abs(to - from) === 1 || (Math.abs(to - from) === 2 && state.frogs[(from + to) / 2] !== NONE)).toBe(true);
          expect(next.frogs[to]).toBe(state.frogs[from]);
          expect(next.frogs[from]).toBe(NONE);
          expect(next.frogs.filter((_, i) => i !== from && i !== to)).toEqual(state.frogs.filter((_, i) => i !== from && i !== to));
          expect(next.ribbons).toEqual(state.ribbons);
          expect(next.last).toEqual({ from, to });
          expect(next.ply).toBe(state.ply + 1);
          expect(next.winner).toBe(F.solvedBy(next.ribbons, next.frogs) ? 0 : null);
        }
      expect(JSON.stringify(state)).toBe(before);
    }
  });
  test("refused moves return null and leave the state alone", () => {
    const state = row([0, 1, 2, 3, NONE], [1, NONE, 0, 2, 3]),
      before = JSON.stringify(state),
      refused = (from: number, to: number, extra = -1) => expect(F.play(state, { from, to, extra })).toBeNull();
    refused(1, 0); // from an empty stump
    refused(0, 2); // onto a frog
    refused(2, 1, 0); // a stray extra
    refused(2, 1.5); // not a stump
    refused(0, -1);
    refused(4, 5); // off the row
    refused(4, 1); // three stumps away
    expect(JSON.stringify(state)).toBe(before);
    // Over an empty stump.
    const gap = row([0, NONE, NONE, 1], [0, NONE, NONE, 1]);
    expect(F.play(gap, { from: 0, to: 2, extra: -1 })).toBeNull();
    // Over two frogs.
    const crowd = row([0, 1, 2, NONE], [0, 1, 2, NONE]);
    expect(F.play(crowd, { from: 0, to: 3, extra: -1 })).toBeNull();
    // A solved row takes no more moves.
    const done = { ...row([0, 1, NONE], [0, 1, NONE]), winner: 0 as const };
    expect(F.moves(done)).toHaveLength(0);
    expect(F.play(done, { from: 1, to: 2, extra: -1 })).toBeNull();
  });
  test("a move that brings every frog home wins", () => {
    const state = row([0, 1, NONE], [0, NONE, 1]),
      next = F.play(state, { from: 2, to: 1, extra: -1 })!;
    expect(next.winner).toBe(0);
    expect(F.frogHop.reason(next)).toMatch(/^성공!/);
    // Frogs of one colour may take either stump of it.
    const twins = row([0, 0, NONE], [NONE, 0, 0]),
      home = F.play(twins, { from: 1, to: 0, extra: -1 })!;
    expect(home.winner).toBeNull();
    expect(F.play(home, { from: 2, to: 1, extra: -1 })!.winner).toBe(0);
  });
  test("every stage lays an unsolved puzzle whose fewest moves lie in its band, and the hint solves it in exactly that many", () => {
    for (let stage = 1; stage <= F.STAGES.length; stage++)
      for (let seed = 1; seed <= 8; seed++) {
        const start = F.createGame(stage, seededRandom(seed * 131 + stage)),
          { stumps, colours, pairs, gaps, lo, hi } = F.STAGES[stage - 1];
        // The row is as the stage says: its stumps, its gaps, and frogs that are those its ribbons ask for.
        expect(start.frogs).toHaveLength(stumps);
        expect(start.ribbons).toHaveLength(stumps);
        expect(start.frogs.filter((f) => f === NONE)).toHaveLength(gaps);
        expect(start.ribbons.filter((r) => r === NONE)).toHaveLength(gaps);
        expect(tally(start.frogs)).toBe(tally(start.ribbons));
        expect(new Set(start.frogs.filter((f) => f !== NONE)).size).toBe(colours);
        expect(start.frogs.filter((f) => f !== NONE)).toHaveLength(colours + pairs);
        expect(start.frogs.every((f) => f === NONE || (f >= 0 && f < F.COLOURS))).toBe(true);
        expect(start.winner).toBeNull();
        expect(F.solvedBy(start.ribbons, start.frogs)).toBe(false);
        expect(start.best).toBeGreaterThanOrEqual(lo);
        expect(start.best).toBeLessThanOrEqual(hi);
        // An independent count: the search from the start finds the same number.
        expect(F.solve(start)!.length).toBe(start.best);
        let state = start;
        for (let m = 0; m < start.best; m++) {
          const move = F.hint(state)!;
          expect(F.moves(state).some((x) => x.from === move.from && x.to === move.to && x.extra === -1)).toBe(true);
          state = F.play(state, move)!;
          expect(state).not.toBeNull();
          expect(state.winner === 0).toBe(m === start.best - 1);
        }
        expect(state.winner).toBe(0);
        expect(state.ply).toBe(start.best);
        expect(F.hint(state)).toBeNull();
        expect(F.moves(state)).toHaveLength(0);
      }
  }, 60000);
  test("the same random numbers lay the same puzzle", () => {
    for (let stage = 1; stage <= F.STAGES.length; stage++) expect(F.createGame(stage, seededRandom(99))).toEqual(F.createGame(stage, seededRandom(99)));
  });
  test("puzzles are laid quickly, even the longest", () => {
    for (let stage = 1; stage <= F.STAGES.length; stage++) {
      const runs = 15;
      let total = 0;
      for (let seed = 1; seed <= runs; seed++) {
        const t0 = performance.now();
        F.createGame(stage, seededRandom(seed * 7919 + stage * 13));
        total += performance.now() - t0;
      }
      // About 1 ms for the first three stages and 20 ms for the last on a 2.1 GHz server core; generous for slower machines.
      expect(total / runs).toBeLessThan(100);
    }
  }, 60000);
  test("with an empty stump and three stumps or more, every arrangement of the frogs can be reached", () => {
    // Distinct colours, one or two empty stumps, rows of three to eight stumps.
    for (let stumps = 3; stumps <= 8; stumps++)
      for (let gaps = 1; gaps <= 2 && gaps < stumps; gaps++) {
        const frogs = Array.from({ length: stumps - gaps }, (_, c) => c),
          ribbons = [...frogs, ...new Array<number>(gaps).fill(NONE)];
        expect(F.reachable(ribbons)).toBe(F.arrangements(stumps, frogs));
        // Where the empty stumps are in the goal makes no difference.
        expect(F.reachable([...ribbons].reverse())).toBe(F.arrangements(stumps, frogs));
      }
    // Colours worn by two frogs, as on the last stage, and the last stage's row itself.
    expect(F.reachable([0, 0, 1, 1, 2, NONE])).toBe(F.arrangements(6, [0, 0, 1, 1, 2]));
    expect(F.reachable([3, 0, NONE, 1, 4, 0, 2, NONE, 3])).toBe(F.arrangements(9, [3, 0, 1, 4, 0, 2, 3]));
    expect(F.arrangements(9, [3, 0, 1, 4, 0, 2, 3])).toBe(45360);
    // Too small a row is no puzzle: two stumps and one frog go back and forth, and without an empty stump nothing moves.
    expect(F.reachable([0, NONE])).toBe(2);
    expect(F.reachable([0, 1, 2])).toBe(1);
  }, 60000);
  test("more ribbons of a colour than frogs wearing it leave a choice of where they sit, and the search finds the nearest", () => {
    expect(F.solvedArrangements([0, 0, 1, NONE], [0, 1])).toEqual([
      [0, NONE, 1, NONE],
      [NONE, 0, 1, NONE],
    ]);
    const state = row([0, 0, 1, NONE], [NONE, NONE, 1, 0]),
      path = F.solve(state)!;
    // The red frog jumps over the orange one onto the nearer red stump: one move.
    expect(path).toEqual([{ from: 3, to: 1, extra: -1 }]);
  });
  test("a row where nothing can move has no hint", () => {
    const state = row([0, 1], [1, 0]);
    expect(F.moves(state)).toHaveLength(0);
    expect(F.solve(state)).toBeNull();
    expect(F.hint(state)).toBeNull();
    expect(F.distance(state)).toBe(-1);
  });
  test("the layout helpers browser tests aim with", () => {
    for (const n of [5, 6, 7, 9]) {
      const first = stumpAt(n, 0),
        last = stumpAt(n, n - 1);
      expect(first.x).toBeCloseTo(-last.x);
      expect(last.x - first.x).toBeCloseTo((n - 1) * SPACING);
      expect(frogAt(n, 2).y).toBeGreaterThan(stumpAt(n, 2).top);
      // The camera frames the whole row, wide screens and narrow alike.
      for (const aspect of [0.8, 1.3, 2.2]) expect(frogSubject(n, aspect).half).toBeGreaterThan(last.x + 0.4);
    }
    expect(FROG_PAINTS).toHaveLength(F.COLOURS);
    expect(new Set(SYMBOLS).size).toBe(F.COLOURS);
  });
});
