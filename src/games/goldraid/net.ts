import { pack, type Control } from "../../net/live";
import { LIVE_MOST } from "../../net/protocol";
import { DT, IDLE, think, type Bandit, type Cart, type Happening, type Input, type Level, type Loot, type LootKind, type World } from "./sim";

/**
 * 금화 쟁탈전 over one Wi-Fi (와이파이 여럿이, the user asked), free of Three.js and the page: what the host's valley and a
 * guest's hands are as numbers (`src/net/live.ts`), each bandit's controls on the host (its own hand, a guest's, the
 * computer for a guest who is away), and a guest's valley laid between two of the host's states.
 *
 * The host's state: the valley's clock, its target and limit, whether it is over, both treasuries and gates' locks, both
 * bandits (place, speed, facing, footing, sack, daze, swing, stride), the cart, what has happened lately (`KEPT_FOR`
 * seconds of it, each with its number, so that every device makes its own sounds and sparks of it once), and every
 * piece of loot (its id, kind, worth, place, whether it lies, how long it has lain, and whether it is a fire pot).
 * A guest's hands: the way it runs (−1 to 1) and how many times it has pressed jump and strike (counts, so that a
 * press shorter than a sending is never lost).
 */
export const KINDS_LIST: LootKind[] = ["coin", "pouch", "gem", "chest", "bomb"];
const EVENTS = ["jump", "swing", "pickup", "deposit", "hit", "boom", "drop", "cart", "shed", "broken", "raid", "win", "time"] as const;
/** How long a happening is still told (it reaches a guest even when a sending or two is lost), and at most how many. */
export const KEPT_FOR = 0.6,
  KEPT_MOST = 10;
const HEAD = 9,
  MAN = 11,
  CART_N = 6,
  EVENT_N = 7,
  PIECE = 8;
