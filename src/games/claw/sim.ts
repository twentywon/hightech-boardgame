import type { Random } from "../../core/random";

/**
 * The claw machine's insides, free of Three.js and the page: a pit of soft
 * toys, a claw hanging by a cable from a trolley on a gantry, and a chute in
 * the front left corner. The view steps it in fixed slices and reports what a
 * try came to as a move.
 *
 * A try: the claw is steered over the pit for a while (`AIM_TIME` at most) by
 * a lever held one way or another (the trolley gathers speed, and stops
 * shortly when the lever is let go, while the claw hanging under it swings on),
 * then let down until it touches a toy or the floor, closes, rises, and goes
 * back over the chute, where it opens. A toy the prongs close on is lifted as
 * it lay, where it was under the claw; if they came down near its middle it
 * is held, otherwise it slips out on the way up (the further off, the sooner).
 * A toy let go over the chute falls in: a prize.
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
  /** The trolley's top speed, how fast it gathers speed, and how fast it stops. */
  SPEED = 2.2,
  ACCEL = 6,
  BRAKE = 12,
  /** The height of the trolley the cable hangs from. */
  RAIL = TOP + 0.95;
/**
 * How the hanging claw swings: gravity as it acts on the short cable (the swing is quicker the shorter the
 * cable), how much of the trolley's starts and stops it feels, how fast a swing dies away, and the widest it goes.
 */
export const SWING = { gravity: 30, jolt: 0.5, damping: 1.2, widest: 0.34 };
/** The toys: their name, size and how well a claw holds them (larger ones less well). */
export const KINDS = [
  { name: "곰", r: 0.42, grip: 0.82 },
  { name: "토끼", r: 0.38, grip: 0.9 },
  { name: "병아리", r: 0.32, grip: 0.95 },
  { name: "고래", r: 0.44, grip: 0.78 },
  { name: "개구리", r: 0.36, grip: 0.9 },
];
/**
 * The machine's grip by level: how near a toy's middle the prongs must come down for it to be held (a share of
 * its radius, for a toy of middling grip), and how often a toy so held stays in them at the top.
 */
