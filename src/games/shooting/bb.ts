import { between, draw, sub, type Clocked } from "./common";
import { RIGS, shotDirection, shotError, type Aim, type Offset, type Vec } from "./layout";

/**
 * The BB-gun booth of an arcade, played in real time (free of Three.js and the DOM): three bays of round targets in
 * two rows; targets light up blue (now and then yellow) one at a time, in pairs or along a row in turn, and go dark
 * again after a while. A pellet that strikes a lit target scores (twice as much in its bull) and the target spins
 * round and goes dark; hitting the next lit target within `COMBO` seconds builds a combo that multiplies the points.
 * Dark targets and the bays' walls score nothing. The gun holds `MAG` pellets and reloads by itself; the round ends
 * when the last pellet of the tier has landed.
 */
export interface Tier {
  name: string;
  pellets: number;
  /** How many targets may be lit at once, how long one stays lit (s), the pause before the next lights (s). */
  most: number;
  stay: number;
  gap: number;
  /** The share of targets lit yellow, and of choices that light a row in turn. */
  yellow: number;
  runs: number;
}
export const TIERS: Tier[] = [
  { name: "동", pellets: 40, most: 1, stay: 2.8, gap: 0.45, yellow: 0.12, runs: 0 },
  { name: "은", pellets: 60, most: 2, stay: 2.1, gap: 0.35, yellow: 0.18, runs: 0.25 },
  { name: "금", pellets: 90, most: 3, stay: 1.55, gap: 0.25, yellow: 0.24, runs: 0.35 },
];
export const tierOf = (tier: number) => TIERS[Math.max(0, Math.min(TIERS.length - 1, Math.round(tier) || 0))];
/** The combo window (s), the highest multiplier, the magazine and its reload (s), the pellet's speed (m/s). */
export const COMBO = 2,
  MOST_COMBO = 5,
  MAG = 10,
  RELOAD = 1.1,
  BB_SPEED = 15;
/** A target's face and bull (radius, m), and the points of a blue and a yellow target (the bull doubles them). */
export const FACE_R = 0.07,
  BULL_R = 0.025,
  BLUE = 10,
  YELLOW = 30;
/** The bays' middles across, the rows (height and depth) and the targets' places across a bay. */
export const BAYS = [-1.05, 0, 1.05],
  ROWS = [
    { y: 1.52, z: -4.05 },
    { y: 1.0, z: -3.75 },
  ],
  ACROSS = [-0.27, 0, 0.27],
  /** The bays' back wall, where a pellet that strikes nothing ends. */
  BACK_Z = -4.35;
export interface BBTarget {
  x: number;
  y: number;
  z: number;
  bay: number;
  row: number;
  /** 0 dark, 1 lit blue, 2 lit yellow; until when it stays lit, when it may light again, when it was last struck. */
  lit: 0 | 1 | 2;
  until: number;
  cool: number;
  struck: number;
}
export interface Pellet {
  from: Vec;
  to: Vec;
  born: number;
  arrive: number;
  /** The target it strikes (-1: the bay's wall), and whether in its bull. */
  target: number;
  bull: boolean;
}
export interface BBWorld extends Clocked {
  kind: "bb";
  tier: number;
  targets: BBTarget[];
  /** Targets queued to light in turn: when, which, which colour. */
  queue: { at: number; target: number; lit: 1 | 2 }[];
  pellets: Pellet[];
  ammo: number;
  mag: number;
  reloadUntil: number;
  next: number;
  combo: number;
  lastHit: number;
  doneAt: number;
  done: boolean;
}
export type BBHappening =
  | { kind: "shot"; pellet: Pellet }
  | { kind: "click" }
  | { kind: "reload" }
  | { kind: "loaded" }
  | { kind: "hit"; target: number; points: number; combo: number; bull: boolean; lit: 1 | 2 }
  | { kind: "tick"; target: number; at: Vec }
  | { kind: "done" };
