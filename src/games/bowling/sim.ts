/**
 * Ten-pin bowling on one lane, as a small physics of its own, free of Three.js and the page: the rules run a throw
 * through it to learn which pins fell, and the view runs the very same steps to show it. Everything moves in fixed
 * slices (`DT`), so the same throw at the same pins always ends the same way.
 *
 * Distances are in metres along a lane of the real size, seen from above: `x` across it (to the bowler's right),
 * `d` down it from the foul line. Heights are left out but for the tilt of a pin, which is what makes a pin fall:
 *
 * - The ball is a disc that skids through the oil of the front of the lane and hooks when it reaches the dry back
 *   end, as far as its spin lasts, then rolls on. Past the edge of the lane it drops into the gutter and touches
 *   nothing more.
 * - A pin standing is a disc on its base. Struck, it is pushed and tipped: a light touch only rocks it, and it
 *   settles upright again; past the tipping angle it falls, its outline on the deck growing into a capsule as it
 *   goes down; fallen, it is a capsule that slides and spins until it rests. Tipping and fallen pins strike the
 *   others as they sweep across the deck, which is how one pin takes out the ones behind it.
 * - Pins bounce off the kickbacks at the sides of the deck and drop into the pit behind it. A pin pushed off the
 *   deck into a gutter cannot stand there.
 */
export const LANE_HALF = 0.527,
  GUTTER = 0.235,
  /** The kickbacks: the walls at the sides of the pin deck. */
  KICK = LANE_HALF + GUTTER,
  /** From the foul line to the head pin, and from row to row and pin to pin of the rack. */
  HEAD = 18.288,
  ROW = 0.2639,
  SPACE = 0.3048,
  /** Where the pin deck ends and the pit begins, and the curtain at the back of the pit. */
  DECK_END = HEAD + 0.869,
  PIT_END = DECK_END + 0.95,
  /** The oil laid on the front of the lane: the ball skids there and hooks after it. */
  OIL = 12.2,
  BALL_R = 0.108,
  BALL_M = 6.8,
  PIN_R = 0.06,
  PIN_H = 0.381,
  PIN_M = 1.53,
  /** The ball lies here before it is thrown, just behind the foul line. */
  START_D = -0.3,
  DT = 1 / 360,
  /** A throw is run for at most this long. */
  MAX_TIME = 7.5;
/** How far a pin may lean and still come back upright. */
export const TIP = 0.18;
/** The leaning at which a falling pin is lying on the deck. */
const LIE = Math.PI / 2 - 0.09;
/** How fast gravity takes a leaning pin down (3g/2h for a rod pivoting on its foot). */
const FALL = (3 * 9.81) / (2 * PIN_H);
/** How much a pin leans for each metre a second it is pushed. */
const KNOCK = 2.6;
/** A fallen pin's turning inertia about its middle, and a falling one's about its foot, over its mass. */
const LYING_I = (PIN_H * PIN_H) / 12,
  FOOT_I = (PIN_H * PIN_H) / 3;
const BALL_DRAG = { oil: 0.12, dry: 0.42 },
  PIN_DRAG = { up: 4.2, lying: 2.6, spin: 9 };
/** Sideways pull of the hook in the dry back end (m/s²), for each spin: none, to the left, to the right. */
export const HOOK = [0, -1.15, 1.15];
/** How much sideways speed a spin can give before the ball has rolled out and goes straight on. */
const SPIN_BUDGET = 0.62;
/** The ten spots of the rack, pin 1 first: 1 at the front, 2 and 3 behind it, then 4–6 and 7–10, left to right. */
export const SPOTS: { x: number; d: number }[] = [
  [0, 0],
  [-0.5, 1],
  [0.5, 1],
  [-1, 2],
  [0, 2],
  [1, 2],
  [-1.5, 3],
  [-0.5, 3],
  [0.5, 3],
  [1.5, 3],
].map(([across, row]) => ({ x: across * SPACE, d: HEAD + row * ROW }));
/** A pin standing for the next ball: its number (1–10), where it stands and its weight. */
export interface Spot {
  id: number;
  x: number;
  d: number;
  m: number;
}
export interface Throw {
  /** Where the ball is set on the approach, across the lane. */
  x: number;
  /** Its direction from straight down the lane, in radians, positive to the right. */
  angle: number;
  /** Its speed at release, metres a second. */
  speed: number;
  /** 0 straight, 1 hooking to the left, 2 to the right. */
  spin: number;
}
export interface Ball {
  x: number;
  d: number;
  vx: number;
  vd: number;
  /** The sideways pull of its hook, and how much of its spin is left to give. */
  hook: number;
  budget: number;
  gutter: boolean;
  /** Dropped into the pit. */
  gone: boolean;
  /** How far it has rolled, for its turning. */
  rolled: number;
}
/** What a pin is doing: standing (perhaps rocking), falling, lying, or gone into the pit. */
export const UP = 0,
  FALLING = 1,
  LYING = 2,
  OUT = 3;
