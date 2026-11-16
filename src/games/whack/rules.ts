import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Whack-a-mole at an arcade machine: moles pop out of seven holes and are
 * knocked back with a soft mallet before they duck down again. The machine
 * itself is played in real time by the view (see `sim.ts`); the moves are
 * what it reports: a second gone by, a mole knocked (for what it was
 * worth), a hard hat knocked off, a blow on an empty hole, a mole that got
 * away. A round lasts `ROUND` seconds.
 */
export const ROUND = 45,
  TICK = 0,
  CLINK = 1,
  MISS = 2,
  ESCAPE = 3,
  /** A mole knocked is a move to `HIT + points`. */
  HIT = 10,
  MOST = 60;
export const LEVEL_NAMES = ["쉬움", "보통", "어려움"];
export interface State {
  level: number;
  score: number;
  hits: number;
  /** Blows on empty holes, and moles that got away. */
  misses: number;
  escapes: number;
  left: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
export const createGame = (level = 1): State => ({ level: Math.max(1, Math.min(LEVEL_NAMES.length, Math.round(level) || 1)), score: 0, hits: 0, misses: 0, escapes: 0, left: ROUND, winner: null, last: null, ply: 0 });
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : [TICK, CLINK, MISS, ESCAPE, ...Array.from({ length: MOST + 1 }, (_, i) => HIT + i)].map((to) => ({ from: -1, to, extra: -1 }));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const next = { ...state, last: move.to, ply: state.ply + 1 };
  if (move.to === TICK) return { ...next, left: state.left - 1, winner: state.left <= 1 ? 0 : null };
  if (move.to === CLINK) return next;
  if (move.to === MISS) return { ...next, misses: state.misses + 1 };
  if (move.to === ESCAPE) return { ...next, escapes: state.escapes + 1 };
  const points = move.to - HIT;
  if (!Number.isInteger(points) || points < 1 || points > MOST) return null;
  return { ...next, score: state.score + points, hits: state.hits + 1 };
}
const effect = (): Effect | null => null;
export const whackAMole: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state) => state.score,
  hint: (state) => `남은 시간 ${state.left}초 · 점수 ${state.score}`,
  tally: (state) => [`점수 ${state.score} · 잡은 두더지 ${state.hits} · 놓친 두더지 ${state.escapes} · 헛손질 ${state.misses} · 남은 시간 ${state.left}초`, ""],
  reason: (state) => `점수 ${state.score}점! 두더지 ${state.hits}마리를 잡고 ${state.escapes}마리를 놓쳤습니다.`,
};
