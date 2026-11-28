import * as T from "three";
import { block, capable } from "../../engine/scene-utils";
import { BACK, D, H, W } from "./layout";

/**
 * The tiles, painted in code: thick ivory blocks on a green back, with rounded edges. Every face, the two-tone sides
 * and the green back are cells of one picture (`atlas`), and each face has its own copy of the rounded block with its
 * texture coordinates set to its cells, so that a tile is one mesh drawn in one call. Where a graphics card draws, a
 * relief picture of the same cells sinks the pictures into the face.
 *
 * Faces: 0–8 萬 1–9, 9–17 circles, 18–26 bamboo, 27–30 東南西北, 31 中, 32 發, 33 the white dragon (a blue frame),
 * 34–37 梅 蘭 菊 竹, 38–41 春 夏 秋 冬 (see rules.ts).
 */
const COLS = 8,
  ROWS = 6,
  CW = 160,
  CH = 218,
  SIDE_CELL = 42,
  BACK_CELL = 43;
const INK = "#1d1f2a",
  RED = "#c2271d",
  GREEN = "#17784a",
  BLUE = "#1f4fa6";
const NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"],
  WINDS = ["東", "南", "西", "北"],
  FLOWERS = ["梅", "蘭", "菊", "竹"],
  SEASONS = ["春", "夏", "秋", "冬"];
/** Brush-like faces first, then whatever the system has that holds these characters. */
const SERIF = `"Noto Serif CJK KR", "Noto Serif KR", "Noto Serif CJK SC", "Source Han Serif K", "Batang", "AppleMyungjo", "Songti SC", "SimSun", "Noto Sans CJK KR", "Malgun Gothic", "Apple SD Gothic Neo", "WenQuanYi Zen Hei", serif`;
const cellOf = (index: number) => ({ x: (index % COLS) * CW, y: Math.floor(index / COLS) * CH });
type Own = <R extends { dispose(): void }>(resource: R) => R;
type Ctx = CanvasRenderingContext2D;

