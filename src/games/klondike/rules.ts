import type { Random } from "../../core/random";
import { cardName, copyPiles, fits, isRun, pack, safeHome, shuffle, type Card } from "../patience/cards";
import { winnable } from "./solver";

/**
 * Klondike: seven columns dealt one to seven cards with the last face up, a
 * stock of 24 turned onto the waste one or three at a time (as often as wished),
 * and four foundations built up by suit from the ace. Columns build down in
 * alternate colours; only a king (or a run headed by one) may fill an empty
 * column. A face-down card is turned up as soon as it is uncovered.
 *
 * Piles are numbered: 0 the stock, 1 the waste, 2–5 the foundations (one a suit,
 * spades, hearts, clubs, diamonds) and 6–12 the columns.
 */
export const STOCK = 0,
  WASTE = 1,
  FOUNDATION = 2,
  TABLEAU = 6,
  PILES = 13;
/** A move of a card or a run from one pile to another. */
export type Shift = { from: number; index: number; to: number };
/** A move of a card or a run, or a turn of the stock. */
export type Move = Shift | { turn: true };
export interface State {
  /** How many cards a turn of the stock brings: 1 or 3. */
  draw: 1 | 3;
  piles: Card[][];
  /** How many cards at the top of the waste lie fanned (all three after a turn of three). */
  fan: number;
  /** Moves made, turns of the stock included. */
  moves: number;
  /** How often the waste has gone back to the stock. */
  passes: number;
  won: boolean;
  /** The deal, and every move since: undo plays all but the last again. */
  start: Card[][];
  log: Move[];
}
export const isFoundation = (pile: number) => pile >= FOUNDATION && pile < TABLEAU;
export const isTableau = (pile: number) => pile >= TABLEAU && pile < PILES;
export const drawOf = (variant: string): 1 | 3 => (variant === "3" ? 3 : 1);
/** How many shuffles are tried for one the solver can see through before the last is kept, and how many positions it
 *  looks at in each (about 30 ms on a desktop; two deals in three come through within it). */
const TRIES = 8,
  BUDGET = 5000;
/** Lays a shuffled pack out: columns one to seven cards, the last of each face up, and the rest in the stock. */
export function layOut(cards: Card[]): Card[][] {
  const piles: Card[][] = Array.from({ length: PILES }, () => []);
  let next = 0;
  for (let row = 0; row < 7; row++)
    for (let column = row; column < 7; column++) piles[TABLEAU + column].push({ ...cards[next++], up: column === row });
  piles[STOCK] = cards.slice(next).map((card) => ({ ...card, up: false }));
  return piles;
}
/**
 * Shuffles and deals. Unless `check` is false, a deal is kept only when a bounded solver (which sees every card) finds
 * a way through it; after `TRIES` shuffles it finds none for, the last is played all the same. The solver counts the
 * positions it looks at, not the time, so a given `random` always deals the same game.
 */