export interface Pin {
  id: number;
  m: number;
  mode: number;
  /** The foot of a standing or falling pin; the middle of a lying one. */
  x: number;
  d: number;
  vx: number;
  vd: number;
  /** Standing or falling: the lean as a vector (its length the angle, its direction the way it leans). Lying: the way from foot to head. */
  tx: number;
  td: number;
  /** Standing or falling: how fast the lean changes, as a vector. Lying: `wx` is how fast it turns about the upright. */
  wx: number;
  wd: number;
  /** Height off the deck, and its speed up: a pin struck hard flies a little. */
  y: number;
  vy: number;
  /** It has been touched by something. */
  hit: boolean;
}
export interface World {
  ball: Ball;
  pins: Pin[];
  time: number;
  steps: number;
  /** Knocks heard so far (strikes harder than a tap), the hardest since it was last read, and when the ball first met a pin. */
  knocks: number;
  force: number;
  struck: number;
  /** When the ball dropped into the gutter, or -1. */
  guttered: number;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** A full rack: the ten pins on their spots, each a little off it and a little heavier or lighter as `random` says. */
export function rack(random?: () => number): Spot[] {
  const r = random ?? (() => 0.5);
  return SPOTS.map((spot, k) => ({
    id: k + 1,
    x: spot.x + (r() - 0.5) * 0.008,
    d: spot.d + (r() - 0.5) * 0.008,
    m: PIN_M * (1 + (r() - 0.5) * 0.06),
  }));
}
export function createWorld(standing: Spot[], t: Throw): World {
  const speed = clamp(t.speed, 0.5, 14);
  return {
    ball: {
      x: t.x,
      d: START_D,
      vx: Math.sin(t.angle) * speed,
      vd: Math.cos(t.angle) * speed,
      hook: HOOK[t.spin] ?? 0,
      budget: t.spin ? SPIN_BUDGET : 0,
      gutter: false,
      gone: false,
      rolled: 0,
    },
    pins: standing.map((s) => ({ id: s.id, m: s.m, mode: UP, x: s.x, d: s.d, vx: 0, vd: 0, tx: 0, td: 0, wx: 0, wd: 0, y: 0, vy: 0, hit: false })),
    time: 0,
    steps: 0,
    knocks: 0,
    force: 0,
    struck: -1,
    guttered: -1,
  };
}
/** The ball's way for one slice: skid, hook in the dry, the gutter, the pit. */
function moveBall(b: Ball, world: World) {
  if (b.gone) return;
  if (b.gutter) {
    // In the gutter it runs on to the pit, drawn to the middle of the channel.
    const middle = Math.sign(b.x) * (LANE_HALF + GUTTER / 2);
    b.vx = (middle - b.x) * 6;
    b.vd = Math.max(1, b.vd - 0.2 * DT);
  } else {
    const speed = Math.hypot(b.vx, b.vd),
      dry = clamp((b.d - (OIL - 1.2)) / 2.6, 0, 1);
    if (speed > 0.05) {
      if (b.hook && b.budget > 0 && dry > 0) {
        // Sideways to the way it goes (to the right of it for a positive hook).
        const pull = b.hook * dry * DT,
          across = (pull * b.vd) / speed,
          along = (-pull * b.vx) / speed;
        b.vx += across;
        b.vd += along;
        b.budget -= Math.abs(pull);
        // The turn keeps the speed: what the pull added along the way is taken off again.
        const now = Math.hypot(b.vx, b.vd);
        b.vx *= speed / now;
        b.vd *= speed / now;
      }
      const slowed = Math.max(0, speed - (BALL_DRAG.oil + (BALL_DRAG.dry - BALL_DRAG.oil) * dry) * DT);
      const k = slowed / Math.max(1e-9, Math.hypot(b.vx, b.vd));
      b.vx *= k;
      b.vd *= k;
    } else b.vx = b.vd = 0;
  }
  b.x += b.vx * DT;
  b.d += b.vd * DT;
  b.rolled += Math.hypot(b.vx, b.vd) * DT;
  if (!b.gutter && Math.abs(b.x) > LANE_HALF) {
    b.gutter = true;
    world.guttered = world.time;
  }
  // Past the deck it drops into the pit and is gone a little after.
  if (b.d > DECK_END + 0.6) b.gone = true;
}
/** The pin's outline on the deck for this slice: a segment from `a` to `b`, and its thickness. */
interface Shape {
  ax: number;
  ad: number;
  bx: number;
  bd: number;
  r: number;
}
const tilt = (p: Pin) => Math.hypot(p.tx, p.td);
function shapeOf(p: Pin): Shape {
  if (p.mode === LYING) {
    const h = PIN_H / 2;
    return { ax: p.x - p.tx * h, ad: p.d - p.td * h, bx: p.x + p.tx * h, bd: p.d + p.td * h, r: 0.05 };
  }
  if (p.mode === FALLING) {
    const theta = tilt(p),
      reach = (PIN_H * Math.sin(theta)) / Math.max(1e-9, theta);
    return { ax: p.x, ad: p.d, bx: p.x + p.tx * reach, bd: p.d + p.td * reach, r: 0.054 };
  }
  return { ax: p.x, ad: p.d, bx: p.x, bd: p.d, r: PIN_R };
}
/** The pin's lean, gravity and the deck for one slice. */
function movePin(p: Pin) {
  if (p.mode === OUT) return;
  if (p.mode === UP) {
    const theta = tilt(p);
    if (theta > TIP) {
      p.mode = FALLING;
    } else {
      // Rocking on the edge of its foot: drawn back upright, losing a little each time.
      if (theta > 1e-6) {
        const back = FALL * Math.sin(TIP - theta) * 0.35 * DT;
        p.wx -= (back * p.tx) / theta;
        p.wd -= (back * p.td) / theta;
      }
      const keep = 1 - 5 * DT;
      p.wx *= keep;
      p.wd *= keep;
      p.tx += p.wx * DT;
      p.td += p.wd * DT;
      if (Math.hypot(p.tx, p.td) < 0.004 && Math.hypot(p.wx, p.wd) < 0.08) p.tx = p.td = p.wx = p.wd = 0;
    }
  }
  if (p.mode === FALLING) {
    let theta = tilt(p);
    const ux = p.tx / theta,
      ud = p.td / theta;
    let omega = p.wx * ux + p.wd * ud;
    omega = Math.min(30, omega + FALL * Math.sin(theta - TIP) * DT);
    theta += omega * DT;
    if (theta < TIP * 0.6 && omega < 0) {
      // Knocked back the other way: it rights itself.
      p.mode = UP;
      theta = Math.max(0, theta);
    }
    if (theta >= LIE) {
      // Down on the deck: from now on a capsule about its middle.
      p.mode = LYING;
      p.x += ux * PIN_H * 0.5;
      p.d += ud * PIN_H * 0.5;
      p.tx = ux;
      p.td = ud;
      p.wx = 0;
      p.wd = 0;
      if (p.y <= 0) p.vy = Math.min(0.6, omega * 0.03);
    } else {
      p.tx = ux * theta;
      p.td = ud * theta;
      p.wx = ux * omega;
      p.wd = ud * omega;
    }
  }
  // The deck holds it back unless it is in the air.
  if (p.y <= 0) {
    const speed = Math.hypot(p.vx, p.vd);
    if (speed > 0) {
      const k = Math.max(0, speed - (p.mode === LYING ? PIN_DRAG.lying : PIN_DRAG.up) * DT) / speed;
      p.vx *= k;
      p.vd *= k;
    }
    if (p.mode === LYING) p.wx = Math.sign(p.wx) * Math.max(0, Math.abs(p.wx) - PIN_DRAG.spin * DT);
  }
  if (p.mode === LYING && p.wx) {
    const a = p.wx * DT,
      c = Math.cos(a),
      s = Math.sin(a),
      tx = p.tx * c - p.td * s,
      td = p.tx * s + p.td * c;
    p.tx = tx;
    p.td = td;
  }
  p.x += p.vx * DT;
  p.d += p.vd * DT;
  if (p.y > 0 || p.vy > 0) {
    p.vy -= 9.81 * DT;
    p.y += p.vy * DT;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = p.vy < -0.5 ? -p.vy * 0.2 : 0;
    }
  }
  // Pushed off the deck into a gutter, a pin cannot stand: it falls outward.
  if ((p.mode === UP || p.mode === FALLING) && Math.abs(p.x) > LANE_HALF) {
    const out = Math.sign(p.x);
    if (p.mode === UP) {
      p.mode = FALLING;
      p.tx = out * (TIP + 0.01);
      p.td = 0;
      p.wx = out * 3;
      p.wd = 0;
    }
  }
  // The kickbacks at the sides of the deck.
  const shape = shapeOf(p),
    widest = Math.max(Math.abs(shape.ax), Math.abs(shape.bx)) + shape.r;
  if (p.d > HEAD - 0.7 && widest > KICK) {
    const side = Math.sign(Math.abs(shape.ax) > Math.abs(shape.bx) ? shape.ax : shape.bx);
    p.x -= side * (widest - KICK);
    if (p.vx * side > 0) p.vx = -p.vx * 0.45;
    if (p.mode === LYING) p.wx *= -0.5;
  }
  // Over the edge of the deck into the pit.
  if (p.d > DECK_END + 0.03) p.mode = OUT;
}
/** The closest points of two segments (from Ericson's Real-Time Collision Detection), as parameters along each. */
function closest(a: Shape, b: Shape) {
  const d1x = a.bx - a.ax,
    d1d = a.bd - a.ad,
    d2x = b.bx - b.ax,
    d2d = b.bd - b.ad,
    rx = a.ax - b.ax,
    rd = a.ad - b.ad,
    aa = d1x * d1x + d1d * d1d,
    ee = d2x * d2x + d2d * d2d,
    f = d2x * rx + d2d * rd;
  let s = 0,
    t = 0;
  if (aa <= 1e-12 && ee <= 1e-12) return { s, t };
  if (aa <= 1e-12) t = clamp(f / ee, 0, 1);
  else {
    const c = d1x * rx + d1d * rd;
    if (ee <= 1e-12) s = clamp(-c / aa, 0, 1);
    else {
      const bb = d1x * d2x + d1d * d2d,
        denom = aa * ee - bb * bb;
      s = denom > 1e-12 ? clamp((bb * f - c * ee) / denom, 0, 1) : 0;
      t = (bb * s + f) / ee;
      if (t < 0) {
        t = 0;
        s = clamp(-c / aa, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((bb - c) / aa, 0, 1);
      }
    }
  }
  return { s, t };
}
/** Something that can be struck: the ball, or a pin. */
interface Body {
  ball?: Ball;
  pin?: Pin;
  shape: Shape;
}
/** How fast the body's point `px, pd` moves. */
function pointVelocity(body: Body, px: number, pd: number): [number, number] {
  if (body.ball) return [body.ball.vx, body.ball.vd];
  const p = body.pin!;
  if (p.mode === LYING) return [p.vx - p.wx * (pd - p.d), p.vd + p.wx * (px - p.x)];
  if (p.mode === FALLING) {
    const theta = tilt(p),
      ux = p.tx / theta,
      ud = p.td / theta,
      omega = p.wx * ux + p.wd * ud,
      top = arm(p, px, pd) * omega;
    return [p.vx + ux * top, p.vd + ud * top];
  }
  return [p.vx, p.vd];
}
/** How far up a falling pin, as seen across the deck, the point `px, pd` is: the arm its fall turns about the foot. */
function arm(p: Pin, px: number, pd: number) {
  return Math.hypot(px - p.x, pd - p.d) / Math.max(0.05, Math.tan(tilt(p)));
}
/** How hard the body is to push along `n` at that point (its inverse mass, and its turning for a falling or lying pin). */
function give(body: Body, px: number, pd: number, nx: number, nd: number) {
  if (body.ball) return 1 / BALL_M;
  const p = body.pin!;
  if (p.mode === FALLING) {
    const theta = tilt(p),
      lever = arm(p, px, pd) * ((p.tx / theta) * nx + (p.td / theta) * nd);
    return 1 / p.m + (lever * lever) / (p.m * FOOT_I);
  }
  if (p.mode !== LYING) return 1 / p.m;
  const cross = (px - p.x) * nd - (pd - p.d) * nx;
  return 1 / p.m + (cross * cross) / (p.m * LYING_I);
}
function push(body: Body, px: number, pd: number, jx: number, jd: number, world: World) {
  if (body.ball) {
    body.ball.vx += jx / BALL_M;
    body.ball.vd += jd / BALL_M;
    return;
  }
  const p = body.pin!,
    dvx = jx / p.m,
    dvd = jd / p.m,
    dv = Math.hypot(dvx, dvd);
  p.hit = true;
  p.vx += dvx;
  p.vd += dvd;
  if (p.mode === UP) {
    // Pushed at its belly, it leans the way it is pushed.
    p.wx += dvx * KNOCK;
    p.wd += dvd * KNOCK;
  } else if (p.mode === FALLING) {
    // Struck up its body, its fall about the foot quickens or is checked.
    const theta = tilt(p),
      ux = p.tx / theta,
      ud = p.td / theta,
      turn = (arm(p, px, pd) * (jx * ux + jd * ud)) / (p.m * FOOT_I);
    p.wx += ux * turn;
    p.wd += ud * turn;
  } else if (p.mode === LYING) {
    const cross = (px - p.x) * jd - (pd - p.d) * jx;
    p.wx = clamp(p.wx + cross / (p.m * LYING_I), -40, 40);
  }
  // A hard knock sends it flying a little.
  if (dv > 2.4 && p.y <= 0) p.vy = Math.max(p.vy, Math.min(1.9, dv * 0.16));
  if (dv > 0.6) world.knocks++;
  world.force = Math.max(world.force, dv);
}
function collide(a: Body, b: Body, world: World) {
  const { s, t } = closest(a.shape, b.shape),
    sa = a.shape,
    sb = b.shape,
    px = sa.ax + (sa.bx - sa.ax) * s,
    pd = sa.ad + (sa.bd - sa.ad) * s,
    qx = sb.ax + (sb.bx - sb.ax) * t,
    qd = sb.ad + (sb.bd - sb.ad) * t,
    dx = px - qx,
    dd = pd - qd,
    reach = sa.r + sb.r,
    dist2 = dx * dx + dd * dd;
  if (dist2 >= reach * reach) return;
  const dist = Math.sqrt(dist2),
    nx = dist > 1e-9 ? dx / dist : 1,
    nd = dist > 1e-9 ? dd / dist : 0,
    // The point of contact: between the two outlines.
    cx = qx + nx * sb.r,
    cd = qd + nd * sb.r,
    [avx, avd] = pointVelocity(a, cx, cd),
    [bvx, bvd] = pointVelocity(b, cx, cd),
    vn = (avx - bvx) * nx + (avd - bvd) * nd,
    ka = give(a, cx, cd, nx, nd),
    kb = give(b, cx, cd, nx, nd);
  if (vn < 0) {
    const lying = a.pin?.mode === LYING || b.pin?.mode === LYING,
      bounce = a.ball || b.ball ? 0.62 : lying ? 0.4 : 0.5,
      j = (-(1 + bounce) * vn) / (ka + kb);
    push(a, cx, cd, nx * j, nd * j, world);
    push(b, cx, cd, -nx * j, -nd * j, world);
    if ((a.ball || b.ball) && world.struck < 0) world.struck = world.time;
  }
  // Never left inside each other: both are moved apart, the lighter more.
  const overlap = reach - dist,
    share = ka / (ka + kb);
  move(a, nx * overlap * share, nd * overlap * share);
  move(b, -nx * overlap * (1 - share), -nd * overlap * (1 - share));
}
function move(body: Body, dx: number, dd: number) {
  const thing = body.ball ?? body.pin!;
  thing.x += dx;
  thing.d += dd;
  const s = body.shape;
  s.ax += dx;
  s.bx += dx;
  s.ad += dd;
  s.bd += dd;
}
/**
 * Whether anything on the deck may still strike something. A pin caught leaning on another or on a kickback (a
 * leaner: falling, but held up and no longer moving) is at rest; it is not standing, so it counts as down.
 */
const stirring = (p: Pin) =>
  Math.hypot(p.vx, p.vd) > 0.02 ||
  p.y > 0 ||
  (p.mode === FALLING && Math.hypot(p.wx, p.wd) > 0.3) ||
  (p.mode === UP && Math.hypot(p.wx, p.wd) > 0.02) ||
  (p.mode === LYING && Math.abs(p.wx) > 0.2);
/** Advances the world by one slice. */
export function step(world: World) {
  const { ball, pins } = world;
  moveBall(ball, world);
  for (const p of pins) movePin(p);
  // Until the ball nears the rack and while nothing there moves, there is nothing to strike.
  const near = !ball.gone && !ball.gutter && ball.d > HEAD - 0.5;
  if (near || pins.some(stirring)) {
    const bodies: Body[] = [];
    if (!ball.gone && !ball.gutter && ball.d < DECK_END) bodies.push({ ball, shape: { ax: ball.x, ad: ball.d, bx: ball.x, bd: ball.d, r: BALL_R } });
    for (const p of pins) if (p.mode !== OUT) bodies.push({ pin: p, shape: shapeOf(p) });
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < bodies.length; i++)
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i],
            b = bodies[j];
          // Two pins at rest cannot strike each other.
          if (a.pin && b.pin && !stirring(a.pin) && !stirring(b.pin)) continue;
          collide(a, b, world);
        }
  }
  world.time += DT;
  world.steps++;
}
/** Whether the throw is over: the ball gone and every pin at rest. */
export function settled(world: World) {
  if (world.time >= MAX_TIME) return true;
  const b = world.ball;
  if (!b.gone && Math.hypot(b.vx, b.vd) > 0.05) return false;
  return !world.pins.some((p) => p.mode !== OUT && (stirring(p) || (p.mode === UP && tilt(p) > 0.004)));
}
/**
 * How far any two things on the lane have sunk into each other, as a share of their thickness together: what a
 * test reads to be sure that nothing passes through anything.
 */
