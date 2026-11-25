/**
 * The snowboard run's insides, free of Three.js and the page: an endless downhill course of rolling snow seen from
 * the side, a rider on a board, and what is on the slope (rocks, gates of two flags, snowflakes). The view steps it
 * in fixed slices (`DT`) and reports scores as moves.
 *
 * Metres and seconds. x runs down the course (to the right on the screen), y up. The ground's height is `heightAt(x)`,
 * a smooth curve (C¹) through control points laid section by section from the run's seed (`Course`), so that a run is
 * the same for the same seed. The rider rides on the ground along its tangent (gravity along the slope, a little
 * friction, the air's drag), leaves it where the ground falls away faster than a thrown body would (a crest, a
 * kicker's lip) or pops off it (an ollie, when a held press is let go), flies as a thrown body, and lands where it
 * meets the ground again: cleanly when the board lies along the slope (within `LAND_OK`), else it crashes.
 *
 * How it is played (the user asked for "이런 식의 스노우보드 게임": a side view, hills, jumps, tricks, flags, rocks,
 * score, multiplier and time): a press held (anywhere, or Space/↓) crouches; crouched on a downslope the rider
 * gains speed (pumping), crouched on an upslope it loses a little more; let go on the ground it pops (the longer it
 * was held, up to `POP_CHARGE`, the higher). In the air the left half of the screen (or ←) turns the rider back
 * (a backflip: counterclockwise as it goes right), the right half (or →) forward (a front flip). A clean landing
 * scores its flips, its time in the air and a near-perfect landing, all times the multiplier, and each flip raises
 * the multiplier (up to `MULT_MOST`); a crash (a bad landing, a rock) puts it back to ×1. A run lasts `RUN` seconds.
 */
export const DT = 1 / 240;
export const G = 9.81;
/** Friction on the snow (a share of the normal force), and the air's drag (m⁻¹; terminal near 26 m/s on a 15° slope). */
export const MU = 0.03,
  DRAG = 0.0038,
  /** Crouched: gravity along a downslope counts this much more (pumping), along an upslope this much more against. */
  PUMP_DOWN = 0.45,
  PUMP_UP = 0.2,
  /** Crouched, the air's drag is this share of standing's (a tuck). */
  TUCK = 0.7,
  /** The least speed the rider keeps on the ground by skating along (m/s), and how hard it skates up to it. */
  CRAWL = 4,
  SKATE = 2.4;
/** An ollie: the most it adds upward (m/s, along the ground's normal), reached after holding `POP_CHARGE` seconds; a tap gives `POP_MIN` of it. */
export const POP = 4.2,
  POP_CHARGE = 0.45,
  POP_MIN = 0.35;
/** Turning in the air: the most angular speed (rad/s) and how quickly it comes (and goes, when let go). */
export const SPIN = 6.8,
  SPIN_EASE = 0.09;
/** Left alone in the air, the board eases toward its way of flight (a rider keeps it so), over this many seconds. */
export const ATTITUDE = 0.45;
/** A landing is clean when the board lies along the ground within `LAND_OK` (radians); within `PERFECT` it is perfect. */
export const LAND_OK = 0.72,
  PERFECT = 0.14;
/** Time in the air below which a landing is only a bump (no points, no word). */
export const HOP = 0.4;
/** A crash: how long the rider tumbles before riding on, and the speed it keeps. */
export const CRASH_TIME = 1.4,
  CRASH_KEEP = 0.5,
  /** How hard a tumbling rider is slowed by the snow (m/s²). */
  TUMBLE_SLOW = 2.5;
/** The run's length (seconds), and the most the multiplier rises to. */
export const RUN = 120,
  MULT_MOST = 9;
/** Points: a flip, each second in the air, a perfect landing, a gate, a snowflake (all times the multiplier). */
export const POINTS = { flip: 1000, air: 200, perfect: 300, gate: 100, flake: 50 };
/** The rider's height (to its head when standing) and how close a snowflake must come to be taken. */
export const RIDER_H = 1.7,
  FLAKE_R = 1.3,
  /** A gate counts when ridden through below its flags' tops (the poles are this tall). */
  GATE_H = 2.4;

