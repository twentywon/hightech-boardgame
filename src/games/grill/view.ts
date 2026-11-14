import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BEST, BURN, DONE, EAT, FLIP, LAY, TICK, type State } from "./rules";
import { BURNT, CHARRED, COAL, CUTS, DT, GOOD, OVER, PORTION, RAW, SLOTS, createWorld, down, flip, lay, shift, step, take, type Happening, type Piece, type World } from "./sim";

export const GRILL_COLORS: [string, string] = ["#c8553a", "#b9b3a4"];
/** The grate's radius, the brazier's, how far from the middle the six outer places lie, and how high the grate stands. */
const GRATE = 2.75,
  RIM = 3.4,
  REACH = 1.72,
  TOP = 0.46;
/** Where the seven places are: the middle, then six round it. */
const PLACES = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3 - Math.PI / 2) * REACH, Math.sin((i * Math.PI) / 3 - Math.PI / 2) * REACH])];
/** Where the five plates of meat stand, and my own plate. */
const PLATES = [[-6.1, -3], [-6.1, 0], [-6.1, 3], [6.1, 0.1], [6.1, 3.1]],
  MINE = [6.1, -3];
/** How each cut is shaped: its length and breadth, its thickness, and whether it is rounded. */
const SHAPES = [
  { w: 1.5, d: 0.56, tall: 0.1, round: false },
  { w: 1.3, d: 0.84, tall: 0.12, round: false },
  { w: 1.12, d: 0.86, tall: 0.05, round: true },
  { w: 1.3, d: 1.02, tall: 0.14, round: true },
  { w: 1.25, d: 0.6, tall: 0.1, round: true },
];
/** The points the table knows, kept clear of the numbers the rules use for their own moves. */
const PLACE = 300,
  PLATE = 400;
