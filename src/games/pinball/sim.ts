/**
 * The pinball table's insides, free of Three.js and the page: a steel ball rolling on the inclined playfield under the
 * slope's share of gravity, the walls, posts and guides it meets (segments and circles, each with its own bounce), two
 * flippers that turn with a real angular speed and hand the ball the speed of their moving face, a spring plunger,
 * three pop bumpers, two slingshots, three rollover lanes, a bank of three drop targets, a spinner in the right orbit,
 * outlanes and the drain. The view steps it in fixed slices (`DT`) and reports what happens; the score is the rules'.
 *
 * Metres and seconds, on the playfield's own plane: x across (+x to the right, as the player stands), y up the field
 * from the drain (y = 0) to the top of the arch (`TOP`). The plunger lane runs up the right edge beyond the playfield's
 * right wall; the arch over the top carries a launched ball round to the left.
 */
export const DT = 1 / 960;
/** The playfield's slope (as on real tables) and the share of gravity along it. */
export const SLOPE = (6.5 * Math.PI) / 180,
  G = 9.81 * Math.sin(SLOPE);
export const BALL_R = 0.0135;
/** The cabinet's inside: half its width (the plunger lane's outer wall), the playfield's side walls, the arch. */
export const HALF_W = 0.272,
  WALL_X = 0.235,
  LANE_X = 0.2535,
  ARCH = { x: 0.0185, y: 0.82, r: 0.2535 },
  TOP = ARCH.y + ARCH.r;
/** The plunger's tip (where the waiting ball rests), and the launch: a pull's share sets the speed. */
export const PLUNGER_Y = 0.045,
  LAUNCH = [1.0, 3.4] as const,
  /** How long a full pull takes when held (a hold charges it as well as a pull down). */
  CHARGE_TIME = 0.9;
/** Balls a game, and how long after a launch a drained ball is given back (볼 세이브). */
export const BALLS = 3,
  SAVE_TIME = 8;
/**
 * The flippers: pivots, length, the radius at the pivot and at the tip, their down and up angles (from the level,
 * the left one pointing right and the right one mirrored), how quickly they swing up and fall back, and the bounce of
 * their rubber.
 */
export const FLIPPER = {
  x: 0.095,
  y: 0.15,
  length: 0.072,
  base: 0.011,
  tip: 0.0055,
  rest: (-28 * Math.PI) / 180,
  up: (24 * Math.PI) / 180,
  /** Angular speed (rad/s) up and back, and the swing's acceleration up to it. */
  speed: 32,
  back: 18,
  pull: 2600,
  bounce: 0.5,
};
/** The bumpers' kick (m/s off their skirt), the slingshots' kick, and the speed no ball goes past. */
export const KICK = 1.8,
  SLING_KICK = 1.6,
  FASTEST = 5;
/** What each thing is worth. */
export const POINTS = { bumper: 100, sling: 10, lane: 500, laneSet: 2000, target: 250, bank: 2500, spinner: 100, post: 0 };
/** The bonus multiplier's most, and the bonus each thing adds (counted at the end of the ball, times the multiplier). */
export const MULTIPLIER_MOST = 5,
  BONUS = { bumper: 50, target: 200, bank: 1000, laneSet: 1000, spinner: 20 };
/** The rollover lanes across the top (their centres), and the line across them that a ball rolls over. */
export const LANES = [-0.06, 0, 0.06],
  LANE_LINE = 0.93,
  LANE_HALF = 0.022;
/** The pop bumpers: centres and radius. */
export const BUMPERS: [number, number][] = [
    [-0.062, 0.665],
    [0.062, 0.665],
    [0, 0.57],
  ],
  BUMPER_R = 0.024;
/**
 * The drop targets: a bank of three on the upper left, slanted so that it faces the right flipper (and a ball
 * coming down over it rolls off its back): its lower and upper ends, and half a target's width.
 */
export const BANK = { ax: -0.19, ay: 0.655, bx: -0.118, by: 0.755 },
  TARGET_HALF = 0.0145;
