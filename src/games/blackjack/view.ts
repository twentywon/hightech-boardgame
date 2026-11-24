import { CARD, drawBack, drawFace } from "../cards/faces";
import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { afterGPUFrame, aim, block, capable, glossy, wood, realism, weave } from "../../engine/scene-utils";
import { FOV, SUBJECTS, cameraDistance } from "../../engine/camera";
import type { Card } from "./shoe";
import { zoomable } from "../../engine/zoom";

/** A card on the table; `face` is null while it lies face down. */
export interface TableCard {
  id: number;
  face: Card | null;
}
export type Tone = "neutral" | "win" | "lose" | "push";
export interface TableHand {
  cards: TableCard[];
  bet: number;
  active: boolean;
  /** Total or result, already worded by the UI. Empty hides the plaque. */
  label: string;
  tone: Tone;
  /**
   * What the hand came to once the round is settled: above 0 the dealer pays
   * that much beside the stake, below 0 the stake goes to the dealer, 0 leaves
   * it standing. Absent while the hand is played.
   */
  net?: number;
}
/** Everything the table shows. The view knows no rules; it draws this. */
export interface TableModel {
  dealer: TableCard[];
  dealerLabel: string;
  hands: TableHand[];
  /** Stake shown in the betting circle before any hand exists. */
  stake: number;
  /** How full the shoe is, 0 to 1 (absent: full). The discard holder holds what has been played. */
  shoe?: number;
}

const CARD_W = CARD.width,
  CARD_H = CARD.height,
  CARD_T = 0.014,
  /** The cards of six decks, for the depth of the shoe and the discard pile. */
  SHOE_CARDS = 312;
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
const TONE_COLOR: Record<Tone, string> = {
  neutral: "#f6f0e0",
  win: "#f6d77e",
  lose: "#f4b2a2",
  push: "#dfe9df",
};
/** The chips, largest first: body, the inserts round the edge, the inlay's ink. */
const CHIPS = [
  { value: 100, color: "#1d1f23", stripe: "#efe8d6", ink: "#1d1f23" },
  { value: 50, color: "#c3402a", stripe: "#f6efe0", ink: "#b13823" },
  { value: 10, color: "#ece3cc", stripe: "#2b6a55", ink: "#f2ead6" },
  { value: 5, color: "#2c5aa0", stripe: "#f4efe2", ink: "#244f90" },
] as const;
const CHIP_R = 0.24,
  CHIP_H = 0.058,
  /** A stack goes on in a second column beyond this many chips. */
  COLUMN = 10;
