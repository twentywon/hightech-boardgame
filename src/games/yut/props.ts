import * as T from "three";
import { capable, woodPhoto } from "../../engine/scene-utils";

/**
 * The things on the mat of the yut yard, made in code: the board painted with an ink brush, the four sticks of
 * birch with rounded backs, the carved and lacquered pieces, and the straw mat (멍석) itself. Nothing here knows the
 * rules; `view.ts` lays them out. Nothing runs at import, so the browser tests can load the view under plain Node.
 */

export function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
export function texture(c: HTMLCanvasElement, repeat = 1) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat !== 1) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}
export function noise(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/* ------------------------------------------------------------------ ink */

type Point = readonly [number, number];
/**
 * One stroke of an ink brush along `points`: many bristles side by side, the stroke swelling after it is set down and
 * thinning as it is lifted, the bristles running dry toward its end so that the wood shows through in streaks.
 */
function brush(ctx: CanvasRenderingContext2D, points: Point[], width: number, rand: () => number, ink = "26, 19, 15", dry = 0.5) {
  // Resample the path into short, even steps.
  const path: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1],
      [x1, y1] = points[i],
      n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) path.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  if (path.length < 2) return;
  const normals = path.map((_, i) => {
    const a = path[Math.max(0, i - 1)],
      b = path[Math.min(path.length - 1, i + 1)],
      l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] as const;
  });
  // The pressure: set down a little thin, full through the middle, lifted to a point.
  const press = (t: number) => Math.min(1, 0.72 + t * 3) * (t > 0.82 ? 1 - ((t - 0.82) / 0.18) * 0.55 : 1);
  // A faint wash under the bristles, where the ink has soaked into the grain.
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = `rgba(${ink}, 0.16)`;
  ctx.lineWidth = width * 1.15;
  ctx.beginPath();
  path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  const bristles = Math.max(6, Math.round(width / 1.6));
  for (let b = 0; b < bristles; b++) {
    const across = (b / (bristles - 1)) * 2 - 1,
      load = 0.55 + rand() * 0.4,
      // Bristles at the edges run dry first.
      runsOut = 1 - dry * Math.abs(across) ** 1.5 * rand();
    let wobble = 0;
    ctx.lineWidth = (width / bristles) * (1.6 + rand() * 0.9);
    ctx.beginPath();
    let drawing = false;
    path.forEach(([x, y], i) => {
      const t = i / (path.length - 1);
      wobble += (rand() - 0.5) * 0.18;
      wobble *= 0.9;
      const off = (across * width) / 2 * press(t) + wobble,
        gap = t > runsOut && rand() < 0.45;
      if (gap) {
        drawing = false;
        return;
      }
      const px = x + normals[i][0] * off,
        py = y + normals[i][1] * off;
      if (drawing) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      drawing = true;
    });
    ctx.strokeStyle = `rgba(${ink}, ${load})`;
    ctx.stroke();
  }
  ctx.restore();
}
/** A ring of the brush round (x, y): a little more than one turn, so that its two ends overlap as a painter's do. */
function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, width: number, rand: () => number, ink?: string) {
  const from = rand() * Math.PI * 2,
    turn = Math.PI * 2 * (1.04 + rand() * 0.05),
    points: Point[] = [];
  for (let k = 0; k <= 64; k++) {
    const a = from + (turn * k) / 64,
      wob = 1 + Math.sin(a * 3 + from) * 0.015;
    points.push([x + Math.cos(a) * r * wob, y + Math.sin(a) * r * wob]);
  }
  brush(ctx, points, width, rand, ink, 0.35);
}
/** A spot of colour laid with a wet brush: a soft rim where the pigment gathered as it dried. */
function wash(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, alpha: number, rand: () => number) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  g.addColorStop(0, `rgba(${rgb}, ${alpha * 0.82})`);
  g.addColorStop(0.86, `rgba(${rgb}, ${alpha})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let k = 0; k <= 40; k++) {
    const a = (k / 40) * Math.PI * 2,
      rr = r * (1 + (rand() - 0.5) * 0.05);
    k ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.fill();
  ctx.restore();
}

/* ---------------------------------------------------------------- board */

/** Where the stations of the board are drawn: `at(station)` gives a point of the canvas. */
export interface BoardLayout {
  size: number;
  at: (station: number) => Point;
  /** Pixels a unit of the yard. */
  scale: number;
}
/**
 * The board's face: a pale wooden board (the photographed wood, sanded light) on which the roads and the twenty-nine
 * stations are painted with an ink brush, the corners and the centre (방) filled with cinnabar, 출발 written in red
 * by the start, and a fret border round it all. Painted again once the photograph of the wood has come.
 */
export function boardTexture(layout: BoardLayout) {
  const { size, at, scale } = layout,
    { c, ctx } = canvas(size, size),
    map = texture(c);
  const paint = (grain: HTMLImageElement | null) => {
    const rand = noise(23);
    // The wood: the photograph twice across, graded to a light, warm board, its grain kept soft.
    if (grain) {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) ctx.drawImage(grain, (x * size) / 2, (y * size) / 2, size / 2, size / 2);
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = "#f4dcae";
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(240, 220, 180, 0.42)";
      ctx.fillRect(0, 0, size, size);
    } else {
      ctx.fillStyle = "#dcbf8e";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = `rgba(140, 96, 48, ${rand() * 0.08})`;
        ctx.fillRect(0, rand() * size, size, 1 + rand() * 2);
      }
    }
    // Years of hands: the middle a shade paler, the edges a shade darker.
    const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size * 0.72);
    vignette.addColorStop(0, "rgba(255, 245, 225, 0.12)");
    vignette.addColorStop(1, "rgba(90, 56, 24, 0.28)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);
    const px = scale;
    // A fret border (회문) in thin ink, between two ruled lines.
    const edge = size * 0.035,
      band = px * 0.12;
    ctx.strokeStyle = "rgba(38, 26, 18, 0.78)";
    ctx.lineWidth = size * 0.004;
    ctx.strokeRect(edge, edge, size - edge * 2, size - edge * 2);
    ctx.strokeRect(edge + band, edge + band, size - (edge + band) * 2, size - (edge + band) * 2);
    ctx.lineWidth = size * 0.0026;
    ctx.strokeStyle = "rgba(150, 44, 28, 0.75)";
    const fret = (x0: number, y0: number, dx: number, dy: number, length: number) => {
      const unit = band,
        count = Math.floor(length / unit),
        nx = -dy,
        ny = dx;
      for (let k = 1; k < count - 1; k++) {
        const ox = x0 + dx * k * unit + nx * band * 0.5,
          oy = y0 + dy * k * unit + ny * band * 0.5,
          s = unit * 0.32,
          // A small square spiral, its turn alternating.
          dir = k % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(ox - dx * s - nx * s * dir, oy - dy * s - ny * s * dir);
        ctx.lineTo(ox + dx * s - nx * s * dir, oy + dy * s - ny * s * dir);
        ctx.lineTo(ox + dx * s + nx * s * dir, oy + dy * s + ny * s * dir);
        ctx.lineTo(ox - dx * s * 0.2 + nx * s * dir, oy - dy * s * 0.2 + ny * s * dir);
        ctx.lineTo(ox - dx * s * 0.2 - nx * s * 0.1 * dir, oy - dy * s * 0.2 - ny * s * 0.1 * dir);
        ctx.stroke();
      }
    };
    const inner = size - edge * 2;
    fret(edge, edge, 1, 0, inner);
    fret(size - edge, edge, 0, 1, inner);
    fret(size - edge, size - edge, -1, 0, inner);
    fret(edge, size - edge, 0, -1, inner);
    // The roads: the square and its two diagonals, each one stroke of the brush between stations.
    const road = (stations: number[]) => {
      for (let i = 1; i < stations.length; i++) {
        const a = at(stations[i - 1]),
          b = at(stations[i]),
          l = Math.hypot(b[0] - a[0], b[1] - a[1]),
          // The stroke runs from rim to rim of the stations, not through them.
          ra = (big(stations[i - 1]) ? 0.3 : 0.2) * px,
          rb = (big(stations[i]) ? 0.3 : 0.2) * px,
          ux = (b[0] - a[0]) / l,
          uy = (b[1] - a[1]) / l;
        brush(ctx, [[a[0] + ux * ra * 0.8, a[1] + uy * ra * 0.8], [b[0] - ux * rb * 0.8, b[1] - uy * rb * 0.8]], px * 0.075, rand);
      }
    };
    const big = (s: number) => (s % 5 === 0 && s <= 15) || s === 22;
    road([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 0]);
    road([5, 20, 21, 22, 23, 24, 15]);
    road([10, 25, 26, 22, 27, 28, 0]);
    // The stations: a pale wash and a ring of the brush; the corners and the centre larger, filled with cinnabar,
    // with a second ring inside.
    for (let s = 0; s < 29; s++) {
      const [x, y] = at(s),
        r = (big(s) ? 0.3 : 0.2) * px;
      wash(ctx, x, y, r * 0.98, big(s) ? "178, 52, 30" : "250, 238, 210", big(s) ? 0.86 : 0.75, rand);
      ring(ctx, x, y, r, px * 0.052, rand);
      if (big(s)) ring(ctx, x, y, r * 0.7, px * 0.026, rand, "250, 236, 206");
    }
    // 출발 by the start, in red, and a small seal of the yard's own in the opposite margin.
    const [sx, sy] = at(0);
    ctx.save();
    ctx.fillStyle = "rgba(252, 240, 214, 0.96)";
    ctx.font = `700 ${px * 0.17}px "Noto Serif KR", "Noto Serif CJK KR", AppleMyungjo, Batang, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("출발", sx, sy + px * 0.01);
    ctx.restore();
    // A cloud (구름무늬) in each of the four spaces between the diagonals and the square: a head of three lobes that
    // curl inward, and a tail trailing off, washed pale red and drawn round in thin ink.
    for (const [cx, cy, flip] of [
      [0, -0.6, 1],
      [0.6, 0, -1],
      [0, 0.6, -1],
      [-0.6, 0, 1],
    ]) {
      const x = size / 2 + cx * px * 2.5,
        y = size / 2 + cy * px * 2.5,
        r = px * 0.085;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(flip, 1);
      const cloud = new Path2D();
      cloud.arc(-r * 1.25, r * 0.15, r, Math.PI * 0.5, Math.PI * 1.6);
      cloud.arc(0, -r * 0.7, r * 1.05, Math.PI * 1.05, Math.PI * 1.95);
      cloud.arc(r * 1.25, r * 0.15, r, Math.PI * 1.4, Math.PI * 2.5);
      cloud.quadraticCurveTo(r * 0.4, r * 1.3, -r * 0.2, r * 1.0);
      cloud.quadraticCurveTo(-r * 1.0, r * 1.5, -r * 1.25, r * 1.15);
      cloud.closePath();
      ctx.fillStyle = "rgba(178, 60, 36, 0.22)";
      ctx.fill(cloud);
      ctx.strokeStyle = "rgba(38, 26, 18, 0.55)";
      ctx.lineWidth = px * 0.012;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(cloud);
      // The curls inside each lobe and the trailing tail.
      ctx.beginPath();
      for (const [lx, ly, lr] of [
        [-r * 1.25, r * 0.15, r * 0.5],
        [0, -r * 0.7, r * 0.55],
        [r * 1.25, r * 0.15, r * 0.5],
      ]) {
        ctx.moveTo(lx + lr, ly);
        ctx.arc(lx, ly, lr, 0, Math.PI * 1.5);
      }
      ctx.moveTo(-r * 1.25, r * 1.15);
      ctx.bezierCurveTo(-r * 2.4, r * 1.6, -r * 3.2, r * 0.6, -r * 4.1, r * 1.3);
      ctx.stroke();
      ctx.restore();
    }
    map.needsUpdate = true;
  };
  paint(null);
  woodPhoto("light", (image) => paint(image));
  return map;
}

