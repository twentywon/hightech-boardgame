import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The building puzzle, an old logic puzzle (also known as Skyscrapers). An
 * n × n city block takes one building on every plot, 1 to n storeys tall,
 * each height once in every row and every column. A number at the edge says
 * how many buildings are seen looking in from there: a taller one hides
 * every lower one behind it. A puzzle is laid from a random answer, and as
 * many numbers are taken away as the stage asks while the answer stays the
 * only one; a few buildings are put up from the start where the numbers
 * alone do not settle it.
 */
export interface Stage {
  size: number;
  /** The share of the edge's numbers to keep at least (1 keeps them all). */
  keep: number;
}
export const STAGES: Stage[] = [
  { size: 4, keep: 1 },
  { size: 4, keep: 0.5 },
  { size: 5, keep: 0.8 },
  { size: 5, keep: 0.45 },
  { size: 6, keep: 0.6 },
];
export interface State {
  size: number;
  /** Storeys on each plot (0 where nothing is built yet). */
  cells: number[];
  /** Buildings standing from the start, which stay. */
  fixed: boolean[];
  answer: number[];
  /** The numbers round the edge, 0 where none is given: top (left to right), right (top to bottom), bottom (left to right), left (top to bottom). */
  clues: number[];
  last: number | null;
  winner: Winner;
  ply: number;
}
/** The plots that line `k` of the 4n round the edge looks along, nearest first. */
export function line(size: number, k: number): number[] {
  const side = Math.floor(k / size),
    i = k % size;
  return Array.from({ length: size }, (_, j) =>
    side === 0 ? j * size + i : side === 1 ? i * size + (size - 1 - j) : side === 2 ? (size - 1 - j) * size + i : i * size + j,
  );
}
/** How many of a row of heights are seen from its first end (empty plots hide nothing and are not seen). */
export function visible(heights: number[]) {
  let tallest = 0,
    seen = 0;
  for (const h of heights)
    if (h > tallest) {
      tallest = h;
      seen++;
    }
  return seen;
}
/** Every ordering of 1..n, made once a size. */
const orderings = new Map<number, number[][]>();
function permutations(n: number) {
  let all = orderings.get(n);
  if (!all) {
    all = [];
    const walk = (row: number[], left: number[]) => {
      if (!left.length) all!.push(row);
      left.forEach((h, i) => walk([...row, h], [...left.slice(0, i), ...left.slice(i + 1)]));
    };
    walk([], Array.from({ length: n }, (_, i) => i + 1));
    orderings.set(n, all);
  }
  return all;
}
/** The orderings a line may take: seen as its numbers say from both ends, and agreeing with the buildings already standing. */
function fitting(n: number, front: number, back: number, known: number[]) {
  return permutations(n).filter(
    (p) => (!front || visible(p) === front) && (!back || visible([...p].reverse()) === back) && known.every((h, j) => !h || p[j] === h),
  );
}
/**
 * How many answers the numbers and the standing buildings leave, stopping at `cap`: rows are tried among the
 * orderings that fit them, and each column keeps only the orderings its rows so far allow.
 */
