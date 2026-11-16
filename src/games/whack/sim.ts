import type { Random } from "../../core/random";

/**
 * The machine's insides, free of Three.js and the page: seven holes, moles
 * that come up, stay a moment and go down again, and the mallet's blows.
 * The view steps it in fixed slices and reports what happens as moves.
 */
export const DT = 1 / 60;
/** The holes, in table units, two, three and two in rows from the back; and the radius of a hole. */
export const HOLES: [number, number][] = [
  [-1.3, -2.05],
  [1.3, -2.05],
  [-2.6, 0],
  [0, 0],
  [2.6, 0],
  [-1.3, 2.05],
  [1.3, 2.05],
];
export const HOLE_R = 0.74;
/** The kinds of mole: plain, golden (worth more, quicker) and one in a hard hat (two blows). */
export const PLAIN = 0,
  GOLDEN = 1,
  HELMET = 2;
export const WORTH = [10, 30, 20];
/** How a mole moves: coming up, up, going down (by itself), knocked down (after a blow). */
export type Phase = "rise" | "up" | "sink" | "bonked";
export interface Mole {
  kind: number;
  phase: Phase;
  /** Seconds in this phase, and how long it stays up. */
  t: number;
  stay: number;
  /** How far out of the hole, 0 to 1. */
  height: number;
  /** Blows still needed (a hard hat takes two). */
  hits: number;
}
export interface World {
  moles: (Mole | null)[];
  /** Seconds to the next mole, seconds into the round, the time to the next whole second, and the hits in a row. */
  wait: number;
  time: number;
  tick: number;
  combo: number;
  level: number;
  random: Random;
}
export type Happening =
  | { kind: "second" }
  | { kind: "hit"; hole: number; mole: number; points: number; combo: number }
  | { kind: "clink"; hole: number }
  | { kind: "miss"; hole: number }
  | { kind: "escape"; hole: number };
/** The pace of each level: how long a mole stays up at first and at the end of a round, and the time between moles. */
export const PACE = [
  { stay: [1.5, 0.95], gap: [0.95, 0.55], double: 0.05 },
  { stay: [1.15, 0.7], gap: [0.75, 0.4], double: 0.15 },
  { stay: [0.85, 0.5], gap: [0.55, 0.28], double: 0.3 },
];
const RISE = 0.14,
  SINK = 0.16,
  BONK = 0.42;
export function createWorld(level: number, random: Random): World {
  return { moles: HOLES.map(() => null), wait: 0.6, time: 0, tick: 1, combo: 0, level: Math.max(1, Math.min(PACE.length, level)), random };
}
/** A share of the way through a round of `length` seconds, for the pace to quicken by. */
const blend = ([from, to]: number[], share: number) => from + (to - from) * Math.min(1, share);
/** Puts a mole up in a free hole. */
function spawn(world: World, length: number) {
  const free = world.moles.flatMap((m, i) => (m ? [] : [i]));
  if (!free.length) return;
  const hole = free[Math.floor(world.random() * free.length) % free.length],
    roll = world.random(),
    kind = roll < 0.1 ? GOLDEN : roll < 0.24 ? HELMET : PLAIN,
    pace = PACE[world.level - 1],
    stay = blend(pace.stay, world.time / length) * (kind === GOLDEN ? 0.7 : kind === HELMET ? 1.35 : 1);
  world.moles[hole] = { kind, phase: "rise", t: 0, stay, height: 0, hits: kind === HELMET ? 2 : 1 };
}
/** One slice of time: moles move, new ones come up, whole seconds are told. */
export function step(world: World, length: number): Happening[] {
  const out: Happening[] = [];
  world.time += DT;
  world.tick -= DT;
  if (world.tick <= 0) {
    world.tick += 1;
    out.push({ kind: "second" });
  }
  world.moles.forEach((mole, hole) => {
    if (!mole) return;
    mole.t += DT;
    if (mole.phase === "rise") {
      mole.height = Math.min(1, mole.t / RISE);
      if (mole.t >= RISE) [mole.phase, mole.t] = ["up", 0];
    } else if (mole.phase === "up") {
      mole.height = 1;
      if (mole.t >= mole.stay) [mole.phase, mole.t] = ["sink", 0];
    } else if (mole.phase === "sink") {
      mole.height = Math.max(0, 1 - mole.t / SINK);
      if (mole.t >= SINK) {
        world.moles[hole] = null;
        // Got away: the run of hits is broken.
        world.combo = 0;
        out.push({ kind: "escape", hole });
      }
    } else {
      // Knocked: it stays dazed a moment, then drops back.
      mole.height = mole.t < BONK * 0.6 ? 0.72 : Math.max(0, 0.72 * (1 - (mole.t - BONK * 0.6) / (BONK * 0.4)));
      if (mole.t >= BONK) world.moles[hole] = null;
    }
  });
  world.wait -= DT;
  if (world.wait <= 0) {
    const pace = PACE[world.level - 1];
    world.wait = blend(pace.gap, world.time / length) * (0.75 + world.random() * 0.5);
    spawn(world, length);
    // Now and then two come up at once.
    if (world.random() < pace.double) spawn(world, length);
  }
  return out;
}
/** The mallet comes down on a hole: a mole that is out is hit; an empty hole (or one going down too far) is a miss. */
export function whack(world: World, hole: number): Happening {
  const mole = world.moles[hole];
  if (!mole || mole.phase === "bonked" || mole.height < 0.35) {
    world.combo = 0;
    return { kind: "miss", hole };
  }
  mole.hits--;
  if (mole.hits > 0) {
    // The hard hat flies off; the mole stays up a little longer, bare-headed.
    mole.phase = "up";
    mole.t = Math.max(0, mole.stay - 0.55);
    return { kind: "clink", hole };
  }
  world.combo++;
  const points = WORTH[mole.kind] + Math.min(10, Math.max(0, world.combo - 2) * 2);
  mole.phase = "bonked";
  mole.t = 0;
  return { kind: "hit", hole, mole: mole.kind, points, combo: world.combo };
}
/** The hole nearest a point of the table, if the point is on it. */
export function holeAt(x: number, z: number) {
  let best = -1,
    near = HOLE_R * 1.35;
  HOLES.forEach(([hx, hz], i) => {
    const far = Math.hypot(x - hx, z - hz);
    if (far < near) {
      near = far;
      best = i;
    }
  });
  return best;
}
