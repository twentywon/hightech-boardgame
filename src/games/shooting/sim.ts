import { createBB, fireBB, stepBB, type BBHappening, type BBWorld } from "./bb";
import { createClay, fireClay, stepClay, type ClayHappening, type ClayWorld } from "./clay";
import { createHunt, fireHunt, stepHunt, type HuntHappening, type HuntWorld } from "./hunt";
import type { Aim, Mode, Offset } from "./layout";

/**
 * The three places of the shooting game in one: each is a world stepped in fixed slices of `DT` seconds by the view
 * (free of Three.js and the DOM, deterministic from its seed), and a trigger pulled with an aim and the rear sight's
 * offset at that moment. What happens comes back as happenings, which the view shows and reports to the rules.
 */
export type World = BBWorld | ClayWorld | HuntWorld;
export type Happening = BBHappening | ClayHappening | HuntHappening;
export const DT = 1 / 120;
export function createWorld(mode: Mode, tier: number, seed: number): World {
  return mode === "clay" ? createClay(seed) : mode === "hunt" ? createHunt(seed) : createBB(tier, seed);
}
export function step(world: World, dt = DT): Happening[] {
  return world.kind === "clay" ? stepClay(world, dt) : world.kind === "hunt" ? stepHunt(world, dt) : stepBB(world, dt);
}
export function fire(world: World, aim: Aim, offset: Offset): Happening[] {
  return world.kind === "clay" ? fireClay(world, aim, offset) : world.kind === "hunt" ? fireHunt(world, aim, offset) : fireBB(world, aim, offset);
}
/** Whether the gun can fire now (not reloading, not working its bolt, something left in it). */
export function ready(world: World) {
  if (world.kind === "clay") return world.phase !== "over" && world.shells > 0;
  if (world.kind === "hunt") return !world.done && world.mag > 0 && world.t >= world.reloadUntil && world.t >= world.boltUntil;
  return !world.done && world.mag > 0 && world.t >= world.reloadUntil;
}
/** Whether the gun is being reloaded now. */
export const reloading = (world: World) => (world.kind === "clay" ? false : world.reloadUntil > world.t);
