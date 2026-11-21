import { add, between, draw, raySphere, type Clocked } from "./common";
import { RIGS, shotDirection, shotError, type Aim, type Offset, type Vec } from "./layout";

/**
 * A hunt in a wood by a lake at dusk, played in real time (free of Three.js and the DOM). Animals come out at places
 * and times of the world's own draws, from birds to bears: ducks swim on the lake and take off, pheasants burst out
 * of the grass, rabbits, deer, boars and now and then a bear cross the meadow, and each leaves again if it is not
 * taken. Each kind has its own health; a bullet takes more of it in the head than in the body, least in the legs or
 * wings, and a hit slows the animal (the legs most: it limps, or a bird flutters) and sets it fleeing. At no health
 * left it falls over and fades. The rifle holds `MAG` cartridges, works its bolt between shots and reloads by itself;
 * the hunt lasts `SESSION` seconds or as long as the `CARTRIDGES` last.
 */
export type Zone = "head" | "body" | "legs" | "wing";
export const DAMAGE: Record<Zone, number> = { head: 4, body: 2, legs: 1, wing: 1 };
/** How a hit slows an animal (its speed is multiplied by this, never below `SLOWEST` of its own). */
export const SLOW: Record<Zone, number> = { head: 0.9, body: 0.8, legs: 0.5, wing: 0.55 };
export const SLOWEST = 0.25;
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
  /** Ground speed walking and fleeing (m/s), or a bird's speed in the air. */
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
    health: 2,
    speed: 9,
    flee: 11,
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
    health: 2,
    speed: 11,
    flee: 13,
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
    health: 2,
    speed: 3.4,
    flee: 6.5,
    bird: false,
    parts: [{ x: 0, y: 0.22, z: -0.04, r: 0.17, zone: "body" }, { x: 0, y: 0.38, z: 0.18, r: 0.1, zone: "head" }, ...legs(0.08, 0.08, 0.12, 0.08)],
  },
  {
    id: "deer",
    name: "사슴",
    points: 40,
    health: 6,
    speed: 2.1,
    flee: 7,
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
    health: 8,
    speed: 2.5,
    flee: 6.2,
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
    health: 14,
    speed: 1.5,
    flee: 4.6,
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
/** The lake: an ellipse on the ground (middle and half-widths, m) and its water's height. */
export const LAKE = { x: 8, z: -47, rx: 30, rz: 11, y: -0.12 };
export const inLake = (x: number, z: number) => ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2 < 1;
/** How far either way the meadow runs before the wood takes the animals in again (m). */
export const EDGE = 46;
export type Doing = "walk" | "graze" | "flee" | "swim" | "fly" | "fall" | "down";
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
  /** When it began what it does, and when it next changes its mind; which way it means to leave (−1 left, 1 right). */
  since: number;
  until: number;
  side: number;
  /** Where it means to stay across (z), the height a bird climbs to, its own phase for wandering. */
  lane: number;
  height: number;
  phase: number;
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
  | { kind: "takeoff"; animal: Animal }
  | { kind: "wound"; animal: Animal; zone: Zone; at: Vec }
  | { kind: "take"; animal: Animal; zone: Zone; at: Vec; points: number }
  | { kind: "miss"; at: Vec | null; water: boolean }
  | { kind: "escape"; animal: Animal }
  | { kind: "done" };
export function createHunt(seed: number): HuntWorld {
  return { kind: "hunt", t: 0, seed, animals: [], nextSpawn: 0.7, nextId: 1, lastBear: -99, ammo: CARTRIDGES, mag: MAG, reloadUntil: 0, boltUntil: 0, told: 0, doneAt: 0, done: false };
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
/** Draws the kind of the next animal: birds and small game most often, a bear seldom and not too soon. */
function nextKind(world: HuntWorld): Kind["id"] {
  const weights: [Kind["id"], number][] = [["duck", 26], ["pheasant", 16], ["rabbit", 20], ["deer", 20], ["boar", 12], ["bear", world.t > 20 && world.t - world.lastBear > 40 ? 9 : 0]],
    total = weights.reduce((s, [, w]) => s + w, 0);
  let pick = draw(world) * total;
  for (const [id, w] of weights) if ((pick -= w) < 0) return id;
  return "deer";
}
/** An animal of `id` come out where its kind comes out. */
export function spawn(world: HuntWorld, id: Kind["id"]): Animal {
  const kind = kindOf(id),
    side = draw(world) < 0.5 ? -1 : 1,
    base = { id: world.nextId++, kind: id, v: { x: 0, y: 0, z: 0 }, slow: 1, health: kind.health, since: world.t, phase: between(world, 0, 6.28), hits: 0, hurt: null, side, height: 0 };
  if (id === "bear") world.lastBear = world.t;
  if (id === "duck") {
    // On the lake, swimming a while before it takes off.
    let x = 0,
      z = 0;
    do {
      x = between(world, LAKE.x - LAKE.rx * 0.8, LAKE.x + LAKE.rx * 0.8);
      z = between(world, LAKE.z - LAKE.rz * 0.6, LAKE.z + LAKE.rz * 0.6);
    } while (!inLake(x, z));
    return { ...base, p: { x, y: LAKE.y + 0.12, z }, heading: side * Math.PI * 0.5, doing: "swim", until: world.t + between(world, 1.4, 3.2), lane: z, height: between(world, 9, 15) };
  }
  if (id === "pheasant") {
    // Out of the grass at once, climbing steeply.
    const p = { x: between(world, -18, 18), y: 0.3, z: between(world, -12, -27) };
    return { ...base, p, heading: side * Math.PI * 0.5, doing: "fly", until: world.t + 30, lane: p.z, height: between(world, 5.5, 9), v: { x: side * kind.speed * 0.55, y: 6.5, z: between(world, -3, -1) } };
  }
  // From the wood at one side of the meadow, across to the other.
  const near = id === "rabbit",
    lane = near ? between(world, -10, -20) : between(world, -16, -31),
    x = near && draw(world) < 0.6 ? side * between(world, 12, 26) : side * EDGE;
  return { ...base, p: { x, y: 0, z: lane }, heading: -side * Math.PI * 0.5, side: -side, doing: "walk", until: world.t + between(world, 2.5, 5), lane, height: 0 };
}
/** A bird taking off from the water: up and away across the lake. */
function takeOff(world: HuntWorld, animal: Animal) {
  const kind = kindOf(animal.kind);
  animal.doing = "fly";
  animal.since = world.t;
  animal.until = world.t + 30;
  animal.v = { x: animal.side * kind.speed * 0.8, y: 4.2, z: between(world, -2, 3) };
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
  if (a.doing === "swim") {
    a.p.x += Math.sin(a.heading) * 0.35 * dt;
    a.p.z += Math.cos(a.heading) * 0.35 * dt;
    a.heading += Math.sin(t * 0.7 + a.phase) * 0.4 * dt;
    if (t >= a.until) {
      takeOff(world, a);
      out.push({ kind: "takeoff", animal: a });
    }
    return true;
  }
  if (kind.bird) {
    // Climbing to its height, curving a little, slowed and sinking when hurt.
    const climb = a.p.y < a.height ? 4.5 : -0.4,
      want = kind.speed * (a.doing === "flee" ? kind.flee / kind.speed : 1) * a.slow,
      flat = Math.hypot(a.v.x, a.v.z) || 1,
      turn = Math.sin(t * 0.35 + a.phase) * 0.25 * dt,
      c = Math.cos(turn),
      s = Math.sin(turn),
      vx = a.v.x * c - a.v.z * s,
      vz = a.v.x * s + a.v.z * c,
      speedUp = 1 + (want / flat - 1) * Math.min(1, dt * 1.5);
    a.v = { x: vx * speedUp, y: a.v.y + ((a.hurt ? climb - 1.2 : climb) - a.v.y) * Math.min(1, dt * 1.2), z: vz * speedUp };
    a.p = add(a.p, a.v, dt);
    a.heading = Math.atan2(a.v.x, a.v.z);
    if (a.p.y < 1.2 && a.hurt) a.v.y = Math.max(a.v.y, 0.8);
    if (Math.abs(a.p.x) > 80 || a.p.z < -140 || a.p.z > 8 || a.p.y > 45 || t - a.since > 16) {
      out.push({ kind: "escape", animal: a });
      return false;
    }
    return true;
  }
  // A ground animal walks across, now and then stopping to graze; fleeing, it runs for the nearer side.
  if (a.doing === "graze") {
    if (t >= a.until) {
      a.doing = "walk";
      a.until = t + between(world, 2.5, 6);
    }
    return true;
  }
  if (a.doing === "walk" && t >= a.until && a.kind !== "rabbit" && draw(world) < 0.55) {
    a.doing = "graze";
    a.until = t + between(world, 1.1, 2.6);
    return true;
  }
  if (a.doing === "walk" && t >= a.until) a.until = t + between(world, 2.5, 6);
  const running = a.doing === "flee",
    gait = a.kind === "rabbit" ? 0.35 + 1.3 * Math.abs(Math.sin(t * 5.5 + a.phase)) : 1,
    speed = (running ? kind.flee : kind.speed) * a.slow * gait,
    // It keeps near its lane while walking, and bends away from me while fleeing.
    wantZ = running ? a.lane - 5 : a.lane + Math.sin(t * 0.3 + a.phase) * 2.5,
    // The way it wants: along the meadow toward its side, turned toward the depth it wants.
    want = Math.atan2(a.side, Math.max(-0.9, Math.min(0.9, (wantZ - a.p.z) / 8)));
  let d = want - a.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  a.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, d));
  a.p.x += Math.sin(a.heading) * speed * dt;
  a.p.z += Math.cos(a.heading) * speed * dt;
  if (inLake(a.p.x, a.p.z)) a.p.z = Math.max(a.p.z, LAKE.z + LAKE.rz * Math.sqrt(Math.max(0, 1 - ((a.p.x - LAKE.x) / LAKE.rx) ** 2)) + 0.5);
  if (Math.abs(a.p.x) > EDGE + 4 || a.p.z < -60) {
    out.push({ kind: "escape", animal: a });
    return false;
  }
  return true;
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
    if (animal.doing === "fall" || animal.doing === "down") continue;
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
      // Hurt, it flees (a bird on the water takes off at once).
      if (animal.doing === "swim") takeOff(world, animal);
      if (!kindOf(animal.kind).bird) animal.side = animal.p.x >= 0 ? 1 : -1;
      animal.doing = "flee";
      animal.since = world.t;
      out.push({ kind: "wound", animal, zone: part.zone, at });
    }
  } else {
    // Where the bullet lands: the grass or the water, if it comes down within the meadow.
    const s = d.y < 0 ? (0 - from.y) / d.y : -1,
      at = s > 0 && s < 160 ? add(from, d, s) : null;
    out.push({ kind: "shot", from: { ...from }, to: at ?? add(from, d, 160), hit: -1 });
    out.push({ kind: "miss", at, water: !!at && inLake(at.x, at.z) });
  }
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
  const standing = world.animals.filter((a) => a.doing !== "fall" && a.doing !== "down").length;
  if (world.t >= world.nextSpawn && world.t < SESSION - 4) {
    if (standing < CROWD) {
      const animal = spawn(world, world.animals.length === 0 && world.t < 2 ? "duck" : nextKind(world));
      world.animals.push(animal);
      out.push({ kind: "spawn", animal });
    }
    world.nextSpawn = world.t + between(world, 2.6, 5.2);
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
