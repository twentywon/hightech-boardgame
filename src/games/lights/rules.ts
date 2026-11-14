import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Lights on: a square of lamps, some dark. Pressing a lamp turns it over
 * together with the lamps beside, above and below it; every lamp is to be
 * lit. A puzzle is made by pressing lamps of a lit board at random, so it
 * can always be solved, and its fewest presses are found by solving the
 * presses as equations over two values.
 */
export const SIZES = [3, 4, 5, 6, 7];
export interface State {
  size: number;
  on: boolean[];
  /** The fewest presses from the start. */
  best: number;
  last: number | null;
  winner: Winner;
  ply: number;
}
/** The lamps a press turns over: itself and its four neighbours. */
export function reach(size: number, cell: number) {
  const r = Math.floor(cell / size),
    c = cell % size,
    out = [cell];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
}
/**
 * The fewest presses that light every lamp, as the cells to press, or null
 * when none do. Pressing twice undoes itself and the order does not matter,
 * so each cell is pressed once or not at all: a set of equations, one a
 * lamp, solved by elimination; where presses are left free, every choice of
 * them is tried and the shortest kept.
 */
export function solve(size: number, on: boolean[]): number[] | null {
  const n = size * size,
    // Row i: which presses turn lamp i over, and (last) whether it is lit.
    rows = Array.from({ length: n }, (_, lamp) => {
      const row = new Uint8Array(n + 1);
      for (const cell of reach(size, lamp)) row[cell] = 1;
      // A lamp must be turned over an odd number of times when it is dark.
      row[n] = on[lamp] ? 0 : 1;
      return row;
    }),
    pivots: number[] = [];
  let rank = 0;
  for (let col = 0; col < n && rank < n; col++) {
    const found = rows.findIndex((row, i) => i >= rank && row[col]);
    if (found < 0) continue;
    [rows[rank], rows[found]] = [rows[found], rows[rank]];
    for (let i = 0; i < n; i++) if (i !== rank && rows[i][col]) for (let k = col; k <= n; k++) rows[i][k] ^= rows[rank][k];
    pivots.push(col);
    rank++;
  }
  if (rows.slice(rank).some((row) => row[n])) return null;
  const free = Array.from({ length: n }, (_, i) => i).filter((i) => !pivots.includes(i));
  let best: number[] | null = null;
  for (let choice = 0; choice < 1 << free.length; choice++) {
    const press = new Uint8Array(n);
    free.forEach((cell, k) => (press[cell] = (choice >> k) & 1));
    pivots.forEach((col, i) => {
      let value = rows[i][n];
      for (const cell of free) value ^= rows[i][cell] & press[cell];
      press[col] = value;
    });
    const cells = [...press].flatMap((p, i) => (p ? [i] : []));
    if (!best || cells.length < best.length) best = cells;
  }
  return best;
}
export const moves = (state: State): Move[] => (state.winner !== null ? [] : state.on.map((_, to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to) || move.to < 0 || move.to >= state.on.length) return null;
  const on = [...state.on];
  for (const cell of reach(state.size, move.to)) on[cell] = !on[cell];
  return { ...state, on, last: move.to, ply: state.ply + 1, winner: on.every(Boolean) ? 0 : null };
}
/** A puzzle of a stage (1 the three by three, up to 5 the seven by seven), needing at least as many presses as the board is wide. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const size = SIZES[Math.max(1, Math.min(SIZES.length, Math.round(stage) || 1)) - 1];
  for (let attempt = 0; attempt < 200; attempt++) {
    const on = new Array<boolean>(size * size).fill(true);
    for (let cell = 0; cell < on.length; cell++) if (random() < 0.45) for (const lamp of reach(size, cell)) on[lamp] = !on[lamp];
    const best = solve(size, on)?.length ?? 0;
    if (best >= size) return { size, on, best, last: null, winner: null, ply: 0 };
  }
  // Never reached in practice: every lamp dark.
  const on = new Array<boolean>(size * size).fill(false);
  return { size, on, best: solve(size, on)?.length ?? 0, last: null, winner: null, ply: 0 };
}
export function hint(state: State): Move | null {
  const cell = state.winner === null ? solve(state.size, state.on)?.[0] : undefined;
  return cell === undefined ? null : { from: -1, to: cell, extra: -1 };
}
const effect = (): Effect | null => null;
export const lights: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.on.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: (s) => `불을 모두 켜세요 · 꺼진 불 ${s.on.filter((lit) => !lit).length}개 · ${s.ply}번 누름 (최소 ${s.best}번)`,
  tally: (s) => [`${s.ply}번 누름 · 최소 ${s.best}번`, ""],
  reason: (s) => `성공! ${s.ply}번 만에 불을 모두 켰습니다. 최소 횟수는 ${s.best}번${s.ply === s.best ? "으로, 가장 적게 눌렀습니다!" : "입니다."}`,
};
