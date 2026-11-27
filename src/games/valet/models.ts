import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block } from "../../engine/scene-utils";
import { BUS, CAR_L, CAR_W, VEHICLES } from "./sim";

/**
 * The cars and the people of the car park, made in code: four kinds of car (a saloon, a hatchback, an SUV and a van)
 * with rounded bodies drawn from a side outline (the wheel arches cut into it), glass, a painted roof, lamps, mirrors,
 * bumpers and wheels with tyres and alloy rims; and a figure with legs and arms that swing as it walks, a uniform and a
 * cap for the valet. The shapes are made once and shared (`CarKit`); a car's paint is shared by colour.
 */

/** A kind of car, by its side outline: x along the car (front +), y up, in metres. */
interface Spec {
  /** The underside's height between the wheels. */
  clear: number;
  /** The outline of the body under the windows, from the bottom of the tail up over the top to the bottom of the nose. */
  body: [number, number][];
  /** The glasshouse (windows) as a polygon. */
  glass: [number, number][];
  /** The roof panel over the glass: from x0 to x1 at height y. */
  roof: { x0: number; x1: number; y: number };
  /** Door pillars between the windows (x), from the waist to the roof. */
  pillars: number[];
  wheel: number;
  /** The heights of the bonnet and the boot (where dents show), of the lamps at the front and the back. */
  bonnet: number;
  boot: number;
  lamp: number;
  tail: number;
  /** Where the door mirrors stand along the car, and the waist's height. */
  mirror: number;
  waist: number;
  rails?: boolean;
}
const half = CAR_L / 2;
export const MODELS: Spec[] = [
  // A saloon: a low bonnet, the cabin in the middle, a boot.
  {
    clear: 0.3,
    body: [
      [-half + 0.04, 0.3],
      [-half - 0.02, 0.5],
      [-half + 0.02, 0.76],
      [-half + 0.25, 0.9],
      [-1.2, 0.93],
      [0.2, 0.93],
      [0.95, 0.91],
      [1.55, 0.84],
      [1.95, 0.76],
      [half + 0.02, 0.6],
      [half, 0.3],
    ],
    glass: [
      [1.02, 0.88],
      [0.2, 1.4],
      [-0.8, 1.42],
      [-1.5, 0.92],
    ],
    roof: { x0: -0.78, x1: 0.18, y: 1.42 },
    pillars: [-0.25],
    wheel: 0.34,
    bonnet: 0.88,
    boot: 0.92,
    lamp: 0.68,
    tail: 0.74,
    mirror: 0.82,
    waist: 0.93,
  },
  // A hatchback: shorter at the back, the roof carried on to a steep tailgate.
  {
    clear: 0.3,
    body: [
      [-half + 0.08, 0.3],
      [-half + 0.02, 0.55],
      [-half + 0.06, 0.88],
      [-half + 0.2, 0.96],
      [-1.0, 0.95],
      [0.4, 0.94],
      [0.95, 0.91],
      [1.55, 0.84],
      [1.95, 0.74],
      [half + 0.02, 0.58],
      [half, 0.3],
    ],
    glass: [
      [0.98, 0.88],
      [0.15, 1.46],
      [-1.55, 1.46],
      [-1.98, 0.94],
    ],
    roof: { x0: -1.6, x1: 0.13, y: 1.46 },
    pillars: [-0.45],
    wheel: 0.33,
    bonnet: 0.88,
    boot: 0.96,
    lamp: 0.68,
    tail: 0.85,
    mirror: 0.8,
    waist: 0.95,
  },
  // An SUV: high off the ground, square-shouldered, with rails on its roof.
  {
    clear: 0.42,
    body: [
      [-half + 0.06, 0.42],
      [-half - 0.02, 0.66],
      [-half + 0.0, 1.02],
      [-half + 0.18, 1.1],
      [-1.0, 1.12],
      [0.6, 1.12],
      [1.2, 1.08],
      [1.75, 1.02],
      [half, 0.88],
      [half + 0.04, 0.66],
      [half, 0.42],
    ],
    glass: [
      [1.15, 1.04],
      [0.45, 1.72],
      [-1.75, 1.74],
      [-2.02, 1.08],
    ],
    roof: { x0: -1.82, x1: 0.42, y: 1.74 },
    pillars: [-0.3, -1.15],
    wheel: 0.4,
    bonnet: 1.06,
    boot: 1.12,
    lamp: 0.88,
    tail: 0.98,
    mirror: 0.98,
    waist: 1.12,
    rails: true,
  },
  // A van: a short nose, then a tall box to the back.
  {
    clear: 0.36,
    body: [
      [-half + 0.04, 0.36],
      [-half - 0.02, 0.6],
      [-half - 0.02, 1.1],
      [-1.6, 1.14],
      [0.6, 1.14],
      [1.3, 1.12],
      [1.8, 1.02],
      [half + 0.02, 0.84],
      [half + 0.02, 0.6],
      [half, 0.36],
    ],
    glass: [
      [1.45, 1.06],
      [0.75, 1.95],
      [-2.05, 1.97],
      [-2.08, 1.08],
    ],
    roof: { x0: -2.08, x1: 0.72, y: 1.97 },
    pillars: [0.2, -0.75, -1.6],
    wheel: 0.36,
    bonnet: 1.08,
    boot: 1.14,
    lamp: 0.82,
    tail: 1.1,
    mirror: 1.06,
    waist: 1.14,
  },
];
/** The kind of a car of body `style` and `colour` (both drawn by the sim). */
export const modelOf = (style: number, colour: number) => (style * 3 + colour) % MODELS.length;
/** The front and the back axles. */
export const AXLES = [1.32, -1.32];