/* --------------------------------------------------------------- sticks */

/** A stick's half width, height and length. */
export const STICK = { width: 0.19, height: 0.155, length: 1.55 };
/** The cross-section of a stick round its middle: the rounded back, then the flat face. */
function section(steps: number) {
  const out: { z: number; y: number }[] = [];
  for (let j = 0; j <= steps; j++) {
    const phi = (Math.PI * j) / steps;
    out.push({ z: STICK.width * Math.cos(phi), y: STICK.height * Math.sin(phi) ** 0.75 - STICK.height / 2 });
  }
  return out;
}
const OUTLINE = section(24);
/** How high the middle of a stick turned `roll` about its length stands over the ground it rests on. */
export function standOff(roll: number) {
  const c = Math.cos(roll),
    s = Math.sin(roll);
  let low = Infinity;
  for (const p of OUTLINE) low = Math.min(low, p.y * c - p.z * s);
  // The flat face's corners.
  for (const z of [-STICK.width, STICK.width]) low = Math.min(low, (-STICK.height / 2) * c - z * s);
  return -low;
}
/**
 * One stick lying along x, its flat face down (y < 0) and its rounded back up, round its middle: the ends rounded
 * off, a little slimmer toward them. Two groups: the back (material 0) and the face (material 1).
 */
