import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/*
 * Sculpted shapes for 시대 전쟁's soldiers, beasts and machines (the user asked for the units upgraded from blocks):
 * turned outlines (lathes) for bodies, limbs, helmets and barrels, a head shaped from a sphere with a jaw, cheekbones,
 * sockets and a brow, shells that follow the head for hair, beards, hoods and mail coifs, tubes along curves for tusks,
 * trunks, bows and tails, and side outlines pushed out for stocks, rifles, hulls and turrets. Every shape faces +x (a
 * figure's forward), up +y, with z across. `fine` sets how finely they are cut (all of it where a graphics card draws,
 * about half where the processor does).
 */
export const smoothstep = (a: number, b: number, v: number) => {
  const u = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
/** How many cuts at this fineness (never fewer than `least`). */
export const cuts = (fine: number, n: number, least = 3) => Math.max(least, Math.round(n * fine));

/** Averages the normals where a shape's seam doubles its vertices, so that no crease shows there. */
export function smoothSeams(g: T.BufferGeometry) {
  g.computeVertexNormals();
  const pos = g.attributes.position,
    nor = g.attributes.normal,
    sums = new Map<string, T.Vector3>(),
    key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i),
      n = new T.Vector3().fromBufferAttribute(nor, i),
      s = sums.get(k);
    if (s) s.add(n);
    else sums.set(k, n);
  }
  for (let i = 0; i < pos.count; i++) {
    const n = sums.get(key(i))!.clone().normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  nor.needsUpdate = true;
  return g;
}
/** Moves, turns and sizes a shape (for merging). */
export const placed = (g: T.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: [number, number, number] = [1, 1, 1]) =>
  g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(...s)));
/** Several shapes as one (positions, normals and uvs kept; each made unindexed). */
export function merge(parts: T.BufferGeometry[]) {
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    return g;
  });
  const merged = mergeGeometries(flat)!;
  for (const p of parts) p.dispose();
  for (const f of flat) f.dispose();
  return merged;
}
/**
 * A turned shape: an outline of (radius, height) points turned round y, then its front-to-back (x) and across (z)
 * stretched by `sx` and `sz`. Points go from the bottom up.
 */
