import { capturing } from "../../ui/banner";
import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { afterGPUFrame, aim, capable, glossy, realism, weave } from "../../engine/scene-utils";
import { FOV, SUBJECTS, TILT, cameraDistance, type Subject } from "../../engine/camera";
import type { TableView, Tone } from "./game";

/** How a game's cards look. Painters draw on a canvas of `pixels` size. */
export interface CardSkin {
  width: number;
  height: number;
  pixels: [number, number];
  face(ctx: CanvasRenderingContext2D, width: number, height: number, key: string): void;
  back(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  /** Two lines printed on the felt. */
  lines: [string, string];
  /** Seats hold only a few cards, so the table can be drawn closer. */
  compact?: boolean;
  /**
   * How many cards open a hand (two in seotda, three in stud). Those of them that stay hidden are gathered at
   * the left of the row; a card dealt face down later keeps its place at the right.
   */
  secretLeft?: number;
  /** A table and room of the game's own in place of the endless felt (hold'em); left out by the others. */
  setting?: TableSetting;
  /**
   * Cards as rounded solids of this body (seotda, stud). With it the table also plays the livelier way: cards are
   * flicked out in a slight arc and spin flat as they land, chips with spots round the rim slide into the pot and the
   * pot slides to the winner, the cover of a card I must uncover peels up at a corner as it is pushed off, the cards
   * offered for a choice glow, and a showdown turns the hands over seat by seat. Left out (hold'em), all is as before.
   */
  body?: CardBody;
}
export interface CardBody {
  thickness: number;
  /** Radius of the corners. */
  corner: number;
  /** Colour of the edge. */
  edge: string;
  /** A clear coat over face and back (lacquered hwatu), where a graphics card draws. */
  lacquer?: boolean;
}
/** Where a seat's row of cards lies, and how large its cards are. */
export interface SeatRow {
  x: number;
  z: number;
  width: number;
  scale: number;
}
type Own = <X extends { dispose(): void }>(resource: X) => X;
/** A game's own table: its layouts, what it builds round the cards and what it moves with the play. */
export interface TableSetting {
  wide: Layout;
  square: Layout;
  /** Very wide screens (phones held sideways), when the game lays its table out longer there. */
  long?: Layout;
  /** The colour behind everything. */
  clear?: string;
  /** Builds the room and the table round the cards; `own` disposes a resource with the view. */
  build(scene: T.Scene, own: Own): void;
  /** The table changed: `row` says where each seat's cards lie; `quick` when nothing should move slowly. */
  place?(model: TableView, row: (seat: number) => SeatRow, layout: Layout, quick: boolean): void;
  /** Every frame; true while something of the setting moves and the picture must be drawn again. */
  frame?(now: number): boolean;
}
const FONT =
  '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
const TONE_COLOR: Record<Tone, string> = {
  neutral: "#f1ecdf",
  win: "#f3d27a",
  lose: "#f0b4a6",
  push: "#dfe6dc",
};
const CHIPS = [
  { value: 500, color: "#3b2a66", stripe: "#f1ecdf" },
  { value: 100, color: "#1c1e20", stripe: "#f1ecdf" },
  { value: 50, color: "#c8452c", stripe: "#f6efe0" },
  { value: 10, color: "#efe6d0", stripe: "#2a5a4c" },
] as const;
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function texture(c: HTMLCanvasElement) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function plaqueTexture(text: string, tone: Tone) {
  const { c, ctx } = canvas(640, 128);
  ctx.fillStyle = "rgba(9, 28, 23, 0.78)";
  roundRect(ctx, 4, 4, 632, 120, 60);
  ctx.fill();
  ctx.strokeStyle = TONE_COLOR[tone];
  ctx.globalAlpha = tone === "neutral" ? 0.35 : 0.9;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = TONE_COLOR[tone];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 60;
  do {
    ctx.font = `700 ${size}px ${FONT}`;
    size -= 4;
  } while (ctx.measureText(text).width > 580 && size > 24);
  ctx.fillText(text, 320, 68);
  return texture(c);
}
function feltTexture() {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#1f5a49";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 5;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(rand() * 256, rand() * 256, 1.5, 1.5);
  }
  const t = texture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(24, 24);
  return t;
}
function markingTexture(lines: [string, string]) {
  const { c, ctx } = canvas(1024, 160);
  ctx.fillStyle = "rgba(233, 214, 160, 0.7)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText(lines[0], 512, 48);
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText(lines[1], 512, 116);
  return texture(c);
}
function glowTexture() {
  const { c, ctx } = canvas(512, 256);
  ctx.strokeStyle = "rgba(243, 210, 122, 0.95)";
  ctx.lineWidth = 8;
  ctx.shadowColor = "rgba(243, 210, 122, 0.9)";
  ctx.shadowBlur = 26;
  roundRect(ctx, 36, 36, 440, 184, 34);
  ctx.stroke();
  return texture(c);
}
function chipTop(color: string, stripe: string, value: number) {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = stripe;
  ctx.lineWidth = 9;
  ctx.setLineDash([17, 14]);
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = stripe;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 40px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(String(value), 64, 67);
  return texture(c);
}
function chipSide(color: string, stripe: string) {
  const { c, ctx } = canvas(256, 16);
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 ? stripe : color;
    ctx.fillRect(i * 16, 0, 16, 16);
  }
  return texture(c);
}
/** A rounded rectangle centred on the origin, in the plane of a shape. */
function roundedShape(w: number, h: number, r: number) {
  const shape = new T.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w / 2, h / 2 - r);
  shape.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}
/**
 * A card (or a pile of them) as a rounded solid lying on the table: its top takes material 2, its underside 3 and
 * its edge 0, as the sides of a `BoxGeometry` do, so the six materials of a card go on as before.
 */
