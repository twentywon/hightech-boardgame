import * as T from "three";
import { glossy } from "../../engine/scene-utils";
import { seeded } from "./board";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The sides' colours as the screen names them: amber glass for side 0, lapis for side 1. */
export const PUSH_COLORS: [string, string] = ["#e08a1e", "#2a4fa8"];
/**
 * Amber glass, painted round a marble (a picture laid as latitude and longitude): deep honey with a darker heart,
 * a twisted veil of paler glass through it, and small bubbles caught when it was made.
 */
function amber(size: number) {
  const c = document.createElement("canvas");
  c.width = size * 2;
  c.height = size;
  const ctx = c.getContext("2d")!,
    rand = seeded(311),
    w = size * 2,
    h = size;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#c8650f");
  g.addColorStop(0.5, "#f0a234");
  g.addColorStop(1, "#b9560b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Streaks of paler and darker glass wound round it.
  for (let k = 0; k < 7; k++) {
    const phase = rand() * Math.PI * 2,
      width = (4 + rand() * 14) * (size / 256),
      wave = (0.12 + rand() * 0.22) * h;
    ctx.strokeStyle = k % 3 === 0 ? "rgba(150,60,8,0.18)" : `rgba(255,${215 + Math.floor(rand() * 30)},150,${0.18 + rand() * 0.2})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = -8; x <= w + 8; x += 6) ctx.lineTo(x, h / 2 + Math.sin((x / w) * Math.PI * 2 * 2 + phase) * wave + Math.sin((x / w) * Math.PI * 6 + phase * 2) * wave * 0.25);
    ctx.stroke();
  }
  for (let i = 0; i < 46; i++) {
    const x = rand() * w,
      y = h * (0.2 + rand() * 0.6),
      r = (0.8 + rand() * 2.4) * (size / 256);
    ctx.fillStyle = "rgba(255,240,205,0.65)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}
/**
 * Lapis lazuli, polished: ultramarine mottled lighter and darker, a few drifts of pale calcite and flecks of golden
 * pyrite.
 */
function lapis(size: number) {
  const c = document.createElement("canvas");
  c.width = size * 2;
  c.height = size;
  const ctx = c.getContext("2d")!,
    rand = seeded(5077),
    w = size * 2,
    h = size,
    s = size / 256;
  ctx.fillStyle = "#213f96";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) {
    const x = rand() * w,
      y = rand() * h,
      r = (6 + rand() * 30) * s,
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rand() < 0.5 ? "rgba(66,108,214,0.45)" : "rgba(10,24,70,0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let k = 0; k < 4; k++) {
    let x = rand() * w,
      y = h * (0.25 + rand() * 0.5),
      a = rand() * Math.PI * 2;
    ctx.strokeStyle = "rgba(220,228,240,0.28)";
    ctx.lineWidth = (1.5 + rand() * 3) * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let n = 0; n < 16; n++) {
      a += (rand() - 0.5) * 0.9;
      x += Math.cos(a) * 9 * s;
      y += Math.sin(a) * 5 * s;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = rand() < 0.75 ? "rgba(232,196,96,0.85)" : "rgba(255,236,170,0.9)";
    const r = (0.6 + rand() * 1.5) * s;
    ctx.fillRect(rand() * w, h * (0.1 + rand() * 0.8), r * 1.4, r);
  }
  return c;
}
/** The two kinds of marble: their sphere and their paints (amber glass, polished lapis). */
export function marbleKit(own: Own, rich: boolean, radius: number) {
  const size = rich ? 256 : 128,
    texture = (canvas: HTMLCanvasElement) => {
      const t = own(new T.CanvasTexture(canvas));
      t.colorSpace = T.SRGBColorSpace;
      t.wrapS = T.RepeatWrapping;
      t.anisotropy = rich ? 4 : 1;
      return t;
    };
  const glass = texture(amber(size)),
    stone = texture(lapis(size));
  const paints: [T.Material, T.Material] = rich
    ? [
        // Glass seems to hold light: a little of its own colour glows back out of it.
        own(glossy({ map: glass, roughness: 0.05, metalness: 0, emissive: "#ffffff", emissiveMap: glass, emissiveIntensity: 0.22 }, 1)),
        own(glossy({ map: stone, roughness: 0.24, metalness: 0.05 }, 0.8)),
      ]
    : [own(new T.MeshStandardMaterial({ map: glass, roughness: 0.18, emissive: "#ffffff", emissiveMap: glass, emissiveIntensity: 0.18 })), own(new T.MeshStandardMaterial({ map: stone, roughness: 0.35 }))];
  const ball = own(new T.SphereGeometry(radius, rich ? 32 : 20, rich ? 22 : 14));
  return { ball, paints };
}
