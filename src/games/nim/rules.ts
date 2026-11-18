import { cryptoRandom } from "../../core/random";
import type { Effect, GameOptions, Move, PointGame, Winner } from "../points/types";

/**
 * Nim on one rod, after a wooden teaching aid the user sent a photograph of, and 아이스크림 31, the same game played
 * aloud with numbered scoops (only its look differs).
 *
 * One heap of `total` rings. The two sides take turns taking 1 to `most` of them from the open end of the rod (in
 * 아이스크림 31: the scoops in their order, the lowest number left first). With `misere` the one who takes the last
 * ring loses; without it the one who takes it wins. 아이스크림 31 is fixed at 31 scoops, at most 3 and the last
 * loses.
 *
 * A move is `{ from: -1, to: t - 1, extra: -1 }`: `to` is how far from the open end the farthest ring it takes lies
 * (0 for the first), so the move takes `to + 1` rings. A tap on a ring is that place, so pointing at the t-th ring
 * from the open end takes t (`take`, `countOf`).
 *
 * The rings taken are kept in order with who took each (`takers`), and each take's size (`takes`), so that the
 * table can lay every ring by its taker and `undo` can rebuild a game by playing its takes again.
 */
export type Mode = "nim" | "ice";
/** What can be set for 님, and what 아이스크림 31 is fixed at. */
export const RINGS = { min: 5, max: 50, value: 21 },
  MOST = { min: 2, max: 6, value: 3 },
  ICE = { total: 31, most: 3 };
export interface State {
  mode: Mode;
  /** How many rings (scoops) the game began with. */
  total: number;
  /** The most that may be taken at once. */
  most: number;
  /** Whether the one who takes the last loses. */
  misere: boolean;
  /** The side that moved first. */
  first: 0 | 1;
  /** Who took each ring, in the order they were taken (the one nearest the open end first). */
  takers: (0 | 1)[];
  /** How many each take took, in order. */
  takes: number[];
  turn: 0 | 1;
  winner: Winner;
  ply: number;
  /** The last take: who took how many. */
  last: { side: 0 | 1; count: number } | null;
}
/** The names of the two sides: the one at the near side of the table (side 0, me against the computer) and across. */
export const NAMES: [string, string] = ["앞자리", "뒷자리"];
export const modeOf = (variant: string): Mode => (variant === "31" ? "ice" : "nim");
/** The move that takes `t`, and how many a move takes. */
export const take = (t: number): Move => ({ from: -1, to: t - 1, extra: -1 });
export const countOf = (move: Move) => move.to + 1;
/** How many are left, and how many `side` has taken. */
export const left = (state: State) => state.total - state.takers.length;
export const takenBy = (state: State, side: 0 | 1) => state.takers.filter((t) => t === side).length;
/** The most the side to move may take now. */
export const reach = (state: State) => Math.min(state.most, left(state));
const whole = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return value === undefined || value === "" || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};
/**
 * A new game of a variant ("nim" or "31") with the numbers set (`rings`, `most`, `misere`) and who moves first
 * (`first`: "me" for side 0, "computer" for side 1, "random" decided by `random`).
 */
