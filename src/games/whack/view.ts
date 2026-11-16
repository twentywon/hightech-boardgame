import * as T from "three";
import { cryptoRandom } from "../../core/random";
import { aim, block, glossy } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot } from "../table/view";
import { FIELD, WHACK_SUBJECT } from "./layout";
import { CLINK, ESCAPE, HIT, MISS, ROUND, TICK, type State } from "./rules";
import { DT, GOLDEN, HELMET, HOLES, HOLE_R, createWorld, holeAt, retire, step, whack, type Happening, type World } from "./sim";

export const WHACK_COLORS: [string, string] = ["#1f5fd0", "#b9b3a4"];
/**
 * The mallet: the handle's length from the hand to the head, the head's radius and drum, the handle's slope at the
 * blow (the hand a little above the head), how far it is raised between blows, where the hand is held from the point
 * struck (toward the player and to the right), and the blow's timing in milliseconds (down, held, back up).
 */
const MALLET = { length: 2.3, radius: 0.34, drum: 0.78, rise: 0.32, raised: 0.6, back: [0.55, 1], down: 75, hold: 45, up: 170 };

/** A small repeatable source of numbers, so that the print is the same each time. */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** A star of five points, as a path. */
function star(pen: CanvasRenderingContext2D, x: number, y: number, r: number, turn = 0) {
  pen.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = turn - Math.PI / 2 + (k * Math.PI) / 5,
      rr = k % 2 ? r * 0.45 : r;
    if (k) pen.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else pen.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  pen.closePath();
}
/**
 * The printed top of the machine, our own: a sunny meadow with ribbons of path curling across it, flowers, carrots,
 * stars and molehills, and the game's name between the holes; each hole has a dark halo where the rim sits.
 */
