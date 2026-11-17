/**
 * The basketball shooting machine, free of Three.js and the page: balls thrown from the tray at the front up a netted
 * lane toward a hoop on a backboard, a rim that knocks them about, a net that slows them, a ramp floor that rolls them
 * back down into the tray, and a hoop that slides from side to side at the harder levels. The view steps it in fixed
 * slices and reports what happens; the rules know only the score and the clock.
 *
 * The player stands at +z and throws toward -z. The lane's floor rises gently toward the back (`floorAt`), so a ball
 * that has come down rolls back to the tray by itself. In the tray the balls lie as they came down, every which way
 * (the user asked): nothing lines them up; they knock into each other and stop where they stop, and the hand takes up
 * the one nearest to it (`readyBall`).
 */
/**
 * Gravity at the machine's scale (the user asked for a ball as heavy and quick as a real one): a ball's radius of 0.2
 * stands for a real basketball's 0.12 m, so a metre is 1.67 units and the earth pulls at 9.81 × 1.67 units a second
 * squared. Throws are quicker and flatter for it, and bounces die sooner.
 */
export const DT = 1 / 240,
  G = 9.81 * (0.2 / 0.12);
/** A ball's radius, and how many balls the machine holds. */
export const BALL = 0.2,
  BALLS = 5;
/** The rim: its height, how far down the lane, its radius and the thickness of its ring. */
export const HOOP = { y: 2.9, z: -4.45, r: 0.4, tube: 0.028 };
/** The backboard's front face, its half width, its foot and its top (it moves with the hoop). */
export const BOARD = { z: -4.95, half: 1.0, bottom: 2.5, top: 3.8 };
/** The lane between the side nets: its half width, the tray's front, the back wall and the roof net. */
export const LANE = { half: 1.3, front: 1.45, back: -5.25, roof: 4.45 };
/** The middle of the tray, and where the hand lets a ball go. */
export const READY = { z: 1.1 },
  HAND = { y: 1.45, z: 1.25 };
/** The farthest forward a ball's middle comes in the tray: against the padded lip. */
export const TRAY_FRONT = 1.28;
/** Where the balls happen to lie when the machine is switched on: scattered over the tray, not in a row. */
const SPOTS: [number, number][] = [
  [-0.68, 1.16],
  [0.06, 1.24],
  [0.6, 1.02],
  [-0.22, 0.8],
  [0.36, 0.66],
];
/** The tray's floor, and where the ramp begins to rise from it. */
const TRAY_Y = 0.5,
  RAMP_FROM = 0.55,
  SLOPE = 0.08;
/** How quickly a ball on the ramp gathers speed toward the tray (a quick return, as on the machines). */
const ROLL = 3.4;
/** The height of the floor at a point down the lane. */
export const floorAt = (z: number) => (z >= RAMP_FROM ? TRAY_Y : TRAY_Y + (RAMP_FROM - z) * SLOPE);
/** The angle a ball leaves the hand at, and how far the shortest and the longest throws carry (to the rim's height). */
export const LAUNCH = (55 * Math.PI) / 180,
  REACH = { short: 3.0, long: 8.0 };
/** The widest a throw may be turned to either side. */
export const MOST_YAW = 0.32;
/** The stages: how far the hoop slides to each side, and how long a slide there and back takes. */
export const LEVELS = [
  { sway: 0, period: 1 },
  { sway: 0.45, period: 5.6 },
  { sway: 0.65, period: 4.2 },
  { sway: 0.8, period: 3.2 },
  { sway: 0.9, period: 2.5 },
];
/** The fastest the hoop goes on its way to where its stage wants it (so that a new stage does not make it jump). */
const HOOP_SPEED = 2.6;
/** A ball in flight, rolling on the floor, or at rest in the tray. */
export type Phase = "rest" | "flight" | "roll";
export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  phase: Phase;
  /** Gone through the hoop this throw; the throw judged (scored or come down). */
  scored: boolean;
  judged: boolean;
  /** How fast it turns over (backspin from the hand), for the view. */
  spin: number;
}
export interface World {
  level: number;
  balls: Ball[];
  /** A fixed sequence for the small unevenness of the net and the ramp, so that balls do not come back in a line. */
  seed: number;
  /** Seconds since the first throw (the clock starts with it), and the time to the next whole second. */
  time: number;
  tick: number;
  started: boolean;
  /** The hoop's sideways place and how long since it began sliding. */
  hoopX: number;
  /** Seconds since the last throw. */
  since: number;
  /** The last moment the net was passed through (seconds of `time`), and where, for the view. */
  swish: number;
}
export type Happening =
  | { kind: "second" }
  | { kind: "score"; ball: number }
  | { kind: "miss"; ball: number }
  | { kind: "rim"; strength: number }
  | { kind: "board"; strength: number }
  | { kind: "bounce"; strength: number }
  | { kind: "net" };
