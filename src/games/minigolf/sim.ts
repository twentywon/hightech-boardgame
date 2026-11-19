import { boxOf, groundAt, heightAt, wallsOf, type Ground, type Hole, type P } from "./course";

/**
 * A putt on one hole of the course, as a small physics of its own, free of Three.js and the page: the rules run a
 * shot through it to learn where the ball ends, and the view runs the very same steps to show it. Everything moves
 * in fixed slices (`DT`), so the same shot from the same place always ends the same way.
 *
 * - The ball rolls on the ground of the hole, seen from above: gravity takes it down a slope (as a rolling ball, five
 *   sevenths of the pull along the slope), and the carpet slows it by rolling friction, the sand far more.
 * - Rails and the walls of blocks are segments, bumpers are round posts; the ball bounces off them, a little livelier
 *   off the rubber posts.
 * - The windmill's sails turn as a function of time from the shot's start and of the phase the shot was struck at
 *   (`Shot.phase`): while a sail is down it shuts the windmill's door like a rail.
 * - Over the cup the ball is drawn toward its middle and loses speed; it drops in when it is slow enough there (the
 *   nearer the middle, the faster it may be), and a ball too fast runs over the lip and out again.
 * - A ball that rolls into a pond is out of play there; the rules put it back where it was hit.
 */
export const R = 0.024,
  /** Half the thickness of a rail, which stands on its wall line. */
  WALL = 0.03,
  CUP_R = 0.058,
  DT = 1 / 360,
  /** A shot is run for at most this long; a ball still rolling then stops where it is. */
  MAX_TIME = 30;
/** The speeds a putt may be struck at, metres a second. */
export const SPEED_MIN = 0.25,
  SPEED_MAX = 5.2;
const G = 9.81,
  /** A rolling ball takes five sevenths of the pull of gravity along a slope. */
  ROLL = 5 / 7,
  /** Rolling friction on each ground, as a share of gravity. */
  FRICTION: Record<Ground, number> = { green: 0.068, sand: 0.42, bridge: 0.06, water: 0, off: 0 },
  /** How much of its speed into a wall the ball keeps: a wooden rail, a rubber post, a wooden sail. */
  BOUNCE = { rail: 0.7, post: 0.84, blade: 0.45 },
  /** The fastest a ball may roll over the middle of the cup and still drop in. */
  CAPTURE = 1.0,
  /** Over the cup the ball is drawn to its middle and slowed. */
  WELL = 3.6,
  CUP_DAMP = 3,
  /** Slower than this, a ball where the ground does not pull it on is at rest. */
  V_REST = 0.012,
  /** How far either side of straight down a sail shuts the door (radians). */
  BLADE_HALF = 0.24;
export interface Shot {
  /** The direction, radians: 0 straight up the course (toward −z), turning to the right (+x) as it grows. */
  angle: number;
  speed: number;
  /** How far the windmill's sails had turned when it was struck, as a share of the turn from one sail to the next. */
  phase: number;
}
export type Result = "cup" | "water" | "out" | "rest";
/** Something the ball met, for the view to sound: a rail, a post, a sail, the cup, a pond. */
export interface Knock {
  step: number;
  kind: "rail" | "post" | "blade" | "cup" | "water";
  strength: number;
}
export interface World {
  hole: Hole;
  x: number;
  z: number;
  vx: number;
  vz: number;
  steps: number;
  phase: number;
  /** The windmill never shuts (the computer's first look at a shot). */
  open: boolean;
  result: Result | null;
  ground: Ground;
  knocks: Knock[];
}
/** The direction of a yaw along the ground. */
export const along = (yaw: number) => ({ x: Math.sin(yaw), z: -Math.cos(yaw) });
export const yawOf = (dx: number, dz: number) => Math.atan2(dx, -dz);

