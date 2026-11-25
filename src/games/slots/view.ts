import * as T from "three";
import { cryptoRandom } from "../../core/random";
import { block, capable, glossy } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import { arcadeRoom, painted } from "../coinpusher/arcade";
import { COIN_H, COIN_R, coinGeometry, coinMaterials } from "../indian/coins";
import type { Marks } from "../points/view";
import { TableView, type Spot } from "../table/view";
import { FRONT, LEVER, REELS, ROOM, TRIP, slotSubject } from "./layout";
import { paintSymbol } from "./paint";
import { BET, CASH, HURRY, LINES as LINE_MOVE, MAX, PULL, SETTLE, SPIN, moves, stakeOf, type State } from "./rules";
import { LINES, N, STRIPS, SYMBOLS, THREE, drawStops, packStops, type LineWin } from "./sim";

export const SLOT_COLORS: [string, string] = ["#e8b84a", "#c8321f"];
/** Reel speeds in symbols a second, and how quickly a reel gets up to speed. */
const SPEED = 15,
  ACCEL = 60,
  /** How far a stopping reel runs past its place before it springs back, and how long that takes (s). */
  OVER = 0.22,
  BOUNCE = 0.16;
/** When the reels stop after the pull, left to right (s), and the least time between stops when hurried. */
const FIRST_STOP = 0.85,
  NEXT_STOP = 0.42,
  HURRIED = 0.22;
/** The picks of the lever and the cabinet's buttons (`pick`). */
const PICK_LEVER = 1000;
const BUTTONS = [
  { key: "cash", label: "정산", move: CASH, x: -0.46, colour: "#2a8a4a" },
  { key: "lines", label: "라인", move: LINE_MOVE, x: -0.24, colour: "#2a5ac8" },
  { key: "bet", label: "베팅", move: BET, x: -0.02, colour: "#e0a020" },
  { key: "max", label: "최대", move: MAX, x: 0.2, colour: "#c83a8a" },
  { key: "spin", label: "스핀", move: PULL, x: 0.44, colour: "#d8261c" },
];
/** The console the buttons stand on: its middle's height, how far it stands out, and how far its top leans toward the player. */
const DECK = { y: 0.86, z: FRONT + 0.2, slope: 0.62 };
/** The coin tray under the machine: its floor's height, its middle, its size inside. */
const TRAY = { y: 0.2, z: FRONT + 0.2, w: 0.8, d: 0.26 };
const COIN = 0.04;
const TRAY_MAX = 160;
const STEP = (Math.PI * 2) / N;
/** How much nearer the eye comes on a phone held sideways, and how much higher it looks. */
const WIDE_NEAR = 0.84,
  WIDE_LIFT = 0.16;
