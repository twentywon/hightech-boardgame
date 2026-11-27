import * as T from "three";
import { cuts, ellipsoid, lathe, latheX, merge, rounded, slab, smoothSeams, smoothstep, tube } from "./sculpt";

/*
 * The big ones' shapes for 시대 전쟁 (the user asked for the units upgraded): a horse sculpted from a sphere (a deep
 * chest, a dipped back, a round rump), its neck, its long head with a narrowing muzzle, a mane and a tail; a woolly
 * mammoth with a hump, a sloping back and long hair hanging in a ragged fringe, its domed head, curling tusks and a
 * trunk; a field gun's turned bronze barrel, its carriage cheeks and spoked wheels; a tank's hull cut from its side
 * outline, a cast turret, its gun with a fume extractor and a muzzle brake, tracks round their ends, road wheels.
 * Every shape faces +x, up +y; `fine` sets how finely they are cut.
 */
const gauss = (v: number, at: number, width: number) => Math.exp(-((v - at) * (v - at)) / (width * width));

/** A sphere pushed about by `move` (given the unit direction, returns the point). */
function sculpted(fine: number, w: number, h: number, move: (d: T.Vector3, out: T.Vector3) => void) {
  const g = new T.SphereGeometry(1, cuts(fine, w, 10), cuts(fine, h, 7)),
    pos = g.attributes.position,
    d = new T.Vector3(),
    p = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    move(d, p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  return smoothSeams(g);
}

// ─────────────── The horse ───────────────
/** The horse's body (centred on its barrel, at the horse pivot's (0, 1.02, 0)). */
export const horseBody = (fine: number) =>
  sculpted(fine, 28, 18, (d, p) => {
    // A deep chest forward, the back dipping behind the withers, a round rump high behind, the belly drawn up.
    const chest = gauss(d.x, 0.8, 0.45),
      rump = gauss(d.x, -0.8, 0.4),
      down = smoothstep(0, -1, d.y),
      up = smoothstep(0, 1, d.y);
    const rx = 0.6 + 0.04 * rump,
      ry = 0.25 + 0.06 * chest * down + 0.04 * rump * up - 0.03 * gauss(d.x, 0.1, 0.35) * up - 0.02 * gauss(d.x, -0.1, 0.4) * down,
      rz = 0.22 + 0.03 * rump + 0.02 * chest;
    p.set(d.x * rx, d.y * ry + 0.04 * rump * up, d.z * rz);
  });
/** The neck from the withers up and forward (on the neck pivot), and the mane's outline along its crest. */
export const horseNeck = (fine: number) =>
  tube([new T.Vector3(-0.1, -0.06, 0), new T.Vector3(0.04, 0.12, 0), new T.Vector3(0.15, 0.3, 0), new T.Vector3(0.22, 0.4, 0)], 0.15, 0.085, cuts(fine, 10, 5), cuts(fine, 12, 6));
export const horseMane = (fine: number) =>
  slab(
    [
      [-0.16, 0.06],
      [-0.04, 0.2],
      [0.08, 0.36],
      [0.18, 0.48],
      [0.24, 0.5],
      [0.2, 0.44],
      [0.1, 0.3],
      [-0.02, 0.14],
      [-0.12, 0.02],
    ],
    0.05,
    0.012,
    cuts(fine, 2, 1),
  );
/** The head: long, the forehead broad, narrowing to the muzzle, which points forward and down (on the neck pivot). */
export function horseHead(fine: number) {
  const g = sculpted(fine, 20, 14, (d, p) => {
    const front = smoothstep(-0.6, 1, d.x);
    p.set(d.x * 0.25, d.y * (0.105 - 0.03 * front), d.z * (0.095 - 0.035 * front));
  });
  g.rotateZ(-0.85);
  g.translate(0.36, 0.36, 0);
  const parts: T.BufferGeometry[] = [g];
  for (const z of [-0.05, 0.05]) parts.push(new T.ConeGeometry(0.028, 0.1, cuts(fine, 6, 4)).rotateZ(0.3).translate(0.24, 0.56, z));
  return merge(parts);
}
/** A leg's upper part (forearm or gaskin): muscled at the top, slim to the knee (on the hip pivot). */
export const horseUpper = (fine: number) =>
  lathe(
    [
      [0.0, 0.06],
      [0.095, 0.04],
      [0.1, -0.06],
      [0.072, -0.2],
      [0.05, -0.36],
      [0.052, -0.4],
      [0.0, -0.42],
    ],
    cuts(fine, 10, 6),
    1,
    0.85,
  );
/** A leg's lower part: the slim cannon, the fetlock's round, the hoof (on the knee pivot). */
export const horseLower = (fine: number) =>
  merge([
    lathe(
      [
        [0.0, 0.02],
        [0.046, 0.01],
        [0.038, -0.12],
        [0.038, -0.26],
        [0.0, -0.28],
      ],
      cuts(fine, 8, 5),
    ),
    ellipsoid(0.05, 0.048, 0.045, cuts(fine, 8, 5), cuts(fine, 6, 4)).translate(0, -0.29, 0),
  ]);
export const hoof = (fine: number) =>
  lathe(
    [
      [0.0, -0.4],
      [0.058, -0.4],
      [0.055, -0.36],
      [0.044, -0.32],
      [0.0, -0.32],
    ],
    cuts(fine, 10, 6),
  ).translate(0.01, 0, 0);
/** The tail: a sweep of hair from the dock down and back (on the tail pivot). */
export const horseTail = (fine: number) =>
  tube([new T.Vector3(0, 0, 0), new T.Vector3(-0.1, -0.05, 0), new T.Vector3(-0.17, -0.25, 0), new T.Vector3(-0.17, -0.5, 0)], 0.05, 0.025, cuts(fine, 10, 5), cuts(fine, 8, 4));
/** The caparison: cloth over the horse's back, hanging down both flanks to just above the knees (horse pivot). */
export function caparison(fine: number) {
  const n = cuts(fine, 26, 12),
    g = new T.CylinderGeometry(1, 1, 1.1, n, 3, true),
    pos = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    // The cylinder's length becomes x; round it, an arc over the back whose two ends hang straight down the flanks.
    const along = pos.getY(i),
      phi = (uv.getX(i) - 0.5) * 2 * 2.7,
      c = Math.cos(phi),
      s = Math.sin(phi),
      rz = 0.27 + 0.02 * (1 - Math.abs(along) * 1.6),
      hang = c < 0.1;
    pos.setXYZ(i, along, hang ? 1.0 - (0.1 - c) * 0.42 : 1.02 + c * 0.29, hang ? Math.sign(s) * (rz + 0.02 + (0.1 - c) * 0.05) : s * rz);
  }
  g.computeVertexNormals();
  return g;
}

