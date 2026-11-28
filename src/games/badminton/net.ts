import { pack } from "../../net/live";
import { jump, swing, type Phase, type World } from "./sim";

/**
 * Badminton over one Wi-Fi (와이파이 여럿이): the host's court and a guest's racket as numbers (`src/net/live.ts`). Free
 * of Three.js and the page.
 *
 * The host's state: the shuttle (where, and how it flies, for its nose and its glow), both players (where, how high they
 * jump, how fast they run, how long ago each began its swing and last struck, and whether that stroke was overhead),
 * the phase, the server, the striker, whether the shuttle in the air is the serve or has met the net, the serve's court,
 * and counts of what makes a sound or a word (strokes, each side's smashes, landings, the net), so that every device
 * hears and says them itself. A guest's controls: how many swipes it has made and the last one's power and lean, and how
 * many times it has pressed the jump button (counts, so that none is lost between two sendings).
 */
export const PHASES: Phase[] = ["ready", "flying", "dead"];
export interface Counts {
  hits: number;
  smashes: [number, number];
  lands: number;
  nets: number;
}
export const noCounts = (): Counts => ({ hits: 0, smashes: [0, 0], lands: 0, nets: 0 });
export interface PlayerSnap {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  /** Seconds since its swing under way began (-1: none), since it last struck (at most 1), and whether that was overhead. */
  swing: number;
  struck: number;
  high: boolean;
}
export interface Snap {
  shuttle: { x: number; y: number; z: number; vx: number; vy: number; vz: number };
  players: [PlayerSnap, PlayerSnap];
  phase: Phase;
  server: 0 | 1;
  hitter: 0 | 1;
  served: boolean;
  netted: boolean;
  even: boolean;
  counts: Counts;
}
const SNAP = 33;
const player = (w: World, side: 0 | 1) => {
  const p = w.players[side];
  return [...pack([p.x, p.z, p.y, p.vx, p.vz]), ...pack([p.swing ? Math.min(2, w.time - p.swing.at) : -1, Math.min(1, Math.max(0, w.time - p.struck))]), p.high ? 1 : 0];
};
export function snapOf(w: World, counts: Counts) {
  const s = w.shuttle;
  return [
    ...pack([s.x, s.y, s.z, s.vx, s.vy, s.vz]),
    ...player(w, 0),
    ...player(w, 1),
    PHASES.indexOf(w.phase),
    w.server,
    w.hitter,
    w.served ? 1 : 0,
    w.netted ? 1 : 0,
    w.even ? 1 : 0,
    counts.hits,
    counts.smashes[0],
    counts.smashes[1],
    counts.lands,
    counts.nets,
  ];
}
const readPlayer = (d: number[]): PlayerSnap => ({ x: d[0], z: d[1], y: d[2], vx: d[3], vz: d[4], swing: d[5], struck: d[6], high: d[7] === 1 });
export function readSnap(data: number[]): Snap | null {
  if (data.length !== SNAP) return null;
  const [x, y, z, vx, vy, vz] = data,
    rest = data.slice(22),
    [phase, server, hitter, served, netted, even, hits, s0, s1, lands, nets] = rest;
  if (!PHASES[phase] || (server !== 0 && server !== 1) || (hitter !== 0 && hitter !== 1)) return null;
  return {
    shuttle: { x, y, z, vx, vy, vz },
    players: [readPlayer(data.slice(6, 14)), readPlayer(data.slice(14, 22))],
    phase: PHASES[phase],
    server,
    hitter,
    served: served === 1,
    netted: netted === 1,
    even: even === 1,
    counts: { hits, smashes: [s0, s1], lands, nets },
  };
}
/** A guest's controls: how many swipes it has made, the last one's power and lean, and how many jumps. */
export const inputOf = (swings: number, power: number, yaw: number, jumps: number) => [swings, ...pack([power, yaw]), jumps];
export function readInput(data: number[] | null): { swings: number; power: number; yaw: number; jumps: number } | null {
  if (!data || data.length < 4) return null;
  return { swings: Math.max(0, Math.floor(data[0])), power: Math.max(0, Math.min(5, data[1])), yaw: Math.max(-0.5, Math.min(0.5, data[2])), jumps: Math.max(0, Math.floor(data[3])) };
}
/**
 * A guest's swipes and jumps taken on the host: when its counts have gone up since those `taken`, its side swings with
 * the last swipe (or serves, if it is its serve) and jumps; the counts taken back.
 */
export function takeInput(world: World, side: 0 | 1, input: ReturnType<typeof readInput>, taken: { swings: number; jumps: number }) {
  if (!input) return taken;
  // Counts that went back (the guest's table was built again: it rejoined, or was resynced) start the tally again,
  // instead of every swipe being ignored until the new count passes the old.
  if (input.swings < taken.swings || input.jumps < taken.jumps) return { swings: input.swings, jumps: input.jumps };
  if (input.jumps > taken.jumps) jump(world, side);
  if (input.swings > taken.swings) swing(world, side, input.power, input.yaw);
  return { swings: input.swings, jumps: input.jumps };
}
