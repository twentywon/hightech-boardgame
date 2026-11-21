import { Vector3 } from "three";
import type { Layout } from "../cards/table-view";

/**
 * The oval table and where everything lies on it, in table units (a card is 1 by 1.5). Free of Vite-only imports.
 * The felt is a racetrack: `length` and `depth` are half its size, centred `z` toward me.
 */
export interface Shape {
  length: number;
  depth: number;
  z: number;
}
export const TABLE: Shape = { length: 6.45, depth: 4.4, z: 0.25 };
/** A longer, narrower table for very wide screens (phones held sideways). */
export const TABLE_LONG: Shape = { length: 8.75, depth: 3.8, z: 0.12 };

/**
 * Wide screens: me at the near side, the others round the oval clockwise from my left (seat 1 at my left), the
 * community cards in a row in the middle with the deck at their left, the pot between them and me.
 */
export const HOLDEM_WIDE: Layout = {
  subject: { half: 6.7, halfZ: 4.25, height: 0.3, lookY: 0, tilt: 1.12 },
  rivals: [
    [0],
    [-2.7, 2.7],
    [-4.75, 0, 4.75],
    [-4.8, -2.35, 2.35, 4.8],
    [-4.85, -3.1, 0, 3.1, 4.85],
  ],
  rivalZ: [
    [-2.7],
    [-2.5, -2.5],
    [0.95, -2.7, 0.95],
    [0.95, -2.5, -2.5, 0.95],
    [1.0, -2.45, -2.75, -2.45, 1.0],
  ],
  rivalWidth: [2.4, 2.4, 2.4, 2.4, 2.4],
  rivalScale: [0.95, 0.95, 0.92, 0.9, 0.88],
  mineWidth: 2.6,
  mineScale: 1.12,
  mineZ: 2.3,
  deck: new Vector3(-2.95, 0.12, -0.5),
  discard: new Vector3(-2.95, 0.02, -0.5),
  board: { x: -1.75, z: -0.5, gap: 1.12, scale: 0.95 },
  pot: { z: 0.95, label: 0.5 },
  inward: true,
};
/** Squarer screens: the same seats drawn closer together across, further apart from front to back. */
export const HOLDEM_SQUARE: Layout = {
  subject: { half: 4.35, halfZ: 4.9, height: 0.3, lookY: 0, tilt: 1.12 },
  rivals: [
    [0],
    [-1.9, 1.9],
    [-3.15, 0, 3.15],
    [-3.1, -1.6, 1.6, 3.1],
    [-3.15, -2.15, 0, 2.15, 3.15],
  ],
  rivalZ: [
    [-3.05],
    [-2.9, -2.9],
    [1.2, -3.0, 1.2],
    [1.15, -2.7, -2.7, 1.15],
    [1.2, -2.2, -3.05, -2.2, 1.2],
  ],
  rivalWidth: [2.2, 2.2, 2.1, 2.0, 1.9],
  rivalScale: [0.9, 0.9, 0.86, 0.82, 0.8],
  mineWidth: 2.5,
  mineScale: 1.05,
  mineZ: 2.75,
  deck: new Vector3(-2.35, 0.12, -0.4),
  discard: new Vector3(-2.35, 0.02, -0.4),
  board: { x: -1.3, z: -0.4, gap: 0.92, scale: 0.82 },
  pot: { z: 0.85, label: 0.4 },
  inward: true,
};
/**
 * Very wide screens: a longer table, the seats spread along it and the pot beside the community cards, so that
 * everything is drawn larger in the little height there is.
 */
export const HOLDEM_LONG: Layout = {
  subject: { half: 8.6, halfZ: 3.72, height: 0.3, lookY: 0, tilt: 1.04 },
  rivals: [
    [0],
    [-3.0, 3.0],
    [-6.7, 0, 6.7],
    [-6.9, -2.95, 2.95, 6.9],
    [-6.9, -4.15, 0, 4.15, 6.9],
  ],
  // The seats at the ends sit high enough to stay clear of the buttons in the lower corners.
  rivalZ: [
    [-2.4],
    [-2.3, -2.3],
    [-0.15, -2.4, -0.15],
    [-0.1, -2.3, -2.3, -0.1],
    [-0.1, -2.3, -2.4, -2.3, -0.1],
  ],
  rivalWidth: [2.4, 2.4, 2.4, 2.4, 2.4],
  rivalScale: [0.92, 0.92, 0.92, 0.92, 0.92],
  mineWidth: 2.5,
  mineScale: 1.08,
  mineZ: 1.88,
  deck: new Vector3(-2.95, 0.12, -0.42),
  discard: new Vector3(-2.95, 0.02, -0.42),
  board: { x: -1.75, z: -0.42, gap: 1.12, scale: 0.92 },
  // The pot lies at the right of my cards, between them and the end of the table.
  pot: { x: 3.55, z: 1.4, label: 0.88 },
  inward: true,
};
/** The table a layout is drawn on. */
export const shapeOf = (layout: Layout) => (layout === HOLDEM_LONG ? TABLE_LONG : TABLE);
