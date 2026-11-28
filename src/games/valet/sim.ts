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
 * left, one at a time, and wait with a patience that runs down. I walk the valet about the lot (by a lever or the
 * keys; it cannot walk through cars, kerbs, pillars or the booth), get into a car standing next to it that it may
 * drive (`board`), and drive it: into the one bay its customer named (as the keys are handed over) for a car left
 * with me, to the exit on the right for a car its owner has come back for. A car left with me is parked when I get out
 * of it (`alight`) standing still in its bay, along it; the straighter and the more in the middle, the better the tip.
 * A car asked for is handed over as it is driven into the exit's zone, and the valet steps out there. A bump costs a
 * fine and the job's tips. A customer whose patience runs out costs a fine too (one whose car has not yet been taken
 * drives off). A shift lasts `SHIFT` seconds.
 */
export const DT = 1 / 120;
/** A car: its length and width, the distance between its axles, and how far its front wheels turn. */
export const CAR_L = 4.2,
  CAR_W = 1.8,
  WHEELBASE = 2.6,
  MAX_STEER = 0.62;
/** The valet on foot: the round of its body, how fast it runs at full lever (m/s), and how near to a car (from its middle to the car's side) it must stand to get in. */
export const BODY = 0.3,
  WALK = 6,
  REACH = 1.2;
/** Driving: the most speed forward and back (m/s), the engine's pull, the brakes, rolling to rest, the handbrake, and how fast the wheels are turned. */
export const V_MOST = 6.5,
  V_BACK = 3.2,
  PULL = 4.6,
  BRAKE = 9.5,
  ROLL = 1.9,
  HANDBRAKE = 14,
  STEER_RATE = 2.6;
/** The shift's length, and how long a car takes to roll in through the entrance. */
export const SHIFT = 180,
  ROLL_IN = 1.2;
/** The valet gets out only of a car slower than `STILL`; a car is parked inside its bay within `ANGLE_OK` of its direction. */
export const STILL = 0.2,
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
/**
 * What a customer leaves (the user asked for motorbikes at the second lot and buses and motorbikes at the third): a
 * car, a motorbike or a bus, each with its own size and handling. A motorbike parks in a car's bay (anywhere in it,
 * along it); a bus only in a bay marked for a bus.
 */
export const CAR = 0,
  BIKE = 1,
  BUS = 2;
export interface Vehicle {
  l: number;
  w: number;
  wheelbase: number;
  maxSteer: number;
  vMost: number;
  vBack: number;
  pull: number;
}
export const VEHICLES: Vehicle[] = [
  { l: CAR_L, w: CAR_W, wheelbase: WHEELBASE, maxSteer: MAX_STEER, vMost: V_MOST, vBack: V_BACK, pull: PULL },
  // Nimble and quick, but it is only walked backward.
  { l: 2.15, w: 0.8, wheelbase: 1.42, maxSteer: 0.7, vMost: 7, vBack: 1.6, pull: 5.6 },
  // Long and slow to answer: it swings wide.
  { l: 7.4, w: 2.4, wheelbase: 4.3, maxSteer: 0.66, vMost: 5.2, vBack: 2.6, pull: 3.4 },
];
/** A vehicle's size and handling (a box with no kind is a car). */
export const dims = (car: { kind?: number } | null | undefined) => VEHICLES[car?.kind ?? CAR] ?? VEHICLES[CAR];

