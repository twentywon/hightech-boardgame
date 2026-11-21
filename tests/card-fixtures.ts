import type { Random } from "../src/core/random";

/**
 * Random values that make a Fisher–Yates shuffle (last index down, one draw
 * per step, cards drawn from the end) deal `order` first. Plain numbers, so a
 * browser test can feed them to a stubbed `crypto.getRandomValues`.
 */
export function stackValues<X>(deck: X[], key: (card: X) => string, order: string[]): number[] {
  const cards = deck.slice(),
    values: number[] = [];
  for (let i = cards.length - 1, k = 0; i > 0; i--, k++) {
    let j = i;
    if (k < order.length) {
      j = -1;
      for (let x = i; x >= 0; x--)
        if (key(cards[x]) === order[k]) {
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
