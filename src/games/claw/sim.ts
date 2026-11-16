import type { Random } from "../../core/random";

/**
 * The claw machine's insides, free of Three.js and the page: a pit of soft
 * toys, a claw on a gantry, and a chute in the front left corner. The view
 * steps it in fixed slices and reports what a try came to as a move.
 *
 * A try: the claw is steered over the pit for a while (`AIM_TIME` at most),
 * then let down until it touches a toy or the floor, closes, rises, and
 * goes back over the chute, where it opens. Whether it holds a toy depends
 * on how squarely it came down on it and on the machine's grip; a toy may
 * also slip out at the top. A toy let go over the chute falls in: a prize.
 */
export const DT = 1 / 60;
/** The pit (x across, z from the back to the front), and the chute in its front left corner. */
export const PIT = { x0: -2.4, x1: 2.4, z0: -1.8, z1: 1.8 };
export const CHUTE = { x0: -2.4, x1: -1.3, z0: 0.7, z1: 1.8 };
export const HOME = { x: (CHUTE.x0 + CHUTE.x1) / 2, z: (CHUTE.z0 + CHUTE.z1) / 2 };
/** The height of the claw's hub at the top, how far its prongs reach below the hub, and the seconds to aim. */
export const TOP = 3.0,
  REACH = 0.5,
  AIM_TIME = 20,
  /** How far a press of an arrow moves the claw, and how fast it goes. */
  STEP = 0.32,
  SPEED = 2.2;
