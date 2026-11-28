/**
 * The flight of a tuho arrow, free of Three.js and the DOM, in metres and seconds: the pot stands on the ground
 * (y 0) with its mouth over the origin, the throwing line is `DISTANCE` in front of it (+z), and a throw leaves the
 * hand at `RELEASE` (where the arrow's point is) toward −z, turned by `yaw` (positive to the thrower's right, +x)
 * and raised `ELEVATION` above the level, at `speed`.
 *
 * The arrow is a rigid body: a bamboo shaft `ARROW_LENGTH` long with a heavy brass point and light feathers, so that
 * its centre of mass lies `BALANCE` behind the point. It is followed in fixed slices of `DT` by its centre of mass,
 * its velocity, its turn (a quaternion carrying the model's +z, the way from the point to the tail) and its angular
 * momentum, with the inertia of a thin rod of that mass (`I_ACROSS`, and `I_ALONG` about its own axis). In the air,
 * gravity pulls it, the air holds it back along its way (`DRAG`), and the feathers, far behind the centre of mass,
 * are pushed by the air across them (`FLETCH`): that weathervanes the shaft into the way it flies, so that it comes
 * down point first, and damps its swinging; they also spin it slowly about itself (`SPIN_PER_METRE`). The hand lets
 * it go pitched `PITCH_DOWN` under its way and spinning `HAND_SPIN`.
 *
 * It strikes what it meets along its whole shaft (a capsule `ARROW_R` thick): the pot, a solid of revolution whose
 * outline in a half plane through its axis (`POT_OUTLINE`) is the foot, the belly, the shoulder and the neck outside
 * and the mouth's wall inside down to the beans, with the rolled rim as a torus; the two ears likewise, each with its
 * own rim; the bridges from the neck to the ears; the ground (the straw runner, or the yard's earth beside it); and
 * the arrows already thrown this round, which stand where they came to rest. Every contact is answered by impulses
 * at the point of contact (sequential impulses: a bounce by the stuffs' `bounce`, friction up to their `grip`), so an
 * arrow can strike the rim and pivot in or out, rattle down inside, lean against the rim, bounce off and skitter on
 * the mat, or knock into arrows standing in the pot. It is followed until it lies still (`STILL`) or `MAX_TIME`.
 *
 * What it came to is judged from where it lies (`judge`): its point inside a hole and its shaft no more than
 * `LEAN_MAX` from upright is in that hole; its point inside but leaning further is caught leaning (기댄 살);
 * anything else is out. Everything is plain arithmetic in a fixed order with no trigonometry in the loop, so the
 * same throw among the same arrows always comes to the same thing.
 */
export const G = 9.81;
/** From the pot's mouth to the throwing line (m). */
export const DISTANCE = 2.2;
/** Where the hand lets go of the point: a little right of the middle, the arm reaching out over the line, at about the shoulder's height. */
export const RELEASE = { x: 0.13, y: 1.25, z: DISTANCE - 0.3 };
/** How far above the level a throw leaves the hand (rad, about 52°): a lob, so that the arrow can come down into the pot. */
export const ELEVATION = 0.9;
/** The arrow: bamboo, its length and the radius it strikes with. */
export const ARROW_LENGTH = 0.62,
  ARROW_R = 0.006;
/** Its weights (kg): the brass point, the bamboo shaft and the feathers, and where the point's and the feathers' weight lie from the point (m). */
export const POINT_MASS = 0.026,
  SHAFT_MASS = 0.016,
  FEATHER_MASS = 0.003,
  POINT_AT = 0.012,
  FEATHERS_AT = ARROW_LENGTH - 0.07;
export const MASS = POINT_MASS + SHAFT_MASS + FEATHER_MASS;
/** The centre of mass, measured from the point back along the shaft (m). */
export const BALANCE = (POINT_MASS * POINT_AT + (SHAFT_MASS * ARROW_LENGTH) / 2 + FEATHER_MASS * FEATHERS_AT) / MASS;
/** The moments of inertia about the centre of mass (kg m²): across the shaft (a thin rod with weights on it), and about its own axis. */
export const I_ACROSS =
    POINT_MASS * (BALANCE - POINT_AT) ** 2 + SHAFT_MASS * (ARROW_LENGTH ** 2 / 12 + (ARROW_LENGTH / 2 - BALANCE) ** 2) + FEATHER_MASS * (FEATHERS_AT - BALANCE) ** 2,
  I_ALONG = 4e-6;
/**
 * The air: drag along the arrow's way (kg/m, force over speed squared), the feathers' push against air across them
 * (kg/m), and the spin the feathers give (rad per metre flown) and how quickly it is reached (1/s).
 */
export const DRAG = 0.0006,
  FLETCH = 0.03,
  SPIN_PER_METRE = 5,
  SPIN_RATE = 4;
/** The hand: how far under its way the arrow is pitched when let go (rad), and how fast it spins about itself (rad/s). */
export const PITCH_DOWN = 0.05,
  HAND_SPIN = 10;
/** The slice the flight is followed in (s), the longest it is followed, and how long it must lie still to have come to rest. */
export const DT = 1 / 1500,
  MAX_TIME = 6,
  STILL = 0.12,
  /** Slower than this (m/s, and rad/s across the shaft) while touching something, it is lying still. */
  STILL_SPEED = 0.04,
  STILL_TURN = 0.8,
  /** Slower than this (m/s, rad/s across) while touching something, it is settling and followed in long slices. */
  SLOW = { speed: 0.3, turn: 4 };
/** The steepest an arrow may lean in a hole and still stand there (rad from upright, about 30°): a hole's own walls hold one on its floor within about 20°, and one resting on others leans a little more. */
export const LEAN_MAX = 0.52;
/** What the arrow strikes: how much of the speed into a face it gets back, and its friction there. */
export interface Stuff {
  bounce: number;
  grip: number;
}
export const BRONZE: Stuff = { bounce: 0.38, grip: 0.3 },
  /** The beans in the mouth's bottom: the point digs in. */
  BEANS: Stuff = { bounce: 0.04, grip: 0.9 },
  /** Bamboo on bamboo, an arrow against another. */
  WOOD: Stuff = { bounce: 0.3, grip: 0.42 },
  /** The straw runner, and the yard's earth beside it. */
  STRAW: Stuff = { bounce: 0.24, grip: 0.55 },
  EARTH: Stuff = { bounce: 0.14, grip: 0.72 };
