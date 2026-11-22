import { add, between, draw, raySphere, type Clocked } from "./common";
import { RIGS, shotDirection, shotError, type Aim, type Offset, type Vec } from "./layout";

/**
 * A hunt in a wood by a lake at dusk, played in real time (free of Three.js and the DOM). Animals come out at places
 * and times of the world's own draws and then stay: rabbits, deer, boars and now and then a bear walk or hop calmly
 * out of the wood to a spot on the meadow and graze and look about there; ducks fly in and settle on the lake and
 * paddle on the spot; pheasants glide down into the grass. Left alone, an animal goes again of itself after a while
 * (`STAY`), calmly. A shot, hit or miss, startles them: every animal in the place hears the rifle (the meadow and the
 * lake are small for its report), and after a moment's start (`REACT`) the ground game runs for the wood at the nearer
 * side and the birds take off and fly away; the place then stays empty for a while (`QUIET`) before animals come out
 * again. Each kind has its own health; a bullet takes more of it in the head than in the body, least in the legs or
 * wings, and one hit that does not take an animal slows it to a limping crawl or a struggling flutter (`SLOW`), so
 * that a second shot is easy. At no health left it falls over and fades. The rifle holds `MAG` cartridges, works its
 * bolt between shots and reloads by itself; the hunt lasts `SESSION` seconds or as long as the `CARTRIDGES` last.
 */
export type Zone = "head" | "body" | "legs" | "wing";
export const DAMAGE: Record<Zone, number> = { head: 4, body: 2, legs: 1, wing: 1 };
/** How a hit slows an animal (its speed is multiplied by this, never below `SLOWEST` of its own): one hit leaves it
 *  a crawl or a flutter, a leg worst. */
export const SLOW: Record<Zone, number> = { head: 0.25, body: 0.2, legs: 0.12, wing: 0.18 };
export const SLOWEST = 0.06;
export const ZONE_NAME: Record<Zone, string> = { head: "머리", body: "몸통", legs: "다리", wing: "날개" };
/** A sphere of an animal's body in its own frame (x to its right, y up, z ahead), and the zone it belongs to. */
export interface Part {
  x: number;
  y: number;
  z: number;
  r: number;
  zone: Zone;
}
export interface Kind {
  id: "duck" | "pheasant" | "rabbit" | "deer" | "boar" | "bear";
  name: string;
  points: number;
  health: number;
  /** Ground speed walking calmly and running away (m/s); a bird's speed flying calmly and flying off startled. */
  speed: number;
  flee: number;
  bird: boolean;
  parts: Part[];
}
const legs = (x: number, y: number, z: number, r: number): Part[] => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * x, y, z: sz * z, r, zone: "legs" as Zone })));
export const KINDS: Kind[] = [
  {
    id: "duck",
    name: "청둥오리",
    points: 10,
    health: 1,
    speed: 6,
    flee: 7.5,
    bird: true,
    parts: [
      { x: 0, y: 0, z: -0.06, r: 0.16, zone: "body" },
      { x: 0, y: 0, z: 0.12, r: 0.14, zone: "body" },
      { x: 0, y: 0.08, z: 0.33, r: 0.08, zone: "head" },
      { x: -0.32, y: 0.02, z: 0, r: 0.15, zone: "wing" },
      { x: 0.32, y: 0.02, z: 0, r: 0.15, zone: "wing" },
    ],
  },
  {
    id: "pheasant",
    name: "꿩",
    points: 15,
    health: 1,
    speed: 6,
    flee: 8,
    bird: true,
    parts: [
      { x: 0, y: 0, z: 0, r: 0.17, zone: "body" },
      { x: 0, y: 0, z: -0.3, r: 0.1, zone: "body" },
      { x: 0, y: 0.07, z: 0.27, r: 0.08, zone: "head" },
      { x: -0.33, y: 0.02, z: 0.02, r: 0.15, zone: "wing" },
      { x: 0.33, y: 0.02, z: 0.02, r: 0.15, zone: "wing" },
    ],
  },
  {
    id: "rabbit",
    name: "토끼",
    points: 15,
    health: 1,
    speed: 1.3,
    flee: 3.6,
    bird: false,
    parts: [{ x: 0, y: 0.22, z: -0.04, r: 0.17, zone: "body" }, { x: 0, y: 0.38, z: 0.18, r: 0.1, zone: "head" }, ...legs(0.08, 0.08, 0.12, 0.08)],
  },
  {
    id: "deer",
    name: "사슴",
    points: 40,
    health: 4,
    speed: 1.4,
    flee: 4.6,
    bird: false,
    parts: [
      { x: 0, y: 1.05, z: -0.42, r: 0.34, zone: "body" },
      { x: 0, y: 1.05, z: 0.05, r: 0.36, zone: "body" },
      { x: 0, y: 1.12, z: 0.45, r: 0.32, zone: "body" },
      { x: 0, y: 1.62, z: 0.78, r: 0.17, zone: "head" },
      ...legs(0.16, 0.48, 0.42, 0.14),
      ...legs(0.16, 0.18, 0.42, 0.11),
    ],
  },
  {
    id: "boar",
    name: "멧돼지",
    points: 50,
    health: 6,
    speed: 1.3,
    flee: 4,
    bird: false,
    parts: [
      { x: 0, y: 0.6, z: -0.32, r: 0.33, zone: "body" },
      { x: 0, y: 0.62, z: 0.1, r: 0.36, zone: "body" },
      { x: 0, y: 0.55, z: 0.6, r: 0.22, zone: "head" },
      ...legs(0.17, 0.18, 0.34, 0.12),
    ],
  },
  {
    id: "bear",
    name: "곰",
    points: 80,
    health: 8,
    speed: 1.1,
    flee: 3.4,
    bird: false,
    parts: [
      { x: 0, y: 0.95, z: -0.4, r: 0.52, zone: "body" },
      { x: 0, y: 1.0, z: 0.2, r: 0.5, zone: "body" },
      { x: 0, y: 1.08, z: 0.82, r: 0.27, zone: "head" },
      ...legs(0.3, 0.3, 0.45, 0.18),
    ],
  },
];
export const kindOf = (id: Kind["id"]) => KINDS.find((k) => k.id === id)!;
/** The hunt's length (s), cartridges in all and in the magazine, the bolt's and the reload's time (s). */
export const SESSION = 90,
  CARTRIDGES = 20,
  MAG = 5,
  BOLT = 0.55,
  RELOAD = 1.9,
  /** How long a fallen animal lies before it has faded (s); how many animals may be out at once. */
  FADE = 2.6,
  CROWD = 4;
