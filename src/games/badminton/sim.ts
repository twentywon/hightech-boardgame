/**
 * The badminton court's insides, free of Three.js and the page: a shuttlecock under gravity and its heavy air drag,
 * the net, two players who run to the shuttle by themselves, and their strokes. The view steps it in fixed slices
 * (`DT`) and reports each point won as a move.
 *
 * Metres, seconds. The net stands over z = 0; my half (side 0) is z > 0, the computer's (side 1) z < 0; x runs across,
 * +x to my right. Only the singles court counts: its side lines at |x| = `HALF_W` and its back lines at |z| = `HALF_L`
 * (lines are in). A serve goes from the server's service court to the receiver's, diagonally across, and must land past
 * the short service line (|z| ≥ `SHORT`).
 *
 * How a stroke is played (the user asked): a swipe of the finger (or the mouse) swings the racket. The faster the swipe,
 * the harder and the further the shuttle goes (`depthOf`): a slow one drops it over the net, a quick one clears it to
 * the back line, and no quicker swipe sends it long; and only one leaning far to the side goes out wide (`acrossOf`). A smash is played only
 * from a jump: the jump button first, then the swipe while in the air (`jump`, `swing`).
 */
export const DT = 1 / 120;
export const G = 9.81,
  /** The shuttle's terminal speed: how fast it falls once its air drag has caught up with gravity. */
  TERMINAL = 6.8,
  DRAG = G / (TERMINAL * TERMINAL);
/** The singles court: half its width, half its length, and the short service line's distance from the net. */
export const HALF_W = 2.59,
  HALF_L = 6.7,
  SHORT = 1.98,
  /** The doubles side lines and long service line, only drawn. */
  DOUBLES_W = 3.05,
  DOUBLES_LONG = 5.94,
  /** The net's height at its middle, and its posts (on the doubles side lines). */
  NET_H = 1.53,
  POST = 3.05,
  /** The shuttle's skirt is about this long; it is drawn cork first along its way. */
  SHUTTLE = 0.085;
/** A player's reach: how far across from where it stands, and the heights its racket meets (standing, and jumping above where it is). */
export const REACH = 1.25,
  LOW = 0.12,
  TOP = 2.6,
  AIR_LOW = 1.25,
  AIR_TOP = 3.0,
  /** A jump: its speed upward (about two thirds of a second in the air, half a metre high). */
  JUMP = 3.3,
  /** How long a swing looks for the shuttle once it has begun (a swipe a moment early still meets it). */
  SWING = 0.24,
  /** Where a player waits between strokes, from the net. */
  BASE = 3.7,
  /** Where a server stands, from the net, and how far from the centre line. */
  SERVE_Z = 2.5,
  SERVE_X = 0.95;
/** How fast my own player runs to the shuttle (the computer's is its level's). */
export const MY_SPEED = 4.6;
/** The most a swipe's power counts for (a smash's speed grows up to it; a stroke's depth stops growing at `SAFE`). */
export const MOST = 1.7;
/**
 * How far past the net a stroke of power `p` is sent, whoever strikes it from wherever: from a drop just over the net,
 * steadily deeper to near the back line at `DEEP`, then a little deeper up to 0.3 m inside it at `SAFE`, and no further
 * for any quicker swipe (the user asked: no long outs; only a stroke leaning far to the side goes out).
 */
export const DEEP = 0.85,
  SAFE = 1.6;
export function depthOf(p: number) {
  const q = Math.max(0, Math.min(MOST, p));
  if (q <= DEEP) return 1.3 + (HALF_L - 1.1 - 1.3) * (q / DEEP);
  // Then it levels off inside the back line and stays there: no swipe sends it long (the user asked).
  return HALF_L - 1.1 + 0.8 * Math.min(1, (q - DEEP) / (SAFE - DEEP));
}
/**
 * Where across the far court a stroke is aimed: a little toward the side it is struck from, and across as far as the
 * swipe leans (`yawOf`'s most, 0.5, goes out over a side line from anywhere; a moderate lean stays well in).
 */
