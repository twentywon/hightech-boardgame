import { describe, expect, test } from "vitest";
import { LIVE_MOST, INPUT_MOST, decode, encode, type SeatInfo } from "../src/net/protocol";
import { GuestRoom, HostRoom, memoryLinks } from "../src/net/room";
import { LiveGuest, LiveHost } from "../src/net/live";
import { HOST_ONLY } from "../src/net/match";
import { pointRules } from "../src/net/points";
import { goldRaid, type State } from "../src/games/goldraid/rules";
import { goldRaidConfig } from "../src/games/goldraid/config";
import { DT, IDLE, createWorld, step, think, type Happening, type World } from "../src/games/goldraid/sim";
import { KEPT_FOR, KEPT_MOST, Log, follow, hostInputs, inputOf, packEvent, readEvent, readInput, readSnap, snapOf, takeInput, type Taken } from "../src/games/goldraid/net";

/*
 * 금화 쟁탈전 over Wi-Fi (와이파이 여럿이): the host's valley told as numbers with what happened lately, a guest's hands
 * as the way it runs and counts of its presses, and a room of two devices on memory links.
 */
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};

describe("gold raid's valley as numbers", () => {
  test("every happening goes through its numbers and back", () => {
    const all: Happening[] = [
      { kind: "jump", side: 1 },
      { kind: "swing", side: 0 },
      { kind: "pickup", side: 1, value: 10, what: "pouch", x: -3.25, y: 1.6 },
      { kind: "deposit", side: 0, amount: 17 },
      { kind: "hit", by: 1, on: 0, dropped: 4 },
      { kind: "boom", x: 2.5, y: 0.12, stunned: [0, 1] },
      { kind: "boom", x: -1, y: 3.32, stunned: [] },
      { kind: "drop", what: "bomb", x: 6.4 },
      { kind: "cart", dir: -1 },
      { kind: "shed", by: 0, amount: 3, x: 1.5 },
      { kind: "broken", by: 1, x: -0.75 },
      { kind: "raid", by: 1, amount: 2 },
      { kind: "win", side: 1 },
      { kind: "time" },
    ];
    all.forEach((happening, k) => {
      const d = packEvent({ serial: k + 5, tick: 0, happening });
      expect(d).toHaveLength(7);
      expect(readEvent(d)).toEqual({ serial: k + 5, happening });
    });
    expect(readEvent([1, 99, 0, 0, 0, 0, 0])).toBeNull();
  });

  test("the log keeps what happened lately, at most a few, numbered on", () => {
    const log = new Log();
    log.add([{ kind: "jump", side: 0 }], 10);
    log.add([{ kind: "swing", side: 1 }], 20);
    expect(log.told.map((t) => t.serial)).toEqual([1, 2]);
    log.add([], 20 + Math.ceil(KEPT_FOR / DT));
    expect(log.told.map((t) => t.serial)).toEqual([2]);
    log.add(Array.from({ length: 20 }, () => ({ kind: "jump", side: 1 }) as Happening), 500);
    expect(log.told).toHaveLength(KEPT_MOST);
    expect(log.told[KEPT_MOST - 1].serial).toBe(22);
  });

  test("a whole match of two computers is told in messages the room takes, and read back to the millimetre", () => {
    const world = createWorld(7, 100, 0),
      log = new Log();
    let most = 0,
      pieces = 0;
    for (let k = 0; k < 240 / DT && !world.over; k++) {
      log.add(step(world, [think(world, 0, "hard"), think(world, 1, "normal")]), world.tick);
      if (k % 4) continue;
      const data = snapOf(world, log);
      most = Math.max(most, data.length);
      pieces = Math.max(pieces, world.loot.length);
      expect(data.length).toBeLessThanOrEqual(LIVE_MOST);
      // Through the protocol's own checks.
      expect(decode(encode({ t: "live", round: 1, seq: k + 1, at: k, cut: 0, paused: false, data }))).not.toBeNull();
      const snap = readSnap(data)!;
      expect(snap).not.toBeNull();
      expect(snap.tick).toBe(world.tick);
      expect(snap.treasury).toEqual(world.treasury);
      expect(snap.loot.map((i) => i.id)).toEqual(world.loot.map((i) => i.id));
      for (const s of [0, 1]) {
        expect(snap.bandits[s].x).toBeCloseTo(world.bandits[s].x, 2);
        expect(snap.bandits[s].carry).toBe(world.bandits[s].carry);
        expect(snap.bandits[s].face).toBe(world.bandits[s].face);
      }
      expect(snap.events.map((e) => e.serial)).toEqual(log.told.map((t) => t.serial));
    }
    // The match went somewhere: loot fell and gold was brought home.
    expect(pieces).toBeGreaterThan(0);
    expect(world.treasury[0] + world.treasury[1]).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(LIVE_MOST);
    expect(readSnap([1, 2, 3])).toBeNull();
  });

  test("a guest's hands: its way and its presses, each press taken once, a count gone back starting again", () => {
    const data = inputOf(-0.4567, 3, 1);
    expect(data.length).toBeLessThanOrEqual(INPUT_MOST);
    expect(readInput(data)).toEqual({ x: -0.46, jumps: 3, strikes: 1 });
    expect(readInput([5, 0, 0])!.x).toBe(1);
    expect(readInput([0, 1])).toBeNull();
    expect(readInput(null)).toBeNull();
    const taken: Taken = { jumps: 0, strikes: 0 };
    // Two jumps pressed between two sendings: one a slice.
    expect(takeInput(readInput([1, 2, 0]), taken)).toEqual({ x: 1, jump: true, strike: false });
    expect(takeInput(readInput([1, 2, 1]), taken)).toEqual({ x: 1, jump: true, strike: true });
    expect(takeInput(readInput([1, 2, 1]), taken)).toEqual({ x: 1, jump: false, strike: false });
    // The guest's table built again (it rejoined): its counts start at nothing and are taken from there.
    expect(takeInput(readInput([0, 0, 0]), taken)).toEqual({ x: 0, jump: false, strike: false });
    expect(takeInput(readInput([0, 1, 0]), taken).jump).toBe(true);
    expect(takeInput(null, taken)).toEqual(IDLE);
  });

  test("a guest's valley is laid between two of the host's states", () => {
    const world = createWorld(3, 100, 0),
      log = new Log();
    for (let k = 0; k < 400; k++) log.add(step(world, [{ x: 1, jump: false, strike: false }, IDLE]), world.tick);
    const a = readSnap(snapOf(world, log))!;
    for (let k = 0; k < 4; k++) step(world, [{ x: 1, jump: false, strike: false }, IDLE]);
    const b = readSnap(snapOf(world, log))!,
      guest = createWorld(99, 100, 0);
    follow(guest, a, b, 0.5);
    expect(guest.bandits[0].x).toBeCloseTo((a.bandits[0].x + b.bandits[0].x) / 2, 3);
    expect(guest.tick).toBe(b.tick);
    expect(guest.loot.map((i) => i.id)).toEqual(b.loot.map((i) => i.id));
  });
});