/** The runner's extent on the ground (m): within it the arrow falls on straw, beyond on earth. */
export const RUNNER = { x: 0.75, near: 2.3, far: -1 };
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
/** Where the ears' tubes end below (closed). */
export const EAR_BOTTOM = 0.42;
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
export interface V3 {
  x: number;
  y: number;
  z: number;
}
/** A turn: the quaternion [x, y, z, w] that carries +z to the way from the point to the tail. */
export type Quat = [number, number, number, number];
export type Outcome = "mouth" | "ear" | "lean" | "miss";
/** What the arrow struck, for the view's sounds: a rim, the pot's bronze outside, the pot inside, the ground, another arrow; and the moment it went in. */
export type KnockKind = "rim" | "pot" | "inside" | "in" | "ground" | "arrow";
export interface Knock {
  t: number;
  kind: KnockKind;
  /** How hard (0 to 1), from the speed into the face. */
  strength: number;
  /** The arrow struck (an index of the arrows passed in), for `arrow`. */
  other?: number;
}
/** Where an arrow is: its point, the way its shaft runs from the tail to the point, and its whole turn. */
export interface Pose {
  tip: V3;
  dir: V3;
  q?: Quat;
}
export interface Flight {
  outcome: Outcome;
  /** The hole it went into or leans in (an index of `HOLES`), or -1. */
  hole: number;
  /** Whether it struck a rim on the way. */
  rimmed: boolean;
  rest: Pose;
  /** How long it moved (s), to where it came to rest. */
  time: number;
  knocks: Knock[];
  /** The pose every `SAMPLE` seconds, from the hand, ending with the rest (only when asked for). */
  path: Pose[];
}
export interface FlyOptions {
  /** Keep the path for the view. */
  record?: boolean;
  /** The arrows already thrown this round, where they lie; they stand in the way. */
  others?: Pose[];
  /**
   * Stop as soon as the outcome is sure (for weighing throws): the point down below every hole's floor outside the
   * pot, or so deep in a hole that its walls hold the shaft upright. The rest is then where it was at that moment.
   */
  quick?: boolean;
}
/** How often the path is kept for the view (s). */
export const SAMPLE = 1 / 120;

/* ---------- Small vector arithmetic, kept in plain numbers. ---------- */
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a: V3) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
const unit = (a: V3): V3 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
/** The turn that carries +z onto `t` by the shortest way. */
function turnTo(t: V3): Quat {
  const d = t.z;
  if (d < -0.999999) return [1, 0, 0, 0];
  const q: Quat = [-t.y, t.x, 0, 1 + d],
    l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[3] * q[3]);
  return [q[0] / l, q[1] / l, 0, q[3] / l];
}

