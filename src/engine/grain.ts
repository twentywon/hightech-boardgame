import * as T from "three";
import { capable, woodPhoto, woodRelief } from "./scene-utils";

/**
 * Real wood and bark for things built of simple shapes (a chair, a stake, a bow, a gun's stock, a tree's trunk).
 *
 * `grain` paints a wood photograph (Poly Haven, CC0; the same ones the tables are made of) graded to the colour the
 * thing was painted in, so it keeps its colour and gains the figure of real wood; with a graphics card, the wood's
 * relief too. The photographs' grain runs across them (along u), so `grainUV` lays a shape's picture by its own size,
 * the grain along its longest side and never stretched: a spear's shaft gets a few long streaks, a plank its boards.
 * `bark` is a trunk's skin made from the dark wood stood on end, cut by deep furrows and cracks (with its relief
 * where a graphics card draws), for a cylinder's own picture (around it, up it).
 *
 * The grading is done once per photograph and colour; every texture made from it shares the painted canvas.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
type Kind = "light" | "dark" | "maple" | "walnut";
interface Graded {
  canvas: HTMLCanvasElement;
  ready: boolean;
  waiting: T.Texture[];
}
const graded = new Map<string, Graded>();
const SIZE = 512;
function grade(kind: Kind, tone: string, contrast: number): Graded {
  const key = `${kind}|${tone}|${contrast}`;
  let entry = graded.get(key);
  if (entry) return entry;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, SIZE, SIZE);
  entry = { canvas, ready: false, waiting: [] };
  graded.set(key, entry);
  const done = entry;
  woodPhoto(kind, (image) => {
    ctx.drawImage(image, 0, 0, SIZE, SIZE);
    const data = ctx.getImageData(0, 0, SIZE, SIZE),
      px = data.data,
      // (The colour as written, in sRGB: the canvas holds sRGB, not three's linear working colours.)
      c = new T.Color(tone).getRGB({ r: 0, g: 0, b: 0 }, T.SRGBColorSpace),
      rgb = [c.r * 255, c.g * 255, c.b * 255];
    let mean = 0;
    for (let i = 0; i < px.length; i += 4) mean += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    mean /= px.length / 4;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2],
        f = Math.max(0.25, 1 + (lum / mean - 1) * contrast);
      for (let k = 0; k < 3; k++) px[i + k] = Math.min(255, rgb[k] * f);
    }
    ctx.putImageData(data, 0, 0);
    done.ready = true;
    for (const t of done.waiting) t.needsUpdate = true;
    done.waiting.length = 0;
  });
  return entry;
}
function shared(own: Own, entry: Graded, across = 1, down = across) {
  const texture = own(new T.CanvasTexture(entry.canvas));
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 8;
  texture.repeat.set(across, down);
  if (!entry.ready) entry.waiting.push(texture);
  return texture;
}
/**
 * Paint parameters for wood of the colour `tone`: its photograph graded to that colour (`kind`: pale oak, dark wood,
 * maple, walnut; `contrast` how strongly its figure shows), with its relief where a graphics card draws. The shape
 * needs a picture laid by `grainUV` (or one whose u already runs along it). `rich` defaults to `capable()`.
 */
export function grain(own: Own, tone: string, o: { kind?: Kind; contrast?: number; rich?: boolean; repeat?: number } = {}): T.MeshStandardMaterialParameters {
  if (typeof document === "undefined") return { color: tone };
  const map = shared(own, grade(o.kind ?? "light", tone, o.contrast ?? 1.7), o.repeat ?? 1);
  return (o.rich ?? capable()) ? { color: "#ffffff", map, normalMap: own(woodRelief(o.repeat ?? 1)), normalScale: new T.Vector2(0.6, 0.6) } : { color: "#ffffff", map };
}
/**
 * Lays the picture of a shape (as it stands, at its real size) like a piece cut from a board: the photograph's grain
 * (along u) runs along the shape's longest side (or `along`: 0 x, 1 y, 2 z), and one photograph covers `tile` units.
 * The faces at its ends take the end grain. Returns the shape, changed.
 */
export function grainUV<G extends T.BufferGeometry>(geometry: G, tile = 0.6, along?: 0 | 1 | 2): G {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new T.Vector3()),
    a = along ?? (size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2),
    pos = geometry.attributes.position,
    nor = geometry.attributes.normal,
    uv = new Float32Array(pos.count * 2),
    p = [0, 0, 0],
    n = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    p[0] = pos.getX(i);
    p[1] = pos.getY(i);
    p[2] = pos.getZ(i);
    n[0] = Math.abs(nor.getX(i));
    n[1] = Math.abs(nor.getY(i));
    n[2] = Math.abs(nor.getZ(i));
    const d = n[0] >= n[1] && n[0] >= n[2] ? 0 : n[1] >= n[2] ? 1 : 2;
    if (d !== a) {
      uv[i * 2] = p[a] / tile;
      uv[i * 2 + 1] = p[3 - a - d] / tile;
    } else {
      const b = (a + 1) % 3,
        c = (a + 2) % 3;
      uv[i * 2] = p[b] / tile + 0.37;
      uv[i * 2 + 1] = p[c] / tile + 0.61;
    }
  }
  geometry.setAttribute("uv", new T.BufferAttribute(uv, 2));
  return geometry;
}
/** A copy of `geometry` scaled to (sx, sy, sz) with its picture laid as wood (`grainUV`): for shared unit shapes stretched to size. */
export const grained = (geometry: T.BufferGeometry, sx: number, sy: number, sz: number, tile = 0.6) => grainUV(geometry.clone().scale(sx, sy, sz), tile);

