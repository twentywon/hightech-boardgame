/**
 * The air hockey table, free of Three.js and the page: a puck gliding on air
 * between rails, two mallets each kept to its own half, and a goal slot at
 * each end. The view steps it in fixed slices and reports only the goals.
 * My goal is at the near end (+z), the computer's at the far end (-z).
 */
export const DT = 1 / 240;
/** The playing surface's half width and half length, the goal slot's half width, the puck's and a mallet's radius. */
export const HALF_X = 2.2,
  HALF_Z = 4.0,
  GOAL = 0.8,
  PUCK = 0.22,
  MALLET = 0.36;
/** The fastest the puck goes, and how fast my mallet follows the hand. */
export const MAX_PUCK = 13,
  HAND_SPEED = 18;
/** The computer by level: its mallet's top speed, how often it looks again, and how far its aim strays. */
export const LEVELS = {
  easy: { speed: 4.8, look: 0.32, stray: 0.55 },
  normal: { speed: 7.5, look: 0.18, stray: 0.28 },
  hard: { speed: 11, look: 0.07, stray: 0.1 },
};
export type Level = keyof typeof LEVELS;
export interface Body {
  x: number;
  z: number;
  vx: number;
  vz: number;
}
export interface World {
  puck: Body;
  mallets: [Body, Body];
  /** Where each mallet is being sent. */
  targets: [{ x: number; z: number }, { x: number; z: number }];
  /** The computer's next look, and the stray in its aim it has chosen. */
  look: number;
  stray: number;
  /** A knock on a mallet or a rail in the last slices, for the view's sound. */
  hit: number;
  wall: number;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** A new face-off: the puck lies still in the half of `server`, the mallets at home. */
export function createWorld(server: 0 | 1, offset = 0): World {
  return {
    puck: { x: offset, z: server === 0 ? 1.5 : -1.5, vx: 0, vz: 0 },
    mallets: [
      { x: 0, z: HALF_Z - 0.9, vx: 0, vz: 0 },
      { x: 0, z: -HALF_Z + 0.9, vx: 0, vz: 0 },
    ],
    targets: [
      { x: 0, z: HALF_Z - 0.9 },
      { x: 0, z: -HALF_Z + 0.9 },
    ],
    look: 0,
    stray: 0,
    hit: 0,
    wall: 0,
  };
}
/** Where a mallet of `side` may be: inside the rails and in its own half. */
export function keep(side: 0 | 1, x: number, z: number) {
  return {
    x: clamp(x, -HALF_X + MALLET, HALF_X - MALLET),
    z: side === 0 ? clamp(z, MALLET * 0.6, HALF_Z - MALLET) : clamp(z, -HALF_Z + MALLET, -MALLET * 0.6),
  };
}
/** My mallet sent toward a point of the table (the hand on it). */
export function aimAt(world: World, side: 0 | 1, x: number, z: number) {
  world.targets[side] = keep(side, x, z);
}
/** Where the puck crosses the line z = `at`, its bounces off the side rails followed; null if it is not heading there. */
function crossing(puck: Body, at: number) {
  if (Math.abs(puck.vz) < 0.2 || Math.sign(at - puck.z) !== Math.sign(puck.vz)) return null;
  const t = (at - puck.z) / puck.vz,
    width = HALF_X - PUCK;
  let x = puck.x + puck.vx * t;
  // Folded back between the rails as often as it bounces.
  const span = width * 2;
  x = ((((x + width) % (2 * span)) + 2 * span) % (2 * span)) - width;
  if (x > width) x = 2 * width - x;
  return x;
}
/**
 * The computer's hand: it guards its goal when the puck comes at it fast, strikes the puck toward my goal when it
 * is in its half and slow enough, and keeps between the puck and its goal otherwise. It looks again only every so
 * often, and aims a little astray, as its level says.
 */
export function think(world: World, level: Level, random: () => number = Math.random) {
  const { puck } = world,
    me = world.mallets[1],
    skill = LEVELS[level];
  world.look -= DT;
  if (world.look > 0) return;
  world.look = skill.look;
  world.stray = (random() - 0.5) * 2 * skill.stray;
  const home = { x: puck.x * 0.4, z: -HALF_Z + 0.9 },
    coming = puck.vz < -1.5;
  let target = home;
  if (coming) {
    // Meet it in front of the goal, where it will cross.
    const x = crossing(puck, -HALF_Z + 0.9);
    target = { x: (x ?? puck.x) + world.stray * 0.4, z: -HALF_Z + 0.9 };
    if (puck.z < -0.6 && Math.hypot(puck.vx, puck.vz) < 6) target = { x: puck.x, z: puck.z - 0.25 };
  } else if (puck.z < -0.2) {
    // Strike: from behind the puck, through it, toward my goal (with its stray).
    const goalX = world.stray * GOAL,
      dx = goalX - puck.x,
      dz = HALF_Z - puck.z,
      far = Math.hypot(dx, dz),
      behind = me.z < puck.z - 0.15;
    target = behind ? { x: puck.x + (dx / far) * 0.5, z: puck.z + (dz / far) * 0.5 } : { x: puck.x - (dx / far) * 0.8, z: puck.z - (dz / far) * 0.8 };
  }
  world.targets[1] = keep(1, target.x, target.z);
}
/** One slice of time. Returns who scored in it (0 when the puck went into the far goal, 1 into mine), or null. */
export function step(world: World, level: Level): 0 | 1 | null {
  const { puck } = world;
  world.mallets.forEach((m, side) => {
    const target = world.targets[side],
      dx = target.x - m.x,
      dz = target.z - m.z,
      far = Math.hypot(dx, dz),
      most = (side === 0 ? HAND_SPEED : LEVELS[level].speed) * DT,
      move = far > most ? most / far : 1,
      [ox, oz] = [m.x, m.z];
    const kept = keep(side as 0 | 1, m.x + dx * move, m.z + dz * move);
    m.x = kept.x;
    m.z = kept.z;
    m.vx = (m.x - ox) / DT;
    m.vz = (m.z - oz) / DT;
  });
  // The air under it slows it only a little.
  puck.vx *= 1 - 0.18 * DT;
  puck.vz *= 1 - 0.18 * DT;
  puck.x += puck.vx * DT;
  puck.z += puck.vz * DT;
  // The side rails.
  const side = HALF_X - PUCK;
  if (Math.abs(puck.x) > side) {
    puck.x = Math.sign(puck.x) * side;
    puck.vx = -puck.vx * 0.9;
    world.wall++;
  }
  // The end rails, but for the goal slots: a puck wholly past the end in a slot is a goal.
  const inSlot = Math.abs(puck.x) < GOAL - PUCK * 0.4;
  if (inSlot) {
    if (puck.z > HALF_Z + PUCK) return 1;
    if (puck.z < -HALF_Z - PUCK) return 0;
  } else if (Math.abs(puck.z) > HALF_Z - PUCK) {
    puck.z = Math.sign(puck.z) * (HALF_Z - PUCK);
    puck.vz = -puck.vz * 0.9;
    world.wall++;
  }
  // The mallets: the puck is pushed out and struck by the mallet's own speed (a mallet is too heavy to be moved).
  for (const m of world.mallets) {
    const dx = puck.x - m.x,
      dz = puck.z - m.z,
      far = Math.hypot(dx, dz),
      reach = PUCK + MALLET;
    if (far >= reach || far < 1e-9) continue;
    const nx = dx / far,
      nz = dz / far;
    puck.x = m.x + nx * reach;
    puck.z = m.z + nz * reach;
    const closing = (puck.vx - m.vx) * nx + (puck.vz - m.vz) * nz;
    if (closing < 0) {
      puck.vx -= 1.85 * closing * nx;
      puck.vz -= 1.85 * closing * nz;
      world.hit++;
    }
  }
  const speed = Math.hypot(puck.vx, puck.vz);
  if (speed > MAX_PUCK) {
    puck.vx *= MAX_PUCK / speed;
    puck.vz *= MAX_PUCK / speed;
  }
  return null;
}
