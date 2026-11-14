/**
 * The grill, free of Three.js and DOM: seven places over the coals, the
 * middle one hottest. A piece cooks on the side that lies down; it is
 * turned once, then taken off. Stepped in fixed slices so that the same
 * presses (and the same `random`) always give the same game.
 */
export const SLOTS = 7,
  DT = 1 / 60,
  /** How done a side is: under RAW it is raw, from GOOD it is just right, over OVER it is overdone, at BURNT the piece is lost. */
  RAW = 0.5,
  GOOD = 0.8,
  OVER = 1.05,
  CHARRED = 1.3,
  BURNT = 1.55;
/** What is grilled: its name and the seconds one side takes to be done over an ordinary place. */
export const CUTS: { name: string; seconds: number }[] = [
  { name: "삼겹살", seconds: 7 },
  { name: "차돌박이", seconds: 4.2 },
  { name: "갈비", seconds: 10 },
  { name: "버섯", seconds: 6 },
];
/** How hot each place is: the middle, then the six round it. */
export const HEAT = [1.35, 1, 1, 1, 1, 1, 1];
export interface Piece {
  cut: number;
  /** How done each side is; side 0 lies down first. */
  done: [number, number];
  turned: boolean;
  age: number;
}
export interface World {
  slots: (Piece | null)[];
  time: number;
  /** Seconds until the next piece is laid. */
  wait: number;
  random: () => number;
}
export type Happening = { kind: "lay"; slot: number } | { kind: "flip"; slot: number } | { kind: "serve"; slot: number; points: number; raw: boolean } | { kind: "burn"; slot: number };
/** What a side is worth when the piece is taken off. */
export const grade = (done: number) => (done < RAW ? 0 : done < GOOD ? 1 : done <= OVER ? 3 : done < CHARRED ? 1 : 0);
/** The side that lies on the grill. */
export const down = (piece: Piece) => (piece.turned ? 1 : 0);
/** Seconds between pieces: fewer as the game goes on. */
export const gap = (time: number) => Math.max(1.2, 3.4 - time * 0.022);
function lay(world: World): Happening[] {
  const free = world.slots.flatMap((piece, slot) => (piece ? [] : [slot]));
  if (!free.length) return [];
  const slot = free[Math.floor(world.random() * free.length)];
  world.slots[slot] = { cut: Math.floor(world.random() * CUTS.length), done: [0, 0], turned: false, age: 0 };
  world.wait = gap(world.time) * (0.8 + world.random() * 0.4);
  return [{ kind: "lay", slot }];
}
export function createWorld(random: () => number = Math.random): World {
  const world: World = { slots: new Array(SLOTS).fill(null), time: 0, wait: 0, random };
  lay(world);
  lay(world);
  return world;
}
/** A press on a place: the piece there is turned, or, once turned, taken off. */
export function press(world: World, slot: number): Happening[] {
  const piece = world.slots[slot];
  if (!piece) return [];
  if (!piece.turned) {
    piece.turned = true;
    return [{ kind: "flip", slot }];
  }
  world.slots[slot] = null;
  const raw = piece.done.some((side) => side < RAW);
  return [{ kind: "serve", slot, raw, points: raw ? 0 : grade(piece.done[0]) + grade(piece.done[1]) }];
}
/** One slice of time: what lies down cooks, what is left too long burns, and a new piece is laid when its time comes. */
export function step(world: World): Happening[] {
  const out: Happening[] = [];
  world.time += DT;
  world.slots.forEach((piece, slot) => {
    if (!piece) return;
    piece.age += DT;
    piece.done[down(piece)] += (HEAT[slot] / CUTS[piece.cut].seconds) * DT;
    if (piece.done[down(piece)] >= BURNT) {
      world.slots[slot] = null;
      out.push({ kind: "burn", slot });
    }
  });
  world.wait -= DT;
  if (world.wait <= 0) out.push(...lay(world));
  return out;
}
