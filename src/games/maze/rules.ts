import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Mouse maze: a mouse runs the passages of a kitchen maze picking up every
 * crumb of cheese while cats hunt it. A chilli turns the tables for a few
 * seconds: the cats run, and one that is caught goes back to its basket.
 * The maze itself is played in real time by the view (see `sim.ts`); the
 * moves are the way I want to go and what the maze reports. Five mazes,
 * three lives.
 */
export const LEVELS = 5,
  LIVES = 3,
  /** Moves 0–3 turn the mouse: up, right, down, left. */
  CRUMB = 10,
  PEPPER = 11,
  CAT = 12,
  CAUGHT = 13,
  CLEAR = 14,
  W = 19,
  H = 15;
export const DX = [0, 1, 0, -1],
  DY = [-1, 0, 1, 0];
/** Where the mouse starts, where the cats' basket is, and where the four chillies lie. */
export const START = { x: 9, y: 13 },
  DEN = { x: 9, y: 7 },
  PEPPERS = [
    { x: 1, y: 1 },
    { x: W - 2, y: 1 },
    { x: 1, y: H - 2 },
    { x: W - 2, y: H - 2 },
  ];
/**
 * The maze of a level: true where a wall stands. It is carved by a walk
 * over the left half and mirrored, then opened up so that no passage is a
 * dead end; the same level is always the same maze.
 */
export function buildMaze(level: number): boolean[] {
  let seed = level * 7919 + 13;
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff,
    wall = Array(W * H).fill(true),
    mid = (W - 1) / 2,
    open = (x: number, y: number) => {
      wall[y * W + x] = false;
      wall[y * W + (W - 1 - x)] = false;
    },
    seen = new Set<number>(),
    stack = [{ x: mid, y: DEN.y }];
  open(mid, DEN.y);
  seen.add(DEN.y * W + mid);
  while (stack.length) {
    const here = stack[stack.length - 1],
      ways = [0, 1, 2, 3].filter((d) => {
        const x = here.x + DX[d] * 2,
          y = here.y + DY[d] * 2;
        return x >= 1 && x <= mid && y >= 1 && y <= H - 2 && !seen.has(y * W + x);
      });
    if (!ways.length) {
      stack.pop();
      continue;
    }
    const d = ways[Math.floor(random() * ways.length)],
      x = here.x + DX[d] * 2,
      y = here.y + DY[d] * 2;
    open(here.x + DX[d], here.y + DY[d]);
    open(x, y);
    seen.add(y * W + x);
    stack.push({ x, y });
  }
  // No dead ends: a square with one way out gets a second, and a few more walls go for good measure.
  const exits = (x: number, y: number) => [0, 1, 2, 3].filter((d) => !wall[(y + DY[d]) * W + x + DX[d]]);
  for (let y = 1; y <= H - 2; y += 2)
    for (let x = 1; x <= mid; x += 2) {
      const out = exits(x, y);
      if (out.length > 1 && random() > 0.18) continue;
      const shut = [0, 1, 2, 3].filter((d) => !out.includes(d) && x + DX[d] * 2 >= 1 && x + DX[d] * 2 <= W - 2 && y + DY[d] * 2 >= 1 && y + DY[d] * 2 <= H - 2);
      if (shut.length) {
        const d = shut[Math.floor(random() * shut.length)];
        open(x + DX[d], y + DY[d]);
      }
    }
  // The basket: three squares in the middle, open upward.
  open(mid - 1, DEN.y);
  open(mid, DEN.y - 1);
  return wall;
}
export interface State {
  score: number;
  lives: number;
  level: number;
  /** The way I want the mouse to go next (0 up, 1 right, 2 down, 3 left), or -1. */
  want: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
export const createGame = (start = 1): State => ({ score: 0, lives: LIVES, level: Math.max(1, Math.min(LEVELS, Math.round(start) || 1)), want: -1, winner: null, last: null, ply: 0 });
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [0, 1, 2, 3, CRUMB, PEPPER, CAT, CAUGHT, CLEAR].map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  // Turning is no event: the count of moves stays.
  if (move.to >= 0 && move.to <= 3) return { ...state, want: move.to };
  const next = { ...state, last: move.to, ply: state.ply + 1 };
  if (move.to === CRUMB) return { ...next, score: state.score + 10 };
  if (move.to === PEPPER) return { ...next, score: state.score + 50 };
  if (move.to === CAT) return { ...next, score: state.score + 200 };
  if (move.to === CAUGHT) return { ...next, want: -1, lives: state.lives - 1, winner: state.lives <= 1 ? 1 : null };
  if (move.to === CLEAR) return { ...next, want: -1, score: state.score + 500 * state.level, level: Math.min(LEVELS, state.level + 1), winner: state.level >= LEVELS ? 0 : null };
  return null;
}
const effect = (): Effect | null => null;
export const maze: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => s.score,
  hint: (s) => `${s.level}/${LEVELS}단계 · 점수 ${s.score} · 남은 목숨 ${s.lives} · 고양이를 피해 치즈를 모두 모으세요.`,
  tally: (s) => [`점수 ${s.score} · 남은 목숨 ${s.lives} · ${s.level}단계`, ""],
  reason: (s) => (s.winner === 0 ? `미로 다섯 개의 치즈를 모두 모았습니다! 점수 ${s.score}.` : `고양이에게 잡혔습니다. ${s.level}단계까지 갔고 점수는 ${s.score}입니다.`),
};
