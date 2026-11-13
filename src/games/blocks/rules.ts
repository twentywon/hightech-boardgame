import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Falling blocks: pieces of four squares come down a well ten wide, one at
 * a time. A piece is slid sideways and turned as it falls; when it can fall
 * no farther it stays, and every row filled from wall to wall is taken out.
 * The pieces fall faster with every ten rows; the game is over when a new
 * piece has no room to come in.
 */
export const W = 10,
  H = 18,
  LEFT = 0,
  RIGHT = 1,
  TURN = 2,
  /** One row down by hand; DROP sends the piece all the way; TICK is the fall the clock brings. */
  DOWN = 3,
  DROP = 4,
  TICK = 5,
  /** Rows to have cleared for the game to count as won when it ends. */
  GOAL = 20;
/** The seven pieces, as squares in a box of `SIZE` a side. */
const SHAPES: [number, number][][] = [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[2, 0], [0, 1], [1, 1], [2, 1]],
  ],
  SIZE = [4, 2, 3, 3, 3, 3, 3];
export const KINDS = SHAPES.length;
export interface Piece {
  kind: number;
  rot: number;
  x: number;
  y: number;
}
export interface State {
  /** The well, row by row from the top; 0 is empty, otherwise the kind of the piece that left the square, plus one. */
  grid: number[];
  piece: Piece | null;
  next: number;
  /** The kinds still to come before all seven have been dealt again. */
  bag: number[];
  score: number;
  lines: number;
  winner: Winner;
  /** What the last move did: whether a piece came to rest, and the rows it took out. */
  last: { locked: boolean; cleared: number[] } | null;
  ply: number;
}
export const level = (state: State) => 1 + Math.floor(state.lines / 10);
/** Milliseconds between two falls of the clock. */
export const interval = (lv: number) => Math.max(90, 820 - (lv - 1) * 75);
/** The squares a piece covers. */
export function cells(piece: Piece): [number, number][] {
  const n = SIZE[piece.kind];
  return SHAPES[piece.kind].map(([x, y]) => {
    for (let r = 0; r < piece.rot; r++) [x, y] = [n - 1 - y, x];
    return [piece.x + x, piece.y + y];
  });
}
/** Whether a piece has room there; above the top of the well there is always room. */
export const fits = (grid: number[], piece: Piece) => cells(piece).every(([x, y]) => x >= 0 && x < W && y < H && (y < 0 || !grid[y * W + x]));
function draw(bag: number[], random: Random): [number, number[]] {
  const left = bag.length ? bag.slice() : Array.from({ length: KINDS }, (_, i) => i),
    kind = left.splice(Math.floor(random() * left.length), 1)[0];
  return [kind, left];
}
const enter = (kind: number): Piece => ({ kind, rot: 0, x: Math.floor((W - SIZE[kind]) / 2), y: kind === 0 ? -1 : 0 });
export function createGame(random: Random = cryptoRandom): State {
  const [first, a] = draw([], random),
    [next, bag] = draw(a, random);
  return { grid: Array(W * H).fill(0), piece: enter(first), next, bag, score: 0, lines: 0, winner: null, last: null, ply: 0 };
}
/** Where the piece would come to rest if it fell straight down. */
export function landing(state: State): Piece | null {
  if (!state.piece) return null;
  let piece = state.piece;
  while (fits(state.grid, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };
  return piece;
}
/** The piece stays where it is: full rows go, the next piece comes in. */
function lock(state: State, random: Random): State {
  const grid = state.grid.slice(),
    piece = state.piece!;
  let out = false;
  for (const [x, y] of cells(piece)) {
    if (y < 0) out = true;
    else grid[y * W + x] = piece.kind + 1;
  }
  const cleared: number[] = [];
  for (let y = 0; y < H; y++) if (grid.slice(y * W, y * W + W).every(Boolean)) cleared.push(y);
  const kept = Array.from({ length: H }, (_, y) => y).filter((y) => !cleared.includes(y)),
    after = [...Array(cleared.length * W).fill(0), ...kept.flatMap((y) => grid.slice(y * W, y * W + W))],
    lines = state.lines + cleared.length,
    score = state.score + [0, 100, 300, 500, 800][cleared.length] * level(state),
    [next, bag] = draw(state.bag, random),
    coming = enter(state.next),
    // No room for the new piece, or the old one stuck out of the well: the game is over.
    over = out || !fits(after, coming);
  return { ...state, grid: after, piece: over ? null : coming, next, bag, lines, score, winner: over ? (lines >= GOAL ? 0 : 1) : null, last: { locked: true, cleared } };
}
const tried = (state: State, piece: Piece): State | null => (fits(state.grid, piece) ? { ...state, piece, last: { locked: false, cleared: [] } } : null);
function step(state: State, move: number, random: Random): State | null {
  const piece = state.piece;
  if (!piece) return null;
  if (move === LEFT || move === RIGHT) return tried(state, { ...piece, x: piece.x + (move === LEFT ? -1 : 1) });
  if (move === TURN) {
    // Against a wall or the heap the piece is nudged aside, or up a row, to find room.
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]]) {
      const turned = tried(state, { ...piece, rot: (piece.rot + 1) % 4, x: piece.x + dx, y: piece.y + dy });
      if (turned) return turned;
    }
    return null;
  }
  if (move === DOWN || move === TICK) {
    const fallen = tried(state, { ...piece, y: piece.y + 1 });
    if (fallen) return move === DOWN ? { ...fallen, score: fallen.score + 1 } : fallen;
    return lock(state, random);
  }
  if (move === DROP) {
    const rest = landing(state)!;
    return lock({ ...state, piece: rest, score: state.score + (rest.y - piece.y) * 2 }, random);
  }
  return null;
}
export function play(state: State, move: Move, random: Random = cryptoRandom): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const next = step(state, move.to, random);
  return next && { ...next, ply: state.ply + 1 };
}
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : [LEFT, RIGHT, TURN, DOWN, DROP, TICK].filter((to) => to >= DOWN || step(state, to, () => 0)).map((to) => ({ from: -1, to, extra: -1 }));
const effect = (): Effect | null => null;
export const blocks: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => s.score,
  hint: (s) => `점수 ${s.score} · ${s.lines}줄 · 레벨 ${level(s)}`,
  tally: (s) => [`점수 ${s.score} · ${s.lines}줄 · 레벨 ${level(s)}`, ""],
  reason: (s) => `${s.winner === 0 ? "잘 쌓았습니다!" : "블록이 꼭대기까지 찼습니다."} ${s.lines}줄을 지웠고 점수는 ${s.score}, 레벨 ${level(s)}입니다.`,
};
