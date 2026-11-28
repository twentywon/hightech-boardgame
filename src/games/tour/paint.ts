/**
 * The world tour's printed things, painted in code: the spaces (one atlas for all forty), the board's middle with
 * its sea chart, the golden key cards, the bank's notes and the dice. Everything here is our own design.
 */
import { SPACES, won } from "./rules";
import { drawFlag } from "./flags";
import { drawLandmark } from "./landmarks";
import { decodeRing } from "../conquest/world";
import { WORLD_COLS, WORLD_REGIONS, WORLD_RIDGES, WORLD_ROWS } from "../conquest/world-data";

export const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
/** Colour bands of the four groups of cities: Asia, the Middle East and Africa, Europe, the Americas and Oceania. */
export const GROUPS = ["#e0674a", "#d9a03c", "#3f86c9", "#4fa266"];
/** Spaces in a row of the atlas. */
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = Math.ceil(SPACES.length / ATLAS_COLS);
const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  // Painted by the processor: a canvas drawn by the graphics process queued thousands of strokes ahead of the
  // table's first frame, which under software drawing held the start back by seconds.
  return { c, ctx: c.getContext("2d", { willReadFrequently: true })! };
};
const rounded = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};
/** Deterministic scatter for the paper's speckle and the stars. */
const scatter = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};
/** A golden key: a lobed bow, a shaft and a bit, drawn with the current stroke. */
function key(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    ctx.moveTo(-28 + Math.cos(a) * 12 + 13, Math.sin(a) * 12);
    ctx.arc(-28 + Math.cos(a) * 12, Math.sin(a) * 12, 13, 0, Math.PI * 2);
  }
  ctx.moveTo(-12, 0);
  ctx.lineTo(44, 0);
  ctx.moveTo(26, 0);
  ctx.lineTo(26, 16);
  ctx.moveTo(38, 0);
  ctx.lineTo(38, 12);
  ctx.stroke();
  ctx.restore();
}
/** One space, painted in a 256 square (the caller scales). Its top edge faces the middle of the board. */
function paintSpace(ctx: CanvasRenderingContext2D, index: number) {
  const space = SPACES[index],
    random = scatter(index * 97 + 13),
    // Corners carry a modelled thing on their inner half: their picture stays a ground for it.
    paper = ctx.createLinearGradient(0, 0, 0, 256);
  paper.addColorStop(0, "#fbf5e6");
  paper.addColorStop(1, "#efe4cb");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(120, 96, 60, 0.08)";
  for (let i = 0; i < 260; i++) ctx.fillRect(random() * 256, random() * 256, 1.5, 1.5);
  let title = "#1f1a14",
    sub = "#6a5a46",
    nameAt = 128,
    subAt = 198;
  const ground = (top: string, bottom: string) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  };
  if (space.kind === "city") {
    const band = ctx.createLinearGradient(0, 0, 0, 70);
    band.addColorStop(0, GROUPS[space.group]);
    band.addColorStop(1, shade(GROUPS[space.group], -0.12));
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, 256, 70);
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(0, 68, 256, 3);
    drawLandmark(ctx, space.country, 72, 10, 112, 58, "rgba(255, 250, 238, 0.93)");
    // The flag, with a soft shadow as if printed on a raised label.
    ctx.fillStyle = "rgba(60, 40, 20, 0.22)";
    ctx.fillRect(84, 88, 96, 62);
    drawFlag(ctx, space.country, 80, 84, 96, 62);
    nameAt = 180;
    subAt = 224;
  } else if (space.kind === "luck") {
    ground("#fbe07a", "#e7b53a");
    ctx.strokeStyle = "rgba(255, 250, 220, 0.55)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 34, 92 + Math.sin(a) * 34);
      ctx.lineTo(128 + Math.cos(a) * 70, 92 + Math.sin(a) * 70);
      ctx.stroke();
    }
    ctx.lineCap = "round";
    ctx.strokeStyle = "#7c5608";
    ctx.lineWidth = 13;
    key(ctx, 132, 92, 120);
    ctx.strokeStyle = "#ffe9a0";
    ctx.lineWidth = 4;
    key(ctx, 132, 89, 120);
    title = "#4a3104";
    sub = "#6d4d0c";
    nameAt = 182;
    subAt = 224;
  } else if (space.kind === "storm") {
    ground("#a9dcef", "#2f86b8");
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 4;
    for (const [x, y] of [[30, 150], [170, 160], [96, 176], [200, 120], [24, 108]]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 12, y - 7, x + 24, y);
      ctx.stroke();
    }
    title = sub = "#ffffff";
    nameAt = 190;
    subAt = 228;
  } else if (space.kind === "space") {
    ground("#0d1030", "#25205a");
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(255, 255, ${200 + random() * 55}, ${0.4 + random() * 0.6})`;
      const r = random() < 0.15 ? 2.2 : 1.1;
      ctx.fillRect(random() * 256, random() * 256, r, r);
    }
    ctx.fillStyle = "#e08a3c";
    ctx.beginPath();
    ctx.arc(208, 50, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f3d9a4";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(208, 50, 30, 8, -0.35, 0, Math.PI * 2);
    ctx.stroke();
    title = "#ffffff";
    sub = "#cfd6ff";
    nameAt = 190;
    subAt = 228;
  } else if (space.kind === "start") {
    ground("#e6f3d6", "#b9dca0");
    // A broad arrow along the road, which leaves this space toward the left of the picture.
    ctx.fillStyle = "#d2452f";
    ctx.beginPath();
    ctx.moveTo(26, 146);
    ctx.lineTo(84, 110);
    ctx.lineTo(84, 132);
    ctx.lineTo(226, 132);
    ctx.lineTo(226, 160);
    ctx.lineTo(84, 160);
    ctx.lineTo(84, 182);
    ctx.closePath();
    ctx.fill();
    title = "#1b3a12";
    sub = "#2e5a20";
    nameAt = 70;
    subAt = 222;
  } else if (space.kind === "fund") {
    ground("#e9eefc", "#b9c7ec");
    // An olive branch round a globe.
    ctx.strokeStyle = "#4f6db4";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(128, 80, 30, 0, Math.PI * 2);
    ctx.ellipse(128, 80, 14, 30, 0, 0, Math.PI * 2);
    ctx.moveTo(98, 80);
    ctx.lineTo(158, 80);
    ctx.stroke();
    title = "#1d2b55";
    sub = "#3a4c86";
    nameAt = 178;
    subAt = 222;
  } else if (space.kind === "collect") {
    ground("#fff6da", "#f1dc9e");
    // A heap of coins.
    for (const [x, y] of [[100, 120], [128, 112], [156, 120], [114, 100], [142, 100], [128, 88]]) {
      ctx.fillStyle = "#9a6c12";
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 20, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0c445";
      ctx.beginPath();
      ctx.ellipse(x, y, 20, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#b8861a";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    nameAt = 172;
    subAt = 220;
  } else if (space.kind === "ship") {
    ground("#1b2140", "#3b3f74");
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + random() * 0.6})`;
      ctx.fillRect(random() * 256, random() * 150, 1.4, 1.4);
    }
    // The spacecraft, side on: a white body with dark nose and belly, a fin and a flame.
    ctx.save();
    ctx.translate(128, 96);
    ctx.rotate(-0.35);
    ctx.fillStyle = "#f08a24";
    ctx.beginPath();
    ctx.moveTo(-62, -4);
    ctx.lineTo(-96, 2);
    ctx.lineTo(-62, 10);
    ctx.fill();
    ctx.fillStyle = "#eef1f4";
    ctx.beginPath();
    ctx.moveTo(-62, -12);
    ctx.lineTo(40, -12);
    ctx.quadraticCurveTo(72, -10, 74, 4);
    ctx.lineTo(-62, 14);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-56, -12);
    ctx.lineTo(-44, -46);
    ctx.lineTo(-30, -46);
    ctx.lineTo(-24, -12);
    ctx.fill();
    ctx.fillStyle = "#2a2f3a";
    ctx.beginPath();
    ctx.moveTo(52, -10);
    ctx.quadraticCurveTo(72, -10, 74, 4);
    ctx.lineTo(50, 6);
    ctx.fill();
    ctx.fillRect(-62, 8, 120, 6);
    ctx.fillStyle = "#c6ccd6";
    ctx.beginPath();
    ctx.moveTo(-40, 6);
    ctx.lineTo(10, 6);
    ctx.lineTo(-30, 30);
    ctx.fill();
    ctx.restore();
    title = "#ffffff";
    sub = "#cfd6ff";
    nameAt = 182;
    subAt = 224;
  }
  // The printed edge: a dark rule round the space and a thin inner line.
  ctx.strokeStyle = "#2c2118";
  ctx.lineWidth = 7;
  ctx.strokeRect(3.5, 3.5, 249, 249);
  ctx.strokeStyle = "rgba(44, 33, 24, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(11, 11, 234, 234);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const city = space.kind === "city",
    size = space.name.length > 5 ? 30 : space.name.length > 3 ? 38 : city ? 46 : 52;
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = title;
  if (title === "#ffffff") {
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 6;
  }
  ctx.fillText(space.name, 128, nameAt);
  ctx.font = `700 ${city ? 26 : 30}px ${FONT}`;
  ctx.fillStyle = sub;
  ctx.fillText(
    city || space.kind === "ship"
      ? won(space.price)
      : { start: "월급 +200", luck: "카드 뽑기", collect: "기금 받기", storm: "더블이면 탈출", fund: "-150", space: "어디든 이동", ship: "", city: "" }[space.kind],
    128,
    subAt,
  );
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}
/** A colour made lighter (amount > 0) or darker. */
export function shade(color: string, amount: number) {
  const n = parseInt(color.slice(1), 16),
    to = amount > 0 ? 255 : 0,
    f = Math.abs(amount),
    part = (v: number) => Math.round(v + (to - v) * f);
  return `rgb(${part(n >> 16)}, ${part((n >> 8) & 255)}, ${part(n & 255)})`;
}
/** All forty spaces in one picture, `cell` pixels each, in rows of `ATLAS_COLS`. */
export function spaceAtlas(cell: number) {
  const { c, ctx } = canvas(cell * ATLAS_COLS, cell * ATLAS_ROWS);
  SPACES.forEach((_, i) => {
    ctx.save();
    ctx.translate((i % ATLAS_COLS) * cell, Math.floor(i / ATLAS_COLS) * cell);
    ctx.scale(cell / 256, cell / 256);
    ctx.beginPath();
    ctx.rect(0, 0, 256, 256);
    ctx.clip();
    paintSpace(ctx, i);
    ctx.restore();
  });
  return c;
}
/** Soft land tints of a printed sea chart, a continent each. */
const LANDS = ["#e9d9a6", "#dccf98", "#efe0b8", "#e7c98f", "#e3d3a0", "#ead0a0"];
/**
 * The board's top: a sea chart of our own over the whole square `size` board units across (`pixels` square). The
 * world's coasts are drawn from the public-domain outlines the conquest map uses, in a printed chart's colours;
 * below them a compass rose and the game's title in a cartouche.
 */
