import { isLeaf, rods, type Kind, type Node, type Rod } from "./rules";

/**
 * Where things stand on the balance quiz's market table, free of Vite-only imports so that browser tests can aim.
 * The table top is at height 0; the big scale stands at the back of it, what goes on its pans lies in front.
 */
export const TABLE = { half: 8.5, depth: 5 };
/** The big scale (coins and weights): its foot, the height of its pivot, half its beam, its chains and pans. */
export const BIG = { x: 0, z: -1.7, height: 3.6, beam: 2.7, chain: 2.0, pan: 1.15 };
/** A small scale of the goods' stage, as a share of the big one. */
export const SMALL = 0.6;
export function subjectOf(kind: Kind) {
  if (kind === "mobile") return { half: 6.8, halfZ: 2.2, height: 10.2, lookY: 5.6, tilt: 0.3 };
  if (kind === "goods") return { half: 7.4, halfZ: 4.1, height: 2.6, lookY: 0.4, tilt: 0.92 };
  return { half: 7.6, halfZ: 4.0, height: 3.9, lookY: 0.8, tilt: 0.86 };
}
/** Where coin `i` of `n` lies on the table, off the scale. */
export function coinRest(i: number, n: number) {
  const perRow = n <= 9 ? n : n <= 12 ? 6 : 9,
    rows = Math.ceil(n / perRow),
    row = Math.floor(i / perRow),
    col = i % perRow,
    inRow = Math.min(perRow, n - row * perRow);
  return { x: (col - (inRow - 1) / 2) * 0.86, z: 1.7 + (row - (rows - 1) / 2) * 0.9 + (rows - 1) * 0.45 };
}
/** Where weight `i` of `n` stands in its tray. */
export const weightRest = (i: number, n: number) => ({ x: (i - (n - 1) / 2) * 1.35, z: 2.75 });
/** The `k`-th place on a pan, from its middle outward and then up (in units of the pan's radius). */
export function panPlace(k: number, ring: number) {
  const layer = Math.floor(k / 7),
    j = k % 7;
  return { x: j === 0 ? 0 : Math.cos((j * Math.PI) / 3) * ring, y: layer, z: j === 0 ? 0 : Math.sin((j * Math.PI) / 3) * ring };
}
/** Where the small scales of the goods' stage stand: one row of up to three, or a back row of three and a front row. */
export function smallAt(i: number, n: number) {
  const back = Math.min(3, n),
    row = i < back ? 0 : 1,
    inRow = row === 0 ? back : n - back,
    k = row === 0 ? i : i - back;
  return { x: (k - (inRow - 1) / 2) * 4.0, z: n <= 3 ? -1.5 : row === 0 ? -2.6 : 0.4 };
}
/** Where dial `i` of `n` lies in the goods' stage: the goods on a plate at its left, the number at its right, ▲ behind and ▼ in front. */
export function goodsDial(i: number, n: number) {
  const x = (i - (n - 1) / 2) * 3.2;
  return { good: { x: x - 0.75, z: 3.1 }, tile: { x: x + 0.45, z: 3.1 }, up: { x: x + 0.45, z: 2.45 }, down: { x: x + 0.45, z: 3.75 } };
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
