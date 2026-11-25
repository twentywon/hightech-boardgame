/**
 * The valet's car park, free of Three.js and the page: a lot with painted bays, customers' cars that come to the
 * entrance and are later asked for again, and the one car the valet drives. The view steps it in fixed slices (`DT`)
 * and reports the money earned and lost as moves.
 *
 * Metres and seconds. The lot is seen from above: x runs to the right, z toward the viewer (down the screen). A car's
 * heading is counted from +x toward +z (clockwise on the screen), so steering to the right turns it clockwise.
 *
 * How it is played (the user asked for a game of the kind where a parking attendant drives customers' cars into bays
 * against the clock; the lot, the cars and the rules are our own): customers leave their cars at the entrance on the
 * left, one at a time, and wait with a patience that runs down. The valet runs to a car (by itself: to the customer
 * who has waited longest for his patience), and I drive it: into any free bay for a car left with me, to the exit on
 * the right for a car its owner has come back for. A car is parked once it stands nearly still inside a bay, along
 * it; the straighter and the more in the middle, the better the tip. A bump costs a fine and the job's tips. A
 * customer whose patience runs out costs a fine too (one still waiting at the entrance drives off). A shift lasts
 * `SHIFT` seconds.
 */
export const DT = 1 / 120;
/** A car: its length and width, the distance between its axles, and how far its front wheels turn. */
export const CAR_L = 4.2,
  CAR_W = 1.8,
  WHEELBASE = 2.6,
  MAX_STEER = 0.62;
/** How far from the middle of a car its driver stands, out of the door. */
const DOOR = CAR_W / 2 + 0.45;
/** Driving: the most speed forward and back (m/s), the engine's pull, the brakes, rolling to rest, the handbrake, and how fast the wheels are turned. */
export const V_MOST = 6.5,
  V_BACK = 3.2,
  PULL = 4.6,
  BRAKE = 9.5,
  ROLL = 1.9,
  HANDBRAKE = 14,
  STEER_RATE = 2.6;
/** The shift's length, how fast the valet runs, and how long a car takes to roll in through the entrance. */
export const SHIFT = 180,
  RUN = 8,
  ROLL_IN = 1.2;
/** A car is parked once it has stood slower than `STILL` for `SETTLE` seconds inside a bay, within `ANGLE_OK` of its direction. */
export const STILL = 0.2,
  SETTLE = 0.35,
  ANGLE_OK = 0.24;
/** Money: a job's pay, the most its quick-service tip and its tidy-parking bonus add, a late job's pay, and the fines. */
export const PAY = 20,
  TIP = 15,
  TIDY = 10,
  LATE_PAY = 10,
  BUMP_FINE = 5,
  ANGRY_FINE = 15;
/** A bump counts (and is fined) from this speed, at most once in `BUMP_GAP` seconds. */
export const BUMP_FROM = 0.7,
  BUMP_GAP = 0.6;
/** The most cars waiting outside the entrance. */
export const QUEUE_MOST = 2;

export interface Bay {
  x: number;
  z: number;
  /** The direction a car stands along it (either way round). */
  angle: number;
  w: number;
  l: number;
  /** The number painted on it. */
  n: number;
}
export interface Pillar {
  x: number;
  z: number;
  r: number;
}
/** A fixed box on the lot (a planter, the booth): its middle, half its size, never turned. */
export interface Block {
  x: number;
  z: number;
  hx: number;
  hz: number;
}
export interface Lot {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  bays: Bay[];
  pillars: Pillar[];
  blocks: Block[];
  /** Where a car left at the entrance stands (facing +x), and the exit's zone. */
  entrance: { x: number; z: number };
  exit: { x: number; z: number; hx: number; hz: number };
  /** Seconds between arrivals, the patience of a customer leaving a car and of one come back for it, and how long a car stays parked. */
  gap: [number, number];
  patience: number;
  returnPatience: number;
  stay: [number, number];
}
export const STAGE_NAMES = ["마트 주차장", "사선 주차장", "지하 주차장"];
/**
 * The half width of every lot, the aisle's half width, a perpendicular bay's length, and where the rows of bays begin
 * (far enough from the entrance that a car backing out of the first bay clears the one waiting there).
 */
const HALF = 16,
  AISLE = 4.5,
  BAY_L = 5,
  FIRST = -6.5;
/**
 * The three lots. 1: wide bays square to the aisle, above and below it. 2: narrower bays slanted at 60°. 3: narrow
 * bays with pillars at their mouths above, bays along the wall below (parallel parking), and two pillars in the
 * aisle. In each the entrance is at the aisle's left end and the exit at its right end.
 */
