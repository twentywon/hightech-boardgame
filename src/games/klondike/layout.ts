import type { Card } from "../spider/rules";
import { columnOf, pileOf, type PatienceLayout, type Slot, type Spot } from "../patience/layout";

/**
 * Where Klondike's cards lie (shared by the view and the browser tests): the seven columns in the middle, the stock
 * and the waste below it at the left, the four foundations down the right. The lower left stays free for the figures
 * and buttons laid over the table.
 */
export const KLONDIKE_SUBJECT = { half: 5.95, halfZ: 3.55, height: 0.3, lookY: 0, tilt: 1.22 };
export const PITCH = 1.22,
  SIDE = 5.3,
  TOP = -2.55,
  /** The last card of a column may not lie below this; longer columns are squeezed. */
  FLOOR = 2.75,
  /** How far each fanned card of the waste lies below the one before (draw three). */
  FAN = 0.34;
/** Pile numbers, as in the rules. */
const STOCK = 0,
  WASTE = 1,
  FOUNDATION = 2,
  TABLEAU = 6;
export const stockSpot = { x: -SIDE, z: TOP };
export const wasteBase = { x: -SIDE, z: TOP + 1.8 };
export const foundationSpot = (suit: number) => ({ x: SIDE, z: TOP + suit * 1.7 });
export const columnX = (column: number) => (column - 3) * PITCH;
/** The spots of column `column` (0–6) holding `cards`. */
export const tableauSpots = (cards: Card[], column: number) => columnOf(cards, columnX(column), TOP, FLOOR);
/** The spots of a waste of `count` cards whose top `fan` lie fanned. */
export function wasteSpots(count: number, fan: number): Spot[] {
  const spots = pileOf(count, wasteBase.x, wasteBase.z),
    fanned = Math.min(fan, count);
  for (let i = 0; i < fanned; i++) spots[count - fanned + i].z += i * FAN;
  return spots;
}
interface Shown {
  piles: Card[][];
  fan: number;
}
export const klondikeLayout: PatienceLayout<Shown> = {
  subject: KLONDIKE_SUBJECT,
  piles: (state) => state.piles,
  spots: (state) =>
    state.piles.map((cards, pile) => {
      if (pile === STOCK) return pileOf(cards.length, stockSpot.x, stockSpot.z);
      if (pile === WASTE) return wasteSpots(cards.length, state.fan);
      if (pile < TABLEAU) {
        const at = foundationSpot(pile - FOUNDATION);
        return pileOf(cards.length, at.x, at.z);
      }
      return tableauSpots(cards, pile - TABLEAU);
    }),
  slots: [
    { pile: STOCK, ...stockSpot, mark: "stock" },
    { pile: WASTE, ...wasteBase, mark: "cell" },
    ...[0, 1, 2, 3].map((suit): Slot => ({ pile: FOUNDATION + suit, ...foundationSpot(suit), mark: `suit${suit}` as Slot["mark"] })),
    ...[0, 1, 2, 3, 4, 5, 6].map((column): Slot => ({ pile: TABLEAU + column, x: columnX(column), z: TOP, mark: "king" })),
  ],
  fanned: (pile) => pile >= TABLEAU || pile === WASTE,
};
