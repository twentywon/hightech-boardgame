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
 * and up or down (well beyond the blade itself, so that a person meets the ball rather than misses it: the user asked
 * for a generous judgement, and then for a wider one still: about three blade widths each way across).
 */
export const BLADE = 0.082,
  FACE = 0.012,
  REACH = 0.26,
  REACH_Y = 0.32,
  /** The computer's reach, as it was: only mine was made generous. */
  THEIR_REACH = 0.118,
  THEIR_REACH_Y = 0.15;
/** The height of the plane my hand moves the paddle over, and the paddle's height when no ball is coming. */
export const HAND_Y = 0.2,
  REST_Y = 0.2;
/**
 * The highest my blade rises to meet a ball (a high lob can be met: the user asked), and the computer's, as it was.
 * The ring of my contact marker stands at the height my blade will be raised to, so within this too.
 */
export const REACH_TOP = 1.2,
  THEIR_TOP = 0.62;
/**
 * While a pointer holds my paddle the blade stays on the line of sight through it (`World.sight`, the eye): the hand
 * is the point of that line on the plane y = `HAND_Y`, and the blade is where the line comes to the blade's height,
 * so that on the screen it stands under the finger at any height. The line is followed no nearer the eye's height
 * than `SIGHT_GAP` (the view raises the eye for a high ball, so that it hardly ever comes to that).
 */
export const SIGHT_GAP = 0.15;
/** The height on the tossed ball's column at which my contact marker stands during my serve. */
export const TOSS_MARK = 0.2;
/** A ball that has just gone past my blade's face unstruck may still be caught by a sideways sweep that reaches it this many metres behind the face. */
export const LATE_DEPTH = 0.18;
/** The highest a stroke's flight may loop over the table (the user found high balls hard to meet): a slower stroke that would rise above it goes quicker and flatter. */
export const FLIGHT_TOP = 0.42;
/** How fast a tossed ball goes up, how low it may fall before it is tossed again, and the computer's wait before it serves. */
export const TOSS = 2.3,
  TOSS_LOW = -0.08,
  SERVE_PAUSE = 0.9;
/** How far a person's hand moves after its toss before its blade is let forward to the ball (see `World.tossedAt`). */
export const TOSS_MOVED = 0.03;
/** How far behind my end line my paddle may go, and the computer's. */
export const BACK = 0.6,
  FAR_BACK = 1.15;
/**
 * How a stroke of mine is judged from the racket's speed where it meets the ball (its whole speed over the hand's
 * plane, across and along, in metres a second of the hall's clock): from `SMASH` on it is a smash (far quicker, deep,
 * with topspin), as fast as it gets at `SMASH_FULL`. A swing mostly back toward me cuts.
 */
export const SMASH = 5.5,
  SMASH_FULL = 9.5;
/**
 * No stroke goes out (the user asked): every stroke is aimed no wider than `EDGE` across and no deeper than `DEEPEST`
 * of the other half, whoever strikes it and however hard; a ball curved after it was struck (`steer`) still comes
 * down within `LAND_IN` of the table's edges.
 */
export const EDGE = HALF_W * 0.9,
  DEEPEST = 0.92,
  LAND_IN = 0.04;
/**
 * The curve a person gives the ball after striking it (the user asked: no sidespin of its own at the stroke; the
 * blade's way after it bends the ball). For `STEER_TIME` of the hall's clock after the stroke (or until the ball
 * comes down on the other side) the blade moving across sets the ball's sidespin: `SIDE_SPIN` radians a second for
 * each metre a second across, at most `SIDE_MAX`, eased in over `STEER_EASE` seconds; it bends the ball the way the
 * blade goes (struck to the right and then drawn back left, it bows right and curves back left; pushed on to the
 * side, it goes on out that way, hard). A blade held still (under `STEER_STILL`) leaves the spin as it was.
 */
export const SIDE_SPIN = 110,
  SIDE_MAX = 650,
  STEER_TIME = 0.4,
  STEER_EASE = 0.05,
  STEER_STILL = 0.3;
/** How many slices back the racket's speed at contact is measured over (25 ms of the hall's clock, two frames or so). */
export const SWING_SLICES = 6;
/**
 * Where I stand: as the ball the computer sends me goes out to one side, I step that way (the eye goes with me and my
 * reach widens to that side), by `LEAN` of how far out it will come to my end, little for a ball near the middle and
 * at most `LEAN_MAX`, eased as a critically damped spring at `STANCE_RATE`; between points I come back to the middle.
 */
export const LEAN = 0.78,
  LEAN_MAX = 0.75,
  STANCE_RATE = 8.5;
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
/** The hardest computer smashes (the user asked): a ball over this height mostly, at this pace (metres a second). */
export const SMASH_HIGH = 0.3,
  THEIR_SMASH = [8.2, 9.8];
/** Why a point ended (a move's `extra`). */
export const OUT = 0,
  NET = 1,
  MISSED = 2,
  DOUBLE = 3,
  FAULT = 4,
  OWN = 5,
  /** A second let in a row on one serve (a house rule the user asked for: the server loses the point). */
  LETS = 6;
export const WHY = ["아웃", "네트", "놓침", "투 바운드", "서브 실수", "자기 코트", "렛 두 번"];
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
  /** Its speed over the last `SWING_SLICES` slices (the swing that meets the ball, not smoothed away). */
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
  /** Whether my racket came through quickly enough for a smash. */
  smash?: boolean;
  /** A stroke let loop as high as its pace takes it (no stroke in play is: the tests of the high reach make one). */
  loop?: boolean;
}
export type Phase = "ready" | "toss" | "rally" | "dead";
/** Where the eye stands (the view's camera), for the line of sight my blade keeps to. */
export interface Sight {
  x: number;
  y: number;
  z: number;
}
/** Where my blade will meet the coming ball (the contact marker): the ball's place there, at the height the blade will be raised to, and the path slice (-1 on a toss). */
export interface Meeting {
  x: number;
  y: number;
  z: number;
  k: number;
}
export type Happening =
  | { kind: "hit"; side: 0 | 1; strength: number; smash?: boolean }
  | { kind: "bounce"; side: 0 | 1; strength: number }
  | { kind: "floor"; strength: number }
  | { kind: "net" }
  | { kind: "let" }
  | { kind: "point"; to: 0 | 1; why: number };