/** A painter for one cell: `ink` gives the colour to use, or black when the relief is painted. */
interface Brush {
  ctx: Ctx;
  relief: boolean;
  ink: (colour: string) => string;
}
function ivory(ctx: Ctx, x: number, y: number) {
  const g = ctx.createLinearGradient(x, y, x + CW, y + CH);
  g.addColorStop(0, "#fbf6e6");
  g.addColorStop(1, "#efe5cc");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, CW, CH);
  // A faint shade toward the rounded rim, as the face curves away.
  const rim = ctx.createRadialGradient(x + CW / 2, y + CH / 2, CH * 0.36, x + CW / 2, y + CH / 2, CH * 0.62);
  rim.addColorStop(0, "rgba(120,96,60,0)");
  rim.addColorStop(1, "rgba(120,96,60,0.16)");
  ctx.fillStyle = rim;
  ctx.fillRect(x, y, CW, CH);
}
function glyph(b: Brush, text: string, cx: number, cy: number, size: number, colour: string, weight = 700) {
  const { ctx } = b;
  ctx.font = `${weight} ${size}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (!b.relief) {
    // Cut in and filled: a light lip below right, a shade above left, then the colour.
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(text, cx + 1.6, cy + 1.6);
    ctx.fillStyle = "rgba(60,40,20,0.35)";
    ctx.fillText(text, cx - 1.2, cy - 1.2);
  }
  ctx.fillStyle = b.ink(colour);
  ctx.fillText(text, cx, cy);
}
/** One circle of the circles suit: a ring of its colour round a white ring and a flower of dots. */
function coin(b: Brush, cx: number, cy: number, r: number, colour: string) {
  const { ctx } = b;
  ctx.fillStyle = b.ink(colour);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = b.relief ? "#fff" : "#fbf6e6";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = b.ink(colour);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.56, 0, Math.PI * 2);
  ctx.fill();
  if (b.relief) return;
  ctx.fillStyle = "#fbf6e6";
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.34, cy + Math.sin(a) * r * 0.34, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
}
/** One stick of the bamboo suit: a jointed green cane. */
function cane(b: Brush, cx: number, cy: number, h: number, colour: string) {
  const { ctx } = b,
    w = h * 0.24;
  ctx.fillStyle = b.ink(colour);
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, w / 2);
  ctx.fill();
  if (b.relief) return;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillRect(cx - w * 0.18, cy - h / 2 + 3, w * 0.14, h - 6);
  ctx.fillStyle = "#fbf6e6";
  for (const t of [-0.17, 0.17]) ctx.fillRect(cx - w / 2, cy + t * h - 1.5, w, 3);
  ctx.fillStyle = b.ink(colour);
  for (const t of [-0.17, 0.17]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy + t * h, w * 0.62, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
/** The one of bamboo: a little bird on a cane, our own. */
function bird(b: Brush, x: number, y: number) {
  const { ctx } = b,
    cx = x + CW / 2,
    cy = y + CH / 2;
  ctx.lineCap = "round";
  // The tail, three long feathers.
  for (const [dx, colour] of [
    [-30, GREEN],
    [-10, BLUE],
    [12, GREEN],
  ] as const) {
    ctx.strokeStyle = b.ink(colour);
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy + 22);
    ctx.quadraticCurveTo(cx + dx - 8, cy + 56, cx + dx * 1.4 - 6, cy + 78);
    ctx.stroke();
  }
  // Body and head.
  ctx.fillStyle = b.ink(GREEN);
  ctx.beginPath();
  ctx.ellipse(cx + 6, cy + 4, 30, 24, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = b.ink(BLUE);
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 8, 20, 13, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = b.ink(GREEN);
  ctx.beginPath();
  ctx.arc(cx + 26, cy - 28, 15, 0, Math.PI * 2);
  ctx.fill();
  // Crest, beak and eye.
  ctx.fillStyle = b.ink(RED);
  ctx.beginPath();
  ctx.moveTo(cx + 18, cy - 40);
  ctx.lineTo(cx + 22, cy - 62);
  ctx.lineTo(cx + 30, cy - 42);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 39, cy - 32);
  ctx.lineTo(cx + 54, cy - 26);
  ctx.lineTo(cx + 39, cy - 22);
  ctx.closePath();
  ctx.fill();
  if (!b.relief) {
    ctx.fillStyle = "#fbf6e6";
    ctx.beginPath();
    ctx.arc(cx + 30, cy - 31, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(cx + 31, cy - 31, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Its perch.
  ctx.strokeStyle = b.ink(RED);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx - 44, cy + 32);
  ctx.lineTo(cx + 40, cy + 26);
  ctx.stroke();
}
/** Where the circles or the canes of a number stand, in a cell's own units (0–1), and the colour of each. */
const CIRCLES: [number, number, string][][] = [
  [],
  [[0.5, 0.29, GREEN], [0.5, 0.71, BLUE]],
  [[0.27, 0.22, BLUE], [0.5, 0.5, RED], [0.73, 0.78, GREEN]],
  [[0.3, 0.3, BLUE], [0.7, 0.3, GREEN], [0.3, 0.7, GREEN], [0.7, 0.7, BLUE]],
  [[0.27, 0.24, BLUE], [0.73, 0.24, GREEN], [0.5, 0.5, RED], [0.27, 0.76, GREEN], [0.73, 0.76, BLUE]],
  [[0.3, 0.2, GREEN], [0.7, 0.2, GREEN], [0.3, 0.5, RED], [0.7, 0.5, RED], [0.3, 0.8, RED], [0.7, 0.8, RED]],
  [[0.24, 0.14, GREEN], [0.5, 0.25, GREEN], [0.76, 0.36, GREEN], [0.3, 0.6, RED], [0.7, 0.6, RED], [0.3, 0.84, RED], [0.7, 0.84, RED]],
  [[0.3, 0.14, BLUE], [0.7, 0.14, BLUE], [0.3, 0.38, BLUE], [0.7, 0.38, BLUE], [0.3, 0.62, BLUE], [0.7, 0.62, BLUE], [0.3, 0.86, BLUE], [0.7, 0.86, BLUE]],
  [[0.22, 0.2, GREEN], [0.5, 0.2, GREEN], [0.78, 0.2, GREEN], [0.22, 0.5, RED], [0.5, 0.5, RED], [0.78, 0.5, RED], [0.22, 0.8, BLUE], [0.5, 0.8, BLUE], [0.78, 0.8, BLUE]],
];
const CANES: [number, number, string][][] = [
  [],
  [[0.5, 0.3, GREEN], [0.5, 0.7, BLUE]],
  [[0.5, 0.29, GREEN], [0.32, 0.71, GREEN], [0.68, 0.71, BLUE]],
  [[0.32, 0.29, BLUE], [0.68, 0.29, GREEN], [0.32, 0.71, GREEN], [0.68, 0.71, BLUE]],
  [[0.26, 0.29, GREEN], [0.74, 0.29, BLUE], [0.5, 0.5, RED], [0.26, 0.71, BLUE], [0.74, 0.71, GREEN]],
  [[0.24, 0.29, GREEN], [0.5, 0.29, GREEN], [0.76, 0.29, GREEN], [0.24, 0.71, BLUE], [0.5, 0.71, BLUE], [0.76, 0.71, BLUE]],
  [[0.5, 0.17, RED], [0.24, 0.5, GREEN], [0.5, 0.5, GREEN], [0.76, 0.5, GREEN], [0.24, 0.83, GREEN], [0.5, 0.83, GREEN], [0.76, 0.83, GREEN]],
  [[0.2, 0.29, GREEN], [0.4, 0.29, GREEN], [0.6, 0.29, GREEN], [0.8, 0.29, GREEN], [0.2, 0.71, BLUE], [0.4, 0.71, BLUE], [0.6, 0.71, BLUE], [0.8, 0.71, BLUE]],
  [[0.24, 0.17, GREEN], [0.5, 0.17, RED], [0.76, 0.17, BLUE], [0.24, 0.5, GREEN], [0.5, 0.5, RED], [0.76, 0.5, BLUE], [0.24, 0.83, GREEN], [0.5, 0.83, RED], [0.76, 0.83, BLUE]],
];
/** Inside a cell's margin: where the pictures stand. */
const IN = { x: 16, y: 16, w: CW - 32, h: CH - 32 };
function circles(b: Brush, x: number, y: number, n: number) {
  if (n === 1) {
    const cx = x + CW / 2,
      cy = y + CH / 2;
    coin(b, cx, cy, 56, BLUE);
    b.ctx.strokeStyle = b.ink(GREEN);
    b.ctx.lineWidth = 6;
    b.ctx.beginPath();
    b.ctx.arc(cx, cy, 64, 0, Math.PI * 2);
    b.ctx.stroke();
    coin(b, cx, cy, 22, RED);
    return;
  }
  const r = n <= 2 ? 34 : n <= 5 ? 28 : n <= 6 ? 24 : n === 7 ? 21 : n === 8 ? 21 : 20;
  for (const [u, v, colour] of CIRCLES[n - 1]) coin(b, x + IN.x + u * IN.w, y + IN.y + v * IN.h, r, colour);
}
function bamboo(b: Brush, x: number, y: number, n: number) {
  if (n === 1) return bird(b, x, y);
  const h = n <= 6 ? 74 : n === 7 ? 52 : n === 8 ? 76 : 52;
  for (const [u, v, colour] of CANES[n - 1]) cane(b, x + IN.x + u * IN.w, y + IN.y + v * IN.h, h, colour);
}
/** A five-petalled blossom. */
function blossom(b: Brush, cx: number, cy: number, r: number, colour: string, heart = "#f2c230") {
  const { ctx } = b;
  ctx.fillStyle = b.ink(colour);
  for (let k = 0; k < 5; k++) {
    const a = (k * 2 * Math.PI) / 5 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = b.ink(heart);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}
function leaf(b: Brush, x0: number, y0: number, x1: number, y1: number, bend: number, width: number, colour: string) {
  const { ctx } = b,
    mx = (x0 + x1) / 2 + bend * (y1 - y0),
    my = (y0 + y1) / 2 - bend * (x1 - x0);
  ctx.fillStyle = b.ink(colour);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx + width, my + width, x1, y1);
  ctx.quadraticCurveTo(mx - width, my - width, x0, y0);
  ctx.fill();
}
function stroke(b: Brush, colour: string, width: number, points: number[]) {
  const { ctx } = b;
  ctx.strokeStyle = b.ink(colour);
  ctx.lineWidth = width;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let k = 2; k + 3 < points.length; k += 4) ctx.quadraticCurveTo(points[k], points[k + 1], points[k + 2], points[k + 3]);
  ctx.stroke();
}
/** A flower or a season: its picture, its character at the upper left and its number at the upper right. */
function bonus(b: Brush, x: number, y: number, which: number, season: boolean) {
  const cx = x + CW / 2,
    cy = y + CH / 2 + 18;
  glyph(b, (season ? SEASONS : FLOWERS)[which], x + 36, y + 38, 38, season ? BLUE : GREEN);
  glyph(b, String(which + 1), x + CW - 30, y + 36, 30, RED, 800);
  if (!season) {
    if (which === 0) {
      // 梅: a dark plum branch with pink blossoms.
      stroke(b, "#5a3a22", 9, [x + 24, y + CH - 28, cx - 20, cy + 10, cx + 4, cy - 14, cx + 30, cy - 40, x + CW - 26, cy - 36]);
      stroke(b, "#5a3a22", 6, [cx - 4, cy, cx + 18, cy + 14, cx + 40, cy + 30, cx + 52, cy + 44, cx + 56, cy + 56]);
      for (const [dx, dy, r] of [
        [-28, 28, 19],
        [8, -22, 21],
        [44, -42, 16],
        [44, 32, 17],
        [-12, -46, 13],
      ])
        blossom(b, cx + dx, cy + dy, r, "#e46f8e");
    } else if (which === 1) {
      // 蘭: long arched leaves and a purple bloom.
      for (const [x1, y1, bend] of [
        [x + 22, cy - 50, 0.25],
        [x + CW - 20, cy - 60, -0.25],
        [x + 30, cy - 10, 0.35],
        [x + CW - 26, cy - 12, -0.32],
      ])
        leaf(b, cx, y + CH - 26, x1, y1, bend, 6, GREEN);
      for (const [dx, dy] of [
        [-12, -38],
        [14, -30],
      ]) {
        blossom(b, cx + dx, cy + dy, 22, "#8a54b8", "#f4d34a");
      }
    } else if (which === 2) {
      // 菊: a golden chrysanthemum of many petals on a leafy stem.
      stroke(b, GREEN, 6, [cx, y + CH - 24, cx - 6, cy + 30, cx, cy - 4]);
      leaf(b, cx - 2, cy + 40, cx - 46, cy + 22, 0.2, 9, GREEN);
      leaf(b, cx, cy + 56, cx + 44, cy + 38, -0.2, 9, GREEN);
      const { ctx } = b;
      for (let ring = 0; ring < 2; ring++)
        for (let k = 0; k < 16; k++) {
          const a = (k * Math.PI * 2) / 16 + ring * 0.2,
            len = ring ? 28 : 40;
          ctx.fillStyle = b.ink(ring ? "#f2b52a" : "#e8962a");
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(a) * len * 0.55, cy - 22 + Math.sin(a) * len * 0.55, len * 0.5, 6, a, 0, Math.PI * 2);
          ctx.fill();
        }
      ctx.fillStyle = b.ink("#b8641c");
      ctx.beginPath();
      ctx.arc(cx, cy - 22, 9, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 竹: two canes with sprays of narrow leaves.
      cane(b, cx - 22, cy + 6, 128, GREEN);
      cane(b, cx + 20, cy + 16, 108, "#2e8c55");
      for (const [x0, y0, x1, y1] of [
        [cx - 22, cy - 30, cx - 62, cy - 52],
        [cx - 22, cy - 30, cx - 60, cy - 18],
        [cx + 20, cy - 10, cx + 60, cy - 36],
        [cx + 20, cy - 10, cx + 62, cy + 6],
        [cx + 20, cy - 10, cx + 44, cy - 56],
      ])
        leaf(b, x0, y0, x1, y1, 0.1, 5, "#2b7a3f");
    }
    return;
  }
  const { ctx } = b;
  if (which === 0) {
    // 春: a blossoming tree on a green rise.
    leaf(b, x + 22, y + CH - 30, x + CW - 22, y + CH - 30, -0.18, 2, "#7bb24a");
    stroke(b, "#6b4528", 10, [cx, y + CH - 34, cx + 2, cy + 20, cx - 4, cy - 6]);
    for (const [dx, dy, r] of [
      [-30, -22, 26],
      [26, -26, 26],
      [0, -48, 28],
      [-10, -10, 22],
      [30, 2, 18],
    ]) {
      ctx.fillStyle = b.ink("#f2a2b8");
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [dx, dy] of [
      [-24, -30],
      [20, -40],
      [6, -10],
      [34, -12],
      [-36, -6],
    ])
      blossom(b, cx + dx, cy + dy, 9, "#e2557a");
  } else if (which === 1) {
    // 夏: a lotus on still water with a round leaf.
    ctx.fillStyle = b.ink("#5d9fd0");
    ctx.fillRect(x + 18, cy + 34, CW - 36, 8);
    ctx.fillRect(x + 34, cy + 50, CW - 68, 5);
    ctx.fillStyle = b.ink(GREEN);
    ctx.beginPath();
    ctx.ellipse(cx + 30, cy + 30, 32, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(b, GREEN, 5, [cx - 14, cy + 36, cx - 16, cy + 8, cx - 14, cy - 12]);
    for (const [a, len] of [
      [-0.9, 44],
      [-0.3, 50],
      [0.3, 50],
      [0.9, 44],
      [0, 54],
    ]) {
      ctx.fillStyle = b.ink(a === 0 ? "#f58fb0" : "#e9608a");
      ctx.beginPath();
      ctx.ellipse(cx - 14 + Math.sin(a) * len * 0.4, cy - 30 - Math.cos(a) * len * 0.4, 11, len * 0.48, a, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (which === 2) {
    // 秋: a red maple leaf.
    const points: number[] = [];
    for (let k = 0; k <= 20; k++) {
      const a = (k / 20) * Math.PI * 2 - Math.PI / 2,
        lobe = k % 4 === 0 ? 62 : k % 2 === 0 ? 30 : 42;
      points.push(cx + Math.cos(a) * lobe * 0.95, cy - 10 + Math.sin(a) * lobe * (a > 0.3 && a < 2.8 ? 0.55 : 1));
    }
    ctx.fillStyle = b.ink("#d2402a");
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let k = 2; k < points.length; k += 2) ctx.lineTo(points[k], points[k + 1]);
    ctx.closePath();
    ctx.fill();
    stroke(b, "#7d1e14", 4, [cx, cy + 56, cx, cy + 20, cx, cy - 30]);
    stroke(b, "#7d1e14", 3, [cx, cy + 6, cx - 18, cy - 8, cx - 40, cy - 24]);
    stroke(b, "#7d1e14", 3, [cx, cy + 6, cx + 18, cy - 8, cx + 40, cy - 24]);
  } else {
    // 冬: a blue snowflake over a snowy pine.
    ctx.fillStyle = b.ink("#2f6d4a");
    for (const [w, top] of [
      [36, cy - 2],
      [48, cy + 22],
      [60, cy + 46],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx + 24, top - 24);
      ctx.lineTo(cx + 24 + w / 2, top + 14);
      ctx.lineTo(cx + 24 - w / 2, top + 14);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = b.relief ? "#fff" : "#fbfbff";
    ctx.fillRect(cx - 10, cy + 58, 70, 6);
    const fx = cx - 22,
      fy = cy - 34;
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3,
        ex = fx + Math.cos(a) * 32,
        ey = fy + Math.sin(a) * 32;
      stroke(b, "#3a78c8", 5, [fx, fy, (fx + ex) / 2, (fy + ey) / 2, ex, ey]);
      for (const side of [-1, 1]) {
        const bx = fx + Math.cos(a) * 18,
          by = fy + Math.sin(a) * 18,
          ba = a + side * 0.7;
        stroke(b, "#3a78c8", 4, [bx, by, bx + Math.cos(ba) * 6, by + Math.sin(ba) * 6, bx + Math.cos(ba) * 12, by + Math.sin(ba) * 12]);
      }
    }
  }
}
/** The white dragon: a blue frame of two lines with notched corners. */
function frame(b: Brush, x: number, y: number) {
  const { ctx } = b;
  ctx.strokeStyle = b.ink(BLUE);
  ctx.lineWidth = 9;
  ctx.strokeRect(x + 30, y + 34, CW - 60, CH - 68);
  ctx.lineWidth = 3.5;
  ctx.strokeRect(x + 42, y + 46, CW - 84, CH - 92);
  ctx.fillStyle = b.ink(BLUE);
  for (const [u, v] of [
    [30, 34],
    [CW - 30, 34],
    [30, CH - 34],
    [CW - 30, CH - 34],
  ]) {
    ctx.beginPath();
    ctx.arc(x + u, y + v, 9, 0, Math.PI * 2);
    ctx.fill();
  }
}
/** Paints every cell; `relief` paints the depth picture instead (white the face, black what is cut into it). */
function paint(relief: boolean) {
  const c = document.createElement("canvas");
  c.width = COLS * CW;
  c.height = ROWS * CH;
  const ctx = c.getContext("2d", { willReadFrequently: true })!,
    b: Brush = { ctx, relief, ink: (colour) => (relief ? "#000" : colour) };
  ctx.fillStyle = relief ? "#fff" : "#f6efdc";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let face = 0; face < 42; face++) {
    const { x, y } = cellOf(face);
    if (!relief) ivory(ctx, x, y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, CW, CH);
    ctx.clip();
    if (face < 9) {
      glyph(b, NUMERALS[face], x + CW / 2, y + CH * 0.3, 74, INK);
      glyph(b, "萬", x + CW / 2, y + CH * 0.7, 86, RED);
    } else if (face < 18) circles(b, x, y, face - 8);
    else if (face < 27) bamboo(b, x, y, face - 17);
    else if (face < 31) glyph(b, WINDS[face - 27], x + CW / 2, y + CH / 2 + 4, 116, INK, 800);
    else if (face === 31) glyph(b, "中", x + CW / 2, y + CH / 2 + 4, 124, RED, 800);
    else if (face === 32) glyph(b, "發", x + CW / 2, y + CH / 2 + 4, 112, GREEN, 800);
    else if (face === 33) frame(b, x, y);
    else bonus(b, x, y, (face - 34) % 4, face >= 38);
    ctx.restore();
  }
  // The sides: ivory over the green back, a dark seam between; the back: green with a quiet sheen.
  const s = cellOf(SIDE_CELL),
    seam = CH * (1 - BACK / H);
  if (!relief) {
    // The sides a shade deeper than the face, so that the stacks read.
    const side = ctx.createLinearGradient(0, s.y, 0, s.y + seam);
    side.addColorStop(0, "#f1e6cc");
    side.addColorStop(1, "#d9c9a4");
    ctx.fillStyle = side;
    ctx.fillRect(s.x, s.y, CW, seam);
    const g = ctx.createLinearGradient(0, s.y + seam, 0, s.y + CH);
    g.addColorStop(0, "#2a8a5e");
    g.addColorStop(1, "#15583a");
    ctx.fillStyle = g;
    ctx.fillRect(s.x, s.y + seam, CW, CH - seam);
    ctx.fillStyle = "rgba(30,40,30,0.35)";
    ctx.fillRect(s.x, s.y + seam - 2, CW, 3);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(s.x, s.y + seam - 2, CW, 3);
  }
  const k = cellOf(BACK_CELL);
  if (!relief) {
    const g = ctx.createLinearGradient(k.x, k.y, k.x + CW, k.y + CH);
    g.addColorStop(0, "#2b9064");
    g.addColorStop(1, "#176043");
    ctx.fillStyle = g;
    ctx.fillRect(k.x, k.y, CW, CH);
  }
  const t = new T.CanvasTexture(c);
  if (!relief) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** The tile's rounded block with its faces set to `face`'s cell, the green back and the two-tone sides. */
function tileGeometry(base: T.BufferGeometry, face: number) {
  const geometry = base.clone(),
    uv = geometry.getAttribute("uv") as T.BufferAttribute,
    perFace = uv.count / 6,
    width = COLS * CW,
    height = ROWS * CH,
    inset = 2;
  for (let i = 0; i < uv.count; i++) {
    const side = Math.floor(i / perFace),
      cell = cellOf(side === 2 ? face : side === 3 ? BACK_CELL : SIDE_CELL),
      u = (cell.x + inset + uv.getX(i) * (CW - 2 * inset)) / width,
      v = 1 - (cell.y + CH - inset - uv.getY(i) * (CH - 2 * inset)) / height;
    uv.setXY(i, u, v);
  }
  geometry.clearGroups();
  // The block's foot at y 0.
  geometry.translate(0, H / 2, 0);
  return geometry;
}
/** How a tile looks in each of its states: lying blocked, free, under the pointer, picked, hinted. */
export type Look = "blocked" | "free" | "hover" | "picked" | "hint";
/** Everything the tiles are drawn with: a material for each look and a block for each face. */
export function tileKit(own: Own) {
  const rich = capable(),
    map = own(paint(false)),
    relief = rich ? own(paint(true)) : null,
    base = rich
      ? own(new T.MeshPhysicalMaterial({ map, bumpMap: relief!, bumpScale: 1.4, roughness: 0.36, clearcoat: 0.55, clearcoatRoughness: 0.22 }))
      : own(new T.MeshLambertMaterial({ map })),
    look = (colour: string, glow = "#000000", strength = 0) => {
      const m = own(base.clone());
      m.color.set(colour);
      m.emissive.set(glow);
      m.emissiveMap = strength ? map : null;
      m.emissiveIntensity = strength;
      return m;
    },
    free = look("#ffffff"),
    looks: Record<Look, T.MeshStandardMaterial | T.MeshLambertMaterial> = {
      // Blocked tiles look as free ones do: no shade gives away what can be taken (the user asked to remove it).
      blocked: free,
      free,
      hover: look("#fff4d6", "#ffd98a", 0.18),
      picked: look("#fff1c4", "#ffc44a", 0.42),
      hint: look("#fff3cc", "#ffcf5a", 0.3),
    },
    shape = block(W, H, D, 0.085, rich ? 3 : 2),
    shapes: T.BufferGeometry[] = [];
  for (let face = 0; face < 42; face++) shapes.push(own(tileGeometry(shape, face)));
  shape.dispose();
  return { looks, geometry: (face: number) => shapes[face] };
}
