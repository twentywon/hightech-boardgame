import { pack, type Control } from "../../net/live";
import { IDLE, PHASES, think, type Input, type Phase, type World } from "./sim";
import type { State } from "./rules";
import type { Team } from "./roster";

/**
 * 축구 over one Wi-Fi (와이파이 여럿이), free of Three.js and the page: what the host's pitch and a guest's controls are as
 * numbers (`src/net/live.ts`), every player's controls on the host (its own hand, a guest's, the computer), and a
 * guest's pitch laid between two of the host's states. The tests run a host and its guests with it.
 *
 * The host's state: the clock (its slice, phase, the phase's slices, the match clock), who kicks off, overtime, whether
 * it is over, who scored last, the counts of kicks, knocks, posts, goals and whistles (each device makes its own
 * sounds when one goes up), the ball, then every player (place, speed, slices since its kick, kick held, on the ground).
 * A guest's controls: its way (x, y), the kick held and how many times it was pressed, the jump held and its presses
 * (counts, so that a tap shorter than a sending is never lost).
 */
const HEAD = 18,
  MAN = 7;
export interface ManSnap {
  x: number;
  y: number;
  vx: number;
  vy: number;
  flash: number;
  held: boolean;
  ground: boolean;
}
export interface Snap {
  tick: number;
  phase: Phase;
  timer: number;
  clock: number;
  kickoff: Team;
  overtime: boolean;
  done: boolean;
  scorer: Team | null;
  counts: World["counts"];
  ball: { x: number; y: number; vx: number; vy: number };
  men: ManSnap[];
}
export function snapOf(world: World): number[] {
  const { ball, counts } = world,
    out = [
      world.tick,
      PHASES.indexOf(world.phase),
      world.timer,
      world.clock,
      world.kickoff,
      world.overtime ? 1 : 0,
      world.done ? 1 : 0,
      world.scorer ?? -1,
      world.men.length,
      counts.kicks,
      counts.bumps,
      counts.posts,
      counts.goals,
      counts.whistles,
      ...pack([ball.x, ball.y, ball.vx, ball.vy], 4),
    ];
  for (const m of world.men) out.push(...pack([m.x, m.y, m.vx, m.vy], 4), Math.min(99, m.flash), m.held ? 1 : 0, m.ground ? 1 : 0);
  return out;
}
export function readSnap(data: number[]): Snap | null {
  const n = data[8];
  if (!Number.isInteger(n) || n < 2 || n > 6 || data.length !== HEAD + MAN * n || !PHASES[data[1]]) return null;
  const men: ManSnap[] = [];
  for (let k = 0; k < n; k++) {
    const [x, y, vx, vy, flash, held, ground] = data.slice(HEAD + MAN * k, HEAD + MAN * (k + 1));
    men.push({ x, y, vx, vy, flash, held: held > 0, ground: ground > 0 });
  }
  return {
    tick: data[0],
    phase: PHASES[data[1]],
    timer: data[2],
    clock: data[3],
    kickoff: data[4] ? 1 : 0,
    overtime: data[5] > 0,
    done: data[6] > 0,
    scorer: data[7] === 0 || data[7] === 1 ? data[7] : null,
    counts: { kicks: data[9], bumps: data[10], posts: data[11], goals: data[12], whistles: data[13] },
    ball: { x: data[14], y: data[15], vx: data[16], vy: data[17] },
    men,
  };
}
/** My controls as sent: the way, the kick held and its presses, the jump held and its presses. */
export interface Hand {
  x: number;
  y: number;
  kick: boolean;
  kicks: number;
  jump: boolean;
  jumps: number;
}
export const inputOf = (hand: Hand) => [...pack([hand.x, hand.y], 2), hand.kick ? 1 : 0, hand.kicks, hand.jump ? 1 : 0, hand.jumps];
export function readInput(data: number[] | null): Hand | null {
  if (!data || data.length < 6) return null;
  const [x, y, kick, kicks, jump, jumps] = data;
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), kick: kick > 0.5, kicks, jump: jump > 0.5, jumps };
}
/**
 * The host's reading of the guests' hands: a guest's presses become one slice's press each time its count goes up
 * (the first sending heard sets where its counts stand, so a guest coming back does not kick at once).
 */
export class Hands {
  private seen = new Map<number, { kicks: number; jumps: number }>();
  take(seat: number, data: number[] | null): Input {
    const hand = readInput(data);
    if (!hand) return IDLE;
    const was = this.seen.get(seat) ?? { kicks: hand.kicks, jumps: hand.jumps };
    this.seen.set(seat, { kicks: hand.kicks, jumps: hand.jumps });
    return { x: hand.x, y: hand.y, kick: hand.kick, kickPress: hand.kicks > was.kicks, jump: hand.jump, jumpPress: hand.jumps > was.jumps };
  }
}
/**
 * Every player's controls on the host: the one this device plays by its own hand (`mine`), a guest's by what it last
 * sent, the computer's (a computer's seat, or a guest away from the room) by `think`.
 */
export function hostInputs(world: World, state: State, control: (seat: number) => Control, latest: (seat: number) => number[] | null, mine: Input, hands: Hands): Input[] {
  return state.players.map((p, k) => {
    const who = control(p.seat);
    return who === "me" ? mine : who === "remote" ? hands.take(p.seat, latest(p.seat)) : who === "computer" ? think(world, k) : IDLE;
  });
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** A guest's pitch as the host's was `t` of the way from state `a` to state `b` (what is counted is the later's). */
export function follow(world: World, a: Snap, b: Snap, t: number) {
  if (a.men.length !== world.men.length || b.men.length !== world.men.length) return;
  // Across a kickoff (everyone set back) the later state alone.
  const jump = a.phase === "goal" && b.phase === "kickoff",
    k = jump ? 1 : t;
  world.tick = Math.round(mix(a.tick, b.tick, k));
  world.phase = b.phase;
  world.timer = b.timer;
  world.clock = Math.round(mix(a.clock, b.clock, k));
  world.kickoff = b.kickoff;
  world.overtime = b.overtime;
  world.done = b.done;
  world.scorer = b.scorer;
  world.counts = { ...b.counts };
  const ball = world.ball;
  ball.x = mix(a.ball.x, b.ball.x, k);
  ball.y = mix(a.ball.y, b.ball.y, k);
  ball.vx = b.ball.vx;
  ball.vy = b.ball.vy;
  world.men.forEach((m, i) => {
    const A = a.men[i],
      B = b.men[i];
    m.x = mix(A.x, B.x, k);
    m.y = mix(A.y, B.y, k);
    m.vx = B.vx;
    m.vy = B.vy;
    m.flash = B.flash;
    m.held = B.held;
    m.ground = B.ground;
  });
}
