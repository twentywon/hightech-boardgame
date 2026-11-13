import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Brick breaker: a ball is kept in play with a bat and knocks out the
 * bricks at the far end of the table. The table itself is played in real
 * time by the view (see `sim.ts`); the moves are what it reports: a brick
 * knocked out, the ball lost, a wall cleared, a falling prize caught. Ten
 * walls, each harder than the last, and three balls to begin with.
 */
export const LEVELS = 10,
  LIVES = 3,
  MAX_LIVES = 5,
  COLS = 9,
  ROWS = 6,
  BRICK = 0,
  LOST = 1,
  CLEAR = 2,
  /** A prize caught is a move to `ITEM + kind`. */
  ITEM = 10;
/** The prizes that now and then fall out of a brick. */
export const WIDE = 0,
  MULTI = 1,
  SLOW = 2,
  PIERCE = 3,
  LIFE = 4,
  NARROW = 5,
  ITEM_NAMES = ["넓은 막대", "공 세 개", "느린 공", "꿰뚫는 공", "공 하나 더", "좁은 막대"];
/** What a brick is: plain (one hit), hard (two), tough (three), steel (never breaks) or a bomb (takes its neighbours with it). */
export type Kind = "p" | "h" | "t" | "s" | "b";
export interface Wall {
  /** Six rows of nine from the far end; "." is a gap. */
  rows: string[];
  /** How far each row slides from side to side (0 stands still; the sign is the way it starts). */
  sway: number[];
  /** Half the width of the bat, and how fast the ball goes. */
  bat: number;
  speed: number;
}
const still = [0, 0, 0, 0, 0, 0];
/** The ten walls. Each brings something new or less room for error: hard bricks, bombs, steel, sliding rows, a shorter bat, a faster ball. */
export const WALLS: Wall[] = [
  { rows: [".........", "ppppppppp", "ppppppppp", "ppppppppp", "ppppppppp", "........."], sway: still, bat: 0.95, speed: 6.4 },
  { rows: ["p.p.p.p.p", ".p.p.p.p.", "p.p.p.p.p", ".p.p.p.p.", "p.p.p.p.p", ".p.p.p.p."], sway: still, bat: 0.92, speed: 6.8 },
  { rows: ["....h....", "...hph...", "..hppph..", ".hppppph.", "hppppppph", "ppppppppp"], sway: still, bat: 0.9, speed: 7.2 },
  { rows: ["p.h.p.h.p", "p.h.b.h.p", "p.h.p.h.p", "pbh.p.hbp", "p.h.p.h.p", "ppppppppp"], sway: still, bat: 0.88, speed: 7.6 },
  { rows: ["hhhhhhhhh", "ppppppppp", "pppbpbppp", ".........", "ss.sss.ss", "ppppppppp"], sway: still, bat: 0.86, speed: 8.0 },
  { rows: [".ppppppp.", ".hhhhhhh.", ".ppbpbpp.", ".hhhhhhh.", ".ppppppp.", "........."], sway: [1, -1, 1, -1, 1, 0], bat: 0.84, speed: 8.3 },
  { rows: ["tpppppppt", ".tpppppt.", "s.thhht.s", "s..tbt..s", "....t....", "...ppp..."], sway: still, bat: 0.78, speed: 8.7 },
  { rows: [".pbpppbp.", ".pbphpbp.", ".hpbpbph.", ".ppphppp.", ".pbpppbp.", ".hhhhhhh."], sway: [1, -1, 1, -1, 1, -1], bat: 0.74, speed: 9.1 },
  { rows: ["hhhhhhhhh", "h.ttttt.h", "h.tbtbt.h", "h.ttttt.h", "sss...sss", "ppp...ppp"], sway: still, bat: 0.7, speed: 9.5 },
  { rows: [".ttttttt.", ".tbhhhbt.", "s.hpbph.s", ".hhhhhhh.", "..s.s.s..", ".ppppppp."], sway: [1, -1, 0, 1, 0, -1], bat: 0.66, speed: 10 },
];
export const wall = (level: number) => WALLS[Math.max(1, Math.min(LEVELS, level)) - 1];
/** The bricks of a level: column, row from the far end, and kind. */
export function layout(level: number): { col: number; row: number; kind: Kind; sway: number }[] {
  const { rows, sway } = wall(level);
  return rows.flatMap((line, row) => [...line].flatMap((kind, col) => (kind === "." ? [] : [{ col, row, kind: kind as Kind, sway: sway[row] }])));
}
export interface State {
  score: number;
  lives: number;
  level: number;
  winner: Winner;
  last: number | null;
  /** The prize caught last, until a ball is lost or the wall is cleared. */
  item: number | null;
  ply: number;
}
/** A game may begin at any wall. */
export const createGame = (start = 1): State => ({ score: 0, lives: LIVES, level: Math.max(1, Math.min(LEVELS, Math.round(start) || 1)), winner: null, last: null, item: null, ply: 0 });
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : [BRICK, LOST, CLEAR, ...ITEM_NAMES.map((_, kind) => ITEM + kind)].map((to) => ({ from: -1, to, extra: -1 }));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const next = { ...state, last: move.to, ply: state.ply + 1 };
  if (move.to === BRICK) return { ...next, score: state.score + 10 * state.level };
  if (move.to === LOST) return { ...next, item: null, lives: state.lives - 1, winner: state.lives <= 1 ? 1 : null };
  // A wall cleared is worth a hundred times its number; the last one wins the game.
  if (move.to === CLEAR) return { ...next, item: null, score: state.score + 100 * state.level, level: Math.min(LEVELS, state.level + 1), winner: state.level >= LEVELS ? 0 : null };
  const kind = move.to - ITEM;
  if (kind < 0 || kind >= ITEM_NAMES.length || !Number.isInteger(kind)) return null;
  // Every prize is worth fifty; the spare ball is kept, up to five.
  return { ...next, item: kind, score: state.score + 50, lives: kind === LIFE ? Math.min(MAX_LIVES, state.lives + 1) : state.lives };
}
const effect = (): Effect | null => null;
export const bricks: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => s.score,
  hint: (s) => `${s.level}/${LEVELS}단계 · 점수 ${s.score} · 남은 공 ${s.lives}${s.item !== null ? ` · 방금 받은 것: ${ITEM_NAMES[s.item]}` : " · 막대로 공을 받아 벽돌을 깨세요."}`,
  tally: (s) => [`점수 ${s.score} · 남은 공 ${s.lives} · ${s.level}단계`, ""],
  reason: (s) => (s.winner === 0 ? `벽 열 개를 모두 깼습니다! 점수 ${s.score}.` : `공을 모두 잃었습니다. ${s.level}단계까지 갔고 점수는 ${s.score}입니다.`),
};
