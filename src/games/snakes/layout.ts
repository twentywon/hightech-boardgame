import { LADDERS, SNAKES } from "./rules";

/** Where things stand on the snakes-and-ladders table; free of the page, so tests may use it. */
export const CELL = 0.8,
  BOARD_X = -0.55,
  /** The painted face of the board is at y = 0; the board is a thick slab on the garden table. */
  BOARD_THICK = 0.26,
  TABLE_Y = -BOARD_THICK,
  /** The ladders stand a little off the board on short posts: the height of their rails' tops. */
  LADDER_TOP = 0.28,
  LADDER_HALF = 0.17,
  RUNG = 0.26,
  /** A snake's thickest radius, and how flat it lies (its height over its width). */
  SNAKE_R = 0.125,
  FLAT = 0.8;
/** Centre of a square (1–100) on the board, the board's own middle at 0; 0 is the waiting place beside square 1. */
export function squareAt(square: number) {
  if (square <= 0) return { x: -5.6 * CELL, z: 4.5 * CELL };
  const row = Math.floor((square - 1) / 10),
    step = (square - 1) % 10,
    col = row % 2 ? 9 - step : step;
  return { x: (col - 4.5) * CELL, z: (4.5 - row) * CELL };
}
/** The same on the table. */
export function worldAt(square: number) {
  const p = squareAt(square);
  return { x: p.x + BOARD_X, z: p.z };
}
export interface LadderLine {
  from: number;
  to: number;
  /** The ends of the rails (a little past the two squares' centres), the way up and its length. */
  a: { x: number; z: number };
  b: { x: number; z: number };
  dir: { x: number; z: number };
  length: number;
}
const OVER = 0.22;
export function ladderLine(from: number, to: number): LadderLine {
  const p = worldAt(from),
    q = worldAt(to),
    d = Math.hypot(q.x - p.x, q.z - p.z),
    dir = { x: (q.x - p.x) / d, z: (q.z - p.z) / d };
  return {
    from,
    to,
    a: { x: p.x - dir.x * OVER, z: p.z - dir.z * OVER },
    b: { x: q.x + dir.x * OVER, z: q.z + dir.z * OVER },
    dir,
    length: d + 2 * OVER,
  };
}
export const LADDER_LINES = Object.entries(LADDERS).map(([from, to]) => ladderLine(Number(from), to));
/** The rungs a token treads climbing a ladder, from its foot square to its top square. */
export function rungsOf(line: LadderLine) {
  const out: { x: number; z: number }[] = [],
    count = Math.max(2, Math.round((line.length - 2 * OVER) / RUNG));
  for (let i = 1; i < count; i++) {
    const s = OVER + ((line.length - 2 * OVER) * i) / count;
    out.push({ x: line.a.x + line.dir.x * s, z: line.a.z + line.dir.z * s });
  }
  return out;
}
/** A snake's radius at `t` of its way from the head (0) to the tip of its tail (1): a neck, a full body, a taper. */
export const radiusAt = (t: number) => {
  const neck = t < 0.12 ? 0.8 + 0.2 * Math.sin((Math.PI / 2) * (t / 0.12)) : 1;
  return SNAKE_R * neck * (1 - 0.86 * Math.pow(t, 1.4));
};
export interface SnakePoint {
  x: number;
  z: number;
  /** How far along from the head (0) to the tail (1). */
  t: number;
  /** How high the body is raised to pass over a snake laid before it. */
  lift: number;
}
/** The middle line of a snake lying from its head square to its tail square in a few easy bends (table coordinates). */
export function snakeLine(head: number, tail: number, index: number) {
  const a = worldAt(head),
    b = worldAt(tail),
    length = Math.hypot(b.x - a.x, b.z - a.z),
    nx = -(b.z - a.z) / length,
    nz = (b.x - a.x) / length,
    bends = Math.max(2, Math.round(length / 1.25)),
    amp = Math.min(0.42, 0.18 + length * 0.05),
    count = Math.max(36, Math.ceil(length * 15)),
    sign = index % 2 ? -1 : 1,
    lo = BOARD_X - 3.85,
    hi = BOARD_X + 3.85,
    points: SnakePoint[] = [];
  for (let k = 0; k <= count; k++) {
    const t = k / count,
      sway = sign * Math.sin(t * Math.PI * bends) * amp * Math.pow(Math.sin(Math.PI * t), 0.55),
      x = a.x + (b.x - a.x) * t + nx * sway,
      z = a.z + (b.z - a.z) * t + nz * sway;
    points.push({ x: Math.min(hi, Math.max(lo, x)), z: Math.min(3.85, Math.max(-3.85, z)), t, lift: 0 });
  }
  return points;
}
/** Lays each snake over those laid before it where they cross: its body rises smoothly over theirs. */
function crossings(lines: SnakePoint[][]) {
  lines.forEach((line, i) => {
    const need = line.map((p) => {
      const r = radiusAt(p.t);
      let lift = 0;
      for (let j = 0; j < i; j++)
        for (const q of lines[j]) {
          const rq = radiusAt(q.t),
            gap = r + rq + 0.16 - Math.hypot(p.x - q.x, p.z - q.z);
          if (gap > 0) lift = Math.max(lift, (2 * rq * FLAT + q.lift) * Math.min(1, gap / 0.16));
        }
      return lift;
    });
    // Spread each rise along the body so that it climbs over gently.
    const reach = 7;
    line.forEach((p, k) => {
      let sum = 0;
      for (let d = -reach; d <= reach; d++) {
        let top = 0;
        for (let e = -reach; e <= reach; e++) top = Math.max(top, need[Math.min(line.length - 1, Math.max(0, k + d + e))] ?? 0);
        sum += top;
      }
      p.lift = sum / (2 * reach + 1);
    });
  });
  return lines;
}
const laid = crossings(Object.entries(SNAKES).map(([head, tail], i) => snakeLine(Number(head), tail, i)));
export const SNAKE_LINES = Object.entries(SNAKES).map(([head, tail], i) => ({ head: Number(head), tail, points: laid[i] }));
/** How high a token stands on a square: on the board, or on a ladder's rails or a snake's back that lie across it. */
export function restHeight(square: number) {
  if (square <= 0) return TABLE_Y;
  const p = worldAt(square);
  let h = 0;
  for (const l of LADDER_LINES) {
    const rx = p.x - l.a.x,
      rz = p.z - l.a.z,
      along = rx * l.dir.x + rz * l.dir.z,
      across = Math.abs(rx * l.dir.z - rz * l.dir.x);
    if (along > -0.05 && along < l.length + 0.05 && across < LADDER_HALF + 0.14) h = Math.max(h, LADDER_TOP);
  }
  for (const s of SNAKE_LINES)
    for (const q of s.points) {
      const r = radiusAt(q.t);
      if (Math.hypot(q.x - p.x, q.z - p.z) < r + 0.1) h = Math.max(h, q.t < 0.04 ? 0.18 : 2 * r * FLAT + q.lift);
    }
  return h;
}
