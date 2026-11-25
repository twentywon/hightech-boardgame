import type { Effect, Move, PointGame, Winner } from "../points/types";
import { BALLS } from "./sim";

/**
 * Pinball: three balls, the score adding up. The table itself is played in real time by the view (see `sim.ts`); the
 * moves are what it reports: a ball launched, a ball saved (given back soon after its launch), a ball drained (the
 * last one ends the game), and points scored (a bumper, a target, a lane, the end-of-ball bonus).
 */
export const LAUNCH = 1,
  SAVE = 2,
  DRAIN = 3,
  /** Points are a move to `SCORE + points / 10` (every award is a multiple of ten). */
  SCORE = 100,
  MOST = 100000;
export interface State {
  score: number;
  /** The ball in play (1 to `BALLS`), and the balls drained. */
  ball: number;
  drained: number;
  saves: number;
  /** The points of the last award (for the screen's word), and the last move. */
  award: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
export const createGame = (): State => ({ score: 0, ball: 1, drained: 0, saves: 0, award: 0, winner: null, last: null, ply: 0 });
const plain = (to: number): Move => ({ from: -1, to, extra: -1 });
/** The plain moves (a score is any `SCORE + n`, checked by `play`). */
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [LAUNCH, SAVE, DRAIN].map(plain));
/** The move that scores `points` (a multiple of ten). */
export const scoreMove = (points: number): Move => plain(SCORE + Math.round(points / 10));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const next: State = { ...state, last: move.to, award: 0, ply: state.ply + 1 };
  if (move.to === LAUNCH) return next;
  if (move.to === SAVE) return { ...next, saves: state.saves + 1 };
  if (move.to === DRAIN) {
    const drained = state.drained + 1;
    return { ...next, drained, ball: Math.min(BALLS, drained + 1), winner: drained >= BALLS ? 0 : null };
  }
  const points = (move.to - SCORE) * 10;
  if (!Number.isInteger(points) || points < 10 || points > MOST) return null;
  return { ...next, score: state.score + points, award: points };
}
const effect = (): Effect | null => null;
export const pinball: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state) => state.score,
  hint: (state) => (state.winner !== null ? `게임 끝 · 점수 ${state.score}` : `공 ${state.ball}/${BALLS} · 점수 ${state.score}`),
  tally: (state) => [`점수 ${state.score} · 공 ${state.ball}/${BALLS}`, ""],
  reason: (state) => `점수 ${state.score.toLocaleString("ko-KR")}점! 공 ${BALLS}개를 모두 썼습니다.`,
};