/* ---------- The pot: solids of revolution described in a half plane (ρ out from the axis, y up). ---------- */
interface Edge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Its extent, so that an edge farther than the nearest found so far is passed over. */
  r0: number;
  r1: number;
  y0: number;
  y1: number;
  kind: KnockKind;
  stuff: Stuff;
  /** An edge along the axis closes the outline but is no surface. */
  real: boolean;
}
interface Rim {
  r: number;
  y: number;
  tube: number;
}
interface Solid {
  x: number;
  z: number;
  edges: Edge[];
  rims: Rim[];
  /** Its extent: the widest radius, the lowest and highest heights. */
  reach: number;
  low: number;
  high: number;
}
/** The outline of a solid as a closed list of points [ρ, y] with each edge's kind and stuff (the edge from a point to the next). */
function solid(x: number, z: number, outline: [number, number, KnockKind | null, Stuff][], rims: Rim[]): Solid {
  const edges: Edge[] = outline.map(([ax, ay, kind, stuff], i) => {
    const [bx, by] = outline[(i + 1) % outline.length];
    return { ax, ay, bx, by, r0: Math.min(ax, bx), r1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by), kind: kind ?? "pot", stuff, real: kind !== null };
  });
  const rs = outline.map((p) => p[0]).concat(rims.map((r) => r.r + r.tube)),
    ys = outline.map((p) => p[1]).concat(rims.map((r) => r.y + r.tube));
  return { x, z, edges, rims, reach: Math.max(...rs), low: Math.min(...ys), high: Math.max(...ys) };
}
const mouth = HOLES[0];
/** The pot's half outline: up the axis under the beans, out along the bottom, up the outside to the rim, down the mouth's wall to the beans. */
export const POT_OUTLINE: [number, number][] = [[0, 0], ...PROFILE.map(([y, r]) => [r, y] as [number, number]), [PROFILE[PROFILE.length - 1][1], mouth.top - mouth.tube], [mouth.inner, mouth.top - mouth.tube], [mouth.inner, mouth.top - mouth.depth], [0, mouth.top - mouth.depth]];
const POT = solid(
  0,
  0,
  POT_OUTLINE.map(([r, y], i): [number, number, KnockKind | null, Stuff] => {
    const n = POT_OUTLINE.length;
    // The bottom on the ground and the axis close the outline; the mouth's wall is "inside"; the last real edge is the beans.
    if (i === 0) return [r, y, null, BRONZE];
    if (i === n - 1) return [r, y, null, BRONZE];
    if (i === n - 2) return [r, y, "inside", BEANS];
    if (i === n - 3) return [r, y, "inside", BRONZE];
    return [r, y, "pot", BRONZE];
  }),
  [{ r: mouth.inner + mouth.tube, y: mouth.top - mouth.tube, tube: mouth.tube }],
);
/** An ear: a closed tube on a round end, its wall inside, its bottom, and its rim. */
const EARS = HOLES.filter((h) => h.kind === "ear").map((hole) => {
  const outer = hole.inner + hole.tube * 2,
    foot = outer * 0.9,
    floor = hole.top - hole.depth,
    outline: [number, number, KnockKind | null, Stuff][] = [[0, EAR_BOTTOM - foot, "pot", BRONZE]];
  for (const k of [1, 2]) {
    const a = (k * Math.PI) / 6;
    outline.push([foot * Math.sin(a), EAR_BOTTOM - foot * Math.cos(a), "pot", BRONZE]);
  }
  outline.push([foot, EAR_BOTTOM, "pot", BRONZE], [outer, hole.top - hole.tube, "pot", BRONZE], [hole.inner, hole.top - hole.tube, "inside", BRONZE], [hole.inner, floor, "inside", { bounce: 0.12, grip: 0.6 }], [0, floor, null, BRONZE]);
  return solid(hole.x, hole.z, outline, [{ r: hole.inner + hole.tube, y: hole.top - hole.tube, tube: hole.tube }]);
});
const SOLIDS = [POT, ...EARS];
/** The bridges from the neck to the ears: short bronze bars (as capsules: from, to, radius). */
const BRIDGES = HOLES.filter((h) => h.kind === "ear").map((hole) => {
  const side = Math.sign(hole.x),
    to = Math.abs(hole.x) - hole.inner - hole.tube * 2 + 0.004;
  return { a: { x: side * 0.064, y: 0.47, z: 0 }, b: { x: side * to, y: 0.47, z: 0 }, r: 0.014 };
});
interface Near {
  d: number;
  /** The way out of the solid at the nearest point, in the half plane. */
  nr: number;
  ny: number;
  kind: KnockKind;
  stuff: Stuff;
}
/** The signed distance from (ρ, y) to a solid (negative inside), with the way out and what is there. */
function nearest(s: Solid, r: number, y: number): Near {
  let best = Infinity,
    nr = 0,
    ny = 1,
    kind: KnockKind = "pot",
    stuff = BRONZE,
    inside = false;
  for (const e of s.edges) {
    // Inside, by a ray outward along ρ.
    if (e.ay > y !== e.by > y && r < e.ax + ((y - e.ay) * (e.bx - e.ax)) / (e.by - e.ay)) inside = !inside;
    if (!e.real) continue;
    const ex = e.bx - e.ax,
      ey = e.by - e.ay,
      l2 = ex * ex + ey * ey,
      f = l2 > 0 ? Math.max(0, Math.min(1, ((r - e.ax) * ex + (y - e.ay) * ey) / l2)) : 0,
      dx = r - (e.ax + ex * f),
      dy = y - (e.ay + ey * f),
      d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) {
      best = d;
      if (d > 1e-12) {
        nr = dx / d;
        ny = dy / d;
      } else {
        // On the edge itself: the edge's own normal (the outline runs round with the solid on its left).
        const el = Math.sqrt(l2) || 1;
        nr = ey / el;
        ny = -ex / el;
      }
      kind = e.kind;
      stuff = e.stuff;
    }
  }
  if (inside) {
    best = -best;
    nr = -nr;
    ny = -ny;
  }
  for (const rim of s.rims) {
    const dx = r - rim.r,
      dy = y - rim.y,
      l = Math.sqrt(dx * dx + dy * dy),
      d = l - rim.tube;
    if (d < best) {
      best = d;
      nr = l > 1e-12 ? dx / l : 0;
      ny = l > 1e-12 ? dy / l : 1;
      kind = "rim";
      stuff = BRONZE;
    }
  }
  return { d: best, nr, ny, kind, stuff };
}
/** The signed distance alone, as `nearest` gives it, without making anything (it is asked for many times a slice). */
function gap(s: Solid, r: number, y: number) {
  let best = Infinity,
    inside = false;
  const edges = s.edges;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (e.ay > y !== e.by > y && r < e.ax + ((y - e.ay) * (e.bx - e.ax)) / (e.by - e.ay)) inside = !inside;
    if (!e.real) continue;
    const or = r < e.r0 ? e.r0 - r : r > e.r1 ? r - e.r1 : 0,
      oy = y < e.y0 ? e.y0 - y : y > e.y1 ? y - e.y1 : 0;
    if (or * or + oy * oy >= best) continue;
    const ex = e.bx - e.ax,
      ey = e.by - e.ay,
      l2 = ex * ex + ey * ey,
      f = l2 > 0 ? Math.max(0, Math.min(1, ((r - e.ax) * ex + (y - e.ay) * ey) / l2)) : 0,
      dx = r - (e.ax + ex * f),
      dy = y - (e.ay + ey * f),
      d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
  }
  best = Math.sqrt(best);
  if (inside) best = -best;
  for (let i = 0; i < s.rims.length; i++) {
    const rim = s.rims[i],
      dx = r - rim.r,
      dy = y - rim.y,
      d = Math.sqrt(dx * dx + dy * dy) - rim.tube;
    if (d < best) best = d;
  }
  return best;
}
/** A place where the arrow touches something: the point on the arrow, the way out of what it touches, how deep, and what it is. */
interface Contact {
  p: V3;
  n: V3;
  depth: number;
  stuff: Stuff;
  kind: KnockKind;
  other: number;
}
/** The arrow's shaft at a moment: its point, the way from the point to the tail, and so any place `s` along it. */
interface Shaft {
  tip: V3;
  back: V3;
}
const along = (shaft: Shaft, s: number): V3 => ({ x: shaft.tip.x + shaft.back.x * s, y: shaft.tip.y + shaft.back.y * s, z: shaft.tip.z + shaft.back.z * s });
/** How finely the shaft is searched for a touch against the pot (m), and the golden section that narrows a near place. */
const PROBE = 0.014,
  GOLD = 0.381966;
/** Room for the probes along the shaft. */
const MARCH = Math.ceil(ARROW_LENGTH / PROBE) + 4,
  MARCH_S = new Float64Array(MARCH),
  MARCH_D = new Float64Array(MARCH);
