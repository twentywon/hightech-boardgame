import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Queens on the board: an old puzzle. On a board of n by n, n queens are
 * set so that none stands on the row, the column or a diagonal of another,
 * so that none could move onto another. A puzzle is laid at random: a
 * whole answer is drawn among all the answers of its board, and some of its
 * queens are set down as givens (dark, not to be moved), chosen so that the
 * rest can be completed in one way only. The repair challenge (asked for in
 * the upgrade) starts instead from all n queens set, a few of them misplaced
 * along their rows: they are to be moved until none stands in another's way.
 */
export interface Stage {
  size: number;
  /** How many queens are given. */
  given: number;
}
/**
 * The stages with givens, by value: the first five as always, then 4×4, 9×9 and 10×10 (added in the upgrade, values
 * 6 to 8). The stage window shows them by size.
 */
export const STAGES: Stage[] = [
  { size: 5, given: 2 },
  { size: 6, given: 1 },
  { size: 7, given: 2 },
  { size: 8, given: 3 },
  { size: 8, given: 1 },
  { size: 4, given: 1 },
  { size: 9, given: 3 },
  { size: 10, given: 4 },
];
/** The repair challenges, values after the stages with givens: a board of `size` with `wrong` queens misplaced. */
export const REPAIRS: { size: number; wrong: number }[] = [
  { size: 6, wrong: 2 },
  { size: 8, wrong: 3 },
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
/** Every pair of queens that stand in each other's way (each pair once, the lower square first): the view draws a line between them. */
export function clashPairs(state: Pick<State, "size" | "queens">): [number, number][] {
  const placed = state.queens.flatMap((q, i) => (q ? [i] : []));
  return placed.flatMap((a, i) => placed.slice(i + 1).flatMap((b) => (attacks(state.size, a, b) ? [[a, b] as [number, number]] : [])));
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
const done = (state: Pick<State, "size" | "queens">) => state.queens.filter(Boolean).length === state.size && clashing(state).length === 0;
/**
 * A tap sets a queen on an empty square or takes one off; given queens stay, and no more than n are set. A queen of
 * mine may also be carried to an empty square in one move (`from` the square it stands on), as the hand drags it.
 */
export function play(state: State, move: Move): State | null {
  const n = state.size * state.size,
    inside = (s: number) => Number.isInteger(s) && s >= 0 && s < n;
  if (state.winner !== null || move.extra !== -1 || !inside(move.to) || state.fixed[move.to]) return null;
  if (move.from !== -1) {
    if (!inside(move.from) || !state.queens[move.from] || state.fixed[move.from] || state.queens[move.to]) return null;
    const queens = [...state.queens];
    queens[move.from] = false;
    queens[move.to] = true;
    const next = { ...state, queens, last: move.to, ply: state.ply + 1 };
    return { ...next, winner: done(next) ? 0 : null };
  }
  if (!state.queens[move.to] && state.queens.filter(Boolean).length >= state.size) return null;
  const queens = [...state.queens];
  queens[move.to] = !queens[move.to];
  const next = { ...state, queens, last: move.to, ply: state.ply + 1 };
  return { ...next, winner: done(next) ? 0 : null };
}
/** Whether a stage's value is a repair challenge, and which. */
export const repairOf = (stage: number) => (stage > STAGES.length ? REPAIRS[Math.min(REPAIRS.length, stage - STAGES.length) - 1] : null);
export const STAGE_COUNT = STAGES.length + REPAIRS.length;
/** The size of a stage's board, from its value. */
export function sizeOf(stage: number) {
  const value = Math.max(1, Math.min(STAGE_COUNT, Math.round(stage) || 1));
  return (repairOf(value) ?? STAGES[value - 1]).size;
}
/** A puzzle of a stage (1 to 8 with givens, 9 and 10 repairs): a random answer, and givens from it that leave one way to finish. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const value = Math.max(1, Math.min(STAGE_COUNT, Math.round(stage) || 1)),
    repair = repairOf(value);
  if (repair) return createRepair(repair.size, repair.wrong, random);
  const { size, given } = STAGES[value - 1],
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
/** A repair: an answer drawn at random with `wrong` of its queens slid to other squares of their rows, so that some stand in another's way. */
function createRepair(size: number, wrong: number, random: Random): State {
  const all = answers(size),
    none = new Array<boolean>(size * size).fill(false);
  for (;;) {
    const cols = [...all[Math.floor(random() * all.length) % all.length]],
      rows = Array.from({ length: size }, (_, r) => r);
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    for (const r of rows.slice(0, wrong)) {
      const shift = 1 + Math.floor(random() * (size - 1));
      cols[r] = (cols[r] + shift) % size;
    }
    const queens = none.map((_, i) => cols[Math.floor(i / size)] === i % size),
      state = { size, queens, fixed: [...none], last: null, winner: null, ply: 0 };
    // Every misplaced queen must be seen to be in the way of another, and the board must not happen to be another answer.
    if (clashing(state).length >= wrong) return state;
  }
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
  hint: (s) =>
    s.queens.filter(Boolean).length === s.size && !s.fixed.some(Boolean)
      ? `빨간 퀸을 옮겨 퀸 ${s.size}개가 서로 같은 줄·대각선에 서지 않게 하세요`
      : `퀸 ${s.size}개를 서로 같은 줄·대각선에 서지 않게 놓으세요`,
  tally: () => ["", ""],
  reason: () => "성공! 어느 퀸도 다른 퀸에게 갈 수 없습니다.",
};
