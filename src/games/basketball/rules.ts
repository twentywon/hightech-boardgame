import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * A round at the basketball shooting machine: the balls, the hoop and the net are played in real time by the view
 * (see `sim.ts`); the moves are what it reports: a second gone by (the clock starts with the first throw), a ball
 * thrown, a basket (for what it was worth) and a throw that came down without going in. A round lasts `ROUND`
 * seconds; a basket is worth 2, 3 in the last `FINAL` seconds, and one more while the shooter is on fire (`FIRE`
 * baskets in a row, until a miss).
 */
export const ROUND = 45,
  FINAL = 10,
  FIRE = 3,
  TICK = 0,
  SHOT = 1,
  MISS = 2,
  /** A basket is a move to `SCORE + points`. */
  SCORE = 10;
export const LEVEL_NAMES = ["쉬움", "보통", "어려움"];
export interface State {
  level: number;
  score: number;
  shots: number;
  made: number;
  /** Baskets in a row since the last miss. */
  streak: number;
  left: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
export const createGame = (level = 1): State => ({ level: Math.max(1, Math.min(LEVEL_NAMES.length, Math.round(level) || 1)), score: 0, shots: 0, made: 0, streak: 0, left: ROUND, winner: null, last: null, ply: 0 });
/** Whether the shooter is on fire (the next basket is worth one more). */
export const onFire = (state: State) => state.streak >= FIRE;
/** What a basket made now is worth. */
export const worth = (state: State) => (state.left <= FINAL ? 3 : 2) + (onFire(state) ? 1 : 0);
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [TICK, SHOT, MISS, SCORE + 2, SCORE + 3, SCORE + 4].map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const next = { ...state, last: move.to, ply: state.ply + 1 };
  if (move.to === TICK) return { ...next, left: state.left - 1, winner: state.left <= 1 ? 0 : null };
  if (move.to === SHOT) return { ...next, shots: state.shots + 1 };
  if (move.to === MISS) return { ...next, streak: 0 };
  const points = move.to - SCORE;
  if (points < 2 || points > 4) return null;
  return { ...next, score: state.score + points, made: state.made + 1, streak: state.streak + 1 };
}
const effect = (): Effect | null => null;
const rate = (state: State) => (state.shots ? Math.round((state.made / state.shots) * 100) : 0);
export const basketball: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play,
  turn: () => 0,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state) => state.score,
  hint: (state) => (state.shots ? `남은 시간 ${state.left}초 · 점수 ${state.score}` : "공을 위로 밀어 던지면 시계가 돌기 시작합니다."),
  tally: (state) => [`점수 ${state.score} · 성공 ${state.made} / ${state.shots}개 · 남은 시간 ${state.left}초`, ""],
  reason: (state) => `점수 ${state.score}점! ${state.shots}개를 던져 ${state.made}개를 넣었습니다 (성공률 ${rate(state)}%).`,
};
