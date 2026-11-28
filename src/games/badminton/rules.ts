import type { Effect, Move, PointGame, Winner } from "../points/types";
import { WHY } from "./sim";

/**
 * A badminton match of singles against the computer. The rallies are played in real time by the view (see `sim.ts`);
 * the only thing that is a move is a point won: a move to point 0 is a point for me, to point 1 one for the computer,
 * and its `extra` says why the rally ended (`WHY`).
 *
 * Rally scoring: every rally is a point, and its winner serves the next (from the right court when its score is even,
 * from the left when odd). A game goes to `points` and must be won by two, but no further than `cap` (at 29 all the
 * next point wins a game to 21; 14 all, a game to 11). The match is one game to 11 (the variant "1"), one to 21
 * ("21"), or the best of three games to 21 ("3"). I serve the first point; the winner of a game serves first in the next.
 */
export const SHORT_GAME = 11,
  FULL_GAME = 21;
export interface State {
  score: [number, number];
  games: [number, number];
  done: [number, number][];
  best: number;
  points: number;
  winner: Winner;
  /** Who won the last point (and serves the next), and why its rally ended. */
  last: 0 | 1 | null;
  why: number;
  ply: number;
}
export const bestOf = (variant: string) => (variant === "3" ? 3 : 1);
export const pointsOf = (variant: string) => (variant === "1" || variant === "" ? SHORT_GAME : FULL_GAME);
/** The most a game can go to: 30 for a game to 21, 15 for one to 11. */
export const capOf = (points: number) => (points >= FULL_GAME ? 30 : points + 4);
export const need = (state: State) => Math.ceil(state.best / 2);
export const createGame = (best = 1, points = SHORT_GAME): State => ({ score: [0, 0], games: [0, 0], done: [], best: best === 3 ? 3 : 1, points, winner: null, last: null, why: -1, ply: 0 });
export const gameNumber = (s: State) => Math.min(s.best, s.done.length + 1);
/** Who serves the next point: whoever won the last one (me at the start). */
export const serverOf = (s: State): 0 | 1 => s.last ?? 0;
/** Whether the server serves from its right court: when its score is even. */
export const fromRight = (s: State) => s.score[serverOf(s)] % 2 === 0;
/** Game point or match point for either side, at deuce or beyond (the board says so). */
export const deuce = (s: State) => s.score[0] >= s.points - 1 && s.score[1] >= s.points - 1;
const won = (score: [number, number], side: 0 | 1, points: number) => score[side] >= capOf(points) || (score[side] >= points && score[side] - score[1 - side] >= 2);
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [0, 1].flatMap((to) => WHY.map((_, why) => ({ from: -1, to, extra: why }))));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || (move.to !== 0 && move.to !== 1) || !Number.isInteger(move.extra) || move.extra < -1 || move.extra >= WHY.length) return null;
  const side = move.to as 0 | 1,
    score: [number, number] = [state.score[0], state.score[1]];
  score[side]++;
  const base = { last: side, why: move.extra, ply: state.ply + 1 };
  if (!won(score, side, state.points)) return { ...state, ...base, score };
  const games: [number, number] = [state.games[0], state.games[1]];
  games[side]++;
  const done = [...state.done, score];
  if (games[side] >= need(state)) return { ...state, ...base, score, games, done, winner: side };
  return { ...state, ...base, score: [0, 0], games, done };
}
const effect = (): Effect | null => null;
const scores = (s: State) => s.done.map(([a, b]) => `${a}:${b}`).join(", ");
export const line = (s: State) => (s.best === 1 ? `${s.score[0]} 대 ${s.score[1]}` : `${gameNumber(s)}게임 ${s.score[0]} 대 ${s.score[1]} (게임 ${s.games[0]} 대 ${s.games[1]})`);
export const badminton: PointGame<State> = {
  create: (variant) => createGame(bestOf(variant), pointsOf(variant)),
  moves,
  play,
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [null, null],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => (s.games[player] - s.games[player ? 0 : 1]) * 30 + s.score[player] - s.score[player ? 0 : 1],
  hint: (s) =>
    serverOf(s) === 0
      ? `${line(s)}. 내 서브: 화면을 위로 밀어 서브하세요. 빠르게 밀수록 멀리 갑니다.`
      : `${line(s)}. 컴퓨터 서브: 셔틀콕이 다가오면 화면을 밀어 치세요.`,
  tally: (s) => [0, 1].map((p) => `${s.score[p]}점${s.best === 1 ? "" : ` · 게임 ${s.games[p]}`}${s.winner === null && serverOf(s) === p ? " · 서브" : ""}`) as [string, string],
  reason: (s) =>
    s.best === 1
      ? `${s.done[0][0]} 대 ${s.done[0][1]}로 ${s.winner === 0 ? "이겼습니다" : "졌습니다"}. ${s.points}점 단판 승부입니다.`
      : s.winner === 0
      ? `게임 스코어 ${s.games[0]} 대 ${s.games[1]}로 이겼습니다 (${scores(s)}). 3게임 가운데 2게임을 먼저 땄습니다.`
      : `게임 스코어 ${s.games[0]} 대 ${s.games[1]}로 졌습니다 (${scores(s)}). 컴퓨터가 2게임을 먼저 땄습니다.`,
};
