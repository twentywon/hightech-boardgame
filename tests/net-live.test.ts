import { describe, expect, test } from "vitest";
import { INPUT_MOST, LIVE_MOST, PROTOCOL, decode, encode, type Message, type SeatInfo } from "../src/net/protocol";
import { GuestRoom, HostRoom, memoryLinks } from "../src/net/room";
import { BEHIND, INPUT_HZ, LiveGuest, LiveHost, PAUSED_HZ, SNAP_HZ, blend, pack } from "../src/net/live";
import { HOST_ONLY } from "../src/net/match";
import { pointRules } from "../src/net/points";
import { airHockey, type State as HockeyState } from "../src/games/airhockey/rules";
import { airHockeyConfig } from "../src/games/airhockey/config";
import { DT, createWorld, freshMind, type World } from "../src/games/airhockey/sim";
import { hostSlice, inputOf, readInput, readSnap, snapOf, type Tally } from "../src/games/airhockey/net";
import * as soccer from "../src/games/foosball/net";
import { MAX_SLIDE as PITCH_MOST, createWorld as createPitch } from "../src/games/foosball/sim";
import * as tennis from "../src/games/pingpong/net";
import * as tt from "../src/games/pingpong/sim";

/** Lets every queued message be delivered (each hop is a microtask). */
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const roundTrip = (m: Message) => decode(encode(m));

describe("live messages", () => {
  test("a table's state, a hand's controls and a pause go through encode and decode", () => {
    const live: Message = { t: "live", round: 2, seq: 7, at: 12345, cut: 1, paused: false, data: [0.5, -1.25, 3] };
    expect(roundTrip(live)).toEqual(live);
    const input: Message = { t: "input", round: 2, seq: 3, data: [1.234, -0.5] };
    expect(roundTrip(input)).toEqual(input);
    const hold: Message = { t: "hold", round: 2, paused: true, from: "abc" };
    expect(roundTrip(hold)).toEqual(hold);
    // Small: a whole air hockey state is well under two hundred letters.
    const world = createWorld(0, 0.3);
    world.puck.vx = 12.3456789;
    const snap: Message = { t: "live", round: 1, seq: 999, at: 1234567, cut: 3, paused: false, data: snapOf(world, { hits: 12, walls: 30, timeouts: 1 }) };
    expect(encode(snap).length).toBeLessThan(200);
  });

  test("anything else is refused field by field", () => {
    const bad = (m: Record<string, unknown>) => decode(JSON.stringify({ v: PROTOCOL, ...m }));
    const live = { t: "live", round: 1, seq: 1, at: 10, cut: 0, paused: false, data: [1, 2] };
    expect(bad(live)).not.toBeNull();
    expect(bad({ ...live, data: [1, "2"] })).toBeNull();
    expect(bad({ ...live, data: [1, null] })).toBeNull();
    expect(bad({ ...live, data: Array(LIVE_MOST + 1).fill(0) })).toBeNull();
    expect(bad({ ...live, seq: -1 })).toBeNull();
    expect(bad({ ...live, cut: 0.5 })).toBeNull();
    expect(bad({ ...live, paused: 1 })).toBeNull();
    expect(bad({ ...live, at: "now" })).toBeNull();
    // Infinity and NaN do not survive JSON: they come back as null and are refused.
    expect(decode(encode({ t: "live", round: 1, seq: 1, at: 10, cut: 0, paused: false, data: [Infinity] }))).toBeNull();
    const input = { t: "input", round: 1, seq: 1, data: [0, 0] };
    expect(bad(input)).not.toBeNull();
    expect(bad({ ...input, data: Array(INPUT_MOST + 1).fill(0) })).toBeNull();
    expect(bad({ ...input, data: "0,0" })).toBeNull();
    expect(bad({ t: "hold", round: 1, paused: true })).toBeNull();
    expect(bad({ t: "hold", round: 1, paused: "yes", from: "a" })).toBeNull();
    // Another protocol version is not read.
    expect(decode(JSON.stringify({ ...live, v: PROTOCOL + 1 }))).toBeNull();
  });

  test("numbers are sent to the millimetre, and a guest's hand is kept to its own half", () => {
    expect(pack([1.23456, -0.0004, 2])).toEqual([1.235, -0, 2]);
    expect(pack([NaN])).toEqual([0]);
    expect(blend([0, 10], [10, 20], 0.25)).toEqual([2.5, 12.5]);
    expect(readInput(1, [0, 3])!.z).toBeLessThan(0);
    expect(readInput(0, [9, 1])!.x).toBeLessThan(2.2);
    expect(readInput(0, [1])).toBeNull();
    expect(readInput(0, null)).toBeNull();
    const world = createWorld(1, 0.2),
      snap = readSnap(snapOf(world, { hits: 4, walls: 5, timeouts: 6 }))!;
    expect(snap.puck.z).toBeCloseTo(world.puck.z, 3);
    expect(snap.mallets[1].z).toBeCloseTo(world.mallets[1].z, 3);
    expect([snap.hits, snap.walls, snap.timeouts]).toEqual([4, 5, 6]);
    expect(readSnap([1, 2, 3])).toBeNull();
  });
});

