import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Four in a row: discs are dropped into the seven columns of an upright
 * rack and fall to the lowest free place. Four of one colour in a line,
 * across, up or diagonally, win.
 */
export const COLS = 7,
  ROWS = 6;
export interface State {
  /** Cell `row * COLS + col`; row 0 is the bottom. */
  cells: (0 | 1 | null)[];
  turn: 0 | 1;
  winner: Winner;
  /** The four (or more) cells that won. */
  line: number[];
  last: number | null;
  ply: number;
}
export const createGame = (): State => ({ cells: Array(COLS * ROWS).fill(null), turn: 0, winner: null, line: [], last: null, ply: 0 });
/** The lowest free row of a column, or -1 when it is full. */
export function freeRow(state: State, col: number) {
  for (let row = 0; row < ROWS; row++) if (state.cells[row * COLS + col] === null) return row;
  return -1;
}
const WAYS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];
/** Every run of four cells on the rack. */
export const LINES: number[][] = [];
for (let row = 0; row < ROWS; row++)
  for (let col = 0; col < COLS; col++)
    for (const [dc, dr] of WAYS) {
      const line: number[] = [];
      for (let k = 0; k < 4; k++) {
        const c = col + dc * k,
          r = row + dr * k;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) break;
        line.push(r * COLS + c);
      }
      if (line.length === 4) LINES.push(line);
    }
// Middle columns first: they belong to the most lines.
const ORDER = [3, 2, 4, 1, 5, 0, 6];
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  return ORDER.filter((col) => freeRow(state, col) >= 0).map((col) => ({ from: -1, to: col, extra: -1 }));
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to) || move.to < 0 || move.to >= COLS) return null;
  const row = freeRow(state, move.to);
  if (row < 0) return null;
  const cells = state.cells.slice(),
    at = row * COLS + move.to;
  cells[at] = state.turn;
  const won = LINES.filter((line) => line.includes(at) && line.every((i) => cells[i] === state.turn)),
    ply = state.ply + 1;
  return {
    cells,
    turn: state.turn ? 0 : 1,
    winner: won.length ? state.turn : ply === COLS * ROWS ? "draw" : null,
    line: [...new Set(won.flat())],
    last: at,
    ply,
  };
}
/** Lines still open to one side count for it, more the fuller they are; the middle column counts a little. */
export function evaluate(state: State, player: 0 | 1) {
  let score = 0;
  for (const line of LINES) {
    let mine = 0,
      theirs = 0;
    for (const i of line) {
      if (state.cells[i] === player) mine++;
      else if (state.cells[i] !== null) theirs++;
    }
    if (!theirs) score += [0, 1, 4, 18][mine] ?? 0;
    if (!mine) score -= [0, 1, 4, 18][theirs] ?? 0;
  }
  for (let row = 0; row < ROWS; row++) {
    const centre = state.cells[row * COLS + 3];
    if (centre !== null) score += centre === player ? 2 : -2;
  }
  return score;
}
const effect = (state: State): Effect | null =>
  state.last === null ? null : { kind: "place", from: -1, to: state.last, converted: [], removed: [] };
export const fourRow: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.cells,
  effect,
  ply: (s) => s.ply,
  evaluate,
  hint: () => "원반을 떨어뜨릴 줄을 고르세요.",
  tally: (s) => [0, 1].map((p) => `원반 ${s.cells.filter((c) => c === p).length}개`) as [string, string],
  reason: (s) => (s.winner === "draw" ? "판이 가득 찼습니다." : "네 개가 한 줄로 이어졌습니다."),
};
