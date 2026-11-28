import type { Vec } from "./layout";

/** What every place's world keeps: its clock (s) and the state of its own random draws (a mulberry32, so it replays). */
export interface Clocked {
  t: number;
  seed: number;
}
/** The next draw in [0, 1) of a world's own generator. */
export function draw(world: Clocked) {
  world.seed = (world.seed + 0x6d2b79f5) | 0;
  let r = world.seed;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}
/** A draw between `a` and `b`. */
export const between = (world: Clocked, a: number, b: number) => a + (b - a) * draw(world);
/** A whole seed from a draw in [0, 1). */
export const seedOf = (x: number) => Math.floor(x * 4294967296) | 0;
export const v3 = (x: number, y: number, z: number): Vec => ({ x, y, z });
export const add = (a: Vec, b: Vec, k = 1): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
export const length = (a: Vec) => Math.hypot(a.x, a.y, a.z);
/**
 * Where a ray from `from` along the unit `d` first meets a sphere about `c` of radius `r`: the distance along the
 * ray, or null when it passes by (or the sphere is behind).
 */
export function raySphere(from: Vec, d: Vec, c: Vec, r: number): number | null {
  const o = sub(from, c),
    b = dot(o, d),
    q = dot(o, o) - r * r,
    disc = b * b - q;
  if (disc < 0) return null;
  const s = Math.sqrt(disc),
    t = -b - s;
  if (t > 0) return t;
  return -b + s > 0 ? 0 : null;
}
/** How far a ray from `from` along the unit `d` passes from the point `c` (its distance along the ray and across). */
export function passing(from: Vec, d: Vec, c: Vec) {
  const o = sub(c, from),
    along = dot(o, d);
  return { along, across: Math.sqrt(Math.max(0, dot(o, o) - along * along)) };
}