/** A machine with every ball lying in the tray. */
export function createWorld(level = 1, seed = 7): World {
  const balls: Ball[] = SPOTS.slice(0, BALLS).map(([x, z]) => ({ x, y: floorAt(z) + BALL, z, vx: 0, vy: 0, vz: 0, phase: "rest", scored: false, judged: true, spin: 0 }));
  return { level: clampLevel(level), balls, seed, time: 0, tick: 1, started: false, hoopX: 0, since: 9, swish: -9 };
}
const clampLevel = (level: number) => Math.max(1, Math.min(LEVELS.length, Math.round(level) || 1));
/** The next stage: the clock stops until the next throw and starts again from nothing; the balls stay where they are. */
export function nextStage(world: World, level: number) {
  world.level = clampLevel(level);
  world.time = 0;
  world.tick = 1;
  world.started = false;
}
/** Where a stage wants the hoop at a moment of its round. */
export function hoopAt(level: number, time: number) {
  const { sway, period } = LEVELS[clampLevel(level) - 1];
  return sway ? sway * Math.sin((time / period) * Math.PI * 2) : 0;
}
/** A number from -1 to 1 out of the world's sequence. */
function jitter(world: World) {
  world.seed = (world.seed * 16807) % 2147483647;
  return ((world.seed - 1) / 2147483646) * 2 - 1;
}
/** Whether a ball lies in the tray, still or nearly, where the hand can take it up. */
const takeable = (ball: Ball) => ball.phase === "rest" || (ball.phase === "roll" && ball.z >= RAMP_FROM && Math.hypot(ball.vx, ball.vz) < 0.5);
/** The balls lying in the tray. */
export const inTray = (world: World) => world.balls.flatMap((ball, k) => (takeable(ball) ? [k] : []));
/** The ball the hand would take up: of those in the tray, the nearest to it; -1 when there is none. */
export function readyBall(world: World) {
  let best = -1,
    nearest = Infinity;
  world.balls.forEach((ball, k) => {
    const far = Math.hypot(ball.x, ball.z - HAND.z);
    if (takeable(ball) && far < nearest) [best, nearest] = [k, far];
  });
  return best;
}
/** How far a throw of `power` (0 to 1, a little more is allowed) carries before it comes back to the rim's height. */
export const carryOf = (power: number) => REACH.short + Math.max(0, power) * (REACH.long - REACH.short);
/** The power whose throw carries `carry`. */
export const powerFor = (carry: number) => (carry - REACH.short) / (REACH.long - REACH.short);
/** The speed out of the hand that carries a throw `carry` along the ground to the rim's height. */
export function speedFor(carry: number) {
  const rise = HOOP.y - HAND.y,
    cos = Math.cos(LAUNCH),
    lift = carry * Math.tan(LAUNCH) - rise;
  return lift <= 0.05 ? 3 : Math.sqrt((G * carry * carry) / (2 * cos * cos * lift));
}
/** Where a place on the floor is let go from: the ball is lifted straight up there, to the hand's height. */
export type Spot = { x: number; z: number };
export const MIDDLE: Spot = { x: 0, z: HAND.z };
/** The power and turn that throw a ball lifted at `from` through the middle of a hoop standing at `x`. */
export function idealThrow(x = 0, from: Spot = MIDDLE) {
  const dz = from.z - HOOP.z,
    dx = x - from.x;
  return { power: powerFor(Math.hypot(dz, dx)), yaw: Math.atan2(dx, dz) };
}
/** The velocity a throw of `power` turned by `yaw` leaves the hand with. */
export function launch(power: number, yaw: number) {
  const speed = speedFor(carryOf(power)),
    turn = Math.max(-MOST_YAW, Math.min(MOST_YAW, yaw)),
    flat = speed * Math.cos(LAUNCH);
  return { vx: flat * Math.sin(turn), vy: speed * Math.sin(LAUNCH), vz: -flat * Math.cos(turn) };
}
/** Whether a ball lies in the tray and the hand is free to throw it. */
export const canShoot = (world: World) => readyBall(world) >= 0 && world.since > 0.18;
/** The ball the hand would take up at a place of the tray: the nearest lying there; -1 when there is none. */
export function ballNear(world: World, x: number, z: number) {
  let best = -1,
    nearest = Infinity;
  world.balls.forEach((ball, k) => {
    const far = Math.hypot(ball.x - x, ball.z - z);
    if (takeable(ball) && far < nearest) [best, nearest] = [k, far];
  });
  return best;
}
/** Throws ball `held` (the one taken up while aiming, if it is still in the tray) or else the nearest; false when none can be. */
export function shoot(world: World, power: number, yaw: number, held = -1) {
  if (!canShoot(world)) return false;
  const k = held >= 0 && world.balls[held] && takeable(world.balls[held]) ? held : readyBall(world),
    ball = world.balls[k],
    v = launch(power, yaw);
  // Lifted straight up where it lay (the user asked: not brought to the middle) and thrown from there, over the
  // balls lying round it; the turn of the throw is from that place.
  Object.assign(ball, v, { y: HAND.y, phase: "flight", scored: false, judged: false, spin: -Math.hypot(v.vy, v.vz) / BALL / 4 });
  world.since = 0;
  world.started = true;
  return true;
}
/** The rim: the nearest point of its ring to the ball, and the ball pushed out of it if they meet. */
function rim(world: World, ball: Ball, out: Happening[]) {
  const dx = ball.x - world.hoopX,
    dz = ball.z - HOOP.z,
    flat = Math.hypot(dx, dz) || 1e-9,
    cx = world.hoopX + (dx / flat) * HOOP.r,
    cz = HOOP.z + (dz / flat) * HOOP.r,
    nx = ball.x - cx,
    ny = ball.y - HOOP.y,
    nz = ball.z - cz,
    far = Math.hypot(nx, ny, nz),
    reach = BALL + HOOP.tube;
  if (far >= reach || far < 1e-9) return;
  const ux = nx / far,
    uy = ny / far,
    uz = nz / far;
  ball.x = cx + ux * reach;
  ball.y = HOOP.y + uy * reach;
  ball.z = cz + uz * reach;
  const into = ball.vx * ux + ball.vy * uy + ball.vz * uz;
  if (into < 0) {
    // A hard rim and a heavy ball: a little under half of the blow comes back, and the run along the rim is slowed.
    ball.vx -= 1.45 * into * ux;
    ball.vy -= 1.45 * into * uy;
    ball.vz -= 1.45 * into * uz;
    ball.vx *= 0.88;
    ball.vz *= 0.88;
    ball.spin *= -0.5;
    if (-into > 0.4) out.push({ kind: "rim", strength: Math.min(1, -into / 6) });
  }
}
/** One slice of time: the hoop slides, balls fly, knock, drop through the net, roll back and wait in the tray. */
export function step(world: World): Happening[] {
  const out: Happening[] = [];
  world.since += DT;
  if (world.started) {
    world.time += DT;
    world.tick -= DT;
    if (world.tick <= 0) {
      world.tick += 1;
      out.push({ kind: "second" });
    }
  }
  const wanted = hoopAt(world.level, world.time),
    most = HOOP_SPEED * DT;
  world.hoopX += Math.max(-most, Math.min(most, wanted - world.hoopX));
  world.balls.forEach((ball, k) => {
    if (ball.phase === "rest") return;
    if (ball.phase === "roll") {
      // Down the ramp toward the tray, going on sideways as it came; in the flat tray it soon stops, wherever it is.
      const flat = ball.z >= RAMP_FROM;
      if (!flat) ball.vz += ROLL * DT;
      const drag = flat ? 2.4 : 0.2;
      ball.vx *= 1 - drag * DT;
      ball.vz *= 1 - drag * DT;
      const speed = Math.hypot(ball.vx, ball.vz);
      if (flat && speed > 0) {
        // Rolling resistance on the padded tray.
        const left = Math.max(0, speed - 0.7 * DT) / speed;
        ball.vx *= left;
        ball.vz *= left;
      }
      ball.x += ball.vx * DT;
      ball.z += ball.vz * DT;
      if (Math.abs(ball.x) > LANE.half - BALL) {
        ball.x = Math.sign(ball.x) * (LANE.half - BALL);
        ball.vx *= -0.35;
      }
      if (ball.z > TRAY_FRONT) {
        ball.z = TRAY_FRONT;
        ball.vz = -Math.abs(ball.vz) * 0.3;
      }
      if (ball.z < LANE.back + BALL) {
        ball.z = LANE.back + BALL;
        ball.vz = Math.abs(ball.vz);
      }
      ball.y = floorAt(ball.z) + BALL;
      ball.spin = ball.vz / BALL;
      if (flat && Math.hypot(ball.vx, ball.vz) < 0.04) {
        ball.vx = ball.vz = ball.vy = 0;
        ball.phase = "rest";
      }
      return;
    }
    const before = ball.y;
    // Gravity and the way along.
    ball.vy -= G * DT;
    ball.x += ball.vx * DT;
    ball.y += ball.vy * DT;
    ball.z += ball.vz * DT;
    rim(world, ball, out);
    // Through the hoop: the middle crosses the rim's height going down, inside the ring.
    const off = Math.hypot(ball.x - world.hoopX, ball.z - HOOP.z);
    if (!ball.scored && !ball.judged && before > HOOP.y && ball.y <= HOOP.y && off < HOOP.r - HOOP.tube) {
      ball.scored = ball.judged = true;
      world.swish = world.time;
      out.push({ kind: "score", ball: k }, { kind: "net" });
    }
    // The net under the rim gathers the ball toward the middle and slows it, and lets it out a little to one side.
    const low = HOOP.y - 0.75;
    if (ball.y < HOOP.y && ball.y > low && off < HOOP.r) {
      ball.vx += ((world.hoopX - ball.x) * 10 - ball.vx * 9) * DT;
      ball.vz += ((HOOP.z - ball.z) * 10 - ball.vz * 9) * DT;
      ball.vy *= 1 - 2.5 * DT;
      if (ball.y + ball.vy * DT <= low) {
        ball.vx += jitter(world) * 1.1;
        ball.vz += jitter(world) * 0.4;
      }
    }
    // The backboard (the ball only meets its face), the back wall, the side nets and the roof net.
    const netted = ball.y < HOOP.y && off < HOOP.r + 0.05;
    if (!netted && ball.z - BALL < BOARD.z && ball.vz < 0 && Math.abs(ball.x - world.hoopX) < BOARD.half + BALL * 0.5 && ball.y > BOARD.bottom - BALL * 0.5 && ball.y < BOARD.top + BALL * 0.5 && ball.z > BOARD.z - 0.15) {
      const blow = -ball.vz;
      ball.z = BOARD.z + BALL;
      ball.vz = blow * 0.6;
      out.push({ kind: "board", strength: Math.min(1, blow / 7) });
    }
    if (ball.z - BALL < LANE.back) {
      ball.z = LANE.back + BALL;
      ball.vz = Math.abs(ball.vz) * 0.3;
    }
    if (Math.abs(ball.x) > LANE.half - BALL) {
      ball.x = Math.sign(ball.x) * (LANE.half - BALL);
      ball.vx = -ball.vx * 0.35;
    }
    if (ball.y + BALL > LANE.roof) {
      ball.y = LANE.roof - BALL;
      ball.vy = -Math.abs(ball.vy) * 0.3;
    }
    if (ball.z > LANE.front && ball.vz > 0) {
      ball.z = LANE.front;
      ball.vz = -Math.abs(ball.vz) * 0.3;
    }
    // The floor: a bounce that dies away, then the ball rolls. A throw that comes down without going in is a miss.
    const floor = floorAt(ball.z) + BALL;
    if (ball.y < floor) {
      ball.y = floor;
      if (!ball.judged) {
        ball.judged = true;
        out.push({ kind: "miss", ball: k });
      }
      const blow = -ball.vy;
      if (blow > 1.6) {
        ball.vy = blow * 0.5;
        // The padded ramp is never quite even: each bounce sends the ball a little aside.
        ball.vx = ball.vx * 0.8 + jitter(world) * blow * 0.12;
        ball.vz *= 0.8;
        out.push({ kind: "bounce", strength: Math.min(1, blow / 7) });
      } else {
        ball.vy = 0;
        ball.phase = "roll";
      }
    }
  });
  // Balls knock each other apart, the ones lying in the tray as well: a ball rolling down pushes into them and they move.
  for (let a = 0; a < world.balls.length; a++)
    for (let b = a + 1; b < world.balls.length; b++) {
      const p = world.balls[a],
        q = world.balls[b];
      if (p.phase === "rest" && q.phase === "rest") continue;
      const dx = q.x - p.x,
        dy = q.y - p.y,
        dz = q.z - p.z,
        far = Math.hypot(dx, dy, dz);
      if (far >= BALL * 2 || far < 1e-9) continue;
      const nx = dx / far,
        ny = dy / far,
        nz = dz / far,
        overlap = BALL * 2 - far,
        // On the floor the two stay on it: they are pushed apart along it only.
        floor = p.phase !== "flight" && q.phase !== "flight",
        sp = 0.5,
        sq = 0.5;
      if (floor) {
        const flat = Math.hypot(dx, dz) || 1e-9;
        p.x -= (dx / flat) * overlap * sp;
        p.z -= (dz / flat) * overlap * sp;
        q.x += (dx / flat) * overlap * sq;
        q.z += (dz / flat) * overlap * sq;
        const ux = dx / flat,
          uz = dz / flat,
          meet = (q.vx - p.vx) * ux + (q.vz - p.vz) * uz;
        if (meet < 0) {
          const share = 1.6 * meet;
          p.vx += share * ux * sp;
          p.vz += share * uz * sp;
          q.vx -= share * ux * sq;
          q.vz -= share * uz * sq;
        }
        for (const ball of [p, q]) {
          ball.z = Math.min(TRAY_FRONT, ball.z);
          ball.x = Math.max(-LANE.half + BALL, Math.min(LANE.half - BALL, ball.x));
          ball.y = floorAt(ball.z) + BALL;
          if (ball.phase === "rest" && Math.hypot(ball.vx, ball.vz) > 0.04) ball.phase = "roll";
        }
        continue;
      }
      p.x -= nx * overlap * sp;
      p.y -= ny * overlap * sp;
      p.z -= nz * overlap * sp;
      q.x += nx * overlap * sq;
      q.y += ny * overlap * sq;
      q.z += nz * overlap * sq;
      const closing = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny + (q.vz - p.vz) * nz;
      if (closing >= 0) continue;
      const share = 1.7 * closing;
      p.vx += share * nx * sp;
      p.vy += share * ny * sp;
      p.vz += share * nz * sp;
      q.vx -= share * nx * sq;
      q.vy -= share * ny * sq;
      q.vz -= share * nz * sq;
      // A ball lying on the floor that is struck from the air rolls away on the floor.
      for (const ball of [p, q])
        if (ball.phase !== "flight") {
          ball.vy = 0;
          ball.y = floorAt(ball.z) + BALL;
          if (ball.phase === "rest" && Math.hypot(ball.vx, ball.vz) > 0.04) ball.phase = "roll";
        }
    }
  return out;
}
/** Where a throw of `power` turned by `yaw` from `from` passes, every `gap` seconds for `span` seconds (the aiming dots). */
export function arc(power: number, yaw: number, span: number, gap: number, from: Spot = MIDDLE) {
  const v = launch(power, yaw),
    out: { x: number; y: number; z: number }[] = [];
  for (let t = gap; t <= span + 1e-9; t += gap) out.push({ x: from.x + v.vx * t, y: HAND.y + v.vy * t - (G * t * t) / 2, z: from.z + v.vz * t });
  return out;
}
/** How long a throw of `power` takes to reach the rim's height again. */
export function flightTime(power: number) {
  const v = launch(power, 0),
    rise = HOOP.y - HAND.y;
  return (v.vy + Math.sqrt(Math.max(0, v.vy * v.vy - 2 * G * rise))) / G;
}
