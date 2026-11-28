import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Checkers on the dark squares of an 8×8 board, squares row by row from the
 * far side. The first player starts on the near three rows and moves up the
 * board. Captures are compulsory and a piece keeps jumping while it can.
 */
export const QUIET_LIMIT = 80;
export interface State {
  board: (0 | 1 | null)[];
  kings: boolean[];
  turn: 0 | 1;
  ply: number;
  /** The piece that has jumped and must go on jumping. */
  must: number | null;
  quiet: number;
  effect: Effect | null;
  winner: Winner;
}
const dark = (square: number) => (Math.floor(square / 8) + (square % 8)) % 2 === 1;
export function createGame(): State {
  const board: (0 | 1 | null)[] = Array(64).fill(null);
  for (let s = 0; s < 64; s++) if (dark(s)) board[s] = s < 24 ? 1 : s >= 40 ? 0 : null;
  return { board, kings: Array(64).fill(false), turn: 0, ply: 0, must: null, quiet: 0, effect: null, winner: null };
}
export const count = (state: State, player: 0 | 1) => state.board.filter((c) => c === player).length;
/** Steps and jumps of the piece on `from`: [to, captured square or -1]. */
function reach(state: State, from: number): [number, number][] {
  const me = state.board[from]!,
    row = Math.floor(from / 8),
    col = from % 8,
    forward = me === 0 ? -1 : 1,
    out: [number, number][] = [];
  for (const dr of state.kings[from] ? [-1, 1] : [forward])
    for (const dc of [-1, 1]) {
      const r1 = row + dr,
        c1 = col + dc,
        r2 = row + dr * 2,
        c2 = col + dc * 2;
      if (r1 < 0 || r1 > 7 || c1 < 0 || c1 > 7) continue;
      const near = state.board[r1 * 8 + c1];
      if (near === null) out.push([r1 * 8 + c1, -1]);
      else if (near !== me && r2 >= 0 && r2 <= 7 && c2 >= 0 && c2 <= 7 && state.board[r2 * 8 + c2] === null)
        out.push([r2 * 8 + c2, r1 * 8 + c1]);
    }
  return out;
}
function options(state: State): [number, number, number][] {
  const pieces = state.must !== null ? [state.must] : state.board.flatMap((c, s) => (c === state.turn ? [s] : [])),
    all = pieces.flatMap((from) => reach(state, from).map(([to, taken]) => [from, to, taken] as [number, number, number])),
    jumps = all.filter(([, , taken]) => taken >= 0);
  // A capture must be made when there is one.
  return jumps.length || state.must !== null ? jumps : all;
}
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : options(state).map(([from, to]) => ({ from, to, extra: -1 }));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1) return null;
  const chosen = options(state).find(([from, to]) => from === move.from && to === move.to);
  if (!chosen) return null;
  const [from, to, taken] = chosen,
    me = state.turn,
    them = me === 0 ? 1 : 0,
    board = state.board.slice(),
    kings = state.kings.slice();
  board[to] = me;
  kings[to] = kings[from];
  board[from] = null;
  kings[from] = false;
  if (taken >= 0) {
    board[taken] = null;
    kings[taken] = false;
  }
  const crowned = !kings[to] && Math.floor(to / 8) === (me === 0 ? 0 : 7);
  if (crowned) kings[to] = true;
  const next: State = {
    board,
    kings,
    turn: me,
    ply: state.ply + 1,
    must: null,
    quiet: taken >= 0 ? 0 : state.quiet + 1,
    effect: { kind: taken >= 0 ? "jump" : "move", from, to, converted: [], removed: taken >= 0 ? [taken] : [] },
    winner: null,
  };
  // The same piece jumps on, unless it has just been crowned.
  if (taken >= 0 && !crowned && reach(next, to).some(([, t]) => t >= 0)) next.must = to;
  else next.turn = them;
  if (!options(next).length) next.winner = next.turn === me ? them : me;
  else if (next.quiet >= QUIET_LIMIT) next.winner = "draw";
  return next;
}
export const checkers: PointGame<State> = {
  create: createGame,
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.board,
  crowned: (s) => s.kings,
  effect: (s) => s.effect,
  ply: (s) => s.ply,
  evaluate(s, player) {
    let score = 0;
    s.board.forEach((owner, square) => {
      if (owner === null) return;
      const row = Math.floor(square / 8),
        worth = s.kings[square] ? 5 : 3 + (owner === 0 ? 7 - row : row) * 0.1;
      score += owner === player ? worth : -worth;
    });
    return score;
  },
  hint: (s) =>
    s.must !== null
      ? "같은 말로 계속 뛰어넘으세요."
      : options(s).some(([, , taken]) => taken >= 0)
        ? "잡을 수 있으면 반드시 잡아야 합니다. 말을 고르세요."
        : "옮길 말을 고르세요.",
  tally: (s) => [0, 1].map((p) => `말 ${count(s, p as 0 | 1)} · 왕 ${s.board.filter((c, i) => c === p && s.kings[i]).length}`) as [string, string],
  reason: (s) =>
    s.winner === "draw" ? `${QUIET_LIMIT}수 동안 말을 잡지 못해 비겼습니다.` : count(s, s.turn) ? "더 움직일 수 없습니다." : "말을 모두 잡았습니다.",
};