/** The lake: an ellipse on the ground (middle and half-widths, m) and its water's height. It lies across the middle
 *  of the view from the stand, with the meadow before it and the wood on its far shore. */
export const LAKE = { x: 6, z: -34, rx: 27, rz: 15, y: -0.12 };
export const inLake = (x: number, z: number) => ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2 < 1;
/** How far either way the meadow runs before the wood takes the animals in again (m). */
export const EDGE = 46;
/** The boulders on the meadow and at the shore (x, z, size), which the forest lays and no animal stands on. */
export const ROCKS: [number, number, number][] = [
  [-8, -13, 0.9],
  [-21, -18, 1.4],
  [25, -14, 1.1],
  [13, -9, 0.7],
  [-17, -30, 1.2],
  [33, -27, 1.5],
  [-6, -20.5, 0.8],
  [-3, -21.5, 0.5],
  [30, -40, 1.3],
  [-20, -44, 1.6],
];
/** How far to either side of the middle the meadow is seen from the stand at rest at a depth `z` (m), on the widest
 *  screen: animals come out from beyond it and are gone into the wood a little further out. */
export const seen = (z: number) => Math.abs(z) * 1.05 + 1;
/** How long an animal stays at its spot when nothing happens (s), how long it takes to start at a shot, and how long
 *  the place stays empty after a shot before the next animal comes out. */
export const STAY: [number, number] = [9, 17],
  REACT: [number, number] = [0.12, 0.45],
  QUIET: [number, number] = [3.5, 5.5];
/** Coming out to its spot an animal walks with purpose, a little quicker than its calm walk (times its `speed`). */
export const COME = 1.3;
/** A bird on the grass stands this high (its body's middle above the ground). */
export const PERCH = 0.3;
/**
 * What an animal is doing: walking or hopping out to its spot (`come`), a bird flying in to settle (`land`), staying
 * there (`idle` on the ground, `swim` on the water), going again calmly (`leave`, a bird `fly`), running or flying off
 * startled or hurt (`flee`), falling (`fall`) and lying taken (`down`).
 */
