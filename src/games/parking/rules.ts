import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Parking escape, an old sliding-block puzzle: a lot of six by six squares crowded with cars two squares long and
 * trucks three long, each lying across or along the lot. A vehicle slides only along its own length, as far as the
 * squares before it are free; one slide, however long, is one move. The red car lies across the third row and has
 * to leave through the gate in the right edge of that row.
 *
 * A puzzle is laid at random: the red car and other vehicles are set down, every arrangement their slides can
 * reach is explored (slides go both ways, so this is one connected family), the fewest moves from each to a way
 * out are counted backwards from every arrangement where the red car stands at the gate, and the start is taken
 * among those whose count lies in the stage's band. Every puzzle can therefore be solved, in exactly `best` moves.
 */
export const SIZE = 6,
  CELLS = SIZE * SIZE,
  /** The squares of the top three rows, kept in one word of bits by the search, and those of the bottom three in another. */
  HALF = CELLS / 2,
  /** The row the red car lies on and leaves by. */
  EXIT_ROW = 2,
  /** The column of the red car's left end once it has reached the gate. */
  OUT_COL = SIZE - 2,
  /** How many paints there are; 0 is the red car's own, the others are shared out among the rest. */
  PAINTS = 11;
export interface Vehicle {
  /** The top-left square it covers (row × 6 + column). */
  anchor: number;
  /** 2 for a car, 3 for a truck. */
  length: number;
  horizontal: boolean;
  /** Its paint: 0 for the red car, 1 to `PAINTS` − 1 for the others. */
  color: number;
  red: boolean;
}
export interface Stage {
  /** The fewest moves a puzzle of the stage needs, from `lo` to `hi`. */
  lo: number;
  hi: number;
}
/** The stages, as bands of the fewest moves (the last is open above: its puzzles start at the farthest arrangement of their family). */
export const STAGES: Stage[] = [
  { lo: 4, hi: 7 },
  { lo: 8, hi: 12 },
  { lo: 13, hi: 18 },
  { lo: 19, hi: 99 },
];
export interface State {
  /** The red car first. */
  vehicles: Vehicle[];
  /** The fewest moves the puzzle needed as it was laid. */
  best: number;
  /** The vehicle moved last, for the table to animate. */
  last: number | null;
  winner: Winner;
  ply: number;
  stage: number;
}
/** The squares a vehicle covers. */
export const cellsOf = (v: Pick<Vehicle, "anchor" | "length" | "horizontal">) => Array.from({ length: v.length }, (_, k) => v.anchor + k * (v.horizontal ? 1 : SIZE));
/** Which vehicle stands on each square (-1 where none does). */
export function occupancy(state: Pick<State, "vehicles">) {
  const grid = new Array<number>(CELLS).fill(-1);
  state.vehicles.forEach((v, i) => cellsOf(v).forEach((c) => (grid[c] = i)));
  return grid;
}
/** The vehicle standing on a square, or -1. */
export const vehicleAt = (state: Pick<State, "vehicles">, cell: number) => state.vehicles.findIndex((v) => cellsOf(v).includes(cell));
/** How far a vehicle can go: the lowest and highest anchor it can slide to, along its own line. */
export function reach(state: Pick<State, "vehicles">, index: number, grid = occupancy(state)) {
  const v = state.vehicles[index],
    step = v.horizontal ? 1 : SIZE,
    at = v.horizontal ? v.anchor % SIZE : Math.floor(v.anchor / SIZE);
  let lo = at,
    hi = at;
  while (lo > 0 && grid[v.anchor - (at - lo + 1) * step] < 0) lo--;
  while (hi + v.length < SIZE && grid[v.anchor + (hi - at + v.length) * step] < 0) hi++;
  const anchorOf = (p: number) => v.anchor + (p - at) * step;
  return { lo: anchorOf(lo), hi: anchorOf(hi), step };
}
const solvedBy = (vehicles: Vehicle[]) => vehicles[0].anchor % SIZE === OUT_COL;
/** Every slide there is: `from` the vehicle's anchor, `to` the anchor it would have, `extra` -1. */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const grid = occupancy(state),
    out: Move[] = [];
  state.vehicles.forEach((v, i) => {
    const { lo, hi, step } = reach(state, i, grid);
    for (let to = lo; to <= hi; to += step) if (to !== v.anchor) out.push({ from: v.anchor, to, extra: -1 });
  });
  return out;
}
/** A slide of the vehicle whose anchor is `from` to the anchor `to`, along its own line, over free squares only; else null. */
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1 || !Number.isInteger(move.to) || move.to < 0 || move.to >= CELLS || move.to === move.from) return null;
  const index = state.vehicles.findIndex((v) => v.anchor === move.from);
  if (index < 0) return null;
  const v = state.vehicles[index],
    { lo, hi, step } = reach(state, index);
  // Along its own line: the same row for a car lying across, the same column for one lying along.
  if (v.horizontal ? Math.floor(move.to / SIZE) !== Math.floor(v.anchor / SIZE) : move.to % SIZE !== v.anchor % SIZE) return null;
  if (move.to < lo || move.to > hi || (move.to - lo) % step) return null;
  const vehicles = state.vehicles.map((w, i) => (i === index ? { ...w, anchor: move.to } : w));
  return { ...state, vehicles, last: index, ply: state.ply + 1, winner: solvedBy(vehicles) ? 0 : null };
}

