import type { TableSubject } from "../table/view";
import { CELLS, SIZE, type Piece } from "./rules";

/*
 * Where things stand on the toymaker's bench, in table units: kept free of Vite-only imports, so that browser tests
 * can aim with the same numbers as the view. The bench top is y = 0. The 4 × 4 grid is inlaid in a round maple
 * turntable (a lazy susan); the tray of pieces to set lies before it, or at its right on a wide canvas, and stays
 * where it is when the turntable is turned. A cell's middle in the turntable's own frame ("local") has x growing
 * east and z growing south (toward the player).
 */
/** From one cell's middle to the next, and a unit frame's width and height. */
export const CELL = 0.9,
  WIDE = 0.8,
  HIGH = 0.56;
/** The turntable's top over the bench, and its radius. */
export const BOARD_TOP = 0.16,
  TURNTABLE = 2.78;
/** The marble's radius, and the height of a flat's floor over its unit's foot. */
export const MARBLE = 0.1,
  FLOOR = 0.05;
/** The tray: its gap to the turntable, its depth before it, its width beside it, the room between pieces, how small pieces stand in it, its floor. */
export const TRAY_GAP = 0.3,
  TRAY_DEEP = 1.45,
  TRAY_SIDE = 1.75,
  TRAY_ROOM = 0.26,
  TRAY_SCALE = 0.62,
  TRAY_TOP = 0.06;
/** The height of the plane a carried piece is moved over (its foot). */
export const CARRY = BOARD_TOP + 2 * HIGH;
/** The start's funnel: its height and its mouth. */
export const FUNNEL = 0.2,
  FUNNEL_MOUTH = 0.25;