/** The shaft's touches against a solid: the shaft clipped to the solid's box, searched along for the places nearest it. */
function touchSolid(shaft: Shaft, s: Solid, out: Contact[]) {
  const pad = ARROW_R + 0.002;
  // Clip the shaft to the solid's box, slab by slab.
  let s0 = 0,
    s1 = ARROW_LENGTH;
  const slab = (p: number, d: number, lo: number, hi: number) => {
    if (Math.abs(d) < 1e-12) return p >= lo && p <= hi;
    let a = (lo - p) / d,
      b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    s0 = Math.max(s0, a);
    s1 = Math.min(s1, b);
    return s0 <= s1;
  };
  if (
    !slab(shaft.tip.x, shaft.back.x, s.x - s.reach - pad, s.x + s.reach + pad) ||
    !slab(shaft.tip.z, shaft.back.z, s.z - s.reach - pad, s.z + s.reach + pad) ||
    !slab(shaft.tip.y, shaft.back.y, s.low - pad, s.high + pad)
  )
    return;
  const tx = shaft.tip.x - s.x,
    ty = shaft.tip.y,
    tz = shaft.tip.z - s.z,
    bx = shaft.back.x,
    by = shaft.back.y,
    bz = shaft.back.z;
  const at = (q: number) => {
    const dx = tx + bx * q,
      dz = tz + bz * q;
    return gap(s, Math.sqrt(dx * dx + dz * dz), ty + by * q);
  };
  // March along the shaft: where it is far from the solid, step by how far it is (nothing nearer can lie within
  // that), and near it probe every `PROBE`; then narrow each nearest place among the probes.
  const ss = MARCH_S,
    ds = MARCH_D;
  let count = -1;
  for (let q = s0; count < MARCH - 1; ) {
    const d = at(q);
    ss[++count] = q;
    ds[count] = d;
    if (q >= s1) break;
    q = Math.min(s1, q + Math.max(PROBE, d - ARROW_R - PROBE / 2));
  }
  let last = -Infinity;
  for (let i = 0; i <= count; i++) {
    const d = ds[i];
    if (d > ARROW_R + PROBE / 2) continue;
    if ((i > 0 && ds[i - 1] < d) || (i < count && ds[i + 1] < d)) continue;
    const here = ss[i];
    if (here - last < 0.05) continue;
    // Narrow the nearest place between the neighbouring probes.
    let a = i > 0 ? ss[i - 1] : here,
      b = i < count ? ss[i + 1] : here;
    let c = b - GOLD * (b - a),
      e = a + GOLD * (b - a),
      fc = at(c),
      fe = at(e);
    for (let k = 0; k < 5; k++) {
      if (fc < fe) {
        b = e;
        e = c;
        fe = fc;
        c = b - GOLD * (b - a);
        fc = at(c);
      } else {
        a = c;
        c = e;
        fc = fe;
        e = a + GOLD * (b - a);
        fe = at(e);
      }
    }
    let q = fc < fe ? c : e;
    if (d <= Math.min(fc, fe)) q = here;
    const p = along(shaft, q),
      dx = p.x - s.x,
      dz = p.z - s.z,
      r = Math.sqrt(dx * dx + dz * dz),
      near = nearest(s, r, p.y);
    if (near.d >= ARROW_R) continue;
    const rx = r > 1e-9 ? dx / r : 0,
      rz = r > 1e-9 ? dz / r : 1,
      n = { x: near.nr * rx, y: near.ny, z: near.nr * rz };
    out.push({ p: { x: p.x - n.x * ARROW_R, y: p.y - n.y * ARROW_R, z: p.z - n.z * ARROW_R }, n, depth: ARROW_R - near.d, stuff: near.stuff, kind: near.kind, other: -1 });
    last = q;
  }
}
/** The nearest points of two segments (a0 + u·s, b0 + v·t with s in [0, la], t in [0, lb], u and v unit). */
function closest(a0: V3, u: V3, la: number, b0: V3, v: V3, lb: number) {
  const w = { x: a0.x - b0.x, y: a0.y - b0.y, z: a0.z - b0.z },
    b = dot(u, v),
    d = dot(u, w),
    e = dot(v, w),
    den = 1 - b * b;
  let s = den > 1e-9 ? (b * e - d) / den : 0;
  s = Math.max(0, Math.min(la, s));
  let t = b * s + e;
  if (t < 0 || t > lb) {
    t = Math.max(0, Math.min(lb, t));
    s = Math.max(0, Math.min(la, b * t - d));
  }
  return { s, t };
}
/** A touch between the shaft and a capsule (another arrow or a bridge). */
function touchCapsule(shaft: Shaft, b0: V3, v: V3, lb: number, rb: number, stuff: Stuff, kind: KnockKind, other: number, out: Contact[]) {
  const { s, t } = closest(shaft.tip, shaft.back, ARROW_LENGTH, b0, v, lb),
    p = along(shaft, s),
    q = { x: b0.x + v.x * t, y: b0.y + v.y * t, z: b0.z + v.z * t },
    gap = { x: p.x - q.x, y: p.y - q.y, z: p.z - q.z },
    d = len(gap),
    reach = ARROW_R + rb;
  if (d >= reach) return;
  let n = d > 1e-9 ? { x: gap.x / d, y: gap.y / d, z: gap.z / d } : unit(cross(shaft.back, v));
  if (len(n) < 0.5) n = { x: 0, y: 1, z: 0 };
  out.push({ p: { x: p.x - n.x * ARROW_R, y: p.y - n.y * ARROW_R, z: p.z - n.z * ARROW_R }, n, depth: reach - d, stuff, kind, other });
}
/** The arrows thrown before, as capsules from their tails. */
interface Standing {
  tail: V3;
  dir: V3;
  low: V3;
  high: V3;
}
function standing(others: Pose[]): Standing[] {
  return others.map(({ tip, dir }) => {
    const tail = { x: tip.x - dir.x * ARROW_LENGTH, y: tip.y - dir.y * ARROW_LENGTH, z: tip.z - dir.z * ARROW_LENGTH };
    return {
      tail,
      dir,
      low: { x: Math.min(tip.x, tail.x), y: Math.min(tip.y, tail.y), z: Math.min(tip.z, tail.z) },
      high: { x: Math.max(tip.x, tail.x), y: Math.max(tip.y, tail.y), z: Math.max(tip.z, tail.z) },
    };
  });
}
const groundStuff = (x: number, z: number) => (Math.abs(x) < RUNNER.x && z > RUNNER.far && z < RUNNER.near ? STRAW : EARTH);
/** Everything the shaft touches now. */
function touches(shaft: Shaft, others: Standing[], out: Contact[]) {
  out.length = 0;
  const tail = along(shaft, ARROW_LENGTH),
    lo = { x: Math.min(shaft.tip.x, tail.x), y: Math.min(shaft.tip.y, tail.y), z: Math.min(shaft.tip.z, tail.z) },
    hi = { x: Math.max(shaft.tip.x, tail.x), y: Math.max(shaft.tip.y, tail.y), z: Math.max(shaft.tip.z, tail.z) };
  // The ground, under either end.
  for (const [p, s] of [[shaft.tip, 0], [tail, ARROW_LENGTH]] as const)
    if (p.y < ARROW_R) out.push({ p: { x: p.x, y: p.y - ARROW_R, z: p.z }, n: { x: 0, y: 1, z: 0 }, depth: ARROW_R - p.y, stuff: groundStuff(p.x, p.z), kind: "ground", other: s ? -2 : -1 });
  // The pot and its ears, only when the shaft comes near them.
  if (lo.y < 0.62 && lo.x < 0.2 && hi.x > -0.2 && lo.z < 0.2 && hi.z > -0.2) {
    for (const s of SOLIDS) touchSolid(shaft, s, out);
    for (const b of BRIDGES) {
      const v = { x: b.b.x - b.a.x, y: 0, z: 0 },
        l = Math.abs(v.x);
      touchCapsule(shaft, b.a, { x: Math.sign(v.x), y: 0, z: 0 }, l, b.r, BRONZE, "pot", -1, out);
    }
  }
  const pad = ARROW_R * 2 + 0.002;
  others.forEach((o, i) => {
    if (o.low.x > hi.x + pad || o.high.x < lo.x - pad || o.low.y > hi.y + pad || o.high.y < lo.y - pad || o.low.z > hi.z + pad || o.high.z < lo.z - pad) return;
    touchCapsule(shaft, o.tail, o.dir, ARROW_LENGTH, ARROW_R, WOOD, "arrow", i, out);
  });
}

