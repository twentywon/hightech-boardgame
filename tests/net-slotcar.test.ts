import { describe, expect, test } from "vitest";
import { encode, type SeatInfo } from "../src/net/protocol";
import { GuestRoom, HostRoom, memoryLinks } from "../src/net/room";
import { LiveGuest, LiveHost } from "../src/net/live";
import { HOST_ONLY } from "../src/net/match";
import { pointRules } from "../src/net/points";
import { slotCarConfig } from "../src/games/slotcar/config";
import { END, LAP, OFF, carName, packRanking, slotCar, type State } from "../src/games/slotcar/rules";
import { DT, autopilot, createWorld, progress, step, type World } from "../src/games/slotcar/sim";
import { follow, hostThrottles, inputOf, readInput, readSnap, snapOf } from "../src/games/slotcar/net";

/** Lets every queued message be delivered (each hop is a microtask). */
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const net = slotCarConfig.net!;

/** A slot car room on memory links: the host at seat 0 and `guests` guests, each in the next open seat. */
async function slotRoom(guests: number, laps = 3, kinds: Record<number, "computer" | "closed"> = {}) {
  const rules = pointRules(slotCar, net),
    seats: SeatInfo[] = net.seats!("bank").map((s) => ({ ...s, kind: "open", person: null }));
  const host = new HostRoom<State>({ game: "slot-car", title: "슬롯 카", name: "방장", variant: "bank", options: { laps: String(laps) }, seats, quiet: true }, rules);
  host.sit(0);
  const joined: { room: GuestRoom<State>; link: ReturnType<typeof memoryLinks> }[] = [];
  for (let k = 0; k < guests; k++) {
    const room = new GuestRoom<State>({ game: "slot-car", title: "슬롯 카", name: `손님${k + 1}`, quiet: true }, rules),
      link = memoryLinks();
    host.connect(link[0]);
    room.connect(link[1]);
    await settle();
    joined.push({ room, link });
  }
  for (const [seat, kind] of Object.entries(kinds)) host.setKind(Number(seat), kind);
  host.begin();
  await settle();
  return { host, guests: joined };
}

/**
 * A race over the room: the host runs the one world and makes the moves; each guest draws its own world from the
 * host's states and sends its pedal (`pedal`, given its own world and its car). One frame is 1/60 s, two slices.
 */
function race(host: HostRoom<State>, guests: { room: GuestRoom<State> }[], pedal: (world: World, car: number, seat: number) => boolean, hostPedal: (world: World) => boolean = () => false) {
  let now = 0;
  const state = host.match!.state,
    round = host.start!.round,
    seats = state.seats!,
    world = createWorld(state.course, state.cars, state.laps, "normal", 7),
    table = new LiveHost(host, round, () => now),
    views = guests.map((g) => new LiveGuest(g.room, round, () => now)),
    drawn = guests.map(() => createWorld(state.course, state.cars, state.laps, "normal", 99)),
    refused: string[] = [];
  const frame = async () => {
    views.forEach((v, i) => {
      const seat = guests[i].room.mySeat!,
        car = seats.indexOf(seat);
      v.tick(() => (guests[i].room.online ? inputOf(pedal(drawn[i], car, seat)) : null));
    });
    await settle();
    for (let k = 0; k < 2; k++) {
      const throttles = hostThrottles(world, seats, (seat) => table.control(seat), (seat) => table.latest(seat), hostPedal(world), "normal");
      for (const event of step(world, throttles, "normal")) {
        const move =
          event.kind === "lap" ? { from: -1, to: LAP + event.car, extra: -1 } : event.kind === "off" ? { from: -1, to: OFF + event.car, extra: -1 } : event.kind === "end" ? { from: -1, to: END, extra: packRanking(event.ranking) } : null;
        if (move) {
          const why = host.play(move, 0);
          if (why) refused.push(why);
        }
      }
    }
    table.tick(() => snapOf(world));
    await settle();
    now += DT * 2 * 1000;
    views.forEach((v, i) => {
      const at = v.frame(now),
        a = at && readSnap(at.a.data),
        b = at && readSnap(at.b.data);
      if (at && a && b) follow(drawn[i], a, b, at.t);
    });
  };
  const frames = async (n: number, until: () => boolean = () => false) => {
    for (let k = 0; k < n && !until(); k++) await frame();
  };
  return { world, table, views, drawn, seats, refused, frames, now: () => now };
}

describe("slot car messages", () => {
  test("the race's state and a pedal are a few numbers, read back as sent", () => {
    const world = createWorld("bank", 4, 3, "normal", 3);
    for (let k = 0; k < 900; k++) step(world, [true, false, true, true]);
    const data = snapOf(world),
      snap = readSnap(data)!;
    expect(data.length).toBe(3 + 4 * 15);
    expect(encode({ t: "live", round: 1, seq: 999, at: 1234567, cut: 0, paused: false, data }).length).toBeLessThan(600);
    expect(snap.tick).toBe(world.tick);
    expect(snap.cars.map((c) => c.laps)).toEqual(world.cars.map((c) => c.laps));
    expect(snap.cars.map((c) => c.offs)).toEqual(world.cars.map((c) => c.offs));
    // A guest's world laid from it stands where the host's does.
    const other = createWorld("bank", 4, 3, "normal", 50);
    follow(other, snap, snap, 1);
    for (let k = 0; k < 4; k++) expect(progress(other, k)).toBeCloseTo(progress(world, k), 2);
    expect(readSnap(data.slice(0, -1))).toBeNull();
    expect(readSnap([0, -1, 9])).toBeNull();
    expect(readInput(inputOf(true))).toBe(true);
    expect(readInput(inputOf(false))).toBe(false);
    expect(readInput(null)).toBe(false);
  });
});

