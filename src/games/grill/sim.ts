/**
 * The grill and the plates round it, free of Three.js and DOM: seven places
 * over the coals, the middle one hottest. A piece cooks on the side that
 * lies down. Stepped in fixed slices so that the same presses always give
 * the same meal.
 */
export const SLOTS = 7,
  DT = 1 / 60,
  /** How many pieces a plate holds to begin with. */
  PORTION = 5,
  /** How done a side is: under RAW it is raw, from GOOD it is just right, over OVER it is overdone, from BURNT the piece is spoilt. */
  RAW = 0.5,
  GOOD = 0.8,
  OVER = 1.05,
  CHARRED = 1.3,
  BURNT = 1.55,
  /** A side goes no further than this: charcoal. */
  COAL = 1.9;
/** What is grilled, a plate of each: its name and the seconds one side takes to be done over an ordinary place. */
export const CUTS: { name: string; seconds: number }[] = [
  { name: "삼겹살", seconds: 7 },
  { name: "양념갈비", seconds: 8 },
  { name: "차돌박이", seconds: 4.2 },
  { name: "목살", seconds: 9.5 },
  { name: "새송이버섯", seconds: 6 },
];
/** How hot each place is: the middle, then the six round it. */
export const HEAT = [1.35, 1, 1, 1, 1, 1, 1];
/** The order in which a piece laid without a place being named finds one: round the edge first, the hot middle last. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];
export interface Piece {
  cut: number;
  /** How done each side is; side 0 lies down first. */
  done: [number, number];
  /** True while side 1 lies down. */
  turned: boolean;
  burnt: boolean;
  age: number;
  /** Seconds since it was last turned, for the picture. */
  since: number;
}
export interface World {
  slots: (Piece | null)[];
  /** Pieces left on each plate. */
  plates: number[];
  time: number;
}
export type Happening =
  | { kind: "second" }
  | { kind: "lay"; slot: number }
  | { kind: "flip"; slot: number }
  | { kind: "eat"; slot: number; points: number; raw: boolean }
  | { kind: "discard"; slot: number }
  | { kind: "burn"; slot: number }
  | { kind: "done" };
/** What a side is worth when the piece is eaten. */
export const grade = (done: number) => (done < RAW ? 0 : done < GOOD ? 1 : done <= OVER ? 3 : done < CHARRED ? 1 : 0);
/** The side that lies on the grill. */
export const down = (piece: Piece) => (piece.turned ? 1 : 0);
export const createWorld = (): World => ({ slots: new Array(SLOTS).fill(null), plates: CUTS.map(() => PORTION), time: 0 });
/** True when nothing is left to grill or to eat. */
export const finished = (world: World) => world.plates.every((left) => left === 0) && world.slots.every((piece) => !piece);
const ended = (world: World): Happening[] => (finished(world) ? [{ kind: "done" }] : []);
/** A piece is taken from a plate and laid on a place (the first free one when none is named). */
export function lay(world: World, cut: number, slot = ORDER.find((s) => !world.slots[s]) ?? -1): Happening[] {
  if (!(world.plates[cut] > 0) || slot < 0 || slot >= SLOTS || world.slots[slot]) return [];
  world.plates[cut]--;
  world.slots[slot] = { cut, done: [0, 0], turned: false, burnt: false, age: 0, since: 0 };
  return [{ kind: "lay", slot }];
}
/** The piece on a place is turned over. */
export function flip(world: World, slot: number): Happening[] {
  const piece = world.slots[slot];
  if (!piece) return [];
  piece.turned = !piece.turned;
  piece.since = 0;
  return [{ kind: "flip", slot }];
}
/** A piece is moved to another place that is free, the same side down. */
export function shift(world: World, from: number, to: number) {
  if (!world.slots[from] || to < 0 || to >= SLOTS || world.slots[to]) return false;
  world.slots[to] = world.slots[from];
  world.slots[from] = null;
  return true;
}
/** The piece on a place is taken off: eaten for what its two sides are worth, or thrown away if it is burnt. */
export function take(world: World, slot: number): Happening[] {
  const piece = world.slots[slot];
  if (!piece) return [];
  world.slots[slot] = null;
  if (piece.burnt) return [{ kind: "discard", slot }, ...ended(world)];
  const raw = piece.done.some((side) => side < RAW);
  return [{ kind: "eat", slot, raw, points: raw ? 0 : grade(piece.done[0]) + grade(piece.done[1]) }, ...ended(world)];
}
/** One slice of time: what lies down cooks, and what is left too long burns where it lies. */
export function step(world: World): Happening[] {
  const out: Happening[] = [],
    second = Math.floor(world.time + 1e-9);
  world.time += DT;
  if (Math.floor(world.time + 1e-9) > second) out.push({ kind: "second" });
  world.slots.forEach((piece, slot) => {
    if (!piece) return;
    piece.age += DT;
    piece.since += DT;
    const side = down(piece);
    piece.done[side] = Math.min(COAL, piece.done[side] + (HEAT[slot] / CUTS[piece.cut].seconds) * DT);
    if (!piece.burnt && piece.done[side] >= BURNT) {
      piece.burnt = true;
      out.push({ kind: "burn", slot });
    }
  });
  return out;
}
