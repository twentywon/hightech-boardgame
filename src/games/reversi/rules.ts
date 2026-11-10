export const SIZE = 8;
export type Player = 1 | 2;
export interface Point {
  row: number;
  col: number;
}
export interface Move extends Point {
  player: Player;
}
export type Board = Int8Array;
export interface LegalMove {
  index: number;
  flips: number[];
}
export interface State {
  game: "reversi";
  board: Board;
  turn: Player;
  moves: Move[];
  winner: Player | "draw" | null;
  flipped: Point[];
  lastPassed: Player | null;
  passes: { player: Player; after: number }[];
}
export const other = (p: Player): Player => (p === 1 ? 2 : 1);
export const inside = (p: Point) =>
  Number.isInteger(p.row) &&
  Number.isInteger(p.col) &&
  p.row >= 0 &&
  p.row < 8 &&
  p.col >= 0 &&
  p.col < 8;
export const point = (index: number): Point => ({
  row: Math.floor(index / 8),
  col: index % 8,
});
export const indexOf = (p: Point) => p.row * 8 + p.col;
export const directions = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;
export const rays = Array.from({ length: 64 }, (_, i) =>
  directions.map(([dr, dc]) => {
    const result: number[] = [];
    for (
      let r = Math.floor(i / 8) + dr, c = (i % 8) + dc;
      r >= 0 && r < 8 && c >= 0 && c < 8;
      r += dr, c += dc
    )
      result.push(r * 8 + c);
    return result;
  }),
);
export function flipsAt(board: Board, index: number, player: Player): number[] {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 64 ||
    board[index] !== 0
  )
    return [];
  const flipped: number[] = [];
  const opponent = other(player);
  for (const ray of rays[index]) {
    const line: number[] = [];
    for (const pos of ray) {
      if (board[pos] === opponent) line.push(pos);
      else {
        if (board[pos] === player && line.length) flipped.push(...line);
        break;
      }
    }
  }
  return flipped;
}
export function legalMoves(board: Board, player: Player): LegalMove[] {
  const result: LegalMove[] = [];
  for (let i = 0; i < 64; i++)
    if (board[i] === 0) {
      const flips = flipsAt(board, i, player);
      if (flips.length) result.push({ index: i, flips });
    }
  return result;
}
export function counts(board: Board) {
  let black = 0,
    white = 0;
  for (const c of board) {
    if (c === 1) black++;
    if (c === 2) white++;
  }
  return { black, white, empty: 64 - black - white };
}
export function outcome(board: Board): Player | "draw" {
  const c = counts(board);
  return c.black === c.white ? "draw" : c.black > c.white ? 1 : 2;
}
export function createGame(): State {
  const board = new Int8Array(64);
  board[28] = board[35] = 1;
  board[27] = board[36] = 2;
  return {
    game: "reversi",
    board,
    turn: 1,
    moves: [],
    winner: null,
    flipped: [],
    lastPassed: null,
    passes: [],
  };
}
// Search and sessions use the same legal-move generator. Search may mutate its own
// board copy using these prevalidated moves; public play always validates again.
export function make(board: Board, move: LegalMove, player: Player) {
  board[move.index] = player;
  for (const i of move.flips) board[i] = player;
}
export function unmake(board: Board, move: LegalMove, player: Player) {
  board[move.index] = 0;
  for (const i of move.flips) board[i] = other(player);
}
export function resolveTurn(state: State): State {
  if (state.winner !== null) return state;
  if (legalMoves(state.board, state.turn).length) return state;
  const next = other(state.turn);
  if (!legalMoves(state.board, next).length)
    return { ...state, winner: outcome(state.board) };
  return {
    ...state,
    turn: next,
    lastPassed: state.turn,
    passes: [
      ...state.passes,
      { player: state.turn, after: state.moves.length },
    ],
  };
}
export function pass(state: State): State | null {
  if (state.winner !== null || legalMoves(state.board, state.turn).length)
    return null;
  return resolveTurn(state);
}
export function play(state: State, p: Point): State | null {
  if (state.winner !== null || !inside(p)) return null;
  const index = indexOf(p),
    flips = flipsAt(state.board, index, state.turn);
  if (!flips.length) return null;
  const board = state.board.slice();
  make(board, { index, flips }, state.turn);
  return resolveTurn({
    ...state,
    board,
    turn: other(state.turn),
    moves: [...state.moves, { row: p.row, col: p.col, player: state.turn }],
    flipped: flips.map(point),
    lastPassed: null,
  });
}