// ─────────────── The mammoth ───────────────
/** The mammoth's body: a hump high over the shoulders, the back sloping to the rump, long hair hanging in a ragged fringe (on the beast pivot, centred at (0, 1.15, 0)). */
export const mammothBody = (fine: number) =>
  sculpted(fine, 30, 20, (d, p) => {
    const hump = gauss(d.x, 0.45, 0.4) * smoothstep(0.2, 1, d.y),
      down = smoothstep(-0.2, -1, d.y),
      shag = 0.06 * Math.sin(d.x * 23 + d.z * 7) * Math.sin(d.z * 19 + d.x * 5);
    p.set(d.x * 0.86, d.y * (0.6 + 0.16 * hump) + (0.18 + shag) * down + 0.08 * hump - 0.05 * smoothstep(0, -1, d.x) * smoothstep(0, 1, d.y), d.z * (0.52 + 0.04 * down));
    p.y += 1.15 - 0.26 * Math.pow(down, 2.2);
  });
/** The domed head with its high crown (on the head pivot). */
export const mammothHead = (fine: number) =>
  sculpted(fine, 22, 16, (d, p) => {
    const crown = gauss(d.x, -0.2, 0.5) * smoothstep(0.2, 1, d.y),
      front = smoothstep(0, 1, d.x);
    p.set(d.x * (0.36 - 0.04 * front), d.y * 0.38 + crown * 0.16, d.z * (0.34 - 0.06 * front));
  });
/** A tusk curling out, down and up again (on the head pivot; `side` ±1 across). */
export const tusk = (fine: number, side: number) =>
  tube([new T.Vector3(0.22, -0.18, side * 0.14), new T.Vector3(0.42, -0.4, side * 0.2), new T.Vector3(0.72, -0.4, side * 0.24), new T.Vector3(0.86, -0.18, side * 0.2), new T.Vector3(0.84, 0.0, side * 0.12)], 0.05, 0.012, cuts(fine, 16, 7), cuts(fine, 8, 5));
