import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Grilling meat: pieces are laid on a charcoal grill, turned once and
 * taken off when both sides are done. The grill itself is played in real
 * time by the view (see `sim.ts`); the moves are what it reports: a piece
 * turned, a piece taken off with what it was worth, a piece burnt. Three
 * burnt pieces end the game.
 */
export const LIVES = 3,
  FLIP = 0,
  BURN = 1,
  /** A piece taken off is a move to `SERVE + points`, 0 (a side still raw) to 6 (both sides just right). */
  SERVE = 10,
  BEST = 6;
export interface State {
  score: number;
  served: number;
  /** Pieces taken off with both sides just right. */
  perfect: number;
  burnt: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
export const createGame = (): State => ({ score: 0, served: 0, perfect: 0, burnt: 0, winner: null, last: null, ply: 0 });
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [FLIP, BURN, ...Array.from({ length: BEST + 1 }, (_, points) => SERVE + points)].map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const next = { ...state, last: move.to, ply: state.ply + 1 };
  if (move.to === FLIP) return next;
  if (move.to === BURN) return { ...next, burnt: state.burnt + 1, winner: state.burnt + 1 >= LIVES ? 1 : null };
  const points = move.to - SERVE;
  if (!Number.isInteger(points) || points < 0 || points > BEST) return null;
  return { ...next, score: state.score + points, served: state.served + 1, perfect: state.perfect + (points === BEST ? 1 : 0) };
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
  hint: (s) => `점수 ${s.score} · 탄 고기 ${s.burnt}/${LIVES}${s.served ? "" : " · 고기를 눌러 뒤집고, 한 번 더 눌러 건지세요."}`,
  tally: (s) => [`점수 ${s.score} · 구운 고기 ${s.served} · 탄 고기 ${s.burnt}/${LIVES}`, ""],
  reason: (s) => `점수 ${s.score}점! 고기를 ${LIVES}점 태웠습니다. 건진 고기 ${s.served}점 가운데 ${s.perfect}점이 양쪽 다 딱 좋게 익었습니다.`,
};
