import * as T from "three";
import { block, capable } from "../../engine/scene-utils";
import { colourOf, isJoker, numberOf } from "./rules";

/**
 * The tiles: thick ivory blocks with a rounded bevel, their numbers cut into the face and filled with colour. Every
 * face, the back and the plain sides are cells of one picture (`atlas`), and each kind of tile has its own copy of
 * the rounded block with its texture coordinates set to its cells, so a tile is drawn in one call with one shared
 * material (the old six-sided tiles took six). Where a graphics card draws, a relief picture of the same cells
 * sinks the numbers into the face.
 */
export const W = 0.8,
  D = 1.12,
  /** How thick a tile is. */
  TH = 0.2;
export const INK = ["#c8321f", "#1f5fc0", "#d98a12", "#1c1d21"];
const COLS = 8,
  ROWS = 7,
  CW = 144,
  CH = 202,
  /** The cells: 52 faces (colour × 13 + number − 1), the joker, the back, and the plain ivory of the sides. */
  JOKER_CELL = 52,
  BACK_CELL = 53,
  PLAIN_CELL = 54;
const cellOf = (index: number) => ({ x: (index % COLS) * CW, y: Math.floor(index / COLS) * CH });
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The key a tile's look is known by: two tiles of one colour and number look alike, as do the jokers. */
export const kindOf = (tile: number) => (isJoker(tile) ? JOKER_CELL : colourOf(tile) * 13 + numberOf(tile) - 1);

function ivory(ctx: CanvasRenderingContext2D, x: number, y: number, tone = 0) {
  const g = ctx.createLinearGradient(x, y, x + CW, y + CH);
  g.addColorStop(0, tone ? "#ece2c8" : "#fbf6e8");
  g.addColorStop(1, tone ? "#e2d6b8" : "#f1e8d2");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, CW, CH);
}
/** A smiling face of our own for the joker, drawn in the four inks. */
function joker(ctx: CanvasRenderingContext2D, x: number, y: number, relief: boolean) {
  const cx = x + CW / 2,
    cy = y + CH * 0.44,
    r = CW * 0.3;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.strokeStyle = relief ? "#000" : INK[0];
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = relief ? "#000" : INK[1];
  for (const dx of [-0.38, 0.38]) {
    ctx.beginPath();
    ctx.arc(cx + dx * r, cy - 0.22 * r, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = relief ? "#000" : INK[3];
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy + 0.05 * r, r * 0.55, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  // A three-pointed cap.
  ctx.fillStyle = relief ? "#000" : INK[2];
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.9, cy - r * 0.75);
  ctx.lineTo(cx - r * 0.55, cy - r * 1.45);
  ctx.lineTo(cx - r * 0.2, cy - r * 0.95);
  ctx.lineTo(cx, cy - r * 1.6);
  ctx.lineTo(cx + r * 0.2, cy - r * 0.95);
  ctx.lineTo(cx + r * 0.55, cy - r * 1.45);
  ctx.lineTo(cx + r * 0.9, cy - r * 0.75);
  ctx.closePath();
  ctx.fill();
}
/** Paints the cells: `relief` paints the depth picture instead (white the face, black what is cut into it). */
function paint(relief: boolean) {
  const c = document.createElement("canvas");
  c.width = COLS * CW;
  c.height = ROWS * CH;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = relief ? "#ffffff" : "#f6efdc";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let index = 0; index < 52; index++) {
    const { x, y } = cellOf(index),
      colour = Math.floor(index / 13),
      text = String((index % 13) + 1),
      font = `800 ${text.length > 1 ? 84 : 98}px "Helvetica Neue", Arial, sans-serif`,
      cx = x + CW / 2,
      cy = y + CH * 0.42;
    if (!relief) ivory(ctx, x, y);
    ctx.font = font;
    if (relief) {
      ctx.fillStyle = "#000000";
      ctx.fillText(text, cx, cy);
    } else {
      // Cut in: the upper left wall of the cut in shade, a glint on its lower right lip, the colour filling it.
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText(text, cx + 2.5, cy + 2.5);
      ctx.fillStyle = "rgba(40,30,20,0.55)";
      ctx.fillText(text, cx - 2, cy - 2);
      ctx.fillStyle = INK[colour];
      ctx.fillText(text, cx, cy);
    }
    // The small ring under the number, cut the same way.
    ctx.lineWidth = 7;
    for (const [dx, tint] of relief
      ? ([[0, "#000"]] as const)
      : ([
          [2, "rgba(255,255,255,0.9)"],
          [-1.5, "rgba(40,30,20,0.5)"],
          [0, INK[colour]],
        ] as const)) {
      ctx.strokeStyle = tint;
      ctx.beginPath();
      ctx.arc(cx + dx, y + CH * 0.8 + dx, 15, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const j = cellOf(JOKER_CELL);
  if (!relief) ivory(ctx, j.x, j.y);
  joker(ctx, j.x, j.y, relief);
  // The back: a quiet lattice pressed into it.
  const b = cellOf(BACK_CELL);
  if (!relief) ivory(ctx, b.x, b.y, 1);
  ctx.strokeStyle = relief ? "#9a9a9a" : "rgba(150,130,95,0.35)";
  ctx.lineWidth = 3;
  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x + 14, b.y + 14, CW - 28, CH - 28);
  ctx.clip();
  for (let k = -CH; k < CW + CH; k += 22) {
    ctx.beginPath();
    ctx.moveTo(b.x + k, b.y);
    ctx.lineTo(b.x + k + CH, b.y + CH);
    ctx.moveTo(b.x + k + CH, b.y);
    ctx.lineTo(b.x + k, b.y + CH);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeRect(b.x + 14, b.y + 14, CW - 28, CH - 28);
  const p = cellOf(PLAIN_CELL);
  if (!relief) ivory(ctx, p.x, p.y, 1);
  const t = new T.CanvasTexture(c);
  if (!relief) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** The tile's rounded block with its faces set to `face`'s cell, the back and the plain sides. */
function tileGeometry(base: T.BufferGeometry, face: number) {
  const geometry = base.clone(),
    uv = geometry.getAttribute("uv") as T.BufferAttribute,
    perFace = uv.count / 6,
    width = COLS * CW,
    height = ROWS * CH,
    inset = 3;
  for (let i = 0; i < uv.count; i++) {
    const side = Math.floor(i / perFace),
      cell = cellOf(side === 2 ? face : side === 3 ? BACK_CELL : PLAIN_CELL),
      u = (cell.x + inset + uv.getX(i) * (CW - 2 * inset)) / width,
      v = 1 - (cell.y + CH - inset - uv.getY(i) * (CH - 2 * inset)) / height;
    uv.setXY(i, u, v);
  }
  geometry.clearGroups();
  return geometry;
}
/** Everything the tiles are drawn with: one material and a block for each kind of tile. */
export function tileKit(own: Own) {
  const rich = capable(),
    map = own(paint(false)),
    relief = rich ? own(paint(true)) : null,
    material = own(
      rich
        ? new T.MeshPhysicalMaterial({ map, bumpMap: relief!, bumpScale: 1.6, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 })
        : new T.MeshStandardMaterial({ map, roughness: 0.42 }),
    ),
    base = block(W, TH, D, 0.07, rich ? 3 : 2),
    shapes = new Map<number, T.BufferGeometry>();
  for (let kind = 0; kind <= JOKER_CELL; kind++) shapes.set(kind, own(tileGeometry(base, kind)));
  base.dispose();
  return { material, geometry: (tile: number) => shapes.get(kindOf(tile))! };
}