/** The walls and posts of a hole, filed in a grid of cells so that a step looks only at those near the ball. */
interface Prepared {
  ax: Float64Array;
  az: Float64Array;
  bx: Float64Array;
  bz: Float64Array;
  posts: { x: number; z: number; r: number }[];
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  segs: number[][];
  near: number[][];
}
const CELL = 0.4;
const ready = new WeakMap<Hole, Prepared>();
function prepared(hole: Hole): Prepared {
  const known = ready.get(hole);
  if (known) return known;
  const walls = wallsOf(hole),
    box = boxOf(hole.outline),
    x0 = box.x0 - 0.5,
    z0 = box.z0 - 0.5,
    nx = Math.ceil((box.x1 - x0 + 0.5) / CELL),
    nz = Math.ceil((box.z1 - z0 + 0.5) / CELL),
    segs: number[][] = Array.from({ length: nx * nz }, () => []),
    near: number[][] = Array.from({ length: nx * nz }, () => []),
    reach = R + WALL + 0.05,
    file = (list: number[][], k: number, lx: number, lz: number, hx: number, hz: number) => {
      for (let i = Math.max(0, Math.floor((lx - x0) / CELL)); i <= Math.min(nx - 1, Math.floor((hx - x0) / CELL)); i++)
        for (let j = Math.max(0, Math.floor((lz - z0) / CELL)); j <= Math.min(nz - 1, Math.floor((hz - z0) / CELL)); j++) list[j * nx + i].push(k);
    };
  const out: Prepared = {
    ax: new Float64Array(walls.map((w) => w[0].x)),
    az: new Float64Array(walls.map((w) => w[0].z)),
    bx: new Float64Array(walls.map((w) => w[1].x)),
    bz: new Float64Array(walls.map((w) => w[1].z)),
    posts: hole.posts,
    x0,
    z0,
    nx,
    nz,
    segs,
    near,
  };
  walls.forEach(([a, b], k) => file(segs, k, Math.min(a.x, b.x) - reach, Math.min(a.z, b.z) - reach, Math.max(a.x, b.x) + reach, Math.max(a.z, b.z) + reach));
  hole.posts.forEach((p, k) => file(near, k, p.x - p.r - reach, p.z - p.r - reach, p.x + p.r + reach, p.z + p.r + reach));
  ready.set(hole, out);
  return out;
}
const cellOf = (prep: Prepared, x: number, z: number) => {
  const i = Math.floor((x - prep.x0) / CELL),
    j = Math.floor((z - prep.z0) / CELL);
  return i < 0 || j < 0 || i >= prep.nx || j >= prep.nz ? -1 : j * prep.nx + i;
};
/** The rail the windmill's sails make while one is down: across its door, just before its front. */
export function gateOf(hole: Hole): [P, P] | null {
  const m = hole.windmill;
  return m ? [{ x: m.x - m.door / 2, z: m.z + 0.03 }, { x: m.x + m.door / 2, z: m.z + 0.03 }] : null;
}
/** How far the sails have turned `t` seconds after a shot struck at `phase` (radians; a sail points straight down at 0). */
export function sailAngle(hole: Hole, phase: number, t: number) {
  const m = hole.windmill;
  if (!m) return 0;
  return (2 * Math.PI * (t / m.period + phase / m.blades)) % (2 * Math.PI);
}
/** Whether a sail shuts the windmill's door at that turn. */
export function shut(hole: Hole, angle: number) {
  const m = hole.windmill;
  if (!m) return false;
  const s = (2 * Math.PI) / m.blades,
    d = ((angle % s) + s) % s;
  return Math.min(d, s - d) < BLADE_HALF;
}
export function createWorld(hole: Hole, at: P, shot: Shot, open = false): World {
  const dir = along(shot.angle);
  return { hole, x: at.x, z: at.z, vx: dir.x * shot.speed, vz: dir.z * shot.speed, steps: 0, phase: shot.phase, open, result: null, ground: groundAt(hole, at.x, at.z), knocks: [] };
}
const knock = (w: World, kind: Knock["kind"], strength: number) => {
  if (strength > 0.06) w.knocks.push({ step: w.steps, kind, strength });
};
/** Pushes the ball off a segment it has run into and bounces it; true when it did. */
function bounce(w: World, ax: number, az: number, bx: number, bz: number, reach: number, give: number, kind: Knock["kind"], px: number, pz: number) {
  const ex = bx - ax,
    ez = bz - az,
    len = ex * ex + ez * ez,
    t = len > 0 ? Math.max(0, Math.min(1, ((w.x - ax) * ex + (w.z - az) * ez) / len)) : 0,
    qx = ax + t * ex,
    qz = az + t * ez;
  let dx = w.x - qx,
    dz = w.z - qz,
    d = Math.hypot(dx, dz);
  if (d >= reach) return false;
  if (d < 1e-9) {
    // On the line itself: out toward the side it came from.
    dx = px - qx;
    dz = pz - qz;
    d = Math.hypot(dx, dz) || 1;
  }
  const nx = dx / d,
    nz = dz / d;
  w.x = qx + nx * reach;
  w.z = qz + nz * reach;
  const vn = w.vx * nx + w.vz * nz;
  if (vn < 0) {
    w.vx -= (1 + give) * vn * nx;
    w.vz -= (1 + give) * vn * nz;
    // A little of the speed along the wall is lost to the rub.
    const tn = w.vx * -nz + w.vz * nx,
      rub = 0.04 * tn;
    w.vx -= rub * -nz;
    w.vz -= rub * nx;
    knock(w, kind, -vn);
  }
  return true;
}
/** Moves the ball one slice of time on. */
export function step(w: World) {
  if (w.result) return;
  const hole = w.hole,
    prep = prepared(hole),
    cup = hole.cup,
    e = 0.004,
    hx = (heightAt(hole, w.x + e, w.z) - heightAt(hole, w.x - e, w.z)) / (2 * e),
    hz = (heightAt(hole, w.x, w.z + e) - heightAt(hole, w.x, w.z - e)) / (2 * e),
    norm = Math.sqrt(1 + hx * hx + hz * hz),
    ax = (-G * ROLL * hx) / norm,
    az = (-G * ROLL * hz) / norm,
    mu = FRICTION[w.ground] * G;
  w.vx += ax * DT;
  w.vz += az * DT;
  // Over the cup: drawn to its middle and slowed by the lip.
  let cx = w.x - cup.x,
    cz = w.z - cup.z,
    cd = Math.hypot(cx, cz);
  if (cd < CUP_R && cd > 1e-6) {
    w.vx -= (WELL * cx * DT) / cd;
    w.vz -= (WELL * cz * DT) / cd;
    const damp = 1 - CUP_DAMP * DT;
    w.vx *= damp;
    w.vz *= damp;
  }
  // Rolling friction, never past a standstill.
  let v = Math.hypot(w.vx, w.vz);
  if (v > 0) {
    const kept = Math.max(0, v - mu * DT) / v;
    w.vx *= kept;
    w.vz *= kept;
    v *= kept;
  }
  const px = w.x,
    pz = w.z;
  w.x += w.vx * DT;
  w.z += w.vz * DT;
  // Rails, posts and, while a sail is down, the windmill's door.
  const cell = cellOf(prep, w.x, w.z);
  if (cell >= 0) {
    for (const k of prep.segs[cell]) bounce(w, prep.ax[k], prep.az[k], prep.bx[k], prep.bz[k], R + WALL, BOUNCE.rail, "rail", px, pz);
    for (const k of prep.near[cell]) {
      const p = prep.posts[k],
        dx = w.x - p.x,
        dz = w.z - p.z,
        d = Math.hypot(dx, dz),
        reach = R + p.r;
      if (d >= reach || d < 1e-9) continue;
      const nx = dx / d,
        nz = dz / d;
      w.x = p.x + nx * reach;
      w.z = p.z + nz * reach;
      const vn = w.vx * nx + w.vz * nz;
      if (vn < 0) {
        w.vx -= (1 + BOUNCE.post) * vn * nx;
        w.vz -= (1 + BOUNCE.post) * vn * nz;
        knock(w, "post", -vn);
      }
    }
  }
  const gate = gateOf(hole);
  if (gate && !w.open && shut(hole, sailAngle(hole, w.phase, w.steps * DT)))
    bounce(w, gate[0].x, gate[0].z, gate[1].x, gate[1].z, R + 0.02, BOUNCE.blade, "blade", px, pz);
  w.steps++;
  w.ground = groundAt(hole, w.x, w.z);
  if (w.ground === "water" || w.ground === "off") {
    w.result = w.ground === "water" ? "water" : "out";
    knock(w, "water", Math.max(0.3, v));
    w.vx = w.vz = 0;
    return;
  }
  // Into the cup when slow enough over it: the nearer its middle, the faster it may be.
  cx = w.x - cup.x;
  cz = w.z - cup.z;
  cd = Math.hypot(cx, cz);
  v = Math.hypot(w.vx, w.vz);
  if (cd < CUP_R - 0.4 * R && v < CAPTURE * Math.sqrt(1 - (cd / CUP_R) ** 2)) {
    w.result = "cup";
    knock(w, "cup", Math.max(0.3, v));
    w.x = cup.x;
    w.z = cup.z;
    w.vx = w.vz = 0;
    return;
  }
  // At rest where the ground's pull cannot overcome the carpet; or stopped by the clock.
  const pull = Math.hypot(ax, az),
    hold = FRICTION[w.ground] * G * 0.9;
  if ((v < V_REST && pull < hold) || w.steps * DT >= MAX_TIME) {
    w.result = "rest";
    w.vx = w.vz = 0;
  }
}
export const settled = (w: World) => w.result !== null;
/** Where a shot from `at` ends, and how. */
export function roll(hole: Hole, at: P, shot: Shot, open = false) {
  const w = createWorld(hole, at, shot, open);
  while (!w.result) step(w);
  return { x: w.x, z: w.z, result: w.result, steps: w.steps, knocks: w.knocks };
}

