import type { Difficulty } from "../../core/ai";
import type { Mode, Team } from "./roster";

/**
 * The pitch of 축구, free of Three.js and the page, stepped in fixed slices (`DT`, sixty a second) so that the same
 * inputs always give the same match (the host's over Wi-Fi, the tests). Two pitches share one disc physics:
 *
 *  평면 축구 (`flat`): seen from above. Players are discs pushed by their eight-way controls, the ball a smaller, lighter
 *  disc; bodies push the ball and one another, the ball bounces off the boards and the round posts, and a kick sends
 *  it from whoever is close enough when it is pressed (short reach, strong push; holding it slows the kicker).
 *  Players may walk round the pitch inside the boards, but not into the goals. The ball scores when its centre crosses
 *  the goal line between the posts.
 *
 *  중력 축구 (`gravity`): seen from the side, gravity pulling down. Players run left and right, jump from the ground
 *  and kick (a kick lifts the ball); the ball bounces on the grass, the walls, the ceiling and the crossbars. Each goal
 *  stands on the ground at an end, under its crossbar; the ball scores when its centre passes the goal line under it.
 *
 * After a goal the ball rolls on for a moment, then everyone goes back for the conceding team's kickoff: until the ball
 * is touched each team keeps to its half and the other team out of the centre circle (in the side view, out of the
 * middle zone). The clock (`limit` ticks) runs except while a goal is celebrated; its end is told once (`time`) and
 * the rules decide (a tie plays on as golden goal, `overtime`). Red (team 0) defends the left goal.
 *
 * Units: one is about a player's stride; speeds are per slice, as is the custom of such games.
 */
export const DT = 1 / 60;
export const ticks = (seconds: number) => Math.round(seconds / DT);
/** How long a goal is celebrated before the kickoff. */
export const GOAL_PAUSE = ticks(2.6);
/** A kickoff not taken within this long is open to all (nobody can hold a match up by not kicking off). */
export const KICKOFF_WAIT = ticks(6);
/** 평면 축구's pitch: half its length and width (where the ball plays), the goal mouth, the net's depth, the boards round it, the posts, the centre circle. */
export const FLAT = { HX: 7.4, HY: 3.4, GOAL: 1.28, DEPTH: 0.62, BX: 8.3, BY: 4.05, POST: 0.16, CIRCLE: 1.5 } as const;
/** 중력 축구's pitch: half its width, its height to the ceiling, the goal line and the crossbar's height and thickness, the middle zone kept at a kickoff. */
export const GRAVITY = { W: 7.3, H: 4.7, GL: 6.3, GH: 1.8, BAR: 0.08, ZONE: 1.7 } as const;
/** The bodies of each pitch: radius, inverse mass, bounce, damping, pace, a kick's push and reach. */
export const BODY = {
  flat: { man: 0.3, ball: 0.2, manIm: 0.5, manB: 0.5, ballB: 0.5, manDamp: 0.96, ballDamp: 0.99, acc: 0.0022, kickAcc: 0.0015, kick: 0.105, reach: 0.09 },
  gravity: {
    man: 0.42,
    ball: 0.27,
    manIm: 0.5,
    manB: 0.35,
    ballB: 0.6,
    g: 0.0095,
    jump: 0.205,
    acc: 0.0075,
    airAcc: 0.0028,
    groundDamp: 0.9,
    airDamp: 0.985,
    ballDamp: 0.997,
    roll: 0.985,
    floorB: 0.72,
    wallB: 0.82,
    kick: 0.2,
    lift: 0.55,
    reach: 0.14,
    most: 0.45,
  },
} as const;
/** The computer by level (the five of the shared picker): how often it looks again, how fast it goes, how far its aim strays, how square it must stand to shoot, how often it takes a chance. */
export const LEVELS: Record<Difficulty, { look: number; pace: number; stray: number; square: number; take: number }> = {
  beginner: { look: 22, pace: 0.55, stray: 0.95, square: 0.45, take: 0.12 },
  easy: { look: 15, pace: 0.7, stray: 0.7, square: 0.58, take: 0.3 },
  normal: { look: 9, pace: 0.84, stray: 0.45, square: 0.7, take: 0.6 },
  hard: { look: 5, pace: 0.94, stray: 0.25, square: 0.78, take: 0.85 },
  expert: { look: 3, pace: 1, stray: 0.1, square: 0.84, take: 1 },
};
export interface Disc {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Inverse mass (0: fixed) and bounce. */
  im: number;
  b: number;
}
export interface Man extends Disc {
  team: Team;
  /** A kick pressed and not yet spent; the kick key held (which slows a player of the flat pitch). */
  armed: boolean;
  held: boolean;
  /** Slices a jump asked for stays asked for (a quick tap in the air lands as a jump). */
  jumpQ: number;
  /** On the ground (the side view). */
  ground: boolean;
  /** Slices since this player last kicked the ball (the ring's flash); large when long ago. */
  flash: number;
}
/** A player's controls for one slice: a way to go (each of x and y in −1 … 1), the kick held (and pressed since the last slice), the jump. */
export interface Input {
  x: number;
  y: number;
  kick: boolean;
  kickPress?: boolean;
  jump?: boolean;
  jumpPress?: boolean;
}
export const IDLE: Input = { x: 0, y: 0, kick: false };
export type Phase = "kickoff" | "play" | "goal" | "over";
export const PHASES: Phase[] = ["kickoff", "play", "goal", "over"];
/** What a slice did, for the screen's moves and sounds. */
export type Event =
  | { kind: "kick"; man: number; power: number }
  | { kind: "bump"; power: number }
  | { kind: "post"; power: number }
  | { kind: "net" }
  | { kind: "goal"; team: Team }
  | { kind: "whistle"; start: boolean }
  | { kind: "time" };
