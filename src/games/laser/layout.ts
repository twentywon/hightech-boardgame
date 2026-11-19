import type { TableSubject } from "../table/view";
import { CELLS, SIZE, type Kind } from "./rules";

/*
 * Where things stand on the optics bench, in table units: kept free of Vite-only imports, so that browser tests can
 * aim with the same numbers as the view. The table top is y = 0; the breadboard lies on it, its 5 × 5 mounts a unit
 * apart; the tray of pieces to set lies before it, or at its right on a wide canvas. Board units (a cell's column
 * and row, as the beam is traced in `rules.ts`) become table units through `toTable`.
 */
/** From one mount to the next, and half the breadboard's side. */
export const CELL = 1,
  PLATE_HALF = 2.85;
/** The breadboard's top, a mount's pad over it, and the foot every piece stands on. */
export const TOP = 0.12,
  PAD = 0.035,
  FOOT = TOP + PAD;
/** The height the beam runs at. */
export const BEAM = 0.52;
/** The tray: its gap to the board, its depth before it, its width beside it, how small pieces stand in it, its floor (the top of its foam). */
export const TRAY_GAP = 0.32,
  TRAY_DEEP = 1.38,
  TRAY_SIDE = 1.42,
  TRAY_SCALE = 0.78,
  TRAY_TOP = 0.1,
  /** From one tray place to the next. */
  TRAY_STEP = 1.05;
/** The height a carried piece's foot hovers at (the plane the hand is followed on). */
export const CARRY = 0.62;
/** How tall each kind of piece stands over its foot (for a hand to aim at), and the half width of the box a press is judged by. */
export const TALL: Record<Kind, number> = { laser: 0.62, target: 0.62, mirror: 0.66, splitter: 0.58, checkpoint: 0.68, blocker: 0.2 };
export const REACH = 0.37;
/** Whether the canvas is wide enough (a phone held sideways) for the tray to lie at the board's right instead of before it. */
export const sideways = (aspect: number) => aspect > 1.45;
/** The board's middle on the table: set back (or to the left), so that it and the tray together are centred. */
export const boardMiddle = (aspect = 1) => (sideways(aspect) ? { x: -(TRAY_GAP + TRAY_SIDE) / 2, z: 0 } : { x: 0, z: -(TRAY_GAP + TRAY_DEEP) / 2 });
/** A point in board units (column, row) on the table. */
export function toTable(x: number, z: number, aspect = 1) {
  const m = boardMiddle(aspect);
  return { x: m.x + (x - (SIZE - 1) / 2) * CELL, z: m.z + (z - (SIZE - 1) / 2) * CELL };
}
/** A cell's middle on the table. */
export const cellAt = (cell: number, aspect = 1) => toTable(cell % SIZE, Math.floor(cell / SIZE), aspect);
/** The cell under a point of the table, or -1 off the grid. */
export function cellUnder(x: number, z: number, aspect = 1) {
  const m = boardMiddle(aspect),
    c = Math.round((x - m.x) / CELL + (SIZE - 1) / 2),
    r = Math.round((z - m.z) / CELL + (SIZE - 1) / 2);
  return r < 0 || c < 0 || r >= SIZE || c >= SIZE ? -1 : r * SIZE + c;
}
/** Whether a point of the table lies over the breadboard. */
export function onPlate(x: number, z: number, aspect = 1) {
  const m = boardMiddle(aspect);
  return Math.abs(x - m.x) <= PLATE_HALF && Math.abs(z - m.z) <= PLATE_HALF;
}
/** The tray box: its middle on the table and its size (across x, along z). */
export function trayBox(aspect = 1) {
  const m = boardMiddle(aspect);
  if (sideways(aspect)) return { x: m.x + PLATE_HALF + TRAY_GAP + TRAY_SIDE / 2, z: 0, wide: TRAY_SIDE, deep: 2 * PLATE_HALF - 0.3 };
  return { x: 0, z: m.z + PLATE_HALF + TRAY_GAP + TRAY_DEEP / 2, wide: 2 * PLATE_HALF, deep: TRAY_DEEP };
}
/** Where each of `count` tray pieces stands: in a row before the board, or in a column beside it. */
export function trayPlaces(count: number, aspect = 1) {
  const box = trayBox(aspect),
    side = sideways(aspect);
  return Array.from({ length: count }, (_, j) => {
    const along = (j - (count - 1) / 2) * TRAY_STEP;
    return side ? { x: box.x, z: box.z + along } : { x: box.x + along, z: box.z };
  });
}
/** Where a hand takes a piece: its middle, a little above the beam (on the board, or smaller in the tray). */
export function gripAt(kind: Kind, place: { x: number; z: number }, inTray: boolean) {
  const scale = inTray ? TRAY_SCALE : 1,
    foot = inTray ? TRAY_TOP : FOOT;
  return { x: place.x, y: foot + Math.min(TALL[kind] * 0.75, 0.46) * scale, z: place.z };
}
/** The tilt of the view. */
export const TILT = 1.02;
/** What the camera frames: the breadboard and the tray. */
export function laserSubject(aspect: number): TableSubject {
  if (sideways(aspect)) return { half: PLATE_HALF + (TRAY_GAP + TRAY_SIDE) / 2 + 0.05, halfZ: PLATE_HALF + 0.08, height: 0.8, lookY: 0.2, tilt: TILT };
  return { half: PLATE_HALF + 0.08, halfZ: PLATE_HALF + (TRAY_GAP + TRAY_DEEP) / 2 + 0.05, height: 0.8, lookY: 0.2, tilt: TILT };
}
/** How fast the beam runs out from the laser when it is fired (board units a second), and the least and most it takes. */
export const BEAM_SPEED = 11,
  BEAM_MIN = 450,
  BEAM_MAX = 1500;
/** The points the keyboard walks: the cells, then the tray's places. */
export function keyPlaces(count: number, aspect = 1) {
  return [...Array.from({ length: CELLS }, (_, i) => cellAt(i, aspect)), ...trayPlaces(count, aspect)];
}
