import type { TableSubject } from "../table/view";
import { E, N, S, W, neighbour, opposite, type Port } from "./rules";

/**
 * Where things lie on the baseboard, shared by the view and the browser tests (free of anything Vite-only): a cell's
 * side, the height of the cells' tops (where the rails are laid and the pointer is followed), the margin on the left
 * and at the bottom where the tunnel and the station stand, and the margin at the top and the right for the numbers.
 */
export const CELL = 0.86,
  TILE_TOP = 0.16,
  PORT_MARGIN = 1.45,
  CLUE_MARGIN = 0.78;
/** The grid's middle is shifted so that the whole baseboard, both margins included, is centred. */
const SHIFT = (PORT_MARGIN - CLUE_MARGIN) / 2;
/** The centre of a cell. */
export function cellAt(size: number, index: number) {
  const r = Math.floor(index / size),
    c = index % size;
  return { x: (c - (size - 1) / 2) * CELL + SHIFT, z: (r - (size - 1) / 2) * CELL - SHIFT };
}
/** The grid's edges: left, right, top (far) and bottom (near). */
export function gridBox(size: number) {
  const half = (size * CELL) / 2;
  return { left: -half + SHIFT, right: half + SHIFT, top: -half - SHIFT, bottom: half - SHIFT };
}
/** The baseboard's edges, margins included. */
export function boardBox(size: number) {
  const g = gridBox(size);
  return { left: g.left - PORT_MARGIN, right: g.right + CLUE_MARGIN, top: g.top - CLUE_MARGIN, bottom: g.bottom + PORT_MARGIN };
}
/** Which way a side points on the table, x and z. */
export const WAY: Record<number, [number, number]> = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] };
/** The middle of a cell's side. */
export function sideAt(size: number, cell: number, bit: number) {
  const p = cellAt(size, cell),
    [dx, dz] = WAY[bit];
  return { x: p.x + (dx * CELL) / 2, z: p.z + (dz * CELL) / 2 };
}
/** The cell under a place on the table, or -1; `inner` (0 to 0.5) keeps a band along every edge that counts as no cell. */
export function cellUnder(size: number, x: number, z: number, inner = 0.5) {
  const g = gridBox(size),
    fx = (x - g.left) / CELL,
    fz = (z - g.top) / CELL,
    c = Math.floor(fx),
    r = Math.floor(fz);
  if (c < 0 || r < 0 || c >= size || r >= size) return -1;
  if (Math.abs(fx - c - 0.5) > inner || Math.abs(fz - r - 0.5) > inner) return -1;
  return r * size + c;
}
/** Where the number of row `i` (beside the right edge) or of column `i` (over the top edge) lies. */
export function clueAt(size: number, kind: "row" | "col", i: number) {
  const g = gridBox(size),
    along = (i - (size - 1) / 2) * CELL;
  return kind === "row" ? { x: g.right + CLUE_MARGIN * 0.5, z: along - SHIFT } : { x: along + SHIFT, z: g.top - CLUE_MARGIN * 0.5 };
}
/** A place outside a port, `out` beyond the grid's edge on the line of its rails. */
export function outside(size: number, port: Port, out: number) {
  const p = sideAt(size, port.cell, port.bit),
    [dx, dz] = WAY[port.bit];
  return { x: p.x + dx * out, z: p.z + dz * out };
}
/** How far beyond the grid the train waits in the tunnel, and where it stops at the station. */
export const TUNNEL_DEPTH = 1.2,
  STATION_STOP = 0.92;
/** What the camera frames for a board of `size` (browser tests aim with it too). */
export function tracksSubject(size: number, aspect: number): TableSubject {
  const b = boardBox(size),
    half = (b.right - b.left) / 2 + 0.1;
  return { half: aspect < 1 ? half : half + 0.35, halfZ: (b.bottom - b.top) / 2 + 0.1, height: 0.55, lookY: 0.05, tilt: 1.12 };
}
/**
 * The middle line of the railway from inside the tunnel (outside the entrance) to the station (outside the exit),
 * as points close together: straight through a straight cell, a quarter circle round the corner a curve turns
 * about. Null while the railway is not whole.
 */
export function trainLine(size: number, links: number[], ports: [Port, Port], step = 0.05) {
  const points: { x: number; z: number }[] = [],
    line = (a: { x: number; z: number }, b: { x: number; z: number }) => {
      const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
      for (let i = 1; i <= k; i++) points.push({ x: a.x + ((b.x - a.x) * i) / k, z: a.z + ((b.z - a.z) * i) / k });
    };
  const start = outside(size, ports[0], TUNNEL_DEPTH);
  points.push(start);
  line(start, sideAt(size, ports[0].cell, ports[0].bit));
  let cell = ports[0].cell,
    from = ports[0].bit;
  for (let guard = 0; guard <= links.length; guard++) {
    const on = links[cell] & ~from;
    if (!(links[cell] & from) || !on || on & (on - 1)) return null;
    const a = sideAt(size, cell, from),
      b = sideAt(size, cell, on);
    if (on === opposite(from)) line(a, b);
    else {
      // The corner both sides meet at is the curve's centre.
      const p = cellAt(size, cell),
        [ax, az] = WAY[from],
        [bx, bz] = WAY[on],
        cx = p.x + ((ax + bx) * CELL) / 2,
        cz = p.z + ((az + bz) * CELL) / 2,
        r = CELL / 2,
        t0 = Math.atan2(a.z - cz, a.x - cx);
      let t1 = Math.atan2(b.z - cz, b.x - cx),
        turn = t1 - t0;
      if (turn > Math.PI) turn -= Math.PI * 2;
      if (turn < -Math.PI) turn += Math.PI * 2;
      t1 = t0 + turn;
      const k = Math.ceil((Math.abs(turn) * r) / step);
      for (let i = 1; i <= k; i++) {
        const t = t0 + (turn * i) / k;
        points.push({ x: cx + Math.cos(t) * r, z: cz + Math.sin(t) * r });
      }
    }
    if (cell === ports[1].cell && on === ports[1].bit) {
      line(b, outside(size, ports[1], STATION_STOP));
      return points;
    }
    const next = neighbour(size, cell, on);
    if (next < 0) return null;
    cell = next;
    from = opposite(on);
  }
  return null;
}