/** A happening told, with its number (they count up through a match). */
export interface Told {
  serial: number;
  /** The valley's slice it happened in. */
  tick: number;
  happening: Happening;
}
/** The host's log of what happened: numbered, and kept for `KEPT_FOR` seconds. */
export class Log {
  serial = 0;
  told: Told[] = [];
  add(events: Happening[], tick: number) {
    for (const happening of events) this.told.push({ serial: ++this.serial, tick, happening });
    const since = tick - KEPT_FOR / DT;
    while (this.told.length && (this.told[0].tick < since || this.told.length > KEPT_MOST)) this.told.shift();
  }
}
const args = (e: Happening): number[] => {
  switch (e.kind) {
    case "jump":
    case "swing":
      return [e.side];
    case "pickup":
      return [e.side, e.value, KINDS_LIST.indexOf(e.what), ...pack([e.x, e.y], 2)];
    case "deposit":
      return [e.side, e.amount];
    case "hit":
      return [e.by, e.on, e.dropped, e.combo];
    case "boom":
      return [...pack([e.x, e.y], 2), e.stunned.reduce((m, s) => m | (1 << s), 0)];
    case "drop":
      return [KINDS_LIST.indexOf(e.what), ...pack([e.x], 2)];
    case "cart":
      return [e.dir];
    case "shed":
      return [e.by, e.amount, ...pack([e.x], 2)];
    case "broken":
      return [e.by, ...pack([e.x], 2)];
    case "raid":
      return [e.by, e.amount];
    case "win":
      return [e.side];
    case "time":
      return [];
  }
};
export function packEvent(t: Told): number[] {
  const a = args(t.happening);
  return [t.serial, EVENTS.indexOf(t.happening.kind), ...a, ...Array<number>(EVENT_N - 2 - a.length).fill(0)];
}
const side01 = (v: number) => (v === 1 ? 1 : 0);
const kindOf = (v: number): LootKind => KINDS_LIST[v] ?? "pouch";
export function readEvent(d: number[]): { serial: number; happening: Happening } | null {
  const [serial, k, a, b, c, x, y] = d,
    kind = EVENTS[k];
  if (!kind) return null;
  const h: Happening =
    kind === "jump" || kind === "swing"
      ? { kind, side: side01(a) }
      : kind === "pickup"
        ? { kind, side: side01(a), value: b, what: kindOf(c), x, y }
        : kind === "deposit"
          ? { kind, side: side01(a), amount: b }
          : kind === "hit"
            ? { kind, by: side01(a), on: side01(b), dropped: c, combo: x }
            : kind === "boom"
              ? { kind, x: a, y: b, stunned: [0, 1].filter((s) => c & (1 << s)) }
              : kind === "drop"
                ? { kind, what: kindOf(a), x: b }
                : kind === "cart"
                  ? { kind, dir: a < 0 ? -1 : 1 }
                  : kind === "shed"
                    ? { kind, by: side01(a), amount: b, x: c }
                    : kind === "broken"
                      ? { kind, by: side01(a), x: b }
                      : kind === "raid"
                        ? { kind, by: side01(a), amount: b }
                        : kind === "win"
                          ? { kind, side: side01(a) }
                          : { kind: "time" };
  return { serial, happening: h };
}
const man = (b: Bandit) => [...pack([b.x, b.y, b.vx, b.vy]), b.face, b.ground ? 1 : 0, b.carry, ...pack([b.stun, b.swing, b.stride]), b.flung];
/** The host's valley as numbers, with what happened lately (`log`). */
export function snapOf(world: World, log: Log): number[] {
  const cart = world.cart,
    out = [world.tick, world.target, world.limit, world.over ? 1 : 0, world.treasury[0], world.treasury[1], ...pack(world.locked, 2), log.told.length];
  out.push(...man(world.bandits[0]), ...man(world.bandits[1]));
  out.push(...(cart ? [1, ...pack([cart.x]), cart.dir, cart.gold, ...pack([cart.shaken, cart.broken])] : [0, 0, 1, 0, 0, -1]));
  for (const t of log.told) out.push(...packEvent(t));
  // A live message holds at most `LIVE_MOST` numbers: loot past what fits (never seen in play) waits for a later one.
  const loot = world.loot.slice(0, Math.max(0, Math.floor((LIVE_MOST - out.length - 1) / PIECE)));
  out.push(loot.length);
  for (const i of loot) out.push(i.id, KINDS_LIST.indexOf(i.kind), i.value, ...pack([i.x, i.y]), i.rest ? 1 : 0, ...pack([i.age], 2), i.pot ? 1 : 0);
  return out;
}
export interface Snap {
  tick: number;
  target: number;
  limit: number;
  over: boolean;
  treasury: [number, number];
  locked: [number, number];
  bandits: [Bandit, Bandit];
  cart: Cart | null;
  events: { serial: number; happening: Happening }[];
  loot: Loot[];
}
const readMan = (d: number[]): Bandit => ({
  x: d[0],
  y: d[1],
  vx: d[2],
  vy: d[3],
  face: d[4] < 0 ? -1 : 1,
  ground: d[5] === 1,
  carry: d[6],
  stun: d[7],
  swing: d[8],
  stride: d[9],
  flung: d[10],
  rise: 0,
  struck: false,
  cool: 0,
  coyote: 0,
  buffer: 0,
});
export function readSnap(data: number[]): Snap | null {
  if (data.length < HEAD + 2 * MAN + CART_N + 1) return null;
  const [tick, target, limit, over, t0, t1, l0, l1, n] = data;
  let k = HEAD;
  const bandits: [Bandit, Bandit] = [readMan(data.slice(k, k + MAN)), readMan(data.slice(k + MAN, k + 2 * MAN))];
  k += 2 * MAN;
  const [has, cx, dir, gold, shaken, broken] = data.slice(k, k + CART_N);
  k += CART_N;
  const events: Snap["events"] = [];
  for (let e = 0; e < n; e++, k += EVENT_N) {
    const read = readEvent(data.slice(k, k + EVENT_N));
    if (read) events.push(read);
  }
  const count = data[k++];
  if (!Number.isInteger(count) || count < 0 || data.length !== k + count * PIECE) return null;
  const loot: Loot[] = [];
  for (let p = 0; p < count; p++, k += PIECE) {
    const [id, kind, value, x, y, rest, age, pot] = data.slice(k, k + PIECE);
    loot.push({ id, kind: kindOf(kind), value, x, y, vx: 0, vy: 0, rest: rest === 1, age, free: 0, ...(pot === 1 ? { pot: true } : {}) });
  }
  return {
    tick,
    target,
    limit,
    over: over === 1,
    treasury: [t0, t1],
    locked: [l0, l1],
    bandits,
    cart: has === 1 ? { x: cx, dir: dir < 0 ? -1 : 1, gold, blows: 0, need: 0, shaken, broken } : null,
    events,
    loot,
  };
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/**
 * A guest's valley `t` of the way between two of the host's states: the bandits, the cart and every piece of loot found
 * in both are glided; what is counted, what lies and what is new is taken from the later. The world's own bits that a
 * guest never runs (the minds, the seed, the next drop) are left as they are.
 */
export function follow(world: World, a: Snap, b: Snap, t: number) {
  world.tick = b.tick;
  world.target = b.target;
  world.limit = b.limit;
  world.over = b.over;
  world.treasury = [b.treasury[0], b.treasury[1]];
  world.locked = [b.locked[0], b.locked[1]];
  world.bandits = [0, 1].map((s) => {
    const p = a.bandits[s],
      q = b.bandits[s],
      // A bandit that jumped across the valley's ends (never) or was set anew is not swept there.
      far = Math.abs(p.x - q.x) > 2;
    return { ...q, x: far ? q.x : lerp(p.x, q.x, t), y: far ? q.y : lerp(p.y, q.y, t), stride: far ? q.stride : lerp(p.stride, q.stride, t) };
  }) as [Bandit, Bandit];
  world.cart = b.cart && a.cart && Math.abs(a.cart.x - b.cart.x) < 1 ? { ...b.cart, x: lerp(a.cart.x, b.cart.x, t) } : b.cart;
  const before = new Map(a.loot.map((i) => [i.id, i]));
  world.loot = b.loot.map((q) => {
    const p = before.get(q.id);
    return p ? { ...q, x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) } : q;
  });
}
/** A guest's hands: the way it runs, and how many times it has pressed jump and strike. */
export const inputOf = (way: number, jumps: number, strikes: number) => [...pack([way], 2), jumps, strikes];
export function readInput(data: number[] | null): { x: number; jumps: number; strikes: number } | null {
  if (!data || data.length < 3 || !data.every(Number.isFinite)) return null;
  return { x: Math.max(-1, Math.min(1, data[0])), jumps: Math.max(0, Math.floor(data[1])), strikes: Math.max(0, Math.floor(data[2])) };
}
/** What a guest's presses have been taken of on the host. */
export interface Taken {
  jumps: number;
  strikes: number;
}
/**
 * A guest's hands for one slice on the host: its way, and a jump or a strike for each count gone up since those
 * `taken` (one a slice). Counts that went back (its table built again: it rejoined) start the tally again.
 */
export function takeInput(input: ReturnType<typeof readInput>, taken: Taken): Input {
  if (!input) return IDLE;
  if (input.jumps < taken.jumps || input.strikes < taken.strikes) {
    taken.jumps = input.jumps;
    taken.strikes = input.strikes;
  }
  const jump = input.jumps > taken.jumps,
    strike = input.strikes > taken.strikes;
  if (jump) taken.jumps++;
  if (strike) taken.strikes++;
  return { x: input.x, jump, strike };
}
/**
 * Both bandits' hands for one slice on the host: mine from this screen, a guest's as the room feeds them, the
 * computer's for a seat whose person is away (or a seat the host gave the computer).
 */
export function hostInputs(world: World, control: (seat: number) => Control, latest: (seat: number) => number[] | null, mine: () => Input, taken: [Taken, Taken], level: Level): [Input, Input] {
  return [0, 1].map((side) => {
    const who = control(side);
    return who === "me" ? mine() : who === "remote" ? takeInput(readInput(latest(side)), taken[side]) : who === "computer" ? think(world, side, level) : IDLE;
  }) as [Input, Input];
}