/** What the computer has in mind for a player: where it is going, until it looks again. */
export interface Mind {
  next: number;
  tx: number;
  ty: number;
  /** Where in the goal mouth it aims (−1 … 1), and whether it takes its chance this time. */
  aim: number;
  shoot: boolean;
}
export interface Counts {
  kicks: number;
  bumps: number;
  posts: number;
  goals: number;
  whistles: number;
}
export interface World {
  mode: Mode;
  ball: Disc;
  men: Man[];
  minds: Mind[];
  phase: Phase;
  /** The team that kicks off (the one that conceded last). */
  kickoff: Team;
  /** Slices since the phase began, the match clock (slices played), its limit (0: none). */
  timer: number;
  clock: number;
  limit: number;
  /** Golden goal: the next goal ends it (the rules say so; the view tells the world). */
  overtime: boolean;
  /** The clock's end has been told. */
  told: boolean;
  /** The match is over (no kickoff after the goal being celebrated). */
  done: boolean;
  scorer: Team | null;
  level: Difficulty;
  counts: Counts;
  tick: number;
  /** The world's own random stream (the computer's choices), a 32-bit state. */
  seed: number;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** The next number of the world's stream (0 … 1). */
export function random(world: World) {
  let t = (world.seed = (world.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** Where a team's players stand for a kickoff: on their own side, the first nearest the middle. */
export function spawn(mode: Mode, team: Team, slot: number, count: number): { x: number; y: number } {
  const side = team === 0 ? -1 : 1;
  if (mode === "flat") {
    const rows = count === 1 ? [0] : count === 2 ? [0.9, -0.9] : [0, 1.5, -1.5],
      xs = count === 3 ? [3.0, 4.4, 4.4] : [3.4, 3.4];
    return { x: side * (xs[slot] ?? 3.4), y: rows[slot] ?? 0 };
  }
  return { x: side * (count === 1 ? 3.2 : [2.6, 4.9][slot] ?? 3.2), y: BODY.gravity.man };
}
/** A new match: the players of each `teams[k]` on their side, the ball in the middle, red to kick off. */
export function createWorld(mode: Mode, teams: Team[], level: Difficulty = "normal", seed = 1, limit = 0): World {
  const body = BODY[mode];
  const men: Man[] = teams.map((team) => ({ x: 0, y: 0, vx: 0, vy: 0, r: body.man, im: body.manIm, b: body.manB, team, armed: false, held: false, jumpQ: 0, ground: true, flash: 999 }));
  const world: World = {
    mode,
    ball: { x: 0, y: 0, vx: 0, vy: 0, r: body.ball, im: 1, b: body.ballB },
    men,
    minds: men.map(() => ({ next: 0, tx: 0, ty: 0, aim: 0, shoot: false })),
    phase: "kickoff",
    kickoff: 0,
    timer: 0,
    clock: 0,
    limit,
    overtime: false,
    told: false,
    done: false,
    scorer: null,
    level,
    counts: { kicks: 0, bumps: 0, posts: 0, goals: 0, whistles: 0 },
    tick: 0,
    seed: seed | 0,
  };
  layKickoff(world, 0);
  return world;
}
/** Everyone back to their places and the ball in the middle, `team` to kick off. */
export function layKickoff(world: World, team: Team) {
  const { mode, men, ball } = world;
  for (const t of [0, 1] as Team[]) {
    const mine = men.filter((m) => m.team === t);
    mine.forEach((m, slot) => {
      const at = spawn(mode, t, slot, mine.length);
      Object.assign(m, { x: at.x, y: at.y, vx: 0, vy: 0, armed: false, jumpQ: 0, ground: true });
    });
  }
  Object.assign(ball, { x: 0, y: mode === "flat" ? 0 : ball.r, vx: 0, vy: 0 });
  world.phase = "kickoff";
  world.kickoff = team;
  world.timer = 0;
  world.scorer = null;
}
/** The man's team's way of attack: red attacks the right goal (+x). */
export const attack = (team: Team) => (team === 0 ? 1 : -1);
/** Pushes two discs apart and lets them bounce (the haxball-like rule: by inverse mass, bounce the product of both). True when they touched. */
function collide(a: Disc, b: Disc) {
  const dx = a.x - b.x,
    dy = a.y - b.y,
    rr = a.r + b.r,
    d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 === 0 || a.im + b.im === 0) return false;
  const d = Math.sqrt(d2),
    nx = dx / d,
    ny = dy / d,
    share = a.im / (a.im + b.im),
    over = rr - d;
  a.x += nx * over * share;
  a.y += ny * over * share;
  b.x -= nx * over * (1 - share);
  b.y -= ny * over * (1 - share);
  const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (vn < 0) {
    const push = vn * (1 + a.b * b.b);
    a.vx -= nx * push * share;
    a.vy -= ny * push * share;
    b.vx += nx * push * (1 - share);
    b.vy += ny * push * (1 - share);
  }
  return true;
}
/** A disc kept off a fixed point of radius `r` (a post, a crossbar's end); the speed it struck with, or 0. */
function offPoint(d: Disc, x: number, y: number, r: number, bounce: number) {
  const dx = d.x - x,
    dy = d.y - y,
    rr = d.r + r,
    d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 === 0) return 0;
  const dist = Math.sqrt(d2),
    nx = dx / dist,
    ny = dy / dist;
  d.x = x + nx * rr;
  d.y = y + ny * rr;
  const vn = d.vx * nx + d.vy * ny;
  if (vn >= 0) return 0;
  d.vx -= nx * vn * (1 + bounce);
  d.vy -= ny * vn * (1 + bounce);
  return -vn;
}
/** Keeps a disc's `axis` within lo … hi, bouncing; the speed it struck with, or 0. */
function within(d: Disc, axis: "x" | "y", lo: number, hi: number, bounce: number) {
  const v = axis === "x" ? "vx" : "vy";
  if (d[axis] < lo) {
    d[axis] = lo;
    if (d[v] < 0) {
      const hit = -d[v];
      d[v] = hit * bounce;
      return hit;
    }
  } else if (d[axis] > hi) {
    d[axis] = hi;
    if (d[v] > 0) {
      const hit = d[v];
      d[v] = -hit * bounce;
      return hit;
    }
  }
  return 0;
}
/** A disc kept out of a box (the goals, for the players of the flat pitch). */
function outOfBox(d: Disc, x0: number, x1: number, y0: number, y1: number) {
  const cx = clamp(d.x, x0, x1),
    cy = clamp(d.y, y0, y1),
    dx = d.x - cx,
    dy = d.y - cy,
    d2 = dx * dx + dy * dy;
  if (d2 >= d.r * d.r) return;
  if (d2 > 1e-12) {
    const dist = Math.sqrt(d2),
      nx = dx / dist,
      ny = dy / dist;
    d.x = cx + nx * d.r;
    d.y = cy + ny * d.r;
    const vn = d.vx * nx + d.vy * ny;
    if (vn < 0) {
      d.vx -= nx * vn;
      d.vy -= ny * vn;
    }
    return;
  }
  // The centre inside the box: out the nearest side.
  const ways = [d.x - x0, x1 - d.x, d.y - y0, y1 - d.y],
    k = ways.indexOf(Math.min(...ways));
  if (k === 0) d.x = x0 - d.r;
  else if (k === 1) d.x = x1 + d.r;
  else if (k === 2) d.y = y0 - d.r;
  else d.y = y1 + d.r;
}
/** A disc kept off a capsule from (x0, y) to (x1, y) of radius `r` (a crossbar); the speed it struck with, or 0. */
function offBar(d: Disc, x0: number, x1: number, y: number, r: number, bounce: number) {
  return offPoint(d, clamp(d.x, Math.min(x0, x1), Math.max(x0, x1)), y, r, bounce);
}
/** Keeps a player where a kickoff allows: its own half, and for the team not kicking off out of the centre circle. */
function kickoffBarrier(world: World, m: Man) {
  const s = -attack(m.team),
    kicking = world.kickoff === m.team;
  if (world.mode === "gravity") {
    const least = kicking ? -(GRAVITY.ZONE - m.r) : GRAVITY.ZONE + m.r;
    if (s * m.x < least) {
      m.x = s * least;
      if (s * m.vx < 0) m.vx = 0;
    }
    return;
  }
  const own = s * m.x >= m.r,
    dist = Math.hypot(m.x, m.y);
  if (kicking) {
    if (own || dist <= FLAT.CIRCLE - m.r) return;
    // Back to whichever is nearer: its own half, or inside the circle.
    const back = m.r - s * m.x,
      inward = dist - (FLAT.CIRCLE - m.r);
    if (back <= inward) {
      m.x = s * m.r;
      if (s * m.vx < 0) m.vx = 0;
    } else {
      m.x *= (FLAT.CIRCLE - m.r) / dist;
      m.y *= (FLAT.CIRCLE - m.r) / dist;
      m.vx *= 0.5;
      m.vy *= 0.5;
    }
    return;
  }
  if (!own) {
    m.x = s * m.r;
    if (s * m.vx < 0) m.vx = 0;
  }
  const out = FLAT.CIRCLE + m.r,
    d = Math.hypot(m.x, m.y);
  if (d < out) {
    const nx = d > 1e-9 ? m.x / d : s,
      ny = d > 1e-9 ? m.y / d : 0;
    m.x = nx * out;
    m.y = ny * out;
    const vn = m.vx * nx + m.vy * ny;
    if (vn < 0) {
      m.vx -= nx * vn;
      m.vy -= ny * vn;
    }
  }
}
/** The slice's controls for a player: its way, its kick armed or spent, its jump asked for. */
function steer(world: World, m: Man, input: Input) {
  const press = !!input.kickPress || (input.kick && !m.held);
  if (press) m.armed = true;
  else if (!input.kick) m.armed = false;
  m.held = input.kick;
  const x = clamp(input.x || 0, -1, 1),
    y = clamp(input.y || 0, -1, 1);
  if (world.mode === "flat") {
    const body = BODY.flat,
      len = Math.hypot(x, y),
      k = (m.held ? body.kickAcc : body.acc) / Math.max(1, len);
    m.vx += x * k;
    m.vy += y * k;
    return;
  }
  const body = BODY.gravity;
  m.vx += x * (m.ground ? body.acc : body.airAcc);
  if (input.jumpPress) m.jumpQ = 9;
  else if (input.jump) m.jumpQ = Math.max(m.jumpQ, 1);
  if (m.jumpQ > 0 && m.ground) {
    m.vy = body.jump;
    m.ground = false;
    m.jumpQ = 0;
  } else if (m.jumpQ > 0) m.jumpQ--;
}
/** One slice of the match. `inputs` are each player's controls (missing ones stand still). */
export function step(world: World, inputs: (Input | null | undefined)[]): Event[] {
  const events: Event[] = [];
  if (world.phase === "over") return events;
  world.tick++;
  world.timer++;
  if (world.tick === 1) {
    world.counts.whistles++;
    events.push({ kind: "whistle", start: true });
  }
  const { ball, men, mode } = world,
    celebrating = world.phase === "goal";
  men.forEach((m, k) => {
    steer(world, m, (celebrating && world.done ? null : inputs[k]) ?? IDLE);
    m.flash++;
  });
  // Moving on.
  if (mode === "flat") {
    const body = BODY.flat;
    for (const d of [ball, ...men]) {
      d.x += d.vx;
      d.y += d.vy;
      const damp = d === ball ? body.ballDamp : body.manDamp;
      d.vx *= damp;
      d.vy *= damp;
    }
  } else {
    const body = BODY.gravity;
    for (const m of men) {
      m.vy -= body.g;
      m.x += m.vx;
      m.y += m.vy;
      m.vx *= m.ground ? body.groundDamp : body.airDamp;
    }
    ball.vy -= body.g;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > body.most) {
      ball.vx *= body.most / speed;
      ball.vy *= body.most / speed;
    }
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vx *= body.ballDamp;
    ball.vy *= body.ballDamp;
  }
  // Bodies against bodies: a touch of the ball ends a kickoff.
  let touched = false;
  for (let i = 0; i < men.length; i++) {
    for (let j = i + 1; j < men.length; j++) collide(men[i], men[j]);
    if (collide(ball, men[i])) touched = true;
  }
  bounds(world, events);
  if (world.phase === "kickoff") for (const m of men) kickoffBarrier(world, m);
  // Kicks: a kick pressed reaches the ball if it is close enough, and is spent on it.
  men.forEach((m, k) => {
    if (!m.armed) return;
    const dx = ball.x - m.x,
      dy = ball.y - m.y,
      dist = Math.hypot(dx, dy),
      body = BODY[mode];
    if (dist - m.r - ball.r > body.reach || dist === 0) return;
    const nx = dx / dist,
      ny = dy / dist;
    if (mode === "flat") {
      ball.vx += nx * body.kick * ball.im;
      ball.vy += ny * body.kick * ball.im;
    } else {
      const g = BODY.gravity,
        lx = nx,
        ly = Math.max(ny, -0.2) + g.lift,
        len = Math.hypot(lx, ly);
      ball.vx = ball.vx * 0.35 + (lx / len) * g.kick;
      ball.vy = ball.vy * 0.35 + (ly / len) * g.kick;
    }
    m.armed = false;
    m.flash = 0;
    touched = true;
    world.counts.kicks++;
    events.push({ kind: "kick", man: k, power: 1 });
  });
  if (world.phase === "kickoff" && (touched || world.timer >= KICKOFF_WAIT)) world.phase = "play";
  // A goal, once a match is under way.
  if (world.phase === "play") {
    const team = scored(world);
    if (team !== null) {
      world.phase = "goal";
      world.timer = 0;
      world.scorer = team;
      world.kickoff = team === 0 ? 1 : 0;
      world.counts.goals++;
      events.push({ kind: "goal", team });
    }
  } else if (world.phase === "goal" && world.timer >= GOAL_PAUSE) {
    if (world.done) world.phase = "over";
    else {
      layKickoff(world, world.kickoff);
      world.counts.whistles++;
      events.push({ kind: "whistle", start: false });
    }
  }
  // The clock: it stands while a goal is celebrated; its end is told once.
  if (world.phase === "play" || world.phase === "kickoff") {
    world.clock++;
    if (world.limit && !world.overtime && !world.told && world.clock >= world.limit) {
      world.told = true;
      events.push({ kind: "time" });
    }
  }
  return events;
}
/** The team whose goal the ball has just gone into, or null. */
function scored(world: World): Team | null {
  const b = world.ball;
  if (world.mode === "flat") {
    if (Math.abs(b.y) >= FLAT.GOAL) return null;
    return b.x > FLAT.HX ? 0 : b.x < -FLAT.HX ? 1 : null;
  }
  if (b.y >= GRAVITY.GH) return null;
  return b.x > GRAVITY.GL ? 0 : b.x < -GRAVITY.GL ? 1 : null;
}
/** The boards, nets, posts, walls, ceiling and crossbars. */
function bounds(world: World, events: Event[]) {
  const { ball, men } = world;
  let bump = 0,
    post = 0;
  if (world.mode === "flat") {
    const { HX, HY, GOAL, DEPTH, BX, BY, POST } = FLAT;
    // The ball: the side lines, the end lines beside the goals, the nets inside them.
    bump = Math.max(bump, within(ball, "y", -HY + ball.r, HY - ball.r, 1));
    if (Math.abs(ball.x) > HX) {
      bump = Math.max(bump, within(ball, "y", -GOAL + ball.r, GOAL - ball.r, 0.25));
      bump = Math.max(bump, within(ball, "x", -HX - DEPTH + ball.r, HX + DEPTH - ball.r, 0.25));
    } else if (Math.abs(ball.y) > GOAL) bump = Math.max(bump, within(ball, "x", -HX + ball.r, HX - ball.r, 1));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) post = Math.max(post, offPoint(ball, sx * HX, sy * GOAL, POST, 0.5));
    // The players: the boards, the posts, and out of the goals.
    for (const m of men) {
      within(m, "x", -BX + m.r, BX - m.r, 0.2);
      within(m, "y", -BY + m.r, BY - m.r, 0.2);
      for (const sx of [-1, 1]) {
        outOfBox(m, sx < 0 ? -HX - DEPTH : HX, sx < 0 ? -HX : HX + DEPTH, -GOAL, GOAL);
        for (const sy of [-1, 1]) offPoint(m, sx * HX, sy * GOAL, POST, 0.5);
      }
    }
  } else {
    const { W, H, GL, GH, BAR } = GRAVITY,
      body = BODY.gravity;
    const floor = within(ball, "y", ball.r, H - ball.r, body.floorB);
    // The grass: a ball resting on it rolls to a stop; a soft landing is no knock.
    if (ball.y <= ball.r + 1e-6) {
      ball.vx *= body.roll;
      if (Math.abs(ball.vy) < 0.016) ball.vy = 0;
    }
    if (floor > 0.04) bump = Math.max(bump, floor);
    bump = Math.max(bump, within(ball, "x", -W + ball.r, W - ball.r, body.wallB));
    for (const sx of [-1, 1]) post = Math.max(post, offBar(ball, sx * GL, sx * W, GH, BAR, 0.6));
    for (const m of men) {
      within(m, "y", m.r, H - m.r, 0);
      within(m, "x", -W + m.r, W - m.r, 0);
      for (const sx of [-1, 1]) offBar(m, sx * GL, sx * W, GH, BAR, 0);
      m.ground = m.y <= m.r + 1e-6;
      if (m.ground && m.vy < 0) m.vy = 0;
    }
  }
  if (bump > 0.012) {
    world.counts.bumps++;
    events.push({ kind: "bump", power: Math.min(1, bump / 0.2) });
  }
  if (post > 0.01) {
    world.counts.posts++;
    events.push({ kind: "post", power: Math.min(1, post / 0.2) });
  }
}
// ─────────────── The computer ───────────────
/** The players of `team`, by index. */
const teamOf = (world: World, team: Team) => world.men.map((m, k) => ({ m, k })).filter((x) => x.m.team === team);
/** Which of its team goes for the ball: the nearest to it (by index on a tie). */
function chaser(world: World, team: Team) {
  const { ball } = world;
  let best = -1,
    near = Infinity;
  for (const { m, k } of teamOf(world, team)) {
    const d = Math.hypot(m.x - ball.x, m.y - ball.y) - (world.mode === "gravity" && Math.sign(ball.x - m.x) === attack(team) ? 0.6 : 0);
    if (d < near - 1e-9) {
      near = d;
      best = k;
    }
  }
  return best;
}
/** The controls toward a place, slowing as it comes near; `pace` is the level's top speed. */
function toward(m: Man, tx: number, ty: number, pace: number, flat: boolean): { x: number; y: number } {
  const dx = tx - m.x,
    dy = ty - m.y;
  if (!flat) return { x: clamp(dx * 2.2 - m.vx * 12, -1, 1) * pace, y: 0 };
  let ux = dx * 1.6 - m.vx * 14,
    uy = dy * 1.6 - m.vy * 14;
  const len = Math.hypot(ux, uy);
  if (len > 1) {
    ux /= len;
    uy /= len;
  }
  return { x: ux * pace, y: uy * pace };
}
/**
 * The computer's controls for player `k` this slice (deterministic: its choices come from the world's stream). The
 * one of a team nearest the ball goes for it: round behind it, then on through it toward the far goal, shooting when
 * it stands square enough; the others keep between the ball and their own goal, the third a little ahead.
 */
