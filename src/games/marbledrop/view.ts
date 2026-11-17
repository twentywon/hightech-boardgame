import * as T from "three";
import { block, glossy, hop, travel, veneer, weave, wood } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import type { Move } from "../points/types";
import { TableView, type Spot, type TableSubject } from "../table/view";
import {
  BOARD_TOP,
  CELL,
  CHANNEL,
  FLY_MS,
  FUNNEL,
  FUNNEL_MOUTH,
  GROOVE,
  HEIGHT_PAINT,
  INSIDE_MS,
  MARBLE,
  RIM,
  ROLL_MS,
  SPOUT,
  SPOUT_Y,
  STOREY,
  TRAY_DEPTH,
  TRAY_STEP,
  TRAY_TOP,
  WIDE,
  boardHalf,
  boardMiddle,
  funnelAt,
  marbleSubject,
  plotAt,
  plotUnder,
  topOf,
  trayAt,
  trayBox,
  sideways,
} from "./layout";
import { BLOCK_HEIGHT, GO, PUT, back, openings, pieceOn, type Kind, type Leg, type State } from "./rules";
import { workshop } from "./workshop";

export const MARBLE_COLORS: [string, string] = ["#3b86d8", "#d9b88a"];
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A compass direction as a step over the board (x, z). */
const STEP = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
/** A piece turned `rot` quarters clockwise, seen from above. */
const yaw = (rot: number) => (-rot * Math.PI) / 2;
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
/** The felt of the goal cup: darker toward its edge, as the inside of a cup is in shade. */
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
/**
 * The walls of a corner groove (openings north and east), as two solids standing on y = 0: the quarter round in the
 * corner the groove turns about, and the rest of the square beyond it. Shapes are drawn with y as north (−z) and
 * extruded upward; their bevel rounds the edges and is allowed for so that they stay inside the tower's square.
 */
function cornerWalls(height: number) {
  const bevel = 0.012,
    h = WIDE / 2 - bevel,
    inner = WIDE / 2 - CHANNEL / 2 - bevel,
    outer = WIDE / 2 + CHANNEL / 2 + bevel,
    c = WIDE / 2;
  const near = new T.Shape();
  near.moveTo(h, h);
  near.lineTo(c - inner, h);
  near.absarc(c, c, inner, Math.PI, Math.PI * 1.5, false);
  near.lineTo(h, h);
  const far = new T.Shape();
  far.moveTo(c - outer, h);
  far.lineTo(-h, h);
  far.lineTo(-h, -h);
  far.lineTo(h, -h);
  far.lineTo(h, c - outer);
  far.absarc(c, c, outer, Math.PI * 1.5, Math.PI, true);
  const options = { depth: height - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 18 };
  return [near, far].map((shape) => {
    const g = new T.ExtrudeGeometry(shape, options);
    g.rotateX(-Math.PI / 2);
    g.translate(0, bevel, 0);
    return g;
  });
}
/** One stretch of the marble's way: how long it takes, where the marble is along it (null while hidden in a tower), and what is heard as it ends. */
interface Stretch {
  ms: number;
  at: (u: number) => T.Vector3 | null;
  sound?: "disc" | "cushion" | "pocket";
  strength?: number;
}
const lerp3 = (a: T.Vector3, b: T.Vector3, u: number) => new T.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
/** A flight from `a` to `b`: across at an even pace, falling as a thing let go sideways falls (or over a little hump when it does not drop). */
function flight(a: T.Vector3, b: T.Vector3, bump = 0.05): Stretch {
  const far = Math.hypot(b.x - a.x, b.z - a.z);
  return {
    ms: FLY_MS + 260 * far,
    at: (u) => {
      const p = lerp3(a, b, u);
      p.y = b.y < a.y - 0.02 ? a.y + (b.y - a.y) * u * u + bump * 0.4 * Math.sin(Math.PI * u) : a.y + (b.y - a.y) * u + bump * Math.sin(Math.PI * u);
      return p;
    },
  };
}
/**
 * A toymaker's marble run on a workbench: a board of pale maple plots, towers of stacked beech storeys (one rounded
 * storey a level, a painted band telling the height by its colour) with brass spouts, troughs with their grooves
 * carved across their tops, a start tower painted in stripes with a brass funnel, a goal cup lined with felt under a
 * chequered flag, and dark pillars that block the way. Fixed things stand on dark bases. The pieces to set lie in a
 * tray before the board: they are dragged onto plots, carried between them or back, and a tap turns a piece set down.
 * A tap on the funnel drops the glass marble, which falls through the towers, shoots out of their spouts and rolls
 * along the grooves into the cup, or comes to grief, a red mark standing where it did.
 */
