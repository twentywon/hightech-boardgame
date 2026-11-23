import { pack } from "../../net/live";
import { toss, type Phase, type World } from "./sim";

/**
 * Table tennis over one Wi-Fi (와이파이 여럿이): the host's hall and a guest's hand as numbers (`src/net/live.ts`). Free
 * of Three.js and the page.
 *
 * The host's state: the ball (where, its spin for the printed star), both paddles (where, and how fast each goes
 * along the table, for the blade's lean), the phase and the server, how long ago side 1 last struck (the gloved
 * hand's follow-through), and counts of what makes a sound or a word (strokes, bounces, the net, the floor, lets, and
 * each side's smashes), so that every device hears and says them itself. A guest's controls: where its blade is sent
 * (it aims along its own line of sight, so that the blade stands under its finger) and how many times it has tossed
 * its serve (a count, so that none is lost between two sendings).
 */
export const PHASES: Phase[] = ["ready", "toss", "rally", "dead"];
export interface Counts {
  hits: number;
  bounces: number;
  nets: number;
  floors: number;
  lets: number;
  smashes: [number, number];
}
export const noCounts = (): Counts => ({ hits: 0, bounces: 0, nets: 0, floors: 0, lets: 0, smashes: [0, 0] });
export interface Snap {
  ball: { x: number; y: number; z: number; wx: number; wy: number; wz: number };
  paddles: [{ x: number; y: number; z: number; vz: number }, { x: number; y: number; z: number; vz: number }];
  phase: Phase;
  server: 0 | 1;
  /** Seconds since side 1 last struck (at most 1). */
  since: number;
  counts: Counts;
}
const SNAP = 24;
export function snapOf(world: World, counts: Counts) {
  const { ball: b, paddles: [p, q] } = world;
  return [
    ...pack([b.x, b.y, b.z]),
    ...pack([b.wx, b.wy, b.wz], 0),
    ...pack([p.x, p.y, p.z, p.vz, q.x, q.y, q.z, q.vz]),
    PHASES.indexOf(world.phase),
    world.server,
    ...pack([Math.min(1, Math.max(0, world.time - world.struck[1]))]),
    counts.hits,
    counts.bounces,
    counts.nets,
    counts.floors,
    counts.lets,
    counts.smashes[0],
    counts.smashes[1],
  ];
}
export function readSnap(data: number[]): Snap | null {
  if (data.length !== SNAP) return null;
  const [x, y, z, wx, wy, wz, ax, ay, az, avz, bx, by, bz, bvz, phase, server, since, hits, bounces, nets, floors, lets, s0, s1] = data;
  if (!PHASES[phase] || (server !== 0 && server !== 1)) return null;
  return {
    ball: { x, y, z, wx, wy, wz },
    paddles: [
      { x: ax, y: ay, z: az, vz: avz },
      { x: bx, y: by, z: bz, vz: bvz },
    ],
    phase: PHASES[phase],
    server,
    since,
    counts: { hits, bounces, nets, floors, lets, smashes: [s0, s1] },
  };
}
/** A guest's hand: where its blade is sent, and how many times it has tossed its serve. */
export const inputOf = (hand: { x: number; z: number }, tosses: number) => [...pack([hand.x, hand.z]), tosses];
export function readInput(data: number[] | null): { x: number; z: number; tosses: number } | null {
  if (!data || data.length < 3) return null;
  // A blade beyond the hall's floor is no blade: kept to a few metres about the table (`keep` then keeps it to its side).
  return { x: Math.max(-8, Math.min(8, data[0])), z: Math.max(-12, Math.min(12, data[1])), tosses: Math.max(0, Math.floor(data[2])) };
}
/**
 * A guest's toss taken on the host: when its count has gone up since the last one `taken`, its side tosses (if it is
 * its serve, the ball held); the count taken back.
 */
export function takeToss(world: World, side: 0 | 1, tosses: number, taken: number) {
  if (tosses > taken) toss(world, side);
  return Math.max(taken, tosses);
}
