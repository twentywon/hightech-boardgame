import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Snakes and ladders on squares 1–100. A token starts off the board (0),
 * moves by the die, climbs a ladder from its foot and slides down a snake
 * from its head. The last square needs an exact roll; a six rolls again.
 */
export const LADDERS: Record<number, number> = { 3: 22, 8: 30, 28: 84, 36: 57, 51: 67, 71: 92, 80: 99 };
export const SNAKES: Record<number, number> = { 17: 4, 34: 12, 48: 26, 62: 19, 87: 54, 93: 73, 98: 79 };
export const LAST = 100;
export interface State {
  positions: [number, number];
  turn: 0 | 1;
  ply: number;
  /** The last roll: who moved, the die, the squares walked and a ladder or snake taken. */
  roll: { player: 0 | 1; die: number; path: number[]; slide: number | null } | null;
  effect: Effect | null;
  winner: Winner;
}
export const createGame = (): State => ({ positions: [0, 0], turn: 0, ply: 0, roll: null, effect: null, winner: null });
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [{ from: -1, to: 0, extra: -1 }]);
export function play(state: State, move: Move, random: () => number = Math.random): State | null {
  if (state.winner !== null || move.from !== -1 || move.to !== 0 || move.extra !== -1) return null;
  const me = state.turn,
    die = 1 + Math.floor(random() * 6),
    from = state.positions[me],
    // A roll past the last square is not used.
    reached = from + die > LAST ? from : from + die,
    path = Array.from({ length: reached - from }, (_, i) => from + i + 1),
    slide = LADDERS[reached] ?? SNAKES[reached] ?? null,
    positions: [number, number] = [state.positions[0], state.positions[1]];
  positions[me] = slide ?? reached;
  return {
    positions,
    turn: die === 6 && positions[me] !== LAST ? me : me === 0 ? 1 : 0,
    ply: state.ply + 1,
    roll: { player: me, die, path, slide },
    effect: { kind: "move", from, to: positions[me], converted: [], removed: [] },
    winner: positions[me] === LAST ? me : null,
  };
}
export const snakes: PointGame<State> = {
  create: createGame,
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => [],
  effect: (s) => s.effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => s.positions[player] - s.positions[player === 0 ? 1 : 0],
  hint: (s) =>
    s.roll && s.roll.player === s.turn && s.roll.die === 6 ? "6이 나왔습니다. 한 번 더 굴리세요." : "주사위를 굴리세요.",
  tally: (s) => [0, 1].map((p) => (s.positions[p] ? `${s.positions[p]}번 칸` : "출발 전")) as [string, string],
  reason: () => "100번 칸에 도착했습니다.",
};
