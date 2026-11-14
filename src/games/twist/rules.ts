import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Twist five: a 6×6 board of four 3×3 quarters. A turn places a marble and
 * then gives one quarter a quarter turn, either way. Five in a row wins.
 */
export const SIZE = 6,
  CELLS = SIZE * SIZE;
/** The eight turns come after the cells as points: quarter × 2 + (0 clockwise, 1 anticlockwise). */
export const TURN_BASE = CELLS;
export interface Twist {
  quarter: number;
  clockwise: boolean;
}
export const twistOf = (point: number): Twist => ({ quarter: (point - TURN_BASE) >> 1, clockwise: (point - TURN_BASE) % 2 === 0 });
export interface State {
  cells: (0 | 1 | null)[];
  turn: 0 | 1;
  winner: Winner;
  line: number[];
  /** The last move: where the marble went, and the quarter turned (none when the marble alone won). */
  last: { cell: number; twist: Twist | null } | null;
  ply: number;
}
export const createGame = (): State => ({ cells: Array(CELLS).fill(null), turn: 0, winner: null, line: [], last: null, ply: 0 });
/** The nine cells of a quarter, row by row; quarters are numbered 0 top left, 1 top right, 2 bottom left, 3 bottom right. */
export function quarterCells(quarter: number) {
  const r0 = quarter >> 1 ? 3 : 0,
    c0 = quarter % 2 ? 3 : 0,
    out: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push((r0 + r) * SIZE + c0 + c);
  return out;
}
/** The board after a quarter has been turned; seen from above, clockwise carries the top row to the right column. */
export function twisted(cells: (0 | 1 | null)[], { quarter, clockwise }: Twist) {
  const at = quarterCells(quarter),
    out = cells.slice();
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const to = clockwise ? c * 3 + (2 - r) : (2 - c) * 3 + r;
      out[at[to]] = cells[at[r * 3 + c]];
    }
  return out;
}
/** Every run of five cells on the board. */
export const LINES: number[][] = [];
for (let r = 0; r < SIZE; r++)
  for (let c = 0; c < SIZE; c++)
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ]) {
      const line: number[] = [];
      for (let k = 0; k < 5; k++) {
        const rr = r + dr * k,
          cc = c + dc * k;
        if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) break;
        line.push(rr * SIZE + cc);
      }
      if (line.length === 5) LINES.push(line);
    }
const fives = (cells: (0 | 1 | null)[], player: 0 | 1) => LINES.filter((line) => line.every((i) => cells[i] === player));
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = [];
  state.cells.forEach((cell, i) => {
    if (cell !== null) return;
    const placed = state.cells.slice();
    placed[i] = state.turn;
    // A marble that makes five wins where it lies: nothing is turned.
    if (fives(placed, state.turn).length) out.push({ from: -1, to: i, extra: -1 });
    else for (let t = 0; t < 8; t++) out.push({ from: -1, to: i, extra: TURN_BASE + t });
  });
  return out;
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || !Number.isInteger(move.to) || state.cells[move.to] !== null || move.to < 0 || move.to >= CELLS)
    return null;
  const me = state.turn,
    other = me ? 0 : 1,
    placed = state.cells.slice(),
    ply = state.ply + 1;
  placed[move.to] = me;
  const at = fives(placed, me);
  if (at.length) {
    if (move.extra !== -1) return null;
    return { cells: placed, turn: other, winner: me, line: [...new Set(at.flat())], last: { cell: move.to, twist: null }, ply };
  }
  if (!Number.isInteger(move.extra) || move.extra < TURN_BASE || move.extra >= TURN_BASE + 8) return null;
  const twist = twistOf(move.extra),
    cells = twisted(placed, twist),
    mine = fives(cells, me),
    theirs = fives(cells, other);
  return {
    cells,
    turn: other,
    // A turn that lines up five for both sides is a draw.
    winner: mine.length && theirs.length ? "draw" : mine.length ? me : theirs.length ? other : ply === CELLS ? "draw" : null,
    line: [...new Set([...mine, ...theirs].flat())],
    last: { cell: move.to, twist },
    ply,
  };
}
/** Turns that leave the same board are searched once. */
export function candidates(state: State): Move[] {
  const seen = new Set<string>(),
    out: Move[] = [];
  for (const move of moves(state)) {
    const next = play(state, move)!,
      key = next.cells.map((c) => (c === null ? "." : c)).join("");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(move);
  }
  return out;
}
/** Lines that only one side stands on count for it, far more the fuller they are. */
export function evaluate(state: State, player: 0 | 1) {
  let score = 0;
  for (const line of LINES) {
    let mine = 0,
      theirs = 0;
    for (const i of line) {
      if (state.cells[i] === player) mine++;
      else if (state.cells[i] !== null) theirs++;
    }
    if (!theirs) score += [0, 1, 4, 12, 40][mine] ?? 0;
    if (!mine) score -= [0, 1, 4, 12, 40][theirs] ?? 0;
  }
  return score;
}
const effect = (state: State): Effect | null =>
  state.last ? { kind: "place", from: -1, to: state.last.cell, converted: [], removed: [] } : null;
export const twist: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  candidates,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => [...s.cells, ...Array(8).fill(null)],
  effect,
  ply: (s) => s.ply,
  evaluate,
  hint: () => "구슬을 놓을 자리를 고르세요.",
  tally: (s) => [0, 1].map((p) => `구슬 ${s.cells.filter((c) => c === p).length}개`) as [string, string],
  reason: (s) =>
    s.winner === "draw" ? (s.line.length ? "돌린 뒤 양쪽 모두 다섯이 이어졌습니다." : "판이 가득 찼습니다.") : "다섯 개가 한 줄로 이어졌습니다.",
};