const NONE: Standing[] = [];
/** Far from everything the flight is followed in longer slices (s), until the shaft comes within `FAR_GAP` (m) of anything it may strike. */
const FAR_DT = 1 / 500,
  FAR_GAP = 0.06;
/** The slice to follow the arrow in now: long while nothing is near, short near anything. */
function sliceFor(shaft: Shaft, others: Standing[]) {
  const tail = along(shaft, ARROW_LENGTH),
    lo = { x: Math.min(shaft.tip.x, tail.x), y: Math.min(shaft.tip.y, tail.y), z: Math.min(shaft.tip.z, tail.z) },
    hi = { x: Math.max(shaft.tip.x, tail.x), y: Math.max(shaft.tip.y, tail.y), z: Math.max(shaft.tip.z, tail.z) },
    g = FAR_GAP;
  if (lo.y < g + ARROW_R) return DT;
  if (lo.y < 0.62 + g && lo.x < 0.2 + g && hi.x > -0.2 - g && lo.z < 0.2 + g && hi.z > -0.2 - g) return DT;
  for (const o of others) if (o.low.x < hi.x + g && o.high.x > lo.x - g && o.low.y < hi.y + g && o.high.y > lo.y - g && o.low.z < hi.z + g && o.high.z > lo.z - g) return DT;
  return FAR_DT;
}

