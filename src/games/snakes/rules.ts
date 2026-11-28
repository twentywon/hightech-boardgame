import type { Effect, Move, PointGame } from "../points/types";

/**
 * Snakes and ladders on squares 1–100. A token starts off the board (0),
 * moves by the die, climbs a ladder from its foot and slides down a snake
 * from its head. The last square needs an exact roll; a six rolls again. Two play at one screen; over Wi-Fi two
 * to four (`colors` says which of the four tokens each plays, in the order of the room's seats).
 */
export const LADDERS: Record<number, number> = { 3: 22, 8: 30, 28: 84, 36: 57, 51: 67, 71: 92, 80: 99 };
export const SNAKES: Record<number, number> = { 17: 4, 34: 12, 48: 26, 62: 19, 87: 54, 93: 73, 98: 79 };
export const LAST = 100;
/** The four tokens' names, in the order of the room's seats (the first two the game for two). */
export const TOKEN_NAMES = ["빨강", "파랑", "초록", "노랑"];
export interface State {
  /** Each side's square, in the order of play. */
  positions: number[];
  /** Which token each side plays (red and blue at one screen). */
  colors: number[];
  turn: number;
  ply: number;
  /** The last roll: who moved, the die, the squares walked and a ladder or snake taken. */
  roll: { player: number; die: number; path: number[]; slide: number | null } | null;
  effect: Effect | null;
  /** The side that reached the last square. */
  winner: number | null;
}
export const createGame = (colors: number[] = [0, 1]): State => ({ positions: colors.map(() => 0), colors: [...colors], turn: 0, ply: 0, roll: null, effect: null, winner: null });
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
    positions = state.positions.slice();
  positions[me] = slide ?? reached;
  return {
    ...state,
    positions,
    turn: die === 6 && positions[me] !== LAST ? me : (me + 1) % positions.length,
    ply: state.ply + 1,
    roll: { player: me, die, path, slide },
    effect: { kind: "move", from, to: positions[me], converted: [], removed: [] },
    winner: positions[me] === LAST ? me : null,
  };
}
/**
 * The side the screen names for `player`: itself in a game of two; in a game of three or four every side is the
 * screen's side 0 (it knows only two), so the side to move (or the winner, once there is one) stands for it.
 */
export const sideFor = (state: State, player: number) => (state.positions.length <= 2 ? player : (state.winner ?? state.turn));
export const snakes: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  turn: (s) => (s.positions.length > 2 ? 0 : (s.turn as 0 | 1)),
  winner: (s) => (s.winner === null ? null : s.positions.length > 2 ? 0 : (s.winner as 0 | 1)),
  owners: () => [],
  effect: (s) => s.effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => s.positions[player] - Math.max(...s.positions.filter((_, side) => side !== player)),
  hint: (s) =>
    s.roll && s.roll.player === s.turn && s.roll.die === 6 ? "6이 나왔습니다. 한 번 더 굴리세요." : "주사위를 굴리세요.",
  tally: (s) => [0, 1].map((p) => (s.positions[p] ? `${s.positions[p]}번 칸` : "출발 전")) as [string, string],
  reason: () => "100번 칸에 도착했습니다.",
};
