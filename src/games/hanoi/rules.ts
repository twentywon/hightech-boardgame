import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The tower of Hanoi: discs of different sizes stand on the first of three
 * pegs, the largest lowest. One disc is moved at a time, the top one of a
 * peg, and never onto a smaller one; the whole tower is to stand on the
 * last peg.
 */
export const PEGS = 3,
  MIN = 3,
  MAX = 8;
export interface State {
  discs: number;
  /** Each peg from the bottom up; a disc is its size, 1 the smallest. */
  pegs: number[][];
  /** The fewest moves from the start. */
  best: number;
  last: { from: number; to: number } | null;
  winner: Winner;
  ply: number;
}
export function createGame(discs = MIN): State {
  const n = Math.max(MIN, Math.min(MAX, Math.round(discs) || MIN));
  return { discs: n, pegs: [Array.from({ length: n }, (_, i) => n - i), [], []], best: 2 ** n - 1, last: null, winner: null, ply: 0 };
}
const top = (peg: number[]) => peg[peg.length - 1] ?? Infinity;
export const moves = (state: State): Move[] =>
  state.winner !== null
    ? []
    : state.pegs.flatMap((peg, from) => (peg.length ? state.pegs.flatMap((other, to) => (to !== from && top(peg) < top(other) ? [{ from, to, extra: -1 }] : [])) : []));
export function play(state: State, move: Move): State | null {
  if (!moves(state).some((m) => m.from === move.from && m.to === move.to) || move.extra !== -1) return null;
  const pegs = state.pegs.map((peg) => [...peg]);
  pegs[move.to].push(pegs[move.from].pop()!);
  return { ...state, pegs, last: { from: move.from, to: move.to }, ply: state.ply + 1, winner: pegs[PEGS - 1].length === state.discs ? 0 : null };
}
/** The next move of the shortest way to bring the discs up to `size` onto `target`, from wherever they stand; null when they are there. */
function next(where: number[], size: number, target: number): { from: number; to: number } | null {
  if (size === 0) return null;
  if (where[size] === target) return next(where, size - 1, target);
  // Everything smaller must first stand on the third peg; then this disc goes over.
  return next(where, size - 1, PEGS - where[size] - target) ?? { from: where[size], to: target };
}
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const where: number[] = [];
  state.pegs.forEach((peg, i) => peg.forEach((disc) => (where[disc] = i)));
  const step = next(where, state.discs, PEGS - 1);
  return step && { ...step, extra: -1 };
}
const effect = (): Effect | null => null;
export const hanoi: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || MIN),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [0, 0, 0],
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: (s) => `원판 ${s.discs}개를 모두 오른쪽 기둥으로 · ${s.ply}번 옮김 (최소 ${s.best}번)`,
  tally: (s) => [`${s.ply}번 옮김 · 최소 ${s.best}번`, ""],
  reason: (s) => `성공! ${s.ply}번 만에 탑을 옮겼습니다. 최소 횟수는 ${s.best}번${s.ply === s.best ? "으로, 가장 적게 옮겼습니다!" : "입니다."}`,
};
