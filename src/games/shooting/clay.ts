import { add, between, draw, passing, type Clocked } from "./common";
import { RIGS, shotDirection, shotError, type Aim, type Offset, type Vec } from "./layout";

/**
 * Clay shooting on an outdoor range, played in real time (free of Three.js and the DOM). `CLAYS` clays are thrown,
 * one or a pair at a time (`DOUBLES` of the throws are pairs), from three trap houses: the one before the shooter,
 * which throws them up and away into the sky, and one at either side beyond the view, which throw them across it.
 * They fly gliding (a spinning clay holds the air: `GRAVITY` is less than the ground's) at a height and a distance
 * where they read as discs against the sky. The shotgun has two barrels: two shots a throw, loaded afresh between
 * throws. A shot is a pattern of `PELLETS` pellets about the way the gun pointed (the sights' error moves the whole
 * pattern); the pattern's width grows with the distance, and a pellet passing within `CLAY_R` of a clay breaks it (one
 * pattern may break both of a pair). A clay that reaches the ground or leaves the field whole is lost.
 */
export const CLAYS = 25,
  /** The count before a throw, the pause after it (s; the gun is reloaded meanwhile), a clay's longest flight. */
  READY = 1.5,
  REST = 1.1,
  LONGEST = 6,
  /** The pellets of a shot and the pattern's half-width (radians: about 0.18 m at 15 m). */
  PELLETS = 40,
  SPREAD = 0.012,
  /** A clay's radius as drawn (m: larger than life, so that it reads as a disc in the sky), how near a pellet must
   *  pass to break it, the air's drag on it (per s) and its gliding fall (m/s²). */
  CLAY_SIZE = 0.36,
  CLAY_R = CLAY_SIZE + 0.02,
  DRAG = 0.06,
  GRAVITY = 5.2,
  /** The share of throws that are pairs, and how far either way a clay may go before it is out of the field (m). */
  DOUBLES = 0.32,
  FIELD = 45;
/** Where clays leave the trap houses: before the shooter, at the left and at the right (the side ones out of view). */
export const HOUSES: Vec[] = [
  { x: 0, y: 0.55, z: -13 },
  { x: -15, y: 1.1, z: -12 },
  { x: 15, y: 1.1, z: -12 },
];
export const HOUSE = HOUSES[0];
export interface Clay {
  /** Its number in the round (from 0), the house it left. */
  id: number;
  house: number;
  p: Vec;
  v: Vec;
  /** When it was thrown, and its spin (rad/s) for the view. */
  at: number;
  spin: number;
}
export interface ClayWorld extends Clocked {
  kind: "clay";
  phase: "ready" | "flight" | "rest" | "over";
  /** When the phase began; clays thrown so far; the clays in the air. */
  since: number;
  thrown: number;
  clays: Clay[];
  /** Shells in the gun (two at most), and shots fired at this throw. */
  shells: number;
  fired: number;
  /** Each clay's result in the order they came down or broke: 0 lost, 1 broken with the first barrel, 2 with the second. */
  card: number[];
}
export type ClayHappening =
  | { kind: "launch"; clay: Clay }
  | { kind: "shot"; aim: Vec; pellets: Vec[]; struck: number; barrel: number }
  | { kind: "click" }
  | { kind: "reload" }
  | { kind: "break"; clay: number; at: Vec; v: Vec; barrel: number }
  | { kind: "lost"; clay: number; at: Vec }
  | { kind: "done" };
export function createClay(seed: number): ClayWorld {
  return {
    kind: "clay",
    t: 0,
    seed,
    phase: "ready",
    since: 0,
    thrown: 0,
    clays: [],
    shells: 2,
    fired: 0,
    card: [],
  };
}
/**
 * A clay thrown now from house `house` (0 before me, 1 left, 2 right): the one before me throws it up into the sky,
 * drifting to a side and a little away; a side house throws it across the view to the other side. `first` is the
 * clay a pair's second follows from the same house: the house before me sends it to the other side, a side house
 * lower, flatter and nearer, so that the two part at once.
 */
