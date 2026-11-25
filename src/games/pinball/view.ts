import * as T from "three";
import { cryptoRandom } from "../../core/random";
import { glossy } from "../../engine/scene-utils";
import { noZoom } from "../../engine/zoom";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot } from "../table/view";
import { PINBALL_SUBJECT, SCALE, toScene } from "./layout";
import { DRAIN, LAUNCH, SAVE, scoreMove, type State } from "./rules";
import {
  ARCH,
  BALL_R,
  BALLS,
  BANK,
  BUMPERS,
  BUMPER_R,
  DT,
  FLIPPER,
  HALF_W,
  LANES,
  LANE_X,
  MULTIPLIER_MOST,
  PLUNGER_Y,
  SLING,
  SLOPE,
  SPINNER,
  TARGETS,
  TARGET_HALF,
  TOP,
  WALL_X,
  createWorld,
  flip,
  onPlunger,
  plunge,
  step,
  type Happening,
  type World,
} from "./sim";

export const PINBALL_COLORS: [string, string] = ["#2a3cff", "#b9b3a4"];
type Keep = <R extends { dispose(): void }>(r: R) => R;
/** How tall the walls and guides stand off the playfield, in metres. */
const WALL_H = 0.025;
/**
 * The best score of this visit, shown on the backglass as HIGH (kept in memory only: nothing but settings, AI
 * preferences and gomoku results is stored).
 */
let best = 0;
/** A painted canvas texture `w` × `h`. */
function painted(w: number, h: number, paint: (pen: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, texture };
}
/** A small repeatable source of numbers, so that the print is the same each time. */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** The playfield's place (x, y in metres) on its texture of `w` × `h` pixels (its bottom edge at y = -0.06). */
const FIELD_LOW = -0.06,
  FIELD_HIGH = TOP + 0.01;
const px = (w: number, x: number) => ((x + HALF_W) / (2 * HALF_W)) * w;
const py = (h: number, y: number) => (1 - (y - FIELD_LOW) / (FIELD_HIGH - FIELD_LOW)) * h;

/**
 * The playfield's print (our own: "COMET RUN", a comet over a ringed planet among the stars): deep space, nebulae,
 * the lanes' and targets' insert rings (dark; their lit tops are separate), arrows, and the words on the apron's edge.
 */
function playfieldArt(w: number, h: number) {
  return painted(w, h, (pen) => {
    const random = sequence(17),
      sky = pen.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#090a2e");
    sky.addColorStop(0.55, "#16114a");
    sky.addColorStop(1, "#0a1a3a");
    pen.fillStyle = sky;
    pen.fillRect(0, 0, w, h);
    // Nebulae: soft coloured clouds.
    for (const [x, y, r, c] of [
      [0.25, 0.3, 0.45, "rgba(255,70,160,0.22)"],
      [0.8, 0.55, 0.4, "rgba(60,180,255,0.2)"],
      [0.4, 0.78, 0.35, "rgba(140,80,255,0.2)"],
    ] as const) {
      const g = pen.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
      g.addColorStop(0, c);
      g.addColorStop(1, "rgba(0,0,0,0)");
      pen.fillStyle = g;
      pen.fillRect(0, 0, w, h);
    }
    for (let k = 0; k < 420; k++) {
      pen.fillStyle = `rgba(255,255,255,${0.3 + random() * 0.7})`;
      const s = random() < 0.08 ? 2.6 : 1.3;
      pen.fillRect(random() * w, random() * h, s, s);
    }
    // A ringed planet low on the field, and the comet streaking up toward the bumpers.
    const cx = px(w, -0.02),
      cy = py(h, 0.4),
      planet = pen.createRadialGradient(cx - 30, cy - 30, 8, cx, cy, 96);
    planet.addColorStop(0, "#ffb36b");
    planet.addColorStop(1, "#7a2a5a");
    pen.fillStyle = planet;
    pen.beginPath();
    pen.arc(cx, cy, 86, 0, Math.PI * 2);
    pen.fill();
    pen.strokeStyle = "rgba(255,220,160,0.75)";
    pen.lineWidth = 10;
    pen.beginPath();
    pen.ellipse(cx, cy, 150, 36, -0.25, 0, Math.PI * 2);
    pen.stroke();
    const tail = pen.createLinearGradient(px(w, -0.18), py(h, 0.48), px(w, 0.05), py(h, 0.78));
    tail.addColorStop(0, "rgba(120,220,255,0)");
    tail.addColorStop(1, "rgba(180,240,255,0.9)");
    pen.strokeStyle = tail;
    pen.lineCap = "round";
    pen.lineWidth = 34;
    pen.beginPath();
    pen.moveTo(px(w, -0.18), py(h, 0.48));
    pen.quadraticCurveTo(px(w, -0.05), py(h, 0.62), px(w, 0.05), py(h, 0.78));
    pen.stroke();
    // The title across the field below the bumpers.
    pen.save();
    pen.translate(px(w, 0), py(h, 0.495));
    pen.font = '900 80px "Inter", "Noto Sans KR", sans-serif';
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineWidth = 14;
    pen.strokeStyle = "#0a0830";
    pen.strokeText("COMET RUN", 0, 0);
    const letters = pen.createLinearGradient(-260, 0, 260, 0);
    letters.addColorStop(0, "#ffd84a");
    letters.addColorStop(1, "#ff5ab0");
    pen.fillStyle = letters;
    pen.fillText("COMET RUN", 0, 0);
    pen.restore();
    // Dark insert rings where the lit inserts sit, and arrows toward the shots.
    const ring = (x: number, y: number, r: number) => {
      pen.strokeStyle = "rgba(255,255,255,0.55)";
      pen.lineWidth = 5;
      pen.beginPath();
      pen.arc(px(w, x), py(h, y), (r / (2 * HALF_W)) * w, 0, Math.PI * 2);
      pen.stroke();
    };
    LANES.forEach((x) => ring(x, 0.875, 0.012));
    for (let m = 0; m < MULTIPLIER_MOST - 1; m++) ring(-0.054 + m * 0.036, 0.215, 0.012);
    ring(0, 0.075, 0.014);
    // Arrows toward the bank and the spinner's orbit.
    const arrow = (x: number, y: number, turn: number, colour: string) => {
      pen.save();
      pen.translate(px(w, x), py(h, y));
      pen.rotate(turn);
      pen.fillStyle = colour;
      pen.beginPath();
      pen.moveTo(0, -34);
      pen.lineTo(22, 12);
      pen.lineTo(0, 2);
      pen.lineTo(-22, 12);
      pen.closePath();
      pen.fill();
      pen.restore();
    };
    arrow(-0.12, 0.62, -0.62, "rgba(255,120,60,0.55)");
    arrow(0.2, 0.5, 0.05, "rgba(80,220,255,0.55)");
    pen.font = '800 26px "Inter", "Noto Sans KR", sans-serif';
    pen.fillStyle = "rgba(255,255,255,0.8)";
    pen.textAlign = "center";
    pen.fillText("SHOOT AGAIN", px(w, 0), py(h, 0.035));
    pen.fillText("× BONUS", px(w, 0), py(h, 0.185));
  });
}