export function createGame(variant = "nim", options: GameOptions = {}, random: () => number = cryptoRandom): State {
  const mode = modeOf(variant),
    ice = mode === "ice",
    first: 0 | 1 = options.first === "computer" ? 1 : options.first === "random" ? (random() < 0.5 ? 0 : 1) : 0;
  return {
    mode,
    total: ice ? ICE.total : whole(options.rings, RINGS.min, RINGS.max, RINGS.value),
    most: ice ? ICE.most : whole(options.most, MOST.min, MOST.max, MOST.value),
    misere: ice ? true : typeof options.misere === "boolean" ? options.misere : true,
    first,
    takers: [],
    takes: [],
    turn: first,
    winner: null,
    ply: 0,
    last: null,
  };
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  return Array.from({ length: reach(state) }, (_, k) => take(k + 1));
}
/** The state after `move`, or null when it takes none, more than `most` or more than are left. */
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to)) return null;
  const t = countOf(move);
  if (t < 1 || t > reach(state)) return null;
  const side = state.turn,
    other = (1 - side) as 0 | 1,
    takers = [...state.takers, ...Array<0 | 1>(t).fill(side)],
    done = takers.length === state.total;
  return {
    ...state,
    takers,
    takes: [...state.takes, t],
    turn: other,
    winner: done ? (state.misere ? other : side) : null,
    ply: state.ply + 1,
    last: { side, count: t },
  };
}
/** The game one take back, rebuilt by playing its takes again from the start; the game itself when nothing was taken. */
export function undo(state: State): State {
  if (!state.takes.length) return state;
  let s: State = { ...state, takers: [], takes: [], turn: state.first, winner: null, ply: 0, last: null };
  for (const t of state.takes.slice(0, -1)) s = play(s, take(t))!;
  return s;
}
/**
 * How many to take to win against any reply, or null when every take loses against perfect play. With the last one
 * winning, a heap that is a multiple of `most + 1` is lost for the side to move, so leave one; with the last one
 * losing, leave one more than a multiple.
 */
export function perfect(state: State): number | null {
  if (state.winner !== null) return null;
  const n = left(state),
    period = state.most + 1,
    r = state.misere ? (n - 1) % period : n % period;
  return r === 0 ? null : r;
}
/** How often the computer at 보통 plays the right move. */
export const NORMAL_RIGHT = 0.75;
/**
 * The computer's take, from the state alone: 쉬움 takes at random; 어려움 always plays perfectly (taking 1 where no
 * take wins, which makes the game last); 보통 plays as 어려움 does most of the time and at random otherwise.
 */
export function chooseMove(state: State, level: "easy" | "normal" | "hard", random: () => number = Math.random): Move | null {
  const most = reach(state);
  if (state.winner !== null || most < 1) return null;
  const any = () => take(1 + Math.min(most - 1, Math.floor(random() * most)));
  if (level === "easy" || (level === "normal" && random() >= NORMAL_RIGHT)) return any();
  return take(perfect(state) ?? 1);
}
export function evaluate(state: State, player: 0 | 1) {
  if (state.winner !== null) return state.winner === player ? 100 : -100;
  const good = perfect(state) !== null;
  return (good === (state.turn === player) ? 1 : -1) * 50;
}
/** The rule in words: how many at once, and what the last one does. */
export function ruleText(state: Pick<State, "mode" | "most" | "misere">) {
  return state.mode === "ice" ? `한 번에 1~${ICE.most}개 · 31을 먹으면 패배` : `한 번에 1~${state.most}개 · 마지막을 가져가면 ${state.misere ? "패배" : "승리"}`;
}
export const nim: PointGame<State> = {
  create: (variant, options) => createGame(variant, options),
  moves,
  play: (s, m) => play(s, m),
  choose: (s, level, random) => chooseMove(s, level, random),
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => [],
  effect: (): Effect | null => null,
  ply: (s) => s.ply,
  evaluate,
  hint: (s) => {
    const most = reach(s),
      upTo = most === 1 ? "1개" : `1~${most}개`,
      n = left(s);
    if (s.mode === "ice") return `${s.takers.length + 1}번부터 ${upTo}를 먹으세요. 남은 아이스크림 ${n}개`;
    return `고리를 ${upTo} 가져가세요. 남은 고리 ${n}개`;
  },
  tally: (s) => [`${takenBy(s, 0)}개`, `${takenBy(s, 1)}개`],
  reason: (s) => {
    if (s.winner === null || s.winner === "draw") return "";
    const loser = (1 - s.winner) as 0 | 1;
    if (s.mode === "ice") return `${NAMES[loser]}가 31번 아이스크림을 먹었습니다.`;
    return s.misere ? `${NAMES[loser]}가 마지막 고리를 가져갔습니다.` : `${NAMES[s.winner]}가 마지막 고리를 가져갔습니다.`;
  },
};
