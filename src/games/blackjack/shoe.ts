export const RANKS = [
  "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K",
] as const;
export const SUITS = ["S", "H", "D", "C"] as const;
export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export interface Card {
  rank: Rank;
  suit: Suit;
}
export const DECKS = 6;
export const SHOE_SIZE = DECKS * 52;
/** A round never starts with fewer cards than this; the shoe is reshuffled first. */
export const RESHUFFLE_BELOW = 104;

/** Returns a number in [0, 1). Injected in tests to make the shoe reproducible. */
export type Random = () => number;
/**
 * One 32-bit draw per call. Scaling to an index below 312 leaves a bias under
 * one in ten million, which a chip game without stakes can ignore.
 */
export const cryptoRandom: Random = () => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 4294967296;
};
export function createDeck(decks = DECKS): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++)
    for (const suit of SUITS)
      for (const rank of RANKS) cards.push({ rank, suit });
  return cards;
}
/** Fisher–Yates on a copy. Walks from the last index down, one draw per step. */
export function shuffle(
  cards: readonly Card[],
  random: Random = cryptoRandom,
): Card[] {
  const result = cards.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const r = random();
    if (!(r >= 0 && r < 1)) throw new RangeError("Random must be in [0, 1)");
    const j = Math.floor(r * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
/** A freshly shuffled six-deck shoe. Cards are drawn from the end. */
export const createShoe = (random: Random = cryptoRandom) =>
  shuffle(createDeck(), random);
