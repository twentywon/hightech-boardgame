import * as T from "three";
import { cryptoRandom } from "../../core/random";
import { block, capable, glossy } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import { COIN_H, COIN_R, coinGeometry, coinMaterials } from "../indian/coins";
import type { Marks } from "../points/view";
import { TableView, type Spot } from "../table/view";
import { arcadeRoom, painted } from "./arcade";
import { BASE, pusherSubject } from "./layout";
import { BATCH, BONUS, DROP, HOLD, LET, LOST, MODES, SETTLED, SLIDE, STOP, WON, type State } from "./rules";
import { AIMS, CHUTE, DT, FIELD, H, MAX, PRIZES, PUSHER, R, aimX, createWorld, drop, placeAt, step, type Happening, type World } from "./sim";

export const COIN_COLORS: [string, string] = ["#e0b44a", "#c8321f"];
/** Seconds between coins while a press (or the button, or the space bar) is held. */
export const HOLD_EVERY = 0.3;
/** Seconds between steps of the chute while a key or button pushes it. */
const SLIDE_EVERY = 0.07;
/** The room's floor, under the machine (in the machine's own heights). */
const ROOM = -1.62;
/** The tray before the machine where coins won come out: its middle, its floor's height, its size inside. */
const TRAY = { z: FIELD.front + 0.66, y: -0.8, w: 1.9, d: 0.46 };
const TRAY_MAX = 320;
/** How long a coin won takes from the front edge to its place in the tray (s). */
const FLY = 0.62;
/** The cabinet: half its width outside, the side panels' inner faces, the hood's underside, the glass's foot and top. */
const CAB = { x: 2.05, side: FIELD.w + 0.25, hood: 1.75, back: -2.05, glassFoot: { y: 0.1, z: FIELD.front + 0.1 }, glassTop: { y: 1.75, z: -0.75 } };
/** The roulette on the back wall: its middle and radius. */
const WHEEL = { y: 1.07, z: FIELD.wall + 0.01, r: 0.42 };
/** Labels of the roulette's lamps, in the order of `PRIZES`. */
const LAMP_TEXT = PRIZES.map((p) => (p.jackpot ? "★" + p.shower : p.hand ? "+" + p.hand : String(p.shower)));
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
interface Flight {
  start: number;
  x: number;
  z: number;
  kind: number;
  /** Its place in the tray, or -1 when the tray shows no more. */
  slot: number;
  yaw: number;
}
/** Where the `index`-th coin won lies in the tray: a loose heap, highest in the middle. */
function trayRest(index: number, out: { p: T.Vector3; tilt: T.Vector3; yaw: number }) {
  const per = 34,
    layer = Math.floor(index / per),
    // Each layer filled in a scattered order, so that the heap grows all over and not from one end.
    k = (index * 13 + layer * 5) % per,
    shrink = Math.max(0.35, 1 - layer * 0.12),
    u = (k % 17) / 16 - 0.5 + (hash(index, 1) - 0.5) * 0.06,
    v = Math.floor(k / 17) - 0.5 + (hash(index, 2) - 0.5) * 0.5;
  out.p.set(u * (TRAY.w - 2 * R) * shrink, TRAY.y + H / 2 + layer * H * 0.95, TRAY.z + v * (TRAY.d - 2 * R) * 0.9 * shrink);
  out.tilt.set((hash(index, 3) - 0.5) * 0.5, 0, (hash(index, 4) - 0.5) * 0.5);
  out.yaw = hash(index, 5) * Math.PI * 2;
  return out;
}
/** The paint of a prize token: a red enamel face with a gold star in a white ring, on a gold rim. */
function tokenMaterials(keep: <R extends { dispose(): void }>(r: R) => R, rich: boolean): [T.Material, T.Material] {
  const face = painted(
    256,
    256,
    (pen) => {
      const m = 128,
        g = pen.createRadialGradient(100, 90, 10, m, m, 128);
      g.addColorStop(0, "#ff7a6a");
      g.addColorStop(0.6, "#d8261c");
      g.addColorStop(1, "#7a0c08");
      pen.fillStyle = g;
      pen.fillRect(0, 0, 256, 256);
      pen.lineWidth = 10;
      pen.strokeStyle = "#fff4e0";
      pen.beginPath();
      pen.arc(m, m, 96, 0, Math.PI * 2);
      pen.stroke();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        pen.fillStyle = "#ffd23a";
        pen.beginPath();
        pen.arc(m + Math.cos(a) * 112, m + Math.sin(a) * 112, 5, 0, Math.PI * 2);
        pen.fill();
      }
      pen.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5,
          r = i % 2 ? 30 : 74;
        pen.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
      }
      pen.closePath();
      const gold = pen.createLinearGradient(0, 60, 0, 200);
      gold.addColorStop(0, "#fff0a0");
      gold.addColorStop(1, "#d99a1c");
      pen.fillStyle = gold;
      pen.fill();
      pen.lineWidth = 5;
      pen.strokeStyle = "#8a5a10";
      pen.stroke();
    },
    keep,
  );
  return [
    keep(new T.MeshStandardMaterial({ color: "#e8b84a", metalness: rich ? 0.85 : 0.35, roughness: rich ? 0.3 : 0.45 })),
    keep(new T.MeshStandardMaterial({ map: face, metalness: rich ? 0.3 : 0.1, roughness: 0.4, emissive: "#ff3020", emissiveIntensity: 0.12 })),
  ];
}
/**
 * A coin pusher in an amusement arcade, seen from where a player stands before it through the front glass: the
 * coins (hundreds of them, drawn as instances) on the lower playfield and on top of the sliding pusher, the chute at
 * the top of the back wall that the player sets across, the lamp roulette above it, side gutters, and the tray in
 * front where coins won pour out, with the counters over it. The view plays the machine in real time (`sim.ts`): a
 * press anywhere on the machine sets the chute over that column and drops a coin, held it goes on dropping; what
 * falls is reported to the screen as moves.
 */
