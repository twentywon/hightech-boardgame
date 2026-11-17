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
  keyPlaces,
  levelY,
  marbleSubject,
  sideways,
  toBench,
  trayBox,
  trayPlaces,
} from "./layout";
import {
  CELLS,
  FLAT,
  CORNER,
  GO,
  OPEN,
  PAINTS,
  PUT,
  RAMP,
  attempt,
  back,
  handle,
  heightOf,
  ids,
  landing,
  middle,
  topIn,
  unitsKey,
  vox,
  voxelsOf,
  world,
  type Kind,
  type Leg,
  type Piece,
  type Place,
  type State,
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
/** A piece's yaw (clockwise quarters seen from above) as a turn about the upright. */
const spin = (yaw: number) => (-yaw * Math.PI) / 2;
/** The frame's bars: how thick, and how far a corner post stands from a unit's middle. */
const BAR = 0.05,
  EDGE = (WIDE - BAR) / 2;
/** A ramp's board runs from just under the top of its back to the floor at its front. */
const RAMP_HIGH = HIGH - BAR - 0.012;
/** A flat's or a corner's channel: half its width, and the height of its walls. */
const CHANNEL = 0.15,
  RAIL = 0.085;
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
/** The turntable's top: the 4 × 4 grid of pale squares laid in a ring of darker wood, ticks round its edge to grip by. */
function dialTexture() {
  const { canvas, pen } = canvasOf(1024);
  const scale = 1024 / (2 * TURNTABLE),
    mid = 512;
  pen.fillStyle = "#c58e5a";
  pen.fillRect(0, 0, 1024, 1024);
  // Rings of grain round the middle.
  for (let r = 40; r < 512; r += 9) {
    pen.strokeStyle = `rgba(90, 50, 20, ${0.05 + 0.05 * Math.sin(r * 0.37)})`;
    pen.lineWidth = 2 + 2 * Math.abs(Math.sin(r * 0.11));
    pen.beginPath();
    pen.arc(mid, mid, r, 0, Math.PI * 2);
    pen.stroke();
  }
  // A dark inlaid ring near the edge, and the ticks.
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
  // The grid's bed, a shade darker than its squares.
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
/** A roll along a straight line, easing in and out a little. */
const roll = (a: T.Vector3, b: T.Vector3, sound?: Stretch["sound"]): Stretch => ({
  ms: ROLL_MS * (0.45 + 1.2 * a.distanceTo(b)),
  at: (u) => lerp3(a, b, u),
  sound,
  strength: 0.4,
});
/** A fall from `a` to `b`: across at an even pace and down faster and faster, as a thing let go sideways falls. */
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
  /** What it began on: a piece of the tray (by index), the start, or nothing to take (the view turns instead). */
  kind: "piece" | "start" | "spin";
  piece: number;
  /** The cell it began on (or -1), and the client point. */
  cell: number;
  x: number;
  y: number;
  turn: number;
  lift: number;
  moving: boolean;
}
/**
 * A toymaker's marble run on a workbench: a round maple turntable with a 4 × 4 grid inlaid, and pieces made of open
 * beech frames (one storey a unit) holding walnut ramps with a brass lip, flats with low walls, and corners with
 * curved walls (each ramp with a pale arrow inlaid down its slope); each piece has corner caps painted in its own
 * colour, and pieces fixed from the start have smoked frames, a dark base and brass pegs on their top corners. The
 * start, stained darker, has a brass funnel over it; the target is a felt-lined brass cup with a chequered flag. The
 * pieces to set stand in a walnut tray before the turntable (at its right on a wide canvas), columns upright and
 * beams lying, smaller than on the board. A piece
 * is dragged from the tray onto a cell (it hovers there over the board and a ghost shows where it would land), carried
 * between cells or off the board back to the tray, and turned by a tap; dragging anything else turns the turntable
 * (a little tilt is allowed too). A tap on the funnel drops the glass marble, which rolls its way down or comes to
 * grief, a red mark standing where it did.
 */
export class MarbleView extends TableView<State> {
  /** A strike of the marble: on a piece or the board ("disc"), against a wall ("cushion"), into the target cup ("pocket"). */
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  /** How far the turntable is turned (counter-clockwise seen from above), and the tilt added to the view. */
  private turn = 0;
  private lift = 0;
  /** The canvas's shape, which decides where the tray lies. */
  private aspect = 1;
  private built = "";
  /** The turntable and what turns with it: the grid, the fixed pieces, the marble, marks on the board. */
  private table = new T.Group();
  private fixed = new T.Group();
  /** The tray's pieces, by index (children of the scene: on the board they are placed in the turntable's turn). */
  private pieces: T.Group[] = [];
  private trayGroup = new T.Group();
  private flag: T.Group | null = null;
  private marble = new T.Group();
  private stuffs: Record<"beech" | "stained" | "smoked" | "walnut" | "brass" | "funnel" | "hole" | "maple" | "felt" | "flag" | "plot" | "dial" | "base" | "tray" | "pad" | "inlay" | "teal", T.Material>;
  private paints: T.Material[] = [];
  private ghostStuffs: Record<"gold" | "green", T.Material>;
  private proxyStuff: T.Material;
  private shapes: { proxy: T.BufferGeometry; base: T.BufferGeometry; plot: T.BufferGeometry; funnel: T.BufferGeometry; hole: T.BufferGeometry; cupRim: T.BufferGeometry; felt: T.BufferGeometry; pin: T.BufferGeometry; knob: T.BufferGeometry; pennant: T.BufferGeometry; pad: T.BufferGeometry };
  /** Merged geometries of a piece's parts, by its units. */
  private models = new Map<string, Record<"frame" | "caps" | "boards" | "brass" | "inlay" | "pins", T.BufferGeometry | null>>();
  private trayShapes = new Map<string, T.BufferGeometry>();
  private scenery: ReturnType<typeof workshop>;
  private caster = new T.Raycaster();
  /** The invisible boxes a press is judged by (each unit a solid box, so that a press is not lost through an open frame). */
  private proxies: T.Object3D[] = [];
  private plots: T.Mesh[] = [];
  /** What the last ray struck: a tray piece, a given piece, the start, or a cell of the bare grid. */
  private struck: { kind: "tray" | "given" | "start" | "cell" | "none"; index: number; cell: number } = { kind: "none", index: -1, cell: -1 };
  /** The marks: rings on cells (on the turntable) and on tray places (on the bench), red warnings, the arrow over the funnel. */
  private rings: Record<"cursor" | "chosen" | "from" | "to" | "aim" | "funnel" | "refuse", T.Mesh>;
  private targets: T.Mesh[] = [];
  private alarms: { ring: T.Mesh; sign: T.Sprite }[] = [];
  private ghosts = new Map<string, T.Group>();
  private arrow: T.Mesh;
  private clock = 0;
  private press: Press | null = null;
  /** The pointer's last place on the screen (heard before the table hears it, so that a drag is followed in pixels). */
  private pointer = { x: 0, y: 0 };
  private hear = (e: PointerEvent) => {
    this.pointer = { x: e.clientX, y: e.clientY };
  };
  /** Where a carried piece was let go, so that it goes on from there. */
  private dropped: { piece: number; at: T.Vector3; rotation: number } | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#3a2a1e");
    const keep: Own = (r) => this.own(r);
    this.daylight("#fff3e2", "#4a3524", "#ffe3bd", 9, 2.2);
    // A warm lamp over the bench from the left, as in a workshop.
    const lamp = new T.PointLight("#ffd29a", 6, 14, 1.6);
    lamp.position.set(-4.5, 5, 1.5);
    this.scene.add(lamp);
    const pale = keep(wood(false)),
      dark = keep(wood(true));
    this.stuffs = {
      beech: this.standard({ map: pale, color: "#f7dcb0", roughness: 0.55 }),
      stained: this.standard({ map: dark, color: "#a5785a", roughness: 0.5 }),
      smoked: this.standard({ map: dark, color: "#e2b48c", roughness: 0.5 }),
      walnut: this.standard({ map: pale, color: "#9a5a36", roughness: 0.5 }),
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
      pad: this.standard({ color: "#2f5a3c", roughness: 1, ...weave(1, 1, keep, 0.6) }),
      inlay: this.standard({ color: "#fff6dc", emissive: "#4a3a20", roughness: 0.5 }),
      teal: keep(glossy({ color: "#177e7c", roughness: 0.35 })),
    };
    this.paints = PAINTS.map((color) => keep(glossy({ color, roughness: 0.35 })));
    this.ghostStuffs = {
      gold: this.standard({ color: "#ffb21f", emissive: "#8a5200", roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false }),
      green: this.standard({ color: "#7fe0a0", emissive: "#1e6b3a", roughness: 0.6, transparent: true, opacity: 0.5, depthWrite: false }),
    };
    this.proxyStuff = keep(new T.MeshBasicMaterial({ visible: false }));
    const funnelProfile = [
      [0.07, -0.02],
      [0.08, 0.02],
      [0.13, FUNNEL * 0.45],
      [FUNNEL_MOUTH, FUNNEL],
      [FUNNEL_MOUTH + 0.02, FUNNEL + 0.01],
      [FUNNEL_MOUTH - 0.005, FUNNEL + 0.02],
    ].map(([r, y]) => new T.Vector2(r, y));
    const pennant = new T.Shape();
    pennant.moveTo(0, 0);
    pennant.lineTo(0.27, -0.02);
    pennant.lineTo(0.27, -0.18);
    pennant.lineTo(0, -0.18);
    pennant.lineTo(0, 0);
    this.shapes = {
      proxy: keep(new T.BoxGeometry(WIDE, HIGH, WIDE).translate(0, HIGH / 2, 0)),
      plot: keep(block(CELL * 0.94, 0.02, CELL * 0.94, 0.008)),
      base: keep(block(WIDE + 0.07, 0.036, WIDE + 0.07, 0.012)),
      funnel: keep(new T.LatheGeometry(funnelProfile, 36)),
      hole: keep(new T.CircleGeometry(0.12, 28).rotateX(-Math.PI / 2)),
      cupRim: keep(new T.TorusGeometry(0.26, 0.05, 14, 44).rotateX(Math.PI / 2).scale(1, 0.7, 1)),
      felt: keep(new T.CircleGeometry(0.22, 36).rotateX(-Math.PI / 2)),
      pin: keep(new T.CylinderGeometry(0.012, 0.012, 0.62, 10)),
      knob: keep(new T.SphereGeometry(0.032, 14, 10)),
      pennant: keep(new T.ShapeGeometry(pennant)),
      pad: keep(block(1.0 * TRAY_SCALE + 0.24, 0.01, 1.0, 0.004)),
    };
    // The glass marble: a clear shell round a milky core twisted with colour.
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
    // The marks.
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
      cursor: ring(0.44, 0.5, flat("#ffffff", 0.95)),
      chosen: ring(0.38, 0.45, flat("#62cfff", 0.95)),
      from: ring(0.38, 0.46, gold),
      to: ring(0.38, 0.46, gold),
      aim: ring(0.36, 0.45, flat("#7fe0a0", 0.95)),
      funnel: ring(FUNNEL_MOUTH + 0.04, FUNNEL_MOUTH + 0.11, gold),
      refuse: ring(0.36, 0.45, flat("#e0392b", 0.95)),
    };
    const faint = flat("#ffffff", 0.55);
    for (let k = 0; k < CELLS; k++) this.targets.push(ring(0.2, 0.25, faint));
    const red = flat("#e0392b", 0.95),
      warning = keep(new T.SpriteMaterial({ map: keep(warningTexture()), depthTest: false, transparent: true }));
    for (let k = 0; k < 8; k++) {
      const sign = new T.Sprite(warning);
      sign.scale.setScalar(0.32);
      sign.renderOrder = 12;
      sign.visible = false;
      this.scene.add(sign);
      this.alarms.push({ ring: ring(0.4, 0.5, red), sign });
    }
    this.arrow = new T.Mesh(keep(new T.ConeGeometry(0.09, 0.22, 16).rotateX(Math.PI)), keep(new T.MeshBasicMaterial({ color: "#ffffff" })));
    this.arrow.visible = false;
    this.arrow.renderOrder = 10;
    this.scene.add(this.arrow);
    // A carried piece is followed over a plane above the board, so that it is never hidden in a stack.
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -CARRY);
    // The pointer is heard on its way to the canvas, so that a drag that turns the table counts pixels.
    host.addEventListener("pointerdown", this.hear, true);
    host.addEventListener("pointermove", this.hear, true);
    this.renderer.domElement.dataset.turn = "0";
    this.renderer.domElement.dataset.lift = "0";
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
  /** A piece's parts, merged by stuff, in its own frame at yaw 0 (a column up from its foot, a beam along x about its middle). */
  private model(piece: Pick<Piece, "shape" | "units">, look: "tray" | "fixed" | "start") {
    const key = `${unitsKey(piece)}:${look}`;
    const known = this.models.get(key);
    if (known) return known;
    const parts: Record<"frame" | "caps" | "boards" | "brass" | "inlay" | "pins", T.BufferGeometry[]> = { frame: [], caps: [], boards: [], brass: [], inlay: [], pins: [] },
      add = (into: keyof typeof parts, geometry: T.BufferGeometry, matrix: T.Matrix4) => parts[into].push((geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(matrix)),
      at = (x: number, y: number, z: number, turn = 0, tilt = 0) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(tilt, turn, 0, "YXZ")), new T.Vector3(1, 1, 1)),
      n = piece.units.length,
      column = piece.shape === "column",
      mid = middle(n),
      barX = block(WIDE, BAR, BAR, 0.015),
      barZ = block(BAR, BAR, WIDE, 0.015),
      post = block(BAR, HIGH, BAR, 0.015),
      knob = block(0.095, 0.075, 0.095, 0.025);
    // The frame. A column: four posts all the way up and one ring of bars at its foot, between each two storeys and
    // at its head (painted). A beam: long bars along both sides at its foot and head, and posts and cross bars at the
    // ends of every unit (its two end faces painted).
    if (column) {
      const tall = n * HIGH,
        longPost = block(BAR, tall, BAR, 0.015);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add("frame", longPost, at(sx * EDGE, tall / 2, sz * EDGE));
      for (let k = 0; k <= n; k++) {
        const y = k === 0 ? BAR / 2 : k === n ? tall - BAR / 2 : k * HIGH,
          into = k === n ? "caps" : "frame";
        for (const sz of [-1, 1]) add(into, barX, at(0, y, sz * EDGE));
        for (const sx of [-1, 1]) add(into, barZ, at(sx * EDGE, y, 0));
      }
      longPost.dispose();
    } else {
      const span = (n - 1) * CELL + WIDE,
        longBar = block(span, BAR, BAR, 0.015),
        cx = ((n - 1) / 2 - mid) * CELL;
      for (const y of [BAR / 2, HIGH - BAR / 2]) for (const sz of [-1, 1]) add("frame", longBar, at(cx, y, sz * EDGE));
      for (let i = 0; i < n; i++)
        for (const sx of [-1, 1]) {
          const x = (i - mid) * CELL + sx * EDGE,
            into = (i === 0 && sx < 0) || (i === n - 1 && sx > 0) ? "caps" : "frame";
          for (const sz of [-1, 1]) add(into, post, at(x, HIGH / 2, sz * EDGE));
          for (const y of [BAR / 2, HIGH - BAR / 2]) add(into, barZ, at(x, y, 0));
        }
      longBar.dispose();
    }
    piece.units.forEach((u, i) => {
      const ox = column ? 0 : (i - mid) * CELL,
        oy = column ? i * HIGH : 0;
      // What the unit holds, turned to its face (north at face 0).
      const turn = spin(u.face);
      this.inside(u.kind, (into, geometry, x, y, z, tilt = 0) => {
        const c = Math.cos(turn),
          s = Math.sin(turn);
        add(into, geometry, at(ox + x * c + z * s, oy + y, -x * s + z * c, turn, tilt));
      });
    });
    // Corner caps: at the eight outer corners of the piece, painted; fixed pieces have a brass pin through the top ones.
    const height = column ? n * HIGH : HIGH,
      ends = column ? [-EDGE, EDGE] : [-mid * CELL - EDGE, (n - 1 - mid) * CELL + EDGE],
      pin = new T.CylinderGeometry(0.026, 0.03, 0.1, 12);
    for (const x of ends)
      for (const sz of [-1, 1])
        for (const y of [0.0375, height - 0.0375]) {
          add("caps", knob, at(x, y, sz * EDGE));
          if (look !== "tray" && y > 0.1) add("pins", pin, at(x, y + 0.08, sz * EDGE));
        }
    pin.dispose();
    barX.dispose();
    barZ.dispose();
    post.dispose();
    knob.dispose();
    const merged = {} as Record<keyof typeof parts, T.BufferGeometry | null>;
    for (const name of Object.keys(parts) as (keyof typeof parts)[]) {
      const list = parts[name];
      merged[name] = list.length ? this.own(mergeGeometries(list)!) : null;
      for (const g of list) g.dispose();
    }
    this.models.set(key, merged);
    return merged;
  }
  /** What a unit holds, at face 0 (north): a sloping board, a floor with walls, a floor with curved walls, or nothing. */
  private inside(kind: Kind, put: (into: "boards" | "brass" | "inlay", geometry: T.BufferGeometry, x: number, y: number, z: number, tilt?: number) => void) {
    const inner = WIDE - 2 * BAR;
    if (kind === RAMP) {
      const rise = RAMP_HIGH - FLOOR,
        length = Math.hypot(2 * EDGE, rise),
        tilt = -Math.atan2(rise, 2 * EDGE),
        board = block(inner, 0.035, length, 0.01);
      put("boards", board, 0, (RAMP_HIGH + FLOOR) / 2 - 0.0175, 0, tilt);
      // Low cheeks along both sides of the slope, so that it reads as a chute from the side.
      const cheek = block(0.03, 0.07, length, 0.01);
      for (const sx of [-1, 1]) put("boards", cheek, sx * (inner / 2 - 0.015), (RAMP_HIGH + FLOOR) / 2 + 0.02, 0, tilt);
      // The brass lip at its low end.
      const lip = block(inner, 0.035, 0.05, 0.012);
      put("brass", lip, 0, FLOOR + 0.0175, -EDGE + 0.03);
      // A pale arrow inlaid down the slope.
      const arrow = new T.Shape();
      arrow.moveTo(-0.17, -0.05);
      arrow.lineTo(0, 0.12);
      arrow.lineTo(0.17, -0.05);
      arrow.lineTo(0.17, -0.14);
      arrow.lineTo(0, 0.03);
      arrow.lineTo(-0.17, -0.14);
      arrow.closePath();
      for (const along of [-0.14, 0.12]) {
        const g = new T.ShapeGeometry(arrow).rotateX(-Math.PI / 2);
        // On the board's face: up by half its thickness, at `along` down the slope (toward the front, −z).
        const y = (RAMP_HIGH + FLOOR) / 2 + 0.014 - along * Math.tan(-tilt);
        put("inlay", g, 0, y, -along, tilt);
        g.dispose();
      }
      board.dispose();
      cheek.dispose();
      lip.dispose();
      return;
    }
    if (kind === FLAT || kind === CORNER) {
      const floor = block(inner, 0.03, WIDE, 0.01);
      put("boards", floor, 0, FLOOR - 0.015, 0);
      floor.dispose();
      const strip = block(2 * CHANNEL, 0.012, 0.035, 0.005);
      if (kind === FLAT) {
        const rail = block(0.035, RAIL, WIDE, 0.012);
        for (const sx of [-1, 1]) put("boards", rail, sx * CHANNEL, FLOOR + RAIL / 2, 0);
        rail.dispose();
        for (const sz of [-1, 1]) put("brass", strip, 0, FLOOR + 0.006, sz * (EDGE - 0.01));
      } else {
        // Openings north and east: two walls bent round the north-east corner.
        for (const radius of [WIDE / 2 - CHANNEL, WIDE / 2 + CHANNEL]) {
          const wall = arcWall(radius, 0.035, RAIL);
          put("boards", wall, 0, FLOOR, 0);
          wall.dispose();
        }
        put("brass", strip, 0, FLOOR + 0.006, -(EDGE - 0.01));
        const side = strip.clone().rotateY(Math.PI / 2);
        put("brass", side, EDGE - 0.01, FLOOR + 0.006, 0);
        side.dispose();
      }
      strip.dispose();
    }
  }
  /** A piece as meshes: its parts in their stuffs, and a solid box a unit for presses (`point` data on each). */
  private figure(piece: Piece, look: "tray" | "fixed" | "start", tag: { kind: "tray" | "given" | "start"; index: number }) {
    const group = new T.Group(),
      model = this.model(piece, look),
      frame = look === "start" ? this.stuffs.stained : look === "fixed" ? this.stuffs.smoked : this.stuffs.beech,
      caps = look === "start" ? this.stuffs.teal : this.paints[((piece.paint % this.paints.length) + this.paints.length) % this.paints.length],
      stuff = { frame, caps, boards: this.stuffs.walnut, brass: this.stuffs.brass, inlay: this.stuffs.inlay, pins: this.stuffs.brass };
    for (const name of Object.keys(stuff) as (keyof typeof stuff)[]) {
      const geometry = model[name];
      if (!geometry) continue;
      const mesh = new T.Mesh(geometry, stuff[name]);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    // A piece fixed from the start stands on a dark base (and carries brass pins at its top corners).
    if (look !== "tray" && piece.shape === "column" && piece.level === 0) {
      const base = new T.Mesh(this.shapes.base, this.stuffs.base);
      base.position.y = 0.018;
      base.receiveShadow = true;
      group.add(base);
    }
    const n = piece.units.length,
      mid = middle(n);
    for (let i = 0; i < n; i++) {
      const box = new T.Mesh(this.shapes.proxy, this.proxyStuff);
      box.position.set(piece.shape === "column" ? 0 : (i - mid) * CELL, piece.shape === "column" ? i * HIGH : 0, 0);
      box.userData = { ...tag, unit: i };
      group.add(box);
      this.proxies.push(box);
    }
    return group;
  }
  /** A gold or green see-through copy of a tray piece, for the hint and for where a carried piece would land. */
  private ghost(j: number, kind: "gold" | "green") {
    const key = `${j}:${kind}`;
    let ghost = this.ghosts.get(key);
    if (!ghost) {
      ghost = new T.Group();
      const model = this.model(this.state!.tray[j], "tray");
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
    pin.position.y = 0.31;
    knob.position.y = 0.63;
    cloth.position.set(0.01, 0.6, 0);
    pin.castShadow = cloth.castShadow = true;
    flag.add(pin, knob, cloth);
    // Stuck in beside the cup, as a flag marks a hole on a green.
    flag.position.set(0.31, 0, -0.06);
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
  /** Builds the fixed pieces, the target and the tray's pieces when the puzzle changes. */
  private lay(state: State) {
    const key = JSON.stringify([sideways(this.aspect), state.start, state.goal, state.given, state.tray.map((p) => [unitsKey(p), p.paint])]);
    if (key === this.built) return;
    this.built = key;
    for (const ghost of this.ghosts.values()) ghost.removeFromParent();
    this.ghosts.clear();
    this.fixed.clear();
    this.trayGroup.clear();
    for (const piece of this.pieces) piece.removeFromParent();
    this.proxies = [];
    const place = (group: T.Group, piece: Piece) => {
      const at = cellLocal(piece.at);
      group.position.set(at.x, levelY(piece.level), at.z);
      group.rotation.y = spin(piece.yaw);
      this.fixed.add(group);
    };
    const start = this.figure(state.start, "start", { kind: "start", index: 0 });
    // The funnel over the start, and a solid box over it for the tap that drops the marble.
    const funnel = new T.Mesh(this.shapes.funnel, this.stuffs.funnel),
      throat = new T.Mesh(this.shapes.hole, this.stuffs.hole),
      top = state.start.units.length * HIGH;
    funnel.position.y = top;
    throat.position.y = top + 0.012;
    funnel.castShadow = true;
    const mouth = new T.Mesh(this.shapes.proxy, this.proxyStuff);
    mouth.scale.set(1, (FUNNEL + 0.1) / HIGH, 1);
    mouth.position.y = top;
    mouth.userData = { kind: "start", index: 0, unit: state.start.units.length - 1 };
    this.proxies.push(mouth);
    start.add(funnel, throat, mouth);
    place(start, state.start);
    state.given.forEach((p, g) => place(this.figure(p, "fixed", { kind: "given", index: g }), p));
    const cup = this.cup(),
      goal = cellLocal(state.goal);
    cup.position.set(goal.x, BOARD_TOP, goal.z);
    this.fixed.add(cup);
    // The tray: a walnut box before the turntable or at its right.
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
    this.pieces = state.tray.map((p, j) => {
      const group = this.figure(p, "tray", { kind: "tray", index: j });
      this.scene.add(group);
      return group;
    });
    // The props lie round the turntable and the tray together.
    const middleAt = boardMiddle(this.aspect);
    this.table.position.set(middleAt.x, 0, middleAt.z);
    this.scenery.place({
      left: Math.min(middleAt.x - TURNTABLE, box.x - box.wide / 2),
      right: Math.max(middleAt.x + TURNTABLE, box.x + box.wide / 2),
      back: middleAt.z - TURNTABLE,
      front: Math.max(middleAt.z + TURNTABLE, box.z + box.deep / 2),
    });
  }
  protected subject(aspect: number): TableSubject {
    return marbleSubject(aspect, this.lift);
  }
  /** A canvas that turns wide (or narrow) moves the tray beside the turntable (or before it): the bench is laid again. */
  protected layout(aspect: number) {
    const turned = sideways(aspect) !== sideways(this.aspect);
    this.aspect = aspect;
    if (turned) {
      this.built = "";
      this.courses = new WeakMap();
    }
    this.table.position.set(boardMiddle(aspect).x, 0, boardMiddle(aspect).z);
  }
  /** Sets the camera for the present tilt, without laying the table out again. */
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
      // The short way round.
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
  /** Where a place on the turntable is on the bench, with the yaw a piece there shows. */
  private onBench(place: Place) {
    const at = cellLocal(place.at),
      bench = toBench(at.x, at.z, this.turn, this.aspect);
    return { position: new T.Vector3(bench.x, levelY(place.level), bench.z), rotation: this.turn + spin(place.yaw) };
  }
  /** Where tray piece j stands: on the board, or in the tray (smaller, as it would lie at yaw 0). */
  private home(state: State, j: number) {
    const p = state.tray[j];
    if (p.at >= 0) return { ...this.onBench(p), scale: 1 };
    const at = trayPlaces(state.tray, this.aspect)[j];
    return { position: new T.Vector3(at.x, TRAY_TOP, at.z), rotation: 0, scale: TRAY_SCALE };
  }
  /** Every cell and every tray place, and the funnel (for the hover of a mouse; presses are judged by `pick`). */
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const top = state.start.units.length,
      funnel = cellLocal(state.start.at),
      f = toBench(funnel.x, funnel.z, this.turn, this.aspect);
    return [{ x: f.x, y: levelY(top) + FUNNEL * 0.6, z: f.z, r: 0.3, point: GO }];
  }
  /** What a press strikes first: a piece's solid box, the start, or a cell of the grid. */
  protected pick(ray: T.Ray) {
    const state = this.state;
    if (!state) return null;
    this.scene.updateMatrixWorld(true);
    this.caster.ray.copy(ray);
    const hit = this.caster.intersectObjects(this.proxies, false)[0];
    // The cell under the ray on the grid, whatever lies over it.
    const plane = new T.Plane(new T.Vector3(0, 1, 0), -BOARD_TOP),
      on = new T.Vector3(),
      cell = ray.intersectPlane(plane, on) ? cellUnder(on.x, on.z, this.turn, this.aspect) : -1;
    if (!hit) {
      this.struck = { kind: cell >= 0 ? "cell" : "none", index: -1, cell };
      return cell;
    }
    const data = hit.object.userData as { kind: "tray" | "given" | "start"; index: number; unit: number };
    if (data.kind === "start") {
      this.struck = { kind: "start", index: 0, cell: state.start.at };
      return GO;
    }
    if (data.kind === "tray" && state.tray[data.index].at < 0) {
      this.struck = { kind: "tray", index: data.index, cell: -1 };
      return CELLS + data.index;
    }
    const piece = data.kind === "tray" ? state.tray[data.index] : state.given[data.index],
      unitCell = voxelsOf(piece)[data.unit]?.cell ?? -1;
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
  /** Every press is taken here: a piece pressed and moved is carried, anything else pressed and moved turns the table. */
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
  /** The move a carried piece makes if it is let go over `cell` (-1 off the grid), or null when it would go nowhere. */
  private carryMove(state: State, j: number, cell: number): Move | null {
    const p = state.tray[j];
    if (p.at < 0) return cell >= 0 ? { from: CELLS + j, to: cell, extra: -1 } : null;
    const from = handle(state, world(state), j);
    if (cell < 0) return { from, to: CELLS + j, extra: -1 };
    if (cell === p.at) return null;
    return voxelsOf(p).some((v) => v.cell === cell) ? { from, to: PUT + cell * 4 + p.yaw, extra: -1 } : { from, to: cell, extra: -1 };
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const press = this.press,
      state = this.state;
    if (!press || !state) return;
    const dx = this.pointer.x - press.x,
      dy = this.pointer.y - press.y;
    if (!press.moving && Math.hypot(dx, dy) < 7) return;
    press.moving = true;
    if (press.kind !== "piece") {
      // Round the board: across turns it, up and down tips the view a little.
      this.renderer.domElement.style.cursor = "grabbing";
      this.turn = press.turn + dx * 0.0085;
      this.lift = Math.max(LIFT_DOWN, Math.min(LIFT_UP, press.lift + dy * 0.0035));
      this.aim();
      this.arrange(state);
      return;
    }
    this.renderer.domElement.style.cursor = "grabbing";
    const j = press.piece,
      p = state.tray[j],
      group = this.pieces[j],
      cell = cellUnder(at.x, at.z, this.turn, this.aspect);
    group.scale.setScalar(1);
    group.position.set(at.x, CARRY, at.z);
    group.rotation.y = this.turn + spin(p.at >= 0 ? p.yaw : 0);
    // Where it would land: a green ghost there, or a red ring where it may not go.
    for (const ghost of this.ghosts.values()) ghost.visible = false;
    this.rings.refuse.visible = this.rings.aim.visible = false;
    const move = cell >= 0 ? this.carryMove(state, j, cell) : null,
      next = move ? attempt(state, move) : null;
    if (next && typeof next !== "string") {
      const lands = next.tray[j],
        ghost = this.ghost(j, "green"),
        local = cellLocal(lands.at);
      ghost.visible = true;
      ghost.position.set(local.x, levelY(lands.level), local.z);
      ghost.rotation.y = spin(lands.yaw);
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
      // A tap: a piece on the board turns a quarter, the funnel drops the marble, a tray piece or a cell is chosen.
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
      this.dropped = { piece: j, at: group.position.clone(), rotation: group.rotation.y };
      this.onMove(move);
      if (this.state !== state) return;
      this.dropped = null;
    }
    // Back where it was.
    const from = group.position.clone(),
      fromScale = group.scale.x,
      fromTurn = group.rotation.y,
      to = this.home(state, j);
    this.tween(0, 220, (p) => {
      const e = 1 - (1 - p) ** 3;
      group.position.copy(lerp3(from, to.position, e));
      group.scale.setScalar(fromScale + (to.scale - fromScale) * e);
      group.rotation.y = fromTurn + (to.rotation - fromTurn) * e;
    });
  }
  /** Lays every tray piece where it stands, in the turntable's present turn. */
  private arrange(state: State) {
    state.tray.forEach((_, j) => {
      const group = this.pieces[j];
      if (!group || (this.press?.moving && this.press.piece === j)) return;
      const home = this.home(state, j);
      group.position.copy(home.position);
      group.rotation.set(0, home.rotation, 0);
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
    return this.centre(state.start.at, levelY(state.start.units.length) + FUNNEL * 0.65);
  }
  /** The height at which a marble falling down a cell from `level` first meets something, and what. */
  private landingBelow(w: World, cell: number, level: number) {
    for (let l = level; l >= 0; l--) {
      const i = vox(cell, l);
      if (w.owner[i] < 0 || w.kind[i] === OPEN) continue;
      return { level: l, kind: w.kind[i] as Kind, face: w.face[i] };
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
      legs = run.legs,
      start = legs[0];
    let at = this.waiting(state);
    const go = (stretch: Stretch) => {
      out.push(stretch);
      at = stretch.at(1);
    };
    // Into the funnel, down onto the start's ramp, down the ramp and out.
    go(drop(at, this.onRamp(start.cell, start.level, start.dir, -0.3), "disc"));
    go(roll(at, this.onRamp(start.cell, start.level, start.dir, 1)));
    go(roll(at, this.edge(start.cell, start.level, start.dir)));
    let lastDir = start.dir;
    for (let k = 1; k < legs.length; k++) {
      const leg = legs[k],
        next = legs[k + 1] as Leg | undefined;
      if (leg.kind === "flat") {
        go(roll(at, this.edge(leg.cell, leg.level, leg.dir)));
        lastDir = leg.dir;
      } else if (leg.kind === "corner") {
        const entry = at.clone(),
          exit = this.edge(leg.cell, leg.level, leg.dir),
          c = cellLocal(leg.cell),
          inSide = back(leg.from),
          pivot = new T.Vector3(c.x + ((STEP[inSide][0] + STEP[leg.dir][0]) * CELL) / 2, entry.y, c.z + ((STEP[inSide][1] + STEP[leg.dir][1]) * CELL) / 2),
          a = new T.Vector3().subVectors(entry, pivot),
          b = new T.Vector3().subVectors(exit, pivot),
          angle = a.angleTo(b),
          axis = new T.Vector3().crossVectors(a, b).normalize();
        go({ ms: ROLL_MS * 1.4, at: (u) => pivot.clone().add(a.clone().applyAxisAngle(axis, angle * u)) });
        lastDir = leg.dir;
      } else if (leg.kind === "fall") {
        const c = cellLocal(leg.cell),
          // In toward the middle of the cell as it falls.
          toward = new T.Vector3(c.x - STEP[leg.from][0] * CELL * 0.08, 0, c.z - STEP[leg.from][1] * CELL * 0.08);
        if (next?.kind === "ramp") {
          const s = Math.max(-0.85, Math.min(0.6, ((toward.x - c.x) * STEP[next.dir][0] + (toward.z - c.z) * STEP[next.dir][1]) / EDGE)),
            land = this.onRamp(leg.cell, leg.level - 1, next.dir, s);
          go(drop(at, land));
        } else if (next?.kind === "goal") {
          go(drop(at, this.centre(leg.cell, BOARD_TOP + MARBLE * 0.45), "pocket"));
        } else if (!next) {
          // The fall goes wrong: onto a flat, deeper than one level, or down onto the grid.
          const below = this.landingBelow(w, leg.cell, leg.level - 1),
            y = !below ? BOARD_TOP + MARBLE : below.kind === RAMP ? this.onRamp(leg.cell, below.level, below.face, 0).y : below.kind === OPEN ? levelY(below.level + 1) + MARBLE : levelY(below.level) + FLOOR + MARBLE,
            land = new T.Vector3(toward.x, y, toward.z);
          go(drop(at, land));
          if (!below || run.fault === "floor") {
            // On the grid it rolls away a little and stops.
            const away = new T.Vector3(land.x + STEP[leg.from][0] * 0.32, land.y, land.z + STEP[leg.from][1] * 0.32);
            go({ ...roll(land, away), ms: 520, at: (u) => lerp3(land, away, travel(u)) });
          } else go(settle(at));
        }
        lastDir = leg.from;
      } else if (leg.kind === "ramp") {
        go(roll(at, this.onRamp(leg.cell, leg.level, leg.dir, 1)));
        go(roll(at, this.edge(leg.cell, leg.level, leg.dir)));
        lastDir = leg.dir;
      } else if (leg.kind === "goal") {
        if (leg.from >= 0) {
          go(roll(at, this.centre(leg.cell, BOARD_TOP + MARBLE * 0.9)));
          go({ ...drop(at, this.centre(leg.cell, BOARD_TOP + MARBLE * 0.45), "pocket"), ms: 140 });
        }
        go(settle(at, 0.05, 420));
      }
    }
    const [dx, dz] = STEP[lastDir];
    if (run.fault === "off") {
      // Over the grid's edge: down onto the turntable, across it, and off its edge onto the bench.
      const level = Math.max(0, Math.round((at.y - BOARD_TOP - FLOOR - MARBLE) / HIGH)),
        land = new T.Vector3(at.x + dx * (0.3 + 0.08 * level), BOARD_TOP + MARBLE, at.z + dz * (0.3 + 0.08 * level));
      if (level > 0 || at.y > BOARD_TOP + MARBLE + 0.02) go(drop(at, land));
      else go(roll(at, land));
      // Out to the turntable's edge, then down.
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
      // Against the wall and back a little.
      const hit = new T.Vector3(at.x + dx * 0.03, at.y, at.z + dz * 0.03),
        recoil = new T.Vector3(at.x - dx * 0.12, at.y, at.z - dz * 0.12);
      go({ ...roll(at, hit), sound: "cushion", strength: 0.8 });
      go({ ms: 360, at: (u) => lerp3(hit, recoil, 1 - (1 - u) ** 2) });
    } else if (run.fault === "momentum") {
      // Into the second flat or corner, slowing to a stop.
      const stop = new T.Vector3(at.x + dx * 0.3, at.y, at.z + dz * 0.3),
        from = at.clone();
      go({ ms: 700, at: (u) => lerp3(from, stop, 1 - (1 - u) ** 3) });
    }
    const made = { stretches: out, rest: at.clone() };
    this.courses.set(state, made);
    return made;
  }
  /** Turns the marble as it rolls from one place to the next. */
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
        // What is heard as each stretch ends.
        for (; heard < (u >= 1 ? k + 1 : k); heard++) {
          const done = stretches[heard];
          if (done.sound) this.onKnock?.(done.sound, done.strength ?? 0.6);
        }
        this.rollMarble(was, at);
        this.marble.position.copy(at);
        was = at;
        // Home: the flag spins round its pin.
        if (cheer && this.flag && p > 1 - cheer / total) this.flag.rotation.y = Math.sin(((p - (1 - cheer / total)) / (cheer / total)) * Math.PI * 2) * 0.9;
      });
      return true;
    }
    const j = last.piece,
      group = this.pieces[j];
    if (j < 0 || !group) return false;
    const to = this.home(state, j),
      dropped = this.dropped?.piece === j ? this.dropped : null,
      from = dropped ? { position: dropped.at, rotation: dropped.rotation, scale: 1 } : this.home(before, j),
      turning = last.kind === "turn" && !dropped;
    this.dropped = null;
    let landed = false;
    // The short way round for a turn.
    let rotationTo = to.rotation;
    while (rotationTo - from.rotation > Math.PI) rotationTo -= Math.PI * 2;
    while (rotationTo - from.rotation < -Math.PI) rotationTo += Math.PI * 2;
    this.tween(0, turning ? 260 : 360, (p) => {
      const q = turning ? p * p * (3 - 2 * p) : travel(p);
      group.position.set(
        from.position.x + (to.position.x - from.position.x) * q,
        from.position.y + (to.position.y - from.position.y) * q + hop(p) * (turning ? 0.1 : dropped ? 0.12 : 0.4),
        from.position.z + (to.position.z - from.position.z) * q,
      );
      group.rotation.y = from.rotation + (rotationTo - from.rotation) * q;
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
  /** Puts a ring round a cell on top of what stands there (or round a voxel of it), in the turntable's turn. */
  private ringOnCell(ring: T.Mesh, state: State, cell: number, level?: number) {
    const w = world(state),
      y = level === undefined ? levelY(heightOf(w, cell)) + 0.02 : levelY(level) + 0.02,
      at = cellLocal(cell),
      bench = toBench(at.x, at.z, this.turn, this.aspect);
    ring.visible = true;
    ring.position.set(bench.x, y, bench.z);
    return y;
  }
  /** A ring on a tray piece where it stands (in the tray or on the board). */
  private ringOnPiece(ring: T.Mesh, state: State, j: number) {
    const p = state.tray[j];
    if (p.at >= 0) return this.ringOnCell(ring, state, p.at, p.level);
    const at = trayPlaces(state.tray, this.aspect)[j];
    ring.visible = true;
    ring.position.set(at.x, TRAY_TOP + 0.03, at.z);
    return TRAY_TOP;
  }
  /** The red marks of a failed drop: on the voxel it went wrong at, or on the pieces it is about. */
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
    if (trouble.fault === "left" || trouble.fault === "unused") {
      for (const j of trouble.tray) {
        const p = state.tray[j];
        if (p.at >= 0) {
          const cell = voxelsOf(p)[0].cell;
          spots.push(onCell(cell, p.level));
        } else {
          const at = trayPlaces(state.tray, this.aspect)[j];
          spots.push({ x: at.x, y: TRAY_TOP, z: at.z, top: TRAY_TOP + p.units.length * HIGH * TRAY_SCALE * (p.shape === "column" ? 1 : 1 / p.units.length) });
        }
      }
      for (const g of trouble.given) {
        const p = state.given[g];
        spots.push(onCell(voxelsOf(p)[0].cell, p.level));
      }
    } else if (trouble.at) spots.push(onCell(trouble.at.cell, trouble.at.level));
    else {
      const rest = this.course(state).rest,
        bench = toBench(rest.x, rest.z, this.turn, this.aspect);
      spots.push({ x: bench.x, y: 0, z: bench.z, top: 0.2 });
    }
    spots.slice(0, this.alarms.length).forEach((spot, k) => {
      const { ring, sign } = this.alarms[k];
      ring.visible = sign.visible = true;
      ring.position.set(spot.x, spot.y + 0.025, spot.z);
      sign.position.set(spot.x, spot.top + 0.34, spot.z);
    });
  }
  /** The arrow over the funnel bobs while every piece is set and the marble waits. */
  private kick() {
    if (!this.clock && !this.disposed) this.clock = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed || !this.arrow.visible || !this.state) return;
    const f = this.funnelBench(this.state);
    this.arrow.position.set(f.x, f.y + 0.45 + 0.06 * Math.sin(now / 220), f.z);
    this.redraw();
    if (!this.reducedMotion) this.kick();
  };
  private funnelBench(state: State) {
    const at = cellLocal(state.start.at),
      bench = toBench(at.x, at.z, this.turn, this.aspect);
    return { x: bench.x, y: levelY(state.start.units.length) + FUNNEL, z: bench.z };
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
    // A hint: gold rings on the piece and where it goes, and a gold ghost of it there, turned as it should be; a lift
    // back to the tray rings the piece and its place in the tray; for the drop, a gold ring round the funnel.
    if (!this.press?.moving) for (const ghost of this.ghosts.values()) ghost.visible = false;
    this.rings.from.visible = this.rings.to.visible = this.rings.funnel.visible = false;
    if (hint && hint.to === GO) {
      const f = this.funnelBench(state);
      this.rings.funnel.visible = true;
      this.rings.funnel.position.set(f.x, f.y + 0.03, f.z);
    } else if (hint) {
      const w = world(state),
        j = hint.from >= CELLS ? hint.from - CELLS : topIn(w, hint.from) - ids(state).tray(0);
      if (j >= 0 && j < state.tray.length) {
        this.ringOnPiece(this.rings.from, state, j);
        if (hint.to >= PUT) {
          const cell = Math.floor((hint.to - PUT) / 4),
            yaw = (hint.to - PUT) % 4,
            next = attempt(state, { ...hint, extra: -1 });
          const lands = next && typeof next !== "string" ? next.tray[j] : landing(w, state.tray[j], cell, yaw);
          if (lands) {
            const ghost = this.ghost(j, "gold"),
              local = cellLocal(lands.at);
            ghost.visible = true;
            ghost.position.set(local.x, levelY(lands.level) + 0.004, local.z);
            ghost.rotation.y = spin(lands.yaw);
            this.ringOnCell(this.rings.to, state, cell, lands.level);
          }
        } else if (hint.to >= CELLS) {
          const at = trayPlaces(state.tray, this.aspect)[j];
          this.rings.to.visible = true;
          this.rings.to.position.set(at.x, TRAY_TOP + 0.03, at.z);
        }
      }
    }
    // While every piece is set and the marble waits, an arrow points at the funnel.
    const ready = state.winner === null && !state.run && state.tray.every((p) => p.at >= 0) && !capturing() && !hint;
    this.arrow.visible = ready;
    if (ready) {
      const f = this.funnelBench(state);
      this.arrow.position.set(f.x, f.y + 0.45, f.z);
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
