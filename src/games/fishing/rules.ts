import type { Effect, Move, PointGame, Winner } from "../points/types";
import { KINDS, caughtIn, pointsOf } from "./sim";

/**
 * Fishing from a pier: cast the float, wait for a bite, strike and reel the fish in. The lake itself is played in
 * real time by the view (see `sim.ts`); the moves are what it reports: a second gone by, the float landing on the
 * water, a fish lost (struck too early, too late, the line snapped, or it got off a slack line), a fish hooked, and
 * a catch landed (for its points, with its kind and size). A round lasts `ROUND` seconds.
 */
export const ROUND = 90,
  TICK = 0,
  CAST = 1,
  SCARED = 2,
  LATE = 3,
  SNAP = 4,
  SLIP = 5,
  HOOK = 6,
  /** A catch landed is a move to `CATCH + points`, its `extra` the kind × 1000 + its size in cm. */
  CATCH = 100,
  MOST = 400;
export const LEVEL_NAMES = ["쉬움", "보통", "어려움"];
/** The stages: the lake at each level ("1" to "3"), the sea at each ("s1" to "s3"). */
export const seaOf = (variant: string) => /^s/.test(variant ?? "");
export const levelOf = (variant: string) => Number(String(variant ?? "").replace(/^s/, "")) || 1;
export interface Catch {
  kind: number;
  size: number;
  points: number;
}
export interface State {
  level: number;
  /** Fishing at sea (its own kinds, a longer fight) rather than on the lake. */
  sea: boolean;
  score: number;
  /** Everything landed, junk too, in the order caught. */
  caught: Catch[];
  /** Fish lost: scared off, too late, snapped, got off. */
  lost: number;
  casts: number;
  left: number;
  winner: Winner;
  last: number | null;
  /** The catch of the last move, when it was one. */
  landed: Catch | null;
  ply: number;
}
export const createGame = (level = 1, sea = false): State => ({
  level: Math.max(1, Math.min(LEVEL_NAMES.length, Math.round(level) || 1)),
  sea,
  score: 0,
  caught: [],
  lost: 0,
  casts: 0,
  left: ROUND,
  winner: null,
  last: null,
  landed: null,
  ply: 0,
});
const plain = (to: number): Move => ({ from: -1, to, extra: -1 });
/** The moves the lake can report; a catch is any `CATCH + points` whose `extra` names a kind and a size worth those points. */
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [TICK, CAST, SCARED, LATE, SNAP, SLIP, HOOK].map(plain));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1) return null;
  const next: State = { ...state, last: move.to, landed: null, ply: state.ply + 1 };
  if (move.to < CATCH) {
    if (move.extra !== -1) return null;
    if (move.to === TICK) return { ...next, left: state.left - 1, winner: state.left <= 1 ? 0 : null };
    if (move.to === CAST) return { ...next, casts: state.casts + 1 };
    if (move.to === SCARED || move.to === LATE || move.to === SNAP || move.to === SLIP) return { ...next, lost: state.lost + 1 };
    if (move.to === HOOK) return next;
    return null;
  }
  const points = move.to - CATCH,
    kind = Math.floor(move.extra / 1000),
    size = move.extra % 1000;
  if (!Number.isInteger(points) || points > MOST || !Number.isInteger(move.extra) || move.extra < 0) return null;
  const k = KINDS[kind];
  if (!k || !caughtIn(kind, state.sea) || size < k.min || size > k.max || pointsOf(kind, size) !== points) return null;
  const landed = { kind, size, points };
  return { ...next, score: state.score + points, caught: [...state.caught, landed], landed };
}
/** The move that lands a catch. */
export const catchMove = (kind: number, size: number): Move => ({ from: -1, to: CATCH + pointsOf(kind, size), extra: kind * 1000 + size });
const fishOf = (state: State) => state.caught.filter((c) => !KINDS[c.kind].junk);
/** The biggest fish of the round, or null. */
export function biggest(state: State) {
  let best: Catch | null = null;
  for (const c of fishOf(state)) if (!best || c.points > best.points) best = c;
  return best;
}
const effect = (): Effect | null => null;
export const fishing: PointGame<State> = {
  create: (variant) => createGame(levelOf(variant), seaOf(variant)),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state) => state.score,
  hint: (state) => `남은 시간 ${state.left}초 · 점수 ${state.score}`,
  tally: (state) => [`점수 ${state.score} · 잡은 물고기 ${fishOf(state).length} · 놓친 물고기 ${state.lost} · 남은 시간 ${state.left}초`, ""],
  reason: (state) => {
    const best = biggest(state),
      count = fishOf(state).length;
    if (!count) return `점수 ${state.score}점. 이번에는 물고기를 한 마리도 잡지 못했습니다.`;
    return `점수 ${state.score}점! 물고기 ${count}마리를 잡았습니다. 가장 값진 것은 ${KINDS[best!.kind].name} ${best!.size}cm입니다.`;
  },
};
