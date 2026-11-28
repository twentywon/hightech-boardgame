import * as T from "three";

/** Small painting helpers shared by the shooting game's places (all in code, nothing fetched). */
type Keep = <R extends { dispose(): void }>(resource: R) => R;
/** A tiny fixed sequence, so that a place is laid out and painted the same every time. */
export function sequence(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
export function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
export function texture(c: HTMLCanvasElement, keep: Keep, repeat?: [number, number]) {
  const t = keep(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}
/** The seven segments of each digit (a to g) as on an LED display. */
const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  " ": "",
};
/** Paints `text` as seven-segment digits `w` wide and `h` tall from (x, y), lit segments in `on`, unlit faintly. */
export function sevenSegment(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, on: string, off = "rgba(255,40,30,0.08)") {
  const t = Math.max(2, w * 0.17),
    gap = w * 0.35,
    slant = w * 0.12;
  [...text].forEach((ch, i) => {
    const lit = SEGMENTS[ch] ?? "",
      ox = x + i * (w + gap),
      seg = (s: string, x0: number, y0: number, x1: number, y1: number) => {
        ctx.strokeStyle = lit.includes(s) ? on : off;
        ctx.lineWidth = t;
        ctx.lineCap = "round";
        ctx.beginPath();
        // Leaned a little, as LED digits are.
        ctx.moveTo(ox + x0 + slant * (1 - y0 / h), y + y0);
        ctx.lineTo(ox + x1 + slant * (1 - y1 / h), y + y1);
        ctx.stroke();
      },
      m = t * 0.8;
    if (lit) {
      ctx.shadowColor = on;
      ctx.shadowBlur = t * 1.6;
    }
    seg("a", m, 0, w - m, 0);
    seg("b", w, m, w, h / 2 - m);
    seg("c", w, h / 2 + m, w, h - m);
    seg("d", m, h, w - m, h);
    seg("e", 0, h / 2 + m, 0, h - m);
    seg("f", 0, m, 0, h / 2 - m);
    seg("g", m, h / 2, w - m, h / 2);
    ctx.shadowBlur = 0;
  });
}
/** A soft round puff (dust, smoke, feathers' down), white fading out, for sprites. */
export function puffPicture(keep: Keep, tint = "255,255,255") {
  const { c, ctx } = canvas(128, 128),
    random = sequence(9);
  for (let k = 0; k < 14; k++) {
    const x = 64 + (random() - 0.5) * 50,
      y = 64 + (random() - 0.5) * 50,
      r = 18 + random() * 26,
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${tint},0.32)`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return texture(c, keep);
}
/** A bright star of a muzzle's flash, for a sprite. */
export function flashPicture(keep: Keep) {
  const { c, ctx } = canvas(128, 128),
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
  g.addColorStop(0, "rgba(255,255,230,1)");
  g.addColorStop(0.25, "rgba(255,210,120,0.85)");
  g.addColorStop(1, "rgba(255,120,20,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2,
      r = k % 2 ? 22 : 62;
    ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  ctx.fill();
  return texture(c, keep);
}
/** A word in heavy letters with a dark edge, for a sprite that rises and fades. */
export function wordPicture(text: string, color: string) {
  const { c, ctx } = canvas(512, 160);
  ctx.font = '900 92px "Inter", "Noto Sans KR", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 18;
  ctx.strokeStyle = "rgba(10, 12, 30, 0.85)";
  ctx.strokeText(text, 256, 84);
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 84);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** A sky dome: colours from the horizon (`low`) to the top (`high`), with a glow toward the sun's side. */
export function skyDome(keep: Keep, low: string, mid: string, high: string, glow: string, glowAt: number, radius = 420) {
  const geometry = keep(new T.SphereGeometry(radius, 48, 24)),
    at = geometry.getAttribute("position"),
    colours = new Float32Array(at.count * 3),
    a = new T.Color(low),
    b = new T.Color(mid),
    c = new T.Color(high),
    g = new T.Color(glow),
    out = new T.Color();
  for (let i = 0; i < at.count; i++) {
    const x = at.getX(i),
      y = at.getY(i) / radius,
      z = at.getZ(i),
      up = Math.max(0, y);
    if (up < 0.25) out.copy(a).lerp(b, up / 0.25);
    else out.copy(b).lerp(c, Math.min(1, (up - 0.25) / 0.75));
    if (y < 0) out.copy(a).multiplyScalar(0.9);
    // Toward the sun the low sky glows.
    const toward = Math.max(0, Math.cos(Math.atan2(x, -z) - glowAt)) ** 3 * Math.max(0, 1 - up * 2.2);
    out.lerp(g, toward * 0.85);
    colours.set([out.r, out.g, out.b], i * 3);
  }
  geometry.setAttribute("color", new T.BufferAttribute(colours, 3));
  const mesh = new T.Mesh(geometry, keep(new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, depthWrite: false, fog: false })));
  mesh.renderOrder = -10;
  return mesh;
}
