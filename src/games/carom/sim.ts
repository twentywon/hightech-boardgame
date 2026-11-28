/**
 * Carom billiards balls on a heated cloth: no pockets, four cushions. Each ball
 * slides, rolls and spins: a ball struck above or below its middle follows or
 * draws once it has met another (the cloth turns its spin into way), and a ball
 * with side spin (english) is turned by the rubber of a cushion, wider or
 * narrower. Everything is stepped in fixed slices, and within a slice every
 * contact is found at the moment it happens, so the same shot always ends the
 * same way; the rules and the view run this very code. Free of Three.js and of
 * the page.
 *
 * Table units: the cloth is 10 long and 5 wide (a unit is about 28 cm of a real
 * table); x runs across the table, z along it; 0° points along +x, 90° along +z.
 */
export const HALF_X = 2.5,
  HALF_Z = 5,
  /** The balls are drawn a little larger than true to the table, to be seen on a small screen. */
  R = 0.14;
/** One slice of the clock, and the longest a shot may run. */
export const DT = 1 / 120,
  MAX_SLICES = 120 * 40;
/** Gravity in table units, the cloth's grip on a sliding ball, how fast a rolling ball slows, how fast side spin dies. */
const G = 34.5,
  SLIDE = 0.2,
  ROLL = 0.45,
  SPIN_DECAY = 1.6 / R,
  /** How much way a ball keeps from another ball and from a cushion, the cushion's grip, and how far above a ball's middle its nose strikes. */
  BALL_BOUNCE = 0.94,
  CUSHION_BOUNCE = 0.88,
  CUSHION_GRIP = 0.2,
  NOSE = 0.25 * R,
  NOSE_ACROSS = Math.sqrt(R * R - NOSE * NOSE),
  /** Below this a ball is at rest. */
  REST = 0.012;
/** The moment of a ball's spin about its middle, per unit of mass. */
const INERTIA = 0.4 * R * R;
export interface Ball {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Turn about the level axes (x and z) and about the upright (y, the side spin), in radians a second. */
  wx: number;
  wy: number;
  wz: number;
}
/** Something a ball struck: another ball (`b` its id), or a cushion (`b` −1 − its number: 0 +x, 1 −x, 2 +z, 3 −z); `speed` is how hard. */
export interface Contact {
  slice: number;
  a: number;
  b: number;
  speed: number;
}
export const CUSHION = -1;
export const isCushion = (b: number) => b <= CUSHION;
export const ball = (id: number, x: number, z: number): Ball => ({ id, x, z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0 });
export const copy = (balls: Ball[]) => balls.map((b) => ({ ...b }));
/** How fast the cue ball leaves the tip for a strength of 1–20. */
export const speedOf = (power: number) => 0.8 + power * 0.62;
/** How far from the middle the tip may strike, as a share of the radius (farther, the tip would slip off). */
export const TIP_REACH = 0.5;
/**
 * Strikes a ball along `angle` at `speed`, the tip `side` and `high` (−1 to 1, of `TIP_REACH`) off its middle: right
 * of the middle seen from behind the cue is side spin to the right, above it is top spin, below it back spin.
 */
export function strike(b: Ball, angle: number, speed: number, side = 0, high = 0) {
  const dx = Math.cos(angle),
    dz = Math.sin(angle),
    // To the right of the way the ball goes, seen from behind it.
    rx = -dz,
    rz = dx,
    a = side * TIP_REACH,
    h = high * TIP_REACH,
    // A blow at a·R and h·R off the middle turns the ball by 5/2 · speed · offset / R.
    turn = (2.5 * speed) / R;
  b.vx = dx * speed;
  b.vz = dz * speed;
  b.wy = turn * a;
  b.wx = -turn * h * rx;
  b.wz = -turn * h * rz;
}
/** How fast the point of a ball on the cloth slips over it. */
const slipX = (b: Ball) => b.vx + R * b.wz,
  slipZ = (b: Ball) => b.vz - R * b.wx;
