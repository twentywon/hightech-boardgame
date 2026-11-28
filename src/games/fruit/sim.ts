import { COMBO_TIME, KINDS, RADII } from "./rules";

/**
 * The glass box of the fruit game, free of Three.js and DOM: round fruits
 * under gravity that push one another apart, stepped in fixed slices so
 * that the same inputs (and the same `random`) always give the same game.
 * Places are corrected directly and speeds follow from them, which keeps a
 * heap of fruit at rest.
 */
export const HALF = 3.4,
  HEIGHT = 8.6,
  /** A fruit that has come to rest above this line for long enough ends the game. */
  LINE = 7.2,
  /** Where the fruit in hand hangs. */
  HAND = HEIGHT + 1.1,
  DT = 1 / 120,
  GRAVITY = 26,
  /** Seconds between drops, seconds a fruit is given to fall before it counts against the line, and seconds over the line that end the game. */
  WAIT = 0.6,
  GRACE = 1.4,
  SPILL = 1.8,
  /** The kinds that come to hand: the five smallest. */
  HANDED = 5,
  MAX = 90,
  /** How much of its speed a fruit keeps from one slice to the next, and how much of its roll the floor takes: the skins are slippery (the user asked for far less friction). */
  SLIDE = 0.9993,
  FLOOR = 0.006,
  /** Below this way a slice (about 0.06 a second) a fruit is all but at rest and keeps only `SETTLE` of its motion. */
  REST = 0.0005,
  SETTLE = 0.5,
  /** The size a merged fruit starts at and the seconds it takes to swell to its own. */
  SWELL = 0.62,
  SWELL_TIME = 0.2;