export type Doing = "come" | "land" | "idle" | "swim" | "leave" | "fly" | "flee" | "fall" | "down";
/** Staying, an animal grazes (a bird pecks) or lifts its head and looks about. */
export type Mood = "graze" | "look";
export interface Animal {
  id: number;
  kind: Kind["id"];
  /** Its middle on the ground (a bird: its body in the air), the way it faces (radians: 0 toward me, π/2 to my right). */
  p: Vec;
  heading: number;
  /** A bird's velocity; a ground animal's speed is its kind's, times `slow`. */
  v: Vec;
  slow: number;
  health: number;
  doing: Doing;
  /** When it began what it does, and until when it does it (fleeing: until it is off; staying: until it goes). */
  since: number;
  until: number;
  /** The side of the meadow it goes to when it leaves or flees (−1 left, 1 right). */
  side: number;
  /** The spot it comes out to and stays at, the height a bird climbs to, its own phase for wandering. */
  goal: Vec;
  height: number;
  phase: number;
  /** Staying: grazing or looking about, until when, and the way it means to face. */
  mood: Mood;
  moodUntil: number;
  face: number;
  /** Hits taken, and the last zone hit (for the view's limp or flutter). */
  hits: number;
  hurt: Zone | null;
}
export interface HuntWorld extends Clocked {
  kind: "hunt";
  animals: Animal[];
  nextSpawn: number;
  nextId: number;
  lastBear: number;
  ammo: number;
  mag: number;
  reloadUntil: number;
  boltUntil: number;
  /** Whole seconds told so far, and whether the hunt has run out (of time or cartridges). */
  told: number;
  doneAt: number;
  done: boolean;
}
export type HuntHappening =
  | { kind: "second" }
  | { kind: "shot"; from: Vec; to: Vec; hit: number }
  | { kind: "click" }
  | { kind: "reload" }
  | { kind: "loaded" }
  | { kind: "spawn"; animal: Animal }
  | { kind: "settle"; animal: Animal }
  | { kind: "startle"; animal: Animal }
  | { kind: "takeoff"; animal: Animal }
  | { kind: "wound"; animal: Animal; zone: Zone; at: Vec }
  | { kind: "take"; animal: Animal; zone: Zone; at: Vec; points: number }
  | { kind: "miss"; at: Vec | null; water: boolean }
  | { kind: "escape"; animal: Animal }
  | { kind: "done" };