/*
 * The search. A family of arrangements shares its vehicles (their lengths, which way they lie, and the line each
 * lies on); an arrangement is then only where each stands along its line, kept as one byte a vehicle.
 */
interface Layout {
  n: number;
  len: Uint8Array;
  horiz: Uint8Array;
  /** The row a vehicle lying across is on, or the column of one lying along. */
  line: Uint8Array;
}
const MULT = Array.from({ length: 24 }, (_, i) => 5 ** i);
/** One number for an arrangement (each place is below five). */
const encode = (pos: ArrayLike<number>, n: number, base = 0) => {
  let code = 0;
  for (let i = 0; i < n; i++) code += pos[base + i] * MULT[i];
  return code;
};
const square = (layout: Layout, i: number, p: number) => (layout.horiz[i] ? layout.line[i] * SIZE + p : p * SIZE + layout.line[i]);
/**
 * The arrangements a walk has met, by their number: a table of open addressing kept for the whole page and
 * cleared by a new stamp, since a lot is explored many times over while a puzzle is laid.
 */
const table = { bits: 16, keys: new Float64Array(1 << 16), vals: new Int32Array(1 << 16), marks: new Uint32Array(1 << 16), now: 0 };
interface Walk {
  count: number;
  /** Each arrangement's places, `n` bytes apiece, in the order they were found. */
  pool: Uint8Array;
  /** Where each was reached from, and which vehicle slid (for a walk that looks for the way out). */
  parent: Int32Array;
  via: Uint8Array;
  /** The slides between arrangements, those of `j` at `edges[offsets[j]]` up to `offsets[j + 1]` (for a walk that keeps them). */
  offsets: Int32Array;
  edges: Int32Array;
  /** The first arrangement found with the red car at the gate, or -1. */
  goal: number;
  overflow: boolean;
}
/**
 * A walk outward from `start` over every slide, breadth first: it keeps the slides between arrangements when
 * `linked`, and stops at the first way out when `stop`; at more than `cap` arrangements it gives up (`overflow`).
 * It is the hot loop of laying a puzzle, so everything in it is kept in plain local numbers and typed arrays.
 */
