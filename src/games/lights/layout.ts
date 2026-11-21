import type { TableSubject } from "../table/view";
import { BOARD_TOP, BULB_Y, CELL, REACH, cellAt, cellUnder } from "../bulblink/layout";

/*
 * Where things lie on the lamp board of lights on, in table units, shared by the view and the browser tests (free of
 * anything Vite-only). It is bulb link's pegboard: `size` × `size` bulbs, row 0 on the far side (−z), column 0 at the
 * left (−x), one socket to the next `CELL`; taps aim at a bulb's glass (`BULB_Y`).
 */
export { BOARD_TOP, BULB_Y, CELL, REACH, cellAt, cellUnder };
/** What the camera frames for a board of `n` (browser tests aim with it too): the board and its frame. */
export function lightsSubject(n: number, aspect: number): TableSubject {
  const half = (n * CELL) / 2 + 0.75;
  return { half: aspect < 1 ? half : half + 0.35, halfZ: half, height: 0.6, lookY: 0, tilt: 1.02 };
}
/** How long the five bulbs a press reaches take to switch (ms): each flickers on or off, the neighbours a moment later. */
export const SWITCH_MS = 280,
  NEIGHBOUR_DELAY = 50;
