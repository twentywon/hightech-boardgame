import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Gonu: traditional Korean games drawn on the ground. A piece moves one
 * step along a line to an empty point; each board adds its own rules.
 *
 * - well (우물고누): five points, two pieces each. Whoever cannot move loses.
 *   The first move may not be one that already shuts the other side in.
 * - line (네줄고누): a 4×4 grid, four pieces each. A piece that moves so that
 *   an enemy stands between it and another of its side, in a row, takes it.
 * - pumpkin (호박고누): three pieces each start in their home row and come out
 *   into the round field; none may go back home or into the other home.
 *   Whoever cannot move loses.
 */
export type Variant = "well" | "line" | "pumpkin";
export const VARIANTS: Variant[] = ["well", "line", "pumpkin"];
interface Board {
  /** Points joined to each point by a line. */
  near: number[][];
  start: [number[], number[]];
  /** Home points of each side (pumpkin only). */
  homes: [number[], number[]];
}
const link = (count: number, lines: [number, number][]) => {
  const near: number[][] = Array.from({ length: count }, () => []);
  for (const [a, b] of lines) {
    near[a].push(b);
    near[b].push(a);
  }
  return near;
};
/** Lines of each board, also used to draw it. */
export const LINES: Record<Variant, [number, number][]> = {
  // 0 top left, 1 top right, 2 bottom left, 3 bottom right, 4 centre. The well lies between 1 and 3.
  well: [[0, 1], [0, 2], [2, 3], [0, 4], [1, 4], [2, 4], [3, 4]],
  // Row by row from the far side.
  line: Array.from({ length: 16 }, (_, i) => i).flatMap((i) => [
    ...(i % 4 < 3 ? [[i, i + 1] as [number, number]] : []),
    ...(i < 12 ? [[i, i + 4] as [number, number]] : []),
  ]),
  // 0–2 far home, 3 north, 4 east, 5 south, 6 west, 7 centre, 8–10 near home.
  pumpkin: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 3], [7, 3], [7, 4], [7, 5], [7, 6], [5, 9], [8, 9], [9, 10]],
};
const BOARDS: Record<Variant, Board> = {
  well: { near: link(5, LINES.well), start: [[2, 3], [0, 1]], homes: [[], []] },
  line: { near: link(16, LINES.line), start: [[12, 13, 14, 15], [0, 1, 2, 3]], homes: [[], []] },
  pumpkin: { near: link(11, LINES.pumpkin), start: [[8, 9, 10], [0, 1, 2]], homes: [[8, 9, 10], [0, 1, 2]] },
};
/** Moves without a capture after which a game that can go on for ever is drawn. */
export const QUIET_LIMIT = 80;
export interface State {
  variant: Variant;
  board: (0 | 1 | null)[];
  turn: 0 | 1;
  ply: number;
  quiet: number;
  effect: Effect | null;
  winner: Winner;
}
export function createGame(variant: string = "well"): State {
  const v = (VARIANTS as string[]).includes(variant) ? (variant as Variant) : "well",
    { near, start } = BOARDS[v],
    board: (0 | 1 | null)[] = near.map(() => null);
  start.forEach((points, player) => points.forEach((p) => (board[p] = player as 0 | 1)));
  return { variant: v, board, turn: 0, ply: 0, quiet: 0, effect: null, winner: null };
}
export const count = (state: State, player: 0 | 1) => state.board.filter((c) => c === player).length;
function steps(variant: Variant, board: (0 | 1 | null)[], player: 0 | 1): [number, number][] {
  const { near, homes } = BOARDS[variant],
    mine = homes[player],
    theirs = homes[player === 0 ? 1 : 0],
    found: [number, number][] = [];
  board.forEach((owner, from) => {
    if (owner !== player) return;
    for (const to of near[from]) {
      if (board[to] !== null || theirs.includes(to)) continue;
      // A piece that has left home does not go back.
      if (mine.includes(to) && !mine.includes(from)) continue;
      found.push([from, to]);
    }
  });
  return found;
}
/** Enemy pieces taken by a piece that has just arrived on `to` (line gonu). */
function taken(board: (0 | 1 | null)[], to: number, me: 0 | 1) {
  const them = me === 0 ? 1 : 0,
    row = Math.floor(to / 4),
    col = to % 4,
    out: number[] = [];
  for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const r1 = row + dr,
      c1 = col + dc,
      r2 = row + dr * 2,
      c2 = col + dc * 2;
    if (r2 < 0 || r2 > 3 || c2 < 0 || c2 > 3) continue;
    if (board[r1 * 4 + c1] === them && board[r2 * 4 + c2] === me) out.push(r1 * 4 + c1);
  }
  return out;
}
function apply(state: State, from: number, to: number) {
  const me = state.turn,
    board = state.board.slice();
  board[from] = null;
  board[to] = me;
  const removed = state.variant === "line" ? taken(board, to, me) : [];
  for (const p of removed) board[p] = null;
  return { board, removed };
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const me = state.turn,
    them = me === 0 ? 1 : 0;
  return steps(state.variant, state.board, me)
    .filter(([from, to]) => {
      // Well gonu: the opening move may not leave the other side without a move.
      if (state.variant !== "well" || state.ply > 0) return true;
      return steps("well", apply(state, from, to).board, them).length > 0;
    })
    .map(([from, to]) => ({ from, to, extra: -1 }));
}
export function play(state: State, move: Move): State | null {
  if (move.extra !== -1 || !moves(state).some((m) => m.from === move.from && m.to === move.to)) return null;
  const me = state.turn,
    them = me === 0 ? 1 : 0,
    { board, removed } = apply(state, move.from, move.to),
    quiet = removed.length ? 0 : state.quiet + 1,
    left = board.filter((c) => c === them).length;
  return {
    variant: state.variant,
    board,
    turn: them,
    ply: state.ply + 1,
    quiet,
    effect: { kind: "move", from: move.from, to: move.to, converted: [], removed },
    winner:
      (state.variant === "line" && left <= 1) || !steps(state.variant, board, them).length
        ? me
        : quiet >= QUIET_LIMIT
          ? "draw"
          : null,
  };
}
export const NAMES: Record<Variant, string> = { well: "우물고누", line: "네줄고누", pumpkin: "호박고누" };
export const gonu: PointGame<State> = {
  create: createGame,
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.board,
  effect: (s) => s.effect,
  ply: (s) => s.ply,
  evaluate(s, player) {
    const other = player === 0 ? 1 : 0;
    return (
      (count(s, player) - count(s, other)) * 10 +
      steps(s.variant, s.board, player).length -
      steps(s.variant, s.board, other).length
    );
  },
  hint: () => "옮길 말을 고르세요.",
  tally: (s) => [`말 ${count(s, 0)}개`, `말 ${count(s, 1)}개`],
  reason: (s) =>
    s.winner === "draw"
      ? `${QUIET_LIMIT}수 동안 승부가 나지 않아 비겼습니다.`
      : s.variant === "line" && count(s, s.turn) <= 1
        ? "말이 하나만 남았습니다."
        : "더 움직일 수 없습니다.",
};