/** The side outline of the body with its wheel arches cut out, as a shape. */
function bodyShape(s: Spec) {
  const shape = new T.Shape(),
    arch = s.wheel + 0.07,
    rise = s.clear - s.wheel,
    a0 = Math.asin(Math.max(-0.95, Math.min(0.95, rise / arch))),
    reach = Math.cos(a0) * arch;
  const [first, ...rest] = s.body;
  shape.moveTo(first[0], first[1]);
  shape.splineThru(rest.slice(0, -1).map(([x, y]) => new T.Vector2(x, y)));
  const last = rest[rest.length - 1];
  shape.lineTo(last[0], last[1]);
  // Along the underside from the nose to the tail, round each wheel's arch.
  for (const ax of AXLES) {
    shape.lineTo(ax + reach, s.clear);
    shape.absarc(ax, s.wheel, arch, a0, Math.PI - a0, false);
  }
  shape.lineTo(first[0], first[1]);
  return shape;
}
/** A flat outline pushed out sideways to `width`, its edges rounded, centred across the car. */
function extrude(shape: T.Shape, width: number, round: number) {
  const g = new T.ExtrudeGeometry(shape, { depth: width - 2 * round, bevelEnabled: true, bevelThickness: round, bevelSize: round * 0.8, bevelSegments: 3, curveSegments: 14 });
  g.translate(0, 0, -(width - 2 * round) / 2);
  g.computeVertexNormals();
  return g;
}