export function lathe(outline: [number, number][], segments: number, sx = 1, sz = 1) {
  const g = new T.LatheGeometry(
    outline.map(([r, y]) => new T.Vector2(Math.max(r, 1e-4), y)),
    segments,
  );
  g.scale(sx, 1, sz);
  return smoothSeams(g);
}
/** A turned shape lying along +x (a barrel, a shaft): its outline's heights become lengths along x. */
export const latheX = (outline: [number, number][], segments: number) => lathe(outline, segments).rotateZ(-Math.PI / 2);
/** A tube along a curve through points, its thickness tapering from `r0` at the start to `r1` at the end. */
export function tube(points: T.Vector3[], r0: number, r1: number, segments: number, round: number) {
  const curve = new T.CatmullRomCurve3(points),
    g = new T.TubeGeometry(curve, segments, 1, round, false),
    pos = g.attributes.position,
    frames = curve.computeFrenetFrames(segments, false),
    p = new T.Vector3(),
    c = new T.Vector3();
  // Each ring of the tube drawn in to its own thickness about the curve.
  for (let s = 0; s <= segments; s++) {
    curve.getPointAt(s / segments, c);
    const r = r0 + (r1 - r0) * (s / segments);
    for (let k = 0; k <= round; k++) {
      const i = s * (round + 1) + k;
      p.fromBufferAttribute(pos, i).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
  }
  void frames;
  // Rounded caps at either end.
  const parts: T.BufferGeometry[] = [g];
  for (const [t, r] of [
    [0, r0],
    [1, r1],
  ] as const)
    if (r > 0.004) parts.push(new T.SphereGeometry(r, round, Math.max(3, round >> 1)).translate(...curve.getPointAt(t).toArray()));
  return smoothSeams(merge(parts));
}
/** A flat outline (x along, y up) pushed out `depth` across z, its edges rounded by `bevel`. */
export function slab(outline: [number, number][], depth: number, bevel = 0.004, curve = 2) {
  const s = new T.Shape();
  outline.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new T.ExtrudeGeometry(s, { depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: curve, curveSegments: 6 });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}
/** A box with rounded edges and corners. */
export const rounded = (x: number, y: number, z: number, r: number, fine: number): T.BufferGeometry =>
  // (Where the processor draws, a plain box: a rounded one's corners cost more than they show at the lane's size.)
  fine < 0.7 ? new T.BoxGeometry(x, y, z) : new RoundedBoxGeometry(x, y, z, cuts(fine, 3, 1), Math.min(r, x / 2, y / 2, z / 2) * 0.999);
/** An ellipsoid, its radii across x, y and z. */
export const ellipsoid = (rx: number, ry: number, rz: number, w: number, h: number) => new T.SphereGeometry(1, w, h).scale(rx, ry, rz);

// ─────────────── The head ───────────────
/** The head's half-sizes before shaping (across, up, front to back), in the figure's metres. */
export const HEAD = { x: 0.106, y: 0.13, z: 0.118 };
const bump = (d: T.Vector3, x: number, y: number, z: number, size: number, width: number) => {
  const dx = d.x - x,
    dy = d.y - y,
    dz = d.z - z;
  return size * Math.exp(-(dx * dx + dy * dy + dz * dz) / (width * width));
};
/**
 * The head's surface in a direction, worked out face toward −z (then turned to face +x): a skull narrowing to the jaw,
 * cheekbones, the eyes' sockets under a brow, temples, the chin, the back of the skull.
 */
function shapeHead(d: T.Vector3, out = new T.Vector3()) {
  const low = smoothstep(0.1, -0.9, d.y),
    back = smoothstep(-0.1, 0.8, d.z);
  const fx = 1 - 0.3 * Math.pow(low, 1.4),
    fz = 1 - 0.38 * low * back - 0.08 * low * (1 - back),
    fy = 1 - 0.06 * smoothstep(0.6, 1, d.y);
  let r = 1;
  for (const s of [-1, 1]) {
    r += bump(d, s * 0.62, -0.14, -0.74, 0.06, 0.3);
    r -= bump(d, s * 0.36, 0.1, -0.92, 0.06, 0.2);
    r += bump(d, s * 0.33, 0.3, -0.9, 0.04, 0.24);
    r -= bump(d, s * 0.86, 0.32, -0.32, 0.04, 0.35);
    r -= bump(d, s * 0.45, -0.42, -0.78, 0.03, 0.25);
  }
  r += bump(d, 0, 0.42, 0.85, 0.07, 0.6);
  r += bump(d, 0, -0.78, -0.62, 0.07, 0.28);
  return out.set(d.x * HEAD.x * fx * r, d.y * HEAD.y * fy * r, d.z * HEAD.z * fz * r);
}
/** From the face-toward-−z working frame to the figure's (face toward +x). */
const turn = (p: T.Vector3) => p.set(-p.z, p.y, p.x);
/** The head, shaped, facing +x. */
export function headGeometry(fine: number) {
  const g = new T.SphereGeometry(1, fine < 0.7 ? 10 : cuts(fine, 30, 11), fine < 0.7 ? 7 : cuts(fine, 22, 8)),
    pos = g.attributes.position,
    d = new T.Vector3(),
    p = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    shapeHead(d, p);
    turn(p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  return smoothSeams(g);
}
/** A point of the face seen straight on from the front: `across` (z, + to the figure's left) and `up`, `rise` out from the skin. */
export function onFace(across: number, up: number, rise = 0) {
  let dx = -across / HEAD.x,
    dy = up / HEAD.y;
  const d = new T.Vector3(),
    p = new T.Vector3();
  for (let k = 0; k < 12; k++) {
    d.set(dx, dy, -Math.sqrt(Math.max(0.02, 1 - dx * dx - dy * dy))).normalize();
    shapeHead(d, p);
    dx = d.x + (-across - p.x) / HEAD.x;
    dy = d.y + (up - p.y) / HEAD.y;
  }
  p.add(d.multiplyScalar(rise));
  return turn(p);
}
/**
 * A shell over the head: where `grow` (0 to 1, of a direction in the working frame, face toward −z) says, it stands
 * `lift` off the skin (more by `swell`), elsewhere it lies just under it, so its edge is a soft line. Hair, a beard, a
 * hood or a coif. `jag` roughens it (shaggy hair).
 */
export function shellGeometry(fine: number, grow: (d: T.Vector3) => number, lift: number, swell: (d: T.Vector3) => number = () => 0, jag = 0) {
  const g = new T.SphereGeometry(1, fine < 0.7 ? 8 : cuts(fine, 28, 9), fine < 0.7 ? 6 : cuts(fine, 20, 7)),
    pos = g.attributes.position,
    d = new T.Vector3(),
    p = new T.Vector3(),
    grown: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    shapeHead(d, p);
    const k = grow(d);
    let rise = lift + swell(d) + (jag ? jag * Math.sin(d.x * 31) * Math.sin(d.y * 27 + 1) * Math.sin(d.z * 29) : 0);
    rise = rise * k - 0.006 * (1 - k);
    p.addScaledVector(d, rise);
    turn(p);
    pos.setXYZ(i, p.x, p.y, p.z);
    grown.push(k);
  }
  smoothSeams(g);
  // The part lying under the skin is never seen: its triangles are left out.
  const index = g.index!,
    kept: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t),
      b = index.getX(t + 1),
      c = index.getX(t + 2);
    if (Math.max(grown[a], grown[b], grown[c]) > 0.02) kept.push(a, b, c);
  }
  g.setIndex(kept);
  return g;
}
/** Kinds of hair, beard and hood (in the working frame, face toward −z). */
export const GROW = {
  /** A short crop: off the face above a hairline, down to the nape behind. */
  crop: (d: T.Vector3) => {
    const side = Math.abs(d.x),
      face = smoothstep(-0.05, -0.35, d.z),
      line = 0.44 - 0.16 * side,
      onFace = 1 - face * smoothstep(line + 0.06, line - 0.02, d.y),
      behind = smoothstep(-0.1, 0.35, d.z);
    return onFace * smoothstep(-0.02 - 0.42 * behind, 0.08 - 0.42 * behind, d.y);
  },
  /** Long wild hair: all but the face, down past the jaw behind and at the sides. */
  wild: (d: T.Vector3) => {
    const face = smoothstep(-0.2, -0.55, d.z) * smoothstep(0.75, 0.5, Math.abs(d.x)),
      onFace = 1 - face * smoothstep(0.38, 0.28, d.y);
    return onFace * smoothstep(-0.95, -0.75, d.y);
  },
  /** A full beard round the jaw and chin, the mouth clear. */
  beard: (d: T.Vector3) => {
    const jaw = smoothstep(-0.12, -0.38, d.y) * smoothstep(0.35, -0.2, d.z),
      mouth = smoothstep(0.12, 0.02, Math.abs(d.x)) * smoothstep(-0.3, -0.42, d.y) * smoothstep(-0.55, -0.5, d.y) * smoothstep(-0.6, -0.85, d.z);
    return Math.max(0, jaw - mouth);
  },
  /** A moustache over the lip. */
  tache: (d: T.Vector3) => smoothstep(0.3, 0.15, Math.abs(d.x)) * smoothstep(-0.26, -0.33, d.y) * smoothstep(-0.46, -0.38, d.y) * smoothstep(-0.7, -0.9, d.z),
  /** A hood or coif: all but an oval round the face. */
  hood: (d: T.Vector3) => {
    const oval = Math.hypot(d.x / 0.62, (d.y + 0.08) / 0.62);
    return 1 - smoothstep(-0.35, -0.6, d.z) * smoothstep(1.05, 0.9, oval);
  },
};
/** The nose: a narrow bridge widening to the tip, low on the face (facing +x). */
export function noseGeometry(fine: number) {
  const g = new T.SphereGeometry(1, cuts(fine, 12, 6), cuts(fine, 9, 5)),
    pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i),
      below = smoothstep(0.1, -1, y),
      front = Math.max(0, x);
    pos.setXYZ(i, x * 0.01 + front * 0.014 * smoothstep(0.9, -0.4, y), y * 0.024, z * (0.008 + 0.009 * below * below));
  }
  return smoothSeams(g);
}

