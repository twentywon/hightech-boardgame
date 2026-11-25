import * as T from "three";
import { cryptoRandom } from "../../core/random";
import { noZoom } from "../../engine/zoom";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot } from "../table/view";
import { EYE_Z, LEAD, LEAD_MOST, SNOWBOARD_SUBJECT, VIEW_H, VIEW_W } from "./layout";
import { CRASH, END, scoreMove, type State } from "./rules";
import { DT, GATE_H, ROCK_TOP, RUN, createWorld, extend, heightAt, speedOf, step, type Flake, type Gate, type Happening, type Rock, type World } from "./sim";

export const SNOWBOARD_COLORS: [string, string] = ["#ff6a2a", "#2a6aff"];
type Keep = <R extends { dispose(): void }>(r: R) => R;
/** The best score of this visit (kept in memory only: nothing but settings, AI preferences and gomoku results is stored). */
let best = 0;
/** The ground is built in chunks this long (metres), its columns this far apart. */
const CHUNK = 40,
  COLUMN = 0.5,
  /** The snow's top runs from `BACK` (away from the eye) to `FRONT`, where its cut side faces the eye. */
  BACK = -12,
  FRONT = 2.4;
/** Behind the riding line the snow banks up (metres for each metre back), so that the pines stand on snow. */
const BANK = 0.12;
const bankAt = (z: number) => Math.max(0, -z) * BANK;
/** How deep under the surface each row of the cut side lies (metres), and the snow's banded colours down it. */
const ROWS = [0, 0.1, 0.3, 0.6, 1, 1.6, 2.4, 3.4, 4.8, 6.6, 9, 12.5, 17, 24, 34, 60];
const BANDS = ["#ffffff", "#f2f9ff", "#dcefff", "#f4faff", "#cfe6f7", "#eaf5fd", "#bcdcf1", "#dff0fb", "#a9d0ea", "#cfe6f5", "#93c3e2", "#b8d9ee", "#7fb3d8", "#9cc6e4", "#6aa2cc", "#5a92c0"];
/** A small repeatable source of numbers (the same trees for the same chunk). */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const mod = (a: number, b: number) => ((a % b) + b) % b;
/** Seconds as m:ss.cc. */
export const clock = (s: number) => {
  const t = Math.max(0, s),
    m = Math.floor(t / 60),
    sec = Math.floor(t % 60),
    cs = Math.floor((t * 100) % 100);
  return `${m}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};
interface Chunk {
  group: T.Group;
  flakes: { flake: Flake; mesh: T.Object3D }[];
  gates: { gate: Gate; flags: T.MeshStandardMaterial[] }[];
}
interface Spray {
  points: T.Points;
  pos: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  next: number;
}

/**
 * Snowboard (스노보드): an endless snowy slope at sunset seen from the side, its cut side banded like packed snow, pines
 * along its back, far mountains in layers; a rider in a jacket and beanie on a board. The view rides the slope in
 * real time (see `sim.ts`) and reports the points, crashes and the run's end as moves; SCORE, the multiplier and
 * TIME stand over the canvas.
 */
export class SnowboardView extends TableView<State> {
  private world: World;
  private chunks = new Map<number, Chunk>();
  private rider = new T.Group();
  private body = new T.Group();
  private parts: Record<string, T.Mesh> = {};
  private backdrop = new T.Group();
  private layers: { mesh: T.Mesh; share: number; period: number }[] = [];
  private snowfall: T.Points;
  private spray: Spray;
  private hud: HTMLElement;
  private scoreText: HTMLElement;
  private multText: HTMLElement;
  private timeText: HTMLElement;
  private word: HTMLElement;
  private paused = false;
  private shown = 0;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  private distance = 30;
  /** The eye's distance for the screen's shape (`resize`), and how much further it stands now to keep the ground in sight. */
  private near = 30;
  private eye = { x: 0, y: 0, set: false };
  /** What is held: the keys, and the buttons on the screen (`pad`). */
  private keys = { tuck: false, back: false, front: false };
  private held = { tuck: false, back: false, front: false };
  private pad: HTMLElement;
  private speedText: HTMLElement;
  /** Speed lines (screen places `u`, `v` from -1 to 1 at depth `z`, each at its own share `k` of the rider's speed). */
  private lines: { mesh: T.Mesh; u: number; v: number; z: number; k: number }[] = [];
  private lineStuff: T.MeshBasicMaterial;
  /** Snow drifts and pines close to the eye, rushing by at the foot of the screen. */
  private fore: { obj: T.Object3D; x: number; z: number; pine: boolean; top: number }[] = [];
  private shadow = new T.Group();
  private shadowStuff: T.MeshBasicMaterial;
  /** The scarf: points trailing from the neck in the wind (world places), and its pieces. */
  private scarf: { points: T.Vector3[]; pieces: T.Mesh[] };
  private neck = new T.Vector3(0.1, 1.5, 0);
  private clouds: { sprite: T.Sprite; x: number; drift: number }[] = [];
  private sparkle: T.PointsMaterial;
  private lean = 0;
  private shake = typeof matchMedia === "function" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  private carving = -1;
  private counts = { pops: 0, lands: 0, crashes: 0, gates: 0, flakes: 0 };
  private keep: Keep;
  private trees: { trunk: T.BufferGeometry; crown: T.BufferGeometry; cap: T.BufferGeometry; wood: T.Material; pine: T.Material; snow: T.Material };
  private rockShape: T.BufferGeometry;
  private rockStuff: T.Material;
  private flakeStuff: T.SpriteMaterial;
  private poleShape: T.BufferGeometry;
  private flagShape: T.BufferGeometry;
  private snowStuff: T.MeshStandardMaterial;
  private sideStuff: T.MeshBasicMaterial;
  /** The sounds of the ride (set by the screen from the game's `knock`). */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#ff8a3a");
    this.world = createWorld(Math.floor(cryptoRandom() * 2e9));
    const keep: Keep = (r) => this.own(r);
    this.keep = keep;
    this.camera.far = 900;
    this.camera.updateProjectionMatrix();
    this.sky(keep);
    this.lights();
    this.mountains(keep);
    // Shared stuff for what stands on the slope.
    this.snowStuff = keep(new T.MeshStandardMaterial({ color: "#eef5ff", roughness: 0.9, emissive: "#c6dcff", emissiveIntensity: 0.42 }));
    this.sideStuff = keep(new T.MeshBasicMaterial({ vertexColors: true }));
    this.trees = {
      trunk: keep(new T.CylinderGeometry(0.12, 0.16, 1, 6)),
      crown: keep(new T.ConeGeometry(1, 1, 8)),
      cap: keep(new T.ConeGeometry(1, 1, 8)),
      wood: keep(new T.MeshStandardMaterial({ color: "#5a3a2a", roughness: 0.9 })),
      pine: keep(new T.MeshStandardMaterial({ color: "#1f5a44", roughness: 0.85 })),
      snow: keep(new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8, emissive: "#d8e6ff", emissiveIntensity: 0.2 })),
    };
    const rock = keep(new T.IcosahedronGeometry(1, 1)),
      at = rock.getAttribute("position") as T.BufferAttribute,
      bumpy = sequence(5);
    for (let k = 0; k < at.count; k++) {
      const s = 0.82 + bumpy() * 0.3;
      at.setXYZ(k, at.getX(k) * s * 1.15, Math.max(-0.2, at.getY(k) * s * 0.78), at.getZ(k) * s);
    }
    rock.computeVertexNormals();
    this.rockShape = rock;
    this.rockStuff = keep(new T.MeshStandardMaterial({ color: "#7d838d", roughness: 0.95, flatShading: true }));
    this.flakeStuff = keep(new T.SpriteMaterial({ map: keep(this.flakeArt()), transparent: true, depthWrite: false }));
    this.poleShape = keep(new T.CylinderGeometry(0.035, 0.035, GATE_H, 6));
    const flag = new T.BufferGeometry();
    flag.setAttribute("position", new T.Float32BufferAttribute([0, 0, 0, 0, -0.55, 0, 0.75, -0.24, 0], 3));
    flag.computeVertexNormals();
    this.flagShape = keep(flag);
    this.buildRider(keep);
    this.scene.add(this.rider);
    this.snowfall = this.makeSnowfall(keep);
    this.spray = this.makeSpray(keep);
    this.sparkle = keep(new T.PointsMaterial({ color: "#ffffff", size: 0.13, transparent: true, opacity: 0.9, depthWrite: false }));
    this.lineStuff = keep(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    this.shadowStuff = keep(new T.MeshBasicMaterial({ color: "#3a2a6a", transparent: true, opacity: 0.3, depthWrite: false }));
    this.speedEffects(keep);
    this.scarf = this.makeScarf(keep);
    // SCORE at the top left, the multiplier at the top right, TIME at the bottom left (decoration over the canvas: the
    // status line tells the score too).
    this.hud = document.createElement("div");
    this.hud.className = "sb-hud";
    this.hud.setAttribute("aria-hidden", "true");
    this.scoreText = document.createElement("span");
    this.scoreText.className = "sb-score";
    this.multText = document.createElement("span");
    this.multText.className = "sb-mult";
    this.timeText = document.createElement("span");
    this.timeText.className = "sb-time";
    this.word = document.createElement("span");
    this.word.className = "sb-word";
    this.speedText = document.createElement("span");
    this.speedText.className = "sb-speed";
    this.hud.append(this.scoreText, this.multText, this.timeText, this.speedText, this.word);
    host.append(this.hud);
    // The buttons on the screen: turn back and forward at the lower left, jump and tuck at the lower right (the same
    // as ← →, ↑ and ↓; held with several fingers at once).
    this.pad = document.createElement("div");
    this.pad.className = "sb-pad";
    this.pad.innerHTML =
      `<div class="sb-pad-left"><button type="button" class="sb-btn" data-act="back" aria-label="뒤로 돌기">⟲</button><button type="button" class="sb-btn" data-act="front" aria-label="앞으로 돌기">⟳</button></div>` +
      `<div class="sb-pad-right"><button type="button" class="sb-btn sb-jump" data-act="jump" aria-label="점프">▲</button><button type="button" class="sb-btn" data-act="tuck" aria-label="숙이기">▼</button></div>`;
    host.append(this.pad);
    this.controls();
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** A sunset sky: deep orange overhead to a pink glow at the horizon. */
  private sky(keep: Keep) {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 256;
    const pen = canvas.getContext("2d")!,
      g = pen.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#ff6a1e");
    g.addColorStop(0.38, "#ff8c2e");
    g.addColorStop(0.68, "#ff6f6a");
    g.addColorStop(1, "#f04aa8");
    pen.fillStyle = g;
    pen.fillRect(0, 0, 8, 256);
    const texture = keep(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    this.scene.background = texture;
  }
  private lights() {
    this.scene.add(new T.HemisphereLight("#ffe1c8", "#7aa6d8", 1.9));
    const sun = new T.DirectionalLight("#ffd2a6", 1.6);
    sun.position.set(-6, 10, 12);
    this.scene.add(sun);
    // The low sun behind the slope rims the rider and the snow with warm light.
    const rim = new T.DirectionalLight("#ff9a4a", 1.4);
    rim.position.set(14, 6, -16);
    this.scene.add(rim);
  }
  /** Far mountains in three layers that slide by slower than the slope (they follow the eye, a share of its way). */
  private mountains(keep: Keep) {
    this.scene.add(this.backdrop);
    const sun = new T.Mesh(keep(new T.CircleGeometry(26, 40)), keep(new T.MeshBasicMaterial({ color: "#ffe9a8", transparent: true, opacity: 0.85, depthWrite: false })));
    sun.position.set(40, 22, -520);
    this.backdrop.add(sun);
    const glow = new T.Mesh(keep(new T.CircleGeometry(60, 40)), keep(new T.MeshBasicMaterial({ color: "#ffc070", transparent: true, opacity: 0.25, depthWrite: false })));
    glow.position.set(40, 22, -530);
    this.backdrop.add(glow);
    const specs = [
      { z: -460, colour: "#d77aa8", height: 70, period: 520, share: 0.03, seed: 3, low: -40 },
      { z: -300, colour: "#b85b92", height: 52, period: 360, share: 0.07, seed: 9, low: -48 },
      { z: -170, colour: "#93497f", height: 30, period: 230, share: 0.14, seed: 21, low: -40 },
    ];
    for (const s of specs) {
      const random = sequence(s.seed),
        waves = [1, 2, 3, 5, 8].map((k) => ({ k, a: (random() * 0.8 + 0.2) / k, p: random() * Math.PI * 2 })),
        shape = new T.Shape(),
        span = 3 * s.period,
        steps = 240;
      shape.moveTo(-span / 2, s.low - 200);
      for (let i = 0; i <= steps; i++) {
        const x = -span / 2 + (span * i) / steps,
          u = (x / s.period) * Math.PI * 2;
        let y = 0;
        for (const w of waves) y += w.a * Math.sin(w.k * u + w.p);
        shape.lineTo(x, s.low + s.height * (0.55 + 0.45 * y));
      }
      shape.lineTo(span / 2, s.low - 200);
      shape.closePath();
      // Coloured down from the ridge into the evening haze, with snow on the peaks.
      const body = keep(new T.ShapeGeometry(shape)),
        at = body.getAttribute("position") as T.BufferAttribute,
        base = new T.Color(s.colour),
        haze = new T.Color("#ffb08a"),
        colours: number[] = [];
      for (let k = 0; k < at.count; k++) {
        const c = base.clone().lerp(haze, at.getY(k) < s.low - 100 ? 0.75 : 0);
        colours.push(c.r, c.g, c.b);
      }
      body.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
      const mesh = new T.Mesh(body, keep(new T.MeshBasicMaterial({ vertexColors: true })));
      mesh.position.z = s.z;
      const ridge: number[] = [],
        caps: number[] = [],
        capIndex: number[] = [],
        snowLine = s.low + s.height * 0.78;
      for (let i = 0; i <= steps; i++) {
        const x = -span / 2 + (span * i) / steps,
          u = (x / s.period) * Math.PI * 2;
        let y = 0;
        for (const w of waves) y += w.a * Math.sin(w.k * u + w.p);
        const top = s.low + s.height * (0.55 + 0.45 * y),
          // The snow reaches down unevenly, in tongues along the gullies.
          deep = top > snowLine ? (top - snowLine) * (0.45 + 0.3 * Math.sin(x * 0.23) * Math.sin(x * 0.071 + 1.3) + 0.15 * Math.sin(x * 0.61)) + s.height * 0.03 : 0;
        ridge.push(x, top, 0.2);
        caps.push(x, top + 0.05, 0.1, x, top - deep, 0.1);
        if (i > 0) capIndex.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, i * 2, (i - 1) * 2 + 1, i * 2 + 1);
      }
      const capShape = keep(new T.BufferGeometry());
      capShape.setAttribute("position", new T.Float32BufferAttribute(caps, 3));
      capShape.setIndex(capIndex);
      mesh.add(new T.Mesh(capShape, keep(new T.MeshBasicMaterial({ color: new T.Color(s.colour).lerp(new T.Color("#fff1f4"), 0.72) }))));
      const rim = keep(new T.BufferGeometry());
      rim.setAttribute("position", new T.Float32BufferAttribute(ridge, 3));
      mesh.add(new T.Line(rim, keep(new T.LineBasicMaterial({ color: "#ffd9b0", transparent: true, opacity: 0.7 }))));
      this.backdrop.add(mesh);
      this.layers.push({ mesh, share: s.share, period: s.period });
    }
    // Soft clouds lit from below by the setting sun, drifting slowly.
    const cloudArt = keep(this.cloudArt()),
      random = sequence(41);
    for (let k = 0; k < 7; k++) {
      const sprite = new T.Sprite(keep(new T.SpriteMaterial({ map: cloudArt, transparent: true, depthWrite: false, opacity: 0.55 + random() * 0.35 })));
      sprite.scale.set(70 + random() * 90, 16 + random() * 14, 1);
      sprite.position.set(0, 40 + random() * 55, -420 + random() * 120);
      this.backdrop.add(sprite);
      this.clouds.push({ sprite, x: random() * 900, drift: 1 + random() * 2 });
    }
  }
  /** A cloud: soft overlapping puffs, pale on top and warm underneath. */
  private cloudArt() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const pen = canvas.getContext("2d")!,
      random = sequence(8);
    for (let k = 0; k < 14; k++) {
      const x = 30 + random() * 196,
        y = 40 + random() * 26,
        r = 18 + random() * 22,
        g = pen.createRadialGradient(x, y - r * 0.3, 2, x, y, r);
      g.addColorStop(0, "rgba(255,236,220,0.9)");
      g.addColorStop(0.6, "rgba(255,170,150,0.55)");
      g.addColorStop(1, "rgba(255,140,150,0)");
      pen.fillStyle = g;
      pen.fillRect(0, 0, 256, 96);
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }
  /** Speed lines, the shadow, and the drifts and pines close to the eye. */
  private speedEffects(keep: Keep) {
    const strip = keep(new T.PlaneGeometry(1, 1)),
      random = sequence(19);
    for (let k = 0; k < 34; k++) {
      const mesh = new T.Mesh(strip, this.lineStuff);
      mesh.renderOrder = 6;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.lines.push({ mesh, u: random() * 2.4 - 1.2, v: random() * 1.7 - 0.85, z: 3 + random() * 13, k: 0.7 + random() * 0.9 });
    }
    const blob = new T.Mesh(keep(new T.CircleGeometry(1, 28)), this.shadowStuff);
    blob.rotation.x = -Math.PI / 2;
    blob.renderOrder = 2;
    this.shadow.add(blob);
    this.scene.add(this.shadow);
    const drift = keep(new T.SphereGeometry(1, 20, 10)),
      // In the shade by the eye: bluer than the sunlit slope, so the slope and the words over the screen stand out.
      driftStuff = keep(new T.MeshStandardMaterial({ color: "#b9cde8", roughness: 0.95, emissive: "#6f86b8", emissiveIntensity: 0.3 })),
      darkPine = keep(new T.MeshStandardMaterial({ color: "#123428", roughness: 0.9 }));
    for (let k = 0; k < 12; k++) {
      const pine = k % 4 === 3,
        obj = new T.Group();
      if (pine) {
        for (let layer = 0; layer < 4; layer++) {
          const crown = new T.Mesh(this.trees.crown, darkPine);
          crown.scale.set(2.4 - layer * 0.5, 2.6 - layer * 0.35, 2.4 - layer * 0.5);
          crown.position.y = 1.2 + layer * 1.5;
          obj.add(crown);
          const cap = new T.Mesh(this.trees.cap, this.trees.snow);
          cap.scale.set((2.4 - layer * 0.5) * 0.6, (2.6 - layer * 0.35) * 0.35, (2.4 - layer * 0.5) * 0.6);
          cap.position.y = crown.position.y + (2.6 - layer * 0.35) * 0.32;
          obj.add(cap);
        }
      } else {
        const mound = new T.Mesh(drift, driftStuff);
        mound.scale.set(2.4 + random() * 2.4, 1.1 + random() * 0.5, 1.4);
        obj.add(mound);
      }
      obj.traverse((o) => (o.frustumCulled = false));
      this.scene.add(obj);
      this.fore.push({ obj, x: k * 11 + random() * 6, z: 8 + random() * 4, pine, top: pine ? -0.76 : -0.92 });
    }
  }
  /** A red scarf of a few pieces, trailing from the neck. */
  private makeScarf(keep: Keep) {
    const piece = keep(new T.BoxGeometry(1, 1, 1)),
      red = keep(new T.MeshStandardMaterial({ color: "#e8344a", roughness: 0.7 })),
      white = keep(new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 })),
      points: T.Vector3[] = [],
      pieces: T.Mesh[] = [];
    for (let k = 0; k < 7; k++) points.push(new T.Vector3(-k * 0.18, 1.9, 0));
    for (let k = 0; k < 6; k++) {
      const mesh = new T.Mesh(piece, k % 2 ? white : red);
      this.scene.add(mesh);
      pieces.push(mesh);
    }
    return { points, pieces };
  }
  /** The rider: a board, legs bent at the knee, a jacket, arms out, a head in a beanie and goggles. */
  private buildRider(keep: Keep) {
    const m = (color: string, rough = 0.6) => keep(new T.MeshStandardMaterial({ color, roughness: rough })),
      jacket = m("#ffcf2e", 0.55),
      pants = m("#2a3f8f", 0.7),
      glove = m("#1c1c24"),
      skin = m("#f2c7a2"),
      beanie = m("#e8344a", 0.8),
      lens = keep(new T.MeshStandardMaterial({ color: "#2ad0ff", metalness: 0.6, roughness: 0.2, emissive: "#0a6a8a", emissiveIntensity: 0.4 })),
      limb = keep(new T.CylinderGeometry(1, 1, 1, 10)),
      joint = keep(new T.SphereGeometry(1, 12, 10));
    const add = (name: string, geometry: T.BufferGeometry, material: T.Material) => {
      const mesh = new T.Mesh(geometry, material);
      this.parts[name] = mesh;
      this.body.add(mesh);
      return mesh;
    };
    for (const side of ["l", "r"]) {
      add(`thigh${side}`, limb, pants);
      add(`shin${side}`, limb, pants);
      add(`knee${side}`, joint, pants).scale.setScalar(0.085);
      add(`boot${side}`, keep(new T.BoxGeometry(0.26, 0.14, 0.2)), m("#20202a"));
      add(`upper${side}`, limb, jacket);
      add(`fore${side}`, limb, jacket);
      add(`hand${side}`, joint, glove).scale.setScalar(0.07);
    }
    add("torso", keep(new T.CapsuleGeometry(0.2, 0.36, 6, 12)), jacket);
    add("hips", joint, pants).scale.set(0.2, 0.13, 0.15);
    add("head", joint, skin).scale.setScalar(0.135);
    add("beanie", keep(new T.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), beanie).scale.setScalar(0.145);
    add("pom", joint, m("#ffffff")).scale.setScalar(0.05);
    add("goggles", keep(new T.BoxGeometry(0.2, 0.07, 0.06)), lens);
    // The board: a deck with its nose and tail turned up.
    const board = new T.Group(),
      deck = keep(new T.MeshStandardMaterial({ color: "#ff3d6e", roughness: 0.4 })),
      stripe = keep(new T.MeshStandardMaterial({ color: "#2ae0c8", roughness: 0.4 }));
    const slab = new T.Mesh(keep(new T.BoxGeometry(1.3, 0.05, 0.3)), deck);
    board.add(slab);
    const band = new T.Mesh(keep(new T.BoxGeometry(0.5, 0.052, 0.31)), stripe);
    board.add(band);
    for (const s of [-1, 1]) {
      const tip = new T.Mesh(keep(new T.BoxGeometry(0.28, 0.05, 0.3)), deck);
      tip.position.set(s * 0.78, 0.04, 0);
      tip.rotation.z = s * 0.3;
      board.add(tip);
    }
    // Bindings and a dark base edge.
    const binding = keep(new T.MeshStandardMaterial({ color: "#202028", roughness: 0.5 }));
    for (const s of [-1, 1]) {
      const strap = new T.Mesh(keep(new T.BoxGeometry(0.2, 0.08, 0.32)), binding);
      strap.position.set(s * 0.3, 0.06, 0);
      board.add(strap);
    }
    const base = new T.Mesh(keep(new T.BoxGeometry(1.32, 0.018, 0.31)), keep(new T.MeshStandardMaterial({ color: "#3a1a40", roughness: 0.3 })));
    base.position.y = -0.03;
    board.add(base);
    board.position.y = 0.03;
    this.rider.add(board, this.body);
    // Drawn a little larger than life, so that the rider reads well against the wide slope.
    this.rider.scale.setScalar(1.25);
  }
  /** Sets a limb (a unit cylinder along y) from `a` to `b`, `r` thick. */
  private bone(mesh: T.Mesh, a: T.Vector3, b: T.Vector3, r: number) {
    const d = new T.Vector3().subVectors(b, a),
      length = d.length();
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    mesh.scale.set(r, length, r);
  }
  /** The rider's pose: how crouched, and whether it is tumbling (arms flung). */
  private pose(crouch: number, tumble: boolean, t: number) {
    const p = this.parts,
      hipY = 0.92 - 0.36 * crouch,
      lean = 0.06 + 0.16 * crouch,
      hip = new T.Vector3(lean * 0.4, hipY, 0),
      shoulder = new T.Vector3(lean + 0.06, hipY + 0.56 - 0.08 * crouch, 0.02);
    for (const [side, s] of [["l", -1], ["r", 1]] as const) {
      const foot = new T.Vector3(s * 0.3, 0.12, 0),
        top = new T.Vector3(hip.x + s * 0.1, hip.y, 0),
        span = foot.distanceTo(top),
        reach = 0.5,
        bend = Math.sqrt(Math.max(0.0001, reach * reach - (span / 2) * (span / 2))),
        knee = new T.Vector3().addVectors(foot, top).multiplyScalar(0.5);
      // Knees bend out in front (toward the eye) and a little toward the board's ends.
      knee.z += bend * 0.9;
      knee.x += s * bend * 0.35;
      this.bone(p[`thigh${side}`], top, knee, 0.085);
      this.bone(p[`shin${side}`], knee, foot, 0.075);
      p[`knee${side}`].position.copy(knee);
      p[`boot${side}`].position.set(foot.x, 0.1, 0);
      // Arms out for balance, swinging a little; flung when tumbling.
      const sh = new T.Vector3(shoulder.x + s * 0.2, shoulder.y - 0.04, 0.02),
        wave = Math.sin(t * 2.3 + s) * 0.06,
        hand = tumble ? new T.Vector3(sh.x + s * 0.4, sh.y + 0.45, 0.15) : new T.Vector3(sh.x + s * 0.55, sh.y - 0.18 + wave - 0.1 * crouch, 0.08),
        elbow = new T.Vector3().addVectors(sh, hand).multiplyScalar(0.5).add(new T.Vector3(0, -0.06, 0.06));
      this.bone(p[`upper${side}`], sh, elbow, 0.065);
      this.bone(p[`fore${side}`], elbow, hand, 0.058);
      p[`hand${side}`].position.copy(hand);
    }
    p.hips.position.copy(hip);
    const torsoMid = new T.Vector3().addVectors(hip, shoulder).multiplyScalar(0.5);
    p.torso.position.copy(torsoMid);
    p.torso.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3().subVectors(shoulder, hip).normalize());
    const head = shoulder.clone().add(new T.Vector3(0.03, 0.24, 0));
    this.neck.copy(shoulder).add(new T.Vector3(-0.02, 0.1, 0));
    p.head.position.copy(head);
    p.beanie.position.copy(head).add(new T.Vector3(0, 0.02, 0));
    p.pom.position.copy(head).add(new T.Vector3(0, 0.17, 0));
    p.goggles.position.copy(head).add(new T.Vector3(0, 0.02, 0.11));
  }
  /** A white six-armed snowflake that glows (the ones to collect). */
  private flakeArt() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const pen = canvas.getContext("2d")!,
      glow = pen.createRadialGradient(64, 64, 4, 64, 64, 62);
    glow.addColorStop(0, "rgba(180,240,255,0.9)");
    glow.addColorStop(1, "rgba(180,240,255,0)");
    pen.fillStyle = glow;
    pen.fillRect(0, 0, 128, 128);
    pen.strokeStyle = "#ffffff";
    pen.lineCap = "round";
    pen.translate(64, 64);
    for (let k = 0; k < 6; k++) {
      pen.rotate(Math.PI / 3);
      pen.lineWidth = 7;
      pen.beginPath();
      pen.moveTo(0, 0);
      pen.lineTo(0, -44);
      pen.stroke();
      pen.lineWidth = 5;
      pen.beginPath();
      pen.moveTo(0, -26);
      pen.lineTo(-12, -38);
      pen.moveTo(0, -26);
      pen.lineTo(12, -38);
      pen.stroke();
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }
  private makeSnowfall(keep: Keep) {
    const n = 260,
      pos = new Float32Array(n * 3),
      random = sequence(77);
    for (let k = 0; k < n; k++) pos.set([(random() - 0.5) * 70, (random() - 0.5) * 40, -14 + random() * 22], k * 3);
    const geometry = keep(new T.BufferGeometry());
    geometry.setAttribute("position", new T.BufferAttribute(pos, 3));
    const points = new T.Points(geometry, keep(new T.PointsMaterial({ color: "#ffffff", size: 0.14, transparent: true, opacity: 0.85, depthWrite: false })));
    points.frustumCulled = false;
    this.scene.add(points);
    return points;
  }
  private makeSpray(keep: Keep): Spray {
    const n = 160,
      pos = new Float32Array(n * 3).fill(-9999),
      geometry = keep(new T.BufferGeometry());
    geometry.setAttribute("position", new T.BufferAttribute(pos, 3));
    const points = new T.Points(geometry, keep(new T.PointsMaterial({ color: "#ffffff", size: 0.22, transparent: true, opacity: 0.9, depthWrite: false })));
    points.frustumCulled = false;
    this.scene.add(points);
    return { points, pos, vel: new Float32Array(n * 3), life: new Float32Array(n), next: 0 };
  }
  private puff(x: number, y: number, vx: number, vy: number) {
    const s = this.spray,
      k = s.next;
    s.next = (s.next + 1) % s.life.length;
    s.pos.set([x, y, (Math.random() - 0.5) * 0.6], k * 3);
    s.vel.set([vx, vy, (Math.random() - 0.5) * 1.2], k * 3);
    s.life[k] = 0.5 + Math.random() * 0.35;
  }
  /** The chunk `i` of the slope: its snowy top, its banded cut side, pines behind, and what stands on it. */
  private buildChunk(i: number): Chunk {
    const course = this.world.course,
      x0 = i * CHUNK,
      cols = Math.round(CHUNK / COLUMN) + 1;
    extend(course, x0 + CHUNK + 20);
    const group = new T.Group(),
      heights: number[] = [];
    for (let c = 0; c < cols; c++) heights.push(heightAt(course, x0 + c * COLUMN));
    // The top, from the bank at the back to the cut edge.
    const zs = [BACK, -9, -6, -3.5, -1.5, 0, 0.6, FRONT],
      top: number[] = [],
      index: number[] = [];
    for (let c = 0; c < cols; c++) for (const z of zs) top.push(x0 + c * COLUMN, heights[c] + bankAt(z), z);
    for (let c = 0; c < cols - 1; c++)
      for (let r = 0; r < zs.length - 1; r++) {
        const a = c * zs.length + r,
          b = a + zs.length;
        index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    const topShape = new T.BufferGeometry();
    topShape.setAttribute("position", new T.Float32BufferAttribute(top, 3));
    topShape.setIndex(index);
    topShape.computeVertexNormals();
    group.add(new T.Mesh(topShape, this.snowStuff));
    // The cut side: rows following the surface down, in bands.
    const side: number[] = [],
      colours: number[] = [],
      sideIndex: number[] = [],
      colour = new T.Color();
    for (let c = 0; c < cols; c++)
      ROWS.forEach((d, r) => {
        // The bands waver a little, as packed layers do.
        const wobble = d > 0 ? Math.sin((x0 + c * COLUMN) * 0.21 + r * 1.7) * Math.min(0.5, d * 0.05) : 0;
        side.push(x0 + c * COLUMN, heights[c] - d + wobble, FRONT);
        colour.set(BANDS[r]);
        colours.push(colour.r, colour.g, colour.b);
      });
    for (let c = 0; c < cols - 1; c++)
      for (let r = 0; r < ROWS.length - 1; r++) {
        const a = c * ROWS.length + r,
          b = a + ROWS.length;
        sideIndex.push(a, a + 1, b, b, a + 1, b + 1);
      }
    const sideShape = new T.BufferGeometry();
    sideShape.setAttribute("position", new T.Float32BufferAttribute(side, 3));
    sideShape.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
    sideShape.setIndex(sideIndex);
    group.add(new T.Mesh(sideShape, this.sideStuff));
    // A bright rim along the cut edge.
    const rim: number[] = [];
    for (let c = 0; c < cols; c++) rim.push(x0 + c * COLUMN, heights[c] + 0.02, FRONT + 0.01);
    const rimShape = new T.BufferGeometry();
    rimShape.setAttribute("position", new T.Float32BufferAttribute(rim, 3));
    group.add(new T.Line(rimShape, new T.LineBasicMaterial({ color: "#9fdcff" })));
    // Glints on the snow.
    const glints: number[] = [],
      shine = sequence(77 + i * 131);
    for (let k = 0; k < 45; k++) {
      const x = x0 + shine() * CHUNK,
        z = -7 + shine() * 9;
      glints.push(x, heightAt(course, x) + bankAt(z) + 0.04, z);
    }
    const glintShape = new T.BufferGeometry();
    glintShape.setAttribute("position", new T.Float32BufferAttribute(glints, 3));
    group.add(new T.Points(glintShape, this.sparkle));
    // Pines along the back of the slope.
    const random = sequence(1000 + i * 7919),
      tr = this.trees;
    for (let k = 0; k < 6; k++) {
      const x = x0 + random() * CHUNK,
        z = -10.5 + random() * 6,
        y = heightAt(course, x) + bankAt(z) - 0.15,
        size = 1.6 + random() * 1.6,
        tree = new T.Group();
      const trunk = new T.Mesh(tr.trunk, tr.wood);
      trunk.scale.set(size * 0.6, size * 0.35, size * 0.6);
      trunk.position.y = size * 0.17;
      tree.add(trunk);
      for (let layer = 0; layer < 3; layer++) {
        const w = size * (0.55 - layer * 0.13),
          h = size * (0.7 - layer * 0.12),
          crown = new T.Mesh(tr.crown, tr.pine);
        crown.scale.set(w, h, w);
        crown.position.y = size * (0.55 + layer * 0.38);
        tree.add(crown);
        const cap = new T.Mesh(tr.cap, tr.snow);
        cap.scale.set(w * 0.62, h * 0.4, w * 0.62);
        cap.position.y = crown.position.y + h * 0.33;
        tree.add(cap);
      }
      tree.position.set(x, y, z);
      group.add(tree);
    }
    // Rocks, gates and snowflakes in this stretch.
    const inside = (x: number) => x >= x0 && x < x0 + CHUNK;
    course.rocks.filter((r: Rock) => inside(r.x)).forEach((r) => {
      const rock = new T.Mesh(this.rockShape, this.rockStuff);
      rock.scale.setScalar(r.r);
      // Its top at `ROCK_TOP` radii over the snow, as the run reckons it.
      rock.position.set(r.x, heightAt(course, r.x) + r.r * (ROCK_TOP - 0.74), 0);
      rock.rotation.y = r.x;
      group.add(rock);
      // A little snow on its top.
      const cap = new T.Mesh(this.rockShape, this.snowStuff);
      cap.scale.set(r.r * 0.8, r.r * 0.35, r.r * 0.8);
      cap.position.set(r.x, heightAt(course, r.x) + r.r * (ROCK_TOP - 0.2), 0);
      group.add(cap);
    });
    const gates: Chunk["gates"] = [];
    course.gates.filter((g) => inside(g.x)).forEach((gate) => {
      const flags: T.MeshStandardMaterial[] = [];
      for (const [z, colour] of [
        [-1.4, "#e8344a"],
        [1.4, "#2a6aff"],
      ] as const) {
        const y = heightAt(course, gate.x),
          pole = new T.Mesh(this.poleShape, this.trees.wood);
        pole.position.set(gate.x, y + GATE_H / 2, z);
        group.add(pole);
        const stuff = new T.MeshStandardMaterial({ color: colour, side: T.DoubleSide, roughness: 0.6, emissive: colour, emissiveIntensity: 0.15 });
        flags.push(stuff);
        const flag = new T.Mesh(this.flagShape, stuff);
        flag.position.set(gate.x, y + GATE_H, z);
        group.add(flag);
      }
      gates.push({ gate, flags });
    });
    const flakes: Chunk["flakes"] = [];
    course.flakes.filter((f) => inside(f.x)).forEach((flake) => {
      const sprite = new T.Sprite(this.flakeStuff);
      sprite.scale.setScalar(1.1);
      sprite.position.set(flake.x, flake.y, 0.3);
      sprite.visible = !flake.taken;
      group.add(sprite);
      flakes.push({ flake, mesh: sprite });
    });
    this.scene.add(group);
    return { group, flakes, gates };
  }
  private dropChunk(i: number) {
    const chunk = this.chunks.get(i);
    if (!chunk) return;
    chunk.group.removeFromParent();
    chunk.group.traverse((o) => {
      const mesh = o as T.Mesh;
      // Only the chunk's own geometry and materials (the shared ones are kept).
      if ((mesh.isMesh || (o as T.Line).isLine || (o as T.Points).isPoints) && mesh.geometry && !this.sharedGeometry(mesh.geometry)) mesh.geometry.dispose();
      if ((o as T.Line).isLine) ((o as T.Line).material as T.Material).dispose();
    });
    for (const g of chunk.gates) g.flags.forEach((f) => f.dispose());
    this.chunks.delete(i);
  }
  private sharedGeometry(g: T.BufferGeometry) {
    const t = this.trees;
    return g === t.trunk || g === t.crown || g === t.cap || g === this.rockShape || g === this.poleShape || g === this.flagShape;
  }
  /** The chunks round the eye built, the ones left behind dropped. */
  private chunksAround(x: number) {
    const from = Math.floor((x - 40) / CHUNK),
      to = Math.floor((x + 70) / CHUNK);
    for (let i = from; i <= to; i++) if (!this.chunks.has(i)) this.chunks.set(i, this.buildChunk(i));
    for (const i of [...this.chunks.keys()]) if (i < from - 1 || i > to + 1) this.dropChunk(i);
  }
  private controls() {
    const el = this.renderer.domElement;
    noZoom(el);
    // A tap on the slope itself jumps (the buttons and keys do the rest).
    el.addEventListener("pointerdown", (e) => {
      if (this.disposed || (e.pointerType === "mouse" && e.button !== 0)) return;
      this.jump();
    });
    const fingers = new Map<number, "tuck" | "back" | "front">();
    this.pad.addEventListener("pointerdown", (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (!act || this.disposed) return;
      e.preventDefault();
      if (act === "jump") return this.jump();
      fingers.set(e.pointerId, act as "tuck" | "back" | "front");
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // A pointer the page cannot capture (it is held without).
      }
      this.handsFrom(fingers);
    });
    const lift = (e: PointerEvent) => {
      if (!fingers.delete(e.pointerId)) return;
      this.handsFrom(fingers);
    };
    this.pad.addEventListener("pointerup", lift);
    this.pad.addEventListener("pointercancel", lift);
    this.pad.addEventListener("lostpointercapture", lift);
    this.pad.addEventListener("contextmenu", (e) => e.preventDefault());
    const KEYS: Record<string, "tuck" | "back" | "front" | "jump"> = {
      ArrowDown: "tuck",
      s: "tuck",
      S: "tuck",
      ArrowUp: "jump",
      w: "jump",
      W: "jump",
      " ": "jump",
      Enter: "jump",
      ArrowLeft: "back",
      a: "back",
      A: "back",
      ArrowRight: "front",
      d: "front",
      D: "front",
    };
    const key = (down: boolean) => (e: KeyboardEvent) => {
      const which = KEYS[e.key];
      if (!which || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (which === "jump") {
        if (down) this.jump();
        return;
      }
      this.keys[which] = down;
      this.press();
    };
    el.addEventListener("keydown", key(true));
    el.addEventListener("keyup", key(false));
  }
  /** What the fingers on the buttons hold. */
  private handsFrom(fingers: Map<number, "tuck" | "back" | "front">) {
    const held = [...fingers.values()];
    this.held = { tuck: held.includes("tuck"), back: held.includes("back"), front: held.includes("front") };
    this.press();
  }
  /** ↑ (or the jump button, or a tap on the slope): the rider pops at once, or the moment it touches the snow. */
  private jump() {
    if (this.running()) this.world.jumpAt = this.world.time;
  }
  /** What the keys and buttons hold, given to the run: ↓ tucks, ← and → turn. */
  private press() {
    const back = this.keys.back || this.held.back,
      front = this.keys.front || this.held.front;
    this.world.tuck = this.running() && (this.keys.tuck || this.held.tuck);
    this.world.turn = !this.running() || back === front ? 0 : back ? -1 : 1;
  }
  protected subject() {
    return SNOWBOARD_SUBJECT;
  }
  /** How far the eye stands from the slope: `VIEW_W` across on a wide screen, at least `VIEW_H` up and down. */
  protected resize() {
    super.resize();
    const half = Math.max(VIEW_H / 2, VIEW_W / 2 / this.camera.aspect);
    this.near = half / Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    this.distance = Math.max(this.distance, this.near);
    this.follow(0, true);
    this.dirty = true;
  }
  /** Nothing on the slope is chosen by a tap: every press is the rider's (see `controls`). */
  protected spots(): Spot[] {
    return [];
  }
  protected dragStart() {
    return true;
  }
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.press();
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** Tells the screen what happened, with words over the slope and the sounds of the ride. */
  private report(events: Happening[]) {
    const knock = (kind: string, strength: number) => this.onKnock?.(kind, strength),
      move = (to: number) => this.onMove({ from: -1, to, extra: -1 }),
      r = this.world.rider;
    for (const e of events) {
      if (e.kind === "pop") {
        this.counts.pops++;
        knock("jump", e.strength);
        for (let k = 0; k < 10; k++) this.puff(r.x - 0.4, r.y + 0.05, -2 - Math.random() * 3, 1 + Math.random() * 2.5);
      } else if (e.kind === "land") {
        this.counts.lands++;
        knock("land", Math.min(1, e.airtime / 2));
        if (e.flips > 0 || e.perfect) knock("trick", e.flips);
        for (let k = 0; k < 16; k++) this.puff(r.x + (Math.random() - 0.5) * 1.2, r.y + 0.05, (Math.random() - 0.5) * 6, 1 + Math.random() * 3);
        const name = e.flips > 0 ? `${e.flips > 2 ? `${e.flips}× ` : e.flips === 2 ? "더블 " : ""}${e.back ? "백플립" : "프런트플립"}` : e.airtime > 1.2 ? "빅 에어" : "에어",
          extra = e.perfect ? " · 퍼펙트" : "";
        this.say(`${name}${extra} +${e.points.toLocaleString("ko-KR")}`, e.flips > 0 ? "#ffe14a" : "#ffffff");
        this.onMove(scoreMove(e.points));
      } else if (e.kind === "crash") {
        this.counts.crashes++;
        knock("crash", 1);
        for (let k = 0; k < 22; k++) this.puff(r.x + (Math.random() - 0.5), r.y + 0.3, (Math.random() - 0.3) * 6, 1 + Math.random() * 4);
        this.say(e.why === "rock" ? "바위에 걸려 넘어짐!" : "착지 실패!", "#ff5a6a");
        move(CRASH);
      } else if (e.kind === "gate") {
        this.counts.gates++;
        knock("gate", 1);
        this.say(`깃발 통과 +${e.points}`, "#9fe8ff");
        this.onMove(scoreMove(e.points));
        for (const chunk of this.chunks.values()) for (const g of chunk.gates) if (g.gate.passed && g.flags[0].emissiveIntensity < 1) g.flags.forEach((f) => (f.emissiveIntensity = 1.4));
      } else if (e.kind === "flake") {
        this.counts.flakes++;
        knock("flake", 1);
        this.onMove(scoreMove(e.points));
      } else if (e.kind === "end") {
        knock("carve", 0);
        move(END);
      }
      if (this.state?.winner !== null) break;
    }
  }
  /** A word over the slope for a moment (the status line keeps the score). */
  private say(text: string, colour: string) {
    if (capturing()) return;
    this.word.textContent = text;
    this.word.style.color = colour;
    this.word.classList.remove("sb-show");
    void this.word.offsetWidth;
    this.word.classList.add("sb-show");
  }
  private advance(now: number) {
    const real = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.running()) {
      this.left += real;
      while (this.left >= DT && this.state?.winner === null && !this.world.over) {
        this.left -= DT;
        this.report(step(this.world));
      }
    } else this.left = 0;
    this.draw(now, this.running() ? real : 0);
    this.redraw();
  }
  /** The eye beside the slope, a little above the rider and ahead of it, eased as it goes. */
  private follow(dt: number, snap = false) {
    const r = this.world.rider,
      lead = Math.min(LEAD_MOST, speedOf(r) * LEAD),
      goalX = r.x + lead,
      ground = heightAt(this.world.course, goalX),
      under = Math.min(ground, heightAt(this.world.course, r.x)),
      // Between the rider and the ground ahead, so that a landing is seen coming; high over a drop, the eye steps
      // back far enough to keep both in sight.
      goalY = Math.min(r.y, (r.y + under) / 2 + 1.5) + 1.2,
      tan = Math.tan(((this.camera.fov / 2) * Math.PI) / 180),
      // Quicker, the eye stands back a little (more of the slope rushes by in sight).
      quick = Math.max(0, Math.min(1, (speedOf(r) - 15) / 30)),
      goalD = Math.min(this.near * 2.2, Math.max(this.near * (1 + 0.22 * quick), ((r.y - under) / 2 + 3.5) / tan));
    if (snap || !this.eye.set) {
      this.eye = { x: goalX, y: goalY, set: true };
      this.distance = goalD;
    } else {
      this.eye.x += (goalX - this.eye.x) * (1 - Math.exp(-dt / 0.18));
      this.eye.y += (goalY - this.eye.y) * (1 - Math.exp(-dt / 0.35));
      this.distance += (goalD - this.distance) * (1 - Math.exp(-dt / 0.6));
    }
    const { x, y } = this.eye,
      // A fast ride on the snow shakes the eye a little.
      rattle = this.shake && dt > 0 && r.ground && r.crashed < 0 ? Math.max(0, speedOf(r) - 26) * 0.0025 : 0;
    this.camera.position.set(x + (Math.random() - 0.5) * rattle, y + this.distance * 0.16 + (Math.random() - 0.5) * rattle, EYE_Z + this.distance);
    this.camera.lookAt(x, y, 0);
    this.backdrop.position.set(x, y, 0);
    for (const layer of this.layers) layer.mesh.position.x = -mod(x * layer.share, layer.period);
    const time = performance.now() / 1000;
    for (const c of this.clouds) c.sprite.position.x = 450 - mod(c.x + x * 0.05 + time * c.drift, 900);
  }
  /** The shadow, the scarf, speed lines and the drifts by the eye, as quick as the rider goes. */
  private effects(dt: number, speed: number, t: number) {
    const w = this.world,
      r = w.rider,
      course = w.course;
    // The shadow on the snow below, smaller and fainter the higher the rider is.
    const ground = heightAt(course, r.x),
      slope = (heightAt(course, r.x + 0.5) - heightAt(course, r.x - 0.5)) / 1,
      up = Math.max(0, r.y - ground);
    this.shadow.position.set(r.x, ground + 0.04, 0.6);
    this.shadow.rotation.z = Math.atan(slope);
    this.shadow.scale.setScalar(Math.max(0.35, 1.05 - up * 0.06));
    this.shadowStuff.opacity = 0.32 / (1 + up * 0.18);
    // The scarf: each point follows the one before it, blown back against the way the rider goes.
    const sc = this.scarf,
      neck = this.body.localToWorld(this.neck.clone()),
      way = new T.Vector3(r.vx, r.vy, 0),
      quick = way.length();
    way.normalize();
    if (quick < 0.5) way.set(1, 0, 0);
    sc.points[0].copy(neck);
    for (let k = 1; k < sc.points.length; k++) {
      const flap = Math.sin(t * (10 + quick * 0.5) - k * 1.1) * Math.min(0.12, 0.02 + quick * 0.004) * k,
        goal = sc.points[k - 1].clone().addScaledVector(way, -0.18).add(new T.Vector3(-way.y * flap, way.x * flap - (quick < 3 ? 0.08 : 0), 0.02));
      sc.points[k].lerp(goal, dt > 0 ? Math.min(1, dt * 30) : 1);
      const a = sc.points[k - 1],
        b = sc.points[k],
        piece = sc.pieces[k - 1],
        d = new T.Vector3().subVectors(b, a);
      piece.position.copy(a).addScaledVector(d, 0.5);
      piece.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), d.clone().normalize());
      piece.scale.set(Math.max(0.05, d.length() + 0.03), 0.13 - k * 0.008, 0.07);
    }
    // Speed lines across the screen, showing once the ride is quick.
    const cam = this.camera.position,
      tan = Math.tan(((this.camera.fov / 2) * Math.PI) / 180),
      strong = Math.max(0, Math.min(1, (speed - 12) / 26)),
      heading = Math.atan2(r.vy, Math.max(0.1, r.vx));
    this.lineStuff.opacity = 0.38 * strong;
    for (const line of this.lines) {
      const depth = cam.z - line.z,
        halfH = tan * depth,
        halfW = halfH * this.camera.aspect;
      line.u -= (speed * line.k * dt) / halfW;
      if (line.u < -1.25) {
        line.u += 2.5;
        line.v = Math.random() * 1.7 - 0.85;
      }
      line.mesh.visible = strong > 0;
      line.mesh.position.set(cam.x + line.u * halfW, cam.y - this.distance * 0.16 + line.v * halfH, line.z);
      line.mesh.rotation.z = heading * 0.7;
      line.mesh.scale.set(Math.max(0.3, speed * 0.07 * line.k), 0.03 * (depth / 20), 1);
    }
    // Drifts and pines right by the eye, rushing past at the foot of the screen (they go by faster than the slope).
    const foot = new T.Vector3(),
      ray = new T.Vector3();
    let last = -Infinity;
    for (const f of this.fore) last = Math.max(last, f.x);
    for (const f of this.fore) {
      const depth = cam.z - f.z,
        halfW = tan * depth * this.camera.aspect;
      if (f.x < cam.x - halfW - 8) {
        f.x = Math.max(last, cam.x + halfW) + 6 + Math.random() * 12;
        last = f.x;
      }
      // Where the line `top` of the screen's height (from -1 at its foot) meets this depth.
      ray.set(0, f.top, 0.5).unproject(this.camera).sub(cam);
      foot.copy(cam).addScaledVector(ray, (f.z - cam.z) / ray.z);
      f.obj.position.set(f.x, f.pine ? foot.y - 5.8 : foot.y - 0.7, f.z);
    }
    // The glints twinkle.
    this.sparkle.opacity = 0.55 + 0.35 * Math.sin(t * 5);
  }
  /** Everything where the run has it: the eye, the slope's chunks, the rider and its pose, spray, snow, the HUD. */
  private draw(now: number, dt: number) {
    const w = this.world,
      r = w.rider,
      t = now / 1000;
    this.follow(dt);
    this.chunksAround(this.eye.x);
    this.rider.position.set(r.x, r.y, 0);
    this.rider.rotation.z = r.angle;
    const tumbling = r.crashed >= 0;
    this.pose(tumbling ? 0.8 : r.crouch, tumbling, t);
    // On the snow, ← and → lean the rider back or forward (in the air they turn it).
    this.lean += ((r.ground && !tumbling ? -w.turn * 0.22 : 0) - this.lean) * Math.min(1, dt * 10);
    this.body.rotation.z = this.lean;
    this.rider.updateMatrixWorld(true);
    const speed = speedOf(r);
    this.effects(dt, speed, t);
    // Snow sprayed off the board's tail while carving, more when crouched and quick.
    if (dt > 0 && r.ground && !tumbling) {
      const many = Math.min(6, speed * dt * (1.2 + 2.5 * r.crouch));
      for (let k = 0; k < many + (Math.random() < many % 1 ? 1 : 0); k++) this.puff(r.x - 0.7 * Math.cos(r.angle), r.y + 0.05, -1 - Math.random() * 2, 0.6 + Math.random() * 1.6);
    }
    const s = this.spray;
    for (let k = 0; k < s.life.length; k++) {
      if (s.life[k] <= 0) continue;
      s.life[k] -= dt;
      s.vel[k * 3 + 1] -= 6 * dt;
      for (let a = 0; a < 3; a++) s.pos[k * 3 + a] += s.vel[k * 3 + a] * dt;
      if (s.life[k] <= 0) s.pos[k * 3 + 1] = -9999;
    }
    (s.points.geometry.getAttribute("position") as T.BufferAttribute).needsUpdate = true;
    // Falling snow round the eye.
    const fall = this.snowfall.geometry.getAttribute("position") as T.BufferAttribute,
      arr = fall.array as Float32Array;
    for (let k = 0; k < fall.count; k++) {
      // Falling snow drifts in the wind and rushes past as quickly as the rider goes.
      arr[k * 3] -= dt * (0.6 + (k % 5) * 0.2 + r.vx * (0.75 + (k % 4) * 0.08));
      arr[k * 3 + 1] -= dt * (1.1 + (k % 7) * 0.12);
      if (arr[k * 3 + 1] < -20) arr[k * 3 + 1] += 40;
      if (arr[k * 3] < -35) arr[k * 3] += 70;
      if (arr[k * 3] > 35) arr[k * 3] -= 70;
    }
    fall.needsUpdate = true;
    this.snowfall.position.set(this.eye.x, this.eye.y, 0);
    // Snowflakes to take turn and bob; taken ones are gone.
    for (const chunk of this.chunks.values()) {
      for (const f of chunk.flakes) {
        f.mesh.visible = !f.flake.taken;
        f.mesh.position.y = f.flake.y + Math.sin(t * 3 + f.flake.x) * 0.08;
        (f.mesh as T.Sprite).material.rotation = t;
      }
      for (const g of chunk.gates) if (g.flags[0].emissiveIntensity > 0.15) g.flags.forEach((m) => (m.emissiveIntensity = Math.max(0.15, m.emissiveIntensity - dt * 1.2)));
    }
    // The carving sound by speed while on the snow.
    const carve = r.ground && !tumbling && this.running() ? Math.min(1, speed / 24) : 0;
    if (Math.abs(carve - this.carving) > 0.04 || (carve === 0 && this.carving !== 0)) {
      this.carving = carve;
      this.onKnock?.("carve", carve);
    }
    // SCORE, the multiplier, TIME.
    const score = this.state?.score ?? 0;
    const said = `SCORE ${score.toLocaleString("ko-KR")}|${best}`;
    if (this.scoreText.dataset.said !== said) {
      this.scoreText.dataset.said = said;
      this.scoreText.innerHTML = `SCORE ${score.toLocaleString("ko-KR")}${best > 0 ? `<small>BEST ${best.toLocaleString("ko-KR")}</small>` : ""}`;
    }
    this.multText.textContent = `×${w.multiplier}`;
    this.multText.classList.toggle("sb-hot", w.multiplier > 1);
    this.timeText.textContent = `TIME ${clock(RUN - w.time)}`;
    const kmh = Math.round(speed * 3.6);
    if (this.speedText.dataset.kmh !== String(kmh)) {
      this.speedText.dataset.kmh = String(kmh);
      this.speedText.innerHTML = `${kmh}<small>km/h</small>`;
      this.speedText.classList.toggle("sb-fast", kmh >= 100);
    }
    const d = this.renderer.domElement.dataset;
    d.phase = this.state?.winner !== null || w.over ? "over" : tumbling ? "crash" : r.ground ? "ride" : "air";
    d.x = r.x.toFixed(2);
    d.y = r.y.toFixed(2);
    d.speed = speed.toFixed(2);
    d.angle = r.angle.toFixed(3);
    d.crouch = r.crouch.toFixed(2);
    d.multiplier = String(w.multiplier);
    d.time = w.time.toFixed(2);
    d.counts = `${this.counts.pops},${this.counts.lands},${this.counts.crashes},${this.counts.gates},${this.counts.flakes}`;
    d.best = String(best);
    this.dirty = true;
  }
  protected place(state: State) {
    // A new game, known by the count of moves going back to nothing: a fresh run from the top.
    const anew = state.ply === 0 && this.shown > 0;
    this.shown = state.ply;
    if (anew) {
      for (const i of [...this.chunks.keys()]) this.dropChunk(i);
      this.world = createWorld(Math.floor(cryptoRandom() * 2e9));
      this.counts = { pops: 0, lands: 0, crashes: 0, gates: 0, flakes: 0 };
      this.keys = { tuck: false, back: false, front: false };
      this.held = { tuck: false, back: false, front: false };
      this.eye.set = false;
      this.press();
    }
    if (state.winner !== null) {
      best = Math.max(best, state.score);
      this.onKnock?.("carve", 0);
    }
    this.draw(performance.now(), 0);
  }
  protected animate() {
    return false;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    for (const i of [...this.chunks.keys()]) this.dropChunk(i);
    this.hud.remove();
    this.pad.remove();
    super.dispose();
  }
}
