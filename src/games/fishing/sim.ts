import type { Random } from "../../core/random";

/**
 * The lake, free of Three.js and the page: a float cast out from the pier, fish that come and nibble and then bite,
 * the strike, and the fight on the line (the reel, the tension, the fish's surges). The view steps it in fixed slices
 * of `DT` and passes on what the hand does (`cast`, `press`, `release`); what happens comes back as `Happening`s,
 * the ones that count reported to the rules as moves.
 *
 * The water is the plane y = 0; the pier runs toward +z and ends at z = 0; the far shore lies toward −z.
 */
export const DT = 1 / 60;
/** One kind of catch: its name, its sizes in cm, points per cm, how hard it pulls, how often it surges, how often it comes at each level. */
export interface Kind {
  name: string;
  min: number;
  max: number;
  /** Points a centimetre (a fish); junk is worth `flat`. */
  worth: number;
  flat?: number;
  /** How hard it pulls (0 for junk, which does not fight), and how often it surges (1 the usual). */
  pull: number;
  lively: number;
  junk?: boolean;
  weight: [number, number, number];
  /** Where it is caught: the lake, the sea, or both (a can is everywhere). */
  water: "lake" | "sea" | "both";
}
export const CRUCIAN = 0,
  CARP = 1,
  TROUT = 2,
  CATFISH = 3,
  GOLDEN = 4,
  CAN = 5,
  BOOT = 6,
  HORSE_MACKEREL = 7,
  MACKEREL = 8,
  ROCKFISH = 9,
  PORGY = 10,
  FLATFISH = 11,
  SEABREAM = 12,
  YELLOWTAIL = 13,
  TUNA = 14,
  STARFISH = 15;
export const KINDS: Kind[] = [
  { name: "붕어", min: 12, max: 32, worth: 0.5, pull: 0.3, lively: 0.85, weight: [46, 40, 34], water: "lake" },
  { name: "잉어", min: 30, max: 72, worth: 0.6, pull: 0.62, lively: 1, weight: [17, 19, 20], water: "lake" },
  { name: "송어", min: 25, max: 58, worth: 0.7, pull: 0.5, lively: 1.4, weight: [13, 15, 16], water: "lake" },
  { name: "메기", min: 40, max: 95, worth: 0.6, pull: 0.95, lively: 0.8, weight: [7, 9, 12], water: "lake" },
  { name: "황금 잉어", min: 40, max: 80, worth: 1.6, pull: 0.75, lively: 1.15, weight: [3, 3, 4], water: "lake" },
  { name: "빈 깡통", min: 11, max: 13, worth: 0, flat: 0, pull: 0, lively: 0, junk: true, weight: [7, 7, 7], water: "both" },
  { name: "장화", min: 26, max: 30, worth: 0, flat: 1, pull: 0, lively: 0, junk: true, weight: [7, 7, 7], water: "lake" },
  // The sea (the user asked: many kinds, from big to small): small and common, then ever larger and rarer, the tuna
  // the giant of them, rare and very strong.
  { name: "전갱이", min: 15, max: 32, worth: 0.6, pull: 0.38, lively: 1.25, weight: [30, 25, 21], water: "sea" },
  { name: "고등어", min: 25, max: 46, worth: 0.6, pull: 0.5, lively: 1.5, weight: [22, 20, 18], water: "sea" },
  { name: "우럭", min: 20, max: 52, worth: 0.7, pull: 0.58, lively: 0.8, weight: [15, 15, 14], water: "sea" },
  { name: "감성돔", min: 25, max: 58, worth: 0.9, pull: 0.72, lively: 1, weight: [9, 10, 11], water: "sea" },
  { name: "광어", min: 35, max: 85, worth: 0.8, pull: 0.85, lively: 0.7, weight: [7, 8, 9], water: "sea" },
  { name: "참돔", min: 35, max: 95, worth: 1, pull: 0.92, lively: 1.1, weight: [5, 6, 7], water: "sea" },
  { name: "방어", min: 50, max: 115, worth: 1, pull: 1.1, lively: 1.3, weight: [3, 4, 5], water: "sea" },
  { name: "참치", min: 90, max: 210, worth: 1.3, pull: 1.35, lively: 1.2, weight: [1, 1.5, 2], water: "sea" },
  { name: "불가사리", min: 14, max: 26, worth: 0, flat: 1, pull: 0, lively: 0, junk: true, weight: [5, 5, 5], water: "sea" },
];
/** Whether `kind` is caught in the sea (`sea`) or the lake. */
export const caughtIn = (kind: number, sea: boolean) => {
  const water = KINDS[kind]?.water;
  return water === "both" || water === (sea ? "sea" : "lake");
};
/**
 * The sea against the lake (the user asked: longer to bring in, and wilder): its fish come in at `reel` of the
 * pace, surge with `power` more strength, for `length` times as long, `gap` times as often apart, and run `run`
 * times as fast.
 */
