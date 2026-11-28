import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The fruit game (과일 게임): fruit is dropped into a glass box; two of a kind
 * that touch become one of the next kind, larger. The box itself is played
 * in real time by the view (see `sim.ts`); the moves are what it reports: a
 * fruit dropped, two merged, the box overflowing. A merge that follows
 * another within `COMBO_TIME` is a combo: its move carries the count in
 * `extra` (2 for the second in a row, and so on) and earns `bonus` besides.
 */
export const FRUITS = ["블루베리", "체리", "라임", "자두", "귤", "사과", "자몽", "코코넛", "멜론", "수박"];
/** How large each kind is (its radius). */
export const RADII = [0.3, 0.42, 0.56, 0.7, 0.86, 1.04, 1.24, 1.46, 1.72, 2.05];
export const KINDS = FRUITS.length,
  DROP = 0,
  OVER = 1,
  /** Two fruits of `kind` merging is a move to `MERGE + kind`. */
  MERGE = 10;
/** What merging two of a kind is worth: more the larger they are; two watermelons, which vanish, most of all. */
export const worth = (kind: number) => (kind + 1) * (kind + 2);
/** Seconds within which a merge counts as the next of a combo. */
export const COMBO_TIME = 1.2;
/** What the `combo`-th merge in a row earns over its worth: one more of the fruit's rank for each before it in the row, up to five. */
export const bonus = (kind: number, combo: number) => Math.max(0, Math.min(5, combo - 1)) * (kind + 1);
export interface State {
  score: number;
  /** The largest kind made so far, or -1. */
  largest: number;
  drops: number;
  /** The longest combo so far (1 when every merge stood alone, 0 before the first). */
  combo: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
export const createGame = (): State => ({ score: 0, largest: -1, drops: 0, combo: 0, winner: null, last: null, ply: 0 });
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [DROP, OVER, ...FRUITS.map((_, kind) => MERGE + kind)].map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1) return null;
  // Only a merge carries anything more: the place it has in a combo.
  if (move.extra !== -1 && (move.to < MERGE || !Number.isInteger(move.extra) || move.extra < 1)) return null;
  const next = { ...state, last: move.to, ply: state.ply + 1 };
  if (move.to === DROP) return { ...next, drops: state.drops + 1 };
  if (move.to === OVER) return { ...next, winner: 1 };
  const kind = move.to - MERGE;
  if (!Number.isInteger(kind) || kind < 0 || kind >= KINDS) return null;
  const combo = move.extra === -1 ? 1 : move.extra;
  return { ...next, score: state.score + worth(kind) + bonus(kind, combo), combo: Math.max(state.combo ?? 0, combo), largest: Math.max(state.largest, Math.min(KINDS - 1, kind + 1)) };
}
const effect = (): Effect | null => null;
export const fruit: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => s.score,
  hint: (s) => `점수 ${s.score}${s.largest >= 0 ? ` · 가장 큰 과일 ${FRUITS[s.largest]}` : " · 같은 과일끼리 닿게 떨어뜨리세요."}`,
  tally: (s) => [`점수 ${s.score}`, ""],
  reason: (s) => `점수 ${s.score}점! 과일이 선 위로 넘쳤습니다.${s.largest >= 0 ? ` 가장 큰 과일은 ${FRUITS[s.largest]}입니다.` : ""}${(s.combo ?? 0) > 1 ? ` 최고 콤보 ${s.combo}연속.` : ""}`,
};
