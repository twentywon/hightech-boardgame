/**
 * Discs sliding on a table: friction, collisions between discs, and either
 * cushions with corner pockets or edges to fall off. Everything is stepped
 * in fixed slices, so the same shot always ends the same way; the rules and
 * the views run the very same code.
 */
export interface Disc {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  m: number;
  /** Still on the table. */
  on: boolean;
  /** Slices it still has to spend in the air, and how many the flight lasts: an airborne disc touches nothing. */
  air?: number;
  flight?: number;
}
export interface Arena {
  halfX: number;
  halfZ: number;
  /** Cushions that discs bounce off; without them a disc whose centre passes the edge is gone. */
  cushions: boolean;
  /** A pocket with `only` takes just those discs (a goal takes the ball, not the players). */
  pockets: { x: number; z: number; r: number; only?: number[] }[];
  /** Round things fixed to the table that discs bounce off (the hinges of a folding board). */
  posts?: { x: number; z: number; r: number }[];
  /** How fast a sliding disc slows, in units per second per second. */
  friction: number;
  /** How much speed a collision keeps (1 keeps all). */
  bounce: number;
}
/** How much of its speed a disc keeps when it comes down from a flight. */
export const LANDING = 0.3;
export const DT = 1 / 120,
  /** Below this speed a disc is at rest. */
  REST = 0.04,
  MAX_STEPS = 120 * 14;
/** Advances every disc by one slice. Returns the ids that left the table in it. */
export function step(discs: Disc[], arena: Arena, heard?: { hits: number }): number[] {
  const gone: number[] = [];
  for (const d of discs) {
    if (!d.on) continue;
    if (d.air) {
      // In the air nothing slows it; it comes down with most of its speed spent.
      d.x += d.vx * DT;
      d.z += d.vz * DT;
      if (--d.air === 0) {
        d.vx *= LANDING;
        d.vz *= LANDING;
        if (heard) heard.hits++;
      }
      continue;
    }
    const speed = Math.hypot(d.vx, d.vz);
    if (speed <= REST) {
      d.vx = d.vz = 0;
      continue;
    }
    const slowed = Math.max(0, speed - arena.friction * DT);
    d.vx *= slowed / speed;
    d.vz *= slowed / speed;
    d.x += d.vx * DT;
    d.z += d.vz * DT;
  }
  // Discs that overlap are pushed apart and exchange speed along the line between them.
  for (let i = 0; i < discs.length; i++) {
    const a = discs[i];
    if (!a.on || a.air) continue;
    for (let j = i + 1; j < discs.length; j++) {
      const b = discs[j];
      if (!b.on || b.air) continue;
      const dx = b.x - a.x,
        dz = b.z - a.z,
        reach = a.r + b.r,
        d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach || d2 === 0) continue;
      const dist = Math.sqrt(d2),
        nx = dx / dist,
        nz = dz / dist,
        overlap = reach - dist,
        total = a.m + b.m;
      a.x -= nx * overlap * (b.m / total);
      a.z -= nz * overlap * (b.m / total);
      b.x += nx * overlap * (a.m / total);
      b.z += nz * overlap * (a.m / total);
      const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (closing <= 0) continue;
      if (heard && closing > 0.6) heard.hits++;
      const impulse = ((1 + arena.bounce) * closing) / (1 / a.m + 1 / b.m);
      a.vx -= (impulse / a.m) * nx;
      a.vz -= (impulse / a.m) * nz;
      b.vx += (impulse / b.m) * nx;
      b.vz += (impulse / b.m) * nz;
    }
  }
  for (const d of discs) {
    if (!d.on || d.air) continue;
    for (const post of arena.posts ?? []) {
      const dx = d.x - post.x,
        dz = d.z - post.z,
        dist = Math.hypot(dx, dz),
        reach = d.r + post.r;
      if (dist >= reach || dist === 0) continue;
      const nx = dx / dist,
        nz = dz / dist,
        into = d.vx * nx + d.vz * nz;
      d.x = post.x + nx * reach;
      d.z = post.z + nz * reach;
      if (into < 0) {
        d.vx -= (1 + arena.bounce * 0.7) * into * nx;
        d.vz -= (1 + arena.bounce * 0.7) * into * nz;
        if (heard && into < -0.6) heard.hits++;
      }
    }
    if (arena.pockets.some((p) => (!p.only || p.only.includes(d.id)) && Math.hypot(d.x - p.x, d.z - p.z) < p.r)) {
      d.on = false;
      d.vx = d.vz = 0;
      gone.push(d.id);
      continue;
    }
    if (arena.cushions) {
      if (d.x < -arena.halfX + d.r) {
        d.x = -arena.halfX + d.r;
        d.vx = Math.abs(d.vx) * arena.bounce;
      } else if (d.x > arena.halfX - d.r) {
        d.x = arena.halfX - d.r;
        d.vx = -Math.abs(d.vx) * arena.bounce;
      }
      if (d.z < -arena.halfZ + d.r) {
        d.z = -arena.halfZ + d.r;
        d.vz = Math.abs(d.vz) * arena.bounce;
      } else if (d.z > arena.halfZ - d.r) {
        d.z = arena.halfZ - d.r;
        d.vz = -Math.abs(d.vz) * arena.bounce;
      }
    } else if (Math.abs(d.x) > arena.halfX || Math.abs(d.z) > arena.halfZ) {
      d.on = false;
      d.vx = d.vz = 0;
      gone.push(d.id);
    }
  }
  return gone;
}
export const moving = (discs: Disc[]) => discs.some((d) => d.on && (d.vx !== 0 || d.vz !== 0));
/** Runs until everything is at rest. Returns the ids that left the table, in order, and the slices it took. */
export function settle(discs: Disc[], arena: Arena) {
  const gone: number[] = [];
  let steps = 0;
  while (moving(discs) && steps < MAX_STEPS) {
    gone.push(...step(discs, arena));
    steps++;
  }
  for (const d of discs) {
    d.vx = d.vz = 0;
    delete d.air;
    delete d.flight;
  }
  return { gone, steps };
}
export const copy = (discs: Disc[]) => discs.map((d) => ({ ...d }));
/** Shots are told as whole degrees and one of twenty strengths. */
export const POWERS = 20,
  SHOT_BASE = 1000;
export const shotCode = (degrees: number, power: number) =>
  SHOT_BASE + ((((Math.round(degrees) % 360) + 360) % 360) * 32 + Math.max(1, Math.min(POWERS, Math.round(power))));
export function shotOf(code: number) {
  const value = code - SHOT_BASE,
    degrees = Math.floor(value / 32),
    power = value % 32;
  if (!Number.isInteger(code) || value < 0 || degrees >= 360 || power < 1 || power > POWERS) return null;
  return { degrees, power, angle: (degrees * Math.PI) / 180 };
}
/** Sets a disc off; 0° points along +x and 90° along +z (toward the near side). */
export function strike(disc: Disc, angle: number, speed: number) {
  disc.vx = Math.cos(angle) * speed;
  disc.vz = Math.sin(angle) * speed;
}
/** How fast a disc leaves the finger for a strength of 1–20. */
export const speedOf = (power: number) => 1.5 + power * 0.8;
/** Sends a disc into the air for a while: it flies on in a straight line over everything in its way. */
export function launch(disc: Disc, seconds: number) {
  disc.air = disc.flight = Math.round(seconds / DT);
}
/** How high an airborne disc is above the table, as a share of the top of its arc (0 on the table). */
export const lift = (disc: Disc) => (disc.air && disc.flight ? Math.sin(Math.PI * (1 - disc.air / disc.flight)) : 0);
