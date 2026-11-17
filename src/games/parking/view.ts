import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, glossy, stuff } from "../../engine/scene-utils";
import { CAFE, cafe } from "./cafe";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { CELLS, EXIT_ROW, SIZE, reach, vehicleAt, type State, type Vehicle } from "./rules";

export const PARKING_COLORS: [string, string] = ["#d42a22", "#3a3f47"];
/** The paints, by a vehicle's `color`: the red car's first, then those shared out among the others (no other red). */
export const PAINT = ["#d42a22", "#f1efe8", "#a9b0b8", "#3a3f47", "#24467f", "#2f6b4f", "#d9c79c", "#62a8d8", "#e0b03c", "#2a8a86", "#7653a6"];
const CELL = 1,
  /** Half the side of the lot. */
  LOT = (SIZE * CELL) / 2,
  /** The kerb round the lot: its middle line, thickness and height. */
  KERB = LOT + 0.17,
  KERB_WIDE = 0.26,
  KERB_TOP = 0.14,
  /** Where the exit lane runs out of the lot, the gate across it, and the road it meets. */
  EXIT_Z = (EXIT_ROW - (SIZE - 1) / 2) * CELL,
  GATE_X = LOT + 0.6,
  LANE_START = KERB + KERB_WIDE / 2,
  LANE_END = LOT + 1.5,
  ROAD_X = LANE_END + 1.5,
  /** How far the boom turns up when the gate opens. */
  RAISED = 1.45;
/** The height of a car's roof and of a truck's box, and the plane a dragged vehicle is followed on (browser tests aim there). */
export const CAR_TOP = 0.62,
  TRUCK_TOP = 0.88,
  GRAB_HEIGHT = CAR_TOP;
/** The centre of a square of the lot. */
export function cellAt(index: number) {
  return { x: ((index % SIZE) - (SIZE - 1) / 2) * CELL, z: (Math.floor(index / SIZE) - (SIZE - 1) / 2) * CELL };
}
/** Where a vehicle's middle stands. */
export function vehicleCentre(v: Pick<Vehicle, "anchor" | "length" | "horizontal">) {
  const at = cellAt(v.anchor),
    along = ((v.length - 1) / 2) * CELL;
  return v.horizontal ? { x: at.x + along, z: at.z } : { x: at.x, z: at.z + along };
}
/** What the camera frames: the lot, its kerb and the gate at its right (browser tests aim with it too). */
export function parkingSubject(aspect: number): TableSubject {
  return { half: aspect < 1 ? 4.3 : 4.75, halfZ: 3.7, height: TRUCK_TOP, lookY: 0, tilt: 1.2 };
}
type Kind = "car" | "van" | "lorry";
type Part = "paint" | "glass" | "rubber" | "metal" | "lamp" | "tail" | "trim" | "white" | "crate";
/** The red car's route out once it stands at the gate: along the lane, a right turn, and down the road. */
const START_X = (SIZE / 2 - 1) * CELL,
  TURN_R = 0.75,
  TURN_X = ROAD_X - 0.75 - TURN_R,
  LEG1 = TURN_X - START_X,
  LEG2 = (Math.PI / 2) * TURN_R,
  LEG3 = 9 - (EXIT_Z + TURN_R),
  ROUTE = LEG1 + LEG2 + LEG3;
