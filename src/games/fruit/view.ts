import { cryptoRandom } from "../../core/random";
import { capturing } from "../../ui/banner";
import { FlatView, rounded } from "../flat/view";
import { DROP, FRUITS, KINDS, MERGE, OVER, RADII, bonus, worth, type State } from "./rules";
import { DT, GRACE, HALF, HAND, HEIGHT, LINE, SPILL, createWorld, drop, sizeOf, step, type World } from "./sim";

export const FRUIT_COLORS: [string, string] = ["#e2483d", "#b9b3a4"];
/**
 * What the last sound the view asked for was about, read by the config's `contact` (the screen hands it only the
 * state): a fruit landing, two merging, or the heap reaching over the line.
 */
export const fruitCue: { kind: "land" | "merge" | "danger"; size: number; combo: number; strength: number } = { kind: "land", size: 0, combo: 1, strength: 0 };
/** The side of a fruit's picture in pixels, and the radius of the fruit in it (the rest is room for a stalk and a leaf). */
const SPRITE = 384,
  BALL = 150;
/** A small repeatable source of numbers for the skins. */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** How each kind looks: its colour lit and in shade, the colour of its juice, how glossy it is, and whether a bloom dulls it. */
interface Look {
  own: string;
  edge: string;
  juice: string;
  gloss: number;
  bloom?: boolean;
}
const LOOKS: Look[] = [
  { own: "#5466c8", edge: "#20286a", juice: "#7a5ad8", gloss: 0.3, bloom: true },
  { own: "#ee2c44", edge: "#7a0716", juice: "#e8203c", gloss: 1 },
  { own: "#a2dc5e", edge: "#3f7a1a", juice: "#bdf07a", gloss: 0.55 },
  { own: "#a04cc0", edge: "#3a1250", juice: "#d070c8", gloss: 0.35, bloom: true },
  { own: "#ffab3c", edge: "#d05e06", juice: "#ffb24a", gloss: 0.5 },
  { own: "#ec3f30", edge: "#8a1010", juice: "#fff0b0", gloss: 0.85 },
  { own: "#ffc488", edge: "#d47a3c", juice: "#ff8a86", gloss: 0.45 },
  { own: "#9a6a40", edge: "#3e2412", juice: "#fffaf0", gloss: 0.05 },
  { own: "#c2da82", edge: "#5e7e30", juice: "#d8f4a8", gloss: 0.3 },
  { own: "#44a64e", edge: "#164e20", juice: "#ff4d5e", gloss: 0.7 },
];
const TAU = Math.PI * 2;
const sprite = () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SPRITE;
  return canvas;
};
/** A leaf from its stalk end, shaded along its length, with a midrib and side veins. */
function leaf(pen: CanvasRenderingContext2D, x: number, y: number, length: number, angle: number, light = "#7cc44a", dark = "#2f6e1e") {
  pen.save();
  pen.translate(x, y);
  pen.rotate(angle);
  const fill = pen.createLinearGradient(0, -length * 0.3, 0, length * 0.3);
  fill.addColorStop(0, light);
  fill.addColorStop(1, dark);
  pen.fillStyle = fill;
  pen.beginPath();
  pen.moveTo(0, 0);
  pen.bezierCurveTo(length * 0.25, -length * 0.42, length * 0.75, -length * 0.36, length, 0);
  pen.bezierCurveTo(length * 0.7, length * 0.3, length * 0.3, length * 0.34, 0, 0);
  pen.fill();
  pen.strokeStyle = "rgba(20,60,10,0.55)";
  pen.lineWidth = length * 0.035;
  pen.lineCap = "round";
  pen.beginPath();
  pen.moveTo(length * 0.04, 0);
  pen.quadraticCurveTo(length * 0.5, -length * 0.04, length * 0.94, 0);
  pen.stroke();
  pen.lineWidth = length * 0.018;
  pen.strokeStyle = "rgba(220,255,190,0.35)";
  for (let k = 1; k <= 4; k++) {
    const t = k / 5;
    pen.beginPath();
    pen.moveTo(length * t, -length * 0.02);
    pen.lineTo(length * (t + 0.12), -length * 0.2 * (1 - t * 0.6));
    pen.moveTo(length * t, length * 0.01);
    pen.lineTo(length * (t + 0.1), length * 0.17 * (1 - t * 0.6));
    pen.stroke();
  }
  // A glint along the upper half.
  pen.fillStyle = "rgba(255,255,255,0.18)";
  pen.beginPath();
  pen.ellipse(length * 0.45, -length * 0.14, length * 0.22, length * 0.05, -0.08, 0, TAU);
  pen.fill();
  pen.restore();
}
/** A woody stalk through some points, darker at its edges. */
function stalk(pen: CanvasRenderingContext2D, points: [number, number][], width: number, color = "#6a4422") {
  pen.lineCap = "round";
  pen.lineJoin = "round";
  for (const [w, c] of [[width, "rgba(40,20,6,0.7)"], [width * 0.7, color], [width * 0.25, "rgba(255,230,190,0.35)"]] as const) {
    pen.strokeStyle = c;
    pen.lineWidth = w;
    pen.beginPath();
    pen.moveTo(points[0][0], points[0][1]);
    if (points.length === 3) pen.quadraticCurveTo(points[1][0], points[1][1], points[2][0], points[2][1]);
    else for (const [px, py] of points.slice(1)) pen.lineTo(px, py);
    pen.stroke();
  }
}
/**
 * The skin of a kind: its colours, its marks (pores, bloom, streaks, net, stripes, fibres) and what grows on it,
 * drawn upright with the stalk up. This turns with the fruit as it rolls; its light is drawn apart (`lighting`).
 */
