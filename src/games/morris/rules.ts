import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Nine men's morris. Points 0–7 are the outer square clockwise from its top
 * left corner, 8–15 the middle square and 16–23 the inner one; the odd
 * points are the middles of the sides, joined across the squares.
 */
export const MEN = 9;
const ring = (p: number) => Math.floor(p / 8),
  spot = (p: number) => p % 8;
/** Lines of the board: with `diagonals` the corners of the squares are joined as well (참고누). */
function lay(diagonals: boolean) {
  const near = Array.from({ length: 24 }, (_, p) => {
    const base = ring(p) * 8,
      links = [base + ((spot(p) + 1) % 8), base + ((spot(p) + 7) % 8)];
    if (spot(p) % 2 || diagonals) {
      if (ring(p) > 0) links.push(p - 8);
      if (ring(p) < 2) links.push(p + 8);
    }
    return links;
  });
  const mills: number[][] = [];
  for (let r = 0; r < 3; r++) for (let s = 0; s < 8; s += 2) mills.push([r * 8 + s, r * 8 + s + 1, r * 8 + ((s + 2) % 8)]);
  for (let s = diagonals ? 0 : 1; s < 8; s += diagonals ? 1 : 2) mills.push([s, s + 8, s + 16]);
  return { near, mills };
}
const PLAIN = lay(false),
  CROSSED = lay(true);
export const NEIGHBOURS = PLAIN.near,
  MILLS = PLAIN.mills,
  CROSSED_MILLS = CROSSED.mills;
const layout = (state: { diagonals: boolean }) => (state.diagonals ? CROSSED : PLAIN);
/** Moves without a capture, once both sides are moving, after which the game is drawn. */
export const QUIET_LIMIT = 60;
export interface State {
  /** Men each side has to place, and whether the corners are joined. */
  men: number;
  diagonals: boolean;
  board: (0 | 1 | null)[];
  turn: 0 | 1;
  /** Men each side has put on the board so far. */
  placed: [number, number];
  ply: number;
  quiet: number;
  effect: Effect | null;
  winner: Winner;
}
export const createGame = (men = MEN, diagonals = false): State => ({
  men,
  diagonals,
  board: Array(24).fill(null),
  turn: 0,
  placed: [0, 0],
  ply: 0,
  quiet: 0,
  effect: null,
  winner: null,
});
export const count = (state: State, player: 0 | 1) => state.board.filter((c) => c === player).length;
const inMill = (board: (0 | 1 | null)[], p: number, mills: number[][]) =>
  mills.some((mill) => mill.includes(p) && mill.every((q) => board[q] === board[p]));
/** Enemy men that may be taken: those outside mills, or any when all stand in mills. */
function takeable(board: (0 | 1 | null)[], enemy: 0 | 1, mills: number[][]) {
  const men = board.flatMap((c, p) => (c === enemy ? [p] : [])),
    free = men.filter((p) => !inMill(board, p, mills));
  return free.length ? free : men;
}
/** Moves before the choice of a man to take. */
function steps(state: State, player: 0 | 1): [number, number][] {
  const { board } = state,
    empty = board.flatMap((c, p) => (c === null ? [p] : []));
  if (state.placed[player] < state.men) return empty.map((to) => [-1, to]);
  const men = board.flatMap((c, p) => (c === player ? [p] : []));
  // With three men left a side may fly to any empty point.
  return men.flatMap((from) => (men.length === 3 ? empty : layout(state).near[from].filter((to) => board[to] === null)).map((to) => [from, to] as [number, number]));
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
    const { mills } = layout(state),
      taken = inMill(board, to, mills) ? takeable(board, them, mills) : [];
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
  const moving = placed[0] === state.men && placed[1] === state.men,
    next: State = {
      men: state.men,
      diagonals: state.diagonals,
      board,
      turn: them,
      placed,
      ply: state.ply + 1,
      quiet: moving && move.extra < 0 ? state.quiet + 1 : 0,
      effect: {
        kind: move.from < 0 ? "place" : layout(state).near[move.from].includes(move.to) ? "move" : "jump",
        from: move.from,
        to: move.to,
        converted: [],
        removed: move.extra >= 0 ? [move.extra] : [],
      },
      winner: null,
    };
  // A side that has placed all its men loses with fewer than three, or with no move.
  // With twelve men the board can fill up before anyone moves: that is a draw.
  if (moving && !board.includes(null)) next.winner = "draw";
  else if (placed[them] === state.men && (board.filter((c) => c === them).length < 3 || !steps(next, them).length)) next.winner = me;
  else if (next.quiet >= QUIET_LIMIT) next.winner = "draw";
  return next;
}
/** Lines with two of a side's men and an empty third point. */
const threats = (board: (0 | 1 | null)[], player: 0 | 1, mills: number[][]) =>
  mills.filter((mill) => mill.filter((p) => board[p] === player).length === 2 && mill.some((p) => board[p] === null)).length;
export const morris: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.board,
  effect: (s) => s.effect,
  ply: (s) => s.ply,
  evaluate(s, player) {
    const other = player === 0 ? 1 : 0,
      men = (p: 0 | 1) => count(s, p) + (s.men - s.placed[p]),
      { mills } = layout(s);
    return (
      (men(player) - men(other)) * 12 +
      (threats(s.board, player, mills) - threats(s.board, other, mills)) * 3 +
      (steps(s, player).length - steps(s, other).length) * 0.2
    );
  },
  hint: (s) =>
    s.placed[s.turn] < s.men
      ? `빈 점에 말을 놓으세요 (남은 말 ${s.men - s.placed[s.turn]}개).`
      : count(s, s.turn) === 3
        ? "말이 셋 남았습니다. 어디로든 옮길 말을 고르세요."
        : "옮길 말을 고르세요.",
  tally: (s) => [0, 1].map((p) => `판 위 ${count(s, p as 0 | 1)} · 남은 말 ${s.men - s.placed[p]}`) as [string, string],
  reason: (s) =>
    s.winner === "draw"
      ? s.board.includes(null)
        ? `${QUIET_LIMIT}수 동안 말을 떼지 못해 비겼습니다.`
        : "판이 가득 찼습니다."
      : count(s, s.turn) < 3
        ? "말이 둘만 남았습니다."
        : "더 움직일 수 없습니다.",
};
