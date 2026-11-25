import * as T from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { cryptoRandom } from "../../core/random";
import { noZoom } from "../../engine/zoom";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot } from "../table/view";
import { EYE_Z, LEAD, LEAD_MOST, SNOWBOARD_SUBJECT, VIEW_H, VIEW_W } from "./layout";
import { CRASH, END, scoreMove, type State } from "./rules";
import { CRASH_TIME, DT, GATE_H, ROCK_TOP, RUN, createWorld, extend, heightAt, speedOf, step, type Flake, type Gate, type Happening, type Rock, type World } from "./sim";

export const SNOWBOARD_COLORS: [string, string] = ["#ff6a2a", "#2a6aff"];
type Keep = <R extends { dispose(): void }>(r: R) => R;
/** The best score of this visit (kept in memory only: nothing but settings, AI preferences and gomoku results is stored). */
let best = 0;
/** The ground is built in chunks this long (metres), its columns this far apart. */
const CHUNK = 40,
  COLUMN = 0.5,
  /** The snow runs back from the riding line to `BACK`, away from the eye (toward it, it falls away down the mountainside). */
  BACK = -12;
/** Where the low evening sun stands (a direction): a little to the right, low over the far mountains. */
const SUN = new T.Vector3(0.35, 0.05, -1).normalize();
/** Behind the riding line the snow banks up (metres for each metre back), so that the pines stand on snow. */
const BANK = 0.12;
const bankAt = (z: number) => Math.max(0, -z) * BANK;
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
  private skyDome!: Sky;
  private sun!: T.DirectionalLight;
  private quality: "high" | "low";
  /** The scarf: points trailing from the neck in the wind (world places), and its pieces. */
  private scarf: { points: T.Vector3[]; pieces: T.Mesh[] };
  private neck = new T.Vector3(0.1, 1.5, 0);
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
  /** The sounds of the ride (set by the screen from the game's `knock`). */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#ff8a3a");
    this.quality = quality;
    // Film-like tone: the bright snow and the sky's glow roll off softly, as a camera sees them.
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;
    this.world = createWorld(Math.floor(cryptoRandom() * 2e9));
    const keep: Keep = (r) => this.own(r);
    this.keep = keep;
    this.camera.far = 9000;
    this.camera.updateProjectionMatrix();
    this.sky(keep);
    this.lights();
    this.mountains(keep);
    // Shared stuff for what stands on the slope.
    // Snow: bright, a little glossy where the wind has packed it, its surface wind-rippled (a normal map made here).
    this.snowStuff = keep(new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.68, metalness: 0, normalMap: keep(this.snowNormals()), normalScale: new T.Vector2(0.45, 0.45), emissive: "#a9c2ea", emissiveIntensity: 0.06 }));
    this.trees = {
      trunk: keep(new T.CylinderGeometry(0.12, 0.16, 1, 6)),
      crown: keep(new T.ConeGeometry(1, 1, 8)),
      cap: keep(new T.ConeGeometry(1, 1, 8)),
      wood: keep(new T.MeshStandardMaterial({ color: "#5a3a2a", roughness: 0.9 })),
      pine: keep(new T.MeshStandardMaterial({ color: "#1c3d2e", roughness: 0.92 })),
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
    this.rockStuff = keep(new T.MeshStandardMaterial({ color: "#5d5b5e", roughness: 1, flatShading: true }));
    this.flakeStuff = keep(new T.SpriteMaterial({ map: keep(this.flakeArt()), transparent: true, depthWrite: false }));
    this.poleShape = keep(new T.CylinderGeometry(0.035, 0.035, GATE_H, 6));
    const flag = new T.BufferGeometry();
    flag.setAttribute("position", new T.Float32BufferAttribute([0, 0, 0, 0, -0.55, 0, 0.75, -0.24, 0], 3));
    flag.computeVertexNormals();
    this.flagShape = keep(flag);
    this.buildRider(keep);
    this.rider.traverse((o) => (o.castShadow = true));
    this.scene.add(this.rider);
    this.snowfall = this.makeSnowfall(keep);
    this.spray = this.makeSpray(keep);
    this.sparkle = keep(new T.PointsMaterial({ color: "#ffffff", size: 0.13, transparent: true, opacity: 0.9, depthWrite: false }));
    this.lineStuff = keep(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
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
  /**
   * A physically modelled sky (scattering of the low evening sun: deep blue overhead to a warm glow at the horizon),
   * and a haze that the far mountains fade into.
   */
  private sky(keep: Keep) {
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u.turbidity.value = 7;
    u.rayleigh.value = 2.4;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.86;
    u.sunPosition.value.copy(SUN);
    keep(sky.geometry);
    keep(sky.material);
    this.skyDome = sky;
    this.scene.add(sky);
    this.scene.background = null;
    this.scene.fog = new T.Fog("#d6c0c8", 120, 720);
  }
  private lights() {
    this.scene.add(new T.HemisphereLight("#b9d2ff", "#f3eee8", 1.25));
    // The low sun from the front left, warm, casting the rider's and the pines' shadows on the snow.
    const sun = new T.DirectionalLight("#ffc895", 3.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.quality === "high" ? 2048 : 1024, this.quality === "high" ? 2048 : 1024);
    const c = sun.shadow.camera;
    [c.left, c.right, c.top, c.bottom, c.near, c.far] = [-30, 30, 22, -22, 1, 160];
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    // The sun's glow behind the slope rims the rider and the snow's edges.
    const rim = new T.DirectionalLight("#ff9a5a", 1.2);
    rim.position.set(14, 6, -16);
    this.scene.add(rim);
  }
  /**
   * Far mountains in three ranges, real relief: ridges and spurs from layered noise, snow on the gentle faces and
   * the heights, rock where it is steep, fading into the evening haze; they slide by slower than the slope.
   */
  private mountains(keep: Keep) {
    this.scene.add(this.backdrop);
    const specs = [
      { z: -560, height: 150, period: 900, share: 0.03, seed: 3, low: -70, depth: 170 },
      { z: -380, height: 95, period: 620, share: 0.07, seed: 9, low: -70, depth: 120 },
      { z: -230, height: 55, period: 380, share: 0.14, seed: 21, low: -55, depth: 80 },
    ];
    const snow = new T.Color("#f3f6fb"),
      shade = new T.Color("#c9d6ea"),
      rock = new T.Color("#7a7276"),
      // The lower slopes are forest, dark green-blue under the haze.
      dark = new T.Color("#34433f");
    for (const s of specs) {
      const random = sequence(s.seed),
        big = [1, 2, 3, 5].map((k) => ({ k, a: (random() * 0.8 + 0.2) / k, p: random() * Math.PI * 2 })),
        fine = [8, 13, 21, 34, 55, 89].map((k) => ({ k, a: (random() * 0.6 + 0.4) / Math.pow(k, 0.85), p: random() * Math.PI * 2, q: random() * 6 })),
        span = 3 * s.period,
        cols = 360,
        rows = 14,
        pos: number[] = [],
        colour: number[] = [],
        index: number[] = [];
      // Height of the range at (x, depth share d: 0 at its foot toward the eye, 1 at its back): a ridge line set back
      // a little, falling to the foot, with ridged detail.
      const heightAt = (x: number, d: number) => {
        const u = (x / s.period) * Math.PI * 2;
        let ridge = 0;
        for (const w of big) ridge += w.a * Math.sin(w.k * u + w.p);
        let detail = 0;
        for (const w of fine) detail += w.a * (1 - Math.abs(Math.sin(w.k * u * 0.5 + w.p + d * w.q)));
        const crest = s.height * (0.5 + 0.42 * ridge),
          shape = Math.sin(Math.min(1, d / 0.7) * Math.PI * 0.5);
        return s.low + (crest + detail * s.height * 0.18) * shape - (1 - shape) * 12;
      };
      for (let r = 0; r <= rows; r++)
        for (let c = 0; c <= cols; c++) {
          const x = -span / 2 + (span * c) / cols,
            d = r / rows;
          pos.push(x, heightAt(x, d), s.depth * (0.5 - d));
        }
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const a = r * (cols + 1) + c,
            b = a + cols + 1;
          index.push(a, a + 1, b, a + 1, b + 1, b);
        }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      // Snow where the face is gentle or high, rock where it is steep or low.
      const normals = geometry.getAttribute("normal") as T.BufferAttribute,
        top = s.low + s.height * 0.55,
        c = new T.Color();
      for (let k = 0; k < normals.count; k++) {
        const y = pos[k * 3 + 1],
          up = normals.getY(k),
          snowy = Math.max(0, Math.min(1, (up - 0.55) * 4 + (y - top) / (s.height * 0.4)));
        c.copy(rock).lerp(dark, Math.max(0, Math.min(1, (top - y) / s.height)));
        c.lerp(up > 0.8 ? snow : shade, snowy);
        colour.push(c.r, c.g, c.b);
      }
      geometry.setAttribute("color", new T.Float32BufferAttribute(colour, 3));
      const mesh = new T.Mesh(keep(geometry), keep(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })));
      mesh.position.z = s.z;
      this.backdrop.add(mesh);
      this.layers.push({ mesh, share: s.share, period: s.period });
    }
  }
  /** Speed lines, faint, once the ride is quick. */
  private speedEffects(keep: Keep) {
    const strip = keep(new T.PlaneGeometry(1, 1)),
      random = sequence(19);
    for (let k = 0; k < 28; k++) {
      const mesh = new T.Mesh(strip, this.lineStuff);
      mesh.renderOrder = 6;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.lines.push({ mesh, u: random() * 2.4 - 1.2, v: random() * 1.7 - 0.85, z: 3 + random() * 13, k: 0.7 + random() * 0.9 });
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
  /** A tiling normal map of wind-rippled, granular snow: a height field of ripples and grains, turned into normals. */
  private snowNormals() {
    const n = 256,
      heights = new Float32Array(n * n),
      grain = sequence(17);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const u = (x / n) * Math.PI * 2,
          v = (y / n) * Math.PI * 2;
        heights[y * n + x] = Math.sin(u * 3 + Math.sin(v * 2) * 1.5) * 0.6 + Math.sin(u * 7 + v * 2) * 0.25 + Math.sin(u * 13 - v * 5) * 0.12 + (grain() - 0.5) * 0.35;
      }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = n;
    const pen = canvas.getContext("2d")!,
      image = pen.createImageData(n, n),
      at = (x: number, y: number) => heights[((y + n) % n) * n + ((x + n) % n)];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * 1.4,
          dy = (at(x, y + 1) - at(x, y - 1)) * 1.4,
          len = Math.hypot(dx, dy, 1),
          k = (y * n + x) * 4;
        image.data.set([((-dx / len) * 0.5 + 0.5) * 255, ((-dy / len) * 0.5 + 0.5) * 255, (1 / len) * 0.5 * 255 + 127, 255], k);
      }
    pen.putImageData(image, 0, 0);
    const texture = new T.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    return texture;
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
    // The snow, from the bank at the back down the mountainside toward the eye: past the riding line it falls away
    // in drifts and hollows (no cut side: a natural slope).
    const zs = [BACK, -9, -6, -3.5, -1.5, 0, 0.7, 1.6, 3, 5, 8, 12, 17, 24, 33],
      fall = (z: number) => (z <= 1 ? 0 : -Math.pow(z - 1, 1.3) * 0.62),
      lump = (x: number, z: number) => (z <= 1 ? 0 : (Math.sin(x * 0.37 + z * 0.9) * 0.35 + Math.sin(x * 0.11 - z * 0.5) * 0.7 + Math.sin(x * 0.053 + z * 0.21) * 1.1) * Math.min(1, (z - 1) / 5)),
      top: number[] = [],
      uv: number[] = [],
      index: number[] = [];
    for (let c = 0; c < cols; c++)
      for (const z of zs) {
        const x = x0 + c * COLUMN;
        top.push(x, heights[c] + bankAt(z) + fall(z) + lump(x, z), z);
        uv.push(x * 0.05 + z * 0.013, z * 0.05);
      }
    for (let c = 0; c < cols - 1; c++)
      for (let r = 0; r < zs.length - 1; r++) {
        const a = c * zs.length + r,
          b = a + zs.length;
        index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    const topShape = new T.BufferGeometry();
    topShape.setAttribute("position", new T.Float32BufferAttribute(top, 3));
    topShape.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    topShape.setIndex(index);
    topShape.computeVertexNormals();
    const snow = new T.Mesh(topShape, this.snowStuff);
    snow.receiveShadow = true;
    group.add(snow);
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
      // A spruce: tiers narrowing to a spire, each a little turned, snow lying on their tops.
      const tiers = 5;
      for (let layer = 0; layer < tiers; layer++) {
        const w = size * (0.58 - layer * 0.1),
          h = size * (0.55 - layer * 0.06),
          crown = new T.Mesh(tr.crown, tr.pine);
        crown.scale.set(w, h, w);
        crown.position.y = size * (0.45 + layer * 0.3);
        crown.rotation.y = random() * 3;
        crown.castShadow = true;
        tree.add(crown);
        const cap = new T.Mesh(tr.cap, tr.snow);
        cap.scale.set(w * 0.7, h * 0.32, w * 0.7);
        cap.position.y = crown.position.y + h * 0.3;
        cap.rotation.y = crown.rotation.y;
        tree.add(cap);
      }
      tree.rotation.z = (random() - 0.5) * 0.06;
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
      rock.castShadow = true;
      rock.receiveShadow = true;
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
    this.skyDome.position.copy(this.camera.position);
    // The sun's shadows are drawn round the rider: the light stands up its way from the rider.
    const r_ = this.world.rider;
    this.sun.target.position.set(r_.x, r_.y, 0);
    this.sun.position.set(r_.x - 30, r_.y + 46, 40);
  }
  /**
   * How a fallen rider lies at share `p` (0 to 1) of its crash: tipping back onto the snow (to 0.18), lying and sliding
   * (to 0.68), then getting up (to 1): the body's tilt back about the feet, how crouched, and whether the arms are flung.
   */
  private fallen(p: number) {
    const ease = (u: number) => u * u * (3 - 2 * u),
      LIE = 1.42;
    if (p < 0.18) return { tilt: LIE * ease(p / 0.18), crouch: 0.6, flung: true };
    if (p < 0.68) return { tilt: LIE + Math.sin(p * 40) * 0.02, crouch: 0.35, flung: false };
    const up = ease(Math.min(1, (p - 0.68) / 0.3));
    return { tilt: LIE * (1 - up), crouch: 0.95 - 0.6 * up, flung: false };
  }
  /** The scarf and the speed lines, as quick as the rider goes. */
  private effects(dt: number, speed: number, t: number) {
    const w = this.world,
      r = w.rider,
      course = w.course;
    // The scarf: each point follows the one before it, blown back against the way the rider goes.
    const sc = this.scarf,
      neck = this.body.localToWorld(this.neck.clone()),
      way = new T.Vector3(r.vx, r.vy, 0),
      quick = way.length();
    way.normalize();
    if (quick < 0.5) way.set(1, 0, 0);
    sc.points[0].copy(neck);
    for (let k = 1; k < sc.points.length; k++) {
      // It flutters a little, more toward its end and the quicker the rider goes; slow, it hangs down.
      const flap = Math.sin(t * (12 + quick * 0.4) - k * 1.3) * Math.min(0.05, 0.01 + quick * 0.0015) * (k / 3),
        goal = sc.points[k - 1].clone().addScaledVector(way, -0.18).add(new T.Vector3(-way.y * flap, way.x * flap - (quick < 6 ? 0.1 : 0.02), 0.02));
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
      strong = Math.max(0, Math.min(1, (speed - 18) / 26)),
      heading = Math.atan2(r.vy, Math.max(0.1, r.vx));
    this.lineStuff.opacity = 0.12 * strong;
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
    // A crash: the rider falls back onto the snow, slides lying there, then pushes itself up onto the board again.
    const down = tumbling ? this.fallen(1 - (r.crashed - w.time) / CRASH_TIME) : { tilt: 0, crouch: r.crouch, flung: false };
    this.pose(down.crouch, down.flung, t);
    // On the snow, ← and → lean the rider back or forward (in the air they turn it).
    this.lean += ((r.ground && !tumbling ? -w.turn * 0.22 : 0) - this.lean) * Math.min(1, dt * 10);
    this.body.rotation.z = this.lean + down.tilt;
    this.body.position.y = down.tilt * 0.06;
    if (tumbling && dt > 0 && r.ground && speedOf(r) > 2 && Math.random() < 0.6) this.puff(r.x - 0.6, r.y + 0.1, -1 - Math.random() * 2, 0.4 + Math.random());
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