/* ---------- The arrow as a body. ---------- */
interface Body {
  /** Centre of mass, velocity, turn, angular momentum, and the axis forward (kept after the turn). */
  c: V3;
  v: V3;
  q: Quat;
  L: V3;
  a: V3;
}
/** The inverse inertia applied to `x`, for an arrow whose axis is `a`. */
function spinOf(a: V3, x: V3): V3 {
  const k = dot(a, x) * (1 / I_ALONG - 1 / I_ACROSS);
  return { x: x.x / I_ACROSS + a.x * k, y: x.y / I_ACROSS + a.y * k, z: x.z / I_ACROSS + a.z * k };
}
function shaftOf(b: Body): Shaft {
  const a = b.a;
  return { tip: { x: b.c.x + a.x * BALANCE, y: b.c.y + a.y * BALANCE, z: b.c.z + a.z * BALANCE }, back: { x: -a.x, y: -a.y, z: -a.z } };
}
const poseOf = (b: Body): Pose => {
  const s = shaftOf(b);
  return { tip: { ...s.tip }, dir: { x: -s.back.x, y: -s.back.y, z: -s.back.z }, q: [...b.q] as Quat };
};
/** The velocity a throw leaves the hand with. */
export function launch(yaw: number, speed: number): V3 {
  const level = Math.cos(ELEVATION) * speed;
  return { x: Math.sin(yaw) * level, y: Math.sin(ELEVATION) * speed, z: -Math.cos(yaw) * level };
}
/** The arrow as the hand lets it go: its point at `RELEASE`, pitched a little under its way, spinning slowly about itself. */
function thrown(yaw: number, speed: number): Body {
  const pitch = ELEVATION - PITCH_DOWN,
    a = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) },
    q = turnTo({ x: -a.x, y: -a.y, z: -a.z });
  return {
    c: { x: RELEASE.x - a.x * BALANCE, y: RELEASE.y - a.y * BALANCE, z: RELEASE.z - a.z * BALANCE },
    v: launch(yaw, speed),
    q,
    L: { x: a.x * I_ALONG * HAND_SPIN, y: a.y * I_ALONG * HAND_SPIN, z: a.z * I_ALONG * HAND_SPIN },
    a: { ...a },
  };
}
/** From the centre of mass back to the feathers (m). */
const ARM = FEATHERS_AT - BALANCE;
/** One slice in the air: gravity, drag, the feathers' push and their spin (only the velocities change). */
function airStep(b: Body, dt: number) {
  const a = b.a,
    v = b.v,
    L = b.L,
    k = (a.x * L.x + a.y * L.y + a.z * L.z) * (1 / I_ALONG - 1 / I_ACROSS),
    wx = L.x / I_ACROSS + a.x * k,
    wy = L.y / I_ACROSS + a.y * k,
    wz = L.z / I_ACROSS + a.z * k,
    // The feathers, `ARM` behind the centre of mass, and the air across them.
    rx = -a.x * ARM,
    ry = -a.y * ARM,
    rz = -a.z * ARM,
    fx = v.x + wy * rz - wz * ry,
    fy = v.y + wz * rx - wx * rz,
    fz = v.z + wx * ry - wy * rx,
    fa = fx * a.x + fy * a.y + fz * a.z,
    sf = Math.sqrt(fx * fx + fy * fy + fz * fz),
    px = -FLETCH * sf * (fx - a.x * fa),
    py = -FLETCH * sf * (fy - a.y * fa),
    pz = -FLETCH * sf * (fz - a.z * fa),
    sv = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z),
    spin = ((v.x * a.x + v.y * a.y + v.z * a.z) * SPIN_PER_METRE - (wx * a.x + wy * a.y + wz * a.z)) * I_ALONG * SPIN_RATE;
  v.x += ((px - DRAG * sv * v.x) / MASS) * dt;
  v.y += ((py - DRAG * sv * v.y) / MASS - G) * dt;
  v.z += ((pz - DRAG * sv * v.z) / MASS) * dt;
  L.x += (ry * pz - rz * py + a.x * spin) * dt;
  L.y += (rz * px - rx * pz + a.y * spin) * dt;
  L.z += (rx * py - ry * px + a.z * spin) * dt;
}
/** Moves the body on by its velocity and turns it by its angular velocity. */
function drift(b: Body, dt: number) {
  b.c.x += b.v.x * dt;
  b.c.y += b.v.y * dt;
  b.c.z += b.v.z * dt;
  const a = b.a,
    L = b.L,
    k = (a.x * L.x + a.y * L.y + a.z * L.z) * (1 / I_ALONG - 1 / I_ACROSS),
    wx = L.x / I_ACROSS + a.x * k,
    wy = L.y / I_ACROSS + a.y * k,
    wz = L.z / I_ACROSS + a.z * k,
    q = b.q,
    x = q[0],
    y = q[1],
    z = q[2],
    s = q[3],
    h = dt / 2,
    // q += ½ (w, 0) ⊗ q dt
    nx = x + h * (s * wx + wy * z - wz * y),
    ny = y + h * (s * wy + wz * x - wx * z),
    nz = z + h * (s * wz + wx * y - wy * x),
    ns = s - h * (wx * x + wy * y + wz * z),
    l = Math.sqrt(nx * nx + ny * ny + nz * nz + ns * ns);
  q[0] = nx / l;
  q[1] = ny / l;
  q[2] = nz / l;
  q[3] = ns / l;
  aim(b);
}
/** Keeps the body's axis (from the tail to the point) after its turn. */
function aim(b: Body) {
  const [x, y, z, w] = b.q;
  b.a.x = -2 * (x * z + w * y);
  b.a.y = -2 * (y * z - w * x);
  b.a.z = -(1 - 2 * (x * x + y * y));
}
/** Below this speed into a face nothing bounces (m/s); how much of a touch's depth is put right each slice; the depth let be. */
const REST_SPEED = 0.12,
  PUSH = 0.5,
  SLOP = 0.0004,
  ROUNDS = 10;
/** Room for the solver's numbers, touch by touch (made once: the solver runs every slice). */
const MOST = 48,
  RX = new Float64Array(MOST),
  RY = new Float64Array(MOST),
  RZ = new Float64Array(MOST),
  KN = new Float64Array(MOST),
  AIM = new Float64Array(MOST),
  JN = new Float64Array(MOST),
  TX = new Float64Array(MOST),
  TY = new Float64Array(MOST),
  TZ = new Float64Array(MOST),
  HIT = new Float64Array(MOST);
/**
 * Answers the touches with impulses at their points (sequential impulses: each touch in turn, `ROUNDS` times, its
 * push never pulling and its friction never more than its grip times its push), then moves the arrow a share of the
 * way out of what it has sunk into. Leaves in `HIT` the speed into the face each touch was struck with.
 */
