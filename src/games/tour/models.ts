import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block } from "../../engine/scene-utils";

/**
 * The world tour's modelled things, all in code: the travellers' pieces (an airplane, a ship, a car and a hot-air
 * balloon, each on a round foot in its traveller's colour), the island with its palm, the rocket, the spacecraft,
 * the peace fund's chest and the bank's tray. Parts of one stuff are merged into one mesh, so a model costs a few
 * draws however many parts it has.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A part placed: moved to (x, y, z), turned (rx, ry, rz) and stretched (sx, sy, sz). */
export function at(geometry: T.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz)));
  return geometry;
}
/** Parts gathered by material and merged into one mesh each. */
export class Kit {
  private parts = new Map<T.Material, T.BufferGeometry[]>();
  constructor(private readonly own: Own) {}
  add(geometry: T.BufferGeometry, material: T.Material) {
    // Merged parts must agree in form: plain lists of triangles with a position, a normal and a picture place.
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    if (!g.getAttribute("uv")) g.setAttribute("uv", new T.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    g.clearGroups();
    const list = this.parts.get(material) ?? [];
    list.push(g);
    this.parts.set(material, list);
    return this;
  }
  /** One mesh a material, in a group. */
  build(cast = true, receive = false) {
    const group = new T.Group();
    for (const [material, list] of this.parts) {
      const merged = this.own(list.length === 1 ? list[0] : mergeGeometries(list, false)!);
      if (list.length > 1) for (const g of list) g.dispose();
      const mesh = new T.Mesh(merged, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}
export interface Paints {
  /** The traveller's colour. */
  paint: T.Material;
  cream: T.Material;
  dark: T.Material;
  glass: T.Material;
  metal: T.Material;
  gold: T.Material;
  wicker: T.Material;
  red: T.Material;
}
/** A turned shape from a profile of [radius, height] pairs. */
const lathe = (profile: [number, number][], segments = 24, from = 0, length = Math.PI * 2) =>
  new T.LatheGeometry(
    profile.map(([r, y]) => new T.Vector2(r, y)),
    segments,
    from,
    length,
  );
/** A flat shape seen from above (x across, f forward), given thickness upward from y = 0. */
function slab(points: [number, number][], depth: number, bevel = 0.008) {
  const shape = new T.Shape(points.map(([x, f]) => new T.Vector2(x, -f)));
  const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  // The extrusion runs along z; turned, it rises along y and the shape's forward points to +z.
  g.rotateX(-Math.PI / 2);
  return g;
}
/**
 * A traveller's piece: 0 an airplane, 1 a ship, 2 a car, 3 a hot-air balloon. It faces +z and stands on y = 0;
 * the foot is in its traveller's colour with a cream top, like a playing piece.
 */
export function travellerModel(kind: number, p: Paints, own: Own) {
  const kit = new Kit(own);
  kit.add(at(new T.CylinderGeometry(0.17, 0.185, 0.05, 32), 0, 0.025), p.paint);
  kit.add(at(new T.CylinderGeometry(0.145, 0.145, 0.008, 32), 0, 0.052), p.cream);
  if (kind === 0) {
    // An airplane on a stand.
    kit.add(at(new T.CylinderGeometry(0.018, 0.028, 0.22, 10), 0, 0.165), p.metal);
    kit.add(at(new T.CapsuleGeometry(0.056, 0.26, 6, 16), 0, 0.31, 0, Math.PI / 2), p.paint);
    kit.add(at(new T.BoxGeometry(0.114, 0.022, 0.17), 0, 0.325, 0.03), p.glass);
    kit.add(at(block(0.46, 0.018, 0.105, 0.008), 0, 0.3, 0.025), p.paint);
    kit.add(at(block(0.18, 0.014, 0.06, 0.006), 0, 0.33, -0.165), p.paint);
    kit.add(at(block(0.014, 0.1, 0.075, 0.006), 0, 0.38, -0.17, 0.25), p.cream);
    kit.add(at(new T.ConeGeometry(0.028, 0.05, 12), 0, 0.31, 0.205, Math.PI / 2), p.cream);
    kit.add(at(new T.BoxGeometry(0.17, 0.016, 0.01), 0, 0.31, 0.225, 0, 0, 0.5), p.dark);
    for (const x of [-0.13, 0.13]) kit.add(at(new T.CylinderGeometry(0.022, 0.022, 0.06, 10), x, 0.29, 0.045, Math.PI / 2), p.cream);
  } else if (kind === 1) {
    // A ship: a pointed hull, a white superstructure, a funnel in the traveller's colour.
    kit.add(at(slab([[-0.085, -0.17], [0.085, -0.17], [0.092, 0.05], [0, 0.215], [-0.092, 0.05]], 0.07, 0.01), 0, 0.058), p.paint);
    kit.add(at(slab([[-0.08, -0.16], [0.08, -0.16], [0.086, 0.04], [0, 0.19], [-0.086, 0.04]], 0.012, 0), 0, 0.137), p.cream);
    kit.add(at(block(0.13, 0.07, 0.16, 0.012), 0, 0.185, -0.03), p.cream);
    kit.add(at(new T.BoxGeometry(0.132, 0.018, 0.12), 0, 0.2, -0.01), p.glass);
    kit.add(at(block(0.1, 0.05, 0.09, 0.01), 0, 0.245, -0.05), p.cream);
    kit.add(at(new T.BoxGeometry(0.102, 0.014, 0.05), 0, 0.255, -0.02), p.glass);
    kit.add(at(new T.CylinderGeometry(0.03, 0.035, 0.1, 16), 0, 0.31, -0.07), p.paint);
    kit.add(at(new T.CylinderGeometry(0.031, 0.031, 0.022, 16), 0, 0.368, -0.07), p.dark);
    kit.add(at(new T.CylinderGeometry(0.005, 0.006, 0.17, 6), 0, 0.23, 0.11), p.dark);
    for (const z of [-0.1, -0.02, 0.06]) for (const x of [-0.094, 0.094]) kit.add(at(new T.CylinderGeometry(0.011, 0.011, 0.01, 10), x, 0.105, z, 0, 0, Math.PI / 2), p.cream);
  } else if (kind === 2) {
    // A small car: a rounded body, a glass cabin under a roof, four tyres with hubs.
    kit.add(at(block(0.2, 0.085, 0.37, 0.035), 0, 0.128), p.paint);
    kit.add(at(block(0.17, 0.08, 0.19, 0.03), 0, 0.2, -0.03), p.glass);
    kit.add(at(block(0.175, 0.02, 0.16, 0.009), 0, 0.243, -0.035), p.paint);
    for (const x of [-0.1, 0.1])
      for (const z of [-0.115, 0.115]) {
        kit.add(at(new T.CylinderGeometry(0.05, 0.05, 0.038, 18), x, 0.1, z, 0, 0, Math.PI / 2), p.dark);
        kit.add(at(new T.CylinderGeometry(0.024, 0.024, 0.041, 12), x, 0.1, z, 0, 0, Math.PI / 2), p.metal);
      }
    for (const x of [-0.06, 0.06]) {
      kit.add(at(new T.SphereGeometry(0.019, 10, 8), x, 0.135, 0.183), p.cream);
      kit.add(at(new T.BoxGeometry(0.03, 0.018, 0.01), x, 0.14, -0.184), p.red);
    }
    kit.add(at(block(0.21, 0.022, 0.024, 0.008), 0, 0.093, 0.19), p.metal);
    kit.add(at(block(0.21, 0.022, 0.024, 0.008), 0, 0.093, -0.19), p.metal);
  } else {
    // A hot-air balloon over its basket: gores of cream in the envelope, ropes and a burner.
    kit.add(at(new T.CylinderGeometry(0.012, 0.02, 0.1, 8), 0, 0.1), p.metal);
    kit.add(at(block(0.1, 0.075, 0.1, 0.012), 0, 0.185), p.wicker);
    kit.add(at(new T.CylinderGeometry(0.018, 0.022, 0.03, 10), 0, 0.255), p.dark);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const rope = new T.CylinderGeometry(0.0035, 0.0035, 0.11, 4);
      rope.rotateZ(-x * 0.22);
      rope.rotateX(z * 0.22);
      kit.add(at(rope, x * 0.052, 0.275, z * 0.052), p.dark);
    }
    const profile: [number, number][] = [
        [0.035, 0],
        [0.05, 0.03],
        [0.095, 0.08],
        [0.135, 0.15],
        [0.15, 0.21],
        [0.142, 0.27],
        [0.11, 0.32],
        [0.06, 0.35],
        [0.0, 0.36],
      ],
      bottom = 0.32;
    kit.add(at(lathe(profile, 28), 0, bottom), p.paint);
    for (let i = 0; i < 4; i++)
      kit.add(
        at(
          lathe(
            profile.map(([r, y]) => [r * 1.012, y]),
            4,
            (i * Math.PI) / 2,
            Math.PI / 7,
          ),
          0,
          bottom,
        ),
        p.cream,
      );
  }
  return kit.build();
}
/** How far each kind of piece stands above its foot when bobbing gently (the balloon floats, the ship rocks). */
export const IDLE = [
  { lift: 0.012, roll: 0.06, pitch: 0.02, speed: 1.1 },
  { lift: 0, roll: 0.05, pitch: 0.04, speed: 0.9 },
  { lift: 0, roll: 0, pitch: 0.015, speed: 1.6 },
  { lift: 0.025, roll: 0.03, pitch: 0.03, speed: 0.7 },
];
/** A palm: a curved, ringed trunk leaning out and a crown of drooping fronds. */
function palm(kit: Kit, bark: T.Material, leaves: T.Material, nut: T.Material, height: number, lean: number, turn: number, ox = 0, oz = 0) {
  const curve = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(lean * 0.3, height * 0.4, 0), new T.Vector3(lean * 0.75, height * 0.75, 0), new T.Vector3(lean, height, 0)]),
    top = curve.getPoint(1),
    spin = (g: T.BufferGeometry) => g.rotateY(turn).translate(ox, 0, oz);
  kit.add(spin(new T.TubeGeometry(curve, 12, height * 0.055, 8, false)), bark);
  for (let i = 1; i < 7; i++) {
    const ring = new T.TorusGeometry(height * 0.058, height * 0.012, 4, 10),
      point = curve.getPoint(i / 7);
    ring.lookAt(curve.getTangent(i / 7));
    ring.translate(point.x, point.y, point.z);
    kit.add(spin(ring), bark);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    kit.add(spin(at(new T.SphereGeometry(height * 0.06, 8, 6), top.x + Math.cos(a) * height * 0.06, top.y - height * 0.05, top.z + Math.sin(a) * height * 0.06)), nut);
  }
  const reach = height * 0.75;
  for (let i = 0; i < 8; i++) {
    // A frond: a rib drooping along its length with narrow leaflets either side, made as triangles seen from both
    // sides (no picture and no cut-out, so that it costs no shader of its own).
    const rib = (t: number) => new T.Vector3(t * reach, -t * t * reach * 0.75, 0),
      points: number[] = [];
    const face = (a: T.Vector3, b: T.Vector3, c: T.Vector3) => {
      points.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      points.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
    };
    for (let k = 0; k < 11; k++) {
      const t = 0.1 + k * 0.08,
        long = reach * 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + reach * 0.03;
      for (const side of [-1, 1]) {
        const tip = rib(Math.min(1, t + 0.06)).add(new T.Vector3(0, -long * 0.45, side * long));
        face(rib(t - 0.035), rib(t + 0.035), tip);
      }
    }
    face(rib(0), rib(1).add(new T.Vector3(0, 0.004, 0)), rib(0.5).add(new T.Vector3(0, 0.006, 0.006)));
    const blade = new T.BufferGeometry();
    blade.setAttribute("position", new T.Float32BufferAttribute(points, 3));
    blade.computeVertexNormals();
    blade.rotateZ(0.3 + (i % 2) * 0.15);
    blade.rotateY((i / 8) * Math.PI * 2 + 0.3);
    blade.translate(top.x, top.y, top.z);
    kit.add(spin(blade), leaves);
  }
}
export interface Scenery {
  sand: T.Material;
  sea: T.Material;
  bark: T.Material;
  frond: T.Material;
  white: T.Material;
  red: T.Material;
  dark: T.Material;
  glass: T.Material;
  metal: T.Material;
  gold: T.Material;
  chest: T.Material;
  rock: T.Material;
}
/** 무인도: a sandy islet in a ring of shallow water, with two palms and a rock. */
export function island(s: Scenery, own: Own) {
  const kit = new Kit(own);
  kit.add(at(new T.CylinderGeometry(0.29, 0.3, 0.016, 36), 0, 0.008), s.sea);
  kit.add(at(new T.SphereGeometry(0.22, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.012, 0, 0, 0, 0, 1, 0.32, 0.9), s.sand);
  kit.add(at(new T.DodecahedronGeometry(0.05, 0), 0.13, 0.03, 0.08, 0.3, 0.5, 0, 1, 0.7, 1), s.rock);
  const group = kit.build(true, true),
    trees = new Kit(own);
  // Two palms a little apart, leaning away from each other.
  palm(trees, s.bark, s.frond, s.bark, 0.46, 0.12, 0.4, -0.05, 0.02);
  palm(trees, s.bark, s.frond, s.bark, 0.32, 0.1, 2.9, 0.08, -0.06);
  const crown = trees.build(true, false);
  crown.position.y = 0.05;
  group.add(crown);
  return group;
}
/** 우주여행: a rocket standing on its pad. */
export function rocket(s: Scenery, own: Own) {
  const kit = new Kit(own);
  kit.add(at(new T.CylinderGeometry(0.2, 0.23, 0.04, 28), 0, 0.02), s.metal);
  kit.add(at(new T.CylinderGeometry(0.04, 0.058, 0.05, 16), 0, 0.075), s.dark);
  const body: [number, number][] = [
    [0, 0],
    [0.06, 0],
    [0.075, 0.06],
    [0.078, 0.24],
    [0.07, 0.31],
    [0.048, 0.38],
    [0.018, 0.43],
    [0, 0.445],
  ];
  kit.add(at(lathe(body, 28), 0, 0.1), s.white);
  kit.add(at(lathe(body.slice(4).map(([r, y]) => [r * 1.02, y]), 28), 0, 0.1), s.red);
  kit.add(at(new T.CylinderGeometry(0.0795, 0.0795, 0.025, 28), 0, 0.24), s.red);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + 0.5,
      fin = slab([[0, -0.06], [0.0, 0.05], [0.07, -0.02], [0.08, -0.08]], 0.012, 0.003);
    // The fin's flat shape stands upright, its root along the body, its tip swept down.
    fin.rotateX(-Math.PI / 2);
    fin.rotateY(a);
    kit.add(at(fin, Math.cos(a) * 0.07, 0.17, -Math.sin(a) * 0.07), s.red);
  }
  kit.add(at(new T.CylinderGeometry(0.024, 0.024, 0.01, 18), 0, 0.3, 0.074, Math.PI / 2), s.glass);
  return kit.build();
}
/** 콜롬비아호: a winged spacecraft on a low stand, nose raised. */
export function spacecraft(s: Scenery, own: Own) {
  const kit = new Kit(own),
    craft = new Kit(own);
  kit.add(at(new T.CylinderGeometry(0.12, 0.13, 0.03, 24), 0, 0.015), s.metal);
  kit.add(at(new T.CylinderGeometry(0.012, 0.016, 0.12, 8), 0, 0.09), s.metal);
  craft.add(at(new T.CapsuleGeometry(0.048, 0.3, 6, 16), 0, 0, 0, Math.PI / 2), s.white);
  craft.add(at(new T.ConeGeometry(0.049, 0.07, 16), 0, 0, 0.215, Math.PI / 2), s.dark);
  craft.add(at(slab([[-0.17, -0.17], [0.17, -0.17], [0.05, 0.02], [0, 0.12], [-0.05, 0.02]], 0.012, 0.004), 0, -0.03), s.white);
  craft.add(at(slab([[-0.165, -0.165], [0.165, -0.165], [0.05, 0.02], [0, 0.11], [-0.05, 0.02]], 0.004, 0), 0, -0.036), s.dark);
  craft.add(at(slab([[0, -0.2], [0, -0.06], [0.11, -0.2]], 0.012, 0.003).rotateZ(Math.PI / 2), 0.006, 0.03), s.white);
  craft.add(at(new T.BoxGeometry(0.06, 0.02, 0.05), 0, 0.045, 0.12), s.glass);
  for (const x of [-0.025, 0.025]) craft.add(at(new T.CylinderGeometry(0.02, 0.026, 0.04, 12), x, 0.005, -0.2, Math.PI / 2), s.dark);
  const group = kit.build(),
    body = craft.build();
  body.position.y = 0.17;
  body.rotation.x = -0.35;
  group.add(body);
  return group;
}
/** 인류평화기금: a chest bound in gold, with a few coins beside it. */
export function chest(s: Scenery, own: Own) {
  const kit = new Kit(own);
  kit.add(at(block(0.34, 0.16, 0.22, 0.015), 0, 0.08), s.chest);
  kit.add(at(new T.CylinderGeometry(0.11, 0.11, 0.34, 20, 1, false, 0, Math.PI), 0, 0.16, 0, 0, 0, Math.PI / 2), s.chest);
  for (const x of [-0.12, 0.12]) {
    kit.add(at(new T.BoxGeometry(0.03, 0.165, 0.226), x, 0.08), s.gold);
    kit.add(at(new T.CylinderGeometry(0.114, 0.114, 0.03, 20, 1, false, 0, Math.PI), x, 0.16, 0, 0, 0, Math.PI / 2), s.gold);
  }
  kit.add(at(new T.BoxGeometry(0.05, 0.06, 0.02), 0, 0.15, 0.115), s.gold);
  for (const [x, z, y] of [
    [0.24, 0.05, 0],
    [0.22, -0.06, 0],
    [0.235, 0.0, 0.013],
    [-0.23, 0.07, 0],
  ])
    kit.add(at(new T.CylinderGeometry(0.035, 0.035, 0.012, 18), x, 0.006 + y, z), s.gold);
  return kit.build();
}
/** The bank: a wooden tray with piles of banknotes, each pile tinted its own colour. */
export function bankTray(tray: T.Material, piles: T.Material[][], own: Own) {
  const kit = new Kit(own);
  kit.add(at(block(0.84, 0.05, 1.2, 0.02), 0, 0.025), tray);
  for (const [x, z, w, d] of [
    [0, 0.58, 0.84, 0.04],
    [0, -0.58, 0.84, 0.04],
    [0.4, 0, 0.04, 1.2],
    [-0.4, 0, 0.04, 1.2],
  ])
    kit.add(at(block(w, 0.1, d, 0.015), x, 0.07, z), tray);
  const group = kit.build(true, true);
  piles.forEach((faces, i) => {
    // A pile lies the long way across the tray, as a note does.
    const pile = new T.Mesh(own(block(0.64, 0.05 + i * 0.03, 0.32, 0.008)), faces);
    pile.position.set(0, 0.05 + (0.05 + i * 0.03) / 2, -0.36 + i * 0.36);
    pile.rotation.y = (i - 1) * 0.05;
    pile.castShadow = true;
    pile.receiveShadow = true;
    group.add(pile);
  });
  return group;
}