/** The shapes shared by every car (by kind) and its stuff (tyre, rim, glass, trim, lamps). */
export interface CarKit {
  bodies: T.BufferGeometry[];
  glasses: T.BufferGeometry[];
  roofs: T.BufferGeometry[];
  pillar: T.BufferGeometry;
  strut: T.BufferGeometry;
  tyre: T.BufferGeometry;
  rimFace: T.BufferGeometry;
  bumper: T.BufferGeometry;
  lamp: T.BufferGeometry;
  tailLamp: T.BufferGeometry;
  grille: T.BufferGeometry;
  plate: T.BufferGeometry;
  mirror: T.BufferGeometry;
  rail: T.BufferGeometry;
  handle: T.BufferGeometry;
  dent: T.BufferGeometry;
  tyreMat: T.Material;
  rimMat: T.Material;
  glassMat: T.Material;
  trimMat: T.Material;
  plateMat: T.Material;
  scratchMat: T.Material;
  /** Bright metal (a motorbike's forks and exhaust, a bus's trim), a bus's pale roof, and its lit route sign. */
  chromeMat: T.Material;
  creamMat: T.Material;
  signMat: T.Material;
  paints: Map<string, T.Material>;
  /** Each kind's still parts merged by what they are made of (made the first time a car of the kind is). */
  still: Partial<Record<Role, T.BufferGeometry>>[];
  /** The same for the motorbike (its frame, and the steered front) and the bus. */
  others: Map<string, Partial<Record<Role, T.BufferGeometry>>>;
  /** Hands what is made later to the view, to be disposed with it. */
  keep: <R extends { dispose(): void }>(r: R) => R;
  rich: boolean;
}
/** Makes the shared shapes; everything made is handed to `own` to be disposed with the view. */
export function carKit(own: <R extends { dispose(): void }>(r: R) => R, rich: boolean): CarKit {
  const rim = document.createElement("canvas");
  rim.width = rim.height = 128;
  const pen = rim.getContext("2d")!;
  // An alloy rim seen from the side: a bright lip, five spokes, a dark hub between them.
  const g = pen.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "#e7e9ee");
  g.addColorStop(0.75, "#9aa0aa");
  g.addColorStop(0.86, "#f2f4f8");
  g.addColorStop(1, "#5d626b");
  pen.fillStyle = "#2a2d33";
  pen.fillRect(0, 0, 128, 128);
  pen.fillStyle = g;
  pen.beginPath();
  pen.arc(64, 64, 63, 0, Math.PI * 2);
  pen.fill();
  pen.fillStyle = "#2b2e34";
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 5;
    pen.beginPath();
    pen.moveTo(64 + Math.cos(a - 0.3) * 18, 64 + Math.sin(a - 0.3) * 18);
    pen.lineTo(64 + Math.cos(a - 0.22) * 50, 64 + Math.sin(a - 0.22) * 50);
    pen.lineTo(64 + Math.cos(a + 0.22) * 50, 64 + Math.sin(a + 0.22) * 50);
    pen.lineTo(64 + Math.cos(a + 0.3) * 18, 64 + Math.sin(a + 0.3) * 18);
    pen.fill();
  }
  pen.fillStyle = "#c9ccd3";
  pen.beginPath();
  pen.arc(64, 64, 12, 0, Math.PI * 2);
  pen.fill();
  const rimTex = own(new T.CanvasTexture(rim));
  rimTex.colorSpace = T.SRGBColorSpace;
  const plate = document.createElement("canvas");
  plate.width = 128;
  plate.height = 32;
  const pp = plate.getContext("2d")!;
  pp.fillStyle = "#f3f2ec";
  pp.fillRect(0, 0, 128, 32);
  pp.strokeStyle = "#222";
  pp.lineWidth = 3;
  pp.strokeRect(2, 2, 124, 28);
  pp.fillStyle = "#222";
  pp.font = "800 20px Inter, Arial, sans-serif";
  pp.textAlign = "center";
  pp.textBaseline = "middle";
  pp.fillText("12가 3456", 64, 17);
  const plateTex = own(new T.CanvasTexture(plate));
  plateTex.colorSpace = T.SRGBColorSpace;
  const roofShape = (s: Spec) => {
    const r = new T.Shape(),
      { x0, x1, y } = s.roof;
    r.moveTo(x0, y - 0.03);
    r.lineTo(x1, y - 0.03);
    r.quadraticCurveTo(x1 + 0.04, y + 0.01, x1 - 0.06, y + 0.035);
    r.lineTo(x0 + 0.06, y + 0.035);
    r.quadraticCurveTo(x0 - 0.04, y + 0.01, x0, y - 0.03);
    return r;
  };
  const glassShape = (s: Spec) => new T.Shape(s.glass.map(([x, y]) => new T.Vector2(x, y)));
  return {
    bodies: MODELS.map((s) => own(extrude(bodyShape(s), CAR_W, 0.12))),
    glasses: MODELS.map((s) => own(extrude(glassShape(s), CAR_W - 0.3, 0.05))),
    roofs: MODELS.map((s) => own(extrude(roofShape(s), CAR_W - 0.27, 0.04))),
    strut: own(new T.BoxGeometry(1, 0.075, 0.08)),
    pillar: own(new T.BoxGeometry(0.1, 1, CAR_W - 0.26)),
    tyre: own(new T.CylinderGeometry(1, 1, 0.26, 26, 1).rotateX(Math.PI / 2)),
    rimFace: own(new T.CircleGeometry(0.72, 24)),
    bumper: own(block(0.24, 0.2, CAR_W + 0.02, 0.08)),
    lamp: own(block(0.08, 0.15, 0.42, 0.05)),
    tailLamp: own(block(0.08, 0.13, 0.46, 0.04)),
    grille: own(block(0.05, 0.16, 0.66, 0.03)),
    plate: own(new T.PlaneGeometry(0.46, 0.12)),
    mirror: own(block(0.16, 0.12, 0.14, 0.04)),
    rail: own(block(2.0, 0.05, 0.05, 0.02)),
    handle: own(new T.BoxGeometry(0.16, 0.03, 0.03)),
    dent: own(new T.BoxGeometry(0.5, 0.04, 0.36)),
    tyreMat: own(new T.MeshStandardMaterial({ color: "#17181b", roughness: 0.92 })),
    rimMat: own(new T.MeshStandardMaterial({ map: rimTex, roughness: 0.3, metalness: rich ? 0.75 : 0.4 })),
    glassMat: own(
      rich
        ? new T.MeshPhysicalMaterial({ color: "#14202b", roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 })
        : new T.MeshStandardMaterial({ color: "#1c2a37", roughness: 0.12, metalness: 0.45 }),
    ),
    trimMat: own(new T.MeshStandardMaterial({ color: "#1d1f23", roughness: 0.55 })),
    plateMat: own(new T.MeshStandardMaterial({ map: plateTex, roughness: 0.5 })),
    scratchMat: own(new T.MeshStandardMaterial({ color: "#2a2623", roughness: 1 })),
    chromeMat: own(new T.MeshStandardMaterial({ color: "#d9dde3", roughness: 0.22, metalness: rich ? 0.9 : 0.55 })),
    creamMat: own(new T.MeshStandardMaterial({ color: "#efece2", roughness: 0.45, metalness: 0.1 })),
    signMat: own(new T.MeshStandardMaterial({ map: own(routeSign()), color: "#ffffff", emissive: "#ffb43a", emissiveIntensity: 0.55, emissiveMap: own(routeSign()), roughness: 0.4 })),
    paints: new Map(),
    still: [],
    others: new Map(),
    keep: own,
    rich,
  };
}
/** The paint of a colour, shared by the cars of it: a glossy clear coat on a graphics card. */
export function paintOf(kit: CarKit, own: <R extends { dispose(): void }>(r: R) => R, colour: string) {
  let m = kit.paints.get(colour);
  if (!m) {
    m = own(
      kit.rich
        ? new T.MeshPhysicalMaterial({ color: colour, roughness: 0.32, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.06 })
        : new T.MeshStandardMaterial({ color: colour, roughness: 0.32, metalness: 0.28 }),
    );
    kit.paints.set(colour, m);
  }
  return m;
}

/** A bus's route sign: a number and a destination in amber dots on black. */
function routeSign() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 48;
  const pen = c.getContext("2d")!;
  pen.fillStyle = "#14110c";
  pen.fillRect(0, 0, 256, 48);
  pen.fillStyle = "#ffb43a";
  pen.font = "900 32px 'Noto Sans KR', Inter, Arial, sans-serif";
  pen.textBaseline = "middle";
  pen.fillText("707", 10, 26);
  pen.font = "800 26px 'Noto Sans KR', Inter, Arial, sans-serif";
  pen.textAlign = "right";
  pen.fillText("시내 순환", 246, 26);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

