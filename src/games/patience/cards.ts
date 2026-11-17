import type { Random } from "../../core/random";
import { RANK_NAMES, type Card } from "../spider/rules";

/**
 * What the patience games (Klondike and FreeCell) share about cards: one pack of
 * 52 in spider's terms (rank 1–13, suit 0 spades, 1 hearts, 2 clubs, 3
 * diamonds), building down in alternate colours, and when a card may go home
 * without ever being missed on the table.
 */
export type { Card };
export const SUIT_GLYPHS = ["♠", "♥", "♣", "♦"];
export const isRed = (card: Card) => card.suit === 1 || card.suit === 3;
/** A card as it is named in a sentence: "7♥", "10♠", "K♦". */
export const cardName = (card: Card) => RANK_NAMES[card.rank] + SUIT_GLYPHS[card.suit];
/** One rank lower and the other colour: `card` may lie on `onto` in a column. */
export const fits = (card: Card, onto: Card) => onto.up && card.rank === onto.rank - 1 && isRed(card) !== isRed(onto);
/** A card's number in a pack: suit × 13 + rank − 1. */
export const codeOf = (card: Card) => card.suit * 13 + card.rank - 1;
/** One pack in order, every card face down. */
export const pack = (): Card[] => Array.from({ length: 52 }, (_, id) => ({ id, rank: (id % 13) + 1, suit: Math.floor(id / 13), up: false }));
/** Shuffles `cards` in place (Fisher–Yates) with `random`, and returns them. */
export function shuffle<C>(cards: C[], random: Random) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
/** True when the cards from `index` on make a run down in alternate colours, all face up. */
export function isRun(cards: Card[], index: number) {
  if (index < 0 || index >= cards.length || !cards[index].up) return false;
  for (let i = index + 1; i < cards.length; i++) if (!fits(cards[i], cards[i - 1])) return false;
  return true;
}
/**
 * A card may go home without being missed when it is an ace or a two, or when both cards of the other colour one
 * rank lower are home already: nothing left on the table could ever be laid on it. `home` holds the number of cards
 * home in each suit.
 */
export function safeHome(card: Card, home: number[]) {
  if (card.rank <= 2) return home[card.suit] === card.rank - 1;
  const other = isRed(card) ? [0, 2] : [1, 3];
  return home[card.suit] === card.rank - 1 && home[other[0]] >= card.rank - 1 && home[other[1]] >= card.rank - 1;
}
/** Copies the piles, so that a move never changes the state it was made from. */
export const copyPiles = (piles: Card[][]) => piles.map((pile) => pile.slice());
