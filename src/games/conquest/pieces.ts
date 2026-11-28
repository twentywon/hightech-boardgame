import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The army pieces, modelled in code, low in polygons so that a whole world of them draws quickly: a foot soldier with
 * a rifle at the shoulder and a peaked cap (보병, one army), a rider on a horse with a raised sabre (기병, five), and a
 * field cannon on two spoked wheels (포병, ten). Each kind is two geometries: what is painted in the holder's colour,
 * and the trim (rifle, visor, belt, saddle, sabre, axle, muzzle ring) in metal, wood and leather by vertex colour.
 * Sizes are for a piece scale of 1, in table units, standing on y = 0 and facing the viewer (+z), the long side of
 * horse and cannon along x.
 */
export type Kind = 0 | 1 | 2;
export const KIND_VALUE = [1, 5, 10] as const;
/** How tall each kind stands, for the number plate above. */
export const KIND_HEIGHT = [0.31, 0.37, 0.2];
const METAL = "#4a4b50",
  WOOD = "#6e4528",
  LEATHER = "#4e3322",
  BLACK = "#24211f",
  BRASS = "#b99540";
function put(geometry: T.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, colour?: string) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.rotateX(rx);
  g.rotateZ(rz);
  g.rotateY(ry);
  g.translate(x, y, z);
  g.deleteAttribute("uv");
  if (colour) {
    const c = new T.Color(colour),
      count = g.attributes.position.count,
      list = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) list.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new T.BufferAttribute(list, 3));
  }
  return g;
}
const merged = (parts: T.BufferGeometry[]) => {
  const out = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  out.computeBoundingSphere();
  return out;
};
/** A cylinder along y, `r1` at the top and `r2` at the foot. */
const rod = (r1: number, r2: number, h: number, sides = 8) => new T.CylinderGeometry(r1, r2, h, sides);
function infantry() {
  const paint = [
      put(rod(0.05, 0.054, 0.018, 14), 0, 0.009, 0),
      // Legs and boots.
      put(new T.BoxGeometry(0.03, 0.095, 0.034), -0.02, 0.064, 0),
      put(new T.BoxGeometry(0.03, 0.095, 0.034), 0.02, 0.064, 0.004, 0.08),
      // The coat, flaring a little at its hem, and the shoulders.
      put(rod(0.04, 0.051, 0.115, 9), 0, 0.168, 0),
      put(new T.BoxGeometry(0.104, 0.03, 0.05), 0, 0.218, 0),
      // Arms: the left at the side, the right bent to hold the rifle at the shoulder.
      put(new T.BoxGeometry(0.025, 0.094, 0.028), -0.058, 0.172, 0, 0, 0, 0.12),
      put(new T.BoxGeometry(0.025, 0.072, 0.028), 0.056, 0.188, 0.01, -0.5, 0, -0.2),
      // Head and cap.
      put(new T.SphereGeometry(0.033, 10, 8), 0, 0.264, 0),
      put(rod(0.04, 0.035, 0.03, 12), 0, 0.297, -0.003),
    ],
    trim = [
      put(rod(0.053, 0.053, 0.013, 12), 0, 0.131, 0, 0, 0, 0, LEATHER),
      put(new T.BoxGeometry(0.06, 0.008, 0.036), 0, 0.287, 0.032, 0.25, 0, 0, BLACK),
      put(rod(0.0075, 0.0075, 0.22, 6), 0.072, 0.25, 0.016, 0.12, 0, -0.1, METAL),
      put(new T.BoxGeometry(0.02, 0.08, 0.028), 0.063, 0.13, 0.004, 0.12, 0, -0.1, WOOD),
    ];
  return { paint: merged(paint), trim: merged(trim) };
}
function cavalry() {
  const base = rod(0.058, 0.062, 0.018, 18);
  base.scale(2.05, 1, 1);
  const paint = [
      put(base, 0.01, 0.009, 0),
      // The horse: body, chest, four legs, neck, head, ears and tail.
      put(new T.CapsuleGeometry(0.05, 0.12, 4, 10), 0, 0.156, 0, 0, 0, Math.PI / 2),
      put(new T.SphereGeometry(0.052, 10, 8), 0.075, 0.166, 0),
      ...[-0.064, 0.064].flatMap((x) => [-0.025, 0.025].map((z) => put(rod(0.013, 0.015, 0.125, 6), x, 0.078, z, 0, 0, x > 0 ? -0.12 : 0.1))),
      put(rod(0.028, 0.038, 0.11, 8), 0.112, 0.224, 0, 0, 0, -0.6),
      put(new T.BoxGeometry(0.095, 0.042, 0.036), 0.162, 0.268, 0, 0, 0, -0.55),
      put(new T.ConeGeometry(0.011, 0.03, 5), 0.134, 0.307, 0.012, 0, 0, -0.3),
      put(new T.ConeGeometry(0.011, 0.03, 5), 0.134, 0.307, -0.012, 0, 0, -0.3),
      put(rod(0.008, 0.015, 0.1, 6), -0.112, 0.138, 0, 0, 0, 0.5),
      // The rider: legs either side, body, head and cap.
      put(new T.BoxGeometry(0.028, 0.075, 0.018), 0.004, 0.186, 0.056, 0.15),
      put(new T.BoxGeometry(0.028, 0.075, 0.018), 0.004, 0.186, -0.056, -0.15),
      put(rod(0.031, 0.039, 0.096, 9), -0.006, 0.262, 0),
      put(new T.SphereGeometry(0.028, 10, 8), -0.004, 0.33, 0),
      put(rod(0.033, 0.03, 0.026, 12), -0.006, 0.359, 0),
      // The sword arm, raised.
      put(new T.BoxGeometry(0.024, 0.076, 0.026), 0.034, 0.296, 0.034, 0.3, 0, -0.9),
    ],
    trim = [
      put(new T.BoxGeometry(0.074, 0.016, 0.108), -0.006, 0.206, 0, 0, 0, 0, LEATHER),
      put(new T.BoxGeometry(0.052, 0.007, 0.03), 0.016, 0.35, 0, 0, 0, 0, BLACK),
      put(new T.BoxGeometry(0.008, 0.13, 0.012), 0.108, 0.358, 0.045, 0.3, 0, -0.75, METAL),
      put(rod(0.026, 0.026, 0.009, 10), 0.108, 0.333, 0.038, 0.3, 0, -0.75 + Math.PI / 2, BRASS),
    ];
  return { paint: merged(paint), trim: merged(trim) };
}
function artillery() {
  const wheel = (z: number) => {
    const parts = [put(new T.TorusGeometry(0.066, 0.011, 6, 22), 0, 0.077, z)];
    for (let k = 0; k < 6; k++) parts.push(put(new T.BoxGeometry(0.007, 0.124, 0.007), 0, 0.077, z, 0, 0, (k * Math.PI) / 6));
    return parts;
  };
  const paint = [
      ...wheel(0.066),
      ...wheel(-0.066),
      // The barrel, wider at the breech, lifted a little, with its knob; the carriage's two cheeks running back to
      // the trail on the ground.
      put(rod(0.024, 0.036, 0.27, 12), 0.045, 0.125, 0, 0, 0, -Math.PI / 2 + 0.16),
      put(new T.SphereGeometry(0.032, 10, 8), -0.092, 0.104, 0),
      ...[-0.032, 0.032].map((z) => put(new T.BoxGeometry(0.22, 0.032, 0.016), -0.075, 0.068, z, 0, 0, 0.3)),
      put(new T.BoxGeometry(0.05, 0.022, 0.08), -0.18, 0.018, 0),
    ],
    trim = [
      put(rod(0.016, 0.016, 0.156, 8), 0, 0.077, 0, Math.PI / 2, 0, 0, METAL),
      put(new T.TorusGeometry(0.027, 0.007, 5, 14), 0.178, 0.147, 0, 0, Math.PI / 2, 0.16, BRASS),
      put(new T.TorusGeometry(0.036, 0.006, 5, 14), -0.06, 0.104, 0, 0, Math.PI / 2, 0.16, BRASS),
      put(new T.BoxGeometry(0.03, 0.012, 0.09), -0.2, 0.01, 0, 0, 0, 0, WOOD),
    ];
  return { paint: merged(paint), trim: merged(trim) };
}
/** The three kinds' geometries, in the order 보병, 기병, 포병. */
export const pieceGeometries = () => [infantry(), cavalry(), artillery()];
/** At most this many cannons stand on a territory; its plate tells the whole number. */
export const MOST_GUNS = 5;
/** The fewest pieces that make `count` armies: tens as cannons, a five as a rider, the rest on foot. */
export function piecesFor(count: number) {
  const [, five, ten] = KIND_VALUE,
    n = Math.max(0, Math.floor(count));
  return { guns: Math.floor(n / ten), riders: Math.floor((n % ten) / five), soldiers: n % five };
}
export interface Placed {
  kind: Kind;
  x: number;
  z: number;
  yaw: number;
}
/**
 * Where the pieces of `count` armies stand round the place of their armies (x across, z toward the viewer), at piece
 * scale 1: the soldiers in a row in front, the rider behind them, the cannons in rows of two at the back. Returns the
 * pieces and how far back the formation reaches.
 */