export interface World {
  ball: Ball;
  paddles: [Paddle, Paddle];
  /** Where each side's hand sends its paddle (across and along the table); the height follows the ball by itself. */
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
   * The computer's hand: the wait before it serves, its reading of the ball, where it means to meet it and the height
   * it strikes a serve at; how far its paddle strays from the ball this time, and the curve (`World.bent`) it last read.
   */
  ai: { wait: number; delay: number; seen: number; plan: { x: number; z: number } | null; strikeY: number; holdX: number; stray: number; bent: number };
  /**
   * Each paddle's last `SWING_SLICES` + 1 places, for its speed at contact (oldest overwritten first): x, y, z and,
   * while my blade keeps to the line of sight, the hand on its plane in x and z and the eye in the last three (NaN otherwise).
   */
  trace: [Float64Array, Float64Array];
  /** My blade's last `SWING_SLICES` + 1 places across and up (x, y a slice), the way a sideways sweep went. */
  swept: Float64Array;
  /** The eye my blade keeps in line with the hand, or null (the keyboard, or no pointer): then the blade goes where the hand is. */
  sight: Sight | null;
  /** The slice count at which the coming ball went past my blade's face unstruck (-1 if it has not). */
  passed: number;
  ticks: number;
  /** Where I stand across (0 behind the middle), how fast I am stepping, and where I am stepping to. */
  stance: number;
  stanceV: number;
  stanceGoal: number;
  /** How much of a step I take: 1, or less where the page asks for less motion (set by the view). */
  lean: number;
  /** Lets served in a row on the point being played (the second loses it). */
  lets: number;
  seed: number;
  /**
   * Whether a person's hand plays each side (`[true, false]`: me against the computer). Over Wi-Fi both may be, or
   * the computer may stand in on either side for someone whose device dropped: a person's side has my reach and
   * my strokes (`swingShot`), its paddle goes where the hand is, and the computer does not think for it. Only side 0
   * has the line of sight, the late sweep and the step aside (the view of a person on side 1 aims along its own sight).
   */
  people: [boolean, boolean];
  /** The computer's hand on side 0, kept apart from side 1's (`ai`), when it stands in there. */
  nearAi: World["ai"];
  /**
   * Where a person's hand was when it tossed its serve, until it moves: till then its blade stays behind the ball (as
   * before the toss), so that a hand already reaching forward does not strike the ball the moment it is let go. The
   * user found a serve went off by itself as it was tossed; the swing (a swipe, the mouse) serves it.
   */
  tossedAt: { x: number; z: number } | null;
  /** A person's stroke still being curved by its blade (see `STEER_TIME`): whose, until when, and the spin the path was last read with. */
  steer: { side: 0 | 1; until: number; read: number } | null;
  /** How many times a curve has changed the ball's way (the computer reads the ball again when it does). */
  bent: number;
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
    path: new Float32Array(PATH_N * 4),
    pathLen: 0,
    pathAt: -1,
    ai: { wait: 0, delay: 0, seen: -9, plan: null, strikeY: 0.2, holdX: 0, stray: 0, bent: 0 },
    trace: [new Float64Array((SWING_SLICES + 1) * TRACE), new Float64Array((SWING_SLICES + 1) * TRACE)],
    swept: new Float64Array((SWING_SLICES + 1) * 2),
    sight: null,
    passed: -1,
    ticks: 0,
    stance: 0,
    stanceV: 0,
    stanceGoal: 0,
    lean: 1,
    lets: 0,
    seed: Math.max(1, Math.floor(Math.abs(seed)) % 2147483646) || 1,
    people: [true, false],
    nearAi: { wait: 0, delay: 0, seen: -9, plan: null, strikeY: 0.2, holdX: 0, stray: 0, bent: 0 },
    tossedAt: null,
    steer: null,
    bent: 0,
  };
  world.paddles.forEach((pad, side) => retrace(world, side as 0 | 1, pad));
  return world;
}
/** The numbers a trace keeps a slice. */
const TRACE = 6;
/** A paddle's trace filled with where it stands now, as if it had stood there still. */
function retrace(world: World, side: 0 | 1, pad: Paddle) {
  const trace = world.trace[side],
    sight = side === 0 ? world.sight : null,
    hand = world.hands[side];
  for (let k = 0; k < trace.length; k += TRACE) {
    if (sight) [trace[k], trace[k + 1], trace[k + 2], trace[k + 3], trace[k + 4], trace[k + 5]] = [hand.x, pad.y, hand.z, sight.x, sight.y, sight.z];
    else [trace[k], trace[k + 1], trace[k + 2], trace[k + 3], trace[k + 4], trace[k + 5]] = [pad.x, pad.y, pad.z, NaN, NaN, NaN];
  }
  if (side === 0) for (let k = 0; k < world.swept.length; k += 2) [world.swept[k], world.swept[k + 1]] = [pad.x, pad.y];
}
/**
 * Where on the line of sight from `eye` through `hand` (a point of the plane y = `HAND_Y`) the blade stands at height
 * `y`, across and along: seen from the eye it is exactly over the hand, so under the finger that points there. The
 * line is followed no nearer the eye's own height than `SIGHT_GAP`.
 */
