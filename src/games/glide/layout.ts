import type { TableSubject } from "../table/view";

/**
 * Where things lie on the floating board, shared by the view and the browser tests (free of anything Vite-only):
 * a cell's side, the height of the tiles' tops, the cube's size and how far from its middle the four arrow marks
 * round it lie. The board's middle is the table's middle; north (row − 1) is away from the eye, toward −z.
 */
export const CELL = 1,
  TILE_TOP = 0,
  CUBE = 0.7,
  ARROW_OUT = 0.86;
/** Which way each direction points on the table, x and z (N, E, S, W). */
export const WAY: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
/** The middle of row `r`, column `c` (either may lie off the board). */
export function spotAt(w: number, h: number, r: number, c: number) {
  return { x: (c - (w - 1) / 2) * CELL, z: (r - (h - 1) / 2) * CELL };
}
/** The middle of a cell. */
export const cellAt = (w: number, h: number, cell: number) => spotAt(w, h, Math.floor(cell / w), cell % w);
/** Where the arrow mark of a direction lies round the cube standing on `cell`. */
export function arrowAt(w: number, h: number, cell: number, dir: number) {
  const p = cellAt(w, h, cell);
  return { x: p.x + WAY[dir][0] * ARROW_OUT, z: p.z + WAY[dir][1] * ARROW_OUT };
}
/** The cell under a place on the table, or -1. */
export function cellUnder(w: number, h: number, x: number, z: number) {
  const c = Math.round(x / CELL + (w - 1) / 2),
    r = Math.round(z / CELL + (h - 1) / 2);
  return r < 0 || c < 0 || r >= h || c >= w ? -1 : r * w + c;
}
/** What the camera frames for a board of `w` by `h` (browser tests aim with it too). */
export function glideSubject(w: number, h: number, aspect: number): TableSubject {
  const half = (w * CELL) / 2 + 0.55,
    halfZ = (h * CELL) / 2 + 0.55;
  return { half: aspect < 1 ? half : half + 0.4, halfZ, height: 0.75, lookY: -0.1, tilt: 1.0 };
}
/** The direction a swipe across the screen by (dx, dy) pixels stands for: screen up is north. */
export function swipeDir(dx: number, dy: number) {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
}
/** How far a press must travel on the screen, in pixels, to be a swipe rather than a tap. */
export const SWIPE = 18;