export function deepest(world: World) {
  const bodies: Shape[] = [];
  const { ball } = world;
  if (!ball.gone && !ball.gutter && ball.d < DECK_END) bodies.push({ ax: ball.x, ad: ball.d, bx: ball.x, bd: ball.d, r: BALL_R });
  for (const p of world.pins) if (p.mode !== OUT) bodies.push(shapeOf(p));
  let worst = 0;
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i],
        b = bodies[j],
        { s, t } = closest(a, b),
        dx = a.ax + (a.bx - a.ax) * s - (b.ax + (b.bx - b.ax) * t),
        dd = a.ad + (a.bd - a.ad) * s - (b.ad + (b.bd - b.ad) * t),
        reach = a.r + b.r;
      worst = Math.max(worst, (reach - Math.hypot(dx, dd)) / reach);
    }
  return worst;
}
/** Runs a throw to its end. */
export function run(world: World) {
  while (!settled(world)) step(world);
  return world;
}
/** Whether a pin is still standing on the deck. */
export const standing = (p: Pin) => p.mode === UP && tilt(p) <= TIP && Math.abs(p.x) <= LANE_HALF && p.d < DECK_END && p.d > HEAD - 0.9;
/** The pins left standing when the throw is over, where they stand now: the pinsetter sets them down there again. */
export function left(world: World): Spot[] {
  return world.pins.filter(standing).map((p) => ({ id: p.id, x: p.x, d: p.d, m: p.m }));
}
/** The throw's outcome: the pins knocked down (by number) and those left standing. */
export function bowl(pins: Spot[], t: Throw) {
  const world = run(createWorld(pins, t)),
    after = left(world),
    still = new Set(after.map((p) => p.id));
  return { knocked: pins.filter((p) => !still.has(p.id)).map((p) => p.id), left: after, world };
}
/** Where the ball would cross `atD` down the lane (or null if it found the gutter first), with no pins in the way. */
export function crossing(t: Throw, atD: number) {
  const world = createWorld([], t);
  while (world.ball.d < atD && !world.ball.gutter && world.time < MAX_TIME) {
    moveBall(world.ball, world);
    world.time += DT;
  }
  return world.ball.gutter ? null : { x: world.ball.x, time: world.time };
}
/** The ball's way down the lane, point by point every `every` metres, up to `upTo`: what the aiming dots show. */
export function path(t: Throw, upTo: number, every: number) {
  const world = createWorld([], t),
    points: { x: number; d: number }[] = [];
  let next = 0;
  while (world.ball.d < upTo && !world.ball.gutter && world.time < MAX_TIME) {
    moveBall(world.ball, world);
    world.time += DT;
    if (world.ball.d >= next) {
      points.push({ x: world.ball.x, d: world.ball.d });
      next += every;
    }
  }
  return points;
}