/**
 * Pinball (핀볼): a table of our own in an arcade at night, seen from where the player stands at its front, looking
 * up the slanted playfield to the backbox. The view plays the table in real time (see `sim.ts`) and reports what
 * happens as moves; the screen keeps the score.
 */
export class PinballView extends TableView<State> {
  private world: World;
  private field = new T.Group();
  private ball: T.Mesh;
  private flippers: T.Group[] = [];
  private bumpers: T.MeshStandardMaterial[] = [];
  private slings: T.MeshStandardMaterial[] = [];
  private lanesLit: T.MeshStandardMaterial[] = [];
  private multLit: T.MeshStandardMaterial[] = [];
  private againLit: T.MeshStandardMaterial;
  private targets: T.Mesh[] = [];
  private spinner = new T.Group();
  private plunger = new T.Group();
  private glass: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private words: { sprite: T.Sprite; at: number; x: number; y: number }[] = [];
  private paused = false;
  private shown = 0;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  /** Which pointer holds what: a flipper (0 the left, 1 the right) or the plunger (with where it was pressed). */
  private holds = new Map<number, { what: 0 | 1 | "plunger"; y: number }>();
  private keys = { left: false, right: false, plunger: false };
  /** The sounds of the table's parts (set by the screen from the game's `knock`). */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#07061a");
    this.world = createWorld(Math.floor(cryptoRandom() * 2e9));
    const keep: Keep = (r) => this.own(r);
    this.lights();
    this.room(keep);
    this.scene.add(this.field);
    this.field.rotation.x = SLOPE;
    this.cabinet(keep);
    this.walls(keep);
    this.toys(keep);
    this.glass = this.backbox(keep);
    this.againLit = this.insert(keep, 0, 0.075, 0.014, "#ff4a4a");
    this.ball = new T.Mesh(keep(new T.SphereGeometry(BALL_R * SCALE, 28, 20)), keep(new T.MeshStandardMaterial({ color: "#f4f6fa", metalness: 0.55, roughness: 0.18, emissive: "#4a4e5c", emissiveIntensity: 0.6 })));
    this.ball.castShadow = true;
    this.field.add(this.ball);
    this.controls();
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  private lights() {
    this.scene.add(new T.HemisphereLight("#b8c4ff", "#2a1838", 1.5));
    const lamp = new T.DirectionalLight("#fff4e6", 2.2);
    lamp.position.set(2, 14, 6);
    lamp.target.position.set(0, 0, -2);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    const cam = lamp.shadow.camera;
    cam.left = cam.bottom = -7;
    cam.right = cam.top = 7;
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
  }
  /** An arcade at night round the table: a dark floor, a back wall with neon tubes, cabinets' glow in the dark. */
  private room(keep: Keep) {
    const floor = new T.Mesh(keep(new T.PlaneGeometry(60, 60)), keep(new T.MeshStandardMaterial({ color: "#1a1430", roughness: 0.9 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -8;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const wall = new T.Mesh(keep(new T.PlaneGeometry(60, 30)), keep(new T.MeshStandardMaterial({ color: "#120e26", roughness: 0.95 })));
    wall.position.set(0, 4, -16);
    this.scene.add(wall);
    const tube = keep(new T.CylinderGeometry(0.08, 0.08, 1, 10));
    for (const [x, y, len, colour, turn] of [
      [-9, 6, 8, "#ff3aa8", Math.PI / 2],
      [9, 6.6, 7, "#3ad8ff", Math.PI / 2],
      [-13, 2, 6, "#ffd23a", 0],
      [13, 1.5, 6, "#7a5aff", 0],
    ] as const) {
      const neon = new T.Mesh(tube, keep(new T.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 2.2 })));
      neon.scale.y = len;
      neon.rotation.z = turn;
      neon.position.set(x, y, -15.8);
      this.scene.add(neon);
    }
    // Other machines' cabinets dark at the sides, their screens aglow.
    const box = keep(new T.BoxGeometry(3.2, 9, 3));
    for (const [x, colour] of [
      [-10, "#2a6aff"],
      [10, "#ff5a3a"],
    ] as const) {
      const cab = new T.Mesh(box, keep(new T.MeshStandardMaterial({ color: "#151226", roughness: 0.7 })));
      cab.position.set(x, -3.5, -9);
      this.scene.add(cab);
      const screen = new T.Mesh(keep(new T.PlaneGeometry(2.4, 1.8)), keep(new T.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 1.4 })));
      screen.position.set(x, -0.2, -7.48);
      this.scene.add(screen);
    }
  }
  /** The cabinet: the playfield and its print, the side rails, the apron and lockdown bar, the legs. */
  private cabinet(keep: Keep) {
    const length = FIELD_HIGH - FIELD_LOW,
      art = playfieldArt(1024, Math.round((1024 * length) / (2 * HALF_W)));
    keep(art.texture);
    const deck = new T.Mesh(keep(new T.PlaneGeometry(2 * HALF_W * SCALE, length * SCALE)), keep(new T.MeshStandardMaterial({ map: art.texture, roughness: 0.35, metalness: 0.05 })));
    deck.rotation.x = -Math.PI / 2;
    const mid = toScene(0, (FIELD_LOW + FIELD_HIGH) / 2);
    deck.position.set(mid.x, -0.001, mid.z);
    deck.receiveShadow = true;
    this.field.add(deck);
    // The body under the playfield, its painted sides and the rails on top of them.
    const body = keep(glossy({ color: "#1b1f7a", roughness: 0.35 }, 0.6)),
      rail = keep(new T.MeshStandardMaterial({ color: "#c9ccd6", metalness: 0.9, roughness: 0.25 })),
      side = keep(new T.BoxGeometry(0.03 * SCALE, 0.12 * SCALE, (length + 0.12) * SCALE));
    for (const s of [-1, 1]) {
      const wall = new T.Mesh(side, body);
      wall.position.set(s * (HALF_W + 0.015) * SCALE, -0.03 * SCALE, mid.z - 0.03 * SCALE);
      wall.castShadow = wall.receiveShadow = true;
      this.field.add(wall);
      const top = new T.Mesh(keep(new T.BoxGeometry(0.036 * SCALE, 0.012 * SCALE, (length + 0.12) * SCALE)), rail);
      top.position.set(s * (HALF_W + 0.015) * SCALE, 0.034 * SCALE, mid.z - 0.03 * SCALE);
      this.field.add(top);
    }
    const under = new T.Mesh(keep(new T.BoxGeometry(2 * (HALF_W + 0.03) * SCALE, 0.1 * SCALE, (length + 0.12) * SCALE)), body);
    under.position.set(0, -0.06 * SCALE, mid.z - 0.03 * SCALE);
    this.field.add(under);
    // The apron across the front, under the flippers, and the lockdown bar over its edge.
    const apron = new T.Mesh(keep(new T.BoxGeometry(2 * HALF_W * SCALE, 0.02 * SCALE, 0.07 * SCALE)), keep(glossy({ color: "#e8e4f0", roughness: 0.4 }, 0.5)));
    const front = toScene(0, FIELD_LOW + 0.035);
    apron.position.set(0, 0.01 * SCALE, front.z);
    this.field.add(apron);
    const bar = new T.Mesh(keep(new T.BoxGeometry(2 * (HALF_W + 0.03) * SCALE, 0.03 * SCALE, 0.05 * SCALE)), rail);
    bar.position.set(0, 0.03 * SCALE, toScene(0, FIELD_LOW - 0.02).z);
    this.field.add(bar);
    // Legs to the floor.
    const leg = keep(new T.BoxGeometry(0.4, 9, 0.4));
    for (const [x, y] of [
      [-1, FIELD_LOW],
      [1, FIELD_LOW],
      [-1, TOP - 0.05],
      [1, TOP - 0.05],
    ]) {
      const at = toScene(x * (HALF_W + 0.01), y),
        stand = new T.Mesh(leg, rail);
      stand.position.set(at.x, -4.5, at.z);
      stand.castShadow = true;
      this.field.add(stand);
    }
  }
  /** A box standing on the playfield from (ax, ay) to (bx, by) (metres), `r` thick and `height` tall. */
  private piece(keep: Keep, ax: number, ay: number, bx: number, by: number, r: number, height: number, material: T.Material) {
    const a = toScene(ax, ay),
      b = toScene(bx, by),
      len = Math.hypot(b.x - a.x, b.z - a.z),
      mesh = new T.Mesh(keep(new T.BoxGeometry(len + r * 2 * SCALE, height * SCALE, r * 2 * SCALE)), material);
    mesh.position.set((a.x + b.x) / 2, (height * SCALE) / 2, (a.z + b.z) / 2);
    mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    mesh.castShadow = mesh.receiveShadow = true;
    this.field.add(mesh);
    return mesh;
  }
  /** A post (a cylinder) standing at (x, y) of radius `r` (metres). */
  private post(keep: Keep, x: number, y: number, r: number, height: number, material: T.Material) {
    const at = toScene(x, y),
      mesh = new T.Mesh(keep(new T.CylinderGeometry(r * SCALE, r * SCALE, height * SCALE, 20)), material);
    mesh.position.set(at.x, (height * SCALE) / 2, at.z);
    mesh.castShadow = true;
    this.field.add(mesh);
    return mesh;
  }
  /** A lit insert in the playfield at (x, y): dark until lit. */
  private insert(keep: Keep, x: number, y: number, r: number, colour: string) {
    const material = keep(new T.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0, transparent: true, opacity: 0.85, roughness: 0.3 })),
      disc = new T.Mesh(keep(new T.CircleGeometry(r * SCALE, 24)), material),
      at = toScene(x, y);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(at.x, 0.003, at.z);
    this.field.add(disc);
    return material;
  }
  /** The walls, guides, slingshots and posts, as the sim lays them. */
  private walls(keep: Keep) {
    const plastic = keep(glossy({ color: "#2a3cff", roughness: 0.3 }, 0.6)),
      chrome = keep(new T.MeshStandardMaterial({ color: "#d8dce6", metalness: 1, roughness: 0.18 })),
      rubber = keep(new T.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.6 })),
      gold = keep(new T.MeshStandardMaterial({ color: "#ffcf4a", metalness: 0.8, roughness: 0.3 }));
    for (const s of this.world.segments) {
      if (s.kind === "target") continue;
      const outer = s.r >= 0.004 && (Math.abs(s.ax) >= WALL_X - 0.001 || s.ay >= ARCH.y - 0.001) && s.kind === "wall" && !(s.ay > 0.4 && s.ay < 0.6 && Math.abs(s.ax) < 0.2);
      if (s.kind === "gate") {
        this.piece(keep, s.ax, s.ay, s.bx, s.by, 0.0015, 0.012, chrome);
        continue;
      }
      const material = s.kind === "sling" ? rubber : outer ? plastic : chrome;
      this.piece(keep, s.ax, s.ay, s.bx, s.by, s.kind === "sling" ? 0.004 : s.r, outer ? WALL_H * 1.4 : WALL_H, material);
    }
    for (const c of this.world.circles) if (c.kind === "post") this.post(keep, c.x, c.y, c.r, WALL_H * 1.1, c.r > 0.0065 ? gold : rubber);
    // The slingshots' plastic covers, lit when they fire.
    for (const s of [-1, 1]) {
      const shape = new T.Shape([new T.Vector2(s * SLING.back, SLING.top), new T.Vector2(s * SLING.back, SLING.low), new T.Vector2(s * SLING.inner, SLING.foot)].map((p) => new T.Vector2(p.x * SCALE, p.y * SCALE)));
      const geometry = keep(new T.ExtrudeGeometry(shape, { depth: WALL_H * SCALE * 0.9, bevelEnabled: false })).rotateX(-Math.PI / 2),
        material = keep(new T.MeshStandardMaterial({ color: s < 0 ? "#ff5ab0" : "#3ad8ff", emissive: s < 0 ? "#ff5ab0" : "#3ad8ff", emissiveIntensity: 0.3, transparent: true, opacity: 0.85, roughness: 0.25 })),
        cover = new T.Mesh(geometry, material);
      cover.position.set(0, 0, toScene(0, 0).z);
      cover.castShadow = true;
      this.field.add(cover);
      this.slings[s < 0 ? 0 : 1] = material;
    }
  }
  /** The flippers, bumpers, lanes' lights, drop targets, spinner and plunger. */
  private toys(keep: Keep) {
    // Flippers: a tapered blade (wide at its pivot), white with a red rubber, turned about its pivot.
    const blade = new T.Shape(),
      L = FLIPPER.length * SCALE,
      rb = FLIPPER.base * SCALE,
      rt = FLIPPER.tip * SCALE;
    blade.absarc(0, 0, rb, Math.PI / 2, (3 * Math.PI) / 2, false);
    blade.lineTo(L, -rt);
    blade.absarc(L, 0, rt, -Math.PI / 2, Math.PI / 2, false);
    blade.lineTo(0, rb);
    const shape = keep(new T.ExtrudeGeometry(blade, { depth: WALL_H * SCALE, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 })).rotateX(-Math.PI / 2),
      white = keep(glossy({ color: "#f6f4ee", roughness: 0.3 }, 0.6)),
      band = keep(new T.MeshStandardMaterial({ color: "#d8282e", roughness: 0.55 })),
      ring = keep(new T.ExtrudeGeometry(blade, { depth: WALL_H * SCALE * 0.4, bevelEnabled: false })).rotateX(-Math.PI / 2).scale(1.06, 1, 1.18);
    for (const f of this.world.flippers) {
      const pivot = new T.Group(),
        at = toScene(f.px, f.py),
        body = new T.Mesh(shape, white),
        rubber = new T.Mesh(ring, band);
      rubber.position.set(-0.01, WALL_H * SCALE * 0.3, 0);
      body.castShadow = rubber.castShadow = true;
      pivot.add(body, rubber);
      pivot.position.set(at.x, 0.002, at.z);
      this.field.add(pivot);
      this.flippers.push(pivot);
    }
    // Pop bumpers: a dark base, a white skirt and a coloured cap that flashes.
    const base = keep(new T.CylinderGeometry(BUMPER_R * SCALE * 1.05, BUMPER_R * SCALE * 1.1, WALL_H * SCALE * 0.6, 28)),
      skirt = keep(new T.CylinderGeometry(BUMPER_R * SCALE * 1.18, BUMPER_R * SCALE * 1.18, 0.02, 28)),
      cap = keep(new T.CylinderGeometry(BUMPER_R * SCALE * 0.95, BUMPER_R * SCALE * 0.8, WALL_H * SCALE * 0.7, 28)),
      dark = keep(new T.MeshStandardMaterial({ color: "#202030", roughness: 0.5 })),
      whiteSkirt = keep(new T.MeshStandardMaterial({ color: "#f0f0f0", roughness: 0.4 }));
    BUMPERS.forEach(([x, y], i) => {
      const at = toScene(x, y),
        colour = ["#ff3a5a", "#ffcf3a", "#3ad8ff"][i],
        paint = keep(new T.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.4, roughness: 0.25 })),
        a = new T.Mesh(base, dark),
        b = new T.Mesh(skirt, whiteSkirt),
        c = new T.Mesh(cap, paint);
      a.position.set(at.x, (WALL_H * SCALE * 0.6) / 2, at.z);
      b.position.set(at.x, WALL_H * SCALE * 0.62, at.z);
      c.position.set(at.x, WALL_H * SCALE * 0.62 + (WALL_H * SCALE * 0.7) / 2, at.z);
      for (const m of [a, b, c]) {
        m.castShadow = true;
        this.field.add(m);
      }
      this.bumpers.push(paint);
    });
    // The lanes' lights at the top, and the bonus multiplier's lights.
    LANES.forEach((x) => this.lanesLit.push(this.insert(keep, x, 0.875, 0.012, "#7aff6a")));
    for (let m = 0; m < MULTIPLIER_MOST - 1; m++) this.multLit.push(this.insert(keep, -0.054 + m * 0.036, 0.215, 0.012, "#ffb23a"));
    // Drop targets along the bank: orange faces that drop into the playfield.
    const along = Math.atan2(BANK.by - BANK.ay, BANK.bx - BANK.ax),
      face = keep(new T.BoxGeometry(TARGET_HALF * 2 * SCALE, WALL_H * SCALE * 1.1, 0.006 * SCALE)),
      orange = keep(glossy({ color: "#ff7a2a", emissive: "#ff5a10", emissiveIntensity: 0.25, roughness: 0.3 }, 0.5));
    for (const [x, y] of TARGETS) {
      const at = toScene(x, y),
        t = new T.Mesh(face, orange);
      t.position.set(at.x, (WALL_H * SCALE * 1.1) / 2, at.z);
      t.rotation.y = along;
      t.castShadow = true;
      this.field.add(t);
      this.targets.push(t);
    }
    // The spinner: a bright plate on a wire across the right orbit, turning as the ball goes through.
    const plate = new T.Mesh(keep(new T.BoxGeometry((SPINNER.x1 - SPINNER.x0 - 0.006) * SCALE, 0.016 * SCALE, 0.003 * SCALE)), keep(new T.MeshStandardMaterial({ color: "#e8eef8", metalness: 0.9, roughness: 0.2 })));
    plate.position.y = -0.009 * SCALE;
    this.spinner.add(plate);
    const s = toScene((SPINNER.x0 + SPINNER.x1) / 2, SPINNER.y);
    this.spinner.position.set(s.x, 0.022 * SCALE, s.z);
    this.field.add(this.spinner);
    const wire = this.piece(keep, SPINNER.x0, SPINNER.y, SPINNER.x1, SPINNER.y, 0.0012, 0.001, keep(new T.MeshStandardMaterial({ color: "#c0c4cc", metalness: 1, roughness: 0.3 })));
    wire.position.y = 0.022 * SCALE;
    // The plunger: a rod in its lane with a spring, and its red knob out past the front of the cabinet.
    const rod = new T.Mesh(keep(new T.CylinderGeometry(0.004 * SCALE, 0.004 * SCALE, 0.14 * SCALE, 12).rotateX(Math.PI / 2)), keep(new T.MeshStandardMaterial({ color: "#d0d4dc", metalness: 1, roughness: 0.2 })));
    rod.position.z = 0.07 * SCALE;
    const tip = new T.Mesh(keep(new T.CylinderGeometry(0.009 * SCALE, 0.009 * SCALE, 0.012 * SCALE, 16).rotateX(Math.PI / 2)), keep(new T.MeshStandardMaterial({ color: "#2a2a30", roughness: 0.6 })));
    const knob = new T.Mesh(keep(new T.SphereGeometry(0.02 * SCALE, 20, 14)), keep(glossy({ color: "#e8282e", roughness: 0.25 }, 0.8)));
    knob.position.z = 0.16 * SCALE;
    knob.scale.set(1, 1, 0.8);
    this.plunger.add(rod, tip, knob);
    const p = toScene(LANE_X, PLUNGER_Y);
    this.plunger.position.set(p.x, BALL_R * SCALE, p.z);
    this.field.add(this.plunger);
  }
  /** The backbox at the head of the table: its lit glass shows the theme and the score. */
  private backbox(keep: Keep) {
    const { canvas, texture } = painted(1024, 640, () => {});
    keep(texture);
    const head = toScene(0, TOP + 0.04),
      box = new T.Group();
    const cab = new T.Mesh(keep(new T.BoxGeometry(2 * (HALF_W + 0.03) * SCALE, 0.42 * SCALE, 0.12 * SCALE)), keep(glossy({ color: "#1b1f7a", roughness: 0.35 }, 0.6)));
    cab.position.y = 0.21 * SCALE;
    cab.castShadow = true;
    const glassMesh = new T.Mesh(keep(new T.PlaneGeometry(2 * HALF_W * SCALE * 0.94, 0.36 * SCALE)), keep(new T.MeshStandardMaterial({ map: texture, emissive: "#ffffff", emissiveMap: texture, emissiveIntensity: 0.9, roughness: 0.2 })));
    glassMesh.position.set(0, 0.21 * SCALE, 0.061 * SCALE);
    box.add(cab, glassMesh);
    // Standing upright whatever the playfield's slope.
    box.rotation.x = -SLOPE;
    box.position.set(0, 0, head.z - 0.06 * SCALE);
    this.field.add(box);
    return { canvas, texture, said: "" };
  }
  /** Paints the backglass: the title over the planet, then the score, the ball, the best score and the multiplier. */
  private paintGlass(state: State) {
    const said = `${state.score}|${state.ball}|${state.winner}|${best}|${this.world.multiplier}`;
    if (said === this.glass.said) return;
    this.glass.said = said;
    const pen = this.glass.canvas.getContext("2d")!,
      W = 1024,
      H = 640,
      sky = pen.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#1a0a4a");
    sky.addColorStop(1, "#0a1a46");
    pen.fillStyle = sky;
    pen.fillRect(0, 0, W, H);
    const random = sequence(5);
    for (let k = 0; k < 160; k++) {
      pen.fillStyle = `rgba(255,255,255,${0.4 + random() * 0.6})`;
      pen.fillRect(random() * W, random() * H * 0.6, 2, 2);
    }
    const planet = pen.createRadialGradient(820, 150, 10, 860, 190, 140);
    planet.addColorStop(0, "#ffb36b");
    planet.addColorStop(1, "#7a2a5a");
    pen.fillStyle = planet;
    pen.beginPath();
    pen.arc(860, 190, 120, 0, Math.PI * 2);
    pen.fill();
    const tail = pen.createLinearGradient(80, 250, 520, 60);
    tail.addColorStop(0, "rgba(120,220,255,0)");
    tail.addColorStop(1, "rgba(200,245,255,1)");
    pen.strokeStyle = tail;
    pen.lineWidth = 30;
    pen.lineCap = "round";
    pen.beginPath();
    pen.moveTo(80, 250);
    pen.lineTo(520, 60);
    pen.stroke();
    pen.font = '900 120px "Inter", "Noto Sans KR", sans-serif';
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineWidth = 18;
    pen.strokeStyle = "#0a0830";
    pen.strokeText("COMET RUN", W / 2, 140);
    const letters = pen.createLinearGradient(200, 0, 820, 0);
    letters.addColorStop(0, "#ffd84a");
    letters.addColorStop(1, "#ff5ab0");
    pen.fillStyle = letters;
    pen.fillText("COMET RUN", W / 2, 140);
    // The score panel: dot-matrix orange on black.
    pen.fillStyle = "#0b0a10";
    pen.fillRect(60, 300, W - 120, 300);
    pen.fillStyle = "rgba(255,120,40,0.07)";
    for (let x = 68; x < W - 68; x += 12) for (let y = 308; y < 592; y += 12) pen.fillRect(x, y, 5, 5);
    pen.shadowColor = "#ff6a1a";
    pen.shadowBlur = 22;
    pen.fillStyle = "#ff8a2a";
    pen.font = '900 128px "Courier New", monospace';
    pen.fillText(state.score.toLocaleString("en-US"), W / 2, 410);
    pen.font = '800 46px "Inter", "Noto Sans KR", sans-serif';
    pen.textAlign = "left";
    pen.fillText(state.winner !== null ? "GAME OVER" : `BALL ${state.ball}/${BALLS}`, 100, 540);
    pen.textAlign = "right";
    pen.fillText(`HIGH ${Math.max(best, state.score).toLocaleString("en-US")}`, W - 100, 540);
    pen.shadowBlur = 0;
    this.glass.texture.needsUpdate = true;
  }
  /** The controls: flippers by the halves of the screen (both at once), the plunger by its knob, and the keys. */
  private controls() {
    const el = this.renderer.domElement;
    // Two fingers on the flippers must not zoom the table.
    noZoom(el);
    el.addEventListener("pointerdown", (e) => {
      if (this.disposed || (e.pointerType === "mouse" && e.button !== 0)) return;
      const box = el.getBoundingClientRect(),
        x = (e.clientX - box.left) / box.width,
        y = (e.clientY - box.top) / box.height,
        // The plunger: a press on its knob (the lower right) while the ball waits on it.
        knob = this.knobOnScreen(),
        onKnob = onPlunger(this.world) && Math.hypot((x - knob.x) * (box.width / box.height), y - knob.y) < 0.16;
      const what = onKnob ? "plunger" : x < 0.5 ? 0 : 1;
      this.holds.set(e.pointerId, { what, y });
      this.press();
    });
    el.addEventListener("pointermove", (e) => {
      const hold = this.holds.get(e.pointerId);
      if (!hold || hold.what !== "plunger") return;
      const box = el.getBoundingClientRect(),
        y = (e.clientY - box.top) / box.height;
      this.world.plunger.drag = Math.max(0, Math.min(1, (y - hold.y) / 0.22));
    });
    const lift = (e: PointerEvent) => {
      if (!this.holds.delete(e.pointerId)) return;
      this.press();
    };
    el.addEventListener("pointerup", lift);
    el.addEventListener("pointercancel", lift);
    const KEYS: Record<string, "left" | "right" | "plunger"> = { z: "left", Z: "left", ㅋ: "left", ArrowLeft: "left", "/": "right", "?": "right", ArrowRight: "right", " ": "plunger", ArrowDown: "plunger", Enter: "plunger" };
    const key = (down: boolean) => (e: KeyboardEvent) => {
      const which = KEYS[e.key];
      if (!which || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      this.keys[which] = down;
      this.press();
    };
    el.addEventListener("keydown", key(true));
    el.addEventListener("keyup", key(false));
  }
  /** What the pointers and keys hold now, given to the table. */
  private press() {
    if (!this.running()) {
      this.world.flippers.forEach((_, side) => flip(this.world, side as 0 | 1, false));
      return;
    }
    const holds = [...this.holds.values()],
      left = this.keys.left || holds.some((h) => h.what === 0),
      right = this.keys.right || holds.some((h) => h.what === 1),
      pulling = this.keys.plunger || holds.some((h) => h.what === "plunger");
    flip(this.world, 0, left);
    flip(this.world, 1, right);
    if (pulling !== this.world.plunger.held) this.report(plunge(this.world, pulling));
  }
  /** Where the plunger's knob is on the screen (shares of the canvas, from its top left). */
  private knobOnScreen() {
    this.field.updateMatrixWorld(true);
    const p = this.plunger.localToWorld(new T.Vector3(0, 0, 0.16 * SCALE)).project(this.camera);
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
  }
  protected subject() {
    return PINBALL_SUBJECT;
  }
  /** The camera stands at the table's front where the player would, looking up the playfield: placed to show it all. */
  protected resize() {
    super.resize();
    const aspect = this.camera.aspect,
      // A wide screen (a phone held sideways) looks along the table more, as a player does, so that the long table
      // is foreshortened into its short height; there the backbox may go off the top (the score is also over the table).
      wide = aspect > 1.8,
      pitch = wide ? 0.66 : aspect > 1.3 ? 0.8 : 0.98,
      look = new T.Vector3(),
      corners = [
        [-HALF_W - 0.03, FIELD_LOW - 0.03],
        [HALF_W + 0.03, FIELD_LOW - 0.03],
        [-HALF_W - 0.03, TOP + 0.06],
        [HALF_W + 0.03, TOP + 0.06],
      ].map(([x, y]) => {
        const p = toScene(x, y);
        return new T.Vector3(p.x, 0, p.z).applyEuler(this.field.rotation);
      });
    // The backglass's top too, but on a wide screen only its score panel.
    const head = toScene(0, TOP + 0.04);
    corners.push(new T.Vector3(0, (wide ? 0.2 : 0.42) * SCALE * Math.cos(SLOPE), head.z).applyEuler(new T.Euler(SLOPE, 0, 0)));
    const fits = (distance: number, lift: number) => {
      look.set(0, lift, toScene(0, 0.42).z * Math.cos(SLOPE));
      this.camera.position.set(0, look.y + Math.sin(pitch) * distance, look.z + Math.cos(pitch) * distance);
      this.camera.lookAt(look);
      this.camera.updateMatrixWorld();
      let top = -Infinity,
        bottom = Infinity,
        side = 0;
      for (const c of corners) {
        const p = c.clone().project(this.camera);
        top = Math.max(top, p.y);
        bottom = Math.min(bottom, p.y);
        side = Math.max(side, Math.abs(p.x));
      }
      return { top, bottom, side };
    };
    let lift = 0;
    for (let round = 0; round < 3; round++) {
      let lo = 2,
        hi = 60;
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2,
          f = fits(mid, lift);
        if (f.top > 0.9 || f.bottom < -0.94 || f.side > 0.96) lo = mid;
        else hi = mid;
      }
      const f = fits(hi, lift);
      // Centred up and down between the margins.
      lift += ((f.top + f.bottom) / 2 - -0.02) * 2.5;
    }
    let lo = 2,
      hi = 60;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2,
        f = fits(mid, lift);
      if (f.top > 0.9 || f.bottom < -0.94 || f.side > 0.96) lo = mid;
      else hi = mid;
    }
    fits(hi, lift);
    this.dirty = true;
  }
  /** Nothing on the table is chosen by a tap: every press is a flipper's or the plunger's (see `controls`). */
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
  /** Tells the screen what happened on the table, with words over it and the sounds of its parts. */
  private report(events: Happening[]) {
    const now = performance.now(),
      knock = (kind: string, strength: number) => this.onKnock?.(kind, strength),
      move = (to: number) => this.onMove({ from: -1, to, extra: -1 });
    for (const e of events) {
      if (e.kind === "launch") {
        knock("plunger", 0.4 + e.strength * 0.6);
        move(LAUNCH);
      } else if (e.kind === "save") {
        this.say("볼 세이브!", "#7affd0", 0, 0.12, now);
        knock("save", 1);
        move(SAVE);
      } else if (e.kind === "drain") {
        knock("drain", 1);
        if (e.bonus > 0) {
          this.say(`보너스 ${e.bonus.toLocaleString("ko-KR")}${e.multiplier > 1 ? ` (×${e.multiplier})` : ""}`, "#ffd84a", 0, 0.3, now);
          this.onMove(scoreMove(e.bonus));
        }
        move(DRAIN);
      } else {
        knock(e.what, e.strength);
        if (e.points > 0) {
          if (e.what === "bank") this.say(`타깃 완성 +${e.points}`, "#ff9a4a", e.x, e.y + 0.05, now);
          else if (e.what === "laneSet") this.say(`보너스 ×${this.world.multiplier}`, "#7aff6a", 0, 0.82, now);
          else if (e.what !== "sling") this.say(`+${e.points}`, "#ffffff", e.x, e.y + 0.03, now);
          this.onMove(scoreMove(e.points));
        }
      }
      if (this.state?.winner !== null) break;
    }
  }
  /** A word that rises from a place on the playfield and fades. */
  private say(text: string, colour: string, x: number, y: number, now: number) {
    if (capturing()) return;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const pen = canvas.getContext("2d")!;
    pen.font = '900 72px "Inter", "Noto Sans KR", sans-serif';
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineJoin = "round";
    pen.lineWidth = 14;
    pen.strokeStyle = "rgba(10, 6, 40, 0.9)";
    pen.strokeText(text, 256, 66);
    pen.fillStyle = colour;
    pen.fillText(text, 256, 66);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(1.6, 0.4, 1);
    sprite.renderOrder = 20;
    this.field.add(sprite);
    this.words.push({ sprite, at: now, x, y });
  }
  private advance(now: number) {
    const real = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.running()) {
      this.left += real;
      while (this.left >= DT && this.state?.winner === null) {
        this.left -= DT;
        this.report(step(this.world));
      }
    } else this.left = 0;
    this.pose(now);
    this.redraw();
  }
  /** Puts everything where the table has it: ball, flippers, lights, targets, spinner, plunger, words. */
  private pose(now: number) {
    const w = this.world,
      t = w.time,
      ball = toScene(w.ball.x, w.ball.y);
    this.ball.position.set(ball.x, BALL_R * SCALE, ball.z);
    this.ball.visible = this.state?.winner === null || !onPlunger(w);
    w.flippers.forEach((f, i) => (this.flippers[i].rotation.y = f.side > 0 ? f.angle : Math.PI - f.angle));
    const flash = (since: number, span = 0.18) => (since < span ? 1 - since / span : 0);
    w.lit.bumper.forEach((at, i) => (this.bumpers[i].emissiveIntensity = 0.4 + 2.6 * flash(t - at)));
    w.lit.sling.forEach((at, i) => (this.slings[i].emissiveIntensity = 0.3 + 2.4 * flash(t - at)));
    w.lanes.forEach((on, i) => (this.lanesLit[i].emissiveIntensity = on ? 1.6 : 0.15 + 2 * flash(t - w.lit.lane[i], 0.4)));
    this.multLit.forEach((m, i) => (m.emissiveIntensity = w.multiplier >= i + 2 ? 1.6 : 0.1));
    // Shoot again: lit while the ball is saved, blinking.
    this.againLit.emissiveIntensity = t < w.savedUntil ? (Math.floor(now / 250) % 2 ? 1.8 : 0.4) : 0;
    this.targets.forEach((m, i) => {
      const goal = w.down[i] ? -WALL_H * SCALE * 0.6 : (WALL_H * SCALE * 1.1) / 2;
      m.position.y += (goal - m.position.y) * 0.35;
    });
    this.spinner.rotation.x = w.spin.angle;
    const pull = Math.max(w.plunger.charge, w.plunger.drag);
    this.plunger.position.z = toScene(LANE_X, PLUNGER_Y).z + (w.plunger.held ? pull * 0.03 * SCALE : 0);
    this.words = this.words.filter((word) => {
      const p = (now - word.at) / 900;
      if (p >= 1) {
        word.sprite.removeFromParent();
        (word.sprite.material as T.SpriteMaterial).map?.dispose();
        word.sprite.material.dispose();
        return false;
      }
      const at = toScene(word.x, word.y + p * 0.06);
      word.sprite.position.set(at.x, 0.5 + p * 0.4, at.z);
      (word.sprite.material as T.SpriteMaterial).opacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      return true;
    });
    if (this.state) this.paintGlass(this.state);
    const d = this.renderer.domElement.dataset;
    d.phase = this.state?.winner !== null ? "over" : onPlunger(w) ? "plunger" : "play";
    d.ball = `${w.ball.x.toFixed(3)},${w.ball.y.toFixed(3)}`;
    d.flippers = w.flippers.map((f) => (f.angle > (FLIPPER.rest + FLIPPER.up) / 2 ? 1 : 0)).join(",");
    d.charge = pull.toFixed(2);
    d.multiplier = String(w.multiplier);
    const knob = this.knobOnScreen();
    d.knob = `${knob.x.toFixed(3)},${knob.y.toFixed(3)}`;
    this.dirty = true;
  }
  protected place(state: State) {
    // A new game, known by the count of moves going back to nothing: a fresh table, the ball on the plunger.
    const anew = state.ply === 0 && this.shown > 0;
    this.shown = state.ply;
    if (anew) {
      this.world = createWorld(Math.floor(cryptoRandom() * 2e9));
      for (const word of this.words) word.sprite.removeFromParent();
      this.words = [];
      this.holds.clear();
    }
    if (state.winner !== null) best = Math.max(best, state.score);
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
