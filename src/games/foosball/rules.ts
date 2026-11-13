import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The match of table football: the table itself is played in real time by
 * the view (see `sim.ts`); the only thing that is a move is a goal. First to
 * five wins.
 */
export const GOALS = 5;
export interface State {
  score: [number, number];
  winner: Winner;
  /** Who scored last. */
  last: 0 | 1 | null;
  ply: number;
}
export const createGame = (): State => ({ score: [0, 0], winner: null, last: null, ply: 0 });
/** A goal for side 0 is a move to point 0, for side 1 to point 1. */
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [0, 1].map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || (move.to !== 0 && move.to !== 1)) return null;
  const score: [number, number] = [state.score[0], state.score[1]];
  score[move.to]++;
  return { score, winner: score[move.to] >= GOALS ? move.to : null, last: move.to, ply: state.ply + 1 };
}
const effect = (): Effect | null => null;
export const foosball: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  // Nobody takes turns: the table never waits for the computer.
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [null, null],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => s.score[player] - s.score[player ? 0 : 1],
  hint: (s) => `${s.last !== null ? `골! ${s.score[0]} 대 ${s.score[1]}. ` : ""}막대를 위아래로 움직이고, 눌러서 공을 차세요.`,
  tally: (s) => [0, 1].map((p) => `${s.score[p]}골`) as [string, string],
  reason: (s) => `${s.score[0]} 대 ${s.score[1]}. ${GOALS}골을 먼저 넣었습니다.`,
};
