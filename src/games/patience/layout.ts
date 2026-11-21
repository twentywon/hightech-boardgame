import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance, type Subject } from "../../engine/camera";
import type { Card } from "../spider/rules";

/**
 * Where the cards of a patience game lie, shared by the view and the browser tests (so nothing here may need Vite:
 * the card pictures are not imported). A game gives the spot of every card of every pile and the places its piles
 * have when empty; the view lays and moves the cards, and the tests aim at the same spots.
 */
export interface Spot {
  x: number;
  y: number;
  z: number;
}
/** What an empty pile shows: a suit's mark on a foundation, a ring on an empty stock, a plain frame, or a king. */
export type SlotMark = "suit0" | "suit1" | "suit2" | "suit3" | "stock" | "cell" | "king" | "column";
export interface Slot {
  pile: number;
  x: number;
  z: number;
  mark: SlotMark;
}
export interface PatienceLayout<S> {
  subject: Subject & { tilt: number };
  /** The cards of every pile, by the rules' numbering. */
  piles(state: S): Card[][];
  /** The spot of every card, pile by pile, bottom first. */
  spots(state: S): Spot[][];
  slots: Slot[];
  /** Piles that are fanned down the table (columns), whose whole length takes a dropped card. */
  fanned(pile: number): boolean;
}
/** How far each card of a column lies below the one before it: face down, face up. */
export const DOWN = 0.2,
  UP = 0.5;
/**
 * The spots of a column of cards starting at `top`, each a little below the one before it (less for a face-down card),
 * squeezed when the column would run past `floor`.
 */
export function columnOf(cards: Card[], x: number, top: number, floor: number, up = UP, down = DOWN): Spot[] {
  let length = 0;
  for (const card of cards.slice(0, -1)) length += card.up ? up : down;
  const squeeze = Math.min(1, (floor - top) / Math.max(length, 0.001));
  let z = top;
  return cards.map((card, i) => {
    const spot = { x, y: 0.02 + i * 0.004, z };
    z += (card.up ? up : down) * squeeze;
    return spot;
  });
}
/** The spots of a squared pile (stock, foundation, free cell): one on another. */
export const pileOf = (count: number, x: number, z: number): Spot[] => Array.from({ length: count }, (_, i) => ({ x, y: 0.02 + i * 0.004, z }));
/** The camera a patience view sets for a canvas of `aspect`, looking at `subject`. */
export function cameraFor(subject: Subject & { tilt: number }, aspect: number) {
  const camera = new PerspectiveCamera(FOV, aspect, 0.1, 120),
    distance = cameraDistance(aspect, false, subject);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}
/** Where a point of the table shows in a canvas whose page box is `box` (for browser tests). */
export function screenOf(subject: Subject & { tilt: number }, box: { x: number; y: number; width: number; height: number }, x: number, z: number, y = 0.03) {
  const v = new Vector3(x, y, z).project(cameraFor(subject, box.width / box.height));
  return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}
