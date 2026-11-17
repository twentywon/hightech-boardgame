import type { Random } from "../../core/random";
import { cardName, copyPiles, fits, isRun, safeHome, type Card } from "../patience/cards";
import { solve, type Step } from "./solver";

/**
 * FreeCell: the whole pack dealt face up into eight columns, four free cells
 * that hold one card each, and four foundations built up by suit from the ace.
 * Columns build down in alternate colours and any card may fill an empty column.
 * A run moves as a whole only as far as the free cells and empty columns would
 * let it be moved a card at a time: (free cells + 1) × 2^(empty columns), the
 * column it goes to not counted. Cards nothing could be laid on any more go home
 * by themselves after every move.
 *
 * Deals are numbered as in the classic game (1 to 32000, with its shuffle).
 * Piles: 0–3 the free cells, 4–7 the foundations (spades, hearts, clubs,
 * diamonds), 8–15 the columns.
 */
export const CELL = 0,
  FOUNDATION = 4,
  COLUMN = 8,
  PILES = 16;
/** The classic deals, and the one among them that cannot be won. */
export const DEALS = 32000,
  LOST_DEAL = 11982;
export interface Move {
  from: number;
  index: number;
  to: number;
}
export interface State {
  /** The classic deal number. */
  deal: number;
  piles: Card[][];
  /** Moves made by hand (cards that went home by themselves not counted). */
  moves: number;
  won: boolean;
  /** Cards that went home by themselves after the last move, in order. */
  auto: number[];
  /** The deal, and every move since: undo plays all but the last again. */
  start: Card[][];
  log: Move[];
}
export const isCell = (pile: number) => pile >= CELL && pile < FOUNDATION;
export const isFoundation = (pile: number) => pile >= FOUNDATION && pile < COLUMN;
export const isColumn = (pile: number) => pile >= COLUMN && pile < PILES;
/**
 * The cards of a classic deal, in the order they are dealt round the eight columns (the old public shuffle: a linear
 * congruential generator seeded with the deal number, cards numbered rank × 4 + suit in clubs, diamonds, hearts,
 * spades).
 */
