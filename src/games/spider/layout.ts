import type { Subject } from "../../engine/camera";
import type { Card } from "./rules";

/** Where the cards of spider solitaire lie; shared by the view and the browser tests. */
export const SPIDER_SUBJECT: Subject & { tilt: number } = { half: 6.3, halfZ: 5.4, height: 0.3, lookY: 0, tilt: 1.25 };
export const PITCH = 1.22,
  PILES_Z = 4.55;
const TOP = -4.4,
  /** How far each card of a column lies below the one before: face down, face up. */
  DOWN = 0.2,
  UP = 0.46,
  /** The column may not run past this z; longer columns are squeezed. */
  FLOOR = 3.3;
/** Where the cards of a column lie, top to bottom. */
export function columnSpots(cards: Card[], column: number) {
  let length = 0;
  for (const card of cards.slice(0, -1)) length += card.up ? UP : DOWN;
  const squeeze = Math.min(1, (FLOOR - TOP) / Math.max(length, 0.001)),
    x = (column - 4.5) * PITCH;
  let z = TOP;
  return cards.map((card, i) => {
    const spot = { x, y: 0.02 + i * 0.004, z };
    z += (card.up ? UP : DOWN) * squeeze;
    return spot;
  });
}
export const stockSpot = { x: 4.5 * PITCH, z: PILES_Z };
