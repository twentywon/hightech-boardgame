import type { TableSubject } from "../table/view";
import { CELLS, DIRS, step } from "./rules";

/*
 * Where everything of 구슬 밀기 stands, in table units, free of Vite-only imports so that browser tests aim with the
 * same numbers as the view. The table top is y = 0; the board's playing face (its plateau) is a hexagon at `TOP`, its
 * corners pointing left and right (x), its near edge toward side 0 (z greater). A gutter runs round the plateau; at
 * the left and right corners the rim is let down and the gutter runs out into a turned bowl, side 0's at the right and
 * side 1's at the left, where the marbles each side has pushed off lie in a ring of six.
 */
/** From one cell's middle to the next. */
export const STEP = 0.6;
/** The middle of a cell on the table (x, z). */
export const cellAt = (i: number) => ({ x: (CELLS[i].q + CELLS[i].r / 2) * STEP, z: CELLS[i].r * STEP * 0.8660254 });
/** The six directions as unit steps on the table. */
export const DIR_XZ = DIRS.map(([dq, dr]) => {
  const x = dq + dr / 2,
    z = dr * 0.8660254,
    l = Math.hypot(x, z);
  return { x: x / l, z: z / l };
});
/** Height of the plateau, a marble's radius, and the cups: their radius and depth at the middle. */
export const TOP = 0.42,
  MARBLE_R = 0.235,
  CUP = { radius: 0.272, depth: 0.065 };
/** The plateau: the apothem of its hexagon (from the middle to the middle of an edge) and the rounding of its corners. */
export const PLATEAU = { apothem: 4 * STEP * 0.8660254 + 0.4, corner: 0.16 };
/** The gutter: how far out from the plateau's edge its middle runs, the radius of its channel, and its floor's height. */
export const GUTTER = { offset: 0.31, radius: 0.235, floor: TOP - 0.25 };
/** How far out from the plateau's edge the frame reaches. */
export const FRAME_OUT = 0.82;
/** The height of a cup's floor below the plateau at distance `r` from its middle (0 outside it), and its slope. */
export function cupDepth(r: number) {
  if (r >= CUP.radius) return 0;
  const k = 1 - (r / CUP.radius) ** 2;
  return -CUP.depth * k * k;
}
/** Where a marble's middle rests in its cup: as low as it goes without passing into the stone. */
export const REST_Y = (() => {
  let y = -Infinity;
  for (let i = 0; i <= 200; i++) {
    const r = (MARBLE_R * i) / 200;
    y = Math.max(y, TOP + cupDepth(r) + Math.sqrt(MARBLE_R * MARBLE_R - r * r));
  }
  return y;
})();
/** A rounded hexagon at apothem `a` with corner radius `rho`: the point at `u` (0–1 round, 0 at the right corner, going toward −z first as seen from above, i.e. counter-clockwise on the screen). */
export function hexPoint(a: number, rho: number, u: number) {
  const k = ((u % 1) + 1) % 1,
    side = Math.floor(k * 6),
    t = k * 6 - side,
    // Each sixth: the second half of a corner's arc, the straight edge, the first half of the next corner's arc. A
    // corner's arc takes the same share of every sixth, so that rings at every offset line up.
    c0 = side * (Math.PI / 3),
    c1 = c0 + Math.PI / 3,
    r = Math.max(0, rho),
    far = (a - r) / Math.cos(Math.PI / 6),
    ARC = 0.18;
  const corner = (c: number, phi: number) => ({ x: Math.cos(c) * far + Math.cos(phi) * r, z: -(Math.sin(c) * far + Math.sin(phi) * r) });
  if (t < ARC / 2) return corner(c0, c0 + (t / (ARC / 2)) * (Math.PI / 6));
  if (t > 1 - ARC / 2) return corner(c1, c1 - ((1 - t) / (ARC / 2)) * (Math.PI / 6));
  const p = corner(c0, c0 + Math.PI / 6),
    q = corner(c1, c1 - Math.PI / 6),
    s = (t - ARC / 2) / (1 - ARC);
  return { x: p.x + (q.x - p.x) * s, z: p.z + (q.z - p.z) * s };
}
/** A point of the gutter's middle line, at `u` round; and the marble's middle there. */
export const gutterAt = (u: number) => hexPoint(PLATEAU.apothem + GUTTER.offset, PLATEAU.corner + GUTTER.offset, u);
export const GUTTER_Y = GUTTER.floor + MARBLE_R;
/** How far round the outline the let-down corners reach either side of the left and right corners (in `u`). */
export const NOTCH = 0.028;
/** How far out the frame's right corner reaches. */
export const FRAME_CORNER = hexPoint(PLATEAU.apothem + FRAME_OUT, PLATEAU.corner + FRAME_OUT, 0).x;
/** The bowls: side 0's at the right corner, side 1's at the left; their middle, inner radius, floor and rim (a little under the let-down corner's floor), and the ring the marbles lie in. */
export const BOWL = { x: FRAME_CORNER + 0.72, radius: 0.8, floor: 0.035, rim: GUTTER.floor + 0.02, ring: 0.5 };
/** Where the `k`-th marble lies in the bowl of `side` (0 at the right). */
export function bowlSlot(side: 0 | 1, k: number) {
  const sign = side === 0 ? 1 : -1,
    // The first lies at the outer side, then round the ring, toward the near side first.
    a = Math.PI * (side === 0 ? 0 : 1) + (k * Math.PI) / 3 * (side === 0 ? 1 : -1);
  return { x: sign * BOWL.x + Math.cos(a) * BOWL.ring, y: BOWL.floor + MARBLE_R + 0.01, z: Math.sin(a) * BOWL.ring };
}
/** The view's subject: the board with both bowls, the marbles lifted over it. */
export const pushSubject = (aspect: number): TableSubject =>
  aspect < 1.25 ? { half: BOWL.x + BOWL.radius + 0.2, halfZ: 3.7, height: 0.9, lookY: 0, tilt: 1.06 } : { half: BOWL.x + BOWL.radius + 0.15, halfZ: 3.55, height: 0.9, lookY: 0, tilt: 1.0 };
/** The plane taps are read on: the plateau's height. */
export const PICK_Y = TOP;
/** How high over the plateau the direction arrows float, and how far out from the group. */
export const ARROW = { y: TOP + 0.52, length: 0.42, width: 0.36, reach: 0.95 };
/**
 * Where the arrow for `dir` stands round a group (its cells): beyond the leading marble for a direction along the
 * group's line (or any for a single marble), else beyond the middle of the group's side.
 */
export function arrowAt(group: number[], dir: number) {
  const d = DIR_XZ[dir];
  let x = 0,
    z = 0;
  for (const c of group) {
    const p = cellAt(c);
    x += p.x / group.length;
    z += p.z / group.length;
  }
  // How far the group reaches toward `dir` from its middle.
  let reach = 0;
  for (const c of group) {
    const p = cellAt(c);
    reach = Math.max(reach, (p.x - x) * d.x + (p.z - z) * d.z);
  }
  const far = reach + ARROW.reach * STEP;
  return { x: x + d.x * far, y: ARROW.y, z: z + d.z * far };
}
/** The cells a group moves into going `dir`. */
export function intoCells(group: number[], dir: number) {
  return group.map((c) => step(c, dir)).filter((c) => !group.includes(c));
}
