import type { TableSubject } from "../table/view";
import type { Mode } from "./rules";

/**
 * Where everything of tic-tac-toe lies, free of Vite-only imports so that browser tests can aim with it: the cells
 * of each mode, the size a mark is drawn at, and what the camera keeps in view.
 *
 * Three by three: cells `CELL3` apart round the middle. Ultimate: nine small boards `BIG` apart, their cells
 * `CELL_U` apart. Cube: four acrylic layers `LAYER_H` above each other, each set back `LAYER_SHIFT` from the one
 * below so that every layer shows, their cells `CELL_C` apart.
 */
export const CELL3 = 1.15,
  BIG = 2.35,
  CELL_U = 0.68,
  CELL_C = 0.74,
  LAYER_H = 1.05,
  LAYER_SHIFT = 1.35;
/** A cell's middle (y is the top of the board or layer it lies on). */
export function cellPos(mode: Mode, cell: number) {
  if (mode === "ultimate") {
    const b = Math.floor(cell / 9),
      k = cell % 9;
    return { x: ((b % 3) - 1) * BIG + ((k % 3) - 1) * CELL_U, y: 0, z: (Math.floor(b / 3) - 1) * BIG + (Math.floor(k / 3) - 1) * CELL_U };
  }
  if (mode === "cube") {
    const l = Math.floor(cell / 16),
      r = Math.floor((cell % 16) / 4),
      c = cell % 4;
    return { x: (c - 1.5) * CELL_C, y: l * LAYER_H, z: (r - 1.5) * CELL_C - (l - 1.5) * LAYER_SHIFT };
  }
  return { x: ((cell % 3) - 1) * CELL3, y: 0, z: (Math.floor(cell / 3) - 1) * CELL3 };
}
/** The middle of small board `b` of the ultimate game. */
export const boardPos = (b: number) => ({ x: ((b % 3) - 1) * BIG, y: 0, z: (Math.floor(b / 3) - 1) * BIG });
/** How large a mark is drawn in each mode. */
export const markScale = (mode: Mode) => (mode === "ultimate" ? 0.56 : mode === "cube" ? 0.6 : 1);
/** What the camera keeps in view for a mode. */
export function tttSubject(mode: Mode, aspect: number): TableSubject {
  if (mode === "ultimate") return { half: aspect < 1 ? 3.85 : 4.3, halfZ: 3.85, height: 0.4, lookY: 0, tilt: 1.12 };
  if (mode === "cube") return { half: aspect < 1 ? 1.75 : 2.6, halfZ: 3.6, height: LAYER_H * 3 + 0.4, lookY: LAYER_H * 0.9, tilt: 0.62 };
  return { half: aspect < 1 ? 2.05 : 2.6, halfZ: 2.1, height: 0.5, lookY: 0, tilt: 1.02 };
}