export function formation(count: number): { pieces: Placed[]; depth: number } {
  const { guns, riders, soldiers } = piecesFor(count),
    shown = Math.min(MOST_GUNS, guns),
    pieces: Placed[] = [];
  // Soldiers two abreast, the front row full first.
  for (let i = 0; i < soldiers; i++) {
    const row = Math.floor(i / 2),
      inRow = Math.min(2, soldiers - row * 2);
    pieces.push({ kind: 0, x: ((i % 2) - (inRow - 1) / 2) * 0.1, z: -row * 0.09, yaw: 0 });
  }
  let z = soldiers ? -(Math.ceil(soldiers / 2) - 1) * 0.09 - 0.12 : 0;
  if (riders) {
    pieces.push({ kind: 1, x: 0, z, yaw: 0 });
    z -= 0.17;
  } else if (soldiers) z -= 0.04;
  for (let i = 0; i < shown; i++) {
    const row = Math.floor(i / 2),
      inRow = Math.min(2, shown - row * 2);
    pieces.push({ kind: 2, x: ((i % 2) - (inRow - 1) / 2) * 0.3, z: z - row * 0.17, yaw: 0 });
  }
  if (!pieces.length) return { pieces, depth: 0 };
  // Centred, back to front, on the place of the armies.
  const half = [0.035, 0.06, 0.08];
  let front = -Infinity,
    back = Infinity;
  for (const p of pieces) {
    front = Math.max(front, p.z + half[p.kind]);
    back = Math.min(back, p.z - half[p.kind]);
  }
  const middle = (front + back) / 2;
  for (const p of pieces) p.z -= middle;
  return { pieces, depth: front - back };
}
