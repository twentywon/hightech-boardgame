import { pack, type Control } from "../../net/live";
import { CELLS, autopilot, cellOf, type Level, type World } from "./sim";

/**
 * 땅따먹기 over one Wi-Fi (와이파이 여럿이): what the host's round and a guest's hand are as numbers (`src/net/live.ts`),
 * the host's wanted heading for every mover (a hand, a guest's, the computer's), and a guest's world laid from the
 * host's states. Free of Three.js and the page, so that the tests run a host and its guests with it.
 *
 * The host's state: its round's tick, the tick it closed (-1 while it runs) and how many movers; then for each mover
 * its place, heading, whether it is in play, its seconds out, its trail's length, its land (cells), times out and
 * others put out; then a slice of the field's owners, `SLICE` numbers from `offset` on, each holding `PER` cells of
 * three bits (whose land, 0 nobody's). The slices take turns, so that two states in a row hold the whole field, and a
 * device that comes back has it all again within a fifteenth of a second. A guest's hand: whether it steers, and
 * the heading it wants.
 */
const HEAD = 4,
  MOVER = 9,
  /** Cells of three bits to a number (48 bits, well inside what a number holds exactly). */
  PER = 16,
  WORDS = Math.ceil(CELLS / PER),
  SLICE = WORDS / 2;
export interface MoverSnap {
  x: number;
  y: number;
  heading: number;
  alive: boolean;
  wait: number;
  trail: number;
  land: number;
  outs: number;
  kos: number;
}
export interface Snap {
  tick: number;
  closed: number | null;
  movers: MoverSnap[];
  offset: number;
  words: number[];
}
/** The host's state, the field's slice by `turn` (0 or 1, alternating). */
export function snapOf(world: World, turn: number): number[] {
  const offset = (turn % 2) * SLICE,
    out = [world.tick, world.closed ?? -1, world.movers.length, offset];
  for (const m of world.movers) out.push(...pack([m.x, m.y, m.heading]), m.alive ? 1 : 0, Math.round(m.wait * 10) / 10, m.trail.length, m.land, m.outs, m.kos);
  for (let w = offset; w < offset + SLICE; w++) {
    let word = 0;
    for (let i = PER - 1; i >= 0; i--) {
      const c = w * PER + i;
      word = word * 8 + (c < CELLS ? world.owner[c] : 0);
    }
    out.push(word);
  }
  return out;
}
export function readSnap(data: number[]): Snap | null {
  const n = data[2];
  if (!Number.isInteger(n) || n < 2 || n > 4 || data.length !== HEAD + MOVER * n + SLICE) return null;
  const movers: MoverSnap[] = [];
  for (let k = 0; k < n; k++) {
    const [x, y, heading, alive, wait, trail, land, outs, kos] = data.slice(HEAD + MOVER * k, HEAD + MOVER * (k + 1));
    movers.push({ x, y, heading, alive: alive > 0, wait, trail, land, outs, kos });
  }
  const offset = data[3];
  if (offset !== 0 && offset !== SLICE) return null;
  return { tick: data[0], closed: data[1] >= 0 ? data[1] : null, movers, offset, words: data.slice(HEAD + MOVER * n) };
}
/** Lays a snapshot's slice of the field into `owner`; the cells that changed are added to `changed`. */
export function laySlice(owner: Uint8Array, snap: Snap, changed: Set<number>, movers: number) {
  snap.words.forEach((word, i) => {
    let w = word;
    const base = (snap.offset + i) * PER;
    for (let j = 0; j < PER; j++) {
      const c = base + j,
        v = w % 8;
      w = Math.floor(w / 8);
      if (c >= CELLS) break;
      const who = v <= movers ? v : 0;
      if (owner[c] !== who) {
        owner[c] = who;
        changed.add(c);
      }
    }
  });
}
/** A guest's hand as sent: whether it steers, and the heading it wants. */
export const inputOf = (want: number | null) => (want === null ? [0, 0] : [1, Math.round(want * 1000) / 1000]);
/** A guest's hand read back on the host (nothing heard yet: straight on). */
export function readInput(data: number[] | null): number | null {
  if (!data || data.length < 2 || data[0] < 0.5 || !Number.isFinite(data[1])) return null;
  return data[1];
}
/**
 * The host's wanted heading for every mover: the mover of the seat this device plays by my hand (`mine`), a guest's
 * by what it last sent, the computer's (or a guest's away from the room) by `autopilot`. `seats` is each mover's seat.
 */
export function hostWants(world: World, seats: number[], control: (seat: number) => Control, latest: (seat: number) => number[] | null, mine: number | null, level: Level) {
  return world.movers.map((_, k) => {
    const who = control(seats[k] ?? k);
    return who === "me" ? mine : who === "remote" ? readInput(latest(seats[k] ?? k)) : who === "computer" ? autopilot(world, k, level) : null;
  });
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const turn = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
/**
 * A guest's world as the host's was `t` of the way from state `a` to state `b`: each mover between its two places
 * (or where it is now, across a jump: put out and come back), its counts as the later state has them; the field as
 * the slices have laid it (`laySlice`). The trails are not sent: a guest's view draws them from where the movers go.
 */
export function follow(world: World, a: Snap, b: Snap, t: number) {
  if (a.movers.length !== world.movers.length || b.movers.length !== world.movers.length) return;
  world.tick = Math.round(mix(a.tick, b.tick, t));
  world.closed = b.closed;
  world.movers.forEach((m, k) => {
    const A = a.movers[k],
      B = b.movers[k],
      jump = A.alive !== B.alive || Math.hypot(A.x - B.x, A.y - B.y) > 2;
    m.x = jump ? B.x : mix(A.x, B.x, t);
    m.y = jump ? B.y : mix(A.y, B.y, t);
    m.heading = jump ? B.heading : turn(A.heading, B.heading, t);
    m.alive = B.alive;
    m.wait = B.wait;
    m.land = B.land;
    m.outs = B.outs;
    m.kos = B.kos;
    m.cell = cellOf(m.x, m.y);
    // The trail's length alone is known: the view lays its line from the mover's way.
    m.trail.length = B.trail;
  });
}