export const GRIP = [
  { centre: 0.5, hold: 1 },
  { centre: 0.38, hold: 0.9 },
  { centre: 0.28, hold: 0.78 },
];
export interface Toy {
  id: number;
  kind: number;
  x: number;
  y: number;
  z: number;
  r: number;
  /** Which way it faces, held by the claw, falling (its speed down, and sideways as it slips off), or gone down the chute. */
  turn: number;
  held: boolean;
  vy: number | null;
  dx: number;
  dz: number;
  gone: boolean;
  /** Let go by the claw over the chute: its fall is the try's prize (any other toy that falls in is a bonus). */
  won: boolean;
}
export type Phase = "aim" | "drop" | "close" | "lift" | "home" | "release" | "rest";
export interface Claw {
  /** The trolley over the pit, and its speed. */
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** How far the claw hangs off from under the trolley as it swings, and how fast that changes. */
  sx: number;
  sz: number;
  wx: number;
  wz: number;
  /** The height of the claw's hub. */
  y: number;
  /** 1 open, 0 closed. */
  open: number;
  phase: Phase;
  t: number;
  /** Where a finger on the glass sends the trolley, or null. */
  target: { x: number; z: number } | null;
  holding: number | null;
  /** Where the toy held lies from the hub, as it lay when the prongs closed on it. */
  offset: { x: number; y: number; z: number };
  /** The height at which the toy held slips out on the way up, or null if it is held fast. */
  slip: number | null;
  /** How squarely it came down on the toy it holds, 0 to 1. */
  grip: number;
}
export interface World {
  toys: Toy[];
  claw: Claw;
  aimLeft: number;
  level: number;
  random: Random;
  /** The lever: the four ways held down (to the back, right, to the front, left), and the joystick leant (x, z). */
  lever: boolean[];
  stick: { x: number; z: number };
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
    toys.push({ id: toys.length, kind, x, y, z, r: KINDS[kind].r, turn: (random() - 0.5) * 1.6, held: false, vy: null, dx: 0, dz: 0, gone: false, won: false });
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
    claw: { x: HOME.x, z: HOME.z, vx: 0, vz: 0, sx: 0, sz: 0, wx: 0, wz: 0, y: TOP, open: 1, phase: "aim", t: 0, target: null, holding: null, offset: { x: 0, y: 0, z: 0 }, slip: null, grip: 0 },
    aimLeft: AIM_TIME,
    level: clamp(Math.round(level) || 1, 1, GRIP.length),
    random,
    lever: [false, false, false, false],
    stick: { x: 0, z: 0 },
  };
}
/** Where the trolley may go: over the pit, the claw's prongs clear of the walls. */
const keep = (x: number, z: number) => ({ x: clamp(x, PIT.x0 + 0.35, PIT.x1 - 0.35), z: clamp(z, PIT.z0 + 0.35, PIT.z1 - 0.35) });
/** Where the claw's hub is: under the trolley, as far off as it has swung. */
export const hubOf = (claw: Claw) => ({ x: claw.x + claw.sx, z: claw.z + claw.sz });
/** The lever pushed one way (0 to the back, 1 right, 2 to the front, 3 left) or let go of that way. */
export function press(world: World, dir: number, down: boolean) {
  if (dir >= 0 && dir < 4) world.lever[dir] = down;
}
/** The joystick leant by hand, as far as (x, z) of the way to its stop (0 is upright). */
export function lean(world: World, x: number, z: number) {
  const far = Math.hypot(x, z);
  world.stick = far > 1 ? { x: x / far, z: z / far } : { x, z };
}
/** Every hand off the lever (the game paused, the page left). */
export function letGo(world: World) {
  world.lever = [false, false, false, false];
  world.stick = { x: 0, z: 0 };
}
/** Which way, and how far, the lever is pushed. */
export function leverOf(world: World) {
  const [back, right, front, left] = world.lever,
    x = (right ? 1 : 0) - (left ? 1 : 0) + world.stick.x,
    z = (front ? 1 : 0) - (back ? 1 : 0) + world.stick.z,
    far = Math.hypot(x, z);
  return far > 1 ? { x: x / far, z: z / far } : { x, z };
}
/** The trolley is sent toward a point of the pit (a finger or a mouse on the glass). */
export function aimAt(world: World, x: number, z: number) {
  if (world.claw.phase === "aim") world.claw.target = keep(x, z);
}
/** The button: the claw goes down where it is. */
export function drop(world: World) {
  if (world.claw.phase === "aim") [world.claw.phase, world.claw.t] = ["drop", 0];
}
/** The trolley's speed brought toward (vx, vz): gathering speed gently, losing it sharply. Returns its acceleration. */
function drive(claw: Claw, vx: number, vz: number) {
  const dvx = vx - claw.vx,
    dvz = vz - claw.vz,
    change = Math.hypot(dvx, dvz),
    faster = Math.hypot(vx, vz) >= Math.hypot(claw.vx, claw.vz) && vx * claw.vx + vz * claw.vz >= 0,
    limit = (faster ? ACCEL : BRAKE) * DT,
    share = change > limit ? limit / change : 1,
    [ox, oz] = [claw.vx, claw.vz];
  claw.vx += dvx * share;
  claw.vz += dvz * share;
  const nx = claw.x + claw.vx * DT,
    nz = claw.z + claw.vz * DT,
    kept = keep(nx, nz);
  // At the end of the rails it stops short: a jolt the claw feels.
  if (kept.x !== nx) claw.vx = 0;
  if (kept.z !== nz) claw.vz = 0;
  claw.x = kept.x;
  claw.z = kept.z;
  return { ax: (claw.vx - ox) / DT, az: (claw.vz - oz) / DT };
}
/** The trolley sent to a point at up to `top`, slowing in time to stop there. */
function seek(claw: Claw, x: number, z: number, top: number) {
  const dx = x - claw.x,
    dz = z - claw.z,
    far = Math.hypot(dx, dz);
  if (far < 1e-4) return drive(claw, 0, 0);
  const speed = Math.min(top, Math.sqrt(2 * BRAKE * 0.6 * far), far / DT);
  return drive(claw, (dx / far) * speed, (dz / far) * speed);
}
const arrived = (claw: Claw, x: number, z: number) => Math.hypot(x - claw.x, z - claw.z) < 0.01 && Math.hypot(claw.vx, claw.vz) < 0.05;
/** The claw swings under the trolley, pulled back by its weight and thrown by the trolley's starts and stops. */
function swing(claw: Claw, ax: number, az: number) {
  const pull = SWING.gravity / Math.max(0.35, RAIL - claw.y);
  claw.wx += (-pull * claw.sx - SWING.jolt * ax - SWING.damping * claw.wx) * DT;
  claw.wz += (-pull * claw.sz - SWING.jolt * az - SWING.damping * claw.wz) * DT;
  claw.sx += claw.wx * DT;
  claw.sz += claw.wz * DT;
  const far = Math.hypot(claw.sx, claw.sz);
  if (far > SWING.widest) {
    claw.sx *= SWING.widest / far;
    claw.sz *= SWING.widest / far;
    claw.wx *= 0.5;
    claw.wz *= 0.5;
  }
  // The prongs knock on the glass and come back off it.
  const x = clamp(claw.x + claw.sx, PIT.x0 + 0.25, PIT.x1 - 0.25),
    z = clamp(claw.z + claw.sz, PIT.z0 + 0.25, PIT.z1 - 0.25);
  if (x !== claw.x + claw.sx) [claw.sx, claw.wx] = [x - claw.x, -claw.wx * 0.3];
  if (z !== claw.z + claw.sz) [claw.sz, claw.wz] = [z - claw.z, -claw.wz * 0.3];
}
/** Toys whose support has gone (a toy lifted from under them) begin to fall. */
function loosen(world: World) {
  for (const toy of world.toys) {
    if (toy.held || toy.gone || toy.vy !== null) continue;
    if (restingHeight(world.toys, toy) < toy.y - 0.03) toy.vy = 0;
  }
}
/** The toy held slips out of the prongs, sliding off the side it was held by. */
function slipOut(world: World, toy: Toy) {
  const { claw } = world,
    far = Math.hypot(claw.offset.x, claw.offset.z);
  toy.held = false;
  toy.vy = 0;
  [toy.dx, toy.dz] = far > 1e-3 ? [(claw.offset.x / far) * 0.7, (claw.offset.z / far) * 0.7] : [0, 0];
  claw.holding = null;
  claw.slip = null;
}
/** The toy the closing prongs find: the nearest whose top is within their reach and whose middle is below their hinges (one lying higher beside the claw is not taken). */
function caught(world: World) {
  const { claw } = world,
    hub = hubOf(claw),
    tip = claw.y - REACH;
  let best: Toy | null = null,
    near = Infinity;
  for (const toy of world.toys) {
    if (toy.held || toy.gone || toy.vy !== null) continue;
    const d = Math.hypot(toy.x - hub.x, toy.z - hub.z);
    if (d < toy.r + 0.2 && toy.y + toy.r > tip - 0.2 && toy.y < claw.y - 0.22 && d < near) {
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
  let jolt = { ax: 0, az: 0 };
  if (claw.phase === "aim") {
    const lever = leverOf(world);
    if (Math.hypot(lever.x, lever.z) > 0.05) {
      claw.target = null;
      jolt = drive(claw, lever.x * SPEED, lever.z * SPEED);
    } else jolt = claw.target ? seek(claw, claw.target.x, claw.target.z, SPEED) : drive(claw, 0, 0);
    world.aimLeft -= DT;
    if (world.aimLeft <= 0) [claw.phase, claw.t] = ["drop", 0];
  } else if (claw.phase === "home") {
    jolt = seek(claw, HOME.x, HOME.z, SPEED * 0.8);
    if (arrived(claw, HOME.x, HOME.z)) [claw.phase, claw.t] = ["release", 0];
  } else jolt = drive(claw, 0, 0);
  if (claw.phase === "drop") {
    claw.y -= 1.9 * DT;
    // It stops on what it meets: a toy's top, or the floor.
    const hub = hubOf(claw);
    if (claw.y - REACH <= surface(world.toys, hub.x, hub.z) + 0.05 || claw.y - REACH <= 0.05) [claw.phase, claw.t] = ["close", 0];
  } else if (claw.phase === "close") {
    claw.open = Math.max(0, 1 - claw.t / 0.5);
    if (claw.t >= 0.5) {
      out.push({ kind: "closed" });
      const found = caught(world);
      if (found) {
        // The toy is lifted as it lies; near its middle it is held, further off it slips out on the way up.
        const toy = found.toy,
          hub = hubOf(claw),
          off = found.d / toy.r,
          centre = (GRIP[world.level - 1].centre * KINDS[toy.kind].grip) / 0.88;
        claw.holding = toy.id;
        claw.grip = clamp(1 - off, 0, 1);
        claw.offset = { x: toy.x - hub.x, y: toy.y - claw.y, z: toy.z - hub.z };
        claw.slip = off <= centre ? null : claw.y + (TOP - claw.y) * clamp(0.9 - (off - centre) * 1.1, 0.12, 0.8);
        toy.held = true;
        loosen(world);
      }
      [claw.phase, claw.t] = ["lift", 0];
    }
  } else if (claw.phase === "lift") {
    claw.y = Math.min(TOP, claw.y + 1.5 * DT);
    if (held && claw.slip !== null && claw.y >= claw.slip) slipOut(world, held);
    if (claw.y >= TOP) {
      // At the top even a toy held squarely may slip out, on a mean machine.
      const still = claw.holding === null ? null : world.toys[claw.holding];
      if (still && world.random() > GRIP[world.level - 1].hold) slipOut(world, still);
      [claw.phase, claw.t] = ["home", 0];
    }
  } else if (claw.phase === "release") {
    claw.open = Math.min(1, claw.t / 0.35);
    if (claw.t >= 0.35) {
      const still = claw.holding === null ? null : world.toys[claw.holding];
      if (still) {
        still.held = false;
        still.vy = 0;
        still.won = true;
        claw.holding = null;
      } else out.push({ kind: "missed" });
      [claw.phase, claw.t] = ["rest", 0];
    }
  } else if (claw.phase === "rest" && claw.t >= 0.9) {
    // Ready for the next try, from over the chute.
    [claw.phase, claw.t] = ["aim", 0];
    claw.target = null;
    world.aimLeft = AIM_TIME;
  }
  // Resting on what it touched the claw does not swing; elsewhere it hangs and swings.
  if (claw.phase === "close") [claw.wx, claw.wz] = [0, 0];
  else swing(claw, jolt.ax, jolt.az);
  const now = world.toys[claw.holding ?? -1];
  if (now) {
    const hub = hubOf(claw);
    now.x = hub.x + claw.offset.x;
    now.z = hub.z + claw.offset.z;
    now.y = claw.y + claw.offset.y;
  }
  // Toys let go fall (one slipping out slides off sideways); into the chute they are a prize.
  for (const toy of world.toys) {
    if (toy.vy === null || toy.gone) continue;
    toy.vy -= 9.8 * DT;
    toy.y += toy.vy * DT;
    if (toy.won) {
      // Let go over the chute, its funnel takes it in.
      toy.x += (clamp(toy.x, CHUTE.x0 + 0.25, CHUTE.x1 - 0.25) - toy.x) * Math.min(1, 8 * DT);
      toy.z += (clamp(toy.z, CHUTE.z0 + 0.25, CHUTE.z1 - 0.25) - toy.z) * Math.min(1, 8 * DT);
    } else if (toy.dx || toy.dz) {
      toy.x = clamp(toy.x + toy.dx * DT, PIT.x0 + toy.r * 0.8, PIT.x1 - toy.r * 0.8);
      toy.z = clamp(toy.z + toy.dz * DT, PIT.z0 + toy.r * 0.8, PIT.z1 - toy.r * 0.8);
    }
    const rest = restingHeight(world.toys, toy);
    if (toy.y <= rest) {
      toy.y = rest;
      toy.vy = null;
      toy.dx = toy.dz = 0;
    } else if (toy.y < -1.4) {
      toy.gone = true;
      toy.vy = null;
      out.push({ kind: "prize", toy: toy.id, sort: toy.kind, bonus: !toy.won });
    }
  }
  return out;
}
