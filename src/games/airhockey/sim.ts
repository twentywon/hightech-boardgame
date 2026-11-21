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
/** The fastest the puck goes. My mallet has no speed limit: it goes wherever the hand is (the user asked). */
export const MAX_PUCK = 15;
/** The longest step a mallet takes between two looks for the puck, so that a quick hand cannot pass through it. */
const REACH_STEP = 0.06;
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
  /** The half the puck is in (0 mine, z ≥ 0; 1 the far one) and how long it has been there without crossing. */
  half: 0 | 1;
  held: number;
  /** The side a puck kept too long in the other half was given to (`HOLD`), until the view has told it. */
  served: 0 | 1 | null;
  /** The computer working a slow puck out of a corner or off its end rail: 0 not, 1 standing off, 2 striking; how long in that phase. */
  escape: 0 | 1 | 2;
  escapeT: number;
  /** The computer's strikes when it began striking out a pinned puck: one more, and it backs off. */
  escapeAt: number;
  /** Times each mallet has struck the puck (never cleared: the computer counts its own strikes by it). */
  strikes: [number, number];
}
/**
 * The longest a puck may stay in one half (as in real air hockey, where a player has about seven seconds to shoot it
 * across): after that it is given to the other side, laid still in their half, so that a game can never stall.
 */
