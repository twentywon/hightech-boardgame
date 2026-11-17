import type { TableSubject } from "../table/view";

/**
 * Where everything of the go table lies, free of Vite-only imports so that browser tests can aim with it.
 *
 * The board's face is at `BOARD_TOP`; its points are `spacing(size)` apart round the middle, row 0 on the far
 * side (white's), column 0 at the left. A stone lying on a point has its middle `stoneLift(size)` above the face.
 * The two bowls stand beside the board, black's at my right hand and white's at my left, each with its lid
 * upturned behind it; on a screen taller than wide they stand before and behind the board instead.
 */
export const BOARD_TOP = 0.2,
  /** The board's thickness, and how high the table top lies under it. */
  BOARD_THICK = 0.5,
  TABLE_TOP = BOARD_TOP - BOARD_THICK;
/** The distance between two lines. */
export const spacing = (size: number) => (size === 9 ? 0.56 : size === 13 ? 0.44 : 0.34);
/** A stone's radius and half its height (gomoku's stones, in proportion to the lines). */
export const stoneRadius = (size: number) => spacing(size) * 0.47,
  stoneHalf = (size: number) => stoneRadius(size) * 0.5;
/** The height of a stone's middle when it lies on the board. */
export const stoneLift = (size: number) => BOARD_TOP + stoneHalf(size);
/** Half the width of the board: the lines and a margin round them. */
export const boardHalf = (size: number) => ((size - 1) / 2) * spacing(size) + (size === 9 ? 0.62 : size === 13 ? 0.5 : 0.44);
/** The middle of point `index` (row × size + column) on the board's face. */
export function pointAt(size: number, index: number) {
  const s = spacing(size),
    mid = (size - 1) / 2;
  return { x: ((index % size) - mid) * s, y: BOARD_TOP, z: (Math.floor(index / size) - mid) * s };
}
/** The bowls' size (one size for every board). */
export const BOWL_RADIUS = 1.0,
  BOWL_HEIGHT = 1.05,
  LID_RADIUS = 1.02;
/** Whether the screen is tall enough that the bowls stand before and behind the board. */
export const upright = (aspect: number) => aspect < 1.05;
/** Where the bowl and the lid of a side stand (side 0 black, 1 white), on the table top. */
export function bowlAt(size: number, side: 0 | 1, aspect: number) {
  const half = boardHalf(size),
    sign = side === 0 ? 1 : -1;
  if (upright(aspect)) return { bowl: { x: sign * (half - 1.05), z: sign * (half + 1.35) }, lid: { x: sign * (half - 3.35), z: sign * (half + 1.3) } };
  // Both bowls level with the board's middle and both lids behind them, so that the near corners, where the
  // buttons and the panel's lettering stand, cover neither.
  return { bowl: { x: sign * (half + 1.4), z: 0.3 }, lid: { x: sign * (half + 1.4), z: -2.05 } };
}
/** What the camera keeps in view: the board and both bowls. */
export function goSubject(size: number, aspect: number): TableSubject {
  const half = boardHalf(size),
    tilt = size === 19 ? 1.02 : size === 13 ? 0.98 : 0.94;
  if (upright(aspect)) return { half: half + 0.15, halfZ: half + 2.45, height: 0.6, lookY: 0, tilt };
  return { half: half + 2.5, halfZ: half + 0.1, height: 0.6, lookY: 0, tilt };
}