export class CoinPusherView extends TableView<State> {
  private world: World;
  private mode = "30";
  private root = new T.Group();
  private gold: T.InstancedMesh;
  private tokens: T.InstancedMesh;
  private tray: T.InstancedMesh;
  private trayShown = 0;
  private trayCount = 0;
  private pusher!: T.Mesh;
  private carriage = new T.Group();
  private carriageX = 0;
  private lamps: T.MeshStandardMaterial[] = [];
  private marquee: T.MeshStandardMaterial[] = [];
  private neon: T.MeshStandardMaterial[] = [];
  private led!: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private flights: Flight[] = [];
  private words: { sprite: T.Sprite; at: number }[] = [];
  private paused = false;
  private shown = 0;
  private aim = 12;
  /** A held key or button keeps dropping coins; so does a held press on the machine; a first coin is owed at once. */
  private holding = false;
  private pressing = false;
  private owed = false;
  private nextDrop = 0;
  /** The way the chute is being pushed by a held key or button (-1 left, 1 right), and when it steps on. */
  private sliding = 0;
  private nextSlide = 0;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  private clinkAt = 0;
  /** What the machine is heard doing: coins clinking (`clink`), into the chute (`drop`), into the tray (`tray`, `rattle`), the roulette (`tick`, `stop`, `bonus`, `jackpot`). */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  private spare = { q: new T.Quaternion(), y: new T.Quaternion(), n: new T.Vector3(), p: new T.Vector3(), s: new T.Vector3(), m: new T.Matrix4(), axis: new T.Vector3(), e: new T.Euler() };
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#0d0a1e");
    const rich = capable();
    this.world = createWorld(30, cryptoRandom);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.scene.add(new T.HemisphereLight("#d8d0ff", "#2a1a3a", 1.5));
    const sun = new T.DirectionalLight("#fff1dc", 1.7);
    sun.position.set(-1.5, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -4;
    sun.shadow.camera.right = sun.shadow.camera.top = 4;
    sun.shadow.normalBias = 0.015;
    sun.shadow.bias = -0.0005;
    this.own(sun.shadow);
    this.scene.add(sun);
    // A lamp under the hood: the coins shine.
    // Only where a graphics card draws: under software every lit pixel of the room paid for it.
    if (rich) {
      const lamp = new T.PointLight("#fff4dc", 7, 7, 1.4);
      lamp.position.set(0, BASE + CAB.hood - 0.12, -0.3);
      this.scene.add(lamp);
    }
    this.neon = arcadeRoom(this.scene, keep, BASE + ROOM);
    this.root.position.y = BASE;
    this.scene.add(this.root);
    this.cabinet(keep, rich);
    // The coins: one shape for all, in instances by paint (gold coins, red tokens, and the gold heap in the tray).
    const shape = keep(coinGeometry(rich ? 40 : 16)),
      goldPaint = coinMaterials(2, keep, rich);
    this.gold = new T.InstancedMesh(shape, goldPaint, MAX + 80);
    this.tokens = new T.InstancedMesh(shape, tokenMaterials(keep, rich), 80);
    this.tray = new T.InstancedMesh(shape, goldPaint, TRAY_MAX);
    for (const mesh of [this.gold, this.tokens, this.tray]) {
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = rich;
      mesh.receiveShadow = true;
      mesh.count = 0;
      this.root.add(mesh);
      keep({ dispose: () => mesh.dispose() });
    }
    this.tray.instanceMatrix.setUsage(T.StaticDrawUsage);
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -BASE);
    // Under software there are no shadows: each pixel's look into the shadow map cost more than the whole machine.
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
  /**
   * The machine: the base and its apron with the counters and the tray, the playfield with its gutters and front
   * lip, the pusher, the side panels, the back wall with the roulette and the chute's rail, the glass, the hood with
   * its lamps and the sign with bulbs.
   */
  private cabinet(keep: <R extends { dispose(): void }>(r: R) => R, rich: boolean) {
    const root = this.root,
      body = keep(glossy({ color: "#1d2a8c", roughness: 0.35 }, 0.6)),
      trim = this.metal("#e8b84a", rich, 0.3),
      chrome = this.metal("#d8dde4", rich, 0.2),
      dark = this.standard({ color: "#0c0a14", roughness: 0.9 }),
      { front, w: W, gap, wall } = FIELD;
    const put = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number) => this.add(geometry, material, x, y, z, root);
    // The base: from the room's floor to the playfield, and the apron that leans back under the front edge.
    put(block(2 * CAB.x, -0.05 - ROOM, CAB.back * -1 + front - 0.05, 0.08), body, 0, (ROOM - 0.05) / 2, (CAB.back + front - 0.05) / 2);
    for (const side of [-1, 1]) {
      put(block(0.16, -ROOM + CAB.hood + 0.5, 0.2, 0.05), trim, side * (CAB.x - 0.04), (ROOM + CAB.hood + 0.5) / 2, front + 0.06);
      // A neon strip up each front post.
      const strip = this.standard({ color: "#ff3fa4", emissive: "#ff3fa4", emissiveIntensity: 2 });
      this.neon.push(strip);
      put(new T.BoxGeometry(0.04, -ROOM + CAB.hood + 0.3, 0.03), strip, side * (CAB.x - 0.04), (ROOM + CAB.hood + 0.3) / 2, front + 0.17).castShadow = false;
    }
    // The apron: the counters, the win chute's mouth and the tray.
    const apron = put(block(2 * CAB.x - 0.3, 0.62, 0.1, 0.03), body, 0, -0.33, front + 0.08);
    apron.rotation.x = -0.32;
    this.led = this.counters(keep);
    put(block(TRAY.w + 0.2, 0.06, TRAY.d + 0.24, 0.03), chrome, 0, TRAY.y - 0.03, TRAY.z);
    for (const side of [-1, 1]) {
      put(block(0.06, 0.18, TRAY.d + 0.24, 0.025), chrome, side * (TRAY.w / 2 + 0.07), TRAY.y + 0.06, TRAY.z);
      put(block(TRAY.w + 0.2, 0.16, 0.05, 0.02), chrome, 0, TRAY.y + 0.05, TRAY.z + side * (TRAY.d / 2 + 0.1));
    }
    put(new T.PlaneGeometry(TRAY.w, 0.16), dark, 0, TRAY.y + 0.1, TRAY.z - TRAY.d / 2 - 0.07).castShadow = false;
    put(block(2 * CAB.x - 0.2, 0.24, TRAY.d + 0.5, 0.05), body, 0, TRAY.y - 0.18, TRAY.z);
    // The playfield's floor: deep blue with a gold sunburst, a row of stars, the front edge marked in gold.
    const field = painted(
      1024,
      1024,
      (pen) => {
        const g = pen.createLinearGradient(0, 0, 0, 1024);
        g.addColorStop(0, "#0d1a5a");
        g.addColorStop(1, "#1d3aa0");
        pen.fillStyle = g;
        pen.fillRect(0, 0, 1024, 1024);
        pen.save();
        pen.translate(512, 1024);
        for (let k = 0; k < 24; k++) {
          pen.rotate(Math.PI / 24);
          pen.fillStyle = k % 2 ? "rgba(255,210,80,0.12)" : "rgba(120,170,255,0.08)";
          pen.beginPath();
          pen.moveTo(0, 0);
          pen.lineTo(-1400, -30);
          pen.lineTo(-1400, 30);
          pen.fill();
        }
        pen.restore();
        for (let k = 0; k < 9; k++) {
          const x = 70 + k * 110,
            y = 880;
          pen.fillStyle = "rgba(255,214,90,0.5)";
          pen.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5,
              r = i % 2 ? 12 : 28;
            pen.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          }
          pen.fill();
        }
        pen.fillStyle = "#e8b84a";
        pen.fillRect(0, 1000, 1024, 24);
      },
      keep,
    );
    const floor = put(new T.PlaneGeometry(2 * W, front - wall).rotateX(-Math.PI / 2), this.standard({ map: field, roughness: 0.35, metalness: 0.1 }), 0, 0, (front + wall) / 2);
    floor.castShadow = false;
    // The front lip, a chrome bar the coins tip over, and the dark mouth of the win chute under it.
    put(new T.CylinderGeometry(0.022, 0.022, 2 * W, 16).rotateZ(Math.PI / 2), chrome, 0, -0.018, front + 0.012).castShadow = false;
    // The gutters: dark slots beside the field where the side walls end, each with a red lamp along it.
    const gutter = this.standard({ color: "#05040a", roughness: 1, side: T.BackSide });
    for (const side of [-1, 1]) {
      put(new T.BoxGeometry(CAB.side - W, 0.9, front - gap), gutter, side * (W + CAB.side) / 2, -0.45, (front + gap) / 2).castShadow = false;
      const warn = this.standard({ color: "#ff2a2a", emissive: "#ff2a2a", emissiveIntensity: 1.4 });
      this.neon.push(warn);
      put(new T.BoxGeometry(0.02, 0.012, front - gap), warn, side * (CAB.side - 0.01), 0.004, (front + gap) / 2).castShadow = false;
      // Clear side walls from the back to where the gutters open, with a chrome top.
      const acrylic = this.own(new T.MeshStandardMaterial({ color: "#dff0ff", roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }));
      put(new T.BoxGeometry(0.03, 0.5, gap - wall), acrylic, side * (W + 0.015), 0.25, (gap + wall) / 2).castShadow = false;
      put(block(0.05, 0.03, gap - wall, 0.012), chrome, side * (W + 0.02), 0.5, (gap + wall) / 2);
    }
    // The pusher: a chrome-sided block, its top painted like the field, its face striped.
    const face = painted(
      512,
      64,
      (pen) => {
        pen.fillStyle = "#e8b84a";
        pen.fillRect(0, 0, 512, 64);
        pen.fillStyle = "#c8321f";
        for (let x = -64; x < 576; x += 48) {
          pen.beginPath();
          pen.moveTo(x, 64);
          pen.lineTo(x + 24, 0);
          pen.lineTo(x + 48, 0);
          pen.lineTo(x + 24, 64);
          pen.fill();
        }
      },
      keep,
    );
    const top = painted(
      512,
      256,
      (pen) => {
        pen.fillStyle = "#16288a";
        pen.fillRect(0, 0, 512, 256);
        pen.strokeStyle = "rgba(255,214,90,0.35)";
        pen.lineWidth = 6;
        for (let y = 20; y < 256; y += 40) {
          pen.beginPath();
          pen.moveTo(0, y);
          pen.lineTo(512, y);
          pen.stroke();
        }
      },
      keep,
    );
    const depth = 1.7,
      sideMetal = chrome;
    this.pusher = put(new T.BoxGeometry(2 * W - 0.01, PUSHER.top, depth), [sideMetal, sideMetal, this.standard({ map: top, roughness: 0.4 }), sideMetal, this.standard({ map: face, roughness: 0.45 }), sideMetal], 0, PUSHER.top / 2, PUSHER.back - depth / 2);
    // Side panels from the base to the hood, their front edge under the glass's slope.
    const panel = painted(
      256,
      256,
      (pen) => {
        const g = pen.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, "#2a1a8a");
        g.addColorStop(1, "#14105a");
        pen.fillStyle = g;
        pen.fillRect(0, 0, 256, 256);
        const random = (s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)(5);
        for (let k = 0; k < 40; k++) {
          pen.fillStyle = `rgba(255,${200 + Math.floor(random() * 55)},120,${0.3 + random() * 0.5})`;
          pen.beginPath();
          pen.arc(random() * 256, random() * 256, 1 + random() * 2.5, 0, Math.PI * 2);
          pen.fill();
        }
      },
      keep,
    );
    const outline = new T.Shape();
    outline.moveTo(-CAB.back, 0);
    outline.lineTo(-CAB.glassFoot.z, 0);
    outline.lineTo(-CAB.glassFoot.z, CAB.glassFoot.y);
    outline.lineTo(-CAB.glassTop.z, CAB.glassTop.y);
    outline.lineTo(-CAB.back, CAB.glassTop.y);
    outline.closePath();
    const sideShape = new T.ExtrudeGeometry(outline, { depth: CAB.x - CAB.side, bevelEnabled: false });
    sideShape.rotateY(Math.PI / 2);
    const uv = sideShape.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
    const sidePaint = this.standard({ map: panel, roughness: 0.5 });
    for (const side of [-1, 1]) {
      const mesh = put(sideShape.clone(), sidePaint, side < 0 ? -CAB.x : CAB.side, 0, 0);
      mesh.castShadow = false;
    }
    sideShape.dispose();
    // The back wall over the pusher's top, with the roulette, and the chute's rail and carriage in front of it.
    const back = painted(
      1024,
      512,
      (pen) => {
        const g = pen.createRadialGradient(512, 300, 20, 512, 300, 620);
        g.addColorStop(0, "#3a52d8");
        g.addColorStop(1, "#0d1450");
        pen.fillStyle = g;
        pen.fillRect(0, 0, 1024, 512);
        pen.save();
        pen.translate(512, 300);
        for (let k = 0; k < 32; k++) {
          pen.rotate(Math.PI / 16);
          pen.fillStyle = k % 2 ? "rgba(255,220,120,0.10)" : "rgba(255,255,255,0.04)";
          pen.beginPath();
          pen.moveTo(0, 0);
          pen.lineTo(700, -40);
          pen.lineTo(700, 40);
          pen.fill();
        }
        pen.restore();
      },
      keep,
    );
    const wallHeight = CAB.hood - PUSHER.top - 0.004;
    put(block(2 * CAB.side, wallHeight, 0.2, 0.02), [this.standard({ color: "#0d1450" }), this.standard({ color: "#0d1450" }), this.standard({ color: "#0d1450" }), this.standard({ color: "#0d1450" }), this.standard({ map: back, roughness: 0.6 }), this.standard({ color: "#0d1450" })], 0, PUSHER.top + 0.004 + wallHeight / 2, wall - 0.1).castShadow = false;
    put(block(2 * CAB.side, 0.04, 0.05, 0.015), trim, 0, PUSHER.top + 0.03, wall + 0.02);
    this.roulette(keep);
    // The chute's rail across, and the carriage that runs on it: a gold hopper with a lip the coin leaves by.
    put(new T.CylinderGeometry(0.025, 0.025, 2 * W, 12).rotateZ(Math.PI / 2), chrome, 0, CHUTE.y + 0.13, CHUTE.z - 0.12);
    const hopper = keep(glossy({ color: "#f0c24a", metalness: rich ? 0.8 : 0.35, roughness: 0.25 }, 0.6));
    this.add(new T.CylinderGeometry(R * 1.35, R * 0.9, 0.16, 20, 1, true), hopper, 0, CHUTE.y + 0.1, -0.06, this.carriage);
    this.add(block(R * 2.1, 0.035, 0.22, 0.012), hopper, 0, CHUTE.y + 0.01, 0.04, this.carriage).rotation.x = 0.35;
    this.add(new T.SphereGeometry(0.035, 12, 8), this.standard({ color: "#7dff6a", emissive: "#7dff6a", emissiveIntensity: 2 }), 0, CHUTE.y + 0.2, -0.06, this.carriage);
    this.carriage.position.z = CHUTE.z;
    root.add(this.carriage);
    // The glass from the front lip up to the hood, with two streaks of light on it.
    const run = Math.hypot(CAB.glassTop.z - CAB.glassFoot.z, CAB.glassTop.y - CAB.glassFoot.y),
      lean = Math.atan2(CAB.glassFoot.z - CAB.glassTop.z, CAB.glassTop.y - CAB.glassFoot.y),
      glass = this.own(new T.MeshStandardMaterial({ color: "#eaf4ff", roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.08, depthWrite: false, side: T.DoubleSide })),
      streak = this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.06, depthWrite: false })),
      midY = (CAB.glassTop.y + CAB.glassFoot.y) / 2,
      midZ = (CAB.glassTop.z + CAB.glassFoot.z) / 2;
    const pane = put(new T.PlaneGeometry(2 * CAB.side, run), glass, 0, midY, midZ);
    pane.rotation.x = -lean;
    pane.castShadow = false;
    for (const [x, wide] of [[-1.1, 0.42], [-0.45, 0.14], [1.3, 0.2]] as const) {
      const band = put(new T.PlaneGeometry(wide, run * 1.05), streak, x, midY, midZ + 0.005);
      band.rotation.set(-lean, 0, -0.45, "XYZ");
      band.castShadow = false;
    }
    put(block(2 * CAB.side + 0.1, 0.05, 0.08, 0.02), trim, 0, CAB.glassFoot.y, CAB.glassFoot.z).castShadow = false;
    // The hood: over the glass to the back, a strip of light under its front, the sign and its bulbs on top.
    put(block(2 * CAB.x, 0.36, CAB.glassTop.z - CAB.back + 0.2, 0.06), body, 0, CAB.hood + 0.18, (CAB.glassTop.z + CAB.back + 0.2) / 2);
    const strip = this.standard({ color: "#fff6dc", emissive: "#fff6dc", emissiveIntensity: 1.5 });
    put(new T.BoxGeometry(2 * CAB.side - 0.1, 0.03, 0.05), strip, 0, CAB.hood - 0.02, CAB.glassTop.z - 0.06).castShadow = false;
    const signFace = () =>
      painted(
        1024,
        256,
        (pen) => {
          const g = pen.createLinearGradient(0, 0, 0, 256);
          g.addColorStop(0, "#ff4fa8");
          g.addColorStop(1, "#b01462");
          pen.fillStyle = g;
          pen.fillRect(0, 0, 1024, 256);
          pen.font = '900 150px "Inter", "Noto Sans KR", sans-serif';
          pen.textAlign = "center";
          pen.textBaseline = "middle";
          pen.lineJoin = "round";
          pen.lineWidth = 26;
          pen.strokeStyle = "#5a0a30";
          pen.strokeText("코인 푸셔", 512, 136);
          const gold = pen.createLinearGradient(0, 60, 0, 210);
          gold.addColorStop(0, "#fff6b0");
          gold.addColorStop(1, "#ffb81c");
          pen.fillStyle = gold;
          pen.fillText("코인 푸셔", 512, 136);
        },
        keep,
      );
    const sign = put(block(2 * CAB.x - 0.2, 0.62, 0.16, 0.05), [body, body, body, body, this.standard({ map: signFace(), emissive: "#ffffff", emissiveMap: signFace(), emissiveIntensity: 0.35, roughness: 0.5 }), body], 0, CAB.hood + 0.68, CAB.glassTop.z - 0.02);
    sign.rotation.x = -0.18;
    const bulb = keep(new T.SphereGeometry(0.045, 10, 8));
    for (let k = 0; k < 22; k++) {
      const paint = this.standard({ color: "#fff6c0", emissive: "#ffd04a", emissiveIntensity: 1 });
      this.marquee.push(paint);
      const x = -CAB.x + 0.2 + (k * (2 * CAB.x - 0.4)) / 21;
      for (const y of [CAB.hood + 0.4, CAB.hood + 0.97]) {
        const m = put(bulb, paint, x, y, CAB.glassTop.z + 0.08 + (y > CAB.hood + 0.5 ? -0.1 : 0));
        m.castShadow = false;
      }
    }
  }
  /** The roulette: a disc of eight coloured fields with their prizes, a bulb at each, and a gold rim. */
  private roulette(keep: <R extends { dispose(): void }>(r: R) => R) {
    const lamps = PRIZES.length,
      disc = painted(
        512,
        512,
        (pen) => {
          const m = 256;
          for (let k = 0; k < lamps; k++) {
            const a0 = -Math.PI / 2 + ((k - 0.5) * Math.PI * 2) / lamps,
              a1 = a0 + (Math.PI * 2) / lamps;
            pen.fillStyle = PRIZES[k].jackpot ? "#ffd23a" : ["#e02a5a", "#2a9ae0", "#2ac06a", "#a046e0"][k % 4];
            pen.beginPath();
            pen.moveTo(m, m);
            pen.arc(m, m, 250, a0, a1);
            pen.fill();
            pen.save();
            pen.translate(m, m);
            pen.rotate(a0 + Math.PI / lamps + Math.PI / 2);
            pen.font = '900 64px "Inter", "Noto Sans KR", sans-serif';
            pen.textAlign = "center";
            pen.textBaseline = "middle";
            pen.lineWidth = 10;
            pen.strokeStyle = "rgba(0,0,0,0.45)";
            pen.strokeText(LAMP_TEXT[k], 0, -150);
            pen.fillStyle = PRIZES[k].jackpot ? "#7a1450" : "#ffffff";
            pen.fillText(LAMP_TEXT[k], 0, -150);
            pen.restore();
          }
          pen.fillStyle = "#14105a";
          pen.beginPath();
          pen.arc(m, m, 82, 0, Math.PI * 2);
          pen.fill();
          pen.lineWidth = 8;
          pen.strokeStyle = "#ffd23a";
          pen.stroke();
          pen.font = '900 46px "Inter", "Noto Sans KR", sans-serif';
          pen.textAlign = "center";
          pen.textBaseline = "middle";
          pen.fillStyle = "#ffd23a";
          pen.fillText("BONUS", m, m + 2);
        },
        keep,
      );
    const face = this.add(new T.CircleGeometry(WHEEL.r, 48), this.standard({ map: disc, roughness: 0.5, emissive: "#ffffff", emissiveMap: disc, emissiveIntensity: 0.22 }), 0, WHEEL.y, WHEEL.z + 0.004, this.root);
    face.castShadow = false;
    const rim = this.add(new T.TorusGeometry(WHEEL.r, 0.03, 8, 48), this.metal("#e8b84a", capable(), 0.3), 0, WHEEL.y, WHEEL.z + 0.01, this.root);
    rim.castShadow = false;
    const bulb = this.own(new T.SphereGeometry(0.05, 12, 10));
    for (let k = 0; k < lamps; k++) {
      const a = Math.PI / 2 - (k * Math.PI * 2) / lamps,
        paint = this.standard({ color: "#fff6dc", emissive: "#ffe27a", emissiveIntensity: 0.2 });
      this.lamps.push(paint);
      this.add(bulb, paint, Math.cos(a) * (WHEEL.r + 0.07), WHEEL.y + Math.sin(a) * (WHEEL.r + 0.07), WHEEL.z + 0.04, this.root).castShadow = false;
    }
  }
  /** The counters on the apron: coins in hand (or put in, without end) and coins won, in lit digits. */
  private counters(keep: <R extends { dispose(): void }>(r: R) => R) {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 160;
    const texture = keep(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    const screen = this.add(new T.PlaneGeometry(1.7, 0.354), new T.MeshBasicMaterial({ map: texture, toneMapped: false }), 0, -0.3, FIELD.front + 0.14, this.root);
    this.own(screen.material as T.Material);
    screen.rotation.x = -0.32;
    screen.castShadow = false;
    return { canvas, texture, said: "" };
  }
  private lights(state: State) {
    const said = `${state.endless}|${state.hand}|${state.dropped}|${state.won}`;
    if (said === this.led.said) return;
    this.led.said = said;
    const pen = this.led.canvas.getContext("2d")!;
    pen.fillStyle = "#0a0810";
    pen.fillRect(0, 0, 768, 160);
    pen.strokeStyle = "#e8b84a";
    pen.lineWidth = 6;
    pen.strokeRect(3, 3, 762, 154);
    pen.textBaseline = "middle";
    pen.textAlign = "center";
    const cell = (label: string, value: string, x: number, color: string) => {
      pen.font = '800 28px "Inter", "Noto Sans KR", sans-serif';
      pen.fillStyle = "#ffcf5a";
      pen.fillText(label, x, 36);
      pen.font = '900 84px "Courier New", monospace';
      pen.shadowColor = color;
      pen.shadowBlur = 18;
      pen.fillStyle = color;
      pen.fillText(value, x, 106);
      pen.shadowBlur = 0;
    };
    cell(state.endless ? "넣은 동전" : "남은 동전", String(state.endless ? state.dropped : state.hand).padStart(3, "0"), 200, "#ff4a2a");
    cell("딴 동전", String(state.won).padStart(3, "0"), 568, "#5aff8a");
    this.led.texture.needsUpdate = true;
  }
  protected subject(aspect: number) {
    return pusherSubject(aspect);
  }
  protected spots(): Spot[] {
    return [];
  }
  /** A press anywhere on the machine sets the chute over the column under it and drops a coin; held, it keeps dropping; dragged, the chute follows. */
  protected dragStart(_point: number, at: { x: number; y: number; z: number }) {
    if (!this.running()) return false;
    this.aim = placeAt(at.x);
    this.pressing = true;
    this.owed = true;
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    if (this.pressing) this.aim = placeAt(at.x);
  }
  protected dragEnd() {
    this.pressing = false;
  }
  /** The table never makes the screen wait. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      this.pressing = this.holding = this.owed = false;
      this.sliding = 0;
    }
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  private canDrop() {
    return !!this.state && this.state.winner === null && (this.state.endless || this.state.hand > 0);
  }
  /** Tells the screen what the slices brought about, and lets it be heard and seen. */
  private report(events: Happening[], now: number) {
    let won = 0,
      lost = 0;
    const after: number[] = [];
    for (const event of events) {
      if (event.kind === "won" || event.kind === "lost") {
        if (event.kind === "won") {
          won++;
          this.flights.push({ start: now, x: event.x, z: Math.min(event.z, FIELD.front + 0.1), kind: event.sort, slot: this.trayCount < TRAY_MAX ? this.trayCount : -1, yaw: hash(this.trayCount, 9) * 6.28 });
          this.trayCount++;
        } else lost++;
      } else if (event.kind === "landed") {
        if (now - this.clinkAt > 55) {
          this.clinkAt = now;
          this.onKnock?.("clink", event.strength);
        }
      } else if (event.kind === "token") this.say("보너스!", now, -0.2);
      else if (event.kind === "tick") this.onKnock?.("tick", 1);
      else if (event.kind === "stop") this.onKnock?.("stop", 1);
      else if (event.kind === "bonus") {
        const prize = PRIZES[event.prize];
        this.say(prize.jackpot ? `잭팟! +${prize.shower}` : prize.hand ? `동전 +${prize.hand}` : `동전 비 ${prize.shower}`, now, 0.4);
        this.onKnock?.(prize.jackpot ? "jackpot" : "bonus", 1);
        after.push(BONUS + event.prize);
      } else if (event.kind === "settled") after.push(SETTLED);
    }
    for (; won > 0; won -= BATCH) this.onMove({ from: -1, to: WON + Math.min(won, BATCH), extra: -1 });
    for (; lost > 0; lost -= BATCH) this.onMove({ from: -1, to: LOST + Math.min(lost, BATCH), extra: -1 });
    for (const to of after) this.onMove({ from: -1, to, extra: -1 });
  }
  /** A word that rises over the roulette and fades. */
  private say(text: string, now: number, height: number) {
    if (capturing()) return;
    const texture = painted(
      512,
      128,
      (pen) => {
        pen.font = '900 80px "Inter", "Noto Sans KR", sans-serif';
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.lineJoin = "round";
        pen.lineWidth = 16;
        pen.strokeStyle = "#5a0a30";
        pen.strokeText(text, 256, 66);
        pen.fillStyle = "#fff36a";
        pen.fillText(text, 256, 66);
      },
      (r) => r,
    );
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(1.6, 0.4, 1);
    sprite.renderOrder = 20;
    sprite.position.set(0, BASE + WHEEL.y + height, WHEEL.z + 0.6);
    sprite.userData.from = sprite.position.y;
    this.scene.add(sprite);
    this.words.push({ sprite, at: now });
  }
  private advance(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    if (this.running()) {
      if (this.sliding && now >= this.nextSlide) this.nudge(now);
      if (!this.canDrop()) this.owed = false;
      else if (this.owed || ((this.holding || this.pressing) && now >= this.nextDrop)) {
        this.owed = false;
        this.nextDrop = now + HOLD_EVERY * 1000;
        this.onMove({ from: -1, to: DROP + this.aim, extra: -1 });
      }
      this.left += real;
      const events: Happening[] = [];
      let slices = 0;
      while (this.left >= DT && slices < 40) {
        this.left -= DT;
        slices++;
        events.push(...step(this.world));
      }
      if (slices >= 40) this.left = 0;
      if (events.length) this.report(events, now);
    }
    if (this.state) this.lights(this.state);
    this.pose(now, real);
    this.redraw();
  }
  /** One step of the chute the way it is pushed. */
  private nudge(now: number) {
    this.aim = Math.max(0, Math.min(AIMS - 1, this.aim + this.sliding));
    this.nextSlide = now + SLIDE_EVERY * 1000;
  }
  /** Sets one coin's instance: its middle, its slope (or its tumble in the air), and its turn. */
  private coinAt(mesh: T.InstancedMesh, index: number, x: number, y: number, z: number, gx: number, gz: number, yaw: number, tumble: number) {
    const { q, n, p, s, m, axis } = this.spare;
    this.spare.y.setFromAxisAngle(axis.set(0, 1, 0), yaw);
    if (tumble) q.setFromAxisAngle(axis.set(Math.cos(yaw), 0, Math.sin(yaw)), tumble);
    else q.setFromUnitVectors(axis.set(0, 1, 0), n.set(-gx, 1, -gz).normalize());
    q.multiply(this.spare.y);
    s.set(R / COIN_R, H / COIN_H, R / COIN_R);
    mesh.setMatrixAt(index, m.compose(p.set(x, y, z), q, s));
  }
  private pose(now: number, real: number) {
    const w = this.world;
    this.pusher.position.z = w.face - 1.7 / 2;
    // The coins on the board; one high in the air (from the chute or a shower) turns over as it falls.
    let golds = 0,
      tokens = 0;
    for (let i = 0; i < w.n; i++) {
      const token = w.kind[i] === 1;
      if (token ? tokens >= this.tokens.instanceMatrix.count : golds >= this.gold.instanceMatrix.count) continue;
      const high = w.rest[i] === 0 && w.y[i] > PUSHER.top + 0.12 ? (w.y[i] - PUSHER.top - 0.12) * 14 : 0;
      this.coinAt(token ? this.tokens : this.gold, token ? tokens++ : golds++, w.x[i], w.y[i] + H / 2, w.z[i], w.gx[i], w.gz[i], w.yaw[i], high);
    }
    // Coins won: over the lip, down inside the apron, out of the chute's mouth and onto the heap in the tray.
    const rest = { p: new T.Vector3(), tilt: new T.Vector3(), yaw: 0 };
    this.flights = this.flights.filter((f) => {
      const s = (now - f.start) / 1000 / FLY;
      if (s >= 1) {
        if (f.slot >= 0) this.trayShown = Math.max(this.trayShown, f.slot + 1);
        this.onKnock?.(f.slot % 5 === 0 ? "rattle" : "tray", 0.9);
        return false;
      }
      trayRest(Math.max(0, f.slot), rest);
      let x: number, y: number, z: number;
      if (s < 0.55) {
        const u = s / 0.55;
        x = f.x + (rest.p.x - f.x) * u * 0.5;
        y = -u * u * (-TRAY.y + 0.1);
        z = f.z + (TRAY.z - TRAY.d / 2 - 0.05 - f.z) * u;
      } else {
        const u = (s - 0.55) / 0.45,
          fromX = f.x + (rest.p.x - f.x) * 0.5;
        x = fromX + (rest.p.x - fromX) * u;
        y = TRAY.y + 0.1 + (rest.p.y - TRAY.y - 0.1) * u + Math.sin(Math.PI * u) * 0.12;
        z = TRAY.z - TRAY.d / 2 - 0.05 + (rest.p.z - (TRAY.z - TRAY.d / 2 - 0.05)) * u;
      }
      const token = f.kind === 1;
      if (token ? tokens < this.tokens.instanceMatrix.count : golds < this.gold.instanceMatrix.count) this.coinAt(token ? this.tokens : this.gold, token ? tokens++ : golds++, x, y, z, 0, 0, f.yaw, s * 9);
      return true;
    });
    this.gold.count = golds;
    this.tokens.count = tokens;
    this.gold.instanceMatrix.needsUpdate = this.tokens.instanceMatrix.needsUpdate = true;
    // The heap in the tray, grown as coins land.
    if (this.tray.count !== Math.min(this.trayShown, TRAY_MAX)) {
      for (let k = this.tray.count; k < Math.min(this.trayShown, TRAY_MAX); k++) {
        trayRest(k, rest);
        this.coinAt(this.tray, k, rest.p.x, rest.p.y, rest.p.z, rest.tilt.x, rest.tilt.z, rest.yaw, 0);
      }
      this.tray.count = Math.min(this.trayShown, TRAY_MAX);
      this.tray.instanceMatrix.needsUpdate = true;
    }
    // The carriage runs over to where the chute is set.
    const target = aimX(this.aim);
    this.carriageX += (target - this.carriageX) * Math.min(1, real * 14);
    this.carriage.position.x = this.carriageX;
    // The roulette's lamps: one runs round while it spins, blinks where it stops, and between turns they chase softly.
    const wheel = w.roulette,
      chase = Math.floor(now / 260) % this.lamps.length;
    this.lamps.forEach((paint, k) => {
      let level = k === chase ? 0.7 : 0.15;
      if (wheel.phase === "spin") level = k === wheel.lamp ? 3 : 0.1;
      else if (wheel.phase === "show") level = k === wheel.lamp ? (Math.floor(now / 120) % 2 ? 3.2 : 0.4) : 0.1;
      paint.emissiveIntensity = level;
    });
    const round = Math.floor(now / 140);
    this.marquee.forEach((paint, k) => (paint.emissiveIntensity = (k + round) % 3 === 0 ? 1.8 : 0.35));
    const breathe = 1.8 + Math.sin(now / 900) * 0.35;
    for (const paint of this.neon) paint.emissiveIntensity = breathe;
    this.words = this.words.filter((word) => {
      const age = (now - word.at) / 1600;
      if (age >= 1) {
        word.sprite.removeFromParent();
        (word.sprite.material as T.SpriteMaterial).map?.dispose();
        word.sprite.material.dispose();
        return false;
      }
      word.sprite.position.y = word.sprite.userData.from + age * 0.5;
      (word.sprite.material as T.SpriteMaterial).opacity = Math.min(1, (1 - age) * 3);
      return true;
    });
  }
  protected place(state: State) {
    // A new game, known by the count of moves going back to nothing (or another purse): a fresh board.
    const anew = (state.ply === 0 && this.shown > 0) || state.mode !== this.mode;
    if (anew) {
      this.mode = state.mode;
      const chosen = MODES.find((m) => m.value === state.mode);
      this.world = createWorld(chosen && chosen.coins ? chosen.coins : "endless", cryptoRandom);
      this.flights = [];
      this.trayCount = this.trayShown = 0;
      this.tray.count = 0;
      for (const word of this.words) word.sprite.removeFromParent();
      this.words = [];
      this.holding = this.pressing = this.owed = false;
      this.sliding = 0;
      this.aim = state.aim;
    } else if (state.ply === this.shown + 1 && state.last !== null) {
      const last = state.last;
      if (last >= DROP && last < DROP + AIMS) {
        drop(this.world, last - DROP);
        this.aim = last - DROP;
        this.onKnock?.("drop", 0.6);
      } else if (last === SLIDE || last === SLIDE + 1) {
        this.sliding = last === SLIDE ? -1 : 1;
        this.nudge(performance.now());
      } else if (last === STOP || last === STOP + 1) {
        if (this.sliding === (last === STOP ? -1 : 1)) this.sliding = 0;
      } else if (last === HOLD) {
        this.holding = true;
        this.owed = true;
      } else if (last === LET) this.holding = false;
    } else if (this.shown === 0 && state.ply > 0) this.trayCount = this.trayShown = state.won;
    this.shown = state.ply;
    this.lights(state);
  }
  protected animate() {
    return false;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    for (const word of this.words) {
      (word.sprite.material as T.SpriteMaterial).map?.dispose();
      word.sprite.material.dispose();
    }
    super.dispose();
  }
}
