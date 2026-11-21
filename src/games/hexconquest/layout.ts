import type { TableSubject } from "../table/view";
import { COLS, ROWS, colOf, rowOf } from "./board";

/*
 * Where everything of 헥스 정복전 stands, in table units, free of Vite-only imports so that browser tests can aim
 * with the same numbers as the view. A hex is one unit across its corners (its middle 0.75 from the next column's,
 * 0.866 from the next row's); the map's middle is at the origin, column 0 at the left, row 0 at the far edge.
 */
export const SIZE = 0.5;
const ROOT3 = Math.sqrt(3);
/** The top of the sea and of a land tile; the table's top lies just under the map's frame. */
export const SEA_TOP = 0.05,
  LAND_TOP = 0.17;
/** Half the map's width and depth, hexes and all. */
export const MAP_HALF = ((COLS - 1) / 2) * 1.5 * SIZE + SIZE,
  MAP_HALF_Z = (ROWS / 2) * ROOT3 * SIZE + SIZE * 0.1;
/** The middle of a hex on the map. */
export function hexAt(h: number) {
  const c = colOf(h),
    r = rowOf(h);
  return { x: (c - (COLS - 1) / 2) * 1.5 * SIZE, z: (r + (c & 1) / 2 - (ROWS - 0.5) / 2) * ROOT3 * SIZE };
}
/** An army stands a little toward the near side of a hex with an estate, so that both are seen. */
export const ARMY_FORWARD = 0.2;
/**
 * How far the map is moved to the right of the screen, so that the lettering at the table's upper left stands beside
 * the far edge of the map rather than over its corner.
 */
export const viewShift = (aspect: number) => (aspect >= 1.95 ? 0.6 : aspect >= 1.2 ? 1.1 : 0.3);
/** What the camera keeps in view: the map with its frame, and the armies and their plates standing on it. */
export function hexSubject(aspect: number): TableSubject {
  return { half: MAP_HALF + 0.6 + viewShift(aspect), halfZ: MAP_HALF_Z + 0.3, height: 0.7, lookY: 0, tilt: aspect >= 1.95 ? 1.2 : 1.16 };
}
