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
  /** When set, a stone that makes two open threes at once may not be played. */
  noDoubleThree?: boolean;
}
export const createGame = (noDoubleThree = false): State => ({
  board: Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(0)),
  turn: 1,
  moves: [],
  winner: null,
  line: [],
  ...(noDoubleThree ? { noDoubleThree } : {}),
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
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];
/**
 * Whether the stone at the middle of `line` (nine cells along one direction;
 * 0 empty, 1 own, 2 blocked) belongs to an open three: three stones that one
 * more would turn into four in a row open at both ends.
 */
function openThree(line: number[]): boolean {
  const run = (cells: number[]) => {
    let from = 4,
      to = 4;
    while (cells[from - 1] === 1) from--;
    while (cells[to + 1] === 1) to++;
    return { from, to, length: to - from + 1 };
  };
  // Already a four (one stone from five): not a three.
  for (let i = 0; i < 9; i++)
    if (line[i] === 0) {
      const next = line.slice();
      next[i] = 1;
      if (run(next).length >= 5) return false;
    }
  for (let i = 0; i < 9; i++)
    if (line[i] === 0) {
      const next = line.slice();
      next[i] = 1;
      const { from, to, length } = run(next);
      if (length === 4 && next[from - 1] === 0 && next[to + 1] === 0) return true;
    }
  return false;
}
/** Whether a stone of `player` at the empty point `p` would make two open threes (삼삼). */
export function doubleThree(board: Cell[][], p: Point, player: Player): boolean {
  let threes = 0;
  for (const [dr, dc] of DIRECTIONS) {
    const line: number[] = [];
    for (let k = -4; k <= 4; k++) {
      const at = { row: p.row + dr * k, col: p.col + dc * k };
      line.push(k === 0 ? 1 : !inside(at) ? 2 : board[at.row][at.col] === 0 ? 0 : board[at.row][at.col] === player ? 1 : 2);
    }
    if (openThree(line) && ++threes > 1) return true;
  }
  return false;
}
export function play(state: State, p: Point): State | null {
  if (state.winner !== null || !inside(p) || state.board[p.row][p.col] !== 0)
    return null;
  // Five in a row wins even where the double three would be refused.
  if (state.noDoubleThree && doubleThree(state.board, p, state.turn)) {
    const trial = state.board.map((row) => row.slice());
    trial[p.row][p.col] = state.turn;
    if (!winningLine(trial, p, state.turn).length) return null;
  }
  const board = state.board.map((row) => row.slice());
  board[p.row][p.col] = state.turn;
  const moves = [...state.moves, { ...p, player: state.turn }];
  const line = winningLine(board, p, state.turn);
  return {
    ...(state.noDoubleThree ? { noDoubleThree: true } : {}),
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
  let next = createGame(state.noDoubleThree);
  for (const move of state.moves.slice(0, state.moves.length - count)) {
    const replayed = play(next, move);
    if (!replayed) return null;
    next = replayed;
  }
  return next;
}