function resolve(b: Body, contacts: Contact[]) {
  const a = b.a,
    v = b.v,
    L = b.L,
    n = Math.min(MOST, contacts.length),
    across = 1 / I_ACROSS,
    extra = 1 / I_ALONG - across;
  let wx = 0,
    wy = 0,
    wz = 0;
  const spin = () => {
    const k = (a.x * L.x + a.y * L.y + a.z * L.z) * extra;
    wx = L.x * across + a.x * k;
    wy = L.y * across + a.y * k;
    wz = L.z * across + a.z * k;
  };
  /** 1/m + (r × u)·I⁻¹(r × u): how hard it is to move the point at r along u. */
  const stiffness = (rx: number, ry: number, rz: number, ux: number, uy: number, uz: number) => {
    const cx = ry * uz - rz * uy,
      cy = rz * ux - rx * uz,
      cz = rx * uy - ry * ux,
      k = (a.x * cx + a.y * cy + a.z * cz) * extra;
    return 1 / MASS + cx * (cx * across + a.x * k) + cy * (cy * across + a.y * k) + cz * (cz * across + a.z * k);
  };
  const push = (i: number, jx: number, jy: number, jz: number) => {
    v.x += jx / MASS;
    v.y += jy / MASS;
    v.z += jz / MASS;
    L.x += RY[i] * jz - RZ[i] * jy;
    L.y += RZ[i] * jx - RX[i] * jz;
    L.z += RX[i] * jy - RY[i] * jx;
    spin();
  };
  spin();
  for (let i = 0; i < n; i++) {
    const c = contacts[i],
      rx = c.p.x - b.c.x,
      ry = c.p.y - b.c.y,
      rz = c.p.z - b.c.z,
      vn = (v.x + wy * rz - wz * ry) * c.n.x + (v.y + wz * rx - wx * rz) * c.n.y + (v.z + wx * ry - wy * rx) * c.n.z;
    RX[i] = rx;
    RY[i] = ry;
    RZ[i] = rz;
    KN[i] = stiffness(rx, ry, rz, c.n.x, c.n.y, c.n.z);
    AIM[i] = vn < -REST_SPEED ? -c.stuff.bounce * vn : 0;
    JN[i] = 0;
    TX[i] = TY[i] = TZ[i] = 0;
    HIT[i] = Math.max(0, -vn);
  }
  for (let round = 0, rounds = n === 1 ? 2 : ROUNDS; round < rounds; round++)
    for (let i = 0; i < n; i++) {
      const c = contacts[i],
        nx = c.n.x,
        ny = c.n.y,
        nz = c.n.z,
        rx = RX[i],
        ry = RY[i],
        rz = RZ[i];
      let ux = v.x + wy * rz - wz * ry,
        uy = v.y + wz * rx - wx * rz,
        uz = v.z + wx * ry - wy * rx;
      const was = JN[i],
        now = Math.max(0, was + (AIM[i] - (ux * nx + uy * ny + uz * nz)) / KN[i]),
        dj = now - was;
      JN[i] = now;
      if (dj !== 0) push(i, nx * dj, ny * dj, nz * dj);
      // Friction, up to the grip times the push so far.
      ux = v.x + wy * rz - wz * ry;
      uy = v.y + wz * rx - wx * rz;
      uz = v.z + wx * ry - wy * rx;
      const un = ux * nx + uy * ny + uz * nz,
        tx = ux - nx * un,
        ty = uy - ny * un,
        tz = uz - nz * un,
        st = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (st < 1e-9) continue;
      const kt = stiffness(rx, ry, rz, tx / st, ty / st, tz / st),
        ox = TX[i],
        oy = TY[i],
        oz = TZ[i];
      let fx = ox - tx / kt,
        fy = oy - ty / kt,
        fz = oz - tz / kt;
      const most = c.stuff.grip * now,
        size = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (size > most) {
        const k = most / size;
        fx *= k;
        fy *= k;
        fz *= k;
      }
      TX[i] = fx;
      TY[i] = fy;
      TZ[i] = fz;
      push(i, fx - ox, fy - oy, fz - oz);
    }
  // Out of what it has sunk into, a share at a time.
  let sx = 0,
    sy = 0,
    sz = 0;
  for (let i = 0; i < n; i++) {
    const c = contacts[i],
      k = (Math.max(0, c.depth - SLOP) * PUSH) / n;
    sx += c.n.x * k;
    sy += c.n.y * k;
    sz += c.n.z * k;
  }
  b.c.x += sx;
  b.c.y += sy;
  b.c.z += sz;
}
/** How far an arrow at `pose` has sunk into the pot, the ground or the arrows `others` (m; 0 when it touches nothing), for checking. */
export function sunk(pose: Pose, others: Pose[] = []) {
  const found: Contact[] = [];
  touches({ tip: pose.tip, back: { x: -pose.dir.x, y: -pose.dir.y, z: -pose.dir.z } }, standing(others), found);
  return found.reduce((most, c) => Math.max(most, c.depth), 0);
}
/** Where an arrow lying at `pose` has come to: in a hole (standing or leaning) or out. */
export function judge(pose: Pose): { outcome: Outcome; hole: number } {
  const { tip, dir } = pose;
  for (let i = 0; i < HOLES.length; i++) {
    const hole = HOLES[i],
      dx = tip.x - hole.x,
      dz = tip.z - hole.z;
    if (dx * dx + dz * dz >= hole.inner * hole.inner || tip.y >= hole.top || tip.y < hole.top - hole.depth - 0.02) continue;
    const lean = Math.acos(Math.max(-1, Math.min(1, -dir.y)));
    return { outcome: lean <= LEAN_MAX ? hole.kind : "lean", hole: i };
  }
  return { outcome: "miss", hole: -1 };
}
/** How deep in a hole a point must be for the hole's walls to hold the shaft within `LEAN_MAX` of upright. */
const SURE = HOLES.map((h) => (2 * (h.inner - ARROW_R)) / Math.tan(LEAN_MAX) + 0.006);
/** How slowly an arrow inside a hole must move (m/s, rad/s) for a quick weighing to judge it as it lies. */
const SETTLED = { speed: 0.12, turn: 1.5 };
/** Below this height a point outside the pot can never come up again into a hole. */
const SURE_OUT = 0.26;
/** How long two sounds of one kind must be apart (s), and the softest touch heard (m/s into the face). */
const HEARD_APART = 0.05,
  HEARD = 0.2,
  /** How hard a rim must be struck (m/s into it) for the arrow to count as having hit it, not just grazed or leant on it. */
  RIM_STRUCK = 1.2;
/**
 * Follows a throw to its end among the arrows already thrown (`others`): the arrow flies, strikes and settles; the
 * path is kept when `record` is asked for.
 */
