import * as T from "three";
import { COLORS } from "./rules";
import { CELLS, N } from "./sim";

/**
 * The field of 땅따먹기 as one picture (a canvas texture over the ground): bare cells a pale cloth with a dot at each
 * corner, and each mover's land its own pattern in its colour — stripes for red, scales for blue, dots for yellow,
 * leaves for green — drawn so that one patch's pattern runs on unbroken across its cells. Land stands a little
 * above the bare cloth: where its edge faces the viewer a darker band shows its side, and a light line its top edge.
 * Only the cells that changed (and their neighbours, whose edges may have) are drawn again.
 */
export const PX = 16;
const TILE = 64;
function shade(hex: string, by: number) {
  const c = new T.Color(hex);
  if (by < 0) c.lerp(new T.Color("#000000"), -by);
  else c.lerp(new T.Color("#ffffff"), by);
  return `#${c.getHexString()}`;
}
/** A pattern's tile, 64 pixels square, for seat `k` (or the bare cloth for -1). */
function tile(k: number) {
  const c = document.createElement("canvas");
  c.width = c.height = TILE;
  const g = c.getContext("2d")!;
  if (k < 0) {
    // The bare cloth: a warm pale ground, a soft mottle, a fine thread of each cell's edge.
    g.fillStyle = "#f3efe3";
    g.fillRect(0, 0, TILE, TILE);
    let seed = 11;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? "#ece6d6" : "#f8f5ec";
      g.fillRect(Math.floor(r() * TILE), Math.floor(r() * TILE), 1 + Math.floor(r() * 2), 1);
    }
    g.fillStyle = "#e4ddca";
    for (let i = 0; i < TILE; i += PX) {
      g.fillRect(0, i, TILE, 1);
      g.fillRect(i, 0, 1, TILE);
    }
    return c;
  }
  const base = COLORS[k],
    light = shade(base, 0.22),
    deep = shade(base, -0.12);
  g.fillStyle = base;
  g.fillRect(0, 0, TILE, TILE);
  g.fillStyle = light;
  g.strokeStyle = light;
  if (k === 0) {
    // Red: broad stripes on the slant.
    g.lineWidth = 9;
    for (let i = -TILE; i < TILE * 2; i += 21.33) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + TILE, TILE);
      g.stroke();
    }
  } else if (k === 1) {
    // Blue: rows of scales.
    g.lineWidth = 3;
    for (let row = 0; row <= 4; row++)
      for (let col = -1; col <= 4; col++) {
        const x = col * 16 + (row % 2 ? 8 : 0),
          y = row * 16;
        g.beginPath();
        g.arc(x + 8, y, 8, 0, Math.PI);
        g.stroke();
      }
  } else if (k === 2) {
    // Yellow: dots, every other row shifted.
    for (let row = 0; row < 4; row++)
      for (let col = 0; col <= 4; col++) {
        g.beginPath();
        g.arc(col * 16 + (row % 2 ? 8 : 0), row * 16 + 8, 4.2, 0, Math.PI * 2);
        g.fill();
      }
  } else {
    // Green: small leaves, set two ways.
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4; col++) {
        const cx = col * 16 + 8,
          cy = row * 16 + 8;
        g.save();
        g.translate(cx, cy);
        g.rotate((row + col) % 2 ? Math.PI / 4 : -Math.PI / 4);
        g.beginPath();
        g.ellipse(0, 0, 6, 2.6, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
  }
  // A soft speckle of the darker shade, so that the colour is not flat.
  g.fillStyle = deep;
  for (let i = 0; i < 40; i++) g.fillRect((i * 37) % TILE, (i * 23 + i * i) % TILE, 1, 1);
  return c;
}
export class FieldPaint {
  readonly canvas = document.createElement("canvas");
  readonly texture: T.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private patterns: CanvasPattern[];
  private sides: string[];
  private tops: string[];
  private painted = new Uint8Array(CELLS).fill(255);
  constructor(seats: number[]) {
    this.canvas.width = this.canvas.height = N * PX;
    this.g = this.canvas.getContext("2d")!;
    this.patterns = [tile(-1), ...seats.map((s) => tile(s))].map((t) => this.g.createPattern(t, "repeat")!);
    this.sides = ["", ...seats.map((s) => shade(COLORS[s], -0.38))];
    this.tops = ["", ...seats.map((s) => shade(COLORS[s], 0.45))];
    this.texture = new T.CanvasTexture(this.canvas);
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }
  /** Draws again the cells in `changed` (and their neighbours) as `owner` has them; true when anything was drawn. */
  paint(owner: Uint8Array, changed: Iterable<number>) {
    const todo = new Set<number>();
    for (const c of changed) {
      const x = c % N;
      todo.add(c);
      if (x > 0) todo.add(c - 1);
      if (x < N - 1) todo.add(c + 1);
      if (c >= N) todo.add(c - N);
      if (c < CELLS - N) todo.add(c + N);
    }
    if (!todo.size) return false;
    for (const c of todo) this.cell(owner, c);
    this.texture.needsUpdate = true;
    return true;
  }
  /** Draws the whole field. */
  all(owner: Uint8Array) {
    this.painted.fill(255);
    for (let c = 0; c < CELLS; c++) this.cell(owner, c);
    this.texture.needsUpdate = true;
  }
  private cell(owner: Uint8Array, c: number) {
    const g = this.g,
      x = c % N,
      y = (c - x) / N,
      who = owner[c],
      px = x * PX,
      py = y * PX;
    g.fillStyle = this.patterns[who] ?? this.patterns[0];
    g.fillRect(px, py, PX, PX);
    this.painted[c] = who;
    if (!who) {
      // Bare cloth just below a patch of land: its shadow.
      if (y > 0 && owner[c - N]) {
        g.fillStyle = "#0000001f";
        g.fillRect(px, py, PX, 4);
      }
      return;
    }
    const other = (n: number) => owner[n] !== who;
    // Its side toward the viewer (the cell below is not its own), its top edge, and its ends darkened a hair.
    if (y === N - 1 || other(c + N)) {
      g.fillStyle = this.sides[who];
      g.fillRect(px, py + PX - 5, PX, 5);
    }
    if (y > 0 && other(c - N)) {
      g.fillStyle = this.tops[who];
      g.fillRect(px, py, PX, 2);
    }
    g.fillStyle = "#00000026";
    if (x > 0 && other(c - 1)) g.fillRect(px, py, 1.5, PX);
    if (x < N - 1 && other(c + 1)) g.fillRect(px + PX - 1.5, py, 1.5, PX);
  }
}
/** A meadow's grass, repeating: mottled greens with blades. */
export function grass() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#6fae4d";
  g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = r() < 0.5 ? "#79b956" : "#64a043";
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 10 + r() * 22, 6 + r() * 14, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 1600; i++) {
    const x = r() * 256,
      y = r() * 256;
    g.strokeStyle = r() < 0.5 ? "#8fcf68" : "#4f8a35";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4);
    g.stroke();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** A label over a mover: its name in a pill of its colour, white letters, a point under it. */
export function nameTag(text: string, color: string, mine: boolean) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.font = `900 ${mine ? 46 : 40}px "Pretendard", "Noto Sans KR", sans-serif`;
  const w = Math.min(236, g.measureText(text).width + 44);
  g.fillStyle = color;
  g.strokeStyle = "#ffffff";
  g.lineWidth = mine ? 6 : 4;
  g.beginPath();
  g.roundRect(128 - w / 2, 8, w, 60, 30);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(116, 66);
  g.lineTo(128, 84);
  g.lineTo(140, 66);
  g.closePath();
  g.fill();
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 40);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
