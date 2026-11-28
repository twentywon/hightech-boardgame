import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The sliding puzzle, the old fifteen puzzle and its kin: a square tray of n by n places holding n² − 1 tiles and
 * one gap. A tile in the gap's row or column slides toward the gap, and every tile between goes with it: one push,
 * however many tiles it moves, is one move. The puzzle is solved when the tiles stand in order, row by row from the
 * top left, with the gap in the bottom right corner where the missing last tile belongs.
 *
 * A puzzle is laid by sliding single tiles at random from the solved tray (never straight back), so that every
 * puzzle can be solved; the gap is then walked to its corner. The hint is the first move of a way to the end: on a
 * three by three tray the shortest way (IDA* with Manhattan distances and linear conflicts, which never overestimate);
 * on a larger tray the way people solve it, the top row and the left column first, a tile at a time and the last two
 * of a line together (each by a small breadth-first search that keeps the tiles already placed where they are), until
 * three by three is left, which is then solved the shortest way.
 */
export interface Stage {
  size: number;
  /** 0 for numbered tiles, else which picture the tiles are cut from (1 or 2). */
  picture: number;
}
export const STAGES: Stage[] = [
  { size: 3, picture: 0 },
  { size: 4, picture: 0 },
  { size: 5, picture: 0 },
  { size: 3, picture: 1 },
  { size: 4, picture: 2 },
];
export interface State {
  size: number;
  picture: number;
  stage: number;
  /** The tile at each place, row by row from the top left (1 to size² − 1); 0 is the gap. */
  tiles: number[];
  /** The tiles the last move slid, nearest the gap first, and the way they went (a step along a row or a column). */
  last: { tiles: number[]; dx: number; dz: number } | null;
  winner: Winner;
  ply: number;
}
/** The stage a variant names (1 to 5). */
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));
/** The tiles of a solved tray of `size`. */
export const solvedTiles = (size: number) => Array.from({ length: size * size }, (_, i) => (i === size * size - 1 ? 0 : i + 1));
export const isSolved = (tiles: number[]) => tiles.every((t, i) => t === (i === tiles.length - 1 ? 0 : i + 1));
/** The places beside a place (up, down, left, right), within the tray. */
function beside(size: number, cell: number) {
  const r = Math.floor(cell / size),
    c = cell % size,
    out: number[] = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
}
/** Every push there is: from a place in the gap's row or column (`from`) toward the gap (`to`). */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const n = state.size,
    gap = state.tiles.indexOf(0),
    gr = Math.floor(gap / n),
    gc = gap % n,
    out: Move[] = [];
  for (let c = 0; c < n; c++) if (c !== gc) out.push({ from: gr * n + c, to: gap, extra: -1 });
  for (let r = 0; r < n; r++) if (r !== gr) out.push({ from: r * n + gc, to: gap, extra: -1 });
  return out;
}
/** The tiles a push from `from` slides, nearest the gap first, and the step they take; null when it is no push. */
export function pushOf(state: Pick<State, "size" | "tiles">, from: number) {
  const n = state.size,
    gap = state.tiles.indexOf(0);
  if (!Number.isInteger(from) || from < 0 || from >= n * n || from === gap) return null;
  const fr = Math.floor(from / n),
    fc = from % n,
    gr = Math.floor(gap / n),
    gc = gap % n;
  if (fr !== gr && fc !== gc) return null;
  // The way the tiles go: from `from` toward the gap.
  const dx = Math.sign(gc - fc),
    dz = Math.sign(gr - fr),
    step = dz * n + dx,
    cells: number[] = [];
  for (let at = gap - step; ; at -= step) {
    cells.push(at);
    if (at === from) break;
  }
  return { cells, dx, dz, step, gap };
}
/** A push of the tile at `from` (and those between it and the gap) toward the gap `to`; null when it is not one. */
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1) return null;
  const push = pushOf(state, move.from);
  if (!push || move.to !== push.gap) return null;
  const tiles = [...state.tiles],
    slid: number[] = [];
  let into = push.gap;
  for (const cell of push.cells) {
    tiles[into] = tiles[cell];
    slid.push(tiles[cell]);
    into = cell;
  }
  tiles[move.from] = 0;
  return { ...state, tiles, last: { tiles: slid, dx: push.dx, dz: push.dz }, ply: state.ply + 1, winner: isSolved(tiles) ? 0 : null };
}
/** The sum of how far each tile stands from its place, counted along rows and columns. */
export function manhattan(tiles: number[], size: number) {
  let sum = 0;
  tiles.forEach((t, i) => {
    if (!t) return;
    const home = t - 1;
    sum += Math.abs(Math.floor(home / size) - Math.floor(i / size)) + Math.abs((home % size) - (i % size));
  });
  return sum;
}
/** How long the random walk that lays a tray is, and how far from solved (by Manhattan distance) it must end at least. */
const WALK: Record<number, { steps: number; least: number }> = {
  3: { steps: 240, least: 12 },
  4: { steps: 600, least: 30 },
  5: { steps: 1200, least: 60 },
};
/**
 * A puzzle of a stage: single tiles slid at random from the solved tray, never straight back, then the gap walked to
 * the bottom right corner. A walk that ends too near solved is walked on.
 */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const k = stageOf(stage),
    { size, picture } = STAGES[k - 1],
    walk = WALK[size] ?? { steps: size * size * 40, least: size * size * 2 },
    tiles = solvedTiles(size);
  let gap = tiles.length - 1,
    came = -1;
  const slide = (to: number) => {
    tiles[gap] = tiles[to];
    tiles[to] = 0;
    came = gap;
    gap = to;
  };
  for (let round = 0; round < 50; round++) {
    for (let s = 0; s < walk.steps; s++) {
      const ways = beside(size, gap).filter((c) => c !== came);
      slide(ways[Math.min(ways.length - 1, Math.floor(random() * ways.length))]);
    }
    // The gap goes to its corner, the place of the missing tile.
    while (gap % size < size - 1) slide(gap + 1);
    while (gap < size * (size - 1)) slide(gap + size);
    if (!isSolved(tiles) && manhattan(tiles, size) >= walk.least) break;
  }
  return { size, picture, stage: k, tiles: [...tiles], last: null, winner: null, ply: 0 };
}

