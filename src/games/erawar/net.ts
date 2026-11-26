import { pack } from "../../net/live";
import { LIVE_MOST } from "../../net/protocol";
import { ERAS, EVENT_CODES, LAST_ERA, QUEUE, SHOT_KINDS, SLOTS, XP_NEXT, nextEra, type Command, type Happening, type Kind, type ShotKind, type World } from "./sim";

/**
 * 시대 전쟁 over one Wi-Fi (와이파이 여럿이): the lane as numbers (`src/net/live.ts`), and the orders a guest sends.
 * Free of Three.js and the page, so that the tests play the host and its guest with it.
 *
 * The host's view runs the one lane and tells it as a `Picture` (both armies' gold, experience, era, rank, base, queue
 * and turrets, every soldier and every shot in the air, and the happenings of the last moments with their numbers, so
 * that each device makes its own sounds). The host's own screen draws the same picture, read from the world, so that
 * every device draws alike.
 *
 * Packed tight: a live message holds at most `LIVE_MOST` numbers, and a full lane (fourteen soldiers a side) with a
 * special attack in the air must fit. A soldier is four numbers (its number; its era, kind, rank, side, stride and the
 * time since its last blow in one; where it is; its life), a shot three, a happening three, a side ten; the shots past
 * what fits wait for a later picture.
 *
 * A guest's orders (train, a turret, sell, the special attack, the next era or a rank) are numbered: it sends its
 * last few with the number of the newest (and a number of its own page, so that a page come back after a drop starts
 * afresh), over and over; the host carries out each one it has not carried out yet, for that guest's side alone.
 */
export interface SidePic {
  gold: number;
  xp: number;
  era: number;
  /** The ranks bought in the last era (강화). */
  rank: number;
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
  rank: number;
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
  over: boolean;
  sides: [SidePic, SidePic];
  units: UnitPic[];
  shots: ShotPic[];
  events: Happening[];
}
/** How many numbers a side takes, a soldier, a shot, a happening. */
const SIDE = 10,
  UNIT = 4,
  SHOT = 3,
  EVENT = 3;