export function alongSight(eye: Sight, hand: { x: number; z: number }, y: number) {
  const t = (eye.y - Math.min(y, eye.y - SIGHT_GAP)) / Math.max(1e-6, eye.y - HAND_Y);
  return { x: eye.x + (hand.x - eye.x) * t, z: eye.z + (hand.z - eye.z) * t };
}
/** The hand (on the plane y = `HAND_Y`) whose line of sight from `eye` puts the blade at `blade` at height `y`: `alongSight` undone. */
export function handFor(eye: Sight, blade: { x: number; z: number }, y: number) {
  const t = (eye.y - Math.min(y, eye.y - SIGHT_GAP)) / Math.max(1e-6, eye.y - HAND_Y);
  return { x: eye.x + (blade.x - eye.x) / t, z: eye.z + (blade.z - eye.z) / t };
}
/**
 * Where a paddle of `side` may be: beside the table a little, not over the net, and no further back than the hall
 * allows; my reach widens to the side I have stepped to (`stance`).
 */
export function keep(side: 0 | 1, x: number, z: number, limit = side === 0 ? 0.25 : -0.25, stance = 0) {
  const across = HALF_W + 0.6;
  return {
    x: clamp(x, -across + Math.min(0, stance), across + Math.max(0, stance)),
    z: side === 0 ? clamp(z, limit, HALF_L + BACK) : clamp(z, -HALF_L - FAR_BACK, limit),
  };
}
/** The nearest a paddle may come to the net: behind its end line while its side holds the ball to serve, a little over it during the toss. */
function frontOf(world: World, side: 0 | 1) {
  const serving = world.server === side && (world.phase === "ready" || world.phase === "toss"),
    // A tossing hand not yet moved keeps its blade where it held the ball from: behind it (see `World.tossedAt`).
    near = !serving ? 0.25 : world.phase === "ready" ? HALF_L + 0.2 : world.tossedAt ? Math.abs(world.ball.z) + 0.1 : HALF_L - 0.1;
  return side === 0 ? near : -near;
}
/** Where the server holds the ball before the toss: in front of its paddle and over it (so that it is seen), behind its end line. */
function hold(world: World) {
  const s = world.server,
    pad = world.paddles[s],
    b = world.ball;
  b.x = clamp(pad.x, -HALF_W - 0.3, HALF_W + 0.3);
  b.y = 0.3;
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
  world.ai.holdX = (rand(world) - 0.5) * 0.7;
  if (!world.people[0]) Object.assign(world.nearAi, { wait: SERVE_PAUSE, plan: null, holdX: (rand(world) - 0.5) * 0.7 });
  world.stanceGoal = 0;
  world.passed = -1;
  world.tossedAt = null;
  world.steer = null;
  hold(world);
}
/** The ball thrown up from the server's open hand (`by` must be the server), to be struck as it falls. */
export function toss(world: World, by: 0 | 1 = world.server) {
  if (world.phase !== "ready" || by !== world.server) return false;
  hold(world);
  world.phase = "toss";
  world.ball.vy = TOSS;
  world.tossedAt = world.people[by] ? { ...world.hands[by] } : null;
  return true;
}
/**
 * A paddle set straight down where a finger has just pressed, without sweeping the way between (a hand, on the line
 * of sight while my blade keeps to it).
 */