export interface Bay {
  x: number;
  z: number;
  /** The direction a car stands along it (either way round). */
  angle: number;
  w: number;
  l: number;
  /** The number painted on it. */
  n: number;
  /** A bay for a bus (only a bus parks in it, and a bus nowhere else). */
  bus?: boolean;
}
/** Whether a vehicle of `kind` may park in `bay`. */
export const fits = (bay: Bay, kind: number) => (kind === BUS) === !!bay.bus;
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
  /** The share of customers who come on a motorbike, and by bus (one bus at a time, while its bay is free). */
  bikes: number;
  buses: number;
}
export const STAGE_NAMES = ["마트 주차장", "햄버거 가게 주차장", "지하 주차장"];
/** How hard each lot is, by its order (the user asked for them named so). */
export const LEVELS = ["쉬움", "보통", "어려움"];
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
      gap: [19, 25],
      patience: 60,
      returnPatience: 60,
      stay: [22, 48],
      bikes: 0,
      buses: 0,
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
    // Customers come more often the harder the lot (the user asked), some on motorbikes.
    Object.assign(lot, { gap: [11, 15], patience: 40, returnPatience: 44, bikes: 0.3 });
  } else if (stage === 3) {
    const w = 2.5;
    for (let k = 0; k < 8; k++) add(FIRST + w / 2 + k * w, -AISLE - BAY_L / 2, -Math.PI / 2, w, BAY_L);
    for (let k = 0; k <= 4; k++) pillars.push({ x: FIRST + k * 2 * w, z: -AISLE - 0.45, r: 0.3 });
    // Along the lower wall: bays end to end (parallel parking), and at its left end, by the entrance, a long bay for a
    // bus (backed into along the wall, driven out forward to the exit).
    lot.maxZ = AISLE + 2.7;
    for (let k = 0; k < 3; k++) add(FIRST + 4.8 + k * 6.6, lot.maxZ - 1.45, 0, 2.4, 6);
    add(-HALF + 5.6, lot.maxZ - 1.55, 0, 2.9, 11);
    lot.bays[lot.bays.length - 1].bus = true;
    pillars.push({ x: 6.5, z: -1.2, r: 0.4 });
    // Customers come most often here, on motorbikes and by bus too.
    Object.assign(lot, { gap: [9, 13], patience: 38, returnPatience: 42, bikes: 0.25, buses: 0.2 });
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
  /** What it is (`CAR`, `BIKE`, `BUS`), and its looks: a body style and a colour, by number. */
  kind: number;
  style: number;
  colour: number;
  state: CarState;
  /** The bay it is parked in (while parked or asked for), else -1. */
  bay: number;
  /** The bay its customer named when the valet first got in (-1 before, or when none was free: then any free bay will do). */
  want: number;
  /** Whether the valet has got into it yet (a customer whose car has not been taken drives off when out of patience). */
  taken: boolean;
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
}
export interface Input {
  /** 1 forward, -1 back (the brakes first while it still rolls forward), 0 neither. */
  gas: number;
  /** -1 left to 1 right. */
  steer: number;
  handbrake: boolean;
  /** On foot: where the lever (or the keys) leads the valet, along x and z; at full speed at a length of 1. */
  walkX?: number;
  walkZ?: number;
}
export const IDLE: Input = { gas: 0, steer: 0, handbrake: false };
export type Happening =
  | { kind: "arrive"; car: number }
  /** Got into a car: for one left with me, the bay its customer named (-1 none); for one asked for, its bay. */
  | { kind: "take"; car: number; bay: number }
  /** Got out of a car left standing where it is (still the customer's job). */
  | { kind: "out"; car: number }
  /** Not let out: the car left with me stands in bay `at`, which is not (or not rightly) its named bay `bay`. */
  | { kind: "wrong"; car: number; bay: number; at: number }
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
  /** The valet on foot: where, which way it faces, and how fast it goes. */
  valet: { x: number; z: number; heading: number; speed: number };
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
      valet: { x: lot.entrance.x, z: lot.minZ + 4.6, heading: Math.PI / 2, speed: 0 },
      nextArrival: 1,
      nextId: 1,
      lastBump: -9,
      seed: Math.max(1, Math.floor(Math.abs(seed)) % 2147483646) || 1,
      over: false,
    };
  return world;
}
/** Where a vehicle left at the entrance stands: a long one far enough in that its tail is inside the gate. */
export const entryX = (lot: Lot, car: { kind?: number }) => Math.max(lot.entrance.x, lot.minX + dims(car).l / 2 + 0.7);
/** Where a vehicle waits in the street just outside the gate (a long one further out, clear of the barrier). */
export const gateX = (lot: Lot, car: { kind?: number }) => lot.minX - Math.max(4, dims(car).l / 2 + 0.7);
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
/** The box a car takes up. */
const boxOf = (c: Car): Box => ({ x: c.x, z: c.z, heading: c.heading, l: dims(c).l, w: dims(c).w });
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
    size = dims(carOf(world, id)),
    me: Box = { x, z, heading, l: size.l, w: size.w };
  for (const [px, pz] of corners(x, z, heading, size.l, size.w)) if (px < lot.minX || px > lot.maxX || pz < lot.minZ || pz > lot.maxZ) return false;
  for (const p of lot.pillars) if (boxTouchesCircle(me, p)) return false;
  for (const b of lot.blocks) if (boxesTouch(me, { x: b.x, z: b.z, heading: 0, l: b.hx * 2, w: b.hz * 2 })) return false;
  for (const other of world.cars) {
    if (other.id === id || other.state === "gone" || other.state === "leaving" || other.state === "queue") continue;
    const its = dims(other);
    if (Math.hypot(other.x - x, other.z - z) > (Math.hypot(size.l, size.w) + Math.hypot(its.l, its.w)) / 2 + 0.1) continue;
    if (boxesTouch(me, boxOf(other))) return false;
  }
  return true;
}
/**
 * How a car at (x, z, heading) stands in `bay`: its offsets across and along the bay and its angle from the bay's
 * direction (either way round), each as a share of what is allowed (1 the limit), and whether all are within.
 */