const AXIS_Z = FRONT - 0.04 - REELS.radius;
type Keep = <R extends { dispose(): void }>(r: R) => R;
interface Reel {
  drum: T.Mesh;
  material: T.MeshStandardMaterial;
  sharp: T.Texture;
  blur: T.Texture;
  /** The strip's place in the middle row (fractional while it turns), its speed, and what it is doing. */
  p: number;
  speed: number;
  phase: "rest" | "spin" | "brake" | "bounce";
  stopAt: number;
  target: number;
  from: number;
  t0: number;
  dur: number;
}
interface Flight {
  start: number;
  slot: number;
  yaw: number;
  x: number;
}
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Where the `index`-th coin lies in the tray: a loose heap, highest in the middle. */
function trayRest(index: number, out: T.Vector3) {
  const per = 24,
    layer = Math.floor(index / per),
    k = (index * 7 + layer * 5) % per,
    shrink = Math.max(0.3, 1 - layer * 0.14),
    u = (k % 12) / 11 - 0.5 + (hash(index, 1) - 0.5) * 0.05,
    v = Math.floor(k / 12) - 0.5 + (hash(index, 2) - 0.5) * 0.4;
  return out.set(u * (TRAY.w - 2 * COIN) * shrink, TRAY.y + 0.006 + layer * 0.011, TRAY.z + v * (TRAY.d - 2 * COIN) * 0.8 * shrink);
}
/** A drum of `n` faces round the x axis whose texture runs down the strip: face k is centred `k` steps below the front. */
function drumGeometry(radius: number, width: number, n: number) {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    index: number[] = [];
  for (let j = 0; j <= n; j++) {
    const phi = (0.5 - j) * STEP,
      y = Math.sin(phi),
      z = Math.cos(phi);
    for (const side of [-1, 1]) {
      positions.push((side * width) / 2, radius * y, radius * z);
      normals.push(0, y, z);
      uvs.push(side < 0 ? 0 : 1, 1 - j / n);
    }
  }
  for (let j = 0; j < n; j++) {
    const a = j * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}
/** A reel's strip painted down a tall canvas, and the same smeared down its length for a reel turning fast. */
function stripTextures(reel: number, keep: Keep) {
  const W = 128,
    cell = 96,
    H = cell * N;
  const sharp = painted(
    W,
    H,
    (pen) => {
      for (let k = 0; k < N; k++) {
        const g = pen.createLinearGradient(0, k * cell, 0, (k + 1) * cell);
        g.addColorStop(0, "#e9e2d0");
        g.addColorStop(0.5, "#fffdf6");
        g.addColorStop(1, "#e9e2d0");
        pen.fillStyle = g;
        pen.fillRect(0, k * cell, W, cell);
        pen.fillStyle = "rgba(0,0,0,0.08)";
        pen.fillRect(0, k * cell, W, 2);
        paintSymbol(pen, STRIPS[reel][k], W / 2, k * cell + cell / 2, 80);
      }
    },
    keep,
  );
  const blur = painted(
    W,
    H,
    (pen) => {
      const source = sharp.image as HTMLCanvasElement;
      pen.globalAlpha = 1 / 9;
      for (let k = -4; k <= 4; k++) for (const wrap of [-H, 0, H]) pen.drawImage(source, 0, wrap + k * 9);
    },
    keep,
  );
  return { sharp, blur };
}
/**
 * A slot machine in an amusement arcade's corner, seen from the stool before it: a cabinet with a lit sign and
 * chasing bulbs on top, the pay table, the reel window with three real drums turning behind the glass, the credit
 * display, a deck of buttons (정산, 라인, 베팅, 최대, 스핀), a lever on the right, and the coin tray under it where
 * the winnings rattle out. The reels' stops are drawn here at random (each place of a strip as likely as any) and
 * played as the spin's move; the books (`rules.ts`) pay what the stops show once every reel has come to rest.
 */
export class SlotView extends TableView<State> {
  private root = new T.Group();
  private console = new T.Group();
  private reels: Reel[] = [];
  private lever = new T.Group();
  private leverParts: T.Object3D[] = [];
  private pull = 0;
  private pullV = 0;
  private leverHeld: { y0: number; start: number } | null = null;
  private tripped = false;
  private buttons: { key: string; move: number; mesh: T.Mesh; cap: T.MeshStandardMaterial; pressed: number }[] = [];
  private lineBars: T.MeshBasicMaterial[] = [];
  private lineLamps: T.MeshStandardMaterial[] = [];
  private bulbs: T.MeshStandardMaterial[] = [];
  private neon: T.MeshStandardMaterial[] = [];
  private led!: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private coins: T.InstancedMesh;
  private flights: Flight[] = [];
  private trayShown = 0;
  private trayCount = 0;
  private coinsOwed = 0;
  private nextCoin = 0;
  private words: { sprite: T.Sprite; at: number }[] = [];
  private mode = "";
  private shown = -1;
  private credits = 0;
  private nextTick = 0;
  /** The win lines lit after a spin, and since when; a big win's flash and when it ends. */
  private lit: LineWin[] = [];
  private litAt = 0;
  private showLinesUntil = 0;
  private party = 0;
  private settleAt = 0;
  private queued: { to: number; extra: number } | null = null;
  private paused = false;
  private last = performance.now();
  private ticker = 0;
  private spare = { q: new T.Quaternion(), e: new T.Euler(), p: new T.Vector3(), s: new T.Vector3(), m: new T.Matrix4(), v: new T.Vector3() };
  private caster = new T.Raycaster();
  /** What the machine is heard doing: the reels' whirr (`whirr`, a level), the lever, a reel stopping, a button, the credits counting, coins, a win, a big win, the jackpot, a spin refused. */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#0d0a1e");
    const rich = capable(),
      keep: Keep = (r) => this.own(r);
    this.scene.add(new T.HemisphereLight("#d8d0ff", "#2a1a3a", 1.6));
    const sun = new T.DirectionalLight("#fff1dc", 1.6);
    sun.position.set(-2, 6, 5);
    sun.castShadow = rich;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -2.5;
    sun.shadow.camera.right = sun.shadow.camera.top = 2.5;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    if (rich) {
      const lamp = new T.PointLight("#ffe8c0", 3, 4, 1.5);
      lamp.position.set(0, 1.4, 1.4);
      this.scene.add(lamp);
    }
    this.neon = arcadeRoom(this.scene, keep, ROOM);
    this.scene.add(this.root);
    this.cabinet(keep, rich);
    const shape = keep(coinGeometry(rich ? 32 : 14));
    this.coins = new T.InstancedMesh(shape, coinMaterials(2, keep, rich), TRAY_MAX + 40);
    this.coins.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.coins.frustumCulled = false;
    this.coins.count = 0;
    this.coins.castShadow = rich;
    this.root.add(this.coins);
    keep({ dispose: () => this.coins.dispose() });
    // Presses are followed on an upright plane before the cabinet: a drag down over the lever pulls it.
    this.floor = new T.Plane(new T.Vector3(0, 0, 1), -(FRONT + 0.05));
    if (!rich) this.renderer.shadowMap.enabled = false;
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  private metal(color: string, rich: boolean, rough = 0.25) {
    return this.standard({ color, metalness: rich ? 0.85 : 0.35, roughness: rich ? rough : 0.4 });
  }
  private cabinet(keep: Keep, rich: boolean) {
    const root = this.root,
      body = keep(glossy({ color: "#8a1020", roughness: 0.35 }, 0.7)),
      dark = this.standard({ color: "#140c14", roughness: 0.8 }),
      trim = this.metal("#e8b84a", rich, 0.3),
      chrome = this.metal("#d8dde4", rich, 0.2);
    const put = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number) => this.add(geometry, material, x, y, z, root);
    const W = 0.66,
      back = -1.12,
      winTop = REELS.y + 1.5 * REELS.row + 0.04,
      winBottom = REELS.y - 1.5 * REELS.row - 0.04,
      winHalf = REELS.gap + REELS.width / 2 + 0.05;
    // The lower cabinet to the deck, its belly panel and the tray's recess.
    put(block(2 * W, DECK.y - ROOM, FRONT - back, 0.04), body, 0, (DECK.y + ROOM) / 2, (FRONT + back) / 2);
    const belly = painted(
      512,
      256,
      (pen) => {
        const g = pen.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, "#2a0a40");
        g.addColorStop(1, "#5a0a2a");
        pen.fillStyle = g;
        pen.fillRect(0, 0, 512, 256);
        pen.save();
        pen.translate(256, 300);
        for (let k = 0; k < 18; k++) {
          pen.rotate(Math.PI / 18);
          pen.fillStyle = k % 2 ? "rgba(255,210,80,0.16)" : "rgba(255,80,160,0.10)";
          pen.beginPath();
          pen.moveTo(0, 0);
          pen.lineTo(-500, -24);
          pen.lineTo(-500, 24);
          pen.fill();
        }
        pen.restore();
        paintSymbol(pen, 5, 150, 96, 120);
        paintSymbol(pen, 5, 256, 96, 120);
        paintSymbol(pen, 5, 362, 96, 120);
      },
      keep,
    );
    put(new T.PlaneGeometry(2 * W - 0.12, 0.42), this.standard({ map: belly, emissive: "#ffffff", emissiveMap: belly, emissiveIntensity: 0.25, roughness: 0.5 }), 0, 0.58, FRONT + 0.002).castShadow = false;
    // The tray: a chrome dish standing out under the belly, the dark mouth the coins come from over it.
    put(block(TRAY.w + 0.08, 0.025, TRAY.d + 0.06, 0.01), chrome, 0, TRAY.y - 0.012, TRAY.z);
    for (const side of [-1, 1]) {
      put(block(0.025, 0.07, TRAY.d + 0.06, 0.008), chrome, side * (TRAY.w / 2 + 0.03), TRAY.y + 0.03, TRAY.z);
      put(block(TRAY.w + 0.08, 0.06, 0.02, 0.008), chrome, 0, TRAY.y + 0.025, TRAY.z + side * (TRAY.d / 2 + 0.02));
    }
    put(new T.PlaneGeometry(0.34, 0.1), this.standard({ color: "#050306", roughness: 1 }), 0, TRAY.y + 0.12, FRONT + 0.003).castShadow = false;
    put(block(0.4, 0.03, 0.04, 0.01), chrome, 0, TRAY.y + 0.185, FRONT + 0.015);
    // The deck: a console standing out under the window, its top sloping toward the player, gold along its edge.
    this.console.position.set(0, DECK.y, DECK.z - 0.1);
    this.console.rotation.x = DECK.slope;
    root.add(this.console);
    this.add(block(2 * W + 0.04, 0.06, 0.34, 0.02), body, 0, -0.03, 0, this.console).castShadow = false;
    this.add(block(2 * W + 0.06, 0.02, 0.02, 0.008), trim, 0, -0.035, 0.17, this.console);
    put(block(2 * W, 0.16, 0.2, 0.02), body, 0, DECK.y - 0.1, FRONT + 0.06);
    this.deckButtons(keep);
    // The upper cabinet: the faces round the window (its top with the pay table, the sides, the strip under it with the display).
    const upperTop = 2.2;
    put(block(2 * W, winBottom - DECK.y, FRONT - back, 0.02), body, 0, (winBottom + DECK.y) / 2, (FRONT + back) / 2);
    put(block(2 * W, upperTop - winTop, FRONT - back, 0.02), body, 0, (upperTop + winTop) / 2, (FRONT + back) / 2);
    for (const side of [-1, 1]) put(block(W - winHalf, winTop - winBottom, FRONT - back, 0.01), body, side * (W + winHalf) / 2, (winTop + winBottom) / 2, (FRONT + back) / 2);
    // The reel box behind the window: dark, so that only the drums show.
    put(new T.BoxGeometry(2 * winHalf, winTop - winBottom, FRONT - back - 0.1), this.standard({ color: "#0a0608", side: T.BackSide }), 0, (winTop + winBottom) / 2, (FRONT + back) / 2 - 0.05).castShadow = false;
    // The window's frame: gold bars round it, and the glass with a streak of light.
    for (const y of [winTop, winBottom]) put(block(2 * winHalf + 0.06, 0.03, 0.04, 0.01), trim, 0, y, FRONT + 0.01);
    for (const side of [-1, 1]) put(block(0.03, winTop - winBottom + 0.06, 0.04, 0.01), trim, side * (winHalf + 0.015), (winTop + winBottom) / 2, FRONT + 0.01);
    const glass = this.own(new T.MeshStandardMaterial({ color: "#eaf4ff", roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.07, depthWrite: false }));
    put(new T.PlaneGeometry(2 * winHalf, winTop - winBottom), glass, 0, (winTop + winBottom) / 2, FRONT + 0.004).castShadow = false;
    const streak = put(new T.PlaneGeometry(0.06, winTop - winBottom + 0.2), this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.07, depthWrite: false })), -0.22, (winTop + winBottom) / 2, FRONT + 0.006);
    streak.rotation.z = -0.5;
    streak.castShadow = false;
    // The drums, and the lines over them, with the line numbers either side.
    for (let r = 0; r < 3; r++) {
      const { sharp, blur } = stripTextures(r, keep),
        material = this.standard({ map: sharp, emissive: "#ffffff", emissiveMap: sharp, emissiveIntensity: 0.32, roughness: 0.55 }),
        drum = put(drumGeometry(REELS.radius, REELS.width, N), material, (r - 1) * REELS.gap, REELS.y, AXIS_Z);
      drum.castShadow = false;
      this.reels.push({ drum, material, sharp, blur, p: 0, speed: 0, phase: "rest", stopAt: 0, target: 0, from: 0, t0: 0, dur: 0 });
    }
    const yOf = (row: number) => REELS.y - row * REELS.row;
    LINES.forEach((rows, line) => {
      const paint = this.own(new T.MeshBasicMaterial({ color: ["#ff3a3a", "#ffd23a", "#3aff7a", "#3ac8ff", "#ff5af0"][line], transparent: true, opacity: 0, depthWrite: false, toneMapped: false })),
        x0 = -REELS.gap,
        x1 = REELS.gap,
        y0 = yOf(rows[0]),
        y1 = yOf(rows[2]),
        long = Math.hypot(x1 - x0, y1 - y0) * (1 + 0.42 / (x1 - x0)),
        bar = put(new T.PlaneGeometry(long, 0.014), paint, 0, (y0 + y1) / 2, FRONT + 0.008);
      bar.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      bar.castShadow = false;
      bar.renderOrder = 5;
      this.lineBars.push(paint);
      // Its number at both ends of the window, lit while the line is played.
      const lamp = this.standard({ color: "#3a2a10", emissive: ["#ff3a3a", "#ffd23a", "#3aff7a", "#3ac8ff", "#ff5af0"][line], emissiveIntensity: 0.1 });
      this.lineLamps.push(lamp);
      const label = painted(
        64,
        64,
        (pen) => {
          pen.fillStyle = "#ffffff";
          pen.font = '900 46px "Inter", sans-serif';
          pen.textAlign = "center";
          pen.textBaseline = "middle";
          pen.fillText(String(line + 1), 32, 35);
        },
        keep,
      );
      const face = this.standard({ map: label, transparent: true, emissive: "#ffffff", emissiveMap: label, emissiveIntensity: 0.8 });
      // A diagonal's number stands a little further out than the row's that starts at the same height.
      const out = winHalf + (line >= 3 ? 0.115 : 0.055);
      for (const [x, y] of [
        [-out, y0],
        [out, y1],
      ]) {
        put(new T.CircleGeometry(0.026, 20), lamp, x, y, FRONT + 0.012).castShadow = false;
        put(new T.PlaneGeometry(0.04, 0.04), face, x, y, FRONT + 0.014).castShadow = false;
      }
    });
    // The display under the window: credits, the bet and the last win in lit digits.
    this.led = this.display(keep, winHalf);
    // The pay table over the window, and the sign on top with its bulbs.
    const table = painted(1024, 384, (pen) => this.paintPayTable(pen), keep);
    put(new T.PlaneGeometry(2 * W - 0.14, 0.45), this.standard({ map: table, emissive: "#ffffff", emissiveMap: table, emissiveIntensity: 0.5, roughness: 0.5 }), 0, winTop + 0.3, FRONT + 0.004).castShadow = false;
    const sign = painted(
      1024,
      256,
      (pen) => {
        const g = pen.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, "#ff4f6a");
        g.addColorStop(1, "#8a0a2a");
        pen.fillStyle = g;
        pen.fillRect(0, 0, 1024, 256);
        for (const x of [130, 894]) paintSymbol(pen, 6, x, 128, 170);
        pen.font = '900 132px "Inter", "Noto Sans KR", sans-serif';
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.lineJoin = "round";
        pen.lineWidth = 22;
        pen.strokeStyle = "#4a0418";
        pen.strokeText("슬롯머신", 512, 134);
        const gold = pen.createLinearGradient(0, 60, 0, 200);
        gold.addColorStop(0, "#fff6b0");
        gold.addColorStop(1, "#ffb81c");
        pen.fillStyle = gold;
        pen.fillText("슬롯머신", 512, 134);
      },
      keep,
    );
    const top = put(block(2 * W + 0.04, 0.4, 0.3, 0.06), [body, body, body, body, this.standard({ map: sign, emissive: "#ffffff", emissiveMap: sign, emissiveIntensity: 0.55, roughness: 0.4 }), body], 0, upperTop + 0.2, FRONT - 0.1);
    top.castShadow = false;
    const bulb = keep(new T.SphereGeometry(0.022, 10, 8));
    const ring: [number, number][] = [];
    for (let k = 0; k < 14; k++) ring.push([-W + (k * 2 * W) / 13, upperTop + 0.41]);
    for (let k = 1; k < 3; k++) ring.push([W, upperTop + 0.41 - k * 0.13]);
    for (let k = 13; k >= 0; k--) ring.push([-W + (k * 2 * W) / 13, upperTop + 0.0]);
    for (let k = 2; k >= 1; k--) ring.push([-W, upperTop + 0.41 - k * 0.13]);
    for (const [x, y] of ring) {
      const paint = this.standard({ color: "#fff6c0", emissive: "#ffd04a", emissiveIntensity: 1 });
      this.bulbs.push(paint);
      put(bulb, paint, x, y, FRONT + 0.06).castShadow = false;
    }
    // Gold edges up the front, and the chrome posts of the sides.
    for (const side of [-1, 1]) {
      put(block(0.03, upperTop - DECK.y, 0.03, 0.01), trim, side * (W - 0.01), (upperTop + DECK.y) / 2, FRONT + 0.01);
      const strip = this.standard({ color: "#ff3fa4", emissive: "#ff3fa4", emissiveIntensity: 2 });
      this.neon.push(strip);
      put(new T.BoxGeometry(0.015, upperTop - ROOM - 0.1, 0.015), strip, side * (W + 0.008), (upperTop + ROOM) / 2, FRONT - 0.03).castShadow = false;
    }
    this.leverModel(keep, rich, chrome, dark);
  }
  /** The pay table: each win with its symbols and what it pays a coin. */
  private paintPayTable(pen: CanvasRenderingContext2D) {
    const g = pen.createLinearGradient(0, 0, 0, 384);
    g.addColorStop(0, "#1a0a3a");
    g.addColorStop(1, "#3a0a4a");
    pen.fillStyle = g;
    pen.fillRect(0, 0, 1024, 384);
    pen.strokeStyle = "#e8b84a";
    pen.lineWidth = 8;
    pen.strokeRect(6, 6, 1012, 372);
    pen.textBaseline = "middle";
    const rows: [number[], string][] = [
      [[6, 6, 6], `${THREE[6]}`],
      [[5, 5, 5], `${THREE[5]}`],
      [[4, 4, 4], `${THREE[4]}`],
      [[3, 3, 3], `${THREE[3]}`],
      [[2, 2, 2], `${THREE[2]}`],
      [[1, 1, 1], `${THREE[1]}`],
      [[0, 0, 0], `${THREE[0]}`],
      [[4, 5, 6], "5"],
      [[0, 0, -1], "5"],
      [[0, -1, -1], "2"],
    ];
    rows.forEach(([symbols, pay], k) => {
      const col = k < 5 ? 0 : 1,
        row = k % 5,
        x = 40 + col * 500,
        y = 50 + row * 70;
      symbols.forEach((s, i) => {
        if (s >= 0) paintSymbol(pen, s, x + 30 + i * 62, y, 56);
        else {
          pen.fillStyle = "rgba(255,255,255,0.35)";
          pen.font = '800 30px "Inter", sans-serif';
          pen.textAlign = "center";
          pen.fillText(k === 7 ? "" : "-", x + 30 + i * 62, y);
        }
      });
      pen.textAlign = "right";
      pen.font = '900 46px "Inter", "Noto Sans KR", sans-serif';
      pen.fillStyle = k === 0 ? "#ffd23a" : "#ffffff";
      pen.fillText(pay, x + 440, y + 2);
      if (k === 7) {
        pen.textAlign = "left";
        pen.font = '700 22px "Noto Sans KR", sans-serif';
        pen.fillStyle = "#ffcf5a";
        pen.fillText("섞어서", x + 214, y + 2);
      }
    });
  }
  /** The deck's five buttons: a chrome ring, a lit cap with its word on top. */
  private deckButtons(keep: Keep) {
    const ringPaint = this.metal("#d8dde4", capable(), 0.2);
    for (const button of BUTTONS) {
      const big = button.key === "spin",
        r = big ? 0.085 : 0.066,
        label = painted(
          128,
          128,
          (pen) => {
            pen.fillStyle = button.colour;
            pen.fillRect(0, 0, 128, 128);
            const g = pen.createRadialGradient(50, 44, 8, 64, 64, 70);
            g.addColorStop(0, "rgba(255,255,255,0.55)");
            g.addColorStop(1, "rgba(255,255,255,0)");
            pen.fillStyle = g;
            pen.fillRect(0, 0, 128, 128);
            pen.font = `900 ${big ? 40 : 38}px "Noto Sans KR", sans-serif`;
            pen.textAlign = "center";
            pen.textBaseline = "middle";
            pen.fillStyle = "#ffffff";
            pen.strokeStyle = "rgba(0,0,0,0.45)";
            pen.lineWidth = 6;
            pen.strokeText(button.label, 64, 68);
            pen.fillText(button.label, 64, 68);
          },
          keep,
        ),
        side = this.standard({ color: button.colour, emissive: button.colour, emissiveIntensity: 0.3, roughness: 0.4 }),
        cap = this.standard({ map: label, emissive: "#ffffff", emissiveMap: label, emissiveIntensity: 0.5, roughness: 0.35 }),
        z = 0.02;
      this.add(new T.CylinderGeometry(r + 0.012, r + 0.012, 0.016, 28), ringPaint, button.x * 1.08, 0.008, z, this.console).castShadow = false;
      // CylinderGeometry's groups: the side, the top, the bottom.
      const mesh = this.add(new T.CylinderGeometry(r, r, 0.03, 28), [side, cap, side], button.x * 1.08, 0.03, z, this.console);
      // The top's picture runs along z: turned a quarter, its word reads across from the player.
      mesh.rotation.y = Math.PI / 2;
      mesh.castShadow = false;
      this.buttons.push({ key: button.key, move: button.move, mesh, cap, pressed: -1 });
    }
  }
  /** The credit display: a strip of lit digits under the window. */
  private display(keep: Keep, winHalf: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 128;
    const texture = keep(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    const screen = this.add(new T.PlaneGeometry(2 * winHalf + 0.1, 0.125), new T.MeshBasicMaterial({ map: texture, toneMapped: false }), 0, REELS.y - 1.5 * REELS.row - 0.13, FRONT + 0.004, this.root);
    this.own(screen.material as T.Material);
    screen.castShadow = false;
    return { canvas, texture, said: "" };
  }
  /** The lever: a chrome arm from a hub on the cabinet's side, a red ball at its end; it turns forward and down as it is pulled. */
  private leverModel(keep: Keep, rich: boolean, chrome: T.Material, dark: T.Material) {
    const hub = this.add(new T.CylinderGeometry(0.07, 0.07, 0.08, 24).rotateZ(Math.PI / 2), chrome, LEVER.x - 0.1, LEVER.y, LEVER.z, this.root);
    hub.castShadow = false;
    this.add(block(0.08, 0.26, 0.26, 0.03), dark, LEVER.x - 0.16, LEVER.y, LEVER.z, this.root).castShadow = false;
    this.lever.position.set(LEVER.x - 0.04, LEVER.y, LEVER.z);
    this.root.add(this.lever);
    const arm = this.add(new T.CylinderGeometry(0.014, 0.018, LEVER.arm, 14), chrome, 0, LEVER.arm / 2, 0, this.lever);
    const knob = this.add(new T.SphereGeometry(0.06, 24, 18), keep(glossy({ color: "#e0141c", roughness: 0.25 }, 1)), 0, LEVER.arm + 0.04, 0, this.lever);
    knob.castShadow = arm.castShadow = rich;
    // A bigger, unseen shape round the ball and the arm, so that a finger finds the lever easily.
    const grip = this.add(new T.CylinderGeometry(0.12, 0.12, LEVER.arm + 0.2, 8), this.own(new T.MeshBasicMaterial({ visible: false })), 0, (LEVER.arm + 0.1) / 2 + 0.05, 0, this.lever);
    this.leverParts = [knob, arm, grip];
  }
  protected subject(aspect: number) {
    return slotSubject(aspect);
  }
  protected spots(): Spot[] {
    return [];
  }
  protected pick(ray: T.Ray) {
    this.caster.ray.copy(ray);
    if (this.caster.intersectObjects(this.leverParts, false).length) return PICK_LEVER;
    const hit = this.caster.intersectObjects(
      this.buttons.map((b) => b.mesh),
      false,
    )[0];
    if (hit) return 2000 + this.buttons.findIndex((b) => b.mesh === hit.object);
    return -1;
  }
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.leverHeld = null;
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  private legal(to: number) {
    return !!this.state && moves(this.state).some((m) => m.to === to);
  }
  /** The lever, the spin button, a tap on the window or the space bar: pull (and spin), or hurry the next reel. */
  private spinOrHurry() {
    const s = this.state;
    if (!s || s.winner !== null) return;
    if (s.pending) {
      if (this.reels.some((r) => r.phase === "spin")) this.onMove({ from: -1, to: HURRY, extra: -1 });
      return;
    }
    if (this.legal(PULL)) this.onMove({ from: -1, to: PULL, extra: -1 });
    else this.onKnock?.("deny", 1);
  }
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    if (!this.running()) return false;
    if (point === PICK_LEVER) {
      this.leverHeld = { y0: at.y, start: this.pull };
      this.tripped = false;
      return true;
    }
    if (point >= 2000 && point < 2000 + this.buttons.length) {
      const button = this.buttons[point - 2000];
      button.pressed = performance.now();
      this.onKnock?.("button", 1);
      if (button.key === "spin") this.spinOrHurry();
      else if (this.legal(button.move)) this.onMove({ from: -1, to: button.move, extra: -1 });
      else this.onKnock?.("deny", 1);
      return true;
    }
    this.spinOrHurry();
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const held = this.leverHeld;
    if (!held) return;
    this.pull = Math.max(0, Math.min(1, held.start + (held.y0 - at.y) / LEVER.travel));
    this.pullV = 0;
    if (this.pull >= TRIP && !this.tripped) {
      this.tripped = true;
      this.onKnock?.("lever", 1);
      this.spinOrHurry();
    }
  }
  protected dragEnd() {
    this.leverHeld = null;
  }
  /** A word that rises over the window and fades. */
  private say(text: string, now: number, colour = "#fff36a") {
    if (capturing()) return;
    const texture = painted(
      512,
      128,
      (pen) => {
        pen.font = '900 84px "Inter", "Noto Sans KR", sans-serif';
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.lineJoin = "round";
        pen.lineWidth = 16;
        pen.strokeStyle = "#5a0a30";
        pen.strokeText(text, 256, 66);
        pen.fillStyle = colour;
        pen.fillText(text, 256, 66);
      },
      (r) => r,
    );
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(0.9, 0.225, 1);
    sprite.renderOrder = 20;
    sprite.position.set(0, REELS.y + 0.05, FRONT + 0.25);
    sprite.userData.from = sprite.position.y;
    this.scene.add(sprite);
    this.words.push({ sprite, at: now });
  }
  /** The reels set going toward `stops`, each stopping in turn. */
  private startSpin(stops: number[], now: number) {
    const fast = this.reducedMotion ? 0.5 : 1;
    this.reels.forEach((reel, r) => {
      reel.phase = "spin";
      reel.speed = this.reducedMotion ? SPEED : -3;
      reel.target = stops[r];
      reel.stopAt = now + (FIRST_STOP + NEXT_STOP * r) * 1000 * fast;
    });
    this.lit = [];
    this.settleAt = 0;
  }
  /** The next reel still turning stops now, and those after it soon after. */
  private hurry(now: number) {
    let at = now;
    for (const reel of this.reels) {
      if (reel.phase !== "spin") {
        if (reel.phase === "brake" || reel.phase === "bounce") at = Math.max(at, reel.t0 + reel.dur * 1000 + HURRIED * 1000);
        continue;
      }
      reel.stopAt = Math.min(reel.stopAt, at);
      at = Math.max(at, reel.stopAt) + HURRIED * 1000;
    }
  }
  private stepReels(now: number, dt: number) {
    let whirr = 0;
    for (const reel of this.reels) {
      if (reel.phase === "spin") {
        reel.speed = Math.min(SPEED, reel.speed + ACCEL * dt);
        reel.p -= reel.speed * dt;
        whirr += Math.max(0, reel.speed) / SPEED;
        if (now >= reel.stopAt && reel.speed > SPEED * 0.6) {
          const speed = reel.speed,
            target = reel.target + N * Math.floor((reel.p - 1.3 - reel.target) / N);
          reel.from = reel.p;
          reel.dur = (2 * (reel.p - target + OVER)) / speed;
          reel.target = target;
          reel.t0 = now;
          reel.phase = "brake";
        }
      } else if (reel.phase === "brake") {
        const u = Math.min(1, (now - reel.t0) / 1000 / reel.dur),
          d = reel.from - reel.target + OVER;
        reel.p = reel.from - d * (1 - (1 - u) * (1 - u));
        whirr += (1 - u) * 0.8;
        if (u >= 1) {
          reel.phase = "bounce";
          reel.t0 = now;
          reel.dur = BOUNCE;
          this.onKnock?.("stop", 1);
        }
      } else if (reel.phase === "bounce") {
        const u = Math.min(1, (now - reel.t0) / 1000 / BOUNCE),
          ease = 1 - (1 - u) * (1 - u) * (1 - u);
        reel.p = reel.target - OVER * (1 - ease);
        if (u >= 1) {
          reel.phase = "rest";
          reel.p = ((reel.target % N) + N) % N;
        }
      }
      const fast = (reel.phase === "spin" && reel.speed > SPEED * 0.5) || (reel.phase === "brake" && (now - reel.t0) / 1000 < reel.dur * 0.55);
      const map = fast ? reel.blur : reel.sharp;
      if (reel.material.map !== map) {
        reel.material.map = reel.material.emissiveMap = map;
        reel.material.needsUpdate = true;
      }
      reel.drum.rotation.x = -reel.p * STEP;
    }
    this.onKnock?.("whirr", Math.min(1, whirr / 2.4));
  }
  private paintDisplay(state: State) {
    const said = `${this.credits}|${stakeOf(state)}|${state.lines}|${state.bet}|${state.pending ? "" : state.paid}`;
    if (said === this.led.said) return;
    this.led.said = said;
    const pen = this.led.canvas.getContext("2d")!;
    pen.fillStyle = "#0a0810";
    pen.fillRect(0, 0, 1024, 128);
    pen.strokeStyle = "#e8b84a";
    pen.lineWidth = 5;
    pen.strokeRect(3, 3, 1018, 122);
    pen.textBaseline = "middle";
    pen.textAlign = "center";
    const cell = (label: string, value: string, x: number, colour: string) => {
      pen.font = '800 22px "Inter", "Noto Sans KR", sans-serif';
      pen.fillStyle = "#ffcf5a";
      pen.fillText(label, x, 26);
      pen.font = '900 64px "Courier New", monospace';
      pen.shadowColor = colour;
      pen.shadowBlur = 14;
      pen.fillStyle = colour;
      pen.fillText(value, x, 82);
      pen.shadowBlur = 0;
    };
    cell("크레딧", String(this.credits).padStart(5, "0"), 190, "#ff4a2a");
    cell(`베팅 ${state.lines}라인×${state.bet}`, String(stakeOf(state)).padStart(3, "0"), 512, "#ffd23a");
    cell("당첨", String(state.pending ? 0 : state.paid).padStart(4, "0"), 834, "#5aff8a");
    this.led.texture.needsUpdate = true;
  }
  private advance(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const state = this.state;
    if (!this.paused && state) {
      if (this.queued) {
        const move = this.queued;
        this.queued = null;
        this.onMove({ from: -1, to: move.to, extra: move.extra });
      }
      this.stepReels(now, dt);
      // Every reel at rest after a spin: the lines that won light, and a moment later the win is paid.
      if (state.pending && this.reels.every((r) => r.phase === "rest")) {
        if (!this.settleAt) {
          this.lit = state.pending.wins;
          this.litAt = now;
          this.settleAt = now + (this.lit.length ? 450 : 150);
          if (this.lit.length) this.onKnock?.(this.lit.some((w) => w.pay >= THREE[5] * state.bet) ? "jackpot" : "win", 1);
        } else if (now >= this.settleAt && this.running()) {
          this.settleAt = 0;
          this.onMove({ from: -1, to: SETTLE, extra: -1 });
        }
      }
    }
    // The credits count up to what they are (down at once, as a bet is taken).
    if (state) {
      if (this.credits > state.credits) this.credits = state.credits;
      else if (this.credits < state.credits && now >= this.nextTick) {
        const gap = state.credits - this.credits;
        this.credits += Math.max(1, Math.ceil(gap / 25));
        this.nextTick = now + 45;
        this.onKnock?.("tick", 0.5);
      }
      this.paintDisplay(state);
      // Coins rattle into the tray, one at a time.
      if (this.coinsOwed > 0 && now >= this.nextCoin) {
        this.coinsOwed--;
        this.nextCoin = now + 55;
        this.flights.push({ start: now, slot: this.trayCount < TRAY_MAX ? this.trayCount : -1, yaw: hash(this.trayCount, 3) * 6.28, x: (hash(this.trayCount, 4) - 0.5) * 0.2 });
        this.trayCount++;
      }
    }
    this.pose(now, dt);
    this.redraw();
  }
  private pose(now: number, dt: number) {
    // The lever: where a drag holds it, else springing back up with a little shake.
    if (!this.leverHeld) {
      const a = -160 * this.pull - 16 * this.pullV;
      this.pullV += a * dt;
      this.pull += this.pullV * dt;
      if (this.pull < 0) {
        this.pull = 0;
        this.pullV = Math.abs(this.pullV) * 0.25;
      }
    }
    this.lever.rotation.x = this.pull * 1.55;
    // The buttons: pressed in for a moment; lit while what they do may be done.
    for (const b of this.buttons) {
      const age = now - b.pressed,
        dip = b.pressed >= 0 && age < 160 ? Math.sin((age / 160) * Math.PI) * 0.014 : 0;
      b.mesh.position.y = 0.03 - dip;
      const on = b.key === "spin" ? !!this.state && this.state.winner === null && (!!this.state.pending || this.legal(PULL)) : this.legal(b.move);
      b.cap.emissiveIntensity = on ? (b.key === "spin" && !this.state?.pending ? 0.55 + 0.25 * Math.sin(now / 220) : 0.5) : 0.08;
    }
    // The lines: those played lit by their numbers; after a spin the winners blink; a change of lines shows them all.
    const s = this.state,
      blink = Math.floor((now - this.litAt) / 260) % 2 === 0;
    this.lineBars.forEach((paint, line) => {
      const won = this.lit.some((w) => w.line === line);
      paint.opacity = won ? (blink ? 0.95 : 0.35) : now < this.showLinesUntil && s && line < s.lines ? 0.75 : 0;
    });
    this.lineLamps.forEach((lamp, line) => (lamp.emissiveIntensity = s && line < s.lines ? (this.lit.some((w) => w.line === line) && blink ? 3 : 1.4) : 0.08));
    // The bulbs chase round the sign: slowly at rest, quickly while the reels turn, all flashing after a big win.
    const spinning = this.reels.some((r) => r.phase !== "rest"),
      partying = now < this.party,
      round = Math.floor(now / (spinning ? 70 : 160));
    this.bulbs.forEach((paint, k) => {
      paint.emissiveIntensity = partying ? (Math.floor(now / 110) % 2 === (k % 2) ? 2.6 : 0.2) : (k + round) % 4 === 0 ? 2 : 0.35;
    });
    const breathe = 1.8 + Math.sin(now / 900) * 0.35;
    for (const paint of this.neon) paint.emissiveIntensity = breathe;
    // Coins: out of the mouth, a hop over the lip, down onto the heap.
    const { q, e, p, s: scale, m, v } = this.spare;
    let n = 0;
    const setCoin = (x: number, y: number, z: number, tilt: number, yaw: number) => {
      q.setFromEuler(e.set(tilt, yaw, 0));
      scale.set(COIN / COIN_R, (COIN * 0.18) / COIN_H, COIN / COIN_R);
      this.coins.setMatrixAt(n++, m.compose(p.set(x, y, z), q, scale));
    };
    for (let k = 0; k < Math.min(this.trayShown, TRAY_MAX); k++) {
      trayRest(k, v);
      setCoin(v.x, v.y, v.z, (hash(k, 5) - 0.5) * 0.5, hash(k, 6) * 6.28);
    }
    this.flights = this.flights.filter((f) => {
      const u = (now - f.start) / 420;
      if (u >= 1) {
        if (f.slot >= 0) this.trayShown = Math.max(this.trayShown, f.slot + 1);
        this.onKnock?.("coin", 0.6);
        return false;
      }
      trayRest(Math.max(0, f.slot), v);
      const x = f.x + (v.x - f.x) * u,
        y = TRAY.y + 0.12 + (v.y - TRAY.y - 0.12) * u + Math.sin(Math.PI * u) * 0.05,
        z = FRONT + 0.01 + (v.z - FRONT - 0.01) * u;
      if (n < this.coins.instanceMatrix.count) setCoin(x, y, z, u * 9, f.yaw);
      return true;
    });
    this.coins.count = n;
    this.coins.instanceMatrix.needsUpdate = true;
    this.words = this.words.filter((word) => {
      const age = (now - word.at) / 1800;
      if (age >= 1) {
        word.sprite.removeFromParent();
        (word.sprite.material as T.SpriteMaterial).map?.dispose();
        word.sprite.material.dispose();
        return false;
      }
      word.sprite.position.y = word.sprite.userData.from + age * 0.25;
      (word.sprite.material as T.SpriteMaterial).opacity = Math.min(1, (1 - age) * 3);
      return true;
    });
    this.expose();
  }
  /** For browser tests: the reels, whether they turn, the lever's pull and where on the canvas the lever and the buttons are. */
  private expose() {
    const el = this.renderer.domElement,
      d = el.dataset;
    d.reels = this.reels.map((r) => Math.round(((r.p % N) + N) % N)).join(",");
    d.spinning = String(this.reels.some((r) => r.phase !== "rest"));
    d.lever = this.pull.toFixed(2);
    if (!d.points || this.dirtyPoints) {
      this.dirtyPoints = false;
      const at = (o: T.Object3D) => {
        const w = o.getWorldPosition(new T.Vector3()).project(this.camera);
        return [Math.round(((w.x + 1) / 2) * el.clientWidth), Math.round(((1 - w.y) / 2) * el.clientHeight)];
      };
      const points: Record<string, number[]> = { lever: at(this.leverParts[0]) };
      for (const b of this.buttons) points[b.key] = at(b.mesh);
      const window = new T.Object3D();
      window.position.set(0, REELS.y, FRONT);
      points.window = at(window);
      d.points = JSON.stringify(points);
    }
  }
  private dirtyPoints = true;
  protected resize() {
    super.resize();
    // On a short wide screen (a phone held sideways) the eye comes closer and looks a little higher: the window, the
    // display, the buttons and the lever fill the height, the tray below and the sign's top may leave it.
    if (this.camera.aspect > 1.9) {
      const look = new T.Vector3(0, slotSubject(this.camera.aspect).lookY, 0),
        lift = new T.Vector3(0, WIDE_LIFT, 0);
      this.camera.position.sub(look).multiplyScalar(WIDE_NEAR).add(look).add(lift);
      this.camera.lookAt(look.add(lift));
      this.camera.updateMatrixWorld();
    }
    this.dirtyPoints = true;
  }
  protected place(state: State) {
    const now = performance.now(),
      anew = state.mode !== this.mode || (state.ply === 0 && this.shown > 0);
    if (anew) {
      this.mode = state.mode;
      this.credits = state.credits;
      // A game under way (a view made afresh) shows its reels where they stand; a spin's win is then paid at once.
      const stops = state.pending?.stops ?? state.shown;
      this.reels.forEach((reel, r) => Object.assign(reel, { p: stops[r], phase: "rest", speed: 0 }));
      this.lit = [];
      this.flights = [];
      this.trayCount = this.trayShown = this.coinsOwed = 0;
      for (const word of this.words) word.sprite.removeFromParent();
      this.words = [];
      this.settleAt = 0;
      this.queued = null;
    } else if (state.ply === this.shown + 1 && state.last !== null) {
      const last = state.last;
      if (last === PULL) {
        if (!this.leverHeld && this.pull < 0.3) this.pullV = 9;
        this.queued = { to: SPIN, extra: packStops(drawStops(cryptoRandom)) };
      } else if (last === SPIN && state.pending) {
        this.startSpin(state.pending.stops, now);
        this.showLinesUntil = 0;
      } else if (last === HURRY) this.hurry(now);
      else if (last === SETTLE) {
        if (state.paid > 0) {
          this.coinsOwed += Math.min(60, Math.ceil(state.paid / Math.max(1, state.bet)));
          const big = state.paid >= THREE[5] * state.bet,
            fine = state.paid >= 20 * stakeOf(state);
          this.say(big ? `잭팟! +${state.paid}` : `+${state.paid}`, now, big ? "#ffd23a" : "#fff36a");
          if (big || fine) {
            this.party = now + (big ? 4500 : 2200);
            this.onKnock?.("big", 1);
          }
        }
      } else if (last === LINE_MOVE || (last > LINE_MOVE && last <= LINE_MOVE + 5) || last === MAX || last === BET || (last > BET && last <= BET + 10)) {
        this.showLinesUntil = now + 1200;
        this.lit = [];
      }
    }
    this.shown = state.ply;
    this.paintDisplay(state);
  }
  protected animate() {
    return false;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    this.onKnock?.("whirr", 0);
    for (const word of this.words) {
      (word.sprite.material as T.SpriteMaterial).map?.dispose();
      word.sprite.material.dispose();
    }
    super.dispose();
  }
}
/** The names of the symbols of a line, for words. */
export const lineWords = (w: LineWin) => w.symbols.map((s) => SYMBOLS[s]).join(" ");