/** A room of gold raid on memory links: the host at red, one guest. */
async function room() {
  const rules = pointRules(goldRaid, goldRaidConfig.net!),
    seats: SeatInfo[] = goldRaidConfig.net!.seats!("100").map((s) => ({ ...s, kind: "open", person: null }));
  const host = new HostRoom<State>({ game: "gold-raid", title: "금화 쟁탈전", name: "방장", variant: "100", options: {}, seats, quiet: true }, rules);
  host.sit(0);
  const guest = new GuestRoom<State>({ game: "gold-raid", title: "금화 쟁탈전", name: "민수", quiet: true }, rules),
    link = memoryLinks();
  host.connect(link[0]);
  guest.connect(link[1]);
  await settle();
  return { host, guest, link };
}

describe("gold raid on two devices", () => {
  test("the guest's hands run, jump and strike its blue bandit on the host; the guest's valley follows, each happening heard once; away, the computer runs it", async () => {
    const { host, guest, link } = await room();
    expect(host.seats.map((s) => s.person)).toEqual([host.me, guest.me]);
    host.begin();
    await settle();
    expect(host.rules.toMove(host.match!.state)).toBe(HOST_ONLY);
    let now = 0;
    const round = host.start!.round,
      table = new LiveHost(host, round, () => now),
      view = new LiveGuest(guest, round, () => now),
      world: World = createWorld(5, 100, 0),
      mirror: World = createWorld(1, 100, 0),
      log = new Log(),
      taken: [Taken, Taken] = [
        { jumps: 0, strikes: 0 },
        { jumps: 0, strikes: 0 },
      ],
      heard = new Map<number, number>(),
      kinds: Happening[] = [],
      hand = { way: -1, jumps: 0, strikes: 0 };
    let last = -1;
    /** One frame (1/60 s): the guest sends its hands, the host steps its valley and tells it, the guest draws it. */
    const frame = async () => {
      view.tick(() => (guest.online ? inputOf(hand.way, hand.jumps, hand.strikes) : null));
      await settle();
      for (let k = 0; k < 2; k++) log.add(step(world, hostInputs(world, (seat) => table.control(seat), (seat) => table.latest(seat), () => IDLE, taken, "normal")), world.tick);
      table.tick(() => snapOf(world, log));
      await settle();
      now += DT * 2 * 1000;
      const f = view.frame(now),
        a = f && readSnap(f.a.data),
        b = f && readSnap(f.b.data);
      if (f && a && b) {
        follow(mirror, a, b, f.t);
        for (const e of b.events)
          if (e.serial > last) {
            heard.set(e.serial, (heard.get(e.serial) ?? 0) + 1);
            kinds.push(e.happening);
          }
        if (b.events.length) last = Math.max(last, b.events[b.events.length - 1].serial);
      }
    };
    expect(table.control(0)).toBe("me");
    expect(table.control(1)).toBe("remote");
    const start = world.bandits[1].x;
    for (let k = 0; k < 90; k++) await frame();
    // Blue ran left (toward the middle) as the guest leaned it.
    expect(world.bandits[1].x).toBeLessThan(start - 1.5);
    // A jump and a strike pressed on the guest happen on the host.
    hand.way = 0;
    hand.jumps++;
    for (let k = 0; k < 6; k++) await frame();
    expect(world.bandits[1].y).toBeGreaterThan(0.3);
    hand.strikes++;
    for (let k = 0; k < 60; k++) await frame();
    // The guest's valley is the host's of a moment ago.
    expect(Math.abs(mirror.bandits[1].x - world.bandits[1].x)).toBeLessThan(0.5);
    expect(mirror.treasury).toEqual(world.treasury);
    // Every happening reached the guest, and once only.
    expect(heard.size).toBeGreaterThan(0);
    for (const times of heard.values()) expect(times).toBe(1);
    const told = new Set<number>();
    for (let s = 1; s <= log.serial; s++) told.add(s);
    expect([...heard.keys()].every((s) => told.has(s))).toBe(true);
    // The guest's jump and swing were heard back as happenings of blue's.
    expect(kinds).toContainEqual({ kind: "jump", side: 1 });
    expect(kinds).toContainEqual({ kind: "swing", side: 1 });

    // The guest's device drops: blue is the host's computer's, which runs it by itself.
    link[1].close();
    await settle();
    expect(host.away(1)).toBe(true);
    expect(table.control(1)).toBe("computer");
    const still = world.bandits[1].x;
    for (let k = 0; k < 300 && Math.abs(world.bandits[1].x - still) < 0.5; k++) await frame();
    expect(Math.abs(world.bandits[1].x - still)).toBeGreaterThanOrEqual(0.5);
    // It comes back on a new link: its hands drive blue again.
    const again = memoryLinks();
    host.connect(again[0]);
    guest.connect(again[1]);
    await settle();
    expect(table.control(1)).toBe("remote");
    hand.way = 1;
    const back = world.bandits[1].x;
    for (let k = 0; k < 90; k++) await frame();
    expect(world.bandits[1].x).toBeGreaterThan(back + 0.5);
  });
});
