export const SIZE = 15;
export type Player = 1 | 2;
export type Cell = 0 | Player;
export interface Point {
  row: number;
  col: number;
}
export interface Move extends Point {
  player: Player;
}
export interface State {
  board: Cell[][];
  turn: Player;
  moves: Move[];
  winner: Player | "draw" | null;
  line: Point[];
}
export const createGame = (): State => ({
  board: Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(0)),
  turn: 1,
  moves: [],
  winner: null,
  line: [],
});
export const inside = ({ row, col }: Point) =>
  Number.isInteger(row) &&
  Number.isInteger(col) &&
  row >= 0 &&
  col >= 0 &&
  row < SIZE &&
  col < SIZE;
export function winningLine(
  board: Cell[][],
  p: Point,
  player: Player,
): Point[] {
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    const line: Point[] = [p];
    for (const sign of [-1, 1]) {
      let row = p.row + dr * sign,
        col = p.col + dc * sign;
      while (inside({ row, col }) && board[row][col] === player) {
        if (sign < 0) line.unshift({ row, col });
        else line.push({ row, col });
        row += dr * sign;
        col += dc * sign;
      }
    }
    if (line.length >= 5) return line;
  }
  return [];
}
export function play(state: State, p: Point): State | null {
  if (state.winner !== null || !inside(p) || state.board[p.row][p.col] !== 0)
    return null;
  const board = state.board.map((row) => row.slice());
  board[p.row][p.col] = state.turn;
  const moves = [...state.moves, { ...p, player: state.turn }];
  const line = winningLine(board, p, state.turn);
  return {
    board,
    moves,
    line,
    turn: state.turn === 1 ? 2 : 1,
    winner: line.length
      ? state.turn
      : moves.length === SIZE * SIZE
        ? "draw"
        : null,
  };
}
/** Returns the state with the last `count` moves removed, rebuilt by legal replay. */
export function undo(state: State, count = 1): State | null {
  if (!Number.isInteger(count) || count < 1 || count > state.moves.length)
    return null;
  let next = createGame();
  for (const move of state.moves.slice(0, state.moves.length - count)) {
    const replayed = play(next, move);
    if (!replayed) return null;
    next = replayed;
  }
  return next;
}
