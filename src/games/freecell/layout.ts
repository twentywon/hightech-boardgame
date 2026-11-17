import type { Card } from "../spider/rules";
import { columnOf, pileOf, type PatienceLayout, type Slot } from "../patience/layout";

/**
 * Where FreeCell's cards lie (shared by the view and the browser tests): the eight columns in the middle, the four free
 * cells two by two at the upper left and the four foundations two by two at the upper right. The lower left stays
 * free for the figures and buttons laid over the table.
 */
export const FREECELL_SUBJECT = { half: 7.3, halfZ: 3.55, height: 0.3, lookY: 0, tilt: 1.22 };
export const PITCH = 1.16,
  TOP = -2.75,
  FLOOR = 2.8,
  /** The centres of the two columns of each side block, outward from the table's middle. */
  INNER = 5.61,
  OUTER = 6.71,
  ROWS = [-2.75, -0.95];
const CELL = 0,
  FOUNDATION = 4,
  COLUMN = 8;
export const columnX = (column: number) => (column - 3.5) * PITCH;
/** Free cell `i`: the upper row first, from the left. */
export const cellSpot = (i: number) => ({ x: i % 2 ? -INNER : -OUTER, z: ROWS[i >> 1] });
/** The foundation of `suit`: the upper row first, from the left. */
export const foundationSpot = (suit: number) => ({ x: suit % 2 ? OUTER : INNER, z: ROWS[suit >> 1] });
/** The spots of column `column` (0–7) holding `cards`. */
export const columnSpots = (cards: Card[], column: number) => columnOf(cards, columnX(column), TOP, FLOOR);
export const freecellLayout: PatienceLayout<{ piles: Card[][] }> = {
  subject: FREECELL_SUBJECT,
  piles: (state) => state.piles,
  spots: (state) =>
    state.piles.map((cards, pile) => {
      const at = pile < FOUNDATION ? cellSpot(pile - CELL) : pile < COLUMN ? foundationSpot(pile - FOUNDATION) : null;
      return at ? pileOf(cards.length, at.x, at.z) : columnSpots(cards, pile - COLUMN);
    }),
  slots: [
    ...[0, 1, 2, 3].map((i): Slot => ({ pile: CELL + i, ...cellSpot(i), mark: "cell" })),
    ...[0, 1, 2, 3].map((suit): Slot => ({ pile: FOUNDATION + suit, ...foundationSpot(suit), mark: `suit${suit}` as Slot["mark"] })),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((column): Slot => ({ pile: COLUMN + column, x: columnX(column), z: TOP, mark: "column" })),
  ],
  fanned: (pile) => pile >= COLUMN,
};
