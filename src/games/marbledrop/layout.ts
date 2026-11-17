import type { TableSubject } from "../table/view";

/*
 * Where things stand on the toymaker's bench, in table units: kept free of Vite-only imports, so that browser tests
 * can aim with the same numbers as the view. The bench top is y = 0; the board lies on it, its plots in rows that run
 * from the far side (north, row 0) toward the player, and the tray of pieces to set lies before it.
 */
/** From one plot's middle to the next. */
export const CELL = 0.9;
/** How wide a tower is, and one storey's height. */
export const WIDE = 0.56,
  STOREY = 0.21;
/** The board's top over the bench, and the rim round its plots. */
export const BOARD_TOP = 0.14,
  RIM = 0.24;
/** The marble's radius. */
export const MARBLE = 0.072;
/** A trough's groove: how deep and how wide. */
export const GROOVE = 0.085,
  CHANNEL = 0.2;
/** How far a spout reaches out of its tower, and how high up its storey it comes out (a share of the storey). */
export const SPOUT = 0.22,
  SPOUT_Y = 0.58;
/** The start tower's funnel: its height and its mouth. */
export const FUNNEL = 0.17,
  FUNNEL_MOUTH = 0.23;
/** The tray before the board: the gap to the board, its depth, the space of a place in it, its floor. */
export const TRAY_GAP = 0.32,
  TRAY_DEPTH = 1.0,
  TRAY_STEP = 0.98,
  TRAY_TOP = 0.05;
/** Half the board's width, rim included. */
export const boardHalf = (size: number) => (size * CELL) / 2 + RIM;
/**
 * Whether the canvas is wide enough (a phone held sideways) for the tray to stand at the board's right instead of
 * before it: the board can then be drawn larger.
 */
export const sideways = (aspect: number) => aspect > 1.45;
/** The middle of the board: set back (or to the left) from the middle of the bench, so that board and tray together are centred. */
export function boardMiddle(aspect = 1) {
  const shift = (TRAY_GAP + TRAY_DEPTH) / 2;
  return sideways(aspect) ? { x: -shift, z: 0 } : { x: 0, z: -shift };
}
/** The middle of a plot, on the board. */
export function plotAt(size: number, plot: number, aspect = 1) {
  const r = Math.floor(plot / size),
    c = plot % size,
    middle = boardMiddle(aspect);
  return { x: (c - (size - 1) / 2) * CELL + middle.x, z: (r - (size - 1) / 2) * CELL + middle.z };
}
/** The tray: its middle, and how long it is along its length (across the screen before the board, or down its right side). */
export function trayBox(size: number, count: number, aspect = 1) {
  const middle = boardMiddle(aspect),
    out = boardHalf(size) + TRAY_GAP + TRAY_DEPTH / 2,
    length = Math.max(2, count) * TRAY_STEP + 0.3;
  return sideways(aspect) ? { x: middle.x + out, z: 0, length, across: false } : { x: 0, z: middle.z + out, length, across: true };
}
/** The middle of place `j` of a tray of `count` places. */
export function trayAt(size: number, count: number, j: number, aspect = 1) {
  const box = trayBox(size, count, aspect),
    along = (j - (count - 1) / 2) * TRAY_STEP;
  return box.across ? { x: along, z: box.z } : { x: box.x, z: along };
}
/** The plot under a point of the board (x, z), or -1 off it. */
export function plotUnder(size: number, x: number, z: number, aspect = 1) {
  const middle = boardMiddle(aspect),
    c = Math.round((x - middle.x) / CELL + (size - 1) / 2),
    r = Math.round((z - middle.z) / CELL + (size - 1) / 2);
  if (r < 0 || c < 0 || r >= size || c >= size) return -1;
  const at = plotAt(size, r * size + c, aspect);
  return Math.abs(x - at.x) <= CELL / 2 && Math.abs(z - at.z) <= CELL / 2 ? r * size + c : -1;
}
/** The top of a tower `height` storeys tall standing on the board. */
export const topOf = (height: number) => BOARD_TOP + height * STOREY;
/** Where a tap on the start tower's funnel aims: the middle of its mouth. */
export function funnelAt(size: number, plot: number, level: number, aspect = 1) {
  const at = plotAt(size, plot, aspect);
  return { x: at.x, y: topOf(level + 1) + FUNNEL * 0.6, z: at.z };
}
/** What the camera frames: the board with its tallest towers, and the tray before it or beside it. */
export function marbleSubject(size: number, aspect: number): TableSubject {
  const half = boardHalf(size),
    tray = (TRAY_GAP + TRAY_DEPTH) / 2;
  // Seen steeply enough that the tallest tower (the start, five storeys and its funnel) does not hide a piece one
  // storey high on the plot behind it, even in the far row, where the eye looks at a shallower angle.
  if (sideways(aspect)) return { half: half + tray + 0.2, halfZ: half + 0.1, height: 0.8, lookY: 0.2, tilt: 1.05 };
  return { half: half + (aspect < 1.2 ? 0.1 : 0.45), halfZ: half + tray + 0.1, height: 0.8, lookY: 0.2, tilt: 1.05 };
}
/** The colour of the band round a piece of each height (1 to 5): none is red, which is kept for trouble. */
export const HEIGHT_PAINT = ["", "#f2c230", "#4caf5a", "#3b86d8", "#8a5ccc", "#18a5a5"];
/** How long the marble takes over a stretch of its way (ms): a flight, a roll along a groove, the fall through a tower. */
export const FLY_MS = 300,
  ROLL_MS = 260,
  INSIDE_MS = 230;
