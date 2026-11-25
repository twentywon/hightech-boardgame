import type { Effect, Move, PointGame, Winner } from "../points/types";
import { RUN } from "./sim";

/**
 * Snowboard: a timed run down an endless slope, the score adding up. The slope itself is ridden in real time by the
 * view (see `sim.ts`); the moves are what it reports: points scored (a trick landed, a gate, a snowflake), a crash,
 * and the run's end when its clock (`RUN` seconds) runs out.
 */
export const CRASH = 1,
  END = 2,
  /** Points are a move to `SCORE + points / 10` (every award is a multiple of ten). */
  SCORE = 100,
  MOST = 200000;
export interface State {
  score: number;
  crashes: number;
  /** The biggest single award of the run (a trick, times its multiplier). */
  best: number;
  /** The points of the last award, and the last move. */
  award: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
export const createGame = (): State => ({ score: 0, crashes: 0, best: 0, award: 0, winner: null, last: null, ply: 0 });
const plain = (to: number): Move => ({ from: -1, to, extra: -1 });
/** The plain moves (a score is any `SCORE + n`, checked by `play`). */
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [CRASH, END].map(plain));
/** The move that scores `points` (a multiple of ten). */
export const scoreMove = (points: number): Move => plain(SCORE + Math.round(points / 10));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const next: State = { ...state, last: move.to, award: 0, ply: state.ply + 1 };
  if (move.to === CRASH) return { ...next, crashes: state.crashes + 1 };
  if (move.to === END) return { ...next, winner: 0 };
  const points = (move.to - SCORE) * 10;
  if (!Number.isInteger(points) || points < 10 || points > MOST) return null;
  return { ...next, score: state.score + points, award: points, best: Math.max(state.best, points) };
}
const effect = (): Effect | null => null;
export const snowboard: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state) => state.score,
  hint: (state) => (state.winner !== null ? `런 끝 · 점수 ${state.score.toLocaleString("ko-KR")}` : `점수 ${state.score.toLocaleString("ko-KR")} · 넘어짐 ${state.crashes}`),
  tally: (state) => [`점수 ${state.score} · 넘어짐 ${state.crashes}`, ""],
  reason: (state) =>
    `점수 ${state.score.toLocaleString("ko-KR")}점! ${Math.round(RUN / 60)}분 동안 ${state.crashes ? `${state.crashes}번 넘어지며` : "한 번도 넘어지지 않고"} 내려왔습니다.${state.best > 0 ? ` 가장 큰 기술은 ${state.best.toLocaleString("ko-KR")}점이었습니다.` : ""}`,
};
