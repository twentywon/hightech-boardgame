import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, glossy, planks, weave } from "../../engine/scene-utils";
import { ARENA, HALF_X, HALF_Z } from "./rules";

/**
 * The pool table, all in code: a slate bed under a green cloth with a faint nap, cut through at the six pockets;
 * cushions with a rubber nose at the height a ball meets it, ending in jaws cut to each pocket; mitred hardwood rails
 * with mother-of-pearl sights; chrome castings with a leather lip round each pocket and a leather drop pocket under
 * it, where pocketed balls stay; a panelled cabinet on turned legs where a graphics card draws (plain posts else).
 * Frame of reference: the cloth at y 0, x across the table (the eye at +x), z along it; a cushion's face lies on the
 * physics' wall (`HALF_X`, `HALF_Z`) and a pocket's hole is the physics' pocket circle.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** How deep the cushions are, the top of the rails, how far the rails reach beyond the cushions' faces, their underside. */
export const CUSHION = 0.14,
  RAIL_TOP = 0.3,
  RAIL_OUT = 0.68,
  RAIL_BOTTOM = -0.45,
  /** The slate's thickness under the cloth, and the floor of the pub. */
  BED = 0.4,
  FLOOR = -3.4,
  /** Where the bottom of a drop pocket is: a pocketed ball rests on it. */
  POCKET_FLOOR = -0.5;
/** The cushions' backs: the bed reaches this far, the rails begin here. */
const BX = HALF_X + CUSHION,
  BZ = HALF_Z + CUSHION;
type Point = { x: number; z: number };
type Pocket = (typeof ARENA.pockets)[number];
const inBed = (p: Point) => Math.abs(p.x) <= BX && Math.abs(p.z) <= BZ;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const onCircle = (p: Pocket, a: number): Point => ({ x: p.x + Math.cos(a) * p.r, z: p.z + Math.sin(a) * p.r });
/**
 * The part of a pocket's circle inside the cushions' backs (`inside`: the edge of the hole through the bed) or
 * outside them (the bite out of the rails), from end to end, the ends exactly on the line of the backs, in the order a
 * walk round the table anticlockwise (seen from above, from +x toward +z) meets them. Also the circle's angles at its ends.
 */
