import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Hnefatafl, the Vikings' board game, on 11 × 11 squares. Twenty-four
 * attackers round the edges try to take the king; the king's twelve defenders
 * try to bring him to a corner. Every piece moves like a rook. A piece is
 * taken when it is shut in between two enemies along a line (a corner, and
 * the empty throne in the middle, count as enemies); the king is taken only
 * when attackers stand on all four sides of him, or three and the throne.
 * The attackers move first. Which side plays them is the state's `raider`:
 * side 1 unless the player has chosen to attack.
 */
export const N = 11,
  THRONE = 60,
  CORNERS = [0, 10, 110, 120],
  /** Moves in all, after which the game is drawn. */
  LIMIT = 300;
export type Piece = "a" | "d" | "k" | null;
export interface State {
  /** The side that plays the attackers. */
  raider: 0 | 1;
  board: Piece[];
  turn: 0 | 1;
  last: { from: number; to: number; taken: number[] } | null;
  winner: Winner;
  ply: number;
}
const at = (col: number, row: number) => row * N + col;
export function createGame(raider: 0 | 1 = 1): State {
  const board: Piece[] = Array(N * N).fill(null);
  for (let i = 3; i <= 7; i++) for (const [c, r] of [[i, 0], [i, 10], [0, i], [10, i]]) board[at(c, r)] = "a";
  for (const [c, r] of [[5, 1], [5, 9], [1, 5], [9, 5]]) board[at(c, r)] = "a";
  for (const [c, r] of [[5, 3], [4, 4], [5, 4], [6, 4], [3, 5], [4, 5], [6, 5], [7, 5], [4, 6], [5, 6], [6, 6], [5, 7]]) board[at(c, r)] = "d";
  board[THRONE] = "k";
  return { raider, board, turn: raider, last: null, winner: null, ply: 0 };
}
const STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** The square one step from `square` in direction (dc, dr), or −1 off the board. */
const step = (square: number, dc: number, dr: number) => {
  const c = (square % N) + dc,
    r = Math.floor(square / N) + dr;
  return c < 0 || c >= N || r < 0 || r >= N ? -1 : at(c, r);
};
const restricted = (square: number) => square === THRONE || CORNERS.includes(square);
/** Whose a piece is: the attackers' side or the defenders' (the king with them). */
const sideOf = (state: State, piece: Piece) => (piece === null ? null : piece === "a" ? state.raider : ((1 - state.raider) as 0 | 1));
/** Every square a piece on `from` can slide to: along a line until something stands in the way; only the king may stop on the throne or a corner. */
function reach(state: State, from: number): number[] {
  const king = state.board[from] === "k",
    out: number[] = [];
  for (const [dc, dr] of STEPS)
    for (let s = step(from, dc, dr); s >= 0 && state.board[s] === null; s = step(s, dc, dr)) if (king || !restricted(s)) out.push(s);
  return out;
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  return state.board.flatMap((piece, from) => (sideOf(state, piece) === state.turn ? reach(state, from).map((to) => ({ from, to, extra: -1 })) : []));
}
/** Whether `square` closes a sandwich against the enemies of `mover`: one of the mover's own (the king too), a corner, or the empty throne. */
const hostile = (state: State, square: number, mover: 0 | 1) =>
  square >= 0 && (sideOf(state, state.board[square]) === mover || CORNERS.includes(square) || (square === THRONE && state.board[THRONE] === null));
