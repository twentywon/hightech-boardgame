import { pack } from "../../net/live";
import { MAX_SLIDE, steer, step, type Input, type World } from "./sim";
import type { SKILL } from "./sim";

/**
 * Table soccer over one Wi-Fi (와이파이 여럿이): the host's table and a guest's hand as numbers (`src/net/live.ts`), and
 * one slice of the host's table with each side's rods driven by a hand or by the computer. Free of Three.js and the
 * page. The host's state: the ball, both sides' push and swing, and a count of hard knocks (for the sound). A
 * guest's controls: how far it pushes its rods, and how many kicks it has made (a count, so that none is lost
 * between two sendings).
 */
export interface Snap {
  ball: { x: number; z: number };
  slide: [number, number];
  /** Seconds into each side's swing, or -1. */
  swing: [number, number];
  hits: number;
}
const SNAP = 7;
export const snapOf = (world: World, hits: number) => [...pack([world.ball.x, world.ball.z, world.slide[0], world.slide[1], world.swing[0], world.swing[1]]), hits];
export function readSnap(data: number[]): Snap | null {
  if (data.length !== SNAP) return null;
  const [x, z, a, b, sa, sb, hits] = data;
  return { ball: { x, z }, slide: [a, b], swing: [sa, sb], hits };
}
/** A guest's hand: its push and its count of kicks. */
export const inputOf = (target: number, kicks: number) => [...pack([target]), kicks];
export function readInput(data: number[] | null): { target: number; kicks: number } | null {
  if (!data || data.length < 2) return null;
  return { target: Math.max(-MAX_SLIDE, Math.min(MAX_SLIDE, data[0])), kicks: Math.max(0, Math.floor(data[1])) };
}
/** One slice of the host's table: a side with a hand plays it (`hands[side]`), any other is the computer's. The scorer. */
export function hostSlice(world: World, level: keyof typeof SKILL, hands: (Input | null)[], random: () => number = Math.random) {
  const inputs = ([0, 1] as const).map((side) => hands[side] ?? steer(world, side, level, random)) as [Input, Input];
  return step(world, inputs);
}
