import type { TableSubject } from "../table/view";
import { CELLS, KIT, SIZE, voxelsOf, type Pose, type Tower } from "./rules";

/*
 * Where things stand on the toymaker's bench, in table units: kept free of Vite-only imports, so that browser tests
 * can aim with the same numbers as the view. The bench top is y = 0. The 4 × 4 grid is inlaid in a round maple
 * turntable (a lazy susan); the tray of towers to set lies before it, or at its right on a wide canvas, and stays
 * where it is when the turntable is turned (the towers in it turn with the turntable, so that they show the way they
 * will stand). A cell's middle in the turntable's own frame ("local") has x growing east and z growing south (toward
 * the player).
 */
/** From one cell's middle to the next; a unit cube's width across its tower, and its length along it (a level). */
export const CELL = 0.9,
  WIDE = 0.84,
  HIGH = 0.9;
/** The turntable's top over the bench, and its radius. */
export const BOARD_TOP = 0.16,
  TURNTABLE = 2.78;
/** The marble's radius, and the height of a channel's floor over its cube's foot. */
export const MARBLE = 0.12,
  FLOOR = 0.07;
/** The tray: its gap to the turntable, its depth before it, its width beside it, the room between towers, how small towers stand in it, its floor. */
export const TRAY_GAP = 0.3,
  TRAY_DEEP = 1.7,
  TRAY_SIDE = 1.9,
  TRAY_ROOM = 0.2,
  TRAY_SCALE = 0.5,
  TRAY_TOP = 0.06;
/** The height of the plane a carried tower is moved over (its foot). */
export const CARRY = BOARD_TOP + 2.2 * HIGH;
/** The start's funnel: its height and its mouth. */
export const FUNNEL = 0.26,
  FUNNEL_MOUTH = 0.3;
/** Whether the canvas is wide enough for the tray to lie at the turntable's right instead of before it. */
export const sideways = (aspect: number) => aspect > 1.3;
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
  return Math.abs(x - (c - (SIZE - 1) / 2) * CELL) <= CELL / 2 && Math.abs(z - (r - (SIZE - 1) / 2) * CELL) <= CELL / 2 ? r * SIZE + c + 0 : -1;
}
/** The cell under a point of the bench, or -1. */
export function cellUnder(x: number, z: number, turn = 0, aspect = 1) {
  const at = toLocal(x, z, turn, aspect);
  return cellUnderLocal(at.x, at.z);
}
/** The middle of a placed tower's unit on the bench (a lying unit is a cube's width high, resting on its supports). */
export function unitCentre(tower: Tower, unit: number, turn = 0, aspect = 1) {
  const v = voxelsOf(tower).find((x) => x.unit === unit)!,
    at = cellAt(v.cell, turn, aspect);
  return { x: at.x, y: levelY(v.level) + (tower.lying ? WIDE : HIGH) / 2, z: at.z };
}
/** How much room a tower takes in the tray (a lying one turns within its slot as the turntable turns), and how tall it stands there. */
export const traySlot = (t: Pick<Pose, "lying"> & { kind: number }) => (t.lying ? KIT[t.kind].units.length * HIGH : WIDE * 1.15) * TRAY_SCALE;
export const trayHeight = (t: Pick<Pose, "lying"> & { kind: number }) => (t.lying ? WIDE : KIT[t.kind].units.length * HIGH) * TRAY_SCALE;
/**
 * Where each tray tower stands in the tray: in rows from the far side to the near one, the tallest farthest so that
 * none hides another. `x`, `z` are the middle of its foot on the bench (of the whole tower, for a lying one).
 */
