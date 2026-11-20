/**
 * The table tennis table, free of Three.js and the page: a ball with real physics at the table's scale (gravity, the
 * air's drag, spin through a simple Magnus force, a bounce on the table that loses a little and is kicked by the
 * spin, a net that stops or clips it), two paddles, and the rules of a rally (a serve bounces once on the server's
 * side and then once on the other; a return bounces once on the other side; a missed ball, a ball off the table, one
 * into the net or a second bounce ends the point). The view steps it in fixed slices and reports only the points.
 *
 * Units are metres and seconds. The table's top lies at y = 0, the net over z = 0; my end is at +z, the computer's
 * at -z. The hall's clock runs at `PACE` of the wall clock: real table tennis slowed a little so that a person can
 * play it with a mouse (every speed and spin is slowed alike, so the flight keeps its true shape).
 */
export const DT = 1 / 240;
export const PACE = 0.72;
export const HALF_L = 1.37,
  HALF_W = 0.7625,
  NET_H = 0.1525,
  /** How far the net reaches past each side line (its posts stand there). */
  NET_OUT = 0.1525,
  BALL = 0.022,
  FLOOR = -0.76,
  G = 9.81;
/** The air's drag, the Magnus force for a spin, the table's bounce and grip, the floor's bounce. */
const DRAG = 0.11,
  MAGNUS = 0.0045,
  TABLE_E = 0.86,
  GRIP = 0.22,
  FLOOR_E = 0.5;
/**
 * The blade's radius as drawn, half its thickness, and how far from its middle the ball is still struck: sideways
 * and up or down (a little more than the blade itself, so that a person meets the ball rather than grazes it).
 */
export const BLADE = 0.082,
  FACE = 0.012,
  REACH = 0.118,
  REACH_Y = 0.15;
/**
 * The height both blades are held at, always: the plane my hand moves my paddle over, and the computer's too. A
 * paddle never rises or drops to a ball; a ball that comes in high is met by stepping back (`DEEP`), where it has
 * come down to this height again.
 */
export const HAND_Y = 0.3,
  REST_Y = HAND_Y;
/** How fast a tossed ball goes up, how low it may fall before it is tossed again, and the computer's wait before it serves. */
export const TOSS = 1.6,
  TOSS_LOW = -0.08,
  SERVE_PAUSE = 0.9;
/** How far behind my end line my paddle may go, and the computer's. */
export const BACK = 0.6,
  FAR_BACK = 1.15;
/**
 * Stepping back for a high ball. A ball coming to a side is high when, after its bounce there, it rises more than
 * `HIGH` over the blades' height (out of a still blade's reach, `REACH_Y`): that side may then go back as far as
 * where the ball comes down to `MEET` over the blades' height again, and `STEP_ROOM` more, up to `DEEP` further
 * than its usual `BACK` (or `FAR_BACK`). The reach goes back at `STEP_OUT` and comes forward again at `STEP_IN`
 * (metres a second of the hall's time) once the ball has been struck back or the point is over, so that a paddle
 * standing back is walked forward, never thrown.
 */
export const HIGH = 0.15,
  MEET = 0.05,
  STEP_ROOM = 0.18,
  DEEP = 1.7,
  STEP_OUT = 3,
  STEP_IN = 0.9;
/** How long a rally may go without a stroke before it is ended. */
const IDLE = 6;
const PATH_N = 800;
/**
 * The computer by level: its paddle's top speed (metres a second), how long it takes to read a ball, how far its
 * paddle strays from where the ball will be, the speed and depth of its returns and serves, how wide and long its
 * aim strays, how far across it aims, how often it makes sure a return clears the net before playing it, and how
 * often it misjudges a stroke altogether (more often against a quick ball).
 */
export const LEVELS = {
  easy: { speed: 1.35, react: 0.32, stray: 0.16, pace: [3.2, 4.3], depth: [0.66, 0.88], serve: [3.4, 3.8], wide: 0.22, long: 0.16, spread: 0.3, check: 0.65, blunder: 0.1 },
  normal: { speed: 1.7, react: 0.22, stray: 0.1, pace: [4.2, 6.0], depth: [0.6, 0.9], serve: [3.4, 4.2], wide: 0.12, long: 0.09, spread: 0.55, check: 0.9, blunder: 0.05 },
  hard: { speed: 1.9, react: 0.17, stray: 0.05, pace: [5.2, 7.6], depth: [0.52, 0.92], serve: [3.6, 5.0], wide: 0.05, long: 0.05, spread: 0.85, check: 1, blunder: 0.025 },
};
export type Level = keyof typeof LEVELS;
/** Why a point ended (a move's `extra`). */
export const OUT = 0,
  NET = 1,
  MISSED = 2,
  DOUBLE = 3,
  FAULT = 4,
  OWN = 5;
