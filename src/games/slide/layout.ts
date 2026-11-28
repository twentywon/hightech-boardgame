/**
 * Numbers of the sliding puzzle's tray that the view and browser tests share, free of Vite-only imports: the tray's
 * well is the same size whatever the number of tiles, so that the desk round it is laid out once.
 */
/** The side of the well the tiles lie in. */
export const BOARD = 4.2;
/** The frame's width round the well, and its height above the desk. */
export const FRAME = 0.36,
  FRAME_TOP = 0.36;
/** The floor of the well, and the height of a tile's top (where a tap or a drag is aimed). */
export const WELL = 0.1,
  TILE_HIGH = 0.24,
  TILE_TOP = WELL + TILE_HIGH;
/** The side of one place of a tray of `size`. */
export const cellSize = (size: number) => BOARD / size;
/** The middle of a place of a tray of `size` (row by row from the far left; the far side is −z). */
export function cellAt(size: number, index: number) {
  const cell = cellSize(size);
  return { x: ((index % size) - (size - 1) / 2) * cell, z: (Math.floor(index / size) - (size - 1) / 2) * cell };
}
/** What the camera frames: the tray and its frame, looked down on steeply. */
export function slideSubject(aspect: number) {
  const half = BOARD / 2 + FRAME + (aspect < 1 ? 0.45 : 1.25);
  return { half, halfZ: BOARD / 2 + FRAME + 0.75, height: FRAME_TOP, lookY: 0, tilt: 1.16 };
}