/** A rock stands this many of its radii above the ground (as drawn). */
export const ROCK_TOP = 1.05;
export interface Rock {
  x: number;
  r: number;
  /** Already crashed into (it does not stop the rider again as it gets up beside it). */
  hit?: boolean;
}
export interface Gate {
  x: number;
  passed: boolean;
}
export interface Flake {
  x: number;
  y: number;
  taken: boolean;
}
/** The course: control points (x, y, and a slope when one is set) and what stands on it, laid ahead as the rider goes. */
export interface Course {
  xs: number[];
  ys: number[];
  ms: number[];
  rocks: Rock[];
  gates: Gate[];
  flakes: Flake[];
  seed: number;
  /** How many sections have been laid (the first ones are gentle). */
  sections: number;
}
export interface Rider {
  x: number;
  y: number;
  /** Velocity (m/s). On the ground it lies along the slope. */
  vx: number;
  vy: number;
  /** The board's angle (radians, counterclockwise from level; on the ground the slope's), and its turning speed. */
  angle: number;
  spin: number;
  ground: boolean;
  /** How crouched (0 standing to 1), eased toward the press. */
  crouch: number;
  /** Seconds the press has been held on the ground (the ollie's charge). */
  held: number;
  /** In the air: when it took off, and how far it has turned since (radians, signed). */
  airAt: number;
  turned: number;
  /** Crashed until this time (the rider tumbles), else -1. */
  crashed: number;
}
export interface World {
  time: number;
  course: Course;
  rider: Rider;
  /** The player's hands: a press held (crouch), and which way it turns in the air (-1 back, 1 forward, 0 none). */
  hold: boolean;
  turn: -1 | 0 | 1;
  multiplier: number;
  /** The best trick of the run (points before the multiplier), for the end. */
  crashes: number;
  over: boolean;
}
export type Happening =
  | { kind: "pop"; strength: number }
  | { kind: "launch" }
  | { kind: "land"; airtime: number; flips: number; back: boolean; perfect: boolean; points: number; multiplier: number }
  | { kind: "crash"; why: "landing" | "rock" }
  | { kind: "gate"; points: number }
  | { kind: "flake"; points: number }
  | { kind: "end" };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** An angle brought into (-π, π]. */
export const wrap = (a: number) => {
  let b = a % (2 * Math.PI);
  if (b > Math.PI) b -= 2 * Math.PI;
  if (b <= -Math.PI) b += 2 * Math.PI;
  return b;
};
/** The course's own sequence of numbers (a run is the same for the same seed). */
function draw(course: Course) {
  course.seed = (course.seed * 16807) % 2147483647;
  return (course.seed - 1) / 2147483646;
}
const between = (course: Course, lo: number, hi: number) => lo + (hi - lo) * draw(course);

/** A new course from `seed`: a flat start, then sections laid ahead as far as `ahead`. */
export function createCourse(seed: number, ahead = 300): Course {
  const course: Course = { xs: [-60, -20, 0, 12], ys: [10, 4, 0, -1.2], ms: [NaN, NaN, NaN, NaN], rocks: [], gates: [], flakes: [], seed: Math.max(1, Math.floor(Math.abs(seed)) % 2147483646) || 1, sections: 0 };
  extend(course, ahead);
  return course;
}
/** Adds a control point `dx` on from the last, `dy` up from it (and its slope, if set). */
function point(course: Course, dx: number, dy: number, m = NaN) {
  course.xs.push(course.xs[course.xs.length - 1] + dx);
  course.ys.push(course.ys[course.ys.length - 1] + dy);
  course.ms.push(m);
}
const lastX = (course: Course) => course.xs[course.xs.length - 1];
/**
 * Lays sections until the course reaches `to`. Sections: rolling bumps (a gate in a dip now and then), a steep drop,
 * a kicker (a run-in down, a lip turned up, a gap and a long steep landing; a rock or two before the lip to jump,
 * snowflakes over the gap along the flight), a gentle stretch with a rock, and a dip and rise (a half-pipe's side).
 */
