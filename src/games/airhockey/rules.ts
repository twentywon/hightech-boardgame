import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * A match of air hockey: the table itself is played in real time by the view (see `sim.ts`); the only thing that is
 * a move is a goal. It is played in sets (the user asked): `POINTS` goals win a set, and the first to win `NEED` of
 * the `SETS` sets wins the match.
 */
export const POINTS = 5,
  SETS = 3,
  NEED = Math.ceil(SETS / 2);
export interface State {
  /** Goals in the set being played, sets won, and the score each finished set ended at. */
  score: [number, number];
  sets: [number, number];
  done: [number, number][];
  winner: Winner;
  /** Who scored last. */
  last: 0 | 1 | null;
  ply: number;
}
export const createGame = (): State => ({ score: [0, 0], sets: [0, 0], done: [], winner: null, last: null, ply: 0 });
/** The set being played (from 1). */
export const setNumber = (s: State) => Math.min(SETS, s.done.length + 1);
/** A goal for side 0 is a move to point 0, for side 1 to point 1. */
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [0, 1].map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || (move.to !== 0 && move.to !== 1)) return null;
  const side = move.to as 0 | 1,
    score: [number, number] = [state.score[0], state.score[1]];
  score[side]++;
  const base = { last: side, ply: state.ply + 1 };
  if (score[side] < POINTS) return { ...state, ...base, score };
  // The set is won: the next begins from nothing, unless the match is won with it.
  const sets: [number, number] = [state.sets[0], state.sets[1]];
  sets[side]++;
  const done = [...state.done, score];
  if (sets[side] >= NEED) return { score, sets, done, winner: side, ...base };
  return { score: [0, 0], sets, done, winner: null, ...base };
}
const effect = (): Effect | null => null;
const sets = (s: State) => s.done.map(([a, b]) => `${a}:${b}`).join(", ");
export const airHockey: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  // Nobody takes turns: the table never waits for the computer.
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [null, null],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => (s.sets[player] - s.sets[player ? 0 : 1]) * 10 + s.score[player] - s.score[player ? 0 : 1],
  hint: (s) => `${setNumber(s)}세트 ${s.score[0]} 대 ${s.score[1]} (세트 ${s.sets[0]} 대 ${s.sets[1]}). 말렛을 움직여 퍽을 쳐서 상대 골문에 넣으세요.`,
  tally: (s) => [0, 1].map((p) => `${s.score[p]}점 · 세트 ${s.sets[p]}`) as [string, string],
  reason: (s) =>
    s.winner === 0
      ? `세트 ${s.sets[0]} 대 ${s.sets[1]}로 이겼습니다 (${sets(s)}). ${POINTS}점 내기 ${SETS}세트에서 ${NEED}세트를 먼저 땄습니다.`
      : `세트 ${s.sets[0]} 대 ${s.sets[1]}로 졌습니다 (${sets(s)}). 컴퓨터가 ${NEED}세트를 먼저 땄습니다.`,
};
