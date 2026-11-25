import type { TableSubject } from "../table/view";

/**
 * Numbers of the table that browser tests aim with, free of Vite-only imports: the scene's scale (scene units a metre
 * of the playfield) and where a point of the playfield (x across, y up it, in metres) lies on the playfield's own plane
 * before its slope is applied (x across, z toward the player).
 */
export const SCALE = 10,
  /** The playfield's height (y, metres) that stands at the scene's middle. */
  MIDDLE = 0.5;
export const toScene = (x: number, y: number) => ({ x: x * SCALE, z: (MIDDLE - y) * SCALE });
// The camera is placed by the view itself (`PinballView.resize`); this is only the table's rough size.
export const PINBALL_SUBJECT: TableSubject = { half: 3, halfZ: 6, height: 4, lookY: 0, tilt: 0.95 };
