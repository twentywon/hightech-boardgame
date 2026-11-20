import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { cameraDistance } from "../../engine/camera";
import { block, glossy, hop, travel, veneer, weave, wood } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Move } from "../points/types";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import {
  BOARD_TOP,
  CARRY,
  CELL,
  FALL_MS,
  FLOOR,
  FUNNEL,
  FUNNEL_MOUTH,
  HIGH,
  LIFT_DOWN,
  LIFT_UP,
  MARBLE,
  ROLL_MS,
  TRAY_SCALE,
  TRAY_TOP,
  TURNTABLE,
  WIDE,
  boardMiddle,
  cellLocal,
  cellUnder,
  funnelLevel,
  keyPlaces,
  levelY,
  marbleSubject,
  sideways,
  tallest,
  toBench,
  trayBox,
  trayHeight,
  trayPlaces,
} from "./layout";
import {
  CELLS,
  CORNER,
  CROSS,
  DOWN,
  FLAT,
  GO,
  HANG,
  KIT,
  OPEN,
  PUT,
  RAMP,
  UP,
  attempt,
  back,
  handle,
  heightOf,
  ids,
  middle,
  postureOf,
  put,
  putOf,
  topIn,
  trayYaw,
  vox,
  voxelsOf,
  world,
  type Leg,
  type Place,
  type Pose,
  type State,
  type Tower,
  type Unit,
  type World,
} from "./rules";
import { workshop } from "./workshop";

export const MARBLE_COLORS: [string, string] = ["#3b86d8", "#d9b88a"];
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A compass direction as a step over the turntable (x, z). */
const STEP = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
/** A yaw (clockwise quarters seen from above) as a turn about the upright. */
const spin = (yaw: number) => (-yaw * Math.PI) / 2;
const qY = (angle: number) => new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), angle);
const qX = (angle: number) => new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), angle);
/**
 * A pose as a turn of the tower's own frame (its units up +y from its foot, north −z): turned by its yaw; on its head
 * flipped over about east–west first; lying, tipped over toward its side `roll` first (so that side faces down and
 * its top points that way). The same turns as `faceIn` in the rules.
 */
export function poseTurn(pose: Pose) {
  const yaw = qY(spin(pose.yaw));
  if (pose.lying)
    return yaw
      .multiply(qY(spin(pose.roll)))
      .multiply(qX(-Math.PI / 2))
      .multiply(qY(-spin(pose.roll)));
  if (pose.inverted) return yaw.multiply(qX(Math.PI));
  return yaw;
}
/** The frame's bars: how thick, and how far a corner post stands from a unit's middle. */
const BAR = 0.05,
  EDGE = (WIDE - BAR) / 2,
  INNER = WIDE - 2 * BAR;
/** A ramp's board runs from this height at its back down to the floor at its front. */
const RAMP_HIGH = 0.6;
/** A channel's walls: half its width, and their height. */
const CHANNEL = 0.17,
  RAIL = 0.1;
/** The arch over an opening: its half width, the height of its opening's sides, and its whole height. */
const ARCH = 0.2,
  ARCH_SIDE = 0.2,
  ARCH_TOP = 0.5;