/** A fruit's radius as it is now (a new one is still swelling). */
export const sizeOf = (f: Fruit) => RADII[f.kind] * f.grown;
export interface Fruit {
  id: number;
  kind: number;
  x: number;
  y: number;
  /** Where it was a slice ago: its speed. */
  px: number;
  py: number;
  /** How far it has rolled, for the picture. */
  turn: number;
  age: number;
  /** How much of its size it has: a fruit just made by a merge swells into its place (from `SWELL`) instead of bursting the heap apart. */
  grown: number;
}
export interface World {
  fruits: Fruit[];
  /** The kind in hand, the one after it, and where the hand is. */
  held: number;
  next: number;
  aim: number;
  wait: number;
  /** How long fruit has stood over the line. */
  over: number;
  ended: boolean;
  serial: number;
  /** The box's own clock, when the last merge was and how many have come one after another. */
  time: number;
  merged: number;
  chain: number;
  random: () => number;
}
export type Happening = { kind: "drop" } | { kind: "merge"; fruit: number; x: number; y: number; combo: number } | { kind: "bump" } | { kind: "over" };
const hand = (random: () => number) => Math.min(HANDED - 1, Math.floor(random() * HANDED));
export function createWorld(random: () => number = Math.random): World {
  return { fruits: [], held: hand(random), next: hand(random), aim: 0, wait: 0, over: 0, ended: false, serial: 0, time: 0, merged: -Infinity, chain: 0, random };
}
const clamp = (x: number, r: number) => Math.max(-HALF + r, Math.min(HALF - r, x));
/** Lets go of the fruit in hand over where the hand is. */
export function drop(world: World): Happening[] {
  if (world.ended || world.wait > 0 || world.fruits.length >= MAX) return [];
  const r = RADII[world.held],
    x = clamp(world.aim, r);
  world.fruits.push({ id: world.serial++, kind: world.held, x, y: HAND, px: x, py: HAND, turn: 0, age: 0, grown: 1 });
  world.held = world.next;
  world.next = hand(world.random);
  world.wait = WAIT;
  return [{ kind: "drop" }];
}
/** One slice of time: the hand follows `aim`, everything falls, and what overlaps is pushed apart or merged. */
export function step(world: World, aim: number): Happening[] {
  const out: Happening[] = [];
  if (world.ended) return out;
  world.aim = clamp(aim, RADII[world.held]);
  world.wait = Math.max(0, world.wait - DT);
  world.time += DT;
  for (const f of world.fruits) {
    if (f.grown < 1) f.grown = Math.min(1, f.grown + ((1 - SWELL) * DT) / SWELL_TIME);
    const r = RADII[f.kind],
      limit = r * 0.45,
      vx = Math.max(-limit, Math.min(limit, (f.x - f.px) * SLIDE)),
      vy = Math.max(-limit, Math.min(limit, (f.y - f.py) * SLIDE - GRAVITY * DT * DT));
    f.px = f.x;
    f.py = f.y;
    f.x += vx;
    f.y += vy;
    f.age += DT;
  }
  const gone = new Set<Fruit>(),
    born: Fruit[] = [];
  for (let pass = 0; pass < 5; pass++) {
    const list = world.fruits;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (gone.has(a)) continue;
      const ra = sizeOf(a);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (gone.has(b)) continue;
        const rb = sizeOf(b),
          dx = b.x - a.x,
          dy = b.y - a.y,
          reach = ra + rb,
          far = dx * dx + dy * dy;
        if (far >= reach * reach) continue;
        if (a.kind === b.kind) {
          // Two of a kind become one of the next, where they met; two of the largest simply vanish.
          gone.add(a).add(b);
          const x = (a.x + b.x) / 2,
            y = (a.y + b.y) / 2;
          // One soon after another makes a combo.
          world.chain = world.time - world.merged <= COMBO_TIME ? world.chain + 1 : 1;
          world.merged = world.time;
          out.push({ kind: "merge", fruit: a.kind, x, y, combo: world.chain });
          if (a.kind + 1 < KINDS) {
            const r = RADII[a.kind + 1],
              at = { x: clamp(x, r), y: Math.max(r * SWELL, y) },
              // It keeps the two fruits' mean motion, so a merge in flight goes on falling.
              vx = (a.x - a.px + b.x - b.px) / 2,
              vy = (a.y - a.py + b.y - b.py) / 2;
            born.push({ id: world.serial++, kind: a.kind + 1, x: at.x, y: at.y, px: at.x - vx, py: at.y - vy, turn: (a.turn + b.turn) / 2, age: Math.min(a.age, b.age), grown: SWELL });
          }
          break;
        }
        const distance = Math.sqrt(far) || 0.0001,
          push = (reach - distance) / distance,
          // The heavier of the two gives way less.
          ma = ra * ra,
          mb = rb * rb,
          share = mb / (ma + mb);
        a.x -= dx * push * share;
        a.y -= dy * push * share;
        b.x += dx * push * (1 - share);
        b.y += dy * push * (1 - share);
      }
    }
    for (const f of list) {
      if (gone.has(f)) continue;
      const r = sizeOf(f);
      if (f.x < -HALF + r) f.x = -HALF + r;
      else if (f.x > HALF - r) f.x = HALF - r;
      if (f.y < r) {
        f.y = r;
        // The floor takes a little of the roll out.
        f.px += (f.x - f.px) * FLOOR;
      }
    }
    if (pass === 0 && (gone.size || born.length)) {
      world.fruits = world.fruits.filter((f) => !gone.has(f)).concat(born);
      born.length = 0;
    }
  }
  if (gone.size) world.fruits = world.fruits.filter((f) => !gone.has(f)).concat(born);
  let spilling = false;
  for (const f of world.fruits) {
    // What is all but still is let come to rest, so that a heap does not tremble or creep round (moving fruit keeps its slide).
    const mx = f.x - f.px,
      my = f.y - f.py;
    if (mx * mx + my * my < REST * REST) {
      f.px = f.x - mx * SETTLE;
      f.py = f.y - my * SETTLE;
    }
    f.turn -= (f.x - f.px) / RADII[f.kind];
    if (f.age > GRACE && f.y + sizeOf(f) > LINE) spilling = true;
  }
  world.over = spilling ? world.over + DT : 0;
  if (world.over > SPILL) {
    world.ended = true;
    out.push({ kind: "over" });
  }
  return out;
}
