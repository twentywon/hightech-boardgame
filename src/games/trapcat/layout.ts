import type { TableSubject } from "../table/view";
import { CELLS, SIZE, colOf, rowOf } from "./rules";

/*
 * Where things lie in the garden, in table units, shared by the view and the browser tests (free of anything
 * Vite-only). The field of hexes lies flat with its middle at the table's middle; row 0 is the far side (−z). The
 * hexes stand point up: one hex to the next along a row is `STEP`, one row to the next `ROW`, and every odd row is
 * shifted half a step to the right (+x).
 */
export const STEP = 1,
  ROW = (Math.sqrt(3) / 2) * STEP,
  /** From a hex's middle to its corners. */
  RADIUS = STEP / Math.sqrt(3),
  /** The height of the tops of the open tiles; taps aim there. */
  TILE_TOP = 0.08;
/** The middle of a hex on the table. */
export function hexAt(cell: number) {
  const r = rowOf(cell),
    c = colOf(cell);
  return { x: (c + (r & 1) * 0.5 - (SIZE - 1) / 2 - 0.25) * STEP, z: (r - (SIZE - 1) / 2) * ROW };
}
/** The hex under a place on the table, or -1 (the nearest middle, if it lies within the hex). */
export function hexUnder(x: number, z: number) {
  let best = -1,
    nearest = Infinity;
  for (let i = 0; i < CELLS; i++) {
    const at = hexAt(i),
      d = Math.hypot(at.x - x, at.z - z);
    if (d < nearest) {
      nearest = d;
      best = i;
    }
  }
  return nearest <= RADIUS ? best : -1;
}
/** What the camera frames: the whole field and a little of the garden round it (browser tests aim with it too). */
export function trapSubject(aspect: number): TableSubject {
  const half = ((SIZE + 0.5) * STEP) / 2 + 0.35,
    halfZ = ((SIZE - 1) * ROW) / 2 + RADIUS + 0.3;
  return { half: aspect < 1 ? half : half + 0.3, halfZ, height: 0.9, lookY: 0, tilt: 0.9 };
}
/** How long the cat's hop from one hex to the next lasts (ms). */
export const HOP_MS = 330;