const canvasOf = (w: number, h = w) => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, pen: canvas.getContext("2d")! };
};
/** The swirl inside the glass marble: ribbons of cobalt and amber twisting round a milky core. */
function swirlTexture() {
  const { canvas, pen } = canvasOf(256, 128);
  pen.fillStyle = "#f4f1e8";
  pen.fillRect(0, 0, 256, 128);
  for (const [color, phase, width] of [
    ["#1f57c8", 0, 22],
    ["#f0a020", 1.6, 16],
    ["#1f57c8", 3.2, 14],
    ["#f0a020", 4.7, 10],
  ] as [string, number, number][]) {
    pen.strokeStyle = color;
    pen.lineWidth = width;
    pen.beginPath();
    for (let x = -10; x <= 266; x += 4) {
      const y = 64 + Math.sin((x / 256) * Math.PI * 4 + phase) * 40;
      if (x === -10) pen.moveTo(x, y);
      else pen.lineTo(x, y);
    }
    pen.stroke();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  return texture;
}
/** The felt of the target cup: darker toward its edge, as the inside of a cup is in shade. */
function feltTexture() {
  const { canvas, pen } = canvasOf(128);
  const g = pen.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0, "#3f8a52");
  g.addColorStop(0.7, "#2a6a3b");
  g.addColorStop(1, "#123a20");
  pen.fillStyle = g;
  pen.fillRect(0, 0, 128, 128);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** A chequered flag. */
function flagTexture() {
  const { canvas, pen } = canvasOf(96, 64);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 6; c++) {
      pen.fillStyle = (r + c) % 2 ? "#1d1d22" : "#fbfaf5";
      pen.fillRect(c * 16, r * 16, 16, 16);
    }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** The warning over a place of trouble: a red disc with a white mark. */
function warningTexture() {
  const { canvas, pen } = canvasOf(128);
  pen.fillStyle = "#e0392b";
  pen.beginPath();
  pen.arc(64, 64, 58, 0, Math.PI * 2);
  pen.fill();
  pen.lineWidth = 8;
  pen.strokeStyle = "#ffffff";
  pen.stroke();
  pen.fillStyle = "#ffffff";
  pen.fillRect(55, 26, 18, 52);
  pen.beginPath();
  pen.arc(64, 96, 10, 0, Math.PI * 2);
  pen.fill();
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** The turntable's top: rings of grain, a dark inlaid ring and ticks round its edge, the grid's dark bed. */
function dialTexture() {
  const { canvas, pen } = canvasOf(1024);
  const scale = 1024 / (2 * TURNTABLE),
    mid = 512;
  pen.fillStyle = "#c58e5a";
  pen.fillRect(0, 0, 1024, 1024);
  for (let r = 40; r < 512; r += 9) {
    pen.strokeStyle = `rgba(90, 50, 20, ${0.05 + 0.05 * Math.sin(r * 0.37)})`;
    pen.lineWidth = 2 + 2 * Math.abs(Math.sin(r * 0.11));
    pen.beginPath();
    pen.arc(mid, mid, r, 0, Math.PI * 2);
    pen.stroke();
  }
  pen.strokeStyle = "#5a3520";
  pen.lineWidth = 10;
  pen.beginPath();
  pen.arc(mid, mid, (TURNTABLE - 0.16) * scale, 0, Math.PI * 2);
  pen.stroke();
  pen.lineWidth = 6;
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2,
      r0 = (TURNTABLE - 0.12) * scale,
      r1 = (TURNTABLE - (k % 4 ? 0.04 : 0.0)) * scale;
    pen.beginPath();
    pen.moveTo(mid + Math.cos(a) * r0, mid + Math.sin(a) * r0);
    pen.lineTo(mid + Math.cos(a) * r1, mid + Math.sin(a) * r1);
    pen.stroke();
  }
  const half = 2 * CELL * scale;
  pen.fillStyle = "#6e4329";
  pen.fillRect(mid - half - 10, mid - half - 10, 2 * half + 20, 2 * half + 20);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
/** One stretch of the marble's way: how long it takes, where the marble is along it, and what is heard as it ends. */
interface Stretch {
  ms: number;
  at: (u: number) => T.Vector3;
  sound?: "disc" | "cushion" | "pocket";
  strength?: number;
}
const lerp3 = (a: T.Vector3, b: T.Vector3, u: number) => new T.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
const roll = (a: T.Vector3, b: T.Vector3, sound?: Stretch["sound"]): Stretch => ({ ms: ROLL_MS * (0.45 + 1.2 * a.distanceTo(b)), at: (u) => lerp3(a, b, u), sound, strength: 0.4 });
/** A fall from `a` to `b`: across at an even pace and down faster and faster. */
const drop = (a: T.Vector3, b: T.Vector3, sound: Stretch["sound"] = "disc"): Stretch => ({
  ms: FALL_MS * (0.7 + 1.2 * Math.sqrt(Math.max(0.01, a.y - b.y))),
  at: (u) => new T.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u * u, a.z + (b.z - a.z) * u),
  sound,
  strength: 0.7,
});
/** A rest where the marble is, with a little bounce that dies away. */
const settle = (a: T.Vector3, height = 0.05, ms = 360): Stretch => ({ ms, at: (u) => new T.Vector3(a.x, a.y + height * Math.abs(Math.sin(Math.PI * 2 * u)) * (1 - u), a.z) });
/** The press the player is making on the table. */
interface Press {
  kind: "piece" | "start" | "spin";
  piece: number;
  cell: number;
  x: number;
  y: number;
  turn: number;
  lift: number;
  moving: boolean;
}
type Part = "frame" | "cap" | "boards" | "floors" | "brass" | "burnt" | "skirt" | "mark";
const PARTS: Part[] = ["frame", "cap", "boards", "floors", "brass", "burnt", "skirt", "mark"];
/**
 * A toymaker's marble run on a workbench: a round maple turntable with a 4 × 4 grid inlaid, and towers of the kit,
 * each a column of open frames of its own wood with a painted cap and an ivory peg on the cap's yaw-0 side. In the
 * frames: ramps (a walnut board sloping to its exit, a brass lip along its low edge, an arrow burnt into it pointing
 * out, a brass arch over the exit and low walls on its closed sides), straight and turning channels and crossings
 * (a pale floor with low walls and an arch at each opening) and hanging crossings (the same fixed under the cube's
 * ceiling, upside down), and empty cubes. Towers fixed from the start have smoked frames, a dark foot and brass lock
 * pins. The start has a brass funnel over it; the target is a felt-lined brass cup with a chequered flag. The towers
 * to set stand in a walnut tray in their postures (standing, on their heads, or lying), turned as the turntable is.
 * A tower is dragged from the tray onto a cell (a ghost shows where it would land), carried between cells or off the
 * board back to the tray, and turned by a tap; dragging anything else turns the turntable (a little tilt is allowed
 * too). A tap on the funnel drops the glass marble, which rolls its way down or comes to grief, a red mark standing
 * where it did.
 */
export class MarbleView extends TableView<State> {
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private turn = 0;
  private lift = 0;
  /** How high the puzzle's stacks reach, which the camera frames. */
  private storeys = 4;
  private aspect = 1;
  private built = "";
  private table = new T.Group();
  private fixed = new T.Group();
  /** The tray's towers, by index (children of the scene, placed in bench coordinates). */
  private pieces: T.Group[] = [];
  private trayGroup = new T.Group();
  private flag: T.Group | null = null;
  private funnel = new T.Group();
  private marble = new T.Group();
  private stuffs: Record<"walnut" | "floor" | "brass" | "funnel" | "hole" | "maple" | "felt" | "flag" | "plot" | "dial" | "base" | "tray" | "burnt" | "ivory" | "lock", T.Material>;
  /** By kit tower: its frame's wood (in the tray and placed, and smoked when fixed), its cap's paint. */
  private woods: { live: T.Material; fixed: T.Material; skirt: T.Material; skirtFixed: T.Material; paint: T.Material }[] = [];
  private ghostStuffs: Record<"gold" | "green", T.Material>;
  private proxyStuff: T.Material;
  private shapes: Record<"proxy" | "plot" | "base" | "funnel" | "hole" | "cupRim" | "felt" | "pin" | "knob" | "pennant" | "lockPin", T.BufferGeometry>;
  private models = new Map<number, Record<Part, T.BufferGeometry | null>>();
  private trayShapes = new Map<string, T.BufferGeometry>();
  private scenery: ReturnType<typeof workshop>;
  private caster = new T.Raycaster();
  private proxies: T.Object3D[] = [];
  private plots: T.Mesh[] = [];
  private struck: { kind: "tray" | "given" | "start" | "cell" | "none"; index: number; cell: number } = { kind: "none", index: -1, cell: -1 };
  private rings: Record<"cursor" | "chosen" | "from" | "to" | "aim" | "funnel" | "refuse", T.Mesh>;
  private targets: T.Mesh[] = [];
  private alarms: { ring: T.Mesh; sign: T.Sprite }[] = [];
  private ghosts = new Map<string, T.Group>();
  private arrow: T.Mesh;
  private clock = 0;
  private press: Press | null = null;
  private pointer = { x: 0, y: 0 };
  private hear = (e: PointerEvent) => {
    this.pointer = { x: e.clientX, y: e.clientY };
  };
  /** Where a carried tower was let go, so that it goes on from there. */
  private dropped: { piece: number; at: T.Vector3; quaternion: T.Quaternion } | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#3a2a1e");
    const keep: Own = (r) => this.own(r);
    this.daylight("#fff3e2", "#4a3524", "#ffe3bd", 10, 2.2);
    const lamp = new T.PointLight("#ffd29a", 6, 16, 1.6);
    lamp.position.set(-4.5, 6, 1.5);
    this.scene.add(lamp);
    const pale = keep(wood(false)),
      dark = keep(wood(true));
    this.stuffs = {
      walnut: this.standard({ map: pale, color: "#d6a472", roughness: 0.5 }),
      floor: this.standard({ map: pale, color: "#fbe9c8", roughness: 0.55 }),
      brass: keep(glossy({ color: "#d9a845", metalness: 0.6, roughness: 0.3 })),
      funnel: keep(glossy({ color: "#d9a845", metalness: 0.6, roughness: 0.3, side: T.DoubleSide })),
      hole: this.standard({ color: "#160e09", roughness: 1 }),
      maple: this.standard({ map: pale, color: "#e8c89a", roughness: 0.55 }),
      felt: this.standard({ map: keep(feltTexture()), roughness: 1, ...weave(2, 2, keep, 0.6) }),
      flag: this.standard({ map: keep(flagTexture()), roughness: 0.8, side: T.DoubleSide }),
      plot: this.standard({ map: keep(veneer(false)), color: "#f6e3c4", roughness: 0.6 }),
      dial: this.standard({ map: keep(dialTexture()), roughness: 0.55 }),
      base: this.standard({ map: dark, color: "#4a2c1c", roughness: 0.6 }),
      tray: this.standard({ map: dark, color: "#9a6a48", roughness: 0.6 }),
      burnt: this.standard({ color: "#1c0d05", roughness: 0.95, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      ivory: keep(glossy({ color: "#fbf6e6", roughness: 0.3 })),
      lock: keep(glossy({ color: "#b8862c", metalness: 0.7, roughness: 0.28 })),
    };
    this.woods = KIT.map((k) => {
      const tint = new T.Color(k.wood),
        smoked = tint.clone().multiplyScalar(0.62);
      return {
        live: this.standard({ map: pale, color: tint, roughness: 0.55 }),
        fixed: this.standard({ map: dark, color: smoked.clone().lerp(new T.Color("#e2b48c"), 0.35), roughness: 0.5 }),
        skirt: this.standard({ map: pale, color: tint.clone().multiplyScalar(0.92), roughness: 0.6 }),
        skirtFixed: this.standard({ map: dark, color: smoked, roughness: 0.6 }),
        paint: keep(glossy({ color: k.paint, roughness: 0.35 })),
      };
    });
    this.ghostStuffs = {
      gold: this.standard({ color: "#ffb21f", emissive: "#8a5200", roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false }),
      green: this.standard({ color: "#7fe0a0", emissive: "#1e6b3a", roughness: 0.6, transparent: true, opacity: 0.5, depthWrite: false }),
    };
    this.proxyStuff = keep(new T.MeshBasicMaterial({ visible: false }));
    const funnelProfile = [
      [0.08, -0.02],
      [0.09, 0.02],
      [0.15, FUNNEL * 0.45],
      [FUNNEL_MOUTH, FUNNEL],
      [FUNNEL_MOUTH + 0.02, FUNNEL + 0.01],
      [FUNNEL_MOUTH - 0.005, FUNNEL + 0.02],
    ].map(([r, y]) => new T.Vector2(r, y));
    const pennant = new T.Shape();
    pennant.moveTo(0, 0);
    pennant.lineTo(0.3, -0.02);
    pennant.lineTo(0.3, -0.2);
    pennant.lineTo(0, -0.2);
    pennant.lineTo(0, 0);
    this.shapes = {
      proxy: keep(new T.BoxGeometry(WIDE, HIGH, WIDE).translate(0, HIGH / 2, 0)),
      plot: keep(block(CELL * 0.94, 0.02, CELL * 0.94, 0.008)),
      base: keep(block(WIDE + 0.06, 0.04, WIDE + 0.06, 0.012)),
      funnel: keep(new T.LatheGeometry(funnelProfile, 36)),
      hole: keep(new T.CircleGeometry(0.13, 28).rotateX(-Math.PI / 2)),
      cupRim: keep(new T.TorusGeometry(0.28, 0.055, 14, 44).rotateX(Math.PI / 2).scale(1, 0.7, 1)),
      felt: keep(new T.CircleGeometry(0.24, 36).rotateX(-Math.PI / 2)),
      pin: keep(new T.CylinderGeometry(0.012, 0.012, 0.7, 10)),
      knob: keep(new T.SphereGeometry(0.034, 14, 10)),
      pennant: keep(new T.ShapeGeometry(pennant)),
      lockPin: keep(new T.CylinderGeometry(0.03, 0.035, 0.1, 12)),
    };
    const swirl = new T.Mesh(keep(new T.SphereGeometry(MARBLE * 0.82, 24, 16)), this.standard({ map: keep(swirlTexture()), roughness: 0.4 }));
    const shell = new T.Mesh(keep(new T.SphereGeometry(MARBLE, 28, 18)), keep(glossy({ color: "#e6f3ff", roughness: 0.04, transparent: true, opacity: 0.38 })));
    swirl.castShadow = shell.castShadow = true;
    this.marble.add(swirl, shell);
    this.scenery = workshop(this.scene, keep);
    this.lathe(keep);
    const middleAt = boardMiddle(this.aspect);
    this.table.position.set(middleAt.x, 0, middleAt.z);
    this.table.add(this.fixed, this.marble);
    this.scene.add(this.table, this.trayGroup);
    const flat = (color: string, opacity: number) => keep(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: T.DoubleSide }));
    const ring = (inner: number, outer: number, material: T.Material) => {
      const mesh = new T.Mesh(keep(new T.RingGeometry(inner, outer, 48).rotateX(-Math.PI / 2)), material);
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.scene.add(mesh);
      return mesh;
    };
    const gold = flat("#ffb21f", 0.95);
    this.rings = {
      cursor: ring(0.46, 0.52, flat("#ffffff", 0.95)),
      chosen: ring(0.4, 0.47, flat("#62cfff", 0.95)),
      from: ring(0.4, 0.48, gold),
      to: ring(0.4, 0.48, gold),
      aim: ring(0.38, 0.47, flat("#7fe0a0", 0.95)),
      funnel: ring(FUNNEL_MOUTH + 0.04, FUNNEL_MOUTH + 0.12, gold),
      refuse: ring(0.38, 0.47, flat("#e0392b", 0.95)),
    };
    const faint = flat("#ffffff", 0.55);
    for (let k = 0; k < CELLS; k++) this.targets.push(ring(0.2, 0.25, faint));
    const red = flat("#e0392b", 0.95),
      warning = keep(new T.SpriteMaterial({ map: keep(warningTexture()), depthTest: false, transparent: true }));
    for (let k = 0; k < 8; k++) {
      const sign = new T.Sprite(warning);
      sign.scale.setScalar(0.36);
      sign.renderOrder = 12;
      sign.visible = false;
      this.scene.add(sign);
      this.alarms.push({ ring: ring(0.42, 0.52, red), sign });
    }
    this.arrow = new T.Mesh(keep(new T.ConeGeometry(0.1, 0.25, 16).rotateX(Math.PI)), keep(new T.MeshBasicMaterial({ color: "#ffffff" })));
    this.arrow.visible = false;
    this.arrow.renderOrder = 10;
    this.scene.add(this.arrow);
    // A carried tower is followed over a plane above the board, so that it is never hidden in a stack.
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -CARRY);
    host.addEventListener("pointerdown", this.hear, true);
    host.addEventListener("pointermove", this.hear, true);
    this.renderer.domElement.dataset.turn = "0";
    this.renderer.domElement.dataset.lift = "0";
    this.renderer.domElement.dataset.storeys = String(this.storeys);
    this.begin();
  }
  /** The turntable itself: a round maple top on a dark foot, a brass ring round its edge, its grid of squares. */
  private lathe(keep: Own) {
    const top = new T.Mesh(keep(new T.CylinderGeometry(TURNTABLE, TURNTABLE, 0.1, 96)), [this.stuffs.maple, this.stuffs.dial, this.stuffs.maple]);
    top.position.y = BOARD_TOP - 0.05;
    top.rotation.y = Math.PI / 2;
    const foot = new T.Mesh(keep(new T.CylinderGeometry(TURNTABLE - 0.35, TURNTABLE - 0.2, BOARD_TOP - 0.1, 64)), this.stuffs.base);
    foot.position.y = (BOARD_TOP - 0.1) / 2;
    const band = new T.Mesh(keep(new T.TorusGeometry(TURNTABLE, 0.022, 8, 120).rotateX(Math.PI / 2)), this.stuffs.brass);
    band.position.y = BOARD_TOP - 0.05;
    top.castShadow = top.receiveShadow = foot.receiveShadow = true;
    this.table.add(top, foot, band);
    for (let cell = 0; cell < CELLS; cell++) {
      const at = cellLocal(cell),
        plot = new T.Mesh(this.shapes.plot, this.stuffs.plot);
      plot.position.set(at.x, BOARD_TOP + 0.002, at.z);
      plot.receiveShadow = true;
      this.table.add(plot);
      this.plots.push(plot);
    }
  }
  /** A kit tower's parts, merged by stuff, in its own frame (units up +y from its foot, north −z). */
  private model(kind: number) {
    const known = this.models.get(kind);
    if (known) return known;
    const parts: Record<Part, T.BufferGeometry[]> = { frame: [], cap: [], boards: [], floors: [], brass: [], burnt: [], skirt: [], mark: [] },
      add = (into: Part, geometry: T.BufferGeometry, matrix: T.Matrix4) => parts[into].push((geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(matrix)),
      units = KIT[kind].units,
      n = units.length,
      tall = n * HIGH,
      at = (x: number, y: number, z: number) => new T.Matrix4().makeTranslation(x, y, z),
      barX = block(WIDE, BAR, BAR, 0.015),
      barZ = block(BAR, BAR, WIDE, 0.015),
      post = block(BAR, tall, BAR, 0.015),
      knob = block(0.1, 0.08, 0.1, 0.028);
    // The frame: four posts all the way up, a ring of bars at its foot, between each two cubes and at its top
    // (painted, with knobs at the corners); an ivory peg on the cap's north bar marks its yaw-0 side.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add("frame", post, at(sx * EDGE, tall / 2, sz * EDGE));
    for (let k = 0; k <= n; k++) {
      const y = k === 0 ? BAR / 2 : k === n ? tall - BAR / 2 : k * HIGH,
        into: Part = k === n || k === 0 ? "cap" : "frame";
      for (const sz of [-1, 1]) add(into, barX, at(0, y, sz * EDGE));
      for (const sx of [-1, 1]) add(into, barZ, at(sx * EDGE, y, 0));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.04, tall - 0.04]) add("cap", knob, at(sx * EDGE, y, sz * EDGE));
    const peg = new T.CylinderGeometry(0.045, 0.045, 0.05, 16);
    add("mark", peg, at(0, tall + 0.02, -EDGE));
    add("mark", peg, at(0, -0.02, -EDGE));
    peg.dispose();
    units.forEach((unit, i) => this.inside(unit, (into, geometry, matrix) => add(into, geometry, new T.Matrix4().makeTranslation(0, i * HIGH, 0).multiply(matrix))));
    for (const g of [barX, barZ, post, knob]) g.dispose();
    const merged = {} as Record<Part, T.BufferGeometry | null>;
    for (const name of PARTS) {
      const list = parts[name];
      merged[name] = list.length ? this.own(mergeGeometries(list)!) : null;
      for (const g of list) g.dispose();
    }
    this.models.set(kind, merged);
    return merged;
  }
  /**
   * What a unit holds, in the unit's own frame (its foot at y = 0, north −z): a ramp's board, a channel's floor and
   * walls, arches over its openings and low walls on its closed sides; a hanging crossing is the crossing turned
   * over under the ceiling.
   */
  private inside(unit: Unit, put: (into: Part, geometry: T.BufferGeometry, matrix: T.Matrix4) => void) {
    const turned = (face: number, x: number, y: number, z: number, extra = new T.Matrix4()) =>
      new T.Matrix4()
        .makeRotationY(spin(face))
        .multiply(new T.Matrix4().makeTranslation(x, y, z))
        .multiply(extra);
    const arch = archShape(),
      skirt = block(INNER, 0.2, 0.026, 0.008);
    /** An arch standing in the side face `face` (its opening the way through). */
    const archAt = (face: number, matrix = new T.Matrix4()) => put("brass", arch, matrix.clone().multiply(turned(face, 0, BAR, -EDGE)));
    const skirtAt = (face: number, matrix = new T.Matrix4()) => put("skirt", skirt, matrix.clone().multiply(turned(face, 0, BAR + 0.1, -EDGE + 0.005)));
    if (unit.kind === RAMP) {
      const face = unit.face,
        rise = RAMP_HIGH - FLOOR,
        length = Math.hypot(2 * EDGE, rise),
        tilt = Math.atan2(rise, 2 * EDGE),
        board = block(INNER, 0.035, length, 0.01),
        mid = (RAMP_HIGH + FLOOR) / 2;
      // The board slopes down toward −z (the exit), about the x axis.
      const slope = new T.Matrix4().makeRotationX(-tilt);
      put("boards", board, turned(face, 0, mid - 0.018, 0, slope));
      const lip = block(INNER, 0.04, 0.05, 0.012);
      put("brass", lip, turned(face, 0, FLOOR + 0.02, -EDGE + 0.035));
      // The arrow burnt into the board, pointing out of the exit.
      const arrow = new T.Shape();
      arrow.moveTo(0, -0.26);
      arrow.lineTo(0.07, -0.26);
      arrow.lineTo(0.07, 0.02);
      arrow.lineTo(0.19, 0.02);
      arrow.lineTo(0, 0.28);
      arrow.lineTo(-0.19, 0.02);
      arrow.lineTo(-0.07, 0.02);
      arrow.lineTo(-0.07, -0.26);
      arrow.closePath();
      const mark = new T.ShapeGeometry(arrow).rotateX(-Math.PI / 2);
      put("burnt", mark, turned(face, 0, mid + 0.003, 0, slope));
      mark.dispose();
      archAt(face);
      for (const side of [1, 2, 3]) skirtAt((face + side) % 4);
      board.dispose();
      lip.dispose();
    } else if (unit.kind === FLAT || unit.kind === CORNER || unit.kind === CROSS || unit.kind === HANG) {
      // A hanging crossing is a crossing turned over about east–west inside its cube.
      const over = unit.kind === HANG ? new T.Matrix4().makeTranslation(0, HIGH, 0).multiply(new T.Matrix4().makeRotationX(Math.PI)) : new T.Matrix4();
      const floor = block(INNER, 0.03, INNER, 0.01);
      put("floors", floor, over.clone().multiply(at3(0, FLOOR - 0.015, 0)));
      floor.dispose();
      if (unit.kind === FLAT) {
        const rail = block(0.035, RAIL, WIDE - 0.06, 0.012);
        for (const sx of [-1, 1]) put("boards", rail, turned(unit.face, sx * CHANNEL, FLOOR + RAIL / 2, 0));
        rail.dispose();
        archAt(unit.face);
        archAt((unit.face + 2) % 4);
      } else if (unit.kind === CORNER) {
        for (const radius of [WIDE / 2 - CHANNEL, WIDE / 2 + CHANNEL]) {
          const wall = arcWall(radius, 0.035, RAIL);
          put("boards", wall, turned(unit.face, 0, FLOOR, 0));
          wall.dispose();
        }
        archAt(unit.face);
        archAt((unit.face + 1) % 4);
        skirtAt((unit.face + 2) % 4);
        skirtAt((unit.face + 3) % 4);
      } else {
        // Four low corner walls, and an arch on every side.
        const stub = block(0.14, RAIL, 0.14, 0.02);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put("boards", stub, over.clone().multiply(at3(sx * (INNER / 2 - 0.07), FLOOR + RAIL / 2, sz * (INNER / 2 - 0.07))));
        stub.dispose();
        for (let f = 0; f < 4; f++) archAt(f, over);
      }
    }
    arch.dispose();
    skirt.dispose();
  }
  /** A tower as meshes: its parts in their stuffs, and a solid box a unit for presses (`userData` on each). */
  private figure(t: Tower, fixed: boolean, tag: { kind: "tray" | "given"; index: number }) {
    const group = new T.Group(),
      model = this.model(t.kind),
      wood = this.woods[t.kind],
      stuff: Record<Part, T.Material> = {
        frame: fixed ? wood.fixed : wood.live,
        cap: wood.paint,
        boards: this.stuffs.walnut,
        floors: this.stuffs.floor,
        brass: this.stuffs.brass,
        burnt: this.stuffs.burnt,
        skirt: fixed ? wood.skirtFixed : wood.skirt,
        mark: this.stuffs.ivory,
      };
    for (const name of PARTS) {
      const geometry = model[name];
      if (!geometry) continue;
      const mesh = new T.Mesh(geometry, stuff[name]);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    const n = KIT[t.kind].units.length;
    if (fixed) {
      // A dark foot, and brass lock pins through the cap's corners.
      const base = new T.Mesh(this.shapes.base, this.stuffs.base);
      base.position.y = 0.02;
      group.add(base);
      for (const [sx, sz] of [
        [-1, -1],
        [1, 1],
      ]) {
        const pin = new T.Mesh(this.shapes.lockPin, this.stuffs.lock);
        pin.position.set(sx * EDGE, n * HIGH + 0.08, sz * EDGE);
        group.add(pin);
      }
    }
    for (let i = 0; i < n; i++) {
      const box = new T.Mesh(this.shapes.proxy, this.proxyStuff);
      box.position.set(0, i * HIGH, 0);
      box.userData = { ...tag, unit: i };
      group.add(box);
      this.proxies.push(box);
    }
    return group;
  }
  /** A gold or green see-through copy of a tray tower, for the hint and for where a carried tower would land. */
  private ghost(j: number, kind: "gold" | "green") {
    const key = `${j}:${kind}`;
    let ghost = this.ghosts.get(key);
    if (!ghost) {
      ghost = new T.Group();
      const model = this.model(this.state!.tray[j].kind);
      for (const geometry of Object.values(model)) {
        if (!geometry) continue;
        const mesh = new T.Mesh(geometry, this.ghostStuffs[kind]);
        mesh.renderOrder = 8;
        ghost.add(mesh);
      }
      ghost.visible = false;
      this.table.add(ghost);
      this.ghosts.set(key, ghost);
    }
    return ghost;
  }
  /** The target cup set into the grid, lined with felt, and its little chequered flag. */
  private cup() {
    const group = new T.Group(),
      rim = new T.Mesh(this.shapes.cupRim, this.stuffs.brass),
      felt = new T.Mesh(this.shapes.felt, this.stuffs.felt);
    rim.castShadow = rim.receiveShadow = felt.receiveShadow = true;
    rim.position.y = 0.025;
    felt.position.y = 0.014;
    group.add(rim, felt);
    const flag = new T.Group(),
      pin = new T.Mesh(this.shapes.pin, this.stuffs.brass),
      knob = new T.Mesh(this.shapes.knob, this.stuffs.brass),
      cloth = new T.Mesh(this.shapes.pennant, this.stuffs.flag);
    pin.position.y = 0.35;
    knob.position.y = 0.71;
    cloth.position.set(0.01, 0.68, 0);
    pin.castShadow = cloth.castShadow = true;
    flag.add(pin, knob, cloth);
    flag.position.set(0.33, 0, -0.06);
    group.add(flag);
    this.flag = flag;
    return group;
  }
  private trayShape(wide: number, deep: number, part: "floor" | "side" | "end") {
    const key = `${wide.toFixed(3)}:${deep.toFixed(3)}:${part}`;
    let geometry = this.trayShapes.get(key);
    if (!geometry) {
      geometry = this.own(part === "floor" ? block(wide, 0.05, deep, 0.02) : part === "side" ? block(0.07, 0.11, deep, 0.025) : block(wide, 0.11, 0.07, 0.025));
      this.trayShapes.set(key, geometry);
    }
    return geometry;
  }
  /** Builds the fixed towers, the funnel, the target and the tray's towers when the puzzle changes. */
  private lay(state: State) {
    const key = JSON.stringify([sideways(this.aspect), state.start, state.goal, state.given, state.tray.map((t) => [t.kind, postureOf(t), t.roll])]);
    if (key === this.built) return;
    this.built = key;
    const storeys = tallest(state);
    this.renderer.domElement.dataset.storeys = String(storeys);
    if (storeys !== this.storeys) {
      this.storeys = storeys;
      this.resize();
    }
    for (const ghost of this.ghosts.values()) ghost.removeFromParent();
    this.ghosts.clear();
    this.fixed.clear();
    this.trayGroup.clear();
    for (const piece of this.pieces) piece.removeFromParent();
    this.proxies = [];
    state.given.forEach((t, g) => {
      const group = this.figure(t, true, { kind: "given", index: g }),
        local = this.localPose(t, t);
      group.position.copy(local.position);
      group.quaternion.copy(local.quaternion);
      this.fixed.add(group);
    });
    // The funnel over the start's stack, and a solid box over it for the tap that drops the marble.
    this.funnel = new T.Group();
    const funnel = new T.Mesh(this.shapes.funnel, this.stuffs.funnel),
      throat = new T.Mesh(this.shapes.hole, this.stuffs.hole),
      mouth = new T.Mesh(this.shapes.proxy, this.proxyStuff);
    throat.position.y = 0.012;
    funnel.castShadow = true;
    mouth.scale.set(1, (FUNNEL + 0.12) / HIGH, 1);
    mouth.userData = { kind: "start", index: 0, unit: 0 };
    this.proxies.push(mouth);
    // Three brass legs hold it over the stack.
    this.funnel.add(funnel, throat, mouth);
    const s = cellLocal(state.start);
    this.funnel.position.set(s.x, levelY(funnelLevel(state)) + 0.01, s.z);
    this.fixed.add(this.funnel);
    const cup = this.cup(),
      goal = cellLocal(state.goal);
    cup.position.set(goal.x, BOARD_TOP, goal.z);
    this.fixed.add(cup);
    const box = trayBox(state.tray, this.aspect),
      floor = new T.Mesh(this.trayShape(box.wide, box.deep, "floor"), this.stuffs.tray);
    floor.position.set(box.x, 0.025, box.z);
    this.trayGroup.add(floor);
    for (const side of [-1, 1]) {
      const long = new T.Mesh(this.trayShape(box.wide, box.deep, "side"), this.stuffs.tray);
      long.position.set(box.x + side * (box.wide / 2 - 0.035), 0.055, box.z);
      const end = new T.Mesh(this.trayShape(box.wide, box.deep, "end"), this.stuffs.tray);
      end.position.set(box.x, 0.055, box.z + side * (box.deep / 2 - 0.035));
      this.trayGroup.add(long, end);
    }
    this.trayGroup.traverse((m) => {
      if (m instanceof T.Mesh) m.castShadow = m.receiveShadow = true;
    });
    this.pieces = state.tray.map((t, j) => {
      const group = this.figure(t, false, { kind: "tray", index: j });
      this.scene.add(group);
      return group;
    });
    const middleAt = boardMiddle(this.aspect);
    this.table.position.set(middleAt.x, 0, middleAt.z);
    this.scenery.place({
      left: Math.min(middleAt.x - TURNTABLE, box.x - box.wide / 2),
      right: Math.max(middleAt.x + TURNTABLE, box.x + box.wide / 2),
      back: middleAt.z - TURNTABLE,
      front: Math.max(middleAt.z + TURNTABLE, box.z + box.deep / 2),
    });
  }
  /** Where a tower stands at a place in the turntable's frame: the position of its foot's middle and its turn. */
  private localPose(t: Pick<Tower, "kind" | "lying" | "roll" | "inverted">, place: Place) {
    const pose: Pose = { lying: t.lying, inverted: t.inverted, roll: t.roll, yaw: place.yaw },
      quaternion = poseTurn(pose),
      n = KIT[t.kind].units.length,
      at = cellLocal(place.at),
      position = new T.Vector3(at.x, levelY(place.level), at.z);
    if (t.lying) {
      const target = new T.Vector3(at.x, levelY(place.level) + WIDE / 2, at.z),
        mid = new T.Vector3(0, (middle(n) + 0.5) * HIGH, 0).applyQuaternion(quaternion);
      position.copy(target.sub(mid));
    } else if (t.inverted) position.y += n * HIGH;
    return { position, quaternion };
  }
  /** The same on the bench, the turntable turned as it is now. */
  private benchPose(t: Tower, place: Place) {
    const local = this.localPose(t, place),
      bench = toBench(local.position.x, local.position.z, this.turn, this.aspect);
    return { position: new T.Vector3(bench.x, local.position.y, bench.z), quaternion: qY(this.turn).multiply(local.quaternion), scale: 1 };
  }
  /** Where tray tower j stands: on the board, or in the tray (smaller, in its posture, turned as the turntable is). */
  private home(state: State, j: number) {
    const t = state.tray[j];
    if (t.at >= 0) return this.benchPose(t, t);
    const at = trayPlaces(state.tray, this.aspect)[j],
      quaternion = qY(this.turn).multiply(poseTurn({ ...t, yaw: trayYaw(t) })),
      n = KIT[t.kind].units.length,
      s = TRAY_SCALE,
      position = new T.Vector3(at.x, TRAY_TOP, at.z);
    if (t.lying) {
      const mid = new T.Vector3(0, (n * HIGH * s) / 2, 0).applyQuaternion(quaternion);
      position.set(at.x, TRAY_TOP + (WIDE * s) / 2, at.z).sub(mid);
    } else if (t.inverted) position.y += n * HIGH * s;
    return { position, quaternion, scale: s };
  }
  protected subject(aspect: number): TableSubject {
    return marbleSubject(aspect, this.lift, this.storeys);
  }
  protected layout(aspect: number) {
    const turned = sideways(aspect) !== sideways(this.aspect);
    this.aspect = aspect;
    if (turned) {
      this.built = "";
      this.courses = new WeakMap();
    }
    this.table.position.set(boardMiddle(aspect).x, 0, boardMiddle(aspect).z);
  }
  private aim() {
    const subject = this.subject(this.camera.aspect),
      distance = cameraDistance(this.camera.aspect, false, subject);
    this.camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
    this.camera.lookAt(0, subject.lookY, 0);
    this.table.rotation.y = this.turn;
    const canvas = this.renderer.domElement;
    canvas.dataset.turn = this.turn.toFixed(4);
    canvas.dataset.lift = this.lift.toFixed(4);
    this.redraw();
  }
  /** Turns the turntable back square and the view to its first tilt (the 시점 전환 over the table). */
  resetView() {
    const from = { turn: this.turn, lift: this.lift },
      target = Math.round(from.turn / (Math.PI * 2)) * Math.PI * 2;
    if (Math.abs(from.turn - target) < 1e-4 && Math.abs(from.lift) < 1e-4) return;
    this.tween(0, 520, (p) => {
      const e = p * p * (3 - 2 * p);
      this.turn = from.turn + (target - from.turn) * e;
      this.lift = from.lift * (1 - e);
      if (p >= 1) this.turn = this.lift = 0;
      this.aim();
      if (this.state) this.arrange(this.state);
    });
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const f = this.funnelBench(state);
    return [{ x: f.x, y: f.y - FUNNEL * 0.4, z: f.z, r: 0.32, point: GO }];
  }
  /** What a press strikes first: a tower's solid box, the funnel, or a cell of the grid. */
  protected pick(ray: T.Ray) {
    const state = this.state;
    if (!state) return null;
    this.scene.updateMatrixWorld(true);
    this.caster.ray.copy(ray);
    const hit = this.caster.intersectObjects(this.proxies, false)[0];
    const plane = new T.Plane(new T.Vector3(0, 1, 0), -BOARD_TOP),
      on = new T.Vector3(),
      cell = ray.intersectPlane(plane, on) ? cellUnder(on.x, on.z, this.turn, this.aspect) : -1;
    if (!hit) {
      this.struck = { kind: cell >= 0 ? "cell" : "none", index: -1, cell };
      return cell;
    }
    const data = hit.object.userData as { kind: "tray" | "given" | "start"; index: number; unit: number };
    if (data.kind === "start") {
      this.struck = { kind: "start", index: 0, cell: state.start };
      return GO;
    }
    if (data.kind === "tray" && state.tray[data.index].at < 0) {
      this.struck = { kind: "tray", index: data.index, cell: -1 };
      return CELLS + data.index;
    }
    const t = data.kind === "tray" ? state.tray[data.index] : state.given[data.index],
      unitCell = voxelsOf(t).find((v) => v.unit === data.unit)?.cell ?? -1;
    this.struck = { kind: data.kind, index: data.index, cell: unitCell };
    return unitCell;
  }
  protected hover(point: number) {
    const state = this.state;
    if (!state || this.press?.moving) return;
    const s = this.struck,
      live = state.winner === null && (s.kind === "start" || (s.kind === "tray" && (state.tray[s.index].at < 0 || handle(state, world(state), s.index) >= 0)));
    this.renderer.domElement.style.cursor = live || (point >= 0 && this.marks.targets.includes(point)) ? "pointer" : "grab";
  }
  /** Every press is taken here: a tower pressed and moved is carried, anything else pressed and moved turns the table. */
  protected dragStart(_point: number, _at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state) return false;
    const s = this.struck,
      live = state.winner === null;
    let kind: Press["kind"] = "spin",
      piece = -1;
    if (live && s.kind === "tray" && (state.tray[s.index].at < 0 || handle(state, world(state), s.index) >= 0)) {
      kind = "piece";
      piece = s.index;
    } else if (live && s.kind === "start") kind = "start";
    this.press = { kind, piece, cell: s.cell, x: this.pointer.x, y: this.pointer.y, turn: this.turn, lift: this.lift, moving: false };
    return true;
  }
  /** The move a carried tower makes if it is let go over `cell` (-1 off the grid), or null when it would go nowhere. */
  private carryMove(state: State, j: number, cell: number): Move | null {
    const t = state.tray[j];
    if (t.at < 0) return cell >= 0 ? { from: CELLS + j, to: cell, extra: -1 } : null;
    const from = handle(state, world(state), j);
    if (cell < 0) return { from, to: CELLS + j, extra: -1 };
    if (cell === t.at) return null;
    return voxelsOf(t).some((v) => v.cell === cell) ? { from, to: put(cell, t.yaw, postureOf(t)), extra: -1 } : { from, to: cell, extra: -1 };
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const press = this.press,
      state = this.state;
    if (!press || !state) return;
    const dx = this.pointer.x - press.x,
      dy = this.pointer.y - press.y;
    if (!press.moving && Math.hypot(dx, dy) < 7) return;
    press.moving = true;
    this.renderer.domElement.style.cursor = "grabbing";
    if (press.kind !== "piece") {
      this.turn = press.turn + dx * 0.0085;
      this.lift = Math.max(LIFT_DOWN, Math.min(LIFT_UP, press.lift + dy * 0.0035));
      this.aim();
      this.arrange(state);
      return;
    }
    const j = press.piece,
      t = state.tray[j],
      group = this.pieces[j],
      cell = cellUnder(at.x, at.z, this.turn, this.aspect),
      // Carried at full size over the board, turned as it would be set down, its foot (a lying one's middle) under the pointer.
      local = this.localPose(t, { at: 0, level: 0, yaw: t.at >= 0 ? t.yaw : trayYaw(t) }),
      zero = cellLocal(0),
      quaternion = qY(this.turn).multiply(local.quaternion),
      offset = new T.Vector3(local.position.x - zero.x, local.position.y - levelY(0), local.position.z - zero.z).applyQuaternion(qY(this.turn));
    group.scale.setScalar(1);
    group.quaternion.copy(quaternion);
    group.position.set(at.x + offset.x, CARRY + offset.y, at.z + offset.z);
    for (const ghost of this.ghosts.values()) ghost.visible = false;
    this.rings.refuse.visible = this.rings.aim.visible = false;
    const move = cell >= 0 ? this.carryMove(state, j, cell) : null,
      next = move ? attempt(state, move) : null;
    if (next && typeof next !== "string") {
      const lands = next.tray[j],
        ghost = this.ghost(j, "green"),
        pose = this.localPose(lands, lands);
      ghost.visible = true;
      ghost.position.copy(pose.position);
      ghost.quaternion.copy(pose.quaternion);
    } else if (cell >= 0) this.ringOnCell(this.rings.refuse, state, cell);
    this.redraw();
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const press = this.press,
      state = this.state;
    this.press = null;
    for (const ghost of this.ghosts.values()) ghost.visible = false;
    this.rings.refuse.visible = this.rings.aim.visible = false;
    this.renderer.domElement.style.cursor = "default";
    if (!press || !state) return;
    if (!press.moving) {
      if (!at) return;
      // A tap: a tower on the board turns a quarter, the funnel drops the marble, a tray tower or a cell is chosen.
      if (press.kind === "start") return this.onMove({ from: -1, to: GO, extra: -1 });
      if (press.kind === "piece" && state.tray[press.piece].at >= 0) {
        const from = handle(state, world(state), press.piece);
        return this.onMove({ from, to: from, extra: -1 });
      }
      if (press.kind === "piece") return this.onPick(CELLS + press.piece);
      this.mark(this.marks);
      return this.onPick(press.cell);
    }
    if (press.kind !== "piece") return;
    const j = press.piece,
      group = this.pieces[j],
      cell = at ? cellUnder(at.x, at.z, this.turn, this.aspect) : -1,
      move = at ? this.carryMove(state, j, cell) : null;
    if (move) {
      this.dropped = { piece: j, at: group.position.clone(), quaternion: group.quaternion.clone() };
      this.onMove(move);
      if (this.state !== state) return;
      this.dropped = null;
    }
    const from = { position: group.position.clone(), quaternion: group.quaternion.clone(), scale: group.scale.x },
      to = this.home(state, j);
    this.tween(0, 220, (p) => {
      const e = 1 - (1 - p) ** 3;
      group.position.copy(lerp3(from.position, to.position, e));
      group.quaternion.slerpQuaternions(from.quaternion, to.quaternion, e);
      group.scale.setScalar(from.scale + (to.scale - from.scale) * e);
    });
  }
  /** Lays every tray tower where it stands, in the turntable's present turn. */
  private arrange(state: State) {
    state.tray.forEach((_, j) => {
      const group = this.pieces[j];
      if (!group || (this.press?.moving && this.press.piece === j)) return;
      const home = this.home(state, j);
      group.position.copy(home.position);
      group.quaternion.copy(home.quaternion);
      group.scale.setScalar(home.scale);
    });
    this.mark(this.marks);
  }

  /*
   * The marble's way.
   */
  private courses = new WeakMap<State, { stretches: Stretch[]; rest: T.Vector3 }>();
  private centre(cell: number, y: number) {
    const at = cellLocal(cell);
    return new T.Vector3(at.x, y, at.z);
  }
  /** The marble on a floor at the edge of a cell toward `dir`. */
  private edge(cell: number, level: number, dir: number) {
    const at = cellLocal(cell);
    return new T.Vector3(at.x + (STEP[dir][0] * CELL) / 2, levelY(level) + FLOOR + MARBLE, at.z + (STEP[dir][1] * CELL) / 2);
  }
  /** The marble on a ramp facing `face`, `s` of the way from its middle to its front (−1 its back, 1 its front). */
  private onRamp(cell: number, level: number, face: number, s: number) {
    const at = cellLocal(cell),
      y = levelY(level) + FLOOR + ((RAMP_HIGH - FLOOR) * (1 - s)) / 2 + MARBLE * 1.15;
    return new T.Vector3(at.x + STEP[face][0] * EDGE * s, y, at.z + STEP[face][1] * EDGE * s);
  }
  /** Where the marble waits before it is dropped: in the funnel's mouth. */
  private waiting(state: State) {
    return this.centre(state.start, levelY(funnelLevel(state)) + FUNNEL * 0.65);
  }
  /** The height at which a marble falling down a cell from `level` first meets something solid, and what. */
  private landingBelow(w: World, cell: number, level: number) {
    for (let l = level; l >= 0; l--) {
      const i = vox(cell, l);
      if (w.owner[i] < 0 || w.open[i]) continue;
      return { level: l, ramp: w.exits[i * 6 + UP] >= 0 && w.exits[i * 6 + UP] < 4, face: w.exits[i * 6 + UP] };
    }
    return null;
  }
  /** The marble's whole way for a state that has dropped it, stretch by stretch, and where it comes to rest. */
  private course(state: State) {
    const known = this.courses.get(state);
    if (known) return known;
    const run = state.run!,
      w = world(state),
      out: Stretch[] = [],
      legs = run.legs;
    let at = this.waiting(state);
    const go = (stretch: Stretch) => {
      out.push(stretch);
      at = stretch.at(1);
    };
    let lastDir = SOUTH_DIR,
      falling = true;
    for (let k = 1; k < legs.length; k++) {
      const leg = legs[k],
        next = legs[k + 1] as Leg | undefined;
      if (leg.kind === "ramp") {
        // Down onto the board where it falls in, down the slope and out.
        const c = cellLocal(leg.cell),
          s = Math.max(-0.8, Math.min(0.4, ((at.x - c.x) * STEP[leg.dir][0] + (at.z - c.z) * STEP[leg.dir][1]) / EDGE));
        if (falling) go(drop(at, this.onRamp(leg.cell, leg.level, leg.dir, k === 1 ? -0.3 : s)));
        go(roll(at, this.onRamp(leg.cell, leg.level, leg.dir, 1)));
        go(roll(at, this.edge(leg.cell, leg.level, leg.dir)));
        lastDir = leg.dir;
        falling = false;
      } else if (leg.kind === "flat") {
        go(roll(at, this.edge(leg.cell, leg.level, leg.dir)));
        lastDir = leg.dir;
      } else if (leg.kind === "corner") {
        const entry = at.clone(),
          exit = this.edge(leg.cell, leg.level, leg.dir),
          c = cellLocal(leg.cell),
          inSide = leg.from,
          pivot = new T.Vector3(c.x + ((STEP[inSide][0] + STEP[leg.dir][0]) * CELL) / 2, entry.y, c.z + ((STEP[inSide][1] + STEP[leg.dir][1]) * CELL) / 2),
          a = new T.Vector3().subVectors(entry, pivot),
          b = new T.Vector3().subVectors(exit, pivot),
          angle = a.angleTo(b),
          axis = new T.Vector3().crossVectors(a, b).normalize();
        go({ ms: ROLL_MS * 1.4, at: (u) => pivot.clone().add(a.clone().applyAxisAngle(axis, angle * u)) });
        lastDir = leg.dir;
      } else if (leg.kind === "fall" || leg.kind === "chute") {
        // In toward the middle of the cell, then down.
        const c = cellLocal(leg.cell),
          inward = back(leg.from) < 4 ? back(leg.from) : lastDir,
          toward = new T.Vector3(c.x - STEP[inward][0] * CELL * 0.12, at.y, c.z - STEP[inward][1] * CELL * 0.12);
        go({ ...roll(at, toward), ms: 160 });
        falling = true;
        if (!next) {
          const below = this.landingBelow(w, leg.cell, leg.level - 1),
            y = !below ? BOARD_TOP + MARBLE : below.ramp ? this.onRamp(leg.cell, below.level, below.face, 0).y : levelY(below.level + 1) + MARBLE,
            land = new T.Vector3(toward.x, Math.min(at.y, y), toward.z);
          go(drop(at, land));
          if (!below) {
            const away = new T.Vector3(land.x + STEP[inward][0] * 0.34, land.y, land.z + STEP[inward][1] * 0.34);
            go({ ...roll(land, away), ms: 520, at: (u) => lerp3(land, away, travel(u)) });
          } else go(settle(at));
        }
      } else if (leg.kind === "goal") {
        if (leg.from < 4) {
          go(roll(at, this.centre(leg.cell, BOARD_TOP + MARBLE * 0.9)));
          go({ ...drop(at, this.centre(leg.cell, BOARD_TOP + MARBLE * 0.45), "pocket"), ms: 140 });
        } else go(drop(at, this.centre(leg.cell, BOARD_TOP + MARBLE * 0.45), "pocket"));
        go(settle(at, 0.05, 420));
      }
    }
    if (legs.length === 1) {
      // Dropped onto nothing that takes it: down into the start's stack.
      const below = this.landingBelow(w, state.start, legs[0].level - 1),
        y = below ? levelY(below.level + 1) + MARBLE : BOARD_TOP + MARBLE;
      go(drop(at, this.centre(state.start, y)));
      go(settle(at));
    }
    const [dx, dz] = STEP[lastDir];
    if (run.fault === "off") {
      const level = Math.max(0, Math.round((at.y - BOARD_TOP - FLOOR - MARBLE) / HIGH)),
        land = new T.Vector3(at.x + dx * (0.3 + 0.08 * level), BOARD_TOP + MARBLE, at.z + dz * (0.3 + 0.08 * level));
      if (level > 0 || at.y > BOARD_TOP + MARBLE + 0.02) go(drop(at, land));
      else go(roll(at, land));
      const reach = (p: T.Vector3) => Math.hypot(p.x, p.z);
      let t = 0;
      while (t < 3 && reach(new T.Vector3(land.x + dx * t, 0, land.z + dz * t)) < TURNTABLE) t += 0.02;
      const rim = new T.Vector3(land.x + dx * t, BOARD_TOP + MARBLE, land.z + dz * t),
        bench = new T.Vector3(rim.x + dx * 0.25, MARBLE, rim.z + dz * 0.25),
        away = new T.Vector3(bench.x + dx * 0.4, MARBLE, bench.z + dz * 0.4);
      go(roll(at, rim));
      go(drop(at, bench));
      go({ ...roll(bench, away), ms: 520, at: (u) => new T.Vector3(bench.x + (away.x - bench.x) * travel(u), MARBLE + 0.04 * hop(u), bench.z + (away.z - bench.z) * travel(u)) });
    } else if (run.fault === "wall") {
      const hit = new T.Vector3(at.x + dx * 0.04, at.y, at.z + dz * 0.04),
        recoil = new T.Vector3(at.x - dx * 0.14, at.y, at.z - dz * 0.14);
      go({ ...roll(at, hit), sound: "cushion", strength: 0.8 });
      go({ ms: 360, at: (u) => lerp3(hit, recoil, 1 - (1 - u) ** 2) });
    } else if (run.fault === "momentum") {
      const stop = new T.Vector3(at.x + dx * 0.32, at.y, at.z + dz * 0.32),
        from = at.clone();
      go({ ms: 700, at: (u) => lerp3(from, stop, 1 - (1 - u) ** 3) });
    }
    const made = { stretches: out, rest: at.clone() };
    this.courses.set(state, made);
    return made;
  }
  private rollMarble(from: T.Vector3, to: T.Vector3) {
    const d = new T.Vector3(to.x - from.x, 0, to.z - from.z),
      far = d.length();
    if (far < 1e-5) return;
    const axis = new T.Vector3(d.z, 0, -d.x).normalize();
    this.marble.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis, far / MARBLE));
  }
  protected place(state: State) {
    this.lay(state);
    this.arrange(state);
    this.marble.visible = true;
    this.marble.position.copy(state.run ? this.course(state).rest : this.waiting(state));
    if (this.flag) this.flag.rotation.y = 0;
    this.table.rotation.y = this.turn;
    this.mark(this.marks);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    if (last.kind === "go" && state.run) {
      const { stretches } = this.course(state),
        cheer = state.winner === 0 ? 700 : 0,
        total = stretches.reduce((sum, s) => sum + s.ms, 0) + cheer;
      let heard = 0,
        was = this.waiting(state);
      this.marble.position.copy(was);
      this.hideAlarms();
      this.tween(0, total, (p) => {
        let t = p * total,
          k = 0;
        while (k < stretches.length - 1 && t > stretches[k].ms) t -= stretches[k++].ms;
        const stretch = stretches[k],
          u = Math.min(1, t / stretch.ms),
          at = stretch.at(u);
        for (; heard < (u >= 1 ? k + 1 : k); heard++) {
          const done = stretches[heard];
          if (done.sound) this.onKnock?.(done.sound, done.strength ?? 0.6);
        }
        this.rollMarble(was, at);
        this.marble.position.copy(at);
        was = at;
        if (cheer && this.flag && p > 1 - cheer / total) this.flag.rotation.y = Math.sin(((p - (1 - cheer / total)) / (cheer / total)) * Math.PI * 2) * 0.9;
      });
      return true;
    }
    const j = last.piece,
      group = this.pieces[j];
    if (j < 0 || !group) return false;
    const to = this.home(state, j),
      dropped = this.dropped?.piece === j ? this.dropped : null,
      from = dropped ? { position: dropped.at, quaternion: dropped.quaternion, scale: 1 } : this.home(before, j),
      turning = last.kind === "turn" && !dropped;
    this.dropped = null;
    let landed = false;
    this.tween(0, turning ? 260 : 360, (p) => {
      const q = turning ? p * p * (3 - 2 * p) : travel(p);
      group.position.set(
        from.position.x + (to.position.x - from.position.x) * q,
        from.position.y + (to.position.y - from.position.y) * q + hop(p) * (turning ? 0.12 : dropped ? 0.12 : 0.45),
        from.position.z + (to.position.z - from.position.z) * q,
      );
      group.quaternion.slerpQuaternions(from.quaternion, to.quaternion, q);
      group.scale.setScalar(from.scale + (to.scale - from.scale) * q);
      if (!landed && p >= 0.84) {
        landed = true;
        this.onContact();
      }
    });
    return true;
  }

  /*
   * Marks.
   */
  private hideAlarms() {
    for (const alarm of this.alarms) alarm.ring.visible = alarm.sign.visible = false;
  }
  private ringOnCell(ring: T.Mesh, state: State, cell: number, level?: number) {
    const w = world(state),
      y = level === undefined ? levelY(heightOf(w, cell)) + 0.02 : levelY(level) + 0.02,
      at = cellLocal(cell),
      bench = toBench(at.x, at.z, this.turn, this.aspect);
    ring.visible = true;
    ring.position.set(bench.x, y, bench.z);
    return y;
  }
  private ringOnPiece(ring: T.Mesh, state: State, j: number) {
    const t = state.tray[j];
    // On the board, round the tower's top, where nothing of it hides the ring.
    if (t.at >= 0) return this.ringOnCell(ring, state, t.at, t.lying ? t.level + 1 : t.level + KIT[t.kind].units.length);
    const at = trayPlaces(state.tray, this.aspect)[j];
    ring.visible = true;
    ring.position.set(at.x, TRAY_TOP + 0.03, at.z);
    return TRAY_TOP;
  }
  private alarm(state: State) {
    this.hideAlarms();
    const trouble = state.trouble;
    if (!trouble || this.animating || capturing()) return;
    const spots: { x: number; y: number; z: number; top: number }[] = [],
      w = world(state),
      onCell = (cell: number, level: number) => {
        const at = cellLocal(cell),
          bench = toBench(at.x, at.z, this.turn, this.aspect);
        return { x: bench.x, y: levelY(level), z: bench.z, top: levelY(Math.max(level + 1, heightOf(w, cell))) };
      };
    if (trouble.fault === "left")
      for (const j of trouble.tray) {
        const t = state.tray[j],
          at = trayPlaces(state.tray, this.aspect)[j];
        spots.push({ x: at.x, y: TRAY_TOP, z: at.z, top: TRAY_TOP + trayHeight(t) });
      }
    else if (trouble.at) spots.push(onCell(trouble.at.cell, trouble.at.level));
    else {
      const rest = this.course(state).rest,
        bench = toBench(rest.x, rest.z, this.turn, this.aspect);
      spots.push({ x: bench.x, y: 0, z: bench.z, top: 0.2 });
    }
    spots.slice(0, this.alarms.length).forEach((spot, k) => {
      const { ring, sign } = this.alarms[k];
      ring.visible = sign.visible = true;
      ring.position.set(spot.x, spot.y + 0.025, spot.z);
      sign.position.set(spot.x, spot.top + 0.38, spot.z);
    });
  }
  private kick() {
    if (!this.clock && !this.disposed) this.clock = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed || !this.arrow.visible || !this.state) return;
    const f = this.funnelBench(this.state);
    this.arrow.position.set(f.x, f.y + 0.5 + 0.06 * Math.sin(now / 220), f.z);
    this.redraw();
    if (!this.reducedMotion) this.kick();
  };
  private funnelBench(state: State) {
    const at = cellLocal(state.start),
      bench = toBench(at.x, at.z, this.turn, this.aspect);
    return { x: bench.x, y: levelY(funnelLevel(state)) + FUNNEL, z: bench.z };
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const onPoint = (ring: T.Mesh, point: number | null | undefined) => {
      ring.visible = false;
      if (point === null || point === undefined || point < 0) return;
      if (point < CELLS) this.ringOnCell(ring, state, point);
      else if (point < CELLS + state.tray.length) this.ringOnPiece(ring, state, point - CELLS);
    };
    onPoint(this.rings.cursor, marks.cursor);
    const hint = marks.hint ?? null;
    onPoint(this.rings.chosen, hint ? null : marks.selected);
    this.targets.forEach((ring, k) => onPoint(ring, hint || marks.selected === null ? null : marks.targets[k]));
    // A hint: a gold ring on the tower and a gold ghost of it where it goes, turned and posed as it should be; a lift
    // back to the tray rings the tower and its place in the tray; for the drop, a gold ring round the funnel.
    if (!this.press?.moving) for (const ghost of this.ghosts.values()) ghost.visible = false;
    this.rings.from.visible = this.rings.to.visible = this.rings.funnel.visible = false;
    if (hint && hint.to === GO) {
      const f = this.funnelBench(state);
      this.rings.funnel.visible = true;
      this.rings.funnel.position.set(f.x, f.y + 0.03, f.z);
    } else if (hint) {
      const w = world(state),
        j = hint.from >= CELLS ? hint.from - CELLS : topIn(w, hint.from) - ids(state).first;
      if (j >= 0 && j < state.tray.length) {
        this.ringOnPiece(this.rings.from, state, j);
        if (hint.to >= PUT) {
          const next = attempt(state, { ...hint, extra: -1 }),
            lands = next && typeof next !== "string" ? next.tray[j] : null,
            cell = putOf(hint.to).cell;
          if (lands) {
            const ghost = this.ghost(j, "gold"),
              pose = this.localPose(lands, lands);
            ghost.visible = true;
            ghost.position.copy(pose.position).add(new T.Vector3(0, 0.004, 0));
            ghost.quaternion.copy(pose.quaternion);
            this.ringOnCell(this.rings.to, state, cell, lands.level);
          }
        } else if (hint.to >= CELLS) {
          const at = trayPlaces(state.tray, this.aspect)[j];
          this.rings.to.visible = true;
          this.rings.to.position.set(at.x, TRAY_TOP + 0.03, at.z);
        }
      }
    }
    const ready = state.winner === null && !state.run && state.tray.every((t) => t.at >= 0) && !capturing() && !hint;
    this.arrow.visible = ready;
    if (ready) {
      const f = this.funnelBench(state);
      this.arrow.position.set(f.x, f.y + 0.5, f.z);
      this.kick();
    }
    this.alarm(state);
    this.redraw();
  }
  dispose() {
    cancelAnimationFrame(this.clock);
    this.clock = 0;
    this.host.removeEventListener("pointerdown", this.hear, true);
    this.host.removeEventListener("pointermove", this.hear, true);
    super.dispose();
  }
}
const SOUTH_DIR = 2;

