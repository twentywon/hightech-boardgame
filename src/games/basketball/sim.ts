/**
 * The basketball shooting machine, free of Three.js and the page: balls thrown from the tray at the front up a netted
 * lane toward a hoop on a backboard, a rim that knocks them about, a net that slows them, a ramp floor that rolls them
 * back down into the tray, and a hoop that slides from side to side at the harder levels. The view steps it in fixed
 * slices and reports what happens; the rules know only the score and the clock.
 *
 * The player stands at +z and throws toward -z. The lane's floor rises gently toward the back (`floorAt`), so a ball
 * that has come down rolls back to the tray by itself.
 */
export const DT = 1 / 240,
  G = 9.8;
/** A ball's radius, and how many balls the machine holds. */
export const BALL = 0.2,
  BALLS = 5;
/** The rim: its height, how far down the lane, its radius and the thickness of its ring. */
export const HOOP = { y: 2.9, z: -4.45, r: 0.4, tube: 0.028 };
/** The backboard's front face, its half width, its foot and its top (it moves with the hoop). */
export const BOARD = { z: -4.95, half: 1.0, bottom: 2.5, top: 3.8 };
/** The lane between the side nets: its half width, the tray's front, the back wall and the roof net. */
export const LANE = { half: 1.3, front: 1.45, back: -5.25, roof: 4.45 };
/** Where the ready ball lies, how far apart balls wait behind it, and where the hand lets a ball go. */
export const READY = { z: 1.1 },
  HAND = { y: 1.45, z: 1.25 },
  SPACING = BALL * 2 + 0.03;
/** The tray's floor, and where the ramp begins to rise from it. */
const TRAY_Y = 0.5,
  RAMP_FROM = 0.55,
  SLOPE = 0.08;
/** How quickly a ball on the ramp gathers speed toward the tray (a quick return, as on the machines). */
const ROLL = 2.4;
/** The height of the floor at a point down the lane. */
export const floorAt = (z: number) => (z >= RAMP_FROM ? TRAY_Y : TRAY_Y + (RAMP_FROM - z) * SLOPE);
/** The angle a ball leaves the hand at, and how far the shortest and the longest throws carry (to the rim's height). */
export const LAUNCH = (55 * Math.PI) / 180,
  REACH = { short: 3.0, long: 8.0 };