// ─────────────── The body ───────────────
/** The torso from the waist to the neck (on the chest's pivot), flattened front to back. */
export const torso = (fine: number, fat = 1) =>
  lathe(
    (
      [
        [0.0, -0.05],
        [0.12, -0.04],
        [0.128, 0.03],
        [0.122, 0.1],
        [0.132, 0.18],
        [0.15, 0.26],
        [0.158, 0.3],
        [0.15, 0.34],
        [0.118, 0.372],
        [0.07, 0.395],
        [0.0, 0.41],
      ] as [number, number][]
    ).map(([r, y]) => [r * fat, y]),
    cuts(fine, 18, 7),
    0.7,
  );
/** The hips (on the body's pivot). */
export const pelvis = (fine: number) =>
  lathe(
    [
      [0.0, 0.5],
      [0.1, 0.505],
      [0.128, 0.55],
      [0.134, 0.6],
      [0.126, 0.66],
      [0.0, 0.69],
    ],
    cuts(fine, 16, 7),
    0.74,
  );
/** A thigh from the hip down (on the leg's pivot). */
export const thigh = (fine: number, fat = 1) =>
  lathe(
    (
      [
        [0.0, 0.03],
        [0.068, 0.02],
        [0.08, -0.04],
        [0.077, -0.12],
        [0.064, -0.22],
        [0.054, -0.28],
        [0.0, -0.31],
      ] as [number, number][]
    ).map(([r, y]) => [r * fat, y]),
    cuts(fine, 12, 5),
    0.95,
  );