export function fly(yaw: number, speed: number, options: FlyOptions = {}): Flight {
  const { record = false, others = [], quick = false } = options,
    obstacles = standing(others),
    body = thrown(yaw, speed),
    contacts: Contact[] = [],
    knocks: Knock[] = [],
    path: Pose[] = [],
    heard: Partial<Record<KnockKind, number>> = {},
    entered = HOLES.map(() => false);
  let t = 0,
    rimmed = false,
    still = 0,
    next = SAMPLE;
  if (record) path.push(poseOf(body));
  const finish = (): Flight => {
    const rest = poseOf(body),
      { outcome, hole } = judge(rest);
    if (record) path.push(rest);
    return { outcome, hole, rimmed, rest, time: t, knocks, path };
  };
  const hear = (kind: KnockKind, speedIn: number, other?: number) => {
    if (speedIn < HEARD || (heard[kind] !== undefined && t - heard[kind]! < HEARD_APART)) return;
    heard[kind] = t;
    knocks.push(other === undefined ? { t, kind, strength: Math.min(1, speedIn / 4) } : { t, kind, strength: Math.min(1, speedIn / 4), other });
  };
  let shaft = shaftOf(body);
  let slow = false;
  while (t < MAX_TIME) {
    // Settling slowly, it is followed in the long slices too: nothing it does then needs the short ones.
    const dt = slow ? FAR_DT : sliceFor(shaft, obstacles);
    airStep(body, dt);
    if (dt === DT || slow) touches(shaft, obstacles, contacts);
    else contacts.length = 0;
    if (contacts.length) {
      resolve(body, contacts);
      const hit = HIT;
      contacts.forEach((c, i) => {
        if (c.kind === "rim" && hit[i] > RIM_STRUCK) rimmed = true;
        if (c.kind === "ground") {
          // Feathers and the shaft's ends drag on the mat: it does not roll on for ever.
          const a = body.a,
            spin = dot(body.L, a) * 30 * dt;
          body.L.x -= a.x * spin;
          body.L.y -= a.y * spin;
          body.L.z -= a.z * spin;
        }
        hear(c.kind, hit[i], c.kind === "arrow" ? c.other : undefined);
      });
    }
    drift(body, dt);
    t += dt;
    shaft = shaftOf(body);
    // Down through an opening: in.
    const tip = shaft.tip;
    HOLES.forEach((hole, i) => {
      if (entered[i]) return;
      const dx = tip.x - hole.x,
        dz = tip.z - hole.z;
      if (tip.y < hole.top - hole.tube && dx * dx + dz * dz < hole.inner * hole.inner) {
        entered[i] = true;
        knocks.push({ t, kind: "in", strength: Math.min(1, len(body.v) / 6) });
      }
    });
    if (record && t >= next - 1e-9) {
      next += SAMPLE;
      path.push(poseOf(body));
    }
    if (quick) {
      if (tip.y < SURE_OUT) return finish();
      for (let i = 0; i < HOLES.length; i++) {
        const hole = HOLES[i],
          dx = tip.x - hole.x,
          dz = tip.z - hole.z;
        if (dx * dx + dz * dz < hole.inner * hole.inner && tip.y < hole.top - SURE[i]) return finish();
      }
      // Come down inside a hole and nearly settled (among the arrows standing there): as it lies now.
      if (len(body.v) < SETTLED.speed && judge({ tip, dir: body.a }).hole >= 0) {
        const w = spinOf(body.a, body.L);
        if (len(w) < SETTLED.turn) return finish();
      }
    }
    // Lying still for a moment: at rest.
    const w = spinOf(body.a, body.L),
      wa = dot(w, body.a),
      across = Math.sqrt(Math.max(0, dot(w, w) - wa * wa));
    slow = contacts.length > 0 && len(body.v) < SLOW.speed && across < SLOW.turn;
    if (contacts.length && len(body.v) < STILL_SPEED && across < STILL_TURN) {
      still += dt;
      if (still >= STILL) break;
    } else still = 0;
  }
  return finish();
}
/** Where a throw's point crosses the height `y` on its way down, through nothing but the air (for aiming); null if it never does. */
export function crossing(yaw: number, speed: number, y: number) {
  const body = thrown(yaw, speed);
  let prev = shaftOf(body).tip;
  for (let t = 0; t < MAX_TIME; ) {
    const dt = sliceFor(shaftOf(body), NONE);
    airStep(body, dt);
    drift(body, dt);
    t += dt;
    const tip = shaftOf(body).tip;
    if (body.v.y < 0 && prev.y > y && tip.y <= y) {
      const f = (prev.y - y) / (prev.y - tip.y);
      return { x: prev.x + (tip.x - prev.x) * f, z: prev.z + (tip.z - prev.z) * f };
    }
    prev = tip;
  }
  return null;
}
/**
 * The throw (turn and speed) whose point comes down through the middle of `hole` at the rim's height, found through
 * the air alone: the speed by halving until the crossing lies at the hole's distance, then the turn put right by
 * how far to the side it crossed (the spinning arrow drifts a little), a few times over.
 */
export function aimAt(hole: Hole) {
  let yaw = Math.atan2(hole.x - RELEASE.x, RELEASE.z - hole.z),
    speed = 4;
  const want = Math.sqrt((hole.x - RELEASE.x) ** 2 + (RELEASE.z - hole.z) ** 2);
  for (let pass = 0; pass < 3; pass++) {
    let lo = 2,
      hi = 9;
    for (let k = 0; k < 32; k++) {
      const mid = (lo + hi) / 2,
        at = crossing(yaw, mid, hole.top),
        far = at ? Math.sqrt((at.x - RELEASE.x) ** 2 + (RELEASE.z - at.z) ** 2) : 0;
      if (far < want) lo = mid;
      else hi = mid;
    }
    speed = (lo + hi) / 2;
    const at = crossing(yaw, speed, hole.top);
    if (!at) break;
    // Turned about the hand by the angle the crossing is off to the side.
    yaw += Math.atan2(hole.x - RELEASE.x, RELEASE.z - hole.z) - Math.atan2(at.x - RELEASE.x, RELEASE.z - at.z);
  }
  return { yaw, speed };
}
/** `count` points of a throw's way through the air over its first `until` seconds (for the line shown while it is held). */
export function airPath(yaw: number, speed: number, until: number, count: number): V3[] {
  const body = thrown(yaw, speed),
    out: V3[] = [],
    every = until / count;
  let next = every;
  for (let t = 0; t < until + DT / 2 && out.length < count; ) {
    const dt = sliceFor(shaftOf(body), NONE);
    airStep(body, dt);
    drift(body, dt);
    t += dt;
    if (t >= next - 1e-9) {
      out.push(shaftOf(body).tip);
      next += every;
    }
  }
  return out;
}