/*
 * The hint.
 */
/**
 * The shortest way to solve the square of side `m` at the bottom right of a tray of `size` (all of the tray when
 * m = size), every tile outside it standing in its place: IDA* with Manhattan distances and linear conflicts. The
 * way is the places the gap moves to, one by one; null when there is none within `limit` moves.
 */
export function shortest(tiles: number[], size: number, m = size, limit = 80): number[] | null {
  const r0 = size - m,
    cells = m * m,
    // The square's own board: each tile by its place within the square, 0 for the gap; and the global place of each.
    board = new Int8Array(cells),
    global = new Int32Array(cells);
  for (let r = 0; r < m; r++)
    for (let c = 0; c < m; c++) {
      const at = (r + r0) * size + c + r0,
        t = tiles[at];
      global[r * m + c] = at;
      if (!t) board[r * m + c] = 0;
      else {
        const home = t - 1,
          hr = Math.floor(home / size) - r0,
          hc = (home % size) - r0;
        if (hr < 0 || hc < 0) return null;
        board[r * m + c] = hr * m + hc + 1;
      }
    }
  const homeRow = (t: number) => Math.floor((t - 1) / m),
    homeCol = (t: number) => (t - 1) % m;
  const estimate = () => {
    let h = 0;
    for (let i = 0; i < cells; i++) {
      const t = board[i];
      if (t) h += Math.abs(homeRow(t) - Math.floor(i / m)) + Math.abs(homeCol(t) - (i % m));
    }
    // Linear conflicts: two tiles in their own row (or column) in the wrong order each cost two more moves.
    for (let line = 0; line < m; line++) {
      for (let a = 0; a < m; a++)
        for (let b = a + 1; b < m; b++) {
          const ta = board[line * m + a],
            tb = board[line * m + b];
          if (ta && tb && homeRow(ta) === line && homeRow(tb) === line && homeCol(ta) > homeCol(tb)) h += 2;
          const ua = board[a * m + line],
            ub = board[b * m + line];
          if (ua && ub && homeCol(ua) === line && homeCol(ub) === line && homeRow(ua) > homeRow(ub)) h += 2;
        }
    }
    return h;
  };
  let gap = board.indexOf(0);
  const path: number[] = [],
    near: number[][] = Array.from({ length: cells }, (_, i) => beside(m, i));
  const FOUND = -1;
  const search = (g: number, bound: number, came: number): number => {
    const h = estimate(),
      f = g + h;
    if (f > bound) return f;
    if (h === 0) return FOUND;
    let least = Infinity;
    for (const q of near[gap]) {
      if (q === came) continue;
      const was = gap;
      board[was] = board[q];
      board[q] = 0;
      gap = q;
      path.push(q);
      const t = search(g + 1, bound, was);
      if (t === FOUND) return FOUND;
      if (t < least) least = t;
      path.pop();
      board[q] = board[was];
      board[was] = 0;
      gap = was;
    }
    return least;
  };
  let bound = estimate();
  while (bound <= limit) {
    const t = search(0, bound, -1);
    if (t === FOUND) return path.map((q) => global[q]);
    if (t === Infinity) return null;
    bound = t;
  }
  return null;
}
/**
 * The steps of the way people solve a tray larger than three by three: the places to fill, a step at a time; the
 * top row of what is left and then its left column, a tile at a time and the last two of each line together, until
 * the three by three at the bottom right is left.
 */