export function lotOf(stage: number): Lot {
  const bays: Bay[] = [],
    pillars: Pillar[] = [],
    blocks: Block[] = [],
    lot: Lot = {
      minX: -HALF,
      maxX: HALF,
      minZ: -AISLE - BAY_L,
      maxZ: AISLE + BAY_L,
      bays,
      pillars,
      blocks,
      entrance: { x: -HALF + 3.4, z: 0 },
      exit: { x: HALF - 2.4, z: 0, hx: 2.4, hz: 3.4 },
      gap: [17, 22],
      patience: 52,
      returnPatience: 56,
      stay: [22, 48],
    },
    add = (x: number, z: number, angle: number, w: number, l: number) => bays.push({ x, z, angle, w, l, n: bays.length + 1 });
  // The booth by the entrance (upper left) and a planter under it (lower left).
  blocks.push({ x: -HALF + 2.6, z: -AISLE - 2.6, hx: 2, hz: 1.7 });
  if (stage === 2) {
    // Slanted bays: their fronts on the aisle's edge, leaning the way the cars come.
    const w = 2.6,
      lean = Math.PI / 3,
      pitch = w / Math.sin(lean),
      out = (BAY_L / 2) * Math.sin(lean) + (w / 2) * Math.cos(lean),
      deep = BAY_L * Math.sin(lean) + w * Math.cos(lean);
    lot.minZ = -AISLE - deep - 0.3;
    lot.maxZ = AISLE + deep + 0.3;
    for (const side of [-1, 1])
      for (let k = 0; k < 6; k++) {
        const x = FIRST + 0.6 + k * pitch + (BAY_L / 2) * Math.cos(lean);
        add(x, side * (AISLE + out), side * lean, w, BAY_L);
      }
    blocks[0].z = lot.minZ + 2.2;
    blocks.push({ x: -HALF + 2.6, z: lot.maxZ - 1.6, hx: 2, hz: 1 });
    Object.assign(lot, { gap: [14, 19], patience: 40, returnPatience: 44 });
  } else if (stage === 3) {
    const w = 2.5;
    for (let k = 0; k < 8; k++) add(FIRST + w / 2 + k * w, -AISLE - BAY_L / 2, -Math.PI / 2, w, BAY_L);
    for (let k = 0; k <= 4; k++) pillars.push({ x: FIRST + k * 2 * w, z: -AISLE - 0.45, r: 0.3 });
    // Along the lower wall: bays end to end (parallel parking).
    lot.maxZ = AISLE + 2.7;
    for (let k = 0; k < 3; k++) add(FIRST + 3.2 + k * 6.6, lot.maxZ - 1.45, 0, 2.4, 6);
    pillars.push({ x: -1.5, z: 1.2, r: 0.4 }, { x: 6.5, z: -1.2, r: 0.4 });
    Object.assign(lot, { gap: [13, 18], patience: 38, returnPatience: 42 });
  } else {
    const w = 2.9;
    for (const side of [-1, 1]) for (let k = 0; k < 7; k++) add(FIRST + w / 2 + k * w, side * (AISLE + BAY_L / 2), (side * Math.PI) / 2, w, BAY_L);
    blocks.push({ x: -HALF + 2.6, z: AISLE + 3.4, hx: 2, hz: 1 });
  }
  return lot;
}

export type CarState = "queue" | "arriving" | "waiting" | "parked" | "requested" | "leaving" | "gone";
export interface Car {
  id: number;
  x: number;
  z: number;
  heading: number;
  /** Speed along its heading (negative backing), and the front wheels' angle (positive to the right). */
  v: number;
  steer: number;
  /** Its looks: a body style and a colour, by number. */
  style: number;
  colour: number;
  state: CarState;
  /** The bay it is parked in (while parked or asked for), else -1. */
  bay: number;
  /** Its customer's patience left and at first (seconds), and whether it has already run out. */
  patience: number;
  patience0: number;
  late: boolean;
  /** Bumped on the job in hand (no tips), and how many dents it bears. */
  bumped: boolean;
  dents: number;
  /** Seconds in its present state (rolling in, driving off), and when its owner comes back for it. */
  t: number;
  backAt: number;
  /** How long it has stood still in a bay (toward `SETTLE`). */
  rest: number;
}
export interface Input {
  /** 1 forward, -1 back (the brakes first while it still rolls forward), 0 neither. */
  gas: number;
  /** -1 left to 1 right. */
  steer: number;
  handbrake: boolean;
}
export const IDLE: Input = { gas: 0, steer: 0, handbrake: false };
export type Happening =
  | { kind: "arrive"; car: number }
  | { kind: "take"; car: number }
  | { kind: "bump"; car: number; strength: number; fined: boolean }
  | { kind: "parked"; car: number; bay: number; pay: number; tip: number; tidy: number }
  | { kind: "ask"; car: number; bay: number }
  | { kind: "returned"; car: number; pay: number; tip: number }
  | { kind: "angry"; car: number; left: boolean }
  | { kind: "end" };