/** Whether a ball still moves over the cloth (a ball only spinning where it lies does not). */
export const going = (b: Ball) => Math.abs(b.vx) + Math.abs(b.vz) > REST || Math.abs(slipX(b)) + Math.abs(slipZ(b)) > REST;
export const moving = (balls: Ball[]) => balls.some(going);
/** The cloth acts on a ball for one slice: a sliding ball is gripped until it rolls, a rolling ball slows, side spin dies away. */
function cloth(b: Ball) {
  const ux = slipX(b),
    uz = slipZ(b),
    slip = Math.sqrt(ux * ux + uz * uz),
    // The slip falls at 7/2 of the grip: the grip both slows the ball and turns it.
    most = 3.5 * SLIDE * G * DT;
  if (slip > 1e-9) {
    const share = Math.min(1, slip / most),
      fx = ux / slip,
      fz = uz / slip,
      dv = SLIDE * G * DT * share,
      dw = ((2.5 * SLIDE * G) / R) * DT * share;
    b.vx -= fx * dv;
    b.vz -= fz * dv;
    b.wx += fz * dw;
    b.wz -= fx * dw;
    if (share < 1) {
      // Rolling from now on: the spin agrees with the way.
      b.wx = b.vz / R;
      b.wz = -b.vx / R;
    }
  } else {
    const speed = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    if (speed > 0) {
      const slowed = Math.max(0, speed - ROLL * DT) / speed;
      b.vx *= slowed;
      b.vz *= slowed;
    }
    b.wx = b.vz / R;
    b.wz = -b.vx / R;
  }
  if (b.wy !== 0) {
    const less = SPIN_DECAY * DT;
    b.wy = Math.abs(b.wy) <= less ? 0 : b.wy - Math.sign(b.wy) * less;
  }
  if (!going(b)) b.vx = b.vz = b.wx = b.wz = 0;
}
/** When two balls first touch within `limit`, or null. */
function meeting(a: Ball, b: Ball, limit: number) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    wx = b.vx - a.vx,
    wz = b.vz - a.vz,
    toward = dx * wx + dz * wz;
  if (toward >= 0) return null;
  const reach = 4 * R * R,
    gap = dx * dx + dz * dz - reach;
  if (gap <= 0) return 0;
  const ww = wx * wx + wz * wz,
    disc = toward * toward - ww * gap;
  if (disc < 0) return null;
  const t = (-toward - Math.sqrt(disc)) / ww;
  return t <= limit ? Math.max(0, t) : null;
}
/** When a ball first reaches a cushion within `limit`, and which (0 +x, 1 −x, 2 +z, 3 −z), or null. */
function reaching(b: Ball, limit: number): [number, number] | null {
  let best: [number, number] | null = null;
  const consider = (t: number, wall: number) => {
    if (t <= limit && (!best || t < best[0])) best = [Math.max(0, t), wall];
  };
  if (b.vx > 0) consider((HALF_X - R - b.x) / b.vx, 0);
  else if (b.vx < 0) consider((-HALF_X + R - b.x) / b.vx, 1);
  if (b.vz > 0) consider((HALF_Z - R - b.z) / b.vz, 2);
  else if (b.vz < 0) consider((-HALF_Z + R - b.z) / b.vz, 3);
  return best;
}
/** Two balls meet: they trade way along the line between their middles; their spins go on as they were. */
function collide(a: Ball, b: Ball) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    d = Math.sqrt(dx * dx + dz * dz) || 1,
    nx = dx / d,
    nz = dz / d,
    closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (closing <= 0) return 0;
  const j = ((1 + BALL_BOUNCE) * closing) / 2;
  a.vx -= j * nx;
  a.vz -= j * nz;
  b.vx += j * nx;
  b.vz += j * nz;
  return closing;
}
/**
 * A ball strikes a cushion. The rubber's nose meets it a little above its middle: the blow sends it back and takes
 * some of its roll away, and the rubber grips the point it touches, so that side spin turns the way it leaves.
 */