export function standing(bay: Bay, x: number, z: number, heading: number, size: Vehicle = VEHICLES[CAR]) {
  const c = Math.cos(bay.angle),
    s = Math.sin(bay.angle),
    dx = x - bay.x,
    dz = z - bay.z,
    along = dx * c + dz * s,
    across = -dx * s + dz * c,
    turned = Math.abs(wrap(heading - bay.angle)),
    angle = Math.min(turned, Math.PI - turned),
    okAcross = (bay.w - size.w) / 2 + 0.12,
    okAlong = (bay.l - size.l) / 2 + 0.25,
    worst = Math.max(Math.abs(across) / okAcross, Math.abs(along) / okAlong, angle / ANGLE_OK);
  return { across, along, angle, worst, inside: worst <= 1 };
}
/** The bay a car at (x, z, heading) stands rightly in, among those free (or its own), or -1. */
export function bayAt(world: World, id: number, x: number, z: number, heading: number) {
  const car = carOf(world, id),
    kind = car?.kind ?? CAR;
  return world.lot.bays.findIndex((bay, k) => fits(bay, kind) && standing(bay, x, z, heading, dims(car)).inside && !world.cars.some((c) => c.id !== id && c.bay === k && c.state !== "gone" && c.state !== "leaving"));
}
/** The bays no car holds (of those a vehicle of `kind` may park in, if given). */
export const freeBays = (world: World, kind?: number) =>
  world.lot.bays.flatMap((bay, k) => ((kind !== undefined && !fits(bay, kind)) || world.cars.some((c) => c.bay === k && (c.state === "parked" || c.state === "requested")) ? [] : [k]));
/** The cars that wait for the valet: left at the entrance, or asked for by their owners. */
export const jobs = (world: World) => world.cars.filter((c) => c.state === "waiting" || c.state === "requested");
/** What a quick job's tip is: the share of the customer's patience left, of `TIP`. */
const tipOf = (car: Car) => (car.late || car.bumped ? 0 : Math.round(TIP * clamp(car.patience / car.patience0, 0, 1)));

