import type { TableSubject } from "../table/view";

/*
 * Where things lie on the electrician's board, in table units, shared by the view and the browser tests (free of
 * anything Vite-only). The board of `n` × `n` sockets lies flat with its middle at the table's middle; row 0 is the far
 * side (−z), column 0 the left (−x); one socket to the next is `CELL`.
 */
export const CELL = 1,
  /** The height of the pegboard's face, where the sockets sit. */
  BOARD_TOP = 0,
  /** The height of a bulb's glass at its widest: taps aim there. */
  BULB_Y = 0.48,
  /** How far from a socket's middle a tap on the board still counts for it. */
  REACH = 0.48;
/** The middle of a cell on the board's face. */
export function cellAt(n: number, cell: number) {
  return { x: ((cell % n) - (n - 1) / 2) * CELL, z: (Math.floor(cell / n) - (n - 1) / 2) * CELL };
}
/** The cell under a place on the board's face, or -1. */
export function cellUnder(n: number, x: number, z: number) {
  const c = Math.round(x / CELL + (n - 1) / 2),
    r = Math.round(z / CELL + (n - 1) / 2);
  if (r < 0 || c < 0 || r >= n || c >= n) return -1;
  const at = cellAt(n, r * n + c);
  return Math.hypot(at.x - x, at.z - z) <= REACH * 1.2 ? r * n + c : -1;
}
/** What the camera frames for a board of `n` (browser tests aim with it too): the board, its rim and the battery. */
export function bulbSubject(n: number, aspect: number): TableSubject {
  const half = (n * CELL) / 2 + 0.75;
  return { half: aspect < 1 ? half : half + 0.35, halfZ: half, height: 0.6, lookY: 0, tilt: 1.02 };
}
/** How long the wire takes to run from one bulb to the next (ms), and the new bulb to come on after it. */
export const RUN_MS = 360,
  GLOW_MS = 280;
