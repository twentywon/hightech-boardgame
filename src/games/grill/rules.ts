import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Grilling meat at the table: plates of raw meat stand round a charcoal
 * grill; a piece is laid on the grill, turned as often as wished and eaten
 * when it is done, by itself or wrapped in a leaf with a relish. The table
 * itself is played in real time by the view (see `sim.ts`); the moves are
 * what it reports: a second gone by, a piece laid, turned, eaten for what
 * it was worth, or burnt, something set on the wrap, a wrap eaten. A meal
 * by the clock ends when the time is up; one without a clock never ends.
 */
export const SECONDS = 120,
  TICK = 0,
  LAY = 1,
  FLIP = 2,
  BURN = 3,
  /** A leaf, a piece or a relish set on the wrap plate. */
  DRESS = 4,
  /** A piece eaten is a move to `EAT + points`, 0 (a side still raw) to 6 (both sides just right). */
  EAT = 10,
  BEST = 6,
  /** A wrap eaten is a move to `WRAP + points`: its pieces, and more for the leaf and each relish. */
  WRAP = 40,
  FEAST = 17;
export interface State {
  /** True when there is no clock. */
  endless: boolean;
  score: number;
  eaten: number;
  /** Pieces eaten with both sides just right. */
  perfect: number;
  wraps: number;
  burnt: number;
  /** Seconds left by the clock, and seconds gone. */
  left: number;
  gone: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
/** A meal by the clock ("1") or without one ("2"). */
export const createGame = (variant = "1"): State => ({ endless: variant === "2", score: 0, eaten: 0, perfect: 0, wraps: 0, burnt: 0, left: SECONDS, gone: 0, winner: null, last: null, ply: 0 });
const span = (from: number, count: number) => Array.from({ length: count + 1 }, (_, i) => from + i);
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [TICK, LAY, FLIP, BURN, DRESS, ...span(EAT, BEST), ...span(WRAP, FEAST)].map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const next = { ...state, last: move.to, ply: state.ply + 1 };
  if (move.to === TICK) return state.endless ? { ...next, gone: state.gone + 1 } : { ...next, gone: state.gone + 1, left: state.left - 1, winner: state.left <= 1 ? 0 : null };
  if (move.to === LAY || move.to === FLIP || move.to === DRESS) return next;
  if (move.to === BURN) return { ...next, burnt: state.burnt + 1 };
  if (Number.isInteger(move.to) && move.to >= WRAP && move.to <= WRAP + FEAST) return { ...next, score: state.score + move.to - WRAP, wraps: state.wraps + 1 };
  const points = move.to - EAT;
  if (!Number.isInteger(points) || points < 0 || points > BEST) return null;
  return { ...next, score: state.score + points, eaten: state.eaten + 1, perfect: state.perfect + (points === BEST ? 1 : 0) };
}
/** Seconds as minutes and seconds. */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const effect = (): Effect | null => null;
export const grill: PointGame<State> = {
  create: (variant) => createGame(variant),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => s.score,
  hint: (s) => `${s.endless ? `지난 시간 ${clock(s.gone)}` : `남은 시간 ${s.left}초`} · 점수 ${s.score}${s.eaten || s.wraps ? "" : " · 접시의 고기를 불판으로 끌어다 놓으세요."}`,
  tally: (s) => [`점수 ${s.score} · 먹은 고기 ${s.eaten} · 쌈 ${s.wraps} · 탄 고기 ${s.burnt} · ${s.endless ? `지난 시간 ${clock(s.gone)}` : `남은 시간 ${s.left}초`}`, ""],
  reason: (s) => `점수 ${s.score}점! 고기 ${s.eaten}점을 구워 먹고 쌈을 ${s.wraps}번 쌌습니다. 양쪽 다 딱 좋게 구운 고기는 ${s.perfect}점, 태운 고기는 ${s.burnt}점입니다.`,
};