function fieldPrint() {
  const W = 2048,
    H = Math.round((W * FIELD.d) / FIELD.w),
    canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const pen = canvas.getContext("2d")!,
    random = sequence(31),
    px = (x: number) => ((x + FIELD.w / 2) / FIELD.w) * W,
    pz = (z: number) => ((z + FIELD.d / 2) / FIELD.d) * H,
    scale = W / FIELD.w;
  const sky = pen.createLinearGradient(0, 0, W, H);
  sky.addColorStop(0, "#d8ee4a");
  sky.addColorStop(0.5, "#f6e64e");
  sky.addColorStop(1, "#b8e04a");
  pen.fillStyle = sky;
  pen.fillRect(0, 0, W, H);
  // Soft green swirls in the grass.
  pen.strokeStyle = "rgba(60, 160, 60, 0.35)";
  pen.lineWidth = 10;
  for (let k = 0; k < 26; k++) {
    const x = random() * W,
      y = random() * H,
      r = 30 + random() * 50;
    pen.beginPath();
    for (let a = 0; a < Math.PI * 3.2; a += 0.15) pen.lineTo(x + Math.cos(a) * r * (a / 10), y + Math.sin(a) * r * (a / 10));
    pen.stroke();
  }
  // Ribbons of path: wide pink bands edged in white, curling between the holes.
  const ribbon = (points: [number, number][], color: string) => {
    for (const [width, paint] of [[118, "#ffffff"], [92, color]] as const) {
      pen.strokeStyle = paint;
      pen.lineWidth = width;
      pen.lineCap = "round";
      pen.beginPath();
      pen.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i + 1 < points.length; i += 2) pen.quadraticCurveTo(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
      pen.stroke();
    }
  };
  ribbon([[-60, H * 0.32], [W * 0.18, H * 0.05], [W * 0.38, H * 0.3], [W * 0.55, H * 0.55], [W * 0.78, H * 0.3], [W * 0.95, H * 0.08], [W + 80, H * 0.22]], "#ef4a86");
  ribbon([[-60, H * 0.86], [W * 0.2, H * 0.66], [W * 0.45, H * 0.9], [W * 0.7, H * 1.1], [W + 80, H * 0.72]], "#ff8a3a");
  // Molehills, flowers, carrots and stars scattered clear of the holes.
  const clear = (x: number, y: number, room: number) => HOLES.every(([hx, hz]) => Math.hypot(x - px(hx), y - pz(hz)) > HOLE_R * scale + room);
  const flower = (x: number, y: number, r: number, petal: string) => {
    pen.fillStyle = petal;
    for (let k = 0; k < 5; k++) {
      const a = (k * Math.PI * 2) / 5;
      pen.beginPath();
      pen.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.5, r * 0.34, a, 0, Math.PI * 2);
      pen.fill();
    }
    pen.fillStyle = "#ffd23a";
    pen.beginPath();
    pen.arc(x, y, r * 0.38, 0, Math.PI * 2);
    pen.fill();
  };
  const carrot = (x: number, y: number, r: number, turn: number) => {
    pen.save();
    pen.translate(x, y);
    pen.rotate(turn);
    pen.fillStyle = "#3f9a34";
    for (const a of [-0.5, 0, 0.5]) {
      pen.beginPath();
      pen.ellipse(Math.sin(a) * r * 0.5, -r * 1.25, r * 0.18, r * 0.55, a, 0, Math.PI * 2);
      pen.fill();
    }
    pen.fillStyle = "#ff7a1a";
    pen.beginPath();
    pen.moveTo(-r * 0.42, -r * 0.8);
    pen.quadraticCurveTo(0, -r * 1.0, r * 0.42, -r * 0.8);
    pen.lineTo(0, r * 1.1);
    pen.closePath();
    pen.fill();
    pen.strokeStyle = "#c8560a";
    pen.lineWidth = 4;
    for (const t of [-0.3, 0.05, 0.4]) {
      pen.beginPath();
      pen.moveTo(-r * 0.25 * (1 - t), r * t);
      pen.lineTo(r * 0.05, r * t + 4);
      pen.stroke();
    }
    pen.restore();
  };
  for (let k = 0, placed = 0; k < 400 && placed < 46; k++) {
    const x = random() * W,
      y = random() * H;
    if (!clear(x, y, 70)) continue;
    placed++;
    const what = placed % 5;
    if (what === 0) {
      // A molehill.
      pen.fillStyle = "#9a6a3a";
      pen.beginPath();
      pen.ellipse(x, y, 54, 30, 0, Math.PI, 0);
      pen.fill();
      pen.fillStyle = "#7a4e26";
      for (let d = 0; d < 6; d++) pen.fillRect(x - 40 + random() * 80, y - 20 + random() * 16, 8, 6);
    } else if (what === 1) flower(x, y, 30 + random() * 12, ["#ffffff", "#ff7ab8", "#8ad0ff"][placed % 3]);
    else if (what === 2) carrot(x, y, 34, random() * 1.2 - 0.6);
    else {
      pen.fillStyle = ["#ff5a4a", "#3a8aff", "#ffffff", "#a85aff"][placed % 4];
      star(pen, x, y, 22 + random() * 18, random());
      pen.fill();
    }
  }
  // The game's name, twice, on the paths between the holes.
  const title = (text: string, x: number, y: number, size: number, turn: number) => {
    pen.save();
    pen.translate(x, y);
    pen.rotate(turn);
    pen.font = `900 ${size}px "Inter", "Noto Sans KR", sans-serif`;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineJoin = "round";
    pen.lineWidth = size * 0.24;
    pen.strokeStyle = "#1a2a7a";
    pen.strokeText(text, 0, 0);
    pen.fillStyle = "#ffffff";
    pen.fillText(text, 0, 0);
    pen.restore();
  };
  // In the corners, clear of the holes.
  title("WHACK!", px(-3.25), pz(-2.45), 96, -0.22);
  title("두더지 잡기", px(3.2), pz(2.5), 74, -0.18);
  // Under each rim, a dark halo.
  for (const [hx, hz] of HOLES) {
    const glow = pen.createRadialGradient(px(hx), pz(hz), HOLE_R * scale * 0.9, px(hx), pz(hz), HOLE_R * scale * 1.45);
    glow.addColorStop(0, "rgba(40, 20, 0, 0.55)");
    glow.addColorStop(1, "rgba(40, 20, 0, 0)");
    pen.fillStyle = glow;
    pen.beginPath();
    pen.arc(px(hx), pz(hz), HOLE_R * scale * 1.45, 0, Math.PI * 2);
    pen.fill();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
/** Glitter for the rims: specks of light on amber. */
function glitter() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const pen = canvas.getContext("2d")!,
    random = sequence(5);
  pen.fillStyle = "#3a2400";
  pen.fillRect(0, 0, 256, 64);
  for (let k = 0; k < 260; k++) {
    pen.fillStyle = ["#fff6c0", "#ffd24a", "#ff9a3a", "#ffffff", "#8ae0ff"][k % 5];
    pen.fillRect(random() * 256, random() * 64, 2 + random() * 3, 2 + random() * 3);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  return texture;
}
/** A carpet of an arcade: dark, with bright shapes scattered over it. */
function carpet() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const pen = canvas.getContext("2d")!,
    random = sequence(77);
  pen.fillStyle = "#1a1640";
  pen.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 90; k++) {
    const x = random() * 512,
      y = random() * 512;
    pen.strokeStyle = pen.fillStyle = ["rgba(255,74,176,0.5)", "rgba(56,224,255,0.45)", "rgba(255,226,58,0.45)", "rgba(122,106,255,0.55)"][k % 4];
    pen.lineWidth = 5;
    if (k % 3 === 0) {
      pen.beginPath();
      pen.arc(x, y, 9, 0, Math.PI * 2);
      pen.stroke();
    } else if (k % 3 === 1) {
      pen.beginPath();
      pen.moveTo(x - 12, y + 8);
      pen.lineTo(x, y - 10);
      pen.lineTo(x + 12, y + 8);
      pen.closePath();
      pen.stroke();
    } else {
      pen.beginPath();
      pen.moveTo(x - 14, y);
      pen.quadraticCurveTo(x - 7, y - 10, x, y);
      pen.quadraticCurveTo(x + 7, y + 10, x + 14, y);
      pen.stroke();
    }
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(5, 5);
  return texture;
}
/** One mole as built: its parts that change (the hard hat, the eyes open or dazed, the stars) and its paint. */
interface MoleModel {
  root: T.Group;
  hat: T.Group;
  open: T.Group;
  dazed: T.Group;
  stars: T.Group;
  fur: T.MeshStandardMaterial;
  kind: number;
}
/**
 * A whack-a-mole machine seen from the player's place, a little above it (the user sent a photograph of one and
 * asked for that view and look; the print, the moles and the mallet are our own): a padded blue frame round a
 * printed top with seven holes in glittering rims, a sign behind with the score and the time in lights, and a soft
 * mallet in the hand. The view plays the machine in real time (see `sim.ts`) and reports what happens as moves.
 */