/** The targets' centres along the bank. */
export const TARGETS: [number, number][] = [1, 3, 5].map((k) => [BANK.ax + ((BANK.bx - BANK.ax) * k) / 6, BANK.ay + ((BANK.by - BANK.ay) * k) / 6]);
/** The spinner across the right orbit (between its guide and the wall), and the line it turns on. */
export const SPINNER = { x0: 0.18, x1: WALL_X, y: 0.62 };

/** The inlane guides (between the inlane and the outlane), and the slingshots: their back, top, low corner, foot and inner corner. */
export const GUIDE_X = 0.192,
  SLING = { back: 0.148, top: 0.36, low: 0.262, inner: 0.112, foot: 0.237 };
/** The orbits' deflectors: from the wall at a height, down and in to (x, y) (the left one mirrored). */
export const DEFLECT = { left: [0.57, 0.188, 0.5], right: [0.48, 0.186, 0.41] };
export type Kind = "wall" | "rubber" | "sling" | "gate" | "target" | "post" | "bumper";
/** A straight piece: a capsule from a to b of radius r. A gate stops a ball only from its front (`nx`, `ny`). */
export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
  bounce: number;
  kind: Kind;
  /** For a slingshot, a target: which one. */
  id: number;
  nx?: number;
  ny?: number;
}
export interface Circle {
  x: number;
  y: number;
  r: number;
  bounce: number;
  kind: Kind;
  id: number;
}
export interface Flipper {
  /** +1 the left one (pointing right), -1 the right one. */
  side: 1 | -1;
  px: number;
  py: number;
  angle: number;
  omega: number;
  held: boolean;
}
export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export type Phase = "plunger" | "play";
export type What = "bumper" | "sling" | "lane" | "laneSet" | "target" | "bank" | "spinner" | "flipper" | "wall" | "post";
export type Happening =
  | { kind: "hit"; what: What; id: number; points: number; strength: number; x: number; y: number }
  | { kind: "launch"; strength: number }
  | { kind: "save" }
  | { kind: "drain"; bonus: number; multiplier: number };