/** The widest a throw may be turned to either side. */
export const MOST_YAW = 0.32;
/** The levels: how far the hoop slides to each side, how long a slide there and back takes, and from what second. */
export const LEVELS = [
  { sway: 0, period: 1, from: 0 },
  { sway: 0.55, period: 5.2, from: 20 },
  { sway: 0.8, period: 3.4, from: 0 },
];
export type Phase = "tray" | "flight" | "roll";
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
  /** The order the balls wait in the tray (indices into `balls`), the ready one first. */
  tray: number[];
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
/** A machine with every ball waiting in the tray. */
export function createWorld(level = 1): World {
  const balls: Ball[] = Array.from({ length: BALLS }, (_, k) => {
    const z = READY.z - k * SPACING;
    return { x: 0, y: floorAt(z) + BALL, z, vx: 0, vy: 0, vz: 0, phase: "tray", scored: false, judged: true, spin: 0 };
  });
  return { level: Math.max(1, Math.min(LEVELS.length, level)), balls, tray: balls.map((_, k) => k), time: 0, tick: 1, started: false, hoopX: 0, since: 9, swish: -9 };
}
/** Where the hoop is at a moment of the round. */
export function hoopAt(level: number, time: number) {
  const { sway, period, from } = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level - 1))];
  if (!sway || time < from) return 0;
  return sway * Math.sin(((time - from) / period) * Math.PI * 2);
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
/** The power and turn that throw a ball from the ready place through the middle of a hoop standing at `x`. */
export function idealThrow(x = 0) {
  const dz = HAND.z - HOOP.z;
  return { power: powerFor(Math.hypot(dz, x)), yaw: Math.atan2(x, dz) };
}
/** The velocity a throw of `power` turned by `yaw` leaves the hand with. */
export function launch(power: number, yaw: number) {
  const speed = speedFor(carryOf(power)),
    turn = Math.max(-MOST_YAW, Math.min(MOST_YAW, yaw)),
    flat = speed * Math.cos(LAUNCH);
  return { vx: flat * Math.sin(turn), vy: speed * Math.sin(LAUNCH), vz: -flat * Math.cos(turn) };
}
/** Whether the ready ball lies in its place and may be thrown. */
export function canShoot(world: World) {
  const k = world.tray[0];
  return k !== undefined && Math.abs(world.balls[k].z - READY.z) < 0.04 && world.since > 0.18;
}
/** Throws the ready ball; false when none is ready. */
export function shoot(world: World, power: number, yaw: number) {
  if (!canShoot(world)) return false;
  const k = world.tray.shift()!,
    ball = world.balls[k],
    v = launch(power, yaw);
  // Picked up and thrown from the hand, over the balls waiting down the lane.
  Object.assign(ball, v, { x: 0, y: HAND.y, z: HAND.z, phase: "flight", scored: false, judged: false, spin: -Math.hypot(v.vy, v.vz) / BALL / 4 });
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
    // A hard rim: most of the blow comes back, and the ball's run along the rim is slowed a little.
    ball.vx -= 1.55 * into * ux;
    ball.vy -= 1.55 * into * uy;
    ball.vz -= 1.55 * into * uz;
    ball.vx *= 0.92;
    ball.vz *= 0.92;
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
  world.hoopX = hoopAt(world.level, world.time);
  world.balls.forEach((ball, k) => {
    if (ball.phase === "tray") {
      // Waiting balls close up toward the front of the tray.
      const slot = READY.z - world.tray.indexOf(k) * SPACING,
        gap = slot - ball.z;
      ball.z += Math.sign(gap) * Math.min(Math.abs(gap), 1.4 * DT);
      ball.x *= 1 - 6 * DT;
      ball.y = floorAt(ball.z) + BALL;
      ball.spin = Math.abs(gap) > 1e-4 ? 1.4 / BALL : 0;
      return;
    }
    if (ball.phase === "roll") {
      // Down the ramp toward the tray, drawn to the middle as it nears it, until it reaches the next free place.
      ball.vz += ROLL * DT;
      ball.vz *= 1 - 0.2 * DT;
      if (ball.z > -1) ball.vx += -ball.x * 5 * DT;
      ball.vx *= 1 - 0.8 * DT;
      ball.x += ball.vx * DT;
      ball.z += ball.vz * DT;
      if (Math.abs(ball.x) > LANE.half - BALL) {
        ball.x = Math.sign(ball.x) * (LANE.half - BALL);
        ball.vx *= -0.4;
      }
      ball.y = floorAt(ball.z) + BALL;
      ball.spin = ball.vz / BALL;
      const place = READY.z - world.tray.length * SPACING;
      if (ball.z >= place) {
        ball.z = place;
        ball.vx = ball.vz = ball.vy = 0;
        ball.phase = "tray";
        world.tray.push(k);
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
    // The net under the rim gathers the ball toward the middle and slows it.
    if (ball.y < HOOP.y && ball.y > HOOP.y - 0.75 && off < HOOP.r) {
      ball.vx += ((world.hoopX - ball.x) * 10 - ball.vx * 9) * DT;
      ball.vz += ((HOOP.z - ball.z) * 10 - ball.vz * 9) * DT;
      ball.vy *= 1 - 2.5 * DT;
    }
    // The backboard (the ball only meets its face), the back wall, the side nets and the roof net.
    const netted = ball.y < HOOP.y && off < HOOP.r + 0.05;
    if (!netted && ball.z - BALL < BOARD.z && ball.vz < 0 && Math.abs(ball.x - world.hoopX) < BOARD.half + BALL * 0.5 && ball.y > BOARD.bottom - BALL * 0.5 && ball.y < BOARD.top + BALL * 0.5 && ball.z > BOARD.z - 0.15) {
      const blow = -ball.vz;
      ball.z = BOARD.z + BALL;
      ball.vz = blow * 0.7;
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
      if (blow > 1.1) {
        ball.vy = blow * 0.55;
        ball.vx *= 0.8;
        ball.vz *= 0.8;
        out.push({ kind: "bounce", strength: Math.min(1, blow / 7) });
      } else {
        ball.vy = 0;
        ball.phase = "roll";
      }
    }
  });
  // Balls in play knock each other apart (the ones waiting in the tray do not give way).
  for (let a = 0; a < world.balls.length; a++)
    for (let b = a + 1; b < world.balls.length; b++) {
      const p = world.balls[a],
        q = world.balls[b];
      if (p.phase === "tray" && q.phase === "tray") continue;
      const dx = q.x - p.x,
        dy = q.y - p.y,
        dz = q.z - p.z,
        far = Math.hypot(dx, dy, dz);
      if (far >= BALL * 2 || far < 1e-9) continue;
      const nx = dx / far,
        ny = dy / far,
        nz = dz / far,
        overlap = BALL * 2 - far,
        fixedP = p.phase === "tray",
        fixedQ = q.phase === "tray";
      const [sp, sq] = fixedP ? [0, 1] : fixedQ ? [1, 0] : [0.5, 0.5];
      p.x -= nx * overlap * sp;
      p.y -= ny * overlap * sp;
      p.z -= nz * overlap * sp;
      q.x += nx * overlap * sq;
      q.y += ny * overlap * sq;
      q.z += nz * overlap * sq;
      const closing = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny + (q.vz - p.vz) * nz;
      if (closing >= 0) continue;
      const share = 1.8 * closing;
      p.vx += share * nx * sp;
      p.vy += share * ny * sp;
      p.vz += share * nz * sp;
      q.vx -= share * nx * sq;
      q.vy -= share * ny * sq;
      q.vz -= share * nz * sq;
    }
  return out;
}
/** Where a throw of `power` turned by `yaw` passes, every `gap` seconds for `span` seconds (the aiming dots). */
export function arc(power: number, yaw: number, span: number, gap: number) {
  const v = launch(power, yaw),
    out: { x: number; y: number; z: number }[] = [];
  for (let t = gap; t <= span + 1e-9; t += gap) out.push({ x: v.vx * t, y: HAND.y + v.vy * t - (G * t * t) / 2, z: HAND.z + v.vz * t });
  return out;
}
/** How long a throw of `power` takes to reach the rim's height again. */
export function flightTime(power: number) {
  const v = launch(power, 0),
    rise = HOOP.y - HAND.y;
  return (v.vy + Math.sqrt(Math.max(0, v.vy * v.vy - 2 * G * rise))) / G;
}
