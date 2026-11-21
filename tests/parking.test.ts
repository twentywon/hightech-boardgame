import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as P from "../src/games/parking/rules";
import { CAR_TOP, GRAB_HEIGHT, TRUCK_TOP, cellAt, parkingSubject, vehicleCentre } from "../src/games/parking/view";

/** Every square covered once at most, every vehicle within the lot, the red car first on its row. */
function sound(state: P.State) {
  const seen = new Set<number>();
  for (const v of state.vehicles) {
    const r = Math.floor(v.anchor / P.SIZE),
      c = v.anchor % P.SIZE;
    expect(v.length === 2 || v.length === 3).toBe(true);
    if (v.horizontal) expect(c + v.length).toBeLessThanOrEqual(P.SIZE);
    else expect(r + v.length).toBeLessThanOrEqual(P.SIZE);
    for (const cell of P.cellsOf(v)) {
      expect(seen.has(cell)).toBe(false);
      seen.add(cell);
    }
  }
  const red = state.vehicles[0];
  expect(red.red && red.horizontal && red.length === 2 && Math.floor(red.anchor / P.SIZE) === P.EXIT_ROW).toBe(true);
  expect(state.vehicles.slice(1).every((v) => !v.red && v.color > 0)).toBe(true);
  // Nothing else lies across the red car's row, and trucks stay fewer than cars.
  expect(state.vehicles.slice(1).some((v) => v.horizontal && Math.floor(v.anchor / P.SIZE) === P.EXIT_ROW)).toBe(false);
  expect(state.vehicles.filter((v) => v.length === 3).length).toBeLessThan(state.vehicles.filter((v) => v.length === 2).length);
}
describe("parking escape", () => {
  test("every stage lays a puzzle whose fewest moves lie in its band, and the hint drives out in exactly that many", () => {
    for (let stage = 1; stage <= P.STAGES.length; stage++)
      for (let seed = 1; seed <= 6; seed++) {
        const start = P.createGame(stage, seededRandom(seed * 131 + stage)),
          { lo, hi } = P.STAGES[stage - 1];
        sound(start);
        expect(start.winner).toBeNull();
        expect(start.vehicles[0].anchor % P.SIZE).not.toBe(P.OUT_COL);
        expect(start.best).toBeGreaterThanOrEqual(lo);
        expect(start.best).toBeLessThanOrEqual(hi);
        // An independent count: the search from the start finds the same number.
        expect(P.solve(start)!.length).toBe(start.best);
        let state = start;
        for (let m = 0; m < start.best; m++) {
          const move = P.hint(state)!;
          expect(P.moves(state).some((x) => x.from === move.from && x.to === move.to && x.extra === -1)).toBe(true);
          state = P.play(state, move)!;
          expect(state).not.toBeNull();
          sound(state);
        }
        expect(state.winner).toBe(0);
        expect(state.ply).toBe(start.best);
        expect(P.hint(state)).toBeNull();
        expect(P.moves(state)).toHaveLength(0);
      }
  }, 120000);
  test("moves lists every slide from a vehicle's anchor to its new anchor, and only those play", () => {
    const state = P.createGame(2, seededRandom(5)),
      grid = P.occupancy(state),
      listed = P.moves(state);
    expect(listed.length).toBeGreaterThan(0);
    // Every move named by an anchor and a square: legal exactly when it is listed.
    for (const v of state.vehicles)
      for (let to = 0; to < P.CELLS; to++) {
        const move = { from: v.anchor, to, extra: -1 },
          inList = listed.some((m) => m.from === v.anchor && m.to === to),
          next = P.play(state, move);
        expect(next !== null).toBe(inList);
        if (!next) continue;
        // It slid along its own line over free squares, and nothing else moved.
        const i = state.vehicles.indexOf(v),
          w = next.vehicles[i];
        expect(w.horizontal ? Math.floor(to / P.SIZE) === Math.floor(v.anchor / P.SIZE) : to % P.SIZE === v.anchor % P.SIZE).toBe(true);
        const step = v.horizontal ? 1 : P.SIZE,
          lo = Math.min(v.anchor, to),
          hi = Math.max(v.anchor, to) + (v.length - 1) * step;
        for (let c = lo; c <= hi; c += step) expect(grid[c] === -1 || grid[c] === i).toBe(true);
        expect(next.vehicles.filter((x, k) => k !== i).every((x, k) => x === state.vehicles.filter((_, j) => j !== i)[k])).toBe(true);
        expect(next.last).toBe(i);
        expect(next.ply).toBe(state.ply + 1);
      }
  });
  test("refused slides return null and leave the state alone", () => {
    const state = P.createGame(3, seededRandom(17)),
      before = JSON.stringify(state),
      grid = P.occupancy(state);
    const refused = (from: number, to: number, extra = -1) => expect(P.play(state, { from, to, extra })).toBeNull();
    for (const [i, v] of state.vehicles.entries()) {
      const step = v.horizontal ? 1 : P.SIZE,
        cross = v.horizontal ? P.SIZE : 1;
      // Sideways, off the board, onto itself, and with a stray extra.
      if (v.horizontal ? v.anchor + cross < P.CELLS : (v.anchor % P.SIZE) + 1 < P.SIZE) refused(v.anchor, v.anchor + cross);
      refused(v.anchor, -1);
      refused(v.anchor, P.CELLS);
      refused(v.anchor, v.anchor + 0.5);
      refused(v.anchor, v.anchor);
      // Past the edge of the lot along its own line.
      if (v.horizontal) refused(v.anchor, v.anchor - (v.anchor % P.SIZE) + P.SIZE - v.length + 1);
      else refused(v.anchor, v.anchor + (P.SIZE - Math.floor(v.anchor / P.SIZE) - v.length + 1) * P.SIZE);
      // Into or through another vehicle.
      for (let k = 1; k < P.SIZE; k++)
        for (const dir of [-1, 1]) {
          const to = v.anchor + dir * k * step,
            cells = Array.from({ length: k }, (_, j) => (dir > 0 ? v.anchor + (v.length - 1 + j + 1) * step : v.anchor - (j + 1) * step));
          if (to < 0 || to >= P.CELLS) continue;
          if (v.horizontal && Math.floor(to / P.SIZE) !== Math.floor(v.anchor / P.SIZE)) continue;
          if (cells.some((c) => c < 0 || c >= P.CELLS || (v.horizontal && Math.floor(c / P.SIZE) !== Math.floor(v.anchor / P.SIZE)))) continue;
          if (cells.some((c) => grid[c] >= 0 && grid[c] !== i)) refused(v.anchor, to);
        }
      if (P.moves(state).some((m) => m.from === v.anchor)) refused(v.anchor, P.moves(state).find((m) => m.from === v.anchor)!.to, 3);
    }
    // A square that is no vehicle's anchor moves nothing.
    const notAnchor = Array.from({ length: P.CELLS }, (_, c) => c).find((c) => !state.vehicles.some((v) => v.anchor === c))!;
    refused(notAnchor, notAnchor + 1);
    // A solved lot takes no more moves.
    const done = { ...state, winner: 0 as const };
    expect(P.moves(done)).toHaveLength(0);
    expect(P.play(done, P.moves(state)[0])).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });
  test("a lot with no way out has no hint", () => {
    // A truck standing upright across the red car's row with a car beneath it can never get out of the way.
    const state: P.State = {
      vehicles: [
        { anchor: 2 * P.SIZE, length: 2, horizontal: true, color: 0, red: true },
        { anchor: 1 * P.SIZE + 4, length: 3, horizontal: false, color: 1, red: false },
        { anchor: 4 * P.SIZE + 4, length: 2, horizontal: false, color: 2, red: false },
        { anchor: 0 * P.SIZE + 4, length: 2, horizontal: true, color: 3, red: false },
      ],
      best: 0,
      last: null,
      winner: null,
      ply: 0,
      stage: 1,
    };
    expect(P.solve(state)).toBeNull();
    expect(P.hint(state)).toBeNull();
  });
  test("puzzles are laid quickly, even the hardest", () => {
    for (let stage = 1; stage <= P.STAGES.length; stage++) {
      const runs = stage === P.STAGES.length ? 30 : 15;
      let total = 0;
      for (let seed = 1; seed <= runs; seed++) {
        const t0 = performance.now();
        P.createGame(stage, seededRandom(seed * 7919 + stage * 13));
        total += performance.now() - t0;
      }
      // About 70 ms for the hardest on a 2.1 GHz server core; the bound is generous for slower machines.
      expect(total / runs).toBeLessThan(stage === P.STAGES.length ? 500 : 200);
    }
  }, 120000);
  test("the view's helpers that browser tests aim with", () => {
    expect(cellAt(0)).toEqual({ x: -2.5, z: -2.5 });
    expect(cellAt(P.CELLS - 1)).toEqual({ x: 2.5, z: 2.5 });
    expect(vehicleCentre({ anchor: 2 * P.SIZE + 4, length: 2, horizontal: true })).toEqual({ x: 2, z: -0.5 });
    expect(vehicleCentre({ anchor: 3, length: 3, horizontal: false })).toEqual({ x: 0.5, z: -1.5 });
    expect(TRUCK_TOP).toBeGreaterThan(CAR_TOP);
    expect(GRAB_HEIGHT).toBe(CAR_TOP);
    const wide = parkingSubject(16 / 9);
    expect(wide.half).toBeGreaterThan(3.3 + 0.6);
    expect(wide.height).toBe(TRUCK_TOP);
  });
});
