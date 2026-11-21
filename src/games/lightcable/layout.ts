import type { TableSubject } from "../table/view";
import { E, N, S, W, WHITE, neighbour, opposite, sideTo, type Port } from "./rules";

/*
 * Where things lie on the workshop board, in table units, shared by the view and the browser tests (free of anything
 * Vite-only). The board of `n` × `n` cells lies flat with its middle at the table's middle; row 0 is the far side
 * (−z), column 0 the left (−x); one cell to the next is `CELL`. Round the cells runs a margin (`MARGIN`) where the
 * start reel and the exit socket stand.
 */
export const CELL = 1,
  /** The height of the board's face, where the cable lies and the pointer is followed. */
  BOARD_TOP = 0,
  MARGIN = 0.95,
  /** How thick the cable is, and so the height of its middle. */
  CABLE_R = 0.06,
  CABLE_Y = BOARD_TOP + CABLE_R,
  /** How far beyond the grid's edge the reel and the exit socket stand (their middles). */
  SOCKET_OUT = 0.5;
/** The middle of a cell. */
export function cellAt(n: number, cell: number) {
  return { x: ((cell % n) - (n - 1) / 2) * CELL, z: (Math.floor(cell / n) - (n - 1) / 2) * CELL };
}
/** The cell under a place on the board, or -1; `inner` (0 to 0.5) keeps a band along every edge that counts as no cell. */
export function cellUnder(n: number, x: number, z: number, inner = 0.5) {
  const fx = x / CELL + n / 2,
    fz = z / CELL + n / 2,
    c = Math.floor(fx),
    r = Math.floor(fz);
  if (c < 0 || r < 0 || c >= n || r >= n) return -1;
  if (Math.abs(fx - c - 0.5) > inner || Math.abs(fz - r - 0.5) > inner) return -1;
  return r * n + c;
}
/** Which way a side points on the table, x and z. */
export const WAY: Record<number, [number, number]> = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] };
/** The middle of a cell's side. */
export function sideAt(n: number, cell: number, bit: number) {
  const p = cellAt(n, cell),
    [dx, dz] = WAY[bit];
  return { x: p.x + (dx * CELL) / 2, z: p.z + (dz * CELL) / 2 };
}
/** A place outside a socket's cell, `out` beyond the grid's edge on the line through the cell's middle. */
export function outside(n: number, port: Port, out = SOCKET_OUT) {
  const p = sideAt(n, port.cell, port.bit),
    [dx, dz] = WAY[port.bit];
  return { x: p.x + dx * out, z: p.z + dz * out };
}
/** What the camera frames for a board of `n` (browser tests aim with it too): the cells, the margin and the frame. */
export function cableSubject(n: number, aspect: number): TableSubject {
  const half = (n * CELL) / 2 + MARGIN + 0.2;
  return { half: aspect < 1 ? half : half + 0.3, halfZ: half, height: 0.7, lookY: 0, tilt: 1.04 };
}
/** A point of the cable's middle line and the colour of the cable there. */
export interface CablePoint {
  x: number;
  z: number;
  tint: number;
}
/** How far apart the points of the cable's line are. */
const STEP = 0.05;
/**
 * The cable's middle line from the start reel through the cells of `path` to its end, as points close together:
 * straight through a cell it crosses, a quarter circle round the corner of a cell it turns in (so that it hugs the
 * post standing there), and to the middle of the head's cell; `plugged` (a won board with an exit) runs it on into the
 * exit socket. Each point carries the cable's colour: the colour it came in with up to the middle of a cell, the
 * colour it leaves with after (`tints`, as the rules keep them).
 */
export function cableLine(n: number, start: Port, path: number[], tints: number[], exit: Port | null = null): CablePoint[] {
  const out: CablePoint[] = [],
    line = (a: { x: number; z: number }, b: { x: number; z: number }, tint: number) => {
      const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP));
      for (let i = 1; i <= k; i++) out.push({ x: a.x + ((b.x - a.x) * i) / k, z: a.z + ((b.z - a.z) * i) / k, tint });
    };
  const reel = outside(n, start, SOCKET_OUT - 0.12);
  out.push({ ...reel, tint: WHITE });
  line(reel, sideAt(n, start.cell, start.bit), WHITE);
  path.forEach((cell, i) => {
    const from = i ? sideTo(n, cell, path[i - 1]) : start.bit,
      last = i === path.length - 1,
      to = last ? (exit ? exit.bit : 0) : sideTo(n, cell, path[i + 1]),
      arrive = i ? tints[i - 1] : WHITE,
      leave = tints[i] ?? arrive,
      a = sideAt(n, cell, from),
      middle = cellAt(n, cell);
    if (!to) {
      line(a, middle, arrive);
      return;
    }
    const b = sideAt(n, cell, to);
    if (to === opposite(from)) {
      line(a, middle, arrive);
      line(middle, b, leave);
    } else {
      // The corner both sides meet at is the curve's centre.
      const [ax, az] = WAY[from],
        [bx, bz] = WAY[to],
        cx = middle.x + ((ax + bx) * CELL) / 2,
        cz = middle.z + ((az + bz) * CELL) / 2,
        r = CELL / 2,
        t0 = Math.atan2(a.z - cz, a.x - cx);
      let turn = Math.atan2(b.z - cz, b.x - cx) - t0;
      if (turn > Math.PI) turn -= Math.PI * 2;
      if (turn < -Math.PI) turn += Math.PI * 2;
      const k = Math.max(2, Math.ceil((Math.abs(turn) * r) / STEP));
      for (let j = 1; j <= k; j++) {
        const t = t0 + (turn * j) / k;
        out.push({ x: cx + Math.cos(t) * r, z: cz + Math.sin(t) * r, tint: j <= k / 2 ? arrive : leave });
      }
    }
    if (last && exit) line(b, outside(n, exit, SOCKET_OUT - 0.18), leave);
  });
  return out;
}
/** The cell a step from `cell` through side `bit` goes into (-1 off the board), for the keyboard and tests. */
export const stepFrom = (n: number, cell: number, bit: number) => neighbour(n, cell, bit);
export const ARROWS: Record<string, number> = { ArrowUp: N, ArrowRight: E, ArrowDown: S, ArrowLeft: W };