export function stickGeometry() {
  const along = 48,
    round = 18,
    across = 6,
    { width, length } = STICK,
    positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  // How much of the full section stands at each place along the stick: blunt ends with rounded edges.
  const end = 0.075,
    shape = (x: number) => {
      const u = Math.max(0, (Math.abs(x) - (length / 2 - end)) / end);
      return (1 - u ** 3.2) ** (1 / 3.2) * (1 - 0.07 * ((2 * x) / length) ** 2);
    },
    outline = section(round);
  const grid = (cols: number, at: (i: number, j: number) => [number, number, number, number, number]) => {
    const base = positions.length / 3;
    for (let i = 0; i <= along; i++)
      for (let j = 0; j <= cols; j++) {
        const [x, y, z, u, v] = at(i, j);
        positions.push(x, y, z);
        uvs.push(u, v);
      }
    const first = indices.length;
    for (let i = 0; i < along; i++)
      for (let j = 0; j < cols; j++) {
        const a = base + i * (cols + 1) + j,
          b = a + cols + 1,
          c = a + 1,
          d = b + 1;
        indices.push(a, b, c, b, d, c);
      }
    return indices.length - first;
  };
  // Along the stick the steps crowd toward the rounded ends.
  const xAt = (i: number) => (Math.sin(((i / along) * 2 - 1) * (Math.PI / 2)) * length) / 2;
  const back = grid(round, (i, j) => {
    const x = xAt(i),
      k = shape(x),
      p = outline[j];
    return [x, (p.y + STICK.height / 2) * k - STICK.height / 2, p.z * k, x / length + 0.5, j / round];
  });
  const face = grid(across, (i, j) => {
    const x = xAt(i),
      k = shape(x),
      z = width * ((2 * j) / across - 1);
    return [x, -STICK.height / 2, z * k, x / length + 0.5, z / width / 2 + 0.5];
  });
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(0, back, 0);
  geometry.addGroup(back, face, 1);
  geometry.computeVertexNormals();
  return geometry;
}
/**
 * The rounded back of a stick: birch (박달나무), the photographed grain graded to its warm brown, darker where hands
 * have held it, with three crosses burnt into it as the old sticks carry.
 */
