import type { Effect, Move, PointGame, Winner } from "../points/types";
import { WHY } from "./sim";

/**
 * A match of table tennis against the computer. The rallies are played in real time by the view (see `sim.ts`);
 * the only thing that is a move is a point won: a move to point 0 is a point for me, to point 1 one for the
 * computer, and its `extra` says why the rally ended (`WHY`).
 *
 * A game goes to `POINTS` and must be won by two; the serve changes every two points, and every point from 10 all.
 * The match is the best of `best` games (three or five, the variant). The computer serves first in the first game,
 * and the side that served first in a game receives first in the next.
 */
export const POINTS = 11;
export interface State {
  /** Points in the game being played, games won, and the score each finished game ended at. */
  score: [number, number];
  games: [number, number];
  done: [number, number][];
  /** Games the match is the best of. */
  best: number;
  /** Who served first in the first game. */
  first: 0 | 1;
  winner: Winner;
  /** Who won the last point, and why its rally ended. */
  last: 0 | 1 | null;
  why: number;
  ply: number;
}
export const bestOf = (variant: string) => (variant === "5" ? 5 : 3);
export const need = (state: State) => Math.ceil(state.best / 2);
export const createGame = (best = 3): State => ({ score: [0, 0], games: [0, 0], done: [], best: best === 5 ? 5 : 3, first: 1, winner: null, last: null, why: -1, ply: 0 });
/** The game being played (from 1). */
export const gameNumber = (s: State) => Math.min(s.best, s.done.length + 1);
/** Whether the game stands at 10 all or beyond, where the serve changes every point. */
export const deuce = (s: State) => s.score[0] >= POINTS - 1 && s.score[1] >= POINTS - 1;
/** Who serves the next point: the game's first server for two points, then the other for two, and so on; from 10 all, by turns. */
export function serverOf(s: State): 0 | 1 {
  const opener = (s.first + s.done.length) % 2,
    played = s.score[0] + s.score[1],
    turn = played < 2 * (POINTS - 1) ? Math.floor(played / 2) : POINTS - 1 + (played - 2 * (POINTS - 1));
  return ((opener + turn) % 2) as 0 | 1;
}
/** Whether `score` has won a game: eleven or more, two clear. */
const won = (score: [number, number], side: 0 | 1) => score[side] >= POINTS && score[side] - score[1 - side] >= 2;
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [0, 1].flatMap((to) => WHY.map((_, why) => ({ from: -1, to, extra: why }))));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || (move.to !== 0 && move.to !== 1) || !Number.isInteger(move.extra) || move.extra < -1 || move.extra >= WHY.length) return null;
  const side = move.to as 0 | 1,
    score: [number, number] = [state.score[0], state.score[1]];
  score[side]++;
  const base = { last: side, why: move.extra, ply: state.ply + 1 };
  if (!won(score, side)) return { ...state, ...base, score };
  // The game is won: the next begins from nothing, unless the match is won with it.
  const games: [number, number] = [state.games[0], state.games[1]];
  games[side]++;
  const done = [...state.done, score];
  if (games[side] >= need(state)) return { ...state, ...base, score, games, done, winner: side };
  return { ...state, ...base, score: [0, 0], games, done };
}
const effect = (): Effect | null => null;
const scores = (s: State) => s.done.map(([a, b]) => `${a}:${b}`).join(", ");
export const tableTennis: PointGame<State> = {
  create: (variant) => createGame(bestOf(variant)),
  moves,
  play,
  // Nobody takes turns: the table never waits for the computer.
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [null, null],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => (s.games[player] - s.games[player ? 0 : 1]) * 20 + s.score[player] - s.score[player ? 0 : 1],
  hint: (s) => {
    const line = `${gameNumber(s)}게임 ${s.score[0]} 대 ${s.score[1]} (게임 ${s.games[0]} 대 ${s.games[1]})`;
    return serverOf(s) === 0
      ? `${line}. 내 서브: 화면을 눌러 공을 띄우고, 떨어질 때 라켓을 위로 휘둘러 치세요.`
      : `${line}. 컴퓨터 서브: 공이 내 쪽에 한 번 튀면 라켓을 대어 넘기세요.`;
  },
  tally: (s) => [0, 1].map((p) => `${s.score[p]}점 · 게임 ${s.games[p]}${s.winner === null && serverOf(s) === p ? " · 서브" : ""}`) as [string, string],
  reason: (s) =>
    s.winner === 0
      ? `게임 스코어 ${s.games[0]} 대 ${s.games[1]}로 이겼습니다 (${scores(s)}). ${s.best}게임 가운데 ${need(s)}게임을 먼저 땄습니다.`
      : `게임 스코어 ${s.games[0]} 대 ${s.games[1]}로 졌습니다 (${scores(s)}). 컴퓨터가 ${need(s)}게임을 먼저 땄습니다.`,
};