void DOWN;
void OPEN;
const at3 = (x: number, y: number, z: number) => new T.Matrix4().makeTranslation(x, y, z);
/**
 * An arch standing in the north face of a unit (its foot at y = 0): two jambs and a round head round an opening the
 * marble goes through, extruded thin.
 */
function archShape() {
  const shape = new T.Shape(),
    outer = ARCH + 0.06;
  shape.moveTo(-outer, 0);
  shape.lineTo(-outer, ARCH_SIDE);
  shape.absarc(0, ARCH_SIDE, outer, Math.PI, 0, true);
  shape.lineTo(outer, 0);
  shape.lineTo(ARCH, 0);
  shape.lineTo(ARCH, ARCH_SIDE);
  shape.absarc(0, ARCH_SIDE, ARCH, 0, Math.PI, false);
  shape.lineTo(-ARCH, 0);
  shape.closePath();
  const g = new T.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -0.015);
  void ARCH_TOP;
  return g;
}
/**
 * A wall bent round the north-east corner of a unit (`radius` from that corner), standing on y = 0: an annular
 * sector extruded upward. Shapes are drawn with y as north (−z).
 */
function arcWall(radius: number, thickness: number, height: number) {
  const c = WIDE / 2,
    inner = radius - thickness / 2,
    outer = radius + thickness / 2,
    shape = new T.Shape();
  shape.moveTo(c - outer, c);
  shape.absarc(c, c, outer, Math.PI, Math.PI * 1.5, false);
  shape.lineTo(c, c - inner);
  shape.absarc(c, c, inner, Math.PI * 1.5, Math.PI, true);
  shape.closePath();
  const g = new T.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 16 });
  g.rotateX(-Math.PI / 2);
  return g;
}
/** The keyboard's points: the cells as they lie on the bench at the turntable's present turn, then the tray's places. */
export function marbleKeyPoints(state: State) {
  const canvas = typeof document === "undefined" ? null : document.querySelector<HTMLCanvasElement>("#board canvas");
  return keyPlaces(state.tray, Number(canvas?.dataset.turn ?? 0) || 0, canvas?.clientHeight ? canvas.clientWidth / canvas.clientHeight : 1);
}
