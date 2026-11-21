/**
 * The flight of a tuho arrow, free of Three.js and the DOM, in metres and seconds: the pot stands on the ground
 * (y 0) with its mouth over the origin, the throwing line is `DISTANCE` in front of it (+z), and a throw leaves the
 * hand at `RELEASE` toward −z, turned by `yaw` (positive to the thrower's right, +x) and raised `ELEVATION` above the
 * level, at `speed`.
 *
 * The arrow is followed by its point (where the weight is) in fixed slices of `DT`: gravity pulls it, the air holds
 * it back a little, and its shaft turns after the way it goes as feathers make it (`TURN`), so that it comes down
 * nose first. The point strikes what it meets: the rolled rims of the mouth and the two ears (each a ring, so that a
 * point on the rim's inner half is turned in and on its outer half out), the pot's body and the ears' tubes, and the
 * ground. Passing down through a hole's opening it is in, standing in the mouth or an ear when its shaft is no more
 * than `LEAN_MAX` from upright, else caught leaning against the rim (기댄 살). A point that reaches the ground is a
 * miss, laid where it came down. Everything here is plain arithmetic in a fixed order, so the same throw always
 * comes to the same thing.
 */
export const G = 9.81;
/** From the pot's mouth to the throwing line (m). */
export const DISTANCE = 2.2;
/** Where the hand lets go: a little right of the middle, the arm reaching out over the line, at about the shoulder's height. */
export const RELEASE = { x: 0.13, y: 1.25, z: DISTANCE - 0.3 };
/** How far above the level a throw leaves the hand (rad, about 52°): a lob, so that the arrow can come down into the pot. */
export const ELEVATION = 0.9;
/** The arrow: bamboo, its length and the radius of its point. */
export const ARROW_LENGTH = 0.62,
  ARROW_R = 0.005;
/** The slice the flight is followed in (s), the longest a flight may last, and how quickly the shaft turns after the flight (1/s). */
export const DT = 1 / 800,
  MAX_TIME = 4,
  TURN = 9,
  /** The air's small drag on the arrow (1/s). */
  DRAG = 0.06;
/** The steepest an arrow may lean in a hole and still stand there (rad from upright, about 44°). */
export const LEAN_MAX = 0.77;
/** How a strike gives back speed along the struck face, and how much of the speed across it is kept. */
const RIM_BOUNCE = 0.42,
  BODY_BOUNCE = 0.32,
  GRIP = 0.72;
export type HoleKind = "mouth" | "ear";
/** An opening: its middle (x, z), the height of the rim's top, the opening's radius, the rim's roll (its tube's radius), and how deep an arrow goes in. */
export interface Hole {
  kind: HoleKind;
  x: number;
  z: number;
  top: number;
  inner: number;
  tube: number;
  depth: number;
}
/** The mouth (호) and the two ears (귀), left then right. */
export const HOLES: Hole[] = [
  { kind: "mouth", x: 0, z: 0, top: 0.6, inner: 0.06, tube: 0.008, depth: 0.3 },
  { kind: "ear", x: -0.14, z: 0, top: 0.52, inner: 0.024, tube: 0.006, depth: 0.1 },
  { kind: "ear", x: 0.14, z: 0, top: 0.52, inner: 0.024, tube: 0.006, depth: 0.1 },
];
/** Where the ears' tubes end below (closed), and how far round the pot an arrow lying on the ground must stay. */
export const EAR_BOTTOM = 0.42,
  CLEAR = 0.21;
/**
 * The pot's outside from the ground up, as [height, radius]: a low foot, the round belly, the shoulder, and the
 * long neck up to the rolled rim of the mouth.
 */