/** Whether the king is shut in: an attacker or the throne on every side (never at the edge). */
function kingTaken(state: State) {
  const king = state.board.indexOf("k");
  return STEPS.every(([dc, dr]) => {
    const s = step(king, dc, dr);
    return s >= 0 && (state.board[s] === "a" || s === THRONE);
  });
}
export function play(state: State, move: Move): State | null {
  if (move.extra !== -1 || state.winner !== null || !reach(state, move.from).includes(move.to) || sideOf(state, state.board[move.from]) !== state.turn) return null;
  const board = state.board.slice(),
    mover = state.turn,
    taken: number[] = [];
  board[move.to] = board[move.from];
  board[move.from] = null;
  const placed = { ...state, board };
  for (const [dc, dr] of STEPS) {
    const near = step(move.to, dc, dr),
      far = near >= 0 ? step(near, dc, dr) : -1,
      piece = near >= 0 ? board[near] : null;
    // The king is never taken by two; his own men are, and so are attackers.
    if (piece && piece !== "k" && sideOf(state, piece) !== mover && hostile(placed, far, mover)) taken.push(near);
  }
  for (const s of taken) board[s] = null;
  const next: State = { ...state, board, turn: (1 - mover) as 0 | 1, last: { from: move.from, to: move.to, taken }, ply: state.ply + 1 };
  const defenders = (1 - state.raider) as 0 | 1;
  if (CORNERS.includes(board.indexOf("k"))) return { ...next, winner: defenders };
  if (mover === state.raider && kingTaken(next)) return { ...next, winner: state.raider };
  if (!moves(next).length) return { ...next, winner: mover };
  if (next.ply >= LIMIT) return { ...next, winner: "draw" };
  return next;
}
/** The king's way out: how near he is to a corner, how free, how hemmed in; and the men left on each side. */
export function evaluate(state: State, player: 0 | 1) {
  const king = state.board.indexOf("k"),
    kc = king % N,
    kr = Math.floor(king / N),
    open = reach(state, king),
    // A corner the king could reach on his next move is nearly a win.
    corner = open.some((s) => CORNERS.includes(s)) ? 40 : 0,
    // Edge squares from which a corner lies in a straight free line.
    edges = open.filter((s) => {
      const c = s % N,
        r = Math.floor(s / N);
      return c === 0 || c === N - 1 || r === 0 || r === N - 1;
    }).length,
    near = Math.min(...CORNERS.map((s) => Math.abs((s % N) - kc) + Math.abs(Math.floor(s / N) - kr))),
    guards = STEPS.filter(([dc, dr]) => state.board[step(king, dc, dr)] === "a").length,
    men = state.board.filter((p) => p === "d").length,
    raiders = state.board.filter((p) => p === "a").length,
    forDefence = corner + edges * 6 + open.length * 0.6 - near * 0.8 - guards * 5 + men * 2.2 - raiders * 1.2;
  return player === state.raider ? -forDefence : forDefence;
}
const effect = (state: State): Effect | null =>
  state.last ? { kind: "move", from: state.last.from, to: state.last.to, converted: [], removed: state.last.taken } : null;
export const tafl: PointGame<State> = {
  create: (variant) => createGame(variant === "attackers" ? 0 : 1),
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.board.map((p) => sideOf(s, p)),
  // The king stands taller than his men.
  crowned: (s) => s.board.map((p) => p === "k"),
  effect,
  ply: (s) => s.ply,
  evaluate,
  hint: (s) => (s.turn === s.raider ? "공격하는 말을 고르세요. 말은 가로세로로 원하는 만큼 갑니다." : "왕이나 방어하는 말을 고르세요. 왕을 귀퉁이로 보내면 이깁니다."),
  tally: (s) => {
    const texts: [string, string] = [`공격 ${s.board.filter((p) => p === "a").length}`, `방어 ${s.board.filter((p) => p === "d").length} · 왕`];
    return s.raider ? [texts[1], texts[0]] : texts;
  },
  reason: (s) =>
    s.winner === "draw"
      ? `${LIMIT}수가 지나 비겼습니다.`
      : CORNERS.includes(s.board.indexOf("k"))
        ? "왕이 귀퉁이로 빠져나갔습니다."
        : s.winner === s.raider && kingTaken(s)
          ? "왕이 사방으로 둘러싸여 잡혔습니다."
          : "상대가 더 움직일 수 없습니다.",
};
