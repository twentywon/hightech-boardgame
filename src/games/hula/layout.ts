import { PLACES } from "./rules";

/**
 * Where things lie on the 훌라 table, free of Vite-only imports so that browser tests can aim. Across is x (+x to my
 * right), along is z (+z toward me); places are 0 mine (south), 1 west, 2 north, 3 east.
 */
export const HULA = {
  SUBJECT: { half: 6.7, halfZ: 4.75, height: 0.4, lookY: 0, tilt: 1.1 },
  HAND_Z: 3.95,
  /** How far a card I have picked up rises toward the table's middle. */
  LIFT: 0.34,
  MELD_Z: 2.3,
  RIVAL_Z: -4.0,
  RIVAL_MELD_Z: -2.35,
  SIDE_X: 6.05,
  /** Where a side player's melds begin, from the middle, and how far toward the middle they may reach. */
  SIDE_MELD_X: 4.7,
  SIDE_MELD_IN: 2.15,
  STOCK: { x: -0.75, z: -0.1 },
  DISCARD: { x: 0.75, z: -0.1 },
  CARD_W: 0.72,
};
/** Where the `i`-th of `n` cards of my hand lies across the table. */
export function handX(i: number, n: number) {
  const step = Math.min(0.78, 9.6 / Math.max(1, n));
  return (i - (n - 1) / 2) * step;
}
/** The place round the table (0 south … 3 east) where seat `seat` of a game of `players` sits. */
export const placeOf = (players: number, seat: number) => PLACES[players][seat];
/** Where the `i`-th of `n` cards of a computer's hand lies, and how it is turned. */
export function rivalCard(place: number, i: number, n: number) {
  if (place === 2) {
    const step = Math.min(0.5, 6.4 / Math.max(1, n));
    return { x: (i - (n - 1) / 2) * step, z: HULA.RIVAL_Z, turn: Math.PI };
  }
  const step = Math.min(0.42, 4.6 / Math.max(1, n)),
    along = (i - (n - 1) / 2) * step;
  return place === 1 ? { x: -HULA.SIDE_X, z: -along, turn: Math.PI / 2 } : { x: HULA.SIDE_X, z: along, turn: -Math.PI / 2 };
}
/**
 * Where the cards of the melds a player has laid lie, meld by meld, card by card: mine and the north's in a row
 * across in front of the hand (squeezed to fit), the west's and the east's in rows one under another, from the side
 * toward the middle. Every meld faces me, so that I can read it.
 */
export function meldSpots(place: number, sizes: number[]): { x: number; z: number }[][] {
  if (!sizes.length) return [];
  if (place === 0 || place === 2) {
    const z = place === 0 ? HULA.MELD_Z : HULA.RIVAL_MELD_Z,
      width = (step: number, gap: number) => sizes.reduce((sum, n) => sum + HULA.CARD_W + (n - 1) * step, 0) + gap * (sizes.length - 1),
      room = 9.8;
    let step = 0.34,
      gap = 0.42;
    const wide = width(step, gap);
    if (wide > room) [step, gap] = [step * (room / wide), gap * (room / wide)];
    let x = -width(step, gap) / 2 + HULA.CARD_W / 2;
    return sizes.map((n) => {
      const row = Array.from({ length: n }, (_, k) => ({ x: x + k * step, z }));
      x += HULA.CARD_W + (n - 1) * step + gap;
      return row;
    });
  }
  const side = place === 1 ? -1 : 1,
    rows = sizes.length,
    spacing = rows > 1 ? Math.min(0.62, 3.3 / (rows - 1)) : 0;
  return sizes.map((n, r) => {
    const z = (r - (rows - 1) / 2) * spacing,
      reach = HULA.SIDE_MELD_X - HULA.SIDE_MELD_IN - HULA.CARD_W,
      step = n > 1 ? Math.min(0.3, reach / (n - 1)) : 0,
      outer = HULA.SIDE_MELD_X - HULA.CARD_W / 2;
    // Read left to right either way: the west's from its edge inward, the east's inward to its edge.
    return Array.from({ length: n }, (_, k) => ({ x: side < 0 ? -outer + k * step : outer - (n - 1 - k) * step, z }));
  });
}
