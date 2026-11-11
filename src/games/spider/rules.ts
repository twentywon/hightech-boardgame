import type { Random } from "../../core/random";

/**
 * Spider solitaire: 104 cards in ten columns and a stock of fifty. Runs of
 * one suit from king down to ace leave the table; eight of them win.
 */
export interface Card {
  id: number;
  /** 1 (ace) to 13 (king). */
  rank: number;
  /** 0 spades, 1 hearts, 2 clubs, 3 diamonds. */
  suit: number;
  up: boolean;
}
export const SUIT_LETTERS = ["S", "H", "C", "D"];
export const RANK_NAMES = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const faceOf = (card: Card) => RANK_NAMES[card.rank] + SUIT_LETTERS[card.suit];
export interface State {
  /** How many suits the pack uses: 1, 2 or 4. */
  suits: number;
  columns: Card[][];
  stock: Card[];
  /** Completed runs, by the suit of each. */
  done: number[];
  moves: number;
  won: boolean;
}
export const suitsOf = (variant: string) => (variant === "2" ? 2 : variant === "4" ? 4 : 1);
/** Shuffles two packs' worth of cards and deals 54 to the columns, the last of each face up. */
export function createGame(variant: string, random: Random): State {
  const suits = suitsOf(variant),
    cards: Card[] = [];
  for (let copy = 0; copy < 8; copy++)
    for (let rank = 1; rank <= 13; rank++) cards.push({ id: cards.length, rank, suit: copy % suits, up: false });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const columns: Card[][] = Array.from({ length: 10 }, () => []);
  for (let i = 0; i < 54; i++) columns[i % 10].push(cards[i]);
  for (const column of columns) column[column.length - 1] = { ...column[column.length - 1], up: true };
  return { suits, columns, stock: cards.slice(54), done: [], moves: 0, won: false };
}
/** True when the cards of `column` from `index` down form a face-up run of one suit. */
export function movable(state: State, column: number, index: number) {
  const cards = state.columns[column];
  if (index < 0 || index >= cards.length || !cards[index].up) return false;
  for (let i = index + 1; i < cards.length; i++)
    if (cards[i].suit !== cards[i - 1].suit || cards[i].rank !== cards[i - 1].rank - 1) return false;
  return true;
}
/** Columns the run starting at `index` may be moved to. */
export function targets(state: State, column: number, index: number) {
  if (!movable(state, column, index)) return [];
  const first = state.columns[column][index];
  return state.columns.flatMap((cards, to) => {
    if (to === column) return [];
    const top = cards[cards.length - 1];
    return !top || top.rank === first.rank + 1 ? [to] : [];
  });
}
/** The column a tap would send the run to: its own suit first, then any card, then an empty column. */
export function bestTarget(state: State, column: number, index: number) {
  const first = state.columns[column][index],
    open = targets(state, column, index),
    top = (to: number) => state.columns[to][state.columns[to].length - 1];
  return (
    open.find((to) => top(to)?.suit === first.suit) ??
    open.find((to) => top(to)) ??
    // Moving a whole column to another empty one achieves nothing.
    (index > 0 ? open[0] : undefined) ??
    null
  );
}
/** Turns the last card of each column up and takes off any complete run. */
function tidy(state: State) {
  state.columns = state.columns.map((cards) => {
    let column = cards;
    const n = column.length;
    if (n >= 13) {
      const run = column.slice(n - 13);
      if (run.every((c, i) => c.up && c.suit === run[0].suit && c.rank === 13 - i)) {
        state.done = [...state.done, run[0].suit];
        column = column.slice(0, n - 13);
      }
    }
    const last = column[column.length - 1];
    return last && !last.up ? [...column.slice(0, -1), { ...last, up: true }] : column;
  });
  state.won = state.done.length === 8;
  return state;
}
/** Moves the run of `from` starting at `index` onto column `to`. */
export function move(state: State, from: number, index: number, to: number): State | null {
  if (state.won || !targets(state, from, index).includes(to)) return null;
  const columns = state.columns.map((c) => c.slice()),
    run = columns[from].splice(index);
  columns[to].push(...run);
  return tidy({ ...state, columns, moves: state.moves + 1 });
}
/** Why a new row cannot be dealt now, or null when it can. */
export function dealError(state: State) {
  if (state.won) return "이미 끝난 판입니다.";
  if (!state.stock.length) return "더미에 카드가 없습니다.";
  if (state.columns.some((c) => !c.length)) return "빈 줄이 있으면 새 카드를 돌릴 수 없습니다.";
  return null;
}
/** Deals one face-up card from the stock onto every column. */
export function deal(state: State): State | null {
  if (dealError(state)) return null;
  const stock = state.stock.slice(),
    columns = state.columns.map((c) => [...c, { ...stock.pop()!, up: true }]);
  return tidy({ ...state, columns, stock, moves: state.moves + 1 });
}
/** True when some run can still be moved or a row can be dealt. */
export const stuck = (state: State) =>
  !state.won &&
  !!dealError(state) &&
  !state.columns.some((cards, c) => cards.some((_, i) => bestTarget(state, c, i) !== null));
