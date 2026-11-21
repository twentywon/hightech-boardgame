import * as T from "three";
import { furry, stuff } from "../../engine/scene-utils";
import { EDGE, LAKE, inLake, type Kind } from "./hunt";
import { canvas, sequence, skyDome, texture } from "./paint";

type Keep = <R extends { dispose(): void }>(resource: R) => R;
/**
 * A wood by a lake at dusk, all modelled and painted in code: the shooter stands in a low hide at the wood's edge, a
 * meadow runs down to the lake with the wood closing in at both sides and along the far shore, reeds at the water's
 * edge, rocks, and a sky going from orange over the far trees to deep blue. The water mirrors the far shore cheaply:
 * the trees are drawn again upside down under a half-clear surface painted with the sky's colours (no second camera,
 * so that a software-drawn page keeps its pace). The animals are modelled here too (`animalModel`).
 */
export interface Forest {
  /** The water's paint, whose ripples the view moves. */
  water: T.Mesh;
}
export function buildForest(scene: T.Scene, keep: Keep): Forest {
  const std = (o: T.MeshStandardMaterialParameters) => keep(new T.MeshStandardMaterial({ roughness: 0.85, ...o })),
    put = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, parent: T.Object3D = scene) => {
      const mesh = new T.Mesh(keep(g), m);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    },
    random = sequence(523);
  scene.add(skyDome(keep, "#ffb070", "#d4889a", "#2a3a72", "#ffd08a", 0.25, 460));
  scene.fog = new T.Fog("#9a7f92", 50, 210);
  // The meadow: grass with a hole where the lake lies (the lake bed under it is darker).
  const { c: grassC, ctx: g } = canvas(512, 512);
  g.fillStyle = "#62823f";
  g.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 6000; k++) {
    g.fillStyle = random() < 0.5 ? "rgba(30,45,15,0.22)" : "rgba(190,200,120,0.12)";
    g.fillRect(random() * 512, random() * 512, 1.5, 3 + random() * 4);
  }
  const meadowShape = new T.Shape();
  meadowShape.moveTo(-300, 300);
  meadowShape.lineTo(300, 300);
  meadowShape.lineTo(300, -300);
  meadowShape.lineTo(-300, -300);
  meadowShape.closePath();
  const hole = new T.Path();
  for (let k = 0; k <= 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    hole.lineTo(LAKE.x + Math.cos(a) * LAKE.rx, -(LAKE.z + Math.sin(a) * LAKE.rz));
  }
  meadowShape.holes.push(hole);
  const meadowGeometry = new T.ShapeGeometry(meadowShape, 2);
  // Plane UVs over the shape, so that the grass repeats evenly.
  const uv = meadowGeometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 12, uv.getY(i) / 12);
  const grassMap = texture(grassC, keep);
  grassMap.wrapS = grassMap.wrapT = T.RepeatWrapping;
  const meadow = put(meadowGeometry, std({ ...stuff("grass", "#62823f", 1, keep), map: grassMap }), 0, 0, 0);
  meadow.rotation.x = -Math.PI / 2;
  // The lake's bed and banks, sloping down under the water.
  const bed = put(new T.CircleGeometry(1, 48), std({ color: "#2d3324" }), LAKE.x, LAKE.y - 0.6, LAKE.z);
  bed.rotation.x = -Math.PI / 2;
  bed.scale.set(LAKE.rx, LAKE.rz, 1);
  const bank = put(new T.CylinderGeometry(1, 1.0, 0.62, 48, 1, true), std({ color: "#4a4630", side: T.BackSide }), LAKE.x, LAKE.y - 0.3, LAKE.z);
  bank.scale.set(LAKE.rx, 1, LAKE.rz);
  // Trees: dark conifers and round broadleaves round the meadow, on the far shore and in the wood at both sides.
  const trunk = keep(new T.CylinderGeometry(0.18, 0.3, 1, 6)),
    cone = keep(new T.ConeGeometry(1, 1, 8)),
    ball = keep(new T.IcosahedronGeometry(1, 1)),
    bark = std({ color: "#3e2f22" }),
    needles = [std({ color: "#20361f", flatShading: true }), std({ color: "#2a4424", flatShading: true })],
    broad = [std({ color: "#3d5a29", flatShading: true }), std({ color: "#55602c", flatShading: true })],
    lists = { trunk: [] as T.Matrix4[], cone: [[], []] as T.Matrix4[][], ball: [[], []] as T.Matrix4[][] },
    mirrored = { trunk: [] as T.Matrix4[], cone: [[], []] as T.Matrix4[][], ball: [[], []] as T.Matrix4[][] },
    q = new T.Quaternion();
  const tree = (x: number, z: number) => {
    const conifer = random() < 0.6,
      h = conifer ? 8 + random() * 9 : 6 + random() * 5,
      w = conifer ? 1.8 + random() * 1.2 : 2.4 + random() * 1.8,
      which = Math.floor(random() * 2),
      // The far shore's trees, seen across the water, are mirrored in it.
      mirror = z < LAKE.z - LAKE.rz * 0.4 && Math.abs(x - LAKE.x) < LAKE.rx + 10;
    const add = (to: typeof lists) => {
      const s = to === lists ? 1 : -1,
        y0 = to === lists ? 0 : 2 * LAKE.y;
      to.trunk.push(new T.Matrix4().compose(new T.Vector3(x, y0 + s * h * 0.2, z), q, new T.Vector3(1, h * 0.4 * s, 1)));
      if (conifer) {
        for (let k = 0; k < 3; k++) {
          const lift = h * (0.38 + k * 0.2),
            size = w * (1 - k * 0.26);
          to.cone[which].push(new T.Matrix4().compose(new T.Vector3(x, y0 + s * lift, z), q, new T.Vector3(size, h * 0.36 * s, size)));
        }
      } else to.ball[which].push(new T.Matrix4().compose(new T.Vector3(x, y0 + s * h * 0.62, z), q, new T.Vector3(w, w * 0.9 * s, w)));
    };
    add(lists);
    if (mirror) add(mirrored);
  };
  for (let x = -140; x < 160; x += 3.5 + random() * 3) tree(x, LAKE.z - LAKE.rz - 4 - random() * 30);
  for (const side of [-1, 1]) {
    for (let z = 4; z > -110; z -= 3 + random() * 3) tree(side * (EDGE + 4 + random() * 8), z);
    for (let z = 2; z > -110; z -= 5 + random() * 4) tree(side * (EDGE + 14 + random() * 30), z);
  }
  // A few near trees at the edges of the view frame the meadow from the hide.
  for (const [x, z] of [[-14, -6], [-19, -9], [17, -7], [23, -11], [-30, -14], [31, -16]]) tree(x, z);
  const instanced = (geometry: T.BufferGeometry, material: T.Material, list: T.Matrix4[], shadow: boolean) => {
    if (!list.length) return null;
    const mesh = new T.InstancedMesh(geometry, material, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = shadow;
    scene.add(mesh);
    return mesh;
  };
  instanced(trunk, bark, lists.trunk, true);
  lists.cone.forEach((list, i) => instanced(cone, needles[i], list, true));
  lists.ball.forEach((list, i) => instanced(ball, broad[i], list, true));
  // The mirrored trees are seen from below their own surfaces, so both sides are drawn, darker as water darkens them.
  const shade = (m: T.MeshStandardMaterial) => keep(new T.MeshStandardMaterial({ color: m.color.clone().multiplyScalar(0.7), side: T.DoubleSide, flatShading: true, roughness: 1 }));
  instanced(trunk, shade(bark), mirrored.trunk, false);
  mirrored.cone.forEach((list, i) => instanced(cone, shade(needles[i]), list, false));
  mirrored.ball.forEach((list, i) => instanced(ball, shade(broad[i]), list, false));
  // The water: the sky's colours painted on it, darker toward me, half clear over the mirrored shore, with ripples.
  const { c: waterC, ctx: w } = canvas(256, 256),
    gradient = w.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#f0a878");
  gradient.addColorStop(0.35, "#b98196");
  gradient.addColorStop(1, "#2c3558");
  w.fillStyle = gradient;
  w.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 220; k++) {
    w.strokeStyle = `rgba(255,${200 + random() * 55},${180 + random() * 60},${0.05 + random() * 0.12})`;
    w.lineWidth = 1;
    const y = random() * 256,
      x = random() * 256;
    w.beginPath();
    w.moveTo(x, y);
    w.lineTo(x + 12 + random() * 30, y);
    w.stroke();
  }
  const waterMap = texture(waterC, keep),
    water = put(new T.CircleGeometry(1, 64), keep(new T.MeshStandardMaterial({ map: waterMap, transparent: true, opacity: 0.74, roughness: 0.2, metalness: 0.1, depthWrite: false })), LAKE.x, LAKE.y, LAKE.z);
  water.rotation.x = -Math.PI / 2;
  water.scale.set(LAKE.rx, LAKE.rz, 1);
  water.renderOrder = 2;
  // Reeds round the water's edge (not on the near shore, where the ducks are watched), and tufts on the meadow.
  const blade = keep(new T.ConeGeometry(0.03, 1, 3).translate(0, 0.5, 0)),
    reed = std({ color: "#7d7a3c", flatShading: true }),
    reedsAt: T.Matrix4[] = [];
  for (let k = 0; k < 520; k++) {
    const a = random() * Math.PI * 2,
      out = 1 + random() * 0.08,
      x = LAKE.x + Math.cos(a) * LAKE.rx * out,
      z = LAKE.z + Math.sin(a) * LAKE.rz * out;
    if (Math.sin(a) > 0.55 && random() < 0.75) continue;
    reedsAt.push(new T.Matrix4().compose(new T.Vector3(x, 0, z), new T.Quaternion().setFromEuler(new T.Euler((random() - 0.5) * 0.4, random() * 6, (random() - 0.5) * 0.4)), new T.Vector3(1, 1.2 + random() * 1.4, 1)));
  }
  for (let k = 0; k < 420; k++) {
    const x = (random() - 0.5) * 2 * EDGE,
      z = -4 - random() * 40;
    if (inLake(x, z)) continue;
    reedsAt.push(new T.Matrix4().compose(new T.Vector3(x, 0, z), new T.Quaternion().setFromEuler(new T.Euler((random() - 0.5) * 0.6, random() * 6, (random() - 0.5) * 0.6)), new T.Vector3(1.4, 0.35 + random() * 0.4, 1.4)));
  }
  instanced(blade, reed, reedsAt, false);
  // Rocks on the meadow and at the shore.
  const rock = keep(new T.DodecahedronGeometry(1, 0)),
    stone = std({ ...stuff("stone", "#75726a", 1, keep), flatShading: true });
  for (const [x, z, s] of [[-8, -16, 0.9], [-24, -24, 1.4], [26, -20, 1.1], [14, -11, 0.7], [-30, -36, 1.2], [42, -34, 1.6]]) {
    const r = put(rock, stone, x, s * 0.3, z);
    r.scale.set(s, s * 0.6, s * 1.1);
    r.rotation.y = random() * 6;
    r.castShadow = true;
  }
  // The stand: a platform of planks on four posts at the wood's edge, a rail of rough logs before the shooter.
  const log = std({ color: "#5a4330", roughness: 0.95 }),
    deck = 4.4;
  put(new T.CylinderGeometry(0.07, 0.08, 2.6, 8), log, 0, deck + 0.95, -0.85).rotation.z = Math.PI / 2;
  for (const x of [-1.15, 1.15]) put(new T.CylinderGeometry(0.07, 0.08, 1.1, 8), log, x, deck + 0.5, -0.85);
  put(new T.BoxGeometry(2.6, 0.08, 1.6), log, 0, deck, -0.2);
  for (const [x, z] of [[-1.15, -0.9], [1.15, -0.9], [-1.15, 0.5], [1.15, 0.5]]) put(new T.CylinderGeometry(0.09, 0.11, deck, 8), log, x, deck / 2, z);
  for (const y of [1.4, 3.2]) put(new T.CylinderGeometry(0.05, 0.05, 2.4, 6), log, 0, y, -0.9).rotation.z = Math.PI / 2;
  // Dusk light: a low warm sun beyond the lake, a purple sky light, a cool fill from behind.
  scene.add(new T.HemisphereLight("#cdbdec", "#5a6a3a", 1.7));
  const sun = new T.DirectionalLight("#ffb27a", 2.1);
  sun.position.set(30, 22, -120);
  sun.target.position.set(0, 0, -25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 40, bottom: -40, near: 60, far: 220 });
  sun.shadow.normalBias = 0.08;
  keep(sun.shadow);
  scene.add(sun, sun.target);
  const fill = new T.DirectionalLight("#8fa6ff", 0.5);
  fill.position.set(-10, 15, 20);
  scene.add(fill);
  return { water };
}
/** An animal as built: its parts that the view moves (legs and wings swing about their joints, the head nods). */
export interface AnimalModel {
  root: T.Group;
  /** The body, rolled over as it falls. */
  body: T.Group;
  legs: T.Object3D[];
  wings: T.Object3D[];
  head: T.Object3D;
  /** Its own paints, faded when it has fallen and thrown away with it. */
  paints: T.Material[];
  geometries: T.BufferGeometry[];
}
/** An animal of `id`, modelled from plain solids in its own frame (z ahead, y up, its feet at 0; a bird about its body). */
export function animalModel(id: Kind["id"]): AnimalModel {
  const root = new T.Group(),
    body = new T.Group(),
    paints: T.Material[] = [],
    geometries: T.BufferGeometry[] = [],
    legs: T.Object3D[] = [],
    wings: T.Object3D[] = [];
  root.add(body);
  const mat = (o: T.MeshStandardMaterialParameters, fur = 0) => {
      const m = fur ? furry({ roughness: 0.9, transparent: true, ...o }, fur, 2, 2) : new T.MeshStandardMaterial({ roughness: 0.7, transparent: true, ...o });
      paints.push(m);
      return m;
    },
    shape = <G extends T.BufferGeometry>(g: G) => {
      geometries.push(g);
      return g;
    },
    part = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, parent: T.Object3D = body) => {
      const mesh = new T.Mesh(shape(g), m);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    },
    sphere = () => new T.SphereGeometry(1, 16, 12),
    /** A leg hung from a joint at (x, y, z): a thigh, a shin and a hoof or foot, swinging about the joint. */
    leg = (x: number, y: number, z: number, length: number, thick: number, coat: T.Material, foot: T.Material) => {
      const joint = new T.Group();
      joint.position.set(x, y, z);
      body.add(joint);
      part(new T.CapsuleGeometry(thick, length * 0.45, 4, 8), coat, 0, -length * 0.28, 0, 1, 1, 1, joint);
      part(new T.CapsuleGeometry(thick * 0.6, length * 0.42, 4, 8), coat, 0, -length * 0.7, 0, 1, 1, 1, joint);
      part(new T.CylinderGeometry(thick * 0.7, thick * 0.8, length * 0.1, 8), foot, 0, -length * 0.96, 0.01, 1, 1, 1, joint);
      legs.push(joint);
    };
  let head = new T.Group() as T.Object3D;
  if (id === "deer") {
    const coat = mat({ color: "#8a5a34" }, 0.7),
      pale = mat({ color: "#e9dcc6" }, 0.5),
      dark = mat({ color: "#2b2019" }),
      antler = mat({ color: "#d9ccb0", roughness: 0.6 });
    part(sphere(), coat, 0, 1.06, 0, 0.34, 0.36, 0.78);
    part(sphere(), pale, 0, 0.92, 0.05, 0.27, 0.22, 0.62);
    part(sphere(), pale, 0, 1.14, -0.74, 0.1, 0.12, 0.06);
    const neck = part(new T.CylinderGeometry(0.11, 0.17, 0.62, 10), coat, 0, 1.36, 0.6);
    neck.rotation.x = 0.55;
    const h = new T.Group();
    h.position.set(0, 1.62, 0.8);
    body.add(h);
    part(sphere(), coat, 0, 0, 0, 0.12, 0.13, 0.2, h);
    part(sphere(), dark, 0, -0.03, 0.2, 0.05, 0.05, 0.05, h);
    for (const s of [-1, 1]) {
      const ear = part(sphere(), coat, s * 0.11, 0.1, -0.05, 0.03, 0.09, 0.05, h);
      ear.rotation.z = -s * 0.7;
      const beam = part(new T.CylinderGeometry(0.012, 0.02, 0.42, 6), antler, s * 0.09, 0.3, -0.06, 1, 1, 1, h);
      beam.rotation.set(-0.35, 0, -s * 0.45);
      for (let k = 0; k < 2; k++) {
        const tine = part(new T.CylinderGeometry(0.008, 0.013, 0.16, 5), antler, s * (0.14 + k * 0.05), 0.33 + k * 0.1, 0.02 - k * 0.05, 1, 1, 1, h);
        tine.rotation.set(0.5, 0, -s * 0.2);
      }
    }
    head = h;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) leg(sx * 0.16, 0.9, sz * 0.46, 0.9, 0.055, coat, dark);
  } else if (id === "boar") {
    const coat = mat({ color: "#4c3c30" }, 1),
      snout = mat({ color: "#7a5a4a" }),
      tusk = mat({ color: "#efe6d0", roughness: 0.4 }),
      dark = mat({ color: "#1b1512" });
    part(sphere(), coat, 0, 0.62, -0.05, 0.36, 0.4, 0.66);
    part(sphere(), coat, 0, 0.82, 0.25, 0.26, 0.2, 0.32);
    const h = new T.Group();
    h.position.set(0, 0.6, 0.62);
    body.add(h);
    const skull = part(new T.ConeGeometry(0.2, 0.42, 10), coat, 0, 0, 0.08, 1, 1, 1, h);
    skull.rotation.x = Math.PI / 2;
    part(new T.CylinderGeometry(0.075, 0.075, 0.06, 12), snout, 0, -0.01, 0.3, 1, 1, 1, h).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      const t = part(new T.ConeGeometry(0.018, 0.1, 6), tusk, s * 0.08, 0.0, 0.24, 1, 1, 1, h);
      t.rotation.set(-0.4, 0, s * 0.5);
      part(new T.ConeGeometry(0.05, 0.12, 6), coat, s * 0.1, 0.15, -0.06, 1, 1, 1, h).rotation.z = -s * 0.4;
      part(sphere(), dark, s * 0.08, 0.07, 0.12, 0.018, 0.018, 0.018, h);
    }
    head = h;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) leg(sx * 0.17, 0.45, sz * 0.36, 0.45, 0.06, coat, dark);
  } else if (id === "bear") {
    const coat = mat({ color: "#3d2a1c" }, 1),
      muzzle = mat({ color: "#8a6a4c" }, 0.6),
      dark = mat({ color: "#120d0a" });
    part(sphere(), coat, 0, 0.98, -0.12, 0.55, 0.55, 0.9);
    part(sphere(), coat, 0, 1.25, 0.32, 0.42, 0.36, 0.4);
    const h = new T.Group();
    h.position.set(0, 1.1, 0.86);
    body.add(h);
    part(sphere(), coat, 0, 0, 0, 0.27, 0.25, 0.27, h);
    part(sphere(), muzzle, 0, -0.06, 0.22, 0.12, 0.1, 0.14, h);
    part(sphere(), dark, 0, -0.02, 0.35, 0.04, 0.035, 0.03, h);
    for (const s of [-1, 1]) {
      part(sphere(), coat, s * 0.18, 0.2, -0.04, 0.08, 0.08, 0.05, h);
      part(sphere(), dark, s * 0.1, 0.06, 0.2, 0.025, 0.025, 0.025, h);
    }
    head = h;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) leg(sx * 0.3, 0.72, sz * 0.48, 0.72, 0.13, coat, dark);
  } else if (id === "rabbit") {
    const coat = mat({ color: "#9b8670" }, 0.8),
      white = mat({ color: "#f3efe6" }, 0.6),
      pink = mat({ color: "#e0a8a0" }),
      dark = mat({ color: "#16110e" });
    part(sphere(), coat, 0, 0.22, -0.03, 0.15, 0.16, 0.22);
    part(sphere(), white, 0, 0.27, -0.26, 0.06, 0.06, 0.06);
    const h = new T.Group();
    h.position.set(0, 0.36, 0.17);
    body.add(h);
    part(sphere(), coat, 0, 0, 0, 0.09, 0.09, 0.11, h);
    for (const s of [-1, 1]) {
      const ear = part(sphere(), coat, s * 0.04, 0.15, -0.04, 0.025, 0.12, 0.04, h);
      ear.rotation.z = -s * 0.15;
      part(sphere(), pink, s * 0.042, 0.15, -0.025, 0.012, 0.09, 0.02, h).rotation.z = -s * 0.15;
      part(sphere(), dark, s * 0.06, 0.03, 0.06, 0.015, 0.015, 0.015, h);
    }
    head = h;
    for (const [sx, sz] of [[-1, 1], [1, 1]]) leg(sx * 0.07, 0.16, sz * 0.12, 0.16, 0.03, coat, coat);
    for (const sx of [-1, 1]) leg(sx * 0.08, 0.2, -0.12, 0.2, 0.05, coat, coat);
  } else {
    // A bird: a mallard (green head, white collar, grey wings with a blue patch) or a cock pheasant (copper, a long tail).
    const duck = id === "duck",
      coat = mat({ color: duck ? "#8a7a66" : "#a8572b" }, 0.4),
      chest = mat({ color: duck ? "#6b3e2c" : "#c46a2c" }, 0.3),
      headPaint = mat({ color: duck ? "#1d6b3c" : "#1e3f2c", roughness: 0.35, metalness: 0.2 }),
      bill = mat({ color: duck ? "#f2c23a" : "#d9c89a" }),
      wingPaint = mat({ color: duck ? "#9a948a" : "#8a6a3e" }, 0.3),
      white = mat({ color: "#f4f2ea" }),
      red = mat({ color: "#d22a2a" });
    part(sphere(), coat, 0, 0, 0, 0.13, 0.12, duck ? 0.26 : 0.24);
    part(sphere(), chest, 0, -0.02, 0.12, 0.11, 0.1, 0.12);
    const h = new T.Group();
    h.position.set(0, 0.07, duck ? 0.3 : 0.27);
    body.add(h);
    part(sphere(), headPaint, 0, 0, 0, 0.065, 0.07, 0.08, h);
    part(new T.ConeGeometry(0.025, duck ? 0.09 : 0.05, 8), bill, 0, -0.01, duck ? 0.11 : 0.09, 1, 1, 1, h).rotation.x = Math.PI / 2;
    if (duck) part(new T.TorusGeometry(0.055, 0.01, 6, 16), white, 0, -0.06, -0.02, 1, 1, 1, h).rotation.x = Math.PI / 2;
    else for (const s of [-1, 1]) part(sphere(), red, s * 0.04, 0.01, 0.03, 0.02, 0.03, 0.03, h);
    head = h;
    // The tail: short and dark on the mallard, long and barred on the pheasant.
    const tail = part(new T.ConeGeometry(duck ? 0.06 : 0.04, duck ? 0.14 : 0.55, 6), coat, 0, 0.02, duck ? -0.3 : -0.48);
    tail.rotation.x = -Math.PI / 2;
    for (const s of [-1, 1]) {
      const joint = new T.Group();
      joint.position.set(s * 0.1, 0.04, 0.02);
      body.add(joint);
      const wing = part(sphere(), wingPaint, s * 0.2, 0, 0, 0.2, 0.025, 0.11, joint);
      wing.rotation.y = s * 0.2;
      if (duck) part(new T.BoxGeometry(0.08, 0.01, 0.04), mat({ color: "#2d4ad6", roughness: 0.3 }), s * 0.17, 0.02, -0.04, 1, 1, 1, joint);
      wings.push(joint);
    }
    root.scale.setScalar(1.15);
  }
  return { root, body, legs, wings, head, paints, geometries };
}