export const PROFILE: [number, number][] = [
  [0, 0.13],
  [0.05, 0.13],
  [0.06, 0.1],
  [0.12, 0.15],
  [0.24, 0.175],
  [0.34, 0.15],
  [0.42, 0.085],
  [0.45, 0.068],
  [0.588, 0.068],
];
/** The pot's radius at height `y`, and how fast it widens going up (dr/dy); null above the neck. */
export function potRadius(y: number) {
  if (y < 0 || y > PROFILE[PROFILE.length - 1][0]) return null;
  for (let i = 1; i < PROFILE.length; i++) {
    const [y0, r0] = PROFILE[i - 1],
      [y1, r1] = PROFILE[i];
    if (y <= y1) {
      const slope = (r1 - r0) / (y1 - y0);
      return { r: r0 + slope * (y - y0), slope };
    }
  }
  return null;
}
export interface V3 {
  x: number;
  y: number;
  z: number;
}
export type Outcome = "mouth" | "ear" | "lean" | "miss";
/** A sound or a moment in the flight, for the view: a rim or the pot struck, the arrow going in, the ground. */
export interface Knock {
  t: number;
  kind: "rim" | "pot" | "in" | "ground";
  strength: number;
}
/** Where an arrow ends: its point and the way its shaft runs from the tail to the point. */
export interface Pose {
  tip: V3;
  dir: V3;
}
export interface Flight {
  outcome: Outcome;
  /** The hole it went into or leans in (an index of `HOLES`), or -1. */
  hole: number;
  /** Whether it struck a rim on the way. */
  rimmed: boolean;
  rest: Pose;
  /** How long it flew (s), to where it came to rest. */
  time: number;
  knocks: Knock[];
  /** The point and shaft every `SAMPLE` seconds, from the hand, ending with the rest (only when asked for). */
  path: Pose[];
}
/** How often the path is kept for the view (s). */
export const SAMPLE = 1 / 120;
const norm = (v: V3) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
/** The velocity a throw leaves the hand with. */
export function launch(yaw: number, speed: number): V3 {
  const level = Math.cos(ELEVATION) * speed;
  return { x: Math.sin(yaw) * level, y: Math.sin(ELEVATION) * speed, z: -Math.cos(yaw) * level };
}
/**
 * Follows a throw to its end. `free` follows it through nothing but the air down to the height `free` (for aiming:
 * where it crosses that height on the way down); `record` keeps its path.
 */
