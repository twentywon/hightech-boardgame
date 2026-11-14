/**
 * The grill, the plates round it and the wrap plate, free of Three.js and
 * DOM: seven places over the coals, the middle one hottest. A piece cooks
 * on the side that lies down. Stepped in fixed slices so that the same
 * presses always give the same meal.
 */
export const SLOTS = 7,
  DT = 1 / 60,
  /** How many pieces a plate holds; an emptied plate is filled again at once. */
  PORTION = 5,
  /** How done a side is: under RAW it is raw, from GOOD it is just right, over OVER it is overdone, from BURNT the piece is spoilt. */
  RAW = 0.5,
  GOOD = 0.8,
  OVER = 1.05,
  CHARRED = 1.3,
  BURNT = 1.55,
  /** A side goes no further than this: charcoal. */
  COAL = 1.9,
  /** How many pieces a wrap takes. */
  FILLING = 2;
/** What is grilled, a plate of each: its name and the seconds one side takes to be done over an ordinary place. */
export const CUTS: { name: string; seconds: number }[] = [
  { name: "삼겹살", seconds: 8.5 },
  { name: "양념갈비", seconds: 9.5 },
  { name: "차돌박이", seconds: 5 },
  { name: "목살", seconds: 11.5 },
  { name: "새송이버섯", seconds: 7 },
];
/** What may go on a wrap beside the meat. */
export const RELISHES = ["김치", "쌈장", "마늘·고추", "기름장"];
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
/** What lies on the wrap plate: a leaf, up to two pieces off the grill, and relishes. */
export interface Wrap {
  leaf: boolean;
  meats: Piece[];
  relishes: number[];
}
export interface World {
  slots: (Piece | null)[];
  /** Pieces left on each plate. */
  plates: number[];
  wrap: Wrap;
  time: number;
}
export type Happening =
  | { kind: "second" }
  | { kind: "lay"; slot: number }
  | { kind: "flip"; slot: number }
  | { kind: "eat"; slot: number; points: number; raw: boolean }
  | { kind: "discard"; slot: number }
  | { kind: "burn"; slot: number }
  | { kind: "dress" }
  | { kind: "wrap"; points: number; meats: number; leaf: boolean };
/** What a side is worth when the piece is eaten. */
export const grade = (done: number) => (done < RAW ? 0 : done < GOOD ? 1 : done <= OVER ? 3 : done < CHARRED ? 1 : 0);
/** What a piece is worth: nothing while a side is raw. */
export const worth = (piece: Pick<Piece, "done">) => (piece.done.some((side) => side < RAW) ? 0 : grade(piece.done[0]) + grade(piece.done[1]));
/** The side that lies on the grill. */
export const down = (piece: Piece) => (piece.turned ? 1 : 0);
export const createWorld = (): World => ({ slots: new Array(SLOTS).fill(null), plates: CUTS.map(() => PORTION), wrap: { leaf: false, meats: [], relishes: [] }, time: 0 });
/** A piece is taken from a plate and laid on a place (the first free one when none is named); the plate's last piece brings a fresh plateful. */
export function lay(world: World, cut: number, slot = ORDER.find((s) => !world.slots[s]) ?? -1): Happening[] {
  if (!(world.plates[cut] > 0) || slot < 0 || slot >= SLOTS || world.slots[slot]) return [];
  world.plates[cut] = world.plates[cut] > 1 ? world.plates[cut] - 1 : PORTION;
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
  if (piece.burnt) return [{ kind: "discard", slot }];
  return [{ kind: "eat", slot, raw: worth(piece) === 0 && piece.done.some((side) => side < RAW), points: worth(piece) }];
}
/** A leaf is laid on the wrap plate. */
export function leaf(world: World): Happening[] {
  if (world.wrap.leaf) return [];
  world.wrap.leaf = true;
  return [{ kind: "dress" }];
}
/** A piece goes from the grill onto the wrap plate; a burnt one is not taken. */
export function fill(world: World, slot: number): Happening[] {
  const piece = world.slots[slot];
  if (!piece || piece.burnt || world.wrap.meats.length >= FILLING) return [];
  world.slots[slot] = null;
  world.wrap.meats.push(piece);
  return [{ kind: "dress" }];
}
/** A relish is added to the wrap plate, once each. */
export function relish(world: World, which: number): Happening[] {
  if (!(which >= 0 && which < RELISHES.length) || world.wrap.relishes.includes(which)) return [];
  world.wrap.relishes.push(which);
  return [{ kind: "dress" }];
}
/**
 * What is on the wrap plate is eaten: its pieces for what they are worth,
 * and, when they lie in a leaf and are worth something, two more for the
 * wrap and one for each relish up to three.
 */
export function eatWrap(world: World): Happening[] {
  const { wrap } = world;
  if (!wrap.leaf && !wrap.meats.length && !wrap.relishes.length) return [];
  const meat = wrap.meats.reduce((sum, piece) => sum + worth(piece), 0),
    points = meat + (wrap.leaf && meat > 0 ? 2 + Math.min(3, wrap.relishes.length) : 0),
    told: Happening = { kind: "wrap", points, meats: wrap.meats.length, leaf: wrap.leaf };
  world.wrap = { leaf: false, meats: [], relishes: [] };
  return [told];
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