export const SEA = { reel: 0.55, power: 1.3, length: 1.6, gap: 0.75, run: 1.35 };
/** What a catch of `kind` and `size` cm is worth. */
export const pointsOf = (kind: number, size: number) => {
  const k = KINDS[kind];
  return k.junk ? (k.flat ?? 0) : Math.max(1, Math.round(size * k.worth));
};
/** By level: how long the float stays under at a bite, a surge's strength, the time between surges, nibbles before a bite, the wait for a fish. */
export const LEVELS = [
  { bite: 1.0, power: 0.65, gap: [3.4, 5.6], nibbles: [1, 2], wait: [1.2, 3.4] },
  { bite: 0.7, power: 0.9, gap: [2.5, 4.4], nibbles: [1, 3], wait: [1.5, 4.2] },
  { bite: 0.45, power: 1.15, gap: [1.7, 3.2], nibbles: [2, 4], wait: [1.8, 5.0] },
];
/** Where a cast may land: from `near` to `far` out from the pier, no further to the side than `side` (and the lake's narrowing). */
export const CAST = { near: 7, far: 24, side: 9, middle: { x: 0, z: -14 } };
/** Where the line comes in under the rod, and how near the fish must come there to be lifted out. */
export const REEL_TO = { x: 0.35, z: -1.4 };
export const LAND_R = 1.2;
/** Seconds the line may lie slack (not reeled while the fish is not running) before the fish gets off. */
export const SLACK = 2.5;
/** How long the landed fish is held up to be seen, and how fast an empty line comes back. */
export const LAND_TIME = 2.6,
  REEL_BACK = 11;
/**
 * The reel is wound by turning its crank (the user asked: turned quickly all the while, not a press held): the turns
 * the hand makes (`crank`) are taken as a speed in turns a second, smoothed over `SPIN_EASE` seconds. From `SPIN_MIN`
 * it winds, the fish coming in faster the quicker it turns, at the full pace at `FULL_SPIN` (and a little more beyond,
 * to `SPIN_MOST` of it); slower it hardly gains, and the line goes slack.
 */
export const FULL_SPIN = 2,
  SPIN_MIN = 0.35,
  SPIN_EASE = 0.3,
  SPIN_MOST = 1.25;
export type Phase = "ready" | "flight" | "wait" | "bite" | "fight" | "reel" | "land";
export interface Fish {
  kind: number;
  size: number;
  points: number;
}
export interface Surge {
  t: number;
  length: number;
  power: number;
  /** The way it runs, as an angle on the water (0 straight away from the pier, toward −z). */
  way: number;
}
export interface World {
  level: number;
  /** At sea (`SEA`, its own kinds), or on the lake. */
  sea: boolean;
  random: Random;
  /** Seconds into the round, and to the next whole second. */
  time: number;
  tick: number;
  phase: Phase;
  /** Seconds in this phase. */
  t: number;
  /** Where the cast goes, and how long the flight lasts. */
  target: { x: number; z: number };
  flight: number;
  /** Where the float (or, hooked, the fish) is on the water. */
  float: { x: number; z: number };
  /** Seconds until a fish comes; the fish come; its nibbles still to come, the time to the next, and whether it has begun. */
  comes: number;
  fish: Fish | null;
  nibbles: number;
  nibbleIn: number;
  nibbling: boolean;
  /** The fight: the line's tension (0 to 1, 1 snaps it), seconds of slack, whether the reel is being wound, the surge under way and the time to the next. */
  tension: number;
  slack: number;
  reeling: boolean;
  /** How fast the crank turns, in turns a second (smoothed), and the turns the hand has made since the last slice. */
  spin: number;
  owed: number;
  surge: Surge | null;
  surgeIn: number;
  /** The fish lifted out, while it is shown. */
  landed: Fish | null;
  /** The round is over: nothing more comes, the line comes in. */
  over: boolean;
}
export type Happening =
  | { kind: "second" }
  | { kind: "cast"; x: number; z: number }
  | { kind: "splashdown"; x: number; z: number }
  | { kind: "nibble"; x: number; z: number }
  | { kind: "bite"; x: number; z: number }
  | { kind: "empty"; x: number; z: number }
  | { kind: "scared"; x: number; z: number }
  | { kind: "late"; x: number; z: number }
  | { kind: "hook"; x: number; z: number; fish: Fish }
  | { kind: "surge"; x: number; z: number; power: number }
  | { kind: "snap"; x: number; z: number }
  | { kind: "slip"; x: number; z: number }
  | { kind: "catch"; x: number; z: number; fish: Fish }
  | { kind: "ready" };