export function throwClay(world: ClayWorld, house: number, first: Clay | null = null): Clay {
  const from = HOUSES[house],
    id = world.thrown;
  let v: Vec;
  if (house === 0) {
    const drawn = draw(world) < 0.5 ? -1 : 1,
      side = first ? -Math.sign(first.v.x) || drawn : drawn;
    v = {
      x: side * between(world, 1.8, 5),
      y: between(world, 7.6, 9.4) * (first ? 0.86 : 1),
      z: -between(world, 1.2, 3.2),
    };
  } else {
    const way = house === 1 ? 1 : -1;
    v = {
      x: way * between(world, 7.6, 9.6) * (first ? 1.12 : 1),
      y: first ? first.v.y * 0.8 : between(world, 6.4, 8.2),
      z: first ? first.v.z + 1.6 : between(world, -2.2, 0.8),
    };
  }
  return {
    id,
    house,
    p: { ...from },
    v,
    at: world.t,
    spin: between(world, 18, 30),
  };
}
/** Moves a clay through `dt` seconds of its flight. */
export function fly(clay: Clay, dt: number) {
  clay.v = {
    x: clay.v.x * (1 - DRAG * dt),
    y: clay.v.y * (1 - DRAG * dt) - GRAVITY * dt,
    z: clay.v.z * (1 - DRAG * dt),
  };
  clay.p = add(clay.p, clay.v, dt);
}
/** A throw: one clay or a pair, from one house or (a pair) from both side houses at once. */
function pull(world: ClayWorld): Clay[] {
  const left = CLAYS - world.thrown,
    pair = left >= 2 && draw(world) < DOUBLES,
    house = Math.floor(draw(world) * 3);
  if (!pair) return [throwClay(world, house)];
  const first = throwClay(world, house);
  world.thrown++;
  // A pair from the two side houses crossing each other, or two from the same house parting.
  const crossing = house !== 0 && draw(world) < 0.5,
    second = crossing ? throwClay(world, house === 1 ? 2 : 1) : throwClay(world, house, first);
  world.thrown--;
  return [first, second];
}
/**
 * The pattern of a shot along `aim` with the sights off by `offset`: each pellet's way, laid as a sunflower about
 * the shot's way (the error of the sights moving it whole), each a little off its place by the world's draws.
 */
export function pattern(world: Clocked, aim: Aim, offset: Offset): Vec[] {
  const error = shotError("clay", offset),
    out: Vec[] = [];
  for (let k = 0; k < PELLETS; k++) {
    const r = SPREAD * 1000 * Math.sqrt((k + 0.5) / PELLETS) * (0.8 + 0.4 * between(world, 0, 1)),
      a = k * 2.39996 + between(world, -0.4, 0.4);
    out.push(
      shotDirection(aim, {
        x: error.x + r * Math.cos(a),
        y: error.y + r * Math.sin(a),
      }),
    );
  }
  return out;
}
/** How many pellets of a pattern from `from` pass close enough to break the clay at `at`. */
export const struckBy = (from: Vec, pellets: Vec[], at: Vec) =>
  pellets.filter((d) => {
    const p = passing(from, d, at);
    return p.along > 0 && p.across <= CLAY_R;
  }).length;
/** The trigger pulled: a barrel fires its pattern (every clay a pellet passes breaks), or clicks when both are spent. */
export function fireClay(world: ClayWorld, aim: Aim, offset: Offset): ClayHappening[] {
  if (world.phase === "over" || world.shells <= 0) return [{ kind: "click" }];
  world.shells--;
  world.fired++;
  const from = RIGS.clay.pivot,
    pellets = pattern(world, aim, offset),
    flying = world.phase === "flight" ? world.clays : [],
    hits = flying.map((clay) => ({ clay, n: struckBy(from, pellets, clay.p) })).filter((h) => h.n > 0),
    out: ClayHappening[] = [
      {
        kind: "shot",
        aim: shotDirection(aim, shotError("clay", offset)),
        pellets,
        struck: hits.reduce((s, h) => s + h.n, 0),
        barrel: world.fired,
      },
    ];
  for (const { clay } of hits) {
    out.push({
      kind: "break",
      clay: clay.id,
      at: { ...clay.p },
      v: { ...clay.v },
      barrel: world.fired,
    });
    world.card.push(world.fired);
  }
  world.clays = world.clays.filter((clay) => !hits.some((h) => h.clay === clay));
  if (world.phase === "flight" && !world.clays.length) {
    world.phase = "rest";
    world.since = world.t;
  }
  return out;
}
/** One slice of the range's time. */
export function stepClay(world: ClayWorld, dt: number): ClayHappening[] {
  const out: ClayHappening[] = [];
  world.t += dt;
  if (world.phase === "ready" && world.t - world.since >= READY) {
    world.clays = pull(world);
    world.thrown += world.clays.length;
    world.phase = "flight";
    world.since = world.t;
    for (const clay of world.clays) out.push({ kind: "launch", clay });
  } else if (world.phase === "flight") {
    world.clays = world.clays.filter((clay) => {
      fly(clay, dt);
      if (clay.p.y > 0 && Math.abs(clay.p.x) < FIELD && world.t - clay.at <= LONGEST) return true;
      out.push({
        kind: "lost",
        clay: clay.id,
        at: { ...clay.p, y: Math.max(0, clay.p.y) },
      });
      world.card.push(0);
      return false;
    });
    if (!world.clays.length) {
      world.phase = "rest";
      world.since = world.t;
    }
  } else if (world.phase === "rest" && world.t - world.since >= REST) {
    if (world.thrown >= CLAYS) {
      world.phase = "over";
      out.push({ kind: "done" });
    } else {
      world.phase = "ready";
      world.since = world.t;
      if (world.shells < 2) out.push({ kind: "reload" });
      world.shells = 2;
      world.fired = 0;
    }
  }
  return out;
}
