import { add, between, passing, type Clocked } from "./common";
import { RIGS, shotDirection, shotError, type Aim, type Offset, type Vec } from "./layout";

/**
 * Trap shooting on an outdoor range, played in real time (free of Three.js and the DOM): `CLAYS` clays are thrown
 * one at a time from the trap house before the shooter, away from them, each at its own angle, height and speed
 * (drawn from the world's own generator). The shotgun has two barrels: two shots a clay, loaded afresh between clays.
 * A shot is a pattern of `PELLETS` pellets about the way the gun pointed (the sights' error moves the whole pattern);
 * the pattern's width grows with the distance, and a pellet passing within `CLAY_R` of the clay breaks it. A clay that
 * reaches the ground whole is lost.
 */
export const CLAYS = 25,
  /** The count before a clay is thrown, the pause after it (s; the gun is reloaded meanwhile), its longest flight. */
  READY = 1.8,
  REST = 1.3,
  LONGEST = 5,
  /** The pellets of a shot and the pattern's half-width (radians: about 0.45 m at 25 m). */
  PELLETS = 40,
  SPREAD = 0.018,
  /** How near a pellet must pass to break a clay (m), the air's drag on it (per s), gravity. */
  CLAY_R = 0.085,
  DRAG = 0.1,
  GRAVITY = 9.81;
/** Where clays leave the trap house. */
export const HOUSE: Vec = { x: 0, y: 0.55, z: -15 };
export interface Clay {
  p: Vec;
  v: Vec;
  /** When it was thrown, and its spin (rad/s) for the view. */
  at: number;
  spin: number;
}
export interface ClayWorld extends Clocked {
  kind: "clay";
  phase: "ready" | "flight" | "rest" | "over";
  /** When the phase began; clays thrown so far; the clay in the air. */
  since: number;
  thrown: number;
  clay: Clay | null;
  /** Shells in the gun (two at most), and shots fired at this clay. */
  shells: number;
  fired: number;
  /** Each clay's result: 0 lost, 1 broken with the first barrel, 2 with the second. */
  card: number[];
}
export type ClayHappening =
  | { kind: "launch"; clay: Clay }
  | { kind: "shot"; aim: Vec; pellets: Vec[]; struck: number; barrel: number }
  | { kind: "click" }
  | { kind: "reload" }
  | { kind: "break"; at: Vec; v: Vec; barrel: number }
  | { kind: "lost"; at: Vec }
  | { kind: "done" };
export function createClay(seed: number): ClayWorld {
  return { kind: "clay", t: 0, seed, phase: "ready", since: 0, thrown: 0, clay: null, shells: 2, fired: 0, card: [] };
}
/** A clay thrown now: away from the shooter at an angle, a height and a speed of its own. */
export function throwClay(world: ClayWorld): Clay {
  const yaw = between(world, -0.62, 0.62),
    rise = between(world, 0.2, 0.42),
    speed = between(world, 17, 23),
    flat = speed * Math.cos(rise);
  return { p: { ...HOUSE }, v: { x: flat * Math.sin(yaw), y: speed * Math.sin(rise), z: -flat * Math.cos(yaw) }, at: world.t, spin: between(world, 18, 30) };
}
/** Moves a clay through `dt` seconds of its flight. */
export function fly(clay: Clay, dt: number) {
  clay.v = { x: clay.v.x * (1 - DRAG * dt), y: clay.v.y * (1 - DRAG * dt) - GRAVITY * dt, z: clay.v.z * (1 - DRAG * dt) };
  clay.p = add(clay.p, clay.v, dt);
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
    out.push(shotDirection(aim, { x: error.x + r * Math.cos(a), y: error.y + r * Math.sin(a) }));
  }
  return out;
}
/** How many pellets of a pattern from `from` pass close enough to break the clay at `at`. */
export const struckBy = (from: Vec, pellets: Vec[], at: Vec) => pellets.filter((d) => {
  const p = passing(from, d, at);
  return p.along > 0 && p.across <= CLAY_R;
}).length;
/** The trigger pulled: a barrel fires its pattern (the clay breaks if a pellet passes it), or clicks when both are spent. */
export function fireClay(world: ClayWorld, aim: Aim, offset: Offset): ClayHappening[] {
  if (world.phase === "over" || world.shells <= 0) return [{ kind: "click" }];
  world.shells--;
  world.fired++;
  const from = RIGS.clay.pivot,
    pellets = pattern(world, aim, offset),
    clay = world.phase === "flight" ? world.clay : null,
    struck = clay ? struckBy(from, pellets, clay.p) : 0,
    out: ClayHappening[] = [{ kind: "shot", aim: shotDirection(aim, shotError("clay", offset)), pellets, struck, barrel: world.fired }];
  if (clay && struck > 0) {
    out.push({ kind: "break", at: { ...clay.p }, v: { ...clay.v }, barrel: world.fired });
    world.card.push(world.fired);
    world.clay = null;
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
    world.clay = throwClay(world);
    world.thrown++;
    world.phase = "flight";
    world.since = world.t;
    out.push({ kind: "launch", clay: world.clay });
  } else if (world.phase === "flight" && world.clay) {
    fly(world.clay, dt);
    if (world.clay.p.y <= 0 || world.t - world.since > LONGEST) {
      out.push({ kind: "lost", at: { ...world.clay.p, y: Math.max(0, world.clay.p.y) } });
      world.card.push(0);
      world.clay = null;
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