export function createWorld(level: number, random: Random, sea = false): World {
  return {
    level: Math.max(1, Math.min(LEVELS.length, Math.round(level) || 1)),
    sea,
    random,
    time: 0,
    tick: 1,
    phase: "ready",
    t: 0,
    target: { ...CAST.middle },
    flight: 0,
    float: { x: REEL_TO.x, z: REEL_TO.z },
    comes: 0,
    fish: null,
    nibbles: 0,
    nibbleIn: 0,
    nibbling: false,
    tension: 0,
    slack: 0,
    reeling: false,
    spin: 0,
    owed: 0,
    surge: null,
    surgeIn: 0,
    landed: null,
    over: false,
  };
}
const between = (world: World, [low, high]: number[]) => low + (high - low) * world.random();
const pace = (world: World) => LEVELS[world.level - 1];
/** A point of the water brought within reach of a cast: no nearer or further than the cast goes, nor too far to the side. */
export function reach(x: number, z: number) {
  const out = Math.min(CAST.far, Math.max(CAST.near, -z)),
    side = Math.min(CAST.side, 1.5 + out * 0.42);
  return { x: Math.max(-side, Math.min(side, x)), z: -out };
}
/** The float is cast toward a point of the water (brought within reach); only while the line is in. */
export function cast(world: World, x: number, z: number): Happening[] {
  if (world.phase !== "ready" || world.over) return [];
  world.target = reach(x, z);
  const far = Math.hypot(world.target.x - REEL_TO.x, world.target.z - REEL_TO.z);
  // A wind-up, then the flight: longer for a longer cast.
  world.flight = 0.3 + far * 0.035;
  world.phase = "flight";
  world.t = 0;
  world.fish = null;
  return [{ kind: "cast", ...world.target }];
}
/** Draws what takes the bait: a kind by its weight at this level, and a size (bigger, more often, the further out). */
export function draw(world: World): Fish {
  const weights = KINDS.map((k, i) => (caughtIn(i, world.sea) ? k.weight[world.level - 1] : 0)),
    total = weights.reduce((a, b) => a + b, 0);
  let roll = world.random() * total,
    kind = 0;
  for (let i = 0; i < KINDS.length; i++) {
    roll -= weights[i];
    if (roll < 0) {
      kind = i;
      break;
    }
  }
  const k = KINDS[kind],
    far = Math.max(0, Math.min(1, (-world.float.z - CAST.near) / (CAST.far - CAST.near))),
    share = Math.pow(world.random(), 1.6 - far * 0.8),
    size = Math.round(k.min + (k.max - k.min) * share);
  return { kind, size, points: pointsOf(kind, size) };
}
/** Winds the line in with nothing on it (after a miss), from where the float is. */
function reelBack(world: World) {
  world.phase = "reel";
  world.t = 0;
  world.fish = null;
  world.nibbling = false;
  world.surge = null;
  world.tension = 0;
  world.slack = 0;
  world.reeling = false;
  world.spin = world.owed = 0;
}
/**
 * The hand pulls (a press, or Space): waiting, it strikes too early (a fish that has come is scared off; with none
 * there, the line simply comes in); at a bite, it hooks the fish. Hooked, a press does nothing: the reel is wound by
 * turning its crank (`crank`).
 */