export class MarbleView extends TableView<State> {
  /** A strike of the marble: on a piece or the board ("disc"), against a wall ("cushion"), into the goal cup ("pocket"). */
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private size = 4;
  /** The canvas's shape, which decides where the tray lies. */
  private aspect = 1;
  private built = "";
  private fixed = new T.Group();
  private loose = new T.Group();
  private boardGroup = new T.Group();
  /** The tray's pieces, by their index in `tray`. */
  private pieces: T.Group[] = [];
  private flag: T.Group | null = null;
  private marble = new T.Group();
  private swirl: T.Mesh;
  private stuffs: Record<"beech" | "beech2" | "walnut" | "brass" | "funnel" | "hole" | "base" | "pillar" | "iron" | "stripe" | "cream" | "felt" | "flag" | "plot" | "board" | "tray" | "pad", T.Material>;
  private bands: T.Material[] = [];
  private shapes: {
    storey: T.BufferGeometry;
    topBase: T.BufferGeometry;
    rail: T.BufferGeometry;
    floor: T.BufferGeometry;
    corner: T.BufferGeometry[];
    band: T.BufferGeometry;
    rim: T.BufferGeometry;
    hole: T.BufferGeometry;
    spout: T.BufferGeometry;
    mouth: T.BufferGeometry;
    flange: T.BufferGeometry;
    funnel: T.BufferGeometry;
    base: T.BufferGeometry;
    pillar: T.BufferGeometry;
    cap: T.BufferGeometry;
    hoop: T.BufferGeometry;
    cupRim: T.BufferGeometry;
    felt: T.BufferGeometry;
    pin: T.BufferGeometry;
    knob: T.BufferGeometry;
    pennant: T.BufferGeometry;
    plot: T.BufferGeometry;
    pad: T.BufferGeometry;
  };
  private boards = new Map<string, T.BufferGeometry>();
  private scenery: ReturnType<typeof workshop>;
  private caster = new T.Raycaster();
  private pickables: T.Object3D[] = [];
  /** The marks: rings on plots and tray places, the hint's ghost of a piece, red warnings, the arrow over the funnel. */
  private rings: Record<"cursor" | "chosen" | "from" | "to" | "aim" | "funnel", T.Mesh>;
  private targets: T.Mesh[] = [];
  private alarms: { ring: T.Mesh; sign: T.Sprite }[] = [];
  private ghosts = new Map<string, T.Group>();
  private ghostPaint: T.Material;
  private chevrons: T.Mesh[] = [];
  private arrow: T.Mesh;
  private clock = 0;
  /** A press on the table: where it began and on what, and the piece it carries once it has moved. */
  private press: { point: number; piece: number; from: number; start: { x: number; z: number }; origin: T.Vector3; moving: boolean } | null = null;
  /** Where a carried piece was let go, so that it goes on from there. */
  private dropped: { piece: number; at: T.Vector3 } | null = null;
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
      beech: this.standard({ map: pale, color: "#f6dcb4", roughness: 0.55 }),
      beech2: this.standard({ map: pale, color: "#ead0a4", roughness: 0.55 }),
      walnut: this.standard({ map: dark, color: "#8a5e40", roughness: 0.6 }),
      brass: keep(glossy({ color: "#d9a845", metalness: 0.6, roughness: 0.3 })),
      funnel: keep(glossy({ color: "#d9a845", metalness: 0.6, roughness: 0.3, side: T.DoubleSide })),
      hole: this.standard({ color: "#160e09", roughness: 1 }),
      base: this.standard({ map: dark, color: "#5a3a26", roughness: 0.55 }),
      pillar: this.standard({ map: dark, color: "#4a3a34", roughness: 0.5 }),
      iron: this.standard({ color: "#2b2b30", metalness: 0.5, roughness: 0.45 }),
      stripe: keep(glossy({ color: "#177e7c", roughness: 0.35 })),
      cream: keep(glossy({ color: "#f5ecd6", roughness: 0.4 })),
      felt: this.standard({ map: keep(feltTexture()), roughness: 1, ...weave(2, 2, keep, 0.6) }),
      flag: this.standard({ map: keep(flagTexture()), roughness: 0.8, side: T.DoubleSide }),
      plot: this.standard({ map: keep(veneer(false)), color: "#f3dfc2", roughness: 0.6 }),
      board: this.standard({ map: pale, color: "#d9ae80", roughness: 0.6 }),
      tray: this.standard({ map: dark, color: "#9a6a48", roughness: 0.6 }),
      pad: this.standard({ color: "#2f5a3c", roughness: 1, ...weave(1, 1, keep, 0.6) }),
    };
    this.bands = HEIGHT_PAINT.map((color) => (color ? this.standard({ color, roughness: 0.4 }) : this.stuffs.beech));
    const funnelProfile = [
      [0.09, 0],
      [0.1, 0.02],
      [0.14, FUNNEL * 0.45],
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
      storey: keep(block(WIDE, STOREY - 0.004, WIDE, 0.035)),
      topBase: keep(block(WIDE, STOREY - GROOVE, WIDE, 0.035)),
      rail: keep(block((WIDE - CHANNEL) / 2, GROOVE + 0.006, WIDE, 0.022)),
      floor: keep(block(WIDE - 0.04, 0.008, WIDE - 0.04, 0.003)),
      corner: cornerWalls(GROOVE + 0.006).map(keep),
      band: keep(block(WIDE + 0.016, 0.075, WIDE + 0.016, 0.016)),
      rim: keep(new T.TorusGeometry(0.15, 0.024, 10, 36).rotateX(Math.PI / 2)),
      hole: keep(new T.CircleGeometry(0.15, 36).rotateX(-Math.PI / 2)),
      spout: keep(new T.CylinderGeometry(0.05, 0.05, SPOUT + 0.04, 20, 1, true).rotateX(Math.PI / 2)),
      mouth: keep(new T.CircleGeometry(0.044, 20)),
      flange: keep(new T.TorusGeometry(0.058, 0.015, 8, 22)),
      funnel: keep(new T.LatheGeometry(funnelProfile, 36)),
      base: keep(block(CELL * 0.84, 0.03, CELL * 0.84, 0.012)),
      pillar: keep(block(WIDE * 0.86, BLOCK_HEIGHT * STOREY - 0.06, WIDE * 0.86, 0.07)),
      cap: keep(new T.SphereGeometry(WIDE * 0.3, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
      hoop: keep(block(WIDE * 0.9, 0.035, WIDE * 0.9, 0.012)),
      cupRim: keep(new T.TorusGeometry(0.212, 0.045, 14, 44).rotateX(Math.PI / 2).scale(1, 0.75, 1)),
      felt: keep(new T.CircleGeometry(0.168, 36).rotateX(-Math.PI / 2)),
      pin: keep(new T.CylinderGeometry(0.012, 0.012, 0.44, 10)),
      knob: keep(new T.SphereGeometry(0.03, 14, 10)),
      pennant: keep(new T.ShapeGeometry(pennant)),
      plot: keep(block(CELL * 0.9, 0.014, CELL * 0.9, 0.006)),
      pad: keep(block(TRAY_STEP * 0.84, 0.01, TRAY_DEPTH * 0.72, 0.004)),
    };
    // The glass marble: a clear shell round a milky core twisted with colour.
    this.swirl = new T.Mesh(keep(new T.SphereGeometry(MARBLE * 0.82, 24, 16)), this.standard({ map: keep(swirlTexture()), roughness: 0.4 }));
    const shell = new T.Mesh(keep(new T.SphereGeometry(MARBLE, 28, 18)), keep(glossy({ color: "#e6f3ff", roughness: 0.04, transparent: true, opacity: 0.38 })));
    this.swirl.castShadow = shell.castShadow = true;
    this.marble.add(this.swirl, shell);
    this.scenery = workshop(this.scene, keep);
    this.scene.add(this.boardGroup, this.fixed, this.loose, this.marble);
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
      from: ring(0.38, 0.45, gold),
      to: ring(0.38, 0.45, gold),
      aim: ring(0.36, 0.45, flat("#7fe0a0", 0.9)),
      funnel: ring(FUNNEL_MOUTH + 0.04, FUNNEL_MOUTH + 0.1, gold),
    };
    const faint = flat("#ffffff", 0.5);
    for (let k = 0; k < 40; k++) this.targets.push(ring(0.2, 0.25, faint));
    const red = flat("#e0392b", 0.95),
      warning = keep(new T.SpriteMaterial({ map: keep(warningTexture()), depthTest: false, transparent: true }));
    for (let k = 0; k < 6; k++) {
      const sign = new T.Sprite(warning);
      sign.scale.setScalar(0.32);
      sign.renderOrder = 12;
      sign.visible = false;
      this.scene.add(sign);
      this.alarms.push({ ring: ring(0.36, 0.46, red), sign });
    }
    this.ghostPaint = this.standard({ color: "#ffb21f", emissive: "#8a5200", roughness: 0.6, transparent: true, opacity: 0.62, depthWrite: false });
    // Gold chevrons lying on the hinted plot, pointing out where the piece's spout or groove openings face.
    const chevron = new T.Shape();
    chevron.moveTo(-0.11, 0);
    chevron.lineTo(0, 0.1);
    chevron.lineTo(0.11, 0);
    chevron.lineTo(0.11, -0.045);
    chevron.lineTo(0, 0.05);
    chevron.lineTo(-0.11, -0.045);
    chevron.lineTo(-0.11, 0);
    const pointer = keep(new T.ShapeGeometry(chevron).rotateX(-Math.PI / 2));
    this.chevrons = [0, 1].map(() => {
      const mesh = new T.Mesh(pointer, gold);
      mesh.visible = false;
      mesh.renderOrder = 7;
      this.scene.add(mesh);
      return mesh;
    });
    this.arrow = new T.Mesh(keep(new T.ConeGeometry(0.09, 0.22, 16).rotateX(Math.PI)), keep(new T.MeshBasicMaterial({ color: "#ffffff" })));
    this.arrow.visible = false;
    this.arrow.renderOrder = 10;
    this.scene.add(this.arrow);
    // A carried piece is followed on the board's top.
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -BOARD_TOP);
    this.begin();
  }
  /** The tower of a piece, `height` storeys tall, its foot at 0, turned as at rotation 0 (spout or openings toward the north). */
  private model(kind: Kind | "start" | "block", height: number, ghost = false) {
    const group = new T.Group(),
      s = this.stuffs,
      paint = (m: T.Material) => (ghost ? this.ghostPaint : m),
      put = (geometry: T.BufferGeometry, material: T.Material, x = 0, y = 0, z = 0) => {
        const mesh = new T.Mesh(geometry, paint(material));
        mesh.position.set(x, y, z);
        mesh.castShadow = mesh.receiveShadow = !ghost;
        group.add(mesh);
        return mesh;
      };
    if (kind === "block") {
      put(this.shapes.pillar, s.pillar, 0, (BLOCK_HEIGHT * STOREY - 0.06) / 2);
      put(this.shapes.cap, s.pillar, 0, BLOCK_HEIGHT * STOREY - 0.065);
      for (const y of [0.18, BLOCK_HEIGHT * STOREY - 0.2]) put(this.shapes.hoop, s.iron, 0, y);
      return group;
    }
    const trough = kind === "straight" || kind === "corner",
      full = trough ? height - 1 : height;
    for (let k = 0; k < full; k++) put(this.shapes.storey, kind === "start" ? (k % 2 ? s.cream : s.stripe) : k % 2 ? s.beech2 : s.beech, 0, k * STOREY + STOREY / 2);
    const top = height * STOREY;
    if (trough) {
      const y0 = (height - 1) * STOREY;
      put(this.shapes.topBase, (height - 1) % 2 ? s.beech2 : s.beech, 0, y0 + (STOREY - GROOVE) / 2);
      put(this.shapes.floor, s.walnut, 0, y0 + STOREY - GROOVE + 0.002);
      if (kind === "straight") for (const side of [-1, 1]) put(this.shapes.rail, s.beech, side * (CHANNEL / 2 + (WIDE - CHANNEL) / 4), top - GROOVE / 2 + 0.002);
      else for (const wall of this.shapes.corner) put(wall, s.beech, 0, top - GROOVE - 0.002);
    }
    // The band of the height's colour low on the top storey (the start tower is striped all the way up instead).
    if (kind !== "start") put(this.shapes.band, this.bands[height], 0, top - STOREY + 0.058);
    if (kind === "drop" || kind === "start") {
      const y = (height - 1) * STOREY + SPOUT_Y * STOREY,
        reach = WIDE / 2 + SPOUT / 2 - 0.02;
      put(this.shapes.spout, s.brass, 0, y, -reach);
      put(this.shapes.flange, s.brass, 0, y, -WIDE / 2 - 0.004);
      const mouth = put(this.shapes.mouth, s.hole, 0, y, -WIDE / 2 - SPOUT + 0.03);
      mouth.rotation.y = Math.PI;
    }
    if (kind === "drop") {
      // The open cup at the top: a brass rim round a dark hole going down into the tower.
      put(this.shapes.rim, s.brass, 0, top + 0.004);
      put(this.shapes.hole, s.hole, 0, top + 0.003);
    }
    if (kind === "start") {
      put(this.shapes.funnel, s.funnel, 0, top - 0.005);
      put(this.shapes.hole, s.hole, 0, top + 0.01).scale.setScalar(0.62);
    }
    return group;
  }
  /** The goal cup set into the board, lined with felt, and its little chequered flag. */
  private cup() {
    const group = new T.Group(),
      rim = new T.Mesh(this.shapes.cupRim, this.stuffs.walnut),
      felt = new T.Mesh(this.shapes.felt, this.stuffs.felt);
    rim.castShadow = rim.receiveShadow = felt.receiveShadow = true;
    rim.position.y = 0.012;
    felt.position.y = 0.013;
    group.add(rim, felt);
    const flag = new T.Group(),
      pin = new T.Mesh(this.shapes.pin, this.stuffs.brass),
      knob = new T.Mesh(this.shapes.knob, this.stuffs.brass),
      cloth = new T.Mesh(this.shapes.pennant, this.stuffs.flag);
    pin.position.y = 0.22;
    knob.position.y = 0.45;
    cloth.position.set(0.01, 0.43, 0);
    pin.castShadow = cloth.castShadow = true;
    flag.add(pin, knob, cloth);
    // Stuck in beside the cup, as a flag marks a hole on a green.
    flag.position.set(0.3, 0, 0.04);
    group.add(flag);
    this.flag = flag;
    return group;
  }
  /** The board for a size: a plinth of maple with its rounded edge. */
  private plinth(size: number) {
    const key = `board:${size}`;
    let geometry = this.boards.get(key);
    if (!geometry) {
      const span = size * CELL + 2 * RIM;
      geometry = this.own(block(span, BOARD_TOP, span, 0.06));
      this.boards.set(key, geometry);
    }
    return geometry;
  }
  private trayShape(width: number, part: "floor" | "side" | "end") {
    const key = `tray:${width}:${part}`;
    let geometry = this.boards.get(key);
    if (!geometry) {
      geometry =
        part === "floor" ? this.own(block(width, 0.05, TRAY_DEPTH, 0.02)) : part === "side" ? this.own(block(width, 0.11, 0.07, 0.025)) : this.own(block(0.07, 0.11, TRAY_DEPTH, 0.025));
      this.boards.set(key, geometry);
    }
    return geometry;
  }
  /** Builds the board, the fixed things and the tray's pieces when the puzzle changes. */
  private lay(state: State) {
    const key = JSON.stringify([sideways(this.aspect), state.size, state.start, state.goal, state.blocks, state.given, state.tray.map((p) => [p.kind, p.height])]);
    if (key === this.built) return;
    const resized = state.size !== this.size;
    this.built = key;
    this.size = state.size;
    this.boardGroup.clear();
    this.fixed.clear();
    this.loose.clear();
    this.pickables = [];
    const n = state.size,
      middle = boardMiddle(this.aspect),
      count = state.tray.length;
    const board = new T.Mesh(this.plinth(n), this.stuffs.board);
    board.position.set(middle.x, BOARD_TOP / 2, middle.z);
    board.castShadow = board.receiveShadow = true;
    this.boardGroup.add(board);
    for (let i = 0; i < n * n; i++) {
      const at = plotAt(n, i, this.aspect),
        plate = new T.Mesh(this.shapes.plot, this.stuffs.plot);
      plate.position.set(at.x, BOARD_TOP + 0.002, at.z);
      plate.receiveShadow = true;
      plate.userData.point = i;
      this.boardGroup.add(plate);
      this.pickables.push(plate);
    }
    // The tray: a shallow box of walnut with a felt pad for every piece, before the board or down its right side.
    const box = trayBox(n, count, this.aspect),
      width = box.length,
      tray = new T.Group(),
      floor = new T.Mesh(this.trayShape(width, "floor"), this.stuffs.tray);
    floor.position.set(0, 0.025, 0);
    tray.add(floor);
    for (const side of [-1, 1]) {
      const long = new T.Mesh(this.trayShape(width, "side"), this.stuffs.tray);
      long.position.set(0, 0.055, side * (TRAY_DEPTH / 2 - 0.035));
      const end = new T.Mesh(this.trayShape(width, "end"), this.stuffs.tray);
      end.position.set(side * (width / 2 - 0.035), 0.055, 0);
      tray.add(long, end);
    }
    tray.position.set(box.x, 0, box.z);
    tray.rotation.y = box.across ? 0 : Math.PI / 2;
    this.boardGroup.add(tray);
    for (let j = 0; j < count; j++) {
      const at = trayAt(n, count, j, this.aspect),
        pad = new T.Mesh(this.shapes.pad, this.stuffs.pad);
      pad.position.set(at.x, TRAY_TOP + 0.005, at.z);
      pad.rotation.y = box.across ? 0 : Math.PI / 2;
      pad.receiveShadow = true;
      pad.userData.point = n * n + j;
      this.boardGroup.add(pad);
      this.pickables.push(pad);
    }
    this.boardGroup.traverse((m) => {
      if (m instanceof T.Mesh) m.castShadow = m.receiveShadow = true;
    });
    // The fixed things, each on a dark base.
    const stand = (thing: T.Group, plot: number, rot: number, base = true) => {
      const at = plotAt(n, plot, this.aspect);
      thing.position.set(at.x, BOARD_TOP, at.z);
      thing.rotation.y = yaw(rot);
      thing.userData.point = plot;
      this.fixed.add(thing);
      this.pickables.push(thing);
      if (base) {
        const plate = new T.Mesh(this.shapes.base, this.stuffs.base);
        plate.position.set(at.x, BOARD_TOP + 0.015, at.z);
        plate.receiveShadow = true;
        this.fixed.add(plate);
      }
    };
    const start = this.model("start", state.start.level + 1);
    stand(start, state.start.at, state.start.dir);
    start.userData.point = GO;
    stand(this.cup(), state.goal, 0, false);
    for (const b of state.blocks) stand(this.model("block", BLOCK_HEIGHT), b, 0);
    for (const p of state.given) stand(this.model(p.kind, p.height), p.at, p.rot);
    this.pieces = state.tray.map((p) => {
      const thing = this.model(p.kind, p.height);
      this.loose.add(thing);
      this.pickables.push(thing);
      return thing;
    });
    // The props lie round the board and the tray together.
    const half = boardHalf(n),
      along = box.across ? [box.length / 2, TRAY_DEPTH / 2] : [TRAY_DEPTH / 2, box.length / 2];
    this.scenery.place({
      left: Math.min(middle.x - half, box.x - along[0]),
      right: Math.max(middle.x + half, box.x + along[0]),
      back: Math.min(middle.z - half, box.z - along[1]),
      front: Math.max(middle.z + half, box.z + along[1]),
    });
    if (resized) this.resize();
  }
  protected subject(aspect: number): TableSubject {
    return marbleSubject(this.size, aspect);
  }
  /** A canvas that turns wide (or narrow) moves the tray beside the board (or before it): the bench is laid again. */
  protected layout(aspect: number) {
    const turned = sideways(aspect) !== sideways(this.aspect);
    this.aspect = aspect;
    if (turned) {
      this.built = "";
      this.courses = new WeakMap();
    }
  }
  /** Where a tray piece stands: on its plot or in its place in the tray. */
  private home(state: State, j: number) {
    const p = state.tray[j];
    if (p.at >= 0) {
      const at = plotAt(state.size, p.at, this.aspect);
      return new T.Vector3(at.x, BOARD_TOP, at.z);
    }
    const at = trayAt(state.size, state.tray.length, j, this.aspect);
    return new T.Vector3(at.x, TRAY_TOP + 0.01, at.z);
  }
  /** Every plot, every tray place, and the funnel. */
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const n = state.size,
      plots = Array.from({ length: n * n }, (_, i) => ({ ...plotAt(n, i, this.aspect), y: BOARD_TOP + 0.1, r: CELL * 0.5, point: i })),
      tray = state.tray.map((_, j) => ({ ...trayAt(n, state.tray.length, j, this.aspect), y: TRAY_TOP + 0.15, r: TRAY_STEP * 0.5, point: n * n + j })),
      funnel = funnelAt(n, state.start.at, state.start.level, this.aspect);
    return [{ ...funnel, r: 0.3, point: GO }, ...plots, ...tray];
  }
  /** What a press strikes first: a piece, the start tower, a fixed thing, a plot or a place in the tray. */
  protected pick(ray: T.Ray) {
    if (!this.state || !this.pickables.length) return null;
    this.scene.updateMatrixWorld(true);
    this.caster.ray.copy(ray);
    const hit = this.caster.intersectObjects(this.pickables, true)[0];
    let thing: T.Object3D | null = hit?.object ?? null;
    while (thing && thing.userData.point === undefined) thing = thing.parent;
    return thing ? (thing.userData.point as number) : null;
  }
  protected hover(point: number) {
    const state = this.state;
    if (!state || this.press?.moving) return;
    const n = state.size * state.size,
      live = state.winner === null && (point === GO || point >= n || (point >= 0 && pieceOn(state, point) >= 0));
    this.renderer.domElement.style.cursor = live || this.marks.targets.includes(point) ? "pointer" : "default";
  }
  /** Every press is taken here: a piece pressed and moved is carried, a press let go where it began is a tap. */
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null) return false;
    const n = state.size * state.size;
    let piece = -1,
      from = -1;
    if (point >= n && point < n + state.tray.length && state.tray[point - n].at < 0) piece = point - n;
    else if (point >= 0 && point < n) {
      piece = pieceOn(state, point);
      if (piece >= 0) from = point;
    }
    this.press = { point, piece, from, start: { x: at.x, z: at.z }, origin: piece >= 0 ? this.home(state, piece) : new T.Vector3(), moving: false };
    return true;
  }
  /** Where the foot of a carried piece is, for the pointer at `at`. */
  private carriedTo(at: { x: number; z: number }, press = this.press!) {
    return { x: press.origin.x + at.x - press.start.x, z: press.origin.z + at.z - press.start.z };
  }
  /** The plot a carried piece would be set on, or -1 (off the board, or a plot that is taken). */
  private aimed(at: { x: number; z: number }, press = this.press) {
    const state = this.state;
    if (!state || !press) return -1;
    const plot = plotUnder(state.size, at.x, at.z, this.aspect);
    if (plot < 0) return -1;
    return standing(state, plot) === "free" || plot === press.from ? plot : -1;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const press = this.press,
      state = this.state;
    if (!press || !state || press.piece < 0) return;
    if (!press.moving && Math.hypot(at.x - press.start.x, at.z - press.start.z) < 0.14) return;
    press.moving = true;
    this.renderer.domElement.style.cursor = "grabbing";
    const foot = this.carriedTo(at),
      piece = this.pieces[press.piece];
    piece.position.set(foot.x, BOARD_TOP + 0.22, foot.z);
    const plot = this.aimed(foot);
    this.rings.aim.visible = plot >= 0;
    if (plot >= 0) {
      const p = plotAt(state.size, plot, this.aspect);
      this.rings.aim.position.set(p.x, BOARD_TOP + 0.02, p.z);
    } else if (press.from >= 0) {
      // Over the tray: a piece of the board goes back to its place there.
      const home = trayAt(state.size, state.tray.length, press.piece, this.aspect);
      this.rings.aim.visible = true;
      this.rings.aim.position.set(home.x, TRAY_TOP + 0.02, home.z);
    }
    this.redraw();
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const press = this.press,
      state = this.state;
    this.press = null;
    this.rings.aim.visible = false;
    this.renderer.domElement.style.cursor = "default";
    if (!press || !state) return;
    const n = state.size * state.size;
    if (!press.moving) {
      if (!at) return;
      // A tap: a piece of the tray set down turns a quarter, the start tower drops the marble, anything else is
      // left to the screen (a piece of the tray picked up, a plot chosen for it).
      if (press.from >= 0) return this.onMove({ from: press.from, to: press.from, extra: -1 });
      if (press.point === GO) return this.onMove({ from: -1, to: GO, extra: -1 });
      return this.onPick(press.point);
    }
    const piece = this.pieces[press.piece],
      foot = at ? this.carriedTo(at, press) : null,
      plot = foot ? this.aimed(foot, press) : -1;
    let move: Move | null = null;
    if (foot && plot >= 0 && plot !== press.from) move = { from: press.from >= 0 ? press.from : n + press.piece, to: plot, extra: -1 };
    else if (foot && plot < 0 && press.from >= 0 && plotUnder(state.size, foot.x, foot.z, this.aspect) < 0) move = { from: press.from, to: n + press.piece, extra: -1 };
    if (move) {
      this.dropped = { piece: press.piece, at: piece.position.clone() };
      this.onMove(move);
      if (this.state !== state) return;
      this.dropped = null;
    }
    // Back where it was.
    const from = piece.position.clone(),
      to = press.origin;
    this.tween(0, 200, (p) => {
      const e = 1 - (1 - p) ** 3;
      piece.position.copy(lerp3(from, to, e));
    });
  }
  /** The marble's way through a leg's piece: where it goes in and where it comes out. */
  private entry(leg: Leg) {
    const at = plotAt(this.size, leg.at, this.aspect);
    if (leg.kind === "goal") return new T.Vector3(at.x, BOARD_TOP + MARBLE * 0.5, at.z);
    if (leg.kind === "drop") return new T.Vector3(at.x, topOf(leg.height) + MARBLE * 0.5, at.z);
    const [dx, dz] = STEP[back(leg.from)];
    return new T.Vector3(at.x + (dx * WIDE) / 2, topOf(leg.height) - GROOVE + MARBLE, at.z + (dz * WIDE) / 2);
  }
  private exit(leg: Leg) {
    const at = plotAt(this.size, leg.at, this.aspect),
      [dx, dz] = STEP[leg.dir];
    if (leg.kind === "drop" || leg.kind === "start") {
      const reach = WIDE / 2 + SPOUT;
      return new T.Vector3(at.x + dx * reach, BOARD_TOP + leg.out * STOREY + SPOUT_Y * STOREY, at.z + dz * reach);
    }
    return new T.Vector3(at.x + (dx * WIDE) / 2, topOf(leg.height) - GROOVE + MARBLE, at.z + (dz * WIDE) / 2);
  }
  /** Where the marble waits before it is dropped: in the funnel's mouth. */
  private waiting(state: State) {
    const at = plotAt(state.size, state.start.at, this.aspect);
    return new T.Vector3(at.x, topOf(state.start.level + 1) + FUNNEL * 0.62, at.z);
  }
  private courses = new WeakMap<State, Stretch[]>();
  /** The marble's whole way for a state that has dropped it, stretch by stretch. */
  private course(state: State): Stretch[] {
    const known = this.courses.get(state);
    if (known) return known;
    const run = state.run!,
      out: Stretch[] = [],
      board = BOARD_TOP + MARBLE,
      start = run.legs[0],
      waiting = this.waiting(state),
      throat = new T.Vector3(waiting.x, topOf(start.height) + 0.02, waiting.z);
    // Into the funnel and down through the start tower.
    out.push({ ms: 260, at: (u) => lerp3(waiting, throat, u * u), sound: "disc", strength: 0.4 });
    out.push({ ms: INSIDE_MS + 80 * start.height, at: () => null });
    let from = this.exit(start);
    for (const leg of run.legs.slice(1)) {
      const into = this.entry(leg);
      out.push({ ...flight(from, into), sound: leg.kind === "goal" ? "pocket" : "disc", strength: 0.6 });
      if (leg.kind === "goal") {
        const rest = into.clone();
        rest.y = BOARD_TOP + MARBLE * 0.35;
        out.push({ ms: 380, at: (u) => new T.Vector3(into.x, rest.y + 0.05 * Math.abs(Math.sin(Math.PI * 2 * u)) * (1 - u), into.z) });
        break;
      }
      if (leg.kind === "drop") {
        const sunk = into.clone();
        sunk.y -= 0.12;
        out.push({ ms: 90, at: (u) => lerp3(into, sunk, u) }, { ms: INSIDE_MS, at: () => null });
      } else {
        // Along the groove: straight across, or round the quarter turn of a corner.
        const leave = this.exit(leg);
        if (leg.kind === "straight") out.push({ ms: ROLL_MS, at: (u) => lerp3(into, leave, u) });
        else {
          const [ax, az] = STEP[back(leg.from)],
            [bx, bz] = STEP[leg.dir],
            middle = plotAt(this.size, leg.at, this.aspect),
            pivot = new T.Vector3(middle.x + ((ax + bx) * WIDE) / 2, into.y, middle.z + ((az + bz) * WIDE) / 2);
          out.push({
            ms: ROLL_MS,
            at: (u) => {
              const a = new T.Vector3().subVectors(into, pivot),
                b = new T.Vector3().subVectors(leave, pivot),
                angle = a.angleTo(b) * u,
                axis = new T.Vector3().crossVectors(a, b).normalize();
              return pivot.clone().add(a.applyAxisAngle(axis, angle));
            },
          });
        }
      }
      from = this.exit(leg);
    }
    const last = run.legs[run.legs.length - 1],
      [dx, dz] = last.dir >= 0 ? STEP[last.dir] : [0, 0];
    if (run.fault === "off") {
      // Off the edge: down onto the bench beyond the board, a bounce, and away.
      const land = new T.Vector3(from.x + dx * 0.95, MARBLE, from.z + dz * 0.95),
        away = new T.Vector3(land.x + dx * 0.55, MARBLE, land.z + dz * 0.55);
      out.push({ ...flight(from, land, 0.02), sound: "disc", strength: 0.8 });
      out.push({ ms: 520, at: (u) => new T.Vector3(land.x + (away.x - land.x) * travel(u), MARBLE + 0.07 * hop(u), land.z + (away.z - land.z) * travel(u)), sound: "disc", strength: 0.3 });
    } else if (run.fault === "floor") {
      const at = plotAt(this.size, run.at, this.aspect),
        land = new T.Vector3(at.x, board, at.z),
        away = new T.Vector3(at.x + dx * 0.24, board, at.z + dz * 0.24);
      out.push({ ...flight(from, land, 0.02), sound: "disc", strength: 0.8 });
      out.push({ ms: 460, at: (u) => new T.Vector3(land.x + (away.x - land.x) * travel(u), board + 0.06 * hop(u), land.z + (away.z - land.z) * travel(u)), sound: "disc", strength: 0.3 });
    } else if (run.fault) {
      // Against a wall (a taller piece, a pillar), or onto the rim of a piece that does not take it: then back and down.
      const at = plotAt(this.size, run.at, this.aspect),
        there = this.thingTop(state, run.at),
        // A marble higher than a pillar comes down on its top and is stopped there just the same.
        overTop = run.fault === "closed" || run.fault === "loop" || (run.fault === "block" && from.y > there + MARBLE),
        reach = overTop ? WIDE / 2 - MARBLE * 0.6 : WIDE / 2 + MARBLE,
        knock = new T.Vector3(at.x - dx * reach, overTop ? there + MARBLE : Math.max(board + 0.04, from.y - 0.05), at.z - dz * reach),
        fall = new T.Vector3(at.x - dx * (WIDE / 2 + MARBLE + 0.17), board, at.z - dz * (WIDE / 2 + MARBLE + 0.17));
      out.push({ ...flight(from, knock, 0.03), sound: "cushion", strength: 0.8 });
      out.push({ ...flight(knock, fall, 0.06), ms: 360, sound: "disc", strength: 0.5 });
    }
    this.courses.set(state, out);
    return out;
  }
  /** The top of whatever stands on a plot, in table units. */
  private thingTop(state: State, plot: number) {
    if (plot === state.start.at) return topOf(state.start.level + 1);
    if (state.blocks.includes(plot)) return topOf(BLOCK_HEIGHT);
    const piece = [...state.given, ...state.tray].find((p) => p.at === plot);
    return piece ? topOf(piece.height) : BOARD_TOP;
  }
  /** Where the marble is at the end of its way. */
  private rest(state: State) {
    const course = this.course(state);
    for (let k = course.length - 1; k >= 0; k--) {
      const at = course[k].at(1);
      if (at) return at;
    }
    return this.waiting(state);
  }
  /** Turns the marble as it rolls from one place to the next. */
  private roll(from: T.Vector3, to: T.Vector3) {
    const d = new T.Vector3(to.x - from.x, 0, to.z - from.z),
      far = d.length();
    if (far < 1e-5) return;
    const axis = new T.Vector3(d.z, 0, -d.x).normalize();
    this.marble.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis, far / MARBLE));
  }
  protected place(state: State) {
    this.lay(state);
    const n = state.size * state.size;
    state.tray.forEach((p, j) => {
      const piece = this.pieces[j];
      if (!piece) return;
      piece.position.copy(this.home(state, j));
      piece.rotation.set(0, yaw(p.rot), 0);
      piece.scale.setScalar(1);
      piece.userData.point = p.at >= 0 ? p.at : n + j;
    });
    this.marble.visible = true;
    this.marble.position.copy(state.run ? this.rest(state) : this.waiting(state));
    if (this.flag) this.flag.rotation.y = 0;
    this.mark(this.marks);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    if (last.kind === "go" && state.run) {
      const course = this.course(state),
        total = course.reduce((sum, s) => sum + s.ms, 0) + (state.winner === 0 ? 600 : 0);
      let heard = 0,
        was = this.waiting(state);
      this.marble.position.copy(was);
      this.hideAlarms();
      this.tween(0, total, (p) => {
        let t = p * total,
          k = 0;
        while (k < course.length - 1 && t > course[k].ms) t -= course[k++].ms;
        const stretch = course[k],
          u = Math.min(1, t / stretch.ms),
          at = stretch.at(u);
        // What is heard as each stretch ends.
        for (; heard < (u >= 1 ? k + 1 : k); heard++) {
          const done = course[heard];
          if (done.sound) this.onKnock?.(done.sound, done.strength ?? 0.6);
        }
        this.marble.visible = !!at;
        if (at) {
          this.roll(was, at);
          this.marble.position.copy(at);
          was = at;
        }
        // Home: the flag spins round its pin.
        if (state.winner === 0 && this.flag && p > 1 - 600 / total) this.flag.rotation.y = Math.sin(((p - (1 - 600 / total)) / (600 / total)) * Math.PI * 2) * 0.9;
      });
      return true;
    }
    const j = last.piece,
      piece = this.pieces[j];
    if (j < 0 || !piece) return false;
    const to = this.home(state, j),
      dropped = this.dropped?.piece === j ? this.dropped.at : null,
      from = dropped ?? this.home(before, j),
      turnFrom = yaw(before.tray[j].rot),
      turns = state.tray[j].kind === "straight" ? 2 : 4,
      quarters = (((state.tray[j].rot - before.tray[j].rot) % turns) + turns) % turns,
      turnBy = last.kind === "turn" ? (quarters === 3 ? 1 : -Math.max(1, quarters)) : 0;
    this.dropped = null;
    let landed = false;
    piece.position.copy(from);
    this.tween(0, last.kind === "turn" ? 240 : 340, (p) => {
      if (last.kind === "turn") {
        piece.rotation.y = turnFrom + (turnBy * Math.PI * p) / 2;
        piece.position.set(to.x, to.y + 0.1 * hop(p), to.z);
      } else {
        const q = travel(p);
        piece.position.set(from.x + (to.x - from.x) * q, from.y + (to.y - from.y) * q + hop(p) * (dropped ? 0.12 : 0.4), from.z + (to.z - from.z) * q);
        piece.rotation.y = yaw(state.tray[j].rot);
      }
      if (!landed && p >= 0.84) {
        landed = true;
        this.onContact();
      }
    });
    return true;
  }
  private hideAlarms() {
    for (const alarm of this.alarms) alarm.ring.visible = alarm.sign.visible = false;
  }
  /** The red marks of a failed drop: on the place it went wrong, or on the pieces it is about. */
  private alarm(state: State) {
    this.hideAlarms();
    const trouble = state.trouble;
    if (!trouble || this.animating) return;
    const n = state.size,
      spots: { x: number; y: number; z: number; top: number }[] = [];
    if (trouble.fault === "left" || trouble.fault === "unused")
      for (const j of trouble.culprits) {
        const home = this.home(state, j);
        spots.push({ x: home.x, y: home.y, z: home.z, top: home.y + state.tray[j].height * STOREY });
      }
    else if (trouble.fault === "off") {
      const rest = this.rest(state);
      spots.push({ x: rest.x, y: 0, z: rest.z, top: 0.2 });
    } else {
      const at = plotAt(n, trouble.at, this.aspect);
      spots.push({ x: at.x, y: BOARD_TOP, z: at.z, top: this.thingTop(state, trouble.at) });
    }
    spots.slice(0, this.alarms.length).forEach((spot, k) => {
      const { ring, sign } = this.alarms[k];
      ring.visible = sign.visible = true;
      ring.position.set(spot.x, spot.y + 0.02, spot.z);
      sign.position.set(spot.x, spot.top + 0.32, spot.z);
    });
  }
  /** A gold ghost of a piece turned as the hint wants it. */
  private ghost(kind: Kind, height: number) {
    const key = `${kind}:${height}`;
    let ghost = this.ghosts.get(key);
    if (!ghost) {
      ghost = this.model(kind, height, true);
      ghost.visible = false;
      ghost.traverse((m) => (m.renderOrder = 8));
      this.scene.add(ghost);
      this.ghosts.set(key, ghost);
    }
    return ghost;
  }
  /** The arrow over the funnel bobs while every piece is set and the marble waits. */
  private kick() {
    if (!this.clock && !this.disposed) this.clock = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed || !this.arrow.visible) return;
    const state = this.state!,
      at = funnelAt(state.size, state.start.at, state.start.level, this.aspect);
    this.arrow.position.set(at.x, at.y + 0.42 + 0.06 * Math.sin(now / 220), at.z);
    this.redraw();
    if (!this.reducedMotion) this.kick();
  };
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const n = state.size * state.size,
      foot = (point: number | null | undefined) => {
        if (point === null || point === undefined || point < 0) return null;
        if (point < n) {
          const at = plotAt(state.size, point, this.aspect);
          return new T.Vector3(at.x, BOARD_TOP + 0.022, at.z);
        }
        if (point < n + state.tray.length) {
          const at = trayAt(state.size, state.tray.length, point - n, this.aspect);
          return new T.Vector3(at.x, TRAY_TOP + 0.02, at.z);
        }
        return null;
      },
      onto = (mesh: T.Mesh, point: number | null | undefined) => {
        const at = foot(point);
        mesh.visible = !!at;
        if (at) mesh.position.copy(at);
      };
    onto(this.rings.cursor, marks.cursor);
    const hint = marks.hint ?? null;
    onto(this.rings.chosen, hint ? null : marks.selected);
    this.targets.forEach((ring, k) => onto(ring, hint || marks.selected === null ? null : marks.targets[k]));
    // A hint: gold rings on the piece and where it goes, and a gold ghost of it there, turned as it should be; for the
    // drop, a gold ring round the funnel.
    for (const ghost of this.ghosts.values()) ghost.visible = false;
    this.rings.from.visible = this.rings.to.visible = this.rings.funnel.visible = false;
    for (const chevron of this.chevrons) chevron.visible = false;
    if (hint && hint.to === GO) {
      const at = funnelAt(state.size, state.start.at, state.start.level, this.aspect);
      this.rings.funnel.visible = true;
      this.rings.funnel.position.set(at.x, topOf(state.start.level + 1) + FUNNEL + 0.03, at.z);
    } else if (hint) {
      onto(this.rings.from, hint.from);
      const j = hint.from >= n ? hint.from - n : pieceOn(state, hint.from);
      if (hint.to >= PUT && j >= 0) {
        const plot = Math.floor((hint.to - PUT) / 4),
          rot = (hint.to - PUT) % 4,
          ghost = this.ghost(state.tray[j].kind, state.tray[j].height),
          at = plotAt(state.size, plot, this.aspect);
        onto(this.rings.to, plot);
        // Where the piece's way out faces once it is turned so: its spout, or the two openings of its groove.
        const kind = state.tray[j].kind,
          faces = kind === "drop" ? [rot] : openings(kind, rot);
        faces.forEach((face, k) => {
          const chevron = this.chevrons[k],
            [dx, dz] = STEP[face];
          chevron.visible = true;
          chevron.position.set(at.x + dx * CELL * 0.41, BOARD_TOP + 0.024, at.z + dz * CELL * 0.41);
          chevron.rotation.y = yaw(face);
        });
        ghost.visible = true;
        ghost.position.set(at.x, BOARD_TOP + (plot === hint.from ? 0.012 : 0), at.z);
        ghost.rotation.y = yaw(rot);
        if (plot === hint.from) ghost.scale.setScalar(1.06);
        else ghost.scale.setScalar(1);
      } else onto(this.rings.to, hint.to);
    }
    // While every piece is set and the marble waits, an arrow points at the funnel.
    const ready = state.winner === null && !state.run && state.tray.every((p) => p.at >= 0) && !capturing() && !hint;
    this.arrow.visible = ready;
    if (ready) {
      const at = funnelAt(state.size, state.start.at, state.start.level, this.aspect);
      this.arrow.position.set(at.x, at.y + 0.42, at.z);
      this.kick();
    }
    this.alarm(state);
    this.redraw();
  }
  dispose() {
    cancelAnimationFrame(this.clock);
    this.clock = 0;
    super.dispose();
  }
}
/** What stands on a plot, as the view needs to know it: nothing, a piece of the tray (by index), or something fixed. */
function standing(state: State, plot: number): "free" | "fixed" | number {
  const j = pieceOn(state, plot);
  if (j >= 0) return j;
  if (plot === state.start.at || plot === state.goal || state.blocks.includes(plot) || state.given.some((p) => p.at === plot)) return "fixed";
  return "free";
}
