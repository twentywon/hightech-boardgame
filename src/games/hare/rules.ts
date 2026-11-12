import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Hare and hounds: three hounds try to pen the hare in; the hare tries to
 * slip past them. Eleven points: one at each end and a 3×3 block between.
 * Side 0 plays the hounds and moves first; side 1 plays the hare.
 */
export interface Place {
  /** Column 0 (the hounds' end) to 4 (the hare's end), and row 0–2. */
  col: number;
  row: number;
}
export const PLACES: Place[] = [
  { col: 0, row: 1 },
  ...[1, 2, 3].flatMap((col) => [0, 1, 2].map((row) => ({ col, row }))),
  { col: 4, row: 1 },
];
const index = (col: number, row: number) => PLACES.findIndex((p) => p.col === col && p.row === row);
/** The lines of the board, as pairs of points. */
export const LINKS: [number, number][] = [];
const link = (a: number, b: number) => LINKS.push([a, b]);
for (const row of [0, 1, 2]) {
  link(0, index(1, row));
  link(index(3, row), 10);
  for (const col of [1, 2]) link(index(col, row), index(col + 1, row));
}
for (const col of [1, 2, 3]) for (const row of [0, 1]) link(index(col, row), index(col, row + 1));
// The slanted lines meet in the middle of the board.
for (const [col, row] of [
  [1, 0],
  [1, 2],
  [3, 0],
  [3, 2],
])
  link(index(2, 1), index(col, row));
export const NEIGHBOURS: number[][] = PLACES.map((_, i) => LINKS.flatMap(([a, b]) => (a === i ? [b] : b === i ? [a] : [])));
/** Moves in a row by which the hounds only shuffle up and down before the hare is let go. */
export const STALL_LIMIT = 10;
export interface State {
  hounds: number[];
  hare: number;
  turn: 0 | 1;
  winner: Winner;
  /** Hound moves in a row that did not advance. */
  stall: number;
  last: { from: number; to: number } | null;
  ply: number;
}
export const createGame = (): State => ({ hounds: [0, index(1, 0), index(1, 2)], hare: 10, turn: 0, winner: null, stall: 0, last: null, ply: 0 });
const occupied = (state: State, point: number) => state.hare === point || state.hounds.includes(point);
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const free = (from: number) => NEIGHBOURS[from].filter((to) => !occupied(state, to));
  if (state.turn === 1) return free(state.hare).map((to) => ({ from: state.hare, to, extra: -1 }));
  // A hound never goes back toward its own end.
  return state.hounds.flatMap((from) => free(from).filter((to) => PLACES[to].col >= PLACES[from].col).map((to) => ({ from, to, extra: -1 })));
}
export function play(state: State, move: Move): State | null {
  if (!moves(state).some((m) => m.from === move.from && m.to === move.to) || move.extra !== -1) return null;
  const next: State = { ...state, hounds: state.hounds.slice(), last: { from: move.from, to: move.to }, ply: state.ply + 1, turn: state.turn ? 0 : 1 };
  if (state.turn === 1) next.hare = move.to;
  else {
    next.hounds[next.hounds.indexOf(move.from)] = move.to;
    next.stall = PLACES[move.to].col > PLACES[move.from].col ? 0 : state.stall + 1;
  }
  const hareCol = PLACES[next.hare].col;
  // Past every hound, the hare can no longer be caught.
  if (next.hounds.every((h) => PLACES[h].col > hareCol) || next.stall >= STALL_LIMIT) next.winner = 1;
  else if (!moves({ ...next, winner: null }).length) next.winner = next.turn === 1 ? 0 : 1;
  return next;
}
/** The hare wants room and to be near the hounds' end; the hounds want the opposite. */
export function evaluate(state: State, player: 0 | 1) {
  const room = NEIGHBOURS[state.hare].filter((to) => !occupied(state, to)).length,
    behind = state.hounds.filter((h) => PLACES[h].col > PLACES[state.hare].col).length,
    forHare = room * 3 + (4 - PLACES[state.hare].col) * 2 + behind * 8 + state.stall;
  return player === 1 ? forHare : -forHare;
}
const effect = (state: State): Effect | null =>
  state.last ? { kind: "move", from: state.last.from, to: state.last.to, converted: [], removed: [] } : null;
export const hare: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => PLACES.map((_, i) => (s.hounds.includes(i) ? 0 : s.hare === i ? 1 : null)),
  effect,
  ply: (s) => s.ply,
  evaluate,
  hint: (s) => (s.turn === 0 ? "움직일 사냥개를 고르세요." : "토끼를 고른 뒤 갈 곳을 고르세요."),
  tally: (s) => ["세 마리", s.stall ? `제자리걸음 ${s.stall} / ${STALL_LIMIT}` : "한 마리"],
  reason: (s) =>
    s.winner === 0
      ? "토끼가 갈 곳이 없습니다."
      : s.stall >= STALL_LIMIT
        ? `사냥개가 ${STALL_LIMIT}번 잇달아 나아가지 못했습니다.`
        : "토끼가 사냥개를 모두 지나쳤습니다.",
};