/**
 * How far from the cup each place of a hole is, going round what is in the way (a grid of `FIELD` cells, the way
 * through sand counted twice as long): the computer judges where a putt ends by it, and the view turns the eye to
 * look along the way to go.
 */
export interface Field {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  d: Float32Array;
}
const FIELD = 0.05;
const fields = new WeakMap<Hole, Field>();
/** Whether a ball may stand at a place: on the hole and clear of every wall and post. */
export function free(hole: Hole, x: number, z: number, clear = R + WALL - 0.004) {
  const ground = groundAt(hole, x, z);
  if (ground === "off" || ground === "water") return false;
  const prep = prepared(hole),
    cell = cellOf(prep, x, z);
  if (cell < 0) return false;
  for (const k of prep.segs[cell]) {
    const ex = prep.bx[k] - prep.ax[k],
      ez = prep.bz[k] - prep.az[k],
      t = Math.max(0, Math.min(1, ((x - prep.ax[k]) * ex + (z - prep.az[k]) * ez) / (ex * ex + ez * ez || 1)));
    if (Math.hypot(x - prep.ax[k] - t * ex, z - prep.az[k] - t * ez) < clear) return false;
  }
  for (const k of prep.near[cell]) {
    const p = prep.posts[k];
    if (Math.hypot(x - p.x, z - p.z) < p.r + R) return false;
  }
  return true;
}
export function fieldOf(hole: Hole): Field {
  const known = fields.get(hole);
  if (known) return known;
  const box = boxOf(hole.outline),
    x0 = box.x0,
    z0 = box.z0,
    nx = Math.ceil((box.x1 - x0) / FIELD) + 1,
    nz = Math.ceil((box.z1 - z0) / FIELD) + 1,
    d = new Float32Array(nx * nz).fill(Infinity),
    open = new Uint8Array(nx * nz),
    slow = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * FIELD,
        z = z0 + j * FIELD;
      open[j * nx + i] = free(hole, x, z) ? 1 : 0;
      slow[j * nx + i] = groundAt(hole, x, z) === "sand" ? 1 : 0;
    }
  // Outward from the cup, nearest first (a plain binary heap).
  const heap: number[] = [],
    push = (k: number) => {
      heap.push(k);
      let i = heap.length - 1;
      while (i > 0) {
        const up = (i - 1) >> 1;
        if (d[heap[up]] <= d[heap[i]]) break;
        [heap[up], heap[i]] = [heap[i], heap[up]];
        i = up;
      }
    },
    pop = () => {
      const top = heap[0],
        last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1,
            r = l + 1;
          let m = i;
          if (l < heap.length && d[heap[l]] < d[heap[m]]) m = l;
          if (r < heap.length && d[heap[r]] < d[heap[m]]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
  const ci = Math.round((hole.cup.x - x0) / FIELD),
    cj = Math.round((hole.cup.z - z0) / FIELD),
    start = cj * nx + ci;
  d[start] = 0;
  push(start);
  const done = new Uint8Array(nx * nz);
  while (heap.length) {
    const k = pop();
    if (done[k]) continue;
    done[k] = 1;
    const i = k % nx,
      j = (k - i) / nx;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di,
          b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const n = b * nx + a;
        // Never round a corner through a wall.
        if (!open[n] || (di && dj && (!open[j * nx + a] || !open[b * nx + i]))) continue;
        const cost = FIELD * (di && dj ? Math.SQRT2 : 1) * (slow[n] || slow[k] ? 2 : 1);
        if (d[k] + cost < d[n]) {
          d[n] = d[k] + cost;
          push(n);
        }
      }
  }
  const out = { x0, z0, nx, nz, d };
  fields.set(hole, out);
  return out;
}
/** How far a place is from the cup by the way round (a large number where no way is known). */
export function distanceAt(hole: Hole, x: number, z: number) {
  const f = fieldOf(hole),
    i = Math.round((x - f.x0) / FIELD),
    j = Math.round((z - f.z0) / FIELD);
  let best = Infinity;
  // The nearest cells that have a way, for a ball resting against a rail.
  for (let r = 0; r <= 3 && best === Infinity; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        const a = i + di,
          b = j + dj;
        if (a < 0 || b < 0 || a >= f.nx || b >= f.nz) continue;
        const value = f.d[b * f.nx + a] + Math.hypot(x - (f.x0 + a * FIELD), z - (f.z0 + b * FIELD));
        if (value < best) best = value;
      }
  return best === Infinity ? 99 : best;
}
/** Whether a ball could roll in a straight line from `a` to `b` without meeting anything. */
export function inSight(hole: Hole, a: P, b: P) {
  const length = Math.hypot(b.x - a.x, b.z - a.z),
    n = Math.max(1, Math.ceil(length / 0.03));
  for (let k = 1; k < n; k++) {
    const x = a.x + ((b.x - a.x) * k) / n,
      z = a.z + ((b.z - a.z) * k) / n;
    if (!free(hole, x, z)) return false;
    if (hole.windmill && Math.abs(z - hole.windmill.z) < 0.08 && Math.abs(x - hole.windmill.x) < hole.windmill.door / 2) return false;
  }
  return true;
}
/**
 * The way to look from a place: at the cup when it is in sight, else along the way round toward it, about a metre
 * and a half on.
 */
export function aimYaw(hole: Hole, at: P) {
  const cup = hole.cup;
  if (inSight(hole, at, cup)) return yawOf(cup.x - at.x, cup.z - at.z);
  const f = fieldOf(hole);
  let i = Math.round((at.x - f.x0) / FIELD),
    j = Math.round((at.z - f.z0) / FIELD);
  const value = (a: number, b: number) => (a < 0 || b < 0 || a >= f.nx || b >= f.nz ? Infinity : f.d[b * f.nx + a]);
  for (let k = 0; k < 36; k++) {
    let best = value(i, j),
      next: [number, number] | null = null;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const v = value(i + di, j + dj);
        if (v < best) {
          best = v;
          next = [i + di, j + dj];
        }
      }
    if (!next) break;
    [i, j] = next;
  }
  const x = f.x0 + i * FIELD,
    z = f.z0 + j * FIELD;
  return Math.hypot(x - at.x, z - at.z) < 0.05 ? yawOf(cup.x - at.x, cup.z - at.z) : yawOf(x - at.x, z - at.z);
}