export function press(world: World): Happening[] {
  const at = { ...world.float };
  if (world.over) return [];
  if (world.phase === "wait") {
    const scared = !!world.fish;
    reelBack(world);
    return [{ kind: scared ? "scared" : "empty", ...at }];
  }
  if (world.phase === "bite") {
    const fish = world.fish!;
    world.phase = "fight";
    world.t = 0;
    world.reeling = false;
    world.spin = world.owed = 0;
    world.tension = 0.15;
    world.slack = 0;
    world.surge = null;
    world.surgeIn = KINDS[fish.kind].junk ? Infinity : 0.6 + world.random() * 1.2;
    return [{ kind: "hook", ...at, fish }];
  }
  return [];
}
/** The hand turns the crank by `turns` (either way round counts); only while a fish is on the line. */
export function crank(world: World, turns: number) {
  if (world.phase === "fight" && Number.isFinite(turns)) world.owed += Math.min(4, Math.abs(turns));
}
/** The hand lets go of the crank: it stops at once and line runs out freely. */
export function release(world: World) {
  world.reeling = false;
  world.spin = world.owed = 0;
}
/** How hard the surge under way pulls now (0 to its power): it builds up over its first moment and eases off at its end. */
export function surgeNow(surge: Surge | null) {
  if (!surge) return 0;
  const rise = Math.min(1, surge.t / 0.45),
    fall = Math.min(1, Math.max(0, (surge.length - surge.t) / 0.25));
  return surge.power * rise * fall;
}
/** Keeps the fish in the lake: out from the pier, within its sides and its far shore. */
function keepIn(world: World) {
  const f = world.float;
  f.z = Math.max(-34, Math.min(-0.6, f.z));
  const side = 3 + -f.z * 0.55;
  f.x = Math.max(-side, Math.min(side, Math.max(-16, Math.min(16, f.x))));
}
/** One slice of time. */
export function step(world: World): Happening[] {
  const out: Happening[] = [];
  if (!world.over) {
    world.time += DT;
    world.tick -= DT;
    if (world.tick <= 0) {
      world.tick += 1;
      out.push({ kind: "second" });
    }
  }
  world.t += DT;
  const level = pace(world),
    at = () => ({ x: world.float.x, z: world.float.z });
  switch (world.phase) {
    case "flight":
      if (world.t >= world.flight) {
        world.float = { ...world.target };
        world.phase = "wait";
        world.t = 0;
        world.comes = between(world, level.wait);
        world.fish = null;
        world.nibbling = false;
        out.push({ kind: "splashdown", ...at() });
      }
      break;
    case "wait":
      if (world.over) {
        reelBack(world);
        break;
      }
      if (!world.fish) {
        world.comes -= DT;
        if (world.comes <= 0) {
          world.fish = draw(world);
          // Junk does not nibble: the float simply goes under.
          world.nibbles = KINDS[world.fish.kind].junk ? 0 : Math.round(between(world, level.nibbles));
          world.nibbleIn = 0.3 + world.random() * 0.6;
        }
        break;
      }
      world.nibbleIn -= DT;
      if (world.nibbleIn > 0) break;
      if (world.nibbles > 0) {
        world.nibbles--;
        world.nibbling = true;
        world.nibbleIn = 0.55 + world.random() * 0.9;
        out.push({ kind: "nibble", ...at() });
      } else {
        world.phase = "bite";
        world.t = 0;
        out.push({ kind: "bite", ...at() });
      }
      break;
    case "bite":
      if (world.over) reelBack(world);
      else if (world.t >= level.bite) {
        reelBack(world);
        out.push({ kind: "late", ...at() });
      }
      break;
    case "fight":
      if (world.over) {
        reelBack(world);
        break;
      }
      fight(world, out);
      break;
    case "reel": {
      // The empty line comes back to the rod.
      const dx = REEL_TO.x - world.float.x,
        dz = REEL_TO.z - world.float.z,
        far = Math.hypot(dx, dz),
        go = REEL_BACK * DT;
      if (far <= go) {
        world.float = { ...REEL_TO };
        world.phase = "ready";
        world.t = 0;
        out.push({ kind: "ready" });
      } else {
        world.float.x += (dx / far) * go;
        world.float.z += (dz / far) * go;
      }
      break;
    }
    case "land":
      if (world.t >= LAND_TIME) {
        world.landed = null;
        world.phase = "ready";
        world.t = 0;
        world.float = { ...REEL_TO };
        out.push({ kind: "ready" });
      }
      break;
  }
  return out;
}
/**
 * The fight on the line. Wound in while the fish is not running, it comes nearer and the line holds a steady
 * tension; wound in while it surges, the tension climbs fast and the line snaps at 1; let go, line runs out to a
 * surging fish and the tension eases, but a line left slack too long (no surge) lets the fish get off.
 */