function walk(layout: Layout, start: Uint8Array, cap: number, linked: boolean, stop: boolean): Walk {
  const { n, len, horiz } = layout,
    // The slides of one arrangement: vehicle × 8 + the place it slides to.
    slid = new Int32Array(64),
    // The square at each place along a vehicle's line, and the squares it covers standing there, as bits of two
    // words: the squares of the top three rows in one, those of the bottom three in the other.
    cellOf = new Int32Array(n * SIZE),
    footLo = new Int32Array(n * SIZE),
    footHi = new Int32Array(n * SIZE);
  for (let i = 0; i < n; i++)
    for (let p = 0; p < SIZE; p++) {
      cellOf[i * SIZE + p] = square(layout, i, p);
      if (p + len[i] > SIZE) continue;
      for (let k = 0; k < len[i]; k++) {
        const c = square(layout, i, p + k);
        if (c < HALF) footLo[i * SIZE + p] |= 1 << c;
        else footHi[i * SIZE + p] |= 1 << (c - HALF);
      }
    }
  let room = 1024,
    pool = new Uint8Array(room * n),
    codes = new Float64Array(room),
    occLo = new Int32Array(room),
    occHi = new Int32Array(room),
    parent = new Int32Array(stop ? room : 0),
    via = new Uint8Array(stop ? room : 0),
    offsets = new Int32Array(linked ? room + 1 : 0),
    edges = new Int32Array(linked ? room * 8 : 0),
    edgeCount = 0,
    count = 1,
    goal = -1,
    overflow = false;
  // The table of arrangements met: cleared by a new stamp, grown when it is half full.
  if (++table.now === 0xffffffff) {
    table.marks.fill(0);
    table.now = 1;
  }
  let { bits, keys, vals, marks } = table,
    mask = (1 << bits) - 1,
    shift = 32 - bits,
    size = 0;
  const now = table.now;
  const enter = (key: number, value: number) => {
    let h = Math.imul((key >>> 0) ^ Math.imul((key * 2.3283064365386963e-10) | 0, 0x27d4eb2d), 0x9e3779b1) >>> shift;
    while (marks[h] === now) h = (h + 1) & mask;
    marks[h] = now;
    keys[h] = key;
    vals[h] = value;
  };
  pool.set(start.subarray(0, n));
  codes[0] = encode(start, n);
  for (let i = 0; i < n; i++) {
    occLo[0] |= footLo[i * SIZE + start[i]];
    occHi[0] |= footHi[i * SIZE + start[i]];
  }
  enter(codes[0], 0);
  size = 1;
  if (stop) parent[0] = -1;
  const done = () => ({ count, pool: pool.subarray(0, count * n), parent, via, offsets, edges, goal, overflow });
  if (horiz[0] && start[0] === OUT_COL) {
    goal = 0;
    if (stop) return done();
  }
  outer: for (let head = 0; head < count; head++) {
    const base = head * n,
      code = codes[head],
      lo = occLo[head],
      hi = occHi[head];
    let m = 0;
    for (let i = 0; i < n; i++) {
      const p = pool[base + i],
        l = len[i],
        at = i * SIZE;
      for (let q = p - 1; q >= 0; q--) {
        const c = cellOf[at + q];
        if (c < HALF ? (lo >>> c) & 1 : (hi >>> (c - HALF)) & 1) break;
        slid[m++] = i * 8 + q;
      }
      for (let q = p + l; q < SIZE; q++) {
        const c = cellOf[at + q];
        if (c < HALF ? (lo >>> c) & 1 : (hi >>> (c - HALF)) & 1) break;
        slid[m++] = i * 8 + q - l + 1;
      }
    }
    if (linked) {
      offsets[head] = edgeCount;
      if (edgeCount + m > edges.length) {
        const e = new Int32Array(edges.length * 2 + m);
        e.set(edges);
        edges = e;
      }
    }
    for (let s = 0; s < m; s++) {
      const i = slid[s] >> 3,
        to = slid[s] & 7,
        next = code + (to - pool[base + i]) * MULT[i];
      let h = Math.imul((next >>> 0) ^ Math.imul((next * 2.3283064365386963e-10) | 0, 0x27d4eb2d), 0x9e3779b1) >>> shift;
      while (marks[h] === now && keys[h] !== next) h = (h + 1) & mask;
      let j: number;
      if (marks[h] === now) j = vals[h];
      else {
        if (count >= cap) {
          overflow = true;
          break outer;
        }
        j = count++;
        if (count > room) {
          room *= 2;
          const bigger = new Uint8Array(room * n);
          bigger.set(pool);
          pool = bigger;
          const moreCodes = new Float64Array(room),
            moreLo = new Int32Array(room),
            moreHi = new Int32Array(room);
          moreCodes.set(codes);
          moreLo.set(occLo);
          moreHi.set(occHi);
          codes = moreCodes;
          occLo = moreLo;
          occHi = moreHi;
          if (stop) {
            const p = new Int32Array(room),
              v = new Uint8Array(room);
            p.set(parent);
            v.set(via);
            parent = p;
            via = v;
          }
          if (linked) {
            const o = new Int32Array(room + 1);
            o.set(offsets);
            offsets = o;
          }
        }
        const at = j * n;
        for (let k = 0; k < n; k++) pool[at + k] = pool[base + k];
        pool[at + i] = to;
        codes[j] = next;
        const was = i * SIZE + pool[base + i],
          now2 = i * SIZE + to;
        occLo[j] = lo ^ footLo[was] ^ footLo[now2];
        occHi[j] = hi ^ footHi[was] ^ footHi[now2];
        marks[h] = now;
        keys[h] = next;
        vals[h] = j;
        if (++size * 2 > mask) {
          // Half full: a table twice the size, kept for the next walks too.
          table.bits = bits = bits + 1;
          table.keys = keys = new Float64Array(1 << bits);
          table.vals = vals = new Int32Array(1 << bits);
          table.marks = marks = new Uint32Array(1 << bits);
          table.now = now;
          mask = (1 << bits) - 1;
          shift = 32 - bits;
          for (let k = 0; k < count; k++) enter(codes[k], k);
        }
        if (stop) {
          parent[j] = head;
          via[j] = i;
          if (i === 0 && to === OUT_COL) {
            goal = j;
            break outer;
          }
        }
      }
      if (linked) edges[edgeCount++] = j;
    }
  }
  if (linked) offsets[count] = edgeCount;
  return done();
}
interface Family {
  layout: Layout;
  count: number;
  pool: Uint8Array;
  /** The fewest moves from each arrangement to the red car at the gate. */
  dist: Int16Array;
  far: number;
}
/**
 * Every arrangement the slides reach from `start`, and how far each is from a way out; null when there are more
 * than `cap` of them (a lot so empty is no puzzle) or the red car can never reach the gate.
 */