export function fly(yaw: number, speed: number, record = false): Flight {
  const p = { ...RELEASE },
    v = launch(yaw, speed);
  let u = norm(v),
    t = 0,
    rimmed = false,
    sampled = 0;
  const knocks: Knock[] = [],
    path: Pose[] = [];
  const keep = () => {
    if (record) path.push({ tip: { ...p }, dir: { ...u } });
  };
  keep();
  const finish = (outcome: Outcome, hole: number, rest: Pose): Flight => {
    if (record) path.push(rest);
    return { outcome, hole, rimmed, rest, time: t, knocks, path };
  };
  while (t < MAX_TIME) {
    const prev = { ...p };
    v.y -= G * DT;
    const keepSpeed = 1 - DRAG * DT;
    v.x *= keepSpeed;
    v.y *= keepSpeed;
    v.z *= keepSpeed;
    p.x += v.x * DT;
    p.y += v.y * DT;
    p.z += v.z * DT;
    t += DT;
    // The feathers turn the shaft after the way it flies.
    const along = norm(v),
      k = Math.min(1, TURN * DT);
    u = norm({ x: u.x + (along.x - u.x) * k, y: u.y + (along.y - u.y) * k, z: u.z + (along.z - u.z) * k });
    // The rims: a point within the rolled ring of a mouth or an ear is thrown back off it.
    let struck = false;
    for (const hole of HOLES) {
      const dx = p.x - hole.x,
        dz = p.z - hole.z,
        rho = Math.hypot(dx, dz),
        ring = hole.inner + hole.tube,
        ay = hole.top - hole.tube,
        across = rho - ring,
        up = p.y - ay,
        d = Math.hypot(across, up),
        reach = hole.tube + ARROW_R;
      if (d >= reach || rho < 1e-9) continue;
      const rx = dx / rho,
        rz = dz / rho,
        n = { x: (across / (d || 1)) * rx, y: up / (d || 1), z: (across / (d || 1)) * rz },
        vn = v.x * n.x + v.y * n.y + v.z * n.z;
      // Out of the ring along its normal.
      const out = reach - d;
      p.x += n.x * out;
      p.y += n.y * out;
      p.z += n.z * out;
      if (vn < 0) {
        const tx = v.x - vn * n.x,
          ty = v.y - vn * n.y,
          tz = v.z - vn * n.z;
        v.x = tx * GRIP - vn * RIM_BOUNCE * n.x;
        v.y = ty * GRIP - vn * RIM_BOUNCE * n.y;
        v.z = tz * GRIP - vn * RIM_BOUNCE * n.z;
        // The point is stopped and thrown up; the shaft behind it pitches over.
        u = norm({ x: u.x + n.x * 0.9, y: u.y + n.y * 0.9, z: u.z + n.z * 0.9 });
        knocks.push({ t, kind: "rim", strength: Math.min(1, -vn / 4) });
        rimmed = true;
      }
      struck = true;
      break;
    }
    if (!struck) {
      // Down through an opening, clear of its rim: in.
      for (let i = 0; i < HOLES.length; i++) {
        const hole = HOLES[i];
        if (!(prev.y > hole.top && p.y <= hole.top)) continue;
        const f = (prev.y - hole.top) / (prev.y - p.y),
          cx = prev.x + (p.x - prev.x) * f - hole.x,
          cz = prev.z + (p.z - prev.z) * f - hole.z;
        if (Math.hypot(cx, cz) > hole.inner - ARROW_R) continue;
        const lean = Math.acos(Math.max(-1, Math.min(1, -u.y))),
          standing = lean <= LEAN_MAX;
        knocks.push({ t, kind: "in", strength: Math.min(1, Math.hypot(v.x, v.y, v.z) / 6) });
        return finish(standing ? hole.kind : "lean", i, inHole(hole, cx, cz, v, standing));
      }
    }
    // The pot's body and neck, and the ears' tubes.
    const rho = Math.hypot(p.x, p.z),
      body = potRadius(p.y);
    if (body && rho < body.r + ARROW_R) {
      const rx = rho > 1e-9 ? p.x / rho : 0,
        rz = rho > 1e-9 ? p.z / rho : 1,
        l = Math.hypot(1, body.slope),
        n = { x: rx / l, y: -body.slope / l, z: rz / l };
      p.x = rx * (body.r + ARROW_R + 1e-4);
      p.z = rz * (body.r + ARROW_R + 1e-4);
      bounce(v, n, BODY_BOUNCE, knocks, t, "pot");
    }
    for (const hole of HOLES) {
      if (hole.kind !== "ear" || p.y < EAR_BOTTOM || p.y > hole.top - hole.tube) continue;
      const dx = p.x - hole.x,
        dz = p.z - hole.z,
        r = Math.hypot(dx, dz),
        outer = hole.inner + hole.tube * 2;
      if (r >= outer + ARROW_R || r < 1e-9) continue;
      const n = { x: dx / r, y: 0, z: dz / r };
      p.x = hole.x + n.x * (outer + ARROW_R + 1e-4);
      p.z = hole.z + n.z * (outer + ARROW_R + 1e-4);
      bounce(v, n, BODY_BOUNCE, knocks, t, "pot");
    }
    // The ground: a miss, laid where it came down.
    if (p.y <= 0) {
      const f = prev.y / (prev.y - p.y || 1),
        at = { x: prev.x + (p.x - prev.x) * f, z: prev.z + (p.z - prev.z) * f };
      knocks.push({ t, kind: "ground", strength: Math.min(1, -v.y / 5) });
      return finish("miss", -1, onGround(at.x, at.z, v, u));
    }
    if (record && t - sampled >= SAMPLE - 1e-9) {
      sampled = t;
      keep();
    }
  }
  // Caught somewhere and never coming down (it cannot, but a flight must end): laid at the foot of the pot.
  return finish("miss", -1, onGround(p.x, p.z, v, u));
}
function bounce(v: V3, n: V3, give: number, knocks: Knock[], t: number, kind: "pot") {
  const vn = v.x * n.x + v.y * n.y + v.z * n.z;
  if (vn >= 0) return;
  const tx = v.x - vn * n.x,
    ty = v.y - vn * n.y,
    tz = v.z - vn * n.z;
  v.x = tx * GRIP - vn * give * n.x;
  v.y = ty * GRIP - vn * give * n.y;
  v.z = tz * GRIP - vn * give * n.z;
  knocks.push({ t, kind, strength: Math.min(1, -vn / 4) });
}
/**
 * How an arrow stands in a hole it went into at (cx, cz) from the hole's middle, going `v`: standing, its point in
 * the beans at the bottom toward the side it was going and its shaft through the opening on the other; leaning,
 * its point against the far wall not far down and its shaft lying over the near rim.
 */