export function think(world: World, k: number): Input {
  const m = world.men[k],
    mind = world.minds[k],
    level = LEVELS[world.level],
    { ball, mode } = world,
    s = attack(m.team),
    flat = mode === "flat";
  if (world.phase === "over" || (world.phase === "goal" && world.done)) return IDLE;
  // Looking again now and then: a new aim in the goal mouth, by the level's stray. Between looks a player keeps going
  // where it last chose (a weaker computer reacts later); its kicks are judged every slice.
  const fresh = world.tick >= mind.next,
    go = (tx: number, ty: number) => {
      if (fresh) {
        mind.tx = tx;
        mind.ty = ty;
      }
      return toward(m, mind.tx, flat ? mind.ty : m.y, level.pace, flat);
    };
  if (fresh) {
    mind.next = world.tick + level.look + Math.floor(random(world) * level.look);
    mind.aim = (random(world) * 2 - 1) * level.stray;
  }
  const team = teamOf(world, m.team),
    first = chaser(world, m.team) === k;
  // A kickoff: the team kicking off sends its nearest player after a short pause; the other waits at home.
  if (world.phase === "kickoff" && (world.kickoff !== m.team || world.timer < 40)) {
    const slot = team.findIndex((x) => x.k === k),
      home = spawn(mode, m.team, slot, team.length);
    return { ...toward(m, home.x, home.y, level.pace, flat), kick: false };
  }
  if (flat) {
    const goalX = s * FLAT.HX,
      goalY = mind.aim * FLAT.GOAL * 0.75;
    if (!first || world.phase === "goal") {
      // Keep between the ball and our goal; a third player stands further up, wide of the ball.
      const slot = team.filter((x) => x.k !== chaser(world, m.team)).findIndex((x) => x.k === k),
        own = -s * FLAT.HX;
      let tx = own + (ball.x - own) * (slot === 0 ? 0.32 : 0.7),
        ty = ball.y * (slot === 0 ? 0.42 : 0.3) + (slot === 0 ? 0 : (ball.y > 0 ? -1.4 : 1.4));
      tx = s > 0 ? Math.min(tx, slot === 0 ? -0.6 : 2.5) : Math.max(tx, slot === 0 ? 0.6 : -2.5);
      return { ...go(tx, ty), kick: false };
    }
    const reach = m.r + ball.r,
      tbx = ball.x - m.x,
      tby = ball.y - m.y,
      tb = Math.hypot(tbx, tby) || 1,
      gap = tb - reach,
      // Far off it makes for where the ball is going; near, for where it is.
      lead = Math.min(12, gap * 5),
      bx = ball.x + ball.vx * lead,
      by = ball.y + ball.vy * lead,
      ax = goalX - bx,
      ay = goalY - by,
      al = Math.hypot(ax, ay) || 1,
      dx = ax / al,
      dy = ay / al,
      square = (tbx * dx + tby * dy) / tb,
      // The place behind the ball on its line to the goal.
      px = bx - dx * (reach + 0.06),
      py = by - dy * (reach + 0.06);
    let tx = px,
      ty = py;
    if (gap < 0.45 && square > Math.max(0.62, level.square - 0.06)) {
      // Square behind it: on into it with the kick held, so that it goes off as it touches.
      tx = ball.x + dx * 0.4;
      ty = ball.y + dy * 0.4;
    } else {
      // On the way there the ball is not to be run into: past it by its side first.
      const wx = px - m.x,
        wy = py - m.y,
        wl = wx * wx + wy * wy || 1,
        t = clamp(((bx - m.x) * wx + (by - m.y) * wy) / wl, 0, 1),
        cx = m.x + wx * t - bx,
        cy = m.y + wy * t - by;
      if (Math.hypot(cx, cy) < reach + 0.02) {
        const side = tbx * dy - tby * dx > 0 ? 1 : -1;
        tx = bx - dx * 0.3 - dy * side * (reach + 0.35);
        ty = by - dy * 0.3 + dx * side * (reach + 0.35);
      }
    }
    // A ball against the boards, where nobody can stand behind it, is simply played on.
    const cornered = Math.abs(px) > FLAT.BX - m.r || Math.abs(py) > FLAT.BY - m.r || Math.abs(ball.y) > FLAT.HY - reach;
    // Square to the goal it holds the kick ready as it comes in. In its own half, pressed against the ball, it clears
    // it forward from anywhere (else two players can hold a ball against each other, or in a corner, for ever).
    if (fresh) mind.shoot = random(world) < level.take;
    const ready = mind.shoot && square > level.square && gap < 0.45,
      forward = gap < BODY.flat.reach * 0.9 && mind.shoot && ((tbx / tb) * s > 0.3 && s * ball.x < 1 || (cornered && (tbx / tb) * s > -0.2)),
      kick = ready || forward;
    return { ...go(tx, ty), kick, kickPress: kick && !m.held };
  }
  // The side view.
  const { GL } = GRAVITY,
    own = -s * GL,
    lead = 10,
    bx = ball.x + ball.vx * lead,
    above = ball.y - m.y,
    dx = ball.x - m.x;
  if (!first || world.phase === "goal") {
    // The keeper: before its own goal, coming out to the ball when it is near, jumping at a high ball coming in.
    const tx = Math.abs(bx - own) < 3.2 ? own + s * Math.max(0.9, Math.abs(bx - own) * 0.55) : own + s * 1.6,
      high = above > 0.5 && Math.abs(dx) < 1.3 && ball.vy < 0.04 && s * ball.vx < 0;
    const shoot = Math.hypot(dx, above) - m.r - ball.r < BODY.gravity.reach && random(world) < level.take;
    return { ...go(tx, 0), y: 0, kick: shoot, kickPress: shoot, jump: high, jumpPress: high };
  }
  const behind = s * dx > -0.05,
    tx = behind ? bx - s * (m.r + ball.r) * 0.55 : bx - s * (m.r + ball.r + 0.9),
    head = above > 0.45 && Math.abs(dx) < 1.0 && ball.vy < 0.06,
    hop = !behind && above < 0.5 && Math.abs(dx) < 1.1 && m.ground,
    near = Math.hypot(dx, above) - m.r - ball.r < BODY.gravity.reach,
    shoot = near && (behind || above > 0.3) && random(world) < level.take;
  const jump = (head || hop) && random(world) < 0.4 + level.take * 0.6;
  return { ...go(tx, 0), y: 0, kick: shoot, kickPress: shoot, jump, jumpPress: jump };
}
/** Seconds left on the clock (null without a limit). */
export const timeLeft = (world: World) => (world.limit ? Math.max(0, (world.limit - world.clock) * DT) : null);