function explore(layout: Layout, start: Uint8Array, cap: number): Family | null {
  const { count, pool, offsets, edges, overflow } = walk(layout, start, cap, true, false),
    n = layout.n;
  if (overflow) return null;
  // Backwards from every arrangement with the red car at the gate (slides go both ways).
  const dist = new Int16Array(count).fill(-1),
    queue = new Int32Array(count);
  let tail = 0;
  for (let j = 0; j < count; j++)
    if (pool[j * n] === OUT_COL) {
      dist[j] = 0;
      queue[tail++] = j;
    }
  if (!tail) return null;
  let far = 0;
  for (let head = 0; head < tail; head++) {
    const j = queue[head],
      d = dist[j] + 1;
    for (let e = offsets[j]; e < offsets[j + 1]; e++) {
      const k = edges[e];
      if (dist[k] >= 0) continue;
      dist[k] = d;
      far = d;
      queue[tail++] = k;
    }
  }
  return { layout, count, pool, dist, far };
}
/** The layout and places of a state's vehicles. */
function layoutOf(state: Pick<State, "vehicles">) {
  const n = state.vehicles.length,
    layout: Layout = { n, len: new Uint8Array(n), horiz: new Uint8Array(n), line: new Uint8Array(n) },
    pos = new Uint8Array(n);
  state.vehicles.forEach((v, i) => {
    const r = Math.floor(v.anchor / SIZE),
      c = v.anchor % SIZE;
    layout.len[i] = v.length;
    layout.horiz[i] = v.horizontal ? 1 : 0;
    layout.line[i] = v.horizontal ? r : c;
    pos[i] = v.horizontal ? c : r;
  });
  return { layout, pos };
}
const anchorOf = (layout: Layout, i: number, p: number) => square(layout, i, p);
const pick = <X>(items: X[], random: Random) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
/** A random arrangement: the red car on its row and up to `count` other vehicles, `trucks` of them trucks. */
function scatter(count: number, trucks: number, random: Random) {
  const len: number[] = [2],
    horiz: number[] = [1],
    line: number[] = [EXIT_ROW],
    pos: number[] = [Math.floor(random() * 3)],
    grid = new Int8Array(CELLS).fill(-1);
  grid[EXIT_ROW * SIZE + pos[0]] = grid[EXIT_ROW * SIZE + pos[0] + 1] = 0;
  for (let k = 0; k < count; k++)
    for (let tries = 0; tries < 40; tries++) {
      const l = k < trucks ? 3 : 2,
        h = random() < 0.5 ? 1 : 0,
        ln = Math.floor(random() * SIZE),
        p = Math.floor(random() * (SIZE - l + 1));
      // Nothing else lies across the red car's row: it could never get out of the red car's way.
      if (h && ln === EXIT_ROW) continue;
      const cells = Array.from({ length: l }, (_, j) => (h ? ln * SIZE + p + j : (p + j) * SIZE + ln));
      if (cells.some((c) => grid[c] >= 0)) continue;
      cells.forEach((c) => (grid[c] = len.length));
      len.push(l);
      horiz.push(h);
      line.push(ln);
      pos.push(p);
      break;
    }
  const n = len.length;
  return { layout: { n, len: Uint8Array.from(len), horiz: Uint8Array.from(horiz), line: Uint8Array.from(line) } as Layout, pos: Uint8Array.from(pos) };
}
/** The farthest arrangements of a family, one of them at random. */
function farthest(family: Family, random: Random) {
  const at: number[] = [];
  for (let j = 0; j < family.count; j++) if (family.dist[j] === family.far) at.push(j);
  return pick(at, random);
}
/**
 * Whether a lot can be seen at a glance to have no way out: a column the red car has to pass whose upright vehicles
 * (which never leave their column, nor pass one another) cannot all stand clear of its row at once, above it in two
 * squares or below it in three. It costs nothing next to a search, and turns away about a quarter of the lots laid.
 */