export function createHunt(seed: number): HuntWorld {
  return { kind: "hunt", t: 0, seed, animals: [], nextSpawn: 0.5, nextId: 1, lastBear: -99, ammo: CARTRIDGES, mag: MAG, reloadUntil: 0, boltUntil: 0, told: 0, doneAt: 0, done: false };
}
/** The way an animal faces, as a unit vector on the ground. */
export const facing = (heading: number) => ({ x: Math.sin(heading), z: Math.cos(heading) });
/** Where a part of an animal is in the world. */
export function partAt(animal: Animal, part: Part): Vec {
  const f = facing(animal.heading),
    // The animal's right is its facing turned a quarter clockwise seen from above.
    rx = -f.z,
    rz = f.x,
    k = animal.kind === "duck" || animal.kind === "pheasant" ? 1.15 : 1;
  return { x: animal.p.x + (rx * part.x + f.x * part.z) * k, y: animal.p.y + part.y * k, z: animal.p.z + (rz * part.x + f.z * part.z) * k };
}
/** Whether an animal is still on its feet or wings (not falling, not lying taken). */
export const standing = (a: Animal) => a.doing !== "fall" && a.doing !== "down";
/** Whether an animal is out in the place to stay (coming, settling or staying), not going. */
export const staying = (a: Animal) => a.doing === "come" || a.doing === "land" || a.doing === "idle" || a.doing === "swim";
/** Draws the kind of the next animal: birds and small game most often, a bear seldom and not too soon. */
function nextKind(world: HuntWorld): Kind["id"] {
  const weights: [Kind["id"], number][] = [["duck", 24], ["pheasant", 16], ["rabbit", 20], ["deer", 22], ["boar", 12], ["bear", world.t > 20 && world.t - world.lastBear > 40 ? 9 : 0]],
    total = weights.reduce((s, [, w]) => s + w, 0);
  let pick = draw(world) * total;
  for (const [id, w] of weights) if ((pick -= w) < 0) return id;
  return "deer";
}
/** The angle `d` brought within ±π. */
const wrap = (d: number) => {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
/** A heading turned toward `want` by at most `rate` × `dt`. */
const turnToward = (heading: number, want: number, rate: number, dt: number) => {
  const d = wrap(want - heading);
  return heading + Math.max(-rate * dt, Math.min(rate * dt, d));
};
/**
 * A spot for an animal of `id` to stay at, in view from the stand at rest and clear of the rocks, the water and the
 * spots of the others: on the meadow at the depths its kind keeps (a rabbit nearest), a duck on the lake.
 */
function spotFor(world: HuntWorld, id: Kind["id"], side: number): Vec {
  const depth: Record<Kind["id"], [number, number]> = { duck: [LAKE.z + LAKE.rz * 0.5, LAKE.z - LAKE.rz * 0.45], pheasant: [-6.5, -15], rabbit: [-7, -13], deer: [-10, -17.5], boar: [-9, -16], bear: [-11, -17.5] },
    clear = (x: number, z: number) =>
      (id === "duck" ? ((x - LAKE.x) / (LAKE.rx * 0.8)) ** 2 + ((z - LAKE.z) / (LAKE.rz * 0.8)) ** 2 < 1 : !inLake(x, z) && ((x - LAKE.x) / (LAKE.rx * 1.12)) ** 2 + ((z - LAKE.z) / (LAKE.rz * 1.12)) ** 2 > 1) &&
      ROCKS.every(([rx, rz, s]) => Math.hypot(x - rx, z - rz) > s + 1.2) &&
      world.animals.every((a) => !staying(a) || Math.hypot(x - a.goal.x, z - a.goal.z) > 2.6);
  let x = 0,
    z = 0;
  for (let k = 0; k < 12; k++) {
    z = between(world, depth[id][0], depth[id][1]);
    // On its own side of the view mostly, now and then a little past the middle.
    x = side * Math.abs(z) * between(world, -0.1, 0.58);
    if (clear(x, z)) break;
  }
  return { x, y: id === "duck" ? LAKE.y + 0.12 : id === "pheasant" ? PERCH : 0, z };
}
/** An animal of `id` come out where its kind comes out, on its way to its spot. */
export function spawn(world: HuntWorld, id: Kind["id"]): Animal {
  const kind = kindOf(id),
    side = draw(world) < 0.5 ? -1 : 1,
    goal = spotFor(world, id, side),
    base = {
      id: world.nextId++,
      kind: id,
      v: { x: 0, y: 0, z: 0 },
      slow: 1,
      health: kind.health,
      since: world.t,
      until: Infinity,
      phase: between(world, 0, 6.28),
      hits: 0,
      hurt: null,
      side,
      goal,
      mood: "look" as Mood,
      moodUntil: 0,
      face: 0,
    };
  if (id === "bear") world.lastBear = world.t;
  if (kind.bird) {
    // From high over the wood at one side, gliding down to the water or the grass.
    const p = { x: goal.x + side * between(world, 26, 36), y: between(world, 8, 12), z: goal.z + between(world, -6, 4) };
    return { ...base, p, heading: Math.atan2(goal.x - p.x, goal.z - p.z), doing: "land", height: between(world, 9, 15) };
  }
  // Out of the wood at the side of the meadow, beyond what is seen from the stand.
  const z = goal.z + between(world, -1.5, 1.5),
    p = { x: side * (seen(z) + between(world, 0.5, 2.5)), y: 0, z };
  return { ...base, p, heading: Math.atan2(goal.x - p.x, goal.z - p.z), doing: "come", height: 0 };
}
/** Settled at its spot: it stays a while, grazing first. */
function settle(world: HuntWorld, a: Animal) {
  a.p = { ...a.goal };
  a.v = { x: 0, y: 0, z: 0 };
  a.doing = a.kind === "duck" ? "swim" : "idle";
  a.since = world.t;
  a.until = world.t + between(world, STAY[0], STAY[1]);
  a.mood = "graze";
  a.moodUntil = world.t + between(world, 1.5, 4);
  a.face = a.heading;
}
/** A bird off the water or the grass: up and away to its side, steeply when startled. */
function takeOff(world: HuntWorld, animal: Animal, scared: boolean) {
  const kind = kindOf(animal.kind),
    speed = scared ? kind.flee : kind.speed;
  animal.side = animal.p.x >= 0 ? 1 : -1;
  animal.doing = scared ? "flee" : "fly";
  animal.since = world.t;
  animal.until = world.t;
  animal.v = { x: animal.side * speed * 0.55, y: scared ? 5.5 : 3.4, z: -speed * between(world, 0.15, 0.4) };
}
/** One slice of one animal's life. */
function live(world: HuntWorld, a: Animal, dt: number, out: HuntHappening[]) {
  const kind = kindOf(a.kind),
    t = world.t;
  if (a.doing === "fall") {
    if (kind.bird) {
      // A bird falls out of the air, onto the grass or the water.
      a.v = { x: a.v.x * (1 - 0.6 * dt), y: a.v.y - 9.81 * dt, z: a.v.z * (1 - 0.6 * dt) };
      a.p = add(a.p, a.v, dt);
      const floor = inLake(a.p.x, a.p.z) ? LAKE.y + 0.05 : 0.15;
      if (a.p.y <= floor) {
        a.p.y = floor;
        a.v = { x: 0, y: 0, z: 0 };
        a.doing = "down";
        a.since = t;
      }
    } else if (t - a.since > 0.8) {
      a.doing = "down";
      a.since = t;
    }
    return true;
  }
  if (a.doing === "down") return t - a.since < FADE;
  if (a.doing === "idle" || a.doing === "swim") {
    // Staying: grazing or looking about by turns, turning a little now and then; a duck paddles about its spot.
    if (t >= a.moodUntil) {
      a.mood = a.mood === "graze" ? "look" : "graze";
      a.moodUntil = t + (a.mood === "graze" ? between(world, 2, 5) : between(world, 1.2, 3));
      if (a.mood === "look") a.face = a.heading + between(world, -0.7, 0.7);
    }
    if (a.doing === "swim") {
      const r = Math.min(1, (t - a.since) / 3) * 0.45,
        u = (t - a.since) * 0.2 + a.phase,
        x = a.goal.x + r * Math.sin(u),
        z = a.goal.z + r * 0.6 * Math.sin(2 * u) + r * 0.3 * Math.sin(a.phase);
      if (Math.hypot(x - a.p.x, z - a.p.z) > 1e-5) a.heading = turnToward(a.heading, Math.atan2(x - a.p.x, z - a.p.z), 0.8, dt);
      a.p.x = x;
      a.p.z = z;
    } else a.heading = turnToward(a.heading, a.face, 0.9, dt);
    if (t >= a.until) {
      // Nothing has happened for a while: it goes again, calmly.
      if (kind.bird) {
        takeOff(world, a, false);
        out.push({ kind: "takeoff", animal: a });
      } else {
        a.doing = "leave";
        a.since = t;
        a.side = a.p.x >= 0 ? 1 : -1;
      }
    }
    return true;
  }
  if (a.doing === "land") {
    // Gliding in to its spot along a gentle slope, slowing as it comes down.
    const to = { x: a.goal.x - a.p.x, z: a.goal.z - a.p.z },
      h = Math.hypot(to.x, to.z),
      speed = Math.min(kind.speed, 0.9 + h * 0.45);
    if (h <= Math.max(0.05, speed * dt * 1.5)) {
      settle(world, a);
      out.push({ kind: "settle", animal: a });
      return true;
    }
    const want = { x: (to.x / h) * speed, y: Math.max(-3.5, Math.min(2, (a.goal.y + h * 0.32 - a.p.y) * 1.6)), z: (to.z / h) * speed },
      k = Math.min(1, dt * 3);
    a.v = { x: a.v.x + (want.x - a.v.x) * k, y: a.v.y + (want.y - a.v.y) * k, z: a.v.z + (want.z - a.v.z) * k };
    a.p = add(a.p, a.v, dt);
    a.p.y = Math.max(a.goal.y, a.p.y);
    a.heading = turnToward(a.heading, Math.atan2(to.x, to.z), 3, dt);
    return true;
  }
  if (kind.bird) {
    // Flying away: climbing to its height, curving a little; slowed and sinking when hurt.
    const climb = a.p.y < a.height ? 4.5 : -0.4,
      want = (a.doing === "flee" ? kind.flee : kind.speed) * a.slow,
      flat = Math.hypot(a.v.x, a.v.z) || 1,
      turn = Math.sin(t * 0.35 + a.phase) * 0.25 * dt,
      c = Math.cos(turn),
      s = Math.sin(turn),
      vx = a.v.x * c - a.v.z * s,
      vz = a.v.x * s + a.v.z * c,
      speedUp = 1 + (want / flat - 1) * Math.min(1, dt * 1.5);
    a.v = { x: vx * speedUp, y: a.v.y + ((a.hurt ? Math.min(climb, 0.6) - 0.8 : climb) - a.v.y) * Math.min(1, dt * 1.2), z: vz * speedUp };
    a.p = add(a.p, a.v, dt);
    a.heading = Math.atan2(a.v.x, a.v.z);
    if (a.p.y < 1.2 && a.hurt) a.v.y = Math.max(a.v.y, 0.8);
    if (Math.abs(a.p.x) > 80 || a.p.z < -140 || a.p.z > 8 || a.p.y > 45 || t - a.since > (a.hurt ? 30 : 16)) {
      out.push({ kind: "escape", animal: a });
      return false;
    }
    return true;
  }
  // On the ground: coming out to its spot, going again calmly, or running for the wood (after a moment's start).
  if (a.doing === "flee" && t < a.until) {
    a.heading = turnToward(a.heading, Math.atan2(a.side, -0.4), 2.5, dt);
    return true;
  }
  const hop = a.kind === "rabbit" ? 0.35 + 1.3 * Math.abs(Math.sin(t * (a.doing === "flee" ? 5.5 : 3.2) + a.phase)) : 1,
    speed = (a.doing === "flee" ? kind.flee : a.doing === "come" ? kind.speed * COME : kind.speed) * a.slow * hop;
  let want: number;
  if (a.doing === "come") {
    const to = { x: a.goal.x - a.p.x, z: a.goal.z - a.p.z },
      h = Math.hypot(to.x, to.z);
    if (h <= Math.max(0.05, speed * dt * 1.5)) {
      settle(world, a);
      out.push({ kind: "settle", animal: a });
      return true;
    }
    want = Math.atan2(to.x, to.z);
  } else {
    // Along the meadow toward its side, keeping its depth (fleeing, bending away from me).
    const wantZ = a.doing === "flee" ? a.goal.z - 4 : a.goal.z;
    want = Math.atan2(a.side, Math.max(-0.9, Math.min(0.9, (wantZ - a.p.z) / 8)));
  }
  a.heading = turnToward(a.heading, want, a.doing === "flee" ? 3 : 1.6, dt);
  a.p.x += Math.sin(a.heading) * speed * dt;
  a.p.z += Math.cos(a.heading) * speed * dt;
  if (inLake(a.p.x, a.p.z)) a.p.z = Math.max(a.p.z, LAKE.z + LAKE.rz * Math.sqrt(Math.max(0, 1 - ((a.p.x - LAKE.x) / LAKE.rx) ** 2)) + 0.5);
  if (a.doing !== "come" && (Math.abs(a.p.x) > seen(a.p.z) + 6 || a.p.z < -60)) {
    out.push({ kind: "escape", animal: a });
    return false;
  }
  return true;
}
/**
 * The rifle's report: every animal on its feet hears it (the place is small for a rifle) and is off, the ground game
 * after a moment's start, birds at once; nothing comes out for a while after.
 */
function startle(world: HuntWorld, out: HuntHappening[]) {
  for (const a of world.animals) {
    if (!standing(a) || a.doing === "flee") continue;
    if (kindOf(a.kind).bird) {
      if (a.doing === "fly") a.doing = "flee";
      else takeOff(world, a, true);
      out.push({ kind: "takeoff", animal: a });
    } else {
      a.doing = "flee";
      a.since = world.t;
      a.until = world.t + between(world, REACT[0], REACT[1]);
      a.side = a.p.x >= 0 ? 1 : -1;
      out.push({ kind: "startle", animal: a });
    }
  }
  world.nextSpawn = Math.max(world.nextSpawn, world.t + between(world, QUIET[0], QUIET[1]));
}
/** The trigger pulled with the rifle along `aim` and the rear sight off by `offset`. */
export function fireHunt(world: HuntWorld, aim: Aim, offset: Offset): HuntHappening[] {
  if (world.done || world.ammo <= 0 || world.mag <= 0 || world.t < world.reloadUntil || world.t < world.boltUntil) return [{ kind: "click" }];
  world.ammo--;
  world.mag--;
  world.boltUntil = world.t + BOLT;
  const from = RIGS.hunt.pivot,
    d = shotDirection(aim, shotError("hunt", offset));
  // Each animal is struck in the part the line passes through that counts most (a thin wing or a leg before the body
  // does not shield it: the head, then the body, then the limbs); of several animals, the nearest is struck.
  const RANK: Record<Zone, number> = { head: 0, body: 1, legs: 2, wing: 2 };
  let best: { animal: Animal; part: Part; s: number } | null = null;
  for (const animal of world.animals) {
    if (!standing(animal)) continue;
    let mine: { part: Part; s: number } | null = null;
    for (const part of kindOf(animal.kind).parts) {
      const r = part.r * (kindOf(animal.kind).bird ? 1.15 : 1),
        s = raySphere(from, d, partAt(animal, part), r);
      if (s !== null && (!mine || RANK[part.zone] < RANK[mine.part.zone] || (RANK[part.zone] === RANK[mine.part.zone] && s < mine.s))) mine = { part, s };
    }
    if (mine && (!best || mine.s < best.s)) best = { animal, ...mine };
  }
  const out: HuntHappening[] = [];
  if (best) {
    const { animal, part, s } = best,
      at = add(from, d, s);
    out.push({ kind: "shot", from: { ...from }, to: at, hit: animal.id });
    animal.hits++;
    animal.hurt = part.zone;
    animal.health -= DAMAGE[part.zone];
    animal.slow = Math.max(SLOWEST, animal.slow * SLOW[part.zone]);
    if (animal.health <= 0) {
      animal.health = 0;
      animal.doing = "fall";
      animal.since = world.t;
      if (!kindOf(animal.kind).bird) animal.v = { x: 0, y: 0, z: 0 };
      out.push({ kind: "take", animal, zone: part.zone, at, points: kindOf(animal.kind).points });
    } else {
      // Hurt, it is off at once, at a crawl (a bird on the water or the grass struggles up and flutters away).
      if (kindOf(animal.kind).bird) {
        if (animal.doing !== "fly" && animal.doing !== "flee") takeOff(world, animal, true);
      } else animal.side = animal.p.x >= 0 ? 1 : -1;
      animal.doing = "flee";
      animal.since = world.t;
      animal.until = world.t;
      out.push({ kind: "wound", animal, zone: part.zone, at });
    }
  } else {
    // Where the bullet lands: the grass or the water, if it comes down within the meadow.
    const s = d.y < 0 ? (0 - from.y) / d.y : -1,
      at = s > 0 && s < 160 ? add(from, d, s) : null;
    out.push({ kind: "shot", from: { ...from }, to: at ?? add(from, d, 160), hit: -1 });
    out.push({ kind: "miss", at, water: !!at && inLake(at.x, at.z) });
  }
  // Hit or miss, the report startles every animal still on its feet.
  startle(world, out);
  if (world.mag <= 0 && world.ammo > 0) {
    world.reloadUntil = world.t + RELOAD;
    out.push({ kind: "reload" });
  }
  return out;
}
/** One slice of the wood's time. */
export function stepHunt(world: HuntWorld, dt: number): HuntHappening[] {
  const out: HuntHappening[] = [];
  world.t += dt;
  while (world.told + 1 <= world.t && world.told < SESSION) {
    world.told++;
    out.push({ kind: "second" });
  }
  if (world.reloadUntil && world.t >= world.reloadUntil) {
    world.reloadUntil = 0;
    world.mag = Math.min(MAG, world.ammo);
    out.push({ kind: "loaded" });
  }
  world.animals = world.animals.filter((a) => live(world, a, dt, out));
  if (world.done) return out;
  // Animals come out one after another until `CROWD` are out to stay (fewer while others are still running off).
  if (world.t >= world.nextSpawn && world.t < SESSION - 4) {
    const present = world.animals.filter(staying).length,
      about = world.animals.filter(standing).length;
    if (present < CROWD && about < CROWD + 2) {
      const animal = spawn(world, world.animals.length === 0 && world.t < 2 ? "deer" : nextKind(world));
      world.animals.push(animal);
      out.push({ kind: "spawn", animal });
    }
    world.nextSpawn = world.t + (present < 2 ? between(world, 1, 2.2) : between(world, 2.6, 5));
  }
  // The last cartridge spent: the hunt is over once what it struck has fallen.
  if (world.ammo <= 0 && !world.animals.some((a) => a.doing === "fall")) {
    if (!world.doneAt) world.doneAt = world.t + 1.4;
    else if (world.t >= world.doneAt) {
      world.done = true;
      out.push({ kind: "done" });
    }
  }
  return out;
}