/** A shin from the knee down, the calf behind (on the knee's pivot). */
export const shin = (fine: number, fat = 1) =>
  lathe(
    (
      [
        [0.0, 0.03],
        [0.05, 0.02],
        [0.058, -0.05],
        [0.054, -0.1],
        [0.042, -0.18],
        [0.036, -0.21],
        [0.0, -0.22],
      ] as [number, number][]
    ).map(([r, y]) => [r * fat, y]),
    cuts(fine, 12, 5),
    0.95,
  );
/** A boot (or a wrapped foot): the shaft round the ankle and the foot forward, a flat sole (on the knee's pivot). */
export function boot(fine: number, high = 0.11) {
  const shaft = lathe(
    [
      [0.0, -0.29],
      [0.05, -0.285],
      [0.05, -0.24],
      [0.046, -0.2],
      [0.048, -0.29 + high + 0.06],
      [0.0, -0.29 + high + 0.07],
    ],
    cuts(fine, 10, 5),
  );
  const foot = ellipsoid(0.1, 0.042, 0.052, cuts(fine, 14, 6), cuts(fine, 8, 4)).translate(0.05, -0.27, 0),
    pos = foot.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.288) pos.setY(i, -0.288);
  foot.computeVertexNormals();
  return merge([shaft, foot]);
}
/** An upper arm from the shoulder (on the arm's pivot), the shoulder's round on top. */
export const upperArm = (fine: number, fat = 1) =>
  merge([
    lathe(
      (
        [
          [0.0, 0.04],
          [0.055, 0.025],
          [0.062, -0.04],
          [0.056, -0.12],
          [0.046, -0.2],
          [0.0, -0.225],
        ] as [number, number][]
      ).map(([r, y]) => [r * fat, y]),
      cuts(fine, 10, 5),
    ),
    ellipsoid(0.058 * fat, 0.056, 0.056 * fat, cuts(fine, 10, 5), cuts(fine, 7, 4)).translate(0, 0.005, 0),
  ]);
/** A forearm from the elbow (on the elbow's pivot). */
export const forearm = (fine: number, fat = 1) =>
  lathe(
    (
      [
        [0.0, 0.03],
        [0.046, 0.02],
        [0.051, -0.05],
        [0.041, -0.14],
        [0.033, -0.18],
        [0.0, -0.195],
      ] as [number, number][]
    ).map(([r, y]) => [r * fat, y]),
    cuts(fine, 10, 5),
  );
/** A hand closed round a grip at (0, −0.2, 0) of the elbow's pivot: the fist, its knuckles forward, the thumb over. */
export function fist(fine: number) {
  const w = cuts(fine, 10, 6),
    h = cuts(fine, 7, 4);
  if (fine < 0.7) return ellipsoid(0.038, 0.055, 0.032, 6, 4).translate(0.014, -0.205, 0);
  return merge([
    ellipsoid(0.034, 0.05, 0.03, w, h).translate(0.006, -0.205, 0),
    ellipsoid(0.026, 0.044, 0.026, w, h).translate(0.028, -0.21, 0),
    ellipsoid(0.014, 0.03, 0.014, w, h).translate(0.022, -0.19, 0.024).rotateX(0.2),
  ]);
}
/** The neck (on the chest's pivot). */
export const neck = (fine: number) =>
  lathe(
    [
      [0.048, 0.35],
      [0.043, 0.41],
      [0.046, 0.47],
    ],
    cuts(fine, 10, 6),
    0.95,
  );
/**
 * A garment turned round the body from `low` to `high` (on the chest's pivot; heights there), `room` off the torso,
 * its hem roughened by `jag` (ragged fur) and flared by `flare`. A tunic, a coat's skirt, a mail shirt.
 */
export function garment(fine: number, low: number, high: number, room: number, jag = 0, flare = 0, fat = 1) {
  const outline: [number, number][] = [];
  const shape = (y: number) => {
    // The torso's own outline there, the hips' below the waist.
    const t = y > 0.3 ? 0.158 - (y - 0.3) * 0.9 : y > 0.18 ? 0.132 + (y - 0.18) * 0.21 : y > 0.03 ? 0.125 : 0.135 + Math.max(0, -y) * (0.05 + flare);
    return t * fat + room;
  };
  const n = fine < 0.7 ? 4 : 9;
  for (let i = 0; i <= n; i++) {
    const y = low + ((high - low) * i) / n;
    outline.push([shape(y), y]);
  }
  outline.push([outline[n][0] * 0.55, high + 0.025]);
  const segments = cuts(fine, 20, 8),
    g = lathe(outline, segments, 0.72),
    pos = g.attributes.position;
  if (jag)
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i) - low) > 0.002) continue;
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      pos.setY(i, low - jag * (0.5 + 0.5 * Math.sin(a * 9) * Math.sin(a * 5 + 1)));
    }
  g.computeVertexNormals();
  return g;
}