/** The cars the valet on foot meets: every one standing or rolling in the lot. */
const solid = (c: Car) => c.state !== "gone" && c.state !== "leaving" && c.state !== "queue";
/** How far a point is from a turned box's side (0 inside it). */
function fromBox(x: number, z: number, b: Box) {
  const c = Math.cos(b.heading),
    s = Math.sin(b.heading),
    along = (x - b.x) * c + (z - b.z) * s,
    across = -(x - b.x) * s + (z - b.z) * c;
  return Math.hypot(along - clamp(along, -b.l / 2, b.l / 2), across - clamp(across, -b.w / 2, b.w / 2));
}
/** The valet's body put out of a turned box it overlaps: along the shortest way out. */
function outOfBox(v: { x: number; z: number }, b: Box) {
  const c = Math.cos(b.heading),
    s = Math.sin(b.heading),
    along = (v.x - b.x) * c + (v.z - b.z) * s,
    across = -(v.x - b.x) * s + (v.z - b.z) * c,
    na = clamp(along, -b.l / 2, b.l / 2),
    nc = clamp(across, -b.w / 2, b.w / 2),
    far = Math.hypot(along - na, across - nc);
  if (far >= BODY) return false;
  let a = along,
    k = across;
  if (far > 1e-9) {
    a = na + ((along - na) / far) * BODY;
    k = nc + ((across - nc) / far) * BODY;
  } else if (b.l / 2 - Math.abs(along) < b.w / 2 - Math.abs(across)) a = (along >= 0 ? 1 : -1) * (b.l / 2 + BODY);
  else k = (across >= 0 ? 1 : -1) * (b.w / 2 + BODY);
  v.x = b.x + a * c - k * s;
  v.z = b.z + a * s + k * c;
  return true;
}
/** The valet's body kept out of the walls, the pillars, the blocks and the cars (a car rolling in pushes it aside). */
function shove(world: World) {
  const v = world.valet,
    lot = world.lot;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    v.x = clamp(v.x, lot.minX + BODY, lot.maxX - BODY);
    v.z = clamp(v.z, lot.minZ + BODY, lot.maxZ - BODY);
    for (const p of lot.pillars) {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d >= p.r + BODY) continue;
      const [ux, uz] = d > 1e-9 ? [(v.x - p.x) / d, (v.z - p.z) / d] : [0, 1];
      v.x = p.x + ux * (p.r + BODY);
      v.z = p.z + uz * (p.r + BODY);
      moved = true;
    }
    for (const b of lot.blocks) moved = outOfBox(v, { x: b.x, z: b.z, heading: 0, l: b.hx * 2, w: b.hz * 2 }) || moved;
    for (const c of world.cars) if (solid(c) && c.id !== world.hand && Math.hypot(c.x - v.x, c.z - v.z) < dims(c).l) moved = outOfBox(v, boxOf(c)) || moved;
    if (!moved) break;
  }
}
/** Whether the valet's body could stand at (x, z): inside the walls and clear of everything. */
function room(world: World, x: number, z: number) {
  const lot = world.lot;
  if (x < lot.minX + BODY || x > lot.maxX - BODY || z < lot.minZ + BODY || z > lot.maxZ - BODY) return false;
  if (lot.pillars.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + BODY)) return false;
  if (lot.blocks.some((b) => fromBox(x, z, { x: b.x, z: b.z, heading: 0, l: b.hx * 2, w: b.hz * 2 }) < BODY)) return false;
  return !world.cars.some((c) => solid(c) && fromBox(x, z, boxOf(c)) < BODY + 0.02);
}
/** Where the valet stands as it gets out of `car`: by the driver's door (the left), else the other, else by the nose or the tail; the first with room. */
function doorOf(world: World, car: Car) {
  const c = Math.cos(car.heading),
    s = Math.sin(car.heading),
    size = dims(car),
    side = size.w / 2 + BODY + 0.06,
    end = size.l / 2 + BODY + 0.06,
    // A bus's door is at the front, by the driver; a car's and a bike's by the middle.
    at = car.kind === BUS ? size.l / 2 - 1.2 : 0.3,
    spots = [
      [at, -side],
      [at, side],
      [at - 0.9, -side],
      [at - 0.9, side],
      [end, 0],
      [-end, 0],
    ].map(([a, k]) => ({ x: car.x + a * c - k * s, z: car.z + a * s + k * c }));
  // (A spot by a car's own side is clear of it: the car itself is set aside while the spots are tried.)
  const hand = world.hand;
  world.hand = -1;
  const keep = car.state;
  car.state = "gone";
  const spot = spots.find((p) => room(world, p.x, p.z)) ?? null;
  car.state = keep;
  world.hand = hand;
  return spot;
}
/** The cars the valet may get into: a customer's car not yet parked (at the entrance, or left by me on the way) and a car asked for by its owner. */
export const mayDrive = (c: Car) => c.state === "waiting" || c.state === "requested";
/** The car the valet on foot may get into now: the nearest within `REACH` of those it may drive, or null. */
export function reachable(world: World) {
  if (world.over || world.hand >= 0) return null;
  const v = world.valet;
  let best: Car | null = null,
    near = REACH;
  for (const c of world.cars) {
    if (!mayDrive(c)) continue;
    const far = fromBox(v.x, v.z, boxOf(c));
    if (far <= near) [best, near] = [c, far];
  }
  return best;
}
/** Whether a car (its middle) stands within a bay's lines, at whatever angle. */
const within = (bay: Bay, car: Car) => {
  const how = standing(bay, car.x, car.z, car.heading, dims(car));
  return Math.abs(how.across) < bay.w / 2 && Math.abs(how.along) < bay.l / 2;
};
/** The bay a customer names: one that is free, that no other customer has named, and that no car stands in. */
function nameBay(world: World, car: Car) {
  const named = new Set(world.cars.filter((c) => c !== car && c.state === "waiting" && c.want >= 0).map((c) => c.want)),
    open = freeBays(world, car.kind).filter((k) => !named.has(k) && !world.cars.some((c) => c !== car && solid(c) && within(world.lot.bays[k], c)));
  return open.length ? open[Math.floor(draw(world) * open.length)] : -1;
}
/** 탑승: the valet gets into the car within its reach (a customer's car is handed over then, and its bay named). */
export function board(world: World): Happening[] {
  const car = reachable(world);
  if (!car) return [];
  if (car.state === "waiting" && !car.taken) {
    car.taken = true;
    car.want = nameBay(world, car);
  }
  world.hand = car.id;
  world.valet.speed = 0;
  return [{ kind: "take", car: car.id, bay: car.state === "waiting" ? car.want : car.bay }];
}
/** Whether the valet may get out of the car in hand now: it stands (nearly) still. */
export const canAlight = (world: World) => {
  const car = world.hand >= 0 ? carOf(world, world.hand) : null;
  return !!car && !world.over && Math.abs(car.v) < STILL;
};
/** The valet steps out of `car` (by its door, or where there is room) and is on foot again. */
function stepOut(world: World, car: Car) {
  const side = dims(car).w / 2 + BODY,
    spot = doorOf(world, car) ?? { x: car.x - Math.sin(car.heading) * side, z: car.z + Math.cos(car.heading) * side };
  world.hand = -1;
  Object.assign(world.valet, { x: spot.x, z: spot.z, heading: car.heading - Math.PI / 2, speed: 0 });
  shove(world);
}
/**
 * 하차: the valet gets out of the car in hand, which must stand still. A car left with me standing rightly in its
 * named bay is parked and paid; one standing in another bay, or not rightly in its own, keeps the valet at the wheel
 * (told by `wrong`); anywhere else it is left standing, still the customer's job.
 */
