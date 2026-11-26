import { pack } from "../../net/live";
import { ERAS, EVENT_CODES, QUEUE, SHOT_KINDS, SLOTS, nextEra, timeLeft, type Command, type Happening, type Kind, type ShotKind, type World } from "./sim";

/**
 * 시대 전쟁 over one Wi-Fi (와이파이 여럿이): the lane as numbers (`src/net/live.ts`), and the orders a guest sends.
 * Free of Three.js and the page, so that the tests play the host and its guest with it.
 *
 * The host's view runs the one lane and tells it as a `Picture` (both armies' gold, experience, era, base, queue and
 * turrets, every soldier and every shot in the air, and the happenings of the last moments with their numbers, so that
 * each device makes its own sounds). The host's own screen draws the same picture, read from the world, so that
 * every device draws alike.
 *
 * A guest's orders (train, a turret, sell, the special attack, the next era) are numbered: it sends its last few
 * with the number of the newest (and a number of its own page, so that a page come back after a drop starts afresh),
 * over and over; the host carries out each one it has not carried out yet, for that guest's side alone.
 */
export interface SidePic {
  gold: number;
  xp: number;
  era: number;
  hp: number;
  max: number;
  /** Seconds before the special attack is ready, how far the soldier being trained is along (0–1), the xp of the next era (null: the last). */
  ability: number;
  training: number;
  next: number | null;
  /** What is queued (era × 3 + kind), the turrets' eras (−1: an empty slot) and seconds since each last fired. */
  queue: number[];
  turrets: number[];
  fired: number[];
}
export interface UnitPic {
  id: number;
  side: 0 | 1;
  era: number;
  kind: Kind;
  x: number;
  /** What is left of it (0–1), seconds since its last blow, whether it walks. */
  life: number;
  since: number;
  walking: boolean;
}
export interface ShotPic {
  id: number;
  kind: ShotKind;
  x: number;
  y: number;
}
export interface Picture {
  tick: number;
  /** Seconds before the time limit. */
  left: number;
  over: boolean;
  sides: [SidePic, SidePic];
  units: UnitPic[];
  shots: ShotPic[];
  events: Happening[];
}
const SIDE = 8 + QUEUE + SLOTS * 2;
/** How many of the last happenings go with each picture. */
const HEARD = 24;
function sidePic(world: World, side: 0 | 1): SidePic {
  const a = world.armies[side],
    head = a.queue[0];
  return {
    gold: Math.floor(a.gold),
    xp: a.xp,
    era: a.era,
    hp: Math.ceil(a.hp),
    max: a.max,
    ability: a.ability,
    training: head ? Math.min(1, a.training / ERAS[head.era].units[head.kind].train) : 0,
    next: nextEra(world, side),
    queue: a.queue.map((q) => q.era * 3 + q.kind),
    turrets: a.turrets.map((t) => (t ? t.era : -1)),
    fired: a.turrets.map((t) => (t ? t.since : 9)),
  };
}
/** The lane as a picture (what every screen draws), straight from the world. */
export function pictureOf(world: World): Picture {
  return {
    tick: world.tick,
    left: timeLeft(world),
    over: world.over,
    sides: [sidePic(world, 0), sidePic(world, 1)],
    units: world.units.map((u) => ({ id: u.id, side: u.side, era: u.era, kind: u.kind, x: u.x, life: Math.max(0, u.hp / u.max), since: u.since, walking: u.walking })),
    shots: world.shots.filter((s) => s.wait <= 0).map((s) => ({ id: s.id, kind: s.kind, x: s.x, y: s.y })),
    events: world.events.slice(-HEARD),
  };
}
/** The picture as the numbers the host sends. */
export function packPicture(p: Picture): number[] {
  const out: number[] = [p.tick, p.left, p.over ? 1 : 0];
  for (const s of p.sides) {
    out.push(s.gold, s.xp, s.era, s.hp, s.max, s.ability, s.training, s.next ?? -1);
    for (let k = 0; k < QUEUE; k++) out.push(s.queue[k] ?? -1);
    for (let k = 0; k < SLOTS; k++) out.push(s.turrets[k] ?? -1);
    for (let k = 0; k < SLOTS; k++) out.push(s.fired[k] ?? 9);
  }
  out.push(p.units.length);
  for (const u of p.units) out.push(u.id, u.side, u.era * 3 + u.kind, u.x, u.life, u.since, u.walking ? 1 : 0);
  out.push(p.shots.length);
  for (const s of p.shots) out.push(s.id, SHOT_KINDS.indexOf(s.kind), s.x, s.y);
  out.push(p.events.length);
  for (const e of p.events) out.push(e.seq, EVENT_CODES.indexOf(e.code), e.x, e.side, e.extra);
  return pack(out);
}
/** A picture read back from the host's numbers (null when they are not one). */
export function readPicture(d: number[]): Picture | null {
  let k = 3;
  const need = (n: number) => k + n <= d.length;
  if (!need(SIDE * 2)) return null;
  const sides = ([0, 1] as const).map(() => {
    const [gold, xp, era, hp, max, ability, training, next] = d.slice(k, k + 8);
    k += 8;
    const queue = d.slice(k, k + QUEUE).filter((q) => q >= 0);
    k += QUEUE;
    const turrets = d.slice(k, k + SLOTS);
    k += SLOTS;
    const fired = d.slice(k, k + SLOTS);
    k += SLOTS;
    return { gold, xp, era, hp, max, ability, training, next: next < 0 ? null : next, queue, turrets, fired };
  }) as [SidePic, SidePic];
  if (!need(1)) return null;
  const nu = d[k++];
  if (!need(nu * 7 + 1)) return null;
  const units: UnitPic[] = [];
  for (let i = 0; i < nu; i++, k += 7) {
    const [id, side, code, x, life, since, walking] = d.slice(k, k + 7);
    units.push({ id, side: side ? 1 : 0, era: Math.floor(code / 3), kind: (code % 3) as Kind, x, life, since, walking: walking === 1 });
  }
  const ns = d[k++];
  if (!need(ns * 4 + 1)) return null;
  const shots: ShotPic[] = [];
  for (let i = 0; i < ns; i++, k += 4) shots.push({ id: d[k], kind: SHOT_KINDS[d[k + 1]] ?? "rock", x: d[k + 2], y: d[k + 3] });
  const ne = d[k++];
  if (!need(ne * 5)) return null;
  const events: Happening[] = [];
  for (let i = 0; i < ne; i++, k += 5) events.push({ seq: d[k], code: EVENT_CODES[d[k + 1]] ?? "spawn", x: d[k + 2], side: d[k + 3] ? 1 : 0, extra: d[k + 4] });
  return { tick: d[0], left: d[1], over: d[2] === 1, sides, units, shots, events };
}
/** Two pictures blended `t` of the way (soldiers and shots by their numbers; what is in only one is as the later has it). */
export function blendPictures(a: Picture, b: Picture, t: number): Picture {
  if (t >= 1 || a === b) return b;
  const units = new Map(a.units.map((u) => [u.id, u])),
    shots = new Map(a.shots.map((s) => [s.id, s]));
  return {
    ...b,
    units: b.units.map((u) => {
      const was = units.get(u.id);
      return was ? { ...u, x: was.x + (u.x - was.x) * t } : u;
    }),
    shots: b.shots.map((s) => {
      const was = shots.get(s.id);
      return was ? { ...s, x: was.x + (s.x - was.x) * t, y: was.y + (s.y - was.y) * t } : s;
    }),
  };
}

