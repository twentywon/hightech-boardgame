import { cryptoRandom, type Random } from "../../core/random";
export type { Random } from "../../core/random";

export const DICE = 5;
export const ROLLS = 3;
export const BONUS_AT = 63;
export const BONUS = 35;
export const CATEGORIES = [
  "ones",
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes",
  "choice",
  "fourKind",
  "fullHouse",
  "smallStraight",
  "largeStraight",
  "yacht",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const UPPER: readonly Category[] = CATEGORIES.slice(0, 6);
/** One player's sheet: a score per category, null while it is still open. */
export type Card = Record<Category, number | null>;
export interface State {
  cards: Card[];
  /** Index of the player whose turn it is. */
  turn: number;
  /** Faces 1–6; all 0 before the first roll of a turn. */
  dice: number[];
  held: boolean[];
  rollsLeft: number;
  /** 1–12. */
  round: number;
  over: boolean;
  /** Counts rolls in the game, so a view can tell a new roll from a redraw. */
  rollId: number;
  /** Which dice the last roll threw. */
  rolled: boolean[];
}

const sum = (dice: readonly number[]) => dice.reduce((a, b) => a + b, 0);
const counts = (dice: readonly number[]) => {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
};
/** Longest run of consecutive faces present. */
function run(dice: readonly number[]) {
  const c = counts(dice);
  let best = 0,
    current = 0;
  for (let face = 1; face <= 6; face++) {
    current = c[face] ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}
/** Points `dice` would score in `category`. */
export function scoreFor(dice: readonly number[], category: Category): number {
  const upper = UPPER.indexOf(category);
  if (upper >= 0) return dice.filter((d) => d === upper + 1).length * (upper + 1);
  const c = counts(dice),
    most = Math.max(...c);
  switch (category) {
    case "choice":
      return sum(dice);
    case "fourKind":
      return most >= 4 ? sum(dice) : 0;
    case "fullHouse":
      // Exactly three of one face and two of another; five alike is a Yacht.
      return c.includes(3) && c.includes(2) ? sum(dice) : 0;
    case "smallStraight":
      return run(dice) >= 4 ? 15 : 0;
    case "largeStraight":
      return run(dice) >= 5 ? 30 : 0;
    default:
      return most === 5 ? 50 : 0;
  }
}
export function totals(card: Card) {
  const of = (list: readonly Category[]) =>
    list.reduce((total, c) => total + (card[c] ?? 0), 0);
  const upper = of(UPPER),
    bonus = upper >= BONUS_AT ? BONUS : 0,
    lower = of(CATEGORIES.slice(6));
  return { upper, bonus, lower, total: upper + bonus + lower };
}
const emptyCard = (): Card =>
  Object.fromEntries(CATEGORIES.map((c) => [c, null])) as Card;
export function createGame(players: 1 | 2 = 1): State {
  return {
    cards: Array.from({ length: players }, emptyCard),
    turn: 0,
    dice: Array(DICE).fill(0),
    held: Array(DICE).fill(false),
    rollsLeft: ROLLS,
    round: 1,
    over: false,
    rollId: 0,
    rolled: Array(DICE).fill(false),
  };
}
/** The dice have been thrown at least once this turn. */
export const hasRolled = (state: State) => state.rollsLeft < ROLLS;
/** Throws every die that is not held. The first roll of a turn throws all five. */
export function roll(state: State, random: Random = cryptoRandom): State | null {
  if (state.over || state.rollsLeft <= 0) return null;
  const rolled = state.held.map((held) => !held || !hasRolled(state));
  if (!rolled.includes(true)) return null;
  const dice = state.dice.map((face, i) => {
    if (!rolled[i]) return face;
    const r = random();
    if (!(r >= 0 && r < 1)) throw new RangeError("Random must be in [0, 1)");
    return 1 + Math.floor(r * 6);
  });
  return {
    ...state,
    dice,
    rolled,
    held: hasRolled(state) ? state.held : Array(DICE).fill(false),
    rollsLeft: state.rollsLeft - 1,
    rollId: state.rollId + 1,
  };
}
/** Sets a die aside or releases it. Only meaningful while a roll remains. */
export function toggleHold(state: State, index: number): State | null {
  if (
    state.over ||
    !hasRolled(state) ||
    state.rollsLeft <= 0 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= DICE
  )
    return null;
  return { ...state, held: state.held.map((h, i) => (i === index ? !h : h)) };
}
/** Writes the current dice into an open category and passes the turn. */
export function score(state: State, category: Category): State | null {
  if (
    state.over ||
    !hasRolled(state) ||
    !CATEGORIES.includes(category) ||
    state.cards[state.turn][category] !== null
  )
    return null;
  const cards = state.cards.map((card, i) =>
    i === state.turn ? { ...card, [category]: scoreFor(state.dice, category) } : card,
  );
  const last = state.turn === cards.length - 1,
    over = last && state.round === CATEGORIES.length;
  return {
    ...state,
    cards,
    turn: last ? 0 : state.turn + 1,
    round: last && !over ? state.round + 1 : state.round,
    over,
    dice: Array(DICE).fill(0),
    held: Array(DICE).fill(false),
    rolled: Array(DICE).fill(false),
    rollsLeft: ROLLS,
  };
}
export const openCategories = (card: Card) =>
  CATEGORIES.filter((c) => card[c] === null);
/** Index of the winner, "draw", or null while playing or in a solo game. */
export function winner(state: State): number | "draw" | null {
  if (!state.over || state.cards.length < 2) return null;
  const [a, b] = state.cards.map((card) => totals(card).total);
  return a === b ? "draw" : a > b ? 0 : 1;
}