export function trayPlaces(tray: (Pick<Pose, "lying"> & { kind: number })[], aspect = 1) {
  const side = sideways(aspect),
    box = trayBox(tray, aspect),
    room = side ? box.wide - 0.2 : box.wide - 0.3,
    order = tray.map((_, j) => j).sort((a, b) => trayHeight(tray[b]) - trayHeight(tray[a]) || a - b),
    rows: number[][] = [];
  const width = (r: number[]) => r.reduce((sum, k) => sum + traySlot(tray[k]), 0) + TRAY_ROOM * (r.length - 1);
  for (const j of order) {
    const row = rows[rows.length - 1];
    if (row && width([...row, j]) <= room) row.push(j);
    else rows.push([j]);
  }
  const deeps = rows.map((row) => Math.max(...row.map((k) => traySlot(tray[k])))),
    total = deeps.reduce((a, b) => a + b, 0) + TRAY_ROOM * (rows.length - 1),
    out: { x: number; z: number }[] = new Array(tray.length);
  let z = box.z - total / 2;
  rows.forEach((row, r) => {
    const mid = z + deeps[r] / 2;
    let x = box.x - width(row) / 2;
    for (const j of row) {
      const w = traySlot(tray[j]);
      out[j] = { x: x + w / 2, z: mid };
      x += w + TRAY_ROOM;
    }
    z += deeps[r] + TRAY_ROOM;
  });
  return out;
}
/** A point on top of tray tower j where it stands in the tray (the middle of its top, or of a lying one's upper side). */
export function trayTop(tray: (Pick<Pose, "lying"> & { kind: number })[], j: number, aspect = 1) {
  const at = trayPlaces(tray, aspect)[j];
  return { x: at.x, y: TRAY_TOP + trayHeight(tray[j]) - 0.03, z: at.z };
}
/** The tray box: its middle on the bench and its size (across x, along z). */
export function trayBox(_tray: unknown[], aspect = 1) {
  const m = boardMiddle(aspect);
  if (sideways(aspect)) return { x: m.x + TURNTABLE + TRAY_GAP + TRAY_SIDE / 2, z: 0, wide: TRAY_SIDE, deep: 2 * TURNTABLE - 0.4 };
  return { x: 0, z: m.z + TURNTABLE + TRAY_GAP + TRAY_DEEP / 2, wide: 2 * TURNTABLE + 0.5, deep: TRAY_DEEP };
}
/** The first free level of the start's cell: the funnel stands there. */
export function funnelLevel(state: { start: number; given: Tower[] }) {
  let top = 0;
  for (const t of state.given) for (const v of voxelsOf(t)) if (v.cell === state.start) top = Math.max(top, v.level + 1);
  return top;
}
/** Where a tap on the start's funnel aims: the middle of its mouth. */
export function funnelAt(state: { start: number; given: Tower[] }, turn = 0, aspect = 1) {
  const at = cellAt(state.start, turn, aspect);
  return { x: at.x, y: levelY(funnelLevel(state)) + FUNNEL * 0.7, z: at.z };
}
/** The tilt of the view, and how far a drag may tip it up or down. */
export const TILT = 0.86,
  LIFT_DOWN = -0.3,
  LIFT_UP = 0.4;
/** The most storeys any cell of a puzzle holds, fixed towers and answer together (the funnel stands on one of them). */
export function tallest(state: { given: Tower[]; tray: Tower[]; answer: { at: number; level: number; yaw: number }[] }) {
  let top = 0;
  for (const t of [...state.given, ...state.tray.map((t, j) => ({ ...t, ...state.answer[j] }))]) for (const v of voxelsOf(t)) top = Math.max(top, v.level + 1);
  return top;
}
/** What the camera frames: the turntable with towers `storeys` high and the funnel, and the tray; `lift` tips the view. */
export function marbleSubject(aspect: number, lift = 0, storeys = 4): TableSubject {
  const tilt = TILT + Math.max(LIFT_DOWN, Math.min(LIFT_UP, lift)),
    height = Math.max(2.6, levelY(storeys) + FUNNEL + 0.25),
    lookY = height * 0.3;
  if (sideways(aspect)) return { half: TURNTABLE + (TRAY_GAP + TRAY_SIDE) / 2 + 0.05, halfZ: TURNTABLE + 0.05, height, lookY, tilt };
  return { half: TURNTABLE + 0.1, halfZ: TURNTABLE + (TRAY_GAP + TRAY_DEEP) / 2 + 0.05, height, lookY, tilt };
}
/** How long the marble takes over a stretch of its way (ms). */
export const ROLL_MS = 240,
  FALL_MS = 200;
/** The points the keyboard walks: the cells, then the tray's places (on the bench, so that arrows go as the eye sees). */
export function keyPlaces(tray: (Pick<Pose, "lying"> & { kind: number })[], turn = 0, aspect = 1) {
  return [...Array.from({ length: CELLS }, (_, i) => cellAt(i, turn, aspect)), ...trayPlaces(tray, aspect)];
}