export const acrossOf = (from: number, yaw: number) => Math.max(-0.5, Math.min(0.5, from * 0.2)) + (yaw / 0.5) * (HALF_W + 0.8);
/** A smash's speed by the swipe's power. */
export const smashSpeed = (p: number) => 34 + 30 * Math.max(0, Math.min(1.3, p));

export const LEVELS = {
  easy: { speed: 3.3, react: 0.34, error: 0.85, blunder: 0.12, whiff: 0.1, smash: 0.12, judge: 0, pace: 0.8 },
  normal: { speed: 4.3, react: 0.22, error: 0.5, blunder: 0.05, whiff: 0.04, smash: 0.45, judge: 0.35, pace: 1 },
  hard: { speed: 5.4, react: 0.13, error: 0.24, blunder: 0.018, whiff: 0.012, smash: 0.85, judge: 0.12, pace: 1.12 },
};
export type Level = keyof typeof LEVELS;
/** Why a point ended (a move's `extra`). */
export const WON = 0,
  OUT = 1,
  NET = 2,
  FAULT = 3,
  SMASHED = 4;
export const WHY = ["득점", "아웃", "네트", "서브 실수", "스매싱 득점"];

export interface Shuttle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}
export interface Player {
  x: number;
  z: number;
  /** Height off the floor (a jump), and its upward speed. */
  y: number;
  vy: number;
  /** Its running speed now (for the legs), and where it is running to. */
  vx: number;
  vz: number;
  goal: { x: number; z: number };
  /** A swing under way: when it began, how hard and which way, and whether it is a smash. */
  swing: { at: number; power: number; yaw: number; smash: boolean } | null;
  /** When it last struck the shuttle (the view's follow-through), and whether that was overhead. */
  struck: number;
  high: boolean;
}
export type Phase = "ready" | "flying" | "dead";
export interface World {
  time: number;
  phase: Phase;
  server: 0 | 1;
  /** The serve's court: whether the server's score is even (served from the right court). */
  even: boolean;
  /** Whether the shuttle in the air is the serve, not yet returned. */
  served: boolean;
  /** Who struck last, whether that was a smash, and whether the shuttle has met the net since. */
  hitter: 0 | 1;
  smash: boolean;
  netted: boolean;
  shuttle: Shuttle;
  players: [Player, Player];
  /** Seconds since the point ended, and until the computer serves. */
  dead: number;
  wait: number;
  /** The computer's plan for the shuttle coming to it: when it starts to run, whether it lets the shuttle go, and its stroke. */
  plan: { from: number; leave: boolean; smash: boolean; miss: boolean } | null;
  /** Where the shuttle came down last (for the view's mark). */
  landed: { x: number; z: number; in: boolean } | null;
  /**
   * Which sides a person plays (its swipes and jumps given through `swing` and `jump`); the others are the computer's.
   * Against the computer it is me on side 0; over Wi-Fi the host's world has a person on each side that has one.
   */
  people: [boolean, boolean];
  /** When the players last chose where to run (they look again a few times a second, and at once after a stroke). */
  steered: number;
  seed: number;
}
export type Happening =
  | { kind: "hit"; side: 0 | 1; smash: boolean; strength: number }
  | { kind: "serve"; side: 0 | 1 }
  | { kind: "whiff"; side: 0 | 1 }
  | { kind: "jump"; side: 0 | 1 }
  | { kind: "net" }
  | { kind: "land"; in: boolean; strength: number }
  | { kind: "point"; to: 0 | 1; why: number };

