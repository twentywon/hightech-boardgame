import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Bridges, the old puzzle known as Hashiwokakero: islands with numbers stand on a grid of sea, and bridges are to
 * be laid between them. A bridge runs straight across or down from one island to the next it sees, with nothing
 * between; two islands are joined by at most two bridges; no bridge crosses another or passes over an island. Each
 * island ends with as many bridges as its number, and every island can be reached from every other. A puzzle is
 * grown at random from one island, a bridge at a time, and kept only when its numbers leave one answer.
 */
export interface Stage {
  size: number;
  /** How many islands the puzzle has. */
  islands: number;
  /** The share of new bridges that are laid double. */
  double: number;
  /** How many more bridges are laid, once the islands stand, between islands that see each other, as a share of the islands. */
  extra: number;
  /**
   * How many times the solver must at least try a case before the answer is found: 0 lets in puzzles that counting
   * alone solves (each island's number against what its neighbours can take); 1 asks for a step beyond, such as
   * seeing that a group would be cut off from the rest.
   */
  depth: number;
}
export const STAGES: Stage[] = [
  { size: 7, islands: 8, double: 0.35, extra: 0.15, depth: 0 },
  { size: 8, islands: 12, double: 0.3, extra: 0.2, depth: 0 },
  { size: 9, islands: 16, double: 0.3, extra: 0.25, depth: 0 },
  { size: 10, islands: 20, double: 0.25, extra: 0.25, depth: 1 },
  { size: 12, islands: 26, double: 0.25, extra: 0.3, depth: 1 },
];
export interface Island {
  cell: number;
  /** How many bridges it ends with. */
  need: number;
}
/** Two islands that see each other in a straight line with nothing between: where bridges may be laid. */
export interface Edge {
  /** The islands' cells, the left or upper one first. */
  a: number;
  b: number;
  /** Whether it runs along a row (across) rather than down a column. */
  across: boolean;
  /** The cells between the two. */
  between: number[];
  /** The edges a bridge here would cross. */
  crosses: number[];
}
export interface State {
  size: number;
  /** The islands, by cell. */
  islands: Island[];
  edges: Edge[];
  /** Bridges laid on each edge: 0, 1 or 2. */
  bridges: number[];
  /** The bridges of the answer, on each edge. */
  answer: number[];
  /** The edge changed last. */
  last: number | null;
  winner: Winner;
  ply: number;
}
const STEPS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;
/** Every pair of islands that see each other, and which pairs would cross. */
export function edgesOf(size: number, cells: number[]): Edge[] {
  const island = new Set(cells),
    edges: Edge[] = [];
  for (const a of [...cells].sort((x, y) => x - y)) {
    const r = Math.floor(a / size),
      c = a % size;
    for (const across of [true, false]) {
      const between: number[] = [];
      for (let k = 1; ; k++) {
        const y = across ? r : r + k,
          x = across ? c + k : c;
        if (y >= size || x >= size) break;
        const cell = y * size + x;
        if (island.has(cell)) {
          if (between.length) edges.push({ a, b: cell, across, between, crosses: [] });
          break;
        }
        between.push(cell);
      }
    }
  }
  edges.forEach((e, i) => {
    if (!e.across) return;
    const cells = new Set(e.between);
    edges.forEach((f, j) => {
      if (f.across || !f.between.some((cell) => cells.has(cell))) return;
      e.crosses.push(j);
      f.crosses.push(i);
    });
  });
  return edges;
}
/**
 * How many ways the numbers can be met (stopping at `cap`). Each edge holds a range of bridges, narrowed until
 * nothing more follows: an island's number against what its edges can still hold and already hold, no bridge over
 * one already laid across it, two islands that would shut themselves off together kept apart, and every island
 * still within reach of the others; then the edge at the island with the least to spare is tried each way (counted
 * in `tried`, for how hard a puzzle is).
 */
