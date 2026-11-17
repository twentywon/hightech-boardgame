import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as S from "../src/games/slide/rules";
import { BOARD, TILE_TOP, cellAt, cellSize, slideSubject } from "../src/games/slide/layout";

/** Whether a tray can be solved: the classic parity of the tiles' order and, on an even tray, the gap's row. */
function solvable(tiles: number[], size: number) {
  const order = tiles.filter((t) => t);
  let inversions = 0;
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) if (order[i] > order[j]) inversions++;
  if (size % 2) return inversions % 2 === 0;
  const fromBottom = size - Math.floor(tiles.indexOf(0) / size);
  return (inversions + fromBottom) % 2 === 1;
}
/** Every tile once, and one gap. */
function whole(state: S.State) {
  expect([...state.tiles].sort((a, b) => a - b)).toEqual(Array.from({ length: state.size * state.size }, (_, i) => i));
}
/** The fewest single slides from every three by three tray to the solved one, by a search from the solved tray. */
function distances() {
  const known = new Map<string, number>(),
    start = S.solvedTiles(3);
  known.set(start.join(""), 0);
  let frontier = [start];
  for (let d = 1; frontier.length; d++) {
    const next: number[][] = [];
    for (const tiles of frontier) {
      const gap = tiles.indexOf(0);
      for (const q of [gap - 3, gap + 3, gap % 3 ? gap - 1 : -1, gap % 3 < 2 ? gap + 1 : -1]) {
        if (q < 0 || q > 8) continue;
        const t = [...tiles];
        [t[gap], t[q]] = [t[q], t[gap]];
        const key = t.join("");
        if (known.has(key)) continue;
        known.set(key, d);
        next.push(t);
      }
    }
    frontier = next;
  }
  return known;
}
describe("sliding puzzle", () => {
  test("a push slides every tile between the one pressed and the gap, as one move, and only pushes in the gap's line play", () => {
    const state: S.State = { ...S.createGame(2, seededRandom(4)), tiles: [1, 2, 3, 4, 5, 6, 0, 8, 9, 10, 7, 12, 13, 14, 11, 15] };
    // The gap is at row 1, column 2: the pushes are along row 1 and down column 2.
    const listed = S.moves(state).map((m) => m.from).sort((a, b) => a - b);
    expect(listed).toEqual([2, 4, 5, 7, 10, 14]);
    for (let from = 0; from < 16; from++) {
      const next = S.play(state, { from, to: 6, extra: -1 });
      expect(next !== null).toBe(listed.includes(from));
    }
    // A push from the far left of the row slides two tiles right.
    const left = S.play(state, { from: 4, to: 6, extra: -1 })!;
    expect(left.tiles.slice(4, 8)).toEqual([0, 5, 6, 8]);
    expect(left.last).toEqual({ tiles: [6, 5], dx: 1, dz: 0 });
    expect(left.ply).toBe(1);
    // A push from the bottom of the column slides two tiles up.
    const up = S.play(state, { from: 14, to: 6, extra: -1 })!;
    expect([up.tiles[6], up.tiles[10], up.tiles[14]]).toEqual([7, 11, 0]);
    expect(up.last).toEqual({ tiles: [7, 11], dx: 0, dz: -1 });
    // Not toward the gap, not from the gap, not with an extra choice.
    expect(S.play(state, { from: 4, to: 5, extra: -1 })).toBeNull();
    expect(S.play(state, { from: 6, to: 6, extra: -1 })).toBeNull();
    expect(S.play(state, { from: 4, to: 6, extra: 0 })).toBeNull();
    // The input is never changed.
    expect(state.tiles).toEqual([1, 2, 3, 4, 5, 6, 0, 8, 9, 10, 7, 12, 13, 14, 11, 15]);
    // The last tile home solves it; then nothing more is played.
    const near: S.State = { ...state, tiles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15] },
      done = S.play(near, { from: 15, to: 14, extra: -1 })!;
    expect(done.winner).toBe(0);
    expect(S.moves(done)).toHaveLength(0);
    expect(S.play(done, { from: 14, to: 15, extra: -1 })).toBeNull();
  });
  test("every stage lays a solvable, mixed tray with its gap in the corner, never solved", () => {
    for (let stage = 1; stage <= S.STAGES.length; stage++)
      for (let seed = 1; seed <= 40; seed++) {
        const state = S.createGame(stage, seededRandom(seed * 977 + stage)),
          { size, picture } = S.STAGES[stage - 1];
        expect(state.size).toBe(size);
        expect(state.picture).toBe(picture);
        whole(state);
        expect(state.tiles[size * size - 1]).toBe(0);
        expect(S.isSolved(state.tiles)).toBe(false);
        expect(state.winner).toBeNull();
        expect(solvable(state.tiles, size)).toBe(true);
        expect(S.manhattan(state.tiles, size)).toBeGreaterThanOrEqual(size === 3 ? 12 : size === 4 ? 30 : 60);
      }
    // Different trays from different draws.
    const seen = new Set(Array.from({ length: 20 }, (_, k) => S.createGame(2, seededRandom(k + 1)).tiles.join(",")));
    expect(seen.size).toBe(20);
  });
  test("on three by three the hint follows a shortest way", () => {
    const table = distances();
    // Half of all orders can be reached: 9! / 2.
    expect(table.size).toBe(181440);
    for (let seed = 1; seed <= 25; seed++) {
      let state = S.createGame(seed % 2 ? 1 : 4, seededRandom(seed * 31));
      const best = table.get(state.tiles.join(""))!;
      for (let k = 0; k < best; k++) {
        const move = S.hint(state)!;
        expect(S.moves(state).some((m) => m.from === move.from && m.to === move.to)).toBe(true);
        state = S.play(state, move)!;
        expect(table.get(state.tiles.join(""))).toBe(best - k - 1);
      }
      expect(state.winner).toBe(0);
      expect(S.hint(state)).toBeNull();
    }
  });
  test("following the hints always solves every stage, each hint found quickly", () => {
    let slowest = 0;
    for (let stage = 1; stage <= S.STAGES.length; stage++)
      for (let seed = 1; seed <= 12; seed++) {
        let state = S.createGame(stage, seededRandom(seed * 7919 + stage * 13));
        let count = 0;
        while (state.winner === null) {
          const started = performance.now(),
            move = S.hint(state);
          slowest = Math.max(slowest, performance.now() - started);
          expect(move).not.toBeNull();
          const next = S.play(state, move!);
          expect(next).not.toBeNull();
          state = next!;
          whole(state);
          expect(++count).toBeLessThan(2500);
        }
        expect(S.isSolved(state.tiles)).toBe(true);
      }
    expect(slowest).toBeLessThan(150);
  }, 120000);
  test("the hint finishes from trays scrambled anywhere along the way, and from ones a person has half solved", () => {
    for (const size of [4, 5]) {
      const random = seededRandom(size * 101);
      for (let round = 0; round < 30; round++) {
        let state = S.createGame(size - 2, random);
        // Some hints, then some pushes of my own at random, then the hints to the end.
        for (let k = 0; k < Math.floor(random() * 120); k++) state = S.play(state, S.hint(state)!) ?? state;
        for (let k = 0; k < Math.floor(random() * 8) && state.winner === null; k++) {
          const options = S.moves(state);
          state = S.play(state, options[Math.floor(random() * options.length)])!;
        }
        let count = 0;
        while (state.winner === null) {
          state = S.play(state, S.hint(state)!)!;
          expect(++count).toBeLessThan(2500);
        }
      }
    }
  }, 120000);
  test("an arrow slides the tile beside the gap that way, and nothing at the edge", () => {
    const state: S.State = { ...S.createGame(1, seededRandom(2)), tiles: [1, 2, 3, 4, 0, 5, 7, 8, 6] };
    expect(S.arrowMove(state, "ArrowUp")).toEqual({ from: 7, to: 4, extra: -1 });
    expect(S.arrowMove(state, "ArrowDown")).toEqual({ from: 1, to: 4, extra: -1 });
    expect(S.arrowMove(state, "ArrowLeft")).toEqual({ from: 5, to: 4, extra: -1 });
    expect(S.arrowMove(state, "ArrowRight")).toEqual({ from: 3, to: 4, extra: -1 });
    const corner: S.State = { ...state, tiles: [1, 2, 3, 4, 5, 6, 7, 8, 0] };
    expect(S.arrowMove(corner, "ArrowUp")).toBeNull();
    expect(S.arrowMove(corner, "ArrowLeft")).toBeNull();
    expect(S.arrowMove(corner, "Enter")).toBeNull();
  });
  test("the tray's places lie inside the board, one cell apart, and the camera keeps the frame in view", () => {
    for (const size of [3, 4, 5]) {
      const cell = cellSize(size);
      expect(cell * size).toBeCloseTo(BOARD);
      const a = cellAt(size, 0),
        b = cellAt(size, size * size - 1);
      expect(b.x - a.x).toBeCloseTo(cell * (size - 1));
      expect(b.z - a.z).toBeCloseTo(cell * (size - 1));
      expect(Math.abs(a.x)).toBeLessThan(BOARD / 2);
    }
    for (const aspect of [0.7, 1.3, 2.2]) expect(slideSubject(aspect).half).toBeGreaterThan(BOARD / 2);
    expect(TILE_TOP).toBeGreaterThan(0);
  });
});