export interface World {
  time: number;
  phase: Phase;
  ball: Ball;
  flippers: [Flipper, Flipper];
  /** The plunger: held (by a key or a finger), its pull (0 to 1), and how far a finger has pulled it down. */
  plunger: { held: boolean; charge: number; drag: number };
  lanes: boolean[];
  /** Which drop targets are down, and when the bank comes back up (all down), or -1. */
  down: boolean[];
  bankBack: number;
  multiplier: number;
  bonus: number;
  /** The spinner's turn (radians) and how fast it turns. */
  spin: { angle: number; speed: number };
  /** When a launched ball stops being saved, and whether this ball has been saved already (once a ball). */
  savedUntil: number;
  saveUsed: boolean;
  /** When each thing last lit up, for the view (bumpers, slings, lanes, targets). */
  lit: { bumper: number[]; sling: number[]; lane: number[]; target: number[] };
  /** How long the ball has hardly moved, out of the lane and off a held flipper (it is then given a nudge). */
  still: number;
  /** The last hits, so that one touch scores once (a bumper or a sling fires once a touch). */
  fired: Map<string, number>;
  seed: number;
  segments: Segment[];
  circles: Circle[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const seg = (ax: number, ay: number, bx: number, by: number, kind: Kind = "wall", r = 0.003, bounce = 0.45, id = -1): Segment => ({ ax, ay, bx, by, r, bounce, kind, id });
const circle = (x: number, y: number, r: number, kind: Kind, bounce: number, id = -1): Circle => ({ x, y, r, bounce, kind, id });
/** The arch over the top, as a run of straight pieces from the right side (angle 0) over to the left (π). */
function arch(): Segment[] {
  const out: Segment[] = [],
    n = 28;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI,
      b = ((k + 1) / n) * Math.PI;
    out.push(seg(ARCH.x + ARCH.r * Math.cos(a), ARCH.y + ARCH.r * Math.sin(a), ARCH.x + ARCH.r * Math.cos(b), ARCH.y + ARCH.r * Math.sin(b), "wall", 0.004, 0.4));
  }
  return out;
}
/** Everything fixed on the table: walls, guides, slingshots, targets, posts, the plunger lane and its gate. */
export function layout(): { segments: Segment[]; circles: Circle[] } {
  const segments: Segment[] = [
    ...arch(),
    // The side walls, the plunger lane's outer wall and the lane's inner wall (the playfield's right wall).
    seg(-WALL_X, 0, -WALL_X, ARCH.y, "wall", 0.004),
    seg(HALF_W, 0, HALF_W, ARCH.y, "wall", 0.004),
    seg(WALL_X, 0, WALL_X, 0.8, "wall", 0.003),
  ];
  // The lane's gate at its top: a ball comes up through it, but one coming down the right side is turned away (it
  // slants down to the playfield, so that a ball on it rolls off into the right orbit).
  const gate = seg(WALL_X - 0.004, 0.808, HALF_W, 0.862, "gate", 0.003, 0.3),
    glen = Math.hypot(gate.bx - gate.ax, gate.by - gate.ay);
  gate.nx = -(gate.by - gate.ay) / glen;
  gate.ny = (gate.bx - gate.ax) / glen;
  segments.push(gate);
  // Each side: the inlane guide (a post at its top), its slant down to the flipper, and the slingshot above it.
  for (const s of [-1, 1]) {
    segments.push(seg(s * GUIDE_X, 0.36, s * GUIDE_X, 0.235, "wall", 0.003), seg(s * GUIDE_X, 0.235, s * (FLIPPER.x - 0.003), FLIPPER.y + 0.02, "wall", 0.003));
    const sid = s < 0 ? 0 : 1;
    segments.push(
      seg(s * SLING.back, SLING.top, s * SLING.back, SLING.low, "wall", 0.004, 0.4),
      seg(s * SLING.back, SLING.low, s * SLING.inner, SLING.foot, "wall", 0.004, 0.4),
      // The kicking face, from the lower inner corner to the top: it fires the ball back out.
      seg(s * SLING.inner, SLING.foot, s * SLING.back, SLING.top, "sling", 0.005, 0.7, sid),
    );
  }
  // At the foot of each orbit a deflector turns a ball coming down the wall into the inlane (the outlanes stay open
  // below it, to a ball thrown across the field).
  segments.push(seg(-WALL_X, DEFLECT.left[0], -DEFLECT.left[1], DEFLECT.left[2], "wall", 0.004, 0.3), seg(WALL_X, DEFLECT.right[0], DEFLECT.right[1], DEFLECT.right[2], "wall", 0.004, 0.3));
  // The spinner's guide on the right: an orbit up the right side between it and the wall.
  segments.push(seg(SPINNER.x0, 0.43, SPINNER.x0, 0.76, "wall", 0.003));
  // The rollover lanes' guides at the top.
  for (const x of [-0.09, -0.03, 0.03, 0.09]) segments.push(seg(x, 0.895, x, 0.97, "wall", 0.003));
  // The drop targets: short faces along the bank, and the bank's back behind them (a ball over it rolls off).
  const along = { x: BANK.bx - BANK.ax, y: BANK.by - BANK.ay },
    span = Math.hypot(along.x, along.y),
    ux = along.x / span,
    uy = along.y / span;
  TARGETS.forEach(([x, y], i) => segments.push(seg(x - ux * TARGET_HALF, y - uy * TARGET_HALF, x + ux * TARGET_HALF, y + uy * TARGET_HALF, "target", 0.004, 0.25, i)));
  segments.push(seg(BANK.ax - uy * 0.012, BANK.ay + ux * 0.012, BANK.bx - uy * 0.012, BANK.by + ux * 0.012, "wall", 0.004));
  const circles: Circle[] = [
    ...BUMPERS.map(([x, y], i) => circle(x, y, BUMPER_R, "bumper", 0.6, i)),
    // Rubber posts: the tops of the inlane guides and slings, the lane guides' ends, the bank's ends.
    ...[-1, 1].flatMap((s) => [circle(s * GUIDE_X, 0.36, 0.006, "post", 0.65), circle(s * SLING.back, SLING.top, 0.006, "post", 0.65)]),
    ...[-0.09, -0.03, 0.03, 0.09].map((x) => circle(x, 0.895, 0.005, "post", 0.6)),
    circle(BANK.ax, BANK.ay, 0.008, "post", 0.6),
    circle(BANK.bx, BANK.by, 0.008, "post", 0.6),
    circle(SPINNER.x0, 0.43, 0.006, "post", 0.6),
  ];
  return { segments, circles };
}

/** The flipper's direction (pivot to tip) at its angle. */
export function flipperDir(f: Flipper) {
  return { x: f.side * Math.cos(f.angle), y: Math.sin(f.angle) };
}
/** The flipper's tip. */
export function flipperTip(f: Flipper) {
  const d = flipperDir(f);
  return { x: f.px + d.x * FLIPPER.length, y: f.py + d.y * FLIPPER.length };
}
const restBall = (): Ball => ({ x: LANE_X, y: PLUNGER_Y + BALL_R, vx: 0, vy: 0 });
export function createWorld(seed = 1): World {
  const { segments, circles } = layout(),
    flipper = (side: 1 | -1): Flipper => ({ side, px: -side * FLIPPER.x, py: FLIPPER.y, angle: FLIPPER.rest, omega: 0, held: false });
  return {
    time: 0,
    phase: "plunger",
    ball: restBall(),
    flippers: [flipper(1), flipper(-1)],
    plunger: { held: false, charge: 0, drag: 0 },
    lanes: LANES.map(() => false),
    down: TARGETS.map(() => false),
    bankBack: -1,
    multiplier: 1,
    bonus: 0,
    spin: { angle: 0, speed: 0 },
    savedUntil: -1,
    saveUsed: false,
    lit: { bumper: BUMPERS.map(() => -9), sling: [-9, -9], lane: LANES.map(() => -9), target: TARGETS.map(() => -9) },
    still: 0,
    fired: new Map(),
    seed: Math.max(1, Math.floor(Math.abs(seed)) % 2147483646) || 1,
    segments,
    circles,
  };
}
/** The world's own sequence (the nudge of a stuck ball), so that a game played the same way comes out the same. */
function rand(world: World) {
  world.seed = (world.seed * 16807) % 2147483647;
  return (world.seed - 1) / 2147483646;
}
/** Whether the ball waits on the plunger's tip (in the lane, all but still). */
export function onPlunger(world: World) {
  const b = world.ball;
  return b.x > WALL_X && b.y < PLUNGER_Y + BALL_R + 0.012 && Math.abs(b.vy) < 0.3;
}

/** A flipper pressed or let go (`side` 0 the left, 1 the right). Pressing one moves the lit rollover lanes its way. */
export function flip(world: World, side: 0 | 1, held: boolean) {
  const f = world.flippers[side];
  if (f.held === held) return;
  f.held = held;
  if (held) {
    const lanes = world.lanes;
    world.lanes = side === 0 ? [...lanes.slice(1), lanes[0]] : [lanes[lanes.length - 1], ...lanes.slice(0, -1)];
  }
}
/** The plunger held (pulled back) or let go: let go with the ball on it, the ball is launched by the pull. */
export function plunge(world: World, held: boolean, out: Happening[] = []) {
  const p = world.plunger;
  if (held) {
    p.held = true;
    return out;
  }
  if (!p.held) return out;
  p.held = false;
  const pull = clamp(Math.max(p.charge, p.drag), 0, 1);
  p.charge = 0;
  p.drag = 0;
  if (onPlunger(world)) {
    world.ball.vy = launchSpeed(pull);
    world.ball.vx = 0;
    if (world.phase === "plunger" && !world.saveUsed) world.savedUntil = world.time + SAVE_TIME;
    world.phase = "play";
    out.push({ kind: "launch", strength: pull });
  }
  return out;
}
/** The speed a pull (0 to 1) launches the ball at. */
export const launchSpeed = (pull: number) => LAUNCH[0] + (LAUNCH[1] - LAUNCH[0]) * clamp(pull, 0, 1);

/** One slice of each flipper: it swings up toward its stop while held and falls back while not. */
function swing(f: Flipper) {
  if (f.held) {
    f.omega = Math.min(FLIPPER.speed, Math.max(0, f.omega) + FLIPPER.pull * DT);
    f.angle += f.omega * DT;
    if (f.angle >= FLIPPER.up) [f.angle, f.omega] = [FLIPPER.up, 0];
  } else {
    f.omega = -FLIPPER.back;
    f.angle += f.omega * DT;
    if (f.angle <= FLIPPER.rest) [f.angle, f.omega] = [FLIPPER.rest, 0];
  }
}
/**
 * The ball pushed out of a contact along the normal (nx, ny), its speed against the surface moving at (sx, sy)
 * bounced: the part into the surface reversed by `bounce`, the part along it slowed by friction in proportion to the
 * blow (so that a ball rolling along a guide keeps rolling; a hard hit grips a little). A slow touch does not bounce
 * (a ball resting on a guide lies on it). Returns how hard it came in.
 */
function bounceOff(b: Ball, nx: number, ny: number, depth: number, bounce: number, sx = 0, sy = 0, grip = 0.12) {
  b.x += nx * depth;
  b.y += ny * depth;
  const ux = b.vx - sx,
    uy = b.vy - sy,
    un = ux * nx + uy * ny;
  if (un >= 0) return 0;
  const tx = ux - un * nx,
    ty = uy - un * ny,
    along = Math.hypot(tx, ty),
    e = -un < 0.05 ? 0 : bounce,
    keep = along > 1e-9 ? Math.max(0, along - grip * (1 + e) * -un) / along : 0;
  b.vx = sx + tx * keep - e * un * nx;
  b.vy = sy + ty * keep - e * un * ny;
  return -un;
}
/** Whether a hit of `key` may score now (once a touch: not again within `gap` seconds). */
function fresh(world: World, key: string, gap = 0.08) {
  const at = world.fired.get(key) ?? -9;
  world.fired.set(key, world.time);
  return world.time - at > gap;
}
function hit(world: World, out: Happening[], what: What, id: number, strength: number, points = POINTS[what as keyof typeof POINTS] ?? 0) {
  out.push({ kind: "hit", what, id, points, strength, x: world.ball.x, y: world.ball.y });
}
/** The ball against a capsule piece; true if it touched. */
function touchSegment(world: World, s: Segment, out: Happening[]) {
  const b = world.ball;
  if (s.kind === "target" && world.down[s.id]) return false;
  const dx = s.bx - s.ax,
    dy = s.by - s.ay,
    t = clamp(((b.x - s.ax) * dx + (b.y - s.ay) * dy) / (dx * dx + dy * dy || 1e-12), 0, 1),
    cx = s.ax + dx * t,
    cy = s.ay + dy * t,
    ox = b.x - cx,
    oy = b.y - cy,
    d = Math.hypot(ox, oy),
    reach = s.r + BALL_R;
  if (d >= reach || d < 1e-9) return false;
  let nx = ox / d,
    ny = oy / d;
  if (s.kind === "gate") {
    // Only from its front, and only a ball coming toward it.
    if ((b.x - s.ax) * s.nx! + (b.y - s.ay) * s.ny! < 0 || b.vx * s.nx! + b.vy * s.ny! > 0) return false;
    [nx, ny] = [s.nx!, s.ny!];
  }
  const speed = bounceOff(b, nx, ny, reach - d, s.bounce);
  if (s.kind === "sling" && t > 0.08 && t < 0.92 && speed > 0.12 && fresh(world, `s${s.id}`)) {
    // The slingshot fires: the ball goes back out off its face, quick.
    const un = b.vx * nx + b.vy * ny,
      out_ = Math.max(SLING_KICK, un);
    b.vx += (out_ - un) * nx;
    b.vy += (out_ - un) * ny;
    world.lit.sling[s.id] = world.time;
    hit(world, out, "sling", s.id, 1);
  } else if (s.kind === "target" && speed > 0.08) {
    world.down[s.id] = true;
    world.lit.target[s.id] = world.time;
    world.bonus += BONUS.target;
    hit(world, out, "target", s.id, Math.min(1, speed / 2));
    if (world.down.every(Boolean)) {
      world.bonus += BONUS.bank;
      world.bankBack = world.time + 1.2;
      hit(world, out, "bank", -1, 1);
    }
  } else if (speed > 0.35 && fresh(world, `w${s.ax.toFixed(3)}${s.ay.toFixed(3)}`, 0.12)) hit(world, out, "wall", -1, Math.min(1, speed / 3));
  return true;
}
function touchCircle(world: World, c: Circle, out: Happening[]) {
  const b = world.ball,
    ox = b.x - c.x,
    oy = b.y - c.y,
    d = Math.hypot(ox, oy),
    reach = c.r + BALL_R;
  if (d >= reach || d < 1e-9) return false;
  const nx = ox / d,
    ny = oy / d,
    speed = bounceOff(b, nx, ny, reach - d, c.bounce);
  if (c.kind === "bumper" && fresh(world, `b${c.id}`)) {
    // The bumper's skirt kicks the ball away whatever it came in at.
    const un = b.vx * nx + b.vy * ny,
      out_ = Math.max(KICK, un);
    b.vx += (out_ - un) * nx;
    b.vy += (out_ - un) * ny;
    world.lit.bumper[c.id] = world.time;
    world.bonus += BONUS.bumper;
    hit(world, out, "bumper", c.id, 1);
  } else if (speed > 0.3 && fresh(world, `p${c.x.toFixed(3)}${c.y.toFixed(3)}`, 0.12)) hit(world, out, "post", -1, Math.min(1, speed / 3));
  return true;
}
/** The ball against a flipper: a tapered capsule whose face moves with its swing. */
function touchFlipper(world: World, f: Flipper, out: Happening[]) {
  const b = world.ball,
    d = flipperDir(f),
    L = FLIPPER.length,
    t = clamp(((b.x - f.px) * d.x + (b.y - f.py) * d.y) / L, 0, 1),
    cx = f.px + d.x * L * t,
    cy = f.py + d.y * L * t,
    ox = b.x - cx,
    oy = b.y - cy,
    dist = Math.hypot(ox, oy),
    reach = FLIPPER.base + (FLIPPER.tip - FLIPPER.base) * t + BALL_R;
  if (dist >= reach || dist < 1e-9) return false;
  const nx = ox / dist,
    ny = oy / dist,
    // The face's speed where it meets the ball: ω × r, the right flipper turning the other way round.
    rx = cx + nx * (reach - BALL_R) - f.px,
    ry = cy + ny * (reach - BALL_R) - f.py,
    w = f.side * f.omega,
    speed = bounceOff(b, nx, ny, reach - dist, FLIPPER.bounce, -w * ry, w * rx, 0.2);
  if (speed > 0.25 && fresh(world, `f${f.side}`, 0.1)) hit(world, out, "flipper", f.side > 0 ? 0 : 1, Math.min(1, speed / 4));
  return true;
}
/** Sensors the ball rolls over: the top lanes and the spinner. */
function sensors(world: World, from: { x: number; y: number }, out: Happening[]) {
  const b = world.ball;
  if ((from.y - LANE_LINE) * (b.y - LANE_LINE) <= 0 && from.y !== b.y) {
    const lane = LANES.findIndex((x) => Math.abs(b.x - x) < LANE_HALF);
    if (lane >= 0 && fresh(world, `l${lane}`, 0.3)) {
      world.lanes[lane] = true;
      world.lit.lane[lane] = world.time;
      hit(world, out, "lane", lane, 0.6);
      if (world.lanes.every(Boolean)) {
        world.lanes = LANES.map(() => false);
        world.multiplier = Math.min(MULTIPLIER_MOST, world.multiplier + 1);
        world.bonus += BONUS.laneSet;
        hit(world, out, "laneSet", -1, 1);
      }
    }
  }
  if ((from.y - SPINNER.y) * (b.y - SPINNER.y) <= 0 && from.y !== b.y && b.x > SPINNER.x0 && b.x < SPINNER.x1 && fresh(world, "spin", 0.25)) {
    // The faster the ball goes through, the more turns: each turn scores.
    const turns = clamp(Math.round(Math.abs(b.vy) * 5), 1, 20);
    world.spin.speed = Math.sign(b.vy || 1) * turns * 2.2;
    world.bonus += BONUS.spinner * turns;
    hit(world, out, "spinner", -1, Math.min(1, turns / 10), POINTS.spinner * turns);
  }
}
/**
 * One slice of time: the flippers swing, the plunger charges, the ball rolls and meets what it meets, the sensors
 * count, the drop targets come back up, a ball off the bottom drains (or is saved). Returns what happened.
 */
export function step(world: World): Happening[] {
  const out: Happening[] = [],
    b = world.ball;
  world.time += DT;
  world.flippers.forEach(swing);
  if (world.plunger.held) world.plunger.charge = Math.min(1, world.plunger.charge + DT / CHARGE_TIME);
  world.spin.angle += world.spin.speed * DT * Math.PI * 2;
  world.spin.speed *= Math.exp(-DT * 1.6);
  if (world.bankBack > 0 && world.time >= world.bankBack) {
    world.down = TARGETS.map(() => false);
    world.bankBack = -1;
  }
  // The ball waiting on the plunger rides it back as it is pulled.
  if (onPlunger(world) && world.plunger.held) {
    b.y = PLUNGER_Y + BALL_R - 0.03 * Math.max(world.plunger.charge, world.plunger.drag);
    b.vy = 0;
    return out;
  }
  const from = { x: b.x, y: b.y };
  b.vy -= G * DT;
  // Rolling resistance, a little.
  const roll = Math.exp(-DT * 0.12);
  b.vx *= roll;
  b.vy *= roll;
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  // The plunger's tip holds a ball in its lane.
  if (b.x > WALL_X && b.y < PLUNGER_Y + BALL_R) {
    const restY = PLUNGER_Y + BALL_R - (world.plunger.held ? 0.03 * world.plunger.charge : 0);
    if (b.y < restY) {
      b.y = restY;
      if (b.vy < 0) b.vy = -b.vy * 0.2 < 0.05 ? 0 : -b.vy * 0.2;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const s of world.segments) touchSegment(world, s, out);
    for (const c of world.circles) touchCircle(world, c, out);
    for (const f of world.flippers) touchFlipper(world, f, out);
  }
  sensors(world, from, out);
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > FASTEST) [b.vx, b.vy] = [(b.vx / speed) * FASTEST, (b.vy / speed) * FASTEST];
  // A ball that has come to rest somewhere it should not (not in the lane, not cradled) is nudged free.
  const cradled = world.flippers.some((f) => f.held && Math.hypot(b.x - f.px, b.y - f.py) < FLIPPER.length + 0.03);
  world.still = speed < 0.03 && !onPlunger(world) && !cradled ? world.still + DT : 0;
  if (world.still > 3) {
    b.vy += 0.7;
    b.vx += (rand(world) - 0.5) * 0.8;
    world.still = 0;
  }
  if (b.y < -0.03) {
    if (world.time < world.savedUntil) {
      // 볼 세이브: given back on the plunger.
      Object.assign(b, restBall());
      world.phase = "plunger";
      world.savedUntil = -1;
      world.saveUsed = true;
      out.push({ kind: "save" });
    } else {
      out.push({ kind: "drain", bonus: world.bonus * world.multiplier, multiplier: world.multiplier });
      Object.assign(b, restBall());
      world.phase = "plunger";
      world.bonus = 0;
      world.multiplier = 1;
      world.saveUsed = false;
      world.savedUntil = -1;
      world.lanes = LANES.map(() => false);
    }
  }
  return out;
}
