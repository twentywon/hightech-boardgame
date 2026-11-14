import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Grilling meat at the table: plates of raw meat stand round a charcoal
 * grill; a piece is laid on the grill, turned as often as wished and eaten
 * when it is done. The table itself is played in real time by the view
 * (see `sim.ts`); the moves are what it reports: a second gone by, a piece
 * laid, turned, eaten for what it was worth, or burnt. The meal ends when
 * the time is up or nothing is left to grill.
 */
export const SECONDS = 120,
  TICK = 0,
  LAY = 1,
  FLIP = 2,
  BURN = 3,
  /** Nothing is left on the plates or the grill. */
  DONE = 4,
  /** A piece eaten is a move to `EAT + points`, 0 (a side still raw, or spoilt) to 6 (both sides just right). */
  EAT = 10,
  BEST = 6;
export interface State {
  score: number;
  eaten: number;
  /** Pieces eaten with both sides just right. */
  perfect: number;
  burnt: number;
  /** Seconds left. */
  left: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
export const createGame = (): State => ({ score: 0, eaten: 0, perfect: 0, burnt: 0, left: SECONDS, winner: null, last: null, ply: 0 });
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [TICK, LAY, FLIP, BURN, DONE, ...Array.from({ length: BEST + 1 }, (_, points) => EAT + points)].map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const next = { ...state, last: move.to, ply: state.ply + 1 };
  if (move.to === TICK) return { ...next, left: state.left - 1, winner: state.left <= 1 ? 0 : null };
  if (move.to === LAY || move.to === FLIP) return next;
  if (move.to === BURN) return { ...next, burnt: state.burnt + 1 };
  if (move.to === DONE) return { ...next, winner: 0 };
  const points = move.to - EAT;
  if (!Number.isInteger(points) || points < 0 || points > BEST) return null;
  return { ...next, score: state.score + points, eaten: state.eaten + 1, perfect: state.perfect + (points === BEST ? 1 : 0) };
}
const effect = (): Effect | null => null;
export const grill: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => s.score,
  hint: (s) => `남은 시간 ${s.left}초 · 점수 ${s.score}${s.eaten ? "" : " · 접시의 고기를 눌러 불판에 올리세요."}`,
  tally: (s) => [`점수 ${s.score} · 먹은 고기 ${s.eaten} · 탄 고기 ${s.burnt} · 남은 시간 ${s.left}초`, ""],
  reason: (s) => `점수 ${s.score}점! 고기 ${s.eaten}점을 구워 먹었고, 그 가운데 ${s.perfect}점이 양쪽 다 딱 좋았습니다. 태운 고기는 ${s.burnt}점입니다.`,
};