export function boardPrint(pixels: number, size: number, inner: number) {
  const { c, ctx } = canvas(pixels, pixels),
    k = pixels / size,
    // Board units (x across, z toward me) to pixels.
    X = (x: number) => (x + size / 2) * k,
    Z = (z: number) => (z + size / 2) * k,
    random = scatter(7);
  const sea = ctx.createRadialGradient(X(0), Z(-1), k * 1, X(0), Z(0), k * size * 0.62);
  sea.addColorStop(0, "#3c95ae");
  sea.addColorStop(0.65, "#2a7891");
  sea.addColorStop(1, "#1d5a72");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, pixels, pixels);
  // Little wave marks over the open sea.
  ctx.strokeStyle = "rgba(220, 244, 250, 0.16)";
  ctx.lineWidth = k * 0.025;
  for (let i = 0; i < 260; i++) {
    const x = X(-inner + random() * inner * 2),
      z = Z(-inner + random() * inner * 2),
      w = k * (0.12 + random() * 0.1);
    ctx.beginPath();
    ctx.moveTo(x, z);
    ctx.quadraticCurveTo(x + w / 2, z - w * 0.35, x + w, z);
    ctx.stroke();
  }
  // The chart: the world in a rectangle in the upper part of the middle.
  const left = -inner + 0.35,
    right = inner - 0.35,
    top = -inner + 0.25,
    width = right - left,
    height = (width * WORLD_ROWS) / WORLD_COLS,
    mx = (x: number) => X(left + (x / WORLD_COLS) * width),
    mz = (y: number) => Z(top + (y / WORLD_ROWS) * height);
  // Parallels and meridians.
  ctx.strokeStyle = "rgba(225, 245, 250, 0.22)";
  ctx.lineWidth = k * 0.018;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(mx(0), mz((i * WORLD_ROWS) / 8));
    ctx.lineTo(mx(WORLD_COLS), mz((i * WORLD_ROWS) / 8));
    ctx.stroke();
  }
  for (let i = 1; i < 12; i++) {
    const x = (i * WORLD_COLS) / 12,
      bow = (x - WORLD_COLS / 2) * 0.18;
    ctx.beginPath();
    ctx.moveTo(mx(x - bow), mz(0));
    ctx.quadraticCurveTo(mx(x + bow), mz(WORLD_ROWS / 2), mx(x - bow), mz(WORLD_ROWS));
    ctx.stroke();
  }
  const shapes = WORLD_REGIONS.map((region) => ({ continent: region.continent, rings: region.rings.map((text) => decodeRing(text)) })),
    trace = (ring: Float32Array) => {
      ctx.moveTo(mx(ring[0]), mz(ring[1]));
      for (let i = 2; i < ring.length; i += 2) ctx.lineTo(mx(ring[i]), mz(ring[i + 1]));
      ctx.closePath();
    };
  ctx.lineJoin = "round";
  // Shallows round every coast, then the land in its continent's tint, then the coast line.
  for (const [width, colour] of [
    [0.2, "rgba(120, 200, 214, 0.35)"],
    [0.1, "rgba(150, 220, 228, 0.5)"],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = k * width;
    for (const shape of shapes)
      for (const ring of shape.rings) {
        ctx.beginPath();
        trace(ring);
        ctx.stroke();
      }
  }
  // The coast: every region filled a little larger in the coast's ink, then the land over it; only the outer edge
  // of the ink is left, so the cut lines between the regions never show.
  ctx.fillStyle = ctx.strokeStyle = "rgba(92, 70, 40, 0.85)";
  ctx.lineWidth = k * 0.032;
  for (const shape of shapes) {
    ctx.beginPath();
    for (const ring of shape.rings) trace(ring);
    ctx.fill("evenodd");
    ctx.stroke();
  }
  ctx.lineWidth = k * 0.008;
  for (const shape of shapes) {
    ctx.fillStyle = ctx.strokeStyle = LANDS[shape.continent] ?? LANDS[0];
    ctx.beginPath();
    for (const ring of shape.rings) trace(ring);
    ctx.fill("evenodd");
    ctx.stroke();
  }
  // Mountain ranges as little printed peaks.
  ctx.strokeStyle = "rgba(120, 86, 48, 0.6)";
  ctx.lineWidth = k * 0.012;
  for (const [weight, , points] of WORLD_RIDGES) {
    const s = k * (0.035 + weight * 0.04);
    for (let i = 0; i < points.length; i += 2) {
      const x = mx(points[i]),
        z = mz(points[i + 1]);
      ctx.beginPath();
      ctx.moveTo(x - s, z + s * 0.5);
      ctx.lineTo(x, z - s * 0.6);
      ctx.lineTo(x + s, z + s * 0.5);
      ctx.stroke();
    }
  }
  // A dotted route round the world.
  ctx.strokeStyle = "rgba(210, 69, 47, 0.8)";
  ctx.lineWidth = k * 0.03;
  ctx.setLineDash([k * 0.07, k * 0.07]);
  ctx.beginPath();
  const stops = [
    [53, 15],
    [44, 20],
    [36, 14],
    [26, 10],
    [16, 13],
    [11, 26],
    [56, 31],
  ];
  ctx.moveTo(mx(stops[0][0]), mz(stops[0][1]));
  for (let i = 1; i < stops.length; i++) {
    const [a, b] = stops[i - 1],
      [x, y] = stops[i];
    ctx.quadraticCurveTo(mx((a + x) / 2), mz(Math.min(b, y) - 4), mx(x), mz(y));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [x, y] of stops) {
    ctx.fillStyle = "#d2452f";
    ctx.beginPath();
    ctx.arc(mx(x), mz(y), k * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  // The chart's own frame.
  ctx.strokeStyle = "rgba(240, 226, 190, 0.85)";
  ctx.lineWidth = k * 0.03;
  ctx.strokeRect(mx(0), mz(0), mx(WORLD_COLS) - mx(0), mz(WORLD_ROWS) - mz(0));
  // A compass rose at the lower left.
  const cx = X(-inner + 1.25),
    cz = Z(inner - 1.2),
    r = k * 0.9;
  ctx.strokeStyle = "rgba(240, 226, 190, 0.8)";
  ctx.lineWidth = k * 0.02;
  ctx.beginPath();
  ctx.arc(cx, cz, r * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cz, r * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2,
      long = i % 2 ? 0.55 : 1;
    for (const side of [-1, 1]) {
      ctx.fillStyle = side < 0 ? "#f0e2be" : i % 2 ? "#9c7b45" : "#d2452f";
      ctx.beginPath();
      ctx.moveTo(cx, cz);
      ctx.lineTo(cx + Math.cos(a) * r * long, cz + Math.sin(a) * r * long);
      ctx.lineTo(cx + Math.cos(a + side * 0.35) * r * 0.18, cz + Math.sin(a + side * 0.35) * r * 0.18);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = "#f0e2be";
  ctx.font = `800 ${k * 0.22}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx, cz - r * 1.12);
  // The title in a ribbon cartouche below the chart.
  const tx = X(0),
    tz = Z(inner - 1.05),
    tw = k * 4.2,
    th = k * 1.05;
  ctx.fillStyle = "rgba(10, 40, 56, 0.35)";
  rounded(ctx, tx - tw / 2 + k * 0.06, tz - th / 2 + k * 0.08, tw, th, k * 0.18);
  ctx.fill();
  ctx.fillStyle = "#f3e6c4";
  rounded(ctx, tx - tw / 2, tz - th / 2, tw, th, k * 0.18);
  ctx.fill();
  ctx.strokeStyle = "#a9823e";
  ctx.lineWidth = k * 0.03;
  rounded(ctx, tx - tw / 2 + k * 0.08, tz - th / 2 + k * 0.08, tw - k * 0.16, th - k * 0.16, k * 0.12);
  ctx.stroke();
  ctx.fillStyle = "#7a2a1c";
  ctx.font = `900 ${k * 0.42}px ${FONT}`;
  ctx.fillText("세계 일주", tx, tz - k * 0.12);
  ctx.fillStyle = "#6d5532";
  ctx.font = `700 ${k * 0.17}px ${FONT}`;
  ctx.fillText("A R O U N D   T H E   W O R L D", tx, tz + k * 0.28);
  // A gilt line round the middle, inside the spaces.
  ctx.strokeStyle = "rgba(236, 204, 120, 0.7)";
  ctx.lineWidth = k * 0.03;
  ctx.strokeRect(X(-inner + 0.1), Z(-inner + 0.1), k * (inner - 0.1) * 2, k * (inner - 0.1) * 2);
  return c;
}
/** The back of a golden key card: gold with a sunburst, a double frame and the key. */
export function cardBack() {
  const { c, ctx } = canvas(256, 360),
    gold = ctx.createLinearGradient(0, 0, 256, 360);
  gold.addColorStop(0, "#f7d76e");
  gold.addColorStop(0.5, "#d9a52a");
  gold.addColorStop(1, "#b98516");
  ctx.fillStyle = gold;
  ctx.fillRect(0, 0, 256, 360);
  ctx.strokeStyle = "rgba(255, 244, 200, 0.35)";
  ctx.lineWidth = 6;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * 40, 172 + Math.sin(a) * 40);
    ctx.lineTo(128 + Math.cos(a) * 200, 172 + Math.sin(a) * 200);
    ctx.stroke();
  }
  ctx.strokeStyle = "#7a5410";
  ctx.lineWidth = 8;
  rounded(ctx, 14, 14, 228, 332, 14);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  rounded(ctx, 26, 26, 204, 308, 8);
  ctx.stroke();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#6b4a0c";
  ctx.lineWidth = 15;
  ctx.save();
  ctx.translate(128, 172);
  ctx.rotate(-Math.PI / 4);
  key(ctx, 0, 0, 170);
  ctx.strokeStyle = "#ffeaa6";
  ctx.lineWidth = 5;
  key(ctx, 0, -3, 170);
  ctx.restore();
  ctx.fillStyle = "#6b4a0c";
  ctx.textAlign = "center";
  ctx.font = `800 24px ${FONT}`;
  ctx.fillText("황금열쇠", 128, 312);
  return c;
}
/** The face of a golden key card, as it is read on the board. */
export function cardFace() {
  const { c, ctx } = canvas(256, 360);
  ctx.fillStyle = "#fff8e2";
  ctx.fillRect(0, 0, 256, 360);
  const rim = ctx.createLinearGradient(0, 0, 256, 360);
  rim.addColorStop(0, "#f2cf63");
  rim.addColorStop(1, "#b88617");
  ctx.strokeStyle = rim;
  ctx.lineWidth = 16;
  rounded(ctx, 12, 12, 232, 336, 14);
  ctx.stroke();
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 2;
  rounded(ctx, 28, 28, 200, 304, 8);
  ctx.stroke();
  ctx.fillStyle = "#7a5a10";
  ctx.textAlign = "center";
  ctx.font = `800 42px ${FONT}`;
  ctx.fillText("황금열쇠", 128, 100);
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText("G O L D E N   K E Y", 128, 128);
  ctx.strokeStyle = "#b8891a";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  key(ctx, 128, 214, 130);
  return c;
}
/** Gilt edges of a pile of cards, in stripes. */
export function cardEdges() {
  const { c, ctx } = canvas(16, 128);
  for (let i = 0; i < 32; i++) {
    ctx.fillStyle = i % 2 ? "#f2cf5e" : "#a87a14";
    ctx.fillRect(0, i * 4, 16, 4);
  }
  return c;
}
/** A banknote of the tour's own bank, in neutral ink (each pile tints it). */
export function banknote() {
  const { c, ctx } = canvas(256, 128);
  ctx.fillStyle = "#f4f4ee";
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "#5c6660";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(14, 14, 228, 100);
  ctx.strokeStyle = "rgba(70, 80, 74, 0.35)";
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.ellipse(128, 64, 30 + i * 3, 22 + i * 2.2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#47524c";
  ctx.beginPath();
  ctx.arc(128, 64, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f4f4ee";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(128, 64, 20, 0, Math.PI * 2);
  ctx.ellipse(128, 64, 9, 20, 0, 0, Math.PI * 2);
  ctx.moveTo(108, 64);
  ctx.lineTo(148, 64);
  ctx.stroke();
  ctx.fillStyle = "#3a433e";
  ctx.font = `900 28px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("100", 46, 38);
  ctx.fillText("100", 210, 92);
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText("WORLD TOUR BANK", 200, 30);
  return c;
}
/** A die's face: ivory, its pips sunk a little (the one red and large). */
export function dieFace(value: number) {
  const { c, ctx } = canvas(128, 128),
    at = [32, 64, 96],
    spots: [number, number][][] = [[], [[1, 1]], [[0, 0], [2, 2]], [[0, 0], [1, 1], [2, 2]], [[0, 0], [2, 0], [0, 2], [2, 2]], [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]]];
  const ivory = ctx.createRadialGradient(54, 50, 10, 64, 64, 96);
  ivory.addColorStop(0, "#fbf7ec");
  ivory.addColorStop(1, "#ece2cb");
  ctx.fillStyle = ivory;
  ctx.fillRect(0, 0, 128, 128);
  for (const [x, y] of spots[value]) {
    const r = value === 1 ? 19 : 11,
      pip = ctx.createRadialGradient(at[x] + r * 0.3, at[y] + r * 0.35, r * 0.1, at[x], at[y], r);
    pip.addColorStop(0, value === 1 ? "#e2462e" : "#3a3c40");
    pip.addColorStop(1, value === 1 ? "#9e2212" : "#0c0d0f");
    ctx.fillStyle = pip;
    ctx.beginPath();
    ctx.arc(at[x], at[y], r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}
