/**
 * Where things stand on the field of 전술 대전, shared by the view and the browser tests (free of anything that only
 * Vite can load). The field is a square of tiles on a plinth whose top is y = 0; it is turned a quarter at a time
 * about its middle (`yawOf`) while the camera stays where `cameraDistance` puts it for `tacticsSubject`.
 */
import { CELLS, D, W, colOf, fieldOf, rowOf } from "./rules";

/** The width of a tile, the rise of one level, the top of a tile of level 0 and the surface of water. */
export const TILE = 1,
  LEVEL = 0.28,
  BASE = 0.3,
  WATER = 0.17;
/** How far the plinth reaches beyond the tiles. */
export const RIM = 0.42;
/** The field is first seen from the corner at its near left, my side along the lower left edge. */
export const YAW0 = -Math.PI / 4;
export const yawOf = (quarter: number) => YAW0 + (((quarter % 4) + 4) % 4) * (Math.PI / 2);
/** A tile's middle on the field before it is turned. */
export const tileLocal = (cell: number) => ({ x: (colOf(cell) - (W - 1) / 2) * TILE, z: (rowOf(cell) - (D - 1) / 2) * TILE });
/** The height of a tile's top: water lies lower and a bridge's deck a little above the banks. */
export function tileTop(field: string, cell: number) {
  const f = fieldOf(field);
  if (f.ground[cell] === "water") return WATER;
  if (f.ground[cell] === "bridge") return BASE + 0.05;
  return BASE + LEVEL * f.height[cell];
}
/** Where a point of the field (before turning) is in the scene once the field is turned to `quarter`. */
export function turned(x: number, z: number, quarter: number) {
  const yaw = yawOf(quarter),
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}
/** The top of a tile's middle in the scene, for a view turned to `quarter`. */
export function tilePoint(field: string, cell: number, quarter = 0) {
  const at = tileLocal(cell),
    t = turned(at.x, at.z, quarter);
  return { x: t.x, y: tileTop(field, cell), z: t.z };
}
/** Half the field's diagonal with its plinth: how far its corners reach from the middle once it is turned. */
export const REACH = ((Math.max(W, D) * TILE) / 2 + RIM) * Math.SQRT2;
/**
 * What the camera keeps in view: the turned field (a diamond on the screen), the tallest things standing on it, and
 * room at the top for the status line and the queue of who acts next. The box is narrower than the diamond's
 * reach, because its near corners lie closer to the eye than the diamond's side corners.
 */
export function tacticsSubject(aspect: number) {
  // A phone held sideways is short and wide: the queue stands at its upper right, so the field may fill the height.
  if (aspect > 2.1) return { half: REACH * 0.78, halfZ: REACH * 0.9, height: 1.5, lookY: 0.4, tilt: 0.9 };
  const wide = aspect > 1.5;
  return { half: REACH * (wide ? 0.8 : 0.84), halfZ: REACH * 0.9, height: wide ? 2.9 : 2.5, lookY: 0.55, tilt: 0.9 };
}
/** Every tile, for the tests. */
export const ALL_CELLS = Array.from({ length: CELLS }, (_, c) => c);