/** What the view moves of a car it has made. */
export interface CarParts {
  root: T.Group;
  /** The front wheels' steering pivots, and every wheel (turned about its axle as the car rolls). */
  front: T.Group[];
  wheels: T.Group[];
  dents: T.Mesh[];
  /** Where its nose is, the height of its headlamps and how far each is from the middle (for the glare sprites), and its wheels' radius. */
  nose: number;
  lampY: number;
  lampZ: number[];
  radius: number;
}
/** What a car's still parts are made of: the body's colour, the black trim, the plates, the kinds of lamp, bright metal, a pale roof, a sign. */
type Role = "paint" | "glass" | "trim" | "plate" | "head" | "brake" | "back" | "chrome" | "cream" | "sign";
type Put = (g: T.BufferGeometry, role: Role, x?: number, y?: number, z?: number, turn?: (o: T.Object3D) => void) => void;
/** Parts laid by `lay`, each in its place, merged into one shape by what they are made of. */
function merged(kit: CarKit, lay: (put: Put) => void) {
  const out: Partial<Record<Role, T.BufferGeometry[]>> = {},
    put: Put = (g, role, x = 0, y = 0, z = 0, turn) => {
      const o = new T.Object3D();
      o.position.set(x, y, z);
      turn?.(o);
      o.updateMatrix();
      const copy = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(o.matrix);
      for (const name of Object.keys(copy.attributes)) if (!["position", "normal", "uv"].includes(name)) copy.deleteAttribute(name);
      (out[role] ??= []).push(copy);
    };
  lay(put);
  const done: Partial<Record<Role, T.BufferGeometry>> = {};
  for (const role of Object.keys(out) as Role[]) {
    done[role] = kit.keep(mergeGeometries(out[role]!, false)!);
    for (const g of out[role]!) g.dispose();
  }
  return done;
}
/** The meshes of merged parts, in the materials of their roles (the lamps each vehicle's own). */
function wear(parts: Partial<Record<Role, T.BufferGeometry>>, into: T.Object3D, kit: CarKit, paint: T.Material, lamps: { head: T.Material; brake: T.Material; back: T.Material }) {
  const materials: Record<Role, T.Material> = { paint, glass: kit.glassMat, trim: kit.trimMat, plate: kit.plateMat, head: lamps.head, brake: lamps.brake, back: lamps.back, chrome: kit.chromeMat, cream: kit.creamMat, sign: kit.signMat };
  for (const role of Object.keys(parts) as Role[]) {
    const mesh = new T.Mesh(parts[role]!, materials[role]),
      shadow = role === "paint" || role === "glass" || role === "cream" || role === "chrome";
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    into.add(mesh);
  }
}
/** A wheel: a tyre `r` high and `width` wide with a rim on each face, on its own spinning group. */
function wheel(kit: CarKit, r: number, width: number, faces: number[]) {
  const spin = new T.Group(),
    tyre = new T.Mesh(kit.tyre, kit.tyreMat);
  tyre.scale.set(r, r, width / 0.26);
  tyre.castShadow = true;
  spin.add(tyre);
  for (const side of faces) {
    const face = new T.Mesh(kit.rimFace, kit.rimMat);
    face.scale.setScalar(r * 0.92);
    face.position.z = side * (width / 2 + 0.003);
    if (side < 0) face.rotation.y = Math.PI;
    spin.add(face);
  }
  return spin;
}
/** Dark scrapes, hidden until the vehicle is bumped. */
function scrapes(kit: CarKit, into: T.Object3D, at: [number, number, number, number?][]) {
  return at.map(([x, y, z, upright]) => {
    const mesh = new T.Mesh(kit.dent, kit.scratchMat);
    mesh.position.set(x, y, z);
    if (upright) mesh.rotation.set(0, 0, Math.PI / 2);
    else mesh.rotation.y = x * 0.4;
    mesh.visible = false;
    into.add(mesh);
    return mesh;
  });
}
/** A tube from (x0, y0) to (x1, y1) at `z`, `r` thick. */
function tube(put: Put, role: Role, r: number, [x0, y0]: [number, number], [x1, y1]: [number, number], z: number, g: T.BufferGeometry) {
  put(g, role, (x0 + x1) / 2, (y0 + y1) / 2, z, (o) => {
    o.rotation.z = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2;
    o.scale.set(r, Math.hypot(x1 - x0, y1 - y0), r);
  });
}

/**
 * A motorbike (the second and third lots): a teardrop tank and a tail in its paint, a black saddle, the engine and the
 * exhaust in bright metal, a swingarm and a frame, and in front, on the pivot that steers, the forks, the handlebar
 * with its mirrors, a round headlamp and the front mudguard. No one sits on it (the valet does, when it rides it).
 */
