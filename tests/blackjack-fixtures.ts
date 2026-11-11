import { createDeck, type Card, type Random, type Rank, type Suit } from "../src/games/blackjack/shoe";

/** "AS" → ace of spades, "10H" → ten of hearts. */
export function card(text: string): Card {
  return { rank: text.slice(0, -1) as Rank, suit: text.slice(-1) as Suit };
}
/**
 * Random values that make the real Fisher–Yates shuffle put `order` on top of
 * the shoe, in drawing order. Each requested card must still be available.
 * The values are plain numbers so a browser test can feed them to a stubbed
 * `crypto.getRandomValues` without touching the game code.
 */
export function stackedValues(order: string[]): number[] {
  const cards = createDeck(),
    values: number[] = [];
  for (let i = cards.length - 1, k = 0; i > 0; i--, k++) {
    let j = i;
    if (k < order.length) {
      const want = card(order[k]);
      j = -1;
      for (let x = i; x >= 0; x--)
        if (cards[x].rank === want.rank && cards[x].suit === want.suit) {
          j = x;
          break;
        }
      if (j < 0) throw new Error(`No ${order[k]} left to stack`);
    }
    values.push((j + 0.5) / (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return values;
}
/** A Random that replays `values`, then leaves the remaining cards in place. */
export function replay(values: number[]): Random {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.999999);
}
export const stacked = (order: string[]) => replay(stackedValues(order));