export interface World {
  stage: number;
  lot: Lot;
  time: number;
  cars: Car[];
  /** The car I am driving, or -1. */
  hand: number;
  /** How far the car in hand has gone since it was taken (a job may be changed before it has moved). */
  gone: number;
  /** The valet on foot: where, the car run to (-1 none) and the seconds left to it. */
  valet: { x: number; z: number; to: number; left: number; fromX: number; fromZ: number; whole: number };
  nextArrival: number;
  nextId: number;
  lastBump: number;
  seed: number;
  over: boolean;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** An angle brought into (-π, π]. */
export const wrap = (a: number) => {
  let b = a % (2 * Math.PI);
  if (b > Math.PI) b -= 2 * Math.PI;
  if (b <= -Math.PI) b += 2 * Math.PI;
  return b;
};
/** The lot's own sequence of numbers (a shift is the same for the same seed and the same driving). */
function draw(world: World) {
  world.seed = (world.seed * 16807) % 2147483647;
  return (world.seed - 1) / 2147483646;
}
const between = (world: World, [lo, hi]: [number, number]) => lo + (hi - lo) * draw(world);
export const STYLES = 3,
  COLOURS = 7;

export function createWorld(stage: number, seed = 1): World {
  const lot = lotOf(stage),
    world: World = {
      stage,
      lot,
      time: 0,
      cars: [],
      hand: -1,
      gone: 0,
      valet: { x: lot.entrance.x, z: lot.minZ + 4.6, to: -1, left: 0, fromX: 0, fromZ: 0, whole: 0 },
      nextArrival: 1,
      nextId: 1,
      lastBump: -9,
      seed: Math.max(1, Math.floor(Math.abs(seed)) % 2147483646) || 1,
      over: false,
    };
  return world;
}
export const carOf = (world: World, id: number) => world.cars.find((c) => c.id === id) ?? null;
/** The four corners of a car (or any box `l` long and `w` wide) at a place and heading. */
export function corners(x: number, z: number, heading: number, l = CAR_L, w = CAR_W) {
  const c = Math.cos(heading),
    s = Math.sin(heading),
    out: [number, number][] = [];
  for (const [a, b] of [
    [l / 2, w / 2],
    [l / 2, -w / 2],
    [-l / 2, -w / 2],
    [-l / 2, w / 2],
  ])
    out.push([x + a * c - b * s, z + a * s + b * c]);
  return out;
}
interface Box {
  x: number;
  z: number;
  heading: number;
  l: number;
  w: number;
}
/** Whether two turned boxes overlap (separating axes). */
export function boxesTouch(a: Box, b: Box) {
  const pa = corners(a.x, a.z, a.heading, a.l, a.w),
    pb = corners(b.x, b.z, b.heading, b.l, b.w);
  for (const h of [a.heading, a.heading + Math.PI / 2, b.heading, b.heading + Math.PI / 2]) {
    const ax = Math.cos(h),
      az = Math.sin(h);
    let minA = Infinity,
      maxA = -Infinity,
      minB = Infinity,
      maxB = -Infinity;
    for (const [x, z] of pa) {
      const d = x * ax + z * az;
      minA = Math.min(minA, d);
      maxA = Math.max(maxA, d);
    }
    for (const [x, z] of pb) {
      const d = x * ax + z * az;
      minB = Math.min(minB, d);
      maxB = Math.max(maxB, d);
    }
    if (maxA < minB || maxB < minA) return false;
  }
  return true;
}
/** Whether a turned box touches a round pillar. */
function boxTouchesCircle(a: Box, p: Pillar) {
  const c = Math.cos(a.heading),
    s = Math.sin(a.heading),
    dx = p.x - a.x,
    dz = p.z - a.z,
    along = dx * c + dz * s,
    across = -dx * s + dz * c,
    nx = clamp(along, -a.l / 2, a.l / 2),
    nz = clamp(across, -a.w / 2, a.w / 2);
  return Math.hypot(along - nx, across - nz) < p.r;
}
/** Whether a car at (x, z, heading) is clear of the lot's walls, pillars, blocks and every other standing car. */
export function clear(world: World, id: number, x: number, z: number, heading: number) {
  const lot = world.lot,
    me: Box = { x, z, heading, l: CAR_L, w: CAR_W };
  for (const [px, pz] of corners(x, z, heading)) if (px < lot.minX || px > lot.maxX || pz < lot.minZ || pz > lot.maxZ) return false;
  for (const p of lot.pillars) if (boxTouchesCircle(me, p)) return false;
  for (const b of lot.blocks) if (boxesTouch(me, { x: b.x, z: b.z, heading: 0, l: b.hx * 2, w: b.hz * 2 })) return false;
  for (const other of world.cars) {
    if (other.id === id || other.state === "gone" || other.state === "leaving" || other.state === "queue") continue;
    if (Math.hypot(other.x - x, other.z - z) > CAR_L + 0.5) continue;
    if (boxesTouch(me, { x: other.x, z: other.z, heading: other.heading, l: CAR_L, w: CAR_W })) return false;
  }
  return true;
}
/**
 * How a car at (x, z, heading) stands in `bay`: its offsets across and along the bay and its angle from the bay's
 * direction (either way round), each as a share of what is allowed (1 the limit), and whether all are within.
 */
export function standing(bay: Bay, x: number, z: number, heading: number) {
  const c = Math.cos(bay.angle),
    s = Math.sin(bay.angle),
    dx = x - bay.x,
    dz = z - bay.z,
    along = dx * c + dz * s,
    across = -dx * s + dz * c,
    turned = Math.abs(wrap(heading - bay.angle)),
    angle = Math.min(turned, Math.PI - turned),
    okAcross = (bay.w - CAR_W) / 2 + 0.12,
    okAlong = (bay.l - CAR_L) / 2 + 0.25,
    worst = Math.max(Math.abs(across) / okAcross, Math.abs(along) / okAlong, angle / ANGLE_OK);
  return { across, along, angle, worst, inside: worst <= 1 };
}
/** The bay a car at (x, z, heading) stands rightly in, among those free (or its own), or -1. */
export function bayAt(world: World, id: number, x: number, z: number, heading: number) {
  return world.lot.bays.findIndex((bay, k) => standing(bay, x, z, heading).inside && !world.cars.some((c) => c.id !== id && c.bay === k && c.state !== "gone" && c.state !== "leaving"));
}
/** The bays no car holds. */
export const freeBays = (world: World) => world.lot.bays.flatMap((_, k) => (world.cars.some((c) => c.bay === k && (c.state === "parked" || c.state === "requested")) ? [] : [k]));
/** The cars that wait for the valet: left at the entrance, or asked for by their owners. */
export const jobs = (world: World) => world.cars.filter((c) => c.state === "waiting" || c.state === "requested");
/** What a quick job's tip is: the share of the customer's patience left, of `TIP`. */
const tipOf = (car: Car) => (car.late || car.bumped ? 0 : Math.round(TIP * clamp(car.patience / car.patience0, 0, 1)));

/** The valet is sent to car `id` (one that waits): at once when on foot, and from a car in hand only before it has moved. */
export function take(world: World, id: number) {
  const car = carOf(world, id);
  if (world.over || !car || (car.state !== "waiting" && car.state !== "requested") || world.hand === id || world.valet.to === id) return false;
  if (world.hand >= 0) {
    const held = carOf(world, world.hand)!;
    if (world.gone > 0.5 || Math.abs(held.v) > 0.1) return false;
    world.valet.x = held.x + Math.sin(held.heading) * DOOR;
    world.valet.z = held.z - Math.cos(held.heading) * DOOR;
    world.hand = -1;
  }
  const v = world.valet,
    far = Math.hypot(car.x - v.x, car.z - v.z);
  Object.assign(v, { to: id, left: Math.max(0.3, far / RUN), fromX: v.x, fromZ: v.z });
  v.whole = v.left;
  return true;
}
/** The next car waiting, after the one in hand or run to (for a key that changes the job). */
export function nextJob(world: World) {
  const list = jobs(world),
    now = world.hand >= 0 ? world.hand : world.valet.to,
    at = list.findIndex((c) => c.id === now);
  for (let k = 1; k <= list.length; k++) {
    const car = list[(at + k) % list.length];
    if (car.id !== now) return take(world, car.id);
  }
  return false;
}

/** One slice of the car in hand: the engine, the brakes, the wheels, and what it meets. */
function drive(world: World, car: Car, input: Input, out: Happening[]) {
  const gas = clamp(input.gas, -1, 1);
  let a = 0;
  if (input.handbrake) a = -Math.sign(car.v) * HANDBRAKE;
  else if (gas > 0) a = car.v < -0.05 ? BRAKE : PULL * gas * (1 - Math.max(0, car.v) / V_MOST);
  else if (gas < 0) a = car.v > 0.05 ? -BRAKE : PULL * 0.8 * gas * (1 - Math.max(0, -car.v) / V_BACK);
  else a = -Math.sign(car.v) * (ROLL + 0.25 * Math.abs(car.v));
  const before = car.v;
  car.v += a * DT;
  // Brakes and rolling stop the car; they do not send it the other way.
  if ((input.handbrake || gas === 0 || Math.sign(gas) !== Math.sign(before)) && before !== 0 && Math.sign(car.v) !== Math.sign(before)) car.v = 0;
  car.v = clamp(car.v, -V_BACK, V_MOST);
  // The wheels are turned toward where the hands hold them, less far the faster the car goes.
  const want = clamp(input.steer, -1, 1) * MAX_STEER * (1 - 0.3 * Math.min(1, Math.abs(car.v) / V_MOST)),
    turn = STEER_RATE * DT;
  car.steer += clamp(want - car.steer, -turn, turn);
  if (car.v === 0) return;
  // The rear axle goes where the car points; the car turns about it by the front wheels' angle.
  const c = Math.cos(car.heading),
    s = Math.sin(car.heading),
    rx = car.x - (WHEELBASE / 2) * c + car.v * c * DT,
    rz = car.z - (WHEELBASE / 2) * s + car.v * s * DT,
    heading = car.heading + ((car.v * Math.tan(car.steer)) / WHEELBASE) * DT,
    x = rx + (WHEELBASE / 2) * Math.cos(heading),
    z = rz + (WHEELBASE / 2) * Math.sin(heading);
  if (clear(world, car.id, x, z, heading)) {
    world.gone += Math.hypot(x - car.x, z - car.z);
    car.x = x;
    car.z = z;
    car.heading = wrap(heading);
    return;
  }
  // Met something: the car stays where it was and is thrown back a little; a hard enough knock is a bump.
  const speed = Math.abs(car.v);
  car.v = -car.v * 0.25;
  if (speed >= BUMP_FROM) {
    const fined = world.time - world.lastBump >= BUMP_GAP;
    if (fined) {
      world.lastBump = world.time;
      car.bumped = true;
      car.dents = Math.min(3, car.dents + 1);
    }
    out.push({ kind: "bump", car: car.id, strength: clamp(speed / V_MOST, 0.15, 1), fined });
  }
}

/** One slice of the shift: arrivals, patience, the valet on foot, the car in hand, and the clock. */
export function step(world: World, input: Input = IDLE): Happening[] {
  const out: Happening[] = [];
  if (world.over) return out;
  world.time += DT;
  const lot = world.lot;
  if (world.time >= SHIFT) {
    world.over = true;
    out.push({ kind: "end" });
    return out;
  }
  // A new customer drives up now and then, and waits outside while the entrance is taken.
  if (world.time >= world.nextArrival) {
    world.nextArrival = world.time + between(world, lot.gap);
    if (world.cars.filter((c) => c.state === "queue").length < QUEUE_MOST) {
      const style = Math.floor(draw(world) * STYLES),
        colour = Math.floor(draw(world) * COLOURS);
      world.cars.push({ id: world.nextId++, x: lot.minX - 4, z: lot.entrance.z, heading: 0, v: 0, steer: 0, style, colour, state: "queue", bay: -1, patience: lot.patience, patience0: lot.patience, late: false, bumped: false, dents: 0, t: 0, backAt: 0, rest: 0 });
    }
  }
  // The first in the queue rolls in once the entrance is clear.
  const first = world.cars.find((c) => c.state === "queue");
  if (first && !world.cars.some((c) => c !== first && c.state !== "gone" && c.state !== "queue" && (c.state === "arriving" || Math.hypot(c.x - lot.entrance.x, c.z - lot.entrance.z) < CAR_L + 1.6))) {
    first.state = "arriving";
    first.t = 0;
  }
  for (const car of world.cars) {
    if (car.state === "arriving") {
      car.t += DT;
      const p = Math.min(1, car.t / ROLL_IN);
      car.x = lot.minX - 4 + (lot.entrance.x - (lot.minX - 4)) * p * (2 - p);
      if (p >= 1) {
        car.state = "waiting";
        out.push({ kind: "arrive", car: car.id });
      }
    } else if (car.state === "leaving") {
      // Out through the gate (the exit to the right, or back out of the entrance), straightening as it goes.
      car.t += DT;
      car.x += car.v * DT;
      car.heading -= car.heading * Math.min(1, 5 * DT);
      if (car.t > 1.8) car.state = "gone";
    } else if (car.state === "parked" && world.time >= car.backAt) {
      // Its owner is back and asks for it.
      Object.assign(car, { state: "requested", patience: lot.returnPatience, patience0: lot.returnPatience, late: false, bumped: false });
      out.push({ kind: "ask", car: car.id, bay: car.bay });
    }
    if ((car.state === "waiting" || car.state === "requested") && !car.late) {
      car.patience -= DT;
      if (car.patience <= 0) {
        car.patience = 0;
        car.late = true;
        // A customer still waiting at the entrance, not yet served, takes the car and drives off.
        const left = car.state === "waiting" && world.hand !== car.id;
        if (left) {
          if (world.valet.to === car.id) world.valet.to = -1;
          Object.assign(car, { state: "leaving", t: 0, v: -5 });
        }
        out.push({ kind: "angry", car: car.id, left });
      }
    }
  }
  // The valet on foot: to the car it was sent to, else to whoever has the least patience left.
  const v = world.valet;
  if (world.hand < 0) {
    const target = v.to >= 0 ? carOf(world, v.to) : null;
    if (!target || (target.state !== "waiting" && target.state !== "requested")) {
      v.to = -1;
      const waiting = jobs(world).sort((a, b) => a.patience / a.patience0 - b.patience / b.patience0)[0];
      if (waiting) take(world, waiting.id);
    } else {
      v.left -= DT;
      const p = 1 - Math.max(0, v.left) / v.whole;
      v.x = v.fromX + (target.x - v.fromX) * p;
      v.z = v.fromZ + (target.z - v.fromZ) * p;
      if (v.left <= 0) {
        world.hand = target.id;
        world.gone = 0;
        v.to = -1;
        target.rest = 0;
        out.push({ kind: "take", car: target.id });
      }
    }
  }
  const car = world.hand >= 0 ? carOf(world, world.hand) : null;
  if (!car) return out;
  drive(world, car, input, out);
  // On foot again, the valet stands at the driver's door.
  v.x = car.x + Math.sin(car.heading) * DOOR;
  v.z = car.z - Math.cos(car.heading) * DOOR;
  if (car.state === "waiting") {
    // Left with me: parked once it stands still, rightly, in a free bay.
    const k = Math.abs(car.v) < STILL ? bayAt(world, car.id, car.x, car.z, car.heading) : -1;
    car.rest = k >= 0 ? car.rest + DT : 0;
    if (k >= 0 && car.rest >= SETTLE) {
      const how = standing(lot.bays[k], car.x, car.z, car.heading),
        tip = tipOf(car),
        tidy = car.bumped ? 0 : Math.round(TIDY * clamp(1 - how.worst, 0, 1) * 1.25),
        pay = car.late ? LATE_PAY : PAY + tip + Math.min(TIDY, tidy);
      Object.assign(car, { state: "parked", bay: k, v: 0, steer: 0, backAt: world.time + between(world, lot.stay) });
      world.hand = -1;
      out.push({ kind: "parked", car: car.id, bay: k, pay, tip: car.late ? 0 : tip, tidy: car.late ? 0 : Math.min(TIDY, tidy) });
    }
  } else if (car.state === "requested") {
    // Asked for: its bay is free again once it is out of it; handed over in the exit's zone.
    if (car.bay >= 0 && Math.hypot(car.x - lot.bays[car.bay].x, car.z - lot.bays[car.bay].z) > 3) car.bay = -1;
    if (Math.abs(car.x - lot.exit.x) <= lot.exit.hx && Math.abs(car.z - lot.exit.z) <= lot.exit.hz) {
      const tip = tipOf(car),
        pay = car.late ? LATE_PAY : PAY + tip;
      Object.assign(car, { state: "leaving", bay: -1, t: 0, v: Math.max(4, Math.abs(car.v)), heading: wrap(car.heading), steer: 0 });
      world.hand = -1;
      out.push({ kind: "returned", car: car.id, pay, tip: car.late ? 0 : tip });
    }
  }
  return out;
}