export const HOLD = 7;
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
    half: server,
    held: 0,
    served: null,
    escape: 0,
    escapeT: 0,
    escapeAt: 0,
    strikes: [0, 0],
  };
}
/** The puck laid still in the half of `side` (a face-off), clear of that side's mallet; both mallets stay where they are. */
export function serve(world: World, side: 0 | 1, offset = 0) {
  const { puck } = world,
    m = world.mallets[side],
    z = side === 0 ? 1.5 : -1.5,
    reach = PUCK + MALLET + 0.05;
  let x = offset;
  // A mallet standing on the spot: the puck is laid beside it, toward the wider side.
  if (Math.hypot(x - m.x, z - m.z) < reach) x = m.x > 0 ? m.x - reach : m.x + reach;
  Object.assign(puck, { x: clamp(x, -HALF_X + PUCK, HALF_X - PUCK), z, vx: 0, vz: 0 });
  world.half = side;
  world.held = 0;
  world.escape = 0;
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
/** How near its end rail a puck lies too close for the computer's mallet to stand behind it, and how slow is slow. */
const CRAMPED = -HALF_Z + PUCK + MALLET + 0.3,
  SLOW = 2.5;
/**
 * Where the computer stands off a slow puck that it cannot get behind (in a corner, against its end rail, before its
 * own goal), on the open side, and the way it strikes it from there. Before the goal slot the puck is struck out
 * sideways, away from the slot, so that it cannot be pushed in; elsewhere from the inner side and a little in front,
 * so that it goes into the end rail at a slant and comes back out toward the middle of the table, clear of the mallet.
 */
function standOff(puck: Body) {
  const s = puck.x >= 0 ? 1 : -1,
    beforeSlot = Math.abs(puck.x) < GOAL + 0.3,
    [ux, uz] = beforeSlot ? [-s, 0.35] : [-s * 0.6, 1],
    far = Math.hypot(ux, uz);
  return { ux: ux / far, uz: uz / far };
}
/**
 * The computer's hand: it guards its goal when the puck comes at it fast, strikes the puck toward my goal when it
 * is in its half and slow enough, and keeps between the puck and its goal otherwise. It looks again only every so
 * often, and aims a little astray, as its level says. A slow puck it cannot get behind (a corner, its end rail) is
 * never pressed into the rail: it stands off on the open side, strikes it out, backs off at once and comes again.
 */
export function think(world: World, level: Level, random: () => number = Math.random) {
  const { puck } = world,
    me = world.mallets[1],
    skill = LEVELS[level],
    speed = Math.hypot(puck.vx, puck.vz),
    reach = PUCK + MALLET,
    // Slow, or rattling against the mallet that holds it there.
    pinned = puck.z < CRAMPED && (speed < SLOW || Math.hypot(me.x - puck.x, me.z - puck.z) < reach + 0.05);
  // Working a pinned puck out is a reflex, followed every slice once begun.
  if (world.escape) {
    if (!pinned) world.escape = 0;
    else {
      world.escapeT += DT;
      // Where the puck will be in a moment (it may be drifting along the rail).
      const ahead = { x: puck.x + puck.vx * 0.2, z: puck.z + puck.vz * 0.2, vx: 0, vz: 0 },
        { ux, uz } = standOff(ahead),
        off = keep(1, ahead.x + ux * (reach + 0.35), ahead.z + uz * (reach + 0.35));
      if (world.escape === 1 && (Math.hypot(me.x - off.x, me.z - off.z) < 0.15 || world.escapeT > 1.2)) {
        // Set: strike through the puck, from the open side.
        world.escape = 2;
        world.escapeT = 0;
        world.escapeAt = world.strikes[1];
      } else if (world.escape === 2 && (world.strikes[1] !== world.escapeAt || world.escapeT > 1)) {
        // Struck (or it would not come): back off at once, never to rest against it.
        world.escape = 1;
        world.escapeT = 0;
      }
      world.targets[1] = world.escape === 2 ? keep(1, ahead.x - ux * 0.3, ahead.z - uz * 0.3) : off;
      return;
    }
  }
  world.look -= DT;
  if (world.look > 0) return;
  world.look = skill.look;
  world.stray = (random() - 0.5) * 2 * skill.stray;
  if (pinned) {
    world.escape = 1;
    world.escapeT = 0;
    const { ux, uz } = standOff(puck);
    world.targets[1] = keep(1, puck.x + ux * (reach + 0.35), puck.z + uz * (reach + 0.35));
    return;
  }
  const home = { x: puck.x * 0.4, z: -HALF_Z + 0.9 },
    coming = puck.vz < -1.5;
  let target = home;
  if (coming) {
    // Meet it in front of the goal, where it will cross.
    const x = crossing(puck, -HALF_Z + 0.9);
    target = { x: (x ?? puck.x) + world.stray * 0.4, z: -HALF_Z + 0.9 };
    if (puck.z < -0.6 && speed < 6) target = { x: puck.x, z: puck.z - 0.25 };
  } else if (puck.z < 0) {
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
/** Whether a puck at `x` is before a goal slot, where the end rail is open. */
const inSlot = (x: number) => Math.abs(x) < GOAL - PUCK * 0.4;
/**
 * The puck pushed out of a mallet it overlaps, and struck by the mallet's speed (a mallet is too heavy to be moved).
 * A rail holds the puck: squeezed against one, it slides along the rail out of the mallet's way, and where it cannot
 * (wedged in a corner) the mallet is stopped by it. Pushed straight out of the mallet it once went into the rail, and
 * a mallet standing in a corner kept it there.
 */
function strike(world: World, m: Body, side: 0 | 1) {
  const { puck } = world,
    reach = PUCK + MALLET,
    far = Math.hypot(puck.x - m.x, puck.z - m.z);
  if (far >= reach || far < 1e-9) return;
  puck.x = m.x + ((puck.x - m.x) / far) * reach;
  puck.z = m.z + ((puck.z - m.z) / far) * reach;
  const wx = HALF_X - PUCK,
    wz = HALF_Z - PUCK,
    along = (from: number, across: number, toward: number) => from + (toward >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, reach * reach - across * across));
  if (Math.abs(puck.x) > wx) {
    puck.x = Math.sign(puck.x) * wx;
    puck.z = along(m.z, puck.x - m.x, puck.z - m.z);
  }
  if (Math.abs(puck.z) > wz && !inSlot(puck.x)) {
    puck.z = Math.sign(puck.z) * wz;
    puck.x = along(m.x, puck.z - m.z, puck.x - m.x);
    if (Math.abs(puck.x) > wx) {
      // Wedged in a corner: the puck stays there and the mallet stops against it.
      puck.x = Math.sign(puck.x) * wx;
      const dx = m.x - puck.x,
        dz = m.z - puck.z,
        gap = Math.hypot(dx, dz) || 1,
        back = keep(side, puck.x + (dx / gap) * reach, puck.z + (dz / gap) * reach);
      m.x = back.x;
      m.z = back.z;
    }
  }
  const gap = Math.hypot(puck.x - m.x, puck.z - m.z) || 1,
    nx = (puck.x - m.x) / gap,
    nz = (puck.z - m.z) / gap,
    closing = (puck.vx - m.vx) * nx + (puck.vz - m.vz) * nz;
  if (closing < 0) {
    puck.vx -= 1.85 * closing * nx;
    puck.vz -= 1.85 * closing * nz;
    world.hit++;
    world.strikes[side]++;
  }
}
/**
 * One slice of time. Returns who scored in it (0 when the puck went into the far goal, 1 into mine), or null. With
 * `two` both mallets are hands (two at one screen) and neither has a speed limit.
 */
export function step(world: World, level: Level, two = false): 0 | 1 | null {
  const { puck } = world;
  world.mallets.forEach((m, side) => {
    const target = world.targets[side],
      dx = target.x - m.x,
      dz = target.z - m.z,
      far = Math.hypot(dx, dz),
      // A hand's mallet goes all the way to the hand; the computer's hand has its top speed.
      most = side === 0 || two ? Infinity : LEVELS[level].speed * DT,
      move = far > most ? most / far : 1,
      kept = keep(side as 0 | 1, m.x + dx * move, m.z + dz * move),
      [ox, oz] = [m.x, m.z];
    m.vx = (kept.x - ox) / DT;
    m.vz = (kept.z - oz) / DT;
    // A long way is gone in short steps, the puck looked for at each, so that the mallet sweeps it along.
    const steps = Math.max(1, Math.ceil(Math.hypot(kept.x - ox, kept.z - oz) / REACH_STEP));
    for (let k = 1; k <= steps; k++) {
      m.x = ox + ((kept.x - ox) * k) / steps;
      m.z = oz + ((kept.z - oz) * k) / steps;
      strike(world, m, side as 0 | 1);
    }
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
  if (inSlot(puck.x)) {
    if (puck.z > HALF_Z + PUCK) return 1;
    if (puck.z < -HALF_Z - PUCK) return 0;
  } else if (Math.abs(puck.z) > HALF_Z - PUCK) {
    puck.z = Math.sign(puck.z) * (HALF_Z - PUCK);
    puck.vz = -puck.vz * 0.9;
    world.wall++;
  }
  world.mallets.forEach((m, side) => strike(world, m, side as 0 | 1));
  const speed = Math.hypot(puck.vx, puck.vz);
  if (speed > MAX_PUCK) {
    puck.vx *= MAX_PUCK / speed;
    puck.vz *= MAX_PUCK / speed;
  }
  // Kept too long in one half, the puck goes to the other side.
  const half = puck.z >= 0 ? 0 : 1;
  if (half !== world.half) {
    world.half = half;
    world.held = 0;
  } else if ((world.held += DT) >= HOLD) {
    const other = half === 0 ? 1 : 0;
    serve(world, other);
    world.served = other;
  }
  return null;
}