export function extend(course: Course, to: number) {
  while (lastX(course) < to) {
    const n = course.sections++,
      r = draw(course),
      kind = n < 1 ? "roll" : r < 0.34 ? "kicker" : r < 0.62 ? "roll" : r < 0.75 ? "drop" : r < 0.88 ? "dip" : "gentle";
    if (kind === "roll") {
      const bumps = 2 + Math.floor(draw(course) * 3);
      for (let k = 0; k < bumps; k++) {
        const len = between(course, 13, 20),
          rise = between(course, 0.8, 2.2);
        point(course, len * 0.5, -len * 0.32);
        point(course, len * 0.5, -len * 0.06 + rise);
        // A gate in the dip, now and then (the flags stand where the rider rides through on the ground).
        if (draw(course) < 0.45) course.gates.push({ x: course.xs[course.xs.length - 2], passed: false });
      }
    } else if (kind === "drop") {
      const len = between(course, 18, 28);
      point(course, len * 0.35, -len * 0.2);
      point(course, len * 0.4, -len * 0.42);
      point(course, len * 0.25, -len * 0.12);
      if (draw(course) < 0.5) course.gates.push({ x: lastX(course) - len * 0.12, passed: false });
    } else if (kind === "kicker") {
      // The run-in, the lip (turned up), a short gap below it and the long landing slope.
      const runIn = between(course, 16, 24),
        lip = between(course, 0.35, 0.6),
        height = between(course, 1.6, 3);
      point(course, runIn * 0.6, -runIn * 0.38);
      point(course, runIn * 0.4, -runIn * 0.12, 0);
      point(course, 5, height, Math.tan(lip));
      const lipX = lastX(course),
        lipY = course.ys[course.ys.length - 1];
      // Before the lip, on the run-in, a rock to jump now and then (it sits where the slope is easy to pop from).
      if (draw(course) < 0.5) course.rocks.push({ x: lipX - 5 - runIn * 0.25, r: between(course, 0.45, 0.7) });
      const gap = between(course, 5, 9),
        land = between(course, 20, 30);
      point(course, gap, -height - gap * 0.35, -0.55);
      point(course, land * 0.55, -land * 0.42, -0.7);
      point(course, land * 0.45, -land * 0.18);
      // Snowflakes along the flight a good jump would take (a thrown body from the lip at a fair speed).
      const v = 15,
        vx = v * Math.cos(lip),
        vy = v * Math.sin(lip) + POP * 0.6;
      for (let k = 1; k <= 4; k++) {
        const t = k * 0.28;
        course.flakes.push({ x: lipX + vx * t, y: lipY + vy * t - (G * t * t) / 2 + 0.9, taken: false });
      }
    } else if (kind === "dip") {
      const len = between(course, 22, 30),
        rise = between(course, 2.5, 4.5);
      point(course, len * 0.3, -len * 0.34);
      point(course, len * 0.2, -len * 0.08, 0);
      point(course, len * 0.25, rise, 0.9);
      point(course, len * 0.25, -rise - len * 0.1, -0.9);
    } else {
      const len = between(course, 22, 34);
      point(course, len * 0.5, -len * 0.16);
      course.rocks.push({ x: lastX(course) - len * 0.1, r: between(course, 0.45, 0.75) });
      point(course, len * 0.5, -len * 0.18);
    }
  }
}
/** The control-point stretch holding `x`: the index of its first point. */
function stretch(course: Course, x: number) {
  const xs = course.xs;
  let lo = 0,
    hi = xs.length - 2;
  if (x <= xs[0]) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return Math.min(lo, xs.length - 2);
}
/** The slope a control point has: its own, if set, else that of the line between its neighbours. */
function slopeOf(course: Course, i: number) {
  const { xs, ys, ms } = course;
  if (!Number.isNaN(ms[i])) return ms[i];
  const a = Math.max(0, i - 1),
    b = Math.min(xs.length - 1, i + 1);
  return (ys[b] - ys[a]) / (xs[b] - xs[a]);
}
/** The ground's height and slope (dy/dx) at `x`: a cubic Hermite curve through the control points. */
export function groundAt(course: Course, x: number) {
  const i = stretch(course, x),
    { xs, ys } = course,
    x0 = xs[i],
    x1 = xs[i + 1],
    h = x1 - x0,
    t = clamp((x - x0) / h, 0, 1),
    m0 = slopeOf(course, i) * h,
    m1 = slopeOf(course, i + 1) * h,
    t2 = t * t,
    t3 = t2 * t,
    y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * m1,
    dy = ((6 * t2 - 6 * t) * ys[i] + (3 * t2 - 4 * t + 1) * m0 + (-6 * t2 + 6 * t) * ys[i + 1] + (3 * t2 - 2 * t) * m1) / h;
  return { y, slope: dy };
}
export const heightAt = (course: Course, x: number) => groundAt(course, x).y;

/** A new run on a course from `seed`: the rider standing at the start, riding off slowly. */
export function createWorld(seed: number): World {
  const course = createCourse(seed);
  return {
    time: 0,
    course,
    rider: { x: 0, y: 0, vx: 6, vy: 0, angle: 0, spin: 0, ground: true, crouch: 0, held: 0, airAt: 0, turned: 0, crashed: -1 },
    hold: false,
    turn: 0,
    multiplier: 1,
    crashes: 0,
    over: false,
  };
}
/** Puts the rider on the ground at `x` with speed `v` along it (tests and the start). */
export function placeRider(world: World, x: number, v: number) {
  const g = groundAt(world.course, x),
    a = Math.atan(g.slope),
    r = world.rider;
  Object.assign(r, { x, y: g.y, vx: v * Math.cos(a), vy: v * Math.sin(a), angle: a, spin: 0, ground: true, turned: 0, crashed: -1 });
}
/** The rider's speed. */
export const speedOf = (r: Rider) => Math.hypot(r.vx, r.vy);
/** The points a clean landing scores (before the multiplier): its flips, its time in the air, and a perfect landing. */
export function trickPoints(flips: number, airtime: number, perfect: boolean) {
  if (airtime < HOP) return 0;
  return flips * POINTS.flip + Math.round((airtime * POINTS.air) / 10) * 10 + (perfect ? POINTS.perfect : 0);
}