/** The toys: their name, size and how well a claw holds them (larger ones less well). */
export const KINDS = [
  { name: "곰", r: 0.42, grip: 0.82 },
  { name: "토끼", r: 0.38, grip: 0.9 },
  { name: "병아리", r: 0.32, grip: 0.95 },
  { name: "고래", r: 0.44, grip: 0.78 },
  { name: "개구리", r: 0.36, grip: 0.9 },
];
/** The machine's grip by level: how often a squarely set claw closes on a toy, and how well it holds it on the way up. */
export const GRIP = [
  { close: 1.15, hold: 1.0 },
  { close: 1.0, hold: 0.88 },
  { close: 0.85, hold: 0.74 },
];
export interface Toy {
  id: number;
  kind: number;
  x: number;
  y: number;
  z: number;
  r: number;
  /** Which way it faces, held by the claw, falling (its speed), or gone down the chute. */
  turn: number;
  held: boolean;
  vy: number | null;
  gone: boolean;
  /** Let go by the claw over the chute: its fall is the try's prize (any other toy that falls in is a bonus). */
  won: boolean;
}
export type Phase = "aim" | "drop" | "close" | "lift" | "home" | "release" | "rest";
export interface Claw {
  x: number;
  z: number;
  y: number;
  /** 1 open, 0 closed. */
  open: number;
  phase: Phase;
  t: number;
  target: { x: number; z: number };
  holding: number | null;
  /** How squarely it came down on the toy it holds, 0 to 1. */
  grip: number;
}
export interface World {
  toys: Toy[];
  claw: Claw;
  aimLeft: number;
  level: number;
  random: Random;
}
/** A toy down the chute (the try's prize, or a bonus that fell in by itself), a try that came to nothing, the prongs closing. */
export type Happening = { kind: "prize"; toy: number; sort: number; bonus: boolean } | { kind: "missed" } | { kind: "closed" };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const inChute = (x: number, z: number) => x <= CHUTE.x1 && z >= CHUTE.z0;
/** Where a toy lying at x, z comes to rest on the floor or on the toys under it. */
export function restingHeight(toys: Toy[], toy: Pick<Toy, "x" | "z" | "r" | "id">) {
  if (inChute(toy.x, toy.z)) return -10;
  let y = toy.r * 0.9;
  for (const other of toys) {
    if (other.id === toy.id || other.held || other.gone || other.vy !== null) continue;
    const reach = (toy.r + other.r) * 0.92,
      d = Math.hypot(toy.x - other.x, toy.z - other.z);
    if (d < reach) y = Math.max(y, other.y + Math.sqrt(reach * reach - d * d));
  }
  return y;
}
/** The height of what lies under a point: the top of the highest toy there, or the floor. */
export function surface(toys: Toy[], x: number, z: number) {
  let y = 0;
  for (const toy of toys) {
    if (toy.held || toy.gone) continue;
    const d = Math.hypot(x - toy.x, z - toy.z);
    if (d < toy.r) y = Math.max(y, toy.y + Math.sqrt(toy.r * toy.r - d * d) * 0.9);
  }
  return y;
}
/** Every toy settles, lowest first, on the floor or on those under it. */
export function settle(toys: Toy[]) {
  const order = toys.filter((t) => !t.held && !t.gone && t.vy === null).sort((a, b) => a.y - b.y);
  for (const toy of order) toy.y = restingHeight(order.filter((o) => o !== toy && o.y <= toy.y + 0.01), toy);
}
/** A pit laid out afresh: a layer of toys over the floor clear of the chute, and some more lying on them. */
export function lay(random: Random): Toy[] {
  const toys: Toy[] = [];
  const add = (x: number, z: number, y: number) => {
    const kind = Math.floor(random() * KINDS.length) % KINDS.length;
    toys.push({ id: toys.length, kind, x, y, z, r: KINDS[kind].r, turn: (random() - 0.5) * 1.6, held: false, vy: null, gone: false, won: false });
  };
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 5; col++) {
      const x = PIT.x0 + 0.5 + col * 0.95 + (random() - 0.5) * 0.25,
        z = PIT.z0 + 0.45 + row * 0.92 + (random() - 0.5) * 0.25;
      // The chute and the room round its wall are kept clear.
      if (x < CHUTE.x1 + 0.35 && z > CHUTE.z0 - 0.35) continue;
      add(clamp(x, PIT.x0 + 0.4, PIT.x1 - 0.4), clamp(z, PIT.z0 + 0.4, PIT.z1 - 0.4), 0.4);
    }
  for (let k = 0; k < 6; k++) {
    const x = PIT.x0 + 1.6 + random() * 2.9,
      z = PIT.z0 + 0.5 + random() * 2.6;
    if (x < CHUTE.x1 + 0.45 && z > CHUTE.z0 - 0.45) continue;
    add(x, z, 1.2);
  }
  settle(toys);
  return toys;
}
export function createWorld(level: number, random: Random): World {
  return {
    toys: lay(random),
    claw: { x: HOME.x, z: HOME.z, y: TOP, open: 1, phase: "aim", t: 0, target: { ...HOME }, holding: null, grip: 0 },
    aimLeft: AIM_TIME,
    level: clamp(Math.round(level) || 1, 1, GRIP.length),
    random,
  };
}
/** Where the claw may be steered: over the pit, its prongs clear of the walls. */
const keep = (x: number, z: number) => ({ x: clamp(x, PIT.x0 + 0.35, PIT.x1 - 0.35), z: clamp(z, PIT.z0 + 0.35, PIT.z1 - 0.35) });
/** An arrow pressed: the claw is sent a step that way (0 to the back, 1 right, 2 to the front, 3 left). */
export function nudge(world: World, dir: number) {
  if (world.claw.phase !== "aim") return;
  const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir] ?? [0, 0],
    from = world.claw.target;
  world.claw.target = keep(from.x + dx * STEP, from.z + dz * STEP);
}
/** The claw is sent toward a point of the pit (a finger or a mouse on the glass). */
export function aimAt(world: World, x: number, z: number) {
  if (world.claw.phase === "aim") world.claw.target = keep(x, z);
}
/** The button: the claw goes down where it is. */
export function drop(world: World) {
  if (world.claw.phase === "aim") [world.claw.phase, world.claw.t] = ["drop", 0];
}
/** The toy the closing prongs find: the nearest whose top is within their reach. */
function caught(world: World) {
  const { claw } = world,
    tip = claw.y - REACH;
  let best: Toy | null = null,
    near = Infinity;
  for (const toy of world.toys) {
    if (toy.held || toy.gone || toy.vy !== null) continue;
    const d = Math.hypot(toy.x - claw.x, toy.z - claw.z);
    if (d < toy.r + 0.2 && toy.y + toy.r > tip - 0.2 && d < near) {
      near = d;
      best = toy;
    }
  }
  return best ? { toy: best, d: near } : null;
}
/** One slice of time. */
export function step(world: World): Happening[] {
  const out: Happening[] = [],
    { claw } = world,
    held = claw.holding === null ? null : world.toys[claw.holding];
  claw.t += DT;
  const toward = (x: number, z: number, speed: number) => {
    const dx = x - claw.x,
      dz = z - claw.z,
      d = Math.hypot(dx, dz),
      move = Math.min(d, speed * DT);
    if (d > 1e-6) {
      claw.x += (dx / d) * move;
      claw.z += (dz / d) * move;
    }
    return d - move < 0.01;
  };
  if (claw.phase === "aim") {
    toward(claw.target.x, claw.target.z, SPEED);
    world.aimLeft -= DT;
    if (world.aimLeft <= 0) [claw.phase, claw.t] = ["drop", 0];
  } else if (claw.phase === "drop") {
    claw.y -= 1.9 * DT;
    // It stops on what it meets: a toy's top, or the floor.
    if (claw.y - REACH <= surface(world.toys, claw.x, claw.z) + 0.05 || claw.y - REACH <= 0.05) [claw.phase, claw.t] = ["close", 0];
  } else if (claw.phase === "close") {
    claw.open = Math.max(0, 1 - claw.t / 0.5);
    if (claw.t >= 0.5) {
      out.push({ kind: "closed" });
      const found = caught(world),
        grip = GRIP[world.level - 1];
      if (found) {
        const square = clamp(1 - found.d / (found.toy.r + 0.2), 0, 1),
          chance = Math.pow(square, 1.3) * KINDS[found.toy.kind].grip * grip.close;
        if (world.random() < chance) {
          claw.holding = found.toy.id;
          claw.grip = square;
          found.toy.held = true;
          settle(world.toys);
        } else {
          // Missed, it still pushes the toy a little toward where the prongs closed.
          found.toy.x += (claw.x - found.toy.x) * 0.25 + (world.random() - 0.5) * 0.1;
          found.toy.z += (claw.z - found.toy.z) * 0.25 + (world.random() - 0.5) * 0.1;
          const kept = keep(found.toy.x, found.toy.z);
          [found.toy.x, found.toy.z] = [clamp(kept.x, PIT.x0 + found.toy.r * 0.8, PIT.x1 - found.toy.r * 0.8), clamp(kept.z, PIT.z0 + found.toy.r * 0.8, PIT.z1 - found.toy.r * 0.8)];
          if (inChute(found.toy.x, found.toy.z)) found.toy.x = CHUTE.x1 + found.toy.r;
          settle(world.toys);
        }
      }
      [claw.phase, claw.t] = ["lift", 0];
    }
  } else if (claw.phase === "lift") {
    claw.y = Math.min(TOP, claw.y + 1.5 * DT);
    if (claw.y >= TOP) {
      // At the top the toy may slip out, the less squarely it was caught the likelier.
      if (held && world.random() > (0.5 + 0.5 * claw.grip) * GRIP[world.level - 1].hold) {
        held.held = false;
        held.vy = 0;
        claw.holding = null;
      }
      [claw.phase, claw.t] = ["home", 0];
    }
  } else if (claw.phase === "home") {
    if (toward(HOME.x, HOME.z, SPEED * 0.8)) [claw.phase, claw.t] = ["release", 0];
  } else if (claw.phase === "release") {
    claw.open = Math.min(1, claw.t / 0.35);
    if (claw.t >= 0.35) {
      if (held) {
        held.held = false;
        held.vy = 0;
        held.won = true;
        claw.holding = null;
      } else out.push({ kind: "missed" });
      [claw.phase, claw.t] = ["rest", 0];
    }
  } else if (claw.t >= 0.9) {
    // Ready for the next try, from over the chute.
    [claw.phase, claw.t] = ["aim", 0];
    claw.target = { ...HOME };
    world.aimLeft = AIM_TIME;
  }
  const now = world.toys[claw.holding ?? -1];
  if (now) {
    now.x = claw.x;
    now.z = claw.z;
    now.y = claw.y - REACH - now.r * 0.35;
  }
  // Toys let go fall; into the chute they are a prize.
  for (const toy of world.toys) {
    if (toy.vy === null || toy.gone) continue;
    toy.vy -= 9.8 * DT;
    toy.y += toy.vy * DT;
    const rest = restingHeight(world.toys, toy);
    if (toy.y <= rest) {
      toy.y = rest;
      toy.vy = null;
      settle(world.toys);
    } else if (toy.y < -1.4) {
      toy.gone = true;
      toy.vy = null;
      out.push({ kind: "prize", toy: toy.id, sort: toy.kind, bonus: !toy.won });
    }
  }
  return out;
}
