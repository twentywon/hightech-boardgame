import * as T from "three";
import { COLORS } from "./rules";
import { G } from "./sim";

/**
 * The field of 땅따먹기 as one picture (a canvas texture over the ground): bare ground a pale cloth, and each mover's
 * land its own pattern in its colour — stripes for red, scales for blue, dots for yellow, leaves for green — drawn so
 * that one patch's pattern runs on unbroken. The land is fine cells (`sim.ts`), but it is drawn as smooth shapes (the
 * user asked for land that follows the way one went, not squares): each mover's outline is traced between the
 * cells' middles over its cells softened a little (marching squares), so a curve comes out a curve and a staircase a
 * slope. Land stands a little above the bare cloth: a darker band at its lower edge shows its side, a light line its
 * top edge, and it casts a soft shadow on the cloth. Only the blocks of the picture where cells changed are drawn
 * again.
 */
/** Pixels to a cell, and cells to a block of the picture that is drawn again at once. */
export const PX = 1024 / G;
const BLOCK = 8,
  BLOCKS = G / BLOCK;
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
    // A few soft blotches, faint: no lines and no squares on it (the land is not cells to the eye).
    for (let i = 0; i < 18; i++) {
      g.fillStyle = r() < 0.5 ? "#efe9da55" : "#f7f3e955";
      g.beginPath();
      g.ellipse(r() * TILE, r() * TILE, 3 + r() * 7, 2 + r() * 5, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
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
    // (Each line runs on past the tile's edges, so that its square ends leave no notch where tiles meet.)
    for (let i = -TILE; i < TILE * 2; i += TILE / 3) {
      g.beginPath();
      g.moveTo(i - 12, -12);
      g.lineTo(i + TILE + 12, TILE + 12);
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
type Point = [number, number];
/** The softening, each way: a cell's share is spread over two cells about it (a bell). */
const BLUR = [0.06, 0.24, 0.4, 0.24, 0.06];
export class FieldPaint {
  readonly canvas = document.createElement("canvas");
  readonly texture: T.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private patterns: CanvasPattern[];
  private sides: string[];
  private tops: string[];
  /** A mover's softened share of each cell near a block (its own cells 1, softened by its neighbours'). */
  private soft = new Float32Array((BLOCK + 6) * (BLOCK + 6));
  constructor(private readonly seats: number[]) {
    this.canvas.width = this.canvas.height = G * PX;
    this.g = this.canvas.getContext("2d")!;
    this.patterns = [tile(-1), ...seats.map((s) => tile(s))].map((t) => this.g.createPattern(t, "repeat")!);
    this.sides = ["", ...seats.map((s) => shade(COLORS[s], -0.38))];
    this.tops = ["", ...seats.map((s) => shade(COLORS[s], 0.45))];
    this.texture = new T.CanvasTexture(this.canvas);
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }
  /** Draws again the blocks the cells in `changed` touch, as `owner` has them; true when anything was drawn. */
  paint(owner: Uint8Array, changed: Iterable<number>) {
    const todo = new Set<number>();
    for (const c of changed) {
      const x = c % G,
        y = (c - x) / G;
      // A cell shapes the outline a cell about it (and the side and shadow a few pixels below).
      for (const by of new Set([Math.floor((y - 2) / BLOCK), Math.floor(y / BLOCK), Math.floor((y + 2) / BLOCK)]))
        for (const bx of new Set([Math.floor((x - 2) / BLOCK), Math.floor(x / BLOCK), Math.floor((x + 2) / BLOCK)]))
          if (bx >= 0 && by >= 0 && bx < BLOCKS && by < BLOCKS) todo.add(by * BLOCKS + bx);
    }
    if (!todo.size) return false;
    for (const b of todo) this.block(owner, b % BLOCKS, Math.floor(b / BLOCKS));
    this.texture.needsUpdate = true;
    return true;
  }
  /** Draws the whole field. */
  all(owner: Uint8Array) {
    for (let by = 0; by < BLOCKS; by++) for (let bx = 0; bx < BLOCKS; bx++) this.block(owner, bx, by);
    this.texture.needsUpdate = true;
  }
  /**
   * Mover `who`'s land about block (`bx`, `by`) in pixels: `fill`, pieces that together cover it, and `edge`, its
   * outline alone. The outline runs between the cells' middles where its softened share (its cells spread over two
   * cells about them, as a bell) crosses one half, each square between four middles taken in four by its
   * share between them (marching squares), so that a curve comes out a curve and a staircase a slope; a strip one
   * cell wide stays. The field's edge is as the cell beside it.
   */
  private outline(owner: Uint8Array, who: number, bx: number, by: number) {
    const M = 3,
      W = BLOCK + 2 * M,
      x0 = bx * BLOCK - M,
      y0 = by * BLOCK - M,
      soft = this.soft,
      at = (x: number, y: number) => (owner[Math.max(0, Math.min(G - 1, y)) * G + Math.max(0, Math.min(G - 1, x))] === who ? 1 : 0);
    let any = false;
    for (let j = 0; j < W; j++)
      for (let i = 0; i < W; i++) {
        const x = x0 + i,
          y = y0 + j;
        let v = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) v += at(x + dx, y + dy) * BLUR[dx + 2] * BLUR[dy + 2];
        // A strip a cell or two wide would soften away: its own cells stay over the half.
        v = Math.max(v, at(x, y) * 0.62);
        soft[j * W + i] = v;
        if (v > 0.5) any = true;
      }
    const fill = new Path2D(),
      edge = new Path2D();
    if (!any) return null;
    const S = 2,
      value = (i: number, j: number) => {
        // The share between the middles, bilinear: (i, j) in halves of a square from the block's first middle.
        const ci = Math.floor(i / S),
          cj = Math.floor(j / S),
          u = i / S - ci,
          w = j / S - cj,
          a = soft[cj * W + ci],
          b = soft[cj * W + Math.min(W - 1, ci + 1)],
          c = soft[Math.min(W - 1, cj + 1) * W + ci],
          d = soft[Math.min(W - 1, cj + 1) * W + Math.min(W - 1, ci + 1)];
        return a * (1 - u) * (1 - w) + b * u * (1 - w) + c * (1 - u) * w + d * u * w;
      },
      px = (i: number) => (x0 + i / S + 0.5) * PX,
      py = (j: number) => (y0 + j / S + 0.5) * PX,
      lo = (M - 2) * S,
      hi = (W - M + 1) * S;
    for (let j = lo; j < hi; j++)
      for (let i = lo; i < hi; i++) {
        const corners: [number, number, number][] = [
          [i, j, value(i, j)],
          [i + 1, j, value(i + 1, j)],
          [i + 1, j + 1, value(i + 1, j + 1)],
          [i, j + 1, value(i, j + 1)],
        ];
        const inside = corners.map((c) => c[2] > 0.5);
        const n = inside.filter(Boolean).length;
        if (!n) continue;
        if (n === 4) {
          fill.rect(px(i), py(j), PX / S, PX / S);
          continue;
        }
        const cross = (a: [number, number, number], b: [number, number, number]): Point => {
          const t = (0.5 - a[2]) / (b[2] - a[2]);
          return [px(a[0] + (b[0] - a[0]) * t), py(a[1] + (b[1] - a[1]) * t)];
        };
        const piece = (poly: Point[]) => {
          fill.moveTo(poly[0][0], poly[0][1]);
          for (let k = 1; k < poly.length; k++) fill.lineTo(poly[k][0], poly[k][1]);
          fill.closePath();
        };
        const line = (a: Point, b: Point) => {
          edge.moveTo(a[0], a[1]);
          edge.lineTo(b[0], b[1]);
        };
        // Two opposite corners alone: two corners cut off, kept apart (land touching only at a corner stays apart).
        if (n === 2 && inside[0] === inside[2]) {
          for (let s = 0; s < 4; s++)
            if (inside[s]) {
              const a = corners[s],
                from = cross(corners[(s + 3) % 4], a),
                to = cross(a, corners[(s + 1) % 4]);
              piece([[px(a[0]), py(a[1])], to, from]);
              line(from, to);
            }
          continue;
        }
        const poly: Point[] = [],
          crossings: Point[] = [];
        for (let s = 0; s < 4; s++) {
          const a = corners[s],
            b = corners[(s + 1) % 4];
          if (inside[s]) poly.push([px(a[0]), py(a[1])]);
          if (inside[s] !== inside[(s + 1) % 4]) {
            const p = cross(a, b);
            poly.push(p);
            crossings.push(p);
          }
        }
        piece(poly);
        if (crossings.length === 2) line(crossings[0], crossings[1]);
      }
    return { fill, edge };
  }
  private block(owner: Uint8Array, bx: number, by: number) {
    const g = this.g,
      size = BLOCK * PX,
      x0 = bx * size,
      y0 = by * size;
    // Whose land lies about the block.
    const who = new Set<number>();
    for (let y = Math.max(0, by * BLOCK - 2); y < Math.min(G, (by + 1) * BLOCK + 2); y++)
      for (let x = Math.max(0, bx * BLOCK - 2); x < Math.min(G, (bx + 1) * BLOCK + 2); x++) if (owner[y * G + x]) who.add(owner[y * G + x]);
    g.save();
    g.beginPath();
    g.rect(x0, y0, size, size);
    g.clip();
    g.fillStyle = this.patterns[0];
    g.fillRect(x0, y0, size, size);
    if (!who.size) {
      g.restore();
      return;
    }
    const paths = [...who]
      .sort()
      .map((k) => ({ k, shape: this.outline(owner, k, bx, by) }))
      .flatMap(({ k, shape }) => (shape ? [{ k, path: shape.fill, edge: shape.edge }] : []));
    // The land's soft shadow on the cloth below it.
    g.fillStyle = "#00000022";
    g.setTransform(1, 0, 0, 1, 0, 4);
    for (const { path } of paths) g.fill(path);
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (const { k, path, edge } of paths) {
      const pattern = this.patterns[k] ?? this.patterns[0];
      // A hair round the outline, so that two lands meeting leave no thread of cloth between them.
      g.strokeStyle = pattern;
      g.lineWidth = 1.6;
      g.stroke(edge);
      g.save();
      g.clip(path);
      // The top edge light, the side toward the viewer dark, the pattern between (clips of the outline moved).
      g.fillStyle = this.tops[k];
      g.fillRect(x0, y0, size, size);
      g.setTransform(1, 0, 0, 1, 0, 2);
      g.clip(path);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = this.sides[k];
      g.fillRect(x0, y0, size, size);
      g.setTransform(1, 0, 0, 1, 0, -4);
      g.clip(path);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = pattern;
      g.fillRect(x0, y0, size, size);
      g.restore();
      g.strokeStyle = "#00000024";
      g.lineWidth = 1;
      g.stroke(edge);
    }
    g.restore();
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