function inHole(hole: Hole, cx: number, cz: number, v: V3, standing: boolean): Pose {
  const hl = Math.hypot(v.x, v.z),
    hx = hl > 1e-6 ? v.x / hl : 0,
    hz = hl > 1e-6 ? v.z / hl : -1;
  if (standing) {
    const reach = hole.inner * 0.55,
      // The point goes on a little past where it came in, but stays inside.
      px = cx + hx * reach * 0.6,
      pz = cz + hz * reach * 0.6,
      pl = Math.hypot(px, pz),
      cap = Math.min(1, reach / (pl || 1)),
      tip = { x: hole.x + px * cap, y: hole.top - hole.depth, z: hole.z + pz * cap },
      through = { x: hole.x - hx * reach * 0.7, y: hole.top, z: hole.z - hz * reach * 0.7 };
    return { tip, dir: norm({ x: tip.x - through.x, y: tip.y - through.y, z: tip.z - through.z }) };
  }
  const tip = { x: hole.x + hx * hole.inner * 0.8, y: hole.top - Math.min(hole.depth, hole.inner * 2), z: hole.z + hz * hole.inner * 0.8 },
    rest = { x: hole.x - hx * (hole.inner + hole.tube), y: hole.top + ARROW_R, z: hole.z - hz * (hole.inner + hole.tube) };
  return { tip, dir: norm({ x: tip.x - rest.x, y: tip.y - rest.y, z: tip.z - rest.z }) };
}
/** An arrow come down at (x, z): it skids on a little and lies along the way it went, clear of the pot. */
function onGround(x: number, z: number, v: V3, u: V3): Pose {
  const hl = Math.hypot(v.x, v.z),
    skid = Math.min(0.12, hl * 0.03);
  let hx = hl > 1e-6 ? v.x / hl : u.x,
    hz = hl > 1e-6 ? v.z / hl : u.z;
  const hn = Math.hypot(hx, hz) || 1;
  hx /= hn;
  hz /= hn;
  let tx = x + hx * skid,
    tz = z + hz * skid;
  // Never inside the pot's foot.
  const rho = Math.hypot(tx, tz);
  if (rho < CLEAR) {
    const rx = rho > 1e-6 ? tx / rho : 0,
      rz = rho > 1e-6 ? tz / rho : 1;
    tx = rx * CLEAR;
    tz = rz * CLEAR;
  }
  // The shaft runs back from the point; turned about the point, a little at a time, until it misses the pot.
  const clear = (ax: number, az: number) => {
    for (let s = 0; s <= 1; s += 0.05) {
      const px = tx - ax * ARROW_LENGTH * s,
        pz = tz - az * ARROW_LENGTH * s;
      if (Math.hypot(px, pz) < CLEAR - 0.01) return false;
    }
    return true;
  };
  let dx = hx,
    dz = hz;
  for (let k = 1; k <= 18 && !clear(dx, dz); k++) {
    const turn = Math.ceil(k / 2) * 0.17 * (k % 2 ? 1 : -1),
      c = Math.cos(turn),
      s = Math.sin(turn);
    dx = hx * c - hz * s;
    dz = hx * s + hz * c;
  }
  return { tip: { x: tx, y: ARROW_R, z: tz }, dir: { x: dx, y: 0, z: dz } };
}
/** Where a throw crosses the height `y` on its way down, through nothing but the air (for aiming); null if it never does. */
export function crossing(yaw: number, speed: number, y: number) {
  const p = { ...RELEASE },
    v = launch(yaw, speed);
  for (let t = 0; t < MAX_TIME; t += DT) {
    const prev = { ...p };
    v.y -= G * DT;
    const keepSpeed = 1 - DRAG * DT;
    v.x *= keepSpeed;
    v.y *= keepSpeed;
    v.z *= keepSpeed;
    p.x += v.x * DT;
    p.y += v.y * DT;
    p.z += v.z * DT;
    if (v.y < 0 && prev.y > y && p.y <= y) {
      const f = (prev.y - y) / (prev.y - p.y);
      return { x: prev.x + (p.x - prev.x) * f, z: prev.z + (p.z - prev.z) * f };
    }
  }
  return null;
}
/**
 * The throw (turn and speed) whose point comes down through the middle of `hole`, found through the air alone: the
 * turn points at it from the hand, and the speed is found by halving until the crossing of the rim's height lies at
 * the hole's distance.
 */
export function aimAt(hole: Hole) {
  const yaw = Math.atan2(hole.x - RELEASE.x, RELEASE.z - hole.z),
    want = Math.hypot(hole.x - RELEASE.x, RELEASE.z - hole.z);
  let lo = 2,
    hi = 9;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2,
      at = crossing(yaw, mid, hole.top),
      far = at ? Math.hypot(at.x - RELEASE.x, RELEASE.z - at.z) : 0;
    if (far < want) lo = mid;
    else hi = mid;
  }
  return { yaw, speed: (lo + hi) / 2 };
}
/** `count` points of a throw's way through the air over its first `until` seconds (for the line shown while it is held). */
export function airPath(yaw: number, speed: number, until: number, count: number): V3[] {
  const p = { ...RELEASE },
    v = launch(yaw, speed),
    out: V3[] = [],
    every = until / count;
  let next = every;
  for (let t = 0; t < until + DT / 2 && out.length < count; t += DT) {
    v.y -= G * DT;
    const keepSpeed = 1 - DRAG * DT;
    v.x *= keepSpeed;
    v.y *= keepSpeed;
    v.z *= keepSpeed;
    p.x += v.x * DT;
    p.y += v.y * DT;
    p.z += v.z * DT;
    if (t + DT >= next) {
      out.push({ ...p });
      next += every;
    }
  }
  return out;
}
