import { isLeaf, rods, type Kind, type Node, type Rod } from "./rules";

/**
 * Where things stand on the balance quiz's market table, free of Vite-only imports so that browser tests can aim.
 * The table top is at height 0; the big scale stands at the back of it, what goes on its pans lies in front.
 */
export const TABLE = { half: 8.5, depth: 5 };
/** The big scale (coins and weights): its foot, the height of its pivot, half its beam, its chains and pans. */
export const BIG = { x: 0, z: -1.2, height: 3.6, beam: 2.7, chain: 2.0, pan: 1.15 };
/** Where the big scale's pans are while its beam is level (the foot of each pan), for browser tests to aim at. */
export const panRest = (side: number) => ({ x: BIG.x + (side === 0 ? -1 : 1) * BIG.beam, y: BIG.height - BIG.chain, z: BIG.z });
/**
 * Which pan (1 left, 2 right) a place `at` on the carrying plane is over as seen from `eye`, or 0: the line of sight is
 * followed back to the scale's own plane, and a pan takes everything round it from a little below up to its beam.
 */
export function panUnder(eye: { x: number; y: number; z: number }, at: { x: number; y: number; z: number }, pans: { x: number; y: number }[]) {
  const dz = at.z - eye.z;
  if (Math.abs(dz) < 1e-6) return 0;
  const t = (BIG.z - eye.z) / dz,
    x = eye.x + (at.x - eye.x) * t,
    y = eye.y + (at.y - eye.y) * t;
  const side = pans.findIndex((pan) => Math.abs(x - pan.x) <= BIG.pan * 1.4 && y >= pan.y - 0.8 && y <= pan.y + BIG.chain + 0.2);
  return side + 1;
}
/** A small scale of the goods' stage, as a share of the big one. */
export const SMALL = 0.6;
/**
 * What the camera keeps in view. The scales are seen from the side, nearly level with them (the user asked), so that
 * a beam's lean shows plainly; the mobile is seen from the front.
 */
export function subjectOf(kind: Kind) {
  if (kind === "mobile") return { half: 6.8, halfZ: 2.2, height: 10.2, lookY: 5.6, tilt: 0.3 };
  if (kind === "goods") return { half: 6.8, halfZ: 3.2, height: 4.2, lookY: 1.5, tilt: 0.24 };
  return { half: 5.9, halfZ: 2.8, height: 4.1, lookY: 1.6, tilt: 0.24 };
}
/** The coins wait upright in a stepped rack at the front, faces to the eye; each row a step higher and further back. */
export const RACK = { z: 2.6, step: 0.5, depth: 0.62, gap: 0.78, radius: 0.33 };
/** The upright plane a dragged coin or weight is carried on, as if held up in the hand: before the rack, so nothing hides it. */
export const CARRY_Z = RACK.z + 0.8;
/** How many coins a row of the rack takes. */
export const rackRow = (n: number) => (n <= 9 ? n : n <= 12 ? 6 : 9);
/** Where coin `i` of `n` stands in the rack (its middle). */
export function coinRest(i: number, n: number) {
  const perRow = rackRow(n),
    row = Math.floor(i / perRow),
    col = i % perRow,
    inRow = Math.min(perRow, n - row * perRow);
  return { x: (col - (inRow - 1) / 2) * RACK.gap, y: RACK.radius + 0.1 + row * RACK.step, z: RACK.z - row * RACK.depth };
}
/** Where weight `i` of `n` stands in its tray (its foot). */
export const weightRest = (i: number, n: number) => ({ x: (i - (n - 1) / 2) * 1.35, y: 0.16, z: 2.6 });
/** The `k`-th of `total` things on a pan, in rows across it, each row a little further back and higher, `perRow` to a row. */
export function panRow(k: number, total: number, perRow: number, gap: number) {
  const rows = Math.ceil(total / perRow),
    row = Math.floor(k / perRow),
    inRow = Math.min(perRow, total - row * perRow),
    j = k % perRow;
  return { x: (j - (inRow - 1) / 2) * gap, y: row * 0.16, z: (rows - 1) * 0.17 - row * 0.34 };
}
/** Where the small scales of the goods' stage stand: one row on the table, or three on a raised shelf behind and the rest before it. */
export const SHELF = { height: 1.6, z: -2.7, width: 12 };
export function smallAt(i: number, n: number) {
  if (n <= 3) return { x: (i - (n - 1) / 2) * 4.3, y: 0, z: -0.9 };
  if (i < 3) return { x: (i - 1) * 4.2, y: SHELF.height, z: SHELF.z };
  const inRow = n - 3,
    k = i - 3;
  return { x: (k - (inRow - 1) / 2) * 4.2, y: 0, z: 0.2 };
}
/**
 * A dial's buttons stand beside its number like a lift's call buttons (the user asked): a brass plate `PANEL.gap` to
 * the right of the number's middle, ▲ `PANEL.step` above its middle and ▼ as far below, `PANEL.out` before it.
 */
