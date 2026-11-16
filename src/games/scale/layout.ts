import { isLeaf, rods, type Kind, type Node, type Rod } from "./rules";

/**
 * Where things stand on the balance quiz's market table, free of Vite-only imports so that browser tests can aim.
 * The table top is at height 0; the big scale stands at the back of it, what goes on its pans lies in front.
 */
export const TABLE = { half: 8.5, depth: 5 };
/** The big scale (coins and weights): its foot, the height of its pivot, half its beam, its chains and pans. */
export const BIG = { x: 0, z: -1.2, height: 3.6, beam: 2.7, chain: 2.0, pan: 1.15 };
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
/** Where dial `i` of `n` stands in the goods' stage: the goods on a plate at its left, the number upright at its right, ▲ above and ▼ below. */
export function goodsDial(i: number, n: number) {
  const x = (i - (n - 1) / 2) * 3.2,
    z = 3.3;
  return { good: { x: x - 0.75, y: 0, z }, tile: { x: x + 0.45, y: 0.72, z }, up: { x: x + 0.45, y: 1.2, z: z + 0.03 }, down: { x: x + 0.45, y: 0.24, z: z + 0.03 } };
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
/** Where the dial of a hidden leaf is: before its weight, ▲ above and ▼ below. */
export const mobileDial = (leaf: { x: number; y: number }) => ({ tile: { x: leaf.x, y: leaf.y, z: 0.62 }, up: { x: leaf.x, y: leaf.y + 0.62, z: 0.62 }, down: { x: leaf.x, y: leaf.y - 0.62, z: 0.62 } });
