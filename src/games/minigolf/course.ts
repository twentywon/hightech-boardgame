/**
 * The nine holes of the seaside putting course, as plain numbers, free of Three.js and the page. Each hole has a
 * place of its own: `x` across it (to the right as one stands at its tee) and `z` toward the tee, in metres, so
 * that a hole is played away from the player, toward −z. The rules, the computer and the view all read the same
 * shapes from here; the view lays each hole at its own place in the garden (`layout.ts`).
 *
 * A hole is a green whose edge (`outline`) is walled all round by a rail, with things standing on it (`blocks`,
 * walled too: flower beds, rocks, the windmill's house), round bumpers (`posts`), loose rails (`rails`), ponds
 * (`water`, open at their edge: a ball rolls in) with narrow bridges over them (`bridges`), sand that slows the ball
 * (`sand`), and the lie of the ground (`features`: ramps, hills, an arched bridge).
 */
export interface P {
  x: number;
  z: number;
}
export type Poly = P[];
/** How the ground rises and falls; the height at a place is the sum of every feature's. */
export type Feature =
  /** From `a` to `b` the ground rises by `rise` (falls when negative), smoothly, across the whole width. */
  | { kind: "ramp"; a: P; b: P; rise: number }
  /** A round hill of radius `r` (a hollow when `h` is negative), highest in its middle. */
  | { kind: "hill"; x: number; z: number; r: number; h: number }
  /** A bridge arched along z between `z0` and `z1`, within `x0`–`x1`. */
  | { kind: "arch"; x0: number; x1: number; z0: number; z1: number; h: number };
/**
 * A windmill whose house stands across the green with a door (a short tunnel) in its middle: its sails turn in
 * front of the house, and while one of them is down it shuts the door. `z` is the house's front, `depth` how far it
 * reaches back, `door` the door's width. The sails turn once in `period` seconds.
 */
export interface Windmill {
  x: number;
  z: number;
  depth: number;
  width: number;
  door: number;
  period: number;
  blades: number;
}
/** A tunnel's roof over a corridor of the green (only the view draws it: the corridor's walls are blocks). */
export interface Tunnel {
  x: number;
  width: number;
  z0: number;
  z1: number;
}
export interface Hole {
  name: string;
  par: number;
  tee: P;
  cup: P;
  outline: Poly;
  blocks: Poly[];
  water: Poly[];
  bridges: Poly[];
  sand: Poly[];
  posts: { x: number; z: number; r: number }[];
  rails: [P, P][];
  features: Feature[];
  windmill: Windmill | null;
  tunnels: Tunnel[];
  /** The colour the hole's rails are painted. */
  paint: string;
}
const rect = (x0: number, z0: number, x1: number, z1: number): Poly => [
  { x: x0, z: z1 },
  { x: x1, z: z1 },
  { x: x1, z: z0 },
  { x: x0, z: z0 },
];
const pts = (...xz: number[]): Poly => {
  const out: Poly = [];
  for (let i = 0; i < xz.length; i += 2) out.push({ x: xz[i], z: xz[i + 1] });
  return out;
};
/** An oval of `n` corners. */
const oval = (x: number, z: number, rx: number, rz: number, n = 14): Poly =>
  Array.from({ length: n }, (_, k) => ({ x: x + rx * Math.cos((2 * Math.PI * k) / n), z: z + rz * Math.sin((2 * Math.PI * k) / n) }));
/** A small hollow round the cup, so that a ball just short of it runs in. */
const dish = (cup: P, r = 0.24, h = -0.008): Feature => ({ kind: "hill", x: cup.x, z: cup.z, r, h });
const base = { blocks: [], water: [], bridges: [], sand: [], posts: [], rails: [], features: [], windmill: null, tunnels: [] };