/** A room of air hockey on memory links: the host and `guests` guests joined, each with its own clock. */
async function hockeyRoom(guests: number, hostSeat: number | null) {
  const rules = pointRules(airHockey, airHockeyConfig.net!),
    seats: SeatInfo[] = airHockeyConfig.net!.seats!("").map((s) => ({ ...s, kind: "open", person: null }));
  const host = new HostRoom<HockeyState>({ game: "air-hockey", title: "에어하키", name: "방장", variant: "", options: {}, seats, quiet: true }, rules);
  host.sit(hostSeat);
  const joined: { room: GuestRoom<HockeyState>; link: ReturnType<typeof memoryLinks> }[] = [];
  for (let k = 0; k < guests; k++) {
    const room = new GuestRoom<HockeyState>({ game: "air-hockey", title: "에어하키", name: `손님${k + 1}`, quiet: true }, rules),
      link = memoryLinks();
    host.connect(link[0]);
    room.connect(link[1]);
    await settle();
    joined.push({ room, link });
  }
  return { host, guests: joined };
}

describe("a real-time table over Wi-Fi", () => {
  test("a guest draws between the host's states a moment behind, and its controls are glided on the host", async () => {
    const { host, guests } = await hockeyRoom(1, 0);
    host.begin();
    await settle();
    let hostNow = 1000,
      guestNow = 50;
    const table = new LiveHost(host, host.start!.round, () => hostNow),
      view = new LiveGuest(guests[0].room, host.start!.round, () => guestNow);
    expect(table.control(0)).toBe("me");
    expect(table.control(1)).toBe("remote");
    // States told 1000/SNAP_HZ apart, carrying a number that grows with the host's clock; each arrives 20 ms later.
    for (let k = 0; k < 10; k++) {
      table.tick(() => [hostNow]);
      // Asked again at once, nothing more is sent.
      table.tick(() => [-1]);
      await settle();
      hostNow += 1000 / SNAP_HZ;
      guestNow += 1000 / SNAP_HZ;
    }
    expect(view.newest!.data[0]).toBeCloseTo(1000 + (9 * 1000) / SNAP_HZ, 0);
    // Drawn BEHIND ms before the newest, between two states: the value is the host's clock then.
    const drawn = view.frame(guestNow - 1000 / SNAP_HZ)!,
      value = drawn.a.data[0] + (drawn.b.data[0] - drawn.a.data[0]) * drawn.t;
    expect(drawn.a).not.toBe(drawn.b);
    expect(value).toBeCloseTo(view.newest!.data[0] - BEHIND, 0);
    // Past the newest it holds the newest.
    expect(view.frame(guestNow + 5000)!.t).toBe(1);

    // The guest's hand, sent INPUT_HZ times a second, is reached on the host a sending later, smoothly.
    let x = 0;
    for (let k = 0; k < 5; k++) {
      view.tick(() => [x, 0]);
      view.tick(() => [99, 99]);
      await settle();
      const before = table.input(1)![0];
      hostNow += 1000 / INPUT_HZ / 2;
      const half = table.input(1)![0];
      hostNow += 1000 / INPUT_HZ / 2;
      guestNow += 1000 / INPUT_HZ;
      if (k > 1) expect(half).toBeCloseTo((before + table.input(1)![0]) / 2, 5);
      x += 1;
    }
    expect(table.latest(1)).toEqual([4, 0]);
    expect(table.input(1)![0]).toBeCloseTo(4, 5);
  });

  test("a pause by anyone seated pauses the table for all, and a state told says so to whoever comes", async () => {
    const { host, guests } = await hockeyRoom(1, 0);
    host.begin();
    await settle();
    let now = 0;
    const table = new LiveHost(host, host.start!.round, () => now),
      view = new LiveGuest(guests[0].room, host.start!.round, () => now),
      heard: string[] = [];
    table.onpause = (p, from) => heard.push(`host ${p} ${from === guests[0].room.me ? "guest" : "host"}`);
    view.onpause = (p) => heard.push(`guest ${p}`);
    view.pause(true);
    await settle();
    expect(table.paused).toBe(true);
    expect(view.paused).toBe(true);
    expect(heard).toEqual(["host true guest", "guest true"]);
    // Paused, the host still tells the table, more seldom.
    let told = 0;
    for (let k = 0; k < 60; k++) {
      table.tick(() => {
        told++;
        return [k];
      });
      now += 1000 / 60;
    }
    expect(told).toBeLessThanOrEqual(PAUSED_HZ + 1);
    table.pause(false);
    await settle();
    expect(view.paused).toBe(false);
    // A guest that missed the word learns it from the next state.
    view.onpause = null;
    (view as unknown as { paused: boolean }).paused = true;
    table.tick(() => [0]);
    await settle();
    expect(view.paused).toBe(false);
  });

  test("the host plays two guests' mallets as they send them, both guests see the same table, and a dropped guest's mallet goes to the computer and back", async () => {
    // The host only watches; the two guests sit at red (seat 0) and blue (seat 1).
    const { host, guests } = await hockeyRoom(2, null);
    expect(host.seats.map((s) => s.person)).toEqual([guests[0].room.me, guests[1].room.me]);
    host.begin();
    await settle();
    expect(rulesToMove(host)).toBe(HOST_ONLY);
    let now = 0;
    const round = host.start!.round,
      table = new LiveHost(host, round, () => now),
      views = guests.map((g) => new LiveGuest(g.room, round, () => now)),
      world: World = createWorld(0, 0),
      minds = [freshMind(), freshMind()] as [ReturnType<typeof freshMind>, ReturnType<typeof freshMind>],
      tally: Tally = { hits: 0, walls: 0, timeouts: 0 };
    let told: number[] = [];
    // Each guest sends its mallet along a path of its own.
    const aim = (seat: number, t: number) => (seat === 0 ? { x: Math.sin(t * 2) * 1.2, z: 2.6 } : { x: -0.8, z: -2.2 - 0.6 * Math.cos(t * 3) });
    /** One frame (1/60 s): the guests send, the host steps its table with what it has and tells it. */
    const frame = async () => {
      views.forEach((v, seat) => v.tick(() => (guests[seat].room.online ? inputOf(aim(seat, now / 1000)) : null)));
      await settle();
      for (let k = 0; k < 4; k++) {
        const hands = [0, 1].map((seat) => (table.control(seat) === "remote" ? readInput(seat as 0 | 1, table.input(seat)) : null));
        if (hostSlice(world, "normal", hands, minds, false, () => 0.5) !== null) {
          Object.assign(world, createWorld(0, 0));
          table.jump();
        }
      }
      table.tick(() => (told = snapOf(world, tally)));
      await settle();
      now += DT * 4 * 1000;
    };
    for (let k = 0; k < 120; k++) await frame();
    // Every guest has the host's newest state, the same for both.
    for (const v of views) expect(v.newest!.data).toEqual(told);
    // Each mallet is where its guest's hand was a sending or so ago.
    for (const seat of [0, 1]) {
      const sent = aim(seat, (now - 2 * (1000 / INPUT_HZ)) / 1000),
        m = world.mallets[seat];
      expect(Math.hypot(m.x - sent.x, m.z - sent.z)).toBeLessThan(0.25);
    }

    // Blue's device drops: its seat is played by the host's computer, which moves the mallet by itself.
    guests[1].link[1].close();
    await settle();
    expect(host.away(1)).toBe(true);
    expect(table.control(1)).toBe("computer");
    const still = { x: world.mallets[1].x, z: world.mallets[1].z };
    world.puck.x = 1.5;
    world.puck.z = -1.2;
    world.puck.vx = world.puck.vz = 0;
    for (let k = 0; k < 90; k++) await frame();
    expect(Math.hypot(world.mallets[1].x - still.x, world.mallets[1].z - still.z)).toBeGreaterThan(0.3);
    // Red's stream went on all the while.
    expect(views[0].newest!.data).toEqual(told);

    // Blue comes back on a new channel: its hand drives its mallet again and the table is told to it again.
    const again = memoryLinks();
    host.connect(again[0]);
    guests[1].room.connect(again[1]);
    await settle();
    expect(table.control(1)).toBe("remote");
    for (let k = 0; k < 60; k++) await frame();
    expect(views[1].newest!.data).toEqual(told);
    const sent = aim(1, (now - 2 * (1000 / INPUT_HZ)) / 1000);
    expect(Math.hypot(world.mallets[1].x - sent.x, world.mallets[1].z - sent.z)).toBeLessThan(0.25);
  });

  test("the computer can stand in for either side", async () => {
    // Side 0's computer, thinking on the table turned round, goes for a slow puck in its half as side 1's does.
    for (const side of [0, 1] as const) {
      const world = createWorld(side, 0),
        minds = [freshMind(), freshMind()] as [ReturnType<typeof freshMind>, ReturnType<typeof freshMind>],
        start = { ...world.mallets[side] };
      let struck = false;
      for (let k = 0; k < 240 * 3 && !struck; k++) {
        hostSlice(world, "hard", side === 0 ? [null, { x: 0, z: -3 }] : [{ x: 0, z: 3 }, null], minds, false, () => 0.5);
        struck = world.strikes[side] > 0;
      }
      expect(struck).toBe(true);
      expect(Math.hypot(world.mallets[side].x - start.x, world.mallets[side].z - start.z)).toBeGreaterThan(0.2);
    }
  });
});
const rulesToMove = (room: HostRoom<HockeyState>) => room.rules.toMove(room.match!.state);

