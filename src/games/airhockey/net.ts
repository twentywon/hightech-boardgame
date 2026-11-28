import { pack } from "../../net/live";
import { keep, step, thinkFor, type Level, type Mind, type World } from "./sim";

/**
 * Air hockey over one Wi-Fi (와이파이 여럿이): what the host's table and a guest's hand are as numbers (`src/net/live.ts`),
 * and one slice of the host's table with each side driven by a hand (mine or a guest's) or by the computer. Free of
 * Three.js and the page, so that the tests play the host and its guests with it.
 *
 * The host's state: the puck (where, how fast), both mallets, and counts of mallet strikes, rail knocks and
 * time-outs (each device makes its own sound when a count goes up). A guest's controls: where its mallet is sent.
 */
export interface Tally {
  hits: number;
  walls: number;
  timeouts: number;
}
export interface Snap extends Tally {
  puck: { x: number; z: number; vx: number; vz: number };
  mallets: [{ x: number; z: number }, { x: number; z: number }];
}
const SNAP = 11;
export const snapOf = (world: World, tally: Tally) => {
  const { puck, mallets } = world;
  return [...pack([puck.x, puck.z, puck.vx, puck.vz, mallets[0].x, mallets[0].z, mallets[1].x, mallets[1].z]), tally.hits, tally.walls, tally.timeouts];
};
export function readSnap(data: number[]): Snap | null {
  if (data.length !== SNAP) return null;
  const [x, z, vx, vz, ax, az, bx, bz, hits, walls, timeouts] = data;
  return { puck: { x, z, vx, vz }, mallets: [{ x: ax, z: az }, { x: bx, z: bz }], hits, walls, timeouts };
}
/** A guest's hand: where its mallet is sent. */
export const inputOf = (hand: { x: number; z: number }) => pack([hand.x, hand.z]);
/** A guest's hand read back for its side, kept to that side's half (a guest cannot send its mallet over the line). */
export function readInput(side: 0 | 1, data: number[] | null) {
  return data && data.length >= 2 ? keep(side, data[0], data[1]) : null;
}
/**
 * One slice of the host's table: a side with a hand (`hands[side]`, mine or a guest's) sends its mallet there with no
 * speed limit, any other is the computer's (unless `waiting`, after a goal), each with its own `minds`. The scorer.
 */
export function hostSlice(world: World, level: Level, hands: ({ x: number; z: number } | null)[], minds: [Mind, Mind], waiting: boolean, random: () => number = Math.random) {
  for (const side of [0, 1] as const) {
    const hand = hands[side];
    if (hand) world.targets[side] = keep(side, hand.x, hand.z);
    else if (!waiting) thinkFor(world, side, level, minds[side], random);
  }
  return step(world, level, [!!hands[0], !!hands[1]]);
}