// ── Orders ──
/** An order as one number: 10 + kind to train, 20 + slot for a turret, 30 + slot to sell, 40 the special attack, 50 the next era. */
export function orderCode(c: Command): number {
  switch (c.kind) {
    case "train":
      return 10 + c.unit;
    case "turret":
      return 20 + c.slot;
    case "sell":
      return 30 + c.slot;
    case "ability":
      return 40;
    case "era":
      return 50;
  }
}
export function orderOf(n: number): Command | null {
  if (n >= 10 && n <= 12) return { kind: "train", unit: (n - 10) as Kind };
  if (n >= 20 && n < 20 + SLOTS) return { kind: "turret", slot: n - 20 };
  if (n >= 30 && n < 30 + SLOTS) return { kind: "sell", slot: n - 30 };
  if (n === 40) return { kind: "ability" };
  if (n === 50) return { kind: "era" };
  return null;
}
/** How many of its last orders a guest sends each time. */
const SENT = 8;
/** A guest's orders, numbered, as it sends them: the page's own number, the newest order's number, the last few orders. */
export class Orders {
  private list: number[] = [];
  constructor(readonly page = Math.floor(Math.random() * 1e6) + 1) {}
  give(c: Command) {
    this.list.push(orderCode(c));
  }
  get count() {
    return this.list.length;
  }
  data(): number[] {
    return [this.page, this.list.length, ...this.list.slice(-SENT)];
  }
}
/** The host's record of a guest's orders: what it has carried out, by that guest's page. */
export class Inbox {
  private page = 0;
  private done = 0;
  /** The orders in `data` not yet carried out (all of a page not heard from before). */
  take(data: number[] | null): Command[] {
    if (!data || data.length < 2) return [];
    const [page, newest] = data,
      sent = data.slice(2);
    if (page !== this.page) {
      this.page = page;
      this.done = newest - sent.length;
    }
    const fresh = newest - this.done;
    if (fresh <= 0) return [];
    this.done = newest;
    return sent
      .slice(-Math.min(fresh, sent.length))
      .map(orderOf)
      .filter((c): c is Command => !!c);
  }
}