function hopeless(layout: Layout, pos: Uint8Array) {
  for (let c = pos[0] + 2; c < SIZE; c++) {
    const column: { at: number; len: number }[] = [];
    for (let i = 1; i < layout.n; i++) if (!layout.horiz[i] && layout.line[i] === c) column.push({ at: pos[i], len: layout.len[i] });
    if (!column.length) continue;
    column.sort((a, b) => a.at - b.at);
    let clear = false;
    for (let k = 0; k <= column.length && !clear; k++) {
      const above = column.slice(0, k).reduce((sum, v) => sum + v.len, 0),
        below = column.slice(k).reduce((sum, v) => sum + v.len, 0);
      clear = above <= EXIT_ROW && below <= SIZE - EXIT_ROW - 1;
    }
    if (!clear) return true;
  }
  return false;
}
const shuffled = <X>(items: X[], random: Random) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
/** The state of an arrangement of a family, painted. */
function stateOf(family: Family, j: number, stage: number, random: Random): State {
  const { layout } = family,
    n = layout.n,
    paints = shuffled(Array.from({ length: PAINTS - 1 }, (_, k) => k + 1), random),
    vehicles: Vehicle[] = [];
  for (let i = 0; i < n; i++)
    vehicles.push({ anchor: anchorOf(layout, i, family.pool[j * n + i]), length: layout.len[i], horizontal: !!layout.horiz[i], color: i ? paints[(i - 1) % paints.length] : 0, red: i === 0 });
  return { vehicles, best: family.dist[j], last: null, winner: null, ply: 0, stage };
}
/** The stage a variant names (1 to 4). */
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));
/**
 * How lots are laid for each stage: how many vehicles beside the red car (at least, and how many more at most),
 * and how many of them trucks. Fuller lots give deeper puzzles and are quicker to search; three trucks among
 * fifteen vehicles gave the most puzzles of nineteen moves or more for the time spent.
 */