export function solutions(size: number, clues: number[], known: number[] = [], cap = 2): number {
  const n = size,
      at = (r: number, c: number) => known[r * n + c] ?? 0,
      rows = Array.from({ length: n }, (_, r) => fitting(n, clues[3 * n + r], clues[n + r], Array.from({ length: n }, (_, c) => at(r, c)))),
      columns = Array.from({ length: n }, (_, c) => fitting(n, clues[c], clues[2 * n + c], Array.from({ length: n }, (_, r) => at(r, c))));
  let found = 0;
  const go = (r: number, open: number[][][]) => {
    if (found >= cap) return;
    if (r === n) {
      found++;
      return;
    }
    for (const row of rows[r]) {
      const next: number[][][] = [];
      let ok = true;
      for (let c = 0; c < n && ok; c++) {
        const left = open[c].filter((col) => col[r] === row[c]);
        if (!left.length) ok = false;
        next.push(left);
      }
      if (ok) go(r + 1, next);
      if (found >= cap) return;
    }
  };
  go(0, columns);
  return found;
}
/** A random Latin square: each row and column holds 1..n once. */
function square(n: number, random: Random): number[] {
  const cells = new Array(n * n).fill(0);
  const fill = (i: number): boolean => {
    if (i === n * n) return true;
    const r = Math.floor(i / n),
      c = i % n,
      order = Array.from({ length: n }, (_, k) => k + 1);
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(random() * (k + 1)) % (k + 1);
      [order[k], order[j]] = [order[j], order[k]];
    }
    for (const h of order) {
      let free = true;
      for (let k = 0; k < n && free; k++) if (cells[r * n + k] === h || cells[k * n + c] === h) free = false;
      if (!free) continue;
      cells[i] = h;
      if (fill(i + 1)) return true;
      cells[i] = 0;
    }
    return false;
  };
  fill(0);
  return cells;
}
const shuffled = <X>(items: X[], random: Random) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
/** A puzzle of a stage (1 to 5) whose numbers, with any buildings put up from the start, leave one answer. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const { size, keep } = STAGES[Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1)) - 1],
    n = size,
    answer = square(n, random),
    clues = Array.from({ length: 4 * n }, (_, k) => visible(line(n, k).map((i) => answer[i]))),
    known = new Array(n * n).fill(0);
  // If every number together still leaves a choice, buildings are put up until it does not.
  for (const cell of shuffled(Array.from({ length: n * n }, (_, i) => i), random)) {
    if (solutions(n, clues, known) === 1) break;
    known[cell] = answer[cell];
  }
  // Then numbers are taken away, in a random order, as long as the answer stays the only one.
  const least = Math.ceil(keep * 4 * n);
  let kept = 4 * n;
  for (const k of shuffled(Array.from({ length: 4 * n }, (_, i) => i), random)) {
    if (kept <= least) break;
    const was = clues[k];
    clues[k] = 0;
    if (solutions(n, clues, known) === 1) kept--;
    else clues[k] = was;
  }
  return { size: n, cells: [...known], fixed: known.map((h) => h > 0), answer, clues, last: null, winner: null, ply: 0 };
}
/** Whether the city is finished: every plot built, each height once a row and a column, and every number right. */
export function solved(state: Pick<State, "size" | "cells" | "clues">) {
  const n = state.size,
    rows = Array.from({ length: n }, (_, r) => state.cells.slice(r * n, r * n + n)),
    columns = Array.from({ length: n }, (_, c) => rows.map((row) => row[c])),
    whole = (hs: number[]) => new Set(hs).size === n && hs.every((h) => h >= 1 && h <= n);
  return rows.every(whole) && columns.every(whole) && state.clues.every((clue, k) => !clue || visible(line(n, k).map((i) => state.cells[i])) === clue);
}
/** Plots whose building has the same height as another in its row or column. */
export function clashes(state: Pick<State, "size" | "cells">) {
  const n = state.size;
  return state.cells.map((h, i) => {
    if (!h) return false;
    const r = Math.floor(i / n),
      c = i % n;
    for (let k = 0; k < n; k++) if ((k !== c && state.cells[r * n + k] === h) || (k !== r && state.cells[k * n + c] === h)) return true;
    return false;
  });
}
/**
 * How a number stands: `done` when its line is fully built and seen as it says, `over` when its line already
 * shows more than it says (a taller building can only hide more) or is full and wrong, else `open`.
 */
export function clueState(state: Pick<State, "size" | "cells" | "clues">, k: number): "open" | "done" | "over" {
  const clue = state.clues[k];
  if (!clue) return "open";
  const heights = line(state.size, k).map((i) => state.cells[i]),
    full = heights.every((h) => h),
    seen = visible(heights);
  if (full) return seen === clue ? "done" : "over";
  // Built from the front without a gap: what is seen so far can only grow.
  const front = heights.findIndex((h) => !h),
    prefix = visible(heights.slice(0, front));
  return prefix > clue ? "over" : "open";
}
/** Moves a hand makes by dragging: a building set on a plot (`put`), from the row in front (`from` −1) or another plot, and one carried off (`REMOVE`). */
export const REMOVE = 999,
  SET = 1000,
  put = (cell: number, height: number) => SET + cell * 8 + height;
const free = (state: State, cell: number) => Number.isInteger(cell) && cell >= 0 && cell < state.cells.length && !state.fixed[cell];
export const moves = (state: State): Move[] => (state.winner !== null ? [] : state.cells.flatMap((_, to) => (free(state, to) ? [{ from: -1, to, extra: -1 }] : [])));
/**
 * A tap (or Enter) on a plot raises its building a storey, and past the tallest clears it. A building dragged onto a
 * plot replaces whatever stood there; one dragged off a plot leaves it empty.
 */
export function play(state: State, move: Move): State | null {
  const { from, to } = move;
  if (state.winner !== null || move.extra !== -1 || !Number.isInteger(to)) return null;
  const n = state.size,
    cells = [...state.cells];
  let last: number;
  if (to >= SET) {
    const cell = Math.floor((to - SET) / 8),
      height = (to - SET) % 8;
    if (!free(state, cell) || height < 1 || height > n || (from !== -1 && (!free(state, from) || state.cells[from] !== height))) return null;
    if (from !== -1) cells[from] = 0;
    cells[cell] = height;
    last = cell;
  } else if (to === REMOVE) {
    if (!free(state, from) || !state.cells[from]) return null;
    cells[from] = 0;
    last = from;
  } else {
    if (from !== -1 || !free(state, to)) return null;
    cells[to] = (cells[to] + 1) % (n + 1);
    last = to;
  }
  if (cells.every((h, i) => h === state.cells[i])) return null;
  const next = { ...state, cells, last, ply: state.ply + 1 };
  return { ...next, winner: solved(next) ? 0 : null };
}
/** A plot that is empty or wrong, and the building that belongs there. */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const cell = state.cells.findIndex((h, i) => !state.fixed[i] && h !== state.answer[i]);
  return cell < 0 ? null : { from: -1, to: put(cell, state.answer[cell]), extra: -1 };
}
const effect = (): Effect | null => null;
export const skyline: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.cells.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: (s) => `한 줄에 1층부터 ${s.size}층까지 한 채씩 · 가장자리 숫자는 그쪽에서 보이는 건물 수`,
  tally: () => ["", ""],
  reason: () => "성공! 도시를 완성했습니다.",
};