/** Hole 4's windmill: the door is the only way through its house. */
const MILL: Windmill = { x: 0, z: 0.3, depth: 0.5, width: 1.2, door: 0.3, period: 6, blades: 4 };
export const HOLES: Hole[] = [
  {
    ...base,
    name: "첫 퍼트",
    par: 2,
    tee: { x: 0, z: 2.3 },
    cup: { x: 0, z: -2.1 },
    outline: rect(-0.5, -2.8, 0.5, 2.8),
    features: [dish({ x: 0, z: -2.1 }, 0.3)],
    paint: "#e8453c",
  },
  {
    ...base,
    name: "작은 언덕",
    par: 2,
    tee: { x: 0, z: 2.7 },
    cup: { x: 0.18, z: -2.55 },
    outline: rect(-0.6, -3.2, 0.6, 3.2),
    features: [{ kind: "hill", x: 0, z: 0.1, r: 1.0, h: 0.17 }, dish({ x: 0.18, z: -2.55 })],
    paint: "#2f7de1",
  },
  {
    ...base,
    name: "꺾인 길",
    par: 3,
    tee: { x: 0, z: 2.5 },
    cup: { x: 2.75, z: -2.05 },
    // A dog-leg to the right; the far corner is cut off by a rail that turns a ball into the second leg.
    outline: pts(-0.5, 3.0, 0.5, 3.0, 0.5, -1.5, 3.3, -1.5, 3.3, -2.6, 0.1, -2.6, -0.5, -2.0),
    posts: [
      { x: 1.5, z: -2.22, r: 0.07 },
      { x: 2.15, z: -1.86, r: 0.07 },
    ],
    features: [dish({ x: 2.75, z: -2.05 })],
    paint: "#f2b21b",
  },
  {
    ...base,
    name: "풍차",
    par: 3,
    tee: { x: 0, z: 2.7 },
    cup: { x: 0.2, z: -2.6 },
    outline: rect(-0.6, -3.4, 0.6, 3.2),
    blocks: [rect(-0.6, MILL.z - MILL.depth, -MILL.door / 2, MILL.z), rect(MILL.door / 2, MILL.z - MILL.depth, 0.6, MILL.z)],
    features: [{ kind: "ramp", a: { x: 0, z: -0.35 }, b: { x: 0, z: -1.2 }, rise: -0.06 }, dish({ x: 0.2, z: -2.6 })],
    windmill: MILL,
    paint: "#8e4fd6",
  },
  {
    ...base,
    name: "모래밭",
    par: 3,
    tee: { x: 0, z: 2.9 },
    cup: { x: 0.05, z: -2.75 },
    outline: rect(-0.7, -3.4, 0.7, 3.4),
    sand: [pts(-0.7, 0.85, 0.1, 0.85, 0.3, 0.62, 0.3, 0.22, 0.1, 0.0, -0.7, 0.0), oval(-0.32, -2.05, 0.34, 0.24), oval(0.46, -2.85, 0.2, 0.18, 10)],
    posts: [{ x: 0.42, z: -1.0, r: 0.08 }],
    features: [dish({ x: 0.05, z: -2.75 })],
    paint: "#ff7a2f",
  },
  {
    ...base,
    name: "좁은 다리",
    par: 3,
    tee: { x: 0, z: 2.7 },
    cup: { x: 0, z: -2.6 },
    outline: rect(-0.7, -3.4, 0.7, 3.2),
    // The pond's banks run straight where the bridge meets them, so that its ends lie flush with the green.
    water: [pts(-0.7, 0.5, -0.45, 0.74, -0.25, 0.62, 0.25, 0.62, 0.45, 0.78, 0.7, 0.56, 0.7, -0.72, 0.45, -0.96, 0.25, -0.82, -0.25, -0.82, -0.45, -0.98, -0.7, -0.76)],
    bridges: [rect(-0.14, -0.9, 0.14, 0.7)],
    features: [{ kind: "arch", x0: -0.14, x1: 0.14, z0: -0.82, z1: 0.62, h: 0.06 }, dish({ x: 0, z: -2.6 })],
    paint: "#13a89e",
  },
  {
    ...base,
    name: "오르락내리락",
    par: 3,
    tee: { x: 0, z: 2.9 },
    cup: { x: -0.2, z: -2.8 },
    outline: rect(-0.6, -3.6, 0.6, 3.4),
    posts: [{ x: 0, z: 0.1, r: 0.08 }],
    features: [
      { kind: "ramp", a: { x: 0, z: 1.5 }, b: { x: 0, z: 0.7 }, rise: 0.2 },
      { kind: "ramp", a: { x: 0, z: -0.5 }, b: { x: 0, z: -1.5 }, rise: -0.26 },
      dish({ x: -0.2, z: -2.8 }),
    ],
    paint: "#e8453c",
  },
  {
    ...base,
    name: "갈림길",
    par: 3,
    tee: { x: -0.1, z: 2.4 },
    cup: { x: -0.38, z: -2.85 },
    outline: rect(-1.1, -3.5, 1.1, 3.0),
    // A flower bed parts the way: through the stone tunnel at the left, or round by the bumpers at the right.
    blocks: [pts(-0.62, 0.9, 0.3, 0.9, 0.42, 0.78, 0.42, -1.48, 0.3, -1.6, -0.62, -1.6), rect(-1.1, -1.6, -0.94, 0.9)],
    posts: [
      { x: 0.76, z: 0.05, r: 0.07 },
      { x: 0.76, z: -0.95, r: 0.07 },
    ],
    tunnels: [{ x: -0.78, width: 0.32, z0: -1.3, z1: 0.62 }],
    features: [dish({ x: -0.38, z: -2.85 })],
    paint: "#2f7de1",
  },
  {
    ...base,
    name: "등대 앞",
    par: 4,
    tee: { x: 0, z: 2.9 },
    cup: { x: -2.5, z: -2.45 },
    // A dog-leg to the left: a long rail cut across the far corner turns the ball into the second leg, which climbs
    // to a terrace with the cup.
    outline: pts(-0.6, 3.4, 0.6, 3.4, 0.6, -1.7, -0.1, -3.2, -3.0, -3.2, -3.0, -1.7, -0.6, -1.7),
    posts: [
      { x: -0.95, z: -2.75, r: 0.08 },
      { x: -1.05, z: -2.05, r: 0.06 },
    ],
    features: [
      { kind: "hill", x: 0, z: 0.8, r: 0.5, h: 0.06 },
      { kind: "ramp", a: { x: -1.3, z: 0 }, b: { x: -1.95, z: 0 }, rise: 0.16 },
      dish({ x: -2.5, z: -2.45 }),
    ],
    paint: "#f2b21b",
  },
];
export const PAR = HOLES.reduce((sum, hole) => sum + hole.par, 0);