/** A small fixed scatter, so that no two chips in a stack lie quite alike. */
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (p: number) => p * p * (3 - 2 * p);
const outCubic = (p: number) => 1 - (1 - p) ** 3;
/** The kinds of chip that make up `amount`, largest first (what is below the smallest chip is not shown). */
function breakdown(amount: number) {
  const kinds: number[] = [];
  let rest = Math.max(0, Math.round(amount));
  for (const [kind, chip] of CHIPS.entries())
    while (rest >= chip.value) {
      rest -= chip.value;
      kinds.push(kind);
    }
  return kinds;
}

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
function roundRect(
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
/** A pseudo-random stream, the same every time (the felt's nap, the carpet). */
function stream(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function faceTexture(card: Card | null) {
  const { c, ctx } = canvas(...CARD.pixels);
  if (card) drawFace(ctx, c.width, c.height, card.rank + card.suit);
  else {
    ctx.fillStyle = "#fbf8f0";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return texture(c);
}
function backTexture() {
  const { c, ctx } = canvas(...CARD.pixels);
  drawBack(ctx, c.width, c.height);
  return texture(c);
}
/** The edges of many cards pressed together: cream with fine grey lines. */
function edgesTexture() {
  const { c, ctx } = canvas(64, 256);
  ctx.fillStyle = "#efe8d8";
  ctx.fillRect(0, 0, 64, 256);
  const rand = stream(11);
  for (let y = 0; y < 256; y += 2) {
    ctx.fillStyle = `rgba(80, 70, 55, ${0.05 + rand() * 0.12})`;
    ctx.fillRect(0, y, 64, 1);
  }
  const t = texture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/**
 * A playing card with rounded corners and a little thickness: the face on
 * top (group 0), the back below (group 1), the paper edge round it (group 2).
 */
function cardGeometry() {
  const w = CARD_W,
    h = CARD_H,
    r = 0.075,
    shape = new T.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w / 2, h / 2 - r);
  shape.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  const geometry = new T.ExtrudeGeometry(shape, { depth: CARD_T, bevelEnabled: false, curveSegments: 4 });
  // The caps come first, the bottom one before the top one; the sides follow.
  const [caps, sides] = geometry.groups,
    half = caps.count / 2,
    uv = geometry.getAttribute("uv"),
    at = geometry.getAttribute("position");
  for (let i = caps.start; i < caps.start + caps.count; i++) uv.setXY(i, at.getX(i) / w + 0.5, at.getY(i) / h + 0.5);
  geometry.clearGroups();
  geometry.addGroup(caps.start + half, half, 0);
  geometry.addGroup(caps.start, half, 1);
  geometry.addGroup(sides.start, sides.count, 2);
  geometry.translate(0, 0, -CARD_T / 2);
  // The shape's plane becomes the table's: its y runs to the far side, the thickness up.
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
function plaqueTexture(text: string, tone: Tone) {
  const { c, ctx } = canvas(640, 128);
  const fill = ctx.createLinearGradient(0, 6, 0, 122);
  fill.addColorStop(0, "rgba(14, 22, 20, 0.9)");
  fill.addColorStop(1, "rgba(4, 12, 10, 0.9)");
  ctx.fillStyle = fill;
  roundRect(ctx, 6, 6, 628, 116, 58);
  ctx.fill();
  ctx.strokeStyle = tone === "neutral" ? "rgba(214, 184, 112, 0.75)" : TONE_COLOR[tone];
  ctx.lineWidth = tone === "neutral" ? 4 : 6;
  ctx.stroke();
  // A faint sheen along the top, as on a polished plaque.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 3;
  roundRect(ctx, 16, 14, 608, 50, 26);
  ctx.stroke();
  ctx.fillStyle = TONE_COLOR[tone];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 70;
  do {
    ctx.font = `800 ${size}px ${FONT}`;
    size -= 4;
  } while (ctx.measureText(text).width > 560 && size > 26);
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 6;
  ctx.fillText(text, 320, 68);
  return texture(c);
}
/** A casino carpet: deep wine with a gold rosette and teal leaves between. */
function carpetTexture() {
  const { c, ctx } = canvas(512, 512);
  ctx.fillStyle = "#3a0e18";
  ctx.fillRect(0, 0, 512, 512);
  const rand = stream(3);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(255, 210, 190, 0.035)" : "rgba(0, 0, 0, 0.09)";
    ctx.fillRect(rand() * 512, rand() * 512, 2, 2);
  }
  const rosette = (x: number, y: number, r: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "rgba(196, 150, 76, 0.42)";
    ctx.fillStyle = "rgba(186, 138, 62, 0.36)";
    ctx.lineWidth = 4;
    for (let k = 0; k < 8; k++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(r * 0.55, 0, r * 0.42, r * 0.17, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
    ctx.setLineDash([6, 10]);
    ctx.stroke();
    ctx.restore();
  };
  rosette(128, 128, 84);
  rosette(384, 384, 84);
  // Teal leaves in the other two quarters, and over the seams so that the tiles join.
  ctx.fillStyle = "rgba(34, 92, 86, 0.32)";
  for (const [x, y] of [[384, 128], [128, 384]])
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((k * Math.PI) / 2 + Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(0, -34, 14, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  ctx.fillStyle = "rgba(196, 150, 76, 0.4)";
  for (const [x, y] of [[0, 0], [256, 256], [512, 0], [0, 512], [512, 512], [256, 0], [0, 256], [512, 256], [256, 512]]) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = texture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(46, 46);
  return t;
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
/** The betting spot printed on the felt: two gold rings with a band of small diamonds between. */
function spotTexture() {
  const { c, ctx } = canvas(256, 256);
  ctx.strokeStyle = "rgba(226, 196, 120, 0.85)";
  ctx.lineWidth = 4;
  for (const r of [122, 104]) {
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(226, 196, 120, 0.7)";
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    ctx.save();
    ctx.translate(128 + Math.cos(a) * 113, 128 + Math.sin(a) * 113);
    ctx.rotate(a + Math.PI / 4);
    ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
    ctx.restore();
  }
  return texture(c);
}
/** The face of a chip: its colour, inserts round the rim, a dashed ring and a printed inlay with the value. */
function chipTop(chip: (typeof CHIPS)[number]) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = chip.color;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = chip.stripe;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(128, 128, 128, a - 0.2, a + 0.2);
    ctx.arc(128, 128, 98, a + 0.2, a - 0.2, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = chip.stripe;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(128, 128, 86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = chip.value === 10 ? chip.stripe : "#f3ecdb";
  ctx.beginPath();
  ctx.arc(128, 128, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = chip.value === 10 ? "#f3ecdb" : chip.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(128, 128, 62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = chip.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '800 70px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(String(chip.value), 128, 133);
  return texture(c);
}
/** The rim of a chip: its colour with six inserts, matching the face. */
function chipSide(chip: (typeof CHIPS)[number]) {
  const { c, ctx } = canvas(384, 16);
  ctx.fillStyle = chip.color;
  ctx.fillRect(0, 0, 384, 16);
  ctx.fillStyle = chip.stripe;
  for (let k = 0; k < 6; k++) ctx.fillRect(k * 64 + 20, 0, 24, 16);
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(0, 0, 384, 1);
  ctx.fillRect(0, 15, 384, 1);
  return texture(c);
}
/** A roll of chips lying in the tray: the rims of `count` chips, each turned a little, with a dark line between. */
function rollSide(chip: (typeof CHIPS)[number], count: number) {
  const { c, ctx } = canvas(128, count * 16);
  const rand = stream(chip.value);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = chip.color;
    ctx.fillRect(0, i * 16, 128, 16);
    ctx.fillStyle = chip.stripe;
    const turn = rand() * 21;
    for (let k = 0; k < 6; k++) ctx.fillRect((k * 21.3 + turn) % 128, i * 16, 8, 16);
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, i * 16, 128, 1.5);
  }
  return texture(c);
}
/**
 * A box drawn in as few passes as it can: its `face`-th side (in `BoxGeometry`'s order) takes material 1, the
 * other five material 0.
 */
function oneFace(geometry: T.BoxGeometry, face: number) {
  const groups = geometry.groups.map((g) => ({ ...g }));
  geometry.clearGroups();
  const runs: { start: number; count: number; material: number }[] = [];
  groups.forEach((g, i) => {
    const material = i === face ? 1 : 0,
      last = runs[runs.length - 1];
    if (last && last.material === material && last.start + last.count === g.start) last.count += g.count;
    else runs.push({ start: g.start, count: g.count, material });
  });
  for (const run of runs) geometry.addGroup(run.start, run.count, run.material);
  return geometry;
}
/** A little relief for the padded rail's vinyl, where a graphics card draws. */
function grainTexture() {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 256, 256);
  const rand = stream(5);
  for (let i = 0; i < 7000; i++) {
    const v = 100 + Math.floor(rand() * 60);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(rand() * 256, rand() * 256, 0.6 + rand() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

/** A movement drawn frame by frame: `apply` poses its thing at `p` (0 to 1) of its time. */
interface Tween {
  start: number;
  duration: number;
  apply: (p: number) => void;
  /** Called when it arrives (a card or a chip touching down). */
  contact?: () => void;
  done?: () => void;
}
interface Pose {
  at: T.Vector3;
  yaw: number;
  /** The shoe and the discard holder are drawn smaller on the narrow table. */
  scale: number;
}
interface Layout {
  subject: (typeof SUBJECTS)["blackjackWide" | "blackjackTall"];
  dealerZ: number;
  playerZ: number;
  /** Centre x of each hand, by number of hands. */
  hands: Record<1 | 2, number[]>;
  /** Widest a row of cards may spread, by number of hands. */
  width: Record<1 | 2, number>;
  shoe: Pose;
  discard: Pose;
  /** How large the printed lettering is. */
  print: number;
  rail: number;
  /** The dealer's chip tray: width and how many rolls of chips. */
  tray: { width: number; rolls: number };
}
const LAYOUTS: Record<"wide" | "tall", Layout> = {
  wide: {
    subject: SUBJECTS.blackjackWide,
    dealerZ: -1.55,
    playerZ: 0.9,
    hands: { 1: [0], 2: [-2.15, 2.15] },
    width: { 1: 4.8, 2: 3.7 },
    shoe: { at: new T.Vector3(3.28, 0, -1.62), yaw: -0.45, scale: 0.9 },
    discard: { at: new T.Vector3(-3.28, 0, -1.62), yaw: 0.45, scale: 0.9 },
    print: 1,
    rail: 0.42,
    tray: { width: 3.3, rolls: 8 },
  },
  tall: {
    subject: SUBJECTS.blackjackTall,
    dealerZ: -1.5,
    playerZ: 0.9,
    hands: { 1: [0], 2: [-1.4, 1.4] },
    width: { 1: 4.8, 2: 2.3 },
    shoe: { at: new T.Vector3(1.93, 0, -2.5), yaw: -0.2, scale: 0.8 },
    discard: { at: new T.Vector3(-1.93, 0, -2.5), yaw: 0.2, scale: 0.8 },
    print: 0.82,
    rail: 0.3,
    tray: { width: 2.2, rolls: 6 },
  },
};
/** The far (dealer's) edge of the felt and its near edge in the middle; the rest of the outline follows from them. */
const FAR = -3.62,
  NEAR = 3.52,
  /** The near edge is a wide arc about a point far behind the dealer, rounded into the sides. */
  ARC_R = 9,
  CORNER_R = 1.2,
  /** The printed arcs are drawn about a point behind the dealer. */
  PRINT_Z = -4.2;
/** Where the betting spot of a hand at `x` lies: on an arc, a little nearer the dealer at the sides. */
const spotZ = (layout: Layout, x: number) => layout.playerZ + 1.85 - 0.06 * x * x;
/** Shoe parts, in its own frame (the mouth faces +z), before its scale. */
const SHOE = { width: 1.2, length: 1.7, back: 0.62, front: 0.16, slope: 0.22 };

export class BlackjackView {
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
  private model: TableModel = { dealer: [], dealerLabel: "", hands: [], stake: 0 };
  private cards = new Map<number, { mesh: T.Mesh; faceUp: boolean }>();
  /** Cards on their way: the view is busy until they are down. */
  private tweens: Tween[] = [];
  /** Chips on their way: decoration that never holds up the game. */
  private chipTweens: Tween[] = [];
  private owned: { dispose(): void }[] = [];
  private cardGeometry = this.own(cardGeometry());
  private edge = this.own(new T.MeshStandardMaterial({ color: "#f1ebdd", roughness: 0.8 }));
  private back: T.MeshStandardMaterial;
  private blank: T.MeshStandardMaterial;
  private faces = new Map<string, T.MeshStandardMaterial>();
  private plaqueGeometry = this.own(new T.PlaneGeometry(2.2, 0.44));
  private plaqueMaterials = new Map<string, T.MeshBasicMaterial>();
  private plaques = new T.Group();
  private chips = new T.Group();
  private chipGeometry = this.own(new T.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 36));
  private chipMaterials: T.Material[][] = [];
  /** The stacks on the felt, by "bet:<hand>" and "win:<hand>". */
  private piles = new Map<string, { kinds: number[]; meshes: T.Mesh[]; x: number; z: number }>();
  private glow: T.Mesh;
  private glowMaterial: T.MeshBasicMaterial;
  private tables!: Record<"wide" | "tall", T.Group>;
  private trays!: Record<"wide" | "tall", { z: number; rolls: { x: number; kind: number }[] }>;
  private shoe = new T.Group();
  private shoeDeck: T.Mesh;
  private discard = new T.Group();
  private discardPile: T.Mesh;
  private rings = new T.Group();
  private ringGeometry = this.own(new T.PlaneGeometry(1, 1));
  private ringMaterial: T.MeshBasicMaterial;
  private reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** Small idle life (the glow round the hand in play breathes) only where a graphics card draws. */
  private lively = capable() && !this.reducedMotion;
  /** A card touched the felt. */
  onContact: () => void = () => {};
  /** Chips touched down on the felt. */
  onChips: () => void = () => {};
  /** The person tapped the shoe. */
  onShoe: () => void = () => {};
  /** Every animation finished and the plaques show the current model. */
  onSettled: () => void = () => {};
  get animating() {
    return this.tweens.length > 0;
  }
  get ready() {
    return this.readyFlag;
  }
  private own<X extends { dispose(): void }>(resource: X) {
    this.owned.push(resource);
    return resource;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
  ) {
    this.renderer = zoomable(new T.WebGLRenderer({ antialias: true, alpha: false }));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#2a0a12");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    // The table is described in text beside it; the canvas itself is decorative.
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    // The lamps over the table pour a warm pool on the felt and the room beyond falls into shadow, where a
    // graphics card draws; under software rendering one more light cost frames, and the felt's own picture is
    // lighter in the middle all the same.
    const pooled = capable();
    this.scene.add(new T.HemisphereLight("#fff4dc", "#2a1a1c", pooled ? 1.9 : 2.4));
    const light = new T.DirectionalLight("#fff6e2", pooled ? 2.1 : 2.6);
    light.position.set(-3, 9, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -7;
    light.shadow.camera.right = 7;
    light.shadow.camera.top = 7;
    light.shadow.camera.bottom = -7;
    light.shadow.normalBias = 0.02;
    this.own(light.shadow);
    this.scene.add(light);
    if (pooled) {
      const pool = new T.SpotLight("#ffd9a0", 1.5, 0, 0.6, 0.75, 0);
      pool.position.set(0, 10, 0.4);
      pool.target.position.set(0, 0, -0.1);
      this.scene.add(pool, pool.target);
    }
    realism(this.renderer, this.scene);
    this.glowMaterial = this.own(
      new T.MeshBasicMaterial({ map: this.own(glowTexture()), transparent: true, depthWrite: false }),
    );
    this.glow = new T.Mesh(this.own(new T.PlaneGeometry(1, 1)), this.glowMaterial);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.visible = false;
    this.scene.add(this.glow);
    this.ringMaterial = this.own(
      new T.MeshBasicMaterial({ map: this.own(spotTexture()), transparent: true, depthWrite: false }),
    );
    this.back = this.own(new T.MeshStandardMaterial({ map: this.own(backTexture()), roughness: 0.5 }));
    this.blank = this.own(new T.MeshStandardMaterial({ map: this.own(faceTexture(null)), roughness: 0.5 }));
    for (const chip of CHIPS) {
      const flat = this.own(new T.MeshStandardMaterial({ map: this.own(chipTop(chip)), roughness: 0.45 }));
      const side = this.own(new T.MeshStandardMaterial({ map: this.own(chipSide(chip)), roughness: 0.5 }));
      this.chipMaterials.push([side, flat, flat]);
    }
    const wide = this.buildTable(LAYOUTS.wide),
      tall = this.buildTable(LAYOUTS.tall);
    this.tables = { wide: wide.table, tall: tall.table };
    this.trays = { wide: wide.tray, tall: tall.tray };
    this.scene.add(this.tables.wide, this.tables.tall);
    // The casino floor far below the table.
    const floor = new T.Mesh(
      this.own(new T.PlaneGeometry(120, 120)),
      this.own(new T.MeshStandardMaterial({ map: this.own(carpetTexture()), roughness: 1, ...weave(40, 40, (r) => this.own(r), 0.7) })),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.4;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.shoeDeck = this.buildShoe();
    this.discardPile = this.buildDiscard();
    this.scene.add(this.shoe, this.discard, this.plaques, this.chips, this.rings);
    // A tap on the shoe asks for the next card.
    const canvas = this.renderer.domElement,
      ray = new T.Raycaster();
    const onShoe = (e: PointerEvent) => {
      aim(ray, e, canvas, this.camera);
      return ray.intersectObject(this.shoe, true).length > 0;
    };
    let down: { pointer: number; x: number; y: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      down =
        !this.disposed && (e.pointerType !== "mouse" || e.button === 0) && onShoe(e)
          ? { pointer: e.pointerId, x: e.clientX, y: e.clientY }
          : null;
    });
    canvas.addEventListener("pointerup", (e) => {
      const tap = down;
      down = null;
      if (tap?.pointer === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 12 && onShoe(e))
        this.onShoe();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") canvas.style.cursor = onShoe(e) ? "pointer" : "";
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now(),
        moved = this.step(now);
      if (this.lively && this.glow.visible) {
        this.glowMaterial.opacity = 0.8 + 0.2 * Math.sin(now / 520);
        this.dirty = true;
      }
      if (!this.dirty && !moved) return;
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
  private faceMaterial(card: Card) {
    const key = card.rank + card.suit;
    let material = this.faces.get(key);
    if (!material) {
      material = this.own(new T.MeshStandardMaterial({ map: this.own(faceTexture(card)), roughness: 0.5 }));
      this.faces.set(key, material);
    }
    return material;
  }
  /**
   * The outline of the felt for `layout`, grown outwards by `grow`, as points
   * on the table (x, z): a straight edge on the dealer's side, straight sides,
   * and a wide arc round the players' side rounded into the sides.
   */
  private outline(layout: Layout, grow: number) {
    const hx = layout.subject.half - layout.rail - 0.05,
      centre = NEAR - ARC_R,
      cx = hx - CORNER_R,
      cz = centre + Math.sqrt((ARC_R - CORNER_R) ** 2 - cx * cx),
      turn = Math.atan2(cz - centre, cx),
      r = CORNER_R + grow,
      big = ARC_R + grow,
      points: [number, number][] = [
        [-(hx + grow), FAR - grow],
        [hx + grow, FAR - grow],
      ];
    for (let i = 0; i <= 10; i++) {
      const a = (turn * i) / 10;
      points.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
    for (let i = 1; i < 40; i++) {
      const a = turn + ((Math.PI - 2 * turn) * i) / 40;
      points.push([big * Math.cos(a), centre + big * Math.sin(a)]);
    }
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI - turn + (turn * i) / 10;
      points.push([-cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
    return points;
  }
  /** `points` as a path in a shape's own plane, where y is −z on the table. */
  private trace<P extends T.Path>(path: P, points: [number, number][]) {
    points.forEach(([x, z], i) => (i ? path.lineTo(x, -z) : path.moveTo(x, -z)));
    path.closePath();
    return path;
  }
  /**
   * The cloth of `layout`'s felt in one picture: the green, lighter where the
   * lamps fall, its nap, a gold line inside the edge and the house's rules
   * printed in two arcs between the dealer and the players.
   */
  private feltTexture(layout: Layout) {
    const hx = layout.subject.half - layout.rail,
      left = -hx,
      top = FAR - 0.1,
      wide = 2 * hx,
      deep = NEAR + 0.1 - top,
      scale = 120,
      { c, ctx } = canvas(Math.ceil(wide * scale), Math.ceil(deep * scale)),
      px = (x: number) => (x - left) * scale,
      pz = (z: number) => (z - top) * scale;
    const light = ctx.createRadialGradient(px(0), pz(-0.2), 0.3 * scale, px(0), pz(-0.2), 6.2 * scale);
    light.addColorStop(0, "#2c7d62");
    light.addColorStop(0.55, "#226a53");
    light.addColorStop(1, "#164a3b");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, c.width, c.height);
    const rand = stream(7),
      dots = Math.round(c.width * c.height * 0.012);
    for (let i = 0; i < dots; i++) {
      ctx.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
      ctx.fillRect(rand() * c.width, rand() * c.height, 1.5, 1.5);
    }
    const ink = "rgba(232, 208, 146, 0.82)";
    // A fine gold line just inside the edge, round the players' side.
    ctx.strokeStyle = "rgba(226, 196, 120, 0.45)";
    ctx.lineWidth = 0.025 * scale;
    ctx.beginPath();
    this.outline(layout, -0.2)
      .filter(([, z]) => z > FAR + 2.5)
      .forEach(([x, z], i) => (i ? ctx.lineTo(px(x), pz(z)) : ctx.moveTo(px(x), pz(z))));
    ctx.stroke();
    const size = layout.print,
      cx = px(0),
      cy = pz(PRINT_Z);
    /** Letters along an arc about the point behind the dealer, upright for the players. */
    const arcText = (text: string, radius: number, font: string, spacing = 0) => {
      ctx.font = font;
      const r = radius * scale,
        widths = [...text].map((ch) => ctx.measureText(ch).width + spacing * scale),
        span = widths.reduce((a, b) => a + b, 0) / r;
      let a = Math.PI / 2 + span / 2;
      ctx.fillStyle = ink;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      [...text].forEach((ch, i) => {
        const step = widths[i] / r;
        a -= step / 2;
        ctx.save();
        ctx.translate(cx + r * Math.cos(a), cy + r * Math.sin(a));
        ctx.rotate(a - Math.PI / 2);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        a -= step / 2;
      });
      return span;
    };
    const span = arcText("블랙잭은 3 : 2 로 지급합니다", 3.74, `800 ${0.28 * size * scale}px ${FONT}`, 0.03 * size);
    arcText("딜러는 16 이하에서 받고 17 이상에서 멈춥니다", 4.13, `600 ${0.15 * size * scale}px ${FONT}`, 0.012);
    // Two thin rules between the lines, ending in small diamonds.
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    const reach = span / 2 + 0.12;
    for (const [r, w] of [[3.93, 0.022], [3.975, 0.01]] as const) {
      ctx.lineWidth = w * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, Math.PI / 2 - reach, Math.PI / 2 + reach);
      ctx.stroke();
    }
    for (const side of [-1, 1]) {
      const a = Math.PI / 2 + side * (reach + 0.025);
      ctx.save();
      ctx.translate(cx + 3.952 * scale * Math.cos(a), cy + 3.952 * scale * Math.sin(a));
      ctx.rotate(a);
      ctx.fillRect(-0.04 * scale, -0.04 * scale, 0.08 * scale, 0.08 * scale);
      ctx.restore();
    }
    const t = texture(c);
    // The shape's coordinates are table units with y = −z: one picture over the whole felt.
    t.repeat.set(1 / wide, 1 / deep);
    t.offset.set(-left / wide, (NEAR + 0.1) / deep);
    return t;
  }
  /**
   * A casino table for `layout`: printed felt inside a padded rail that rounds
   * the players' side, a wooden apron, and the dealer's chip tray on the far edge.
   */
  private buildTable(layout: Layout) {
    const table = new T.Group(),
      rail = layout.rail,
      hx = layout.subject.half - rail - 0.05;
    const felt = new T.Mesh(
      this.own(new T.ShapeGeometry(this.trace(new T.Shape(), this.outline(layout, 0.02)))),
      this.own(
        new T.MeshStandardMaterial({ map: this.own(this.feltTexture(layout)), roughness: 0.95, ...weave(0.75, 0.75, (r) => this.own(r)) }),
      ),
    );
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    const band = (inner: number, outer: number, depth: number, y: number, material: T.Material, bevel = 0.05, rise = 0.05, steps = 3) => {
      const shape = this.trace(new T.Shape(), this.outline(layout, outer - bevel));
      shape.holes.push(this.trace(new T.Path(), this.outline(layout, inner + bevel)));
      const mesh = new T.Mesh(
        this.own(
          new T.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: true,
            bevelSize: bevel,
            bevelThickness: rise,
            bevelSegments: steps,
            curveSegments: 4,
          }),
        ),
        material,
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y + rise;
      mesh.castShadow = mesh.receiveShadow = true;
      table.add(mesh);
    };
    const lively = capable(),
      vinyl = this.own(
        glossy(
          {
            color: "#2b1813",
            roughness: 0.42,
            ...(lively ? { bumpMap: this.own(grainTexture()), bumpScale: 0.6 } : {}),
          },
          0.45,
        ),
      ),
      timber = this.own(new T.MeshStandardMaterial({ map: this.own(wood(true)), roughness: 0.55 })),
      brass = this.own(new T.MeshStandardMaterial({ color: "#c9a85c", roughness: 0.3, metalness: 0.7 }));
    // A brass line where the felt meets the rail, the padded rail (a rounded roll), and the wooden apron under it.
    band(-0.03, 0.04, 0.004, -0.01, brass, 0.02, 0.012, 2);
    band(0.04, rail, 0.02, 0.0, vinyl, (rail - 0.04) * 0.46, 0.11, 6);
    band(rail - 0.14, rail + 0.08, 0.66, -0.74, timber);
    const edge = new T.Mesh(this.own(block((hx + rail) * 2 + 0.16, 0.8, 0.3, 0.04)), timber);
    edge.position.set(0, -0.42, FAR - 0.13);
    edge.castShadow = edge.receiveShadow = true;
    table.add(felt, edge);
    // The dealer's tray: rolls of chips lying in grooves between brass dividers, in a dark wooden case.
    const tray = layout.tray,
      trayZ = FAR + 0.42,
      body = new T.Mesh(
        this.own(block(tray.width, 0.13, 0.66, 0.04)),
        this.own(new T.MeshStandardMaterial({ color: "#1a1412", roughness: 0.45, metalness: 0.2 })),
      );
    body.position.set(0, 0.065, trayZ);
    body.castShadow = body.receiveShadow = true;
    table.add(body);
    const pitch = tray.width / (tray.rolls + 0.5),
      roll = this.own(new T.CylinderGeometry(0.2, 0.2, 0.54, 24)),
      walls: T.BufferGeometry[] = [],
      rolls: { x: number; kind: number }[] = [];
    for (let i = 0; i < tray.rolls; i++) {
      const kind = Math.floor((i * CHIPS.length) / tray.rolls),
        x = (i - (tray.rolls - 1) / 2) * pitch,
        chips = new T.Mesh(roll, [this.rollMaterial(kind), this.chipMaterials[kind][1], this.chipMaterials[kind][1]]);
      chips.rotation.x = Math.PI / 2;
      chips.position.set(x, 0.2, trayZ);
      // Lying in the tray, the rolls would cast no shadow worth its cost.
      table.add(chips);
      rolls.push({ x, kind });
      if (i) walls.push(block(0.03, 0.1, 0.6, 0.012).translate(x - pitch / 2, 0.16, trayZ));
    }
    // The brass dividers in one piece.
    table.add(new T.Mesh(this.own(mergeGeometries(walls)), brass));
    walls.forEach((w) => w.dispose());
    return { table, tray: { z: trayZ, rolls } };
  }
  private rolls = new Map<number, T.Material>();
  private rollMaterial(kind: number) {
    let material = this.rolls.get(kind);
    if (!material) {
      material = this.own(new T.MeshStandardMaterial({ map: this.own(rollSide(CHIPS[kind], 9)), roughness: 0.5 }));
      this.rolls.set(kind, material);
    }
    return material;
  }
  /**
   * The dealing shoe: dark smoked walls sloping down to a brass-lipped mouth,
   * the deck leaning inside with a weight behind it. Cards slide out of the
   * mouth along the felt.
   */
  private buildShoe() {
    const { width, length, back, front, slope } = SHOE,
      half = length / 2,
      shell = this.own(glossy({ color: "#191a1f", roughness: 0.3, metalness: 0.1 }, 0.8)),
      brass = this.own(new T.MeshStandardMaterial({ color: "#c9a85c", roughness: 0.3, metalness: 0.7 })),
      profile = new T.Shape();
    // The side wall's outline, seen from the side: z across, y up.
    profile.moveTo(-half, 0);
    profile.lineTo(half, 0);
    profile.lineTo(half, front);
    profile.lineTo(half - slope * 2.2, back - 0.06);
    profile.lineTo(-half, back);
    profile.closePath();
    const wall = this.own(new T.ExtrudeGeometry(profile, { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }));
    for (const side of [-1, 1]) {
      const mesh = new T.Mesh(wall, shell);
      // The profile's x is the shoe's z.
      mesh.rotation.y = -Math.PI / 2;
      // Extruded towards −x once turned: the wall's outer face is at ±width / 2.
      mesh.position.x = side > 0 ? width / 2 : -width / 2 + 0.07;
      mesh.castShadow = true;
      this.shoe.add(mesh);
    }
    const base = new T.Mesh(this.own(block(width, 0.04, length, 0.015)), shell);
    base.position.y = 0.02;
    const backPlate = new T.Mesh(this.own(block(width, back, 0.07, 0.02)), shell);
    backPlate.position.set(0, back / 2, -half + 0.035);
    const lip = new T.Mesh(this.own(block(width - 0.1, 0.035, 0.07, 0.012)), brass);
    lip.position.set(0, front - 0.02, half - 0.02);
    // The deck: edges on top, the back of the first card facing the mouth.
    const edges = this.own(edgesTexture());
    edges.repeat.set(1, 3);
    const edgeMaterial = this.own(new T.MeshStandardMaterial({ map: edges, roughness: 0.8 })),
      deckGeometry = this.own(new T.BoxGeometry(width - 0.16, back - 0.18, 1));
    // Its front face at z = 0, so that it can be shortened from the back.
    deckGeometry.translate(0, 0, -0.5);
    const deck = new T.Mesh(oneFace(deckGeometry, 4), [edgeMaterial, this.back]);
    deck.position.set(0, 0.11 + (back - 0.18) / 2, half - slope * 2.2 + 0.02);
    deck.rotation.x = -0.22;
    const weight = new T.Mesh(this.own(block(width - 0.2, back - 0.24, 0.14, 0.03)), brass);
    weight.name = "weight";
    // A smoked cover over the deck, from the top of the slope to the back.
    const coverLength = length - slope * 2.2,
      cover = new T.Mesh(
        this.own(block(width, 0.03, coverLength, 0.012)),
        this.own(new T.MeshStandardMaterial({ color: "#14161a", roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.78 })),
      );
    cover.position.set(0, back + 0.01, -half + coverLength / 2);
    cover.rotation.x = Math.atan2(0.06, coverLength);
    this.shoe.add(base, backPlate, lip, deck, weight, cover);
    return deck;
  }
  /** The discard holder: a low smoked tray where the played cards lie face down. */
  private buildDiscard() {
    const shell = this.own(
        new T.MeshStandardMaterial({ color: "#1b1d22", roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.82 }),
      ),
      w = CARD_W + 0.16,
      l = CARD_H + 0.16;
    const base = new T.Mesh(this.own(block(w, 0.03, l, 0.012)), shell);
    base.position.y = 0.015;
    this.discard.add(base);
    for (const [sx, sz, along] of [[0, -1, true], [0, 1, true], [-1, 0, false], [1, 0, false]] as const) {
      const wall = new T.Mesh(this.own(block(along ? w : 0.05, 0.16, along ? 0.05 : l, 0.015)), shell);
      wall.position.set((sx * (w - 0.05)) / 2, 0.08, (sz * (l - 0.05)) / 2);
      this.discard.add(wall);
    }
    const edges = this.own(edgesTexture()),
      edgeMaterial = this.own(new T.MeshStandardMaterial({ map: edges, roughness: 0.8 })),
      geometry = this.own(oneFace(new T.BoxGeometry(CARD_W - 0.02, 1, CARD_H - 0.02), 2));
    geometry.translate(0, 0.5, 0);
    const pile = new T.Mesh(geometry, [edgeMaterial, this.back]);
    pile.position.y = 0.03;
    pile.visible = false;
    this.discard.add(pile);
    return pile;
  }
  /** The deck in the shoe and the pile in the discard holder follow how much of the shoe is left. */
  private fillStacks() {
    const left = Math.max(0, Math.min(1, this.model.shoe ?? 1)),
      depth = 0.15 + 0.85 * left;
    this.shoeDeck.scale.z = depth;
    const weight = this.shoe.getObjectByName("weight")!;
    weight.position.set(0, 0.06 + (SHOE.back - 0.24) / 2, this.shoeDeck.position.z - Math.cos(0.22) * depth - 0.08);
    weight.rotation.x = -0.22;
    const onTable = this.model.dealer.length + this.model.hands.reduce((n, h) => n + h.cards.length, 0),
      played = Math.max(0, Math.round(SHOE_CARDS * (1 - left)) - onTable - this.inFlight);
    this.discardPile.visible = played > 0;
    this.discardPile.scale.y = Math.min(0.12, 0.012 + played * 0.0006);
    this.dirty = true;
  }
  /** Cards on their way to the discard holder, not yet counted in its pile. */
  private inFlight = 0;
  private setFace(mesh: T.Mesh, card: Card | null) {
    (mesh.material as T.Material[])[0] = card ? this.faceMaterial(card) : this.blank;
  }
  private place(group: T.Object3D, pose: Pose) {
    group.position.copy(pose.at);
    group.rotation.y = pose.yaw;
    group.scale.setScalar(pose.scale);
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const before = this.layout;
    this.layout = w / h < 1.15 ? LAYOUTS.tall : LAYOUTS.wide;
    const subject = this.layout.subject,
      distance = cameraDistance(this.camera.aspect, false, subject);
    this.camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.tables.wide.visible = this.layout === LAYOUTS.wide;
    this.tables.tall.visible = this.layout === LAYOUTS.tall;
    this.place(this.shoe, this.layout.shoe);
    this.place(this.discard, this.layout.discard);
    this.shoe.updateMatrixWorld(true);
    // A new shape moves every target: place the current table without animation.
    if (before !== this.layout) this.clearPiles();
    this.sync(this.model, false);
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Where the i-th of n cards of a row centred on x belongs. */
  private slot(x: number, z: number, i: number, n: number, width: number) {
    const gap = n > 1 ? Math.min(CARD_W * 0.62, (width - CARD_W) / (n - 1)) : 0;
    return new T.Vector3(x + (i - (n - 1) / 2) * gap, 0.01 + CARD_T / 2 + i * CARD_T, z);
  }
  /** A point in the shoe's frame, on the table. */
  private fromShoe(x: number, y: number, z: number) {
    return this.shoe.localToWorld(new T.Vector3(x, y, z));
  }
  /**
   * Shows `model`. New cards slide out of the shoe and are flicked to their
   * place one after another, a card that gained a face is turned over, moved
   * cards slide, cards that left the table go to the discard holder, and the
   * chips follow: stakes come in from the player's side, a lost stake goes to
   * the dealer, winnings are counted out from the tray chip by chip.
   */
  sync(model: TableModel, animate = true) {
    if (this.disposed) return;
    this.model = model;
    this.dirty = true;
    const quick = !animate || this.reducedMotion,
      now = performance.now(),
      { dealerZ, playerZ, hands, width } = this.layout,
      count = (model.hands.length === 2 ? 2 : 1) as 1 | 2;
    // Finish whatever was still moving so every card starts from its place.
    this.finish();
    const targets = new Map<number, { card: TableCard; at: T.Vector3; dealer: boolean }>();
    model.dealer.forEach((card, i) =>
      targets.set(card.id, {
        card,
        at: this.slot(0, dealerZ, i, model.dealer.length, width[1]),
        dealer: true,
      }),
    );
    model.hands.forEach((hand, h) =>
      hand.cards.forEach((card, i) =>
        targets.set(card.id, {
          card,
          at: this.slot(hands[count][h], playerZ, i, hand.cards.length, width[count]),
          dealer: false,
        }),
      ),
    );
    let removed = 0;
    for (const [id, entry] of this.cards)
      if (!targets.has(id)) {
        this.cards.delete(id);
        const leave = () => {
          this.scene.remove(entry.mesh);
          this.inFlight = Math.max(0, this.inFlight - 1);
          this.fillStacks();
        };
        this.inFlight++;
        if (quick) leave();
        else this.toDiscard(entry.mesh, now + removed * 70, leave);
        removed++;
      }
    // Deal order: by id, with the hole card turning over after the player's
    // new cards and before the dealer draws.
    const ordered = [...targets.entries()].sort(([a], [b]) => a - b);
    let order = 0,
      lastPlayerDeal = -1;
    const steps: { key: number; run: (start: number) => void }[] = [];
    for (const [id, { card, at, dealer }] of ordered) {
      const existing = this.cards.get(id);
      if (!existing) {
        const mesh = new T.Mesh(this.cardGeometry, [this.blank, this.back, this.edge]);
        mesh.castShadow = true;
        mesh.visible = false;
        this.setFace(mesh, card.face);
        this.scene.add(mesh);
        this.cards.set(id, { mesh, faceUp: !!card.face });
        if (!dealer) lastPlayerDeal = Math.max(lastPlayerDeal, id);
        steps.push({ key: id, run: (start) => this.deal(mesh, start, at, !!card.face) });
      } else if (card.face && !existing.faceUp) {
        // The hole card turns over; its place in the order is set below.
        existing.faceUp = true;
        this.setFace(existing.mesh, card.face);
        steps.push({ key: -1, run: (start) => this.turnOver(existing.mesh, start, at) });
      } else {
        if (!card.face && existing.faceUp) {
          existing.faceUp = false;
          existing.mesh.rotation.z = Math.PI;
          this.setFace(existing.mesh, null);
        }
        if (existing.mesh.position.distanceToSquared(at) > 1e-6) this.slide(existing.mesh, now, at);
      }
    }
    // Place the turn-over right after the last card dealt to the player.
    for (const step of steps) if (step.key === -1) step.key = lastPlayerDeal + 0.5;
    steps.sort((a, b) => a.key - b.key);
    for (const step of steps) step.run(now + (removed ? 220 : 0) + order++ * 250);
    // The chips move once the cards they answer to are down.
    const cardsDone = this.tweens.reduce((end, t) => Math.max(end, t.start + t.duration), now);
    this.moveChips(quick, now, cardsDone);
    this.dressTable();
    this.fillStacks();
    if (quick) this.finish();
    if (!this.tweens.length) this.settle();
    // Old totals stay readable during a deal, but not across a cleared table.
    else if (removed) this.showPlaques(false);
  }
  /** A card slides out of the shoe's mouth face down, then is flicked across the felt in a low arc to `to`. */
  private deal(mesh: T.Mesh, start: number, to: T.Vector3, faceUp: boolean) {
    const half = SHOE.length / 2,
      inside = this.fromShoe(0, 0.07, half - CARD_H / 2 - 0.1),
      out = this.fromShoe(0, 0.07, half + CARD_H / 2 + 0.04),
      yaw = this.layout.shoe.yaw,
      // The flick turns the card a little past square before it settles.
      spin = -Math.sign(to.x - out.x || 1) * 0.35,
      target = to.clone(),
      SLIDE = 0.3;
    // Out of the shoe the card is flat on the felt.
    out.y = inside.y = 0.01 + CARD_T / 2;
    mesh.position.copy(inside);
    mesh.rotation.set(0, yaw, Math.PI);
    this.tweens.push({
      start,
      duration: 470,
      apply: (p) => {
        mesh.visible = true;
        if (p < SLIDE) {
          mesh.position.lerpVectors(inside, out, smooth(p / SLIDE));
          mesh.rotation.set(0, yaw, Math.PI);
          return;
        }
        const q = (p - SLIDE) / (1 - SLIDE),
          e = outCubic(q),
          turned = faceUp ? Math.PI * (1 - smooth(Math.min(1, q / 0.75))) : Math.PI;
        mesh.position.lerpVectors(out, target, e);
        // A low arc, and room for the card to turn over in the air.
        mesh.position.y += Math.sin(Math.PI * q) * 0.28 + (CARD_W / 2) * Math.abs(Math.sin(turned));
        mesh.rotation.set(Math.sin(Math.PI * q) * 0.12, yaw * (1 - e) + spin * Math.sin(Math.PI * e), turned);
      },
      contact: () => this.onContact(),
    });
  }
  /** The hole card is turned over on its long edge where it lies. */
  private turnOver(mesh: T.Mesh, start: number, to: T.Vector3) {
    const from = mesh.position.clone(),
      target = to.clone();
    this.tweens.push({
      start,
      duration: 460,
      apply: (p) => {
        const e = smooth(p),
          turned = Math.PI * (1 - e);
        mesh.position.lerpVectors(from, target, e);
        // The low edge stays on the felt while the card rolls over it.
        mesh.position.y += (CARD_W / 2) * Math.abs(Math.sin(turned)) + Math.sin(Math.PI * p) * 0.12;
        mesh.position.x += Math.sin(turned) * 0.18;
        mesh.rotation.set(0, 0, turned);
      },
      contact: () => this.onContact(),
    });
  }
  /** A card pushed along the felt to its new place (a hand split in two). */
  private slide(mesh: T.Mesh, start: number, to: T.Vector3) {
    const from = mesh.position.clone(),
      target = to.clone(),
      flip = mesh.rotation.z;
    this.tweens.push({
      start,
      duration: 260,
      apply: (p) => {
        mesh.position.lerpVectors(from, target, smooth(p));
        mesh.position.y += Math.sin(Math.PI * p) * 0.06;
        mesh.rotation.set(0, 0, flip);
      },
    });
  }
  /** A played card is turned face down and laid in the discard holder. */
  private toDiscard(mesh: T.Mesh, start: number, done: () => void) {
    const from = mesh.position.clone(),
      pose = this.layout.discard,
      target = pose.at.clone().setY(0.05 + 0.12 * pose.scale),
      flip = mesh.rotation.z,
      yaw = mesh.rotation.y;
    this.tweens.push({
      start,
      duration: 380,
      apply: (p) => {
        const e = smooth(p),
          turned = flip + (Math.PI - flip) * e;
        mesh.position.lerpVectors(from, target, e);
        mesh.position.y += Math.sin(Math.PI * p) * 0.25 + (CARD_W / 2) * Math.abs(Math.sin(turned)) * 0.6;
        mesh.rotation.set(0, yaw + (pose.yaw - yaw) * e, turned);
      },
      done,
    });
  }
  /** Where the i-th chip of a stack of n at (x, z) lies. */
  private chipSpot(x: number, z: number, i: number, n: number, out = new T.Vector3()) {
    const column = Math.floor(i / COLUMN),
      columns = Math.ceil(n / COLUMN);
    return out.set(
      x + (column - (columns - 1) / 2) * 0.52 + (hash(i, 1) - 0.5) * 0.025,
      CHIP_H / 2 + 0.004 + (i % COLUMN) * CHIP_H,
      z + (hash(i, 2) - 0.5) * 0.025,
    );
  }
  /** Where chips of `kind` come from or go to: the dealer's roll of that kind, or the player's side of the table. */
  private chipHome(kind: number, dealer: boolean, x: number) {
    if (!dealer) return new T.Vector3(x, 0.2, NEAR + this.layout.rail + 0.9);
    const tray = this.trays[this.layout === LAYOUTS.wide ? "wide" : "tall"],
      rolls = tray.rolls.filter((r) => r.kind === kind);
    return new T.Vector3(rolls.length ? rolls[0].x : 0, 0.34, tray.z);
  }
  private clearPiles() {
    for (const pile of this.piles.values()) for (const mesh of pile.meshes) this.chips.remove(mesh);
    this.piles.clear();
  }
  /** Brings the stacks on the felt to what the model says, moving chips as a dealer would. */
  private moveChips(quick: boolean, now: number, after: number) {
    const { hands } = this.layout,
      model = this.model,
      count = (model.hands.length === 2 ? 2 : 1) as 1 | 2,
      wanted = new Map<string, { kinds: number[]; x: number; z: number; lost: boolean; win: boolean }>();
    if (!model.hands.length) {
      wanted.set("bet:0", { kinds: breakdown(model.stake), x: 0, z: spotZ(this.layout, 0), lost: false, win: false });
    }
    model.hands.forEach((hand, h) => {
      const x = hands[count][h],
        z = spotZ(this.layout, x),
        net = hand.net;
      wanted.set(`bet:${h}`, { kinds: net !== undefined && net < 0 ? [] : breakdown(hand.bet), x, z, lost: net !== undefined && net < 0, win: false });
      if (net !== undefined && net > 0) wanted.set(`win:${h}`, { kinds: breakdown(net), x: x + 0.54, z: z + 0.04, lost: false, win: true });
    });
    let sounded = false;
    const sound = (tween: Tween) => {
      if (sounded) return;
      sounded = true;
      tween.contact = () => this.onChips();
    };
    for (const key of new Set([...this.piles.keys(), ...wanted.keys()])) {
      const old = this.piles.get(key) ?? { kinds: [], meshes: [], x: 0, z: 0 },
        want = wanted.get(key) ?? { kinds: [], x: old.x, z: old.z, lost: false, win: false },
        win = key.startsWith("win");
      let same = 0;
      while (same < old.kinds.length && same < want.kinds.length && old.kinds[same] === want.kinds[same]) same++;
      const kept = old.meshes.slice(0, same),
        leaving = old.meshes.slice(same),
        n = want.kinds.length;
      // What leaves goes to the dealer when lost, back to the player otherwise, the stack pushed along as one.
      leaving.forEach((mesh, i) => {
        const kind = old.kinds[same + i],
          to = this.chipHome(kind, want.lost, mesh.position.x).add(new T.Vector3(0, i * CHIP_H, 0)),
          done = () => this.chips.remove(mesh);
        if (quick) return done();
        const t = this.chipFlight(mesh, want.lost ? after + 200 : now, to, 420, 0.12, done);
        t.contact = undefined;
        if (i === 0 && want.lost) sound(t);
      });
      // A stack that stays may still move (a hand split in two).
      kept.forEach((mesh, i) => {
        const to = this.chipSpot(want.x, want.z, i, n);
        if (quick) mesh.position.copy(to);
        else if (mesh.position.distanceToSquared(to) > 1e-6) this.chipFlight(mesh, now, to, 260, 0.04);
      });
      const meshes = [...kept];
      want.kinds.slice(same).forEach((kind, j) => {
        const i = same + j,
          mesh = new T.Mesh(this.chipGeometry, this.chipMaterials[kind]);
        mesh.rotation.y = hash(i, 3) * Math.PI * 2;
        mesh.castShadow = true;
        this.chips.add(mesh);
        meshes.push(mesh);
        const to = this.chipSpot(want.x, want.z, i, n);
        if (quick) return void mesh.position.copy(to);
        mesh.position.copy(this.chipHome(kind, win, want.x));
        mesh.visible = false;
        // Winnings are counted out one chip at a time, each heard as it lands; a stake is set down together.
        const t = win
          ? this.chipFlight(mesh, after + 150 + j * 190, to, 360, 0.42)
          : this.chipFlight(mesh, now + j * 45, to, 340, 0.3);
        if (win) t.contact = () => this.onChips();
        else sound(t);
      });
      if (meshes.length) this.piles.set(key, { kinds: want.kinds, meshes, x: want.x, z: want.z });
      else this.piles.delete(key);
    }
  }
  private chipFlight(mesh: T.Mesh, start: number, to: T.Vector3, duration: number, lift: number, done?: () => void) {
    const target = to.clone();
    let from: T.Vector3 | null = null;
    const tween: Tween = {
      start,
      duration,
      apply: (p) => {
        // A chip that waits its turn leaves from where it is when its turn comes.
        from ??= mesh.position.clone();
        mesh.visible = true;
        const e = smooth(p);
        mesh.position.lerpVectors(from, target, e);
        mesh.position.y += Math.sin(Math.PI * p) * lift;
        mesh.rotation.x = Math.sin(Math.PI * p) * 0.15;
        if (p >= 1) mesh.rotation.x = 0;
      },
      done,
    };
    this.chipTweens.push(tween);
    return tween;
  }
  /** Advances the animations; true while anything moved. */
  private step(now: number) {
    if (!this.tweens.length && !this.chipTweens.length) return false;
    const advance = (list: Tween[]) =>
      list.filter((t) => {
        const p = Math.min(1, (now - t.start) / t.duration);
        if (p < 0) return true;
        t.apply(p);
        if (p < 1) return true;
        t.contact?.();
        t.done?.();
        return false;
      });
    const cards = this.tweens.length;
    this.tweens = advance(this.tweens);
    this.chipTweens = advance(this.chipTweens);
    if (cards && !this.tweens.length) this.settle();
    return true;
  }
  /** Jumps every running animation to its end. */
  private finish() {
    const all = [...this.tweens, ...this.chipTweens];
    this.tweens = [];
    this.chipTweens = [];
    for (const t of all) {
      t.apply(1);
      t.done?.();
    }
  }
  private settle() {
    this.showPlaques(true);
    this.dirty = true;
    this.onSettled();
  }
  /** Betting spots and the active-hand outline follow the model at once. */
  private dressTable() {
    const { playerZ, hands, width } = this.layout,
      model = this.model,
      count = (model.hands.length === 2 ? 2 : 1) as 1 | 2;
    this.rings.clear();
    const spots = model.hands.length ? model.hands.map((_, h) => hands[count][h]) : [0];
    for (const x of spots) {
      const ring = new T.Mesh(this.ringGeometry, this.ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(model.hands.length === 2 ? 1.08 : 1.24);
      ring.position.set(x, 0.003, spotZ(this.layout, x));
      this.rings.add(ring);
    }
    const active = model.hands.findIndex((h) => h.active);
    this.glow.visible = active >= 0;
    if (active >= 0) {
      const n = model.hands[active].cards.length,
        gap = n > 1 ? Math.min(CARD_W * 0.62, (width[count] - CARD_W) / (n - 1)) : 0;
      this.glow.scale.set((CARD_W + gap * (n - 1)) * 1.32 + 0.5, CARD_H * 1.6, 1);
      this.glow.position.set(hands[count][active], 0.006, playerZ);
    }
  }
  /** Totals and results appear only once the cards they describe have landed. */
  private showPlaques(current: boolean) {
    this.plaques.clear();
    if (!current) return;
    const { dealerZ, playerZ, hands } = this.layout,
      model = this.model,
      count = (model.hands.length === 2 ? 2 : 1) as 1 | 2;
    const add = (text: string, tone: Tone, x: number, z: number) => {
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
      mesh.scale.setScalar(model.hands.length === 2 && this.layout === LAYOUTS.tall ? 0.72 : 1);
      mesh.position.set(x, 0.008, z);
      this.plaques.add(mesh);
    };
    add(model.dealerLabel, "neutral", 0, dealerZ - CARD_H / 2 - 0.3);
    model.hands.forEach((hand, h) =>
      add(hand.label, hand.tone, hands[count][h], playerZ + CARD_H / 2 + 0.3),
    );
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.tweens = [];
    this.chipTweens = [];
    for (const resource of this.owned) resource.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