describe("slot car over Wi-Fi", () => {
  test("a seat for each lane, a car for every seat taken, the course and laps the host's", async () => {
    const { host, guests } = await slotRoom(1, 5, { 2: "computer" });
    const state = host.match!.state;
    // Seat 3 was left open: it is closed and has no car. Three cars, in seat order.
    expect(host.seats.map((s) => s.kind)).toEqual(["person", "person", "computer", "closed"]);
    expect(state.seats).toEqual([0, 1, 2]);
    expect([state.cars, state.laps, state.course]).toEqual([3, 5, "bank"]);
    expect(guests[0].room.match!.state).toEqual(state);
    expect(host.rules.toMove(state)).toBe(HOST_ONLY);
    expect(carName(state, 2)).toBe("노랑");
    // The status line names my car by its seat.
    expect(net.hint!(state, 1)).toContain("파랑");
    expect(net.hint!(state, null)).toContain("구경");
  });

  test("a host and two guests race to the finish, and every device agrees on the laps, the flights off and the order", async () => {
    // Seat 3 is the computer's: four cars; the host and both guests drive by the computer's own judgement.
    const { host, guests } = await slotRoom(2, 3, { 3: "computer" });
    const run = race(host, guests, (world, car) => autopilot(world, car, "normal"), (world) => autopilot(world, 0, "hard"));
    expect(run.seats).toEqual([0, 1, 2, 3]);
    expect(run.table.control(1)).toBe("remote");
    expect(run.table.control(3)).toBe("computer");
    // Each guest's pedal reached the host: its car went round.
    await run.frames(60 * 90, () => host.match!.state.ranking !== null);
    await run.frames(30);
    const state = host.match!.state;
    expect(run.refused).toEqual([]);
    expect(state.ranking).not.toBeNull();
    expect(state.ranking!.slice(0, state.order.length)).toEqual(run.world.order);
    expect(state.done).toEqual(run.world.cars.map((c) => Math.min(c.laps, 3)));
    expect(state.offs).toEqual(run.world.cars.map((c) => c.offs));
    expect(state.order.length).toBeGreaterThanOrEqual(1);
    for (const k of [1, 2]) expect(run.world.cars[k].laps).toBeGreaterThanOrEqual(2);
    // The guests have the same match, and their drawn race ends as the host's.
    for (const [i, g] of guests.entries()) {
      expect(g.room.match!.state).toEqual(state);
      expect(slotCar.reason(g.room.match!.state)).toBe(slotCar.reason(state));
      expect(run.drawn[i].closed).toBe(run.world.closed);
      expect(run.drawn[i].order).toEqual(run.world.order);
      expect(run.drawn[i].cars.map((c) => c.laps)).toEqual(run.world.cars.map((c) => c.laps));
    }
    expect(net.winnerSeat!(state)).toBe(state.ranking![0]);
  });

  test("a guest's pedal drives its own car on the host and nobody else's", async () => {
    const { host, guests } = await slotRoom(2, 3);
    // Seats 2 and 3 were open: closed. Guest 1 (blue) holds its pedal; the host and guest 2 do not.
    const run = race(host, guests, (_world, _car, seat) => seat === 1);
    expect(run.seats).toEqual([0, 1, 2]);
    await run.frames(60 * 4.5);
    expect(run.world.cars[1].v).toBeGreaterThan(3);
    expect(progress(run.world, 1)).toBeGreaterThan(3);
    expect(progress(run.world, 0)).toBe(0);
    expect(progress(run.world, 2)).toBe(0);
    // Both guests draw it going, a moment behind the host.
    for (const drawn of run.drawn) {
      expect(progress(drawn, 1)).toBeGreaterThan(progress(run.world, 1) - 2);
      expect(progress(drawn, 1)).toBeLessThanOrEqual(progress(run.world, 1) + 0.01);
    }
  });

  test("a dropped guest's car is driven by the host's computer, and is the guest's again when it comes back", async () => {
    const { host, guests } = await slotRoom(2, 3);
    // Nobody holds a pedal: every car stands at the line.
    const run = race(host, guests, () => false);
    await run.frames(60 * 4);
    expect(progress(run.world, 2)).toBe(0);
    // Guest 2 (yellow) drops: the computer drives its car round.
    guests[1].link[1].close();
    await settle();
    expect(host.away(2)).toBe(true);
    expect(run.table.control(2)).toBe("computer");
    await run.frames(60 * 4);
    expect(progress(run.world, 2)).toBeGreaterThan(5);
    expect(progress(run.world, 1)).toBe(0);
    // The others' stream went on all the while.
    expect(readSnap(run.views[0].newest!.data)!.tick).toBeGreaterThan(60 * 8 * 2 - 20);
    // Back on a new channel: its pedal (let go) is its own again, and the car rolls to a stop.
    const again = memoryLinks();
    host.connect(again[0]);
    guests[1].room.connect(again[1]);
    await settle();
    expect(run.table.control(2)).toBe("remote");
    await run.frames(60 * 3);
    expect(run.world.cars[2].v).toBe(0);
    const stopped = progress(run.world, 2);
    await run.frames(60);
    expect(progress(run.world, 2)).toBe(stopped);
    // And it is told the race again.
    expect(readSnap(run.views[1].newest!.data)!.tick).toBeGreaterThanOrEqual(run.world.tick - 4);
  });
});