describe("table soccer over Wi-Fi", () => {
  test("a guest's push and kicks are numbers the host plays on its rods; a side without a hand is the computer's", () => {
    expect(soccer.readInput(soccer.inputOf(9, 3))).toEqual({ target: PITCH_MOST, kicks: 3 });
    expect(soccer.readInput([0.5])).toBeNull();
    const world = createPitch(0, 0),
      snap = soccer.readSnap(soccer.snapOf(world, 7))!;
    expect(snap.swing).toEqual([-1, -1]);
    expect(snap.hits).toBe(7);
    expect(soccer.readSnap([1, 2])).toBeNull();
    // Red is a hand pushing its rods across and kicking once; yellow is the computer, which follows the ball.
    soccer.hostSlice(world, "hard", [{ target: 0.6, kick: true }, null], () => 0.5);
    expect(world.slide[0]).toBeCloseTo(0.6, 5);
    expect(world.swing[0]).toBeGreaterThanOrEqual(0);
    world.ball.x = 1.2;
    for (let k = 0; k < 120; k++) soccer.hostSlice(world, "hard", [{ target: 0.6, kick: false }, null], () => 0.5);
    expect(Math.abs(world.slide[1])).toBeGreaterThan(0.05);
  });
});

describe("table tennis over Wi-Fi", () => {
  test("the hall and a guest's hand go as numbers and come back", () => {
    const world = tt.createWorld(3);
    tt.serve(world, 1);
    const counts = { ...tennis.noCounts(), hits: 5, smashes: [1, 2] as [number, number] },
      snap = tennis.readSnap(tennis.snapOf(world, counts))!;
    expect(snap.phase).toBe("ready");
    expect(snap.server).toBe(1);
    expect(snap.ball.z).toBeCloseTo(world.ball.z, 3);
    expect(snap.paddles[1].z).toBeCloseTo(world.paddles[1].z, 3);
    expect(snap.counts).toEqual(counts);
    expect(tennis.readSnap(tennis.snapOf(world, counts).slice(1))).toBeNull();
    expect(tennis.readInput(tennis.inputOf({ x: 0.3, z: -1.7 }, 2))).toEqual({ x: 0.3, z: -1.7, tosses: 2 });
    expect(tennis.readInput([1, 2])).toBeNull();
    // A guest's toss is taken once: its side tosses on its serve, and the same count again does nothing.
    expect(tennis.takeToss(world, 1, 1, 0)).toBe(1);
    expect(world.phase).toBe("toss");
    expect(tennis.takeToss(world, 1, 1, 1)).toBe(1);
  });

  test("a person on the far side strikes the ball with a stroke of their swing; the computer can stand in on either side", () => {
    const hits = (world: ReturnType<typeof tt.createWorld>, seconds: number, each?: () => void) => {
      const by = [0, 0];
      for (let k = 0; k < seconds / tt.DT; k++) {
        each?.();
        for (const e of tt.step(world, "normal")) if (e.kind === "hit") by[e.side]++;
        if (world.phase === "dead" && world.dead > 1) tt.serve(world, world.server);
      }
      return by;
    };
    // Two computers, the near one standing in for a person: both serve and return.
    const both = tt.createWorld(11);
    both.people = [false, false];
    tt.serve(both, 0);
    const rally = hits(both, 20);
    expect(rally[0]).toBeGreaterThan(2);
    expect(rally[1]).toBeGreaterThan(2);
    // The computer serves from the near side; a person on the far side holds the blade behind its end, where the ball
    // comes, and moves it toward the net as it comes: the ball goes back over the net, struck by the far side.
    const duel = tt.createWorld(5);
    duel.people = [false, true];
    tt.serve(duel, 0);
    let back = false;
    hits(duel, 3, () => {
      const b = duel.ball;
      if (back) return;
      duel.hands[1] = { x: b.x, z: tt.canHit(duel, 1) && b.z < -tt.HALF_L - 0.05 ? -tt.HALF_L + 0.1 : -tt.HALF_L - 0.35 };
      back = duel.hitter === 1 && duel.phase === "rally" && duel.ball.vz > 0;
    });
    expect(back).toBe(true);
    // Its hand is its own: the computer never moved it (it stayed where the test held it).
    expect(Math.abs(duel.hands[1].z)).toBeGreaterThan(tt.HALF_L - 0.2);
  });
});