function solidCard(w: number, h: number, thickness: number, r: number) {
  const geometry = new T.ExtrudeGeometry(roundedShape(w, h, r), { depth: thickness, bevelEnabled: false, curveSegments: 5 }),
    [caps, sides] = geometry.groups,
    half = caps.count / 2,
    uv = geometry.getAttribute("uv"),
    at = geometry.getAttribute("position");
  for (let i = caps.start; i < caps.start + caps.count; i++) uv.setXY(i, at.getX(i) / w + 0.5, at.getY(i) / h + 0.5);
  geometry.clearGroups();
  // The bottom cap comes before the top one.
  geometry.addGroup(caps.start + half, half, 2);
  geometry.addGroup(caps.start, half, 3);
  geometry.addGroup(sides.start, sides.count, 0);
  geometry.translate(0, 0, -thickness / 2);
  // The shape's plane becomes the table's: its y runs to the far side, the thickness up.
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
/** The edges of a pile of cards pressed together, fine dark lines on the cards' colour. */
function pileEdges(color: string) {
  const { c, ctx } = canvas(64, 64);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    ctx.fillStyle = `rgba(30, 20, 10, ${0.16 + ((y * 7) % 5) * 0.03})`;
    ctx.fillRect(0, y, 64, 2);
  }
  const t = texture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** The face of a modelled chip: its colour, inserts round the rim, a dashed ring and a printed inlay with the value. */
function chipFace(chip: (typeof CHIPS)[number]) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = chip.color;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = chip.stripe;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(128, 128, 128, a - 0.2, a + 0.2);
    ctx.arc(128, 128, 100, a + 0.2, a - 0.2, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = chip.stripe;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(128, 128, 88, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  const light = chip.value === 10;
  ctx.fillStyle = light ? chip.stripe : "#f3ecdb";
  ctx.beginPath();
  ctx.arc(128, 128, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = light ? "#f3ecdb" : chip.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(128, 128, 62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = light ? "#f3ecdb" : chip.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${chip.value >= 100 ? 62 : 70}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(String(chip.value), 128, 133);
  return texture(c);
}
/** The rim of a modelled chip: its colour with six spots, matching the face; the bevels at the top and bottom darker. */
function chipRim(chip: (typeof CHIPS)[number]) {
  const { c, ctx } = canvas(384, 32);
  ctx.fillStyle = chip.color;
  ctx.fillRect(0, 0, 384, 32);
  ctx.fillStyle = chip.stripe;
  for (let k = 0; k < 6; k++) ctx.fillRect(k * 64 + 20, 5, 24, 22);
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.fillRect(0, 0, 384, 5);
  ctx.fillRect(0, 27, 384, 5);
  return texture(c);
}
/** A chip turned on a lathe: flat faces (groups 1 and 2) inside a rounded rim (group 0), as a cylinder's materials go. */
function chipModel(radius: number, height: number) {
  const b = 0.012,
    y = height / 2,
    rim = new T.LatheGeometry(
      [
        new T.Vector2(radius - b, -y),
        new T.Vector2(radius - b * 0.3, -y + b * 0.3),
        new T.Vector2(radius, -y + b),
        new T.Vector2(radius, y - b),
        new T.Vector2(radius - b * 0.3, y - b * 0.3),
        new T.Vector2(radius - b, y),
      ],
      40,
    ),
    top = new T.CircleGeometry(radius - b, 40),
    bottom = new T.CircleGeometry(radius - b, 40);
  top.rotateX(-Math.PI / 2);
  top.translate(0, y, 0);
  bottom.rotateX(Math.PI / 2);
  bottom.translate(0, -y, 0);
  const merged = mergeGeometries([rim, top, bottom], true);
  rim.dispose();
  top.dispose();
  bottom.dispose();
  return merged;
}
/** A soft gold halo round an upright card, for the cards offered to be tapped. */
function haloTexture() {
  const { c, ctx } = canvas(256, 352);
  // Drawn round the card's own outline (the plane is half as wide again and 1.38 times as tall as the card), so
  // that the line and its glow lie on the cloth just outside the card.
  ctx.strokeStyle = "rgba(255, 216, 110, 1)";
  ctx.lineWidth = 12;
  ctx.shadowColor = "rgba(255, 200, 80, 1)";
  ctx.shadowBlur = 30;
  roundRect(ctx, 40, 46, 176, 260, 20);
  ctx.stroke();
  ctx.stroke();
  return texture(c);
}
/** Where the corners of a cover are cut round, as the card under it. */
function cornerMask(w: number, h: number, r: number) {
  const { c, ctx } = canvas(128, Math.round((128 * h) / w));
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#fff";
  roundRect(ctx, 0, 0, c.width, c.height, (r / w) * c.width);
  ctx.fill();
  const t = new T.CanvasTexture(c);
  return t;
}
const outCubic = (p: number) => 1 - (1 - p) ** 3;
/** A small fixed scatter, so that no two chips in a stack lie quite alike. */
const scatter = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
interface Tween {
  mesh: T.Mesh;
  start: number;
  duration: number;
  from: T.Vector3;
  to: T.Vector3;
  fromFlip: number;
  toFlip: number;
  lift: number;
  contact: boolean;
  done?: () => void;
  /** The livelier tables: fast out and slowing as it lands. */
  flick?: boolean;
  /** Turned this far flat on the table as it starts, spinning to straight as it lands. */
  yaw?: number;
  /** How far the way bows to one side. */
  bow?: number;
}
export interface Layout {
  subject: Subject;
  /** Centre x of the opposing seats, by how many there are. */
  rivals: number[][];
  /** Width of an opposing row and card scale, by how many there are. */
  rivalWidth: number[];
  rivalScale: number[];
  mineWidth: number;
  /** Seat 0's card scale; 1 when left out. */
  mineScale?: number;
  /** Where the opposing rows lie from front to back, by how many there are; all at the back when left out. */
  rivalZ?: number[][];
  /** Row widths seat by seat, where they differ. */
  rivalWidths?: number[][];
  deck: T.Vector3;
  discard: T.Vector3;
  /** Deck and discard for a number of rivals whose rows would lie over the usual places. */
  corner?: { rivals: number; deck: T.Vector3; discard: T.Vector3 };
  /** Where seat 0's row lies from front to back, when not the usual place. */
  mineZ?: number;
  /** The community cards' row (hold'em): five places from `x`, `gap` apart, at `z`. */
  board?: { x: number; z: number; gap: number; scale: number };
  /** Where the pot's chips and its label lie, when not the usual place (across the middle unless `x` is given). */
  pot?: { z: number; label: number; x?: number };
  /** Chips go to the pot from the side of each row that faces the middle of the table, whatever side it sits at. */
  inward?: boolean;
}
/** The felt's layouts; a game's own room (`CardSkin.setting`) may lay its cards out as one of them. */
export const LAYOUTS: Record<"wide" | "square" | "compact" | "compactSquare", Layout> = {
  compact: {
    subject: SUBJECTS.cardsCompact,
    rivals: [[0], [-1.8, 1.8], [-2.8, 0, 2.8]],
    rivalWidth: [3, 2.6, 2.4],
    rivalScale: [0.9, 0.9, 0.88],
    mineWidth: 3.4,
    deck: new T.Vector3(3.4, 0.12, 0.1),
    discard: new T.Vector3(-3.4, 0.02, 0.1),
  },
  compactSquare: {
    subject: SUBJECTS.cardsCompactSquare,
    rivals: [[0], [-1.5, 1.5], [-2.2, 0, 2.2]],
    rivalWidth: [3, 2.4, 1.9],
    rivalScale: [0.9, 0.88, 0.82],
    mineWidth: 3.4,
    deck: new T.Vector3(2.5, 0.12, 0.1),
    discard: new T.Vector3(-2.5, 0.02, 0.1),
  },
  wide: {
    subject: SUBJECTS.cardsWide,
    // The whole table is used so that the cards can be large: with three across from me, two sit at the sides
    // and one at the far end, each with a row wide enough to read.
    rivals: [[0], [-2.75, 2.75], [-3.8, 0, 3.8]],
    rivalWidth: [6.2, 5, 4],
    rivalScale: [1, 0.95, 0.94],
    rivalZ: [[-1.9], [-1.9, -1.9], [-0.5, -2.45, -0.5]],
    rivalWidths: [[6.2], [5, 5], [3.9, 5.6, 3.9]],
    mineWidth: 7.4,
    mineScale: 1.12,
    deck: new T.Vector3(4.9, 0.12, 0.1),
    discard: new T.Vector3(-4.9, 0.02, 0.1),
    corner: { rivals: 3, deck: new T.Vector3(4.75, 0.12, -2.55), discard: new T.Vector3(-4.75, 0.02, -2.55) },
  },
  square: {
    subject: SUBJECTS.cardsSquare,
    // A squarer screen has room from front to back: three rivals sit left, far and right here too, so that
    // their cards are not crowded into a third of the width each.
    rivals: [[0], [-1.85, 1.85], [-2.3, 0, 2.3]],
    rivalWidth: [5.4, 3.4, 2.9],
    rivalScale: [0.95, 0.84, 0.86],
    rivalZ: [[-1.9], [-1.9, -1.9], [-0.55, -2.6, -0.55]],
    rivalWidths: [[5.4], [3.4, 3.4], [2.85, 5.2, 2.85]],
    mineWidth: 6.6,
    mineScale: 1.05,
    deck: new T.Vector3(2.9, 0.12, 0.1),
    discard: new T.Vector3(-2.9, 0.02, 0.1),
    corner: { rivals: 3, deck: new T.Vector3(3.25, 0.12, -2.75), discard: new T.Vector3(-3.25, 0.02, -2.75) },
  },
};
const MINE_Z = 1.85,
  RIVAL_Z = -1.9,
  // The pot sits between the rows, clear of seat 0's outline.
  POT_Z = -0.2,
  POT_LABEL_Z = 0.36;

/** A felt table for seat 0 and up to three seats across from it. */
export class CardTableView {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(FOV, 1, 0.1, 80);
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private layout = LAYOUTS.wide;
  private model: TableView = { seats: [], pot: 0 };
  private cards = new Map<number, { mesh: T.Mesh; faceUp: boolean; dim: boolean; cover: T.Mesh | null }>();
  private choices = new Set<number>();
  private picked = new Set<number>();
  private deckOpen = false;
  private tap: { id: number | null; pointer: number; x: number; y: number } | null = null;
  private coverGeometry: T.PlaneGeometry;
  private drag: { id: number; cover: T.Mesh; pointer: number; from: number } | null = null;
  private slides: { cover: T.Mesh; start: number; from: number; to: number; done?: () => void }[] = [];
  private flights = new T.Group();
  private lastBets: number[] = [];
  private lastPot = 0;
  /** When the hands being turned over at a showdown will all lie face up, from now (ms). */
  private revealed = 0;
  private ray = new T.Raycaster();
  private plane = new T.Plane(new T.Vector3(0, 1, 0), -0.03);
  private tweens: Tween[] = [];
  private owned: { dispose(): void }[] = [];
  private cardGeometry: T.BufferGeometry;
  private edge: T.MeshStandardMaterial;
  /** The livelier table's own things (see `CardSkin.body`); null on the plain one. */
  private rich: {
    body: CardBody;
    /** A cover's material: the back, its corners cut round. */
    cover: T.MeshStandardMaterial;
    halo: T.MeshBasicMaterial;
    haloGeometry: T.PlaneGeometry;
    /** The pot just paid, lying in front of its winner until the next hand is anted. */
    won: T.Group;
    /** Chips are on their way to the pot: its stacks are drawn again when they land. */
    potLate: boolean;
    /** Whether the halos pulse (a graphics card draws and motion is welcome). */
    pulse: boolean;
  } | null = null;
  private back: T.MeshStandardMaterial;
  private blank: T.MeshStandardMaterial;
  private faces = new Map<string, T.MeshStandardMaterial>();
  private plaqueGeometry = this.own(new T.PlaneGeometry(2.3, 0.46));
  private plaqueMaterials = new Map<string, T.MeshBasicMaterial>();
  private plaques = new T.Group();
  private chips = new T.Group();
  private chipGeometry: T.BufferGeometry = this.own(new T.CylinderGeometry(0.24, 0.24, 0.06, 32));
  private chipMaterials: T.Material[][] = [];
  private glow: T.Mesh;
  private deck: T.Mesh;
  private arrow = new T.Group();
  private reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A card touched the felt. */
  onContact: () => void = () => {};
  /** Every animation finished and the plaques show the current table. */
  onSettled: () => void = () => {};
  /** The person slid the cover off the card with this id. */
  onPeek: (id: number) => void = () => {};
  /** The person tapped one of the cards offered by `setChoices`. */
  onCard: (id: number) => void = () => {};
  /** The person tapped the deck while `setChoices` offered it. */
  onDeck: () => void = () => {};
  /** Chips started moving across the table. */
  onChips: () => void = () => {};
  get animating() {
    return this.tweens.length > 0 || this.slides.length > 0;
  }
  get ready() {
    return this.readyFlag;
  }
  private own<X extends { dispose(): void }>(resource: X) {
    this.owned.push(resource);
    return resource;
  }
  private paint(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    const [w, h] = this.skin.pixels,
      { c, ctx } = canvas(w, h);
    draw(ctx, w, h);
    const map = this.own(texture(c));
    // Lacquered hwatu catch the light in a clear coat (only where a graphics card draws; plain paint elsewhere).
    if (this.skin.body?.lacquer) return this.own(glossy({ map, roughness: 0.42 }, 0.75));
    return this.own(new T.MeshStandardMaterial({ map, roughness: this.skin.body ? 0.5 : 0.55 }));
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
    private skin: CardSkin,
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor(skin.setting?.clear ?? "#184539");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    // The table is described in text beside it; the canvas itself is decorative.
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.scene.add(new T.HemisphereLight("#fff4dc", "#1c3a31", 2.4));
    const light = new T.DirectionalLight("#fff6e2", 2.6);
    light.position.set(-3, 9, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -8;
    light.shadow.camera.right = 8;
    light.shadow.camera.top = 8;
    light.shadow.camera.bottom = -8;
    light.shadow.normalBias = 0.02;
    this.own(light.shadow);
    this.scene.add(light);
    if (skin.setting) skin.setting.build(this.scene, (resource) => this.own(resource));
    else {
      const felt = new T.Mesh(
        this.own(new T.PlaneGeometry(60, 60)),
        this.own(new T.MeshStandardMaterial({ map: this.own(feltTexture()), roughness: 0.95, ...weave(45, 45, (r) => this.own(r)) })),
      );
      felt.rotation.x = -Math.PI / 2;
      felt.receiveShadow = true;
      this.scene.add(felt);
      const marking = new T.Mesh(
        this.own(new T.PlaneGeometry(4.2, 4.2 * (160 / 1024))),
        this.own(
          new T.MeshBasicMaterial({
            map: this.own(markingTexture(skin.lines)),
            transparent: true,
            depthWrite: false,
          }),
        ),
      );
      marking.rotation.x = -Math.PI / 2;
      marking.position.set(0, 0.004, -0.92);
      this.scene.add(marking);
    }
    // After every lamp of the table is in the scene, so that all of them are tuned alike.
    realism(this.renderer, this.scene);
    this.glow = new T.Mesh(
      this.own(new T.PlaneGeometry(1, 1)),
      this.own(
        new T.MeshBasicMaterial({ map: this.own(glowTexture()), transparent: true, depthWrite: false }),
      ),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.visible = false;
    this.scene.add(this.glow);
    const body = skin.body;
    this.edge = this.own(new T.MeshStandardMaterial({ color: body?.edge ?? "#efe9db", roughness: body ? 0.6 : 0.8 }));
    this.cardGeometry = this.own(
      body ? solidCard(skin.width, skin.height, body.thickness, body.corner) : new T.BoxGeometry(skin.width, 0.012, skin.height),
    );
    this.coverGeometry = this.own(new T.PlaneGeometry(skin.width, skin.height));
    this.back = this.paint((ctx, w, h) => skin.back(ctx, w, h));
    this.blank = this.paint((ctx, w, h) => {
      ctx.fillStyle = "#fbf8f0";
      ctx.fillRect(0, 0, w, h);
    });
    if (body) {
      const cover = this.own(this.back.clone());
      cover.alphaMap = this.own(cornerMask(skin.width, skin.height, body.corner));
      cover.alphaTest = 0.5;
      cover.side = T.DoubleSide;
      this.rich = {
        body,
        cover,
        halo: this.own(new T.MeshBasicMaterial({ map: this.own(haloTexture()), transparent: true, depthWrite: false })),
        haloGeometry: this.own(new T.PlaneGeometry(skin.width * 1.5, skin.height * 1.38)),
        won: new T.Group(),
        potLate: false,
        pulse: capable() && !this.reducedMotion,
      };
      this.chipGeometry = this.own(chipModel(0.24, 0.06));
      this.scene.add(this.rich.won);
    }
    for (const chip of CHIPS) {
      if (body) {
        const face = this.own(glossy({ map: this.own(chipFace(chip)), roughness: 0.38 }, 0.5)),
          rim = this.own(new T.MeshStandardMaterial({ map: this.own(chipRim(chip)), roughness: 0.45 }));
        this.chipMaterials.push([rim, face, face]);
        continue;
      }
      const flat = this.own(
        new T.MeshStandardMaterial({
          map: this.own(chipTop(chip.color, chip.stripe, chip.value)),
          roughness: 0.5,
        }),
      );
      const side = this.own(
        new T.MeshStandardMaterial({ map: this.own(chipSide(chip.color, chip.stripe)), roughness: 0.5 }),
      );
      this.chipMaterials.push([side, flat, flat]);
    }
    if (body) {
      // A pile of the same rounded cards, their edges pressed together.
      const edges = this.own(pileEdges(body.edge));
      // A line a card: the picture holds eight, and the edge's v runs one to a unit of height.
      edges.repeat.set(4, 1 / (8 * body.thickness));
      const side = this.own(new T.MeshStandardMaterial({ map: edges, roughness: 0.75 }));
      this.deck = new T.Mesh(this.own(solidCard(skin.width + 0.03, skin.height + 0.03, 0.22, body.corner + 0.015)), [
        side,
        side,
        this.back,
        this.edge,
      ]);
    } else
      this.deck = new T.Mesh(
        this.own(new T.BoxGeometry(skin.width + 0.06, 0.22, skin.height + 0.06)),
        [this.edge, this.edge, this.back, this.edge, this.edge, this.edge],
      );
    this.deck.castShadow = true;
    this.scene.add(this.deck, this.plaques, this.chips, this.flights);
    // An arrow over the deck while a tap on it would deal.
    const gold = new T.MeshBasicMaterial({ color: "#ffd24a" }),
      head = new T.Mesh(new T.ConeGeometry(0.2, 0.34, 4), gold),
      shaft = new T.Mesh(new T.BoxGeometry(0.1, 0.34, 0.1), gold);
    head.rotation.x = Math.PI;
    shaft.position.y = 0.32;
    this.arrow.add(head, shaft);
    this.owned.push(gold, head.geometry, shaft.geometry);
    this.arrow.visible = false;
    this.scene.add(this.arrow);
    this.bindCovers();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now(),
        moved = this.step(now) || !!this.skin.setting?.frame?.(now),
        // The arrow bobs over the deck; it is left out of the collection's captures.
        pointing = this.deckOpen && !this.animating && !capturing();
      if (pointing !== this.arrow.visible) this.dirty = true;
      this.arrow.visible = pointing;
      if (pointing) {
        const { deck } = this.piles();
        this.arrow.position.set(deck.x, deck.y + 0.75 + Math.sin(now / 260) * 0.12, deck.z);
        this.arrow.rotation.y = now / 700;
      }
      // The halos round the cards offered for a choice breathe, where that costs little.
      const pulsing = !!this.rich?.pulse && this.choices.size > 0;
      if (pulsing) this.rich!.halo.opacity = 0.62 + 0.38 * Math.sin(now / 320);
      if (!this.dirty && !moved && !pointing && !pulsing) return;
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      if (!this.readyFlag && !this.cancelReady)
        this.cancelReady = afterGPUFrame(this.renderer, () => {
          this.readyFlag = true;
          this.renderer.domElement.dataset.ready = "true";
        });
    };
    this.raf = requestAnimationFrame(loop);
  }
  /** `dim` shades a card of seat 0 that the other seats cannot see. */
  private setFace(mesh: T.Mesh, key: string | null, dim = false) {
    let material = this.blank;
    if (key) {
      const name = dim ? `${key}|dim` : key;
      material =
        this.faces.get(name) ??
        this.paint((ctx, w, h) => {
          this.skin.face(ctx, w, h, key);
          if (dim) {
            ctx.fillStyle = "rgba(18, 22, 30, 0.3)";
            ctx.fillRect(0, 0, w, h);
          }
        });
      this.faces.set(name, material);
    }
    (mesh.material as T.Material[])[2] = material;
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const square = w / h < 1.25;
    this.layout = this.skin.setting
      ? square
        ? this.skin.setting.square
        : w / h >= 2 && this.skin.setting.long
          ? this.skin.setting.long
          : this.skin.setting.wide
      : this.skin.compact
      ? square
        ? LAYOUTS.compactSquare
        : LAYOUTS.compact
      : square
        ? LAYOUTS.square
        : LAYOUTS.wide;
    const subject = this.layout.subject,
      distance = cameraDistance(this.camera.aspect, false, subject),
      tilt = subject.tilt ?? TILT;
    this.camera.position.set(0, Math.sin(tilt) * distance, Math.cos(tilt) * distance);
    this.camera.lookAt(0, subject.lookY, 0);
    this.deck.position.copy(this.piles().deck);
    // A new shape moves every target: place the current table without animation.
    this.sync(this.model, false);
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Row centre, width and card scale of a seat. */
  private row(seat: number) {
    const rivals = this.model.seats.length - 1;
    if (seat === 0) return { x: 0, z: this.layout.mineZ ?? MINE_Z, width: this.layout.mineWidth, scale: this.layout.mineScale ?? 1 };
    return {
      x: this.layout.rivals[rivals - 1][seat - 1],
      z: this.layout.rivalZ?.[rivals - 1]?.[seat - 1] ?? RIVAL_Z,
      width: this.layout.rivalWidths?.[rivals - 1]?.[seat - 1] ?? this.layout.rivalWidth[rivals - 1],
      scale: this.layout.rivalScale[rivals - 1],
    };
  }
  /** Where the deck and the discards lie for the seats now at the table. */
  private piles() {
    const corner = this.layout.corner;
    return corner && this.model.seats.length - 1 === corner.rivals ? corner : this.layout;
  }
  private gap(n: number, width: number, scale: number) {
    const w = this.skin.width * scale;
    // Hands of a few cards lie side by side; longer ones overlap.
    return n > 1 ? Math.min(w * (this.skin.compact ? 1.05 : 0.62), (width - w) / (n - 1)) : 0;
  }
  /**
   * Shows `model`. New cards are dealt from the deck in order, a card that
   * gained a face is turned over, and cards that left the table are discarded.
   */
  sync(model: TableView, animate = true) {
    if (this.disposed) return;
    this.model = model;
    this.dirty = true;
    const quick = !animate || this.reducedMotion,
      now = performance.now(),
      { deck, discard } = this.piles();
    this.finish();
    const targets = new Map<
      number,
      { face: string | null; at: T.Vector3; scale: number; covered: boolean; dim: boolean; seat: number; slot: number }
    >();
    // Solid cards rest on the cloth, each a little above the one it overlaps.
    const body = this.rich?.body,
      rest = body ? body.thickness / 2 + 0.003 : 0.02,
      rise = body ? Math.max(0.006, body.thickness * 0.6) : 0.006;
    model.seats.forEach((seat, s) => {
      const { x, z, width, scale } = this.row(s),
        // A folded hand is squared up into a small pile.
        gap = seat.folded ? 0.1 * scale : this.gap(seat.cards.length, width, scale);
      // The cards dealt face down at the start lie together at the left of the row, mine and the other seats' alike
      // (as I see them). A card dealt face down later (the last one) keeps its place at the right.
      const opening = this.skin.secretLeft ?? 0,
        hidden = (card: (typeof seat.cards)[number], i: number) => i < opening && (s === 0 ? !!card.secret : card.face === null),
        order = seat.cards.map((card, i) => ({ card, left: hidden(card, i) })),
        cards = this.skin.secretLeft ? [...order.filter((o) => o.left), ...order.filter((o) => !o.left)].map((o) => o.card) : seat.cards;
      cards.forEach((card, i) =>
        targets.set(card.id, {
          face: card.face,
          scale,
          covered: !!card.covered,
          dim: !!card.secret && !!card.face,
          seat: s,
          slot: i,
          // A card picked for a choice is pushed up the table a little.
          at: new T.Vector3(
            x + (i - (seat.cards.length - 1) / 2) * gap,
            rest + i * rise,
            z - (s === 0 && this.picked.has(card.id) ? 0.3 : 0),
          ),
        }),
      );
    });
    // The community cards lie face up in a row of five places in the middle of the table.
    const middle = this.layout.board;
    if (middle)
      model.board?.forEach((card, i) =>
        targets.set(card.id, {
          face: card.face,
          scale: middle.scale,
          covered: false,
          dim: false,
          seat: -1,
          slot: i,
          at: new T.Vector3(middle.x + i * middle.gap, rest, middle.z),
        }),
      );
    let removed = false;
    for (const [id, entry] of this.cards)
      if (!targets.has(id)) {
        this.cards.delete(id);
        removed = true;
        if (this.drag?.id === id) this.drag = null;
        const leave = () => {
          this.scene.remove(entry.mesh);
          if (this.rich && entry.cover) entry.cover.geometry.dispose();
        };
        if (quick) leave();
        else this.tween(entry.mesh, now, 260, discard, entry.mesh.rotation.z, Math.PI, 0.15, false, leave);
      }
    let order = 0;
    this.revealed = 0;
    // A showdown on the livelier table turns the hands over seat by seat, each hand card by card.
    const turning: number[] = [];
    const reveal = (seat: number, slot: number) => {
      if (!turning.includes(seat)) turning.push(seat);
      return turning.indexOf(seat) * 430 + slot * 150;
    };
    for (const [id, { face, at, scale, covered, dim, seat, slot }] of [...targets.entries()].sort(
      ([a], [b]) => a - b,
    )) {
      const existing = this.cards.get(id);
      if (existing) this.setCover(id, existing, covered, quick);
      if (!existing) {
        const mesh = new T.Mesh(this.cardGeometry, [
          this.edge,
          this.edge,
          this.blank,
          this.back,
          this.edge,
          this.edge,
        ]);
        mesh.castShadow = true;
        mesh.position.copy(deck);
        // A covered card travels face up under its cover, so it never flips.
        mesh.rotation.z = covered ? 0 : Math.PI;
        mesh.scale.set(scale, 1, scale);
        this.setFace(mesh, face, dim);
        this.scene.add(mesh);
        const entry = { mesh, faceUp: !!face, dim, cover: null };
        this.cards.set(id, entry);
        this.setCover(id, entry, covered, true);
        if (body) {
          // Flicked out of the hand: off fast in a low arc that bows aside, spinning flat to straight as it slows.
          // It waits square in the pile until its turn comes, then leaves it turned.
          this.tween(mesh, now + order++ * 140, 360, at, mesh.rotation.z, face ? 0 : Math.PI, 0.32, true);
          Object.assign(this.tweens[this.tweens.length - 1], { flick: true, yaw: 0.55 * (at.x >= deck.x ? -1 : 1), bow: 0.35 * (at.z > deck.z ? 1 : -1) });
        } else this.tween(mesh, now + order++ * 130, 300, at, mesh.rotation.z, face ? 0 : Math.PI, 0.55, true);
      } else {
        existing.mesh.scale.set(scale, 1, scale);
        if (face && !existing.faceUp) {
          existing.faceUp = true;
          existing.dim = dim;
          this.setFace(existing.mesh, face, dim);
          // Turned over where it lies: lifted on its edge and laid down face up.
          if (body) {
            const delay = reveal(seat, slot);
            this.revealed = Math.max(this.revealed, delay + 420);
            this.tween(existing.mesh, now + delay, 420, at, Math.PI, 0, 0.42, true);
          }
          else this.tween(existing.mesh, now + order++ * 130, 340, at, Math.PI, 0, 0.5, true);
        } else if (!face && existing.faceUp) {
          // Folded: the card is turned face down where it lies.
          existing.faceUp = false;
          this.tween(existing.mesh, now + order++ * 60, 300, at, 0, Math.PI, 0.4, false, () =>
            this.setFace(existing.mesh, null),
          );
        } else {
          if (face && existing.dim !== dim) {
            existing.dim = dim;
            this.setFace(existing.mesh, face, dim);
          }
          if (existing.mesh.position.distanceToSquared(at) <= 1e-6) continue;
          const flip = existing.mesh.rotation.z;
          this.tween(existing.mesh, now, 220, at, flip, flip, 0.08, false);
        }
      }
    }
    this.moveChips(quick, now);
    this.dressTable();
    this.skin.setting?.place?.(model, (seat) => this.row(seat), this.layout, quick);
    if (quick) this.finish();
    if (!this.tweens.length) this.settle();
    else if (removed) this.showPlaques(false);
  }
  private tween(
    mesh: T.Mesh,
    start: number,
    duration: number,
    to: T.Vector3,
    fromFlip: number,
    toFlip: number,
    lift: number,
    contact: boolean,
    done?: () => void,
  ) {
    this.tweens.push({ mesh, start, duration, from: mesh.position.clone(), to: to.clone(), fromFlip, toFlip, lift, contact, done });
  }
  /** Shows or removes the cover that hides a card until the person slides it off. */
  private setCover(
    id: number,
    entry: { mesh: T.Mesh; cover: T.Mesh | null },
    covered: boolean,
    quick: boolean,
  ) {
    if (covered && !entry.cover) {
      const rich = this.rich,
        cover = rich
          ? new T.Mesh(new T.PlaneGeometry(this.skin.width, this.skin.height, 6, 9), rich.cover)
          : new T.Mesh(this.coverGeometry, this.back);
      cover.rotation.x = -Math.PI / 2;
      cover.position.y = rich ? rich.body.thickness / 2 + 0.002 : 0.014;
      cover.userData.id = id;
      entry.mesh.add(cover);
      entry.cover = cover;
    } else if (!covered && entry.cover) {
      const cover = entry.cover;
      entry.cover = null;
      if (this.drag?.id === id) this.drag = null;
      const gone = () => {
        entry.mesh.remove(cover);
        if (this.rich) cover.geometry.dispose();
      };
      // The cover slides the rest of the way off toward the player.
      if (quick) gone();
      else
        this.slides.push({
          cover,
          start: performance.now(),
          from: cover.position.z,
          to: this.skin.height * 1.15,
          done: gone,
        });
    }
  }
  /**
   * The livelier table's cover peels up as it is pushed off, as a card squeezed open: its far edge lifts, the far
   * right corner most, the further it has gone.
   */
  private curl(cover: T.Mesh) {
    if (!this.rich) return;
    const w = this.skin.width,
      h = this.skin.height,
      q = Math.max(0, Math.min(1, cover.position.z / (h * 1.05))),
      at = cover.geometry.getAttribute("position") as T.BufferAttribute;
    for (let i = 0; i < at.count; i++) {
      // In the cover's own plane y runs to the far side of the table and z up from it.
      const far = at.getY(i) / h + 0.5,
        right = at.getX(i) / w + 0.5;
      at.setZ(i, q * (0.04 + 0.42 * far * far * (0.5 + 0.5 * right)));
    }
    at.needsUpdate = true;
    cover.geometry.computeVertexNormals();
    cover.geometry.boundingSphere = null;
  }
  /** Sliding a cover with the pointer: down the table, toward seat 0. */
  private bindCovers() {
    const canvas = this.renderer.domElement;
    const spot = (e: PointerEvent) => {
      aim(this.ray, e, canvas, this.camera);
      const hit = new T.Vector3();
      return this.ray.ray.intersectPlane(this.plane, hit) ? hit : null;
    };
    /** The offered card or deck under the pointer: a card id, null for the deck. */
    const offered = (e: PointerEvent): number | null | undefined => {
      if (!spot(e)) return undefined;
      for (const id of this.choices) {
        const card = this.cards.get(id);
        if (card && this.ray.intersectObject(card.mesh, false).length) return id;
      }
      return this.deckOpen && this.ray.intersectObject(this.deck, false).length ? null : undefined;
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (this.disposed || this.drag || (e.pointerType === "mouse" && e.button !== 0)) return;
      const covers = [...this.cards.values()].flatMap((c) => (c.cover ? [c.cover] : []));
      if (!spot(e)) return;
      const hit = this.ray.intersectObjects(covers)[0];
      if (!hit) {
        const id = offered(e);
        this.tap = id === undefined ? null : { id, pointer: e.pointerId, x: e.clientX, y: e.clientY };
        return;
      }
      const cover = hit.object as T.Mesh,
        at = spot(e)!;
      this.slides = this.slides.filter((s) => s.cover !== cover);
      this.drag = { id: cover.userData.id as number, cover, pointer: e.pointerId, from: at.z - cover.position.z };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.drag && e.pointerType === "mouse")
        canvas.style.cursor = offered(e) === undefined ? "" : "pointer";
      if (!this.drag || this.drag.pointer !== e.pointerId) return;
      const at = spot(e);
      if (!at) return;
      this.drag.cover.position.z = Math.max(0, Math.min(this.skin.height * 1.05, at.z - this.drag.from));
      this.curl(this.drag.cover);
      this.dirty = true;
    });
    const release = (e: PointerEvent) => {
      const tap = this.tap;
      if (tap?.pointer === e.pointerId) {
        this.tap = null;
        // A tap, not a drag: the pointer came up where it went down.
        if (
          e.type === "pointerup" &&
          Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 12 &&
          offered(e) === tap.id
        ) {
          if (tap.id === null) this.onDeck();
          else this.onCard(tap.id);
        }
        return;
      }
      if (!this.drag || this.drag.pointer !== e.pointerId) return;
      const { id, cover } = this.drag;
      this.drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      // Past half way counts as looking; otherwise the cover springs back.
      if (cover.position.z > this.skin.height * 0.5) this.onPeek(id);
      else this.slides.push({ cover, start: performance.now(), from: cover.position.z, to: 0 });
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
  }
  /**
   * Offers seat 0's cards `ids` (and the deck) to be tapped; `picked` are the
   * ones already chosen, which lie a little further up the table.
   */
  setChoices(ids: number[], picked: number[], deck: boolean) {
    if (this.disposed) return;
    this.choices = new Set(ids);
    this.deckOpen = deck;
    if (!ids.length && !deck) this.renderer.domElement.style.cursor = "";
    this.dressHalos();
    if (picked.length === this.picked.size && picked.every((id) => this.picked.has(id))) return;
    this.picked = new Set(picked);
    this.sync(this.model);
  }
  /** Where a seat's chips enter and leave the table. */
  private chipSpot(seat: number) {
    const { x, z, scale } = this.row(seat),
      reach = (this.skin.height * scale) / 2 + 0.55;
    if (this.layout.inward) {
      // Toward the pot from wherever the seat sits round the table.
      const pot = this.potSpot(),
        way = new T.Vector3(pot.x - x, 0, pot.z - z);
      return way.lengthSq() > 1e-6 ? way.setLength(Math.min(reach, way.length())).add(new T.Vector3(x, 0.05, z)) : pot;
    }
    return new T.Vector3(x, 0.05, seat === 0 ? z - reach : z + reach);
  }
  /**
   * Where a pot that is won lies until the next hand: beside the winner's cards on the side toward the middle of
   * the table (mine at their right), clear of the row and its labels; `spread` is half the pile's width.
   */
  private wonSpot(seat: number, spread: number) {
    const { x, z, width, scale } = this.row(seat),
      n = Math.max(1, this.model.seats[seat]?.cards.length ?? 1),
      reach = (this.skin.width * scale + this.gap(n, width, scale) * (n - 1)) / 2,
      side = Math.abs(x) < 0.01 ? 1 : -Math.sign(x);
    return new T.Vector3(x + side * (reach + 0.3 + spread), 0.05, z);
  }
  private potSpot() {
    return new T.Vector3(this.layout.pot?.x ?? 0, 0.05, this.layout.pot?.z ?? POT_Z);
  }
  /** Chips fly to the pot when a seat bets and from it when the pot is paid. */
  private moveChips(quick: boolean, now: number) {
    if (this.rich) return this.slideChips(quick, now);
    const model = this.model,
      pot = this.potSpot(),
      fly = (from: T.Vector3, to: T.Vector3, amount: number, delay: number) => {
        const count = Math.min(4, Math.max(1, Math.round(amount / 100)));
        for (let i = 0; i < count; i++) {
          const kind = amount >= 500 ? 0 : amount >= 100 ? 1 : amount >= 50 ? 2 : 3,
            chip = new T.Mesh(this.chipGeometry, this.chipMaterials[kind]);
          chip.position.copy(from);
          chip.rotation.y = Math.PI / 2;
          chip.castShadow = true;
          chip.visible = false;
          this.flights.add(chip);
          this.tweens.push({
            mesh: chip,
            start: now + delay + i * 70,
            duration: 380,
            from: from.clone(),
            to: to.clone().add(new T.Vector3((i - (count - 1) / 2) * 0.12, 0, 0)),
            fromFlip: 0,
            toFlip: 0,
            lift: 0.7,
            contact: false,
            done: () => this.flights.remove(chip),
          });
        }
      };
    let moved = false;
    if (!quick) {
      model.seats.forEach((seat, s) => {
        const before = this.lastBets[s] ?? 0,
          // A smaller figure means a new hand began: the whole stake is new.
          added = seat.bet < before ? seat.bet : seat.bet - before;
        if (added > 0 && model.pot > 0) {
          fly(this.chipSpot(s), pot, added, 0);
          moved = true;
        }
      });
      if (this.lastPot > 0 && model.pot === 0) {
        const winners = model.seats.flatMap((seat, s) => (seat.tone === "win" ? [s] : []));
        winners.forEach((s) => fly(pot, this.chipSpot(s), this.lastPot / winners.length, 250));
        moved ||= winners.length > 0;
      }
    } else this.flights.clear();
    this.lastBets = model.seats.map((seat) => seat.bet);
    this.lastPot = model.pot;
    if (moved) this.onChips();
  }
  /**
   * The livelier table's chips: a bet slides across the cloth chip by chip and joins the pot's stacks as it lands;
   * a pot that is won slides over to its winner as it stands and lies there until the next hand is anted.
   */
  private slideChips(quick: boolean, now: number) {
    const rich = this.rich!,
      model = this.model,
      pot = this.potSpot();
    if (quick) {
      this.flights.clear();
      rich.won.clear();
      rich.potLate = false;
    } else {
      let incoming = 0,
        order = 0;
      // The pot as it stood before these chips, for its stacks to be drawn when they land.
      const before = this.lastPot,
        target = model.pot;
      if (model.pot > 0 && rich.won.children.length) rich.won.clear();
      model.seats.forEach((seat, s) => {
        const was = this.lastBets[s] ?? 0,
          added = seat.bet < was ? seat.bet : seat.bet - was;
        if (!(added > 0 && model.pot > 0)) return;
        const kinds: number[] = [];
        let rest = added;
        for (const [kind, chip] of CHIPS.entries())
          while (rest >= chip.value && kinds.length < 6) {
            rest -= chip.value;
            kinds.push(kind);
          }
        if (!kinds.length) kinds.push(CHIPS.length - 1);
        const from = this.chipSpot(s),
          delay = order++ * 90;
        kinds.forEach((kind, i) => {
          const chip = new T.Mesh(this.chipGeometry, this.chipMaterials[kind]),
            to = pot.clone().add(new T.Vector3((scatter(s, i) - 0.5) * 0.7, 0.02, (scatter(i, s + 5) - 0.5) * 0.3));
          chip.position.copy(from).add(new T.Vector3(0, i * 0.06, 0));
          chip.rotation.y = scatter(s + 11, i) * Math.PI * 2;
          chip.castShadow = true;
          chip.visible = false;
          this.flights.add(chip);
          incoming++;
          this.tweens.push({
            mesh: chip,
            start: now + delay + i * 60,
            duration: 430,
            from: chip.position.clone(),
            to,
            fromFlip: 0,
            toFlip: 0,
            lift: 0.1,
            contact: false,
            flick: true,
            done: () => {
              this.flights.remove(chip);
              if (--incoming > 0) return;
              rich.potLate = false;
              this.stackPot(target);
            },
          });
        });
      });
      if (incoming) rich.potLate = true;
      if (before > 0 && model.pot === 0) {
        const winners = model.seats.flatMap((seat, s) => (seat.tone === "win" ? [s] : []));
        if (winners.length) {
          // The stacks themselves are pushed over to the winner, split between winners chip by chip.
          const centre = pot.clone(),
            chips = [...this.chips.children] as T.Mesh[],
            spread = chips.reduce((most, chip) => Math.max(most, Math.abs(chip.position.x - centre.x)), 0) * 0.75 + 0.24;
          this.chips.clear();
          chips.forEach((chip, k) => {
            const to = this.wonSpot(winners[k % winners.length], spread).add(
              new T.Vector3((chip.position.x - centre.x) * 0.75, chip.position.y - 0.05, (chip.position.z - centre.z) * 0.75),
            );
            rich.won.add(chip);
            this.tweens.push({
              mesh: chip,
              // Once every hand shown down lies face up.
              start: now + 280 + this.revealed + Math.floor(k / 10) * 40,
              duration: 620,
              from: chip.position.clone(),
              to,
              fromFlip: 0,
              toFlip: 0,
              lift: 0.04,
              contact: false,
              flick: true,
            });
          });
          if (chips.length) this.onChips();
        }
      }
      if (incoming) this.onChips();
    }
    this.lastBets = model.seats.map((seat) => seat.bet);
    this.lastPot = model.pot;
  }
  private step(now: number) {
    if (this.slides.length) {
      this.slides = this.slides.filter((s) => {
        const p = Math.min(1, (now - s.start) / 220);
        s.cover.position.z = s.from + (s.to - s.from) * p * (2 - p);
        this.curl(s.cover);
        if (p < 1) return true;
        s.done?.();
        return false;
      });
      this.dirty = true;
      if (!this.slides.length && !this.tweens.length) this.settle();
    }
    if (!this.tweens.length) return false;
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      t.mesh.visible = true;
      const e = t.flick ? outCubic(p) : p * p * (3 - 2 * p);
      t.mesh.position.lerpVectors(t.from, t.to, e);
      t.mesh.position.y += Math.sin(Math.PI * (t.flick ? e : p)) * t.lift;
      if (t.bow) {
        // Sideways from the way it goes, most in the middle of it.
        const dx = t.to.x - t.from.x,
          dz = t.to.z - t.from.z,
          length = Math.hypot(dx, dz) || 1,
          side = Math.sin(Math.PI * e) * t.bow;
        t.mesh.position.x += (-dz / length) * side;
        t.mesh.position.z += (dx / length) * side;
      }
      if (t.yaw !== undefined) t.mesh.rotation.y = t.yaw * (1 - e) * (1 - e);
      t.mesh.rotation.z = t.fromFlip + (t.toFlip - t.fromFlip) * e;
      // A thing in the air leans into its flight and lies flat again as it lands.
      if (t.lift > 0 && Math.abs(t.mesh.rotation.x) < 0.5) t.mesh.rotation.x = Math.sin(Math.PI * p) * 0.2;
      if (p < 1) return true;
      if (t.contact) this.onContact();
      t.done?.();
      return false;
    });
    if (!this.tweens.length) this.settle();
    return true;
  }
  private finish() {
    for (const t of this.tweens) {
      t.mesh.position.copy(t.to);
      t.mesh.rotation.z = t.toFlip;
      if (t.yaw !== undefined) t.mesh.rotation.y = 0;
      if (this.rich) {
        t.mesh.rotation.x = 0;
        t.mesh.visible = true;
      }
      t.done?.();
    }
    this.tweens = [];
    for (const s of this.slides) {
      s.cover.position.z = s.to;
      s.done?.();
    }
    this.slides = [];
  }
  private settle() {
    this.showPlaques(true);
    this.dirty = true;
    this.onSettled();
  }
  /** The pot and the outline of the seat to act follow the table at once. */
  private dressTable() {
    // On the livelier table chips on their way to the pot join its stacks when they land.
    if (!this.rich?.potLate) this.stackPot();
    const active = this.model.seats.findIndex((seat) => seat.active);
    this.glow.visible = active >= 0;
    if (active >= 0) {
      const { x, z, width, scale } = this.row(active),
        n = Math.max(1, this.model.seats[active].cards.length),
        w = this.skin.width * scale;
      this.glow.scale.set(
        (w + this.gap(n, width, scale) * (n - 1)) * 1.32 + 0.5,
        this.skin.height * scale * 1.5,
        1,
      );
      this.glow.position.set(x, 0.006, z);
    }
    this.dressHalos();
  }
  /** The cards offered for a choice get a gold halo on the cloth round them (the livelier table only). */
  private dressHalos() {
    const rich = this.rich;
    if (!rich) return;
    for (const [id, card] of this.cards) {
      const halo = card.mesh.children.find((child) => child.userData.halo) as T.Mesh | undefined,
        offered = this.choices.has(id) && card.faceUp;
      if (offered && !halo) {
        const mesh = new T.Mesh(rich.haloGeometry, rich.halo);
        mesh.userData.halo = true;
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = -rich.body.thickness / 2 - 0.0015;
        card.mesh.add(mesh);
      } else if (!offered && halo) card.mesh.remove(halo);
    }
    if (!rich.pulse) rich.halo.opacity = 1;
    this.dirty = true;
  }
  /** The pot (`amount`) as one stack for each kind of chip. */
  private stackPot(amount = this.model.pot) {
    this.chips.clear();
    // One stack for each kind of chip, side by side; a tall stack goes on in a second one beside it.
    const STACK = 10,
      stacks: { kind: number; count: number }[] = [];
    let rest = amount;
    for (const [kind, chip] of CHIPS.entries()) {
      let count = Math.floor(rest / chip.value);
      rest %= chip.value;
      for (; count > 0; count -= STACK) stacks.push({ kind, count: Math.min(STACK, count) });
    }
    stacks.forEach((stack, column) => {
      for (let i = 0; i < stack.count; i++) {
        const mesh = new T.Mesh(this.chipGeometry, this.chipMaterials[stack.kind]);
        mesh.position.set((this.layout.pot?.x ?? 0) + (column - (stacks.length - 1) / 2) * 0.56, 0.035 + i * 0.062, this.layout.pot?.z ?? POT_Z);
        mesh.rotation.y = Math.PI / 2;
        if (this.rich) {
          // Stacked by hand: each chip turned and set down a hair off the one below.
          mesh.position.y = 0.03 + i * 0.0605;
          mesh.position.x += (scatter(column, i) - 0.5) * 0.025;
          mesh.position.z += (scatter(i, column + 7) - 0.5) * 0.025;
          // The top chip of a stack lies with its value the right way up for me.
          mesh.rotation.y = i === stack.count - 1 ? (scatter(column, 9) - 0.5) * 0.5 : scatter(column + 3, i) * Math.PI * 2;
        }
        mesh.castShadow = true;
        this.chips.add(mesh);
      }
    });
    this.dirty = true;
  }
  private showPlaques(current: boolean) {
    this.plaques.clear();
    if (!current) return;
    const add = (text: string, tone: Tone, x: number, z: number, scale: number) => {
      if (!text) return;
      const key = `${tone}|${text}`;
      let material = this.plaqueMaterials.get(key);
      if (!material) {
        material = this.own(
          new T.MeshBasicMaterial({
            map: this.own(plaqueTexture(text, tone)),
            transparent: true,
            depthWrite: false,
          }),
        );
        this.plaqueMaterials.set(key, material);
      }
      const mesh = new T.Mesh(this.plaqueGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.setScalar(scale);
      mesh.position.set(x, 0.008, z);
      this.plaques.add(mesh);
    };
    this.model.seats.forEach((seat, s) => {
      const { x, z, scale } = this.row(s),
        reach = (this.skin.height * scale) / 2 + 0.34 * Math.max(0.8, scale);
      // The name and what the seat holds (its hand) are two labels: across the table the name lies beyond the row and the hand on the near side of it.
      const size = s === 0 ? 1 : Math.max(0.72, scale);
      const note = !seat.out && seat.note ? seat.note : "";
      if (s === 0) {
        // Mine stand one under the other below my row (the pot's label lies above it): the name, then the hand.
        add(seat.out ? `${seat.name} · 탈락` : seat.name, seat.tone, x, z + reach, size);
        add(note, seat.tone, x, z + reach + 0.5 * size, size);
      } else {
        add(seat.out ? `${seat.name} · 탈락` : seat.name, seat.tone, x, z - reach, size);
        add(note, seat.tone, x, z + reach, size);
      }
    });
    if (this.model.pot > 0)
      add(`판돈 ${this.model.pot.toLocaleString("ko-KR")}`, "neutral", this.layout.pot?.x ?? 0, this.layout.pot?.label ?? POT_LABEL_Z, 0.8);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.tweens = [];
    for (const resource of this.owned) resource.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
