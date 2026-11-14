import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BEST, BURN, DRESS, EAT, FLIP, LAY, TICK, WRAP, type State } from "./rules";
import { CHARRED, COAL, CUTS, DT, FILLING, GOOD, OVER, PORTION, RAW, RELISHES, SLOTS, createWorld, down, eatWrap, fill, flip, lay, leaf, relish, shift, step, take, type Happening, type Piece, type World } from "./sim";
import tableUrl from "./table.webp?inline";
import bellyUrl from "./belly.webp?inline";
import ribUrl from "./rib.webp?inline";
import brisketUrl from "./brisket.webp?inline";
import neckUrl from "./neck.webp?inline";

export const GRILL_COLORS: [string, string] = ["#c8553a", "#b9b3a4"];
/** The grate's radius, the brazier's, how far from the middle the six outer places lie, and how high the grate stands. */
const GRATE = 2.75,
  RIM = 3.4,
  REACH = 1.72,
  TOP = 0.46;
/** Where the seven places are: the middle, then six round it. */
const PLACES = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3 - Math.PI / 2) * REACH, Math.sin((i * Math.PI) / 3 - Math.PI / 2) * REACH])];
/** Where the five plates of meat stand (and how wide each is), the large plate a wrap is made on, the relishes and the basket of leaves. */
const PLATES = [[-6.1, -3, 1.45], [-6.1, 0, 1.45], [-6.1, 3, 1.45], [6.2, 0.55, 1.38], [6.2, 3.45, 1.38]],
  BOARD = [6.2, -2.95, 1.75],
  DISHES = [[-2.1, -4.3], [-0.7, -4.3], [0.7, -4.3], [2.1, -4.3]],
  BASKET = [-1.4, 4.45];
/** How each cut is shaped: its length and breadth, its thickness, how much its edge wanders, and how square it is (0 for an oval). */
const SHAPES = [
  { w: 1.55, d: 0.6, tall: 0.1, wander: 0.05, square: 5 },
  { w: 1.35, d: 0.88, tall: 0.12, wander: 0.07, square: 3.4 },
  { w: 1.16, d: 0.9, tall: 0.05, wander: 0.11, square: 0 },
  { w: 1.34, d: 1.06, tall: 0.14, wander: 0.08, square: 0 },
  { w: 1.3, d: 0.66, tall: 0.1, wander: 0.03, square: 0 },
];
/** The points the table knows, kept clear of the numbers the rules use for their own moves. */
const PLACE = 300,
  PLATE = 400,
  LEAVES = 500,
  DISH = 510,
  WRAPPING = 520;
/** How finely a side's colour follows its cooking, and the side of its picture in pixels. */
const SHADES = 14,
  SKIN = 192;