/** A draw in [0, 1) from the world's own sequence (so that a seeded world plays the same every time). */
export function draw(world: World) {
  world.seed = (world.seed * 16807) % 2147483647;
  return (world.seed - 1) / 2147483646;
}
const gauss = (world: World) => (draw(world) + draw(world) + draw(world) - 1.5) * 1.41;
const forward = (side: 0 | 1) => (side === 0 ? -1 : 1);
/** Which half a place across the court is on. */
export const sideOf = (z: number): 0 | 1 => (z >= 0 ? 0 : 1);
const player = (side: 0 | 1): Player => {
  const z = side === 0 ? BASE : -BASE;
  return { x: 0, z, y: 0, vy: 0, vx: 0, vz: 0, goal: { x: 0, z }, swing: null, struck: -9, high: false };
};
export function createWorld(seed = 1): World {
  return {
    time: 0,
    phase: "dead",
    server: 0,
    even: true,
    served: false,
    hitter: 0,
    smash: false,
    netted: false,
    shuttle: { x: 0, y: 1, z: BASE, vx: 0, vy: 0, vz: 0 },
    players: [player(0), player(1)],
    dead: 0,
    wait: 0,
    plan: null,
    landed: null,
    people: [true, false],
    steered: -9,
    seed: Math.max(1, Math.floor(Math.abs(seed)) % 2147483646) || 1,
  };
}
/** The x of a side's service court: its right one when `even`, as that side faces the net. */
export const courtX = (side: 0 | 1, even: boolean) => (side === 0 ? 1 : -1) * (even ? 1 : -1) * SERVE_X;
/** Where a server's shuttle is held, under its racket: a little in front of it and to its right. */
export function held(world: World): Shuttle {
  const p = world.players[world.server],
    f = forward(world.server);
  return { x: p.x - f * 0.28, y: 0.95, z: p.z + f * 0.42, vx: 0, vy: 0, vz: 0 };
}
/**
 * The next point is served by `server` from its right court when `even` (its score is even), its left one otherwise:
 * both players stand in their service courts, diagonally across, and the shuttle waits in the server's hand.
 */
export function serve(world: World, server: 0 | 1, even: boolean) {
  world.phase = "ready";
  world.server = server;
  world.even = even;
  world.served = false;
  world.smash = false;
  world.netted = false;
  world.plan = null;
  world.landed = null;
  world.dead = 0;
  world.wait = 1.1 + draw(world) * 0.6;
  for (const side of [0, 1] as const) {
    const p = world.players[side],
      x = courtX(side, even),
      z = (side === server ? SERVE_Z : SERVE_Z + 0.9) * (side === 0 ? 1 : -1);
    Object.assign(p, { x, z, y: 0, vy: 0, vx: 0, vz: 0, goal: { x, z }, swing: null });
  }
  world.shuttle = held(world);
}

/** One slice of the shuttle's flight under gravity and its drag. */
/**
 * How fast the shuttle's flight runs against the court's clock (the user asked for a slower shuttle): every flight keeps
 * its shape and where it comes down, and takes 1 / `PACE` as long. Its speeds are kept in the flight's own time.
 */
