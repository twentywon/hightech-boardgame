import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, capable, glossy } from "../../engine/scene-utils";

/** Half a tile: a tile is one unit by two. */
export const U = 0.56,
  /** A tile's size: length, thickness, width. */
  LENGTH = U * 2 - 0.05,
  THICK = 0.16,
  WIDTH = U - 0.05;
type Own = <R extends { dispose(): void }>(resource: R) => R;
const SPOTS: Record<number, [number, number][]> = {
  0: [],
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};
/**
 * Every picture of a tile lies on one canvas 256 × 192: the face above (rows 0–128), the side below it (an ivory
 * top bonded to an ebony back, rows 136–168) and the plain ebony back (rows 176–192). The block's faces are mapped
 * there, so a tile is one draw with one material.
 */
const PIC_W = 256,
  PIC_H = 192,
  FACE = 128,
  SIDE_TOP = 136,
  SIDE_BOTTOM = 168,
  BACK = 176;
const v = (row: number) => 1 - row / PIC_H;
/** The tile's solid: a rounded block whose faces read the picture above, and a brass spinner pinned in its middle. */
export function tileGeometry() {
  const body = block(LENGTH, THICK, WIDTH, 0.04),
    uv = body.getAttribute("uv"),
    perFace = uv.count / 6;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / perFace),
      a = uv.getX(i),
      b = uv.getY(i);
    if (face === 2) uv.setXY(i, a, v(FACE) + b * (1 - v(FACE)));
    else if (face === 3) uv.setXY(i, a, 0.01 + b * (v(BACK) - 0.02));
    else uv.setXY(i, a, v(SIDE_BOTTOM) + b * (v(SIDE_TOP) - v(SIDE_BOTTOM)));
  }
  const spinner = new T.SphereGeometry(0.05, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(0, THICK / 2 - 0.004, 0),
    merged = mergeGeometries([body.toNonIndexed(), spinner.toNonIndexed()], true)!;
  body.dispose();
  spinner.dispose();
  return merged;
}
const IVORY = "#f1e8d2",
  EBONY = "#1b1411";
/** An inset pip: a dark hollow, shaded on the side the light comes from and lit on the far wall. */
function pip(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(x + 1.2, y + 1.6, r + 1.2, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, "#050404");
  g.addColorStop(0.7, "#1d1916");
  g.addColorStop(1, "#3c342c");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // The far wall of the hollow catches the light.
  ctx.strokeStyle = "rgba(160,140,118,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r - 1.5, 0.1, Math.PI * 0.9);
  ctx.stroke();
}
/** The face, sides and back of the tile `a`–`b` (the first half, `a`, on the left of the face). */
function paint(a: number, b: number, relief: boolean) {
  const c = document.createElement("canvas");
  c.width = PIC_W;
  c.height = PIC_H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  if (relief) {
    // Height: the face is high, the pips and the groove low.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PIC_W, PIC_H);
    ctx.fillStyle = "#000000";
    ctx.fillRect(126, 12, 4, FACE - 24);
    [a, b].forEach((value, half) => {
      for (const [x, y] of SPOTS[value]) {
        ctx.beginPath();
        ctx.arc(half * 128 + 30 + x * 34, 30 + y * 34, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, FACE, PIC_W, PIC_H - FACE);
  } else {
    const g = ctx.createLinearGradient(0, 0, PIC_W, FACE);
    g.addColorStop(0, "#f6efdc");
    g.addColorStop(1, "#e9dec4");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, PIC_W, FACE + 4);
    // The faint grain of old bone.
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = i % 2 ? "#b49a70" : "#ffffff";
      ctx.fillRect(0, (i * 37) % FACE, PIC_W, 1 + (i % 3));
    }
    ctx.globalAlpha = 1;
    // The groove across the middle.
    ctx.fillStyle = "#3a312a";
    ctx.fillRect(126, 12, 3, FACE - 24);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(129, 12, 2, FACE - 24);
    [a, b].forEach((value, half) => {
      for (const [x, y] of SPOTS[value]) pip(ctx, half * 128 + 30 + x * 34, 30 + y * 34, 12);
    });
    // The side: ivory bonded to ebony with a thin dark seam.
    ctx.fillStyle = IVORY;
    ctx.fillRect(0, FACE + 4, PIC_W, SIDE_TOP + 16 - FACE - 4);
    ctx.fillStyle = "#6b5a48";
    ctx.fillRect(0, SIDE_TOP + 16, PIC_W, 2);
    ctx.fillStyle = EBONY;
    ctx.fillRect(0, SIDE_TOP + 18, PIC_W, PIC_H - SIDE_TOP - 18);
    // The grain of the ebony.
    ctx.globalAlpha = 0.25;
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = i % 2 ? "#3a2a22" : "#0b0806";
      ctx.fillRect(0, SIDE_TOP + 18 + ((i * 7) % (PIC_H - SIDE_TOP - 18)), PIC_W, 1);
    }
    ctx.globalAlpha = 1;
  }
  return c;
}
/** The material of one tile: its picture, and where a graphics card draws, the pips' relief and a clear coat. */
export function tileMaterial(a: number, b: number, own: Own) {
  const map = own(new T.CanvasTexture(paint(a, b, false)));
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  if (!capable()) return own(new T.MeshStandardMaterial({ map, roughness: 0.42 }));
  const bumpMap = own(new T.CanvasTexture(paint(a, b, true)));
  return own(glossy({ map, bumpMap, bumpScale: 1.6, roughness: 0.38 }, 0.7));
}
/** The brass of the spinners. Without a reflected room a full metal would look black. */
export function brass(own: Own) {
  return own(
    capable()
      ? new T.MeshStandardMaterial({ color: "#d4ac5a", metalness: 1, roughness: 0.28 })
      : new T.MeshStandardMaterial({ color: "#d8b468", metalness: 0.35, roughness: 0.38 }),
  );
}