function fight(world: World, out: Happening[]) {
  const fish = world.fish!,
    kind = KINDS[fish.kind],
    level = pace(world),
    f = world.float;
  // The crank's speed: the turns made over this slice, smoothed.
  world.spin += (world.owed / DT - world.spin) * Math.min(1, DT / SPIN_EASE);
  world.owed = 0;
  if (world.spin < 1e-4) world.spin = 0;
  world.reeling = world.spin >= SPIN_MIN;
  const wind = Math.min(SPIN_MOST, world.spin / FULL_SPIN);
  // Surges come now and then; junk never runs.
  const sea = world.sea ? SEA : { reel: 1, power: 1, length: 1, gap: 1, run: 1 };
  if (world.surge) {
    world.surge.t += DT;
    if (world.surge.t >= world.surge.length) {
      world.surge = null;
      world.surgeIn = (between(world, level.gap) / kind.lively) * sea.gap;
    }
  } else if (!kind.junk) {
    world.surgeIn -= DT;
    if (world.surgeIn <= 0) {
      world.surge = {
        t: 0,
        length: (0.7 + world.random() * 0.8) * sea.length,
        power: kind.pull * level.power * (0.75 + world.random() * 0.5) * sea.power,
        way: (world.random() - 0.5) * 1.8,
      };
      out.push({ kind: "surge", x: f.x, z: f.z, power: world.surge.power });
    }
  }
  const pull = surgeNow(world.surge),
    run = (speed: number) => {
      // The fish runs its way (away from the pier, to one side).
      const way = world.surge!.way;
      f.x += Math.sin(way) * speed * sea.run * DT;
      f.z -= Math.cos(way) * speed * sea.run * DT;
    };
  if (world.reeling) {
    world.slack = 0;
    if (world.surge) {
      // Winding against a running fish: the rod bends, the tension climbs (the faster, the quicker it turns), and it
      // still takes a little line.
      world.tension += (0.35 + 1.6 * pull) * (0.6 + 0.4 * wind) * DT;
      run(0.5 * pull);
    } else {
      const steady = (kind.junk ? 0.12 : 0.18 + 0.3 * kind.pull) * (0.7 + 0.3 * Math.min(1, wind));
      world.tension += (steady - world.tension) * Math.min(1, 2.5 * DT);
      // The fish comes in as fast as the crank turns.
      const speed = 2.4 * Math.max(0.35, 1 - 0.3 * kind.pull) * wind * sea.reel,
        dx = REEL_TO.x - f.x,
        dz = REEL_TO.z - f.z,
        far = Math.hypot(dx, dz) || 1;
      f.x += (dx / far) * speed * DT;
      f.z += (dz / far) * speed * DT;
    }
  } else {
    world.tension = Math.max(0, world.tension - 0.9 * DT);
    if (world.surge) run((0.6 + 1.2 * pull) * Math.min(1, world.surge.t / 0.45 + 0.2));
    else if (!kind.junk) {
      world.slack += DT;
      if (world.slack > SLACK) {
        const where = { x: f.x, z: f.z };
        reelBack(world);
        out.push({ kind: "slip", ...where });
        return;
      }
    }
  }
  keepIn(world);
  if (world.tension >= 1) {
    const where = { x: f.x, z: f.z };
    reelBack(world);
    out.push({ kind: "snap", ...where });
    return;
  }
  if (Math.hypot(f.x - REEL_TO.x, f.z - REEL_TO.z) < LAND_R) {
    world.landed = fish;
    world.phase = "land";
    world.t = 0;
    world.fish = null;
    world.surge = null;
    world.reeling = false;
    world.spin = world.owed = 0;
    world.tension = 0;
    out.push({ kind: "catch", x: f.x, z: f.z, fish });
  }
}
/** How far the hooked fish still is from the pier, in metres (one unit of the lake is a metre). */
export const distance = (world: World) => Math.hypot(world.float.x - REEL_TO.x, world.float.z - REEL_TO.z);
/** The round is over: no more seconds, no new fish; a line out comes in (a hooked fish is let go). */
export function retire(world: World) {
  world.over = true;
}