/** Whether the canvas is wide enough (a phone held sideways) for the tray to lie at the turntable's right instead of before it. */
export const sideways = (aspect: number) => aspect > 1.45;
/** The turntable's middle on the bench: set back (or to the left), so that it and the tray together are centred. */
export const boardMiddle = (aspect = 1) => (sideways(aspect) ? { x: -(TRAY_GAP + TRAY_SIDE) / 2, z: 0 } : { x: 0, z: -(TRAY_GAP + TRAY_DEEP) / 2 });
/** A cell's middle in the turntable's frame. */
export function cellLocal(cell: number) {
  const r = Math.floor(cell / SIZE),
    c = cell % SIZE;
  return { x: (c - (SIZE - 1) / 2) * CELL, z: (r - (SIZE - 1) / 2) * CELL };
}
/** From the turntable's frame to the bench, the turntable turned by `turn` (counter-clockwise seen from above). */
export function toBench(x: number, z: number, turn = 0, aspect = 1) {
  const m = boardMiddle(aspect),
    c = Math.cos(turn),
    s = Math.sin(turn);
  return { x: m.x + x * c + z * s, z: m.z - x * s + z * c };
}
/** From the bench to the turntable's frame. */
export function toLocal(x: number, z: number, turn = 0, aspect = 1) {
  const m = boardMiddle(aspect),
    dx = x - m.x,
    dz = z - m.z,
    c = Math.cos(turn),
    s = Math.sin(turn);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
/** A cell's middle on the bench. */
export const cellAt = (cell: number, turn = 0, aspect = 1) => {
  const at = cellLocal(cell);
  return toBench(at.x, at.z, turn, aspect);
};
/** The height of a level's foot (level 0 sits on the turntable). */
export const levelY = (level: number) => BOARD_TOP + level * HIGH;
/** The cell under a point of the turntable's frame, or -1 off the grid. */
export function cellUnderLocal(x: number, z: number) {
  const c = Math.round(x / CELL + (SIZE - 1) / 2),
    r = Math.round(z / CELL + (SIZE - 1) / 2);
  if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return -1;
  return Math.abs(x - (c - (SIZE - 1) / 2) * CELL) <= CELL / 2 && Math.abs(z - (r - (SIZE - 1) / 2) * CELL) <= CELL / 2 ? r * SIZE + c : -1;
}
/** The cell under a point of the bench, or -1. */
export function cellUnder(x: number, z: number, turn = 0, aspect = 1) {
  const at = toLocal(x, z, turn, aspect);
  return cellUnderLocal(at.x, at.z);
}
/** How wide a piece is in the tray (along x: a beam lies there as it lies on the board at yaw 0), and how tall. */
export const trayWidth = (piece: Pick<Piece, "shape" | "units">) => (piece.shape === "column" ? WIDE : (piece.units.length - 1) * CELL + WIDE) * TRAY_SCALE;
export const trayHeight = (piece: Pick<Piece, "shape" | "units">) => (piece.shape === "column" ? piece.units.length : 1) * HIGH * TRAY_SCALE;
/**
 * Where each tray piece stands in the tray: in rows from the far side to the near one, the tallest farthest so that
 * none hides another, columns upright and beams lying across. `x`, `z` are the middle of its foot on the bench (a
 * beam's middle unit, as on the board).
 */
export function trayPlaces(tray: Pick<Piece, "shape" | "units">[], aspect = 1) {
  const side = sideways(aspect),
    room = side ? TRAY_SIDE - 0.2 : 2 * TURNTABLE,
    order = tray.map((_, j) => j).sort((a, b) => trayHeight(tray[b]) - trayHeight(tray[a]) || a - b),
    rows: number[][] = [];
  for (const j of order) {
    const row = rows[rows.length - 1],
      width = (r: number[]) => r.reduce((sum, k) => sum + trayWidth(tray[k]), 0) + TRAY_ROOM * (r.length - 1);
    if (row && width([...row, j]) <= room) row.push(j);
    else rows.push([j]);
  }
  const box = trayBox(tray, aspect),
    deep = WIDE * TRAY_SCALE + TRAY_ROOM,
    out: { x: number; z: number }[] = new Array(tray.length);
  rows.forEach((row, r) => {
    const z = box.z + (r - (rows.length - 1) / 2) * deep,
      total = row.reduce((sum, k) => sum + trayWidth(tray[k]), 0) + TRAY_ROOM * (row.length - 1);
    let x = box.x - total / 2;
    for (const j of row) {
      const w = trayWidth(tray[j]),
        // A beam's foot is its middle unit, which is not the middle of a beam of two.
        shift = tray[j].shape === "beam" ? (-(tray[j].units.length - 1) / 2 + ((tray[j].units.length - 1) >> 1)) * CELL * TRAY_SCALE : 0;
      out[j] = { x: x + w / 2 + shift, z };
      x += w + TRAY_ROOM;
    }
  });
  return out;
}
/** The tray box: its middle on the bench and its size (across x, along z). */
export function trayBox(_tray: Pick<Piece, "shape" | "units">[], aspect = 1) {
  const m = boardMiddle(aspect);
  if (sideways(aspect)) return { x: m.x + TURNTABLE + TRAY_GAP + TRAY_SIDE / 2, z: 0, wide: TRAY_SIDE, deep: 2 * TURNTABLE - 0.4 };
  return { x: 0, z: m.z + TURNTABLE + TRAY_GAP + TRAY_DEEP / 2, wide: 2 * TURNTABLE + 0.5, deep: TRAY_DEEP };
}
/** Where a tap on the start's funnel aims: the middle of its mouth. */
export function funnelAt(start: Pick<Piece, "at" | "level" | "units">, turn = 0, aspect = 1) {
  const at = cellAt(start.at, turn, aspect);
  return { x: at.x, y: levelY(start.level + start.units.length) + FUNNEL * 0.7, z: at.z };
}
/** The tilt of the view, and how far a drag may tip it up or down. */
export const TILT = 0.94,
  LIFT_DOWN = -0.3,
  LIFT_UP = 0.32;
/** What the camera frames: the turntable with its tallest towers, and the tray; `lift` tips the view. */
export function marbleSubject(aspect: number, lift = 0): TableSubject {
  const tilt = TILT + Math.max(LIFT_DOWN, Math.min(LIFT_UP, lift));
  if (sideways(aspect)) return { half: TURNTABLE + (TRAY_GAP + TRAY_SIDE) / 2 + 0.05, halfZ: TURNTABLE + 0.05, height: 3.3, lookY: 0.6, tilt };
  return { half: TURNTABLE + 0.1, halfZ: TURNTABLE + (TRAY_GAP + TRAY_DEEP) / 2 + 0.05, height: 3.3, lookY: 0.6, tilt };
}
/** How long the marble takes over a stretch of its way (ms). */
export const ROLL_MS = 240,
  FALL_MS = 200;
/** The points the keyboard walks: the cells, then the tray's places (on the bench, so that arrows go as the eye sees). */
export function keyPlaces(tray: Pick<Piece, "shape" | "units">[], turn = 0, aspect = 1) {
  return [...Array.from({ length: CELLS }, (_, i) => cellAt(i, turn, aspect)), ...trayPlaces(tray, aspect)];
}