/** The trunk, hanging and curling at its tip (on its own pivot, which swings). */
export const trunk = (fine: number) =>
  tube([new T.Vector3(0, 0, 0), new T.Vector3(0.12, -0.3, 0), new T.Vector3(0.1, -0.62, 0), new T.Vector3(0.18, -0.82, 0), new T.Vector3(0.28, -0.8, 0)], 0.11, 0.035, cuts(fine, 14, 6), cuts(fine, 10, 5));
/** A leg like a pillar, its hair hanging at the top, and a broad foot (`upper` on the hip, `lower` on the knee). */
export const pillarUpper = (fine: number) =>
  lathe(
    [
      [0.0, 0.08],
      [0.2, 0.06],
      [0.2, -0.1],
      [0.18, -0.3],
      [0.16, -0.5],
      [0.0, -0.52],
    ],
    cuts(fine, 12, 7),
  );
export const pillarLower = (fine: number) =>
  lathe(
    [
      [0.0, 0.04],
      [0.15, 0.02],
      [0.14, -0.2],
      [0.15, -0.34],
      [0.17, -0.42],
      [0.0, -0.43],
    ],
    cuts(fine, 12, 7),
  );
export const mammothTail = (fine: number) => merge([tube([new T.Vector3(0, 0, 0), new T.Vector3(-0.08, -0.15, 0), new T.Vector3(-0.1, -0.35, 0)], 0.035, 0.02, cuts(fine, 6, 4), cuts(fine, 6, 4)), ellipsoid(0.05, 0.08, 0.05, cuts(fine, 8, 5), cuts(fine, 6, 4)).translate(-0.1, -0.4, 0)]);

// ─────────────── The field gun ───────────────
/** The barrel turned along +x: the cascabel's knob, the breech and its rings, the long chase, the muzzle's swell. */
export const cannonBarrel = (fine: number) =>
  latheX(
    [
      [0.0, -0.44],
      [0.045, -0.43],
      [0.05, -0.4],
      [0.03, -0.38],
      [0.13, -0.36],
      [0.148, -0.34],
      [0.14, -0.06],
      [0.152, -0.04],
      [0.132, -0.01],
      [0.124, 0.2],
      [0.136, 0.22],
      [0.116, 0.24],
      [0.098, 0.84],
      [0.118, 0.9],
      [0.122, 0.95],
      [0.084, 0.96],
      [0.0, 0.96],
    ],
    cuts(fine, 18, 7),
  );
/** A carriage cheek, its side outline from the trail on the ground up to the trunnion (both cheeks, across z). */
export const cheeks = (fine: number) =>
  merge(
    [-0.15, 0.15].map((z) =>
      slab(
        [
          [-0.98, 0.04],
          [-0.86, 0.02],
          [0.22, 0.5],
          [0.26, 0.62],
          [0.18, 0.72],
          [0.02, 0.72],
          [-0.18, 0.62],
          [-0.98, 0.16],
        ],
        0.07,
        0.012,
        cuts(fine, 2, 1),
      ).translate(0, 0, z),
    ),
  );
/** A spoked wheel in its own plane (x, y), turning round z: a felloe, an iron tyre, twelve spokes and a hub. */
export function spokedWheel(fine: number) {
  const parts: T.BufferGeometry[] = [new T.TorusGeometry(0.385, 0.035, cuts(fine, 5, 3), cuts(fine, 28, 10)).scale(1, 1, 1.4)];
  const n = fine < 0.7 ? 10 : 12;
  for (let s = 0; s < n; s++) parts.push(new T.CylinderGeometry(0.014, 0.022, 0.32, cuts(fine, 6, 3), 1, true).translate(0, 0.21, 0).rotateZ((s / n) * Math.PI * 2));
  parts.push(
    lathe(
      [
        [0.0, -0.09],
        [0.05, -0.09],
        [0.075, -0.05],
        [0.075, 0.05],
        [0.05, 0.09],
        [0.0, 0.09],
      ],
      cuts(fine, 12, 6),
    ).rotateX(Math.PI / 2),
  );
  return merge(parts);
}
export const tyre = (fine: number) => new T.TorusGeometry(0.42, 0.016, cuts(fine, 4, 3), cuts(fine, 28, 12)).scale(1, 1, 3);