type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * Math.max(0, Math.min(1, t)))) as Rgb,
  css = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r},${g},${b},${alpha})`,
  /** A colour as a side cooks: raw, done, then charred. */
  cooked = (raw: Rgb, ready: Rgb, done: number) => (done <= 1 ? mix(raw, ready, done) : mix(ready, [34, 24, 20], (done - 1) / (COAL - 1))),
  sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** The lean and the fat of each cut, raw and done. */
const FLESH: { lean: [Rgb, Rgb]; fat: [Rgb, Rgb] }[] = [
  { lean: [[214, 98, 104], [150, 88, 52]], fat: [[250, 236, 228], [230, 188, 120]] },
  { lean: [[146, 50, 38], [100, 54, 30]], fat: [[190, 114, 80], [146, 92, 48]] },
  { lean: [[212, 70, 76], [146, 96, 64]], fat: [[252, 242, 236], [226, 196, 150]] },
  { lean: [[204, 86, 92], [148, 88, 54]], fat: [[248, 234, 224], [226, 186, 122]] },
  { lean: [[240, 230, 208], [188, 138, 82]], fat: [[250, 246, 234], [212, 168, 108]] },
];
/**
 * Photographs of the raw flesh of the four meats (CC0, see `public/textures-license.txt`), one to a cut; the mushroom
 * has none and stays painted. Until a photograph has come the cut is painted as well.
 */
const PHOTOS: (HTMLImageElement | null)[] = [bellyUrl, ribUrl, brisketUrl, neckUrl, null].map((url) => {
  if (!url || typeof Image === "undefined") return null;
  const photo = new Image();
  photo.src = url;
  return photo;
});
/** The edge of a cut seen from above, within a square of side 1: an oval or a rounded oblong whose line wanders a little. */
function outline(cut: number) {
  const random = sequence(cut * 17 + 3),
    phases = [random() * 6, random() * 6, random() * 6],
    { wander, square } = SHAPES[cut];
  return Array.from({ length: 56 }, (_, i) => {
    const a = (i / 56) * Math.PI * 2,
      c = Math.cos(a),
      s = Math.sin(a),
      swell = 1 + wander * (Math.sin(3 * a + phases[0]) * 0.5 + Math.sin(5 * a + phases[1]) * 0.3 + Math.sin(9 * a + phases[2]) * 0.2),
      // A slice of king oyster mushroom is narrow at the stalk and wide at the cap.
      waist = cut === 4 ? 0.6 + 0.4 * ((c + 1) / 2) ** 1.4 : 1,
      bend = (v: number) => (square ? Math.sign(v) * Math.abs(v) ** (2 / square) : v);
    return new T.Vector2(0.5 * bend(c) * swell, 0.5 * bend(s) * swell * waist);
  });
}
/** One side of a cut, painted as it looks when it is `done` so far. */
function side(cut: number, done: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SKIN;
  const pen = canvas.getContext("2d")!,
    random = sequence(cut * 31 + 7),
    S = SKIN,
    soft = (px: number) => {
      if ("filter" in pen) pen.filter = px ? `blur(${px}px)` : "none";
    },
    lean = css(cooked(...FLESH[cut].lean, done)),
    fat = css(cooked(...FLESH[cut].fat, done));
  pen.fillStyle = lean;
  pen.fillRect(0, 0, S, S);
  pen.lineCap = "round";
  // The grain of the flesh: fine darker and lighter threads running one way.
  for (let i = 0; i < 260 && !(PHOTOS[cut]?.complete && PHOTOS[cut]!.naturalWidth); i++) {
    const x = random() * S,
      y = random() * S;
    pen.strokeStyle = i % 2 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.06)";
    pen.lineWidth = 0.8 + random();
    pen.beginPath();
    pen.moveTo(x, y);
    pen.lineTo(x + 14 + random() * 20, y + (random() - 0.5) * 6);
    pen.stroke();
  }
  const photo = PHOTOS[cut],
    shown = !!photo && photo.complete && photo.naturalWidth > 0;
  if (shown) {
    // The photograph of the raw flesh, then the colour heat gives it: its hue goes to brown while light and dark stay
    // where they were, and the whole grows darker.
    pen.drawImage(photo, 0, 0, S, S);
    const heat = Math.min(1, done);
    if (heat > 0) {
      pen.globalCompositeOperation = "color";
      pen.fillStyle = css(cooked(...FLESH[cut].lean, 1), heat * 0.9);
      pen.fillRect(0, 0, S, S);
      pen.globalCompositeOperation = "multiply";
      pen.fillStyle = css(mix([255, 255, 255], [196, 160, 124], heat));
      pen.fillRect(0, 0, S, S);
      pen.globalCompositeOperation = "source-over";
    }
  }
  pen.strokeStyle = pen.fillStyle = fat;
  soft(1.2);
  if (shown) {
    // Nothing is painted over a photograph but what the fire does.
  } else if (cut === 0) {
    // Pork belly: bands of fat and lean along the strip, none quite straight.
    for (const y of [0.1, 0.38, 0.66, 0.92]) {
      pen.beginPath();
      pen.moveTo(-8, y * S);
      for (let x = 0; x <= S + 8; x += 8) pen.lineTo(x, y * S + Math.sin(x * 0.06 + y * 9) * 5 + (random() - 0.5) * 3);
      pen.lineWidth = S * (0.09 + random() * 0.05);
      pen.stroke();
    }
  } else if (cut === 1) {
    // Marinated rib: dark with its sauce, scored across, with sesame on it.
    pen.strokeStyle = css(cooked([104, 30, 24], [66, 34, 18], done));
    pen.lineWidth = 5;
    for (let x = -S; x < S; x += 30) {
      pen.beginPath();
      pen.moveTo(x, 0);
      pen.lineTo(x + S * 0.55, S);
      pen.stroke();
    }
    soft(0);
    pen.fillStyle = css(cooked([240, 226, 190], [214, 184, 130], done));
    for (let i = 0; i < 34; i++) {
      pen.beginPath();
      pen.ellipse(random() * S, random() * S, 4, 2.2, random() * 3, 0, Math.PI * 2);
      pen.fill();
    }
  } else if (cut === 2 || cut === 3) {
    // Brisket is laced with fat all through; the neck has fewer, thicker seams and a rind of fat.
    const seams = cut === 2 ? 70 : 26;
    for (let i = 0; i < seams; i++) {
      const x = random() * S,
        y = random() * S,
        a = random() * Math.PI,
        reach = 20 + random() * 46;
      pen.lineWidth = cut === 2 ? 1.5 + random() * 3.5 : 2.5 + random() * 5;
      pen.beginPath();
      pen.moveTo(x, y);
      pen.bezierCurveTo(x + Math.cos(a) * reach * 0.3 + (random() - 0.5) * 24, y + Math.sin(a) * reach * 0.3 + (random() - 0.5) * 24, x + Math.cos(a) * reach * 0.7 + (random() - 0.5) * 24, y + Math.sin(a) * reach * 0.7 + (random() - 0.5) * 24, x + Math.cos(a) * reach, y + Math.sin(a) * reach);
      pen.stroke();
    }
    if (cut === 3) {
      pen.lineWidth = S * 0.11;
      pen.beginPath();
      pen.arc(S / 2, S / 2, S * 0.47, 2.2, 4.6);
      pen.stroke();
    }
  } else {
    // A slice of king oyster mushroom: fine fibres along it, a little darker toward the cap.
    pen.strokeStyle = css(cooked([216, 200, 170], [160, 112, 62], done));
    pen.lineWidth = 1.6;
    for (let y = 4; y < S; y += 5) {
      pen.beginPath();
      pen.moveTo(0, y + random() * 3);
      pen.lineTo(S, y + random() * 3);
      pen.stroke();
    }
    const cap = pen.createLinearGradient(S * 0.6, 0, S, 0);
    cap.addColorStop(0, "rgba(150,110,70,0)");
    cap.addColorStop(1, "rgba(150,110,70,0.35)");
    pen.fillStyle = cap;
    pen.fillRect(0, 0, S, S);
  }
  // Browning comes in patches, darker where the side lay closest; then the marks of the grate.
  if (done > 0.3) {
    soft(5);
    for (let i = 0; i < 36; i++) {
      pen.fillStyle = `rgba(70,36,14,${Math.min(0.3, (done - 0.3) * 0.32) * (0.4 + random() * 0.6)})`;
      pen.beginPath();
      pen.ellipse(random() * S, random() * S, 10 + random() * 26, 8 + random() * 18, random() * 3, 0, Math.PI * 2);
      pen.fill();
    }
    soft(1.5);
    pen.strokeStyle = `rgba(40,22,12,${Math.min(0.62, (done - 0.3) * 0.75)})`;
    pen.lineWidth = 7;
    for (let x = -S; x < S; x += 40) {
      pen.beginPath();
      pen.moveTo(x, S);
      pen.lineTo(x + S, 0);
      pen.stroke();
    }
  }
  soft(0);
  // Raw meat is wet and catches the light; it dries as it cooks.
  if (done < 0.7) {
    pen.fillStyle = `rgba(255,255,255,${0.16 * (1 - done / 0.7)})`;
    for (let i = 0; i < 26; i++) {
      pen.beginPath();
      pen.ellipse(random() * S, random() * S, 2 + random() * 7, 1 + random() * 2.4, random() * 3, 0, Math.PI * 2);
      pen.fill();
    }
  }
  if (done > OVER) {
    pen.fillStyle = `rgba(24,18,16,${Math.min(0.85, ((done - OVER) / (COAL - OVER)) * 0.9)})`;
    pen.fillRect(0, 0, S, S);
  }
  return canvas;
}
/** A piece as it is shown: an upper face, an under face and a rim, each with its own paint. */
interface Model {
  group: T.Group;
  body: T.Group;
  top: T.Mesh;
  bottom: T.Mesh;
  rim: T.Mesh;
  upper: T.MeshStandardMaterial;
  under: T.MeshStandardMaterial;
  edge: T.MeshStandardMaterial;
}
/**
 * A grill table seen from above: a charcoal brazier let into the wood,
 * plates of raw meat on either side, a large plate to make a wrap on, a
 * basket of leaves and relishes. The view plays the table in real time: a
 * piece is dragged from its plate to the grill, tapped to turn it, and
 * dragged off to be eaten or onto the wrap plate.
 */
export class GrillView extends TableView<State> {
  private world: World = createWorld();
  private skins = new Map<number, T.CanvasTexture>();
  private faces: { top: T.BufferGeometry; bottom: T.BufferGeometry; rim: T.BufferGeometry }[] = [];
  /** Seven on the grill, one carried from a plate, two on the wrap plate. */
  private pieces: Model[] = [];
  private stock: T.Group[][] = [];
  private puffs: T.Mesh[] = [];
  private coals!: T.MeshBasicMaterial;
  private ember!: T.PointLight;
  private leafOnBoard!: T.Mesh;
  private leafInHand!: T.Mesh;
  /** The relishes as they lie on a wrap, and as they are carried to it. */
  private dabs: T.Object3D[] = [];
  private dabsInHand: T.Object3D[] = [];
  private words: { sprite: T.Sprite; x: number; z: number; at: number }[] = [];
  private signs = new Map<string, T.SpriteMaterial>();
  private cursorRing: T.Mesh;
  /** Where the keyboard stands: a plate (0–4), a place (5–11) or the wrap plate (12), or nowhere. */
  private cursor = -1;
  /** What the pointer holds: the point it went down on, where it is now, when it went down, and whether it has moved. */
  private grab: { point: number; x: number; z: number; from: { x: number; z: number }; at: number; moved: boolean } | null = null;
  private last = performance.now();
  private left = 0;
  private paused = false;
  /** How many moves the state last shown had. */
  private shown = 0;
  private ticker = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#b98a58");
    this.daylight("#fff4e6", "#8a6a48", "#ffe9c8", 9, 2.0);
    // The table top: a photograph of one, shown once it has loaded over a painted stand-in.
    const stand = this.own(wood(false, 0.7));
    stand.repeat.set(3, 2);
    const top = this.standard({ map: stand, roughness: 0.6 });
    this.add(new T.PlaneGeometry(60, 40).rotateX(-Math.PI / 2), top, 0, 0, 0).castShadow = false;
    new T.TextureLoader().load(tableUrl, (photo) => {
      if (this.disposed) return photo.dispose();
      this.own(photo);
      photo.colorSpace = T.SRGBColorSpace;
      photo.wrapS = photo.wrapT = T.RepeatWrapping;
      photo.repeat.set(3.4, 2.3);
      photo.anisotropy = 4;
      top.map = photo;
      top.needsUpdate = true;
    });
    for (const photo of PHOTOS) if (photo && !photo.complete) photo.addEventListener("load", () => this.skins.size && this.developed(), { once: true });
    this.brazier();
    this.crockery();
    // The shapes of the cuts: an upper face, an under face and the rim between them.
    for (let cut = 0; cut < CUTS.length; cut++) {
      const edge = outline(cut),
        mapped = (geometry: T.BufferGeometry) => {
          // The picture of a side is laid over the square the cut lies in.
          const uv = geometry.getAttribute("uv");
          for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + 0.5, uv.getY(i) + 0.5);
          return geometry;
        };
      this.faces.push({
        top: this.own(mapped(new T.ShapeGeometry(new T.Shape(edge))).rotateX(-Math.PI / 2)),
        bottom: this.own(mapped(new T.ShapeGeometry(new T.Shape(edge.map((p) => new T.Vector2(p.x, -p.y))))).rotateX(Math.PI / 2)),
        rim: this.own(new T.ExtrudeGeometry(new T.Shape(edge), { depth: 1, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2).translate(0, -0.5, 0)),
      });
    }
    for (let i = 0; i < SLOTS + 1 + FILLING; i++) {
      const upper = this.standard({ map: this.skin(0, 0), roughness: 0.5 }),
        under = this.standard({ map: this.skin(0, 0), roughness: 0.5 }),
        edge = this.standard({ color: "#d06068", roughness: 0.6 }),
        group = new T.Group(),
        body = new T.Group(),
        make = (geometry: T.BufferGeometry, paint: T.Material, y: number) => {
          const mesh = new T.Mesh(geometry, paint);
          mesh.position.y = y;
          mesh.castShadow = true;
          body.add(mesh);
          return mesh;
        },
        model: Model = { group, body, top: make(this.faces[0].top, upper, 0.53), bottom: make(this.faces[0].bottom, under, -0.53), rim: make(this.faces[0].rim, edge, 0), upper, under, edge };
      group.add(body);
      group.visible = false;
      this.scene.add(group);
      this.pieces.push(model);
    }
    CUTS.forEach((_, cut) => {
      const shape = SHAPES[cut],
        raw = this.standard({ map: this.skin(cut, 0), roughness: 0.42 }),
        edge = this.standard({ color: css(mix(FLESH[cut].lean[0], [0, 0, 0], 0.12)), roughness: 0.6 }),
        [px, pz, wide] = PLATES[cut];
      this.stock.push(
        Array.from({ length: PORTION }, (_, i) => {
          const body = new T.Group(),
            face = new T.Mesh(this.faces[cut].top, raw),
            rim = new T.Mesh(this.faces[cut].rim, edge);
          face.position.y = 0.53;
          face.castShadow = rim.castShadow = face.receiveShadow = true;
          body.add(face, rim);
          body.scale.set(shape.w, shape.tall, shape.d);
          // Laid one over the next across the plate.
          body.position.set(px + (i - 2) * 0.05, 0.13 + shape.tall / 2 + i * 0.035, pz + (i - 2) * 0.23 * wide);
          body.rotation.set(0.07, (i % 2 ? 0.1 : -0.08) + (cut % 2 ? 0.12 : -0.1), 0);
          this.scene.add(body);
          return body;
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
    for (let i = 0; i < SLOTS * 3; i++) {
      const puff = new T.Mesh(sheet, this.own(new T.MeshBasicMaterial({ map: haze, transparent: true, depthWrite: false, opacity: 0 })));
      puff.visible = false;
      puff.renderOrder = 6;
      this.puffs.push(puff);
      this.scene.add(puff);
    }
    this.cursorRing = ringMesh(<R extends { dispose(): void }>(r: R) => this.own(r), 0.92, 1.02, "#3f8cff");
    this.scene.add(this.cursorRing);
    // The keyboard walks the plates, the places and then the wrap plate.
    const el = this.renderer.domElement,
      all = PLATES.length + SLOTS + 1;
    el.addEventListener("keydown", (e) => {
      const slot = this.cursor - PLATES.length,
        place = slot >= 0 && slot < SLOTS;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") this.cursor = (this.cursor + 1) % all;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") this.cursor = (Math.max(0, this.cursor) + all - 1) % all;
      else if (!this.running()) return;
      else if (e.key === "l" || e.key === "L" || e.key === "ㅣ") this.report(leaf(this.world));
      else if (e.key >= "1" && e.key <= String(RELISHES.length)) this.report(relish(this.world, Number(e.key) - 1));
      else if (this.cursor < 0) return;
      else if (e.key === "Enter") this.report(this.cursor < PLATES.length ? lay(this.world, this.cursor) : place ? flip(this.world, slot) : eatWrap(this.world));
      else if ((e.key === " " || e.key === "e" || e.key === "E" || e.key === "ㄷ") && place) this.report(take(this.world, slot));
      else if ((e.key === "s" || e.key === "S" || e.key === "ㄴ") && place) this.report(fill(this.world, slot));
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
    const iron = this.standard({ color: "#565a62", roughness: 0.45, metalness: 0.7 }),
      collar = [[GRATE, TOP - 0.04], [GRATE + 0.07, TOP + 0.04], [RIM - 0.12, TOP + 0.04], [RIM, TOP - 0.06], [RIM + 0.06, 0]].map(([r, y]) => new T.Vector2(r, y));
    this.add(new T.LatheGeometry(collar, 72), iron);
    this.add(new T.CylinderGeometry(GRATE, GRATE, TOP, 64, 1, true), this.standard({ color: "#17181a", roughness: 0.9, side: T.BackSide }), 0, TOP / 2, 0).castShadow = false;
    // A band of copper round the collar, and four bolts.
    const copper = this.standard({ color: "#b8733a", roughness: 0.32, metalness: 0.85 });
    this.add(new T.TorusGeometry(RIM - 0.32, 0.035, 8, 72).rotateX(Math.PI / 2), copper, 0, TOP + 0.05, 0).castShadow = false;
    for (let i = 0; i < 4; i++) this.add(new T.CylinderGeometry(0.07, 0.07, 0.05, 12), copper, Math.cos(i * 1.5708 + 0.785) * (RIM - 0.16), TOP + 0.06, Math.sin(i * 1.5708 + 0.785) * (RIM - 0.16)).castShadow = false;
    const random = sequence(41),
      bed = document.createElement("canvas");
    bed.width = bed.height = 512;
    const pen = bed.getContext("2d")!;
    pen.fillStyle = "#140e0c";
    pen.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 420; i++) {
      // Lumps of charcoal with broken edges: ash-grey outside, red within, brightest toward the middle of the bed.
      const x = random() * 512,
        y = random() * 512,
        r = 12 + random() * 20,
        heat = Math.max(0, 1 - Math.hypot(x - 256, y - 256) / 300) * (0.45 + random() * 0.55),
        lump = pen.createRadialGradient(x - r * 0.2, y - r * 0.2, 1, x, y, r);
      lump.addColorStop(0, css(mix([110, 36, 18], [255, 206, 96], heat)));
      lump.addColorStop(0.55, css(mix([64, 26, 18], [232, 84, 24], heat)));
      lump.addColorStop(0.85, css(mix([40, 34, 32], [120, 108, 102], random())));
      lump.addColorStop(1, "rgba(20,14,12,0.9)");
      pen.fillStyle = lump;
      pen.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + random(),
          reach = r * (0.7 + random() * 0.4);
        pen.lineTo(x + Math.cos(a) * reach, y + Math.sin(a) * reach);
      }
      pen.closePath();
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
    for (const [color, width, shift_] of [["#2c2e33", 7, 2], ["#aeb4bc", 4, 0], ["#eef1f4", 1.4, -1]] as const) {
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
    const grate = this.add(new T.CircleGeometry(GRATE, 64).rotateX(-Math.PI / 2), this.standard({ map: mesh, transparent: true, alphaTest: 0.5, metalness: 0.75, roughness: 0.3 }), 0, TOP, 0);
    grate.castShadow = false;
    this.add(new T.TorusGeometry(GRATE - 0.04, 0.045, 8, 72).rotateX(Math.PI / 2), this.standard({ color: "#c9ced6", metalness: 0.85, roughness: 0.25 }), 0, TOP + 0.01, 0).castShadow = false;
  }
  /** A relish as a small heap: kimchi, bean paste, garlic and chilli, salt in sesame oil. */
  private dab(which: number) {
    const heap = new T.Group(),
      bit = (geometry: T.BufferGeometry, color: string, x: number, y: number, z: number, turn = 0) => {
        const mesh = new T.Mesh(this.own(geometry), this.standard({ color, roughness: 0.4 }));
        mesh.position.set(x, y, z);
        mesh.rotation.y = turn;
        mesh.castShadow = true;
        heap.add(mesh);
      };
    if (which === 0) for (const [x, z, color, turn] of [[-0.1, -0.06, "#e8d9b0", 0.4], [0.08, 0.08, "#d8402a", -0.5], [0.04, -0.1, "#c2321e", 1.1]] as const) bit(new T.BoxGeometry(0.26, 0.05, 0.18), color, x, 0.03, z, turn);
    else if (which === 1) bit(new T.SphereGeometry(0.16, 14, 10).scale(1, 0.5, 1), "#9a5226", 0, 0.05, 0);
    else if (which === 2) {
      for (const [x, z] of [[-0.09, 0], [0.07, 0.07]]) bit(new T.CylinderGeometry(0.08, 0.08, 0.03, 12), "#f3ecd6", x, 0.02, z);
      bit(new T.TorusGeometry(0.06, 0.022, 6, 12).rotateX(Math.PI / 2), "#4f9a34", 0.03, 0.03, -0.09);
    } else bit(new T.CylinderGeometry(0.17, 0.17, 0.012, 20), "#e2c85a", 0, 0.01, 0);
    heap.visible = false;
    this.scene.add(heap);
    return heap;
  }
  /** The plates, the wrap plate, the relishes, the basket of leaves and a pair of chopsticks. */
  private crockery() {
    const china = this.standard({ color: "#f7f4ec", roughness: 0.22 }),
      line = this.standard({ color: "#2a4f9a", roughness: 0.4 }),
      dish = (x: number, z: number, r: number, deep = 0.1) => {
        const profile = [[0, 0], [r * 0.72, 0], [r * 0.96, deep * 0.7], [r, deep], [r * 0.95, deep * 0.92], [r * 0.7, 0.05], [0, 0.05]].map(([radius, y]) => new T.Vector2(radius, y));
        this.add(new T.LatheGeometry(profile, 56), china, x, 0.01, z);
        this.add(new T.TorusGeometry(r * 0.88, 0.012, 6, 56).rotateX(Math.PI / 2), line, x, 0.01 + deep * 0.82, z).castShadow = false;
      },
      fillWith = (x: number, z: number, r: number, color: string, y = 0.1) => (this.add(new T.CircleGeometry(r, 32).rotateX(-Math.PI / 2), this.standard({ color, roughness: 0.3 }), x, y, z).castShadow = false);
    for (const [x, z, r] of PLATES) dish(x, z, r);
    dish(BOARD[0], BOARD[1], BOARD[2]);
    // The relishes along the far edge, in the order the wrap counts them.
    DISHES.forEach(([x, z], which) => {
      dish(x, z, which ? 0.5 : 0.62, which ? 0.18 : 0.2);
      if (which === 0) {
        fillWith(x, z, 0.5, "#c23a26", 0.15);
        for (const [dx, dz, color] of [[-0.15, -0.1, "#e8d9b0"], [0.12, 0.12, "#e04a30"], [0.1, -0.16, "#f0e2c0"], [-0.1, 0.15, "#b02a1c"]] as const) this.add(new T.BoxGeometry(0.3, 0.05, 0.2), this.standard({ color, roughness: 0.4 }), x + dx, 0.19, z + dz).rotation.y = dx * 6;
      } else if (which === 1) fillWith(x, z, 0.4, "#9a5226", 0.14);
      else if (which === 2) for (let i = 0; i < 7; i++) this.add(new T.CylinderGeometry(0.09, 0.09, 0.03, 12), this.standard({ color: i % 3 ? "#f3ecd6" : "#5fa83a", roughness: 0.5 }), x + Math.cos(i * 0.9) * 0.2, 0.15, z + Math.sin(i * 0.9) * 0.2).castShadow = false;
      else fillWith(x, z, 0.4, "#d8c468", 0.14);
      this.dabs.push(this.dab(which));
      this.dabsInHand.push(this.dab(which));
    });
    // Lettuce: a ruffled leaf with a pale rib and veins, painted once and used for every leaf.
    const random = sequence(77),
      green = document.createElement("canvas");
    green.width = green.height = 256;
    const pen = green.getContext("2d")!,
      wash = pen.createRadialGradient(128, 150, 10, 128, 128, 150);
    wash.addColorStop(0, "#b6dc7a");
    wash.addColorStop(0.6, "#74b848");
    wash.addColorStop(1, "#4f9a34");
    pen.fillStyle = wash;
    pen.fillRect(0, 0, 256, 256);
    pen.strokeStyle = "rgba(232,246,200,0.75)";
    pen.lineCap = "round";
    pen.lineWidth = 7;
    pen.beginPath();
    pen.moveTo(128, 250);
    pen.lineTo(128, 40);
    pen.stroke();
    pen.lineWidth = 2;
    for (let y = 230; y > 50; y -= 22)
      for (const way of [-1, 1]) {
        pen.beginPath();
        pen.moveTo(128, y);
        pen.quadraticCurveTo(128 + way * 50, y - 20 - random() * 14, 128 + way * (88 + random() * 30), y - 50 - random() * 20);
        pen.stroke();
      }
    const veins = this.own(new T.CanvasTexture(green));
    veins.colorSpace = T.SRGBColorSpace;
    const ruffled = Array.from({ length: 64 }, (_, i) => {
        const a = (i / 64) * Math.PI * 2,
          r = 0.5 * (1 + 0.06 * Math.sin(a * 9) + 0.04 * Math.sin(a * 17 + 1));
        return new T.Vector2(Math.cos(a) * r * 0.86, Math.sin(a) * r);
      }),
      blade = new T.ShapeGeometry(new T.Shape(ruffled)),
      uv = blade.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + 0.5, uv.getY(i) + 0.5);
    this.own(blade.rotateX(-Math.PI / 2));
    const leafPaint = this.standard({ map: veins, roughness: 0.6, side: T.DoubleSide }),
      grow = (x: number, y: number, z: number, size: number, turn: number) => {
        const mesh = new T.Mesh(blade, leafPaint);
        mesh.position.set(x, y, z);
        mesh.scale.setScalar(size);
        mesh.rotation.y = turn;
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
        return mesh;
      };
    this.add(new T.CylinderGeometry(0.98, 0.82, 0.22, 36), this.standard({ color: "#b98a4e", roughness: 0.85 }), BASKET[0], 0.11, BASKET[1]);
    this.add(new T.TorusGeometry(0.98, 0.045, 8, 40).rotateX(Math.PI / 2), this.standard({ color: "#9a6e3a", roughness: 0.8 }), BASKET[0], 0.22, BASKET[1]).castShadow = false;
    for (let i = 0; i < 5; i++) grow(BASKET[0] + Math.cos(i * 1.26) * 0.22, 0.25 + i * 0.02, BASKET[1] + Math.sin(i * 1.26) * 0.18, 1.5, i * 1.4);
    this.leafOnBoard = grow(BOARD[0], 0.14, BOARD[1], 2.7, 0.5);
    this.leafInHand = grow(0, 0, 0, 2.2, 0.3);
    this.leafOnBoard.visible = this.leafInHand.visible = false;
    // Chopsticks near me, on a rest.
    const stick = this.standard({ color: "#d8b784", roughness: 0.5 });
    for (const dz of [-0.07, 0.07]) this.add(new T.CylinderGeometry(0.03, 0.022, 2.4, 8).rotateZ(Math.PI / 2), stick, 2.6, 0.08, 4.5 + dz).rotation.y = dz;
    this.add(new T.BoxGeometry(0.16, 0.07, 0.4), china, 1.7, 0.035, 4.5);
  }
  /** The paint of a side of a cut when it is `done` so far; made once for each shade. */
  /** Paints again every side made before its photograph had come. */
  private developed() {
    if (this.disposed) return;
    for (const [key, texture] of this.skins) {
      texture.image = side(Math.floor(key / 100), (key % 100) / SHADES);
      texture.needsUpdate = true;
    }
  }
  private skin(cut: number, done: number) {
    const shade = Math.round(Math.min(COAL, done) * SHADES),
      key = cut * 100 + shade;
    let texture = this.skins.get(key);
    if (!texture) {
      texture = this.own(new T.CanvasTexture(side(cut, shade / SHADES)));
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = 4;
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
      if (event.kind === "dress") move(DRESS);
      else if (event.kind === "wrap") {
        const text = event.meats === 0 ? "채소만 먹었어요" : event.points === 0 ? "덜 익었어요" : event.leaf ? `쌈 +${event.points}` : `+${event.points}`;
        this.say(text, event.leaf && event.points > 0 ? "#ffd24a" : "#dfe6ee", BOARD[0], BOARD[1], now);
        move(WRAP + event.points);
      } else {
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
    const held = point >= WRAPPING || point >= LEAVES || point >= PLATE || (point >= PLACE && !!this.world.slots[point - PLACE]);
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
    const { point } = grab,
      onBoard = Math.hypot(at.x - BOARD[0], at.z - BOARD[1]) < BOARD[2] + 0.25,
      over = Math.hypot(at.x, at.z) < RIM;
    if (!grab.moved) {
      // Nothing is laid by a tap: only a piece already on the grill answers one (it turns, or, held a while, is taken off), and the wrap plate (what is on it is eaten).
      if (point === WRAPPING) this.report(eatWrap(this.world));
      else if (point >= PLACE && point < PLATE) this.report(performance.now() - grab.at > 450 ? take(this.world, point - PLACE) : flip(this.world, point - PLACE));
      return;
    }
    if (point >= DISH && point < WRAPPING) {
      if (onBoard) this.report(relish(this.world, point - DISH));
    } else if (point === LEAVES) {
      if (onBoard) this.report(leaf(this.world));
    } else if (point >= PLATE && point < LEAVES) {
      // Carried from its plate to a place of the grill, or anywhere over it.
      const place = this.placeAt(at);
      if (place >= 0 && !this.world.slots[place]) this.report(lay(this.world, point - PLATE, place));
      else if (over) this.report(lay(this.world, point - PLATE));
    } else if (point >= PLACE && point < PLATE) {
      const slot = point - PLACE,
        place = this.placeAt(at);
      if (onBoard) this.report(fill(this.world, slot));
      else if (!over) this.report(take(this.world, slot));
      else if (place >= 0) shift(this.world, slot, place);
    }
  }
  private advance(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    if (this.running()) {
      // The table's clock keeps the wall clock's time even when frames are few: a slow screen must not make the meal run slow.
      this.left += real;
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
    const done = piece.burnt ? piece.done.map((part) => Math.max(part, CHARRED + 0.15)) : piece.done,
      shape = SHAPES[piece.cut],
      faces = this.faces[piece.cut],
      middle = (done[0] + done[1]) / 2;
    model.top.geometry = faces.top;
    model.bottom.geometry = faces.bottom;
    model.rim.geometry = faces.rim;
    model.body.scale.set(shape.w, shape.tall, shape.d);
    model.under.map = this.skin(piece.cut, done[0]);
    model.upper.map = this.skin(piece.cut, done[1]);
    // Wet when raw, dry when done.
    model.under.roughness = model.upper.roughness = 0.42 + Math.min(1, middle) * 0.3;
    const [r, g, b] = cooked(...FLESH[piece.cut].lean, middle);
    model.edge.color.setRGB(r / 255, g / 255, b / 255, T.SRGBColorSpace);
  }
  /** Puts everything where the table has it. */
  private pose(now: number) {
    const { world, grab } = this,
      carried = grab?.moved ? grab : null;
    this.coals.color.setScalar(0.86 + 0.1 * Math.sin(now / 240) + 0.04 * Math.sin(now / 83));
    this.ember.intensity = 6 + Math.sin(now / 240);
    this.stock.forEach((bodies, cut) => bodies.forEach((body, i) => (body.visible = i < world.plates[cut] - (carried?.point === PLATE + cut ? 1 : 0))));
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
    // What is carried hangs under the pointer: a piece from its plate, a leaf, a relish.
    const spare = this.pieces[SLOTS],
      lift = TOP + 0.8;
    spare.group.visible = !!carried && carried.point >= PLATE && carried.point < LEAVES;
    if (spare.group.visible) {
      this.dress(spare, { cut: carried!.point - PLATE, done: [0, 0] });
      spare.group.position.set(carried!.x, lift, carried!.z);
      spare.group.rotation.set(Math.PI, 0.2, 0);
    }
    this.leafInHand.visible = carried?.point === LEAVES;
    if (carried) this.leafInHand.position.set(carried.x, lift, carried.z);
    this.dabsInHand.forEach((heap, which) => {
      heap.visible = carried?.point === DISH + which;
      if (carried) {
        heap.position.set(carried.x, lift, carried.z);
        heap.scale.setScalar(1.6);
      }
    });
    // The wrap plate: the leaf, the pieces on it and the relishes over them.
    this.leafOnBoard.visible = world.wrap.leaf;
    for (let k = 0; k < FILLING; k++) {
      const model = this.pieces[SLOTS + 1 + k],
        piece = world.wrap.meats[k];
      model.group.visible = !!piece;
      if (!piece) continue;
      this.dress(model, piece);
      model.group.position.set(BOARD[0] + (k ? 0.42 : -0.38), 0.24 + k * 0.06, BOARD[1] + (k ? 0.2 : -0.12));
      // The side that was up on the grill is up on the plate.
      model.group.rotation.set(piece.turned ? Math.PI : 0, k ? -0.5 : 0.35, 0);
    }
    this.dabs.forEach((heap, which) => {
      heap.visible = world.wrap.relishes.includes(which);
      heap.position.set(BOARD[0] + [-0.5, 0.05, 0.5, -0.1][which], 0.36, BOARD[1] + [0.42, 0.5, 0.45, -0.52][which]);
      heap.scale.setScalar(1.5);
    });
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
    const at = this.cursor < 0 ? null : this.cursor < PLATES.length ? PLATES[this.cursor] : this.cursor < PLATES.length + SLOTS ? PLACES[this.cursor - PLATES.length] : BOARD,
      wide = this.cursor < PLATES.length || this.cursor >= PLATES.length + SLOTS;
    this.cursorRing.visible = !!at;
    if (at) {
      this.cursorRing.position.set(at[0], wide ? 0.2 : TOP + 0.05, at[1]);
      this.cursorRing.scale.setScalar(wide ? (at[2] ?? 1.45) * 1.04 : 1);
    }
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 5.6 : 8.05, halfZ: 4.95, height: 0.7, lookY: 0, tilt: 1.38 };
  }
  protected spots(): Spot[] {
    return [
      ...PLACES.map(([x, z], slot) => ({ x, y: TOP, z, r: 0.86, point: PLACE + slot })),
      ...PLATES.map(([x, z, r], cut) => ({ x, y: 0.1, z, r, point: PLATE + cut })),
      ...DISHES.map(([x, z], which) => ({ x, y: 0.1, z, r: 0.66, point: DISH + which })),
      { x: BASKET[0], y: 0.2, z: BASKET[1], r: 1.05, point: LEAVES },
      { x: BOARD[0], y: 0.1, z: BOARD[1], r: BOARD[2], point: WRAPPING },
    ];
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
