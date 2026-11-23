import type { TableSubject } from "../table/view";
import type { Slot } from "./rules";

/*
 * Where the tiles lie in the tea house, in table units, shared by the view and the browser tests (free of anything
 * Vite-only). A slot's half-tile places are spread by the pitch (a tile and a hair's gap); layer k stands on k tiles.
 * The table's face is y 0; −z is the far side.
 */
/** A tile across, from far to near, and its height; the green back is the lowest `BACK` of it. */
export const W = 1,
  D = 1.36,
  H = 0.72,
  BACK = 0.26,
  /** One half-tile step across and from far to near. */
  PX = 0.515,
  PZ = 0.695,
  /** How much higher one layer stands than the one under it. */
  LAYER = H + 0.006,
  /** How thick the rattan mat under the tiles is: the lowest layer stands on it. */
  MAT_H = 0.02;
/** The middle of the tile of a slot, at its foot (`y`) and its face (`top`). */
export function tileAt(slot: Slot) {
  const y = MAT_H + slot.layer * LAYER;
  // (A slot covers x … x+2; the layouts are centred on their slots, so x itself is the middle across here.)
  return { x: slot.x * PX, y, z: slot.z * PZ, top: y + H };
}
/** How far the layout reaches either way across and from far to near, and how high it stands. */
export function extent(slots: readonly Slot[]) {
  let x = 0,
    z = 0,
    top = 0;
  for (const s of slots) {
    const at = tileAt(s);
    x = Math.max(x, Math.abs(at.x) + W / 2);
    z = Math.max(z, Math.abs(at.z) + D / 2);
    top = Math.max(top, at.top);
  }
  return { x, z, top };
}
/** What the camera frames for a layout (browser tests aim with it too): the tiles and a margin of the table round them. */
export function mahjongSubject(slots: readonly Slot[], aspect: number): TableSubject {
  const e = extent(slots),
    narrow = aspect < 1.2;
  return { half: e.x + (narrow ? 0.4 : 0.9), halfZ: e.z + 0.7, height: e.top * 0.8, lookY: 0, tilt: 0.96 };
}
/** Where the tray of tiles taken stands: at the right of the layout, a little toward the eye. */
export function trayAt(slots: readonly Slot[]) {
  const e = extent(slots);
  return { x: e.x + 2.4, z: Math.min(1.2, e.z * 0.25) };
}
/** How long a pair takes to rise and come together, and to drift into the tray and fade (ms). */
export const RISE_MS = 120,
  MEET_MS = 300,
  FADE_MS = 420;