export function makeBike(kit: CarKit, paint: T.Material, lamps: { head: T.Material; brake: T.Material; back: T.Material }): CarParts {
  const R = 0.31,
    AX = VEHICLES[1].wheelbase / 2,
    HEAD = 0.56,
    rod = kit.keep(new T.CylinderGeometry(1, 1, 1, 10)),
    root = new T.Group();
  const still =
    kit.others.get("bike") ??
    merged(kit, (put) => {
      // The tank: a long rounded drop over the frame.
      put(kit.keep(new T.SphereGeometry(1, 18, 12)), "paint", 0.2, 0.9, 0, (o) => o.scale.set(0.36, 0.15, 0.17));
      // The side covers under the saddle and the tail rising behind it.
      put(block(0.42, 0.22, 0.26, 0.06), "paint", -0.42, 0.68, 0);
      put(block(0.42, 0.12, 0.2, 0.05), "paint", -0.86, 0.8, 0, (o) => (o.rotation.z = 0.18));
      // The rear mudguard over the back wheel.
      put(kit.keep(new T.CylinderGeometry(R + 0.07, R + 0.07, 0.15, 16, 1, true, Math.PI * 0.05, Math.PI * 0.75)), "paint", -AX, R, 0, (o) => (o.rotation.x = Math.PI / 2));
      // The saddle, black, a step up to the pillion.
      put(block(0.5, 0.09, 0.28, 0.04), "trim", -0.3, 0.86, 0);
      put(block(0.28, 0.1, 0.24, 0.04), "trim", -0.66, 0.92, 0);
      // The engine: a block with its cylinder and fins, between the frame tubes.
      put(block(0.42, 0.3, 0.3, 0.05), "trim", 0.02, 0.46, 0);
      for (let k = 0; k < 4; k++) put(block(0.24, 0.025, 0.34, 0.01), "chrome", 0.16, 0.58 + k * 0.05, 0);
      // The frame: the down tube from the steering head and the backbone under the tank; the swingarm to the rear axle.
      tube(put, "trim", 0.035, [HEAD - 0.04, 0.92], [0.12, 0.34], 0, rod);
      tube(put, "trim", 0.03, [HEAD - 0.04, 0.95], [-0.5, 0.74], 0, rod);
      for (const z of [-0.09, 0.09]) {
        tube(put, "trim", 0.025, [-0.08, 0.38], [-AX, R], z, rod);
        // The rear shock absorbers.
        tube(put, "chrome", 0.022, [-0.52, 0.42], [-0.4, 0.74], z * 1.3, rod);
      }
      // The exhaust along the right side, ending in a silencer by the back wheel.
      tube(put, "chrome", 0.035, [0.2, 0.36], [-0.35, 0.3], 0.17, rod);
      tube(put, "chrome", 0.065, [-0.35, 0.32], [-0.95, 0.42], 0.2, rod);
      // Footpegs, the tail lamp and the number plate at the back.
      put(block(0.06, 0.03, 0.62, 0.01), "trim", -0.1, 0.34, 0);
      put(block(0.05, 0.07, 0.18, 0.02), "brake", -1.07, 0.84, 0);
      put(kit.plate, "plate", -1.06, 0.66, 0, (o) => {
        o.rotation.y = -Math.PI / 2;
        o.scale.set(0.55, 1.1, 1);
      });
    });
  kit.others.set("bike", still);
  const steered =
    kit.others.get("bike-front") ??
    merged(kit, (put) => {
      // (On the pivot at the steering head: the front axle is AX − HEAD ahead of it.)
      const ax = AX - HEAD;
      for (const z of [-0.08, 0.08]) tube(put, "chrome", 0.028, [ax, R], [-0.06, 1.0], z, rod);
      // The handlebar with its grips, and the mirrors on their stalks.
      put(rod, "trim", -0.12, 1.1, 0, (o) => {
        o.rotation.x = Math.PI / 2;
        o.scale.set(0.022, 0.7, 0.022);
      });
      for (const z of [-0.34, 0.34]) {
        put(rod, "trim", -0.13, 1.1, z, (o) => {
          o.rotation.x = Math.PI / 2;
          o.scale.set(0.035, 0.13, 0.035);
        });
        tube(put, "chrome", 0.01, [-0.1, 1.1], [-0.06, 1.28], z * 0.75, rod);
        put(block(0.03, 0.08, 0.12, 0.01), "chrome", -0.06, 1.3, z * 0.75);
      }
      // The round headlamp in its shell, and the front mudguard.
      put(rod, "chrome", 0.06, 0.97, 0, (o) => {
        o.rotation.z = Math.PI / 2;
        o.scale.set(0.11, 0.12, 0.11);
      });
      put(kit.keep(new T.CircleGeometry(0.095, 18)), "head", 0.125, 0.97, 0, (o) => (o.rotation.y = Math.PI / 2));
      put(kit.keep(new T.CylinderGeometry(R + 0.06, R + 0.06, 0.12, 14, 1, true, Math.PI * 1.05, Math.PI * 0.6)), "paint", ax, R, 0, (o) => (o.rotation.x = Math.PI / 2));
    });
  kit.others.set("bike-front", steered);
  wear(still, root, kit, paint, lamps);
  const pivot = new T.Group();
  pivot.position.set(HEAD, 0, 0);
  wear(steered, pivot, kit, paint, lamps);
  const front = wheel(kit, R, 0.12, [-1, 1]),
    back = wheel(kit, R, 0.14, [-1, 1]);
  front.position.set(AX - HEAD, R, 0);
  back.position.set(-AX, R, 0);
  pivot.add(front);
  root.add(pivot, back);
  const dents = scrapes(kit, root, [
    [0.24, 1.06, 0.06],
    [-0.8, 0.88, 0.0],
  ]);
  dents.forEach((d) => d.scale.set(0.5, 1, 0.45));
  return { root, front: [pivot], wheels: [front, back], dents, nose: AX + R + 0.1, lampY: 0.97, lampZ: [0], radius: R };
}

/**
 * A city bus (the third lot): a long body in its paint with a pale roof and an air-conditioning pod, a band of dark
 * windows down each side between pillars, a deep windscreen under a lit route sign, the passenger door at the front on
 * the right, bumpers, lamps, big mirrors on arms, and four wheels (the front ones steer).
 */