/** How finely a side's colour follows its cooking. */
const SHADES = 14;
type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * Math.max(0, Math.min(1, t)))) as Rgb,
  css = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r},${g},${b},${alpha})`,
  /** A colour as a side cooks: raw, done, then charred. */
  cooked = (raw: Rgb, ready: Rgb, done: number) => (done <= 1 ? mix(raw, ready, done) : mix(ready, [34, 24, 20], (done - 1) / (COAL - 1))),
  sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** The lean and the fat of each cut, raw and done. */
const FLESH: { lean: [Rgb, Rgb]; fat: [Rgb, Rgb] }[] = [
  { lean: [[224, 104, 110], [156, 92, 54]], fat: [[250, 234, 226], [232, 190, 122]] },
  { lean: [[150, 52, 40], [104, 56, 30]], fat: [[196, 120, 84], [150, 96, 50]] },
  { lean: [[226, 84, 88], [150, 98, 66]], fat: [[252, 240, 234], [226, 196, 150]] },
  { lean: [[214, 92, 96], [150, 90, 56]], fat: [[248, 232, 222], [228, 188, 124]] },
  { lean: [[240, 228, 204], [190, 140, 84]], fat: [[250, 244, 230], [214, 170, 110]] },
];
/** One side of a cut, painted as it looks when it is `done` so far. */
function side(cut: number, done: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const pen = canvas.getContext("2d")!,
    random = sequence(cut * 31 + 7),
    lean = css(cooked(...FLESH[cut].lean, done)),
    fat = css(cooked(...FLESH[cut].fat, done));
  pen.fillStyle = lean;
  pen.fillRect(0, 0, 128, 128);
  pen.strokeStyle = pen.fillStyle = fat;
  pen.lineCap = "round";
  if (cut === 0) {
    // Pork belly: bands of fat and lean along the strip.
    for (const y of [14, 50, 86, 118]) {
      pen.beginPath();
      pen.moveTo(0, y);
      for (let x = 0; x <= 128; x += 8) pen.lineTo(x, y + Math.sin(x * 0.09 + y) * 4);
      pen.lineWidth = 15;
      pen.stroke();
    }
  } else if (cut === 1) {
    // Marinated rib: scored across, with sesame on it.
    pen.strokeStyle = css(cooked([110, 34, 28], [70, 36, 20], done));
    pen.lineWidth = 4;
    for (let x = -100; x < 128; x += 22) {
      pen.beginPath();
      pen.moveTo(x, 0);
      pen.lineTo(x + 70, 128);
      pen.stroke();
    }
    pen.fillStyle = css(cooked([240, 226, 190], [214, 184, 130], done));
    for (let i = 0; i < 26; i++) {
      pen.beginPath();
      pen.ellipse(random() * 128, random() * 128, 3.2, 1.8, random() * 3, 0, Math.PI * 2);
      pen.fill();
    }
  } else if (cut === 2 || cut === 3) {
    // Brisket is laced with fat all through; the neck has fewer, thicker seams.
    const seams = cut === 2 ? 46 : 22;
    for (let i = 0; i < seams; i++) {
      const x = random() * 128,
        y = random() * 128,
        a = random() * Math.PI;
      pen.lineWidth = cut === 2 ? 2 + random() * 3 : 2 + random() * 4;
      pen.beginPath();
      pen.moveTo(x, y);
      pen.quadraticCurveTo(x + Math.cos(a) * 22 + (random() - 0.5) * 20, y + Math.sin(a) * 22 + (random() - 0.5) * 20, x + Math.cos(a) * 44, y + Math.sin(a) * 44);
      pen.stroke();
    }
  } else {
    // A slice of king oyster mushroom: fine fibres along it.
    pen.strokeStyle = css(cooked([222, 206, 176], [164, 116, 66], done));
    pen.lineWidth = 1.5;
    for (let y = 4; y < 128; y += 5) {
      pen.beginPath();
      pen.moveTo(0, y + random() * 3);
      pen.lineTo(128, y + random() * 3);
      pen.stroke();
    }
  }
  // The marks of the grate on a side that has been down, and char over all once it goes too far.
  if (done > 0.3) {
    pen.strokeStyle = `rgba(46,26,16,${Math.min(0.6, (done - 0.3) * 0.7)})`;
    pen.lineWidth = 6;
    for (let x = -120; x < 128; x += 30) {
      pen.beginPath();
      pen.moveTo(x, 128);
      pen.lineTo(x + 128, 0);
      pen.stroke();
    }
  }
  if (done > OVER) {
    pen.fillStyle = `rgba(24,18,16,${Math.min(0.85, ((done - OVER) / (COAL - OVER)) * 0.9)})`;
    pen.fillRect(0, 0, 128, 128);
  }
  return canvas;
}
/** A piece as it is shown: a slab or a rounded slice, with a paint for the side that lies up first, one for the side that lies down first, and one for its edge. */
interface Model {
  group: T.Group;
  slab: T.Mesh;
  slice: T.Mesh;
  upper: T.MeshStandardMaterial;
  under: T.MeshStandardMaterial;
  edge: T.MeshStandardMaterial;
}
/**
 * A grill table seen from above: a charcoal brazier let into the wood,
 * plates of raw meat on either side, my own plate, and side dishes. The
 * view plays the table in real time: a tap on a plate lays a piece, a tap
 * on a piece turns it, and a piece dragged off the grill is eaten.
 */
export class GrillView extends TableView<State> {
  private world: World = createWorld();
  private skins = new Map<number, T.CanvasTexture>();
  private pieces: Model[] = [];
  private stock: T.Mesh[][] = [];
  private puffs: T.Mesh[] = [];
  private coals!: T.MeshBasicMaterial;
  private ember!: T.PointLight;
  private words: { sprite: T.Sprite; x: number; z: number; at: number }[] = [];
  private signs = new Map<string, T.SpriteMaterial>();
  private cursorRing: T.Mesh;
  /** Where the keyboard stands: a plate (0–4) or a place (5–11), or nowhere. */
  private cursor = -1;
  /** What the pointer holds: the plate or place it went down on, where it is now, when it went down, and whether it has moved. */
  private grab: { point: number; x: number; z: number; from: { x: number; z: number }; at: number; moved: boolean } | null = null;
  private last = performance.now();
  private left = 0;
  private paused = false;
  /** How many moves the state last shown had. */
  private shown = 0;
  private ticker = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#c8a074");
    this.daylight("#fff4e6", "#8a6a48", "#ffe9c8", 9, 2.0);
    const table = this.own(wood(false, 0.7));
    table.repeat.set(3, 2);
    this.add(new T.PlaneGeometry(60, 40).rotateX(-Math.PI / 2), this.standard({ map: table, roughness: 0.72 }), 0, 0, 0).castShadow = false;
    this.brazier();
    this.crockery();
    // The pieces on the grill (and one more for a piece carried from its plate), and the pieces waiting on the plates.
    const slab = this.own(new T.BoxGeometry(1, 1, 1)),
      slice = this.own(new T.CylinderGeometry(0.5, 0.5, 1, 32));
    for (let i = 0; i <= SLOTS; i++) {
      const upper = this.standard({ map: this.skin(0, 0), roughness: 0.55 }),
        under = this.standard({ map: this.skin(0, 0), roughness: 0.55 }),
        edge = this.standard({ color: "#d06068", roughness: 0.6 }),
        group = new T.Group(),
        box = new T.Mesh(slab, [edge, edge, upper, under, edge, edge]),
        disc = new T.Mesh(slice, [edge, upper, under]);
      box.castShadow = disc.castShadow = true;
      group.add(box, disc);
      group.visible = false;
      this.scene.add(group);
      this.pieces.push({ group, slab: box, slice: disc, upper, under, edge });
    }
    CUTS.forEach((_, cut) => {
      const shape = SHAPES[cut],
        raw = this.standard({ map: this.skin(cut, 0), roughness: 0.5 }),
        edge = this.standard({ color: css(FLESH[cut].lean[0]), roughness: 0.6 });
      this.stock.push(
        Array.from({ length: PORTION }, (_, i) => {
          const mesh = new T.Mesh(shape.round ? slice : slab, shape.round ? [edge, raw, raw] : [edge, edge, raw, raw, edge, edge]);
          mesh.scale.set(shape.w, shape.tall, shape.d);
          // Laid one over the next across the plate.
          mesh.position.set(PLATES[cut][0] + (i - 2) * 0.05, 0.13 + shape.tall / 2 + i * 0.035, PLATES[cut][1] + (i - 2) * 0.33);
          mesh.rotation.set(0.07, (i % 2 ? 0.1 : -0.08) + (cut % 2 ? 0.12 : -0.1), 0);
          mesh.castShadow = mesh.receiveShadow = true;
          this.scene.add(mesh);
          return mesh;
        }),
      );
    });
    const smoke = document.createElement("canvas");
    smoke.width = smoke.height = 64;
    const pen = smoke.getContext("2d")!,
      fade = pen.createRadialGradient(32, 32, 2, 32, 32, 32);
    fade.addColorStop(0, "rgba(255,255,255,1)");
    fade.addColorStop(0.55, "rgba(255,255,255,0.7)");
    fade.addColorStop(1, "rgba(255,255,255,0)");
    pen.fillStyle = fade;
    pen.fillRect(0, 0, 64, 64);
    const haze = this.own(new T.CanvasTexture(smoke)),
      sheet = this.own(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    for (let slot = 0; slot < SLOTS; slot++) {
      for (let k = 0; k < 3; k++) {
        const puff = new T.Mesh(sheet, this.own(new T.MeshBasicMaterial({ map: haze, transparent: true, depthWrite: false, opacity: 0 })));
        puff.visible = false;
        puff.renderOrder = 6;
        this.puffs.push(puff);
        this.scene.add(puff);
      }
    }
    this.cursorRing = ringMesh(<R extends { dispose(): void }>(r: R) => this.own(r), 0.92, 1.02, "#3f8cff");
    this.scene.add(this.cursorRing);
    // The keyboard walks the plates and then the places.
    const el = this.renderer.domElement;
    el.addEventListener("keydown", (e) => {
      const all = PLATES.length + SLOTS;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") this.cursor = (this.cursor + 1) % all;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") this.cursor = (Math.max(0, this.cursor) + all - 1) % all;
      else if (this.cursor < 0 || !this.running()) return;
      else if (e.key === "Enter") this.report(this.cursor < PLATES.length ? lay(this.world, this.cursor) : flip(this.world, this.cursor - PLATES.length));
      else if ((e.key === " " || e.key === "e" || e.key === "E" || e.key === "ㄷ") && this.cursor >= PLATES.length) this.report(take(this.world, this.cursor - PLATES.length));
      else return;
      e.preventDefault();
    });
    el.addEventListener("blur", () => (this.cursor = -1));
    this.pose(performance.now());
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The brazier: an iron collar, a bed of coals that glows most in the middle, and a wire grate over it. */
  private brazier() {
    const iron = this.standard({ color: "#2b2d31", roughness: 0.55, metalness: 0.6 }),
      collar = [[GRATE, TOP - 0.04], [GRATE + 0.07, TOP + 0.04], [RIM - 0.12, TOP + 0.04], [RIM, TOP - 0.06], [RIM + 0.06, 0]].map(([r, y]) => new T.Vector2(r, y));
    this.add(new T.LatheGeometry(collar, 72), iron);
    this.add(new T.CylinderGeometry(GRATE, GRATE, TOP, 64, 1, true), this.standard({ color: "#17181a", roughness: 0.9, side: T.BackSide }), 0, TOP / 2, 0).castShadow = false;
    // A band of copper round the collar, and four bolts.
    const copper = this.standard({ color: "#b8733a", roughness: 0.35, metalness: 0.8 });
    this.add(new T.TorusGeometry(RIM - 0.32, 0.035, 8, 72).rotateX(Math.PI / 2), copper, 0, TOP + 0.05, 0).castShadow = false;
    for (let i = 0; i < 4; i++) this.add(new T.CylinderGeometry(0.07, 0.07, 0.05, 12), copper, Math.cos(i * 1.5708 + 0.785) * (RIM - 0.16), TOP + 0.06, Math.sin(i * 1.5708 + 0.785) * (RIM - 0.16)).castShadow = false;
    const random = sequence(41),
      bed = document.createElement("canvas");
    bed.width = bed.height = 256;
    const pen = bed.getContext("2d")!;
    pen.fillStyle = "#1a1210";
    pen.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 150; i++) {
      // Lumps of charcoal: ash-grey at the edge, red within, brightest toward the middle of the bed.
      const x = random() * 256,
        y = random() * 256,
        r = 9 + random() * 14,
        heat = Math.max(0, 1 - Math.hypot(x - 128, y - 128) / 150) * (0.5 + random() * 0.5),
        lump = pen.createRadialGradient(x, y, 1, x, y, r);
      lump.addColorStop(0, css(mix([120, 40, 20], [255, 190, 70], heat)));
      lump.addColorStop(0.6, css(mix([70, 30, 22], [226, 80, 26], heat)));
      lump.addColorStop(1, css(mix([52, 46, 44], [96, 86, 82], random())));
      pen.fillStyle = lump;
      pen.beginPath();
      pen.arc(x, y, r, 0, Math.PI * 2);
      pen.fill();
    }
    const embers = this.own(new T.CanvasTexture(bed));
    embers.colorSpace = T.SRGBColorSpace;
    this.coals = this.own(new T.MeshBasicMaterial({ map: embers }));
    this.add(new T.CircleGeometry(GRATE, 64).rotateX(-Math.PI / 2), this.coals, 0, 0.08, 0).castShadow = false;
    this.ember = new T.PointLight("#ff8a3a", 7, 8, 1.6);
    this.ember.position.set(0, 1.5, 0);
    this.scene.add(this.ember);
    // The grate: wires crossing at right angles, with a wire ring round them.
    const wire = document.createElement("canvas");
    wire.width = wire.height = 512;
    const ink = wire.getContext("2d")!;
    for (const [color, width, shift_] of [["#3a3d42", 7, 2], ["#d3d8de", 4, 0]] as const) {
      ink.strokeStyle = color;
      ink.lineWidth = width;
      for (let at = 16; at < 512; at += 32) {
        ink.beginPath();
        ink.moveTo(at + shift_, 0);
        ink.lineTo(at + shift_, 512);
        ink.moveTo(0, at + shift_);
        ink.lineTo(512, at + shift_);
        ink.stroke();
      }
    }
    const mesh = this.own(new T.CanvasTexture(wire));
    mesh.colorSpace = T.SRGBColorSpace;
    mesh.anisotropy = 4;
    const grate = this.add(new T.CircleGeometry(GRATE, 64).rotateX(-Math.PI / 2), this.standard({ map: mesh, transparent: true, alphaTest: 0.5, metalness: 0.7, roughness: 0.35 }), 0, TOP, 0);
    grate.castShadow = false;
    this.add(new T.TorusGeometry(GRATE - 0.04, 0.045, 8, 72).rotateX(Math.PI / 2), this.standard({ color: "#c9ced6", metalness: 0.8, roughness: 0.3 }), 0, TOP + 0.01, 0).castShadow = false;
  }
  /** The plates, my own plate with its chopsticks, and the side dishes. */
  private crockery() {
    const china = this.standard({ color: "#f7f4ec", roughness: 0.25 }),
      line = this.standard({ color: "#2a4f9a", roughness: 0.4 }),
      dish = (x: number, z: number, r: number, deep = 0.1) => {
        const profile = [[0, 0], [r * 0.72, 0], [r * 0.96, deep * 0.7], [r, deep], [r * 0.95, deep * 0.92], [r * 0.7, 0.05], [0, 0.05]].map(([radius, y]) => new T.Vector2(radius, y));
        this.add(new T.LatheGeometry(profile, 56), china, x, 0.01, z);
        this.add(new T.TorusGeometry(r * 0.88, 0.012, 6, 56).rotateX(Math.PI / 2), line, x, 0.01 + deep * 0.82, z).castShadow = false;
      },
      fill = (x: number, z: number, r: number, color: string, y = 0.1) => (this.add(new T.CircleGeometry(r, 32).rotateX(-Math.PI / 2), this.standard({ color, roughness: 0.3 }), x, y, z).castShadow = false);
    for (const [x, z] of PLATES) dish(x, z, 1.5);
    dish(MINE[0], MINE[1], 1.3);
    // Chopsticks beside my plate, on a rest.
    const stick = this.standard({ color: "#5a3a26", roughness: 0.5 });
    for (const dx of [-0.07, 0.07]) this.add(new T.CylinderGeometry(0.03, 0.022, 2.4, 8).rotateX(Math.PI / 2), stick, MINE[0] - 1.75 + dx, 0.08, MINE[1]).rotation.y = dx;
    this.add(new T.BoxGeometry(0.4, 0.07, 0.16), china, MINE[0] - 1.75, 0.035, MINE[1] - 0.9);
    // Side dishes along the far edge: kimchi, a seasoned bean paste, sliced garlic and green chilli, salt in sesame oil; and a basket of lettuce near me.
    dish(-2.1, -4.3, 0.62, 0.2);
    fill(-2.1, -4.3, 0.5, "#c23a26", 0.15);
    for (const [dx, dz, color] of [[-0.15, -0.1, "#e8d9b0"], [0.12, 0.12, "#e04a30"], [0.1, -0.16, "#f0e2c0"], [-0.1, 0.15, "#b02a1c"]] as const) this.add(new T.BoxGeometry(0.3, 0.05, 0.2), this.standard({ color, roughness: 0.4 }), -2.1 + dx, 0.19, -4.3 + dz).rotation.y = dx * 6;
    dish(-0.7, -4.3, 0.5, 0.18);
    fill(-0.7, -4.3, 0.4, "#9a5226", 0.14);
    dish(0.7, -4.3, 0.5, 0.18);
    for (let i = 0; i < 7; i++) this.add(new T.CylinderGeometry(0.09, 0.09, 0.03, 12), this.standard({ color: i % 3 ? "#f3ecd6" : "#5fa83a", roughness: 0.5 }), 0.7 + Math.cos(i * 0.9) * 0.2, 0.15, -4.3 + Math.sin(i * 0.9) * 0.2).castShadow = false;
    dish(2.1, -4.3, 0.5, 0.18);
    fill(2.1, -4.3, 0.4, "#d8c468", 0.14);
    const basket = this.standard({ color: "#b98a4e", roughness: 0.8 });
    this.add(new T.CylinderGeometry(0.95, 0.8, 0.22, 36), basket, -1.4, 0.11, 4.45);
    for (let i = 0; i < 6; i++) {
      const leaf = this.add(new T.SphereGeometry(0.5, 14, 8), this.standard({ color: ["#6fb84a", "#86c85a", "#5aa23c"][i % 3], roughness: 0.7 }), -1.4 + Math.cos(i * 1.05) * 0.3, 0.26 + i * 0.012, 4.45 + Math.sin(i * 1.05) * 0.25);
      leaf.scale.set(1.25, 0.06, 0.95);
      leaf.rotation.y = i * 1.3;
    }
  }
  /** The paint of a side of a cut when it is `done` so far; made once for each shade. */
  private skin(cut: number, done: number) {
    const shade = Math.round(Math.min(COAL, done) * SHADES),
      key = cut * 100 + shade;
    let texture = this.skins.get(key);
    if (!texture) {
      texture = this.own(new T.CanvasTexture(side(cut, shade / SHADES)));
      texture.colorSpace = T.SRGBColorSpace;
      this.skins.set(key, texture);
    }
    return texture;
  }
  /** A line of words that rises from a place and fades. */
  private say(text: string, color: string, x: number, z: number, now: number) {
    let paint = this.signs.get(text);
    if (!paint) {
      const canvas = document.createElement("canvas");
      canvas.width = 384;
      canvas.height = 112;
      const pen = canvas.getContext("2d")!;
      pen.font = `900 62px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif`;
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.lineJoin = "round";
      pen.lineWidth = 14;
      pen.strokeStyle = "#241c18";
      pen.strokeText(text, 192, 58);
      pen.fillStyle = color;
      pen.fillText(text, 192, 58);
      const map = this.own(new T.CanvasTexture(canvas));
      map.colorSpace = T.SRGBColorSpace;
      paint = this.own(new T.SpriteMaterial({ map, depthTest: false, transparent: true }));
      this.signs.set(text, paint);
    }
    const sprite = new T.Sprite(paint.clone());
    this.own(sprite.material);
    sprite.scale.set(3.3, 0.96, 1);
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    this.words.push({ sprite, x, z, at: now });
  }
  /** The table never makes the screen wait. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.grab = null;
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** Tells the screen what has happened on the table. */
  private report(events: Happening[]) {
    const now = performance.now(),
      move = (to: number) => this.onMove({ from: -1, to, extra: -1 });
    for (const event of events) {
      if (event.kind === "second") {
        move(TICK);
        continue;
      }
      if (event.kind === "done") {
        move(DONE);
        continue;
      }
      const [x, z] = PLACES[event.slot];
      if (event.kind === "lay") move(LAY);
      else if (event.kind === "flip") move(FLIP);
      else if (event.kind === "burn") {
        this.say("탔어요!", "#ff6a5a", x, z, now);
        move(BURN);
      } else if (event.kind === "discard") this.say("버렸어요", "#dfe6ee", x, z, now);
      else {
        const [text, color] = event.raw ? ["덜 익었어요", "#dfe6ee"] : event.points === BEST ? ["완벽!", "#ffd24a"] : event.points >= 4 ? ["맛있어요", "#8be08f"] : event.points >= 2 ? ["괜찮아요", "#9fd0ff"] : ["아쉬워요", "#f0cfa6"];
        this.say(event.raw ? text : `${text} +${event.points}`, color, x, z, now);
        move(EAT + event.points);
      }
      this.onContact();
    }
  }
  /** The place nearest a point of the table, if it is near enough. */
  private placeAt(at: { x: number; z: number }) {
    let best = -1,
      near = 0.95;
    PLACES.forEach(([x, z], slot) => {
      const far = Math.hypot(at.x - x, at.z - z);
      if (far < near) {
        near = far;
        best = slot;
      }
    });
    return best;
  }
  protected dragStart(point: number, at: { x: number; z: number }) {
    if (!this.running()) return false;
    const held = point >= PLATE ? this.world.plates[point - PLATE] > 0 : point >= PLACE && !!this.world.slots[point - PLACE];
    if (!held) return false;
    this.grab = { point, x: at.x, z: at.z, from: at, at: performance.now(), moved: false };
    return true;
  }
  protected dragMove(at: { x: number; z: number }) {
    const grab = this.grab;
    if (!grab) return;
    grab.x = at.x;
    grab.z = at.z;
    if (Math.hypot(at.x - grab.from.x, at.z - grab.from.z) > 0.45) grab.moved = true;
  }
  protected dragEnd(at: { x: number; z: number } | null) {
    const grab = this.grab;
    this.grab = null;
    if (!grab || !at || !this.running()) return;
    const cut = grab.point - PLATE,
      slot = grab.point - PLACE;
    if (!grab.moved) {
      // A tap on a plate lays a piece; a tap on a piece turns it; a piece held a while and let go is taken off.
      if (cut >= 0) this.report(lay(this.world, cut));
      else this.report(performance.now() - grab.at > 450 ? take(this.world, slot) : flip(this.world, slot));
      return;
    }
    const place = this.placeAt(at),
      over = Math.hypot(at.x, at.z) < RIM;
    if (cut >= 0) {
      // Carried from its plate to a place of the grill, or anywhere over it.
      if (place >= 0 && !this.world.slots[place]) this.report(lay(this.world, cut, place));
      else if (over) this.report(lay(this.world, cut));
    } else if (!over) this.report(take(this.world, slot));
    else if (place >= 0) shift(this.world, slot, place);
  }
  private advance(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    if (this.running()) {
      this.left += Math.min(0.05, real);
      while (this.left >= DT && this.state?.winner === null) {
        this.left -= DT;
        this.report(step(this.world));
      }
    }
    this.pose(now);
    this.redraw();
  }
  /** Shows a model as a piece of a cut with its two sides done so far. */
  private dress(model: Model, piece: Pick<Piece, "cut" | "done"> & { burnt?: boolean }) {
    // A burnt piece is blackened all over, whichever side lay down.
    const done = piece.burnt ? piece.done.map((side) => Math.max(side, CHARRED + 0.15)) : piece.done;
    const shape = SHAPES[piece.cut],
      mesh = shape.round ? model.slice : model.slab;
    model.slab.visible = !shape.round;
    model.slice.visible = shape.round;
    mesh.scale.set(shape.w, shape.tall, shape.d);
    model.under.map = this.skin(piece.cut, done[0]);
    model.upper.map = this.skin(piece.cut, done[1]);
    model.edge.color.set(css(cooked(...FLESH[piece.cut].lean, (done[0] + done[1]) / 2)).replace(/rgba\((\d+),(\d+),(\d+),1\)/, "rgb($1,$2,$3)"));
  }
  /** Puts everything where the table has it. */
  private pose(now: number) {
    const { world, grab } = this,
      carried = grab?.moved ? grab : null;
    this.coals.color.setScalar(0.86 + 0.1 * Math.sin(now / 240) + 0.04 * Math.sin(now / 83));
    this.ember.intensity = 6 + Math.sin(now / 240);
    this.stock.forEach((meshes, cut) => meshes.forEach((mesh, i) => (mesh.visible = i < world.plates[cut] - (carried?.point === PLATE + cut ? 1 : 0))));
    world.slots.forEach((piece, slot) => {
      const model = this.pieces[slot],
        held = carried?.point === PLACE + slot;
      model.group.visible = !!piece;
      for (const k of [0, 1, 2]) this.puffs[slot * 3 + k].visible = false;
      if (!piece) return;
      this.dress(model, piece);
      const [x, z] = held ? [carried!.x, carried!.z] : PLACES[slot],
        tall = SHAPES[piece.cut].tall,
        // Turning: it rises, goes over, and comes down on its other side.
        turning = piece.age - piece.since > 1e-6 ? Math.min(1, piece.since / 0.24) : 1,
        settle = Math.min(1, piece.age / 0.16);
      model.group.position.set(x, TOP + 0.03 + tall / 2 + Math.sin(turning * Math.PI) * 0.55 + (held ? 0.7 : 0) + (1 - settle) * 0.4, z);
      model.group.rotation.set((piece.turned ? 0 : Math.PI) + Math.PI * turning, ((slot * 1.9) % 0.9) - 0.45, 0);
      const under = piece.done[down(piece)];
      // Nothing but the smoke tells how the side lying down is doing: a thin wisp once it is cooked through,
      // full white smoke while it is just right, grey when it is overdone, dark and thick before it burns.
      if (under >= RAW && !held) {
        const thick = under < GOOD ? 0.4 : under <= OVER ? 0.7 : under < CHARRED ? 0.75 : 0.95;
        for (const k of [0, 1, 2]) {
          const puff = this.puffs[slot * 3 + k],
            p = (now / 1300 + k / 3 + slot * 0.37) % 1,
            paint = puff.material as T.MeshBasicMaterial;
          puff.visible = true;
          puff.position.set(x + Math.sin(p * 5 + k * 2) * 0.2, TOP + 0.5 + p, z - p * 0.5);
          puff.scale.setScalar((under < GOOD ? 0.5 : 0.9) + p * 1.4);
          paint.opacity = (1 - p) * thick;
          paint.color.set(under <= OVER ? "#ffffff" : under < CHARRED ? "#9a9aa0" : "#2c2c30");
        }
      }
    });
    // A piece carried from its plate hangs under the pointer.
    const spare = this.pieces[SLOTS];
    spare.group.visible = !!carried && carried.point >= PLATE;
    if (spare.group.visible) {
      this.dress(spare, { cut: carried!.point - PLATE, done: [0, 0] });
      spare.group.position.set(carried!.x, TOP + 0.8, carried!.z);
      spare.group.rotation.set(0, 0.2, 0);
    }
    this.words = this.words.filter((word) => {
      const p = (now - word.at) / 1300;
      if (p >= 1) {
        this.scene.remove(word.sprite);
        return false;
      }
      word.sprite.position.set(word.x, TOP + 1.2, word.z - 0.5 - p * 0.9);
      word.sprite.material.opacity = 1 - p * p;
      return true;
    });
    const at = this.cursor < 0 ? null : this.cursor < PLATES.length ? PLATES[this.cursor] : PLACES[this.cursor - PLATES.length];
    this.cursorRing.visible = !!at;
    if (at) {
      this.cursorRing.position.set(at[0], this.cursor < PLATES.length ? 0.2 : TOP + 0.05, at[1]);
      this.cursorRing.scale.setScalar(this.cursor < PLATES.length ? 1.5 : 1);
    }
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 5.6 : 7.9, halfZ: 4.85, height: 0.7, lookY: 0, tilt: 1.38 };
  }
  protected spots(): Spot[] {
    return [...PLACES.map(([x, z], slot) => ({ x, y: TOP, z, r: 0.86, point: PLACE + slot })), ...PLATES.map(([x, z], cut) => ({ x, y: 0.1, z, r: 1.45, point: PLATE + cut }))];
  }
  protected place(state: State) {
    // A new meal, known by the count of moves going back to nothing: the plates are full again and the grill is clear.
    // (Not by the table's own clock: the screen shows the state once more before each move it is told of.)
    const anew = state.ply === 0 && this.shown > 0;
    this.shown = state.ply;
    if (anew) {
      this.world = createWorld();
      for (const word of this.words) this.scene.remove(word.sprite);
      this.words = [];
    }
    this.pose(performance.now());
  }
  protected animate() {
    return false;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    super.dispose();
  }
}
