import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Brick breaker: a ball is kept in play with a bat and knocks out the
 * bricks at the far end of the table. The table itself is played in real
 * time by the view (see `sim.ts`); the moves are what it reports: a brick
 * knocked out, the ball lost, a wall cleared. Five walls, three balls.
 */
export const LEVELS = 5,
  LIVES = 3,
  COLS = 9,
  ROWS = 7,
  BRICK = 0,
  LOST = 1,
  CLEAR = 2;
/** The wall of a level: for each brick its column, its row from the far end, and how many hits it takes. */
export function layout(level: number): { col: number; row: number; hits: number }[] {
  const out: { col: number; row: number; hits: number }[] = [],
    mid = (COLS - 1) / 2;
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) {
      const off = Math.abs(col - mid);
      let hits = 0;
      // 1: five plain rows. 2: a chequer. 3: a pyramid. 4: columns with hard bricks between. 5: a diamond with a hard heart.
      if (level === 1) hits = row >= 1 && row <= 5 ? 1 : 0;
      else if (level === 2) hits = (row + col) % 2 === 0 ? 1 : 0;
      else if (level === 3) hits = off <= row && row <= 5 ? (row === off ? 2 : 1) : 0;
      else if (level === 4) hits = row === 0 ? 0 : col % 2 === 0 ? 1 : row % 3 === 1 ? 2 : 0;
      else hits = off + Math.abs(row - 3) <= 4 ? (off + Math.abs(row - 3) <= 1 ? 2 : 1) : 0;
      if (hits) out.push({ col, row, hits });
    }
  return out;
}
export interface State {
  score: number;
  lives: number;
  level: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
export const createGame = (): State => ({ score: 0, lives: LIVES, level: 1, winner: null, last: null, ply: 0 });
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [BRICK, LOST, CLEAR].map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const next = { ...state, last: move.to, ply: state.ply + 1 };
  if (move.to === BRICK) return { ...next, score: state.score + 10 * state.level };
  if (move.to === LOST) return { ...next, lives: state.lives - 1, winner: state.lives <= 1 ? 1 : null };
  // A wall cleared is worth a hundred times its number; the last one wins the game.
  if (move.to === CLEAR) return { ...next, score: state.score + 100 * state.level, level: Math.min(LEVELS, state.level + 1), winner: state.level >= LEVELS ? 0 : null };
  return null;
}
const effect = (): Effect | null => null;
export const bricks: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => s.score,
  hint: (s) => `${s.level}/${LEVELS}단계 · 점수 ${s.score} · 남은 공 ${s.lives} · 막대로 공을 받아 벽돌을 깨세요.`,
  tally: (s) => [`점수 ${s.score} · 남은 공 ${s.lives} · ${s.level}단계`, ""],
  reason: (s) => (s.winner === 0 ? `벽 다섯 개를 모두 깼습니다! 점수 ${s.score}.` : `공을 모두 잃었습니다. ${s.level}단계까지 갔고 점수는 ${s.score}입니다.`),
};