export function classicOrder(deal: number): Card[] {
  let seed = deal;
  const next = () => {
    seed = (seed * 214013 + 2531011) % 2147483648;
    return Math.floor(seed / 65536);
  };
  const deck = Array.from({ length: 52 }, (_, i) => 51 - i);
  for (let i = 0; i < 51; i++) {
    const j = 51 - (next() % (52 - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const SUITS = [2, 3, 1, 0];
  return deck.map((c) => {
    const rank = (c >> 2) + 1,
      suit = SUITS[c & 3];
    return { id: suit * 13 + rank - 1, rank, suit, up: true };
  });
}
/** The piles of a classic deal: the cards dealt round the columns, the first of each at its bottom. */
export function layOut(deal: number): Card[][] {
  const piles: Card[][] = Array.from({ length: PILES }, () => []);
  classicOrder(deal).forEach((card, i) => piles[COLUMN + (i % 8)].push(card));
  return piles;
}
/** A deal number drawn at random, never the one that cannot be won. */
export function randomDeal(random: Random) {
  const deal = 1 + Math.floor(random() * (DEALS - 1));
  return deal >= LOST_DEAL ? deal + 1 : deal;
}
const top = (cards: Card[]) => cards[cards.length - 1];
const home = (piles: Card[][]) => [0, 1, 2, 3].map((suit) => piles[FOUNDATION + suit].length);
/** Sends home every card nothing could be laid on any more, from the cells and the columns; returns their ids. */
function settle(piles: Card[][]) {
  const went: number[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (let pile = 0; pile < PILES; pile++) {
      if (isFoundation(pile)) continue;
      const card = top(piles[pile]);
      if (!card || !safeHome(card, home(piles))) continue;
      piles[FOUNDATION + card.suit].push(piles[pile].pop()!);
      went.push(card.id);
      changed = true;
    }
  }
  return went;
}
/** Deals game `deal` (a number from 1 to 32000), with the cards that may go home at once already there. */
export function createGame(deal: number): State {
  const piles = layOut(deal);
  settle(piles);
  return { deal, piles, moves: 0, won: false, auto: [], start: copyPiles(piles), log: [] };
}
/** How many cards may move as one run: (free cells + 1) × 2^(empty columns), the column it goes to not counted. */
export function capacity(state: State, toEmpty: boolean) {
  const free = state.piles.slice(CELL, FOUNDATION).filter((c) => !c.length).length,
    empty = state.piles.slice(COLUMN).filter((c) => !c.length).length - (toEmpty ? 1 : 0);
  return (free + 1) * 2 ** Math.max(0, empty);
}
/** May the card at `index` of `pile` (and those on it) be picked up? */
export function canPick(state: State, pile: number, index: number) {
  const cards = state.piles[pile];
  if (state.won || !cards || index < 0 || index >= cards.length) return false;
  if (isColumn(pile)) return isRun(cards, index);
  return isCell(pile);
}
/** Any foundation stands for the one of the card's own suit, and a taken free cell for the first free one. */
function aim(state: State, from: number, index: number, to: number) {
  const card = state.piles[from]?.[index];
  if (!card) return to;
  if (isFoundation(to)) return FOUNDATION + card.suit;
  if (isCell(to) && state.piles[to].length && !isCell(from)) {
    const free = state.piles.findIndex((cards, pile) => isCell(pile) && !cards.length);
    return free < 0 ? to : free;
  }
  return to;
}
/** Why the run of `from` starting at `index` may not go onto `to`; null when it may. */
export function refusal(state: State, from: number, index: number, to: number): string | null {
  if (!canPick(state, from, index)) return "그 카드는 집을 수 없습니다.";
  to = aim(state, from, index, to);
  if (to === from) return "제자리입니다.";
  const run = state.piles[from].length - index,
    first = state.piles[from][index],
    onto = top(state.piles[to] ?? []);
  if (isFoundation(to)) return run === 1 && state.piles[to].length === first.rank - 1 ? null : "모음 자리에는 같은 무늬로 A부터 차례대로 올립니다.";
  if (isCell(to)) return run > 1 ? "프리셀 칸에는 한 장만 놓을 수 있습니다." : onto ? "빈 프리셀 칸이 없습니다." : null;
  if (!isColumn(to)) return "그곳에는 놓을 수 없습니다.";
  if (onto && !fits(first, onto)) return "숫자가 하나 높고 색이 다른 카드 위에 놓으세요.";
  const most = capacity(state, !onto);
  return run > most ? `지금은 ${most}장까지만 한꺼번에 옮길 수 있습니다. 프리셀 칸이나 빈 줄을 비워 보세요.` : null;
}
export const accepts = (state: State, from: number, index: number, to: number) => refusal(state, from, index, to) === null;
/** Moves the run of `from` starting at `index` onto `to`, then sends home what may go; null when refused. */
export function move(state: State, from: number, index: number, to: number): State | null {
  if (!accepts(state, from, index, to)) return null;
  to = aim(state, from, index, to);
  const piles = copyPiles(state.piles);
  piles[to].push(...piles[from].splice(index));
  const auto = settle(piles),
    won = piles.slice(FOUNDATION, COLUMN).every((cards) => cards.length === 13);
  return { ...state, piles, auto, won, moves: state.moves + 1, log: [...state.log, { from, index, to }] };
}
export const play = (state: State, m: Move) => move(state, m.from, m.index, m.to);
/** The game with its last move taken back, played again from the deal; null when nothing has been played. */
export function undo(state: State): State | null {
  if (!state.log.length) return null;
  let s: State = { ...state, piles: copyPiles(state.start), moves: 0, won: false, auto: [], log: [] };
  for (const m of state.log.slice(0, -1)) {
    const next = play(s, m);
    if (!next) return null;
    s = next;
  }
  return { ...s, auto: [] };
}
/** Where a double tap sends a card: home if it may go, else to a free cell. */
export function autoTarget(state: State, pile: number, index: number) {
  const card = state.piles[pile]?.[index];
  if (!card || index !== state.piles[pile].length - 1 || isFoundation(pile)) return null;
  if (accepts(state, pile, index, FOUNDATION + card.suit)) return FOUNDATION + card.suit;
  if (isCell(pile)) return null;
  const free = state.piles.findIndex((cards, p) => isCell(p) && !cards.length);
  return free < 0 ? null : free;
}
const fingerprint = (piles: Card[][]) => piles.map((cards) => cards.map((c) => String.fromCharCode(48 + c.id)).join("")).join("|");
/** Ways through found for earlier positions: each position's fingerprint to the moves left from it. */
const known = new Map<string, Move[]>();
/** The step of a solution as a move of the rules: a card goes from where it lies to a pile. */
function asMove(piles: Card[][], step: Step): Move | null {
  for (let pile = 0; pile < PILES; pile++) {
    const index = piles[pile].findIndex((c) => c.id === step.card);
    if (index >= 0) return { from: pile, index, to: step.to };
  }
  return null;
}
/**
 * A move on the way to a win, found by the solver from the position as it stands (every card is in sight, so it knows
 * nothing the player does not); when it finds no way within its budget, a card that may go home, or null.
 */
export function hint(state: State, budget = 20000): Move | null {
  if (state.won) return null;
  let path = known.get(fingerprint(state.piles));
  if (!path) {
    const steps = solve(state.piles, budget);
    if (steps) {
      // Followed through the rules, so that every move it names is one they allow; each position on the way keeps
      // what is left of the way, so that a hint followed finds the next at once.
      const moves: Move[] = [],
        prints: string[] = [];
      let s: State | null = state;
      for (const step of steps) {
        const m: Move | null = asMove(s.piles, step);
        prints.push(fingerprint(s.piles));
        s = m && play(s, m);
        if (!m || !s) break;
        moves.push(m);
      }
      if (s?.won) {
        if (known.size > 4000) known.clear();
        prints.forEach((print, i) => known.set(print, moves.slice(i)));
        path = moves;
      }
    }
  }
  if (path?.length) return path[0];
  for (let from = 0; from < PILES; from++) {
    const cards = state.piles[from];
    if (isFoundation(from) || !cards.length) continue;
    const card = top(cards);
    if (accepts(state, from, cards.length - 1, FOUNDATION + card.suit)) return { from, index: cards.length - 1, to: FOUNDATION + card.suit };
  }
  return null;
}
/** Says in words what a hint suggests. */
export function hintText(state: State, m: Move) {
  const card = state.piles[m.from][m.index],
    run = state.piles[m.from].length - m.index,
    what = run > 1 ? `${cardName(card)}부터 ${run}장을` : `${cardName(card)} 카드를`,
    where = isCell(m.from) ? "프리셀 칸의 " : `${m.from - COLUMN + 1}번째 줄의 `,
    to = isFoundation(m.to) ? "모음 자리로" : isCell(m.to) ? "프리셀 칸으로" : state.piles[m.to].length ? `${m.to - COLUMN + 1}번째 줄로` : `빈 ${m.to - COLUMN + 1}번째 줄로`;
  return `${where}${what} ${to} 옮겨 보세요.`;
}
/** True when no card can move at all. */
export function stuck(state: State) {
  if (state.won) return false;
  for (let from = 0; from < PILES; from++) {
    if (isFoundation(from)) continue;
    const cards = state.piles[from];
    for (let index = 0; index < cards.length; index++) {
      if (!canPick(state, from, index)) continue;
      for (let to = 0; to < PILES; to++) if (to !== from && accepts(state, from, index, to)) return false;
    }
  }
  return true;
}
