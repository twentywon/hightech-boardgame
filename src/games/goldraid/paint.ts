import * as T from "three";

/**
 * Pictures for 금화 쟁탈전 painted in code on canvases: colour maps, and normal maps worked out from a painted height
 * (lighter is higher) so that stone, planks, the road and the earth catch the low sun. Nothing is fetched.
 */
export type Own = <R extends { dispose(): void }>(resource: R) => R;

/** A small seeded stream, so that the valley is the same every time (thumbnails, tests). */
export function stream(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function canvas(width: number, height: number, paint: (ctx: CanvasRenderingContext2D, c: HTMLCanvasElement) => void) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  paint(c.getContext("2d", { willReadFrequently: true })!, c);
  return c;
}
export function texture(own: Own, c: HTMLCanvasElement, options: { repeat?: [number, number]; colour?: boolean } = {}) {
  const t = own(new T.CanvasTexture(c));
  if (options.colour !== false) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  if (options.repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(...options.repeat);
  }
  return t;
}
/** A painted canvas as a colour texture. */
export function painted(own: Own, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  return texture(own, canvas(width, height, paint), { repeat });
}
/**
 * A normal map from a height canvas (grey: lighter is higher), `strength` how steep its slopes read. It wraps at the
 * edges, so a tiled picture has no seam.
 */
export function normalFrom(own: Own, height: HTMLCanvasElement, strength = 2, repeat?: [number, number]) {
  const w = height.width,
    h = height.height,
    src = height.getContext("2d")!.getImageData(0, 0, w, h).data,
    out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!,
    img = ctx.createImageData(w, h),
    d = img.data,
    at = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength,
        dy = (at(x, y + 1) - at(x, y - 1)) * strength,
        len = Math.hypot(dx, dy, 1),
        i = (y * w + x) * 4;
      d[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return texture(own, out, { repeat, colour: false });
}
/** A soft round glow (white in the middle to nothing at the rim), for sprites tinted by their material. */
export function glow(own: Own, size = 128, hard = 0.15) {
  return texture(
    own,
    canvas(size, size, (ctx) => {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(hard, "rgba(255,255,255,0.85)");
      g.addColorStop(0.5, "rgba(255,255,255,0.25)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }),
  );
}
/** A four-pointed glint (a star of light) for gold catching the sun. */
export function glint(own: Own, size = 128) {
  return texture(
    own,
    canvas(size, size, (ctx) => {
      const c = size / 2;
      ctx.globalCompositeOperation = "lighter";
      for (const [w, l, a] of [
        [0.05, 1, 0],
        [0.05, 1, Math.PI / 2],
        [0.03, 0.55, Math.PI / 4],
        [0.03, 0.55, -Math.PI / 4],
      ]) {
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(a);
        const g = ctx.createLinearGradient(-c * l, 0, c * l, 0);
        g.addColorStop(0, "rgba(255,240,190,0)");
        g.addColorStop(0.5, "rgba(255,250,225,1)");
        g.addColorStop(1, "rgba(255,240,190,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, c * l, c * w, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.3);
      g.addColorStop(0, "rgba(255,255,240,1)");
      g.addColorStop(1, "rgba(255,230,160,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }),
  );
}
/** A puff of smoke or dust: a lumpy soft ball, lighter on top. */
export function puff(own: Own, size = 128, seed = 1) {
  return texture(
    own,
    canvas(size, size, (ctx) => {
      const random = stream(seed);
      for (let k = 0; k < 9; k++) {
        const a = random() * Math.PI * 2,
          r = size * (0.08 + random() * 0.16),
          x = size / 2 + Math.cos(a) * r,
          y = size / 2 + Math.sin(a) * r * 0.8,
          rad = size * (0.18 + random() * 0.14),
          g = ctx.createRadialGradient(x, y - rad * 0.3, 0, x, y, rad);
        g.addColorStop(0, "rgba(255,255,255,0.75)");
        g.addColorStop(0.6, "rgba(235,235,235,0.4)");
        g.addColorStop(1, "rgba(220,220,220,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
  );
}