export function solutions(size: number, islands: Island[], edges: Edge[], cap = 2, tried?: { cases: number }): number {
  const n = islands.length,
    index = new Map(islands.map((island, i) => [island.cell, i])),
    need = islands.map((island) => island.need),
    ea = edges.map((e) => index.get(e.a)!),
    eb = edges.map((e) => index.get(e.b)!),
    touching: number[][] = islands.map(() => []);
  edges.forEach((_, e) => {
    touching[ea[e]].push(e);
    touching[eb[e]].push(e);
  });
  const lo = new Int8Array(edges.length),
    hi = new Int8Array(edges.length);
  edges.forEach((_, e) => {
    const a = need[ea[e]],
      b = need[eb[e]];
    hi[e] = Math.min(2, a, b);
    // A pair that would use up both their numbers on each other would be cut off from the rest.
    if (n > 2 && a === b && a <= 2) hi[e] = Math.min(hi[e], a - 1);
  });
  const reach = new Uint8Array(n),
    queue = new Int32Array(n);
  /** Whether every island can still be reached over edges that may hold a bridge. */
  const connected = (h: Int8Array) => {
    reach.fill(0);
    reach[0] = 1;
    queue[0] = 0;
    let head = 0,
      tail = 1;
    while (head < tail) {
      const i = queue[head++];
      for (const e of touching[i]) {
        if (!h[e]) continue;
        const j = ea[e] === i ? eb[e] : ea[e];
        if (!reach[j]) {
          reach[j] = 1;
          queue[tail++] = j;
        }
      }
    }
    return tail === n;
  };
  const narrow = (l: Int8Array, h: Int8Array) => {
    for (let changed = true; changed; ) {
      changed = false;
      for (let e = 0; e < edges.length; e++) {
        if (!l[e]) continue;
        for (const f of edges[e].crosses) {
          if (l[f]) return false;
          if (h[f]) {
            h[f] = 0;
            changed = true;
          }
        }
      }
      for (let i = 0; i < n; i++) {
        let low = 0,
          high = 0;
        for (const e of touching[i]) {
          low += l[e];
          high += h[e];
        }
        if (low > need[i] || high < need[i]) return false;
        if (low === high) continue;
        for (const e of touching[i]) {
          const nl = Math.max(l[e], need[i] - (high - h[e])),
            nh = Math.min(h[e], need[i] - (low - l[e]));
          if (nl > nh) return false;
          if (nl !== l[e] || nh !== h[e]) {
            low += nl - l[e];
            high += nh - h[e];
            l[e] = nl;
            h[e] = nh;
            changed = true;
          }
        }
      }
    }
    return connected(h);
  };
  let found = 0;
  const search = (l: Int8Array, h: Int8Array) => {
    if (found >= cap || !narrow(l, h)) return;
    let pick = -1,
      spare = Infinity;
    for (let i = 0; i < n; i++) {
      let low = 0,
        high = 0,
        open = -1;
      for (const e of touching[i]) {
        low += l[e];
        high += h[e];
        if (l[e] < h[e] && open < 0) open = e;
      }
      if (open >= 0 && high - need[i] < spare) {
        spare = high - need[i];
        pick = open;
      }
    }
    if (pick < 0) {
      found++;
      return;
    }
    if (tried) tried.cases++;
    for (let v = h[pick]; v >= l[pick] && found < cap; v--) {
      const l2 = l.slice(),
        h2 = h.slice();
      l2[pick] = h2[pick] = v;
      search(l2, h2);
    }
  };
  search(lo, hi);
  return found;
}
const shuffled = <X>(items: X[], random: Random) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const EMPTY = 0,
  LAND = 1,
  ACROSS = 2,
  DOWN = 3;
/**
 * Islands grown at random from one: an island is chosen, then a way, and a new island is set down a few cells off
 * along it, where the bridge to it would cross nothing and it would touch no other island; then a few more bridges
 * between islands that see each other. Null when the islands could not all be set down.
 */