/** Every target of the booth, in bays from the left, the upper row first. */
export function bbTargets(): BBTarget[] {
  const out: BBTarget[] = [];
  BAYS.forEach((bx, bay) =>
    ROWS.forEach((row, r) => ACROSS.forEach((ax) => out.push({ x: bx + ax, y: row.y, z: row.z, bay, row: r, lit: 0, until: 0, cool: 0, struck: -9 }))),
  );
  return out;
}
export function createBB(tier: number, seed: number): BBWorld {
  const t = tierOf(tier);
  return { kind: "bb", t: 0, seed, tier: TIERS.indexOf(t), targets: bbTargets(), queue: [], pellets: [], ammo: t.pellets, mag: Math.min(MAG, t.pellets), reloadUntil: 0, next: 0.9, combo: 0, lastHit: -99, doneAt: 0, done: false };
}
/** The combo standing now (0 once its window has gone by). */
export const comboNow = (world: BBWorld) => (world.t - world.lastHit <= COMBO ? world.combo : 0);
/** What a pellet striking a target lit `lit` scores, in its bull or not, at combo `combo`. */
export const pointsFor = (lit: 1 | 2, bull: boolean, combo: number) => (lit === 2 ? YELLOW : BLUE) * (bull ? 2 : 1) * Math.min(MOST_COMBO, Math.max(1, combo));
/** Where a ray first strikes a target's face, or the back wall. */
export function strike(world: BBWorld, from: Vec, d: Vec): { target: number; bull: boolean; at: Vec } {
  let best = -1,
    bull = false,
    nearest = Infinity;
  world.targets.forEach((target, i) => {
    if (d.z >= 0) return;
    const s = (target.z - from.z) / d.z,
      x = from.x + d.x * s - target.x,
      y = from.y + d.y * s - target.y,
      r = Math.hypot(x, y);
    if (s > 0 && r <= FACE_R && s < nearest) {
      nearest = s;
      best = i;
      bull = r <= BULL_R;
    }
  });
  const s = best >= 0 ? nearest : d.z < 0 ? (BACK_Z - from.z) / d.z : 6;
  return { target: best, bull, at: { x: from.x + d.x * s, y: from.y + d.y * s, z: from.z + d.z * s } };
}
/** The trigger pulled with the gun along `aim` and the rear sight off by `offset`. */
export function fireBB(world: BBWorld, aim: Aim, offset: Offset): BBHappening[] {
  if (world.done || world.ammo <= 0 || world.mag <= 0 || world.t < world.reloadUntil) return [{ kind: "click" }];
  const from = RIGS.bb.pivot,
    d = shotDirection(aim, shotError("bb", offset)),
    hit = strike(world, from, d),
    way = sub(hit.at, from),
    pellet: Pellet = { from: { ...from }, to: hit.at, born: world.t, arrive: world.t + Math.hypot(way.x, way.y, way.z) / BB_SPEED, target: hit.target, bull: hit.bull };
  world.ammo--;
  world.mag--;
  world.pellets.push(pellet);
  const out: BBHappening[] = [{ kind: "shot", pellet }];
  if (world.mag <= 0 && world.ammo > 0) {
    world.reloadUntil = world.t + RELOAD;
    out.push({ kind: "reload" });
  }
  return out;
}
/** Lights `count` dark targets (or a row in turn). */
function light(world: BBWorld, tier: Tier) {
  const free = world.targets.map((t, i) => i).filter((i) => world.targets[i].lit === 0 && world.targets[i].cool <= world.t && !world.queue.some((q) => q.target === i)),
    lit = world.targets.filter((t) => t.lit).length + world.queue.length;
  if (!free.length || lit >= tier.most) return;
  const colour = (): 1 | 2 => (draw(world) < tier.yellow ? 2 : 1);
  if (tier.runs && draw(world) < tier.runs && lit === 0) {
    // A row of a bay lit one after another, from one end, and the next only once the last has had its time.
    const bay = Math.floor(draw(world) * BAYS.length),
      row = Math.floor(draw(world) * ROWS.length),
      backward = draw(world) < 0.5,
      cells = world.targets.map((t, i) => i).filter((i) => world.targets[i].bay === bay && world.targets[i].row === row);
    (backward ? cells.reverse() : cells).forEach((target, k) => world.queue.push({ at: world.t + k * 0.45, target, lit: colour() }));
    world.next = world.t + tier.stay + 0.9 + between(world, 0, tier.gap);
    return;
  }
  const many = Math.min(tier.most - lit, free.length, 1 + (draw(world) < 0.35 ? Math.floor(draw(world) * tier.most) : 0));
  for (let k = 0; k < many; k++) {
    const at = Math.floor(draw(world) * free.length),
      target = free.splice(at, 1)[0];
    world.queue.push({ at: world.t, target, lit: colour() });
  }
  world.next = world.t + tier.gap + between(world, 0, tier.gap * 1.5);
}
/** One slice of the booth's time. */
export function stepBB(world: BBWorld, dt: number): BBHappening[] {
  const out: BBHappening[] = [],
    tier = tierOf(world.tier);
  world.t += dt;
  // Pellets that have come to their end.
  world.pellets = world.pellets.filter((pellet) => {
    if (pellet.arrive > world.t) return true;
    const target = world.targets[pellet.target];
    if (target && target.lit) {
      world.combo = world.t - world.lastHit <= COMBO ? world.combo + 1 : 1;
      world.lastHit = world.t;
      const points = pointsFor(target.lit, pellet.bull, world.combo);
      out.push({ kind: "hit", target: pellet.target, points, combo: world.combo, bull: pellet.bull, lit: target.lit });
      target.lit = 0;
      target.struck = world.t;
      target.cool = world.t + 0.9;
    } else {
      out.push({ kind: "tick", target: pellet.target, at: pellet.to });
    }
    return false;
  });
  if (world.reloadUntil && world.t >= world.reloadUntil) {
    world.reloadUntil = 0;
    world.mag = Math.min(MAG, world.ammo);
    out.push({ kind: "loaded" });
  }
  if (world.done) return out;
  // Lit targets whose time is up go dark; those queued light up.
  for (const target of world.targets)
    if (target.lit && target.until <= world.t) {
      target.lit = 0;
      target.cool = world.t + 0.3;
    }
  world.queue = world.queue.filter((q) => {
    if (q.at > world.t) return true;
    const target = world.targets[q.target];
    target.lit = q.lit;
    target.until = world.t + tier.stay * (0.85 + 0.3 * draw(world));
    return false;
  });
  if (world.ammo > 0 && world.t >= world.next) light(world, tier);
  // The last pellet landed: the round is over a moment later.
  if (world.ammo <= 0 && !world.pellets.length) {
    if (!world.doneAt) world.doneAt = world.t + 0.8;
    else if (world.t >= world.doneAt) {
      world.done = true;
      for (const target of world.targets) target.lit = 0;
      world.queue = [];
      out.push({ kind: "done" });
    }
  }
  return out;
}