export function alight(world: World): Happening[] {
  const car = world.hand >= 0 ? carOf(world, world.hand) : null;
  if (!car || !canAlight(world)) return [];
  const lot = world.lot;
  if (car.state === "waiting") {
    const k = bayAt(world, car.id, car.x, car.z, car.heading);
    if (k >= 0 && (car.want < 0 || k === car.want)) {
      const how = standing(lot.bays[k], car.x, car.z, car.heading, dims(car)),
        tip = tipOf(car),
        tidy = car.bumped ? 0 : Math.min(TIDY, Math.round(TIDY * clamp(1 - how.worst, 0, 1) * 1.25)),
        pay = car.late ? LATE_PAY : PAY + tip + tidy;
      Object.assign(car, { state: "parked", bay: k, v: 0, steer: 0, backAt: world.time + between(world, lot.stay) });
      stepOut(world, car);
      return [{ kind: "parked", car: car.id, bay: k, pay, tip: car.late ? 0 : tip, tidy: car.late ? 0 : tidy }];
    }
    const at = lot.bays.findIndex((bay) => within(bay, car));
    if (at >= 0) return [{ kind: "wrong", car: car.id, bay: car.want, at }];
  }
  car.v = 0;
  stepOut(world, car);
  return [{ kind: "out", car: car.id }];
}