const LOTS = [
  { count: 8, more: 4, trucks: 1, moreTrucks: 2 },
  { count: 11, more: 3, trucks: 2, moreTrucks: 1 },
  { count: 13, more: 3, trucks: 2, moreTrucks: 1 },
  { count: 14, more: 2, trucks: 3, moreTrucks: 0 },
];
/** At most so many arrangements in a family: a lot that leaves more is too open to make a good puzzle quickly. */
const CAP = 12000;
/**
 * A puzzle of a stage whose fewest moves lie in the stage's band: lots are laid at random until one's family
 * reaches the band; the last stage then takes the farthest arrangement, the others one at a count of moves drawn
 * from those the band and the family share.
 */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const k = stageOf(stage),
    { lo, hi } = STAGES[k - 1],
    lot = LOTS[k - 1],
    last = k === STAGES.length;
  for (;;) {
    const { layout, pos } = scatter(lot.count + Math.floor(random() * (lot.more + 1)), lot.trucks + Math.floor(random() * (lot.moreTrucks + 1)), random);
    if (hopeless(layout, pos)) continue;
    const family = explore(layout, pos, CAP);
    if (!family || family.far < lo) continue;
    if (last) return stateOf(family, farthest(family, random), k, random);
    // A count of moves within the band, and then an arrangement at that count, so that the band is spread evenly.
    const counts = new Set<number>();
    for (let j = 0; j < family.count; j++) if (family.dist[j] >= lo && family.dist[j] <= hi) counts.add(family.dist[j]);
    if (!counts.size) continue;
    const want = pick([...counts], random),
      at: number[] = [];
    for (let j = 0; j < family.count; j++) if (family.dist[j] === want) at.push(j);
    return stateOf(family, pick(at, random), k, random);
  }
}
/** The shortest way out from a state, as its moves (empty when it is solved, null when there is none). */
export function solve(state: State): Move[] | null {
  if (state.winner !== null) return [];
  const { layout, pos } = layoutOf(state),
    n = layout.n,
    { pool, parent, via, goal } = walk(layout, pos, 2_000_000, false, true);
  if (goal < 0) return null;
  const path: Move[] = [];
  for (let j = goal; parent[j] >= 0; j = parent[j]) {
    const i = via[j],
      before = parent[j];
    path.push({ from: anchorOf(layout, i, pool[before * n + i]), to: anchorOf(layout, i, pool[j * n + i]), extra: -1 });
  }
  return path.reverse();
}
/** The first move of a shortest way out, or null when there is none to make. */
export function hint(state: State): Move | null {
  return solve(state)?.[0] ?? null;
}
/** The fewest moves still needed (-1 when there is no way out). */
export const distance = (state: State) => {
  const path = solve(state);
  return path ? path.length : -1;
};
const effect = (): Effect | null => null;
export const parking: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => new Array(CELLS).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: () => "차는 앞뒤로만 밀립니다 · 빨간 차를 오른쪽 출구로 빼내세요",
  tally: () => ["", ""],
  reason: () => "성공! 빨간 차가 주차장을 빠져나갔습니다.",
};
