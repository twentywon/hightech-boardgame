import * as T from "three";
import { cryptoRandom } from "../../core/random";
import { aim, block, stuff, wood } from "../../engine/scene-utils";
import { Grove, sequence } from "../../engine/foliage";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { DECK, HAND, ROD_LENGTH, anglerCamera } from "./layout";
import { CAST as CAST_MOVE, HOOK, LATE, ROUND, SCARED, SLIP, SNAP, TICK, catchMove, type State } from "./rules";
import { CrankReader } from "./crank";
import {
  BOOT,
  CAN,
  CARP,
  CAST,
  CATFISH,
  DT,
  FULL_SPIN,
  STARFISH,
  TUNA,
  crank,
  GOLDEN,
  KINDS,
  LAND_TIME,
  REEL_TO,
  SLACK,
  TROUT,
  cast,
  createWorld,
  distance,
  press,
  release,
  retire,
  step,
  surgeNow,
  type Happening,
  type World,
} from "./sim";

export const FISHING_COLORS: [string, string] = ["#2f7f8f", "#b9b3a4"];
/** How far a press of Space (or Enter) turns the crank while a fish is on: four presses a second wind at the full pace. */
const KEY_TURN = 0.5;
/** The haze over the far water, the colour the sky has at the horizon. */
const HAZE = "#dfe3dc";
/** The low sun over the far shore, a little to the left: the sky glows there and its light glitters on the water. */
const SUN = new T.Vector3(-0.34, 0.12, -0.93).normalize();
/** Where the sun has gone down to by dusk (just under the far hills), and where the moon stands at night. */
const SUNSET = new T.Vector3(-0.42, -0.06, -0.9).normalize();
const MOON = new T.Vector3(0.3, 0.15, -0.94).normalize();
/**
 * The lake's time of day over a round (the user asked: from day through dusk to night, the sky going slowly): three
 * moments, day at the start, dusk past the middle, night at the end, blended between. The sea keeps the day.
 */