function skin(kind: number) {
  const canvas = sprite(),
    pen = canvas.getContext("2d")!,
    c = SPRITE / 2,
    R = BALL,
    random = sequence(kind * 131 + 17),
    look = LOOKS[kind],
    inside = () => {
      const a = random() * TAU,
        d = Math.sqrt(random()) * R * 0.97;
      return [c + Math.cos(a) * d, c + Math.sin(a) * d] as const;
    },
    dots = (count: number, color: string, size: number, vary = 0.8) => {
      pen.fillStyle = color;
      for (let i = 0; i < count; i++) {
        const [x, y] = inside();
        pen.beginPath();
        pen.arc(x, y, size * (1 - vary / 2 + random() * vary), 0, TAU);
        pen.fill();
      }
    },
    // Small dimples: a dark dot with a light one a little up and to the left.
    pores = (count: number, size: number, dark: string, light: string) => {
      for (let i = 0; i < count; i++) {
        const [x, y] = inside(),
          s = size * (0.6 + random() * 0.8);
        pen.fillStyle = light;
        pen.beginPath();
        pen.arc(x - s * 0.5, y - s * 0.5, s, 0, TAU);
        pen.fill();
        pen.fillStyle = dark;
        pen.beginPath();
        pen.arc(x, y, s * 0.8, 0, TAU);
        pen.fill();
      }
    },
    // Soft patches: the dusty bloom of a plum or a blueberry, a blush.
    haze = (count: number, color: string, size: number) => {
      for (let i = 0; i < count; i++) {
        const [x, y] = inside(),
          s = size * (0.6 + random() * 0.8),
          g = pen.createRadialGradient(x, y, 0, x, y, s);
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(255,255,255,0)");
        pen.fillStyle = g;
        pen.fillRect(x - s, y - s, s * 2, s * 2);
      }
    };
  // What stands behind the ball: a stalk.
  if (kind === 1) stalk(pen, [[c, c - R * 0.78], [c + R * 0.05, c - R * 1.08], [c + R * 0.36, c - R * 1.2]], R * 0.075, "#5f7a2a");
  if (kind === 5) stalk(pen, [[c, c - R * 0.74], [c + R * 0.03, c - R * 0.98], [c + R * 0.12, c - R * 1.14]], R * 0.085);
  if (kind === 3) stalk(pen, [[c + R * 0.02, c - R * 0.9], [c + R * 0.06, c - R * 1.08]], R * 0.06);
  pen.save();
  pen.beginPath();
  pen.arc(c, c, R, 0, TAU);
  const base = pen.createRadialGradient(c - R * 0.25, c - R * 0.3, R * 0.05, c, c, R * 1.05);
  base.addColorStop(0, look.own);
  base.addColorStop(0.7, look.own);
  base.addColorStop(1, look.edge);
  pen.fillStyle = base;
  pen.fill();
  pen.clip();
  if (kind === 0) {
    haze(14, "rgba(200,214,255,0.22)", R * 0.5);
    dots(40, "rgba(220,230,255,0.12)", R * 0.05);
    // The crown at the top: a ring of five little sepals round a hollow, seen from the side.
    const cy = c - R * 0.62;
    pen.fillStyle = "#1c2456";
    pen.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2,
        r = i % 2 ? R * 0.1 : R * 0.24;
      pen.lineTo(c + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5);
    }
    pen.closePath();
    pen.fill();
    pen.fillStyle = "#0e1236";
    pen.beginPath();
    pen.ellipse(c, cy, R * 0.09, R * 0.045, 0, 0, TAU);
    pen.fill();
    pen.strokeStyle = "rgba(170,180,240,0.35)";
    pen.lineWidth = R * 0.02;
    pen.beginPath();
    pen.ellipse(c, cy + R * 0.02, R * 0.2, R * 0.08, 0, 0.1 * Math.PI, 0.9 * Math.PI);
    pen.stroke();
  } else if (kind === 1) {
    // The seam from the stalk down one side, and the dimple the stalk grows from.
    pen.strokeStyle = "rgba(90,0,14,0.35)";
    pen.lineWidth = R * 0.05;
    pen.beginPath();
    pen.moveTo(c, c - R * 0.82);
    pen.bezierCurveTo(c - R * 0.12, c - R * 0.4, c - R * 0.1, c + R * 0.1, c - R * 0.02, c + R * 0.5);
    pen.stroke();
    haze(5, "rgba(255,120,130,0.18)", R * 0.5);
    dots(60, "rgba(255,200,200,0.12)", R * 0.012);
    const dimple = pen.createRadialGradient(c, c - R * 0.8, 0, c, c - R * 0.8, R * 0.22);
    dimple.addColorStop(0, "rgba(60,0,8,0.7)");
    dimple.addColorStop(1, "rgba(60,0,8,0)");
    pen.fillStyle = dimple;
    pen.fillRect(c - R * 0.3, c - R * 1.05, R * 0.6, R * 0.5);
  } else if (kind === 2) {
    dots(140, "rgba(214,255,160,0.25)", R * 0.018);
    pores(420, R * 0.012, "rgba(40,90,12,0.35)", "rgba(220,255,170,0.25)");
    haze(4, "rgba(240,255,150,0.18)", R * 0.6);
  } else if (kind === 3) {
    haze(18, "rgba(226,208,255,0.2)", R * 0.45);
    dots(80, "rgba(240,220,255,0.12)", R * 0.03);
    // The seam, with its light lip.
    for (const [shift, color, width] of [[R * 0.03, "rgba(240,200,255,0.25)", R * 0.03], [0, "rgba(40,6,60,0.5)", R * 0.045]] as const) {
      pen.strokeStyle = color;
      pen.lineWidth = width;
      pen.beginPath();
      pen.moveTo(c + R * 0.02 + shift, c - R);
      pen.bezierCurveTo(c - R * 0.34 + shift, c - R * 0.3, c - R * 0.3 + shift, c + R * 0.4, c + R * 0.08 + shift, c + R);
      pen.stroke();
    }
  } else if (kind === 4) {
    haze(5, "rgba(255,214,120,0.25)", R * 0.6);
    pores(900, R * 0.014, "rgba(190,80,0,0.32)", "rgba(255,230,170,0.3)");
    // The calyx: a small green star where the stalk was, near the top.
    const cy = c - R * 0.86;
    pen.fillStyle = "#4e8a2a";
    pen.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU,
        r = i % 2 ? R * 0.05 : R * 0.14;
      pen.lineTo(c + Math.cos(a) * r, cy + Math.sin(a) * r * 0.5);
    }
    pen.closePath();
    pen.fill();
    pen.fillStyle = "#355e1a";
    pen.beginPath();
    pen.ellipse(c, cy, R * 0.05, R * 0.03, 0, 0, TAU);
    pen.fill();
  } else if (kind === 5) {
    // A yellow blush low on one side, streaks from the stalk down, and small pale spots.
    const blush = pen.createRadialGradient(c - R * 0.45, c + R * 0.55, 0, c - R * 0.45, c + R * 0.55, R * 0.9);
    blush.addColorStop(0, "rgba(255,212,96,0.7)");
    blush.addColorStop(0.6, "rgba(255,170,70,0.25)");
    blush.addColorStop(1, "rgba(255,170,70,0)");
    pen.fillStyle = blush;
    pen.fillRect(0, 0, SPRITE, SPRITE);
    pen.lineCap = "round";
    for (let i = 0; i < 46; i++) {
      const a = (random() - 0.5) * Math.PI * 1.2,
        bend = (random() - 0.5) * R * 0.3;
      pen.strokeStyle = i % 3 ? "rgba(140,10,0,0.08)" : "rgba(255,200,120,0.09)";
      pen.lineWidth = R * (0.03 + random() * 0.05);
      pen.beginPath();
      pen.moveTo(c, c - R * 0.75);
      pen.quadraticCurveTo(c + Math.sin(a) * R * 0.9 + bend, c, c + Math.sin(a) * R * 0.95, c + Math.cos(a) * R);
      pen.stroke();
    }
    dots(150, "rgba(255,236,190,0.55)", R * 0.011);
    const dimple = pen.createRadialGradient(c, c - R * 0.76, 0, c, c - R * 0.76, R * 0.32);
    dimple.addColorStop(0, "rgba(70,10,0,0.6)");
    dimple.addColorStop(0.5, "rgba(120,30,10,0.25)");
    dimple.addColorStop(1, "rgba(120,30,10,0)");
    pen.fillStyle = dimple;
    pen.fillRect(c - R * 0.4, c - R * 1.1, R * 0.8, R * 0.7);
  } else if (kind === 6) {
    const blush = pen.createRadialGradient(c + R * 0.3, c + R * 0.25, 0, c + R * 0.3, c + R * 0.25, R);
    blush.addColorStop(0, "rgba(255,110,120,0.32)");
    blush.addColorStop(1, "rgba(255,110,120,0)");
    pen.fillStyle = blush;
    pen.fillRect(0, 0, SPRITE, SPRITE);
    pores(1300, R * 0.012, "rgba(196,104,40,0.3)", "rgba(255,240,200,0.28)");
    pen.fillStyle = "#6a7a2a";
    pen.beginPath();
    pen.ellipse(c, c - R * 0.92, R * 0.06, R * 0.035, 0, 0, TAU);
    pen.fill();
  } else if (kind === 7) {
    // Fibres everywhere, then three eyes near the top.
    pen.lineCap = "round";
    for (let i = 0; i < 1500; i++) {
      const [x, y] = inside(),
        a = Math.PI / 2 + (random() - 0.5) * 1.3,
        l = R * (0.04 + random() * 0.1);
      pen.strokeStyle = i % 3 === 0 ? "rgba(230,190,140,0.28)" : i % 3 === 1 ? "rgba(40,20,8,0.4)" : "rgba(150,100,60,0.35)";
      pen.lineWidth = R * (0.008 + random() * 0.014);
      pen.beginPath();
      pen.moveTo(x, y);
      pen.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      pen.stroke();
    }
    for (const [dx, dy] of [[-0.2, -0.5], [0.2, -0.5], [0, -0.26]]) {
      const ex = c + dx * R,
        ey = c + dy * R,
        rim = pen.createRadialGradient(ex, ey, R * 0.03, ex, ey, R * 0.13);
      rim.addColorStop(0, "#1a0e06");
      rim.addColorStop(0.6, "#2e1a0c");
      rim.addColorStop(1, "rgba(120,80,40,0)");
      pen.fillStyle = rim;
      pen.beginPath();
      pen.ellipse(ex, ey, R * 0.13, R * 0.11, 0, 0, TAU);
      pen.fill();
      pen.fillStyle = "rgba(200,150,100,0.3)";
      pen.beginPath();
      pen.ellipse(ex - R * 0.02, ey - R * 0.03, R * 0.035, R * 0.02, 0, 0, TAU);
      pen.fill();
    }
  } else if (kind === 8) {
    // A net of raised cream lines over the green, joining neighbouring points of a scattered web.
    const points = Array.from({ length: 90 }, () => {
      const a = random() * TAU,
        d = Math.sqrt(random()) * R * 1.05;
      return [c + Math.cos(a) * d, c + Math.sin(a) * d] as [number, number];
    });
    pen.lineCap = "round";
    const lines: [number, number, number, number][] = [];
    points.forEach(([x, y], i) => {
      const near = points
        .map(([u, v], j) => [Math.hypot(u - x, v - y), j] as [number, number])
        .filter(([, j]) => j !== i)
        .sort((p, q) => p[0] - q[0])
        .slice(0, 3);
      for (const [, j] of near) if (j > i || !near.some(([, k]) => k === j)) lines.push([x, y, points[j][0], points[j][1]]);
    });
    for (const [width, color, shift] of [[R * 0.05, "rgba(70,90,30,0.35)", R * 0.012], [R * 0.034, "#eef0cc", 0], [R * 0.012, "rgba(255,255,240,0.6)", -R * 0.006]] as const) {
      pen.strokeStyle = color;
      pen.lineWidth = width;
      for (const [x1, y1, x2, y2] of lines) {
        const mx = (x1 + x2) / 2 + (random() - 0.5) * R * 0.06,
          my = (y1 + y2) / 2 + (random() - 0.5) * R * 0.06;
        pen.beginPath();
        pen.moveTo(x1 + shift, y1 + shift);
        pen.quadraticCurveTo(mx + shift, my + shift, x2 + shift, y2 + shift);
        pen.stroke();
      }
    }
  } else if (kind === 9) {
    // Dark jagged bands bowing out from the stalk to the base, and pale speckles between.
    pen.fillStyle = "#14481f";
    for (let band = -4; band <= 4; band++) {
      const bow = band * R * 0.29,
        half = R * 0.075;
      pen.beginPath();
      pen.moveTo(c, c - R * 1.02);
      for (let t = 0; t <= 1.001; t += 0.025) pen.lineTo(c + Math.sin(t * Math.PI) * (bow - half) + Math.sin(t * 46 + band) * R * 0.035, c - R + t * R * 2);
      for (let t = 1; t >= -0.001; t -= 0.025) pen.lineTo(c + Math.sin(t * Math.PI) * (bow + half) + Math.sin(t * 38 + band * 2) * R * 0.035, c - R + t * R * 2);
      pen.fill();
    }
    dots(120, "rgba(190,240,170,0.18)", R * 0.02);
    haze(3, "rgba(230,255,170,0.15)", R * 0.7);
  }
  pen.restore();
  // What stands before the ball: leaves, stalk ends and nubs.
  if (kind === 1) leaf(pen, c + R * 0.34, c - R * 1.2, R * 0.42, -0.25);
  if (kind === 2) {
    const nub = pen.createRadialGradient(c + R * 0.62, c - R * 0.78, 0, c + R * 0.62, c - R * 0.78, R * 0.16);
    nub.addColorStop(0, "#b8ec78");
    nub.addColorStop(1, "#4a8a22");
    pen.fillStyle = nub;
    pen.beginPath();
    pen.arc(c + R * 0.62, c - R * 0.76, R * 0.12, 0, TAU);
    pen.fill();
    pen.fillStyle = "#6a5a2a";
    pen.beginPath();
    pen.arc(c + R * 0.68, c - R * 0.82, R * 0.035, 0, TAU);
    pen.fill();
  }
  if (kind === 4) {
    stalk(pen, [[c, c - R * 0.86], [c + R * 0.04, c - R * 1.0]], R * 0.055, "#4e6e24");
    leaf(pen, c + R * 0.03, c - R * 0.98, R * 0.62, -2.6);
  }
  if (kind === 5) leaf(pen, c + R * 0.1, c - R * 1.06, R * 0.55, -0.55);
  if (kind === 8) {
    stalk(pen, [[c - R * 0.26, c - R * 1.08], [c, c - R * 1.03], [c + R * 0.26, c - R * 1.08]], R * 0.07, "#7a8a3a");
    stalk(pen, [[c, c - R * 0.92], [c, c - R * 1.05]], R * 0.09, "#7a8a3a");
  }
  if (kind === 9) {
    stalk(pen, [[c, c - R * 0.96], [c + R * 0.02, c - R * 1.12], [c + R * 0.16, c - R * 1.16]], R * 0.06, "#6a7a2a");
  }
  return canvas;
}
/** The light on a kind, which does not turn with it: shade toward the lower right, a soft bounce, and the gloss where the window falls. */
function lighting(kind: number) {
  const canvas = sprite(),
    pen = canvas.getContext("2d")!,
    c = SPRITE / 2,
    R = BALL,
    { gloss, bloom } = LOOKS[kind];
  pen.save();
  pen.beginPath();
  pen.arc(c, c, R, 0, TAU);
  pen.clip();
  const shade = pen.createRadialGradient(c - R * 0.38, c - R * 0.42, R * 0.15, c - R * 0.1, c - R * 0.1, R * 1.25);
  shade.addColorStop(0, "rgba(255,255,255,0.1)");
  shade.addColorStop(0.45, "rgba(0,0,0,0)");
  shade.addColorStop(0.85, "rgba(10,0,20,0.28)");
  shade.addColorStop(1, "rgba(10,0,20,0.5)");
  pen.fillStyle = shade;
  pen.fillRect(0, 0, SPRITE, SPRITE);
  // Light thrown back from the floor of the box onto the underside.
  const bounce = pen.createRadialGradient(c + R * 0.25, c + R * 1.25, R * 0.3, c + R * 0.25, c + R * 1.15, R * 0.75);
  bounce.addColorStop(0, "rgba(255,240,210,0.22)");
  bounce.addColorStop(1, "rgba(255,240,210,0)");
  pen.fillStyle = bounce;
  pen.fillRect(0, 0, SPRITE, SPRITE);
  if (bloom) {
    // A dusty fruit only glows where the light falls.
    const sheen = pen.createRadialGradient(c - R * 0.4, c - R * 0.42, 0, c - R * 0.4, c - R * 0.42, R * 0.55);
    sheen.addColorStop(0, "rgba(235,240,255,0.42)");
    sheen.addColorStop(1, "rgba(235,240,255,0)");
    pen.fillStyle = sheen;
    pen.fillRect(0, 0, SPRITE, SPRITE);
  }
  if (gloss > 0.1) {
    pen.save();
    pen.translate(c - R * 0.42, c - R * 0.48);
    pen.rotate(-0.7);
    pen.scale(1, 0.55);
    const shine = pen.createRadialGradient(0, 0, 0, 0, 0, R * 0.32);
    shine.addColorStop(0, `rgba(255,255,255,${0.85 * gloss})`);
    shine.addColorStop(0.45, `rgba(255,255,255,${0.35 * gloss})`);
    shine.addColorStop(1, "rgba(255,255,255,0)");
    pen.fillStyle = shine;
    pen.beginPath();
    pen.arc(0, 0, R * 0.32, 0, TAU);
    pen.fill();
    pen.restore();
    if (gloss > 0.5) {
      // A sharp little window in it, and its faint twin on the far side.
      pen.fillStyle = `rgba(255,255,255,${0.9 * gloss})`;
      pen.beginPath();
      pen.ellipse(c - R * 0.5, c - R * 0.52, R * 0.08, R * 0.045, -0.7, 0, TAU);
      pen.fill();
      pen.fillStyle = `rgba(255,255,255,${0.22 * gloss})`;
      pen.beginPath();
      pen.ellipse(c + R * 0.55, c + R * 0.5, R * 0.12, R * 0.05, -0.7, 0, TAU);
      pen.fill();
    }
  }
  pen.restore();
  pen.strokeStyle = "rgba(30,10,0,0.3)";
  pen.lineWidth = R * 0.022;
  pen.beginPath();
  pen.arc(c, c, R - R * 0.011, 0, TAU);
  pen.stroke();
  return canvas;
}
/** A soft round shadow, drawn behind a fruit onto the back pane. */
function blot() {
  const canvas = sprite(),
    pen = canvas.getContext("2d")!,
    c = SPRITE / 2,
    g = pen.createRadialGradient(c, c, BALL * 0.5, c, c, BALL * 1.18);
  g.addColorStop(0, "rgba(40,30,20,0.32)");
  g.addColorStop(1, "rgba(40,30,20,0)");
  pen.fillStyle = g;
  pen.fillRect(0, 0, SPRITE, SPRITE);
  return canvas;
}
/** A drop of juice, a seed, a sparkle or a ring of a merge, in the box's units and seconds. */
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  born: number;
  life: number;
  kind: "drop" | "star";
}
interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
  big: boolean;
}
const FONT = `"Inter", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif`;
/**
 * The glass box drawn flat, from the front, in a sunny kitchen. The view plays the box in real time: the fruit in
 * hand follows the pointer and falls when it is let go, and each drop, each merging and the overflow are reported
 * as moves. Merges splash juice and pop up their points; a fruit that lands squashes a little; the line warns as
 * the heap comes near it.
 */