/** One slice of the run: the rider on the ground or in the air, what it meets, and the clock. */
export function step(world: World): Happening[] {
  const out: Happening[] = [];
  if (world.over) return out;
  world.time += DT;
  const r = world.rider,
    course = world.course;
  extend(course, r.x + 260);
  if (world.time >= RUN) {
    world.over = true;
    out.push({ kind: "end" });
    return out;
  }
  const crashed = r.crashed >= 0;
  if (crashed && world.time >= r.crashed) {
    // Up again: on the board along the ground, riding on.
    r.crashed = -1;
    r.spin = 0;
    r.turned = 0;
  }
  // The crouch follows the press (not while tumbling).
  const crouching = world.hold && r.crashed < 0;
  r.crouch += ((crouching ? 1 : 0) - r.crouch) * (1 - Math.exp(-DT / 0.08));
  if (r.ground) rideGround(world, out);
  else flyAir(world, out);
  collect(world, out);
  return out;
}
/** A slice on the ground: along the slope, then off it where the ground falls away or the rider pops. */
function rideGround(world: World, out: Happening[]) {
  const r = world.rider,
    course = world.course,
    here = groundAt(course, r.x),
    a = Math.atan(here.slope),
    cos = Math.cos(a),
    sin = Math.sin(a),
    tumbling = r.crashed >= 0;
  let v = r.vx * cos + r.vy * sin;
  // Gravity along the slope (sin < 0 going down), more of it when crouched on a downslope, against when crouched uphill.
  const along = -G * sin,
    pump = r.crouch * (along > 0 ? PUMP_DOWN : PUMP_UP);
  let acc = along * (1 + pump) - Math.sign(v || 1) * MU * G * cos - (tumbling ? TUMBLE_SLOW : 0) * Math.sign(v || 1) - DRAG * (1 - (1 - TUCK) * r.crouch) * v * Math.abs(v);
  // The rider skates on when all but stopped (no stalling on a rise).
  if (!tumbling && v < CRAWL) acc = Math.max(acc + SKATE, SKATE * 0.6);
  v += acc * DT;
  if (tumbling) v = Math.max(0, v);
  const nx = r.x + v * cos * DT;
  // The pop: a press let go on the ground (not while tumbling).
  if (!world.hold && r.held > 0 && !tumbling) {
    const charge = clamp(r.held / POP_CHARGE, POP_MIN, 1),
      up = POP * charge;
    r.held = 0;
    r.vx = v * cos - up * sin;
    r.vy = v * sin + up * cos;
    r.y = here.y + 0.02;
    takeOff(world, out);
    out.push({ kind: "pop", strength: charge });
    return;
  }
  r.held = world.hold && !tumbling ? r.held + DT : 0;
  // Off the ground where it bends away faster than gravity can hold the rider to it (a crest, a lip): where the
  // pull needed to follow its curve, v²·κ, is more than gravity's part across the slope.
  const vx = v * cos,
    vy = v * sin,
    next = groundAt(course, nx),
    bend = (next.slope - here.slope) / Math.max(1e-6, nx - r.x),
    curve = bend / Math.pow(1 + here.slope * here.slope, 1.5);
  if (!tumbling && v > 4 && -curve * v * v > G * cos) {
    r.vx = vx;
    r.vy = vy;
    // A hair off the snow, so that the next slice does not count it down again.
    r.y += 0.01;
    takeOff(world, out);
    out.push({ kind: "launch" });
    return;
  }
  const na = Math.atan(next.slope);
  r.x = nx;
  r.y = next.y;
  r.vx = v * Math.cos(na);
  r.vy = v * Math.sin(na);
  if (!tumbling) r.angle = na;
  else r.angle += 9 * DT;
  // A rock on the ground ahead: a crash.
  if (!tumbling)
    for (const rock of course.rocks)
      if (!rock.hit && Math.abs(rock.x - r.x) < rock.r + 0.25) {
        rock.hit = true;
        return crash(world, out, "rock");
      }
}
function takeOff(world: World, _out: Happening[]) {
  const r = world.rider;
  r.ground = false;
  r.airAt = world.time;
  r.turned = 0;
  r.spin = 0;
}
/** A slice in the air: thrown, turning by the hands, until it meets the ground again. */
function flyAir(world: World, out: Happening[]) {
  const r = world.rider,
    course = world.course,
    tumbling = r.crashed >= 0;
  const speed = speedOf(r);
  r.vx -= DRAG * speed * r.vx * DT;
  r.vy -= (G + DRAG * speed * r.vy) * DT;
  r.x += r.vx * DT;
  r.y += r.vy * DT;
  // Turning: back (counterclockwise) for -1, forward (clockwise) for 1.
  const goal = tumbling ? 0 : -world.turn * SPIN;
  r.spin += (goal - r.spin) * (1 - Math.exp(-DT / SPIN_EASE));
  r.angle += r.spin * DT;
  r.turned += r.spin * DT;
  if (tumbling) r.angle += 9 * DT;
  // No hand on it: the board comes round to its way of flight (not counted as turning).
  else if (world.turn === 0 && Math.abs(r.spin) < 1) r.angle += wrap(Math.atan2(r.vy, r.vx) - r.angle) * (1 - Math.exp(-DT / ATTITUDE));
  // Over a rock low enough to touch it: a crash.
  if (!tumbling)
    for (const rock of course.rocks) {
      const top = heightAt(course, rock.x) + rock.r * ROCK_TOP;
      if (!rock.hit && Math.abs(rock.x - r.x) < rock.r + 0.2 && r.y < top) {
        rock.hit = true;
        return crash(world, out, "rock");
      }
    }
  const g = groundAt(course, r.x);
  if (r.y > g.y) return;
  // Down: on the ground again, cleanly if the board lies along it.
  const a = Math.atan(g.slope),
    off = Math.abs(wrap(r.angle - a)),
    airtime = world.time - r.airAt,
    cos = Math.cos(a),
    sin = Math.sin(a),
    along = r.vx * cos + r.vy * sin;
  r.ground = true;
  r.y = g.y;
  if (tumbling) {
    r.vx = Math.max(0, along) * cos;
    r.vy = Math.max(0, along) * sin;
    return;
  }
  if (off > LAND_OK) {
    r.vx = along * cos;
    r.vy = along * sin;
    return crash(world, out, "landing");
  }
  // A clean landing keeps the speed along the slope (less the more crooked it was).
  const keep = Math.max(0, along) * (1 - 0.35 * (off / LAND_OK));
  r.vx = keep * cos;
  r.vy = keep * sin;
  r.angle = a;
  r.spin = 0;
  const flips = Math.floor((Math.abs(r.turned) + 0.6) / (2 * Math.PI)),
    perfect = off <= PERFECT,
    base = trickPoints(flips, airtime, perfect),
    multiplier = world.multiplier,
    back = r.turned > 0;
  r.turned = 0;
  if (base > 0) out.push({ kind: "land", airtime, flips, back, perfect, points: base * multiplier, multiplier });
  if (flips > 0) world.multiplier = Math.min(MULT_MOST, world.multiplier + flips);
}
function crash(world: World, out: Happening[], why: "landing" | "rock") {
  const r = world.rider;
  r.crashed = world.time + CRASH_TIME;
  r.vx *= CRASH_KEEP;
  r.vy *= CRASH_KEEP;
  r.spin = 0;
  r.turned = 0;
  r.held = 0;
  world.multiplier = 1;
  world.crashes++;
  out.push({ kind: "crash", why });
}
/** Gates ridden through and snowflakes taken. */
function collect(world: World, out: Happening[]) {
  const r = world.rider,
    course = world.course;
  for (const gate of course.gates) {
    if (gate.passed || r.x < gate.x || r.x > gate.x + 4) continue;
    gate.passed = true;
    // Through it below its flags' tops (not over it in the air), and riding (not tumbling).
    if (r.y - heightAt(course, gate.x) < GATE_H && r.crashed < 0) out.push({ kind: "gate", points: POINTS.gate * world.multiplier });
  }
  for (const flake of course.flakes) {
    if (flake.taken || Math.abs(flake.x - r.x) > FLAKE_R + 1) continue;
    const mid = r.y + RIDER_H * 0.5;
    if (Math.hypot(flake.x - r.x, flake.y - mid) < FLAKE_R) {
      flake.taken = true;
      out.push({ kind: "flake", points: POINTS.flake * world.multiplier });
    }
  }
}