const TIMES = [
  { at: 0, sky: "#ffffff", haze: "#dfe3dc", hemiSky: "#e4eefa", hemiGround: "#5d6b45", hemi: 1.55, sun: "#ffe9c8", sunPower: 2.3, horizon: "#c6d6de", zenith: "#5b8fc6", glitter: "#fff0cc", body: 1, shore: "#3f5a40", far: "#ffffff", lamp: 0, tip: 0 },
  { at: 0.55, sky: "#ffb48e", haze: "#e9ad8e", hemiSky: "#ffc8a4", hemiGround: "#5a4636", hemi: 1.15, sun: "#ff9050", sunPower: 1.6, horizon: "#f0a47e", zenith: "#76699c", glitter: "#ffa860", body: 0.72, shore: "#3a2e34", far: "#d09a90", lamp: 0.6, tip: 0.8 },
  { at: 1, sky: "#1d2749", haze: "#121a30", hemiSky: "#41538a", hemiGround: "#0e1218", hemi: 0.55, sun: "#9fb4ff", sunPower: 0.5, horizon: "#1c2949", zenith: "#070d20", glitter: "#c8d6ff", body: 0.3, shore: "#05070b", far: "#1d2438", lamp: 2.4, tip: 3 },
];
/** The water's own colours, by day: the lake's green-brown, the sea's blue. */
const WATERS = {
  lake: { deep: "#1c4a5e", shallow: "#29473c" },
  sea: { deep: "#0d3a62", shallow: "#145466" },
};
/** The lake's outline: an oval round (0, −48), 30 across to each side and 58 along (the near shore behind the pier), its edge wavering. */
const LAKE = { x: 0, z: -48, rx: 30, rz: 58 };
function shore(angle: number, grow = 1) {
  const wobble = 1 + 0.045 * Math.sin(angle * 5 + 0.7) + 0.03 * Math.sin(angle * 11 + 2.1);
  return { x: LAKE.x + Math.cos(angle) * LAKE.rx * wobble * grow, z: LAKE.z + Math.sin(angle) * LAKE.rz * wobble * grow };
}
type Keep = <R extends { dispose(): void }>(r: R) => R;
/** A painted canvas as a texture. */
function painted(w: number, h: number, paint: (pen: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!, w, h);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** How a fish of each kind is painted: its back, flank and belly, its fins, and its build (length, depth, width). */
const LOOKS: { back: string; side: string; belly: string; fin: string; deep: number; wide: number; spots?: string; stripe?: string; shine?: boolean }[] = [
  { back: "#3f3c1c", side: "#8a7c3a", belly: "#dcd2a2", fin: "#5e5226", deep: 0.42, wide: 0.17 },
  { back: "#4c3618", side: "#a8783a", belly: "#e8cf92", fin: "#b0603a", deep: 0.33, wide: 0.16 },
  { back: "#3d4c3c", side: "#aeb9ab", belly: "#f0f2ea", fin: "#8b8a72", deep: 0.26, wide: 0.13, spots: "#2a2a22", stripe: "#e0889a" },
  { back: "#24221e", side: "#4f4a42", belly: "#c2baa8", fin: "#35322c", deep: 0.2, wide: 0.2 },
  { back: "#d8891a", side: "#ffc53a", belly: "#fff0b4", fin: "#ff9a2e", deep: 0.34, wide: 0.16, shine: true },
  // The can and the boot are not fish (built apart).
  { back: "#000000", side: "#000000", belly: "#000000", fin: "#000000", deep: 0.3, wide: 0.15 },
  { back: "#000000", side: "#000000", belly: "#000000", fin: "#000000", deep: 0.3, wide: 0.15 },
  // The sea's: horse mackerel, mackerel, rockfish, black porgy, flatfish, red sea bream, yellowtail, tuna.
  { back: "#3c5a66", side: "#a9bcc0", belly: "#eef3f2", fin: "#c8b860", deep: 0.26, wide: 0.12, stripe: "#d8c860" },
  { back: "#1f4f5a", side: "#7fa0a8", belly: "#f2f4f0", fin: "#6a7c80", deep: 0.24, wide: 0.13, spots: "#14323a" },
  { back: "#2a2620", side: "#5a5248", belly: "#b8ae9c", fin: "#3a342c", deep: 0.36, wide: 0.18, spots: "#1a1612" },
  { back: "#2c3036", side: "#6e767e", belly: "#c8ccd0", fin: "#3a3e44", deep: 0.44, wide: 0.15 },
  { back: "#5a4a32", side: "#7a6a4a", belly: "#f4efe4", fin: "#6a5a3c", deep: 0.5, wide: 0.08, spots: "#3a2e1e" },
  { back: "#d84a5a", side: "#f08a8a", belly: "#fbe0dc", fin: "#e46a70", deep: 0.42, wide: 0.15, spots: "#6ac0e8" },
  { back: "#2a4a6a", side: "#a8b8c4", belly: "#f0f2f0", fin: "#c8b040", deep: 0.27, wide: 0.15, stripe: "#e8d050" },
  { back: "#14243e", side: "#6a7a90", belly: "#e8ecf0", fin: "#e8c040", deep: 0.3, wide: 0.22 },
];
/**
 * Fishing from a wooden pier on a calm lake (asked for by the user: "찌가 움직일 때 당겨 물고기를 잡습니다"): the
 * angler's eye looks out over the water to the far shore, wooded hills and the low sun; the rod is held in the
 * foreground and the float rides out on the water. The view plays the lake in real time (see `sim.ts`) and reports
 * what happens as moves. Everything is made in code: the sky, the water's shader, the hills, trees, reeds and lily
 * pads, the pier, the rod, the float and the fish.
 */
export class FishingView extends TableView<State> {
  private world: World;
  private waterPaint!: T.ShaderMaterial;
  /** Rings spreading on the water: the shader's (x, z, age, strength) and the faint white rings laid over it. */
  private ripples: { x: number; z: number; at: number; strength: number }[] = [];
  private rings: T.Mesh[] = [];
  private sway = { value: 0 };
  private skyMap!: T.Texture;
  /** The lake's shores (hills, land, trees, reeds) and the sea's (islands, a lighthouse, a buoy): one shown at a time. */
  private lakeSet = new T.Group();
  private seaSet = new T.Group();
  private atSea = false;
  private buoy = new T.Group();
  /** What the time of day changes: the lights, the sky dome, the sun and the moon, the stars, the far shapes, the float's glow, the angler's lamp. */
  private hemi!: T.HemisphereLight;
  private sunLight!: T.DirectionalLight;
  private domePaint!: T.MeshBasicMaterial;
  private sunGlows: T.Sprite[] = [];
  private moon!: T.Sprite;
  private stars!: T.Points;
  private tinted: { material: T.MeshBasicMaterial; base: T.Color }[] = [];
  private floatTip!: T.MeshStandardMaterial;
  private lamp!: T.PointLight;
  /** The time of day last shown (0 day, 1 night), and at which water. */
  private dayShown = "";
  private rod = new T.Group();
  private segments: T.Group[] = [];
  private tip = new T.Object3D();
  private crank = new T.Group();
  /** The reel's rotor and bail, which whirl round the rod's line as the handle turns (several times a turn of it). */
  private rotor = new T.Group();
  private float = new T.Group();
  private line: T.Line;
  private linePoints = new Float32Array(3 * 40);
  private fishes = new Map<number, T.Group>();
  private drops: T.InstancedMesh;
  private flying: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[] = [];
  private words: { sprite: T.Sprite; at: number; x: number; y: number; z: number; long: number }[] = [];
  private label: T.Sprite | null = null;
  private hud: HTMLElement;
  private said = new Map<string, string>();
  private paused = false;
  private shown = 0;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  /** When the scene was last posed, for the drops' flight. */
  private lastPose = performance.now();
  /** When things last happened, for their motion: the cast's swing, a nibble, the bite, the strike, a surge, the reel's last click. */
  private at = { cast: -1e9, twitch: -1e9, bite: -1e9, hook: -1e9, surge: -1e9, click: -1e9, bob: -1e9, thrash: -1e9 };
  /** Where the float left the rod tip on its way out. */
  private launch = new T.Vector3();
  private launched = false;
  /** The pointer whose press is held (one at a time). */
  private pointer: number | null = null;
  private keyHeld = false;
  /** The circles the pressed finger draws, read as turns of the crank (while a fish is on the line). */
  private circles = new CrankReader();
  /** When the crank was last turned on the screen, and the reel's last frame (for its turning). */
  private crankAt = performance.now();
  private sight = new T.Raycaster();
  /** What the lake does between moves, for its sounds (the cast, a nibble, the bite, a surge, the reel's clicks). */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, HAZE);
    this.world = createWorld(1, cryptoRandom);
    this.camera.near = 0.1;
    this.camera.far = 700;
    this.scene.fog = new T.Fog(HAZE, 20, 390);
    const keep: Keep = (r) => this.own(r);
    this.light();
    this.sky(keep);
    this.water(keep);
    // The lake's shores, gathered into one group so that the sea can take their place.
    const before = this.scene.children.length;
    this.hills(keep);
    this.land(keep);
    this.greenery(keep);
    this.lakeSet.add(...this.scene.children.slice(before));
    this.scene.add(this.lakeSet);
    this.seaside(keep);
    this.seaSet.visible = false;
    this.scene.add(this.seaSet);
    this.pier(keep);
    this.rodModel(keep);
    this.floatModel(keep);
    const lineGeometry = keep(new T.BufferGeometry());
    lineGeometry.setAttribute("position", new T.BufferAttribute(this.linePoints, 3));
    this.line = new T.Line(lineGeometry, keep(new T.LineBasicMaterial({ color: "#f4f7f2", transparent: true, opacity: 0.8 })));
    this.line.frustumCulled = false;
    this.scene.add(this.line);
    this.drops = new T.InstancedMesh(keep(new T.SphereGeometry(0.035, 6, 4)), keep(new T.MeshBasicMaterial({ color: "#eaf6ff", transparent: true, opacity: 0.85 })), 70);
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    this.scene.add(this.drops);
    // The words over the table: the score and the clock, the tension of the line, and what to do now.
    host.style.position = "relative";
    this.hud = document.createElement("div");
    this.hud.className = "fish-hud";
    this.hud.setAttribute("aria-hidden", "true");
    this.hud.innerHTML =
      `<div class="fish-board"><span><small>점수</small><b data-k="score">0</b></span><span><small>남은 시간</small><b data-k="left">${ROUND}초</b></span><span><small>잡은 물고기</small><b data-k="count">0</b></span></div>` +
      `<div class="fish-gauge" hidden><small>장력</small><div class="fish-meter"><i data-k="tension"></i></div><em data-k="far"></em><div class="fish-slack"><i data-k="slack"></i></div><small>느슨함</small><div class="fish-spin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 1-7.4 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M2.2 6.2l2.6 3.4 3.6-2.4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="fish-spin-bar"><i data-k="spin"></i></div></div><small>릴</small></div>` +
      `<p class="fish-prompt" data-k="prompt"></p>`;
    host.append(this.hud);
    this.listen();
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The lake is lit by its own sky and sun, not by the reflected room of the tables. */
  protected photographic() {
    return false;
  }
  private light() {
    this.hemi = new T.HemisphereLight("#e4eefa", "#5d6b45", 1.55);
    this.scene.add(this.hemi);
    // The angler's head lamp, lit as night falls, so that the rod and the deck stay in sight.
    this.lamp = new T.PointLight("#ffe2b0", 0, 9, 1.4);
    this.lamp.position.set(0.2, 2.6, 3.1);
    this.scene.add(this.lamp);
    // The light comes from the sun's side and from above, so that the rod and the pier are lit on their left.
    const sun = new T.DirectionalLight("#ffe9c8", 2.3);
    this.sunLight = sun;
    sun.position.set(-14, 18, -4);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -5;
    sun.shadow.camera.right = 5;
    sun.shadow.camera.top = 7;
    sun.shadow.camera.bottom = -7;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 50;
    sun.shadow.normalBias = 0.03;
    this.own(sun.shadow);
    this.scene.add(sun, sun.target);
  }
  /**
   * The sky: a dome painted from the deep blue overhead to a warm haze at the horizon, with soft clouds that drift,
   * and the low sun glowing over the far shore.
   */
  private sky(keep: Keep) {
    const THETA = Math.PI * 0.56,
      random = sequence(7);
    const map = keep(
      painted(1024, 512, (pen, w, h) => {
        // Row r of the picture is the angle r / h × THETA down from straight overhead; the horizon is at 0.893 h.
        const horizon = h * (Math.PI / 2 / THETA),
          sky = pen.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, "#3c70b6");
        sky.addColorStop(0.55, "#6b9ed2");
        sky.addColorStop(0.82, "#9fc2e0");
        sky.addColorStop(0.95, "#d3dfe0");
        sky.addColorStop(1, HAZE);
        pen.fillStyle = sky;
        pen.fillRect(0, 0, w, h);
        pen.fillStyle = HAZE;
        pen.fillRect(0, horizon, w, h - horizon);
        // Soft heaps of cloud, thicker and flatter toward the horizon; drawn again past the edges so that the dome joins.
        for (let k = 0; k < 34; k++) {
          const x = random() * w,
            low = random(),
            y = horizon * (0.42 + low * 0.5),
            size = (30 + random() * 70) * (1.2 - low * 0.5),
            puffs = 4 + Math.floor(random() * 5);
          for (let p = 0; p < puffs; p++) {
            const px = x + (p - puffs / 2) * size * 0.45 + (random() - 0.5) * size * 0.3,
              py = y - Math.sin((p / puffs) * Math.PI) * size * 0.25 * (1 - low * 0.6),
              r = size * (0.35 + random() * 0.35);
            for (const dx of [-w, 0, w]) {
              const puff = pen.createRadialGradient(px + dx, py, 0, px + dx, py, r);
              puff.addColorStop(0, `rgba(255,255,255,${0.5 - low * 0.18})`);
              puff.addColorStop(0.6, `rgba(250,248,244,${0.22 - low * 0.08})`);
              puff.addColorStop(1, "rgba(255,255,255,0)");
              pen.fillStyle = puff;
              pen.beginPath();
              pen.ellipse(px + dx, py, r, r * (0.55 - low * 0.2), 0, 0, Math.PI * 2);
              pen.fill();
            }
          }
        }
      }),
    );
    map.wrapS = T.RepeatWrapping;
    this.skyMap = map;
    this.domePaint = keep(new T.MeshBasicMaterial({ map, side: T.BackSide, fog: false, depthWrite: false }));
    const dome = new T.Mesh(keep(new T.SphereGeometry(320, 48, 20, 0, Math.PI * 2, 0, THETA)), this.domePaint);
    dome.renderOrder = -2;
    this.scene.add(dome);
    // The sun: a warm glow and a bright core, drawn over the dome.
    const glow = (inner: string, size: number) => {
      const texture = keep(
        painted(256, 256, (pen) => {
          const g = pen.createRadialGradient(128, 128, 0, 128, 128, 128);
          g.addColorStop(0, inner);
          g.addColorStop(0.25, inner.replace(/[\d.]+\)$/, "0.35)"));
          g.addColorStop(1, "rgba(255,230,180,0)");
          pen.fillStyle = g;
          pen.fillRect(0, 0, 256, 256);
        }),
      );
      const sprite = new T.Sprite(keep(new T.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, blending: T.AdditiveBlending })));
      sprite.position.copy(SUN).multiplyScalar(300);
      sprite.scale.setScalar(size);
      sprite.renderOrder = -1;
      this.scene.add(sprite);
      return sprite;
    };
    this.sunGlows = [glow("rgba(255,232,196,0.32)", 95), glow("rgba(255,252,236,1)", 22)];
    // The moon, and the stars: out only as night falls on the lake.
    const moonMap = keep(
      painted(256, 256, (pen) => {
        const g = pen.createRadialGradient(128, 128, 0, 128, 128, 128);
        g.addColorStop(0, "rgba(255,255,248,1)");
        g.addColorStop(0.16, "rgba(246,244,232,1)");
        g.addColorStop(0.2, "rgba(200,214,255,0.35)");
        g.addColorStop(1, "rgba(160,180,255,0)");
        pen.fillStyle = g;
        pen.fillRect(0, 0, 256, 256);
      }),
    );
    this.moon = new T.Sprite(keep(new T.SpriteMaterial({ map: moonMap, transparent: true, depthWrite: false, fog: false, opacity: 0 })));
    this.moon.position.copy(MOON).multiplyScalar(300);
    this.moon.scale.setScalar(70);
    this.moon.renderOrder = -1;
    this.moon.visible = false;
    this.scene.add(this.moon);
    const twinkle = sequence(31),
      spots = new Float32Array(700 * 3);
    for (let k = 0; k < 700; k++) {
      const a = twinkle() * Math.PI * 2,
        up = 0.06 + Math.pow(twinkle(), 0.7) * 0.94,
        flat = Math.sqrt(1 - up * up);
      spots.set([Math.cos(a) * flat * 300, up * 300, Math.sin(a) * flat * 300], k * 3);
    }
    const starGeometry = keep(new T.BufferGeometry());
    starGeometry.setAttribute("position", new T.BufferAttribute(spots, 3));
    this.stars = new T.Points(starGeometry, keep(new T.PointsMaterial({ color: "#f4f6ff", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })));
    this.stars.renderOrder = -1;
    this.stars.visible = false;
    this.scene.add(this.stars);
  }
  /** Hills beyond the far shore, in layers that fade into the haze, lowest where the sun goes down. */
  private hills(keep: Keep) {
    const layers: [number, number, number, string, number][] = [
      [-340, 20, 44, "#90a6aa", 3],
      [-260, 12, 30, "#6f8f7c", 11],
      [-190, 6, 15, "#58784c", 19],
    ];
    for (const [z, low, high, color, seed] of layers) {
      const random = sequence(seed),
        phase = [random() * 6, random() * 6, random() * 6],
        shape = new T.Shape();
      shape.moveTo(-600, -2);
      for (let x = -600; x <= 600; x += 6) {
        const n = 0.5 + 0.28 * Math.sin(x / 61 + phase[0]) + 0.16 * Math.sin(x / 23 + phase[1]) + 0.06 * Math.sin(x / 9 + phase[2]),
          // A saddle under the sun.
          dip = 1 - 0.55 * Math.exp(-(((x - (SUN.x / -SUN.z) * -z) / 70) ** 2));
        shape.lineTo(x, low + (high - low) * n * dip);
      }
      shape.lineTo(600, -2);
      shape.closePath();
      const paint = keep(new T.MeshBasicMaterial({ color }));
      this.tinted.push({ material: paint, base: new T.Color(color) });
      const hill = new T.Mesh(keep(new T.ShapeGeometry(shape, 1)), paint);
      hill.position.z = z;
      this.scene.add(hill);
    }
  }
  /** The ground round the lake: grass, and a muddy margin at the water's edge. */
  private land(keep: Keep) {
    const outline = (grow: number) => Array.from({ length: 120 }, (_, i) => shore((i / 120) * Math.PI * 2, grow)),
      path = (points: { x: number; z: number }[], into: T.Path) => {
        points.forEach((p, i) => (i ? into.lineTo(p.x, -p.z) : into.moveTo(p.x, -p.z)));
        into.closePath();
        return into;
      };
    // The ground's own coordinates are kept for its picture, a tile every eight units.
    const ground = new T.Shape([new T.Vector2(-600, -60), new T.Vector2(600, -60), new T.Vector2(600, 420), new T.Vector2(-600, 420)]);
    ground.holes.push(path(outline(1.05), new T.Path()));
    const grass = this.add(new T.ShapeGeometry(ground, 4).rotateX(-Math.PI / 2), this.standard({ ...stuff("grass", "#5c8a3a", 0.125, keep), roughness: 1 }), 0, 0.16, 0);
    grass.castShadow = false;
    const margin = new T.Shape(outline(1.07).map((p) => new T.Vector2(p.x, -p.z)));
    margin.holes.push(path(outline(0.995), new T.Path()));
    const mud = this.add(new T.ShapeGeometry(margin, 4).rotateX(-Math.PI / 2), this.standard({ ...stuff("earth", "#7a6a4c", 0.2, keep), roughness: 1 }), 0, 0.07, 0);
    mud.castShadow = false;
  }
  /**
   * The water: one plane with a shader of its own. Swells and fine waves running several ways shape its surface (the
   * finest fade with distance, so the far water does not shimmer), rings spread where something touches it, it
   * shows its own dark green under the eye and the sky and the dark line of the far shore mirrored toward the
   * horizon, and the low sun glitters on it.
   */
  private water(keep: Keep) {
    const ripples = Array.from({ length: 8 }, () => new T.Vector4(0, 0, 0, 0));
    this.waterPaint = keep(
      new T.ShaderMaterial({
        fog: true,
        uniforms: T.UniformsUtils.merge([
          T.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uDeep: { value: new T.Color("#1c4a5e") },
            uShallow: { value: new T.Color("#29473c") },
            uHorizon: { value: new T.Color("#c6d6de") },
            uZenith: { value: new T.Color("#5b8fc6") },
            uShore: { value: new T.Color("#3f5a40") },
            uSun: { value: SUN.clone() },
            uSunColor: { value: new T.Color("#fff0cc") },
            uRipples: { value: ripples },
            uLand: { value: 1 },
            uSwell: { value: 1 },
          },
        ]),
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          #include <fog_pars_vertex>
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            vec4 mvPosition = viewMatrix * world;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uDeep, uShallow, uHorizon, uZenith, uShore, uSun, uSunColor;
          uniform vec4 uRipples[8];
          uniform float uLand, uSwell;
          varying vec3 vWorld;
          #include <fog_pars_fragment>
          vec2 wave(vec2 p, vec2 d, float k, float s, float a) {
            return d * (k * a * cos(dot(p, d) * k + uTime * s));
          }
          void main() {
            vec2 p = vWorld.xz;
            float dist = length(vWorld - cameraPosition);
            float near = clamp(1.0 - dist / 70.0, 0.0, 1.0);
            vec2 g = wave(p, vec2(0.94, 0.33), 0.7, 0.7, 0.02);
            g += wave(p, vec2(-0.51, 0.86), 1.3, 1.1, 0.012);
            g += wave(p, vec2(0.37, 0.93), 2.3, 1.5, 0.007);
            g += wave(p, vec2(0.2, -0.98), 3.4, 1.9, 0.0055 * near + 0.0012);
            g += wave(p, vec2(-0.8, 0.6), 4.7, 2.3, 0.0042 * near);
            g += wave(p, vec2(-0.96, -0.28), 6.6, 2.8, 0.003 * near);
            g += wave(p, vec2(0.64, -0.77), 10.3, 3.6, 0.0022 * near * near);
            // The sea runs higher than the lake: a long swell under the same waves, all of them taller.
            g += wave(p, vec2(0.12, 0.99), 0.32, 0.55, 0.05 * (uSwell - 1.0));
            g *= uSwell;
            for (int i = 0; i < 8; i++) {
              vec4 r = uRipples[i];
              if (r.w <= 0.0) continue;
              vec2 d = p - r.xy;
              float l = length(d) + 0.0001;
              float band = l - (0.15 + r.z * 0.85);
              float env = exp(-band * band * 14.0) * r.w * exp(-r.z * 1.2);
              g += (d / l) * sin(band * 15.0) * env * 0.5;
            }
            vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
            vec3 v = normalize(cameraPosition - vWorld);
            float facing = max(dot(n, v), 0.0);
            float fres = 0.025 + 0.975 * pow(1.0 - facing, 5.0);
            vec3 r = reflect(-v, n);
            float up = max(r.y, 0.0);
            vec3 sky = mix(uHorizon, uZenith, pow(up, 0.55));
            // The far shore mirrored: dark wherever the reflected look stays under the line of the trees and hills.
            float az = atan(r.x, -r.z);
            float ridge = 0.055 + 0.014 * sin(az * 4.0 + 1.3) + 0.008 * sin(az * 11.0 + 0.4);
            float under = smoothstep(ridge + 0.012, ridge - 0.008, up);
            sky = mix(sky, uShore, under * 0.85 * uLand);
            vec3 body = mix(uShallow, uDeep, clamp(dist / 24.0, 0.0, 1.0));
            vec3 col = mix(body, sky, fres);
            float s = max(dot(r, uSun), 0.0);
            col += uSunColor * (pow(s, 900.0) * 4.0 + pow(s, 80.0) * 0.12 * fres);
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
          }`,
      }),
    );
    const water = new T.Mesh(keep(new T.PlaneGeometry(800, 800).rotateX(-Math.PI / 2)), this.waterPaint);
    water.position.set(0, 0, -200);
    water.receiveShadow = false;
    this.scene.add(water);
    // Faint white rings laid over the shader's, so that a touch on the water is seen from afar.
    const ring = keep(new T.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2));
    for (let i = 0; i < 6; i++) {
      const mesh = new T.Mesh(ring, keep(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false })));
      mesh.position.y = 0.012;
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.rings.push(mesh);
      this.scene.add(mesh);
    }
  }
  /**
   * The sea's shores, in place of the lake's: low islands far out fading into the haze, a lighthouse on a rocky islet
   * to the left, and a red buoy riding the swell.
   */
  private seaside(keep: Keep) {
    const set = this.seaSet;
    const islands: [number, number, number, number, string, number][] = [
      [-170, -320, 160, 15, "#8ea3b2", 3],
      [80, -360, 220, 10, "#9fb2be", 5],
      [235, -280, 100, 19, "#8199a9", 7],
      [-70, -235, 56, 6, "#728d9b", 9],
    ];
    for (const [x, z, width, height, color, seed] of islands) {
      const random = sequence(seed),
        phase = [random() * 6, random() * 6],
        shape = new T.Shape();
      shape.moveTo(x - width / 2, -2);
      for (let k = 0; k <= 40; k++) {
        const u = k / 40,
          bump = Math.sin(u * Math.PI) ** 0.6 * (0.75 + 0.18 * Math.sin(u * 9 + phase[0]) + 0.07 * Math.sin(u * 23 + phase[1]));
        shape.lineTo(x - width / 2 + width * u, height * bump);
      }
      shape.lineTo(x + width / 2, -2);
      shape.closePath();
      const paint = keep(new T.MeshBasicMaterial({ color }));
      this.tinted.push({ material: paint, base: new T.Color(color) });
      const island = new T.Mesh(keep(new T.ShapeGeometry(shape, 1)), paint);
      island.position.z = z;
      set.add(island);
    }
    // The lighthouse: white with red bands on a heap of dark rocks, a glass lamp room and a red cap.
    const rock = this.standard({ color: "#5b5d5a", roughness: 0.95 }),
      white = this.standard({ color: "#f2f0ea", roughness: 0.6 }),
      red = this.standard({ color: "#c8352e", roughness: 0.55 }),
      glass = this.standard({ color: "#fff2c0", emissive: "#ffd870", emissiveIntensity: 0.6, roughness: 0.2 }),
      stone = keep(new T.DodecahedronGeometry(1, 0)),
      house = new T.Group(),
      random = sequence(41);
    for (let k = 0; k < 9; k++) {
      const piece = new T.Mesh(stone, rock),
        a = (k / 9) * Math.PI * 2;
      piece.position.set(Math.cos(a) * (2 + random() * 2.5), -0.4 + random() * 1.2, Math.sin(a) * (1.6 + random() * 2));
      piece.scale.set(1.6 + random() * 1.8, 1 + random() * 1.4, 1.4 + random() * 1.6);
      piece.rotation.set(random() * 3, random() * 3, 0);
      house.add(piece);
    }
    const part = (geometry: T.BufferGeometry, material: T.Material, y: number) => {
      const mesh = new T.Mesh(keep(geometry), material);
      mesh.position.y = y;
      mesh.castShadow = true;
      house.add(mesh);
    };
    part(new T.CylinderGeometry(0.95, 1.35, 9, 22), white, 5.2);
    part(new T.CylinderGeometry(1.24, 1.29, 1.1, 22), red, 2.6);
    part(new T.CylinderGeometry(1.08, 1.14, 1.1, 22), red, 6.2);
    part(new T.CylinderGeometry(1.3, 1.3, 0.22, 22), red, 9.8);
    part(new T.CylinderGeometry(0.72, 0.72, 1.2, 16), glass, 10.5);
    part(new T.ConeGeometry(0.95, 1.1, 16), red, 11.65);
    house.position.set(-30, 0, -64);
    set.add(house);
    // The buoy: a red cone over a float, bobbing on the swell (see `pose`).
    const buoyRed = this.standard({ color: "#d8402e", roughness: 0.5 }),
      buoyDark = this.standard({ color: "#2a2a2c", roughness: 0.6 });
    const base = new T.Mesh(keep(new T.CylinderGeometry(0.55, 0.7, 0.6, 18)), buoyRed);
    base.position.y = 0.1;
    const top = new T.Mesh(keep(new T.ConeGeometry(0.4, 1.2, 14)), buoyRed);
    top.position.y = 1;
    const band = new T.Mesh(keep(new T.CylinderGeometry(0.58, 0.58, 0.14, 18)), buoyDark);
    band.position.y = 0.32;
    this.buoy.add(base, top, band);
    this.buoy.position.set(12, 0, -36);
    set.add(this.buoy);
  }
  /** The lake or the sea: its shores, its water's colours and swell; the sea keeps the day. */
  private setSea(sea: boolean) {
    this.atSea = sea;
    this.lakeSet.visible = !sea;
    this.seaSet.visible = sea;
    const u = this.waterPaint.uniforms;
    u.uLand.value = sea ? 0 : 1;
    u.uSwell.value = sea ? 1.9 : 1;
    this.dayShown = "";
  }
  /** How far the lake's day has gone (0 day, 1 night): the round's time; the sea's stays at day. */
  private timeOfDay() {
    return this.atSea ? 0 : Math.max(0, Math.min(1, this.world.time / ROUND));
  }
  /** Lights, sky, sun and moon, stars, water and the far shapes for the time of day `p` (see `TIMES`). */
  private timeLight(p: number) {
    const key = `${this.atSea}|${p.toFixed(3)}`;
    if (key === this.dayShown) return;
    this.dayShown = key;
    const k = p <= TIMES[1].at ? 0 : 1,
      a = TIMES[k],
      b = TIMES[k + 1],
      raw = (p - a.at) / (b.at - a.at),
      q = raw * raw * (3 - 2 * raw),
      color = (from: string, to: string) => new T.Color(from).lerp(new T.Color(to), q),
      num = (from: number, to: number) => from + (to - from) * q;
    const haze = color(a.haze, b.haze);
    this.renderer.setClearColor(haze);
    (this.scene.fog as T.Fog).color.copy(haze);
    this.domePaint.color.copy(color(a.sky, b.sky));
    this.hemi.color.copy(color(a.hemiSky, b.hemiSky));
    this.hemi.groundColor.copy(color(a.hemiGround, b.hemiGround));
    this.hemi.intensity = num(a.hemi, b.hemi);
    this.sunLight.color.copy(color(a.sun, b.sun));
    this.sunLight.intensity = num(a.sunPower, b.sunPower);
    this.lamp.intensity = num(a.lamp, b.lamp);
    this.floatTip.emissiveIntensity = 0.7 + num(a.tip, b.tip);
    const far = color(a.far, b.far);
    for (const { material, base } of this.tinted) material.color.copy(base).multiply(far);
    // The sun goes down to the far hills by dusk and is gone by night; the moon and the stars come out.
    const sinking = Math.min(1, p / 0.62),
      sun = SUN.clone().lerp(SUNSET, sinking).normalize(),
      sunShown = 1 - Math.max(0, Math.min(1, (p - 0.55) / 0.2)),
      night = Math.max(0, Math.min(1, (p - 0.62) / 0.3));
    this.sunGlows.forEach((glow, i) => {
      glow.position.copy(sun).multiplyScalar(300);
      glow.material.opacity = sunShown;
      glow.material.color.copy(new T.Color("#ffffff").lerp(new T.Color(i ? "#ffb070" : "#ff8a50"), sinking));
      glow.visible = sunShown > 0.01;
    });
    this.moon.material.opacity = night;
    this.moon.visible = night > 0.01;
    (this.stars.material as T.PointsMaterial).opacity = night * 0.9;
    this.stars.visible = night > 0.01;
    // The water: its body darkens, it mirrors the sky's colours, and glitters with the sun, then the moon.
    const u = this.waterPaint.uniforms,
      water = this.atSea ? WATERS.sea : WATERS.lake,
      body = num(a.body, b.body);
    (u.uDeep.value as T.Color).set(water.deep).multiplyScalar(body);
    (u.uShallow.value as T.Color).set(water.shallow).multiplyScalar(body);
    (u.uHorizon.value as T.Color).copy(this.atSea && p === 0 ? new T.Color("#cfdfe8") : color(a.horizon, b.horizon));
    (u.uZenith.value as T.Color).copy(this.atSea && p === 0 ? new T.Color("#4c8bcc") : color(a.zenith, b.zenith));
    (u.uShore.value as T.Color).copy(color(a.shore, b.shore));
    (u.uSunColor.value as T.Color).copy(color(a.glitter, b.glitter));
    (u.uSun.value as T.Vector3).copy(night > 0.5 ? MOON : sun);
  }
  /**
   * Trees on the banks and along the far shore, reeds at the water's edge that sway in the breeze, lily pads, a few
   * stones. The near trees are crowns of leaf cards (`Grove`); the far ones, softened by the haze, are plain shapes.
   */
  private greenery(keep: Keep) {
    const random = sequence(21),
      matrix = new T.Matrix4(),
      turn = new T.Quaternion(),
      colour = new T.Color();
    type Item = { at: [number, number, number]; size: [number, number, number]; turn?: number; lean?: number; color: string };
    const instanced = (geometry: T.BufferGeometry, material: T.Material, items: Item[], shadow = false) => {
      const mesh = new T.InstancedMesh(keep(geometry), material, items.length);
      items.forEach((item, i) => {
        matrix.compose(new T.Vector3(...item.at), turn.setFromEuler(new T.Euler(item.lean ?? 0, item.turn ?? 0, 0, "YXZ")), new T.Vector3(...item.size));
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, colour.set(item.color));
      });
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.scene.add(keep(mesh));
      return mesh;
    };
    const crowns: Item[] = [],
      pines: Item[] = [],
      trunks: Item[] = [],
      stones: Item[] = [],
      reeds: Item[] = [],
      heads: Item[] = [],
      pads: Item[] = [],
      blooms: Item[] = [];
    // Angles round the lake: 0 is its right side, a quarter turn its near shore (behind the pier), minus a quarter its far shore.
    const nearSide = () => (random() < 0.5 ? 0.04 + random() * 0.42 : 0.54 + random() * 0.42) * Math.PI,
      farSide = () => -Math.PI * (0.02 + random() * 0.96);
    const tree = (x: number, z: number, scale: number, i: number) => {
      const tall = (3.5 + random() * 4.5) * scale,
        wide = (2.6 + random() * 2.4) * scale;
      if (random() < 0.38) pines.push({ at: [x, 0.2 + tall * 0.55, z], size: [wide * 0.7, tall * 1.3, wide * 0.7], turn: random() * 6, color: ["#2f4a33", "#36553a", "#2b4430"][i % 3] });
      else crowns.push({ at: [x, 0.4 + tall * 0.6, z], size: [wide, tall * 0.7, wide], turn: random() * 6, color: ["#4f7a3a", "#5c8840", "#46703a", "#6a8c44", "#3f6634"][i % 5] });
    };
    // The far shore: a dense line of round crowns and pines along the water, and woods behind it toward the hills.
    for (let i = 0; i < 300; i++) {
      const p = shore(farSide(), 1.04 + random() * 0.3);
      if (p.z < -20) tree(p.x, p.z, 1, i);
    }
    for (let i = 0; i < 220; i++) {
      const x = (random() - 0.5) * 360,
        z = -110 - random() * 70;
      if (z < shore(-Math.PI / 2).z - 4) tree(x, z, 1.3, i);
    }
    // The near banks: crowns of leaf cards, close enough to be seen leaf by leaf, framing the lake on both sides.
    const grove = new Grove(this.scene, keep, { near: 40, centre: [0, -10], lift: 1.05 });
    for (let i = 0; i < 16; i++) {
      const angle = i % 2 ? 0.05 + (i / 16) * 0.42 : 0.95 - (i / 16) * 0.42,
        p = shore(angle * Math.PI, 1.1 + random() * 0.25),
        h = 5.5 + random() * 3,
        r = 3 + random() * 1.6,
        kind = (["broad", "oak", "birch", "oak"] as const)[i % 4];
      if (p.z < -45) continue;
      grove.crown(kind, [p.x, h, p.z], [r, r * 0.85, r], ["#5b8c42", "#4f7f3c", "#679a48", "#56873e"][i % 4], i);
      trunks.push({ at: [p.x, h / 2, p.z], size: [0.34, h, 0.34], color: kind === "birch" ? "#d9d4c8" : "#5a4632" });
    }
    // Bushes along the near banks.
    for (let i = 0; i < 40; i++) {
      const p = shore(nearSide(), 1.04 + random() * 0.12);
      if (p.z < -50) continue;
      grove.crown("box", [p.x, 0.8, p.z], [1.3 + random(), 0.9, 1.3 + random()], ["#4f8a3c", "#5d9644", "#467c36"][i % 3], i + 40);
    }
    grove.build();
    instanced(new T.CylinderGeometry(0.4, 0.55, 1, 9), this.standard({ color: "#ffffff", roughness: 0.95 }), trunks, true);
    // Reeds stand thick at the water's edge along the near banks, in clumps; some carry brown heads.
    const reed = (x: number, z: number, tall: number, i: number) => {
      reeds.push({ at: [x, 0, z], size: [1, tall, 1], turn: random() * 6, lean: (random() - 0.5) * 0.28, color: ["#6c8f44", "#7d9c4a", "#5f8040", "#8fa65a"][i % 4] });
      if (i % 5 === 0) heads.push({ at: [x, tall * 0.92, z], size: [1, 1, 1], color: "#6b4426" });
    };
    for (let c = 0; c < 34; c++) {
      const angle = nearSide(),
        centre = shore(angle, 0.97 + random() * 0.05);
      if (centre.z < -60) continue;
      for (let i = 0; i < 16; i++) reed(centre.x + (random() - 0.5) * 2.6, centre.z + (random() - 0.5) * 2.6, 1.1 + random() * 1.3, c * 16 + i);
    }
    // A clump beside the pier's end, to the left, and a few to its right.
    for (let i = 0; i < 46; i++) reed(-2.1 - random() * 1.8, -0.8 + random() * 3, 1 + random() * 1.1, i);
    for (let i = 0; i < 18; i++) reed(2.4 + random() * 1.2, 0.6 + random() * 2.4, 0.9 + random() * 0.9, i + 3);
    const swaying = (head: boolean) => {
      const paint = this.standard({ color: "#ffffff", roughness: 0.85, side: T.DoubleSide });
      paint.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = this.sway;
        shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 base = instanceMatrix[3].xyz;
          #else
            vec3 base = vec3(0.0);
          #endif
          float h = ${head ? "1.0" : "position.y"};
          transformed.x += sin(uTime * 1.5 + base.x * 0.7 + base.z * 0.45) * 0.09 * h * h;
          transformed.z += cos(uTime * 1.2 + base.x * 0.5) * 0.05 * h * h;`,
        );
      };
      return paint;
    };
    instanced(new T.ConeGeometry(0.03, 1, 4, 1).translate(0, 0.5, 0), swaying(false), reeds);
    instanced(new T.CylinderGeometry(0.045, 0.045, 0.26, 8), swaying(true), heads);
    // Lily pads in patches off the near banks, with a few flowers.
    for (let c = 0; c < 9; c++) {
      const angle = nearSide(),
        edge = shore(angle, 0.9 - random() * 0.06);
      if (edge.z < -45 || edge.z > -6) continue;
      for (let i = 0; i < 9; i++) {
        const x = edge.x + (random() - 0.5) * 4,
          z = edge.z + (random() - 0.5) * 4,
          size = 0.35 + random() * 0.35;
        pads.push({ at: [x, 0.015, z], size: [size, 1, size], turn: random() * 6, color: ["#4b8a3c", "#5a9a45", "#3f7a36"][i % 3] });
        if (i % 4 === 0) blooms.push({ at: [x + 0.1, 0.06, z], size: [0.16, 0.12, 0.16], color: i % 8 ? "#ffb3c8" : "#fff6f0" });
      }
    }
    // A patch near the pier, to the right.
    for (let i = 0; i < 7; i++) {
      const size = 0.3 + random() * 0.3;
      pads.push({ at: [3.2 + random() * 2.4, 0.015, -3 - random() * 3], size: [size, 1, size], turn: random() * 6, color: ["#4b8a3c", "#5a9a45", "#3f7a36"][i % 3] });
    }
    blooms.push({ at: [4.1, 0.06, -4.2], size: [0.16, 0.12, 0.16], color: "#ffb3c8" });
    instanced(new T.CircleGeometry(0.5, 18, 0.35, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2), this.standard({ color: "#ffffff", roughness: 0.55 }), pads);
    instanced(new T.SphereGeometry(0.5, 10, 6), this.standard({ color: "#ffffff", roughness: 0.6 }), blooms);
    // Stones on the margins.
    for (let i = 0; i < 40; i++) {
      const p = shore(random() * Math.PI * 2, 1.01 + random() * 0.05),
        size = 0.3 + random() * 0.6;
      if (p.z > 12) continue;
      stones.push({ at: [p.x, 0.08, p.z], size: [size * 1.3, size * 0.6, size], turn: random() * 6, color: ["#8f8b80", "#a4a094", "#7a776e"][i % 3] });
    }
    instanced(new T.DodecahedronGeometry(0.5, 0), this.standard({ color: "#ffffff", roughness: 1, flatShading: true }), stones);
    // The far crowns are lumpy balls painted with leaves, light and dark (each tree's green laid over them); the pines are cones of needles.
    const leafy = (seed: number, across: number) => {
      const map = keep(
        painted(256, 256, (pen, w, h) => {
          const random = sequence(seed);
          pen.fillStyle = "#b8b8b8";
          pen.fillRect(0, 0, w, h);
          for (let k = 0; k < 2600; k++) {
            const x = random() * w,
              y = random() * h,
              shade = Math.floor(120 + random() * 135),
              rx = 3 + random() * 4,
              ry = 2 + random() * 3,
              tilt = random() * 3;
            pen.fillStyle = `rgb(${shade},${shade},${shade})`;
            for (const dx of [-w, 0, w]) {
              pen.beginPath();
              pen.ellipse(x + dx, y, rx, ry, tilt, 0, Math.PI * 2);
              pen.fill();
            }
          }
        }),
      );
      map.wrapS = map.wrapT = T.RepeatWrapping;
      map.repeat.set(across, across);
      return map;
    };
    // Lumps that depend on the place alone, so that the faces stay joined; lit as a smooth ball.
    const lumpy = new T.IcosahedronGeometry(0.62, 2),
      lump = lumpy.attributes.position,
      normal = lumpy.attributes.normal,
      v = new T.Vector3();
    for (let i = 0; i < lump.count; i++) {
      v.fromBufferAttribute(lump, i);
      const k = 1 + 0.1 * Math.sin(v.x * 9 + v.y * 5) + 0.07 * Math.sin(v.z * 11 - v.y * 7) + 0.05 * Math.sin(v.x * 17 + v.z * 13);
      normal.setXYZ(i, ...v.clone().normalize().toArray());
      lump.setXYZ(i, v.x * k, v.y * k, v.z * k);
    }
    instanced(lumpy, this.own(new T.MeshLambertMaterial({ color: "#ffffff", map: leafy(31, 3) })), crowns);
    instanced(new T.ConeGeometry(0.5, 1, 9), this.own(new T.MeshLambertMaterial({ color: "#ffffff", map: leafy(37, 2) })), pines);
  }
  /**
   * The pier the angler stands on: weathered planks laid across two stringers on posts going down into the water,
   * the end posts standing above the deck with rope wound round them; a bucket and a tackle box by the left edge.
   */
  private pier(keep: Keep) {
    const timber = keep(wood(false, 0.7));
    timber.repeat.set(1.4, 0.2);
    const boards = this.standard({ map: timber, color: "#c2b19a", roughness: 0.9 }),
      dark = this.standard({ map: timber, color: "#7c6a55", roughness: 0.95 }),
      { y, end, back, half } = DECK,
      random = sequence(3),
      count = Math.round((back - end) / 0.25),
      planks = new T.InstancedMesh(keep(block(half * 2, 0.07, 0.22, 0.015)), boards, count),
      matrix = new T.Matrix4(),
      tint = new T.Color();
    for (let i = 0; i < count; i++) {
      matrix.makeTranslation((random() - 0.5) * 0.04, y - 0.035, end + 0.11 + i * 0.25);
      planks.setMatrixAt(i, matrix);
      planks.setColorAt(i, tint.setHSL(0.08, 0.12 + random() * 0.1, 0.72 + random() * 0.18));
    }
    planks.castShadow = planks.receiveShadow = true;
    this.scene.add(keep(planks));
    for (const s of [-1, 1]) this.add(block(0.14, 0.22, back - end, 0.02), dark, s * (half - 0.25), y - 0.18, (back + end) / 2);
    // Posts down into the water, the last pair standing up past the deck, with rope wound round them.
    const post = keep(new T.CylinderGeometry(0.13, 0.14, 1, 12)),
      rope = this.standard({ color: "#cdb98a", roughness: 0.95 });
    for (let z = end + 0.15; z < back; z += 2.4) {
      const tall = z === end + 0.15;
      for (const s of [-1, 1]) {
        const top = tall ? y + 0.55 : y - 0.05,
          length = top + 2;
        const mesh = new T.Mesh(post, dark);
        mesh.scale.y = length;
        mesh.position.set(s * (half + 0.05), top - length / 2, z);
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
        if (tall) for (let k = 0; k < 3; k++) this.add(new T.TorusGeometry(0.15, 0.025, 6, 16).rotateX(Math.PI / 2), rope, s * (half + 0.05), y + 0.25 + k * 0.05, z);
      }
    }
    // A bucket (water inside, for the catch) and a green tackle box.
    const tin = this.standard({ color: "#9aa6ad", roughness: 0.4, metalness: 0.6, side: T.DoubleSide });
    this.add(new T.CylinderGeometry(0.24, 0.2, 0.38, 24, 1, true), tin, -0.72, y + 0.19, 1.9);
    this.add(new T.CircleGeometry(0.22, 24).rotateX(-Math.PI / 2), this.standard({ color: "#2e4a4a", roughness: 0.15 }), -0.72, y + 0.3, 1.9).castShadow = false;
    const handle = this.add(new T.TorusGeometry(0.24, 0.008, 6, 24, Math.PI), tin, -0.72, y + 0.38, 1.9);
    handle.rotation.y = 0.5;
    this.add(block(0.56, 0.26, 0.34, 0.03), this.standard({ color: "#2f7a4e", roughness: 0.5 }), -0.62, y + 0.13, 3.1);
    this.add(block(0.58, 0.04, 0.36, 0.012), this.standard({ color: "#25633f", roughness: 0.5 }), -0.62, y + 0.27, 3.1);
    this.add(block(0.12, 0.04, 0.04, 0.01), this.standard({ color: "#d8d8d0", roughness: 0.3, metalness: 0.7 }), -0.62, y + 0.2, 2.92);
  }
  /**
   * The rod, held at its grip: a cork handle, a spinning reel hanging under it with a crank that turns while
   * the line is wound, and the blank in ten joints that bend toward the fish, with guides along it. The group's
   * origin is the hand; the rod runs along −z from it.
   */
  private rodModel(keep: Keep) {
    const cork = this.standard({ color: "#c79a62", roughness: 0.9 }),
      blank = this.standard({ color: "#1f2a36", roughness: 0.35, metalness: 0.3 }),
      metal = this.standard({ color: "#c9ccd0", roughness: 0.3, metalness: 0.85 }),
      black = this.standard({ color: "#1a1a1c", roughness: 0.5 }),
      gold = this.standard({ color: "#c9a24a", roughness: 0.35, metalness: 0.8 }),
      put = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, parent: T.Object3D) => {
        const mesh = new T.Mesh(keep(geometry), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        parent.add(mesh);
        return mesh;
      };
    put(new T.CylinderGeometry(0.034, 0.03, 0.72, 14).rotateX(Math.PI / 2), cork, 0, 0, 0, this.rod);
    put(new T.SphereGeometry(0.036, 12, 8), black, 0, 0, 0.36, this.rod);
    put(new T.CylinderGeometry(0.03, 0.03, 0.12, 12).rotateX(Math.PI / 2), gold, 0, 0, -0.2, this.rod);
    // The spinning reel under the rod, held in sight at the lower right (the user asked to see it turn): its foot on
    // the rod, the body with its gear cap, the rotor and its bail that whirl round the rod's line as the handle turns,
    // the spool wound with line, and the handle on the left, toward the eye, turned by the hand.
    const reel = new T.Group();
    reel.position.set(0, 0, -0.2);
    reel.scale.setScalar(1.3);
    this.rod.add(reel);
    put(new T.BoxGeometry(0.016, 0.09, 0.05), metal, 0, -0.05, 0, reel);
    put(new T.BoxGeometry(0.03, 0.008, 0.11), metal, 0, -0.006, 0, reel);
    put(new T.SphereGeometry(0.05, 18, 12), black, 0, -0.12, 0.01, reel).scale.set(0.85, 1, 1.15);
    put(new T.CylinderGeometry(0.03, 0.03, 0.018, 18).rotateZ(Math.PI / 2), gold, -0.045, -0.12, 0.01, reel);
    put(new T.CylinderGeometry(0.03, 0.03, 0.018, 18).rotateZ(Math.PI / 2), gold, 0.045, -0.12, 0.01, reel);
    this.rotor.position.set(0, -0.12, -0.055);
    put(new T.CylinderGeometry(0.046, 0.04, 0.05, 20).rotateX(Math.PI / 2), black, 0, 0, 0, this.rotor);
    for (const s of [-1, 1]) put(new T.BoxGeometry(0.008, 0.016, 0.05), gold, s * 0.048, 0, -0.03, this.rotor);
    const bail = put(new T.TorusGeometry(0.05, 0.003, 6, 20, Math.PI), metal, 0, 0, -0.055, this.rotor);
    bail.rotation.set(0, Math.PI / 2, Math.PI / 2);
    reel.add(this.rotor);
    put(new T.CylinderGeometry(0.04, 0.04, 0.045, 20).rotateX(Math.PI / 2), metal, 0, -0.12, -0.105, reel);
    put(new T.CylinderGeometry(0.036, 0.036, 0.036, 20).rotateX(Math.PI / 2), this.standard({ color: "#eef0e8", roughness: 0.6 }), 0, -0.12, -0.105, reel);
    put(new T.CylinderGeometry(0.046, 0.046, 0.006, 20).rotateX(Math.PI / 2), gold, 0, -0.12, -0.13, reel);
    // The handle: an arm out from the gear cap, a knob at its end (turning about the reel's crosswise axis).
    this.crank.position.set(-0.058, -0.12, 0.01);
    put(new T.CylinderGeometry(0.006, 0.006, 0.03, 8).rotateZ(Math.PI / 2), metal, -0.008, 0, 0, this.crank);
    put(new T.BoxGeometry(0.01, 0.09, 0.016), metal, -0.02, -0.042, 0, this.crank);
    put(new T.CylinderGeometry(0.014, 0.016, 0.04, 12).rotateZ(Math.PI / 2), this.standard({ color: "#d9b26a", roughness: 0.5 }), -0.044, -0.085, 0, this.crank);
    reel.add(this.crank);
    const joints = 10,
      length = (ROD_LENGTH - 0.36) / joints,
      guide = keep(new T.TorusGeometry(0.018, 0.004, 6, 12));
    let parent: T.Object3D = this.rod;
    for (let i = 0; i < joints; i++) {
      const joint = new T.Group();
      joint.position.z = i ? -length : -0.36;
      const r0 = 0.022 - i * 0.0017,
        r1 = 0.022 - (i + 1) * 0.0017;
      put(new T.CylinderGeometry(r1, r0, length, 8).rotateX(-Math.PI / 2), blank, 0, 0, -length / 2, joint);
      if (i % 2 === 1 || i === joints - 1) {
        const ring = new T.Mesh(guide, metal);
        ring.position.set(0, -0.03, -length * 0.9);
        ring.scale.setScalar(1 - i * 0.06);
        joint.add(ring);
      }
      parent.add(joint);
      this.segments.push(joint);
      parent = joint;
    }
    this.tip.position.z = -length;
    parent.add(this.tip);
    this.rod.rotation.order = "YXZ";
    this.rod.position.set(HAND.x, HAND.y, HAND.z);
    this.scene.add(this.rod);
  }
  /**
   * The float (찌): a slender antenna banded red, yellow and green, its tip glowing a little so that it is seen far
   * out, over a spindle body that rides under the surface. The group's origin is where it sits at the waterline.
   */
  private floatModel(keep: Keep) {
    const band = (color: string, glow = 0) => this.standard({ color, emissive: color, emissiveIntensity: glow, roughness: 0.45 });
    const stem = keep(new T.CylinderGeometry(0.034, 0.034, 1, 10));
    [
      ["#ff3a2a", 0.55, 0.1, 0.7],
      ["#ffd22a", 0.45, 0.1, 0.35],
      ["#ff3a2a", 0.35, 0.1, 0.35],
      ["#3ad06a", 0.25, 0.1, 0.25],
      ["#f4f1e8", 0.08, 0.17, 0],
    ].forEach(([color, top, long, glow], i) => {
      const paint = band(color as string, glow as number);
      // The tip: it glows brighter as night falls (a night float's light).
      if (i === 0) this.floatTip = paint;
      const piece = new T.Mesh(stem, paint);
      piece.scale.y = long as number;
      piece.position.y = (top as number) - (long as number) / 2;
      this.float.add(piece);
    });
    const body = new T.Mesh(keep(new T.SphereGeometry(0.08, 14, 10)), band("#ff6a2a", 0.1));
    body.scale.set(1, 3.2, 1);
    body.position.y = -0.24;
    this.float.add(body);
    const ring = new T.Mesh(keep(new T.CylinderGeometry(0.082, 0.082, 0.05, 14)), band("#ffffff"));
    ring.position.y = -0.2;
    this.float.add(ring);
    this.float.traverse((o) => (o.castShadow = true));
    this.scene.add(this.float);
  }
  /** A fish of `kind` (or a piece of junk), built once: its mouth is the origin, its body runs along −x, one unit long. */
  private catchModel(kind: number) {
    let model = this.fishes.get(kind);
    if (model) return model;
    model = new T.Group();
    const keep: Keep = (r) => this.own(r);
    if (kind === CAN) {
      // A drink can of our own: a red body with a pale wave, silver ends; hung by its ring pull.
      const label = keep(
        painted(256, 128, (pen, w, h) => {
          pen.fillStyle = "#c8323a";
          pen.fillRect(0, 0, w, h);
          pen.strokeStyle = "#f4ede0";
          pen.lineWidth = 16;
          pen.beginPath();
          for (let x = 0; x <= w; x += 8) pen.lineTo(x, h / 2 + Math.sin((x / w) * Math.PI * 4) * 18);
          pen.stroke();
        }),
      );
      const side = this.standard({ map: label, roughness: 0.35, metalness: 0.5 }),
        silver = this.standard({ color: "#d2d6da", roughness: 0.25, metalness: 0.9 });
      const can = new T.Mesh(keep(new T.CylinderGeometry(0.11, 0.11, 0.36, 22)), [side, silver, silver]);
      can.position.y = -0.2;
      can.rotation.z = 0.25;
      model.add(can);
    } else if (kind === STARFISH) {
      // A starfish: five rounded arms, orange and knobbly, hung by one of them.
      const star = new T.Shape();
      for (let k = 0; k <= 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2,
          r = k % 2 ? 0.08 : 0.24;
        if (k) star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const skin = this.standard({ color: "#e8703a", roughness: 0.85 }),
        body = new T.Mesh(keep(new T.ExtrudeGeometry(star, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2 })), skin);
      body.position.set(0, -0.24, -0.02);
      model.add(body);
    } else if (kind === BOOT) {
      // A rubber boot, dark green with a black sole, hung by its top.
      const rubber = this.standard({ color: "#2f4a2c", roughness: 0.55 }),
        sole = this.standard({ color: "#18181a", roughness: 0.8 });
      this.attach(model, new T.Mesh(keep(new T.CylinderGeometry(0.13, 0.12, 0.5, 18)), rubber), 0, -0.27, 0);
      this.attach(model, new T.Mesh(keep(block(0.24, 0.16, 0.42, 0.06)), rubber), 0, -0.52, 0.12);
      this.attach(model, new T.Mesh(keep(block(0.25, 0.04, 0.44, 0.02)), sole), 0, -0.6, 0.12);
      this.attach(model, new T.Mesh(keep(new T.TorusGeometry(0.13, 0.015, 6, 20).rotateX(Math.PI / 2)), rubber), 0, -0.03, 0);
    } else {
      const look = LOOKS[kind],
        skin = keep(
          painted(256, 128, (pen, w, h) => {
            const g = pen.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, look.back);
            g.addColorStop(0.38, look.side);
            g.addColorStop(0.7, look.belly);
            g.addColorStop(1, look.belly);
            pen.fillStyle = g;
            pen.fillRect(0, 0, w, h);
            if (look.stripe) {
              pen.fillStyle = look.stripe;
              pen.globalAlpha = 0.7;
              pen.fillRect(0, h * 0.42, w, h * 0.1);
              pen.globalAlpha = 1;
            }
            // Scales: rows of small arcs, fainter toward the belly.
            const random = sequence(kind + 5);
            pen.lineWidth = 1.2;
            for (let y = 6; y < h * 0.72; y += 6)
              for (let x = (y / 6) % 2 ? 0 : 4; x < w; x += 8) {
                pen.strokeStyle = `rgba(${look.shine ? "255,240,180" : "20,20,10"},${0.22 * (1 - y / h)})`;
                pen.beginPath();
                pen.arc(x, y, 4, 0.2, Math.PI - 0.2);
                pen.stroke();
              }
            if (look.spots)
              for (let k = 0; k < 90; k++) {
                pen.fillStyle = look.spots;
                pen.beginPath();
                pen.arc(random() * w, random() * h * 0.55, 1.2 + random() * 1.8, 0, Math.PI * 2);
                pen.fill();
              }
          }),
        ),
        body = look.shine ? this.standard({ map: skin, roughness: 0.25, metalness: 0.55, emissive: "#6a4200", emissiveIntensity: 0.35 }) : this.standard({ map: skin, roughness: 0.45, metalness: 0.15 }),
        fin = this.standard({ color: look.fin, roughness: 0.6, side: T.DoubleSide, transparent: true, opacity: 0.92 }),
        black = this.standard({ color: "#0e0e10", roughness: 0.2 }),
        white = this.standard({ color: "#f2efe4", roughness: 0.4 });
      // The body: an egg along −x from the mouth; the catfish has a broad flat head before it.
      const trunk = new T.Mesh(keep(new T.SphereGeometry(0.5, 28, 18)), body);
      trunk.scale.set(1, look.deep, look.wide);
      this.attach(model, trunk, -0.5, 0, 0);
      if (kind === CATFISH) {
        const head = new T.Mesh(keep(new T.SphereGeometry(0.5, 20, 14)), body);
        head.scale.set(0.38, 0.17, 0.3);
        this.attach(model, head, -0.16, -0.01, 0);
        // Long barbels from the mouth.
        const whisker = keep(new T.CylinderGeometry(0.005, 0.009, 0.34, 5).translate(0, 0.17, 0));
        for (const s of [-1, 1])
          for (const [tilt, spread] of [[0.6, 0.9], [1.9, 0.5]]) {
            const barbel = new T.Mesh(whisker, black);
            barbel.position.set(-0.02, 0, s * 0.06);
            barbel.rotation.set(s * spread, 0, tilt);
            model.add(barbel);
          }
      } else if (kind === CARP || kind === GOLDEN) {
        // Carp have two short barbels.
        const whisker = keep(new T.CylinderGeometry(0.004, 0.006, 0.06, 5).translate(0, 0.03, 0));
        for (const s of [-1, 1]) {
          const barbel = new T.Mesh(whisker, fin);
          barbel.position.set(-0.02, -0.03, s * 0.03);
          barbel.rotation.set(s * 0.8, 0, 2.2);
          model.add(barbel);
        }
      }
      // The tail: forked (rounded for the catfish), standing upright behind the body.
      const tail = new T.Shape();
      if (kind === CATFISH) {
        tail.moveTo(0, 0);
        tail.quadraticCurveTo(-0.24, 0.16, -0.26, 0);
        tail.quadraticCurveTo(-0.24, -0.16, 0, 0);
      } else {
        tail.moveTo(0, 0);
        tail.lineTo(-0.26, look.deep * 0.62);
        tail.quadraticCurveTo(-0.17, 0, -0.26, -look.deep * 0.62);
        tail.closePath();
      }
      this.attach(model, new T.Mesh(keep(new T.ShapeGeometry(tail, 6)), fin), -0.94, 0, 0);
      // A dorsal fin along the back (long on carp), a fin under the tail, and a pectoral fin each side.
      const dorsal = new T.Shape(),
        long = kind === TROUT ? 0.16 : kind === CATFISH ? 0.08 : 0.34;
      dorsal.moveTo(0, 0);
      dorsal.lineTo(-0.04, look.deep * 0.4);
      dorsal.lineTo(-long, look.deep * 0.18);
      dorsal.lineTo(-long - 0.04, 0);
      dorsal.closePath();
      this.attach(model, new T.Mesh(keep(new T.ShapeGeometry(dorsal, 2)), fin), -0.34, look.deep * 0.42, 0);
      const anal = new T.Shape();
      anal.moveTo(0, 0);
      anal.lineTo(-0.08, -look.deep * 0.3);
      anal.lineTo(-0.14, 0);
      anal.closePath();
      this.attach(model, new T.Mesh(keep(new T.ShapeGeometry(anal, 1)), fin), -0.66, -look.deep * 0.36, 0);
      const pectoral = keep(new T.ShapeGeometry(new T.Shape([new T.Vector2(0, 0), new T.Vector2(-0.14, 0.03), new T.Vector2(-0.1, -0.06)]), 1));
      for (const s of [-1, 1]) {
        const p = new T.Mesh(pectoral, fin);
        p.position.set(-0.26, -look.deep * 0.25, s * look.wide * 0.42);
        p.rotation.x = s * 0.9;
        model.add(p);
      }
      // Eyes.
      for (const s of [-1, 1]) {
        this.attach(model, new T.Mesh(keep(new T.SphereGeometry(0.034, 12, 8)), white), -0.13, look.deep * 0.1, s * look.wide * 0.36);
        this.attach(model, new T.Mesh(keep(new T.SphereGeometry(0.022, 10, 8)), black), -0.12, look.deep * 0.1, s * look.wide * 0.42);
      }
    }
    model.traverse((o) => (o.castShadow = true));
    model.visible = false;
    this.scene.add(model);
    this.fishes.set(kind, model);
    return model;
  }
  private attach(parent: T.Object3D, mesh: T.Mesh, x: number, y: number, z: number) {
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  /** The hand: a press (or Space held) casts when the line is in, strikes when the float is out, and winds while held. */
  private listen() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || this.pointer !== null) return;
      this.pointer = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that has already gone.
      }
      this.circles = new CrankReader();
      this.circles.add(e.clientX, e.clientY);
      this.hand(true, e);
    });
    // Circles drawn with the finger (or the pressed mouse) turn the reel's crank: the quicker, the faster it winds.
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.pointer || this.world.phase !== "fight" || !this.running()) return;
      const all = e.getCoalescedEvents?.() ?? [];
      let turns = 0;
      for (const p of all.length ? all : [e]) turns += this.circles.add(p.clientX, p.clientY);
      if (turns > 0) crank(this.world, turns);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.pointer) return;
      this.pointer = null;
      this.hand(false);
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("keydown", (e) => {
      if (e.key !== " " && e.key !== "Spacebar" && e.key !== "Enter") return;
      e.preventDefault();
      if (e.repeat || this.keyHeld) return;
      this.keyHeld = true;
      this.hand(true, null);
    });
    el.addEventListener("keyup", (e) => {
      if (e.key !== " " && e.key !== "Spacebar" && e.key !== "Enter") return;
      e.preventDefault();
      this.keyHeld = false;
      // A key's turn of the crank is the press (pressed again and again it keeps turning); letting the key go does not stop it.
      if (this.pointer === null && this.world.phase !== "fight") this.hand(false);
    });
    el.addEventListener("blur", () => {
      if (this.keyHeld && this.pointer === null) this.hand(false);
      this.keyHeld = false;
    });
  }
  private hand(down: boolean, e?: PointerEvent | null) {
    if (!down) {
      // The finger lifted lets go of the crank.
      release(this.world);
      return;
    }
    if (!this.running()) return;
    // Hooked, Space (or Enter) turns the crank half round a press: pressed quickly again and again, it winds.
    if (this.world.phase === "fight" && !e) {
      crank(this.world, KEY_TURN);
      return;
    }
    if (this.world.phase === "ready") {
      const to = e ? this.waterUnder(e) : CAST.middle;
      this.report(cast(this.world, to.x, to.z));
    } else this.report(press(this.world));
  }
  /** Where a press points on the water (a press over the horizon points as far as a cast goes, that way). */
  private waterUnder(e: PointerEvent) {
    aim(this.sight, e, this.renderer.domElement, this.camera);
    const ray = this.sight.ray,
      hit = new T.Vector3();
    if (ray.direction.y < -0.002 && ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), hit)) return { x: hit.x, z: hit.z };
    const flat = Math.hypot(ray.direction.x, ray.direction.z) || 1;
    return { x: ray.origin.x + (ray.direction.x / flat) * 40, z: ray.origin.z + (ray.direction.z / flat) * 40 };
  }
  protected subject(): TableSubject {
    return { half: 4, halfZ: 4, height: 3, lookY: 0.3, tilt: 0.2 };
  }
  protected resize() {
    super.resize();
    anglerCamera(this.camera, this.camera.aspect);
    this.pose(performance.now());
    this.redraw();
  }
  /** Nothing is chosen by the screen's taps: every press is the hand's (see `listen`). */
  protected spots(): Spot[] {
    return [];
  }
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) release(this.world);
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** Tells the screen what has happened on the lake, with words over the water, rings and splashes. */
  private report(events: Happening[]) {
    const now = performance.now(),
      move = (to: number) => this.onMove({ from: -1, to, extra: -1 }),
      knock = (kind: string, strength = 0.6) => this.onKnock?.(kind, strength);
    for (const event of events) {
      switch (event.kind) {
        case "second":
          move(TICK);
          break;
        case "cast":
          this.at.cast = now;
          this.launched = false;
          knock("cast");
          break;
        case "splashdown":
          this.ripple(event.x, event.z, 1, now);
          this.splash(event.x, 0.05, event.z, 10, 1.4);
          move(CAST_MOVE);
          this.onContact();
          break;
        case "nibble":
          this.at.twitch = now;
          this.ripple(event.x, event.z, 0.45, now);
          knock("nibble", 0.3);
          break;
        case "bite":
          this.at.bite = now;
          this.ripple(event.x, event.z, 1.1, now);
          this.splash(event.x, 0.05, event.z, 5, 1);
          knock("bite", 0.8);
          break;
        case "empty":
          this.say("입질이 없어요", "다시 던져 보세요", "#ffffff", event.x, event.z, now);
          break;
        case "scared":
          this.say("너무 일러요!", "물고기가 놀라 달아났어요", "#ffd0a0", event.x, event.z, now);
          this.ripple(event.x, event.z, 0.8, now);
          move(SCARED);
          this.onContact();
          break;
        case "late":
          this.say("늦었어요!", "미끼만 먹고 달아났어요", "#ffd0a0", event.x, event.z, now);
          move(LATE);
          this.onContact();
          break;
        case "hook":
          this.at.hook = now;
          this.ripple(event.x, event.z, 1.3, now);
          this.splash(event.x, 0.05, event.z, 8, 1.6);
          this.say("걸렸다!", KINDS[event.fish.kind].junk ? "무언가 걸렸어요" : "원을 그려 릴을 빠르게 돌리세요", "#9effa8", event.x, event.z, now);
          move(HOOK);
          this.onContact();
          break;
        case "surge":
          this.at.surge = now;
          this.ripple(event.x, event.z, 1.2, now);
          this.splash(event.x, 0.05, event.z, 6 + Math.round(event.power * 8), 1.3 + event.power);
          knock("surge", event.power);
          break;
        case "snap":
          this.say("줄이 끊어졌어요!", "물고기가 당길 땐 릴을 멈추세요", "#ff9a8a", event.x, event.z, now);
          this.ripple(event.x, event.z, 1, now);
          move(SNAP);
          this.onContact();
          break;
        case "slip":
          this.say("빠져나갔어요!", "줄을 너무 오래 늦췄어요", "#ffd0a0", event.x, event.z, now);
          this.ripple(event.x, event.z, 0.9, now);
          move(SLIP);
          this.onContact();
          break;
        case "catch": {
          const { kind, size, points } = event.fish;
          this.ripple(event.x, event.z, 1.4, now);
          this.splash(event.x, 0.1, event.z, 16, 2.2);
          this.labelFor(kind, size, points);
          this.onMove(catchMove(kind, size));
          this.onContact();
          break;
        }
        case "ready":
          break;
      }
    }
  }
  /** A ring spreading on the water from (x, z), of `strength` (1 a splash). */
  private ripple(x: number, z: number, strength: number, now: number) {
    if (this.ripples.length >= 8) this.ripples.shift();
    this.ripples.push({ x, z, at: now, strength });
  }
  /** Drops thrown up from a point of the water. */
  private splash(x: number, y: number, z: number, count: number, speed: number) {
    for (let k = 0; k < count && this.flying.length < 70; k++) {
      const a = Math.random() * Math.PI * 2,
        out = (0.3 + Math.random() * 0.7) * speed * 0.6;
      this.flying.push({ x, y, z, vx: Math.cos(a) * out, vy: speed * (0.8 + Math.random() * 0.8), vz: Math.sin(a) * out, life: 1 });
    }
  }
  /** Words that rise over the water and fade: a big line and a smaller one under it. */
  private say(text: string, small: string, color: string, x: number, z: number, now: number) {
    if (capturing()) return;
    const sprite = this.sign(text, small, color, "rgba(12, 28, 36, 0.85)");
    const far = Math.max(3, Math.hypot(x - this.camera.position.x, z - this.camera.position.z));
    sprite.scale.set(far * 0.2, far * 0.075, 1);
    this.words.push({ sprite, at: now, x, y: 0.9 + far * 0.035, z, long: 1700 });
  }
  /** A sprite of two lines of words. */
  private sign(text: string, small: string, color: string, edge: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 240;
    const pen = canvas.getContext("2d")!;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineJoin = "round";
    // Long words are set smaller, so that they stay within the picture.
    const fit = (size: number, weight: number, words: string) => {
      pen.font = `${weight} ${size}px "Inter", "Noto Sans KR", sans-serif`;
      const wide = pen.measureText(words).width;
      if (wide > 600) pen.font = `${weight} ${Math.floor((size * 600) / wide)}px "Inter", "Noto Sans KR", sans-serif`;
    };
    fit(92, 900, text);
    pen.lineWidth = 16;
    pen.strokeStyle = edge;
    pen.strokeText(text, 320, 88);
    pen.fillStyle = color;
    pen.fillText(text, 320, 88);
    if (small) {
      fit(44, 800, small);
      pen.lineWidth = 10;
      pen.strokeText(small, 320, 180);
      pen.fillStyle = "#ffffff";
      pen.fillText(small, 320, 180);
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false }));
    sprite.renderOrder = 20;
    this.scene.add(sprite);
    return sprite;
  }
  private drop(sprite: T.Sprite) {
    sprite.removeFromParent();
    sprite.material.map?.dispose();
    sprite.material.dispose();
  }
  /** The name, size and points of what was landed, shown beside it while it is held up. */
  private labelFor(kind: number, size: number, points: number) {
    if (this.label) this.drop(this.label);
    this.label = null;
    if (capturing()) return;
    const junk = KINDS[kind].junk;
    this.label = this.sign(`${KINDS[kind].name} ${size}cm`, junk ? (points ? `+${points}점 · 쓰레기를 건졌어요` : "0점 · 쓰레기를 건졌어요") : `+${points}점`, kind === GOLDEN || kind === TUNA ? "#ffe066" : "#ffffff", "rgba(12, 28, 36, 0.9)");
    this.label.scale.set(1.1, 0.41, 1);
  }
  private advance(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    if (this.running()) {
      // The lake keeps the wall clock's time even when frames are few.
      this.left += real;
      while (this.left >= DT && this.state?.winner === null) {
        this.left -= DT;
        this.report(step(this.world));
      }
      // The reel clicks as it turns: the quicker, the closer the clicks.
      if (this.world.phase === "fight" && this.world.reeling && now - this.at.click > Math.max(55, 260 / Math.max(0.1, this.world.spin))) {
        this.at.click = now;
        this.onKnock?.("reel", 0.25);
      }
    } else if (this.state && this.state.winner !== null) {
      // Time is up: the line comes in and nothing more bites.
      retire(this.world);
      for (let k = Math.round(real / DT); k > 0; k--) step(this.world);
    }
    this.pose(now);
    this.write();
    this.redraw();
  }
  /** Puts everything where the lake has it: the water's rings, the rod, the float, the line, the fish, drops and words. */
  private pose(now: number) {
    const w = this.world,
      seconds = now / 1000;
    this.sway.value = seconds;
    this.skyMap.offset.x = (seconds * 0.0008) % 1;
    const uniforms = this.waterPaint.uniforms;
    uniforms.uTime.value = seconds;
    // The lake's day goes by with the round; at sea the buoy rides the swell.
    this.timeLight(this.timeOfDay());
    if (this.atSea) {
      this.buoy.position.y = -0.15 + 0.16 * Math.sin(seconds * 0.9);
      this.buoy.rotation.set(0.12 * Math.sin(seconds * 0.9 + 1), 0, 0.1 * Math.sin(seconds * 0.7));
    }
    // At sea a surging fish thrashes at the surface: spray and rings all the while it runs.
    if (w.sea && w.phase === "fight" && w.surge && now - this.at.thrash > 130) {
      this.at.thrash = now;
      this.ripple(w.float.x, w.float.z, 1 + surgeNow(w.surge) * 0.6, now);
      if (!capturing()) this.splash(w.float.x, 0.05, w.float.z, 4 + Math.round(surgeNow(w.surge) * 6), 1.6 + surgeNow(w.surge));
    }
    // Taken, the thrashing float throws up rings and spray all the while.
    if (w.phase === "bite" && now - this.at.thrash > 90) {
      this.at.thrash = now;
      const shake = 0.4,
        at = this.float.position;
      this.ripple(at.x + (Math.random() - 0.5) * shake, at.z + (Math.random() - 0.5) * shake, 0.9 + Math.random() * 0.6, now);
      if (!capturing()) this.splash(at.x, 0.04, at.z, 5 + Math.round(Math.random() * 5), 1.3 + Math.random() * 1.1);
      if (now - this.at.bite > 150 && Math.random() < 0.5) this.onKnock?.("nibble", 0.35 + Math.random() * 0.25);
    }
    // The float bobs, and sends out a faint ring now and then.
    if ((w.phase === "wait" || w.phase === "fight") && now - this.at.bob > 1700) {
      this.at.bob = now;
      this.ripple(w.float.x, w.float.z, w.phase === "fight" ? 0.7 : 0.25, now);
    }
    this.ripples = this.ripples.filter((r) => now - r.at < 4500);
    const shader = uniforms.uRipples.value as T.Vector4[];
    shader.forEach((v, i) => {
      const r = this.ripples[i];
      if (r) v.set(r.x, r.z, (now - r.at) / 1000, r.strength);
      else v.set(0, 0, 0, 0);
    });
    this.rings.forEach((ring, i) => {
      const r = this.ripples[this.ripples.length - 1 - i],
        age = r ? (now - r.at) / 1000 : 9;
      ring.visible = !!r && age < 2.4 && r.strength > 0.3;
      if (!ring.visible) return;
      const radius = 0.15 + age * 0.85;
      ring.position.set(r!.x, 0.012, r!.z);
      ring.scale.set(radius, 1, radius);
      (ring.material as T.MeshBasicMaterial).opacity = 0.5 * r!.strength * (1 - age / 2.4);
    });
    this.poseRod(now);
    this.rod.updateMatrixWorld(true);
    const tip = this.tip.getWorldPosition(new T.Vector3());
    const top = this.poseFloat(now, tip);
    this.poseCatch(now);
    this.poseLine(tip, top);
    const dt = Math.max(0, Math.min(0.1, (now - this.lastPose) / 1000));
    this.lastPose = now;
    this.poseDrops(dt);
    // Words rise and fade.
    this.words = this.words.filter((word) => {
      const p = (now - word.at) / word.long;
      if (p >= 1) {
        this.drop(word.sprite);
        return false;
      }
      word.sprite.position.set(word.x, word.y + p * 0.8, word.z);
      word.sprite.material.opacity = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
      // A thumbnail being captured shows the lake without words.
      word.sprite.visible = !capturing();
      return true;
    });
  }
  /** The rod: at rest a little raised; swung back and forward to cast; jerked up to strike; raised and bent toward a fish on the line. */
  private poseRod(now: number) {
    const w = this.world,
      ease = (p: number) => p * p * (3 - 2 * p);
    let pitch = 0.3,
      yaw = Math.atan2(-(w.float.x - HAND.x), -(w.float.z - HAND.z)),
      bend = 0.05,
      side = 0;
    if (w.phase === "ready") yaw = Math.atan2(-(CAST.middle.x - HAND.x), -(CAST.middle.z - HAND.z));
    if (w.phase === "flight") {
      const t = (now - this.at.cast) / 1000;
      yaw = Math.atan2(-(w.target.x - HAND.x), -(w.target.z - HAND.z));
      pitch = t < 0.14 ? 0.3 + 1.0 * ease(t / 0.14) : t < 0.32 ? 1.3 - 1.3 * ease((t - 0.14) / 0.18) : t < 0.7 ? 0.3 * ease((t - 0.32) / 0.38) : 0.3;
      bend = t < 0.32 ? (t < 0.14 ? -0.15 : 0.25) : 0.05;
    }
    if (w.phase === "fight") {
      const pull = surgeNow(w.surge);
      pitch = 0.44;
      bend = 0.15 + w.tension * 0.95 + pull * 0.2;
      // The tip bends toward the fish's side.
      side = Math.max(-0.3, Math.min(0.3, -(w.float.x - HAND.x) * 0.02)) * w.tension;
    }
    if (w.phase === "land") {
      pitch = 0.62 + 0.4 * ease(Math.min(1, w.t / 0.6));
      bend = 0.35;
      yaw = 0.05;
    }
    if (w.phase === "reel") pitch = 0.45;
    // The strike: a quick lift.
    const struck = (now - this.at.hook) / 1000;
    if (struck < 0.35) pitch += 0.35 * Math.sin((struck / 0.35) * Math.PI);
    this.rod.rotation.set(pitch, yaw, 0);
    const weights = this.segments.map((_, i) => (i + 1) ** 1.3),
      total = weights.reduce((a, b) => a + b, 0);
    this.segments.forEach((joint, i) => {
      joint.rotation.x = -bend * (weights[i] / total);
      joint.rotation.y = side * (weights[i] / total);
    });
    // The crank turns as fast as the hand turns it (and by itself as an empty line comes in).
    const dt = Math.max(0, Math.min(0.1, (now - this.crankAt) / 1000));
    this.crankAt = now;
    const turned = w.phase === "reel" ? 0.5 : w.phase === "fight" ? w.spin * 2 * Math.PI * dt : 0;
    this.crank.rotation.x -= turned;
    // A spinning reel's rotor goes round about five times a turn of the handle.
    this.rotor.rotation.z += turned * 5.2;
  }
  /** Places the float (and returns where the line meets it): hanging from the tip, flying, riding the water, or dragged by the fish. */
  private poseFloat(now: number, tip: T.Vector3) {
    const w = this.world,
      f = this.float,
      t = now / 1000;
    f.visible = true;
    f.rotation.set(0, 0, 0);
    f.scale.setScalar(1);
    if (w.phase === "ready" || (w.phase === "flight" && (now - this.at.cast) / 1000 < 0.24)) {
      // It hangs from the tip on a short line, swinging a little.
      f.position.set(tip.x + Math.sin(t * 1.7) * 0.04, tip.y - 0.62, tip.z + Math.cos(t * 1.3) * 0.03);
      f.rotation.z = Math.sin(t * 1.7) * 0.06;
      f.scale.setScalar(0.7);
      this.launched = false;
    } else if (w.phase === "flight") {
      if (!this.launched) {
        this.launched = true;
        this.launch.copy(tip);
      }
      const q = Math.min(1, ((now - this.at.cast) / 1000 - 0.24) / Math.max(0.1, w.flight - 0.24)),
        far = Math.hypot(w.target.x - this.launch.x, w.target.z - this.launch.z),
        apex = 1.2 + far * 0.1;
      f.position.set(this.launch.x + (w.target.x - this.launch.x) * q, this.launch.y * (1 - q) + 4 * apex * q * (1 - q), this.launch.z + (w.target.z - this.launch.z) * q);
      f.rotation.set(-1.1 * (1 - q), 0, 0.3 * Math.sin(q * 9));
    } else if (w.phase === "wait" || w.phase === "bite") {
      const twitch = (now - this.at.twitch) / 1000,
        bit = (now - this.at.bite) / 1000,
        dip = twitch < 0.35 ? -0.17 * Math.sin((twitch / 0.35) * Math.PI) + 0.03 * Math.sin(twitch * 55) : 0;
      let y = 0.012 * Math.sin(t * 2.3) + 0.008 * Math.sin(t * 3.7) + dip,
        x = w.float.x,
        z = w.float.z;
      let roll = twitch < 0.35 ? Math.sin(twitch * 30) * 0.22 : Math.sin(t * 1.1) * 0.03,
        pitch = 0;
      if (w.phase === "bite") {
        // Taken: yanked under at once, and thrashing (the user asked for it wilder): it bursts up and is dragged
        // down again and again, jerked from side to side and to and fro, rolling, as it is drawn away.
        // At sea, wilder still.
        const wild = w.sea ? 1.45 : 1,
          sink = Math.min(1, bit / 0.08),
          burst = Math.max(0, Math.sin(bit * 13)) ** 2;
        y = -0.6 * sink + 0.55 * wild * burst * sink + wild * (0.1 * Math.sin(bit * 47) + 0.06 * Math.sin(bit * 79 + 1));
        x += Math.sin(bit * 2) * 0.25 * bit + wild * (0.26 * Math.sin(bit * 27) + 0.12 * Math.sin(bit * 61 + 2));
        z += -0.45 * bit + wild * 0.2 * Math.sin(bit * 35 + 1);
        roll = Math.min(1.4, wild * (0.95 * Math.sin(bit * 23) + 0.3 * Math.sin(bit * 53)));
        pitch = Math.min(1.1, wild * 0.7 * Math.sin(bit * 31 + 0.5));
      }
      f.position.set(x, y, z);
      f.rotation.set(pitch, 0, roll);
    } else if (w.phase === "fight") {
      // Dragged under as the line tightens; a surge jerks it about, the sea's far more (the user asked: wilder at sea).
      const pull = surgeNow(w.surge),
        wild = w.sea ? 2.2 : 1;
      f.position.set(
        w.float.x + pull * wild * 0.12 * Math.sin(t * 21),
        -0.12 - w.tension * 0.22 - pull * 0.25 + wild * (0.02 + pull * 0.05) * Math.sin(t * 9 + pull * 4),
        w.float.z + 0.15 + pull * wild * 0.08 * Math.sin(t * 17 + 1),
      );
      // Leaning toward the rod, the way the line pulls it.
      f.rotation.set(0.55 + w.tension * 0.4 + pull * wild * 0.25 * Math.sin(t * 13), 0, Math.sin(t * 7) * 0.12 * (1 + pull * wild * 2));
    } else if (w.phase === "reel") {
      // Skipping back over the water, then up to the tip.
      const left = distance(w),
        lift = Math.max(0, 1 - left / 2.5);
      f.position.set(w.float.x, 0.02 + lift * (tip.y - 0.62), w.float.z);
      f.rotation.x = 0.9 * (1 - lift);
    } else if (w.phase === "land") {
      const mouth = this.liftedAt(now);
      // The float has been wound up to the tip; the line runs straight down to the catch.
      f.visible = false;
      return mouth;
    }
    // Out on the water the float is drawn larger the further it is, so that its least twitch is seen.
    if (w.phase !== "ready" && f.position.y < 0.5) f.scale.setScalar(Math.max(1, Math.hypot(f.position.x - this.camera.position.x, f.position.z - this.camera.position.z) * 0.085));
    f.updateMatrixWorld();
    return f.localToWorld(new T.Vector3(0, 0.55, 0));
  }
  /** Where the mouth of a landed catch is, as it is lifted out, held up and dropped into the bucket. */
  private liftedAt(now: number) {
    const t = this.world.t,
      ease = (p: number) => p * p * (3 - 2 * p),
      from = new T.Vector3(REEL_TO.x, -0.1, REEL_TO.z),
      shown = new T.Vector3(0.22, 2.28, 0.45),
      bucket = new T.Vector3(-0.72, DECK.y + 0.55, 1.9);
    if (t < 0.7) {
      const q = ease(t / 0.7);
      return from.clone().lerp(shown, q).add(new T.Vector3(0, Math.sin(q * Math.PI) * 0.5, 0));
    }
    if (t < LAND_TIME - 0.5) return shown.clone().add(new T.Vector3(Math.sin(now / 260) * 0.03, Math.sin(now / 190) * 0.02, 0));
    return shown.clone().lerp(bucket, ease(Math.min(1, (t - (LAND_TIME - 0.5)) / 0.45)));
  }
  /** The catch: seen thrashing at the surface once the fish is near, lifted out when landed. */
  private poseCatch(now: number) {
    const w = this.world,
      kind = w.phase === "land" ? w.landed?.kind : w.phase === "fight" ? w.fish?.kind : undefined;
    let model: T.Group | null = null;
    if (kind !== undefined) {
      const size = w.phase === "land" ? w.landed!.size : w.fish!.size,
        scale = KINDS[kind].junk ? 0.62 : 0.18 + (Math.min(size, 140) / 100) * 0.6;
      if (w.phase === "land") {
        model = this.catchModel(kind);
        const mouth = this.liftedAt(now),
          late = w.t > LAND_TIME - 0.5;
        model.position.copy(mouth);
        model.scale.setScalar(scale * (late ? 1 - 0.6 * Math.min(1, (w.t - (LAND_TIME - 0.5)) / 0.45) : 1));
        // A fish hangs head up from the hook and wriggles; junk simply turns on the line.
        if (KINDS[kind].junk) model.rotation.set(0, now / 600, Math.sin(now / 300) * 0.1);
        else model.rotation.set(Math.sin(now / 90) * 0.25, 0.6 + Math.sin(now / 400) * 0.6, Math.PI / 2 + Math.sin(now / 120) * 0.15);
        if (this.label) {
          this.label.position.set(mouth.x - 0.95, mouth.y - 0.25, mouth.z);
          this.label.material.opacity = late ? Math.max(0, 1 - (w.t - (LAND_TIME - 0.5)) / 0.3) : Math.min(1, w.t / 0.3);
          this.label.visible = !capturing();
        }
      } else if (distance(w) < 5.5 && !KINDS[kind].junk) {
        model = this.catchModel(kind);
        const pull = surgeNow(w.surge),
          away = w.surge ? w.surge.way : Math.PI + Math.atan2(w.float.x - REEL_TO.x, -(w.float.z - REEL_TO.z));
        model.position.set(w.float.x, -0.05 - 0.15 * (1 - Math.min(1, (5.5 - distance(w)) / 2)) + pull * 0.1, w.float.z);
        model.scale.setScalar(scale);
        // Facing the way it pulls (the mouth, the origin, ahead): a surge away, else drawn toward the pier.
        model.rotation.set(Math.sin(now / 70) * 0.3 * (0.4 + pull), Math.PI / 2 + away + Math.sin(now / 110) * 0.35, Math.sin(now / 90) * 0.1);
      }
    }
    for (const [k, fish] of this.fishes) fish.visible = fish === model && k === kind;
    if (this.label && w.phase !== "land") {
      this.drop(this.label);
      this.label = null;
    }
  }
  /** The line: from the rod's tip to the float, sagging when slack and drawn straight when tight. */
  private poseLine(tip: T.Vector3, end: T.Vector3) {
    const w = this.world,
      droop = w.phase === "ready" || w.phase === "land" ? 0 : w.phase === "fight" ? 0.55 * (1 - w.tension) : w.phase === "flight" ? 0.15 : 0.7,
      mid = tip.clone().lerp(end, 0.5);
    // The line falls from the tip and comes to the float low over the water: its middle is let down toward the
    // float's height (all the way for a slack line, hardly at all for a tight one).
    mid.y += (Math.max(end.y, 0.05) - mid.y) * droop;
    const points = this.linePoints,
      n = points.length / 3,
      p = new T.Vector3();
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      // A quadratic curve through the lowered middle.
      p.set(0, 0, 0)
        .addScaledVector(tip, (1 - s) * (1 - s))
        .addScaledVector(mid, 2 * s * (1 - s))
        .addScaledVector(end, s * s);
      if (i < n - 1 && end.y > -0.2) p.y = Math.max(p.y, 0.008);
      points[i * 3] = p.x;
      points[i * 3 + 1] = p.y;
      points[i * 3 + 2] = p.z;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
  }
  private poseDrops(dt: number) {
    const matrix = new T.Matrix4();
    this.flying = this.flying.filter((d) => {
      d.vy -= 9.8 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.life -= dt * 0.9;
      return d.y > -0.05 && d.life > 0;
    });
    this.flying.forEach((d, i) => {
      matrix.makeScale(0.6 + d.life * 0.6, 0.6 + d.life * 0.9, 0.6 + d.life * 0.6).setPosition(d.x, d.y, d.z);
      this.drops.setMatrixAt(i, matrix);
    });
    this.drops.count = this.flying.length;
    this.drops.instanceMatrix.needsUpdate = true;
  }
  /** Writes the words over the table and, for browser tests, the state of the lake on the canvas. */
  private write() {
    const w = this.world,
      state = this.state;
    this.hud.hidden = capturing();
    const set = (key: string, text: string, apply: (el: HTMLElement) => void) => {
      if (this.said.get(key) === text) return;
      this.said.set(key, text);
      const el = this.hud.querySelector<HTMLElement>(`[data-k="${key}"]`);
      if (el) apply(el);
    };
    if (state) {
      set("score", String(state.score), (el) => (el.textContent = String(state.score)));
      set("left", `${state.left}`, (el) => {
        el.textContent = `${Math.max(0, state.left)}초`;
        el.classList.toggle("low", state.left <= 10 && state.winner === null);
      });
      const fish = state.caught.filter((c) => !KINDS[c.kind].junk).length;
      set("count", String(fish), (el) => (el.textContent = `${fish}마리`));
    }
    const fighting = w.phase === "fight",
      gauge = this.hud.querySelector<HTMLElement>(".fish-gauge")!;
    if (gauge.hidden === fighting) gauge.hidden = !fighting;
    if (fighting) {
      const tension = Math.round(w.tension * 100),
        surging = !!w.surge;
      set("tension", `${tension}|${surging}`, (el) => {
        el.style.height = `${Math.min(100, tension)}%`;
        el.parentElement!.classList.toggle("danger", tension >= 75);
        el.parentElement!.classList.toggle("surge", surging);
      });
      set("far", distance(w).toFixed(1), (el) => (el.textContent = `${distance(w).toFixed(1)}m`));
      // The reel's speed: full at the pace that winds at full speed; its arrow turns with the crank.
      const spun = Math.round(Math.min(1, w.spin / FULL_SPIN) * 100);
      set("spin", String(spun), (el) => {
        el.style.width = `${spun}%`;
        el.parentElement!.parentElement!.classList.toggle("fast", spun >= 60);
      });
      const arrow = this.hud.querySelector<SVGElement>(".fish-spin svg");
      if (arrow) arrow.style.transform = `rotate(${((-this.crank.rotation.x * 180) / Math.PI) % 360}deg)`;
      const slack = Math.round((w.slack / SLACK) * 100);
      set("slack", String(slack), (el) => {
        el.style.width = `${slack}%`;
        el.parentElement!.classList.toggle("warn", slack > 40);
      });
    }
    let prompt = "";
    if (state && state.winner === null && !this.paused) {
      if (w.phase === "ready") prompt = "물을 누르면 찌를 던집니다 (스페이스: 가운데로)";
      else if (w.phase === "wait") prompt = w.nibbling ? "입질이 와요… 찌가 쑥 들어갈 때 누르세요" : "찌를 지켜보세요";
      else if (w.phase === "bite") prompt = "지금! 눌러서 챔질하세요";
      else if (w.phase === "fight")
        prompt = w.surge
          ? "물고기가 차고 나가요! 릴을 멈추세요"
          : w.reeling
            ? w.spin < FULL_SPIN * 0.6
              ? "더 빠르게 돌리세요!"
              : "계속 빠르게 돌리세요… 물고기가 당기면 멈추세요"
            : w.slack > 1
              ? "줄이 느슨해요! 원을 그려 릴을 돌리세요"
              : "화면에 빙글빙글 원을 그려 릴을 감으세요 (스페이스 연타)";
    }
    set("prompt", prompt, (el) => {
      el.textContent = prompt;
      el.classList.toggle("urgent", w.phase === "bite" || !!w.surge);
      el.hidden = !prompt;
    });
    // For browser tests: the phase, the float on the water and on the canvas, the line, the middle of the casting water.
    const data = this.renderer.domElement.dataset,
      canvas = this.renderer.domElement,
      px = (v: T.Vector3) => {
        v.project(this.camera);
        return `${(((v.x + 1) / 2) * canvas.clientWidth).toFixed(1)},${(((1 - v.y) / 2) * canvas.clientHeight).toFixed(1)}`;
      },
      put = (key: string, value: string) => {
        if (data[key] !== value) data[key] = value;
      };
    put("phase", w.phase);
    put("float", `${w.float.x.toFixed(2)},${w.float.z.toFixed(2)}`);
    put("floatAt", px(this.float.position.clone()));
    put("water", px(new T.Vector3(CAST.middle.x, 0, CAST.middle.z)));
    put("tension", w.tension.toFixed(2));
    put("surge", w.surge ? "1" : "0");
    put("reeling", w.reeling ? "1" : "0");
    put("spin", w.spin.toFixed(2));
    // The water, how far the lake's day has gone (0 day, 1 night), and how far the reel's handle has turned (radians).
    put("sea", w.sea ? "1" : "0");
    put("day", this.timeOfDay().toFixed(2));
    put("reel", (-this.crank.rotation.x).toFixed(1));
    put("distance", distance(w).toFixed(2));
    put("nibbling", w.nibbling ? "1" : "0");
    put("caught", String(state?.caught.length ?? 0));
    put("landed", w.landed ? String(w.landed.kind) : "");
  }
  protected place(state: State) {
    // A new round, known by the count of moves going back to nothing: the line comes in and the clock starts again.
    const anew = state.ply === 0 && this.shown > 0;
    this.shown = state.ply;
    if (this.atSea !== state.sea) this.setSea(state.sea);
    if (anew || this.world.level !== state.level || this.world.sea !== state.sea) {
      this.world = createWorld(state.level, cryptoRandom, state.sea);
      for (const word of this.words) this.drop(word.sprite);
      this.words = [];
      if (this.label) this.drop(this.label);
      this.label = null;
      this.flying = [];
      this.ripples = [];
      this.left = 0;
    }
    if (state.winner !== null) retire(this.world);
    this.pose(performance.now());
    this.write();
  }
  protected animate() {
    return false;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    for (const word of this.words) this.drop(word.sprite);
    if (this.label) this.drop(this.label);
    this.hud.remove();
    super.dispose();
  }
}