let barkCanvas: { colour: HTMLCanvasElement; height: Float32Array } | null = null;
/** The bark's furrows, once: the dark wood stood on end (grain upward), deep wavy furrows and a few cross cracks. */
function barkPicture(ready: () => void) {
  if (barkCanvas) return barkCanvas;
  const S = 256,
    colour = document.createElement("canvas");
  colour.width = colour.height = S;
  const ctx = colour.getContext("2d", { willReadFrequently: true })!,
    height = new Float32Array(S * S);
  ctx.fillStyle = "#6b5a48";
  ctx.fillRect(0, 0, S, S);
  barkCanvas = { colour, height };
  const made = barkCanvas;
  woodPhoto("dark", (image) => {
    // The photograph turned a quarter, so its grain runs up the trunk.
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(image, -S / 2, -S / 2, S, S);
    ctx.restore();
    const data = ctx.getImageData(0, 0, S, S),
      px = data.data;
    // A seeded wobble, so every device draws the same bark.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    // Ridges: plates between furrows that wander as they climb (wrapping round, so the picture tiles).
    const furrows = 9,
      phase = Array.from({ length: furrows }, () => rnd() * Math.PI * 2),
      wide = Array.from({ length: furrows }, () => 0.5 + rnd() * 0.6);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        let h = 1;
        for (let f = 0; f < furrows; f++) {
          const cx = ((f + 0.5) / furrows) * S + Math.sin((y / S) * Math.PI * 2 * 2 + phase[f]) * 7 + Math.sin((y / S) * Math.PI * 2 * 5 + phase[f] * 2) * 2.5;
          let dx = Math.abs(x - cx);
          dx = Math.min(dx, S - dx);
          const w = 4.5 * wide[f];
          if (dx < w) h = Math.min(h, (dx / w) ** 1.6);
        }
        height[y * S + x] = h;
      }
    // Cross cracks across the plates.
    for (let k = 0; k < 40; k++) {
      const y0 = Math.floor(rnd() * S),
        x0 = Math.floor(rnd() * S),
        len = 6 + rnd() * 14;
      for (let t = 0; t < len; t++) {
        const x = (x0 + t + S) % S,
          y = (y0 + Math.round(Math.sin(t * 0.5) * 1.2) + S) % S;
        height[y * S + x] = Math.min(height[y * S + x], 0.35);
      }
    }
    for (let i = 0; i < S * S; i++) {
      const lum = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255,
        h = height[i],
        // Grey-brown plates, nearly black in the furrows; the photograph's streaks show through.
        f = (0.35 + 0.75 * h) * (0.75 + lum * 0.7);
      px[i * 4] = Math.min(255, 112 * f);
      px[i * 4 + 1] = Math.min(255, 96 * f);
      px[i * 4 + 2] = Math.min(255, 80 * f);
    }
    ctx.putImageData(data, 0, 0);
    ready();
  });
  return barkCanvas;
}
const barkWaiting: T.Texture[] = [];
let barkReady = false;
/** The relief from the bark's heights (a normal map), once. */
let barkNormal: HTMLCanvasElement | null = null;
function reliefOf(height: Float32Array, S = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!,
    data = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const at = (xx: number, yy: number) => height[((yy + S) % S) * S + ((xx + S) % S)],
        dx = (at(x + 1, y) - at(x - 1, y)) * 2.2,
        dy = (at(x, y + 1) - at(x, y - 1)) * 2.2,
        l = Math.hypot(dx, dy, 1),
        i = (y * S + x) * 4;
      data.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      data.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      data.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      data.data[i + 3] = 255;
    }
  ctx.putImageData(data, 0, 0);
  return c;
}
/**
 * Paint parameters for a tree's bark, for a cylinder's own picture (u round it, v up it), `around` by `up` times.
 * `tone` tints it (white keeps the bark's own grey-brown). With a graphics card the furrows have relief.
 */
export function bark(own: Own, o: { around?: number; up?: number; tone?: string; rich?: boolean } = {}): T.MeshStandardMaterialParameters {
  const tone = o.tone ?? "#ffffff";
  if (typeof document === "undefined") return { color: tone };
  const picture = barkPicture(() => {
    barkReady = true;
    for (const t of barkWaiting) t.needsUpdate = true;
    barkWaiting.length = 0;
  });
  const make = (c: HTMLCanvasElement, data: boolean) => {
    const t = own(new T.CanvasTexture(c));
    if (!data) t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 8;
    t.repeat.set(o.around ?? 2, o.up ?? 2);
    return t;
  };
  const map = make(picture.colour, false);
  if (!barkReady) barkWaiting.push(map);
  if (!(o.rich ?? capable())) return { color: tone, map };
  // The relief needs the heights, which come with the photograph.
  const relief = document.createElement("canvas");
  relief.width = relief.height = 256;
  const rctx = relief.getContext("2d")!;
  rctx.fillStyle = "#8080ff";
  rctx.fillRect(0, 0, 256, 256);
  const normalMap = make(relief, true);
  const fill = () => {
    barkNormal ??= reliefOf(picture.height);
    rctx.drawImage(barkNormal, 0, 0);
    normalMap.needsUpdate = true;
  };
  if (barkReady) fill();
  else
    woodPhoto("dark", () => {
      if (barkReady) fill();
      else queueMicrotask(() => barkReady && fill());
    });
  return { color: tone, map, normalMap, normalScale: new T.Vector2(1.2, 1.2) };
}