export function createGame(variant: string, random: Random, check = true): State {
  const draw = drawOf(variant);
  let piles = layOut(shuffle(pack(), random));
  for (let tries = 1; check && tries < TRIES && !winnable(piles, draw, BUDGET); tries++) piles = layOut(shuffle(pack(), random));
  return { draw, piles, fan: 0, moves: 0, passes: 0, won: false, start: copyPiles(piles), log: [] };
}
const top = (cards: Card[]) => cards[cards.length - 1];
const home = (state: State) => [0, 1, 2, 3].map((suit) => state.piles[FOUNDATION + suit].length);
/** May the card at `index` of `pile` (and those on it) be picked up? */
export function canPick(state: State, pile: number, index: number) {
  const cards = state.piles[pile];
  if (state.won || !cards || index < 0 || index >= cards.length) return false;
  if (isTableau(pile)) return isRun(cards, index);
  return (pile === WASTE || isFoundation(pile)) && index === cards.length - 1;
}
/** Any foundation stands for the one of the card's own suit. */
function aim(state: State, from: number, index: number, to: number) {
  const card = state.piles[from]?.[index];
  return card && isFoundation(to) ? FOUNDATION + card.suit : to;
}
/** May the run of `from` starting at `index` go onto `to`? */
export function accepts(state: State, from: number, index: number, to: number) {
  if (!canPick(state, from, index)) return false;
  to = aim(state, from, index, to);
  if (to === from) return false;
  const run = state.piles[from].slice(index),
    first = run[0],
    onto = top(state.piles[to] ?? []);
  if (isFoundation(to)) return run.length === 1 && state.piles[to].length === first.rank - 1;
  if (!isTableau(to)) return false;
  return onto ? fits(first, onto) : first.rank === 13;
}
/** The piles the run of `from` starting at `index` may go onto, foundations by their own suit. */
export function targets(state: State, from: number, index: number) {
  const open: number[] = [];
  for (let to = FOUNDATION; to < PILES; to++) if (aim(state, from, index, to) === to && accepts(state, from, index, to)) open.push(to);
  return open;
}
function finish(state: State, piles: Card[][], move: Move, fan: number, passes = state.passes): State {
  // The card left at the top of a column is turned up.
  for (let pile = TABLEAU; pile < PILES; pile++) {
    const last = top(piles[pile]);
    if (last && !last.up) piles[pile][piles[pile].length - 1] = { ...last, up: true };
  }
  const won = piles.slice(FOUNDATION, TABLEAU).every((cards) => cards.length === 13);
  return { ...state, piles, fan, passes, won, moves: state.moves + 1, log: [...state.log, move] };
}
/** Moves the run of `from` starting at `index` onto `to` (any foundation meaning the card's own), or refuses with null. */
export function move(state: State, from: number, index: number, to: number): State | null {
  if (!accepts(state, from, index, to)) return null;
  to = aim(state, from, index, to);
  const piles = copyPiles(state.piles);
  piles[to].push(...piles[from].splice(index));
  const waste = piles[WASTE].length,
    fan = from === WASTE ? Math.min(waste, Math.max(1, state.fan - 1)) : Math.min(waste, state.fan);
  return finish(state, piles, { from, index, to }, fan);
}
/** Turns the next one or three cards of the stock onto the waste, or the waste back into the stock when it is empty. */
export function turn(state: State): State | null {
  if (state.won) return null;
  const piles = copyPiles(state.piles);
  if (piles[STOCK].length) {
    const n = Math.min(state.draw, piles[STOCK].length);
    for (let i = 0; i < n; i++) piles[WASTE].push({ ...piles[STOCK].pop()!, up: true });
    return finish(state, piles, { turn: true }, n);
  }
  if (!piles[WASTE].length) return null;
  piles[STOCK] = piles[WASTE].reverse().map((card) => ({ ...card, up: false }));
  piles[WASTE] = [];
  return finish(state, piles, { turn: true }, 0, state.passes + 1);
}
/** Plays one move, whichever kind it is. */
export const play = (state: State, m: Move) => ("turn" in m ? turn(state) : move(state, m.from, m.index, m.to));
/** The game with its last move taken back, played again from the deal; null when nothing has been played. */
export function undo(state: State): State | null {
  if (!state.log.length) return null;
  let s: State = { ...state, piles: copyPiles(state.start), fan: 0, moves: 0, passes: 0, won: false, log: [] };
  for (const m of state.log.slice(0, -1)) {
    const next = play(s, m);
    if (!next) return null;
    s = next;
  }
  return s;
}
/** Where a double tap sends a card: home, when it may go there now. */
export function autoTarget(state: State, pile: number, index: number) {
  const card = state.piles[pile]?.[index];
  if (!card || isFoundation(pile)) return null;
  const to = FOUNDATION + card.suit;
  return accepts(state, pile, index, to) ? to : null;
}
/**
 * The positions of the waste's top reachable by turning the stock over and over (the waste counted as part of a
 * round of all the cards): with one card a turn every card comes up; with three only every third.
 */
function reachable(state: State) {
  const round = [...state.piles[WASTE], ...state.piles[STOCK].slice().reverse()],
    cards: Card[] = [];
  if (state.draw === 1) return round;
  const seen = new Set<number>();
  let at = state.piles[WASTE].length;
  for (let guard = 0; guard < 64 && !seen.has(at); guard++) {
    seen.add(at);
    if (at > 0) cards.push(round[at - 1]);
    at = at === round.length ? 0 : Math.min(at + 3, round.length);
  }
  return cards;
}
/** Can this card, taken from the stock round, be laid anywhere now? */
function wanted(state: State, card: Card) {
  if (state.piles[FOUNDATION + card.suit].length === card.rank - 1) return true;
  for (let pile = TABLEAU; pile < PILES; pile++) {
    const onto = top(state.piles[pile]);
    if (onto ? fits({ ...card, up: true }, onto) : card.rank === 13) return true;
  }
  return false;
}
/** A king that an empty column would help: heading a run over hidden cards, or in the stock round. */
function kingWaiting(state: State) {
  for (let pile = TABLEAU; pile < PILES; pile++) {
    const cards = state.piles[pile],
      first = cards.findIndex((card) => card.up);
    if (first > 0 && cards[first].rank === 13) return true;
  }
  return reachable(state).some((card) => card.rank === 13);
}
/**
 * A move worth making, judged from what can be seen, or null when nothing helps. Every move it names makes headway (a
 * card home, a hidden card uncovered, a card out of the stock round), so following it never goes round in circles;
 * it names a turn of the stock only while some card in the round could be laid.
 */
