import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";

/**
 * The Game of the Amazons (Walter Zamkauskas, 1988), on 10 × 10 squares.
 * Each side has four amazons. A turn is two things: an amazon moves like a
 * chess queen, then from where it lands shoots an arrow, also like a queen,
 * onto an empty square, which is burnt and blocked for the rest of the game.
 * Nothing is ever taken. The side that cannot move loses.
 */
export const N = 10;
/** What stands on a square: nothing, an amazon of side 0 or 1, or a burnt square. */
export const EMPTY = -1,
  BURNT = 2;
export interface State {
  board: number[];
  turn: 0 | 1;
  last: { from: number; to: number; arrow: number } | null;
  winner: Winner;
  ply: number;
}
const at = (col: number, row: number) => row * N + col;
/** White (side 0) starts on the near side, at a4, d1, g1 and j4; black across, at a7, d10, g10 and j7. */
export function createGame(): State {
  const board = new Array(N * N).fill(EMPTY);
  for (const [c, r] of [[0, 6], [3, 9], [6, 9], [9, 6]]) board[at(c, r)] = 0;
  for (const [c, r] of [[0, 3], [3, 0], [6, 0], [9, 3]]) board[at(c, r)] = 1;
  return { board, turn: 0, last: null, winner: null, ply: 0 };
}
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** The empty squares a queen on `from` reaches, with `gone` standing as empty (the amazon that has just left it). */
export function reach(board: number[], from: number, gone = -1): number[] {
  const out: number[] = [],
    c0 = from % N,
    r0 = Math.floor(from / N);
  for (const [dc, dr] of DIRS)
    for (let c = c0 + dc, r = r0 + dr; c >= 0 && c < N && r >= 0 && r < N; c += dc, r += dr) {
      const s = at(c, r);
      if (board[s] !== EMPTY && s !== gone) break;
      out.push(s);
    }
  return out;
}
/** Whether a side has any move: an amazon with an empty square beside it can always move there and shoot back. */
export function canMove(board: number[], side: number) {
  return board.some((p, s) => p === side && DIRS.some(([dc, dr]) => {
    const c = (s % N) + dc,
      r = Math.floor(s / N) + dr;
    return c >= 0 && c < N && r >= 0 && r < N && board[at(c, r)] === EMPTY;
  }));
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  return state.board.flatMap((p, from) =>
    p !== state.turn ? [] : reach(state.board, from).flatMap((to) => reach(state.board, to, from).map((arrow) => ({ from, to, extra: arrow }))),
  );
}
export function play(state: State, move: Move): State | null {
  const { from, to, extra: arrow } = move;
  if (state.winner !== null || state.board[from] !== state.turn || !reach(state.board, from).includes(to) || !reach(state.board, to, from).includes(arrow)) return null;
  const board = state.board.slice();
  board[to] = state.turn;
  board[from] = EMPTY;
  board[arrow] = BURNT;
  const other = (1 - state.turn) as 0 | 1,
    next: State = { board, turn: other, last: { from, to, arrow }, winner: null, ply: state.ply + 1 };
  return canMove(board, other) ? next : { ...next, winner: state.turn };
}
/** The fewest queen moves from any amazon of `side` to every square (Infinity where none reaches). */
function distances(board: number[], side: number) {
  const dist = new Array(N * N).fill(Infinity),
    queue: number[] = [];
  board.forEach((p, s) => {
    if (p === side) {
      dist[s] = 0;
      queue.push(s);
    }
  });
  for (let head = 0; head < queue.length; head++) {
    const s = queue[head];
    for (const t of reach(board, s))
      if (dist[t] === Infinity) {
        dist[t] = dist[s] + 1;
        queue.push(t);
      }
  }
  return dist;
}
/** Squares `side` reaches sooner than the other, minus the other's; nearness breaks ties a little. */
export function territory(board: number[], side: 0 | 1) {
  const mine = distances(board, side),
    theirs = distances(board, 1 - side);
  let score = 0;
  board.forEach((p, s) => {
    if (p !== EMPTY) return;
    if (mine[s] < theirs[s]) score += 1;
    else if (theirs[s] < mine[s]) score -= 1;
  });
  // Room round each amazon: one shut in is nearly lost.
  const room = (who: number) => board.reduce((n, p, s) => n + (p === who ? Math.min(reach(board, s).length, 12) : 0), 0);
  return score + (room(side) - room(1 - side)) * 0.15;
}
/**
 * The computer's move: amazon moves are first ranked by the room they leave, the best few are tried with every
 * arrow, and the one that leaves the most territory is played (the easy level looks at fewer and slips).
 */
export function chooseMove(state: State, level: Level, random: () => number = Math.random): Move | null {
  const me = state.turn,
    steps = state.board.flatMap((p, from) => (p !== me ? [] : reach(state.board, from).map((to) => ({ from, to }))));
  if (!steps.length) return null;
  const width = level === "easy" ? 4 : level === "normal" ? 10 : 18,
    ranked = steps
      .map((m) => {
        const board = state.board.slice();
        board[m.to] = me;
        board[m.from] = EMPTY;
        return { ...m, score: territory(board, me) + random() * 0.01 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, width);
  let best: Move | null = null,
    top = -Infinity;
  for (const m of ranked) {
    const board = state.board.slice();
    board[m.to] = me;
    board[m.from] = EMPTY;
    for (const arrow of reach(board, m.to)) {
      board[arrow] = BURNT;
      const score = (canMove(board, 1 - me) ? territory(board, me) : 1e6) + random() * (level === "easy" ? 3 : 0.01);
      board[arrow] = EMPTY;
      if (score > top) {
        top = score;
        best = { from: m.from, to: m.to, extra: arrow };
      }
    }
  }
  return best;
}
const effect = (state: State): Effect | null => (state.last ? { kind: "move", from: state.last.from, to: state.last.to, converted: [], removed: [] } : null);
export const amazons: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  choose: (state, level, random) => chooseMove(state, level, random),
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.board.map((p) => (p === 0 || p === 1 ? p : null)),
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => territory(s.board, player),
  hint: () => "아마존을 고르고, 갈 칸을 고른 뒤, 화살을 쏠 칸을 고르세요.",
  tally: (s) => [0, 1].map((p) => `영역 ${Math.round(territory(s.board, p as 0 | 1))}`) as [string, string],
  reason: () => "상대가 더 움직일 수 없습니다.",
};