export class FruitView extends FlatView<State> {
  private world: World = createWorld(cryptoRandom);
  private skins = FRUITS.map((_, kind) => skin(kind));
  private lights = FRUITS.map((_, kind) => lighting(kind));
  private shadow = blot();
  private born = new Map<number, number>();
  /** A fruit's downward speed a slice ago, and when it last landed and how hard (for its squash). */
  private falling = new Map<number, number>();
  private squash = new Map<number, { at: number; strength: number }>();
  /** Rings where two have just merged, juice and sparkles flying, and the points they made. */
  private pops: { x: number; y: number; r: number; at: number; color: string }[] = [];
  private bits: Bit[] = [];
  private popups: Popup[] = [];
  private target = 0;
  private held = 0;
  private last = performance.now();
  private left = 0;
  private heard = 0;
  private landing = { at: 0, strength: 0, size: 0 };
  private paused = false;
  /** When the fruit in hand came to it, so that it swells in. */
  private readyAt = 0;
  private wasReady = false;
  private warned = false;
  /** Where the box's floor centre is on the canvas, and pixels to a unit. */
  private fit = { x: 0, y: 0, unit: 1 };
  /** The kitchen, the box's back pane and its front glass, painted once a size. */
  private back: HTMLCanvasElement | null = null;
  private front: HTMLCanvasElement | null = null;
  private painted = "";
  private keys: [string, (e: Event) => void][] = [];
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality);
    const el = this.canvas,
      on = (name: string, fn: (e: Event) => void) => {
        el.addEventListener(name, fn);
        this.keys.push([name, fn]);
      };
    on("keydown", (event) => {
      const e = event as KeyboardEvent;
      if (e.key === "ArrowLeft") this.held = -1;
      else if (e.key === "ArrowRight") this.held = 1;
      else if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        this.send();
      }
    });
    on("keyup", (event) => {
      const e = event as KeyboardEvent;
      if ((e.key === "ArrowLeft" && this.held < 0) || (e.key === "ArrowRight" && this.held > 0)) this.held = 0;
    });
    on("blur", () => (this.held = 0));
    this.begin();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.held = 0;
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  private sound(kind: "land" | "merge" | "danger", size: number, combo = 1, strength = 0) {
    fruitCue.kind = kind;
    fruitCue.size = size;
    fruitCue.combo = combo;
    fruitCue.strength = strength;
    this.onContact();
  }
  private report(events: ReturnType<typeof step>, now: number) {
    for (const event of events) {
      if (event.kind === "drop") this.onMove({ from: -1, to: DROP, extra: -1 });
      else if (event.kind === "merge") {
        this.burst(event.fruit, event.x, event.y, event.combo, now);
        this.onMove({ from: -1, to: MERGE + event.fruit, extra: event.combo > 1 ? event.combo : -1 });
        if (now - this.heard > 60) {
          this.heard = now;
          this.sound("merge", event.fruit / (KINDS - 1), event.combo);
        }
      } else if (event.kind === "over") this.onMove({ from: -1, to: OVER, extra: -1 });
    }
  }
  /** Juice, sparkles, a ring and the points where two of `kind` have merged. */
  private burst(kind: number, x: number, y: number, combo: number, now: number) {
    const made = Math.min(KINDS - 1, kind + 1),
      r = RADII[made],
      look = LOOKS[kind],
      random = Math.random,
      count = Math.min(46, 14 + kind * 3 + combo * 2);
    this.pops.push({ x, y, r, at: now, color: look.juice });
    if (this.bits.length < 420)
      for (let i = 0; i < count; i++) {
        const a = random() * TAU,
          speed = (2 + random() * 4.5) * (0.7 + r * 0.35);
        this.bits.push({
          x: x + Math.cos(a) * r * 0.5,
          y: y + Math.sin(a) * r * 0.5,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed + 2.5,
          size: (0.07 + random() * 0.1) * (0.8 + r * 0.3),
          color: i % 5 === 0 ? "#ffffff" : look.juice,
          born: now,
          life: 450 + random() * 450,
          kind: i % 7 === 0 ? "star" : "drop",
        });
      }
    const points = worth(kind) + bonus(kind, combo);
    // Points that come up where others are still rising stand above them; a combo's call replaces the one before.
    let at = y + r * 0.3;
    for (const p of this.popups) if (!p.big && now - p.born < 500 && Math.abs(p.x - x) < 1.4 && Math.abs(p.y - at) < 0.7) at = p.y + 0.7;
    this.popups.push({ x, y: at, text: `+${points}`, color: look.juice, born: now, big: false });
    if (combo > 1) {
      this.popups = this.popups.filter((p) => !p.text.startsWith("콤보"));
      this.popups.push({ x, y: Math.min(LINE - 0.6, y + r + 0.9), text: `콤보 ×${combo}`, color: "#ff6a2a", born: now + 60, big: true });
    }
    if (kind === KINDS - 1) this.popups.push({ x, y: y + 1.6, text: "수박 둘!", color: "#2f9a3a", born: now + 120, big: true });
  }
  /** Lets the fruit in hand fall. */
  private send() {
    if (!this.running()) return;
    this.world.aim = this.target;
    this.report(drop(this.world), performance.now());
  }
  private across(x: number) {
    return (x - this.fit.x) / this.fit.unit;
  }
  protected pressed(x: number) {
    this.target = this.across(x);
  }
  protected moved(x: number, _y: number, held: boolean, mouse: boolean) {
    if (held || mouse) this.target = this.across(x);
  }
  protected released(x: number) {
    this.target = this.across(x);
    this.send();
  }
  protected changed(before: State | null, state: State) {
    // A new game, known by the count of moves going back to nothing, empties the box.
    // (Not by what lies in the box: the screen shows the state once more before each move it is told of.)
    if (state.ply === 0 && before && before.ply > 0) {
      this.world = createWorld(cryptoRandom);
      this.born.clear();
      this.falling.clear();
      this.squash.clear();
      this.pops = [];
      this.bits = [];
      this.popups = [];
      this.warned = false;
    }
  }
  protected frame(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    // Juice and words go on flying while the box stands still, then rest.
    const lively = this.bits.length > 0 || this.popups.length > 0 || this.pops.length > 0;
    if (lively) this.fly(Math.min(0.05, real), now);
    if (!this.running()) return lively;
    if (this.held) this.target = Math.max(-HALF, Math.min(HALF, this.world.aim + this.held * 7 * real));
    this.left += Math.min(0.05, real);
    while (this.left >= DT && !this.world.ended) {
      this.left -= DT;
      this.report(step(this.world, this.target), now);
      this.landed(now);
    }
    if (this.landing.strength > 0 && now - this.landing.at > 50) {
      this.sound("land", this.landing.size, 1, this.landing.strength);
      this.landing.strength = 0;
    }
    // The heap over the line: one warning as it begins.
    if (this.world.over > 0 && !this.warned) {
      this.warned = true;
      this.sound("danger", 0);
    } else if (this.world.over === 0) this.warned = false;
    return true;
  }
  /** Fruit that has just been stopped in its fall squashes a little, and the hardest landing of a moment is heard. */
  private landed(now: number) {
    for (const f of this.world.fruits) {
      const vy = f.y - f.py,
        before = this.falling.get(f.id) ?? 0;
      this.falling.set(f.id, vy);
      if (before < -0.018 && vy > before * 0.35 && f.age > 0.05) {
        const strength = Math.min(1, -before / 0.12);
        this.squash.set(f.id, { at: now, strength });
        if (strength > 0.2 && strength > this.landing.strength) this.landing = { at: this.landing.strength ? this.landing.at : now, strength, size: f.kind / (KINDS - 1) };
      }
    }
  }
  private fly(dt: number, now: number) {
    for (const bit of this.bits) {
      bit.vy -= 16 * dt;
      bit.vx *= 1 - 0.8 * dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
    }
    this.bits = this.bits.filter((bit) => now - bit.born < bit.life);
    this.popups = this.popups.filter((p) => now - p.born < (p.big ? 1100 : 900));
    this.pops = this.pops.filter((pop) => now - pop.at < 420);
  }
  /** Draws a fruit: its turning skin, its fixed light, squashed toward its foot and flashing as it is made. */
  private fruit(pen: CanvasRenderingContext2D, kind: number, x: number, y: number, r: number, turn = 0, squash = 0, flash = 0) {
    const { unit } = this.fit,
      size = ((r * unit) / BALL) * SPRITE,
      radius = r * unit;
    pen.save();
    pen.translate(this.fit.x + x * unit, this.fit.y - y * unit);
    if (squash) {
      pen.translate(0, radius);
      pen.scale(1 + squash, 1 - squash);
      pen.translate(0, -radius);
    }
    pen.save();
    pen.rotate(-turn);
    pen.drawImage(this.skins[kind], -size / 2, -size / 2, size, size);
    pen.restore();
    pen.drawImage(this.lights[kind], -size / 2, -size / 2, size, size);
    if (flash > 0) {
      pen.fillStyle = `rgba(255,255,255,${flash * 0.7})`;
      pen.beginPath();
      pen.arc(0, 0, radius, 0, TAU);
      pen.fill();
    }
    pen.restore();
  }
  /** Lays the box out on the canvas: under the corner buttons, with room beside it for the next fruit's plate. */
  private layout(w: number, h: number) {
    const top = 54 * this.ratio,
      unit = Math.min((h - top - 20 * this.ratio) / (HAND + 1.1), (w * 0.96) / (HALF * 2 + 3.6)),
      fx = w / 2 - unit * 0.9,
      fy = h - 14 * this.ratio - unit * 0.25;
    this.fit = { x: fx, y: fy, unit };
    const key = `${w}x${h}`;
    if (key !== this.painted || !this.back || !this.front) {
      this.painted = key;
      this.back = this.kitchen(w, h);
      this.front = this.glass(w, h);
    }
  }
  /** The kitchen wall and window, the counter, and the box's foot and back pane. */
  private kitchen(w: number, h: number) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const pen = canvas.getContext("2d")!,
      { x: fx, y: fy, unit } = this.fit,
      X = (x: number) => fx + x * unit,
      Y = (y: number) => fy - y * unit,
      random = sequence(41);
    // A warm wall, brighter toward the window at the upper left.
    const wall = pen.createLinearGradient(0, 0, 0, fy);
    wall.addColorStop(0, "#fbf1de");
    wall.addColorStop(1, "#f0dfc2");
    pen.fillStyle = wall;
    pen.fillRect(0, 0, w, h);
    // Tiles in a running bond with a glaze on each.
    const tile = unit * 1.2,
      tileH = unit * 0.6;
    for (let row = 0, y = fy - tileH; y > -tileH; y -= tileH, row++)
      for (let x = ((row % 2) * tile) / 2 + (fx % tile) - tile; x < w; x += tile) {
        const glaze = pen.createLinearGradient(x, y, x, y + tileH);
        glaze.addColorStop(0, "rgba(255,255,255,0.32)");
        glaze.addColorStop(1, "rgba(200,170,130,0.1)");
        pen.fillStyle = glaze;
        rounded(pen, x + 1.5, y + 1.5, tile - 3, tileH - 3, unit * 0.06);
        pen.fill();
        pen.strokeStyle = "rgba(190,160,120,0.35)";
        pen.lineWidth = Math.max(1, unit * 0.02);
        pen.stroke();
      }
    // The window, where there is room for it at the left: a sky, clouds and a sill with a pot of herbs.
    const left = X(-HALF) - unit * 0.9;
    if (left > unit * 3.2) {
      const ww = Math.min(left - unit * 0.8, unit * 5.5),
        wx = (left - ww) / 2,
        wy = Y(HEIGHT + 0.6),
        wh = Math.min(unit * 5.2, Y(2.8) - wy);
      if (wh > unit * 2) {
        const sky = pen.createLinearGradient(0, wy, 0, wy + wh);
        sky.addColorStop(0, "#8fd0f4");
        sky.addColorStop(1, "#dff3fb");
        pen.fillStyle = "#e8d6b8";
        rounded(pen, wx - unit * 0.28, wy - unit * 0.28, ww + unit * 0.56, wh + unit * 0.56, unit * 0.12);
        pen.fill();
        pen.fillStyle = sky;
        pen.fillRect(wx, wy, ww, wh);
        pen.fillStyle = "rgba(255,255,255,0.9)";
        for (let k = 0; k < 4; k++) {
          const cx = wx + ww * (0.15 + random() * 0.7),
            cy = wy + wh * (0.15 + random() * 0.45),
            s = unit * (0.35 + random() * 0.3);
          for (const [ox, oy, rr] of [[0, 0, 1], [0.9, 0.15, 0.75], [-0.85, 0.2, 0.7], [0.4, -0.35, 0.65]])
            if (cx + ox * s > wx + s * 0.5 && cx + ox * s < wx + ww - s * 0.5) {
              pen.beginPath();
              pen.arc(cx + ox * s, cy + oy * s, s * rr, 0, TAU);
              pen.fill();
            }
        }
        // Far green hills along the bottom of the pane.
        pen.fillStyle = "#9ccf7a";
        pen.beginPath();
        pen.moveTo(wx, wy + wh);
        for (let t = 0; t <= 1.001; t += 0.05) pen.lineTo(wx + ww * t, wy + wh * (0.8 - 0.08 * Math.sin(t * 7 + 1)));
        pen.lineTo(wx + ww, wy + wh);
        pen.fill();
        pen.strokeStyle = "#fffaf0";
        pen.lineWidth = unit * 0.14;
        pen.strokeRect(wx, wy, ww, wh);
        pen.beginPath();
        pen.moveTo(wx + ww / 2, wy);
        pen.lineTo(wx + ww / 2, wy + wh);
        pen.moveTo(wx, wy + wh * 0.45);
        pen.lineTo(wx + ww, wy + wh * 0.45);
        pen.stroke();
        // The sill and a pot of basil on it.
        pen.fillStyle = "#d9b98a";
        rounded(pen, wx - unit * 0.45, wy + wh + unit * 0.12, ww + unit * 0.9, unit * 0.28, unit * 0.08);
        pen.fill();
        const px = wx + ww * 0.72,
          py = wy + wh + unit * 0.12;
        for (let k = 0; k < 9; k++) leaf(pen, px, py - unit * 0.55, unit * (0.45 + random() * 0.25), -Math.PI / 2 + (random() - 0.5) * 2.2, "#86cc52", "#3a7a26");
        pen.fillStyle = "#c86a3a";
        pen.beginPath();
        pen.moveTo(px - unit * 0.38, py - unit * 0.62);
        pen.lineTo(px + unit * 0.38, py - unit * 0.62);
        pen.lineTo(px + unit * 0.28, py);
        pen.lineTo(px - unit * 0.28, py);
        pen.fill();
        pen.fillStyle = "#e08a52";
        pen.fillRect(px - unit * 0.42, py - unit * 0.7, unit * 0.84, unit * 0.14);
      }
    }
    // Light from the window across the wall.
    const glow = pen.createRadialGradient(w * 0.1, h * 0.1, 0, w * 0.1, h * 0.1, Math.max(w, h) * 0.9);
    glow.addColorStop(0, "rgba(255,250,230,0.35)");
    glow.addColorStop(1, "rgba(255,250,230,0)");
    pen.fillStyle = glow;
    pen.fillRect(0, 0, w, h);
    // The counter: a wooden top with grain and a lit front edge.
    const ctop = fy + unit * 0.22,
      counter = pen.createLinearGradient(0, ctop, 0, h);
    counter.addColorStop(0, "#d6a66a");
    counter.addColorStop(0.12, "#c39058");
    counter.addColorStop(1, "#9a6a3c");
    pen.fillStyle = counter;
    pen.fillRect(0, ctop, w, h - ctop);
    pen.lineCap = "round";
    for (let k = 0; k < 60; k++) {
      const y = ctop + unit * 0.12 + random() * (h - ctop),
        x = random() * w,
        l = unit * (1 + random() * 4);
      pen.strokeStyle = k % 2 ? "rgba(120,70,30,0.16)" : "rgba(255,220,170,0.12)";
      pen.lineWidth = Math.max(1, unit * (0.015 + random() * 0.03));
      pen.beginPath();
      pen.moveTo(x, y);
      pen.bezierCurveTo(x + l * 0.3, y + unit * 0.05, x + l * 0.6, y - unit * 0.05, x + l, y);
      pen.stroke();
    }
    pen.fillStyle = "rgba(255,240,210,0.5)";
    pen.fillRect(0, ctop, w, Math.max(1.5, unit * 0.04));
    // The box's shadow on the counter, and its back pane: pale glass, darker low down, with a soft reflection.
    const shadow = pen.createRadialGradient(X(0.3), ctop + unit * 0.12, unit, X(0.3), ctop + unit * 0.12, unit * (HALF + 1.4));
    shadow.addColorStop(0, "rgba(60,30,10,0.3)");
    shadow.addColorStop(1, "rgba(60,30,10,0)");
    pen.save();
    pen.translate(0, ctop + unit * 0.12);
    pen.scale(1, 0.16);
    pen.translate(0, -(ctop + unit * 0.12));
    pen.fillStyle = shadow;
    pen.fillRect(X(-HALF - 2), ctop - unit * 3, unit * (HALF * 2 + 4.6), unit * 6);
    pen.restore();
    const pane = pen.createLinearGradient(0, Y(HEIGHT), 0, Y(0));
    pane.addColorStop(0, "rgba(214,240,246,0.5)");
    pane.addColorStop(1, "rgba(170,214,226,0.62)");
    pen.fillStyle = pane;
    pen.fillRect(X(-HALF), Y(HEIGHT), HALF * 2 * unit, HEIGHT * unit);
    pen.fillStyle = "rgba(255,255,255,0.28)";
    pen.beginPath();
    pen.moveTo(X(-HALF + 1.2), Y(HEIGHT));
    pen.lineTo(X(-HALF + 2.4), Y(HEIGHT));
    pen.lineTo(X(-HALF + 0.6), Y(0));
    pen.lineTo(X(-HALF - 0.0), Y(0));
    pen.lineTo(X(-HALF), Y(0.8));
    pen.closePath();
    pen.fill();
    // The plate the next fruit waits on, on a little stand, with its label.
    const px = HALF + 1.75;
    pen.fillStyle = "rgba(60,30,10,0.18)";
    pen.beginPath();
    pen.ellipse(X(px + 0.1), Y(-0.2), unit * 1.1, unit * 0.18, 0, 0, TAU);
    pen.fill();
    const plate = pen.createLinearGradient(0, Y(0.25), 0, Y(-0.2));
    plate.addColorStop(0, "#ffffff");
    plate.addColorStop(1, "#d9d0c0");
    pen.fillStyle = plate;
    pen.strokeStyle = "#b9ae9a";
    pen.lineWidth = Math.max(1, unit * 0.03);
    pen.beginPath();
    pen.ellipse(X(px), Y(0.02), unit * 1.02, unit * 0.22, 0, 0, TAU);
    pen.fill();
    pen.stroke();
    pen.strokeStyle = "rgba(80,140,200,0.55)";
    pen.lineWidth = Math.max(1, unit * 0.025);
    pen.beginPath();
    pen.ellipse(X(px), Y(0.04), unit * 0.82, unit * 0.15, 0, 0, TAU);
    pen.stroke();
    const tag = { x: X(px) - unit * 0.62, y: Y(2.55), w: unit * 1.24, h: unit * 0.62 };
    pen.fillStyle = "#3e5a3a";
    rounded(pen, tag.x, tag.y, tag.w, tag.h, unit * 0.14);
    pen.fill();
    pen.strokeStyle = "#a8743f";
    pen.lineWidth = unit * 0.08;
    pen.stroke();
    pen.fillStyle = "#f4f1e0";
    pen.font = `800 ${unit * 0.36}px ${FONT}`;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillText("다음", tag.x + tag.w / 2, tag.y + tag.h / 2 + unit * 0.02);
    return canvas;
  }
  /** The front of the box, over the fruit: thick glass edges with their light, the foot, and the top rim. */
  private glass(w: number, h: number) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const pen = canvas.getContext("2d")!,
      { x: fx, y: fy, unit } = this.fit,
      X = (x: number) => fx + x * unit,
      Y = (y: number) => fy - y * unit,
      edge = unit * 0.16;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? X(-HALF) - edge : X(HALF),
        pane = pen.createLinearGradient(x0, 0, x0 + edge, 0);
      pane.addColorStop(0, side < 0 ? "rgba(255,255,255,0.75)" : "rgba(120,170,186,0.75)");
      pane.addColorStop(0.5, "rgba(170,214,226,0.65)");
      pane.addColorStop(1, side < 0 ? "rgba(120,170,186,0.7)" : "rgba(255,255,255,0.6)");
      pen.fillStyle = pane;
      rounded(pen, x0, Y(HEIGHT + 0.05), edge, HEIGHT * unit + unit * 0.05, edge * 0.4);
      pen.fill();
    }
    // Long glints down the front pane.
    for (const [at, width, alpha] of [[-HALF + 0.3, 0.12, 0.35], [-HALF + 0.55, 0.05, 0.25], [HALF - 0.45, 0.08, 0.18]]) {
      const g = pen.createLinearGradient(0, Y(HEIGHT), 0, Y(0));
      g.addColorStop(0, `rgba(255,255,255,${alpha})`);
      g.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.4})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      pen.fillStyle = g;
      pen.fillRect(X(at), Y(HEIGHT) + unit * 0.2, width * unit, HEIGHT * unit - unit * 0.5);
    }
    // The top rim, and the wooden foot the box stands in.
    pen.fillStyle = "rgba(200,232,240,0.85)";
    rounded(pen, X(-HALF) - edge * 1.2, Y(HEIGHT) - unit * 0.1, HALF * 2 * unit + edge * 2.4, unit * 0.14, unit * 0.06);
    pen.fill();
    const foot = pen.createLinearGradient(0, Y(0), 0, Y(0) + unit * 0.42);
    foot.addColorStop(0, "#7a4e2c");
    foot.addColorStop(0.35, "#8f5e36");
    foot.addColorStop(1, "#4e2e18");
    pen.fillStyle = foot;
    rounded(pen, X(-HALF) - unit * 0.34, Y(0), HALF * 2 * unit + unit * 0.68, unit * 0.42, unit * 0.12);
    pen.fill();
    pen.fillStyle = "rgba(255,220,170,0.35)";
    pen.fillRect(X(-HALF) - unit * 0.26, Y(0) + unit * 0.04, HALF * 2 * unit + unit * 0.52, Math.max(1, unit * 0.04));
    return canvas;
  }
  /** How high the fruit in hand would come to rest if dropped where the hand is now. */
  private landingY() {
    const { world } = this,
      r = RADII[world.held];
    let y = r;
    for (const f of world.fruits) {
      const rf = sizeOf(f),
        dx = Math.abs(f.x - world.aim),
        reach = r + rf;
      if (dx < reach) y = Math.max(y, f.y + Math.sqrt(reach * reach - dx * dx));
    }
    return Math.min(y, HAND - r);
  }
  protected paint(pen: CanvasRenderingContext2D, w: number, h: number, now: number) {
    this.layout(w, h);
    const { world } = this,
      { x: fx, y: fy, unit } = this.fit,
      X = (x: number) => fx + x * unit,
      Y = (y: number) => fy - y * unit,
      quiet = capturing();
    pen.drawImage(this.back!, 0, 0);
    // How near the heap has come to the line (fruit still falling does not count), and whether it is over it.
    let near = 0;
    for (const f of world.fruits) if (f.age > GRACE) near = Math.max(near, (f.y + sizeOf(f) - (LINE - 1.4)) / 1.4);
    near = Math.max(0, Math.min(1, near));
    const over = Math.min(1, world.over / SPILL),
      beat = (Math.sin(now / 110) + 1) / 2;
    if (over > 0) {
      // The box blushes red, the more the longer it has been over.
      const blush = pen.createLinearGradient(0, Y(HEIGHT), 0, Y(LINE - 3));
      blush.addColorStop(0, `rgba(255,40,30,${0.18 + 0.25 * over * beat})`);
      blush.addColorStop(1, "rgba(255,40,30,0)");
      pen.fillStyle = blush;
      pen.fillRect(X(-HALF), Y(HEIGHT), HALF * 2 * unit, (HEIGHT - LINE + 3) * unit);
    }
    // The line fruit must stay under: a dashed red line, glowing as the heap comes near.
    const glowing = over > 0 ? 0.6 + 0.4 * beat : near * (0.5 + 0.5 * beat);
    if (glowing > 0.02) {
      pen.strokeStyle = `rgba(255,${over > 0 ? 40 : 120},40,${0.35 * glowing})`;
      pen.lineWidth = unit * 0.32;
      pen.beginPath();
      pen.moveTo(X(-HALF), Y(LINE));
      pen.lineTo(X(HALF), Y(LINE));
      pen.stroke();
    }
    pen.strokeStyle = over > 0 ? `rgba(226,30,24,${0.7 + 0.3 * beat})` : "rgba(226,72,61,0.8)";
    pen.lineWidth = Math.max(2, unit * 0.07);
    pen.setLineDash([unit * 0.3, unit * 0.18]);
    pen.lineDashOffset = over > 0 ? -now / 30 : 0;
    pen.beginPath();
    pen.moveTo(X(-HALF), Y(LINE));
    pen.lineTo(X(HALF), Y(LINE));
    pen.stroke();
    pen.setLineDash([]);
    pen.lineDashOffset = 0;
    const ready = world.wait <= 0 && !world.ended && this.state?.winner === null;
    if (ready && !this.wasReady) this.readyAt = now;
    this.wasReady = ready;
    if (ready && !quiet) {
      // Where the fruit in hand would fall: a dotted beam down to a ghost of it where it would land.
      const r = RADII[world.held],
        land = this.landingY(),
        beam = pen.createLinearGradient(0, Y(HAND), 0, Y(land));
      beam.addColorStop(0, "rgba(255,255,255,0.55)");
      beam.addColorStop(1, "rgba(255,255,255,0.15)");
      pen.strokeStyle = beam;
      pen.lineWidth = Math.max(2, unit * 0.06);
      pen.lineCap = "round";
      pen.setLineDash([0.01, unit * 0.22]);
      pen.beginPath();
      pen.moveTo(X(world.aim), Y(HAND - r));
      pen.lineTo(X(world.aim), Y(land + r));
      pen.stroke();
      pen.setLineDash([unit * 0.16, unit * 0.12]);
      pen.strokeStyle = "rgba(255,255,255,0.65)";
      pen.lineWidth = Math.max(1.5, unit * 0.035);
      pen.beginPath();
      pen.arc(X(world.aim), Y(land), r * unit, 0, TAU);
      pen.stroke();
      pen.setLineDash([]);
    }
    // Shadows of the fruit on the back pane, then the fruit.
    const shadowSize = (r: number) => ((r * unit) / BALL) * SPRITE;
    for (const f of world.fruits) {
      const r = sizeOf(f),
        s = shadowSize(r);
      pen.drawImage(this.shadow, X(f.x) + r * unit * 0.12 - s / 2, Y(f.y) + r * unit * 0.14 - s / 2, s, s);
    }
    const alive = new Set<number>();
    for (const f of world.fruits) {
      alive.add(f.id);
      if (!this.born.has(f.id)) this.born.set(f.id, f.grown < 1 ? now : now - 1000);
      const age = now - this.born.get(f.id)!,
        flash = Math.max(0, 1 - age / 260),
        hit = this.squash.get(f.id);
      let squash = 0;
      if (hit) {
        const t = (now - hit.at) / 1000;
        if (t > 0.45) this.squash.delete(f.id);
        else squash = hit.strength * 0.16 * Math.exp(-t * 9) * Math.cos(t * 26);
      }
      // A fruit just made pops up a touch past its size before it settles.
      const swell = f.grown < 1 ? 1 + Math.sin(Math.min(1, age / 200) * Math.PI) * 0.08 : 1;
      this.fruit(pen, f.kind, f.x, f.y, sizeOf(f) * swell, f.turn, squash, flash);
    }
    for (const id of this.born.keys()) if (!alive.has(id)) this.born.delete(id);
    for (const id of this.falling.keys()) if (!alive.has(id)) this.falling.delete(id);
    if (!quiet) {
      for (const pop of this.pops) {
        const p = (now - pop.at) / 420;
        pen.strokeStyle = `rgba(255,255,255,${0.9 * (1 - p)})`;
        pen.lineWidth = unit * 0.14 * (1 - p) + 1;
        pen.beginPath();
        pen.arc(X(pop.x), Y(pop.y), unit * pop.r * (0.85 + p * 0.7), 0, TAU);
        pen.stroke();
        pen.strokeStyle = pop.color;
        pen.globalAlpha = 0.6 * (1 - p);
        pen.lineWidth = unit * 0.06 * (1 - p) + 1;
        pen.beginPath();
        pen.arc(X(pop.x), Y(pop.y), unit * pop.r * (1 + p * 0.95), 0, TAU);
        pen.stroke();
        pen.globalAlpha = 1;
      }
      for (const bit of this.bits) {
        const p = (now - bit.born) / bit.life,
          s = bit.size * unit * (1 - p * 0.5);
        pen.globalAlpha = Math.max(0, 1 - p * p);
        if (bit.kind === "star") {
          pen.fillStyle = "#fff6c8";
          pen.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + now / 300,
              r = i % 2 ? s * 0.45 : s * 1.6;
            pen.lineTo(X(bit.x) + Math.cos(a) * r, Y(bit.y) + Math.sin(a) * r);
          }
          pen.fill();
        } else {
          pen.fillStyle = bit.color;
          pen.beginPath();
          pen.ellipse(X(bit.x), Y(bit.y), s, s * 1.15, Math.atan2(-bit.vy, bit.vx) + Math.PI / 2, 0, TAU);
          pen.fill();
          pen.fillStyle = "rgba(255,255,255,0.6)";
          pen.beginPath();
          pen.arc(X(bit.x) - s * 0.35, Y(bit.y) - s * 0.35, s * 0.3, 0, TAU);
          pen.fill();
        }
      }
      pen.globalAlpha = 1;
    }
    pen.drawImage(this.front!, 0, 0);
    if (ready) {
      // The fruit in hand, swelling in as it comes, over a soft glow.
      const r = RADII[world.held],
        grow = Math.min(1, (now - this.readyAt) / 160),
        scale = quiet ? 1 : 0.55 + 0.45 * grow + Math.sin(grow * Math.PI) * 0.08,
        bob = quiet ? 0 : Math.sin(now / 420) * 0.04,
        halo = pen.createRadialGradient(X(world.aim), Y(HAND), 0, X(world.aim), Y(HAND), r * unit * 1.6);
      halo.addColorStop(0, "rgba(255,255,230,0.55)");
      halo.addColorStop(1, "rgba(255,255,230,0)");
      pen.fillStyle = halo;
      pen.fillRect(X(world.aim) - r * unit * 1.6, Y(HAND) - r * unit * 1.6, r * unit * 3.2, r * unit * 3.2);
      this.fruit(pen, world.held, world.aim, HAND + bob, r * scale);
    }
    // The fruit after this one waits on the plate beside the box.
    const px = HALF + 1.75,
      r = RADII[world.next];
    this.fruit(pen, world.next, px, r + 0.12 + (quiet ? 0 : Math.abs(Math.sin(now / 600)) * 0.06), r);
    if (over > 0 && !quiet) {
      // A warning over the line, with how long is left before it spills.
      const size = unit * 0.5,
        bx = X(0),
        by = Y(LINE) - unit * 0.75,
        bw = unit * 2.6;
      pen.font = `900 ${size}px ${FONT}`;
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.lineWidth = size * 0.22;
      pen.strokeStyle = "rgba(255,255,255,0.9)";
      pen.strokeText("넘쳐요!", bx, by);
      pen.fillStyle = "#e0241c";
      pen.fillText("넘쳐요!", bx, by);
      pen.fillStyle = "rgba(255,255,255,0.8)";
      rounded(pen, bx - bw / 2, by + size * 0.6, bw, unit * 0.16, unit * 0.08);
      pen.fill();
      pen.fillStyle = "#e0241c";
      rounded(pen, bx - bw / 2, by + size * 0.6, Math.max(unit * 0.16, bw * (1 - over)), unit * 0.16, unit * 0.08);
      pen.fill();
    }
    if (!quiet)
      for (const pop of this.popups) {
        const t = (now - pop.born) / (pop.big ? 1100 : 900);
        if (t < 0) continue;
        const rise = 1 - (1 - t) ** 2,
          pulse = pop.big ? 1 + Math.max(0, 0.35 - t) * 1.4 : 1,
          size = unit * (pop.big ? 0.62 : 0.5) * pulse,
          x = Math.max(X(-HALF) + size * 1.6, Math.min(X(HALF) - size * 1.6, X(pop.x)));
        pen.globalAlpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
        pen.font = `900 ${size}px ${FONT}`;
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.lineJoin = "round";
        pen.lineWidth = size * 0.24;
        pen.strokeStyle = "rgba(60,30,10,0.75)";
        pen.strokeText(pop.text, x, Y(pop.y + rise * 1.3));
        pen.fillStyle = pop.big ? pop.color : "#ffffff";
        pen.fillText(pop.text, x, Y(pop.y + rise * 1.3));
        pen.globalAlpha = 1;
      }
  }
  dispose() {
    for (const [name, fn] of this.keys) this.canvas.removeEventListener(name, fn);
    super.dispose();
  }
}