// ─────────────── The tank ───────────────
/** The hull cut from its side outline (a sloped glacis, a flat deck, the rear's slope) and pushed out across. */
export const hull = (fine: number) =>
  slab(
    [
      [-1.0, 0.34],
      [0.84, 0.34],
      [1.04, 0.52],
      [0.86, 0.78],
      [-0.9, 0.82],
      [-1.04, 0.66],
    ],
    1.0,
    0.03,
    cuts(fine, 3, 1),
  );
/** A track round its two end wheels: a band of links (its paint scrolls as it goes). */
export const trackLoop = (fine: number) =>
  merge([
    new T.BoxGeometry(1.95, 0.4, 0.2),
    new T.CylinderGeometry(0.2, 0.2, 0.2, cuts(fine, 12, 6), 1, false, 0, Math.PI).rotateX(Math.PI / 2).translate(0.975, 0, 0),
    new T.CylinderGeometry(0.2, 0.2, 0.2, cuts(fine, 12, 6), 1, false, Math.PI, Math.PI).rotateX(Math.PI / 2).translate(-0.975, 0, 0),
  ]);
/** A road wheel turning round z: its rubber tyre, a dished steel disc and a hub with bolts. */
export function roadWheel(fine: number) {
  if (fine < 0.7) return new T.CylinderGeometry(0.11, 0.11, 0.07, 7).rotateX(Math.PI / 2);
  return merge([
    lathe(
      [
        [0.0, -0.03],
        [0.11, -0.03],
        [0.12, -0.012],
        [0.06, 0.0],
        [0.04, 0.03],
        [0.0, 0.035],
      ],
      cuts(fine, 16, 8),
    ).rotateX(Math.PI / 2),
  ]);
}
export const tyreTank = (fine: number) => new T.CylinderGeometry(0.15, 0.15, 0.055, cuts(fine, 18, 8)).rotateX(Math.PI / 2);
/** A sprocket: a toothed ring round its hub. */
export function sprocket(fine: number) {
  const parts: T.BufferGeometry[] = [new T.CylinderGeometry(0.1, 0.1, 0.06, cuts(fine, 12, 6)).rotateX(Math.PI / 2)];
  const n = fine < 0.7 ? 0 : 10;
  for (let s = 0; s < n; s++) parts.push(new T.BoxGeometry(0.035, 0.05, 0.05).translate(0, 0.115, 0).rotateZ((s / n) * Math.PI * 2));
  if (!n) return new T.CylinderGeometry(0.125, 0.125, 0.06, 6).rotateX(Math.PI / 2);
  return merge(parts);
}
/** The cast turret: rounded, its sides sloping in, flat underneath (on the turret pivot). */
export const turretShape = (fine: number) =>
  ((): T.BufferGeometry => {
    const g = new T.SphereGeometry(1, cuts(fine, 26, 10), cuts(fine, 16, 5), 0, Math.PI * 2, 0, Math.PI / 2),
      pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      // Longer behind (the bustle), a little pointed forward.
      const rx = x > 0 ? 0.46 : 0.56;
      pos.setXYZ(i, x * rx, y * 0.3, z * (0.42 - 0.05 * Math.max(0, x)));
    }
    g.computeVertexNormals();
    return merge([g, new T.CylinderGeometry(0.44, 0.47, 0.06, cuts(fine, 20, 10)).scale(1.1, 1, 0.92).translate(-0.04, 0.01, 0)]);
  })();
/** The gun turned along +x: its mount, a fume extractor halfway, the muzzle brake at the end. */
export const tankGun = (fine: number) =>
  latheX(
    [
      [0.0, -0.05],
      [0.1, -0.05],
      [0.1, 0.16],
      [0.06, 0.2],
      [0.052, 0.6],
      [0.075, 0.64],
      [0.075, 0.86],
      [0.05, 0.9],
      [0.047, 1.28],
      [0.08, 1.3],
      [0.08, 1.42],
      [0.0, 1.42],
    ],
    cuts(fine, 14, 6),
  );
/** The mantlet before the turret's face. */
export const mantlet = (fine: number) => rounded(0.14, 0.2, 0.34, 0.05, fine);
/** The commander's cupola. */
export const cupola = (fine: number) =>
  lathe(
    [
      [0.0, 0.0],
      [0.13, 0.0],
      [0.13, 0.07],
      [0.115, 0.09],
      [0.1, 0.1],
      [0.0, 0.1],
    ],
    cuts(fine, 14, 7),
  );