export function makeBus(kit: CarKit, paint: T.Material, lamps: { head: T.Material; brake: T.Material; back: T.Material }): CarParts {
  const v = VEHICLES[BUS],
    half = v.l / 2,
    W = v.w,
    R = 0.5,
    axles = [v.wheelbase / 2, -v.wheelbase / 2],
    root = new T.Group();
  const still =
    kit.others.get("bus") ??
    merged(kit, (put) => {
      // The body's side outline: square at the back, the roof's corners rounded, the front a little raked; the wheel arches cut out.
      const shape = new T.Shape(),
        clear = 0.36,
        arch = R + 0.08;
      shape.moveTo(-half, clear);
      shape.lineTo(-half, 2.86);
      shape.quadraticCurveTo(-half, 3.04, -half + 0.2, 3.04);
      shape.lineTo(half - 0.3, 3.04);
      shape.quadraticCurveTo(half - 0.02, 3.02, half - 0.02, 2.78);
      shape.lineTo(half, 0.5);
      shape.lineTo(half - 0.04, clear);
      const a0 = Math.asin(Math.min(0.95, (clear - R) / arch)),
        reach = Math.cos(a0) * arch;
      for (const ax of axles) {
        shape.lineTo(ax + reach, clear);
        shape.absarc(ax, R, arch, a0, Math.PI - a0, false);
      }
      shape.lineTo(-half, clear);
      put(extrude(shape, W, 0.1), "paint");
      // A pale roof and the air-conditioning pod on it.
      put(block(v.l - 0.5, 0.05, W - 0.24, 0.02), "cream", 0, 3.05, 0);
      put(block(1.9, 0.26, 1.5, 0.1), "cream", -0.6, 3.2, 0);
      put(block(1.5, 0.03, 1.1, 0.01), "trim", -0.6, 3.34, 0);
      // The windows down each side, between pillars; the passenger door at the front on the right (+z).
      const top = 2.62,
        low = 1.62;
      for (const side of [-1, 1]) {
        const z = side * (W / 2 + 0.004),
          from = -half + 0.35,
          to = side > 0 ? half - 1.45 : half - 0.35;
        put(block(to - from, top - low, 0.03, 0.01), "glass", (from + to) / 2, (top + low) / 2, z);
        for (let x = from; x <= to + 1e-6; x += (to - from) / Math.round((to - from) / 1.1)) put(block(0.09, top - low + 0.02, 0.04, 0.01), "paint", x, (top + low) / 2, z * 1.002);
        // A dark skirt line under the windows.
        put(block(v.l - 0.4, 0.06, 0.02, 0.01), "trim", 0, low - 0.12, side * (W / 2 + 0.006));
      }
      // The door: two tall glass leaves in a black frame.
      put(block(0.98, 2.1, 0.03, 0.01), "trim", half - 0.85, 1.48, W / 2 + 0.006);
      for (const x of [half - 1.1, half - 0.6]) put(block(0.42, 1.9, 0.03, 0.01), "glass", x, 1.5, W / 2 + 0.012);
      // The windscreen, the route sign over it, the back window.
      put(block(0.03, 1.55, W - 0.22, 0.01), "glass", half - 0.005, 1.95, 0, (o) => (o.rotation.z = -0.02));
      put(kit.keep(new T.PlaneGeometry(1.5, 0.28)), "sign", half - 0.005, 2.86, 0, (o) => (o.rotation.y = Math.PI / 2));
      put(block(0.03, 0.75, W - 0.5, 0.01), "glass", -half - 0.005, 2.25, 0);
      // Bumpers, lamps and plates at each end.
      for (const s of [-1, 1]) put(block(0.2, 0.32, W + 0.02, 0.06), "trim", s * (half - 0.02), 0.48, 0);
      for (const z of [-0.82, 0.82]) {
        put(block(0.06, 0.16, 0.44, 0.02), "head", half + 0.01, 0.82, z);
        put(block(0.06, 0.52, 0.16, 0.02), "brake", -half - 0.01, 1.08, z * 1.28);
        put(block(0.06, 0.12, 0.16, 0.02), "back", -half - 0.01, 0.74, z * 1.28);
      }
      put(kit.grille, "trim", half + 0.01, 0.62, 0, (o) => o.scale.set(1, 1, 2.2));
      put(kit.plate, "plate", half + 0.13, 0.48, 0, (o) => (o.rotation.y = Math.PI / 2));
      put(kit.plate, "plate", -half - 0.13, 0.6, 0, (o) => (o.rotation.y = -Math.PI / 2));
      // The big mirrors, on arms reaching forward from the front corners.
      for (const side of [-1, 1]) {
        put(block(0.5, 0.05, 0.05, 0.02), "trim", half - 0.1, 2.55, side * (W / 2 + 0.12), (o) => (o.rotation.y = side * 0.5));
        put(block(0.1, 0.42, 0.2, 0.03), "trim", half + 0.12, 2.32, side * (W / 2 + 0.28));
      }
    });
  kit.others.set("bus", still);
  wear(still, root, kit, paint, lamps);
  const front: T.Group[] = [],
    wheels: T.Group[] = [];
  for (const x of axles)
    for (const side of [-1, 1]) {
      const pivot = new T.Group();
      pivot.position.set(x, R, side * (W / 2 - 0.27));
      const spin = wheel(kit, R, 0.34, [side]);
      pivot.add(spin);
      root.add(pivot);
      wheels.push(spin);
      if (x > 0) front.push(pivot);
    }
  const dents = scrapes(kit, root, [
    [half + 0.04, 1.2, 0.7, 1],
    [half + 0.04, 0.95, -0.6, 1],
    [-half - 0.04, 1.3, 0.3, 1],
  ]);
  return { root, front, wheels, dents, nose: half, lampY: 0.82, lampZ: [-0.82, 0.82], radius: R };
}
/**
 * The still parts of a car of kind `model`, each part in its place, by what it is made of. They are merged into one
 * shape for each (once for each kind of car), so that a car is drawn in few strokes: a drawing done by the processor
 * alone (as the browser tests are) pays for every separate thing on the screen.
 */