function rebound(b: Ball, wall: number) {
  // The cushion's face, pointing back into the table.
  const nx = wall === 0 ? -1 : wall === 1 ? 1 : 0,
    nz = wall === 2 ? -1 : wall === 3 ? 1 : 0,
    into = -(b.vx * nx + b.vz * nz);
  if (wall === 0) b.x = HALF_X - R;
  else if (wall === 1) b.x = -HALF_X + R;
  else if (wall === 2) b.z = HALF_Z - R;
  else b.z = -HALF_Z + R;
  if (into <= 0) return 0;
  // Along the face (t = up × n), and the point touched (−c·n + h·up from the middle).
  const tx = nz,
    tz = -nx,
    jn = (1 + CUSHION_BOUNCE) * into;
  b.vx += jn * nx;
  b.vz += jn * nz;
  // The blow above the middle turns the ball about the face's line.
  const turn = (NOSE * jn) / INERTIA;
  b.wx += turn * tx;
  b.wz += turn * tz;
  // How the touched point slides along the face: the ball's way plus its turn at that point.
  const rx = -NOSE_ACROSS * nx,
    ry = NOSE,
    rz = -NOSE_ACROSS * nz,
    px = b.vx + (b.wy * rz - b.wz * ry),
    pz = b.vz + (b.wx * ry - b.wy * rx),
    slide = px * tx + pz * tz,
    jt = Math.max(-CUSHION_GRIP * jn, Math.min(CUSHION_GRIP * jn, -slide / 3.5));
  b.vx += jt * tx;
  b.vz += jt * tz;
  // The grip's turn: r × t = −c·up − h·n.
  b.wy += (jt / INERTIA) * -NOSE_ACROSS;
  b.wx += (jt / INERTIA) * -NOSE * nx;
  b.wz += (jt / INERTIA) * -NOSE * nz;
  return into;
}
/**
 * Advances every ball by one slice: the cloth acts, then the balls run, meeting each other and the cushions at the
 * moments they do. What they strike is added to `contacts` (slice `n`).
 */
export function step(balls: Ball[], contacts?: Contact[], n = 0) {
  for (const b of balls) cloth(b);
  let left = DT;
  for (let guard = 0; guard < 32 && left > 0; guard++) {
    let first = left,
      pair: [Ball, Ball] | null = null,
      wall: [Ball, number] | null = null;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      const hit = reaching(a, first);
      if (hit && hit[0] <= first) {
        first = hit[0];
        wall = [a, hit[1]];
        pair = null;
      }
      for (let j = i + 1; j < balls.length; j++) {
        const t = meeting(a, balls[j], first);
        if (t !== null && t < first) {
          first = t;
          pair = [a, balls[j]];
          wall = null;
        }
      }
    }
    for (const b of balls) {
      b.x += b.vx * first;
      b.z += b.vz * first;
    }
    left -= first;
    if (pair) {
      const speed = collide(pair[0], pair[1]);
      contacts?.push({ slice: n, a: pair[0].id, b: pair[1].id, speed });
    } else if (wall) {
      const speed = rebound(wall[0], wall[1]);
      contacts?.push({ slice: n, a: wall[0].id, b: CUSHION - wall[1], speed });
    } else break;
  }
}
/** Runs until every ball is at rest; `stop` may end the run early (a search that has learnt enough). */
export function run(balls: Ball[], stop?: (contacts: Contact[], n: number) => boolean) {
  const contacts: Contact[] = [];
  let n = 0;
  while (n < MAX_SLICES && moving(balls)) {
    step(balls, contacts, n);
    n++;
    if (stop?.(contacts, n)) break;
  }
  for (const b of balls) b.vx = b.vz = b.wx = b.wy = b.wz = 0;
  return { contacts, slices: n };
}