export const WHY = ["아웃", "네트", "놓침", "투 바운드", "서브 실수", "자기 코트"];
export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Spin, in radians a second: about the x axis (topspin or backspin), the upright axis (sidespin) and z. */
  wx: number;
  wy: number;
  wz: number;
}
export interface Paddle {
  x: number;
  y: number;
  z: number;
  /** Its speed, smoothed over a few slices (the swing that meets the ball). */
  vx: number;
  vy: number;
  vz: number;
}
/** A stroke's aim: where across and how deep into the other half (0 at the net, 1 at the end line), its pace along the table and its spin. */
export interface Shot {
  tx: number;
  depth: number;
  pace: number;
  top: number;
  side: number;
  /** For a serve the computer places: how high it may rise off the server's side (a gentler serve rises higher). */
  rise?: number;
}
export type Phase = "ready" | "toss" | "rally" | "dead";
export type Happening =
  | { kind: "hit"; side: 0 | 1; strength: number }
  | { kind: "bounce"; side: 0 | 1; strength: number }
  | { kind: "floor"; strength: number }
  | { kind: "net" }
  | { kind: "let" }
  | { kind: "point"; to: 0 | 1; why: number };
export interface World {
  ball: Ball;
  paddles: [Paddle, Paddle];
  /** Where each side's hand sends its paddle (across and along the table); the height is always `HAND_Y`. */
  hands: [{ x: number; z: number }, { x: number; z: number }];
  phase: Phase;
  server: 0 | 1;
  /** Who struck last, the bounces on the striker's side and on the other since, whether the flight touched the net, whether it is a serve. */
  hitter: 0 | 1;
  own: number;
  other: number;
  netted: boolean;
  served: boolean;
  time: number;
  /** Time since the last stroke, and since the point ended. */
  since: number;
  dead: number;
  /** When each side last struck the ball (for the view's swing). */
  struck: [number, number];
  /** The ball's way from the last stroke on, as the table alone would have it: x, y, z and the bounces on each side, a slice apiece. */
  path: Float32Array;
  pathLen: number;
  pathAt: number;
  /**
   * How much further back than usual each side may stand for the ball now coming (`deep`, set at each stroke by
   * `stepBack`), and how far back its reach has gone so far (`stepped`, easing toward `deep`).
   */
  deep: [number, number];
  stepped: [number, number];
  /** The computer's hand: the wait before it serves, its reading of the ball, where it means to meet it and the height it strikes a serve at. */
  ai: { wait: number; delay: number; seen: number; plan: { x: number; z: number } | null; strikeY: number; holdX: number };
  seed: number;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** The world's own sequence, so that a game played the same way comes out the same. */
export function rand(world: World) {
  world.seed = (world.seed * 16807) % 2147483647;
  return (world.seed - 1) / 2147483646;
}
export function createWorld(seed = 1): World {
  const paddle = (z: number): Paddle => ({ x: 0, y: REST_Y, z, vx: 0, vy: 0, vz: 0 });
  const world: World = {
    ball: { x: 0, y: 0.1, z: -HALF_L - 0.2, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 },
    paddles: [paddle(HALF_L + 0.35), paddle(-HALF_L - 0.4)],
    hands: [
      { x: 0, z: HALF_L + 0.35 },
      { x: 0, z: -HALF_L - 0.4 },
    ],
    phase: "dead",
    server: 1,
    hitter: 1,
    own: 0,
    other: 0,
    netted: false,
    served: false,
    time: 0,
    since: 0,
    dead: 0,
    struck: [-9, -9],
    deep: [0, 0],
    stepped: [0, 0],
    path: new Float32Array(PATH_N * 4),
    pathLen: 0,
    pathAt: -1,
    ai: { wait: 0, delay: 0, seen: -9, plan: null, strikeY: HAND_Y, holdX: 0 },
    seed: Math.max(1, Math.floor(Math.abs(seed)) % 2147483646) || 1,
  };
  return world;
}
/**
 * Where a paddle of `side` may be: beside the table a little, not over the net, and no further back than the hall
 * allows (`stepped` further when it has stepped back for a high ball).
 */
export function keep(side: 0 | 1, x: number, z: number, limit = side === 0 ? 0.25 : -0.25, stepped = 0) {
  const across = HALF_W + 0.6;
  return {
    x: clamp(x, -across, across),
    z: side === 0 ? clamp(z, limit, HALF_L + BACK + stepped) : clamp(z, -HALF_L - FAR_BACK - stepped, limit),
  };
}
/** The nearest a paddle may come to the net: behind its end line while its side holds the ball to serve, a little over it during the toss. */
function frontOf(world: World, side: 0 | 1) {
  const serving = world.server === side && (world.phase === "ready" || world.phase === "toss"),
    near = !serving ? 0.25 : world.phase === "ready" ? HALF_L + 0.2 : HALF_L - 0.1;
  return side === 0 ? near : -near;
}
/** Where the server holds the ball before the toss: in front of its paddle and over it (so that it is seen), behind its end line. */
function hold(world: World) {
  const s = world.server,
    pad = world.paddles[s],
    b = world.ball;
  b.x = clamp(pad.x, -HALF_W - 0.3, HALF_W + 0.3);
  b.y = HAND_Y + 0.1;
  b.z = s === 0 ? Math.max(pad.z - 0.1, HALF_L + 0.08) : Math.min(pad.z + 0.1, -HALF_L - 0.08);
  b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = 0;
}
/** A new point: `server` holds the ball behind its end. */
export function serve(world: World, server: 0 | 1) {
  world.phase = "ready";
  world.server = world.hitter = server;
  world.own = world.other = 0;
  world.netted = world.served = false;
  world.since = world.dead = 0;
  world.pathLen = 0;
  world.pathAt = -1;
  world.ai.wait = SERVE_PAUSE;
  world.ai.plan = null;
  world.deep = [0, 0];
  world.ai.holdX = (rand(world) - 0.5) * 0.7;
  hold(world);
}
/** The ball thrown up from the server's open hand (`by` must be the server), to be struck as it falls. */
export function toss(world: World, by: 0 | 1 = world.server) {
  if (world.phase !== "ready" || by !== world.server) return false;
  hold(world);
  world.phase = "toss";
  world.ball.vy = TOSS;
  return true;
}
/** A paddle set straight down where a finger has just pressed, without sweeping the way between. */
export function place(world: World, side: 0 | 1, x: number, z: number) {
  const at = keep(side, x, z, frontOf(world, side), world.stepped[side]),
    pad = world.paddles[side];
  pad.x = at.x;
  pad.z = at.z;
  pad.vx = pad.vz = 0;
  world.hands[side] = { ...at };
  if (world.phase === "ready" && world.server === side) hold(world);
}
/** The air alone over one slice: gravity, drag and the Magnus force of the spin. */
function fly(b: Ball) {
  const speed = Math.hypot(b.vx, b.vy, b.vz),
    ax = -DRAG * speed * b.vx + MAGNUS * (b.wy * b.vz - b.wz * b.vy),
    ay = -G - DRAG * speed * b.vy + MAGNUS * (b.wz * b.vx - b.wx * b.vz),
    az = -DRAG * speed * b.vz + MAGNUS * (b.wx * b.vy - b.wy * b.vx);
  b.vx += ax * DT;
  b.vy += ay * DT;
  b.vz += az * DT;
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  b.z += b.vz * DT;
}
interface Contact {
  /** The side of the table it bounced on (-1 for none), and how hard. */
  table: number;
  strength: number;
  net: boolean;
  floor: boolean;
}
/**
 * One slice of the ball's flight with what it meets: the net (below its cord it is stopped and drops back; at the
 * cord it is clipped, slowed and popped up, and goes on over), the table's top (it bounces up a little lower, and its
 * spin grips: topspin kicks it on and low, backspin checks it) and the floor.
 */
export function advanceBall(b: Ball): Contact {
  const was = { y: b.y, z: b.z },
    hit: Contact = { table: -1, strength: 0, net: false, floor: false };
  fly(b);
  if ((was.z > 0) !== (b.z > 0) && Math.abs(b.x) <= HALF_W + NET_OUT && b.y < NET_H + BALL) {
    hit.net = true;
    if (b.y < NET_H - BALL * 0.4) {
      b.z = Math.sign(was.z || 1) * (BALL + 0.002);
      b.vz = -b.vz * 0.12;
      b.vx *= 0.4;
      b.vy *= 0.4;
      b.wx *= 0.3;
      b.wy *= 0.3;
    } else {
      b.vz *= 0.55;
      b.vx *= 0.8;
      b.vy = Math.abs(b.vy) * 0.4 + 0.35;
      b.wx *= 0.5;
    }
  }
  if (b.y < BALL && was.y >= BALL - 1e-6 && b.vy < 0 && Math.abs(b.x) <= HALF_W && Math.abs(b.z) <= HALF_L) {
    hit.table = b.z > 0 ? 0 : 1;
    hit.strength = -b.vy;
    b.y = BALL;
    b.vy = -b.vy * TABLE_E;
    // The point touching the table slips over it; the table's grip takes part of the slip away, from the ball's
    // way and from its spin alike (a hollow ball turns half as much again as it slides).
    const ux = b.vx + b.wz * BALL,
      uz = b.vz - b.wx * BALL;
    b.vx -= GRIP * ux;
    b.vz -= GRIP * uz;
    b.wx += (1.5 * GRIP * uz) / BALL;
    b.wz -= (1.5 * GRIP * ux) / BALL;
    b.wy *= 0.8;
    // A ball that has all but stopped bouncing rolls.
    if (b.vy < 0.12) b.vy = 0;
  }
  if (b.y < FLOOR + BALL && b.vy < 0) {
    hit.floor = true;
    hit.strength = -b.vy;
    b.y = FLOOR + BALL;
    b.vy = b.vy < -0.25 ? -b.vy * FLOOR_E : 0;
    b.vx *= 0.8;
    b.vz *= 0.8;
    b.wx *= 0.5;
    b.wy *= 0.5;
    b.wz *= 0.5;
  }
  return hit;
}
/** The height at which the air alone would carry the ball over the line z = `tz`. */
function heightAt(start: Ball, tz: number, f: number) {
  const c = { ...start };
  for (let t = 0; t < 3; t += DT) {
    const pz = c.z,
      py = c.y;
    fly(c);
    if ((c.z - tz) * f >= 0) return py + ((c.y - py) * (tz - pz)) / (c.z - pz || 1e-9);
    if (c.y < FLOOR - 2) return c.y;
  }
  return -Infinity;
}
/** The speed and spin that send a ball from `from` to come down at the shot's place in the other half (side `side` striking). */
export function aimed(from: { x: number; y: number; z: number }, side: 0 | 1, shot: Shot): Ball {
  const f = side === 0 ? -1 : 1,
    tz = f * clamp(shot.depth, 0.04, 1.8) * HALF_L,
    dx = shot.tx - from.x,
    dz = tz - from.z,
    far = Math.hypot(dx, dz) || 1,
    ball: Ball = { x: from.x, y: from.y, z: from.z, vx: (dx / far) * shot.pace, vy: 0, vz: (dz / far) * shot.pace, wx: f * shot.top, wy: shot.side, wz: 0 };
  let lo = -7,
    hi = 7;
  for (let k = 0; k < 24; k++) {
    ball.vy = (lo + hi) / 2;
    if (heightAt(ball, tz, f) < BALL) lo = ball.vy;
    else hi = ball.vy;
  }
  ball.vy = (lo + hi) / 2;
  return ball;
}
/** Where a ball goes with the table alone: the sides of its first two bounces and where the second was, whether it met the net, and how high it rose between them. */
function course(start: Ball) {
  const c = { ...start },
    bounces: { side: number; z: number }[] = [];
  let net = false,
    rise = 0;
  for (let k = 0; k < PATH_N && bounces.length < 2; k++) {
    const hit = advanceBall(c);
    if (hit.net) net = true;
    if (hit.table >= 0) bounces.push({ side: hit.table, z: c.z });
    else if (bounces.length === 1) rise = Math.max(rise, c.y);
    if (hit.floor) break;
  }
  return { bounces, net, rise };
}
/**
 * The speed and spin of a serve: it must come down first on the server's own side and then on the other, clear of
 * the net. The launch's height is tried from steeply down to gently up, and the legal serve that lands nearest the
 * shot's place is kept; if none is legal (struck far too hard), the one that came down first on its own side.
 */
export function aimedServe(from: { x: number; y: number; z: number }, side: 0 | 1, shot: Shot): { ball: Ball; legal: boolean; miss: number; rise: number } {
  const f = side === 0 ? -1 : 1,
    tz = f * clamp(shot.depth, 0.1, 1.6) * HALF_L,
    dx = shot.tx - from.x,
    dz = tz - from.z,
    far = Math.hypot(dx, dz) || 1,
    ball: Ball = { x: from.x, y: from.y, z: from.z, vx: (dx / far) * shot.pace, vy: 0, vz: (dz / far) * shot.pace, wx: f * shot.top, wy: shot.side, wz: 0 };
  let best = NaN,
    score = Infinity,
    found = { miss: 9, rise: 9 },
    fallback = -1,
    fallbackError = Infinity;
  for (let k = 0; k <= 95; k++) {
    ball.vy = -5 + k * 0.08;
    const { bounces, net, rise } = course(ball);
    if (bounces[0]?.side !== side) continue;
    // A serve kept low over the net is preferred to one bounced high off the server's end.
    const second = bounces[1],
      miss = second ? Math.abs(second.z - tz) : 9,
      worth = miss + 0.8 * Math.max(0, rise - 0.3);
    if (second?.side === 1 - side && !net) {
      if (worth < score) [best, score, found] = [ball.vy, worth, { miss, rise }];
    } else if (worth < fallbackError) [fallback, fallbackError] = [ball.vy, worth];
  }
  ball.vy = Number.isNaN(best) ? fallback : best;
  return { ball, legal: !Number.isNaN(best), ...found };
}
/**
 * A serve's aim. My swing sets its pace, eased up or down a little if that is what it takes to make it legal (so a
 * fair swing is never a fault by a hair); the computer chooses the place and takes the slowest pace that comes down
 * there and stays low (a deep serve has to be quicker than a short one).
 */
function served(from: { x: number; y: number; z: number }, side: 0 | 1, shot: Shot, search: boolean) {
  let first: Ball | null = null,
    best: { ball: Ball; worth: number } | null = null;
  const changes = search ? Array.from({ length: 12 }, (_, k) => k * 0.3) : [0, 0.4, -0.4, 0.8, 1.2];
  for (const change of changes) {
    const tried = aimedServe(from, side, { ...shot, pace: Math.max(2.4, shot.pace + change) });
    first ??= tried.ball;
    if (!tried.legal) continue;
    const rise = shot.rise ?? 0.45;
    if (!search || (tried.miss < 0.15 && tried.rise < rise)) return tried.ball;
    const worth = tried.miss + Math.max(0, tried.rise - rise);
    if (!best || worth < best.worth) best = { ball: tried.ball, worth };
  }
  return best?.ball ?? first!;
}
/** The ball's way from now on, as the table alone would have it, kept for the paddles' heights and the computer's reading. */
function predict(world: World) {
  const c = { ...world.ball },
    path = world.path;
  let mine = 0,
    theirs = 0,
    n = 0;
  for (; n < PATH_N; n++) {
    const hit = advanceBall(c);
    if (hit.table === 0) mine++;
    else if (hit.table === 1) theirs++;
    path[n * 4] = c.x;
    path[n * 4 + 1] = c.y;
    path[n * 4 + 2] = c.z;
    path[n * 4 + 3] = Math.min(mine, 7) + 8 * Math.min(theirs, 7);
    if (hit.floor) {
      n++;
      break;
    }
  }
  world.pathLen = n;
  world.pathAt = -1;
}
const bouncesOn = (world: World, k: number, side: 0 | 1) => (side === 0 ? world.path[k * 4 + 3] % 8 : Math.floor(world.path[k * 4 + 3] / 8));
/**
 * How much further back than usual `side` may stand for the ball now on its way to it (0 for a ball that is not
 * high). Read off the ball's way from the last stroke: after its bounce on `side`'s half, where it first comes down
 * to `MEET` over the blades' height again, if it rose more than `HIGH` over them on the way; the reach goes there and
 * `STEP_ROOM` beyond, up to `DEEP` more than usual. A ball that does not come down on `side`'s half needs no step.
 */
export function stepBack(world: World, side: 0 | 1) {
  const toward = side === 0 ? 1 : -1;
  let peak = -Infinity,
    before = Infinity;
  for (let k = Math.max(0, world.pathAt + 1); k < world.pathLen; k++) {
    const bounces = bouncesOn(world, k, side),
      y = world.path[k * 4 + 1];
    if (bounces >= 2) break;
    if (bounces === 1) {
      peak = Math.max(peak, y);
      // Once it has risen over the blades, the first slice on its way down again to `MEET` over them.
      if (peak > HAND_Y && y < before && y <= HAND_Y + MEET) {
        if (peak <= HAND_Y + HIGH) return 0;
        return clamp(toward * world.path[k * 4 + 2] + STEP_ROOM - HALF_L - (side === 0 ? BACK : FAR_BACK), 0, DEEP);
      }
    }
    before = y;
  }
  return 0;
}
const SMOOTH = 1 - Math.exp(-DT / 0.03);
/** Each paddle goes where its hand sends it, at the blades' height: mine all the way at once, the computer's at its top speed. */
function movePaddles(world: World, level: Level) {
  world.paddles.forEach((pad, s) => {
    const side = s as 0 | 1,
      hand = world.hands[side];
    world.stepped[side] += clamp(world.deep[side] - world.stepped[side], -STEP_IN * DT, STEP_OUT * DT);
    const at = keep(side, hand.x, hand.z, frontOf(world, side), world.stepped[side]),
      dx = at.x - pad.x,
      dz = at.z - pad.z,
      far = Math.hypot(dx, dz),
      most = side === 0 ? Infinity : LEVELS[level].speed * DT,
      share = far > most ? most / far : 1,
      x = pad.x + dx * share,
      z = pad.z + dz * share;
    pad.vx += ((x - pad.x) / DT - pad.vx) * SMOOTH;
    pad.vy = 0;
    pad.vz += ((z - pad.z) / DT - pad.vz) * SMOOTH;
    pad.x = x;
    pad.y = HAND_Y;
    pad.z = z;
  });
}
/** Whether `side` may strike the ball now: the server its tossed ball, the receiver a ball that has bounced once on its side. */
export function canHit(world: World, side: 0 | 1) {
  if (world.phase === "toss") return world.server === side;
  return world.phase === "rally" && world.hitter !== side && world.other >= 1;
}
/** The stroke my swing makes: its speed toward the other end hits harder, up the table gives topspin and back backspin, sideways sidespin; the place on the blade aims it. */
export function swingShot(world: World, side: 0 | 1, pad: Paddle, ox: number, oy: number, serving: boolean): Shot {
  const f = side === 0 ? -1 : 1,
    b = world.ball,
    forward = f * pad.vz,
    coming = Math.max(0, -f * b.vz),
    u = clamp(ox / REACH, -1.25, 1.25),
    w = clamp(oy / REACH_Y, -1, 1),
    pace = serving
      ? clamp(2.6 + 0.4 * Math.max(0, forward), 2.6, 7.5)
      : clamp(2.7 + 0.3 * coming + 0.6 * Math.max(0, forward) - 0.3 * Math.max(0, -forward) + 0.1 * Math.abs(pad.vx), 2.3, 11),
    // A stroke goes deeper as it is quicker, and a wild one (far quicker than a drive) goes long.
    depth = serving ? 0.42 + 0.07 * (pace - 2.6) + 0.08 * w : 0.36 + 0.06 * (pace - 3) + 0.035 * Math.max(0, pace - 6.5) ** 2 + 0.15 * w;
  return { tx: 0.2 * b.x + HALF_W * 0.95 * u + 0.07 * pad.vx, depth, pace, top: clamp(30 * forward, -200, 230), side: clamp(-f * 24 * pad.vx, -180, 180) };
}
/** Whether a stroke from where the ball is would come down first on the other side. */
function lands(world: World, side: 0 | 1, shot: Shot) {
  const { bounces } = course(aimed(world.ball, side, shot));
  return bounces[0]?.side === 1 - side;
}
/**
 * The computer's return: placed across the table as its level aims (the hardest away from my paddle), deep and
 * quick by its level, smashed when the ball sits up high, pushed with backspin now and then when it is low; its aim
 * strays a little, and (as often as its level checks) a stroke that would not clear the net is played softer.
 */
export function computerShot(world: World, level: Level): Shot {
  const L = LEVELS[level],
    b = world.ball,
    r = () => rand(world),
    mine = world.paddles[0];
  const aim =
    level === "hard" && r() < 0.7
      ? -Math.sign(mine.x || r() - 0.5) * HALF_W * (0.45 + 0.35 * r())
      : (r() - 0.5) * 2 * L.spread * HALF_W;
  const high = b.y > 0.3,
    low = b.y < 0.1,
    pace = L.pace[0] + r() * (L.pace[1] - L.pace[0]) + (high && level !== "easy" ? 1.6 : 0),
    depth = L.depth[0] + r() * (L.depth[1] - L.depth[0]),
    top = low && r() < 0.6 ? -(40 + 70 * r()) : 40 + 120 * r();
  let shot: Shot = {
    tx: aim + (r() - 0.5) * 2 * L.wide,
    depth: depth + (r() - 0.5) * 2 * L.long,
    pace,
    top,
    side: (r() - 0.5) * (level === "hard" ? 90 : 30),
  };
  // Now and then a stroke is misjudged: hit long or flat into the net, without a second look.
  if (r() < L.blunder * (1 + Math.max(0, Math.abs(b.vz) - 4) * 0.25)) return r() < 0.5 ? { ...shot, depth: shot.depth + 0.55 } : { ...shot, pace: shot.pace * 1.35, depth: 0.3, top: 0 };
  if (r() < L.check)
    for (let k = 0; k < 5 && !lands(world, 1, shot); k++) shot = { ...shot, pace: shot.pace * 0.85, depth: Math.min(0.85, shot.depth + 0.05), tx: shot.tx * 0.85, top: Math.abs(shot.top) };
  return shot;
}
/** The computer's serve: short and slow at the easiest level, quicker and wider with spin at the hardest. */
export function computerServe(world: World, level: Level): Shot {
  const L = LEVELS[level],
    r = () => rand(world);
  return {
    tx: (r() - 0.5) * 2 * L.spread * HALF_W * 0.8,
    depth: (level === "easy" ? 0.62 : level === "normal" ? 0.58 : 0.5) + r() * (level === "easy" ? 0.16 : level === "normal" ? 0.28 : 0.45),
    pace: L.serve[0] + r() * (L.serve[1] - L.serve[0]),
    top: (r() - 0.4) * (level === "easy" ? 60 : 160),
    side: (r() - 0.5) * (level === "easy" ? 20 : 120),
    rise: level === "easy" ? 0.62 : level === "normal" ? 0.5 : 0.42,
  };
}
/** The ball struck by `side` with `shot`: the rally goes on from here. */
export function launch(world: World, side: 0 | 1, shot: Shot, serving = false) {
  const b = world.ball,
    sent = serving ? served(b, side, shot, side === 1) : aimed(b, side, shot);
  Object.assign(b, sent);
  world.phase = "rally";
  world.hitter = side;
  world.own = world.other = 0;
  world.netted = false;
  world.served = serving;
  world.since = 0;
  world.struck[side] = world.time;
  predict(world);
  world.deep[side] = 0;
  world.deep[1 - side] = stepBack(world, (1 - side) as 0 | 1);
}
function point(world: World, to: 0 | 1, why: number): Happening {
  world.phase = "dead";
  world.dead = 0;
  world.deep = [0, 0];
  return { kind: "point", to, why };
}
/** What a bounce on `side`'s half means for the rally, if it ends the point or makes the serve a let. */
function bounced(world: World, side: 0 | 1): Happening | null {
  const h = world.hitter,
    r = (1 - h) as 0 | 1;
  if (world.other === 0) {
    if (side === h) {
      if (world.served && world.own === 0) {
        world.own = 1;
        return null;
      }
      return point(world, r, world.netted ? NET : world.served ? FAULT : OWN);
    }
    if (world.served && world.own === 0) return point(world, r, FAULT);
    world.other = 1;
    // A serve that touched the net and came down right is played again.
    if (world.served && world.netted) {
      world.phase = "dead";
      world.dead = 0;
      return { kind: "let" };
    }
    return null;
  }
  return point(world, h, side === r ? DOUBLE : MISSED);
}
/** The ball on the floor, or gone far, or left too long: whose fault it was. */
function grounded(world: World): Happening {
  const h = world.hitter,
    r = (1 - h) as 0 | 1;
  if (world.other === 0) return point(world, r, world.netted ? NET : world.served && world.own === 0 ? FAULT : OUT);
  return point(world, h, MISSED);
}
/** A stroke by `side` if its paddle's face, going from `before` to where it is, meets the ball on its way from `from`. */
function tryStrike(world: World, side: 0 | 1, before: { x: number; y: number; z: number }, from: { x: number; y: number; z: number }, level: Level, out: Happening[]) {
  const pad = world.paddles[side],
    b = world.ball,
    f = side === 0 ? -1 : 1,
    gap = BALL + FACE,
    r0 = (from.z - before.z) * f,
    r1 = (b.z - pad.z) * f;
  if (!(r0 > gap && r1 <= gap)) return;
  const t = (r0 - gap) / (r0 - r1),
    bx = from.x + (b.x - from.x) * t,
    by = from.y + (b.y - from.y) * t,
    ox = bx - (before.x + (pad.x - before.x) * t),
    oy = by - (before.y + (pad.y - before.y) * t);
  if ((ox / REACH) ** 2 + (oy / REACH_Y) ** 2 > 1) return;
  const serving = world.phase === "toss";
  b.x = bx;
  b.y = by;
  b.z = before.z + (pad.z - before.z) * t + f * gap;
  const shot = side === 0 ? swingShot(world, side, pad, ox, oy, serving) : computerShot(world, level);
  launch(world, side, shot, serving);
  out.push({ kind: "hit", side, strength: clamp(shot.pace / 9, 0.2, 1) });
}
/**
 * The computer's reading of a ball I have struck, for a blade held at `HAND_Y`: after its bounce, where it comes
 * down to that height (stepping back for a high ball, as far as `stepBack` lets it), or the top of its rise if it
 * never comes up so high; a high ball that would come down out of its reach is taken on the rise instead.
 */
function intercept(world: World, level: Level) {
  const L = LEVELS[level],
    deepest = -HALF_L - FAR_BACK - world.deep[1] + 0.08;
  let top = -1,
    rising = -1,
    falling = -1;
  for (let k = Math.max(0, world.pathAt + 1); k < world.pathLen; k++) {
    const mine = bouncesOn(world, k, 0),
      theirs = bouncesOn(world, k, 1),
      y = world.path[k * 4 + 1];
    // A ball of mine that comes down on my own side first needs no return (a serve must, once).
    if (theirs === 0 && mine > (world.served ? 1 : 0)) return null;
    if (theirs >= 2) break;
    if (theirs !== 1) continue;
    if (world.path[k * 4 + 2] < deepest) break;
    const up = k + 1 < world.pathLen && world.path[(k + 1) * 4 + 1] >= y;
    if (top < 0 || y > world.path[top * 4 + 1]) top = k;
    if (up && rising < 0 && y >= HAND_Y) rising = k;
    if (!up && y <= HAND_Y) {
      falling = k;
      break;
    }
  }
  const chosen = falling >= 0 ? falling : world.path[top * 4 + 1] < HAND_Y ? top : rising >= 0 ? rising : top;
  if (chosen < 0) return null;
  return { x: world.path[chosen * 4] + (rand(world) - 0.5) * 2 * L.stray, z: world.path[chosen * 4 + 2] - (BALL + FACE) };
}
/**
 * The computer's hand: it serves after its pause (tossing and striking the ball as it falls), reads a ball I have
 * struck only after its reaction time and goes to meet it, and otherwise waits behind the middle of its end.
 */
function think(world: World, level: Level, out: Happening[]) {
  const ai = world.ai,
    L = LEVELS[level],
    b = world.ball,
    home = { x: clamp(b.x * 0.3, -0.4, 0.4), z: -HALF_L - 0.45 };
  let hand = home;
  if (world.phase === "ready" && world.server === 1) {
    hand = { x: ai.holdX, z: -HALF_L - 0.3 };
    ai.wait -= DT;
    if (ai.wait <= 0 && toss(world, 1)) ai.strikeY = HAND_Y - 0.04 + rand(world) * 0.08;
  } else if (world.phase === "toss" && world.server === 1) {
    hand = { x: b.x, z: b.z - 0.12 };
    if (b.vy < 0 && b.y <= ai.strikeY) {
      launch(world, 1, computerServe(world, level), true);
      out.push({ kind: "hit", side: 1, strength: 0.4 });
    }
  } else if (world.phase === "rally" && world.hitter === 0) {
    if (world.struck[0] !== ai.seen) {
      ai.seen = world.struck[0];
      ai.delay = L.react * (0.75 + 0.5 * rand(world));
      ai.plan = null;
    }
    if (ai.delay > 0) ai.delay -= DT;
    else if (!ai.plan) ai.plan = intercept(world, level);
    hand = ai.plan ?? world.hands[1];
  }
  world.hands[1] = hand;
}
/**
 * One slice of time: the computer's hand, both paddles, the ball and what it meets, and the strokes. Returns what
 * happened, a point among it when the rally has ended (the world then waits, the ball still falling, until the view
 * calls `serve` for the next point).
 */
export function step(world: World, level: Level): Happening[] {
  const out: Happening[] = [];
  world.time += DT;
  think(world, level, out);
  const before = world.paddles.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  movePaddles(world, level);
  const b = world.ball;
  if (world.phase === "ready") {
    hold(world);
    return out;
  }
  const from = { x: b.x, y: b.y, z: b.z };
  if (world.phase === "toss") {
    b.vy -= G * DT;
    b.y += b.vy * DT;
    if (world.server === 0) tryStrike(world, 0, before[0], from, level, out);
    if (world.phase === "toss" && b.y < TOSS_LOW) {
      world.phase = "ready";
      world.ai.wait = 0.5;
      hold(world);
    }
    return out;
  }
  const hit = advanceBall(b);
  if (hit.net) out.push({ kind: "net" });
  if (hit.table >= 0) out.push({ kind: "bounce", side: hit.table as 0 | 1, strength: hit.strength });
  if (hit.floor && hit.strength > 0.25) out.push({ kind: "floor", strength: hit.strength });
  if (world.phase === "dead") {
    world.dead += DT;
    if (Math.abs(b.x) > 7 || Math.abs(b.z) > 9) b.vx = b.vy = b.vz = 0;
    return out;
  }
  world.pathAt++;
  world.since += DT;
  if (hit.net) world.netted = true;
  if (hit.table >= 0) {
    const ended = bounced(world, hit.table as 0 | 1);
    if (ended) out.push(ended);
  }
  if (world.phase === "rally" && (hit.floor || Math.abs(b.x) > 7 || Math.abs(b.z) > 9 || world.since > IDLE)) out.push(grounded(world));
  if (world.phase === "rally") for (const side of [0, 1] as const) if (canHit(world, side)) tryStrike(world, side, before[side], from, level, out);
  return out;
}
