import * as T from "three";
import { block, fall, glossy, weave, wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { BOARD, FRAME, FRAME_TOP, TILE_HIGH, TILE_TOP, WELL, cellAt, cellSize, slideSubject } from "./layout";
import { paintPicture } from "./picture";
import { pushOf, type State } from "./rules";

export const SLIDE_COLORS: [string, string] = ["#c9a26a", "#5a3a22"];
/** The space between two tiles, and how far inside a tile's edge its printed top begins (past the rounded edge). */
const GAP = 0.05,
  EDGE = 0.06,
  PRINT_IN = EDGE + 0.025;
/** How high the missing tile falls from when the puzzle is solved. */
const DROP = 2.4;
/** The share of a place inside which a tile's printed top lies, for the faint numbers of a picture. */
const insetOf = (size: number) => (GAP / 2 + PRINT_IN) / cellSize(size);
/** A tiny fixed sequence, so that painted pictures come out the same every time. */
function sequence(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const texture = (canvas: HTMLCanvasElement) => {
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
/** The numbers printed on the tiles, one place of a `size` grid each, in red ink with a printed border, on nothing. */
function numberSheet(size: number) {
  const px = 1024,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d")!,
    cell = px / size,
    inset = insetOf(size) * cell;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < size * size; i++) {
    const x = (i % size) * cell,
      y = Math.floor(i / size) * cell,
      label = String(i + 1),
      font = cell * (label.length > 1 ? 0.46 : 0.54);
    // A thin printed border a little inside the top's edge.
    ctx.strokeStyle = "rgba(110, 52, 30, 0.45)";
    ctx.lineWidth = cell * 0.018;
    ctx.beginPath();
    ctx.roundRect(x + inset + cell * 0.05, y + inset + cell * 0.05, cell - 2 * inset - cell * 0.1, cell - 2 * inset - cell * 0.1, cell * 0.06);
    ctx.stroke();
    ctx.font = `800 ${font}px Georgia, "Times New Roman", serif`;
    // Ink a little darker at its edge, as printed.
    ctx.lineWidth = cell * 0.02;
    ctx.strokeStyle = "rgba(90, 20, 12, 0.7)";
    ctx.strokeText(label, x + cell / 2, y + cell * 0.53);
    ctx.fillStyle = "#a3291c";
    ctx.fillText(label, x + cell / 2, y + cell * 0.53);
  }
  return canvas;
}
/** A cutting mat for the desk: dark green with a faint grid. */
function matSheet() {
  const px = 1024,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2f6a58";
  ctx.fillRect(0, 0, px, px);
  for (let k = 0; k <= 40; k++) {
    ctx.strokeStyle = k % 5 ? "rgba(220, 240, 230, 0.13)" : "rgba(230, 245, 235, 0.3)";
    ctx.lineWidth = k % 5 ? 1.5 : 2.5;
    const v = (k / 40) * px;
    ctx.beginPath();
    ctx.moveTo(v, 0);
    ctx.lineTo(v, px);
    ctx.moveTo(0, v);
    ctx.lineTo(px, v);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(240, 220, 120, 0.4)";
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, px - 28, px - 28);
  return canvas;
}
/** The cover of a notebook: a pastel board with a white label and a few doodled stars. */
function coverSheet(colour: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext("2d")!,
    random = sequence(91);
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = "#fbf7ea";
  ctx.beginPath();
  ctx.roundRect(48, 60, 160, 70, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(60, 60, 80, 0.35)";
  ctx.lineWidth = 3;
  for (const y of [86, 106]) {
    ctx.beginPath();
    ctx.moveTo(64, y);
    ctx.lineTo(192, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff4b0";
  for (let k = 0; k < 7; k++) {
    const x = 30 + random() * 196,
      y = 170 + random() * 130,
      r = 7 + random() * 9;
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const a = (p / 10) * Math.PI * 2 - Math.PI / 2,
        rr = p % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.fill();
  }
  return canvas;
}
/** The face of a little alarm clock: white with its hours and two hands. */
function clockFace() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fbf8ef";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#2b2b33";
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96, h % 3 ? 5 : 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#2b2b33";
  ctx.lineCap = "round";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(128, 128);
  ctx.lineTo(128 + 52, 128 - 22);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(128, 128);
  ctx.lineTo(128 - 10, 128 - 80);
  ctx.stroke();
  ctx.fillStyle = "#d8342a";
  ctx.beginPath();
  ctx.arc(128, 128, 9, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}
/** A rounded rectangle path, `hw` by `hd` from its middle. */
function roundedRect<P extends T.Path>(path: P, hw: number, hd: number, r: number): P {
  path.moveTo(-hw + r, -hd);
  path.lineTo(hw - r, -hd);
  path.quadraticCurveTo(hw, -hd, hw, -hd + r);
  path.lineTo(hw, hd - r);
  path.quadraticCurveTo(hw, hd, hw - r, hd);
  path.lineTo(-hw + r, hd);
  path.quadraticCurveTo(-hw, hd, -hw, hd - r);
  path.lineTo(-hw, -hd + r);
  path.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return path;
}
/**
 * The sliding puzzle on a child's study desk: a walnut tray with a rounded frame and a green baize well, lying on a
 * cutting mat, with maple tiles printed with their numbers or with their part of a picture; round it a desk lamp,
 * a cup of coloured pencils, a stack of books, a notebook, a toy car, an alarm clock, an eraser and a pencil, all
 * modelled in code and kept clear of the tray. A tap on a tile in the gap's line pushes it (and those between) into
 * the gap; a tile may also be dragged toward the gap. Solved, the missing tile drops into its corner and the frame,
 * and the picture, glow.
 */
export class SlideView extends TableView<State> {
  private board = new T.Group();
  /** Each tile's model by its number (0 unused; the last is the missing tile that drops in at the end). */
  private models: T.Group[] = [];
  private built = "";
  /** What a build of the tiles made, freed when the tiles are built again. */
  private made: { dispose(): void }[] = [];
  private maple: T.MeshStandardMaterial;
  private walnut: T.MeshStandardMaterial;
  private print: T.MeshStandardMaterial | null = null;
  /** How strongly the frame and the picture glow, 0 to 1. */
  private glowing = 0;
  private hinted: T.Mesh;
  private arrow = new T.Group();
  private shaft: T.Mesh;
  private outline: T.BufferGeometry | null = null;
  /** The push under a pointer: the tiles it slides, where each began, the way they go, and how far the hand has gone. */
  private held: { from: number; gap: number; tiles: number[]; origin: { x: number; z: number }[]; dx: number; dz: number; start: { x: number; z: number }; shift: number; travel: number } | null = null;
  /** Where the tiles of a drag were let go, so that the slide continues from there. */
  private dropped: Map<number, { x: number; z: number }> | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#e9dcc6");
    this.daylight("#fff8ec", "#8a6f52", "#fff1d8", 9, 2.0);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    // The desk: pale oak boards, and a green cutting mat under the tray.
    const oak = keep(wood(false));
    oak.repeat.set(3, 2);
    this.add(block(26, 0.5, 16, 0.08), this.standard({ map: oak, color: "#f0dcc0", roughness: 0.62 }), 0, -0.25, 0).castShadow = false;
    const mat = keep(texture(matSheet()));
    this.add(block(6.6, 0.03, 6.4, 0.012), [this.standard({ color: "#2a5c4c" }), this.standard({ color: "#2a5c4c" }), this.standard({ map: mat, roughness: 0.85 }), this.standard({ color: "#2a5c4c" }), this.standard({ color: "#2a5c4c" }), this.standard({ color: "#2a5c4c" })], 0, 0.015, 0.05).castShadow = false;
    // The tray: walnut, a rounded frame round a well lined with green baize.
    const dark = keep(wood(true));
    dark.repeat.set(1.5, 1.5);
    this.walnut = this.standard({ map: dark, color: "#a57452", roughness: 0.45, emissive: "#ffc65a", emissiveIntensity: 0 });
    const outer = BOARD / 2 + FRAME,
      frameShape = roundedRect(new T.Shape(), outer, outer, 0.2);
    frameShape.holes.push(roundedRect(new T.Path(), BOARD / 2 + 0.012, BOARD / 2 + 0.012, 0.04));
    const frame = new T.ExtrudeGeometry(frameShape, { depth: FRAME_TOP - 0.05, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 3, curveSegments: 10 });
    frame.rotateX(-Math.PI / 2);
    frame.translate(0, 0.03, 0);
    // The frame's texture is laid by its own coordinates; a smaller repeat keeps the grain a sensible size.
    this.add(frame, this.walnut, 0, 0.015, 0);
    this.add(block(BOARD + 0.04, WELL, BOARD + 0.04, 0.01), this.walnut, 0, WELL / 2 + 0.015, 0).castShadow = false;
    this.add(new T.PlaneGeometry(BOARD + 0.02, BOARD + 0.02).rotateX(-Math.PI / 2), this.standard({ color: "#1f5a3c", roughness: 1, ...weave(1.5, 1.5, keep, 0.8) }), 0, WELL + 0.016, 0).castShadow = false;
    // The tiles' wood: pale maple, its grain faded a little.
    const maple = keep(wood(false, 0.7));
    this.maple = this.standard({ map: maple, color: "#f6e4c4", roughness: 0.5 });
    this.board.position.y = 0.015;
    this.scene.add(this.board);
    this.desk(keep);
    // The hint: a gold outline round the tile to push, and a gold arrow toward the gap.
    const gold = keep(new T.MeshBasicMaterial({ color: "#ffb21f", transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: T.DoubleSide }));
    this.hinted = new T.Mesh(undefined, gold);
    this.hinted.visible = false;
    this.hinted.renderOrder = 9;
    this.scene.add(this.hinted);
    const bar = new T.PlaneGeometry(1, 0.11);
    bar.rotateX(-Math.PI / 2);
    bar.translate(0.5, 0, 0);
    const tip = new T.ShapeGeometry(new T.Shape([new T.Vector2(0, 0.22), new T.Vector2(0.34, 0), new T.Vector2(0, -0.22)]));
    tip.rotateX(-Math.PI / 2);
    this.shaft = new T.Mesh(keep(bar), gold);
    const head = new T.Mesh(keep(tip), gold);
    head.name = "tip";
    this.shaft.renderOrder = head.renderOrder = 10;
    this.arrow.add(this.shaft, head);
    this.arrow.visible = false;
    this.scene.add(this.arrow);
    // A dragged tile is followed at the height of the tiles' tops.
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -TILE_TOP);
    this.begin();
  }
  /** What stands on the desk round the tray, kept low and clear of it. */
  private desk(keep: <R extends { dispose(): void }>(r: R) => R) {
    const random = sequence(57);
    // A desk lamp at the far left: a weighted foot, two arms, a shade lit inside, and its warm light.
    const lampPaint = keep(glossy({ color: "#f2c94c", roughness: 0.35 }, 0.6)),
      steel = this.standard({ color: "#c9ccd2", roughness: 0.3, metalness: 0.75 }),
      lamp = new T.Group();
    this.add(new T.CylinderGeometry(0.62, 0.7, 0.14, 32), lampPaint, 0, 0.07, 0, lamp);
    const arm = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      const from = new T.Vector3(x0, y0, z0),
        to = new T.Vector3(x1, y1, z1),
        length = from.distanceTo(to),
        mesh = this.add(new T.CylinderGeometry(0.06, 0.06, length, 12), steel, 0, 0, 0, lamp);
      mesh.position.copy(from).lerp(to, 0.5);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      this.add(new T.SphereGeometry(0.1, 14, 10), lampPaint, x1, y1, z1, lamp);
    };
    arm(0, 0.14, 0, 0.35, 2.0, 0.25);
    arm(0.35, 2.0, 0.25, 1.35, 2.5, 0.85);
    const shade = new T.Group();
    this.add(new T.CylinderGeometry(0.22, 0.62, 0.7, 28, 1, true), keep(new T.MeshStandardMaterial({ color: "#f2c94c", roughness: 0.35, side: T.DoubleSide })), 0, 0, 0, shade);
    this.add(new T.CircleGeometry(0.21, 24).rotateX(Math.PI / 2), lampPaint, 0, 0.35, 0, shade);
    this.add(new T.SphereGeometry(0.2, 16, 12), this.standard({ color: "#fff8e0", emissive: "#fff0c0", emissiveIntensity: 1.6 }), 0, -0.12, 0, shade).castShadow = false;
    shade.position.set(1.35, 2.42, 0.85);
    shade.rotation.set(0.5, 0, 0.62);
    lamp.add(shade);
    const bulb = new T.PointLight("#ffd9a0", 4, 9, 1.6);
    bulb.position.set(1.62, 2.1, 1.15);
    lamp.add(bulb);
    lamp.position.set(-5.3, 0, -2.9);
    lamp.rotation.y = -0.55;
    this.scene.add(lamp);
    // A cup of coloured pencils at the right.
    const cup = new T.Group();
    this.add(new T.CylinderGeometry(0.46, 0.4, 1.0, 28, 1, true), keep(new T.MeshStandardMaterial({ color: "#4f86c6", roughness: 0.5, side: T.DoubleSide })), 0, 0.5, 0, cup);
    this.add(new T.CircleGeometry(0.4, 24).rotateX(-Math.PI / 2), this.standard({ color: "#3d6ea8" }), 0, 0.03, 0, cup);
    this.add(new T.TorusGeometry(0.455, 0.035, 8, 28).rotateX(Math.PI / 2), this.standard({ color: "#3d6ea8" }), 0, 1.0, 0, cup);
    const pencil = (colour: string, length: number) => {
      const g = new T.Group(),
        paint = this.standard({ color: colour, roughness: 0.45 });
      this.add(new T.CylinderGeometry(0.06, 0.06, length, 6), paint, 0, length / 2, 0, g);
      this.add(new T.ConeGeometry(0.06, 0.18, 6), this.standard({ color: "#e8c89a", roughness: 0.7 }), 0, length + 0.09, 0, g);
      this.add(new T.ConeGeometry(0.022, 0.07, 6), this.standard({ color: colour === "#2c2c2c" ? "#2c2c2c" : colour, roughness: 0.5 }), 0, length + 0.15, 0, g);
      return g;
    };
    ["#e04a3a", "#f2a531", "#f4d23c", "#4caf50", "#2f80d0", "#8e5bc8", "#ef6fa0"].forEach((colour, k) => {
      const p = pencil(colour, 1.5 + random() * 0.35),
        a = (k / 7) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2);
      p.rotation.set(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22);
      cup.add(p);
    });
    cup.position.set(4.35, 0, -2.25);
    this.scene.add(cup);
    // A stack of books at the far right.
    const books = new T.Group();
    [["#c0392b", 2.0, 1.45, 0.3], ["#2e86ab", 1.9, 1.35, 0.26], ["#f1c40f", 1.75, 1.3, 0.22], ["#27ae60", 1.6, 1.2, 0.24]].forEach(([colour, w, d, h], k) => {
      const y = [0, 0.3, 0.56, 0.78][k] as number,
        cover = this.standard({ color: colour as string, roughness: 0.6 }),
        pages = this.standard({ color: "#f6f1e2", roughness: 0.9 });
      const book = this.add(block(w as number, h as number, d as number, 0.03), [pages, cover, cover, cover, pages, pages], 0, y + (h as number) / 2, 0, books);
      book.rotation.y = (random() - 0.5) * 0.3;
    });
    books.position.set(5.6, 0, -0.6);
    books.rotation.y = 0.3;
    this.scene.add(books);
    // A notebook at the left with a pencil laid on it.
    const cover = this.standard({ map: keep(texture(coverSheet("#f28c8c"))), roughness: 0.7 }),
      leaves = this.standard({ color: "#fbf8ee", roughness: 0.9 });
    const book = this.add(block(1.6, 0.12, 2.0, 0.02), [leaves, leaves, cover, leaves, leaves, leaves], -4.45, 0.06, 0.35);
    book.rotation.y = 0.18;
    const lying = pencil("#2f80d0", 1.6);
    lying.rotation.set(Math.PI / 2, 0, 0.9);
    lying.position.set(-4.1, 0.19, 0.4);
    this.scene.add(lying);
    // A red toy car at the near left: a body, a cabin, four wheels.
    const car = new T.Group(),
      red = keep(glossy({ color: "#d8342a", roughness: 0.3 }, 0.7)),
      tyre = this.standard({ color: "#222226", roughness: 0.8 }),
      hub = this.standard({ color: "#e6e0d0", roughness: 0.4 });
    this.add(block(1.2, 0.32, 0.6, 0.12), red, 0, 0.3, 0, car);
    this.add(block(0.62, 0.3, 0.52, 0.1), keep(glossy({ color: "#f3f0e6", roughness: 0.3 }, 0.5)), -0.08, 0.58, 0, car);
    for (const [x, z] of [[-0.38, 0.3], [0.38, 0.3], [-0.38, -0.3], [0.38, -0.3]]) {
      this.add(new T.CylinderGeometry(0.17, 0.17, 0.1, 18).rotateX(Math.PI / 2), tyre, x, 0.17, z, car);
      this.add(new T.CylinderGeometry(0.08, 0.08, 0.11, 12).rotateX(Math.PI / 2), hub, x, 0.17, z, car);
    }
    car.position.set(-4.3, 0, 2.55);
    car.rotation.y = -0.5;
    this.scene.add(car);
    // A small alarm clock at the far left of centre, behind the tray.
    const clock = new T.Group(),
      shell = keep(glossy({ color: "#5cb88a", roughness: 0.35 }, 0.6));
    this.add(new T.CylinderGeometry(0.55, 0.55, 0.36, 32).rotateX(Math.PI / 2), shell, 0, 0.62, 0, clock);
    this.add(new T.CircleGeometry(0.46, 32), this.standard({ map: keep(texture(clockFace())), roughness: 0.4 }), 0, 0.62, 0.185, clock);
    for (const sx of [-1, 1]) {
      this.add(new T.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell, sx * 0.32, 1.1, 0, clock).rotation.z = -sx * 0.5;
      this.add(new T.CylinderGeometry(0.04, 0.05, 0.24, 8), steel, sx * 0.32, 0.12, 0, clock).rotation.z = sx * 0.4;
    }
    clock.position.set(-1.6, 0, -3.9);
    clock.rotation.y = 0.25;
    this.scene.add(clock);
    // An eraser and a ruler at the near right.
    this.add(block(0.62, 0.18, 0.32, 0.04), this.standard({ color: "#f6b8c8", roughness: 0.9 }), 4.0, 0.09, 2.6).rotation.y = 0.4;
    this.add(block(0.3, 0.19, 0.33, 0.04), this.standard({ color: "#3a6fc0", roughness: 0.7 }), 3.74, 0.095, 2.48).rotation.y = 0.4;
    this.add(block(3.2, 0.04, 0.42, 0.015), keep(glossy({ color: "#f3e7a8", roughness: 0.3, transparent: true, opacity: 0.85 }, 0.5)), 4.4, 0.02, 1.2).rotation.y = -1.25;
  }
  /** Builds the tiles of a tray (their places are set by `place`). */
  private lay(state: State) {
    const key = `${state.size}|${state.picture}`;
    if (key === this.built) return;
    this.built = key;
    for (const r of this.made) r.dispose();
    this.made = [];
    this.board.clear();
    const n = state.size,
      cell = cellSize(n),
      side = cell - GAP,
      top = side - 2 * PRINT_IN,
      make = <R extends { dispose(): void }>(r: R) => (this.made.push(r), r),
      body = make(block(side, TILE_HIGH, side, EDGE, 3)),
      sheet = make(texture(state.picture ? paintPicture(state.picture, n, insetOf(n)) : numberSheet(n)));
    this.print = make(
      new T.MeshStandardMaterial(
        state.picture
          ? { map: sheet, roughness: 0.42, emissive: "#ffffff", emissiveMap: sheet, emissiveIntensity: 0 }
          : { map: sheet, transparent: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false, emissive: "#ff6a3a", emissiveMap: sheet, emissiveIntensity: 0 },
      ),
    );
    this.outline = make(new T.ShapeGeometry(Object.assign(roundedRect(new T.Shape(), side / 2 + 0.07, side / 2 + 0.07, 0.12), { holes: [roundedRect(new T.Path(), side / 2 + 0.01, side / 2 + 0.01, 0.08)] }), 6).rotateX(-Math.PI / 2));
    this.hinted.geometry = this.outline;
    this.models = [new T.Group()];
    for (let t = 1; t <= n * n; t++) {
      const home = t - 1,
        model = new T.Group(),
        mesh = new T.Mesh(body, this.maple);
      mesh.castShadow = mesh.receiveShadow = true;
      // The grain differs from tile to tile: each turned a quarter or a half.
      mesh.rotation.y = (home % 4) * (Math.PI / 2);
      model.add(mesh);
      // The print on top: the tile's own number, or its part of the picture, by the corners of its place in the sheet.
      const face = new T.PlaneGeometry(top, top).rotateX(-Math.PI / 2),
        uv = face.getAttribute("uv"),
        r = Math.floor(home / n),
        c = home % n,
        m = insetOf(n);
      for (let k = 0; k < uv.count; k++) {
        const u = uv.getX(k),
          v = uv.getY(k);
        uv.setXY(k, (c + m + u * (1 - 2 * m)) / n, 1 - (r + m + (1 - v) * (1 - 2 * m)) / n);
      }
      const print = new T.Mesh(make(face), this.print);
      print.position.y = TILE_HIGH / 2 + 0.002;
      print.receiveShadow = true;
      print.renderOrder = 2;
      model.add(print);
      model.userData.tile = t;
      this.board.add(model);
      this.models.push(model);
    }
  }
  protected subject(aspect: number): TableSubject {
    return slideSubject(aspect);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const cell = cellSize(state.size);
    return state.tiles.map((_, point) => ({ ...cellAt(state.size, point), y: TILE_TOP, r: cell * 0.72, point }));
  }
  protected hover(point: number) {
    const state = this.state;
    if (this.held) return;
    this.renderer.domElement.style.cursor = state && state.winner === null && point >= 0 && pushOf(state, point) ? "pointer" : "default";
  }
  /** A press on a tile in the gap's line takes the gesture: a drag toward the gap, or a tap. */
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null) return false;
    const push = pushOf(state, point);
    if (!push) return false;
    const tiles = push.cells.map((cell) => state.tiles[cell]);
    this.held = {
      from: point,
      gap: push.gap,
      tiles,
      origin: push.cells.map((cell) => cellAt(state.size, cell)),
      dx: push.dx,
      dz: push.dz,
      start: { x: at.x, z: at.z },
      shift: 0,
      travel: 0,
    };
    this.renderer.domElement.style.cursor = "grabbing";
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const held = this.held,
      state = this.state;
    if (!held || !state) return;
    const cell = cellSize(state.size),
      along = (at.x - held.start.x) * held.dx + (at.z - held.start.z) * held.dz;
    held.travel = Math.max(held.travel, Math.hypot(at.x - held.start.x, at.z - held.start.z));
    held.shift = Math.max(0, Math.min(cell, along));
    held.tiles.forEach((t, k) => this.models[t].position.set(held.origin[k].x + held.dx * held.shift, this.models[t].position.y, held.origin[k].z + held.dz * held.shift));
    this.redraw();
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const held = this.held,
      state = this.state;
    this.held = null;
    this.renderer.domElement.style.cursor = "pointer";
    if (!held || !state) return;
    const cell = cellSize(state.size),
      // A press that hardly moved is a tap; a drag carried far enough toward the gap is a push too.
      pushed = at !== null && (held.travel < cell * 0.14 || held.shift >= cell * 0.35);
    if (pushed) {
      this.dropped = new Map(held.tiles.map((t) => [t, { x: this.models[t].position.x, z: this.models[t].position.z }]));
      this.onMove({ from: held.from, to: held.gap, extra: -1 });
      // A push that was not taken (the table was still busy) leaves the tiles to go back.
      if (this.state !== state) return;
      this.dropped = null;
    }
    const from = held.shift;
    if (from < 1e-3) return this.place(state);
    this.tween(0, 120, (p) => {
      const s = from * (1 - p) ** 2;
      held.tiles.forEach((t, k) => this.models[t].position.set(held.origin[k].x + held.dx * s, this.models[t].position.y, held.origin[k].z + held.dz * s));
    });
  }
  /** Sets how strongly the frame (and the picture, or the numbers) glow. */
  private glow(amount: number) {
    this.glowing = amount;
    this.walnut.emissiveIntensity = amount * 0.3;
    if (this.print) this.print.emissiveIntensity = amount * (this.state?.picture ? 0.34 : 0.5);
  }
  protected place(state: State) {
    this.lay(state);
    const n = state.size,
      rest = TILE_HIGH / 2 + WELL;
    for (let t = 1; t < this.models.length; t++) this.models[t].visible = false;
    state.tiles.forEach((t, cell) => {
      if (!t) return;
      const model = this.models[t],
        p = cellAt(n, cell);
      model.visible = true;
      model.position.set(p.x, rest, p.z);
    });
    // The missing tile stands in its corner once the puzzle is solved.
    const last = this.models[n * n];
    if (last && state.winner === 0) {
      const p = cellAt(n, n * n - 1);
      last.visible = true;
      last.position.set(p.x, rest, p.z);
    }
    this.glow(state.winner === 0 ? 1 : 0);
    this.mark(this.marks);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1 || before.size !== state.size) return false;
    const n = state.size,
      rest = TILE_HIGH / 2 + WELL,
      dropped = this.dropped;
    this.dropped = null;
    const paths = last.tiles.map((t) => {
      const start = dropped?.get(t) ?? cellAt(n, before.tiles.indexOf(t)),
        end = cellAt(n, state.tiles.indexOf(t));
      return { model: this.models[t], start, end };
    });
    const slide = 120 + 35 * (last.tiles.length - 1);
    this.tween(0, slide, (p) => {
      const e = 1 - (1 - p) ** 3;
      for (const { model, start, end } of paths) model.position.set(start.x + (end.x - start.x) * e, rest, start.z + (end.z - start.z) * e);
      if (p === 1) this.onContact();
    });
    if (state.winner !== 0) return true;
    // Solved: the missing tile drops into its corner with a knock, and the frame and the picture glow.
    const lastTile = this.models[n * n],
      corner = cellAt(n, n * n - 1);
    let landed = false;
    this.tween(slide + 120, 620, (p) => {
      lastTile.visible = true;
      lastTile.position.set(corner.x, rest + DROP * fall(p), corner.z);
      lastTile.rotation.y = (1 - Math.min(1, p / 0.8)) * 0.5;
      if (p >= 0.8 && !landed) {
        landed = true;
        this.onContact();
      }
    });
    this.tween(slide + 620, 1500, (p) => this.glow(Math.min(1, p * 3) * (1 + 0.6 * Math.sin(p * Math.PI * 3) * (1 - p))));
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state,
      hint = marks.hint ?? null;
    if (!state || !hint || state.winner !== null || !this.outline) {
      this.hinted.visible = this.arrow.visible = false;
      return;
    }
    const n = state.size,
      from = cellAt(n, hint.from),
      to = cellAt(n, hint.to),
      y = TILE_TOP + 0.03;
    this.hinted.visible = true;
    this.hinted.position.set(from.x, y, from.z);
    // The arrow runs from the tile pushed toward the gap.
    const length = Math.hypot(to.x - from.x, to.z - from.z),
      reach = Math.max(0.2, length - 0.3);
    this.arrow.visible = true;
    this.arrow.position.set(from.x, y + 0.02, from.z);
    this.arrow.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x);
    this.shaft.scale.x = reach;
    this.arrow.getObjectByName("tip")!.position.x = reach;
  }
  dispose() {
    for (const r of this.made) r.dispose();
    this.made = [];
    super.dispose();
  }
}
