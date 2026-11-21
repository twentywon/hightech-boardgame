import type { TableSubject } from "../table/view";

/*
 * Where things lie on the telescope board, in table units, shared by the view and the browser tests (free of anything
 * Vite-only). The board of `n` × `n` cells lies flat with its middle at the table's middle; row 0 is the far side
 * (−z), column 0 the left (−x); one cell to the next is `CELL`. Directions are N 0 (−z), E 1 (+x), S 2 (+z), W 3 (−x).
 */
export const CELL = 1,
  /** The height of the board's face. */
  BOARD_TOP = 0,
  /** The height of the telescopes' axis, and of the ball's middle (it rests on the board). */
  AXIS_Y = 0.27,
  BALL_R = 0.26,
  /** The hole's radius at the board's face. */
  HOLE_R = 0.33,
  /** How far from a telescope's base or body a tap still counts for it. */
  REACH_TAP = 0.5;
/** Which way each direction points on the table, x and z. */
export const WAY: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
/** The middle of a cell on the board's face. */
export function cellAt(n: number, cell: number) {
  return { x: ((cell % n) - (n - 1) / 2) * CELL, z: (Math.floor(cell / n) - (n - 1) / 2) * CELL };
}
/** The cell under a place on the board's face, or -1. */
export function cellUnder(n: number, x: number, z: number) {
  const c = Math.round(x / CELL + (n - 1) / 2),
    r = Math.round(z / CELL + (n - 1) / 2);
  return r < 0 || c < 0 || r >= n || c >= n ? -1 : r * n + c;
}
/** Where a tap on telescope `t` aims (the middle of its base, at its axis): browser tests press there. */
export function scopePoint(n: number, cell: number) {
  const at = cellAt(n, cell);
  return { x: at.x, y: AXIS_Y, z: at.z };
}
/** How wide the board is, rim included. */
export const spanOf = (n: number) => n * CELL + 0.7;
/** What the camera frames for a board of `n` (browser tests aim with it too). */
export function telescopeSubject(n: number, aspect: number): TableSubject {
  const half = spanOf(n) / 2 + 0.1;
  return { half: aspect < 1 ? half : half + 0.15, halfZ: half, height: 0.6, lookY: 0, tilt: 1.08 };
}
/** How long the tip takes to go one cell, drawn out or closing (ms), and the ball to drop into the hole. */
export const STEP_MS = 115,
  DROP_MS = 460;