export function hint(state: State): Move | null {
  if (state.won) return null;
  const found = home(state);
  let best: Move | null = null,
    score = 0;
  const offer = (m: Move, value: number) => {
    if (value > score) {
      score = value;
      best = m;
    }
  };
  for (let from = TABLEAU; from < PILES; from++) {
    const cards = state.piles[from],
      first = cards.findIndex((card) => card.up);
    if (first < 0) continue;
    const hidden = first > 0;
    for (let index = first; index < cards.length; index++) {
      if (!isRun(cards, index)) continue;
      const card = cards[index],
        last = index === cards.length - 1;
      for (const to of targets(state, from, index)) {
        if (to >= FOUNDATION && to < TABLEAU) {
          if (last) offer({ from, index, to }, 60 + (safeHome(card, found) ? 30 : 0) + (hidden && index === first ? 20 : 0));
        } else if (index === first && hidden) offer({ from, index, to }, 40 + first);
        else if (index === 0 && card.rank !== 13 && state.piles[to].length && kingWaiting(state)) offer({ from, index, to }, 20);
        else if (index > first) {
          // A run moved off so that the card above it can go home.
          const above = cards[index - 1];
          if (state.piles[FOUNDATION + above.suit].length === above.rank - 1) offer({ from, index, to }, 30);
        }
      }
    }
  }
  const waste = state.piles[WASTE];
  if (waste.length) {
    const index = waste.length - 1;
    for (const to of targets(state, WASTE, index)) offer({ from: WASTE, index, to }, to < TABLEAU ? 55 + (safeHome(waste[index], found) ? 30 : 0) : 25);
  }
  if (best) return best;
  // Nothing to do on the table: turn the stock while a card in its round could still be laid somewhere.
  // The waste's own top could not be laid (or it would have been named above).
  const round = reachable(state).filter((card) => card !== top(waste));
  return state.piles[STOCK].length + waste.length > 0 && round.some((card) => wanted(state, card)) ? { turn: true } : null;
}
/** Says in words what a hint suggests. */
export function hintText(state: State, m: Move) {
  if ("turn" in m) return state.piles[STOCK].length ? "더미를 눌러 카드를 넘겨 보세요." : "빈 더미 자리를 눌러 넘긴 카드를 다시 뒤집어 보세요.";
  const card = state.piles[m.from][m.index],
    run = state.piles[m.from].length - m.index,
    what = run > 1 ? `${cardName(card)}부터 ${run}장을` : `${cardName(card)} 카드를`,
    where = m.from === WASTE ? "넘긴 카드 " : isFoundation(m.from) ? "모음 자리의 " : `${m.from - TABLEAU + 1}번째 줄의 `,
    to = isFoundation(m.to) ? "모음 자리로" : `${m.to - TABLEAU + 1}번째 줄로`;
  return `${where}${what} ${to} 옮겨 보세요.`;
}
/** Every card is face up and the stock round is empty: nothing stands between the player and the win. */
export const open = (state: State) => !state.won && !state.piles[STOCK].length && !state.piles[WASTE].length && state.piles.slice(TABLEAU).every((cards) => cards.every((card) => card.up));
/** The next card to send home when the game has come out (`open`): the lowest at the top of a column. */
export function homeward(state: State): Shift | null {
  let best: Shift | null = null,
    rank = 14;
  for (let from = TABLEAU; from < PILES; from++) {
    const cards = state.piles[from],
      card = top(cards);
    if (card && card.rank < rank && accepts(state, from, cards.length - 1, FOUNDATION + card.suit)) {
      rank = card.rank;
      best = { from, index: cards.length - 1, to: FOUNDATION + card.suit };
    }
  }
  return best;
}
/** No move helps any more. */
export const stuck = (state: State) => !state.won && hint(state) === null;