export function pocketArc(p: Pocket, inside: boolean, steps = 72) {
  const angle = (k: number) => (k / steps) * Math.PI * 2,
    flag = (a: number) => inBed(onCircle(p, a)) === inside;
  // The edge between two samples of the circle, found by halving.
  const cross = (a: number, b: number) => {
    const want = flag(a);
    for (let i = 0; i < 30; i++) {
      const m = (a + b) / 2;
      if (flag(m) === want) a = m;
      else b = m;
    }
    return (a + b) / 2;
  };
  let start = 0;
  while (start < steps && !(flag(angle(start)) && !flag(angle(start - 1)))) start++;
  const from = cross(angle(start - 1), angle(start));
  let end = start;
  while (flag(angle(end + 1))) end++;
  const to = cross(angle(end), angle(end + 1)),
    angles = [from];
  for (let k = start; k <= end; k++) angles.push(angle(k));
  angles.push(to);
  let points = angles.map((a) => onCircle(p, a));
  const centre = Math.atan2(p.z, p.x),
    rel = (q: Point) => wrap(Math.atan2(q.z, q.x) - centre);
  if (rel(points[0]) > rel(points[points.length - 1])) {
    points = points.reverse();
    angles.reverse();
  }
  return { points, from: angles[0], to: angles[angles.length - 1] };
}
/** The pockets in the order a walk round the table anticlockwise meets them. */
const RING = [...ARENA.pockets].sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
/** The line round the bed (`inside`) or round the hole in the rails: the cushions' backs, broken by each pocket's arc. */
function outline(inside: boolean) {
  return RING.flatMap((p) => pocketArc(p, inside).points);
}
/** Shape coordinates are (x, −z): a shape is laid flat by turning it back a quarter round x. */
const flat = (points: Point[]) => points.map((q) => new T.Vector2(q.x, -q.z));
function layFlat(geometry: T.BufferGeometry, bottom: number) {
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom, 0);
  return geometry;
}
/** The cloth: green with a faint nap running down the table, a shade along the cushions and round the pockets, and the spots. */
function clothTexture(size: number) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size * 2;
  const ctx = c.getContext("2d")!,
    w = c.width,
    h = c.height,
    px = (x: number) => ((x + BX) / (2 * BX)) * w,
    pz = (z: number) => ((z + BZ) / (2 * BZ)) * h,
    unit = w / (2 * BX);
  ctx.fillStyle = "#1c6e4b";
  ctx.fillRect(0, 0, w, h);
  let seed = 7;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  // The nap: long faint strokes down the table, lighter and darker.
  for (let i = 0; i < size * 3; i++) {
    const x = rand() * w,
      y = rand() * h,
      long = h * (0.03 + rand() * 0.12);
    ctx.strokeStyle = rand() < 0.5 ? `rgba(255,255,255,${0.012 + rand() * 0.02})` : `rgba(0,20,10,${0.02 + rand() * 0.03})`;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y + long);
    ctx.stroke();
  }
  for (let i = 0; i < size * 14; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.045)";
    ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
  }
  // A little brighter where the lamp falls and the balls run most, darker toward the rails.
  const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.6);
  glow.addColorStop(0, "rgba(120,200,150,0.07)");
  glow.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  // The cushions' shade on the cloth beside them.
  const band = 0.16 * unit,
    shade = (x0: number, y0: number, x1: number, y1: number) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, "rgba(0,12,6,0.42)");
      g.addColorStop(1, "rgba(0,12,6,0)");
      return g;
    };
  ctx.fillStyle = shade(px(-HALF_X), 0, px(-HALF_X) + band, 0);
  ctx.fillRect(0, 0, px(-HALF_X) + band, h);
  ctx.fillStyle = shade(px(HALF_X), 0, px(HALF_X) - band, 0);
  ctx.fillRect(px(HALF_X) - band, 0, w, h);
  ctx.fillStyle = shade(0, pz(-HALF_Z), 0, pz(-HALF_Z) + band);
  ctx.fillRect(0, 0, w, pz(-HALF_Z) + band);
  ctx.fillStyle = shade(0, pz(HALF_Z), 0, pz(HALF_Z) - band);
  ctx.fillRect(0, pz(HALF_Z) - band, w, h);
  // Worn round each pocket's mouth.
  for (const p of ARENA.pockets) {
    const g = ctx.createRadialGradient(px(p.x), pz(p.z), p.r * unit, px(p.x), pz(p.z), (p.r + 0.22) * unit);
    g.addColorStop(0, "rgba(0,10,5,0.5)");
    g.addColorStop(1, "rgba(0,10,5,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px(p.x), pz(p.z), (p.r + 0.22) * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  // The head and foot spots: small white discs set into the cloth.
  ctx.fillStyle = "rgba(240,240,230,0.75)";
  for (const z of [2.9, -2]) {
    ctx.beginPath();
    ctx.arc(px(0), pz(z), 0.045 * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  // Sharp along the table where a graphics card draws; filtering that fine costs a software renderer dearly.
  t.anisotropy = size > 512 ? 8 : 1;
  return t;
}
/** The bed: slate cut through at the pockets, the cloth on its face (group 0), the slate's edge (group 1). */
function bedGeometry() {
  const geometry = layFlat(new T.ExtrudeGeometry(new T.Shape(flat(outline(true))), { depth: BED, bevelEnabled: false }), -BED),
    at = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < at.count; i++) uv.setXY(i, (at.getX(i) + BX) / (2 * BX), 1 - (at.getZ(i) + BZ) / (2 * BZ));
  uv.needsUpdate = true;
  return geometry;
}
/**
 * The rails: one mitred frame round the cushions with the pockets bitten out of it and its upper edges rounded. Each
 * triangle takes the grain along its own rail (the long rails' down the table, the short ones' across), so the
 * corners meet as mitres do.
 */
function railGeometry() {
  const ox = HALF_X + RAIL_OUT,
    oz = HALF_Z + RAIL_OUT,
    round = 0.24,
    outer = new T.Shape();
  outer.moveTo(-ox + round, -oz);
  outer.lineTo(ox - round, -oz);
  outer.quadraticCurveTo(ox, -oz, ox, -oz + round);
  outer.lineTo(ox, oz - round);
  outer.quadraticCurveTo(ox, oz, ox - round, oz);
  outer.lineTo(-ox + round, oz);
  outer.quadraticCurveTo(-ox, oz, -ox, oz - round);
  outer.lineTo(-ox, -oz + round);
  outer.quadraticCurveTo(-ox, -oz, -ox + round, -oz);
  outer.holes.push(new T.Path(flat(outline(false))));
  const bevel = 0.035,
    geometry = layFlat(
      new T.ExtrudeGeometry(outer, { depth: RAIL_TOP - RAIL_BOTTOM - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 8 }),
      RAIL_BOTTOM + bevel,
    ),
    at = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv"),
    grain = 0.45,
    a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3();
  for (let i = 0; i < at.count; i += 3) {
    a.fromBufferAttribute(at, i);
    b.fromBufferAttribute(at, i + 1);
    c.fromBufferAttribute(at, i + 2);
    const mx = (a.x + b.x + c.x) / 3,
      mz = (a.z + b.z + c.z) / 3,
      long = Math.abs(mx) - HALF_X > Math.abs(mz) - HALF_Z,
      normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize(),
      cap = Math.abs(normal.y) > 0.5;
    for (let k = 0; k < 3; k++) {
      const x = at.getX(i + k),
        y = at.getY(i + k),
        z = at.getZ(i + k);
      if (cap) uv.setXY(i + k, (long ? z : x) * grain, (long ? x : z) * grain);
      else uv.setXY(i + k, (Math.abs(normal.x) > Math.abs(normal.z) ? z : x) * grain, y * grain);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}
/** A cushion's section (outward from its face, height): undercut, the rubber nose, the rounded top, the back against the rail. */
const SECTION: [number, number][] = [
  [0.035, 0],
  [0.006, 0.17],
  [0, 0.205],
  [0.004, 0.232],
  [0.016, 0.252],
  [0.045, 0.27],
  [0.09, 0.283],
  [CUSHION, 0.292],
  [CUSHION, 0],
];
/**
 * One cushion along a side of the table between two pockets: its section swept along the side, each line of the
 * section ending where that line meets the pocket's circle, so that the jaws are cut to the pockets.
 * `side` is the face's outward direction: 0 +x, 1 +z, 2 −x, 3 −z; `ends` the two pockets, `middle` a place along it.
 */
function cushionGeometry(side: number, ends: [Pocket, Pocket], middle: number) {
  const across = side % 2 === 0,
    sign = side < 2 ? 1 : -1,
    face = across ? HALF_X : HALF_Z,
    // A place at `u` out from the face and `s` along the side.
    world = (u: number, y: number, s: number) => (across ? new T.Vector3(sign * (face + u), y, s) : new T.Vector3(s, y, sign * (face + u))),
    // Where the line `u` out from the face meets a pocket's circle, on the cushion's side of it.
    jaw = (p: Pocket, u: number) => {
      const off = sign * (face + u) - (across ? p.x : p.z),
        half = Math.sqrt(Math.max(0, p.r * p.r - off * off)),
        at = across ? p.z : p.x;
      return at > middle ? at - half : at + half;
    },
    rows = SECTION.map(([u, y]) => ({ u, y, a: jaw(ends[0], u), b: jaw(ends[1], u) })).map((r) => (r.a < r.b ? r : { ...r, a: r.b, b: r.a })),
    positions: number[] = [],
    tri = (p: T.Vector3, q: T.Vector3, r: T.Vector3, out: T.Vector3) => {
      const n = q.clone().sub(p).cross(r.clone().sub(p));
      if (n.dot(out) < 0) [q, r] = [r, q];
      positions.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
    };
  const midU = CUSHION / 2,
    midY = 0.14;
  for (let i = 0; i < rows.length; i++) {
    const r0 = rows[i],
      r1 = rows[(i + 1) % rows.length],
      p00 = world(r0.u, r0.y, r0.a),
      p01 = world(r0.u, r0.y, r0.b),
      p10 = world(r1.u, r1.y, r1.a),
      p11 = world(r1.u, r1.y, r1.b),
      // Away from the middle of the section.
      out = world((r0.u + r1.u) / 2 - midU, (r0.y + r1.y) / 2 - midY, 0).sub(world(0, 0, 0));
    if (across) out.z = 0;
    else out.x = 0;
    tri(p00, p01, p11, out);
    tri(p00, p11, p10, out);
  }
  // The jaws: each end of the section, as a fan.
  for (const end of ["a", "b"] as const) {
    const ring = rows.map((r) => world(r.u, r.y, r[end])),
      out = across ? new T.Vector3(0, 0, end === "a" ? -1 : 1) : new T.Vector3(end === "a" ? -1 : 1, 0, 0);
    for (let i = 1; i < ring.length - 1; i++) tri(ring[0], ring[i], ring[i + 1], out);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
/** The six cushions in one geometry. */
function cushionsGeometry() {
  const corner = (sx: number, sz: number) => ARENA.pockets.find((p) => Math.sign(p.x) === sx && Math.sign(p.z) === sz)!,
    middle = (sx: number) => ARENA.pockets.find((p) => p.z === 0 && Math.sign(p.x) === sx)!,
    parts = [
      cushionGeometry(0, [corner(1, 1), middle(1)], HALF_Z / 2),
      cushionGeometry(0, [corner(1, -1), middle(1)], -HALF_Z / 2),
      cushionGeometry(2, [corner(-1, 1), middle(-1)], HALF_Z / 2),
      cushionGeometry(2, [corner(-1, -1), middle(-1)], -HALF_Z / 2),
      cushionGeometry(1, [corner(1, 1), corner(-1, 1)], 0),
      cushionGeometry(3, [corner(1, -1), corner(-1, -1)], 0),
    ],
    merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
}
/** A strip standing along a line of points from `low` to `high` (a pocket's leather wall). */
function wall(points: Point[], low: number, high: number) {
  const positions: number[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i],
      b = points[i + 1];
    positions.push(a.x, low, a.z, b.x, low, b.z, b.x, high, b.z, a.x, low, a.z, b.x, high, b.z, a.x, high, a.z);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.computeVertexNormals();
  return geometry;
}
/** A pocket's chrome casting on the rail: a band round the bite, its ends on the line of the cushions' backs. */
function castingGeometry(p: Pocket) {
  const { from, to } = pocketArc(p, false, 96),
    inner = p.r + 0.02,
    outer = p.r + 0.13,
    steps = 28,
    at = (k: number) => from + ((to - from) * k) / steps,
    shape: T.Vector2[] = [];
  for (let k = 0; k <= steps; k++) shape.push(new T.Vector2(p.x + Math.cos(at(k)) * outer, -(p.z + Math.sin(at(k)) * outer)));
  for (let k = steps; k >= 0; k--) shape.push(new T.Vector2(p.x + Math.cos(at(k)) * inner, -(p.z + Math.sin(at(k)) * inner)));
  return layFlat(new T.ExtrudeGeometry(new T.Shape(shape), { depth: 0.022, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelOffset: -0.012, bevelSegments: 2, curveSegments: 4 }), RAIL_TOP - 0.006);
}
/** The leather lip round the top of a pocket's bite, and the drop pocket under its hole. */
function lipGeometry(p: Pocket) {
  const { points } = pocketArc(p, false, 64),
    curve = new T.CatmullRomCurve3(points.map((q) => new T.Vector3(p.x + (q.x - p.x) * 1.02, RAIL_TOP - 0.004, p.z + (q.z - p.z) * 1.02)));
  return new T.TubeGeometry(curve, 28, 0.032, 6, false);
}
function cupGeometry(p: Pocket) {
  const r = p.r - 0.004;
  return new T.LatheGeometry(
    [
      [0, POCKET_FLOOR],
      [r * 0.3, POCKET_FLOOR + 0.004],
      [r * 0.66, POCKET_FLOOR + 0.03],
      [r * 0.9, POCKET_FLOOR + 0.1],
      [r, POCKET_FLOOR + 0.2],
      [r, 0.002],
    ].map(([x, y]) => new T.Vector2(x, y)),
    28,
  ).translate(p.x, 0, p.z);
}
/** The diamonds on the rails: three between pockets along each long rail's halves, three across each short rail. */
function sightsGeometry() {
  const parts: T.BufferGeometry[] = [],
    middle = CUSHION + (RAIL_OUT - CUSHION) / 2,
    diamond = (x: number, z: number, alongZ: boolean) =>
      parts.push(
        new T.CircleGeometry(0.05, 4)
          .rotateX(-Math.PI / 2)
          .scale(alongZ ? 0.7 : 1.5, 1, alongZ ? 1.5 : 0.7)
          .translate(x, RAIL_TOP + 0.004, z),
      );
  for (const k of [1, 2, 3]) for (const sz of [-1, 1]) for (const sx of [-1, 1]) diamond(sx * (HALF_X + middle), sz * ((k * HALF_Z) / 4), true);
  for (const k of [-1, 0, 1]) for (const sz of [-1, 1]) diamond((k * HALF_X) / 2, sz * (HALF_Z + middle), false);
  const merged = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return merged;
}
/** A turned leg, standing on the floor and reaching `height` up. */
function legGeometry(height: number) {
  const profile: [number, number][] = [
    [0, 0],
    [0.3, 0],
    [0.32, 0.05],
    [0.3, 0.12],
    [0.24, 0.16],
    [0.2, 0.26],
    [0.26, 0.38],
    [0.27, 0.46],
    [0.2, 0.56],
    [0.15, 0.72],
    [0.17, 0.82],
    [0.24, 0.88],
    [0.26, 0.94],
    [0.24, 1],
    [0, 1],
  ];
  return new T.LatheGeometry(
    profile.map(([r, y]) => new T.Vector2(r, y * height)),
    16,
  );
}
/** Builds the table into `scene`. */
export function buildTable(scene: T.Object3D, own: Own, rich: boolean) {
  const add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], cast = true) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const cloth = own(clothTexture(rich ? 1024 : 512)),
    felt = { roughness: 0.94, ...weave(5, 9, own) },
    plain = (options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...options })),
    // The small dark and shiny parts are lit the cheap way where no graphics card draws.
    fitting = (options: T.MeshStandardMaterialParameters) => (rich ? plain(options) : own(new T.MeshLambertMaterial({ color: options.color, side: options.side ?? T.FrontSide }))),
    wood = planks(1, own, 1),
    rail = own(rich ? glossy({ ...wood, color: "#d9a07c", roughness: 0.5 }, 0.45) : new T.MeshStandardMaterial({ ...wood, color: "#d9a07c", roughness: 0.6 })),
    slate = fitting({ color: "#2b2f30", roughness: 0.9 }),
    chrome = fitting(rich ? { color: "#c9ccd2", roughness: 0.26, metalness: 0.9 } : { color: "#b4b8be" }),
    pearl = fitting({ color: "#f2ebdc", roughness: 0.3 });
  add(bedGeometry(), [plain({ map: cloth, ...felt }), slate], false);
  add(cushionsGeometry(), plain({ color: "#1a6644", ...felt }));
  add(railGeometry(), rail);
  add(sightsGeometry(), pearl, false);
  const castings: T.BufferGeometry[] = [],
    lips: T.BufferGeometry[] = [],
    cups: T.BufferGeometry[] = [];
  for (const p of ARENA.pockets) {
    castings.push(castingGeometry(p));
    lips.push(lipGeometry(p), wall(pocketArc(p, false, 40).points.map((q) => ({ x: p.x + (q.x - p.x) * 0.99, z: p.z + (q.z - p.z) * 0.99 })), -0.02, RAIL_TOP - 0.01));
    cups.push(cupGeometry(p));
  }
  const merge = (parts: T.BufferGeometry[]) => {
    const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
    parts.forEach((g) => g.dispose());
    return merged;
  };
  add(merge(castings), chrome);
  add(merge(lips), fitting({ color: "#1d1512", roughness: 0.62, side: T.DoubleSide }), false);
  add(merge(cups), fitting({ color: "#17110e", roughness: 0.85, side: T.DoubleSide }), false);
  // Under the rails: a panelled cabinet on six turned legs where a graphics card draws; four plain posts else.
  const base = rich ? glossy({ ...planks(1.2, own, 0.6), color: "#b98262", roughness: 0.55 }, 0.3) : new T.MeshLambertMaterial({ color: "#4a2f20" });
  own(base);
  if (rich) {
    const cabinet: T.BufferGeometry[] = [],
      ox = HALF_X + RAIL_OUT - 0.1,
      oz = HALF_Z + RAIL_OUT - 0.1,
      low = RAIL_BOTTOM - 0.85;
    cabinet.push(block(ox * 2, 0.85, oz * 2, 0.06).translate(0, RAIL_BOTTOM - 0.425, 0));
    // A moulding along its foot and raised panels down its sides.
    cabinet.push(block(ox * 2 + 0.08, 0.1, oz * 2 + 0.08, 0.04).translate(0, low + 0.05, 0));
    for (const k of [-3, -1, 1, 3]) for (const sx of [-1, 1]) cabinet.push(block(0.04, 0.5, 2.1, 0.02).translate(sx * (ox + 0.015), RAIL_BOTTOM - 0.42, (k * oz) / 4));
    for (const sz of [-1, 1]) cabinet.push(block(ox * 1.6, 0.5, 0.04, 0.02).translate(0, RAIL_BOTTOM - 0.42, sz * (oz + 0.015)));
    for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) cabinet.push(legGeometry(low - FLOOR).translate(sx * (ox - 0.35), FLOOR, sz * (oz - 0.5)));
    add(merge(cabinet), base);
  } else {
    const posts: T.BufferGeometry[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) posts.push(new T.BoxGeometry(0.7, RAIL_BOTTOM - FLOOR, 0.7).translate(sx * (HALF_X - 0.3), (RAIL_BOTTOM + FLOOR) / 2, sz * (HALF_Z - 0.6)));
    add(merge(posts), base);
  }
  return { cloth };
}
/**
 * Where the `k`th ball to drop into a pocket rests: the first on the leather in the middle, the next two beside it
 * toward the rail, a fourth on top; later ones are out of sight under them (null).
 */
export function pocketRest(p: Pocket, k: number, radius: number) {
  const out = Math.atan2(p.z, p.x),
    reach = p.r - radius - 0.01;
  const bottom = POCKET_FLOOR + radius + 0.005;
  if (k === 0) return { x: p.x, y: bottom, z: p.z };
  if (k === 1 || k === 2) {
    const a = out + (k === 1 ? 0.9 : -0.9);
    return { x: p.x + Math.cos(a) * reach, y: bottom + 0.06, z: p.z + Math.sin(a) * reach };
  }
  if (k === 3) return { x: p.x + Math.cos(out) * 0.04, y: bottom + radius * 1.5, z: p.z + Math.sin(out) * 0.04 };
  return null;
}