function route(s: number) {
  if (s <= LEG1) return { x: START_X + s, z: EXIT_Z, turn: 0 };
  s -= LEG1;
  if (s <= LEG2) {
    const a = s / TURN_R;
    return { x: TURN_X + TURN_R * Math.sin(a), z: EXIT_Z + TURN_R - TURN_R * Math.cos(a), turn: a };
  }
  return { x: TURN_X + TURN_R, z: EXIT_Z + TURN_R + (s - LEG2), turn: Math.PI / 2 };
}
/** A rounded rectangle, `hw` by `hd` from its middle. */
function rounded<P extends T.Path>(path: P, hw: number, hd: number, r: number): P {
  path.moveTo(-hw + r, -hd);
  path.lineTo(hw - r, -hd);
  path.quadraticCurveTo(hw, -hd, hw, -hd + r);
  path.lineTo(hw, hd - r);
  path.quadraticCurveTo(hw, hd, hw - r, hd);
  path.lineTo(-hw + r, hd);
  path.quadraticCurveTo(-hw, hd, -hw, hd - r);
  path.lineTo(-hw, -hd + r);
  path.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return path;
}
/** The asphalt of the lot: dark grey with grit, a few stains, worn white bay lines between the squares and an arrow to the gate. */
function lotTexture(span: number) {
  const px = 1024,
    unit = px / span,
    c = document.createElement("canvas");
  c.width = c.height = px;
  const ctx = c.getContext("2d")!;
  let seed = 48271;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const at = (v: number) => (v + span / 2) * unit;
  ctx.fillStyle = "#4a4d52";
  ctx.fillRect(0, 0, px, px);
  // Stains where cars have stood.
  for (let i = 0; i < 14; i++) {
    const x = rand() * px,
      y = rand() * px,
      r = 30 + rand() * 70,
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(28, 28, 30, 0.32)");
    g.addColorStop(1, "rgba(28, 28, 30, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Bay lines along every edge between squares.
  ctx.strokeStyle = "rgba(238, 236, 226, 0.86)";
  ctx.lineWidth = 0.05 * unit;
  ctx.lineCap = "butt";
  for (let k = 0; k <= SIZE; k++) {
    const v = at(-LOT + k * CELL);
    ctx.beginPath();
    ctx.moveTo(v, at(-LOT));
    ctx.lineTo(v, at(LOT));
    ctx.moveTo(at(-LOT), v);
    ctx.lineTo(at(LOT), v);
    ctx.stroke();
  }
  // A yellow line along the lot's edge, broken at the gate.
  ctx.strokeStyle = "rgba(230, 186, 52, 0.9)";
  ctx.lineWidth = 0.06 * unit;
  const edge = LOT + 0.02,
    gapTop = at(EXIT_Z - CELL / 2),
    gapBottom = at(EXIT_Z + CELL / 2);
  ctx.beginPath();
  ctx.moveTo(at(edge), gapTop);
  ctx.lineTo(at(edge), at(-edge));
  ctx.lineTo(at(-edge), at(-edge));
  ctx.lineTo(at(-edge), at(edge));
  ctx.lineTo(at(edge), at(edge));
  ctx.lineTo(at(edge), gapBottom);
  ctx.stroke();
  // Chevrons along the way out.
  ctx.fillStyle = "rgba(238, 236, 226, 0.5)";
  for (const x of [LOT - 1.55, LOT - 0.55]) {
    const cx = at(x),
      cy = at(EXIT_Z),
      s = 0.22 * unit;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx - s, cy + s);
    ctx.lineTo(cx - s * 0.55, cy + s);
    ctx.lineTo(cx + s * 0.45, cy);
    ctx.lineTo(cx - s * 0.55, cy - s);
    ctx.fill();
  }
  // Grit, and the wear it leaves on the paint.
  for (let i = 0; i < 26000; i++) {
    const tone = Math.round(40 + rand() * 70);
    ctx.fillStyle = `rgba(${tone}, ${tone}, ${tone + 3}, ${0.25 + rand() * 0.4})`;
    const s = 1 + rand() * 2.2;
    ctx.fillRect(rand() * px, rand() * px, s, s);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** The exit lane's asphalt with a big arrow out to the road and a white stop line where the gate stands. */
function laneTexture(width: number) {
  const w = 512,
    h = Math.round(512 / width),
    c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  let seed = 7;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  ctx.fillStyle = "#45484d";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(238, 236, 226, 0.85)";
  const unit = w / width,
    gate = (GATE_X - LANE_START) * unit;
  ctx.fillRect(gate - 0.04 * unit, h * 0.06, 0.08 * unit, h * 0.88);
  const cy = h / 2,
    x0 = gate + 0.25 * unit,
    x1 = w - 0.16 * unit;
  ctx.beginPath();
  ctx.moveTo(x0, cy - h * 0.07);
  ctx.lineTo(x1 - 0.3 * unit, cy - h * 0.07);
  ctx.lineTo(x1 - 0.3 * unit, cy - h * 0.2);
  ctx.lineTo(x1, cy);
  ctx.lineTo(x1 - 0.3 * unit, cy + h * 0.2);
  ctx.lineTo(x1 - 0.3 * unit, cy + h * 0.07);
  ctx.lineTo(x0, cy + h * 0.07);
  ctx.fill();
  for (let i = 0; i < 4000; i++) {
    const tone = Math.round(40 + rand() * 70);
    ctx.fillStyle = `rgba(${tone}, ${tone}, ${tone + 3}, ${0.25 + rand() * 0.4})`;
    ctx.fillRect(rand() * w, rand() * h, 1.6, 1.6);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** Merges pieces of one stuff into one geometry (all made unindexed, as merging asks). */
const merged = (pieces: T.BufferGeometry[]) => mergeGeometries(pieces.map((piece) => (piece.index ? piece.toNonIndexed() : piece)))!;
/**
 * The shapes of a vehicle of a kind, lying along +x with its front at +x, merged by what each part is made of so
 * that a vehicle is a handful of meshes: a car (a rounded body, a cabin of dark glass under a roof, wheels, lamps
 * and bumpers), a box van and a small lorry with crates on its bed. `stripes` gives the red car's two white bands.
 */
function shapes(kind: Kind | "stripes") {
  const lists: Partial<Record<Part, T.BufferGeometry[]>> = {};
  const put = (part: Part, geometry: T.BufferGeometry, x: number, y: number, z: number) => {
    geometry.translate(x, y, z);
    (lists[part] ??= []).push(geometry);
  };
  const wheel = (x: number, z: number, r: number) => {
    const tyre = new T.CylinderGeometry(r, r, 0.12, 18),
      hub = new T.CylinderGeometry(r * 0.5, r * 0.5, 0.124, 12);
    tyre.rotateX(Math.PI / 2);
    hub.rotateX(Math.PI / 2);
    put("rubber", tyre, x, r, z);
    put("metal", hub, x, r, z);
  };
  if (kind === "stripes") {
    for (const z of [-0.09, 0.09]) {
      put("white", block(0.44, 0.012, 0.07, 0.004), 0.65, 0.386, z);
      put("white", block(0.72, 0.012, 0.07, 0.004), -0.1, 0.624, z);
      put("white", block(0.26, 0.012, 0.07, 0.004), -0.74, 0.386, z);
    }
  } else if (kind === "car") {
    for (const x of [-0.56, 0.56]) for (const z of [-0.35, 0.35]) wheel(x, z, 0.15);
    put("paint", block(1.8, 0.27, 0.8, 0.1), 0, 0.245, 0);
    put("glass", block(1.0, 0.22, 0.7, 0.08), -0.08, 0.47, 0);
    put("paint", block(0.76, 0.05, 0.66, 0.025), -0.1, 0.595, 0);
    for (const z of [-0.43, 0.43]) put("paint", block(0.06, 0.05, 0.08, 0.015), 0.32, 0.43, z);
    for (const z of [-0.25, 0.25]) {
      put("lamp", block(0.04, 0.07, 0.17, 0.015), 0.895, 0.3, z);
      put("tail", block(0.04, 0.07, 0.15, 0.015), -0.895, 0.3, z);
    }
    for (const x of [-0.885, 0.885]) put("trim", block(0.07, 0.08, 0.76, 0.03), x, 0.17, 0);
    put("trim", block(0.02, 0.05, 0.3, 0.01), 0.902, 0.27, 0);
  } else {
    // A truck: a cab at the front, and behind it a box or an open bed.
    for (const x of [-0.98, -0.62, 0.92]) for (const z of [-0.37, 0.37]) wheel(x, z, 0.16);
    put("trim", block(2.7, 0.1, 0.74, 0.03), 0, 0.2, 0);
    put("paint", block(0.74, 0.5, 0.84, 0.1), 1.02, 0.4, 0);
    put("glass", block(0.04, 0.2, 0.72, 0.015), 1.39, 0.5, 0);
    put("glass", block(0.34, 0.17, 0.85, 0.02), 1.1, 0.5, 0);
    for (const z of [-0.28, 0.28]) {
      put("lamp", block(0.04, 0.07, 0.15, 0.015), 1.395, 0.3, z);
      put("tail", block(0.04, 0.07, 0.13, 0.015), -1.395, 0.3, z);
    }
    for (const x of [-1.385, 1.385]) put("trim", block(0.07, 0.09, 0.8, 0.03), x, 0.17, 0);
    if (kind === "van") {
      put("paint", block(1.98, 0.74, 0.86, 0.06), -0.37, 0.51, 0);
      put("white", block(1.99, 0.1, 0.875, 0.02), -0.37, 0.64, 0);
      for (let k = 0; k < 5; k++) put("trim", block(0.04, 0.016, 0.78, 0.006), -1.2 + k * 0.4, 0.884, 0);
      put("trim", block(0.012, 0.6, 0.02, 0.004), -1.365, 0.5, 0);
    } else {
      put("trim", block(1.98, 0.08, 0.84, 0.02), -0.37, 0.3, 0);
      for (const z of [-0.395, 0.395]) put("paint", block(1.98, 0.2, 0.05, 0.015), -0.37, 0.44, z);
      put("paint", block(0.05, 0.2, 0.74, 0.015), -1.335, 0.44, 0);
      put("trim", block(0.05, 0.36, 0.84, 0.015), 0.6, 0.5, 0);
      [
        [-1.0, 0.36],
        [-0.42, 0.44],
        [0.16, 0.3],
      ].forEach(([x, tall]) => put("crate", block(0.52, tall, 0.62, 0.03), x, 0.34 + tall / 2, 0));
    }
  }
  const out: Partial<Record<Part, T.BufferGeometry>> = {};
  for (const [part, pieces] of Object.entries(lists) as [Part, T.BufferGeometry[]][]) out[part] = merged(pieces);
  return out;
}
/**
 * A parking lot seen from above, a little tilted: worn bay lines on dark asphalt inside a concrete kerb, a low
 * brick wall and trees beyond it, a hedge along the near side, a café of our own at the left (`cafe.ts`: PARK COFFEE,
 * with its terrace and a paved walk to the kerb), and at the right of the third row the exit lane with a
 * ticket booth and a striped boom that rises when the red car reaches it; the car then drives out onto the road.
 * Cars, box vans and lorries are modelled in code. A vehicle is dragged along its own length; it follows the
 * pointer only as far as the squares are free, and settles on the nearest square when let go.
 */
export class ParkingView extends TableView<State> {
  private cars = new T.Group();
  private models: T.Group[] = [];
  private built = "";
  private kinds: Record<Kind | "stripes", Partial<Record<Part, T.BufferGeometry>>>;
  private paint: Record<Exclude<Part, "paint">, T.Material>;
  private paints = new Map<number, T.Material>();
  private boom = new T.Group();
  private lamp: T.Mesh;
  private lamps: { shut: T.Material; open: T.Material };
  private caster = new T.Raycaster();
  /** The vehicle the pointer holds: which, along which axis, and how far it may go. */
  private held: { index: number; axis: "x" | "z"; start: number; origin: number; lo: number; hi: number } | null = null;
  /** Where a dragged vehicle was let go, so that its slide starts there. */
  private dropped: { index: number; x: number; z: number } | null = null;
  private cursor: T.Mesh;
  private frames: Record<2 | 3, { line: T.BufferGeometry; fill: T.BufferGeometry }>;
  private selected: T.Mesh;
  private hinted: T.Mesh;
  private ghost: T.Mesh;
  private ghostFill: T.Mesh;
  private arrow = new T.Group();
  private shaft: T.Mesh;
  private dots: T.Mesh[] = [];
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#6e9a4c");
    this.daylight("#eef4ff", "#5a6a48", "#fff3dc", 8, 2.2);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    // The ground: grass all round, and the slab of the lot.
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard({ ...stuff("grass", "#6e9a4c", 6, keep), roughness: 1 }), 0, -0.22, 0).castShadow = false;
    const span = 2 * (KERB + KERB_WIDE / 2),
      asphalt = this.standard({ ...stuff("gravel", "#44474c", 3, keep), roughness: 0.95 }),
      lotTop = this.standard({ map: this.own(lotTexture(span)), roughness: 0.93 });
    this.add(block(span, 0.1, span, 0.02), [asphalt, asphalt, lotTop, asphalt, asphalt, asphalt], 0, -0.05, 0).castShadow = false;
    // The exit lane out to the road, and the road.
    const laneWide = LANE_END - LANE_START,
      laneTop = this.standard({ map: this.own(laneTexture(laneWide)), roughness: 0.93 });
    this.add(new T.BoxGeometry(laneWide, 0.1, CELL), [asphalt, asphalt, laneTop, asphalt, asphalt, asphalt], LANE_START + laneWide / 2, -0.05, EXIT_Z).castShadow = false;
    this.add(new T.BoxGeometry(3, 0.1, 30), asphalt, ROAD_X, -0.05, 0).castShadow = false;
    const white = this.standard({ color: "#eceae0", roughness: 0.8 }),
      yellow = this.standard({ color: "#e3b636", roughness: 0.8 }),
      strip = (w: number, d: number, x: number, z: number) => {
        const g = new T.PlaneGeometry(w, d);
        g.rotateX(-Math.PI / 2);
        g.translate(x, 0.004, z);
        return g;
      };
    const lineAt = ROAD_X - 1.35,
      lanes = [strip(0.07, 15 + EXIT_Z - CELL / 2, lineAt, (-15 + EXIT_Z - CELL / 2) / 2), strip(0.07, 15 - EXIT_Z - CELL / 2, lineAt, (15 + EXIT_Z + CELL / 2) / 2), strip(0.07, 30, ROAD_X + 1.35, 0)],
      dashes = Array.from({ length: 22 }, (_, k) => strip(0.08, 0.7, ROAD_X, -15 + k * 1.4));
    this.add(merged(lanes), white).castShadow = false;
    this.add(merged(dashes), yellow).castShadow = false;
    // The kerb, open at the gate.
    const concrete = this.standard({ ...stuff("stone", "#c4c0b6", 2, keep), roughness: 0.85 }),
      kerb = (w: number, d: number, x: number, z: number) => this.add(new T.BoxGeometry(w, KERB_TOP, d), concrete, x, KERB_TOP / 2, z),
      inner = KERB - KERB_WIDE / 2,
      lowGap = EXIT_Z - CELL / 2,
      highGap = EXIT_Z + CELL / 2;
    kerb(span, KERB_WIDE, 0, -KERB);
    kerb(span, KERB_WIDE, 0, KERB);
    kerb(KERB_WIDE, inner * 2, -KERB, 0);
    kerb(KERB_WIDE, lowGap + inner, KERB, (lowGap - inner) / 2);
    kerb(KERB_WIDE, inner - highGap, KERB, (inner + highGap) / 2);
    this.scenery(keep);
    // The gate: a post with its lamp, a striped boom on a pivot, and a rest across the lane.
    const housing = this.standard({ color: "#efede6", roughness: 0.5 }),
      band = this.standard({ color: "#f2c230", roughness: 0.6 }),
      dark = this.standard({ color: "#2c2f34", roughness: 0.6 }),
      red = this.standard({ color: "#d3322a", roughness: 0.45 }),
      postZ = EXIT_Z + CELL / 2 + 0.2;
    this.add(block(0.26, 0.56, 0.3, 0.04), housing, GATE_X, 0.28, postZ);
    this.add(block(0.27, 0.1, 0.31, 0.02), band, GATE_X, 0.08, postZ);
    this.add(block(0.28, 0.04, 0.32, 0.015), dark, GATE_X, 0.58, postZ);
    this.lamps = { shut: this.standard({ color: "#e0352b", emissive: "#a01810", emissiveIntensity: 1.2 }), open: this.standard({ color: "#3fd06a", emissive: "#13a040", emissiveIntensity: 1.3 }) };
    this.lamp = this.add(new T.SphereGeometry(0.06, 16, 12), this.lamps.shut, GATE_X, 0.64, postZ);
    this.boom.position.set(GATE_X, 0.5, postZ - 0.2);
    const piece = this.own(new T.BoxGeometry(0.07, 0.07, 0.225));
    for (let k = 0; k < 6; k++) {
      const mesh = new T.Mesh(piece, k % 2 ? housing : red);
      mesh.position.z = -(k + 0.5) * 0.225;
      mesh.castShadow = true;
      this.boom.add(mesh);
    }
    const hinge = new T.CylinderGeometry(0.06, 0.06, 0.12, 14);
    hinge.rotateZ(Math.PI / 2);
    this.add(hinge, dark, 0, 0, 0, this.boom);
    this.scene.add(this.boom);
    const restZ = EXIT_Z - CELL / 2 - 0.16;
    this.add(new T.CylinderGeometry(0.035, 0.035, 0.42, 10), dark, GATE_X, 0.21, restZ);
    this.add(block(0.14, 0.05, 0.1, 0.015), band, GATE_X, 0.44, restZ);
    // The shared shapes and paints of the vehicles.
    this.kinds = { car: shapes("car"), van: shapes("van"), lorry: shapes("lorry"), stripes: shapes("stripes") };
    for (const kind of Object.values(this.kinds)) for (const g of Object.values(kind)) this.own(g!);
    this.paint = {
      glass: this.own(glossy({ color: "#1a222c", roughness: 0.12, metalness: 0.35 })),
      rubber: this.standard({ color: "#1c1c1e", roughness: 0.92 }),
      metal: this.standard({ color: "#c9ccd0", roughness: 0.35, metalness: 0.6 }),
      lamp: this.standard({ color: "#fff6d8", emissive: "#fff0c0", emissiveIntensity: 0.55, roughness: 0.3 }),
      tail: this.standard({ color: "#c81e1e", emissive: "#7a0d0d", emissiveIntensity: 0.8, roughness: 0.35 }),
      trim: this.standard({ color: "#2b2d31", roughness: 0.7 }),
      white: this.standard({ color: "#f7f5ef", roughness: 0.4 }),
      crate: this.standard({ color: "#b5824c", roughness: 0.8 }),
    };
    this.scene.add(this.cars);
    // The marks: the keyboard's ring, frames round the chosen vehicle and the hinted one, the hint's place and arrow.
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.33, 0.41, "#ffffff");
    (this.cursor.material as T.MeshBasicMaterial).depthTest = false;
    this.cursor.renderOrder = 9;
    const frame = (length: number) => {
      const hw = (length * CELL) / 2 - 0.04,
        hd = 0.45,
        outer = rounded(new T.Shape(), hw + 0.09, hd + 0.09, 0.14);
      outer.holes.push(rounded(new T.Path(), hw, hd, 0.07));
      const line = new T.ShapeGeometry(outer, 6),
        fill = new T.ShapeGeometry(rounded(new T.Shape(), hw, hd, 0.07), 6);
      line.rotateX(-Math.PI / 2);
      fill.rotateX(-Math.PI / 2);
      return { line: this.own(line), fill: this.own(fill) };
    };
    this.frames = { 2: frame(2), 3: frame(3) };
    const flat = (color: string, opacity: number, onTop = false) =>
      this.own(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: !onTop, side: T.DoubleSide }));
    const mark = (geometry: T.BufferGeometry, material: T.Material, order: number) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.visible = false;
      mesh.renderOrder = order;
      this.scene.add(mesh);
      return mesh;
    };
    this.selected = mark(this.frames[2].line, flat("#5fc2ff", 0.95), 5);
    this.hinted = mark(this.frames[2].line, flat("#ffb21f", 0.97), 6);
    this.ghost = mark(this.frames[2].line, flat("#ffb21f", 0.7), 6);
    this.ghostFill = mark(this.frames[2].fill, flat("#ffd060", 0.26), 5);
    const gold = flat("#ffb21f", 0.95, true),
      tip = new T.ShapeGeometry(new T.Shape([new T.Vector2(0, 0.24), new T.Vector2(0.38, 0), new T.Vector2(0, -0.24)]));
    tip.rotateX(-Math.PI / 2);
    const bar = new T.PlaneGeometry(1, 0.13);
    bar.rotateX(-Math.PI / 2);
    bar.translate(0.5, 0, 0);
    this.shaft = new T.Mesh(this.own(bar), gold);
    const head = new T.Mesh(this.own(tip), gold);
    head.name = "tip";
    this.shaft.renderOrder = head.renderOrder = 10;
    this.arrow.add(this.shaft, head);
    this.arrow.visible = false;
    this.scene.add(this.arrow);
    const dot = this.own(new T.CircleGeometry(0.1, 20));
    dot.rotateX(-Math.PI / 2);
    const dotPaint = flat("#ffffff", 0.9, true);
    for (let k = 0; k < SIZE; k++) this.dots.push(mark(dot, dotPaint, 8));
    // A dragged vehicle is followed at the height of the car roofs.
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -GRAB_HEIGHT);
    this.begin();
  }
  /** What stands round the lot, kept low on the near side so that nothing hides a square. */
  private scenery(keep: <R extends { dispose(): void }>(r: R) => R) {
    const brick = this.standard({ ...stuff("brick", "#a25b3f", 5, keep, 0.4), roughness: 0.9 }),
      coping = this.standard({ color: "#cfcac0", roughness: 0.8 }),
      hedge = this.standard({ ...stuff("grass", "#3b7333", 3, keep), roughness: 0.95 }),
      bark = this.standard({ color: "#6b4a2e", roughness: 0.9 }),
      leaf = this.standard({ color: "#4f8a3a", roughness: 0.85 }),
      leafDark = this.standard({ color: "#3e7432", roughness: 0.85 }),
      pole = this.standard({ color: "#3a3d42", roughness: 0.5, metalness: 0.5 }),
      glow = this.standard({ color: "#fff8e0", emissive: "#fff2c8", emissiveIntensity: 0.7 });
    // The wall runs from the café's back corner to the gate's side.
    const wallLeft = CAFE.right,
      wallRight = LANE_END - 0.2,
      wallZ = -(KERB + 0.55);
    this.add(block(wallRight - wallLeft, 0.34, 0.24, 0.03), brick, (wallLeft + wallRight) / 2, 0.17, wallZ);
    this.add(block(wallRight - wallLeft + 0.04, 0.05, 0.3, 0.02), coping, (wallLeft + wallRight) / 2, 0.36, wallZ);
    const trunk = this.own(new T.CylinderGeometry(0.07, 0.1, 0.7, 10)),
      crown = this.own(new T.IcosahedronGeometry(0.55, 1));
    [-4.2, -2.6, -1, 0.6, 2.2, 3.8].forEach((x, k) => {
      const z = wallZ - 0.75 - (k % 2) * 0.35,
        t = new T.Mesh(trunk, bark),
        c = new T.Mesh(crown, k % 2 ? leaf : leafDark);
      t.position.set(x, 0.35, z);
      c.position.set(x, 0.95, z);
      c.scale.setScalar(0.85 + (k % 3) * 0.12);
      t.castShadow = c.castShadow = true;
      this.scene.add(t, c);
    });
    // A hedge along the near side, low enough to hide nothing, from beyond the café's terrace to the lane.
    const hedgeLeft = CAFE.left - 0.05;
    this.add(block(LANE_END - 0.1 - hedgeLeft, 0.26, 0.36, 0.12), hedge, (LANE_END - 0.1 + hedgeLeft) / 2, 0.13, KERB + 0.5);
    // Two lamp posts at the far corners (the left one on the café's walk).
    for (const x of [-(KERB + 0.6), LOT + 0.9]) {
      const z = wallZ + 0.35;
      this.add(new T.CylinderGeometry(0.04, 0.05, 2, 10), pole, x, 1, z);
      this.add(block(0.42, 0.05, 0.08, 0.02), pole, x + (x < 0 ? 0.18 : -0.18), 1.98, z);
      this.add(block(0.22, 0.05, 0.14, 0.02), glow, x + (x < 0 ? 0.34 : -0.34), 1.94, z);
    }
    // The ticket booth by the gate.
    const wall = this.standard({ color: "#f3f1ea", roughness: 0.6 }),
      pane = this.own(glossy({ color: "#26313d", roughness: 0.15, metalness: 0.3 })),
      roof = this.standard({ color: "#2f6d8f", roughness: 0.6 }),
      bx = GATE_X + 0.45,
      bz = EXIT_Z + CELL / 2 + 0.85;
    this.add(block(0.56, 0.78, 0.66, 0.04), wall, bx, 0.39, bz);
    this.add(block(0.58, 0.24, 0.5, 0.02), pane, bx, 0.56, bz);
    this.add(block(0.4, 0.24, 0.68, 0.02), pane, bx, 0.56, bz);
    this.add(block(0.74, 0.07, 0.84, 0.03), roof, bx, 0.82, bz);
    // The café at the left, with its terrace and its walk to the kerb.
    cafe({ root: this.scene, keep, paint: (options) => this.standard(options) });
  }
  private paintOf(color: number) {
    let material = this.paints.get(color);
    if (!material) {
      material = this.own(glossy({ color: PAINT[color % PAINT.length], roughness: 0.32, metalness: 0.25 }));
      this.paints.set(color, material);
    }
    return material;
  }
  /** Which way a vehicle's front points along its line (the red car toward the gate), and which kind a truck is. */
  private looks(v: Vehicle, i: number) {
    return { forward: v.red || (i * 3 + v.color) % 2 === 0, kind: (v.length === 2 ? "car" : (i + v.color) % 2 ? "van" : "lorry") as Kind };
  }
  /** Builds the vehicles of a puzzle (their places are set by `place`). */
  private lay(state: State) {
    const key = state.vehicles.map((v) => `${v.length}${v.horizontal ? "h" : "v"}${v.color}`).join(",");
    if (key === this.built) return;
    this.built = key;
    this.cars.clear();
    this.models = state.vehicles.map((v, i) => {
      const model = new T.Group(),
        { forward, kind } = this.looks(v, i),
        add = (parts: Partial<Record<Part, T.BufferGeometry>>) => {
          for (const [part, geometry] of Object.entries(parts) as [Part, T.BufferGeometry][]) {
            const mesh = new T.Mesh(geometry, part === "paint" ? this.paintOf(v.color) : this.paint[part]);
            mesh.castShadow = mesh.receiveShadow = true;
            model.add(mesh);
          }
        };
      add(this.kinds[kind]);
      if (v.red) add(this.kinds.stripes);
      model.rotation.y = v.horizontal ? (forward ? 0 : Math.PI) : forward ? Math.PI / 2 : -Math.PI / 2;
      model.userData.vehicle = i;
      this.cars.add(model);
      return model;
    });
  }
  protected subject(aspect: number): TableSubject {
    return parkingSubject(aspect);
  }
  protected spots(): Spot[] {
    return Array.from({ length: CELLS }, (_, point) => ({ ...cellAt(point), y: 0.02, r: CELL * 0.62, point }));
  }
  /** A press is on a vehicle when it strikes one: the vehicle's anchor. */
  protected pick(ray: T.Ray) {
    const state = this.state;
    if (!state || this.animating) return null;
    this.cars.updateMatrixWorld(true);
    this.caster.ray.copy(ray);
    const hit = this.caster.intersectObjects(
      this.models.filter((m) => m.visible),
      true,
    )[0];
    let thing: T.Object3D | null = hit?.object ?? null;
    while (thing && thing.userData.vehicle === undefined) thing = thing.parent;
    return thing ? state.vehicles[thing.userData.vehicle as number].anchor : null;
  }
  protected hover(point: number) {
    const state = this.state;
    if (this.held) return;
    this.renderer.domElement.style.cursor = state && state.winner === null && point >= 0 && vehicleAt(state, point) >= 0 ? "grab" : "default";
  }
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null) return false;
    // Every press is taken here, so that a tap moves nothing; only one on a vehicle takes it up.
    this.held = null;
    const index = point >= 0 && point < CELLS ? vehicleAt(state, point) : -1;
    if (index < 0) return true;
    const v = state.vehicles[index],
      { lo, hi } = reach(state, index),
      axis = v.horizontal ? "x" : "z";
    this.held = { index, axis, start: at[axis], origin: vehicleCentre(v)[axis], lo: vehicleCentre({ ...v, anchor: lo })[axis], hi: vehicleCentre({ ...v, anchor: hi })[axis] };
    this.renderer.domElement.style.cursor = "grabbing";
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const held = this.held;
    if (!held) return;
    const model = this.models[held.index];
    model.position[held.axis] = Math.max(held.lo, Math.min(held.hi, held.origin + at[held.axis] - held.start));
    this.redraw();
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const held = this.held,
      state = this.state;
    this.held = null;
    this.renderer.domElement.style.cursor = "grab";
    if (!held || !state) return;
    const model = this.models[held.index],
      v = state.vehicles[held.index],
      squares = at ? Math.round((model.position[held.axis] - held.origin) / CELL) : 0;
    if (squares) {
      this.dropped = { index: held.index, x: model.position.x, z: model.position.z };
      this.onMove({ from: v.anchor, to: v.anchor + squares * (v.horizontal ? 1 : SIZE), extra: -1 });
      // A move that was not taken (the table was still busy) leaves the vehicle to go back.
      if (this.state !== state) return;
      this.dropped = null;
    }
    // Back to where it stood.
    const from = model.position[held.axis];
    if (Math.abs(from - held.origin) < 1e-3) return this.place(state);
    this.tween(0, 140, (p) => (model.position[held.axis] = from + (held.origin - from) * (1 - (1 - p) ** 3)));
  }
  protected place(state: State) {
    this.lay(state);
    state.vehicles.forEach((v, i) => {
      const model = this.models[i],
        c = vehicleCentre(v);
      model.position.set(c.x, 0, c.z);
      model.rotation.y = v.horizontal ? (this.looks(v, i).forward ? 0 : Math.PI) : this.looks(v, i).forward ? Math.PI / 2 : -Math.PI / 2;
      // The red car has driven away once the puzzle is solved.
      model.visible = !(v.red && state.winner === 0);
    });
    const open = state.winner === 0;
    this.boom.rotation.x = open ? RAISED : 0;
    this.lamp.material = open ? this.lamps.open : this.lamps.shut;
    this.mark(this.marks);
  }
  protected animate(before: State, state: State) {
    const i = state.last;
    if (i === null || state.ply !== before.ply + 1 || !before.vehicles[i] || before.vehicles.length !== state.vehicles.length) return false;
    const model = this.models[i],
      v = state.vehicles[i],
      dropped = this.dropped?.index === i ? this.dropped : null,
      start = dropped ?? vehicleCentre(before.vehicles[i]),
      end = vehicleCentre(v),
      way = Math.hypot(end.x - start.x, end.z - start.z) / CELL,
      slide = 120 + 90 * Math.min(4, way);
    this.dropped = null;
    model.position.set(start.x, 0, start.z);
    this.tween(0, slide, (p) => {
      const e = 1 - (1 - p) ** 3;
      model.position.set(start.x + (end.x - start.x) * e, 0, start.z + (end.z - start.z) * e);
      if (p === 1) this.onContact();
    });
    if (!(v.red && state.winner === 0)) return true;
    // Out: the lamp turns green and the boom rises, then the red car drives through and away down the road.
    this.tween(slide, 420, (p) => {
      this.lamp.material = this.lamps.open;
      this.boom.rotation.x = RAISED * p * p * (3 - 2 * p);
    });
    this.tween(slide + 260, 1700, (p) => {
      const at = route(ROUTE * p ** 1.7);
      model.position.set(at.x, 0, at.z);
      model.rotation.y = -at.turn;
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const topOf = (cell: number) => {
      const i = vehicleAt(state, cell);
      return i < 0 ? 0.03 : state.vehicles[i].length === 3 ? TRUCK_TOP + 0.03 : CAR_TOP + 0.03;
    };
    // The keyboard's ring, over whatever stands on its square.
    const cursor = marks.cursor;
    this.cursor.visible = cursor !== null && cursor >= 0 && cursor < CELLS;
    if (this.cursor.visible) {
      const p = cellAt(cursor!);
      this.cursor.position.set(p.x, topOf(cursor!), p.z);
    }
    /** Lays a frame round where a vehicle stands, or would stand with its anchor at `anchor`. */
    const frame = (mesh: T.Mesh, index: number, anchor = state.vehicles[index]?.anchor, fill = false) => {
      const v = state.vehicles[index];
      mesh.visible = !!v && !(v.red && state.winner === 0);
      if (!mesh.visible) return;
      const c = vehicleCentre({ ...v, anchor }),
        shape = this.frames[v.length === 3 ? 3 : 2];
      mesh.geometry = fill ? shape.fill : shape.line;
      mesh.position.set(c.x, fill ? 0.012 : 0.016, c.z);
      mesh.rotation.y = v.horizontal ? 0 : Math.PI / 2;
    };
    const hint = marks.hint ?? null,
      hintIndex = hint ? state.vehicles.findIndex((v) => v.anchor === hint.from) : -1,
      chosen = marks.selected !== null ? vehicleAt(state, marks.selected) : -1;
    if (chosen >= 0 && chosen !== hintIndex) frame(this.selected, chosen);
    else this.selected.visible = false;
    // Where the chosen vehicle may go, one dot on the square its anchor would stand on.
    this.dots.forEach((dot, k) => {
      const target = marks.targets[k];
      dot.visible = target !== undefined && target >= 0 && target < CELLS;
      if (!dot.visible) return;
      const p = cellAt(target);
      dot.position.set(p.x, topOf(target) + 0.01, p.z);
    });
    // A hint: a gold frame round the vehicle to move, a gold place where it goes, and an arrow between.
    if (hint && hintIndex >= 0) {
      frame(this.hinted, hintIndex);
      frame(this.ghost, hintIndex, hint.to);
      frame(this.ghostFill, hintIndex, hint.to, true);
      const v = state.vehicles[hintIndex],
        from = vehicleCentre(v),
        to = vehicleCentre({ ...v, anchor: hint.to }),
        length = Math.max(0.5, Math.hypot(to.x - from.x, to.z - from.z));
      this.arrow.visible = true;
      this.arrow.position.set(from.x, (v.length === 3 ? TRUCK_TOP : CAR_TOP) + 0.12, from.z);
      this.arrow.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x);
      this.shaft.scale.x = Math.max(0.1, length - 0.38);
      this.arrow.getObjectByName("tip")!.position.x = Math.max(0.1, length - 0.38);
    } else this.hinted.visible = this.ghost.visible = this.ghostFill.visible = this.arrow.visible = false;
  }
}