export function place(world: World, side: 0 | 1, x: number, z: number) {
  const pad = world.paddles[side],
    sighted = side === 0 && !!world.sight;
  world.hands[side] = sighted ? { x, z } : keep(side, x, z, frontOf(world, side), side === 0 ? world.stance : 0);
  const at = bladeAt(world, side, sighted ? sightHeight(world) : pad.y);
  pad.x = at.x;
  pad.z = at.z;
  pad.vx = pad.vy = pad.vz = 0;
  retrace(world, side, pad);
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
/** The height (and the place across, and the highest the ball rose on the way) at which the air alone would carry the ball over the line z = `tz`. */
const crossing = { y: 0, x: 0, top: 0 };
function heightAt(start: Ball, tz: number, f: number) {
  const c = { ...start };
  crossing.x = c.x;
  crossing.top = c.y;
  for (let t = 0; t < 3; t += DT) {
    const pz = c.z,
      py = c.y,
      px = c.x;
    fly(c);
    if (c.y > crossing.top) crossing.top = c.y;
    if ((c.z - tz) * f >= 0) {
      const share = (tz - pz) / (c.z - pz || 1e-9);
      crossing.x = px + (c.x - px) * share;
      return py + (c.y - py) * share;
    }
    crossing.x = c.x;
    if (c.y < FLOOR - 2) return c.y;
  }
  return -Infinity;
}
/**
 * The speed and spin that send a ball from `from` to come down at the shot's place in the other half (side `side`
 * striking). With `bend` the aim allows for the sidespin's curve: the ball is sent out to the other side of the place
 * by as much as the spin will bring it back, so that it bends on its way and still comes down there.
 */
export function aimed(from: { x: number; y: number; z: number }, side: 0 | 1, shot: Shot, bend = false): Ball {
  const f = side === 0 ? -1 : 1,
    tz = f * clamp(shot.depth, 0.04, 1.8) * HALF_L,
    dz = tz - from.z,
    ball: Ball = { x: from.x, y: from.y, z: from.z, vx: 0, vy: 0, vz: 0, wx: f * shot.top, wy: shot.side, wz: 0 };
  // A ball that would loop higher than `FLIGHT_TOP` (or than it was struck from) is sent quicker and flatter instead.
  const cap = shot.loop ? Infinity : Math.max(FLIGHT_TOP, from.y + 0.05);
  let pace = shot.pace;
  for (let tries = 0; ; tries++) {
    aimAt(from, ball, shot, pace, tz, dz, f, bend);
    heightAt(ball, tz, f);
    if (crossing.top <= cap || tries >= 8) return ball;
    pace *= 1.1;
  }
}
/** The speed `aimed` gives `ball` for the shot at `pace`, its height solved to come down at depth `tz`. */
function aimAt(from: { x: number; y: number; z: number }, ball: Ball, shot: Shot, pace: number, tz: number, dz: number, f: number, bend: boolean) {
  let toward = shot.tx;
  const rounds = bend && shot.side ? 5 : 1;
  for (let round = 0; round < rounds; round++) {
    const dx = toward - from.x,
      far = Math.hypot(dx, dz) || 1;
    ball.vx = (dx / far) * pace;
    ball.vz = (dz / far) * pace;
    let lo = -7,
      hi = 7;
    for (let k = 0; k < 24; k++) {
      ball.vy = (lo + hi) / 2;
      if (heightAt(ball, tz, f) < BALL) lo = ball.vy;
      else hi = ball.vy;
    }
    ball.vy = (lo + hi) / 2;
    if (round === rounds - 1) break;
    heightAt(ball, tz, f);
    toward += shot.tx - crossing.x;
  }
}
/** Where a ball goes with the table alone: the sides of its first two bounces and where the second was, whether it met the net, and how high it rose between them. */
function course(start: Ball) {
  const c = { ...start },
    bounces: { side: number; x: number; z: number }[] = [];
  let net = false,
    rise = 0;
  for (let k = 0; k < PATH_N && bounces.length < 2; k++) {
    const hit = advanceBall(c);
    if (hit.net) net = true;
    if (hit.table >= 0) bounces.push({ side: hit.table, x: c.x, z: c.z });
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
 * The slice of the path at which the ball, having bounced on `side`'s half, comes to a paddle's face, or -1. The
 * face stands at `zAt(height)`. A blade where the hand is waits at one depth, and the ball comes to it from the
 * net. My blade on the line of sight (`sighted`) stands nearer me the higher it is raised, so the ball comes to its
 * face where, seen from the eye, it passes the pointer: going down past it, or rising to it (a lob that bounced
 * below it); either way counts, and before its bounce it passes by. If it never quite does (it rises to the pointer
 * and turns back), the slice where it comes nearest: a blade set at that height meets it a moment later.
 */
function meeting(world: World, side: 0 | 1, zAt: (y: number) => number, sighted = false) {
  const f = side === 0 ? -1 : 1,
    gap = BALL + FACE,
    past = (y: number, z: number) => (z - zAt(y)) * f <= gap;
  let was = sighted && past(world.ball.y, world.ball.z),
    nearest = -1,
    least = Infinity;
  for (let k = Math.max(0, world.pathAt + 1); k < world.pathLen; k++) {
    const bounces = bouncesOn(world, k, side),
      y = world.path[k * 4 + 1],
      z = world.path[k * 4 + 2];
    if (bounces >= 2 || (sighted && z > HALF_L + BACK + BALL)) break;
    const now = past(y, z);
    if (bounces >= 1 && now !== was && (now || sighted)) return k;
    if (!sighted) continue;
    was = now;
    // Where the ball only comes up to the pointer and turns away (or never quite reaches it), the nearest it comes.
    const off = Math.abs((z - zAt(y)) * f - gap);
    if (bounces >= 1 && off < least) [nearest, least] = [k, off];
  }
  return nearest;
}
/** A blade's height kept within its reach: not into the table over it, and no higher than its side's top (a person's, or the computer's). */
function heightWithin(side: 0 | 1, y: number, z: number, person = side === 0) {
  return clamp(y, Math.abs(z) < HALF_L + 0.02 ? 0.06 : -0.3, person ? REACH_TOP : THEIR_TOP);
}
/** Where `side`'s blade stands across and along with its height at `y`: where the hand is, or on the line of sight through it (mine, while a pointer holds it). */
function bladeAt(world: World, side: 0 | 1, y: number) {
  const hand = world.hands[side],
    sight = side === 0 ? world.sight : null,
    p = sight ? alongSight(sight, hand, y) : hand;
  return keep(side, p.x, p.z, frontOf(world, side), side === 0 ? world.stance : 0);
}
/** Where my blade's face will stand for a ball met at height `y` (raised as far as it may go). */
const myFace = (world: World) => (y: number) => {
  const z = bladeAt(world, 0, heightWithin(0, y, world.hands[0].z)).z;
  return bladeAt(world, 0, heightWithin(0, y, z)).z;
};
/** The height a paddle's blade goes to: where the coming ball will meet it, or where it is being tossed, or at rest. */
function reachHeight(world: World, side: 0 | 1, zAt: (y: number) => number) {
  let y = REST_Y;
  if (world.phase === "toss" && world.server === side) y = world.ball.y;
  else if (world.phase === "ready" && world.server === side) y = 0.12;
  else if (world.phase === "rally" && world.hitter !== side) {
    const k = meeting(world, side, zAt, side === 0 && !!world.sight);
    if (k >= 0) y = world.path[k * 4 + 1];
  }
  return heightWithin(side, y, zAt(y), world.people[side]);
}
/**
 * Where my blade will meet the ball now coming to me (the view's contact marker), by the same reading of the path
 * that raises the blade: the ball's place as it comes to the face, at the height the blade will be raised to; on my
 * serve's toss, the tossed ball's column at `TOSS_MARK`. Null when no ball is coming that I may strike.
 */
export function contact(world: World): Meeting | null {
  const b = world.ball;
  if (world.phase === "toss" && world.server === 0) return { x: b.x, y: TOSS_MARK, z: b.z, k: -1 };
  if (world.phase !== "rally" || world.hitter === 0) return null;
  const zAt = myFace(world),
    k = meeting(world, 0, zAt, !!world.sight);
  if (k < 0) return null;
  // Between the slice before and this one, where the ball comes to the face itself.
  const path = world.path,
    prev = k - 1 > world.pathAt && k > 0 ? { x: path[k * 4 - 4], y: path[k * 4 - 3], z: path[k * 4 - 2] } : { x: b.x, y: b.y, z: b.z },
    before = prev.z - (zAt(prev.y) - (BALL + FACE)),
    after = path[k * 4 + 2] - (zAt(path[k * 4 + 1]) - (BALL + FACE)),
    t = clamp(before / (before - after || 1e-9), 0, 1),
    x = prev.x + (path[k * 4] - prev.x) * t,
    y = prev.y + (path[k * 4 + 1] - prev.y) * t,
    z = prev.z + (path[k * 4 + 2] - prev.z) * t;
  return { x, y: heightWithin(0, y, z), z, k };
}
/**
 * The height at which my blade is set on the line of sight: where it will meet the coming ball (`contact`), on my
 * serve's toss the marker's height on the ball's column, or where it is. Set there at once, so that the ball
 * comes to its face where the marker says even while the blade is still rising to it (and a blade only rising or
 * sinking does not move across or along).
 */
function sightHeight(world: World, met = contact(world)) {
  if (world.phase === "toss" && world.server === 0) return TOSS_MARK;
  if (world.phase === "ready" && world.server === 0) return 0.12;
  // With no ball to meet, at the blade's own height as it sinks back to rest, so that it glides back along the line.
  return met?.y ?? world.paddles[0].y;
}
/**
 * How high the ball now coming to me will rise over my end while I may strike it (after its bounce on my side, up to
 * where my blade can still go), at most my blade's top; 0 when none is coming. The view raises the eye by it.
 */
export function highest(world: World) {
  if (world.phase !== "rally" || world.hitter === 0) return 0;
  let top = 0;
  for (let k = Math.max(0, world.pathAt + 1); k < world.pathLen; k++) {
    const bounces = bouncesOn(world, k, 0);
    if (bounces >= 2 || world.path[k * 4 + 2] > HALF_L + BACK + 0.1) break;
    if (bounces >= 1) top = Math.max(top, world.path[k * 4 + 1]);
  }
  return Math.min(top, REACH_TOP);
}
const EASE = 1 - Math.exp(-DT / 0.035);
/**
 * Each paddle goes where its hand sends it: mine all the way at once, the computer's at its top speed. Its speed is
 * what it went over the last `SWING_SLICES` slices: the racket's true speed where it meets the ball.
 */
function movePaddles(world: World, level: Level) {
  world.ticks++;
  // A tossing hand that has moved (by `TOSS_MOVED`) is swinging: its blade may now come forward to the ball.
  const tossed = world.tossedAt,
    tosser = world.hands[world.server];
  if (tossed && (world.phase !== "toss" || Math.hypot(tosser.x - tossed.x, tosser.z - tossed.z) > TOSS_MOVED)) world.tossedAt = null;
  const slot = world.ticks % (SWING_SLICES + 1),
    at_ = slot * TRACE,
    oldest = ((world.ticks + 1) % (SWING_SLICES + 1)) * TRACE,
    span = SWING_SLICES * DT;
  world.paddles.forEach((pad, s) => {
    const side = s as 0 | 1,
      hand = world.hands[side],
      sight = side === 0 ? world.sight : null,
      trace = world.trace[side];
    let x: number, y: number, z: number;
    // On the line of sight: placed for the height where it will meet the ball, and rising (or sinking) to it.
    const met = sight ? contact(world) : null,
      placed = sight ? sightHeight(world, met) : 0;
    if (sight) {
      ({ x, z } = bladeAt(world, 0, placed));
      // It rises to the ball it will meet, follows a tossed ball, and otherwise goes back to rest.
      const goal = world.phase === "toss" && world.server === 0 ? world.ball.y : world.phase === "ready" && world.server === 0 ? 0.12 : met?.y ?? REST_Y;
      y = pad.y + (heightWithin(0, goal, z) - pad.y) * EASE;
    } else {
      const at = bladeAt(world, side, pad.y),
        dx = at.x - pad.x,
        dz = at.z - pad.z,
        far = Math.hypot(dx, dz),
        most = world.people[side] ? Infinity : LEVELS[level].speed * DT,
        share = far > most ? most / far : 1;
      x = pad.x + dx * share;
      z = pad.z + dz * share;
      y = pad.y + (reachHeight(world, side, () => z) - pad.y) * EASE;
    }
    if (sight) [trace[at_], trace[at_ + 1], trace[at_ + 2], trace[at_ + 3], trace[at_ + 4], trace[at_ + 5]] = [hand.x, y, hand.z, sight.x, sight.y, sight.z];
    else [trace[at_], trace[at_ + 1], trace[at_ + 2], trace[at_ + 3], trace[at_ + 4], trace[at_ + 5]] = [x, y, z, NaN, NaN, NaN];
    // The swing is what the hand went over the window, each place of it seen at the height the blade is set for now:
    // a blade only set for another height along the line of sight (the finger still) is not swinging.
    let ox = trace[oldest],
      oz = trace[oldest + 2];
    if (!Number.isNaN(trace[oldest + 3])) {
      const then = alongSight({ x: trace[oldest + 3], y: trace[oldest + 4], z: trace[oldest + 5] }, { x: ox, z: oz }, placed),
        kept = keep(0, then.x, then.z, frontOf(world, 0), world.stance);
      [ox, oz] = [kept.x, kept.z];
    }
    pad.vx = (x - ox) / span;
    pad.vy = (y - trace[oldest + 1]) / span;
    pad.vz = (z - oz) / span;
    pad.x = x;
    pad.y = y;
    pad.z = z;
    if (side === 0) [world.swept[slot * 2], world.swept[slot * 2 + 1]] = [x, y];
  });
}
/** How far I step for a ball that will come to my end `x` across: hardly for one near the middle, more the wider it goes. */
export function leanFor(x: number) {
  return clamp((LEAN * x * Math.abs(x)) / (Math.abs(x) + 0.25), -LEAN_MAX, LEAN_MAX);
}
/** Where across the ball the computer has struck will come to my end (by the table alone), or 0 if it never gets there. */
export function arrival(world: World) {
  let x = 0;
  for (let k = 0; k < world.pathLen; k++) {
    if (bouncesOn(world, k, 0) >= 2) break;
    x = world.path[k * 4];
    if (world.path[k * 4 + 2] >= HALF_L + 0.15) return x;
  }
  return x;
}
/** One slice of my step: a critically damped spring toward where I mean to stand (no overshoot from rest, no jump). */
function stepAside(world: World) {
  if (world.phase === "dead" && world.dead > 0.4) world.stanceGoal = 0;
  const w = STANCE_RATE,
    a = w * w * (world.stanceGoal * world.lean - world.stance) - 2 * w * world.stanceV;
  world.stanceV += a * DT;
  world.stance += world.stanceV * DT;
}
/** Whether `side` may strike the ball now: the server its tossed ball, the receiver a ball that has bounced once on its side. */
export function canHit(world: World, side: 0 | 1) {
  if (world.phase === "toss") return world.server === side;
  return world.phase === "rally" && world.hitter !== side && world.other >= 1;
}
/**
 * The stroke my swing makes, from the swing alone (where the ball meets the blade does not aim it). The racket's
 * whole speed where it meets the ball decides it: from `SMASH` on it is a smash (far quicker, deep and with
 * topspin), slower it is a gentle return that grows with the speed; a swing mostly back toward me cuts (backspin,
 * slow). A swing to one side sends the ball that way with sidespin that curves it. The step I am taking aside is not
 * part of the swing.
 */
export function swingShot(world: World, side: 0 | 1, pad: Paddle, _ox: number, oy: number, serving: boolean): Shot {
  const f = side === 0 ? -1 : 1,
    b = world.ball,
    vx = pad.vx - (side === 0 ? world.stanceV : 0),
    forward = f * pad.vz,
    back = Math.max(0, -forward),
    speed = Math.hypot(vx, pad.vz),
    coming = Math.max(0, -f * b.vz),
    // Where on the blade it met counts for nothing but a touch of height (a ball met low on the blade goes a little shorter).
    w = 0.25 * clamp(oy / REACH_Y, -1, 1),
    across = clamp(0.16 * vx, -1.25, 1.25),
    tx = clamp(0.2 * b.x + HALF_W * 0.95 * across, -EDGE, EDGE);
  // No sidespin at the stroke (the user asked): the ball goes straight where the swing sent it, and the blade's way
  // after the stroke curves it (`steer`).
  if (serving) {
    const pace = clamp(2.6 + 0.4 * Math.max(0, forward), 2.6, 7.5);
    return { tx: clamp(tx, -HALF_W * 0.85, HALF_W * 0.85), depth: 0.42 + 0.07 * (pace - 2.6) + 0.08 * w, pace, top: clamp(30 * forward, -200, 230), side: 0 };
  }
  if (back > 0.8 && back >= 0.6 * speed) {
    const pace = clamp(2.7 + 0.3 * coming - 0.3 * back, 2.3, 5);
    return { tx, depth: Math.min(DEEPEST, 0.4 + 0.06 * (pace - 3) + 0.15 * w), pace, top: -clamp(40 + 30 * back, 40, 220), side: 0 };
  }
  if (speed >= SMASH) {
    const s = clamp((speed - SMASH) / (SMASH_FULL - SMASH), 0, 1),
      pace = clamp(7.6 + 3.4 * s + 0.15 * coming, 7.6, 12);
    // However quick the swing, it comes down deep on the table, never long (the user asked: no outs).
    return { tx, depth: Math.min(DEEPEST, 0.8 + 0.06 * s + 0.1 * w), pace, top: 150 + 60 * s, side: 0, smash: true };
  }
  const pace = clamp(2.7 + 0.3 * coming + 0.5 * speed, 2.3, 7);
  return { tx, depth: Math.min(DEEPEST, 0.38 + 0.06 * (pace - 3) + 0.15 * w), pace, top: clamp(30 * Math.max(0, forward), 0, 160), side: 0 };
}
/** A shot kept on the table: no wider than `EDGE`, no deeper than `DEEPEST`. */
const onTable = (shot: Shot): Shot => ({ ...shot, tx: clamp(shot.tx, -EDGE, EDGE), depth: Math.min(DEEPEST, shot.depth) });
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
export function computerShot(world: World, level: Level, side: 0 | 1 = 1): Shot {
  return onTable(computerChoice(world, level, side));
}
function computerChoice(world: World, level: Level, side: 0 | 1): Shot {
  const L = LEVELS[level],
    b = world.ball,
    r = () => rand(world),
    mine = world.paddles[1 - side];
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
  // At the hardest level a ball that sits up is smashed (most of the time), and now and then one that does not.
  if (level === "hard" && !low && r() < (b.y > SMASH_HIGH ? 0.65 : 0.12)) {
    const smash: Shot = { tx: shot.tx, depth: 0.78 + 0.12 * r(), pace: THEIR_SMASH[0] + r() * (THEIR_SMASH[1] - THEIR_SMASH[0]), top: 170 + 50 * r(), side: shot.side * 0.5, smash: true };
    for (let k = 0; k < 4 && !lands(world, side, smash); k++) [smash.pace, smash.depth] = [smash.pace * 0.92, Math.max(0.6, smash.depth - 0.05)];
    if (lands(world, side, smash)) return smash;
  }
  // Now and then a stroke is misjudged: hit flat into the net, without a second look (never long: no outs).
  if (r() < L.blunder * (1 + Math.max(0, Math.abs(b.vz) - 4) * 0.25)) return { ...shot, pace: shot.pace * 1.35, depth: 0.3, top: 0 };
  if (r() < L.check)
    for (let k = 0; k < 5 && !lands(world, side, shot); k++) shot = { ...shot, pace: shot.pace * 0.85, depth: Math.min(0.85, shot.depth + 0.05), tx: shot.tx * 0.85, top: Math.abs(shot.top) };
  return shot;
}
/** The computer's serve: short and slow at the easiest level, quicker and wider with spin at the hardest. */
export function computerServe(world: World, level: Level): Shot {
  const L = LEVELS[level],
    r = () => rand(world);
  return {
    tx: (r() - 0.5) * 2 * L.spread * HALF_W * 0.75,
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
    // The aim allows for any sidespin's curve (only the computer's strokes have any), so that it stays on the table.
    sent = serving ? served(b, side, shot, !world.people[side]) : aimed(b, side, shot, true);
  Object.assign(b, sent);
  world.steer = world.people[side] ? { side, until: world.time + STEER_TIME, read: b.wy } : null;
  world.phase = "rally";
  world.hitter = side;
  world.own = world.other = 0;
  world.netted = false;
  world.served = serving;
  world.since = 0;
  world.struck[side] = world.time;
  world.passed = -1;
  predict(world);
  // A ball sent to me: I step toward where it will come.
  if (side === 1 && world.people[0]) world.stanceGoal = leanFor(arrival(world));
}
function point(world: World, to: 0 | 1, why: number): Happening {
  world.lets = 0;
  world.phase = "dead";
  world.dead = 0;
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
    // A serve that touched the net and came down right is played again; the second in a row loses the point.
    if (world.served && world.netted) {
      if (++world.lets >= 2) return point(world, r, LETS);
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
/**
 * How far the ball at (`x`, `y`) is from the way my blade swept over the last slices (across and up, each measured
 * in its reach, so that 1 is the edge of the judgement), and the blade's offset where it came nearest.
 */
export function sweptFrom(world: World, x: number, y: number, slices = SWING_SLICES) {
  const n = SWING_SLICES + 1,
    ring = world.swept,
    best = { d: Infinity, ox: 0, oy: 0 };
  const at = (j: number) => {
    const k = (((world.ticks - j) % n) + n) % n;
    return { x: ring[k * 2], y: ring[k * 2 + 1] };
  };
  let b = at(0);
  for (let j = 0; j <= Math.min(slices, SWING_SLICES); j++) {
    const a = j === 0 ? b : at(j),
      // The nearest point of the stretch from a to b, in reach units.
      ax = a.x / REACH,
      ay = a.y / REACH_Y,
      ex = b.x / REACH - ax,
      ey = b.y / REACH_Y - ay,
      px = x / REACH - ax,
      py = y / REACH_Y - ay,
      s = ex || ey ? clamp((px * ex + py * ey) / (ex * ex + ey * ey), 0, 1) : 0,
      dx = px - s * ex,
      dy = py - s * ey,
      d = Math.hypot(dx, dy);
    if (d < best.d) [best.d, best.ox, best.oy] = [d, dx * REACH, dy * REACH_Y];
    b = a;
  }
  return best;
}
/**
 * A stroke by `side` if its paddle's face, going from `before` to where it is, meets the ball on its way from `from`.
 * Mine is judged along the swing: as the ball comes to the face, by the nearest the blade came to it over the last
 * `SWING_SLICES` slices, and for that many slices after it has gone past the face unstruck (up to `LATE_DEPTH`
 * behind it), by whether the blade sweeps across it now; so a quick sideways swing that is seen to pass through the
 * ball strikes it, whenever in the frame it passed.
 */
function tryStrike(world: World, side: 0 | 1, before: { x: number; y: number; z: number }, from: { x: number; y: number; z: number }, level: Level, out: Happening[]) {
  const pad = world.paddles[side],
    b = world.ball,
    f = side === 0 ? -1 : 1,
    gap = BALL + FACE,
    r0 = (from.z - before.z) * f,
    r1 = (b.z - pad.z) * f;
  let bx: number, by: number, bz: number, oy: number;
  if (r0 > gap && r1 <= gap) {
    const t = (r0 - gap) / (r0 - r1);
    bx = from.x + (b.x - from.x) * t;
    by = from.y + (b.y - from.y) * t;
    bz = before.z + (pad.z - before.z) * t + f * gap;
    const ox = bx - (before.x + (pad.x - before.x) * t);
    oy = by - (before.y + (pad.y - before.y) * t);
    if (!world.people[side]) {
      if ((ox / THEIR_REACH) ** 2 + (oy / THEIR_REACH_Y) ** 2 > 1) return;
    } else if ((ox / REACH) ** 2 + (oy / REACH_Y) ** 2 > 1) {
      // Only side 0 keeps the way its blade swept (a person on side 1 is judged by the face alone).
      if (side !== 0) return;
      const near = sweptFrom(world, bx, by);
      if (near.d > 1) {
        world.passed = world.ticks;
        return;
      }
      oy = near.oy;
    }
  } else {
    // Gone past my face unstruck a moment ago, and not far: a sweep across it now still strikes it, set back on the face.
    if (side !== 0 || !world.people[0] || world.passed < 0 || world.ticks - world.passed > SWING_SLICES || r1 > gap || r1 < gap - LATE_DEPTH) return;
    const near = sweptFrom(world, b.x, b.y, 1);
    if (near.d > 1) return;
    [bx, by, bz, oy] = [b.x, b.y, pad.z + f * gap, near.oy];
  }
  const serving = world.phase === "toss";
  b.x = bx;
  b.y = by;
  b.z = bz;
  const shot = world.people[side] ? swingShot(world, side, pad, 0, oy, serving) : computerShot(world, level, side);
  launch(world, side, shot, serving);
  out.push(shot.smash ? { kind: "hit", side, strength: 1, smash: true } : { kind: "hit", side, strength: clamp(shot.pace / 9, 0.2, 1) });
}
/**
 * The computer's reading of a ball the other side has struck: where, after its bounce, it comes to the top of its
 * rise (within reach). `side` is the computer's (1, or 0 where it stands in over Wi-Fi); `end` is its end's sign.
 */
function intercept(world: World, side: 0 | 1, stray: number) {
  const end = side === 1 ? -1 : 1,
    back = side === 1 ? FAR_BACK : BACK;
  let chosen = -1;
  for (let k = Math.max(0, world.pathAt + 1); k < world.pathLen; k++) {
    const mine = bouncesOn(world, k, (1 - side) as 0 | 1),
      theirs = bouncesOn(world, k, side);
    // A ball that comes down on its striker's own side first needs no return (a serve must, once).
    if (theirs === 0 && mine > (world.served ? 1 : 0)) return null;
    if (theirs >= 2) break;
    if (theirs === 1) {
      if (world.path[k * 4 + 2] * end > HALF_L + back - 0.08) break;
      chosen = k;
      if (k + 1 < world.pathLen && world.path[(k + 1) * 4 + 1] < world.path[k * 4 + 1]) break;
    }
  }
  if (chosen < 0) return null;
  return { x: world.path[chosen * 4] + stray, z: world.path[chosen * 4 + 2] + end * (BALL + FACE) };
}
/**
 * The computer's hand: it serves after its pause (tossing and striking the ball as it falls), reads a ball the other
 * side has struck only after its reaction time and goes to meet it, and otherwise waits behind the middle of its
 * end. `side` is the computer's: 1, or 0 where it stands in over Wi-Fi (with a hand of its own, `nearAi`).
 */
function think(world: World, level: Level, out: Happening[], side: 0 | 1 = 1) {
  const ai = side === 1 ? world.ai : world.nearAi,
    other = (1 - side) as 0 | 1,
    end = side === 1 ? -1 : 1,
    L = LEVELS[level],
    b = world.ball,
    home = { x: clamp(b.x * 0.3, -0.4, 0.4), z: end * (HALF_L + 0.45) };
  let hand = home;
  if (world.phase === "ready" && world.server === side) {
    hand = { x: ai.holdX, z: end * (HALF_L + 0.3) };
    ai.wait -= DT;
    if (ai.wait <= 0 && toss(world, side)) ai.strikeY = 0.18 + rand(world) * 0.12;
  } else if (world.phase === "toss" && world.server === side) {
    hand = { x: b.x, z: b.z + end * 0.12 };
    if (b.vy < 0 && b.y <= ai.strikeY) {
      launch(world, side, computerServe(world, level), true);
      out.push({ kind: "hit", side, strength: 0.4 });
    }
  } else if (world.phase === "rally" && world.hitter === other) {
    if (world.struck[other] !== ai.seen) {
      ai.seen = world.struck[other];
      ai.delay = L.react * (0.75 + 0.5 * rand(world));
      ai.stray = (rand(world) - 0.5) * 2 * L.stray;
      ai.plan = null;
      ai.bent = world.bent;
    }
    // A ball curved since it was read is read again (where it will come has changed), with the same stray.
    if (ai.bent !== world.bent && ai.delay <= 0) [ai.plan, ai.bent] = [null, world.bent];
    if (ai.delay > 0) ai.delay -= DT;
    else if (!ai.plan) ai.plan = intercept(world, side, ai.stray);
    hand = ai.plan ?? world.hands[side];
  }
  world.hands[side] = hand;
}
/**
 * Whether a ball struck by `side` (a serve, if `serving`) comes down where it should with the table alone: a stroke
 * first on the other side, a serve on its own side and then the other's, clear of the net; within `LAND_IN` of the
 * table's edges where it comes down on the other side.
 */
function fair(ball: Ball, side: 0 | 1, serving: boolean) {
  const { bounces, net } = course(ball),
    there = bounces[serving ? 1 : 0],
    inside = (b: { x: number; z: number }) => Math.abs(b.x) <= HALF_W - LAND_IN && Math.abs(b.z) <= HALF_L - LAND_IN;
  if (serving && (bounces[0]?.side !== side || net)) return false;
  return there?.side === 1 - side && inside(there);
}
/**
 * One slice of a person's curve (`STEER_TIME`): the blade's speed across sets the ball's sidespin, as far as it may
 * without the ball coming down off the table (a ball that would not have come down fair anyway is curved freely).
 * The ball's way is read again when its spin has changed, and the computer reads it again.
 */
function steer(world: World) {
  const st = world.steer,
    b = world.ball;
  if (!st) return;
  const serving = world.served && world.own === 0;
  if (world.phase !== "rally" || world.hitter !== st.side || world.time > st.until || world.other > 0) {
    world.steer = null;
    return;
  }
  const pad = world.paddles[st.side],
    f = st.side === 0 ? -1 : 1,
    vx = pad.vx - (st.side === 0 ? world.stanceV : 0);
  if (Math.abs(vx) < STEER_STILL) return;
  const was = b.wy,
    goal = clamp(f * SIDE_SPIN * vx, -SIDE_MAX, SIDE_MAX),
    want = was + (goal - was) * (1 - Math.exp(-DT / STEER_EASE)),
    tried = (wy: number) => fair({ ...b, wy }, st.side, serving);
  if (tried(want) || !tried(was)) b.wy = want;
  else {
    // As far toward it as keeps the ball on the table.
    let lo = 0,
      hi = 1;
    for (let k = 0; k < 7; k++) {
      const mid = (lo + hi) / 2;
      if (tried(was + (want - was) * mid)) lo = mid;
      else hi = mid;
    }
    b.wy = was + (want - was) * lo;
  }
  if (Math.abs(b.wy - st.read) > 3) {
    st.read = b.wy;
    predict(world);
    world.bent++;
    if (st.side === 1 && world.people[0]) world.stanceGoal = leanFor(arrival(world));
  }
}
/**
 * One slice of time: the computer's hand, both paddles, the ball and what it meets, and the strokes. Returns what
 * happened, a point among it when the rally has ended (the world then waits, the ball still falling, until the view
 * calls `serve` for the next point).
 */
export function step(world: World, level: Level): Happening[] {
  const out: Happening[] = [];
  world.time += DT;
  stepAside(world);
  for (const side of [1, 0] as const) if (!world.people[side]) think(world, level, out, side);
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
    // A person's serve is struck by its own swing, on either side (over Wi-Fi a guest serves from the far end; the
    // computer strikes its own toss in `think`). Kept to side 0 alone, a guest's toss fell back unstruck every time.
    const server = world.server;
    if (world.people[server]) tryStrike(world, server, before[server], from, level, out);
    if (world.phase === "toss" && b.y < TOSS_LOW) {
      world.phase = "ready";
      world.ai.wait = 0.5;
      world.nearAi.wait = 0.5;
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
  steer(world);
  if (world.phase === "rally") for (const side of [0, 1] as const) if (canHit(world, side)) tryStrike(world, side, before[side], from, level, out);
  return out;
}