export const PANEL = { gap: 0.72, step: 0.19, out: 0.06, radius: 0.14 };
/** Where dial `i` of `n` stands in the goods' stage: the goods on a plate at its left, the number upright, and its buttons beside it. */
export function goodsDial(i: number, n: number) {
  const x = (i - (n - 1) / 2) * 3.2,
    z = 3.3,
    tile = { x: x + 0.2, y: 0.62, z },
    panel = { x: tile.x + PANEL.gap, y: tile.y, z };
  return { good: { x: x - 0.8, y: 0, z }, tile, panel, up: { x: panel.x, y: panel.y + PANEL.step, z: z + PANEL.out }, down: { x: panel.x, y: panel.y - PANEL.step, z: z + PANEL.out } };
}
/** The mobile: the step of an arm, the height of the top pivot, the threads to a rod and to a weight. */
export const MOBILE = { unit: 1.0, top: 9.0, beam: 10.4, rodThread: 1.5, leafThread: 0.95 };
export interface Hang {
  /** Where each rod's pivot is and its turn; where each leaf hangs from and where its weight's middle is. */
  rods: { x: number; y: number; angle: number; from: { x: number; y: number } }[];
  leaves: { x: number; y: number; from: { x: number; y: number } }[];
}
/** Lays the mobile out with its rods turned by `angles` (top first, in the order of `rods`), its threads hanging straight down. */
export function hang(root: Rod, angles: number[], leafCount: number): Hang {
  const order = rods(root),
    out: Hang = { rods: [], leaves: new Array(leafCount) },
    { unit, rodThread, leafThread } = MOBILE;
  const walk = (node: Node, x: number, y: number) => {
    if (isLeaf(node)) {
      out.leaves[node.leaf] = { x, y: y - leafThread - 0.45, from: { x, y } };
      return;
    }
    const index = order.indexOf(node),
      angle = angles[index] ?? 0,
      pivot = { x, y: y - rodThread },
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    out.rods[index] = { ...pivot, angle, from: { x, y } };
    walk(node.left, pivot.x - node.a * unit * cos, pivot.y - node.a * unit * sin);
    walk(node.right, pivot.x + node.b * unit * cos, pivot.y + node.b * unit * sin);
  };
  walk(root, 0, MOBILE.top + rodThread);
  return out;
}
/** The dial of a hidden leaf, relative to the leaf: the number before its sack, a little to the left, and its buttons at the right. */
export const LEAF_DIAL = { tile: -0.22, z: 0.62 };
/** Where the dial of a hidden leaf is (leaves at one height hang at least two steps apart, so the buttons clear the next one). */
export function mobileDial(leaf: { x: number; y: number }) {
  const tile = { x: leaf.x + LEAF_DIAL.tile, y: leaf.y, z: LEAF_DIAL.z },
    panel = { x: tile.x + PANEL.gap, y: tile.y, z: LEAF_DIAL.z };
  return { tile, panel, up: { x: panel.x, y: panel.y + PANEL.step, z: panel.z + PANEL.out }, down: { x: panel.x, y: panel.y - PANEL.step, z: panel.z + PANEL.out } };
}