export class WhackView extends TableView<State> {
  private world: World;
  private moles: (MoleModel | null)[] = HOLES.map(() => null);
  private rims: T.MeshStandardMaterial[] = [];
  /** When each rim last flashed (a hit lights it up). */
  private flash: number[] = HOLES.map(() => -1e9);
  private mallet = new T.Group();
  private head = new T.Group();
  /** Where the mallet hovers, and when it last came down. */
  private aimAt = new T.Vector3(1.3, 0, 2.05);
  private swing = -1e9;
  /** How high the mallet's face comes down at the blow under way: on a mole's head, or on the rim of an empty hole. */
  private impact = 0.12;
  private led: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private words: { sprite: T.Sprite; at: number; x: number; y: number; z: number }[] = [];
  private paused = false;
  private shown = 0;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  private striker = new T.Raycaster();
  /** Shared shapes and paints of the moles. */
  private kit: { [name: string]: T.BufferGeometry | T.Material };
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#140f2e");
    this.world = createWorld(1, cryptoRandom);
    this.scene.add(new T.HemisphereLight("#fff6e8", "#40305a", 1.6));
    const sun = new T.DirectionalLight("#fff2dc", 2.1);
    sun.position.set(-3, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -8;
    sun.shadow.camera.right = sun.shadow.camera.top = 8;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    // The arcade's carpet round the machine.
    const floor = this.add(new T.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), this.standard({ map: keep(carpet()), roughness: 0.95 }), 0, -1.6, 0);
    floor.castShadow = false;
    this.cabinet(keep);
    this.kit = this.moleKit(keep);
    this.malletModel(keep);
    this.led = this.sign(keep);
    // The mallet follows a mouse over the machine.
    const el = this.renderer.domElement;
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || this.disposed) return;
      aim(this.striker, e, el, this.camera);
      const hole = this.moleUnder(this.striker.ray),
        at = hole >= 0 ? null : this.ground(e, 0);
      if (hole >= 0) this.aimAt.set(HOLES[hole][0], 0, HOLES[hole][1]);
      else if (at) this.aimAt.copy(at);
    });
    // Keys 1 to 7 bring the mallet down on the holes, in rows from the back, left to right.
    el.addEventListener("keydown", (e) => {
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > HOLES.length || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      this.strike(n - 1);
    });
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** Where the pointer of an event meets a level plane at height `y`, or null. */
  private ground(e: PointerEvent, y = 0) {
    aim(this.striker, e, this.renderer.domElement, this.camera);
    const hit = new T.Vector3();
    return this.striker.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -y), hit) ? hit : null;
  }
  /** The machine: a cabinet below the top, the padded frame, the printed top with its holes, and the rims. */
  private cabinet(keep: <R extends { dispose(): void }>(r: R) => R) {
    const { w, d, frame, pad, well } = FIELD,
      vinyl = keep(glossy({ color: "#1f5fd0", roughness: 0.38 }, 0.5)),
      dark = this.standard({ color: "#16224a", roughness: 0.6 });
    // The cabinet's sides under the top (open above, so that the holes look down into the dark).
    const outer = { w: w + 2 * frame, d: d + 2 * frame };
    for (const side of [-1, 1]) {
      this.add(block(outer.w, 1.6, 0.12, 0.04), dark, 0, -0.8, side * (outer.d / 2 - 0.06)).castShadow = false;
      this.add(block(0.12, 1.6, outer.d, 0.04), dark, side * (outer.w / 2 - 0.06), -0.8, 0).castShadow = false;
    }
    // The padded frame: rounded cushions on the four sides, the near one fattest (it is leaned on).
    this.add(block(w + 2 * frame, pad, frame, 0.18), vinyl, 0, pad / 2, -d / 2 - frame / 2);
    this.add(block(w + 2 * frame, pad + 0.12, frame + 0.25, 0.24), vinyl, 0, (pad + 0.12) / 2, d / 2 + (frame + 0.25) / 2);
    for (const side of [-1, 1]) this.add(block(frame, pad, d, 0.18), vinyl, side * (w / 2 + frame / 2), pad / 2, 0);
    // The printed top, cut through at the holes.
    const shape = new T.Shape();
    shape.moveTo(-w / 2, -d / 2);
    shape.lineTo(w / 2, -d / 2);
    shape.lineTo(w / 2, d / 2);
    shape.lineTo(-w / 2, d / 2);
    shape.closePath();
    for (const [x, z] of HOLES) {
      const hole = new T.Path();
      hole.absarc(x, -z, HOLE_R, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const top = new T.ShapeGeometry(shape, 48),
      uv = top.attributes.uv,
      pos = top.attributes.position;
    // The print laid across the whole top (a shape's own coordinates are not 0 to 1).
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + d / 2) / d);
    top.rotateX(-Math.PI / 2);
    const print = this.add(top, this.standard({ map: keep(fieldPrint()), roughness: 0.55 }), 0, 0, 0);
    print.castShadow = false;
    // The wells under the holes, dark inside, and the glittering rims round them.
    const wall = keep(new T.CylinderGeometry(HOLE_R, HOLE_R, well, 36, 1, true)),
      inside = this.standard({ color: "#1a1208", roughness: 0.9, side: T.BackSide }),
      floorPaint = this.standard({ color: "#120c06", roughness: 0.95 }),
      bottom = keep(new T.CircleGeometry(HOLE_R, 36).rotateX(-Math.PI / 2)),
      rim = keep(new T.TorusGeometry(HOLE_R + 0.06, 0.13, 16, 48).rotateX(Math.PI / 2)),
      sparkle = keep(glitter());
    sparkle.repeat.set(6, 1);
    for (const [x, z] of HOLES) {
      this.add(wall, inside, x, -well / 2, z).castShadow = false;
      this.add(bottom, floorPaint, x, -well + 0.01, z).castShadow = false;
      const paint = this.standard({ color: "#f6b81e", emissive: "#ffb000", emissiveMap: sparkle, emissiveIntensity: 0.6, roughness: 0.22, metalness: 0.15, transparent: true, opacity: 0.92 });
      this.rims.push(paint);
      this.add(rim, paint, x, 0.05, z);
    }
  }
  /** The sign behind the top: an upright board in the machine's colours, its name, and the score and the time in lights. */
  private sign(keep: <R extends { dispose(): void }>(r: R) => R) {
    const { w, d, frame } = FIELD,
      board = new T.Group(),
      canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const texture = keep(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    const face = document.createElement("canvas");
    face.width = 1024;
    face.height = 360;
    const pen = face.getContext("2d")!,
      paint = pen.createLinearGradient(0, 0, 0, 360);
    paint.addColorStop(0, "#ffd84a");
    paint.addColorStop(1, "#ffa21a");
    pen.fillStyle = paint;
    pen.fillRect(0, 0, 1024, 360);
    pen.strokeStyle = "rgba(255,255,255,0.45)";
    pen.lineWidth = 12;
    for (const [x, y, r] of [[90, 80, 50], [940, 70, 46], [120, 290, 40], [910, 300, 44]]) {
      pen.beginPath();
      for (let a = 0; a < Math.PI * 3; a += 0.12) pen.lineTo(x + Math.cos(a) * r * (a / 9.4), y + Math.sin(a) * r * (a / 9.4));
      pen.stroke();
    }
    const art = keep(new T.CanvasTexture(face));
    art.colorSpace = T.SRGBColorSpace;
    const H = 2.5,
      width = w + 2 * frame;
    const blue = this.standard({ color: "#1f5fd0", roughness: 0.4 });
    this.add(block(width, H, 0.3, 0.12), [blue, blue, blue, blue, this.standard({ map: art, roughness: 0.5 }), blue], 0, H / 2, 0, board);
    // The lights: a dark window with the score and the time in glowing figures.
    const screen = this.add(new T.PlaneGeometry(width * 0.62, H * 0.5), this.own(new T.MeshBasicMaterial({ map: texture, toneMapped: false })), 0, H * 0.52, 0.16, board);
    screen.castShadow = screen.receiveShadow = false;
    board.position.set(0, 0, -d / 2 - frame - 0.1);
    board.rotation.x = -0.32;
    this.scene.add(board);
    return { canvas, texture, said: "" };
  }
  /** Paints the lights: the score and the seconds left, and the level. */
  private lights(state: State) {
    const said = `${state.score}|${state.left}|${state.level}|${state.winner}`;
    if (said === this.led.said) return;
    this.led.said = said;
    const pen = this.led.canvas.getContext("2d")!;
    pen.fillStyle = "#0c0a10";
    pen.fillRect(0, 0, 1024, 256);
    // The unlit segments' faint grid behind the figures.
    pen.fillStyle = "rgba(255, 60, 40, 0.06)";
    for (let x = 12; x < 1024; x += 14) for (let y = 12; y < 256; y += 14) pen.fillRect(x, y, 6, 6);
    pen.textBaseline = "middle";
    pen.font = '800 46px "Inter", "Noto Sans KR", sans-serif';
    pen.fillStyle = "#ffcf5a";
    pen.textAlign = "left";
    pen.fillText("SCORE", 40, 62);
    pen.textAlign = "right";
    pen.fillText("TIME", 984, 62);
    pen.font = '900 128px "Courier New", monospace';
    pen.shadowColor = "#ff3a20";
    pen.shadowBlur = 24;
    pen.fillStyle = "#ff4a2a";
    pen.textAlign = "left";
    pen.fillText(String(state.score).padStart(4, "0"), 34, 166);
    pen.fillStyle = state.left <= 10 && state.winner === null ? "#ffe23a" : "#ff4a2a";
    pen.textAlign = "right";
    pen.fillText(String(Math.max(0, state.left)).padStart(2, "0"), 990, 166);
    pen.shadowBlur = 0;
    this.led.texture.needsUpdate = true;
  }
  /** The shapes and paints the moles share. */
  private moleKit(keep: <R extends { dispose(): void }>(r: R) => R) {
    return {
      body: keep(new T.SphereGeometry(0.56, 28, 20)),
      snout: keep(new T.SphereGeometry(0.27, 20, 14)),
      nose: keep(new T.SphereGeometry(0.1, 14, 10)),
      eye: keep(new T.SphereGeometry(0.125, 16, 12)),
      pupil: keep(new T.SphereGeometry(0.068, 12, 8)),
      tooth: keep(block(0.07, 0.1, 0.04, 0.015)),
      paw: keep(new T.SphereGeometry(0.15, 14, 10)),
      cheek: keep(new T.CircleGeometry(0.08, 16)),
      cross: keep(block(0.16, 0.035, 0.03, 0.01)),
      dome: keep(new T.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
      brim: keep(new T.CylinderGeometry(0.56, 0.56, 0.05, 28)),
      lamp: keep(new T.CylinderGeometry(0.08, 0.09, 0.08, 14)),
      star: keep(new T.ExtrudeGeometry(this.starShape(0.09), { depth: 0.03, bevelEnabled: false })),
      muzzle: this.standard({ color: "#e8c39a", roughness: 0.7 }),
      pink: this.standard({ color: "#ff7a9a", roughness: 0.5 }),
      white: this.standard({ color: "#ffffff", roughness: 0.3 }),
      black: this.standard({ color: "#141018", roughness: 0.3 }),
      blush: this.own(new T.MeshBasicMaterial({ color: "#ff9ab0", transparent: true, opacity: 0.7 })),
      hard: keep(glossy({ color: "#ffcc1a", roughness: 0.3 }, 0.6)),
      gold: this.standard({ color: "#ffd84a", emissive: "#ffb400", emissiveIntensity: 0.6, roughness: 0.3 }),
    };
  }
  private starShape(r: number) {
    const shape = new T.Shape();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5,
        rr = k % 2 ? r * 0.45 : r;
      if (k) shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    return shape;
  }
  /** Builds a mole of a kind: a furry egg with a pale snout, a pink nose, buck teeth, round eyes and paws on the rim. */
  private mole(kind: number): MoleModel {
    const k = this.kit as Record<string, never>,
      fur = this.standard(
        kind === GOLDEN ? { color: "#e8b628", emissive: "#6a4a00", emissiveIntensity: 0.4, roughness: 0.28, metalness: 0.55 } : { color: "#7a5234", roughness: 0.85 },
      ),
      root = new T.Group(),
      part = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, parent: T.Object3D = root) => {
        const mesh = new T.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        parent.add(mesh);
        return mesh;
      };
    part(k.body, fur, 0, 0.2, 0).scale.set(1, 1.25, 0.95);
    part(k.snout, k.muzzle, 0, 0.12, 0.42).scale.set(1.15, 0.85, 0.8);
    part(k.nose, k.pink, 0, 0.2, 0.62);
    for (const s of [-1, 1]) part(k.tooth, k.white, s * 0.04, -0.03, 0.6);
    for (const s of [-1, 1]) {
      const cheek = part(k.cheek, k.blush, s * 0.3, 0.12, 0.46);
      cheek.rotation.y = s * 0.55;
      cheek.castShadow = false;
    }
    // Eyes open, and crossed for when it is knocked.
    const open = new T.Group(),
      dazed = new T.Group();
    for (const s of [-1, 1]) {
      part(k.eye, k.white, s * 0.18, 0.46, 0.43, open).scale.set(1, 1.2, 0.8);
      part(k.pupil, k.black, s * 0.17, 0.45, 0.52, open);
      for (const turn of [0.8, -0.8]) {
        const bar = part(k.cross, k.black, s * 0.17, 0.44, 0.5, dazed);
        bar.rotation.z = turn;
      }
    }
    dazed.visible = false;
    root.add(open, dazed);
    // Paws resting on the rim in front.
    for (const s of [-1, 1]) part(k.paw, fur, s * 0.34, 0.02, 0.62).scale.set(1, 0.7, 1.1);
    // The hard hat: a yellow dome with a brim and a lamp.
    const hat = new T.Group();
    part(k.dome, k.hard, 0, 0, 0, hat);
    part(k.brim, k.hard, 0, 0, 0.06, hat);
    part(k.lamp, k.white, 0, 0.26, 0.38, hat).rotation.x = Math.PI / 2;
    hat.position.set(0, 0.74, -0.02);
    hat.rotation.x = -0.12;
    hat.visible = kind === HELMET;
    root.add(hat);
    // Stars that go round its head while it is dazed.
    const stars = new T.Group();
    for (let i = 0; i < 3; i++) {
      const one = part(k.star, k.gold, Math.cos((i * Math.PI * 2) / 3) * 0.45, 0, Math.sin((i * Math.PI * 2) / 3) * 0.45, stars);
      one.castShadow = false;
    }
    stars.position.y = 1.0;
    stars.visible = false;
    root.add(stars);
    this.scene.add(root);
    return { root, hat, open, dazed, stars, fur, kind };
  }
  /** A soft mallet: a red padded head with pale ends on a wooden handle that runs toward the near right. */
  /**
   * A soft mallet held at its grip: the group's origin is the hand, the handle runs from it along −z to the head,
   * and the head's padded drum stands across the handle's end, so that it comes down flat on its face. The swing
   * turns the whole about the hand (see `pose`).
   */
  private malletModel(keep: <R extends { dispose(): void }>(r: R) => R) {
    const pad = keep(glossy({ color: "#e8352a", roughness: 0.42 }, 0.4)),
      cap = this.standard({ color: "#fff2e0", roughness: 0.5 }),
      wood = this.standard({ color: "#c98a4a", roughness: 0.55 }),
      grip = this.standard({ color: "#2a2a30", roughness: 0.7 }),
      { length } = MALLET;
    const handle = new T.Mesh(keep(new T.CylinderGeometry(0.07, 0.085, length, 14).rotateX(Math.PI / 2)), wood);
    handle.position.z = -length / 2;
    const wrap = new T.Mesh(keep(new T.CylinderGeometry(0.1, 0.1, 0.7, 14).rotateX(Math.PI / 2)), grip);
    wrap.position.z = -0.2;
    this.head.position.z = -length;
    this.head.add(new T.Mesh(keep(new T.CylinderGeometry(MALLET.radius, MALLET.radius, MALLET.drum, 28)), pad));
    const ends = keep(new T.CylinderGeometry(MALLET.radius + 0.02, MALLET.radius + 0.02, 0.1, 28));
    for (const s of [-1, 1]) {
      const end = new T.Mesh(ends, cap);
      end.position.y = s * (MALLET.drum / 2 + 0.04);
      this.head.add(end);
    }
    this.mallet.add(handle, wrap, this.head);
    this.mallet.traverse((o) => ((o as T.Mesh).castShadow = true));
    this.mallet.rotation.order = "YXZ";
    this.scene.add(this.mallet);
  }
  /** The hole of the mole a line of sight strikes first (its body, as drawn), or −1. */
  private moleUnder(ray: T.Ray) {
    this.striker.ray.copy(ray);
    const shown = this.moles.flatMap((model, hole) => (model && model.root.visible && this.world.moles[hole] && this.world.moles[hole]!.height > 0.3 ? [{ model, hole }] : []));
    const hits = this.striker.intersectObjects(shown.map((m) => m.model.root), true);
    if (!hits.length) return -1;
    let object: T.Object3D | null = hits[0].object;
    while (object && !shown.some((m) => m.model.root === object)) object = object.parent;
    return shown.find((m) => m.model.root === object)?.hole ?? -1;
  }
  /** A press on a mole is taken by the mole it strikes, before anything else (a head may stand in front of another hole). */
  protected pick(ray: T.Ray) {
    const hole = this.moleUnder(ray);
    return hole >= 0 ? hole : null;
  }
  protected subject() {
    return WHACK_SUBJECT;
  }
  /** Nothing on the machine is chosen by the screen's taps: a press is the mallet's, taken whole (see `dragStart`). */
  protected spots(): Spot[] {
    return [];
  }
  /**
   * A press anywhere brings the mallet down there at once: on the mole it strikes (found by its drawn body, `pick`),
   * or else on the hole under the pointer, or on the top of the machine.
   */
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    if (!this.running()) return false;
    const hole = point >= 0 ? point : holeAt(at.x, at.z);
    if (hole < 0) this.aimAt.set(at.x, 0, at.z);
    this.strike(hole);
    return true;
  }
  /** The mallet comes down; on a hole it is a blow the machine judges. */
  private strike(hole: number) {
    if (!this.running()) return;
    const mole = hole >= 0 ? this.world.moles[hole] : null;
    if (hole >= 0) this.aimAt.set(HOLES[hole][0], 0, HOLES[hole][1]);
    // The face comes down on the mole's head when one is out, else on the rim.
    this.impact = mole && mole.height > 0.35 && mole.phase !== "bonked" ? -1.25 + mole.height * 1.4 + 0.95 : 0.14;
    this.swing = performance.now();
    if (hole < 0) return;
    this.report([whack(this.world, hole)]);
  }
  /** The table never makes the screen wait. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** Tells the screen what has happened on the machine, with a word over the hole and a flash of its rim. */
  private report(events: Happening[]) {
    const now = performance.now(),
      move = (to: number) => this.onMove({ from: -1, to, extra: -1 });
    for (const event of events) {
      if (event.kind === "second") {
        move(TICK);
        continue;
      }
      const [x, z] = HOLES[event.hole];
      if (event.kind === "hit") {
        this.flash[event.hole] = now;
        this.say(`+${event.points}`, event.mole === GOLDEN ? "#ffe23a" : "#ffffff", x, 1.5, z, now);
        if (event.combo >= 3) this.say(`콤보 ${event.combo}`, "#7ae8ff", x, 2.15, z, now);
        move(HIT + event.points);
        this.onContact();
      } else if (event.kind === "clink") {
        this.hatOff(event.hole, now);
        move(CLINK);
        this.onContact();
      } else if (event.kind === "miss") {
        move(MISS);
        this.onContact();
      } else move(ESCAPE);
    }
  }
  /** A word that rises from a hole and fades. */
  private say(text: string, color: string, x: number, y: number, z: number, now: number) {
    if (capturing()) return;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 128;
    const pen = canvas.getContext("2d")!;
    pen.font = '900 84px "Inter", "Noto Sans KR", sans-serif';
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineJoin = "round";
    pen.lineWidth = 16;
    pen.strokeStyle = "rgba(20, 10, 40, 0.85)";
    pen.strokeText(text, 160, 66);
    pen.fillStyle = color;
    pen.fillText(text, 160, 66);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(1.6, 0.64, 1);
    sprite.renderOrder = 20;
    this.scene.add(sprite);
    this.words.push({ sprite, at: now, x, y, z });
  }
  /** The hard hat flies off a mole hit once. */
  private hatOff(hole: number, now: number) {
    const model = this.moles[hole];
    if (!model) return;
    model.hat.visible = false;
    const [x, z] = HOLES[hole],
      flying = model.hat.clone();
    flying.visible = true;
    this.scene.add(flying);
    this.tween(0, 520, (p) => {
      flying.position.set(x + p * 1.4, 1.1 + Math.sin(p * Math.PI) * 1.3 - p * 0.6, z - p * 0.4);
      flying.rotation.set(-0.12 + p * 6, 0, p * 3);
      if (p === 1) flying.removeFromParent();
    });
  }
  private advance(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    if (this.running()) {
      // The machine keeps the wall clock's time even when frames are few.
      this.left += real;
      while (this.left >= DT && this.state?.winner === null) {
        this.left -= DT;
        this.report(step(this.world, ROUND));
      }
    } else if (this.state && this.state.winner !== null) {
      // Time is up: the moles still out duck back into their holes.
      for (let k = Math.round(real / DT); k > 0; k--) retire(this.world);
    }
    this.pose(now);
    this.redraw();
  }
  /** Puts everything where the machine has it: moles, rims, mallet, words. */
  private pose(now: number) {
    const live = this.running() || this.paused;
    this.world.moles.forEach((mole, hole) => {
      let model = this.moles[hole];
      if (!mole) {
        if (model) model.root.visible = false;
        return;
      }
      // A mole of another kind than the one built for this hole is built afresh.
      if (!model || model.kind !== mole.kind) {
        model?.root.removeFromParent();
        model = this.moles[hole] = this.mole(mole.kind);
      }
      const [x, z] = HOLES[hole],
        dazed = mole.phase === "bonked";
      model.root.visible = true;
      model.root.position.set(x, -1.25 + mole.height * 1.4, z - 0.05);
      // Up, it looks about and breathes; knocked, it squashes and its eyes cross under circling stars.
      const squash = dazed ? Math.max(0, 1 - mole.t / 0.12) * 0.25 : 0;
      model.root.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
      // Leaned back so that its face looks up at the player above the machine.
      model.root.rotation.set(-0.5, dazed ? Math.sin(now / 60) * 0.12 : Math.sin(now / 420 + hole) * 0.18, 0);
      model.open.visible = !dazed;
      model.dazed.visible = dazed;
      model.stars.visible = dazed;
      model.stars.rotation.y = now / 160;
      if (mole.kind === HELMET && mole.hits === 2 && !dazed) model.hat.visible = true;
    });
    // The rims glitter, and flash bright when a mole is hit.
    this.rims.forEach((paint, hole) => {
      const since = now - this.flash[hole];
      paint.emissiveIntensity = 0.45 + 0.15 * Math.sin(now / 190 + hole * 1.7) + (since < 360 ? 2.2 * (1 - since / 360) : 0);
    });
    // The mallet: held from the near right, raised over where it is aimed, and swung down about the hand so that its
    // face lands flat on the mole's head (or the rim) at the blow, then lifted again.
    const t = now - this.swing,
      blow = t < 0 ? 0 : t < MALLET.down ? Math.pow(t / MALLET.down, 2) : t < MALLET.down + MALLET.hold ? 1 : t < MALLET.down + MALLET.hold + MALLET.up ? 1 - (t - MALLET.down - MALLET.hold) / MALLET.up : 0,
      { length, rise, back } = MALLET,
      reach = Math.hypot(back[0], back[1]),
      away = { x: back[0] / reach, z: back[1] / reach },
      // The hand stands where the handle, at its angle at the blow, puts the face on the point struck: held over a
      // mole's height between blows, and drawn down to what is struck as the blow comes (the hand moves with the arm).
      handFor = (lowest: number) => {
        const y = lowest + MALLET.drum / 2 + 0.1;
        return new T.Vector3(this.aimAt.x + away.x * length * Math.cos(rise), y + length * Math.sin(rise), this.aimAt.z + away.z * length * Math.cos(rise));
      },
      hand = handFor(1.0).lerp(handFor(this.impact), blow);
    this.mallet.visible = !capturing() && live;
    this.mallet.position.copy(hand);
    // Turned so that the handle runs from the hand to the head, then tipped up about the hand (raised) or down (the blow).
    this.mallet.rotation.set(-rise + MALLET.raised * (1 - blow), Math.atan2(away.x, away.z), 0);
    // The drum stands upright at the blow, whatever the handle's angle.
    this.head.rotation.x = rise;
    // Words rise and fade.
    this.words = this.words.filter((word) => {
      const p = (now - word.at) / 850;
      if (p >= 1) {
        word.sprite.removeFromParent();
        (word.sprite.material as T.SpriteMaterial).map?.dispose();
        word.sprite.material.dispose();
        return false;
      }
      word.sprite.position.set(word.x, word.y + p * 0.9, word.z);
      (word.sprite.material as T.SpriteMaterial).opacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      return true;
    });
  }
  protected place(state: State) {
    // A new round, known by the count of moves going back to nothing: the holes are emptied and the clock starts again.
    const anew = state.ply === 0 && this.shown > 0;
    this.shown = state.ply;
    if (anew || this.world.level !== state.level) {
      this.world = createWorld(state.level, cryptoRandom);
      for (const word of this.words) word.sprite.removeFromParent();
      this.words = [];
    }
    this.lights(state);
    this.pose(performance.now());
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
