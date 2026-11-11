import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Nine men's morris. Points 0–7 are the outer square clockwise from its top
 * left corner, 8–15 the middle square and 16–23 the inner one; the odd
 * points are the middles of the sides, joined across the squares.
 */
export const MEN = 9;
const ring = (p: number) => Math.floor(p / 8),
  spot = (p: number) => p % 8;
export const NEIGHBOURS = Array.from({ length: 24 }, (_, p) => {
  const base = ring(p) * 8,
    near = [base + ((spot(p) + 1) % 8), base + ((spot(p) + 7) % 8)];
  if (spot(p) % 2) {
    if (ring(p) > 0) near.push(p - 8);
    if (ring(p) < 2) near.push(p + 8);
  }
  return near;
});
export const MILLS: number[][] = [];
for (let r = 0; r < 3; r++) for (let s = 0; s < 8; s += 2) MILLS.push([r * 8 + s, r * 8 + s + 1, r * 8 + ((s + 2) % 8)]);
for (let s = 1; s < 8; s += 2) MILLS.push([s, s + 8, s + 16]);
/** Moves without a capture, once both sides are moving, after which the game is drawn. */
export const QUIET_LIMIT = 60;
export interface State {
  board: (0 | 1 | null)[];
  turn: 0 | 1;
  /** Men each side has put on the board so far. */
  placed: [number, number];
  ply: number;
  quiet: number;
  effect: Effect | null;
  winner: Winner;
}
export const createGame = (): State => ({
  board: Array(24).fill(null),
  turn: 0,
  placed: [0, 0],
  ply: 0,
  quiet: 0,
  effect: null,
  winner: null,
});
export const count = (state: State, player: 0 | 1) => state.board.filter((c) => c === player).length;
const inMill = (board: (0 | 1 | null)[], p: number) =>
  MILLS.some((mill) => mill.includes(p) && mill.every((q) => board[q] === board[p]));
/** Enemy men that may be taken: those outside mills, or any when all stand in mills. */
function takeable(board: (0 | 1 | null)[], enemy: 0 | 1) {
  const men = board.flatMap((c, p) => (c === enemy ? [p] : [])),
    free = men.filter((p) => !inMill(board, p));
  return free.length ? free : men;
}
/** Moves before the choice of a man to take. */
function steps(state: State, player: 0 | 1): [number, number][] {
  const { board } = state,
    empty = board.flatMap((c, p) => (c === null ? [p] : []));
  if (state.placed[player] < MEN) return empty.map((to) => [-1, to]);
  const men = board.flatMap((c, p) => (c === player ? [p] : []));
  // With three men left a side may fly to any empty point.
  return men.flatMap((from) => (men.length === 3 ? empty : NEIGHBOURS[from].filter((to) => board[to] === null)).map((to) => [from, to] as [number, number]));
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const me = state.turn,
    them = me === 0 ? 1 : 0,
    found: Move[] = [];
  for (const [from, to] of steps(state, me)) {
    const board = state.board.slice();
    if (from >= 0) board[from] = null;
    board[to] = me;
    const taken = inMill(board, to) ? takeable(board, them) : [];
    if (taken.length) for (const extra of taken) found.push({ from, to, extra });
    else found.push({ from, to, extra: -1 });
  }
  return found;
}
export function play(state: State, move: Move): State | null {
  if (!moves(state).some((m) => m.from === move.from && m.to === move.to && m.extra === move.extra)) return null;
  const me = state.turn,
    them = me === 0 ? 1 : 0,
    board = state.board.slice(),
    placed: [number, number] = [state.placed[0], state.placed[1]];
  if (move.from >= 0) board[move.from] = null;
  else placed[me]++;
  board[move.to] = me;
  if (move.extra >= 0) board[move.extra] = null;
  const moving = placed[0] === MEN && placed[1] === MEN,
    next: State = {
      board,
      turn: them,
      placed,
      ply: state.ply + 1,
      quiet: moving && move.extra < 0 ? state.quiet + 1 : 0,
      effect: {
        kind: move.from < 0 ? "place" : NEIGHBOURS[move.from].includes(move.to) ? "move" : "jump",
        from: move.from,
        to: move.to,
        converted: [],
        removed: move.extra >= 0 ? [move.extra] : [],
      },
      winner: null,
    };
  // A side that has placed all its men loses with fewer than three, or with no move.
  if (placed[them] === MEN && (board.filter((c) => c === them).length < 3 || !steps(next, them).length)) next.winner = me;
  else if (next.quiet >= QUIET_LIMIT) next.winner = "draw";
  return next;
}
/** Lines with two of a side's men and an empty third point. */
const threats = (board: (0 | 1 | null)[], player: 0 | 1) =>
  MILLS.filter((mill) => mill.filter((p) => board[p] === player).length === 2 && mill.some((p) => board[p] === null)).length;
export const morris: PointGame<State> = {
  create: createGame,
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.board,
  effect: (s) => s.effect,
  ply: (s) => s.ply,
  evaluate(s, player) {
    const other = player === 0 ? 1 : 0,
      men = (p: 0 | 1) => count(s, p) + (MEN - s.placed[p]);
    return (
      (men(player) - men(other)) * 12 +
      (threats(s.board, player) - threats(s.board, other)) * 3 +
      (steps(s, player).length - steps(s, other).length) * 0.2
    );
  },
  hint: (s) =>
    s.placed[s.turn] < MEN
      ? `빈 점에 말을 놓으세요 (남은 말 ${MEN - s.placed[s.turn]}개).`
      : count(s, s.turn) === 3
        ? "말이 셋 남았습니다. 어디로든 옮길 말을 고르세요."
        : "옮길 말을 고르세요.",
  tally: (s) => [0, 1].map((p) => `판 위 ${count(s, p as 0 | 1)} · 남은 말 ${MEN - s.placed[p]}`) as [string, string],
  reason: (s) =>
    s.winner === "draw"
      ? `${QUIET_LIMIT}수 동안 말을 떼지 못해 비겼습니다.`
      : count(s, s.turn) < 3
        ? "말이 둘만 남았습니다."
        : "더 움직일 수 없습니다.",
};