export const PACE = 0.7;
function fly(s: Shuttle, real: number) {
  const dt = real * PACE,
    speed = Math.hypot(s.vx, s.vy, s.vz),
    k = DRAG * speed;
  s.vx -= k * s.vx * dt;
  s.vy -= (G + k * s.vy) * dt;
  s.vz -= k * s.vz * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;
}
/** Where a shuttle sent off as `s` comes down, and whether it meets the net on its way. */
export function landing(from: Shuttle, dt = DT * 2): { x: number; z: number; t: number; net: boolean } {
  const s = { ...from };
  let t = 0;
  while (s.y > 0 && t < 8) {
    const z0 = s.z,
      y0 = s.y;
    fly(s, dt);
    t += dt;
    if (z0 * s.z < 0) {
      const share = z0 / (z0 - s.z),
        y = y0 + (s.y - y0) * share;
      if (y < NET_H && Math.abs(s.x) < POST) return { x: s.x, z: 0, t, net: true };
    }
  }
  return { x: s.x, z: s.z, t, net: false };
}
/** The way the shuttle in the air will go from here: a point every `every` seconds until it comes down. */
export function path(world: World, every = DT * 3) {
  const s = { ...world.shuttle },
    points: { t: number; x: number; y: number; z: number }[] = [];
  let t = 0;
  while (s.y > 0 && t < 6) {
    const z0 = s.z,
      y0 = s.y;
    fly(s, every);
    t += every;
    if (z0 * s.z < 0 && Math.abs(s.x) < POST) {
      const y = y0 + ((s.y - y0) * z0) / (z0 - s.z);
      if (y < NET_H) break;
    }
    points.push({ t, x: s.x, y: Math.max(0, s.y), z: s.z });
  }
  return points;
}
/** A shuttle sent from `at` with `speed` at `elevation` (radians up) toward the heading `dir` (a unit vector across the floor). */
const launch = (at: Shuttle, speed: number, elevation: number, dir: { x: number; z: number }): Shuttle => ({
  x: at.x,
  y: at.y,
  z: at.z,
  vx: speed * Math.cos(elevation) * dir.x,
  vy: speed * Math.sin(elevation),
  vz: speed * Math.cos(elevation) * dir.z,
});
/** How far along the floor a shuttle sent off as `s` comes down from where it is (the net counts as where it stops). */
const reachOf = (s: Shuttle) => {
  const end = landing(s);
  return Math.hypot(end.x - s.x, end.z - s.z);
};
/** The speed (at a fixed elevation) that lands the shuttle `distance` away, between `low` and `high`. */
function speedFor(at: Shuttle, elevation: number, dir: { x: number; z: number }, distance: number, low = 4, high = 120) {
  for (let k = 0; k < 26; k++) {
    const mid = (low + high) / 2;
    if (reachOf(launch(at, mid, elevation, dir)) < distance) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}
/** The elevation (at a fixed speed) that lands the shuttle `distance` away: a smash, aimed downward over the net. */
function elevationFor(at: Shuttle, speed: number, dir: { x: number; z: number }, distance: number) {
  let low = -1.1,
    high = 0.25;
  for (let k = 0; k < 26; k++) {
    const mid = (low + high) / 2;
    if (reachOf(launch(at, speed, mid, dir)) < distance) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}
/** How high a stroke sends the shuttle up from where it is met: a low shuttle is lifted, a high one hit flatter. */
export const elevationOf = (height: number) => (Math.max(18, Math.min(56, 30 + (1.7 - height) * 20)) * Math.PI) / 180;

/** Whether the shuttle is where `side`'s racket can meet it now (on its own half, within reach, at a height its stance allows). */
export function inReach(world: World, side: 0 | 1) {
  const p = world.players[side],
    s = world.shuttle;
  if (world.phase !== "flying" || world.hitter === side || sideOf(s.z) !== side || world.netted) return false;
  const across = Math.hypot(s.x - p.x, s.z - p.z),
    air = p.y > 0.04,
    low = air ? p.y + AIR_LOW : LOW,
    top = air ? p.y + AIR_TOP : TOP;
  return across <= REACH && s.y >= low && s.y <= top;
}
/** Whether `side` is in the air now. */
export const airborne = (world: World, side: 0 | 1) => world.players[side].y > 0.04 || world.players[side].vy > 0;

/** A swing by `side` (a swipe of mine): `power` from its speed, `yaw` its lean across (radians, toward +x: my right). */
export function swing(world: World, side: 0 | 1, power: number, yaw: number) {
  if (world.phase === "ready") {
    if (world.server !== side) return false;
    serveStroke(world, side, power, yaw);
    return true;
  }
  if (world.phase !== "flying") return false;
  world.players[side].swing = { at: world.time, power, yaw, smash: airborne(world, side) };
  return true;
}
/** A jump by `side` (the jump button), from the floor during a rally: in the air, a swing is a smash. */
export function jump(world: World, side: 0 | 1) {
  const p = world.players[side];
  if (world.phase !== "flying" || airborne(world, side)) return false;
  p.vy = JUMP;
  return true;
}
/** The serve: an underarm stroke from the server's hand, diagonally across into the receiver's service court. */
function serveStroke(world: World, side: 0 | 1, power: number, yaw: number) {
  // Into the receiver's service court: short just past its front line for a gentle swipe, high to its back for a quick
  // one, beyond only for one far too quick; across by the swipe's lean, within the court unless it leans far.
  const p = Math.max(0, Math.min(MOST, power)),
    at = held(world),
    across = -Math.sign(courtX(side, world.even)),
    depth = SHORT + 0.35 + (HALF_L - 0.6 - SHORT - 0.35) * Math.min(1, p / DEEP),
    x = across * 1.3 + (yaw / 0.5) * 1.5,
    long = Math.min(1, p / DEEP);
  aimAt(world, at, x, forward(side) * depth, 0.34 + long * 0.6);
  begin(world, side, false, true);
}
/**
 * Sends the shuttle from `at` to come down at (x, z): at `elevation`, as fast as that needs; raised until it clears the
 * net (the speed found again each time).
 */
function aimAt(world: World, at: Shuttle, x: number, z: number, elevation: number) {
  const dx = x - at.x,
    dz = z - at.z,
    distance = Math.hypot(dx, dz),
    way = { x: dx / distance, z: dz / distance };
  let e = elevation;
  for (let k = 0; k < 6; k++) {
    const next = launch(at, speedFor(at, e, way, distance), e, way);
    world.shuttle = next;
    if (!landing(next).net) break;
    e += 0.12;
  }
}
/** The shuttle has just been struck by `side`. */
function begin(world: World, side: 0 | 1, smash: boolean, served = false) {
  world.phase = "flying";
  world.hitter = side;
  world.smash = smash;
  world.served = served;
  world.netted = false;
  const p = world.players[side];
  p.swing = null;
  p.struck = world.time;
  p.high = world.shuttle.y > 1.6;
  world.plan = null;
}
/** `side` meets the shuttle with the swing it has under way. */
function strike(world: World, side: 0 | 1, power: number, yaw: number, smash: boolean) {
  const s = world.shuttle,
    p = Math.max(0, Math.min(MOST, power));
  // Where it comes down depends on the swipe alone, not on where it is struck from (see `depthOf`).
  const tx = acrossOf(s.x, yaw),
    tz = forward(side) * (smash ? Math.max(2, depthOf(p)) : depthOf(p));
  if (smash) {
    // Aimed down over the net, as deep as the swipe was quick, and the harder the quicker.
    const dx = tx - s.x,
      dz = tz - s.z,
      distance = Math.hypot(dx, dz),
      way = { x: dx / distance, z: dz / distance },
      speed = smashSpeed(p);
    world.shuttle = launch(s, speed, elevationFor(s, speed, way, distance), way);
    // Too low to come down over the net: it is lifted just enough to clear it.
    for (let k = 0; k < 6 && landing(world.shuttle).net; k++) world.shuttle = launch(s, speed * 0.9, elevationFor(s, speed * 0.9, way, distance) + 0.06 * (k + 1), way);
  } else aimAt(world, s, tx, tz, elevationOf(s.y));
  begin(world, side, smash);
}

/**
 * The computer's stroke at the shuttle it meets: a smash when it is high enough and the level dares, else a clear to
 * my back line, a drop over the net or a drive between, aimed away from where I stand; with its level's error, and now
 * and then a blunder.
 */
function computerStroke(world: World, level: Level, side: 0 | 1 = 1) {
  const L = LEVELS[level],
    s = world.shuttle,
    me = world.players[1 - side],
    smash = !!world.plan?.smash && s.y > 1.9;
  // Depths are measured from the net into the other half (`forward` turns them to the court's z at the end).
  let tx = -Math.sign(me.x || draw(world) - 0.5) * (0.7 + draw(world) * 1.55),
    tz: number;
  if (smash) tz = 2.4 + draw(world) * 3.2;
  else {
    const r = draw(world),
      deep = Math.abs(me.z) > 4.2,
      near = Math.abs(me.z) < 3;
    tz = r < (deep ? 0.55 : near ? 0.15 : 0.3) ? 2.1 + draw(world) * 1.1 : r < 0.82 ? 5.3 + draw(world) * 1.1 : 3.6 + draw(world) * 1.4;
  }
  tx += gauss(world) * L.error;
  // Its error never carries a deep shot over the back line (the user asked for few long outs); it may fall short.
  tz = Math.min(HALF_L - 0.25, tz + gauss(world) * L.error);
  if (draw(world) < L.blunder) {
    // A blunder: long, wide, or short into the net.
    const r = draw(world);
    // (Never long over the back line: the user asked that there be no long outs.)
    if (r < 0.55) tx = Math.sign(tx || 1) * (HALF_W + 0.3 + draw(world) * 0.6);
    else tz = 0.4;
  }
  tz *= forward(side);
  const dx = tx - s.x,
    dz = tz - s.z,
    distance = Math.hypot(dx, dz),
    dir = { x: dx / distance, z: dz / distance };
  if (smash) {
    const speed = (34 + 18 * draw(world)) * L.pace;
    world.shuttle = launch(s, speed, elevationFor(s, speed, dir, distance), dir);
  } else {
    // A drop goes up gently and falls short; a clear goes high; a drive flat. Raised if it would meet the net.
    let elevation = tz < 3.3 ? 0.42 : tz > 5 ? 0.72 : 0.28;
    if (s.y < 1.2) elevation += 0.3;
    for (let k = 0; k < 4; k++) {
      const speed = speedFor(s, elevation, dir, distance),
        next = launch(s, speed, elevation, dir);
      if (!landing(next).net || k === 3) {
        world.shuttle = next;
        break;
      }
      elevation += 0.14;
    }
  }
  begin(world, side, smash);
}
/** The computer serves from `side`: mostly short over the net into the other's service court, sometimes long to its back. */
function computerServe(world: World, level: Level, side: 0 | 1 = 1) {
  const L = LEVELS[level],
    at = held(world),
    long = draw(world) < 0.4,
    tx = -Math.sign(courtX(side, world.even)) * (0.8 + draw(world) * 1.1) + gauss(world) * L.error * 0.35,
    tz = forward(side) * ((long ? 6.0 + draw(world) * 0.5 : SHORT + 0.35 + draw(world) * 0.5) + gauss(world) * L.error * 0.3),
    dx = tx - at.x,
    dz = tz - at.z,
    distance = Math.hypot(dx, dz),
    dir = { x: dx / distance, z: dz / distance },
    elevation = long ? 0.92 : 0.36;
  world.shuttle = launch(at, speedFor(at, elevation, dir, distance), elevation, dir);
  begin(world, side, false, true);
}

/**
 * Where `side` runs to meet the shuttle coming to it: the first place on its way, low enough to reach, that it can get to
 * in time (a little behind the shuttle, so that it comes down in front of the racket); where it will come down if there
 * is none. For a smash (`high`) the place where it passes the jump's reach instead.
 */
export function meeting(world: World, side: 0 | 1, speed: number, high = false) {
  const p = world.players[side],
    way = path(world).filter((q) => sideOf(q.z) === side && Math.abs(q.z) > 0.35),
    behind = (q: { x: number; z: number }) => ({ x: q.x, z: q.z - forward(side) * 0.3 });
  for (const q of way) {
    if (q.y > (high ? TOP + 0.35 : TOP - 0.3)) continue;
    const to = behind(q),
      far = Math.max(0, Math.hypot(to.x - p.x, to.z - p.z) - REACH * 0.45);
    if (far / speed <= q.t) return to;
  }
  const last = way[way.length - 1];
  return last ? behind(last) : null;
}
/** Whether the shuttle coming to `side` goes high enough over its half to be smashed from a jump (the view lights the jump button). */
export function smashable(world: World, side: 0 | 1 = 0) {
  if (world.phase !== "flying" || world.hitter === side || world.netted) return false;
  return path(world, DT * 6).some((q) => -forward(side) * q.z > 0.8 && q.y > 3.1);
}
/**
 * Whether a jump begun now would meet the shuttle: it comes within reach of my racket in the air at the jump's height
 * while I am up (the view pulses the jump button then, so that the jump is timed for the smash).
 */
export function jumpNow(world: World, side: 0 | 1 = 0) {
  if (!smashable(world, side) || airborne(world, side)) return false;
  const me = world.players[side],
    up = (2 * JUMP) / G;
  return path(world, DT * 2).some((q) => {
    if (q.t < 0.12 || q.t > up * 0.85 || -forward(side) * q.z < 0.3) return false;
    const y = JUMP * q.t - (G * q.t * q.t) / 2;
    return q.y >= y + AIR_LOW && q.y <= y + AIR_TOP && Math.hypot(q.x - me.x, q.z - me.z) <= REACH;
  });
}
/** Keeps a player on its own half, off the net. */
function keepIn(side: 0 | 1, at: { x: number; z: number }) {
  const z = side === 0 ? Math.max(0.5, Math.min(HALF_L + 1.4, at.z)) : Math.min(-0.5, Math.max(-HALF_L - 1.4, at.z));
  return { x: Math.max(-HALF_W - 1, Math.min(HALF_W + 1, at.x)), z };
}
/** Runs a player toward its goal: quick to start, at most `most` metres a second. */
function run(p: Player, most: number, dt: number) {
  const dx = p.goal.x - p.x,
    dz = p.goal.z - p.z,
    far = Math.hypot(dx, dz),
    want = Math.min(most, far * 6),
    wx = far > 1e-4 ? (dx / far) * want : 0,
    wz = far > 1e-4 ? (dz / far) * want : 0,
    a = 22 * dt;
  p.vx += Math.max(-a, Math.min(a, wx - p.vx));
  p.vz += Math.max(-a, Math.min(a, wz - p.vz));
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  if (p.y > 0 || p.vy > 0) {
    p.y += p.vy * dt;
    p.vy -= G * dt;
    if (p.y <= 0) p.y = p.vy = 0;
  }
}
/** Where each player is running to now: to meet a shuttle coming to it, else back to its waiting place. */
function steer(world: World, level: Level) {
  const L = LEVELS[level],
    look = world.time - world.steered >= 0.05 || world.time - Math.max(world.players[0].struck, world.players[1].struck) < DT * 1.5;
  if (look) world.steered = world.time;
  for (const side of [0, 1] as const) {
    const p = world.players[side],
      coming = world.phase === "flying" && world.hitter !== side && !world.netted;
    if (world.phase === "ready") continue;
    if (!coming) {
      // After its stroke a player goes back to the middle of its half.
      if (world.time - p.struck > 0.15) p.goal = { x: p.x * 0.3, z: side === 0 ? BASE : -BASE };
      continue;
    }
    if (!world.people[side]) {
      if (!world.plan) {
        // The computer reads the stroke: it lets a shuttle go that it judges out, and decides whether to smash it.
        const end = landing(world.shuttle),
          out = Math.abs(end.x) - HALF_W > L.judge || Math.abs(end.z) - HALF_L > L.judge,
          high = path(world).some((q) => q.y > 3.2 && sideOf(q.z) === side);
        world.plan = { from: world.time + L.react, leave: L.judge > 0 && out && !end.net, smash: high && draw(world) < L.smash, miss: draw(world) < L.whiff };
      }
      if (world.time < world.plan.from) continue;
      if (world.plan.leave) {
        p.goal = { x: p.x, z: p.z };
        continue;
      }
    }
    if (!look) continue;
    // A shuttle coming high over me is met where a jump can reach it, so that a jump and a swipe smash it.
    const high = world.people[side] ? smashable(world, side) : !!world.plan?.smash;
    const to = meeting(world, side, world.people[side] ? MY_SPEED : L.speed, high);
    if (to) p.goal = keepIn(side, to);
  }
}

/** The point is over: `to` wins it, for `why`. */
function end(world: World, to: 0 | 1, why: number, out: Happening[]) {
  world.phase = "dead";
  world.dead = 0;
  for (const p of world.players) p.swing = null;
  out.push({ kind: "point", to, why });
}
/** Whether a serve came down in the receiver's service court (diagonally across from the server's). */
export function goodServe(world: World, x: number, z: number) {
  const receiver = (1 - world.server) as 0 | 1,
    across = -Math.sign(courtX(world.server, world.even)),
    depth = receiver === 0 ? z : -z;
  return depth >= SHORT - 0.02 && depth <= HALF_L + 0.02 && Math.abs(x) <= HALF_W + 0.02 && x * across >= -0.02;
}

/** One slice of the court's time. */
export function step(world: World, level: Level): Happening[] {
  const out: Happening[] = [],
    L = LEVELS[level];
  world.time += DT;
  if (world.phase === "dead") {
    world.dead += DT;
    if (world.shuttle.y > 0) {
      fly(world.shuttle, DT);
      if (world.shuttle.y <= 0) world.shuttle.y = 0;
    }
  }
  if (world.phase === "ready") {
    world.shuttle = held(world);
    const server = world.server;
    if (!world.people[server]) {
      world.wait -= DT;
      if (world.wait <= 0) {
        computerServe(world, level, server);
        out.push({ kind: "serve", side: server }, { kind: "hit", side: server, smash: false, strength: 0.35 });
      }
    }
  }
  steer(world, level);
  for (const side of [0, 1] as const) run(world.players[side], world.people[side] ? MY_SPEED : L.speed, DT);
  if (world.phase !== "flying") return out;
  const s = world.shuttle,
    z0 = s.z,
    y0 = s.y;
  fly(s, DT);
  // Through the plane of the net: below its top (and between its posts) it is caught there and falls on the striker's side.
  if (z0 * s.z < 0 && !world.netted) {
    const share = z0 / (z0 - s.z),
      y = y0 + (s.y - y0) * share;
    if (y < NET_H && Math.abs(s.x) < POST) {
      world.netted = true;
      s.z = Math.sign(z0) * 0.04;
      s.vx *= 0.1;
      s.vz = 0;
      s.vy = Math.min(0, s.vy) * 0.2;
      out.push({ kind: "net" });
    }
  }
  if (s.y <= 0) {
    s.y = 0;
    const inside = Math.abs(s.x) <= HALF_W + 0.02 && Math.abs(s.z) <= HALF_L + 0.02,
      hitter = world.hitter,
      other = (1 - hitter) as 0 | 1;
    world.landed = { x: s.x, z: s.z, in: inside };
    out.push({ kind: "land", in: inside, strength: Math.min(1, Math.hypot(s.vx, s.vy, s.vz) / 8) });
    if (world.netted) end(world, other, world.served ? FAULT : NET, out);
    else if (world.served) end(world, goodServe(world, s.x, s.z) ? hitter : other, goodServe(world, s.x, s.z) ? WON : FAULT, out);
    else if (sideOf(s.z) === hitter) end(world, other, NET, out);
    else if (inside) end(world, hitter, world.smash ? SMASHED : WON, out);
    else end(world, other, OUT, out);
    return out;
  }
  // The rackets: a person's swing meets the shuttle if it comes within reach before the swing is over (one begun in the
  // air waits until the jump comes down: the jump, then the swipe, then the smash); the computer swings by itself.
  for (const side of [0, 1] as const) {
    const p = world.players[side];
    if (!world.people[side] || !p.swing || world.phase !== "flying") continue;
    if (inReach(world, side)) {
      const { power, yaw, smash } = p.swing;
      strike(world, side, power, yaw, smash);
      out.push({ kind: "hit", side, smash, strength: Math.min(1, Math.hypot(world.shuttle.vx, world.shuttle.vy, world.shuttle.vz) / 60) });
    } else if (world.time - p.swing.at > SWING && !(p.swing.smash && airborne(world, side))) {
      p.swing = null;
      out.push({ kind: "whiff", side });
    }
  }
  const cpu = (1 - world.hitter) as 0 | 1,
    them = world.players[cpu],
    plan = world.plan;
  if (world.phase === "flying" && !world.people[cpu] && plan && !plan.leave && world.time >= plan.from) {
    // A smash is played from a jump, begun as the shuttle comes down toward the jump's reach above the computer.
    if (plan.smash && !airborne(world, cpu) && s.vy < 0 && s.y < TOP + 1.3 && s.y > TOP && Math.hypot(s.x - them.x, s.z - them.z) < REACH) {
      them.vy = JUMP;
      out.push({ kind: "jump", side: cpu });
    }
    const wanted = plan.smash && airborne(world, cpu) ? true : s.y < TOP - 0.25 || s.vy < 0;
    if (inReach(world, cpu) && wanted) {
      if (plan.miss) {
        // A misjudged stroke: the racket goes through, the shuttle on past it.
        world.plan = { ...plan, leave: true };
        them.struck = world.time;
        out.push({ kind: "whiff", side: cpu });
      } else {
        if (!airborne(world, cpu)) world.plan = { ...plan, smash: false };
        computerStroke(world, level, cpu);
        out.push({ kind: "hit", side: cpu, smash: world.smash, strength: Math.min(1, Math.hypot(world.shuttle.vx, world.shuttle.vy, world.shuttle.vz) / 60) });
      }
    }
  }
  return out;
}