/** One slice of the car in hand: the engine, the brakes, the wheels, and what it meets. */
function drive(world: World, car: Car, input: Input, out: Happening[]) {
  const gas = clamp(input.gas, -1, 1),
    { pull, vMost, vBack, maxSteer, wheelbase } = dims(car);
  let a = 0;
  if (input.handbrake) a = -Math.sign(car.v) * HANDBRAKE;
  else if (gas > 0) a = car.v < -0.05 ? BRAKE : pull * gas * (1 - Math.max(0, car.v) / vMost);
  else if (gas < 0) a = car.v > 0.05 ? -BRAKE : pull * 0.8 * gas * (1 - Math.max(0, -car.v) / vBack);
  else a = -Math.sign(car.v) * (ROLL + 0.25 * Math.abs(car.v));
  const before = car.v;
  car.v += a * DT;
  // Brakes and rolling stop the car; they do not send it the other way.
  if ((input.handbrake || gas === 0 || Math.sign(gas) !== Math.sign(before)) && before !== 0 && Math.sign(car.v) !== Math.sign(before)) car.v = 0;
  car.v = clamp(car.v, -vBack, vMost);
  // The wheels are turned toward where the hands hold them, less far the faster the car goes.
  const want = clamp(input.steer, -1, 1) * maxSteer * (1 - 0.3 * Math.min(1, Math.abs(car.v) / vMost)),
    turn = STEER_RATE * DT;
  car.steer += clamp(want - car.steer, -turn, turn);
  if (car.v === 0) return;
  // The rear axle goes where the car points; the car turns about it by the front wheels' angle.
  const c = Math.cos(car.heading),
    s = Math.sin(car.heading),
    rx = car.x - (wheelbase / 2) * c + car.v * c * DT,
    rz = car.z - (wheelbase / 2) * s + car.v * s * DT,
    heading = car.heading + ((car.v * Math.tan(car.steer)) / wheelbase) * DT,
    x = rx + (wheelbase / 2) * Math.cos(heading),
    z = rz + (wheelbase / 2) * Math.sin(heading);
  if (clear(world, car.id, x, z, heading)) {
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
    out.push({ kind: "bump", car: car.id, strength: clamp(speed / vMost, 0.15, 1), fined });
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
      // (The first lot draws nothing more: it has cars only.)
      let kind = CAR;
      if (lot.bikes + lot.buses > 0) {
        const r = draw(world),
          bus = lot.buses > 0 && r < lot.buses && !world.cars.some((c) => c.kind === BUS && c.state !== "gone") && freeBays(world, BUS).length > 0;
        kind = bus ? BUS : r >= lot.buses && r < lot.buses + lot.bikes ? BIKE : CAR;
      }
      world.cars.push({ id: world.nextId++, x: gateX(lot, { kind }), z: lot.entrance.z, heading: 0, v: 0, steer: 0, kind, style, colour, state: "queue", bay: -1, want: -1, taken: false, patience: lot.patience, patience0: lot.patience, late: false, bumped: false, dents: 0, t: 0, backAt: 0 });
    }
  }
  // The first in the queue rolls in once the entrance is clear (of anything within 1.6 m of where it will stand).
  const first = world.cars.find((c) => c.state === "queue"),
    room = first && { x: entryX(lot, first), z: lot.entrance.z, heading: 0, l: dims(first).l + 3.2, w: dims(first).w + 1 };
  if (first && room && !world.cars.some((c) => c !== first && c.state !== "gone" && c.state !== "queue" && (c.state === "arriving" || boxesTouch(room, boxOf(c))))) {
    first.state = "arriving";
    first.t = 0;
  }
  for (const car of world.cars) {
    if (car.state === "arriving") {
      car.t += DT;
      const p = Math.min(1, car.t / ROLL_IN);
      car.x = gateX(lot, car) + (entryX(lot, car) - gateX(lot, car)) * p * (2 - p);
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
        // A customer whose car has not yet been taken takes it back and drives off.
        const left = car.state === "waiting" && !car.taken && world.hand !== car.id;
        if (left) Object.assign(car, { state: "leaving", t: 0, v: -5 });
        out.push({ kind: "angry", car: car.id, left });
      }
    }
  }
  // The valet on foot goes where the lever leads it, and is kept out of everything (a car rolling in pushes it aside).
  const v = world.valet,
    car = world.hand >= 0 ? carOf(world, world.hand) : null;
  if (!car) {
    const wx = input.walkX ?? 0,
      wz = input.walkZ ?? 0,
      much = Math.hypot(wx, wz);
    v.speed = 0;
    if (much > 0.05) {
      const k = (Math.min(1, much) * WALK * DT) / much;
      v.x += wx * k;
      v.z += wz * k;
      v.heading = Math.atan2(wz, wx);
      v.speed = Math.min(1, much) * WALK;
    }
    shove(world);
    return out;
  }
  drive(world, car, input, out);
  // At the wheel, the valet is where the driver's seat is (on a motorbike, on its saddle; in a bus, at the front).
  const ahead = car.kind === BUS ? dims(car).l / 2 - 1.3 : car.kind === BIKE ? -0.15 : 0,
    left = car.kind === BIKE ? 0 : car.kind === BUS ? 0.75 : 0.35;
  v.x = car.x + Math.cos(car.heading) * ahead + Math.sin(car.heading) * left;
  v.z = car.z + Math.sin(car.heading) * ahead - Math.cos(car.heading) * left;
  if (car.state === "requested") {
    // Asked for: its bay is free again once it is out of it; handed over in the exit's zone.
    if (car.bay >= 0 && Math.hypot(car.x - lot.bays[car.bay].x, car.z - lot.bays[car.bay].z) > 3) car.bay = -1;
    if (Math.abs(car.x - lot.exit.x) <= lot.exit.hx && Math.abs(car.z - lot.exit.z) <= lot.exit.hz) {
      const tip = tipOf(car),
        pay = car.late ? LATE_PAY : PAY + tip;
      const at = doorOf(world, car) ?? { x: car.x - Math.sin(car.heading) * (dims(car).w / 2 + 0.4), z: car.z + Math.cos(car.heading) * (dims(car).w / 2 + 0.4) };
      Object.assign(car, { state: "leaving", bay: -1, t: 0, v: Math.max(4, Math.abs(car.v)), heading: wrap(car.heading), steer: 0 });
      // The owner drives off; the valet is left standing where the door was.
      world.hand = -1;
      Object.assign(v, { x: at.x, z: at.z, speed: 0 });
      shove(world);
      out.push({ kind: "returned", car: car.id, pay, tip: car.late ? 0 : tip });
    }
  }
  return out;
}
