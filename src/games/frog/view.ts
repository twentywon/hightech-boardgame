import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { cameraDistance } from "../../engine/camera";
import { capable, glossy, hop, travel, weave } from "../../engine/scene-utils";
import { Grove } from "../../engine/foliage";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { FROG_PAINTS, HOP_MS, JUMP_MS, LANDS_AT, SPACING, STUMP_RADIUS, SYMBOLS, frogSubject, stumpAt } from "./layout";
import { NONE, targets, type State } from "./rules";
import { symbolPath } from "./symbols";

export const FROG_COLORS: [string, string] = ["#56b649", "#6b4a33"];
/** The mist at dusk: the colour far things fade into, and what the water shows of the sky. */
const MIST = "#7c7293";
/** A fixed sequence of numbers in [0, 1), so that the swamp is laid the same every time (browser tests replay it). */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const canvasOf = (w: number, h = w) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
};
/** A colour made lighter (toward white, `k` > 0) or darker (toward black, `k` < 0). */
const shade = (hex: string, k: number) => {
  const c = new T.Color(hex);
  return k >= 0 ? c.lerp(new T.Color("#ffffff"), k) : c.lerp(new T.Color("#000000"), -k);
};
const css = (c: T.Color, alpha = 1) => `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`;
/** How a stump's round wanders a little, by the turn round it (whole waves, so that the seam where the lathe closes stays shut). */
const wander = (turn: number, phase: number) => 1 + 0.028 * (0.6 * Math.sin(3 * turn + phase) + 0.4 * Math.sin(5 * turn + phase * 1.7));
/** The profile of a stump whose top is at `top`: a foot that flares into the water, a trunk, and a rim just under the cut. */
const profile = (top: number): [number, number][] => [
  [0.56, 0],
  [0.5, 0.05],
  [0.46, 0.12],
  [0.44, 0.22],
  [0.425, top - 0.12],
  [0.415, top - 0.035],
  [STUMP_RADIUS, top - 0.008],
  [STUMP_RADIUS - 0.012, top],
];
const radiusAt = (points: [number, number][], y: number) => {
  for (let k = 1; k < points.length; k++) {
    const [r0, y0] = points[k - 1],
      [r1, y1] = points[k];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return points[points.length - 1][0];
};
/** Where the ribbon is tied: a little under the top of the stump. */
const RIBBON_DROP = 0.16;
type Own = <R extends { dispose(): void }>(r: R) => R;

/** Bark for the stumps: dark furrows and lighter ridges running up, and moss at the foot. */
function barkTexture() {
  const { c, ctx } = canvasOf(256);
  const rand = sequence(91);
  ctx.fillStyle = "#5d4130";
  ctx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 40; k++) {
    const dark = k % 3 !== 0;
    ctx.strokeStyle = dark ? `rgba(28, 17, 10, ${0.3 + rand() * 0.4})` : `rgba(160, 122, 88, ${0.2 + rand() * 0.25})`;
    ctx.lineWidth = dark ? 2 + rand() * 5 : 1 + rand() * 1.6;
    let x = rand() * 256;
    ctx.beginPath();
    ctx.moveTo(x, -4);
    for (let y = 0; y <= 260; y += 14) {
      x += (rand() - 0.5) * 7;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Moss at the foot, where the water keeps it wet (the bottom of the picture is the foot of the stump).
  for (let k = 0; k < 90; k++) {
    const x = rand() * 256,
      y = 256 - Math.pow(rand(), 1.6) * 110,
      r = 6 + rand() * 16,
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${86 + rand() * 30}, ${122 + rand() * 30}, 52, 0.55)`);
    g.addColorStop(1, "rgba(86, 122, 52, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Pale lichen here and there.
  for (let k = 0; k < 26; k++) {
    ctx.fillStyle = `rgba(190, 196, 160, ${0.18 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(rand() * 256, rand() * 200, 2 + rand() * 5, 1.5 + rand() * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = T.RepeatWrapping;
  t.repeat.set(2, 1);
  t.anisotropy = 4;
  return t;
}
/** The cut top of a stump: growth rings round a dark heart a little off the middle, a crack, and the bark's rim. */
function ringsTexture(seed: number) {
  const size = 256,
    { c, ctx } = canvasOf(size),
    rand = sequence(seed),
    cx = size / 2 + (rand() - 0.5) * 14,
    cy = size / 2 + (rand() - 0.5) * 14;
  const base = ctx.createRadialGradient(cx, cy, 4, size / 2, size / 2, size / 2);
  base.addColorStop(0, "#d6aa74");
  base.addColorStop(0.75, "#c3945e");
  base.addColorStop(1, "#a87a4a");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let r = 5; r < 112; r += 4 + rand() * 6) {
    ctx.strokeStyle = `rgba(116, 74, 38, ${0.25 + rand() * 0.35})`;
    ctx.lineWidth = 1 + rand() * 1.6;
    ctx.beginPath();
    const phase = rand() * 6;
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2,
        rr = r * (1 + 0.035 * Math.sin(3 * a + phase) + 0.02 * Math.sin(7 * a + phase * 2));
      const x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(92, 56, 28, 0.75)";
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  // A crack from the heart outward.
  ctx.strokeStyle = "rgba(60, 34, 18, 0.7)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  let x = cx,
    y = cy;
  const a = rand() * Math.PI * 2;
  ctx.moveTo(x, y);
  for (let k = 0; k < 8; k++) {
    x += Math.cos(a + (rand() - 0.5) * 0.8) * 11;
    y += Math.sin(a + (rand() - 0.5) * 0.8) * 11;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  // The bark round the edge.
  ctx.lineWidth = 13;
  ctx.strokeStyle = "#4d3424";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(170, 130, 90, 0.5)";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 13, 0, Math.PI * 2);
  ctx.stroke();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** A frog's skin in its colour: darker along the back, with spots, lighter toward the flanks. */
function skinTexture(paint: string) {
  const { c, ctx } = canvasOf(256, 128),
    rand = sequence(paint.length * 977 + paint.charCodeAt(2) * 13);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, css(shade(paint, -0.16)));
  g.addColorStop(0.45, css(shade(paint, 0)));
  g.addColorStop(1, css(shade(paint, 0.22)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = css(shade(paint, -0.32), 0.6);
  for (let k = 0; k < 11; k++) {
    ctx.beginPath();
    ctx.ellipse(rand() * 256, 8 + rand() * 50, 5 + rand() * 7, 4 + rand() * 4, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let k = 0; k < 500; k++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(rand() * 256, rand() * 128, 2, 2);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** A frog's pale belly. */
function bellyTexture(colour: number) {
  const { paint, dark } = FROG_PAINTS[colour],
    { c, ctx } = canvasOf(128);
  const g = ctx.createRadialGradient(64, 60, 6, 64, 64, 80);
  g.addColorStop(0, css(shade(paint, 0.78)));
  g.addColorStop(1, css(shade(paint, 0.55)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // Faint creases across the throat.
  ctx.strokeStyle = css(new T.Color(dark), 0.12);
  ctx.lineWidth = 2;
  for (const y of [30, 42, 54]) {
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.quadraticCurveTo(64, y + 8, 98, y);
    ctx.stroke();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** The rosette on a ribbon's knot: a pinked edge in the colour, a cream middle, and the colour's symbol, outlined. */
function rosetteTexture(colour: number) {
  const { paint, dark } = FROG_PAINTS[colour],
    { c, ctx } = canvasOf(128);
  ctx.beginPath();
  for (let k = 0; k <= 48; k++) {
    const a = (k / 48) * Math.PI * 2,
      r = k % 2 ? 56 : 63;
    if (k) ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    else ctx.moveTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  ctx.fillStyle = paint;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = dark;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(64, 64, 49, 0, Math.PI * 2);
  ctx.fillStyle = "#fff6e2";
  ctx.fill();
  symbolPath(ctx, SYMBOLS[colour], 64, 65, 36);
  ctx.fillStyle = paint;
  ctx.fill();
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = dark;
  ctx.stroke();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** Cloth for a ribbon in its colour: a finer weave of light and dark threads and a stitched line along each edge. */
function ribbonTexture(colour: number) {
  const { paint, dark } = FROG_PAINTS[colour],
    { c, ctx } = canvasOf(128, 32);
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, 128, 32);
  for (let x = 0; x < 128; x += 2) {
    ctx.fillStyle = x % 4 ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.07)";
    ctx.fillRect(x, 0, 1, 32);
  }
  ctx.fillStyle = css(shade(paint, 0.45), 0.85);
  ctx.fillRect(0, 4, 128, 2);
  ctx.fillRect(0, 26, 128, 2);
  ctx.fillStyle = css(new T.Color(dark), 0.35);
  ctx.fillRect(0, 0, 128, 2);
  ctx.fillRect(0, 30, 128, 2);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = T.RepeatWrapping;
  t.repeat.set(6, 1);
  return t;
}
/** A lily pad from above: green with veins running out from where the stem meets it, a lighter rim and a few brown flecks. */
function padTexture() {
  const { c, ctx } = canvasOf(256),
    rand = sequence(37);
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, "#5f9640");
  g.addColorStop(0.85, "#4a7f32");
  g.addColorStop(1, "#7cae52");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(150, 196, 104, 0.45)";
  ctx.lineWidth = 2;
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.quadraticCurveTo(128 + Math.cos(a + 0.15) * 70, 128 + Math.sin(a + 0.15) * 70, 128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124);
    ctx.stroke();
  }
  for (let k = 0; k < 14; k++) {
    ctx.fillStyle = `rgba(110, 80, 40, ${0.2 + rand() * 0.25})`;
    ctx.beginPath();
    ctx.arc(30 + rand() * 196, 30 + rand() * 196, 2 + rand() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** A soft round glow (a firefly), or a soft wide wisp (mist). */
function glowTexture(stops: [number, string][]) {
  const { c, ctx } = canvasOf(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, colour] of stops) g.addColorStop(at, colour);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/**
 * The sky at dusk as a picture all round (an equirectangular one: the top is overhead), for the water and the glazed
 * things to reflect where a graphics card draws: deep violet overhead, rose toward the horizon, a warm glow low in the
 * west where the sun has gone (behind the row at the left), and the dark of the land below.
 */
function duskTexture() {
  const { c, ctx } = canvasOf(512, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#2e2a55");
  g.addColorStop(0.3, "#5b4f86");
  g.addColorStop(0.44, "#b17f92");
  g.addColorStop(0.495, "#efae86");
  g.addColorStop(0.51, "#4a4a52");
  g.addColorStop(1, "#141c18");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  // The glow where the sun has set: toward -x and -z, a little more than an eighth of the way round.
  const sun = ctx.createRadialGradient(64, 124, 2, 64, 124, 120);
  sun.addColorStop(0, "rgba(255, 214, 160, 0.95)");
  sun.addColorStop(0.25, "rgba(250, 160, 110, 0.5)");
  sun.addColorStop(1, "rgba(250, 160, 110, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 512, 128);
  // The same glow seen round the seam of the picture.
  ctx.save();
  ctx.translate(512, 0);
  ctx.fillRect(-64, 0, 64, 128);
  ctx.restore();
  // A tree line along the horizon.
  ctx.fillStyle = "#1f2620";
  ctx.beginPath();
  ctx.moveTo(0, 130);
  for (let x = 0; x <= 512; x += 8) ctx.lineTo(x, 127 - Math.abs(Math.sin(x * 0.07) * 4 + Math.sin(x * 0.023) * 3));
  ctx.lineTo(512, 140);
  ctx.lineTo(0, 140);
  ctx.fill();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.mapping = T.EquirectangularReflectionMapping;
  return t;
}
/** Calm ripples as a normal map: a few long, low waves crossing (heights summed as sines, so the tile repeats seamlessly). */
function rippleTexture() {
  const size = 256,
    { c, ctx } = canvasOf(size),
    image = ctx.createImageData(size, size),
    waves: [number, number, number, number][] = [
      [1, 2, 1, 0.3],
      [-3, 1, 0.6, 1.7],
      [2, -5, 0.35, 2.9],
      [-6, -3, 0.22, 0.6],
      [7, 4, 0.14, 4.2],
    ];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let dx = 0,
        dy = 0;
      for (const [kx, ky, amp, phase] of waves) {
        const s = Math.cos(((kx * x + ky * y) / size) * Math.PI * 2 + phase) * amp * 0.06;
        dx += s * kx;
        dy += s * ky;
      }
      const length = Math.hypot(dx, dy, 1),
        i = (y * size + x) * 4;
      image.data[i] = Math.round((-dx / length) * 127.5 + 127.5);
      image.data[i + 1] = Math.round((-dy / length) * 127.5 + 127.5);
      image.data[i + 2] = Math.round((1 / length) * 127.5 + 127.5);
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** Merges pieces of one stuff into one geometry (all made unindexed, as merging asks). */
const merged = (pieces: T.BufferGeometry[]) => mergeGeometries(pieces.map((piece) => (piece.index ? piece.toNonIndexed() : piece)))!;
type FrogPart = "skin" | "belly" | "white" | "pupil" | "shine" | "mouth" | "blush" | "sac";
/**
 * The shapes of a sitting frog, facing +z with its feet on y = 0, merged by what each part is made of: a body that
 * slopes up from the rump to the head, two eyes standing up on top with big pupils and a gleam, a smile, pink
 * cheeks, folded hind legs with webbed feet out at the sides, short front legs, a pale belly (where the colour's
 * symbol is painted) and a throat sac that swells when it croaks. The eyes and the sac are kept apart (they move).
 */
function frogShapes() {
  const lists: Partial<Record<FrogPart, T.BufferGeometry[]>> = {},
    eyes: Partial<Record<FrogPart, T.BufferGeometry[]>> = {};
  const put = (part: FrogPart, geometry: T.BufferGeometry, at: [number, number, number], turn: [number, number, number] = [0, 0, 0], size: [number, number, number] = [1, 1, 1], into = lists) => {
    geometry.scale(...size);
    geometry.rotateX(turn[0]);
    geometry.rotateY(turn[1]);
    geometry.rotateZ(turn[2]);
    geometry.translate(...at);
    (into[part] ??= []).push(geometry);
  };
  const BODY: [number, number, number] = [0, 0.165, -0.04],
    BODY_TURN: [number, number, number] = [-0.32, 0, 0],
    BODY_SIZE: [number, number, number] = [1.08, 0.8, 1.12];
  put("skin", new T.SphereGeometry(0.24, 30, 20), BODY, BODY_TURN, BODY_SIZE);
  put("skin", new T.SphereGeometry(0.2, 30, 18), [0, 0.29, 0.075], [-0.12, 0, 0], [1.2, 0.72, 0.98]);
  for (const s of [-1, 1]) {
    // The bumps the eyes sit in, the thighs folded at the sides, the hind feet with their toes, and the front legs.
    put("skin", new T.SphereGeometry(0.085, 18, 12), [s * 0.118, 0.395, 0.085]);
    put("skin", new T.SphereGeometry(0.12, 18, 12), [s * 0.2, 0.1, -0.07], [0, s * 0.3, 0], [0.78, 0.64, 1.28]);
    put("skin", new T.SphereGeometry(0.1, 14, 8), [s * 0.255, 0.02, 0.07], [0, -s * 0.55, 0], [0.75, 0.22, 1.25]);
    for (let k = 0; k < 3; k++) {
      const a = -s * 0.55 + (k - 1) * 0.5;
      put("skin", new T.SphereGeometry(0.028, 10, 8), [s * 0.255 + Math.sin(a) * 0.115, 0.022, 0.07 + Math.cos(a) * 0.115], [0, 0, 0], [1, 0.55, 1]);
    }
    put("skin", new T.CapsuleGeometry(0.034, 0.11, 4, 10), [s * 0.105, 0.085, 0.19], [0.28, 0, s * 0.22]);
    put("skin", new T.SphereGeometry(0.05, 12, 8), [s * 0.12, 0.014, 0.235], [0, 0, 0], [1, 0.3, 1.05]);
    for (let k = 0; k < 3; k++) {
      const a = (k - 1) * 0.55;
      put("skin", new T.SphereGeometry(0.019, 8, 6), [s * 0.12 + Math.sin(a) * 0.055, 0.016, 0.235 + Math.cos(a) * 0.055]);
    }
    // Cheeks, a little toward the sides.
    const cheek = new T.CircleGeometry(0.032, 18);
    put("blush", cheek, [s * 0.165, 0.315, 0.235], [0, s * 0.62, 0]);
  }
  // The belly: a patch of the body's own round, a hair outside it, over the chest (its picture runs left to right).
  put("belly", new T.SphereGeometry(0.246, 26, 12, Math.PI / 2 - 0.78, 1.56, 1.2, 1.05), BODY, BODY_TURN, BODY_SIZE);
  // The smile: an arc of a thin tube across the front of the head.
  const smile = new T.TorusGeometry(0.15, 0.0075, 6, 30, 1.5);
  smile.rotateZ(-Math.PI / 2 - 0.75);
  smile.rotateX(-0.2);
  put("mouth", smile, [0, 0.445, 0.245]);
  // The eyes, round their own middle (so that they close by being flattened), and the throat sac.
  for (const s of [-1, 1]) {
    put("white", new T.SphereGeometry(0.072, 20, 14), [s * 0.118, 0, 0.012], [0, 0, 0], [1, 1, 1], eyes);
    put("pupil", new T.SphereGeometry(0.046, 18, 12), [s * 0.12, 0.004, 0.058], [0, 0, 0], [1, 1.05, 0.6], eyes);
    put("shine", new T.SphereGeometry(0.014, 8, 6), [s * 0.104, 0.026, 0.086], [0, 0, 0], [1, 1, 1], eyes);
  }
  const out: Partial<Record<FrogPart, T.BufferGeometry>> = {},
    eyeParts: Partial<Record<FrogPart, T.BufferGeometry>> = {};
  for (const [part, pieces] of Object.entries(lists) as [FrogPart, T.BufferGeometry[]][]) out[part] = merged(pieces);
  for (const [part, pieces] of Object.entries(eyes) as [FrogPart, T.BufferGeometry[]][]) eyeParts[part] = merged(pieces);
  const sac = new T.SphereGeometry(0.08, 18, 12);
  sac.scale(1.1, 0.85, 1);
  // A collar of cloth round the neck, its front dipping a little, for the medal of its colour.
  const collar = new T.TorusGeometry(1, 0.1, 8, 40);
  collar.rotateX(Math.PI / 2);
  collar.scale(0.236, 0.2, 0.192);
  collar.rotateX(-0.14);
  collar.translate(0, 0.238, 0.07);
  return { body: out, eyes: eyeParts, sac, collar };
}
/** Where the eyes sit on the head (their group's middle), where the sac does, and the medal on the chest. */
const EYES_AT = new T.Vector3(0, 0.425, 0.105),
  SAC_AT = new T.Vector3(0, 0.235, 0.235),
  MEDAL_AT = new T.Vector3(0, 0.19, 0.268);
interface FrogModel {
  root: T.Group;
  squash: T.Group;
  breath: T.Group;
  eyes: T.Group;
  sac: T.Mesh;
}
interface Frog extends FrogModel {
  colour: number;
  /** Its reflection in the water, kept in step by `reflect`. */
  mirror: FrogModel;
  /** When it next blinks, in seconds of the page's clock. */
  blink: number;
}
interface Effect {
  start: number;
  duration: number;
  update: (p: number) => void;
}
/**
 * A swamp at dusk, misty and calm: a row of tree stumps standing in dark water that shows the sky's light and
 * everything standing in it, reeds and cattails, lily pads (a few in flower), a far bank of trees fading into the
 * mist, fireflies over the reeds. Each stump has a cloth ribbon tied round it in its colour with a rosette carrying
 * the colour's symbol, or none (a bare stump, with a shelf of fungus). The frogs are modelled in code and wear
 * the same rosette as a medal at the collar. A frog hops in a short arc and jumps in a higher one, lands with a squash and
 * a splash of ripples; when every frog is home they hop for joy and croak. A tap on a frog with one way to go moves
 * it; with two, a tap picks it up and a tap on a stump (or a drag onto it) sets it down there.
 */
export class FrogView extends TableView<State> {
  private row = new T.Group();
  private reflections = new T.Group();
  private built = "";
  private count = 5;
  /** What belongs to the row laid now (stumps of their own heights), thrown away with it. */
  private laid: { dispose(): void }[] = [];
  private stumps: T.Group[] = [];
  private frogs: Frog[] = [];
  /** Which frog sits on each stump (an index into `frogs`), or -1. */
  private occupant: number[] = [];
  private shapes: ReturnType<typeof frogShapes>;
  /** The rosette's disc, on a ribbon's knot and smaller on a frog's collar. */
  private badge: T.CircleGeometry;
  private parts: Record<"white" | "pupil" | "shine" | "mouth" | "blush" | "sac" | "bark" | "fungus" | "gills", T.Material>;
  private skins = new Map<number, T.Material>();
  private bellies = new Map<number, T.Material>();
  private ribbons = new Map<number, { cloth: T.Material; rosette: T.Material; collar: T.Material }>();
  private bark: T.Texture;
  private fog = new T.Fog(MIST, 10, 30);
  private caster = new T.Raycaster();
  /** Running water and drifting things, and the marks that breathe; only where a graphics card draws and motion is welcome. */
  private live: boolean;
  private flows: T.Texture[] = [];
  private flies: { sprite: T.Sprite; base: T.Vector3; phase: number; speed: number }[] = [];
  private wisps: { sprite: T.Sprite; x: number; phase: number }[] = [];
  private effects: Effect[] = [];
  private clock = 0;
  private cheered: State | null = null;
  private surrounded = false;
  /** Rings that spread on the water where a frog lands, used in turn. */
  private ripples: { ring: T.Mesh; paint: T.MeshBasicMaterial }[] = [];
  private rippled = 0;
  /** A press on the table: where it began and on which stump, and whether it has become a drag of a frog. */
  private press: { point: number; x: number; z: number; moving: boolean; frog: number; ways: number[] } | null = null;
  /** Where a dragged frog was let go, so that its hop starts there. */
  private dropped: { frog: number; x: number; y: number; z: number } | null = null;
  private rings: Record<"chosen" | "cursor" | "from" | "to" | "aim", T.Mesh>;
  private aims: T.Mesh[] = [];
  private arcs: T.Mesh[] = [];
  private hintArc: T.Mesh;
  private hintTip: T.Mesh;
  private arcShapes = new Map<string, { tube: T.TubeGeometry; end: T.Vector3; tangent: T.Vector3 }>();
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, MIST);
    this.live = capable() && !this.reducedMotion;
    const keep: Own = (r) => this.own(r);
    this.scene.fog = this.fog;
    // Dusk: a lavender sky, a low warm sun behind the row at the left (its light catches the frogs' backs and lays
    // long shadows toward us), and a cool light from our side so that their faces are seen.
    this.scene.add(new T.HemisphereLight("#b9b3d8", "#1f2b1b", 1.25));
    const sun = new T.DirectionalLight("#ffb07a", 2.5);
    sun.position.set(-7, 3.4, -7.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -8;
    sun.shadow.camera.right = sun.shadow.camera.top = 8;
    sun.shadow.camera.far = 30;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    const front = new T.DirectionalLight("#e4e8ff", 0.75);
    front.position.set(2, 6, 10);
    this.scene.add(sun, front);
    this.bark = keep(barkTexture());
    this.parts = {
      white: keep(glossy({ color: "#fbfaf3", roughness: 0.22 })),
      pupil: keep(glossy({ color: "#121212", roughness: 0.15 })),
      shine: keep(new T.MeshBasicMaterial({ color: "#ffffff" })),
      mouth: this.standard({ color: "#3b2316", roughness: 0.6 }),
      blush: keep(new T.MeshBasicMaterial({ color: "#ff8ea6", transparent: true, opacity: 0.62, depthWrite: false })),
      sac: keep(glossy({ color: "#ffe8c6", roughness: 0.35 })),
      bark: this.standard({ map: this.bark, roughness: 0.95 }),
      fungus: this.standard({ color: "#cfa46a", roughness: 0.75 }),
      gills: this.standard({ color: "#efdcbc", roughness: 0.9 }),
    };
    this.shapes = frogShapes();
    this.badge = this.own(new T.CircleGeometry(0.1, 36));
    for (const g of [...Object.values(this.shapes.body), ...Object.values(this.shapes.eyes), this.shapes.sac, this.shapes.collar]) this.own(g!);
    this.water(keep);
    this.scene.add(this.row, this.reflections);
    // The marks: rings on the stumps' tops, the keyboard's ring on the water, white arcs to where a frog may go, and
    // the hint's gold arc ending in a point.
    const flat = (color: string, opacity: number, onTop = false) =>
      keep(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: !onTop, side: T.DoubleSide, fog: false }));
    const ring = (inner: number, outer: number, material: T.Material, order = 6) => {
      const g = keep(new T.RingGeometry(inner, outer, 56));
      g.rotateX(-Math.PI / 2);
      const mesh = new T.Mesh(g, material);
      mesh.visible = false;
      mesh.renderOrder = order;
      this.scene.add(mesh);
      return mesh;
    };
    this.rings = {
      chosen: ring(0.3, 0.4, flat("#62cfff", 0.95)),
      cursor: ring(0.61, 0.69, flat("#ffffff", 0.95), 9),
      from: ring(0.3, 0.4, flat("#ffb21f", 0.95)),
      to: ring(0.22, 0.4, flat("#ffc23a", 0.8)),
      aim: ring(0.2, 0.4, flat("#fff3c4", 0.75)),
    };
    const aimPaint = flat("#ffffff", 0.85);
    this.aims = [0, 1, 2, 3].map(() => ring(0.27, 0.39, aimPaint));
    const arcPaint = flat("#ffffff", 0.55, true),
      gold = flat("#ffb21f", 0.95, true);
    const arcMesh = (paint: T.Material) => {
      const mesh = new T.Mesh(undefined, paint);
      mesh.visible = false;
      mesh.renderOrder = 10;
      this.scene.add(mesh);
      return mesh;
    };
    this.arcs = [0, 1, 2, 3].map(() => arcMesh(arcPaint));
    this.hintArc = arcMesh(gold);
    this.hintTip = new T.Mesh(keep(new T.ConeGeometry(0.075, 0.18, 14)), gold);
    this.hintTip.visible = false;
    this.hintTip.renderOrder = 10;
    this.scene.add(this.hintTip);
    // A dragged frog is followed a little above the stumps' tops.
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -0.95);
    this.begin();
    // Where a graphics card draws, the sky at dusk is what shining things reflect, not the plain room of other tables.
    if (capable()) this.dusk();
    if (this.live) this.kick();
  }
  private sky: T.WebGLRenderTarget | null = null;
  /**
   * The swamp's own photographic light instead of `realism`'s: soft shadows and, for what shines to reflect, the sky
   * at dusk rather than a lit room (whose lamps showed as white patches on the water), with no extra fill or rim
   * light (on still water they made a second glitter where the sun is not). Only where a graphics card draws.
   */
  protected photographic() {
    return false;
  }
  private dusk() {
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene.traverse((thing) => {
      if (thing instanceof T.HemisphereLight) thing.intensity *= 0.62;
      else if (thing instanceof T.DirectionalLight && thing.castShadow) {
        thing.shadow.radius = 5;
        thing.shadow.blurSamples = 16;
      }
    });
    const pmrem = new T.PMREMGenerator(this.renderer),
      picture = duskTexture();
    this.sky = pmrem.fromEquirectangular(picture);
    picture.dispose();
    pmrem.dispose();
    this.scene.environment = this.sky.texture;
    this.scene.environmentIntensity = 0.55;
    this.redraw();
  }
  /** The water: dark and still, partly clear so that the sky's colour and the reflections under it show through, with slow ripples where a graphics card draws. */
  private water(keep: Own) {
    const options: T.MeshStandardMaterialParameters = { color: "#17282b", roughness: 0.24, metalness: 0.05, transparent: true, opacity: 0.86 };
    if (capable()) {
      const ripples = keep(rippleTexture());
      ripples.repeat.set(14, 14);
      this.flows.push(ripples);
      options.normalMap = ripples;
      options.normalScale = new T.Vector2(0.22, 0.22);
    }
    const plane = new T.PlaneGeometry(90, 90, 8, 8);
    plane.rotateX(-Math.PI / 2);
    const water = this.add(plane, this.standard(options));
    water.castShadow = false;
    water.renderOrder = -1;
  }
  /** What stands round the row: reeds and cattails, lily pads, a floating log, the far bank's trees, fireflies and mist. */
  private swamp(keep: Own, n: number) {
    const rand = sequence(2024),
      standing = new T.Group(),
      reach = ((n - 1) / 2) * SPACING;
    // Reeds in clumps behind the row and beyond its ends, and a few low ones near the front corners.
    const clumps: [number, number, number][] = [];
    for (let k = 0; k < 9; k++) clumps.push([-reach - 2.2 + (k / 8) * (2 * reach + 4.4) + (rand() - 0.5) * 0.8, -2.3 - rand() * 2, 8 + Math.floor(rand() * 7)]);
    for (const s of [-1, 1]) {
      clumps.push([s * (reach + 1.25), -0.5, 16], [s * (reach + 2.2), 0.6, 12], [s * (reach + 1.9), 2.6, 9], [s * (reach + 3.3), -1.2, 14]);
    }
    const blade = keep(new T.ConeGeometry(0.024, 1, 4, 1));
    blade.translate(0, 0.5, 0);
    const blades: T.Matrix4[] = [],
      tails: T.Matrix4[] = [],
      stalks: T.Matrix4[] = [],
      q = new T.Quaternion(),
      e = new T.Euler();
    for (const [cx, cz, many] of clumps) {
      for (let k = 0; k < many; k++) {
        const a = rand() * Math.PI * 2,
          r = Math.sqrt(rand()) * 0.42,
          tall = 0.7 + rand() * 1.05;
        e.set((rand() - 0.5) * 0.45, rand() * 3, (rand() - 0.5) * 0.45);
        q.setFromEuler(e);
        blades.push(new T.Matrix4().compose(new T.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r), q, new T.Vector3(1 + rand() * 0.6, tall, 1)));
      }
      // Some clumps have cattails standing up out of them.
      if (rand() < 0.65)
        for (let k = 0; k < 1 + Math.floor(rand() * 3); k++) {
          const x = cx + (rand() - 0.5) * 0.4,
            z = cz + (rand() - 0.5) * 0.4,
            tall = 1.25 + rand() * 0.6,
            lean = (rand() - 0.5) * 0.18;
          e.set(lean, 0, (rand() - 0.5) * 0.18);
          q.setFromEuler(e);
          stalks.push(new T.Matrix4().compose(new T.Vector3(x, 0, z), q, new T.Vector3(1, tall, 1)));
          const head = new T.Vector3(0, tall * 0.82, 0).applyQuaternion(q).add(new T.Vector3(x, 0, z));
          tails.push(new T.Matrix4().compose(head, q, new T.Vector3(1, 1, 1)));
        }
    }
    const reedPaint = this.standard({ color: "#40592c", roughness: 0.85 }),
      reedPale = this.standard({ color: "#6b7a3c", roughness: 0.85 }),
      tailPaint = this.standard({ color: "#5a3720", roughness: 0.95 });
    const many = (geometry: T.BufferGeometry, paint: T.Material, matrices: T.Matrix4[], parent: T.Object3D) => {
      const mesh = new T.InstancedMesh(geometry, paint, matrices.length);
      matrices.forEach((x, i) => mesh.setMatrixAt(i, x));
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    many(blade, reedPaint, blades.filter((_, i) => i % 3), standing);
    many(blade, reedPale, blades.filter((_, i) => !(i % 3)), standing);
    const stalk = keep(new T.CylinderGeometry(0.011, 0.014, 1, 5));
    stalk.translate(0, 0.5, 0);
    many(stalk, reedPale, stalks, standing);
    const tail = keep(new T.CapsuleGeometry(0.045, 0.2, 4, 10));
    many(tail, tailPaint, tails, standing);
    // The far bank: low ground and trees, mostly lost in the mist, and two dead trees nearer at the sides.
    const bankPaint = this.standard({ color: "#2b3524", roughness: 1 }),
      trunkPaint = this.standard({ color: "#2c241d", roughness: 1 });
    const mound = keep(new T.SphereGeometry(1, 24, 10));
    for (let k = 0; k < 7; k++) {
      const mesh = new T.Mesh(mound, bankPaint);
      mesh.castShadow = false;
      mesh.position.set(-24 + k * 8 + (rand() - 0.5) * 2, -0.15, -17 - rand() * 2);
      mesh.scale.set(5.5 + rand() * 2, 0.55 + rand() * 0.3, 2);
      standing.add(mesh);
    }
    // Their crowns are painted leaves on cards round a dark core (`Grove`), dark against the mist.
    const grove = new Grove(standing, keep, { shadow: false, leaves: 0.7 }),
      trunk = keep(new T.CylinderGeometry(0.07, 0.13, 1, 7));
    trunk.translate(0, 0.5, 0);
    for (let k = 0; k < 15; k++) {
      const x = -25 + k * 3.6 + (rand() - 0.5) * 1.5,
        z = -16.5 - rand() * 2.5,
        tall = 1.2 + rand() * 1.4,
        t = new T.Mesh(trunk, trunkPaint);
      t.position.set(x, 0, z);
      t.scale.set(1.4, tall, 1.4);
      grove.crown(k % 3 ? "oak" : "birch", [x, tall + 0.3, z], [1.4 + rand() * 0.8, 1.8 + rand() * 1, 1.4 + rand() * 0.8], "#1f2b20", k);
      standing.add(t);
    }
    grove.build();
    const bough = keep(new T.CylinderGeometry(0.025, 0.06, 1, 6));
    bough.translate(0, 0.5, 0);
    for (const [x, z, tall] of [
      [-reach - 3.4, -3.6, 3.1],
      [reach + 3.9, -4.6, 2.6],
    ]) {
      const tree = new T.Group(),
        stem = new T.Mesh(trunk, trunkPaint);
      stem.scale.set(1.3, tall, 1.3);
      tree.add(stem);
      for (let k = 0; k < 5; k++) {
        const branch = new T.Mesh(bough, trunkPaint),
          side = k % 2 ? 1 : -1;
        branch.position.y = tall * (0.45 + k * 0.11);
        branch.rotation.set((rand() - 0.5) * 0.6, rand() * 3, side * (0.7 + rand() * 0.5));
        branch.scale.set(1, 0.7 + rand() * 0.9, 1);
        tree.add(branch);
      }
      tree.position.set(x, 0, z);
      tree.traverse((o) => (o.castShadow = true));
      standing.add(tree);
    }
    // A few stones at the sides.
    const stone = keep(new T.DodecahedronGeometry(0.22, 1)),
      stonePaint = this.standard({ color: "#55574d", roughness: 0.9 });
    for (const [x, z, s] of [
      [reach + 1.4, 1.5, 1],
      [reach + 2.1, 1.9, 0.6],
      [-reach - 1.7, -0.9, 0.8],
      [-reach - 2.5, 1.2, 0.55],
    ]) {
      const mesh = new T.Mesh(stone, stonePaint);
      mesh.position.set(x, 0.02, z);
      mesh.scale.set(s * 1.3, s * 0.6, s);
      mesh.rotation.y = x;
      mesh.castShadow = mesh.receiveShadow = true;
      standing.add(mesh);
    }
    this.scene.add(standing);
    // What stands in the water is seen again upside down in it.
    const mirrored = standing.clone();
    mirrored.scale.y = -1;
    mirrored.traverse((o) => (o.castShadow = o.receiveShadow = false));
    this.scene.add(mirrored);
    // Lily pads, kept clear of the stumps, a few of them in flower.
    const pad = keep(new T.CircleGeometry(1, 30, 0.3, Math.PI * 2 - 0.6));
    pad.rotateX(-Math.PI / 2);
    const padPaint = this.standard({ map: keep(padTexture()), roughness: 0.55 }),
      petalPaint = this.standard({ color: "#f6d6e4", roughness: 0.6 }),
      heart = this.standard({ color: "#f1c63e", roughness: 0.6 }),
      pads: { x: number; z: number; r: number }[] = [];
    for (let tries = 0; pads.length < 34 && tries < 600; tries++) {
      const front = rand() < 0.62,
        x = (rand() - 0.5) * (2 * reach + 6),
        z = front ? 0.85 + rand() * 4.2 : -0.85 - rand() * 2.6,
        r = 0.18 + rand() * 0.3;
      if (Math.abs(z) < 0.95 && Math.abs(x) < reach + 0.7) continue;
      if (pads.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 0.05)) continue;
      pads.push({ x, z, r });
    }
    // The pads are one instanced mesh, and the lilies are two merged shapes (petals and hearts): few draw calls.
    const padMesh = new T.InstancedMesh(pad, padPaint, pads.length),
      petals: T.BufferGeometry[] = [],
      hearts: T.BufferGeometry[] = [],
      placed = new T.Matrix4();
    pads.forEach((p, k) => {
      placed.compose(new T.Vector3(p.x, 0.006 + (k % 3) * 0.001, p.z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), rand() * Math.PI * 2), new T.Vector3(p.r, 1, p.r));
      padMesh.setMatrixAt(k, placed);
      if (k % 6 !== 2) return;
      // A water lily: two rings of petals round a yellow heart.
      const cx = p.x + p.r * 0.2,
        cz = p.z - p.r * 0.1,
        size = 1.6,
        piece = (sx: number, sy: number, sz: number, tilt: number, turn: number, x: number, y: number, z: number) => {
          const g = new T.SphereGeometry(1, 10, 6);
          g.scale(sx * size, sy * size, sz * size);
          g.rotateX(tilt);
          g.rotateY(turn);
          g.translate(cx + x * size, 0.006 + y * size, cz + z * size);
          return g;
        };
      for (let ring = 0; ring < 2; ring++)
        for (let j = 0; j < 7; j++) {
          const a = (j / 7) * Math.PI * 2 + ring * 0.45,
            r = 0.05 - ring * 0.02;
          petals.push(piece(0.035, 0.018, 0.08 - ring * 0.02, -0.5 - ring * 0.4, a, Math.sin(a) * r, 0.025 + ring * 0.015, Math.cos(a) * r));
        }
      hearts.push(piece(0.025, 0.018, 0.025, 0, 0, 0, 0.04, 0));
    });
    padMesh.receiveShadow = true;
    this.scene.add(padMesh);
    if (petals.length) {
      const lilies = new T.Mesh(keep(merged(petals)), petalPaint),
        middles = new T.Mesh(keep(merged(hearts)), heart);
      lilies.castShadow = true;
      this.scene.add(lilies, middles);
    }
    // Mist lying low over the water behind the row, and fireflies over the reeds.
    const wisp = keep(
        new T.SpriteMaterial({
          map: keep(glowTexture([
            [0, "rgba(236, 228, 248, 0.55)"],
            [0.5, "rgba(236, 228, 248, 0.22)"],
            [1, "rgba(236, 228, 248, 0)"],
          ])),
          transparent: true,
          depthWrite: false,
          opacity: 0.5,
        }),
      ),
      glow = keep(glowTexture([
        [0, "rgba(255, 255, 230, 1)"],
        [0.18, "rgba(236, 255, 140, 0.85)"],
        [0.5, "rgba(190, 255, 90, 0.22)"],
        [1, "rgba(190, 255, 90, 0)"],
      ]));
    for (let k = 0; k < 7; k++) {
      const sprite = new T.Sprite(wisp),
        x = -reach - 3 + (k / 6) * (2 * reach + 6);
      sprite.position.set(x, 0.55 + rand() * 0.5, -3.2 - rand() * 4.5);
      sprite.scale.set(7 + rand() * 3, 1.5 + rand() * 0.8, 1);
      sprite.renderOrder = -1;
      this.scene.add(sprite);
      this.wisps.push({ sprite, x, phase: rand() * 6 });
    }
    for (let k = 0; k < 24; k++) {
      const [cx, cz] = clumps[Math.floor(rand() * clumps.length)],
        sprite = new T.Sprite(keep(new T.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, opacity: 0.8 }))),
        base = new T.Vector3(cx + (rand() - 0.5) * 1.6, 0.5 + rand() * 1.4, cz + (rand() - 0.5) * 1.2);
      // None in front of the row, where it would stand over a frog.
      if (base.z > -0.9 && Math.abs(base.x) < reach + 0.9) base.z = -1.2 - rand();
      sprite.position.copy(base);
      sprite.scale.setScalar(0.16 + rand() * 0.08);
      this.scene.add(sprite);
      this.flies.push({ sprite, base, phase: rand() * 10, speed: 0.6 + rand() * 0.7 });
    }
  }
  private skinOf(colour: number) {
    let paint = this.skins.get(colour);
    if (!paint) {
      paint = this.own(glossy({ map: this.own(skinTexture(FROG_PAINTS[colour].paint)), roughness: 0.48, emissive: FROG_PAINTS[colour].paint, emissiveIntensity: 0.1 }, 0.45));
      this.skins.set(colour, paint);
    }
    return paint;
  }
  private bellyOf(colour: number) {
    let paint = this.bellies.get(colour);
    if (!paint) {
      paint = this.standard({ map: this.own(bellyTexture(colour)), roughness: 0.5 });
      this.bellies.set(colour, paint);
    }
    return paint;
  }
  private ribbonOf(colour: number) {
    let paint = this.ribbons.get(colour);
    if (!paint) {
      const keep: Own = (r) => this.own(r);
      paint = {
        cloth: this.standard({ map: this.own(ribbonTexture(colour)), roughness: 0.78, side: T.DoubleSide, ...weave(4, 1, keep, 0.5) }),
        rosette: this.standard({ map: this.own(rosetteTexture(colour)), roughness: 0.7, alphaTest: 0.5, side: T.DoubleSide }),
        collar: this.standard({ color: FROG_PAINTS[colour].dark, roughness: 0.8 }),
      };
      this.ribbons.set(colour, paint);
    }
    return paint;
  }
  /** One frog model of a colour, the real one or its reflection. */
  private frogModel(colour: number, shadow: boolean): FrogModel {
    const root = new T.Group(),
      squash = new T.Group(),
      breath = new T.Group(),
      eyes = new T.Group(),
      paint: Record<FrogPart, T.Material> = {
        skin: this.skinOf(colour),
        belly: this.bellyOf(colour),
        white: this.parts.white,
        pupil: this.parts.pupil,
        shine: this.parts.shine,
        mouth: this.parts.mouth,
        blush: this.parts.blush,
        sac: this.parts.sac,
      };
    const mesh = (geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D) => {
      const m = new T.Mesh(geometry, material);
      m.castShadow = shadow;
      m.receiveShadow = shadow;
      parent.add(m);
      return m;
    };
    for (const [part, geometry] of Object.entries(this.shapes.body) as [FrogPart, T.BufferGeometry][]) mesh(geometry, paint[part], breath);
    for (const [part, geometry] of Object.entries(this.shapes.eyes) as [FrogPart, T.BufferGeometry][]) mesh(geometry, paint[part], eyes);
    eyes.position.copy(EYES_AT);
    breath.add(eyes);
    const sac = mesh(this.shapes.sac, this.parts.sac, breath);
    sac.position.copy(SAC_AT);
    sac.scale.setScalar(0.001);
    // The collar and its medal: the same rosette as on the ribbons of its stumps, so that a frog and its stump are
    // matched by their symbol as well as by their colour.
    const { rosette, collar } = this.ribbonOf(colour);
    mesh(this.shapes.collar, collar, breath);
    const medal = mesh(this.badge, rosette, breath);
    medal.position.copy(MEDAL_AT);
    medal.rotation.x = -0.32;
    medal.scale.setScalar(0.72);
    squash.add(breath);
    root.add(squash);
    return { root, squash, breath, eyes, sac };
  }
  /** Keeps a frog's reflection in step with it: the water is at y = 0, and its reflection is the frog turned over in it. */
  private reflect(frog: Frog) {
    const r = frog.root,
      m = frog.mirror;
    m.root.visible = r.visible;
    m.root.position.set(r.position.x, -r.position.y, r.position.z);
    m.root.rotation.set(-r.rotation.x, r.rotation.y, -r.rotation.z);
    m.root.scale.set(r.scale.x, -r.scale.y, r.scale.z);
    m.squash.scale.copy(frog.squash.scale);
    m.squash.rotation.copy(frog.squash.rotation);
    m.breath.scale.copy(frog.breath.scale);
    m.eyes.scale.copy(frog.eyes.scale);
    m.sac.scale.copy(frog.sac.scale);
  }
  /** A stump of the row, of its own height, with its ribbon (or a shelf of fungus where it is bare). */
  private stump(n: number, index: number, colour: number) {
    const at = stumpAt(n, index),
      keep = <R extends { dispose(): void }>(r: R) => (this.laid.push(r), r),
      phase = index * 2.3 + 0.7,
      points = profile(at.top),
      group = new T.Group(),
      body = new T.LatheGeometry(
        points.map(([r, y]) => new T.Vector2(r, y)),
        40,
      ),
      shaped = (geometry: T.BufferGeometry) => {
        const p = geometry.getAttribute("position");
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i),
            z = p.getZ(i),
            k = wander(Math.atan2(x, z), phase);
          p.setXYZ(i, x * k, p.getY(i), z * k);
        }
        geometry.computeVertexNormals();
        return geometry;
      };
    const trunk = new T.Mesh(keep(shaped(body)), this.parts.bark);
    trunk.castShadow = trunk.receiveShadow = true;
    trunk.userData.stump = index;
    group.add(trunk);
    const face = new T.CircleGeometry(STUMP_RADIUS - 0.012, 40);
    face.rotateX(-Math.PI / 2);
    face.translate(0, at.top, 0);
    const top = new T.Mesh(keep(shaped(face)), keep(new T.MeshStandardMaterial({ map: keep(ringsTexture(index * 31 + 5)), roughness: 0.85 })));
    top.receiveShadow = true;
    top.userData.stump = index;
    group.add(top);
    const y = at.top - RIBBON_DROP,
      R = radiusAt(points, y);
    if (colour !== NONE) {
      const { cloth, rosette } = this.ribbonOf(colour),
        band = new T.CylinderGeometry(1, 1, 0.085, 48, 1, true),
        p = band.getAttribute("position");
      // The band follows the stump's round, a hair outside it.
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          z = p.getZ(i),
          k = wander(Math.atan2(x, z), phase) * R + 0.009;
        p.setXYZ(i, x * k, p.getY(i), z * k);
      }
      band.computeVertexNormals();
      const ribbon = new T.Mesh(keep(band), cloth);
      ribbon.position.y = y;
      ribbon.castShadow = true;
      group.add(ribbon);
      // The bow at the front: two loops and two tails round a rosette with the colour's symbol.
      const front = wander(0, phase) * R + 0.012,
        loop = keep(new T.TorusGeometry(0.07, 0.022, 8, 20)),
        tailShape = keep(new T.BoxGeometry(0.05, 0.17, 0.01));
      for (const s of [-1, 1]) {
        const l = new T.Mesh(loop, cloth);
        l.scale.set(1.15, 0.72, 0.4);
        l.position.set(s * 0.1, y + 0.012, front + 0.022);
        l.rotation.set(0, s * 0.35, s * 0.32);
        l.castShadow = true;
        const t = new T.Mesh(tailShape, cloth);
        t.position.set(s * 0.055, y - 0.095, front + 0.03);
        t.rotation.set(0.12, 0, s * 0.3);
        t.castShadow = true;
        group.add(l, t);
      }
      const badge = new T.Mesh(this.badge, rosette);
      badge.position.set(0, y, front + 0.052);
      badge.rotation.x = -0.1;
      group.add(badge);
    } else {
      // A bare stump: a shelf of fungus or two on its side, and nothing round it.
      for (const [turn, dy, size] of [
        [0.5, 0.2, 1.05],
        [0.78, 0.31, 0.75],
        [-0.55, 0.15, 0.85],
      ]) {
        const shelf = new T.Mesh(keep(new T.SphereGeometry(0.1, 16, 8, 0, Math.PI, 0, Math.PI / 2)), this.parts.fungus),
          under = new T.Mesh(keep(new T.CircleGeometry(0.1, 16, 0, Math.PI)), this.parts.gills),
          r = radiusAt(points, dy) * wander(turn, phase) - 0.01;
        // The shelf's flat back against the bark (its +z turned outward), its gills under it.
        for (const piece of [shelf, under]) {
          piece.position.set(Math.sin(turn) * r, dy, Math.cos(turn) * r);
          piece.castShadow = true;
          group.add(piece);
        }
        shelf.scale.set(size, size * 0.6, size);
        shelf.rotation.y = turn;
        under.scale.setScalar(size);
        under.rotation.order = "YXZ";
        under.rotation.set(Math.PI / 2, turn, 0);
      }
    }
    group.position.set(at.x, 0, at.z);
    group.userData.stump = index;
    return group;
  }
  /** Builds the stumps and frogs of a puzzle (where the frogs sit is set by `place`), and frames the row. */
  private lay(state: State) {
    const colours = state.frogs.filter((f) => f !== NONE).sort((a, b) => a - b),
      key = `${state.ribbons.join(",")}|${colours.join(",")}`;
    if (key === this.built) return;
    this.built = key;
    for (const r of this.laid) r.dispose();
    this.laid = [];
    this.row.clear();
    this.reflections.clear();
    const n = state.ribbons.length;
    this.count = n;
    // The swamp round the row is laid once, as wide as the row the view was made for.
    if (!this.surrounded) {
      this.surrounded = true;
      this.swamp((r) => this.own(r), n);
    }
    this.stumps = state.ribbons.map((colour, i) => {
      const group = this.stump(n, i, colour),
        mirror = group.clone();
      mirror.scale.y = -1;
      mirror.traverse((o) => (o.castShadow = o.receiveShadow = false));
      this.row.add(group);
      this.reflections.add(mirror);
      return group;
    });
    // The first blinks come a few seconds after the row is laid, one frog after another.
    let blink = performance.now() / 1000 + 3;
    this.frogs = colours.map((colour) => {
      const frog: Frog = { ...this.frogModel(colour, true), colour, mirror: this.frogModel(colour, false), blink: (blink += 1.3) };
      this.row.add(frog.root);
      this.reflections.add(frog.mirror.root);
      return frog;
    });
    this.occupant = new Array<number>(n).fill(-1);
    this.resize();
  }
  /** Which frog sits where: each keeps its stump while the state agrees, and the others are seated by colour. */
  private seat(state: State) {
    const n = state.frogs.length,
      used = new Set<number>(),
      next = new Array<number>(n).fill(-1);
    if (this.occupant.length !== n) this.occupant = new Array<number>(n).fill(-1);
    state.frogs.forEach((colour, i) => {
      const k = this.occupant[i];
      if (colour !== NONE && k >= 0 && this.frogs[k]?.colour === colour && !used.has(k)) {
        next[i] = k;
        used.add(k);
      }
    });
    state.frogs.forEach((colour, i) => {
      if (colour === NONE || next[i] >= 0) return;
      const k = this.frogs.findIndex((f, j) => f.colour === colour && !used.has(j));
      if (k < 0) return;
      next[i] = k;
      used.add(k);
    });
    this.occupant = next;
  }
  protected subject(aspect: number): TableSubject {
    return frogSubject(this.count, aspect);
  }
  protected layout(aspect: number) {
    // The row stays clear of the mist, and the far bank fades into it.
    const d = cameraDistance(aspect, false, this.subject(aspect));
    this.fog.near = d * 0.95;
    this.fog.far = d * 2.2;
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    return state.frogs.map((_, i) => {
      const at = stumpAt(state.frogs.length, i);
      return { x: at.x, y: at.top + 0.15, z: at.z, r: 0.62, point: i };
    });
  }
  /** A press is on the frog or the stump it strikes. */
  protected pick(ray: T.Ray) {
    const state = this.state;
    if (!state || this.animating) return null;
    this.row.updateMatrixWorld(true);
    this.caster.ray.copy(ray);
    const frogs = this.frogs.filter((f) => f.root.visible).map((f) => f.root),
      hit = this.caster.intersectObjects([...frogs, ...this.stumps], true)[0];
    let thing: T.Object3D | null = hit?.object ?? null;
    while (thing && thing.userData.stump === undefined && !frogs.includes(thing as T.Group)) thing = thing.parent;
    if (!thing) return null;
    if (thing.userData.stump !== undefined) return thing.userData.stump as number;
    const k = this.frogs.findIndex((f) => f.root === thing);
    return this.occupant.indexOf(k);
  }
  protected hover(point: number) {
    const state = this.state;
    if (this.press?.moving || !state) return;
    const movable = point >= 0 && state.winner === null && state.frogs[point] !== NONE && targets(state, point).length > 0;
    this.renderer.domElement.style.cursor = movable || this.marks.targets.includes(point) ? "pointer" : "default";
  }
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null) return false;
    // Every press is taken here: a tap is told apart from a drag when it is let go.
    const frog = point >= 0 && point < state.frogs.length && state.frogs[point] !== NONE ? this.occupant[point] : -1;
    this.press = { point, x: at.x, z: at.z, moving: false, frog, ways: frog >= 0 ? targets(state, point) : [] };
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const press = this.press,
      state = this.state;
    if (!press || !state || press.frog < 0 || !press.ways.length) return;
    if (!press.moving && Math.hypot(at.x - press.x, at.z - press.z) < 0.3) return;
    press.moving = true;
    this.renderer.domElement.style.cursor = "grabbing";
    const n = state.frogs.length,
      from = stumpAt(n, press.point),
      xs = [press.point, ...press.ways].map((i) => stumpAt(n, i).x),
      x = Math.max(Math.min(...xs) - 0.25, Math.min(Math.max(...xs) + 0.25, from.x + at.x - press.x)),
      frog = this.frogs[press.frog];
    frog.root.position.set(x, from.top + 0.42, from.z);
    frog.root.rotation.set(0, Math.sign(x - from.x) * 0.9 * Math.min(1, Math.abs(x - from.x) / 0.6), 0);
    frog.squash.scale.set(0.96, 1.08, 0.96);
    this.reflect(frog);
    this.mark(this.marks);
    this.redraw();
  }
  /** The stump a dragged frog is over, if it may land there. */
  private aimed() {
    const press = this.press,
      state = this.state;
    if (!press?.moving || !state) return -1;
    const x = this.frogs[press.frog].root.position.x,
      n = state.frogs.length;
    return press.ways.find((i) => Math.abs(stumpAt(n, i).x - x) < SPACING * 0.5) ?? -1;
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const press = this.press,
      state = this.state;
    const aim = this.aimed();
    this.press = null;
    this.renderer.domElement.style.cursor = "default";
    if (!press || !state) return;
    if (!press.moving) {
      if (at) this.tap(state, press.point);
      return;
    }
    const frog = this.frogs[press.frog];
    if (at && aim >= 0) {
      this.dropped = { frog: press.frog, x: frog.root.position.x, y: frog.root.position.y, z: frog.root.position.z };
      this.onMove({ from: press.point, to: aim, extra: -1 });
      if (this.state !== state) return;
      this.dropped = null;
    }
    // Back onto its own stump.
    const seat = stumpAt(state.frogs.length, press.point),
      from = frog.root.position.clone(),
      turn = frog.root.rotation.y;
    this.mark(this.marks);
    this.tween(0, 200, (p) => {
      const e = 1 - (1 - p) ** 3;
      frog.root.position.set(from.x + (seat.x - from.x) * e, from.y + (seat.top - from.y) * e, from.z + (seat.z - from.z) * e);
      frog.root.rotation.y = turn * (1 - e);
      frog.squash.scale.set(1, 1, 1);
      this.reflect(frog);
    });
  }
  /**
   * A tap: a frog with one way to go goes there at once; one with two is picked up (or let go) by the screen, which
   * then takes a tap on a stump it may land on; a frog with none shakes its head.
   */
  private tap(state: State, point: number) {
    if (point >= 0 && state.frogs[point] !== undefined && state.frogs[point] !== NONE) {
      const ways = targets(state, point);
      if (ways.length === 1) return this.onMove({ from: point, to: ways[0], extra: -1 });
      if (!ways.length) this.shake(this.occupant[point]);
    }
    this.onPick(point);
  }
  /** Runs the swamp's own frame loop: what moves by itself, and the passing effects (ripples, a shake, joy). */
  private kick() {
    if (!this.clock && !this.disposed) this.clock = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed) return;
    if (this.live) this.idle(now / 1000);
    this.effects = this.effects.filter((effect) => {
      const p = Math.min(1, Math.max(0, (now - effect.start) / effect.duration));
      if (now >= effect.start) effect.update(p);
      return p < 1;
    });
    this.redraw();
    if (this.live || this.effects.length) this.kick();
  };
  private effect(delay: number, duration: number, update: (p: number) => void) {
    if (this.reducedMotion) return;
    this.effects.push({ start: performance.now() + delay, duration, update });
    this.kick();
  }
  private idle(t: number) {
    for (const flow of this.flows) flow.offset.set((t * 0.004) % 1, (t * 0.0025) % 1);
    for (const fly of this.flies) {
      const s = t * fly.speed + fly.phase;
      fly.sprite.position.set(fly.base.x + Math.sin(s * 0.7) * 0.35, fly.base.y + Math.sin(s * 1.3) * 0.18, fly.base.z + Math.cos(s * 0.5) * 0.3);
      fly.sprite.material.opacity = 0.15 + 0.85 * Math.max(0, Math.sin(s * 1.7)) ** 2;
    }
    for (const wisp of this.wisps) wisp.sprite.position.x = wisp.x + Math.sin(t * 0.06 + wisp.phase) * 1.4;
    // No frog is caught with its eyes shut in a picture taken for the collection.
    const capture = !!document.documentElement.dataset.capture;
    this.frogs.forEach((frog, k) => {
      const b = Math.sin(t * 2.3 + k * 1.3);
      frog.breath.scale.set(1 - 0.006 * b, 1 + 0.016 * b, 1 - 0.006 * b);
      // A blink now and then, each frog in its own time.
      if (t > frog.blink + 0.14) frog.blink = t + 2.5 + ((k * 7919 + Math.floor(t)) % 40) / 10;
      frog.eyes.scale.y = t > frog.blink && !capture ? 0.12 : 1;
      this.reflect(frog);
    });
    const pulse = 0.6 + 0.35 * Math.sin(t * 5);
    for (const ring of this.aims) (ring.material as T.MeshBasicMaterial).opacity = pulse;
  }
  /** Rings spreading on the water round the foot of a stump a frog has landed on. */
  private ripple(index: number) {
    if (!this.ripples.length) {
      const geometry = this.own(new T.RingGeometry(0.55, 0.6, 48));
      geometry.rotateX(-Math.PI / 2);
      for (let k = 0; k < 6; k++) {
        const paint = this.own(new T.MeshBasicMaterial({ color: "#d9e6f0", transparent: true, opacity: 0, depthWrite: false })),
          ring = new T.Mesh(geometry, paint);
        ring.visible = false;
        this.scene.add(ring);
        this.ripples.push({ ring, paint });
      }
    }
    const at = stumpAt(this.count, index);
    for (const delay of [0, 220]) {
      const { ring, paint } = this.ripples[this.rippled++ % this.ripples.length];
      ring.position.set(at.x, 0.012, at.z);
      ring.visible = false;
      this.effect(delay, 1100, (p) => {
        ring.visible = p < 1;
        ring.scale.setScalar(1 + p * 0.9);
        paint.opacity = 0.42 * (1 - p);
      });
    }
  }
  /** A frog that cannot go anywhere shakes from side to side. */
  private shake(k: number) {
    const frog = this.frogs[k];
    if (!frog) return;
    this.effect(0, 420, (p) => {
      frog.squash.rotation.y = 0.32 * Math.sin(p * Math.PI * 4) * (1 - p);
      this.reflect(frog);
    });
  }
  /** Every frog home: they hop for joy where they sit, one after another, then croak with their throats swelling. */
  private celebrate(state: State) {
    const n = state.frogs.length;
    state.frogs.forEach((colour, i) => {
      const frog = this.frogs[this.occupant[i]];
      if (colour === NONE || !frog) return;
      const at = stumpAt(n, i);
      this.effect(250 + i * 90, 3000, (p) => {
        const t = p * 3,
          up = t < 1.35 ? 0.16 * Math.abs(Math.sin((Math.PI * t) / 0.45)) : 0,
          croak = t > 1.5 && t < 2.9 ? Math.max(0, Math.sin((Math.PI * (t - 1.5)) / 0.35)) : 0;
        frog.root.position.y = at.top + up;
        frog.squash.scale.set(1, up > 0.01 ? 1.06 : 1, 1);
        frog.sac.scale.setScalar(p === 1 ? 0.001 : 0.001 + croak);
        this.reflect(frog);
      });
    });
  }
  protected place(state: State) {
    this.lay(state);
    this.seat(state);
    const n = state.frogs.length;
    for (const frog of this.frogs) frog.root.visible = false;
    state.frogs.forEach((colour, i) => {
      const frog = this.frogs[this.occupant[i]];
      if (colour === NONE || !frog) return;
      const at = stumpAt(n, i);
      frog.root.visible = true;
      frog.root.position.set(at.x, at.top, at.z);
      frog.root.rotation.set(0, 0, 0);
      frog.squash.scale.set(1, 1, 1);
      frog.squash.rotation.set(0, 0, 0);
    });
    for (const frog of this.frogs) this.reflect(frog);
    if (state.winner === 0 && this.cheered !== state) {
      this.cheered = state;
      this.celebrate(state);
    }
    this.mark(this.marks);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1 || before.frogs.length !== state.frogs.length || before.frogs[last.from] === NONE) return false;
    const k = this.occupant[last.from],
      frog = this.frogs[k];
    if (!frog) return false;
    this.occupant[last.to] = k;
    this.occupant[last.from] = -1;
    const n = state.frogs.length,
      a = stumpAt(n, last.from),
      b = stumpAt(n, last.to),
      jump = Math.abs(last.to - last.from) === 2,
      dropped = this.dropped?.frog === k ? this.dropped : null,
      start = dropped ?? { x: a.x, y: a.top, z: a.z },
      lift = jump ? 0.95 : 0.5,
      dir = Math.sign(b.x - a.x);
    this.dropped = null;
    let landed = false;
    // The sound is the leap (폴짝) and is begun as the frog leaves; it carries its own landing (`landingAfter`).
    this.onContact();
    this.tween(0, jump ? JUMP_MS : HOP_MS, (p) => {
      const q = travel(p);
      frog.root.position.set(start.x + (b.x - start.x) * q, start.y + (b.top - start.y) * q + hop(p) * lift, start.z + (b.z - start.z) * q);
      // Turned toward where it goes while in the air, and round to the front again as it lands.
      frog.root.rotation.y = dir * 1.2 * Math.sin(Math.PI * Math.min(1, p / 0.84));
      let up = 1,
        wide = 1;
      if (p < 0.12) {
        const c = Math.sin((Math.PI * p) / 0.12);
        up = 1 - 0.14 * c;
        wide = 1 + 0.08 * c;
      } else if (p < 0.84) {
        const s = Math.sin((Math.PI * (p - 0.12)) / 0.72);
        up = 1 + 0.12 * s;
        wide = 1 - 0.05 * s;
      } else {
        const s = Math.sin((Math.PI * (p - 0.84)) / 0.16);
        up = 1 - 0.2 * s;
        wide = 1 + 0.12 * s;
      }
      frog.squash.scale.set(wide, up, wide);
      if (!landed && p >= LANDS_AT) {
        landed = true;
        this.ripple(last.to);
      }
      this.reflect(frog);
    });
    return true;
  }
  /** The arc from a frog's head on stump `from` to the top of stump `to`: low for a hop, higher over a frog. */
  private arc(from: number, to: number) {
    const key = `${this.count}:${from}>${to}`;
    let shape = this.arcShapes.get(key);
    if (!shape) {
      const a = stumpAt(this.count, from),
        b = stumpAt(this.count, to),
        jump = Math.abs(to - from) === 2,
        start = new T.Vector3(a.x + Math.sign(b.x - a.x) * 0.12, a.top + 0.5, a.z),
        end = new T.Vector3(b.x, b.top + 0.16, b.z),
        control = new T.Vector3((start.x + end.x) / 2, Math.max(start.y, end.y) + (jump ? 0.95 : 0.55), (start.z + end.z) / 2),
        curve = new T.QuadraticBezierCurve3(start, control, end);
      shape = { tube: this.own(new T.TubeGeometry(curve, 36, 0.024, 8)), end, tangent: curve.getTangent(1).normalize() };
      this.arcShapes.set(key, shape);
    }
    return shape;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const n = state.frogs.length,
      onTop = (mesh: T.Mesh, index: number | null | undefined, lift = 0.014) => {
        mesh.visible = index !== null && index !== undefined && index >= 0 && index < n;
        if (!mesh.visible) return;
        const at = stumpAt(n, index!);
        mesh.position.set(at.x, at.top + lift, at.z);
      };
    // The keyboard's ring, on the water round the foot of its stump.
    onTop(this.rings.cursor, marks.cursor, 0);
    if (this.rings.cursor.visible) this.rings.cursor.position.y = 0.014;
    const hint = marks.hint ?? null,
      press = this.press?.moving ? this.press : null,
      chosen = press ? null : marks.selected,
      ways = press ? press.ways : chosen !== null ? marks.targets : [];
    onTop(this.rings.chosen, hint ? null : chosen);
    // Where the frog picked up (or dragged) may go: a ring on each stump and a faint arc to it.
    this.aims.forEach((ring, k) => onTop(ring, hint ? null : ways[k]));
    this.arcs.forEach((mesh, k) => {
      const to = hint ? undefined : ways[k],
        from = press ? press.point : chosen;
      mesh.visible = to !== undefined && from !== null && !press;
      if (mesh.visible) mesh.geometry = this.arc(from!, to!).tube;
    });
    const aim = this.aimed();
    onTop(this.rings.aim, aim >= 0 ? aim : null, 0.018);
    // A hint: gold rings on the frog's stump and on the one it goes to, and a gold arc between them ending in a point.
    onTop(this.rings.from, hint?.from);
    onTop(this.rings.to, hint?.to, 0.018);
    this.hintArc.visible = this.hintTip.visible = !!hint && hint.from >= 0 && hint.to >= 0 && hint.from < n && hint.to < n;
    if (this.hintArc.visible) {
      const shape = this.arc(hint!.from, hint!.to);
      this.hintArc.geometry = shape.tube;
      this.hintTip.position.copy(shape.end);
      this.hintTip.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), shape.tangent);
    }
    this.redraw();
  }
  dispose() {
    cancelAnimationFrame(this.clock);
    this.clock = 0;
    this.effects = [];
    this.sky?.dispose();
    this.sky = null;
    for (const r of this.laid) r.dispose();
    this.laid = [];
    super.dispose();
  }
}
