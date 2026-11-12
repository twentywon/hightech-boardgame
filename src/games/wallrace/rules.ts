import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * A race across a 9×9 board. Each side has a pawn and ten walls; a turn
 * either steps the pawn or sets a wall two squares long between the squares.
 * The first pawn to reach the far row wins. A wall may never shut a pawn off
 * from its goal altogether.
 */
export const N = 9,
  G = N - 1,
  CELLS = N * N,
  /** Points after the squares: walls lying across, then walls standing upright, by crossing. */
  H_BASE = CELLS,
  V_BASE = CELLS + G * G,
  WALLS = 10;
export interface State {
  pawns: [number, number];
  left: [number, number];
  /** Walls by crossing `row * 8 + col`: across (between rows) and upright (between columns). */
  h: boolean[];
  v: boolean[];
  turn: 0 | 1;
  winner: Winner;
  last: number | null;
  ply: number;
}
export const createGame = (): State => ({
  pawns: [(N - 1) * N + 4, 4],
  left: [WALLS, WALLS],
  h: Array(G * G).fill(false),
  v: Array(G * G).fill(false),
  turn: 0,
  winner: null,
  last: null,
  ply: 0,
});
const goalRow = (side: number) => (side === 0 ? 0 : N - 1);
const wallAt = (walls: boolean[], row: number, col: number) => row >= 0 && row < G && col >= 0 && col < G && walls[row * G + col];
/** Whether a step from a square to the neighbour `dr, dc` away is open. */
export function open(state: State, cell: number, dr: number, dc: number) {
  const r = Math.floor(cell / N),
    c = cell % N,
    nr = r + dr,
    nc = c + dc;
  if (nr < 0 || nr >= N || nc < 0 || nc >= N) return false;
  if (dr) {
    const row = Math.min(r, nr);
    return !wallAt(state.h, row, c) && !wallAt(state.h, row, c - 1);
  }
  const col = Math.min(c, nc);
  return !wallAt(state.v, r, col) && !wallAt(state.v, r - 1, col);
}
const STEPS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
/** Squares the pawn of `side` can reach in one move, jumping the other pawn where it stands in the way. */
export function steps(state: State, side: number) {
  const from = state.pawns[side],
    other = state.pawns[side ? 0 : 1],
    out: number[] = [];
  for (const [dr, dc] of STEPS) {
    if (!open(state, from, dr, dc)) continue;
    const next = from + dr * N + dc;
    if (next !== other) {
      out.push(next);
      continue;
    }
    // Straight over the other pawn, or to its sides when a wall or the edge stands behind it.
    if (open(state, other, dr, dc)) out.push(other + dr * N + dc);
    else for (const [sr, sc] of dr ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) if (open(state, other, sr, sc)) out.push(other + sr * N + sc);
  }
  return out;
}
/** Steps the pawn of `side` still needs to its goal row, ignoring the other pawn; Infinity when shut off. */
export function distance(state: State, side: number) {
  const goal = goalRow(side),
    seen = new Uint8Array(CELLS);
  let frontier = [state.pawns[side]],
    depth = 0;
  seen[frontier[0]] = 1;
  while (frontier.length) {
    const next: number[] = [];
    for (const cell of frontier) {
      if (Math.floor(cell / N) === goal) return depth;
      for (const [dr, dc] of STEPS)
        if (open(state, cell, dr, dc)) {
          const to = cell + dr * N + dc;
          if (!seen[to]) {
            seen[to] = 1;
            next.push(to);
          }
        }
    }
    frontier = next;
    depth++;
  }
  return Infinity;
}
/** The state with a wall set at a crossing, or null when it may not stand there. */
function withWall(state: State, across: boolean, crossing: number): State | null {
  const r = Math.floor(crossing / G),
    c = crossing % G;
  if (state.left[state.turn] <= 0 || state.h[crossing] || state.v[crossing]) return null;
  if (across ? wallAt(state.h, r, c - 1) || wallAt(state.h, r, c + 1) : wallAt(state.v, r - 1, c) || wallAt(state.v, r + 1, c)) return null;
  const h = state.h.slice(),
    v = state.v.slice();
  (across ? h : v)[crossing] = true;
  const next = { ...state, h, v };
  return distance(next, 0) === Infinity || distance(next, 1) === Infinity ? null : next;
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = steps(state, state.turn).map((to) => ({ from: -1, to, extra: -1 }));
  if (state.left[state.turn] > 0)
    for (let i = 0; i < G * G; i++) {
      if (withWall(state, true, i)) out.push({ from: -1, to: H_BASE + i, extra: -1 });
      if (withWall(state, false, i)) out.push({ from: -1, to: V_BASE + i, extra: -1 });
    }
  return out;
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to)) return null;
  const me = state.turn,
    turn = (me ? 0 : 1) as 0 | 1;
  if (move.to >= 0 && move.to < CELLS) {
    if (!steps(state, me).includes(move.to)) return null;
    const pawns: [number, number] = [state.pawns[0], state.pawns[1]];
    pawns[me] = move.to;
    return { ...state, pawns, turn, last: move.to, ply: state.ply + 1, winner: Math.floor(move.to / N) === goalRow(me) ? me : null };
  }
  if (move.to < H_BASE || move.to >= V_BASE + G * G) return null;
  const across = move.to < V_BASE,
    next = withWall(state, across, move.to - (across ? H_BASE : V_BASE));
  if (!next) return null;
  const left: [number, number] = [state.left[0], state.left[1]];
  left[me]--;
  return { ...next, left, turn, last: move.to, ply: state.ply + 1 };
}
/** Pawn steps, and only the walls near either pawn: the others seldom matter and are many. */
export function candidates(state: State): Move[] {
  const near = (crossing: number) =>
    state.pawns.some((pawn) => Math.abs(Math.floor(pawn / N) - Math.floor(crossing / G) - 0.5) <= 1.5 && Math.abs((pawn % N) - (crossing % G) - 0.5) <= 1.5);
  return moves(state).filter((m) => m.to < CELLS || near((m.to - H_BASE) % (G * G)));
}
export function evaluate(state: State, player: 0 | 1) {
  const other = player ? 0 : 1;
  return (distance(state, other) - distance(state, player)) * 10 + (state.left[player] - state.left[other]);
}
const effect = (state: State): Effect | null =>
  state.last === null ? null : { kind: "place", from: -1, to: state.last, converted: [], removed: [] };
export const wallRace: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  candidates,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => Array.from({ length: V_BASE + G * G }, (_, i) => (i === s.pawns[0] ? 0 : i === s.pawns[1] ? 1 : null)),
  effect,
  ply: (s) => s.ply,
  evaluate,
  hint: (s) => (s.left[s.turn] ? "말을 한 칸 옮기거나, 칸 사이를 눌러 벽을 놓으세요." : "벽을 다 썼습니다. 말을 옮기세요."),
  tally: (s) => [0, 1].map((p) => `남은 벽 ${s.left[p]}개 · 앞으로 ${distance(s, p)}칸`) as [string, string],
  reason: () => "맞은편 끝줄에 먼저 닿았습니다.",
};
