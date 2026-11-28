import type { Effect, Move, PointGame, Winner } from "../points/types";
import { ERAS } from "./sim";

/**
 * A match of 시대 전쟁: the lane itself is played in real time by the view (`sim.ts`); the only move is its end, a base
 * brought down (`FALL + side`, side the one that fell). There is no time limit (the user asked for it gone): a match
 * lasts until a base falls. Over Wi-Fi the host's view reports it; side 0 is the left base (1번), side 1 the right (2번).
 */
export const FALL = 0;
export interface State {
  winner: Winner;
  ply: number;
}
export const createGame = (): State => ({ winner: null, ply: 0 });
const tool = (to: number): Move => ({ from: -1, to, extra: -1 });
export const fallMove = (side: number) => tool(FALL + side);
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  return [tool(FALL), tool(FALL + 1)];
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  if (move.to === FALL || move.to === FALL + 1) return { winner: move.to === FALL ? 1 : 0, ply: state.ply + 1 };
  return null;
}
const effect = (): Effect | null => null;
export const eraWar: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  // Nobody takes turns: both bases train and fight at once.
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [null, null],
  effect,
  ply: (s) => s.ply,
  evaluate: () => 0,
  hint: () => `병사를 뽑아 상대 기지를 무너뜨리세요. 경험치가 차면 다음 시대(${ERAS.map((e) => e.name).join(" → ")})로 넘어갑니다.`,
  tally: () => ["", ""],
  reason: () => "상대 기지를 무너뜨렸습니다.",
};
