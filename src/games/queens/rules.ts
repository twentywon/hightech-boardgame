import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Queens on the board: an old puzzle. On a board of n by n, n queens are
 * set so that none stands on the row, the column or a diagonal of another,
 * so that none could move onto another. A puzzle is laid at random: a
 * whole answer is drawn among all the answers of its board, and some of its
 * queens are set down as givens (dark, not to be moved), chosen so that the
 * rest can be completed in one way only.
 */
export interface Stage {
  size: number;
  /** How many queens are given. */
  given: number;
}
export const STAGES: Stage[] = [
  { size: 5, given: 2 },
  { size: 6, given: 1 },
  { size: 7, given: 2 },
  { size: 8, given: 3 },
  { size: 8, given: 1 },
];
export interface State {
  size: number;
  /** Where a queen stands. */
  queens: boolean[];
  /** Queens that were given and stay. */
  fixed: boolean[];
  last: number | null;
  winner: Winner;
  ply: number;
}
/** Whether two squares lie on one row, column or diagonal. */
export function attacks(size: number, a: number, b: number) {
  const ra = Math.floor(a / size),
    ca = a % size,
    rb = Math.floor(b / size),
    cb = b % size;
  return a !== b && (ra === rb || ca === cb || Math.abs(ra - rb) === Math.abs(ca - cb));
}
/** The queens that stand in the way of another. */
export function clashing(state: Pick<State, "size" | "queens">) {
  const placed = state.queens.flatMap((q, i) => (q ? [i] : []));
  return placed.filter((a) => placed.some((b) => attacks(state.size, a, b)));
}
const cache = new Map<number, number[][]>();
/** Every answer for a board: the column of the queen in each row. */
export function answers(size: number): number[][] {
  const known = cache.get(size);
  if (known) return known;
  const out: number[][] = [],
    cols: number[] = [];
  const go = (row: number) => {
    if (row === size) return void out.push([...cols]);
    for (let c = 0; c < size; c++)
      if (cols.every((d, r) => d !== c && Math.abs(d - c) !== row - r)) {
        cols.push(c);
        go(row + 1);
        cols.pop();
      }
  };
  go(0);
  cache.set(size, out);
  return out;
}
/** The answers that keep every given queen. */
const keeping = (size: number, fixed: boolean[]) =>
  answers(size).filter((cols) => fixed.every((f, i) => !f || cols[Math.floor(i / size)] === i % size));
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : state.queens.flatMap((_, to) => (state.fixed[to] ? [] : [{ from: -1, to, extra: -1 }]));
/** A tap sets a queen on an empty square or takes one off; given queens stay, and no more than n are set. */
export function play(state: State, move: Move): State | null {
  const n = state.size * state.size;
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to) || move.to < 0 || move.to >= n || state.fixed[move.to]) return null;
  if (!state.queens[move.to] && state.queens.filter(Boolean).length >= state.size) return null;
  const queens = [...state.queens];
  queens[move.to] = !queens[move.to];
  const next = { ...state, queens, last: move.to, ply: state.ply + 1 },
    done = queens.filter(Boolean).length === state.size && clashing(next).length === 0;
  return { ...next, winner: done ? 0 : null };
}
/** A puzzle of a stage (1 to 5): a random answer, and givens from it that leave one way to finish. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const { size, given } = STAGES[Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1)) - 1],
    all = answers(size),
    pick = <X>(list: X[]) => list[Math.floor(random() * list.length) % list.length];
  let best: boolean[] | null = null,
    bestCount = Infinity;
  for (let attempt = 0; attempt < 60; attempt++) {
    const cols = pick(all),
      rows = Array.from({ length: size }, (_, r) => r);
    // Givens on rows drawn at random.
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    const fixed = new Array<boolean>(size * size).fill(false);
    for (const r of rows.slice(0, given)) fixed[r * size + cols[r]] = true;
    const count = keeping(size, fixed).length;
    if (count < bestCount) {
      best = fixed;
      bestCount = count;
    }
    if (count === 1) break;
  }
  const fixed = best!;
  return { size, queens: [...fixed], fixed, last: null, winner: null, ply: 0 };
}
/**
 * The next step toward an answer: a queen that belongs to no answer with the givens and the queens set so far is
 * taken off first (the one that stands in the way of most); otherwise a queen of the nearest answer is set.
 */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const { size } = state,
    candidates = keeping(size, state.fixed),
    placed = state.queens.flatMap((q, i) => (q && !state.fixed[i] ? [i] : [])),
    on = (cols: number[], i: number) => cols[Math.floor(i / size)] === i % size;
  if (!candidates.length) return null;
  // The answer that keeps the most of what has been set.
  const near = candidates.reduce((a, b) => (placed.filter((i) => on(b, i)).length > placed.filter((i) => on(a, i)).length ? b : a));
  const wrong = placed.filter((i) => !on(near, i));
  if (wrong.length) {
    const worst = wrong.reduce((a, b) => (placed.filter((q) => attacks(size, b, q)).length > placed.filter((q) => attacks(size, a, q)).length ? b : a));
    return { from: -1, to: worst, extra: -1 };
  }
  const row = near.findIndex((c, r) => !state.queens[r * size + c]);
  return row < 0 ? null : { from: -1, to: row * size + near[row], extra: -1 };
}
const effect = (): Effect | null => null;
export const queens: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.queens.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: (s) => `퀸 ${s.size}개를 서로 같은 줄·대각선에 서지 않게 놓으세요`,
  tally: () => ["", ""],
  reason: () => "성공! 어느 퀸도 다른 퀸에게 갈 수 없습니다.",
};
