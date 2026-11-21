import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Mancala (Kalah): six pits a side with four stones each, and a store each.
 * Pits 0–5 and store 6 are the first player's, pits 7–12 and store 13 the
 * second's; stones are sown anticlockwise in index order.
 */
export const PITS = 6,
  STONES = 4;
export const STORE = [PITS, PITS * 2 + 1];
export interface State {
  board: number[];
  turn: 0 | 1;
  ply: number;
  /** The pit last emptied, where each of its stones went, and stones captured. */
  sown: { pit: number; path: number[]; captured: number[] } | null;
  effect: Effect | null;
  winner: Winner;
}
export const createGame = (): State => ({
  board: Array.from({ length: 14 }, (_, i) => (STORE.includes(i) ? 0 : STONES)),
  turn: 0,
  ply: 0,
  sown: null,
  effect: null,
  winner: null,
});
const pitsOf = (player: number) => Array.from({ length: PITS }, (_, i) => player * (PITS + 1) + i);
export const moves = (state: State): Move[] =>
  state.winner !== null
    ? []
    : pitsOf(state.turn).filter((pit) => state.board[pit] > 0).map((to) => ({ from: -1, to, extra: -1 }));
export function play(state: State, move: Move): State | null {
  const pit = move.to,
    me = state.turn,
    them = me === 0 ? 1 : 0;
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !pitsOf(me).includes(pit) || !state.board[pit]) return null;
  const board = state.board.slice(),
    path: number[] = [];
  let stones = board[pit],
    at = pit;
  board[pit] = 0;
  while (stones > 0) {
    at = (at + 1) % 14;
    // The other side's store is passed over.
    if (at === STORE[them]) continue;
    board[at]++;
    path.push(at);
    stones--;
  }
  // The last stone in an empty pit of one's own takes it and the pit opposite.
  const captured: number[] = [],
    opposite = 12 - at;
  if (pitsOf(me).includes(at) && board[at] === 1 && board[opposite] > 0) {
    captured.push(at, opposite);
    board[STORE[me]] += board[at] + board[opposite];
    board[at] = board[opposite] = 0;
  }
  let winner: Winner = null;
  // When one side is empty the other keeps what is left in its pits.
  if ([0, 1].some((p) => pitsOf(p).every((i) => board[i] === 0))) {
    for (const p of [0, 1])
      for (const i of pitsOf(p)) {
        board[STORE[p]] += board[i];
        board[i] = 0;
      }
    winner = board[STORE[0]] === board[STORE[1]] ? "draw" : board[STORE[0]] > board[STORE[1]] ? 0 : 1;
  }
  return {
    board,
    // A last stone in one's own store earns another turn.
    turn: at === STORE[me] ? me : them,
    ply: state.ply + 1,
    sown: { pit, path, captured },
    effect: { kind: "move", from: pit, to: at, converted: [], removed: captured },
    winner,
  };
}
export const mancala: PointGame<State> = {
  create: createGame,
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.board.map(() => null),
  effect: (s) => s.effect,
  ply: (s) => s.ply,
  evaluate(s, player) {
    const other = player === 0 ? 1 : 0,
      side = (p: number) => pitsOf(p).reduce((sum, i) => sum + s.board[i], 0);
    return (s.board[STORE[player]] - s.board[STORE[other]]) * 4 + (side(player) - side(other));
  },
  hint: () => "내 쪽 구멍을 골라 돌을 뿌리세요.",
  tally: (s) => [`창고 ${s.board[STORE[0]]}`, `창고 ${s.board[STORE[1]]}`],
  reason: (s) => `${s.board[STORE[0]]} : ${s.board[STORE[1]]}`,
};