/** Whether a point lies inside a polygon (by the crossings of a ray). */
export function inside(poly: Poly, x: number, z: number) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}
export interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export function boxOf(poly: Poly): Box {
  const box = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const p of poly) {
    box.x0 = Math.min(box.x0, p.x);
    box.x1 = Math.max(box.x1, p.x);
    box.z0 = Math.min(box.z0, p.z);
    box.z1 = Math.max(box.z1, p.z);
  }
  return box;
}
const within = (box: Box, x: number, z: number) => x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** The height of the ground at a place of a hole. */
export function heightAt(hole: Hole, x: number, z: number) {
  let h = 0;
  for (const f of hole.features) {
    if (f.kind === "ramp") {
      const dx = f.b.x - f.a.x,
        dz = f.b.z - f.a.z;
      h += f.rise * smooth(((x - f.a.x) * dx + (z - f.a.z) * dz) / (dx * dx + dz * dz));
    } else if (f.kind === "hill") {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r) h += (f.h * (1 + Math.cos((Math.PI * d) / f.r))) / 2;
    } else if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) h += f.h * Math.sin((Math.PI * (z - f.z0)) / (f.z1 - f.z0));
  }
  return h;
}
/** What lies at a place: the open green, sand, a bridge's boards, a pond, or nothing of the hole (outside or in a block). */
export type Ground = "green" | "sand" | "bridge" | "water" | "off";
const boxes = new WeakMap<Poly, Box>();
const boxed = (poly: Poly) => {
  let box = boxes.get(poly);
  if (!box) boxes.set(poly, (box = boxOf(poly)));
  return box;
};
const hits = (polys: Poly[], x: number, z: number) => polys.some((poly) => within(boxed(poly), x, z) && inside(poly, x, z));
export function groundAt(hole: Hole, x: number, z: number): Ground {
  if (!within(boxed(hole.outline), x, z) || !inside(hole.outline, x, z) || hits(hole.blocks, x, z)) return "off";
  if (hits(hole.water, x, z)) return hits(hole.bridges, x, z) ? "bridge" : "water";
  return hits(hole.sand, x, z) ? "sand" : "green";
}
/** Every wall of a hole as a segment: the rail round the green and round each block, and the loose rails. */
export function wallsOf(hole: Hole): [P, P][] {
  const out: [P, P][] = [];
  for (const poly of [hole.outline, ...hole.blocks]) poly.forEach((p, i) => out.push([p, poly[(i + 1) % poly.length]]));
  return [...out, ...hole.rails];
}