function grow(size: number, want: number, stage: Stage, random: Random) {
  const n = size * size,
    grid = new Uint8Array(n),
    cells: number[] = [],
    links = new Map<string, number>(),
    key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`),
    lonely = (cell: number) => {
      const r = Math.floor(cell / size),
        c = cell % size;
      return STEPS.every(([dy, dx]) => {
        const y = r + dy,
          x = c + dx;
        return y < 0 || y >= size || x < 0 || x >= size || grid[y * size + x] !== LAND;
      });
    },
    start = Math.floor(random() * n) % n;
  grid[start] = LAND;
  cells.push(start);
  for (let tries = 0; cells.length < want && tries < want * 80; tries++) {
    const from = cells[Math.floor(random() * cells.length) % cells.length],
      [dy, dx] = STEPS[Math.floor(random() * 4) % 4],
      r = Math.floor(from / size),
      c = from % size,
      path: number[] = [],
      spots: number[] = [];
    for (let k = 1; ; k++) {
      const y = r + dy * k,
        x = c + dx * k;
      if (y < 0 || y >= size || x < 0 || x >= size) break;
      const cell = y * size + x;
      if (grid[cell] !== EMPTY) break;
      if (k >= 2 && lonely(cell)) spots.push(k);
      path.push(cell);
    }
    if (!spots.length) continue;
    // Shorter bridges are likelier, so that the islands do not all run to the edges.
    const k = spots[Math.floor(random() ** 1.6 * spots.length) % spots.length],
      to = path[k - 1];
    for (let j = 0; j < k - 1; j++) grid[path[j]] = dx ? ACROSS : DOWN;
    grid[to] = LAND;
    cells.push(to);
    links.set(key(from, to), random() < stage.double ? 2 : 1);
  }
  if (cells.length < want) return null;
  // More bridges between islands that see each other, where nothing lies across the way.
  const edges = edgesOf(size, cells);
  let extra = Math.round(want * stage.extra);
  for (const e of shuffled(edges, random)) {
    if (extra <= 0) break;
    const has = links.get(key(e.a, e.b)) ?? 0,
      mark = e.across ? ACROSS : DOWN;
    if (has === 2 || !e.between.every((cell) => grid[cell] === EMPTY || grid[cell] === mark)) continue;
    for (const cell of e.between) grid[cell] = mark;
    links.set(key(e.a, e.b), has + (has === 0 && random() < stage.double ? 2 : 1));
    extra--;
  }
  return { cells: [...cells].sort((x, y) => x - y), links, key };
}
const clampStage = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));
/**
 * A quick generator seeded once from `random`: laying a puzzle draws thousands of numbers over its attempts, and
 * the platform's secure generator is slow at that (it made the hardest stages take a tenth of a second at times).
 */
function quick(random: Random): Random {
  let s = Math.floor(random() * 4294967296) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A puzzle of a stage (1 to 5) whose numbers leave one answer, its islands spread over the whole sea. */
export function createGame(stage = 1, given: Random = cryptoRandom): State {
  const spec = STAGES[clampStage(stage) - 1],
    size = spec.size,
    random = quick(given);
  for (;;) {
    const grown = grow(size, spec.islands, spec, random);
    if (!grown) continue;
    const { cells, links, key } = grown,
      rows = cells.map((cell) => Math.floor(cell / size)),
      cols = cells.map((cell) => cell % size);
    if (Math.max(...rows) - Math.min(...rows) < size - 2 || Math.max(...cols) - Math.min(...cols) < size - 2) continue;
    const edges = edgesOf(size, cells),
      answer = edges.map((e) => links.get(key(e.a, e.b)) ?? 0),
      islands = cells.map((cell) => ({ cell, need: edges.reduce((sum, e, i) => sum + (e.a === cell || e.b === cell ? answer[i] : 0), 0) })),
      tried = { cases: 0 };
    if (solutions(size, islands, edges, 2, tried) !== 1 || tried.cases < spec.depth) continue;
    return { size, islands, edges, bridges: edges.map(() => 0), answer, last: null, winner: null, ply: 0 };
  }
}
/** The edge between two islands, either way round, or -1. */
export const edgeBetween = (state: Pick<State, "edges">, from: number, to: number) => state.edges.findIndex((e) => (e.a === from && e.b === to) || (e.a === to && e.b === from));
/** Whether a bridge on edge `e` would cross one already laid. */
export const blocked = (state: Pick<State, "edges" | "bridges">, e: number) => state.edges[e].crosses.some((f) => state.bridges[f] > 0);
/** The bridges an island has now. */
export const laid = (state: Pick<State, "edges" | "bridges">, cell: number) => state.edges.reduce((sum, e, i) => sum + (e.a === cell || e.b === cell ? state.bridges[i] : 0), 0);
/** How an island's number stands: met (green), passed (red) or still open. */
export function islandState(state: Pick<State, "edges" | "bridges" | "islands">, cell: number): "open" | "done" | "over" {
  const want = state.islands.find((island) => island.cell === cell)?.need ?? 0,
    have = laid(state, cell);
  return have > want ? "over" : have === want ? "done" : "open";
}
/** Whether the bridges laid join every island into one. */
export function joined(state: Pick<State, "edges" | "bridges" | "islands">) {
  const { islands, edges, bridges } = state;
  if (!islands.length) return true;
  const seen = new Set([islands[0].cell]),
    queue = [islands[0].cell];
  while (queue.length) {
    const cell = queue.pop()!;
    edges.forEach((e, i) => {
      if (!bridges[i] || (e.a !== cell && e.b !== cell)) return;
      const other = e.a === cell ? e.b : e.a;
      if (!seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    });
  }
  return seen.size === islands.length;
}
/** Every island at its number, and all of them joined: any such answer counts, though there is only one. */
export const solved = (state: Pick<State, "edges" | "bridges" | "islands">) => state.islands.every((island) => laid(state, island.cell) === island.need) && joined(state);
/** A hint's move sets the bridges of an edge outright. */
export const SET = 1000,
  set = (edge: number, count: number): Move => ({ from: -1, to: SET + edge * 3 + count, extra: -1 });
/** The edge and the count a set move stands for, or null for any other move. */
export const setOf = (move: Pick<Move, "from" | "to">) => (move.from === -1 && move.to >= SET ? { edge: Math.floor((move.to - SET) / 3), count: (move.to - SET) % 3 } : null);
/** Both ways round, every pair of islands that see each other, unless a bridge already laid across the way keeps the first one off. */
export const moves = (state: State): Move[] =>
  state.winner !== null
    ? []
    : state.edges.flatMap((e, i) =>
        state.bridges[i] === 0 && blocked(state, i)
          ? []
          : [
              { from: e.a, to: e.b, extra: -1 },
              { from: e.b, to: e.a, extra: -1 },
            ],
      );
/** One island and then a neighbour it sees: the bridges between them go 0 → 1 → 2 → 0. A set move (`set`) puts a count at once, for the hint. */
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1) return null;
  const setting = setOf(move);
  let edge: number, count: number;
  if (setting) {
    ({ edge, count } = setting);
    if (!Number.isInteger(edge) || edge < 0 || edge >= state.edges.length || count === state.bridges[edge]) return null;
  } else {
    edge = edgeBetween(state, move.from, move.to);
    if (edge < 0) return null;
    count = (state.bridges[edge] + 1) % 3;
  }
  if (state.bridges[edge] === 0 && count > 0 && blocked(state, edge)) return null;
  const bridges = [...state.bridges];
  bridges[edge] = count;
  const next = { ...state, bridges, last: edge, ply: state.ply + 1 };
  return { ...next, winner: solved(next) ? 0 : null };
}
/** A bridge the answer does not have is taken up; else one it has is laid. Null once solved. */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const wrong = state.bridges.findIndex((b, i) => b > state.answer[i]);
  if (wrong >= 0) return set(wrong, state.answer[wrong]);
  const missing = state.bridges.findIndex((b, i) => b < state.answer[i]);
  return missing < 0 ? null : set(missing, state.answer[missing]);
}
const effect = (): Effect | null => null;
export const bridges: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => new Array(s.size * s.size).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: () => "섬의 숫자만큼 다리를 놓기 · 두 섬 사이에는 둘까지 · 다리끼리 엇갈리지 않게 · 모든 섬을 하나로",
  tally: () => ["", ""],
  reason: () => "성공! 모든 섬을 다리로 이었습니다.",
};