export function stickBack(seed: number) {
  const w = 1024,
    h = 360,
    { c, ctx } = canvas(w, h),
    map = texture(c);
  const paint = (grain: HTMLImageElement | null) => {
    const rand = noise(seed);
    if (grain) {
      ctx.drawImage(grain, 0, (seed * 37) % 300, 512, 180, 0, 0, w, h);
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "#b0764a";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.fillStyle = "#8a5a36";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i++) {
        ctx.fillStyle = `rgba(60, 34, 16, ${rand() * 0.2})`;
        ctx.fillRect(0, rand() * h, w, 1 + rand() * 2);
      }
    }
    // Darker along the two edges and at the ends, where it is held and where it strikes the mat.
    const sides = ctx.createLinearGradient(0, 0, 0, h);
    sides.addColorStop(0, "rgba(50, 26, 10, 0.4)");
    sides.addColorStop(0.22, "rgba(50, 26, 10, 0)");
    sides.addColorStop(0.78, "rgba(50, 26, 10, 0)");
    sides.addColorStop(1, "rgba(50, 26, 10, 0.4)");
    ctx.fillStyle = sides;
    ctx.fillRect(0, 0, w, h);
    const ends = ctx.createLinearGradient(0, 0, w, 0);
    ends.addColorStop(0, "rgba(40, 20, 8, 0.55)");
    ends.addColorStop(0.06, "rgba(40, 20, 8, 0)");
    ends.addColorStop(0.94, "rgba(40, 20, 8, 0)");
    ends.addColorStop(1, "rgba(40, 20, 8, 0.55)");
    ctx.fillStyle = ends;
    ctx.fillRect(0, 0, w, h);
    // Three crosses burnt in: soft-edged, darkest in the middle of the line.
    ctx.save();
    ctx.lineCap = "round";
    for (const x of [0.3, 0.5, 0.7]) {
      const cx = x * w,
        cy = h / 2,
        s = h * 0.17;
      for (const [width, color] of [
        [18, "rgba(60, 28, 10, 0.35)"],
        [10, "rgba(36, 16, 6, 0.8)"],
      ] as const) {
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx - s, cy - s);
        ctx.lineTo(cx + s, cy + s);
        ctx.moveTo(cx + s, cy - s);
        ctx.lineTo(cx - s, cy + s);
        ctx.stroke();
      }
    }
    // A pair of rings burnt round the stick near each end.
    for (const x of [0.13, 0.87]) {
      ctx.fillStyle = "rgba(36, 16, 6, 0.7)";
      ctx.fillRect(x * w - 5, 0, 4, h);
      ctx.fillRect(x * w + 6, 0, 4, h);
    }
    ctx.restore();
    map.needsUpdate = true;
  };
  paint(null);
  woodPhoto("light", (image) => paint(image));
  return map;
}
/** The flat face of a stick: pale, sanded wood along its grain; the marked one carries the red spot of 빽도. */
export function stickFace(marked: boolean, seed: number) {
  const w = 1024,
    h = 256,
    { c, ctx } = canvas(w, h),
    map = texture(c);
  const paint = (grain: HTMLImageElement | null) => {
    const rand = noise(seed);
    if (grain) {
      ctx.drawImage(grain, 0, (seed * 53) % 360, 512, 128, 0, 0, w, h);
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "#f2dcb4";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.fillStyle = "#ecd8ae";
      ctx.fillRect(0, 0, w, h);
    }
    // The pith: a faint darker line down the middle, where the branch was split.
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(150, 104, 52, ${rand() * 0.12})`;
      ctx.fillRect(0, h / 2 + (rand() - 0.5) * h * 0.5, w, 1 + rand());
    }
    const ends = ctx.createLinearGradient(0, 0, w, 0);
    ends.addColorStop(0, "rgba(120, 76, 34, 0.45)");
    ends.addColorStop(0.05, "rgba(120, 76, 34, 0)");
    ends.addColorStop(0.95, "rgba(120, 76, 34, 0)");
    ends.addColorStop(1, "rgba(120, 76, 34, 0.45)");
    ctx.fillStyle = ends;
    ctx.fillRect(0, 0, w, h);
    if (marked) {
      // The red spot, laid with a brush: a soft rim, a few drops of the same red beside it.
      const r = noise(77);
      wash(ctx, w / 2, h / 2, 62, "176, 34, 24", 0.95, r);
      ring(ctx, w / 2, h / 2, 62, 10, r, "120, 20, 14");
    }
    map.needsUpdate = true;
  };
  paint(null);
  woodPhoto("maple", (image) => paint(image));
  return map;
}

/* --------------------------------------------------------------- pieces */

/** A piece's height and radius: low enough to be stacked (업기) four high. */
export const TOKEN = { radius: 0.27, height: 0.15 };
/**
 * A turned piece, standing on y = 0: a foot, a groove cut round its waist (where a brass ring is set), a domed
 * shoulder and a flat top for its emblem.
 */
export function tokenGeometry() {
  const profile = [
    [0, 0],
    [0.238, 0],
    [0.262, 0.007],
    [0.27, 0.024],
    [0.268, 0.044],
    [0.254, 0.054],
    [0.248, 0.062],
    [0.256, 0.07],
    [0.263, 0.088],
    [0.258, 0.106],
    [0.244, 0.122],
    [0.222, 0.135],
    [0.196, 0.143],
    [0.17, 0.148],
    [0.15, 0.15],
    [0, 0.15],
  ].map(([r, y]) => new T.Vector2(r, y));
  return new T.LatheGeometry(profile, 40);
}
/**
 * The emblem inlaid in mother-of-pearl on the top of each player's pieces, so that they are told apart by shape as
 * well as colour: a cloud (청), a plum blossom (홍), bamboo leaves (녹), a crescent moon (황).
 */
export function emblemTexture(player: number) {
  const size = 256,
    { c, ctx } = canvas(size, size),
    m = size / 2;
  // Mother-of-pearl: white shot with pink and green.
  const pearl = ctx.createLinearGradient(0, 0, size, size);
  pearl.addColorStop(0, "#fdf6ef");
  pearl.addColorStop(0.35, "#f2e4f2");
  pearl.addColorStop(0.55, "#e6f5ee");
  pearl.addColorStop(0.8, "#fbf0dc");
  pearl.addColorStop(1, "#eef0fb");
  ctx.fillStyle = pearl;
  ctx.strokeStyle = pearl;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (player === 0) {
    // A cloud: three swirls on a sweeping base.
    ctx.lineWidth = 15;
    ctx.arc(m - 34, m + 6, 30, Math.PI * 0.15, Math.PI * 1.9);
    ctx.moveTo(m + 2, m - 18);
    ctx.arc(m + 16, m - 4, 26, Math.PI * 1.15, Math.PI * 2.45);
    ctx.moveTo(m - 80, m + 42);
    ctx.quadraticCurveTo(m - 10, m + 62, m + 84, m + 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(m - 34, m + 6, 9, 0, Math.PI * 2);
    ctx.arc(m + 16, m - 4, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (player === 1) {
    // A plum blossom: five round petals round a heart.
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
      ctx.moveTo(m + Math.cos(a) * 46 + 34, m + Math.sin(a) * 46);
      ctx.arc(m + Math.cos(a) * 46, m + Math.sin(a) * 46, 34, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(m, m, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + Math.PI / 5 + (k * Math.PI * 2) / 5;
      ctx.moveTo(m + Math.cos(a) * 8 + 5, m + Math.sin(a) * 8);
      ctx.arc(m + Math.cos(a) * 8, m + Math.sin(a) * 8, 5, 0, Math.PI * 2);
    }
    ctx.fill();
  } else if (player === 2) {
    // Bamboo: three leaves from one stem.
    const leaf = (angle: number, length: number) => {
      ctx.save();
      ctx.translate(m - 10, m + 40);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(length * 0.35, -20, length, 0);
      ctx.quadraticCurveTo(length * 0.35, 20, 0, 0);
      ctx.fill();
      ctx.restore();
    };
    leaf(-Math.PI * 0.62, 108);
    leaf(-Math.PI * 0.3, 96);
    leaf(-Math.PI * 0.05, 84);
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(m - 10, m + 40);
    ctx.lineTo(m - 30, m + 86);
    ctx.stroke();
  } else {
    // A crescent moon and a star beside it.
    ctx.arc(m - 6, m, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(m + 26, m - 18, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5,
        r = k % 2 ? 9 : 22;
      const x = m + 46 + Math.cos(a) * r,
        y = m + 30 + Math.sin(a) * r;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.fill();
  }
  return texture(c);
}

/* ------------------------------------------------------------------ mat */

/**
 * The straw mat (멍석): straw twisted into cords and woven so that each row leans the other way from the last,
 * a herringbone; `relief` paints the same weave as heights for a bump map.
 */
export function strawTexture(relief = false) {
  const size = 512,
    { c, ctx } = canvas(size, size),
    rand = noise(5),
    row = 16;
  ctx.fillStyle = relief ? "#606060" : "#b89a62";
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += row) {
    const lean = (y / row) % 2 ? 1 : -1;
    for (let x = -row; x < size + row; x += 7) {
      // One twist of straw: a slanted lozenge, light on its crown, dark at its ends.
      const shade = rand();
      ctx.save();
      ctx.translate(x, y + row / 2);
      ctx.transform(1, 0, lean * 0.55, 1, 0, 0);
      const g = ctx.createLinearGradient(0, -row / 2, 0, row / 2);
      if (relief) {
        g.addColorStop(0, "#303030");
        g.addColorStop(0.5, "#e0e0e0");
        g.addColorStop(1, "#303030");
      } else {
        const r = 178 + shade * 52,
          gr = 150 + shade * 46,
          b = 88 + shade * 34;
        g.addColorStop(0, `rgb(${r * 0.6}, ${gr * 0.55}, ${b * 0.5})`);
        g.addColorStop(0.45, `rgb(${r}, ${gr}, ${b})`);
        g.addColorStop(1, `rgb(${r * 0.55}, ${gr * 0.5}, ${b * 0.45})`);
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.6, row / 2 - 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // The cord between rows.
    ctx.fillStyle = relief ? "rgba(0,0,0,0.6)" : "rgba(84, 56, 22, 0.55)";
    ctx.fillRect(0, y, size, 1.6);
  }
  if (!relief)
    // Stray straws and stains.
    for (let i = 0; i < 160; i++) {
      ctx.strokeStyle = `rgba(${200 + rand() * 40}, ${170 + rand() * 40}, 90, ${0.25 + rand() * 0.3})`;
      ctx.lineWidth = 1;
      const x = rand() * size,
        y = rand() * size,
        a = rand() * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
      ctx.stroke();
    }
  const t = texture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  if (relief) t.colorSpace = T.NoColorSpace;
  return t;
}
/** The mat's straw: with its weave as relief where a graphics card draws. */
export function strawMaterial(across: number, down: number, keep: <R extends { dispose(): void }>(r: R) => R) {
  const map = keep(strawTexture());
  map.repeat.set(across, down);
  if (!capable()) return new T.MeshStandardMaterial({ map, roughness: 1 });
  const bumpMap = keep(strawTexture(true));
  bumpMap.repeat.set(across, down);
  return new T.MeshStandardMaterial({ map, bumpMap, bumpScale: 1.6, roughness: 0.95 });
}
/** A twisted straw rope for the mat's rim: a picture of the twist to lay along a tube. */
export function ropeTexture() {
  const { c, ctx } = canvas(256, 64);
  ctx.fillStyle = "#9c7a3e";
  ctx.fillRect(0, 0, 256, 64);
  for (let x = -64; x < 320; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, "#6e5226");
    g.addColorStop(0.5, "#d2b06a");
    g.addColorStop(1, "#6e5226");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + 16, 64);
    ctx.lineTo(x + 40, 0);
    ctx.lineTo(x + 24, 0);
    ctx.fill();
  }
  const t = texture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