/** How many of the last happenings go with each picture. */
const HEARD = 12;
function sidePic(world: World, side: 0 | 1): SidePic {
  const a = world.armies[side],
    head = a.queue[0];
  return {
    gold: Math.floor(a.gold),
    xp: a.xp,
    era: a.era,
    rank: a.rank,
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
    over: world.over,
    sides: [sidePic(world, 0), sidePic(world, 1)],
    units: world.units.map((u) => ({ id: u.id, side: u.side, era: u.era, kind: u.kind, rank: u.rank, x: u.x, life: Math.max(0, u.hp / u.max), since: u.since, walking: u.walking })),
    // The special attack's pieces first (they fall for seconds; a soldier's shot is gone in a moment), so that when the
    // message has no room for every shot it is the quick ones that wait.
    shots: world.shots
      .filter((s) => s.wait <= 0)
      .sort((p, q) => Number(q.target === -2) - Number(p.target === -2))
      .map((s) => ({ id: s.id, kind: s.kind, x: s.x, y: s.y })),
    events: world.events.slice(-HEARD),
  };
}
/** Seconds (up to 9.9) in tenths, as a whole number. */
const tenths = (s: number) => Math.round(Math.max(0, Math.min(9.9, s)) * 10);
/** The picture as the numbers the host sends (at most `LIVE_MOST`). */
export function packPicture(p: Picture): number[] {
  const out: number[] = [p.tick, p.over ? 1 : 0];
  for (const s of p.sides) {
    // The queue as one number (each of up to five places 0–12, 12 empty), each turret its era and its last shot.
    let queue = 0;
    for (let k = QUEUE - 1; k >= 0; k--) queue = queue * 13 + (s.queue[k] ?? 12);
    out.push(s.gold, s.xp, s.era + s.rank * 4, s.hp, s.ability, s.training, queue);
    for (let k = 0; k < SLOTS; k++) out.push((s.turrets[k] ?? -1) + 1 + 5 * tenths(s.fired[k] ?? 9));
  }
  out.push(p.units.length);
  for (const u of p.units) out.push(u.id, (((u.rank * 12 + u.era * 3 + u.kind) * 2 + u.side) * 2 + (u.walking ? 1 : 0)) * 100 + tenths(u.since), u.x, u.life);
  const events = p.events.slice(-HEARD),
    room = Math.max(0, Math.floor((LIVE_MOST - out.length - 2 - events.length * EVENT) / SHOT)),
    shots = p.shots.slice(0, room);
  out.push(shots.length);
  for (const s of shots) out.push(s.id * 16 + SHOT_KINDS.indexOf(s.kind), s.x, s.y);
  out.push(events.length);
  for (const e of events) out.push(e.seq, ((e.extra + 1) * 16 + EVENT_CODES.indexOf(e.code)) * 2 + e.side, e.x);
  return pack(out);
}
/** A picture read back from the host's numbers (null when they are not one). */
export function readPicture(d: number[]): Picture | null {
  let k = 2;
  const need = (n: number) => k + n <= d.length;
  if (!need(SIDE * 2)) return null;
  const sides = ([0, 1] as const).map(() => {
    const [gold, xp, eraRank, hp, ability, training, packed] = d.slice(k, k + 7);
    k += 7;
    const era = eraRank % 4,
      rank = Math.floor(eraRank / 4),
      queue: number[] = [];
    let rest = packed;
    for (let q = 0; q < QUEUE; q++) {
      const code = rest % 13;
      rest = Math.floor(rest / 13);
      if (code < 12) queue.push(code);
    }
    const turrets: number[] = [],
      fired: number[] = [];
    for (let s = 0; s < SLOTS; s++, k++) {
      turrets.push((d[k] % 5) - 1);
      fired.push(Math.floor(d[k] / 5) / 10);
    }
    return { gold, xp, era, rank, hp, max: ERAS[era]?.base ?? 1, ability, training, next: era >= LAST_ERA ? null : XP_NEXT[era], queue, turrets, fired };
  }) as [SidePic, SidePic];
  if (!need(1)) return null;
  const nu = d[k++];
  if (!need(nu * UNIT + 1)) return null;
  const units: UnitPic[] = [];
  for (let i = 0; i < nu; i++, k += UNIT) {
    const [id, code, x, life] = d.slice(k, k + UNIT),
      since = (code % 100) / 10,
      rest = Math.floor(code / 100),
      walking = rest % 2 === 1,
      side = Math.floor(rest / 2) % 2,
      soldier = Math.floor(rest / 4);
    units.push({ id, side: side ? 1 : 0, era: Math.floor((soldier % 12) / 3), kind: (soldier % 3) as Kind, rank: Math.floor(soldier / 12), x, life, since, walking });
  }
  const ns = d[k++];
  if (!need(ns * SHOT + 1)) return null;
  const shots: ShotPic[] = [];
  for (let i = 0; i < ns; i++, k += SHOT) shots.push({ id: Math.floor(d[k] / 16), kind: SHOT_KINDS[d[k] % 16] ?? "rock", x: d[k + 1], y: d[k + 2] });
  const ne = d[k++];
  if (!need(ne * EVENT)) return null;
  const events: Happening[] = [];
  for (let i = 0; i < ne; i++, k += EVENT) {
    const code = d[k + 1];
    events.push({ seq: d[k], code: EVENT_CODES[Math.floor(code / 2) % 16] ?? "spawn", x: d[k + 2], side: code % 2 ? 1 : 0, extra: Math.floor(code / 32) - 1 });
  }
  return { tick: d[0], over: d[1] === 1, sides, units, shots, events };
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
/** An order as one number: 10 + kind to train, 20 + slot for a turret, 30 + slot to sell, 40 the special attack, 50 the next era (or a rank). */
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
