import { HALF_X, HALF_Z, R } from "./sim";

/**
 * The way the dotted line of aim shows while I pull my cue ball: the cue ball's middle runs straight along the aim,
 * turns at a cushion as a mirror turns light, and at another ball leaves along the tangent line (the line at right
 * angles to the one between the two middles at the moment they touch), as a ball struck without spin does; the ball
 * it strikes goes off along the line between the middles. Geometry only: no spin, no slowing, no curve. The cue
 * ball's way is followed until its whole length is `length`, whatever the strength of the pull; a ball struck full
 * stops the cue ball there. Free of Three.js and of the page.
 */
export interface Point {
  x: number;
  z: number;
}
export interface AimPath {
  /** The cue ball's middle: where it starts, every turn, and where the line ends. */
  cue: Point[];
  /** Each ball the cue ball strikes on the way, in order, with the way it is sent (from its middle). */
  struck: { id: number; line: Point[] }[];
}
/** How long the cue ball's line is (about the table's width, 5), and the line of a ball it strikes. */
export const AIM_LENGTH = 5,
  STRUCK_LENGTH = 1.1;
/** Lines the path may have at most (a ball caught in a corner turns many times in a short way). */
const MOST_TURNS = 24;
/** The middle of a ball stays this far inside the cloth's edges: the cushions' faces less its radius. */
const LIMIT_X = HALF_X - R,
  LIMIT_Z = HALF_Z - R;
/** When a middle going from (x, z) along (dx, dz) first reaches a cushion, and which: 0 ±x (a long rail), 1 ±z. */
function toCushion(x: number, z: number, dx: number, dz: number): [number, number] {
  let t = Infinity,
    wall = -1;
  if (dx > 1e-12) [t, wall] = [(LIMIT_X - x) / dx, 0];
  else if (dx < -1e-12) [t, wall] = [(-LIMIT_X - x) / dx, 0];
  if (dz > 1e-12) {
    const u = (LIMIT_Z - z) / dz;
    if (u < t) [t, wall] = [u, 1];
  } else if (dz < -1e-12) {
    const u = (-LIMIT_Z - z) / dz;
    if (u < t) [t, wall] = [u, 1];
  }
  return [Math.max(0, t), wall];
}
/** When a middle going from (x, z) along the unit (dx, dz) comes within two radii of the middle (bx, bz), or null. */
function toBall(x: number, z: number, dx: number, dz: number, bx: number, bz: number) {
  const ox = bx - x,
    oz = bz - z,
    ahead = ox * dx + oz * dz;
  if (ahead <= 0) return null;
  const reach = 4 * R * R,
    gap = ox * ox + oz * oz - reach;
  if (gap <= 0) return 0;
  const disc = ahead * ahead - gap;
  if (disc < 0) return null;
  return ahead - Math.sqrt(disc);
}
/**
 * Follows a ball from its middle `from` along `angle` (radians: 0 is +x, a quarter turn +z) for `length`, past
 * `balls` (none for a ball that only meets cushions).
 */
export function aimPath(from: Point, angle: number, balls: { id: number; x: number; z: number }[] = [], length = AIM_LENGTH, struckLength = STRUCK_LENGTH): AimPath {
  let x = Math.max(-LIMIT_X, Math.min(LIMIT_X, from.x)),
    z = Math.max(-LIMIT_Z, Math.min(LIMIT_Z, from.z)),
    dx = Math.cos(angle),
    dz = Math.sin(angle),
    left = length;
  const cue: Point[] = [{ x, z }],
    struck: AimPath["struck"] = [],
    // A ball once struck has gone from where it lay.
    standing = balls.slice();
  for (let turns = 0; turns < MOST_TURNS && left > 1e-9; turns++) {
    let [t, wall] = toCushion(x, z, dx, dz),
      hit = -1;
    for (let i = 0; i < standing.length; i++) {
      const u = toBall(x, z, dx, dz, standing[i].x, standing[i].z);
      if (u !== null && u < t) [t, hit] = [u, i];
    }
    if (t >= left) {
      cue.push({ x: x + dx * left, z: z + dz * left });
      break;
    }
    x += dx * t;
    z += dz * t;
    left -= t;
    cue.push({ x, z });
    if (hit >= 0) {
      const b = standing[hit],
        nx = (b.x - x) / (2 * R),
        nz = (b.z - z) / (2 * R),
        into = dx * nx + dz * nz;
      standing.splice(hit, 1);
      struck.push({ id: b.id, line: aimPath(b, Math.atan2(nz, nx), [], struckLength, 0).cue });
      // What is left of the way along the line of the middles goes to the struck ball; the rest carries on.
      const tx = dx - into * nx,
        tz = dz - into * nz,
        on = Math.hypot(tx, tz);
      if (on < 1e-6) break;
      dx = tx / on;
      dz = tz / on;
    } else if (wall === 0) dx = -dx;
    else dz = -dz;
  }
  return { cue, struck };
}
/** How long a line is, summed over its pieces. */
export const lengthOf = (line: Point[]) => line.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - line[i - 1].x, p.z - line[i - 1].z) : 0), 0);
/** Points along a line every `spacing`, beginning `start` from its first point: where its dots go. */
export function dotsAlong(line: Point[], spacing: number, start = 0): Point[] {
  const out: Point[] = [];
  let next = start,
    run = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i],
      piece = Math.hypot(b.x - a.x, b.z - a.z);
    while (next <= run + piece + 1e-9 && piece > 0) {
      const f = (next - run) / piece;
      out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
      next += spacing;
    }
    run += piece;
  }
  return out;
}
