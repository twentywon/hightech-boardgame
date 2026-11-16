import * as T from "three";
import { cryptoRandom } from "../../core/random";
import { aim, block, glossy } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import { funfair } from "../../engine/scenery";
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
/** A painted panel `w` × `h` pixels, made by `paint`. */
function panel(w: number, h: number, paint: (pen: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!, w, h);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
/** Bubbly letters: a thick dark outline, a white rim and a bright fill. */
function bubbly(pen: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, turn = 0) {
  pen.save();
  pen.translate(x, y);
  pen.rotate(turn);
  pen.font = `900 ${size}px "Inter", "Noto Sans KR", sans-serif`;
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  pen.lineJoin = "round";
  pen.lineWidth = size * 0.34;
  pen.strokeStyle = "#1a2a6a";
  pen.strokeText(text, 0, 0);
  pen.lineWidth = size * 0.16;
  pen.strokeStyle = "#ffffff";
  pen.strokeText(text, 0, 0);
  pen.fillStyle = fill;
  pen.fillText(text, 0, 0);
  pen.restore();
}
/** A cartoon mole of our own, popping out of a dirt hole: a brown egg, a pale snout, buck teeth, round eyes. */
function cartoonMole(pen: CanvasRenderingContext2D, x: number, y: number, s: number, cheer = false) {
  pen.fillStyle = "#6a3e1e";
  pen.beginPath();
  pen.ellipse(x, y + s * 0.62, s * 0.95, s * 0.28, 0, 0, Math.PI * 2);
  pen.fill();
  pen.fillStyle = "#8a5a34";
  pen.beginPath();
  pen.ellipse(x, y, s * 0.62, s * 0.72, 0, Math.PI, 0);
  pen.lineTo(x + s * 0.62, y + s * 0.6);
  pen.lineTo(x - s * 0.62, y + s * 0.6);
  pen.closePath();
  pen.fill();
  pen.fillStyle = "#f0d2a8";
  pen.beginPath();
  pen.ellipse(x, y + s * 0.18, s * 0.32, s * 0.24, 0, 0, Math.PI * 2);
  pen.fill();
  pen.fillStyle = "#ff7a9a";
  pen.beginPath();
  pen.arc(x, y + s * 0.06, s * 0.1, 0, Math.PI * 2);
  pen.fill();
  pen.fillStyle = "#ffffff";
  pen.fillRect(x - s * 0.08, y + s * 0.3, s * 0.07, s * 0.12);
  pen.fillRect(x + s * 0.01, y + s * 0.3, s * 0.07, s * 0.12);
  for (const side of [-1, 1]) {
    pen.fillStyle = "#ffffff";
    pen.beginPath();
    pen.ellipse(x + side * s * 0.22, y - s * 0.22, s * 0.13, s * 0.16, 0, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = "#141018";
    pen.beginPath();
    pen.arc(x + side * s * 0.2, y - s * (cheer ? 0.26 : 0.2), s * 0.07, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = "#8a5a34";
    pen.beginPath();
    pen.ellipse(x + side * s * 0.58, y + s * 0.5, s * 0.2, s * 0.13, side * 0.4, 0, Math.PI * 2);
    pen.fill();
  }
}
/** A meadow under a sky, the ground below a share `low` of the height, with flowers and moles here and there. */
function meadow(pen: CanvasRenderingContext2D, w: number, h: number, low: number, seed: number, moles: [number, number, number][]) {
  const random = sequence(seed),
    sky = pen.createLinearGradient(0, 0, 0, h * low);
  sky.addColorStop(0, "#4fb4ff");
  sky.addColorStop(1, "#bfe8ff");
  pen.fillStyle = sky;
  pen.fillRect(0, 0, w, h);
  pen.fillStyle = "rgba(255,255,255,0.9)";
  for (let k = 0; k < 5; k++) {
    const cx = random() * w,
      cy = random() * h * low * 0.6 + h * 0.05;
    for (let b = 0; b < 4; b++) {
      pen.beginPath();
      pen.ellipse(cx + (b - 1.5) * w * 0.035, cy + Math.sin(b * 2) * h * 0.01, w * 0.05, h * 0.035, 0, 0, Math.PI * 2);
      pen.fill();
    }
  }
  // Two rolling hills, then the grass.
  for (const [colour, rise, phase] of [["#7ad05a", 0.08, 1.3], ["#5ab848", 0.0, 0.2]] as const) {
    pen.fillStyle = colour;
    pen.beginPath();
    pen.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) pen.lineTo(x, h * (low - rise) + Math.sin(x / w * 6 + phase) * h * 0.04);
    pen.lineTo(w, h);
    pen.closePath();
    pen.fill();
  }
  for (let k = 0; k < 40; k++) {
    const fx = random() * w,
      fy = h * low + random() * h * (1 - low) * 0.95,
      r = 4 + random() * 7;
    pen.fillStyle = ["#ffffff", "#ff6aa8", "#ffd23a", "#8ad0ff"][k % 4];
    for (let p = 0; p < 5; p++) {
      const a = (p * Math.PI * 2) / 5;
      pen.beginPath();
      pen.arc(fx + Math.cos(a) * r, fy + Math.sin(a) * r, r * 0.62, 0, Math.PI * 2);
      pen.fill();
    }
    pen.fillStyle = "#ffb000";
    pen.beginPath();
    pen.arc(fx, fy, r * 0.5, 0, Math.PI * 2);
    pen.fill();
  }
  for (const [mx, my, ms] of moles) cartoonMole(pen, mx * w, my * h, ms * h, true);
}
/** The front of the cabinet: the meadow with moles, the name, and a coin slot plate painted at the right. */
const frontArt = () =>
  panel(1024, 300, (pen, w, h) => {
    meadow(pen, w, h, 0.42, 3, [[0.12, 0.62, 0.22], [0.36, 0.72, 0.16], [0.6, 0.66, 0.2]]);
    bubbly(pen, "두더지 잡기", w * 0.38, h * 0.22, 74, "#ffd23a", -0.04);
  });
/** The cabinet's sides: the meadow again, other moles, and stars. */
const sideArt = () =>
  panel(768, 300, (pen, w, h) => {
    meadow(pen, w, h, 0.4, 9, [[0.25, 0.7, 0.2], [0.7, 0.62, 0.24]]);
    bubbly(pen, "WHACK!", w * 0.5, h * 0.2, 64, "#ff6a3a", 0.05);
  });
/** The sign at the back: a big meadow scene with three moles and the name in large bubbly letters. */
const marqueeArt = () =>
  panel(1024, 480, (pen, w, h) => {
    meadow(pen, w, h, 0.55, 17, [[0.2, 0.72, 0.2], [0.5, 0.78, 0.25], [0.8, 0.7, 0.2]]);
    // A rainbow arching over the name (painted first, so that the name stands clear in front of it).
    ["#ff5a5a", "#ffb03a", "#ffe23a", "#5ad06a", "#4aa8ff", "#a86aff"].forEach((colour, i) => {
      pen.strokeStyle = colour;
      pen.lineWidth = 9;
      pen.beginPath();
      pen.arc(w * 0.71, h * 0.56, 205 - i * 9, Math.PI * 1.1, Math.PI * 1.9);
      pen.stroke();
    });
    bubbly(pen, "두더지 잡기", w * 0.71, h * 0.4, 78, "#ff4a5a", -0.03);
  });
/** The deck: green, with a pale pattern of little stars and a darker ring under each hole's rim. */
function deckPrint() {
  const W = 2048,
    H = Math.round((W * FIELD.d) / FIELD.w);
  return panel(W, H, (pen) => {
    const random = sequence(31),
      px = (x: number) => ((x + FIELD.w / 2) / FIELD.w) * W,
      pz = (z: number) => ((z + FIELD.d / 2) / FIELD.d) * H,
      scale = W / FIELD.w;
    pen.fillStyle = "#3aa84a";
    pen.fillRect(0, 0, W, H);
    pen.fillStyle = "rgba(255,255,255,0.07)";
    for (let k = 0; k < 160; k++) {
      star(pen, random() * W, random() * H, 10 + random() * 16, random());
      pen.fill();
    }
    for (const [hx, hz] of HOLES) {
      const halo = pen.createRadialGradient(px(hx), pz(hz), HOLE_R * scale * 0.95, px(hx), pz(hz), HOLE_R * scale * 1.5);
      halo.addColorStop(0, "rgba(0, 40, 0, 0.45)");
      halo.addColorStop(1, "rgba(0, 40, 0, 0)");
      pen.fillStyle = halo;
      pen.beginPath();
      pen.arc(px(hx), pz(hz), HOLE_R * scale * 1.5, 0, Math.PI * 2);
      pen.fill();
    }
  });
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
  private fair: { wheel: T.Group; bulbs: T.MeshStandardMaterial[] };
  /** Hard hats knocked off and flying, each from where it came off (kept here, not as tweens: a new state drops tweens). */
  private hats: { hat: T.Object3D; from: T.Vector3; at: number }[] = [];
  /** The mallet's cable to the cabinet, and where its end was when the cable was last laid. */
  private cable!: T.Mesh;
  private cableFrom = new T.Vector3(1e9, 0, 0);
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
    // An amusement park round the machine (the user asked); its big wheel turns and its bulbs twinkle.
    this.fair = funfair(this.scene, keep, FIELD.ground);
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
  /**
   * The machine, in the manner of the upright arcade cabinet in the photograph the user sent (our own pictures on
   * it): a tall blue cabinet on casters with painted panels in front and at the sides, a green deck with seven holes
   * in raised green rims, a red strip behind the deck with two vents, and the painted sign standing above it.
   */
  private cabinet(keep: <R extends { dispose(): void }>(r: R) => R) {
    const { w, d, trim, well, ground } = FIELD,
      blue = keep(glossy({ color: "#1f5fd0", roughness: 0.38 }, 0.4)),
      chrome = this.standard({ color: "#d8dee6", roughness: 0.25, metalness: 0.8 }),
      dark = this.standard({ color: "#16182a", roughness: 0.6 }),
      outer = { w: w + 2 * trim, d: d + 2 * trim },
      tall = -ground;
    // The cabinet's four walls under the deck (open above, so that the holes look down into the dark), painted outside.
    const front = this.standard({ map: keep(frontArt()), roughness: 0.6 }),
      side = this.standard({ map: keep(sideArt()), roughness: 0.6 });
    this.add(block(outer.w, tall - 0.35, 0.14, 0.04), [blue, blue, blue, blue, front, blue], 0, ground + 0.35 + (tall - 0.35) / 2, outer.d / 2 - 0.07);
    this.add(block(outer.w, tall - 0.35, 0.14, 0.04), blue, 0, ground + 0.35 + (tall - 0.35) / 2, -outer.d / 2 + 0.07);
    for (const s of [-1, 1]) this.add(block(0.14, tall - 0.35, outer.d, 0.04), s > 0 ? [side, blue, blue, blue, blue, blue] : [blue, side, blue, blue, blue, blue], s * (outer.w / 2 - 0.07), ground + 0.35 + (tall - 0.35) / 2, 0);
    // Blue corner posts, a black kick strip and four casters.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.add(block(0.32, tall, 0.32, 0.1), blue, sx * (outer.w / 2), ground + tall / 2, sz * (outer.d / 2));
    this.add(block(outer.w + 0.1, 0.35, outer.d + 0.1, 0.05), dark, 0, ground + 0.175, 0).castShadow = false;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.add(new T.CylinderGeometry(0.22, 0.22, 0.18, 16).rotateZ(Math.PI / 2), dark, sx * (outer.w / 2 - 0.5), ground + 0.12, sz * (outer.d / 2 - 0.4));
    // A coin box at the front right: a dark plate with a slot and a red lamp.
    const box = new T.Group();
    box.position.set(outer.w / 2 - 1.2, ground + tall * 0.42, outer.d / 2 + 0.02);
    this.add(block(1.1, 1.2, 0.12, 0.04), this.standard({ color: "#2a2c34", roughness: 0.4, metalness: 0.5 }), 0, 0, 0, box);
    this.add(block(0.08, 0.36, 0.05, 0.01), dark, -0.22, 0.2, 0.07, box);
    this.add(new T.SphereGeometry(0.12, 14, 10), this.standard({ color: "#ff3a3a", emissive: "#ff2020", emissiveIntensity: 0.8 }), 0.25, -0.28, 0.08, box);
    this.scene.add(box);
    // A chrome trim round the deck.
    for (const sz of [-1, 1]) this.add(block(outer.w, 0.12, trim, 0.04), chrome, 0, 0.0, sz * (d / 2 + trim / 2));
    for (const sx of [-1, 1]) this.add(block(trim, 0.12, d, 0.04), chrome, sx * (w / 2 + trim / 2), 0.0, 0);
    // The deck, cut through at the holes.
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
    // The print laid across the whole deck (a shape's own coordinates are not 0 to 1).
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + d / 2) / d);
    top.rotateX(-Math.PI / 2);
    const deck = this.add(top, this.standard({ map: keep(deckPrint()), roughness: 0.5 }), 0, 0, 0);
    deck.castShadow = false;
    // The wells under the holes, dark inside, and raised rims of glossy green plastic round them.
    const wall = keep(new T.CylinderGeometry(HOLE_R, HOLE_R, well, 36, 1, true)),
      inside = this.standard({ color: "#101a10", roughness: 0.9, side: T.BackSide }),
      floorPaint = this.standard({ color: "#0a0f08", roughness: 0.95 }),
      bottom = keep(new T.CircleGeometry(HOLE_R, 36).rotateX(-Math.PI / 2)),
      rim = keep(new T.TorusGeometry(HOLE_R + 0.08, 0.15, 16, 48).rotateX(Math.PI / 2));
    for (const [x, z] of HOLES) {
      this.add(wall, inside, x, -well / 2, z).castShadow = false;
      this.add(bottom, floorPaint, x, -well + 0.01, z).castShadow = false;
      const paint = keep(glossy({ color: "#5ccf5a", emissive: "#ffe23a", emissiveIntensity: 0, roughness: 0.3 }, 0.5));
      this.rims.push(paint);
      this.add(rim, paint, x, 0.07, z);
    }
  }
  /** The red strip behind the deck with its two vents, and the tall painted sign above it with the score and the time in lights. */
  private sign(keep: <R extends { dispose(): void }>(r: R) => R) {
    const { w, d, trim, marquee } = FIELD,
      width = w + 2 * trim,
      back = -d / 2 - trim,
      red = keep(glossy({ color: "#e8323a", roughness: 0.4 }, 0.4)),
      blue = keep(glossy({ color: "#1f5fd0", roughness: 0.38 }, 0.4)),
      dark = this.standard({ color: "#16182a", roughness: 0.6 });
    const strip = 0.8;
    this.add(block(width, strip, 0.5, 0.06), red, 0, strip / 2, back - 0.25);
    for (const x of [-1.4, 1.4]) this.add(block(0.8, 0.4, 0.05, 0.02), dark, x, strip / 2, back + 0.01);
    // The sign: a blue frame round the painted board, standing on the strip, leaning back a little.
    const board = new T.Group();
    board.position.set(0, strip, back - 0.35);
    board.rotation.x = -0.12;
    this.scene.add(board);
    this.add(block(width + 0.3, marquee + 0.3, 0.3, 0.12), blue, 0, marquee / 2, 0, board);
    const art = this.add(new T.PlaneGeometry(width - 0.1, marquee - 0.1), this.standard({ map: keep(marqueeArt()), roughness: 0.55 }), 0, marquee / 2, 0.16, board);
    art.castShadow = false;
    // The lights, set in the sign's upper left as on such machines: a dark window with the time and the score.
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const texture = keep(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    this.add(block(3.9, 1.2, 0.08, 0.04), dark, -width / 2 + 2.25, marquee - 0.85, 0.17, board);
    const screen = this.add(new T.PlaneGeometry(3.7, 1.0), this.own(new T.MeshBasicMaterial({ map: texture, toneMapped: false })), -width / 2 + 2.25, marquee - 0.85, 0.22, board);
    screen.castShadow = screen.receiveShadow = false;
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
    // A padded beige head on a blue handle, as on such machines, tied to the cabinet by a white cable.
    const pad = this.standard({ color: "#e9c690", roughness: 0.75 }),
      cap = this.standard({ color: "#d9ae72", roughness: 0.75 }),
      wood = keep(glossy({ color: "#2f6ad8", roughness: 0.35 }, 0.5)),
      grip = this.standard({ color: "#f2f2f2", roughness: 0.6 }),
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
    this.cable = new T.Mesh(new T.BufferGeometry(), this.standard({ color: "#f4f4f4", roughness: 0.6 }));
    this.cable.castShadow = true;
    this.scene.add(this.cable);
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
    // A copy flies off from where the hat sat (its place in the scene, not the mole's own frame).
    const flying = model.hat.clone(),
      from = model.hat.getWorldPosition(new T.Vector3());
    flying.visible = true;
    flying.position.copy(from);
    this.scene.add(flying);
    this.hats.push({ hat: flying, from, at: now });
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
    // A rim flashes yellow when its mole is hit.
    this.rims.forEach((paint, hole) => {
      const since = now - this.flash[hole];
      paint.emissiveIntensity = since < 360 ? 1.4 * (1 - since / 360) : 0;
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
    // The cable hangs from the handle's end to the cabinet's right side, laid afresh when the hand has moved.
    this.cable.visible = this.mallet.visible;
    this.mallet.updateMatrixWorld();
    const end = this.mallet.localToWorld(new T.Vector3(0, 0, 0.2));
    if (end.distanceTo(this.cableFrom) > 0.01) {
      this.cableFrom.copy(end);
      const anchor = new T.Vector3(FIELD.w / 2 + FIELD.trim + 0.05, -0.6, FIELD.d / 2 - 0.6),
        low = Math.min(end.y, anchor.y) - 0.6 - end.distanceTo(anchor) * 0.12,
        mid = end.clone().lerp(anchor, 0.5).setY(low);
      this.cable.geometry.dispose();
      this.cable.geometry = new T.TubeGeometry(new T.QuadraticBezierCurve3(end, mid, anchor), 24, 0.035, 6);
    }
    // Hard hats knocked off fly up and away to the right, turning over, and are gone.
    this.hats = this.hats.filter((flight) => {
      const p = (now - flight.at) / 560;
      if (p >= 1) {
        flight.hat.removeFromParent();
        return false;
      }
      flight.hat.position.set(flight.from.x + p * 1.6, flight.from.y + Math.sin(p * Math.PI) * 1.4 - p * 0.8, flight.from.z - p * 0.5);
      flight.hat.rotation.set(-0.12 + p * 6, 0, p * 3);
      return true;
    });
    // The park: the big wheel turns slowly (its gondolas hang upright) and the bulbs twinkle.
    const { wheel, bulbs } = this.fair;
    wheel.rotation.z = now / 9000;
    for (const car of wheel.children) if (car.userData.gondola) car.rotation.z = -wheel.rotation.z;
    bulbs.forEach((bulb, k) => (bulb.emissiveIntensity = (k + Math.floor(now / 300)) % 3 === 0 ? 1.4 : 0.5));
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
      for (const flight of this.hats) flight.hat.removeFromParent();
      this.hats = [];
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
    this.cable.geometry.dispose();
    for (const word of this.words) {
      (word.sprite.material as T.SpriteMaterial).map?.dispose();
      word.sprite.material.dispose();
    }
    super.dispose();
  }
}