function stillParts(kit: CarKit, model: number) {
  const s = MODELS[model];
  return merged(kit, (put) => {
  put(kit.bodies[model], "paint");
  put(kit.glasses[model], "glass");
  put(kit.roofs[model], "paint");
  // The door pillars between the windows, in the body's colour.
  for (const x of s.pillars) put(kit.pillar, "paint", x, (s.waist + s.roof.y) / 2, 0, (o) => o.scale.set(1, s.roof.y - s.waist, 1));
  // The pillars round the windscreen and the rear window, at either side of the glass.
  const [g0, g1, g2, g3] = s.glass;
  for (const [a, b] of [
    [g0, g1],
    [g2, g3],
  ])
    for (const z of [-1, 1])
      put(kit.strut, "paint", (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z * (CAR_W / 2 - 0.16), (o) => {
        o.scale.x = Math.hypot(b[0] - a[0], b[1] - a[1]);
        o.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
      });
  if (s.rails) for (const z of [-0.62, 0.62]) put(kit.rail, "trim", (s.roof.x0 + s.roof.x1) / 2, s.roof.y + 0.08, z);
  // Bumpers, the grille, the number plates.
  put(kit.bumper, "trim", half - 0.04, s.clear + 0.12, 0);
  put(kit.bumper, "trim", -half + 0.04, s.clear + 0.12, 0);
  put(kit.grille, "trim", half + 0.01, s.lamp - 0.05, 0);
  put(kit.plate, "plate", half + 0.09, s.clear + 0.14, 0, (o) => (o.rotation.y = Math.PI / 2));
  put(kit.plate, "plate", -half - 0.09, s.tail - 0.22, 0, (o) => (o.rotation.y = -Math.PI / 2));
  // Lamps: headlamps at the front corners, the tail lamps and reversing lamps at the back; mirrors and door handles.
  for (const z of [-0.6, 0.6]) {
    put(kit.lamp, "head", half - 0.01, s.lamp, z);
    put(kit.tailLamp, "brake", -half + 0.02, s.tail, z * 1.02);
    put(kit.lamp, "back", -half + 0.03, s.tail - 0.13, z * 0.6, (o) => o.scale.set(1, 0.5, 0.4));
    put(kit.mirror, "trim", s.mirror, s.waist + 0.06, Math.sign(z) * (CAR_W / 2 + 0.07));
    for (const x of [0.1 + s.pillars[0], s.pillars[0] - 0.6]) put(kit.handle, "trim", x, s.waist - 0.14, Math.sign(z) * (CAR_W / 2 + 0.005));
  }
  });
}
/** A car of kind `model` in `paint`; its lamps in the materials given (each car its own, to light them one by one). */
export function makeCar(kit: CarKit, model: number, paint: T.Material, lamps: { head: T.Material; brake: T.Material; back: T.Material }): CarParts {
  const s = MODELS[model],
    root = new T.Group(),
    still = (kit.still[model] ??= stillParts(kit, model)),
    put = (g: T.BufferGeometry, m: T.Material, x = 0, y = 0, z = 0, shadow = true) => {
      const mesh = new T.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      root.add(mesh);
      return mesh;
    };
  put(still.paint!, paint);
  put(still.glass!, kit.glassMat);
  put(still.trim!, kit.trimMat, 0, 0, 0, false);
  put(still.plate!, kit.plateMat, 0, 0, 0, false);
  put(still.head!, lamps.head, 0, 0, 0, false);
  put(still.brake!, lamps.brake, 0, 0, 0, false);
  put(still.back!, lamps.back, 0, 0, 0, false);
  // Wheels: a tyre and the rim on its outer face, on a pivot that steers (at the front).
  const fronts: T.Group[] = [],
    wheels: T.Group[] = [];
  for (const x of AXLES)
    for (const side of [-1, 1]) {
      const pivot = new T.Group();
      pivot.position.set(x, s.wheel, side * (CAR_W / 2 - 0.15));
      const spin = new T.Group();
      const tyre = new T.Mesh(kit.tyre, kit.tyreMat);
      tyre.scale.set(s.wheel, s.wheel, 1);
      tyre.castShadow = true;
      const face = new T.Mesh(kit.rimFace, kit.rimMat);
      face.scale.setScalar(s.wheel);
      face.position.z = side * 0.135;
      if (side < 0) face.rotation.y = Math.PI;
      spin.add(tyre, face);
      pivot.add(spin);
      root.add(pivot);
      wheels.push(spin);
      if (x > 0) fronts.push(pivot);
    }
  // Dents: dark scrapes on the bonnet and the boot, hidden until it is bumped.
  const dents = [
    [1.55, s.bonnet + 0.03, 0.45],
    [1.45, s.bonnet + 0.03, -0.5],
    [-1.85, s.boot + 0.02, 0.3],
  ].map(([x, y, z]) => {
    const mesh = put(kit.dent, kit.scratchMat, x, y, z, false);
    mesh.rotation.y = x * 0.4;
    mesh.visible = false;
    return mesh;
  });
  return { root, front: fronts, wheels, dents, nose: CAR_L / 2, lampY: s.lamp, lampZ: [-0.6, 0.6], radius: s.wheel };
}

/** A person's parts that move: the legs and the arms on their pivots, and the shirt (coloured by the view). */
export interface Figure {
  root: T.Group;
  legs: T.Group[];
  arms: T.Group[];
  shirt: T.MeshStandardMaterial;
  hair: T.MeshStandardMaterial;
  /** How far along its stride it is (radians). */
  stride: number;
}
/** The shapes shared by the people. */
export interface PeopleKit {
  leg: T.BufferGeometry;
  arm: T.BufferGeometry;
  torso: T.BufferGeometry;
  head: T.BufferGeometry;
  hair: T.BufferGeometry;
  hand: T.BufferGeometry;
  shoe: T.BufferGeometry;
  cap: T.BufferGeometry;
  visor: T.BufferGeometry;
  stripe: T.BufferGeometry;
  button: T.BufferGeometry;
  skin: T.Material;
  trousers: T.Material;
  shoes: T.Material;
  white: T.Material;
  gold: T.Material;
  black: T.Material;
}
export function peopleKit(own: <R extends { dispose(): void }>(r: R) => R): PeopleKit {
  return {
    leg: own(new T.CapsuleGeometry(0.105, 0.56, 4, 10).translate(0, -0.38, 0)),
    arm: own(new T.CapsuleGeometry(0.075, 0.46, 4, 8).translate(0, -0.3, 0)),
    torso: own(new T.CapsuleGeometry(0.24, 0.36, 6, 14).scale(1, 1, 0.72)),
    head: own(new T.SphereGeometry(0.2, 18, 14)),
    hair: own(new T.SphereGeometry(0.212, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)),
    hand: own(new T.SphereGeometry(0.075, 10, 8)),
    shoe: own(block(0.15, 0.09, 0.27, 0.04)),
    cap: own(new T.CylinderGeometry(0.215, 0.225, 0.13, 18)),
    visor: own(new T.CylinderGeometry(0.2, 0.2, 0.025, 16, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.15)),
    stripe: own(new T.TorusGeometry(0.235, 0.022, 6, 22)),
    button: own(new T.SphereGeometry(0.03, 8, 6)),
    skin: own(new T.MeshStandardMaterial({ color: "#f0c8a4", roughness: 0.7 })),
    trousers: own(new T.MeshStandardMaterial({ color: "#262b38", roughness: 0.8 })),
    shoes: own(new T.MeshStandardMaterial({ color: "#1a1615", roughness: 0.5 })),
    white: own(new T.MeshStandardMaterial({ color: "#f5f3ee", roughness: 0.6 })),
    gold: own(new T.MeshStandardMaterial({ color: "#e8b93c", roughness: 0.3, metalness: 0.8 })),
    black: own(new T.MeshStandardMaterial({ color: "#16181c", roughness: 0.6 })),
  };
}
/**
 * A person facing +z: legs and arms on pivots at the hips and the shoulders, a body in `shirt`, a head with hair. The
 * valet (`uniform`) wears a jacket with gold buttons and a white collar, and a cap with a visor in the jacket's colour.
 */
export function makeFigure(kit: PeopleKit, shirt: T.MeshStandardMaterial, hair: T.MeshStandardMaterial, uniform: boolean): Figure {
  const root = new T.Group(),
    legs: T.Group[] = [],
    arms: T.Group[] = [];
  const mesh = (g: T.BufferGeometry, m: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) => {
    const it = new T.Mesh(g, m);
    it.position.set(x, y, z);
    it.castShadow = true;
    parent.add(it);
    return it;
  };
  for (const side of [-1, 1]) {
    const hip = new T.Group();
    hip.position.set(side * 0.12, 0.88, 0);
    mesh(kit.leg, kit.trousers, hip);
    mesh(kit.shoe, kit.shoes, hip, 0, -0.83, 0.05);
    root.add(hip);
    legs.push(hip);
    const shoulder = new T.Group();
    shoulder.position.set(side * 0.31, 1.46, 0);
    shoulder.rotation.z = side * 0.08;
    mesh(kit.arm, shirt, shoulder);
    mesh(kit.hand, kit.skin, shoulder, 0, -0.62, 0);
    root.add(shoulder);
    arms.push(shoulder);
  }
  mesh(kit.torso, shirt, root, 0, 1.24, 0);
  mesh(kit.head, kit.skin, root, 0, 1.82, 0);
  if (uniform) {
    // The white collar, the gold buttons down the front, a black belt; the cap with its visor and a gold band.
    mesh(kit.stripe, kit.white, root, 0, 1.6, 0).rotation.x = Math.PI / 2;
    for (let k = 0; k < 3; k++) mesh(kit.button, kit.gold, root, 0, 1.42 - k * 0.15, 0.18);
    const belt = mesh(kit.stripe, kit.black, root, 0, 0.98, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.02, 0.75, 1);
    mesh(kit.cap, shirt, root, 0, 2.0, 0);
    mesh(kit.visor, kit.black, root, 0, 1.94, 0.12);
    const band = mesh(kit.stripe, kit.gold, root, 0, 1.955, 0);
    band.rotation.x = Math.PI / 2;
    band.scale.set(0.92, 0.92, 0.6);
  } else mesh(kit.hair, hair, root, 0, 1.84, -0.01);
  return { root, legs, arms, shirt, hair, stride: 0 };
}
/** A figure's limbs at `stride` (radians along its step), swinging as far as `swing` (0 standing, 1 running). */
export function walk(f: Figure, swing: number) {
  const a = Math.sin(f.stride) * 0.65 * swing;
  f.legs[0].rotation.x = a;
  f.legs[1].rotation.x = -a;
  f.arms[0].rotation.x = -a * 0.85;
  f.arms[1].rotation.x = a * 0.85;
}