export function method(size: number) {
  const out: number[][] = [];
  for (let k = 0; k + 3 < size; k++) {
    for (let c = k; c < size - 2; c++) out.push([k * size + c]);
    out.push([k * size + size - 2, k * size + size - 1]);
    for (let r = k + 1; r < size - 2; r++) out.push([r * size + k]);
    out.push([(size - 2) * size + k, (size - 1) * size + k]);
  }
  return out;
}
/**
 * The first place the gap moves to on a shortest way to bring the tiles of `targets` (one or two places) home,
 * moving only through places that are not `fixed`: a breadth-first search over where the gap and those tiles stand,
 * the other tiles being alike. Null when they cannot be brought home so.
 */
export function placeStep(tiles: number[], size: number, fixed: Uint8Array, targets: number[]): number | null {
  const N = size * size,
    k = targets.length,
    want = targets.map((cell) => cell + 1),
    at = want.map((t) => tiles.indexOf(t)),
    start = tiles.indexOf(0);
  const code = (g: number, a: number, b: number) => (k === 1 ? g * N + a : (g * N + a) * N + b),
    total = N ** (k + 1),
    first = new Int16Array(total).fill(-1),
    queue = new Int32Array(total);
  const s0 = code(start, at[0], at[1] ?? 0);
  if (at.every((p, i) => p === targets[i])) return null;
  first[s0] = N; // the start: no first move yet
  let head = 0,
    tail = 0;
  queue[tail++] = s0;
  const near: number[][] = Array.from({ length: N }, (_, i) => beside(size, i).filter((q) => !fixed[q]));
  while (head < tail) {
    const s = queue[head++],
      b = k === 1 ? 0 : s % N,
      rest = k === 1 ? s : (s - b) / N,
      a = rest % N,
      g = (rest - a) / N;
    for (const q of near[g]) {
      // The gap moves to q: the tile there comes to where the gap was.
      const na = q === a ? g : a,
        nb = k === 2 && q === b ? g : b,
        ns = code(q, na, nb);
      if (first[ns] >= 0) continue;
      const move = first[s] === N ? q : first[s];
      first[ns] = move;
      if (na === targets[0] && (k === 1 || nb === targets[1])) return move;
      queue[tail++] = ns;
    }
  }
  return null;
}
/** The place the gap should move to next on the way to solving the tray, or null when it is solved. */
export function nextGap(tiles: number[], size: number): number | null {
  if (isSolved(tiles)) return null;
  if (size <= 3) return shortest(tiles, size)?.[0] ?? null;
  const fixed = new Uint8Array(size * size);
  for (const step of method(size)) {
    if (step.every((cell) => tiles[cell] === cell + 1)) {
      step.forEach((cell) => (fixed[cell] = 1));
      continue;
    }
    return placeStep(tiles, size, fixed, step);
  }
  return shortest(tiles, size, 3)?.[0] ?? null;
}
/** The hint: the tile beside the gap to slide into it next, or null when there is nothing to do. */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const q = nextGap(state.tiles, state.size);
  return q === null ? null : { from: q, to: state.tiles.indexOf(0), extra: -1 };
}
/** The move an arrow key makes: the tile beside the gap on the far side slides the way the arrow points. */
export function arrowMove(state: State, key: string): Move | null {
  if (state.winner !== null) return null;
  const n = state.size,
    gap = state.tiles.indexOf(0),
    r = Math.floor(gap / n),
    c = gap % n,
    from = key === "ArrowUp" ? (r < n - 1 ? gap + n : -1) : key === "ArrowDown" ? (r > 0 ? gap - n : -1) : key === "ArrowLeft" ? (c < n - 1 ? gap + 1 : -1) : key === "ArrowRight" ? (c > 0 ? gap - 1 : -1) : -1;
  return from < 0 ? null : { from, to: gap, extra: -1 };
}
const effect = (): Effect | null => null;
export const slide: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => new Array(s.size * s.size).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -manhattan(s.tiles, s.size),
  hint: (s) => (s.picture ? "빈칸 옆 줄의 조각을 눌러 밀어 그림을 맞추세요" : "빈칸 옆 줄의 조각을 눌러 밀어 1부터 차례로 맞추세요"),
  tally: () => ["", ""],
  reason: (s) => (s.picture ? "성공! 그림이 다 맞춰졌습니다." : "성공! 숫자가 차례대로 다 맞춰졌습니다."),
};
