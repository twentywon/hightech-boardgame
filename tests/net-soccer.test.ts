import { describe, expect, test } from "vitest";
import { encode, type SeatInfo } from "../src/net/protocol";
import { GuestRoom, HostRoom, memoryLinks } from "../src/net/room";
import { LiveGuest, LiveHost } from "../src/net/live";
import { HOST_ONLY } from "../src/net/match";
import { pointRules } from "../src/net/points";
import { soccerConfig } from "../src/games/soccer/config";
import { GOAL, TIME, soccer, type State } from "../src/games/soccer/rules";
import { IDLE, createWorld, step, ticks, type Input, type World } from "../src/games/soccer/sim";
import { Hands, follow, hostInputs, inputOf, readInput, readSnap, snapOf } from "../src/games/soccer/net";

const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const net = soccerConfig.net!;

/** A soccer room on memory links: the host at seat 0 (red 1), `guests` guests each in the next open seat, then `kinds` set. */
async function soccerRoom(variant: string, guests: number, kinds: Record<number, "computer" | "open"> = {}, options: Record<string, string> = { goals: "1", minutes: "0", level: "normal" }) {
  const rules = pointRules(soccer, net),
    seats: SeatInfo[] = net.seats!(variant).map((s) => ({ ...s, kind: "open", person: null }));
  const host = new HostRoom<State>({ game: "soccer", title: "축구", name: "방장", variant, options, seats, quiet: true }, rules);
  const joined: { room: GuestRoom<State>; link: ReturnType<typeof memoryLinks> }[] = [];
  for (let k = 0; k < guests; k++) {
    const room = new GuestRoom<State>({ game: "soccer", title: "축구", name: `손님${k + 1}`, quiet: true }, rules),
      link = memoryLinks();
    host.connect(link[0]);
    room.connect(link[1]);
    await settle();
    joined.push({ room, link });
  }
  for (const [seat, kind] of Object.entries(kinds)) host.setKind(Number(seat), kind);
  return { host, guests: joined, rules };
}
/**
 * A match over the room: the host runs the one pitch and makes the moves; each guest draws its own from the host's
 * states and sends its hand (`hand`, given its own drawn pitch and its player). One frame is one slice (1/60 s).
 */
function match(host: HostRoom<State>, guests: { room: GuestRoom<State> }[], hand: (world: World, k: number, seat: number) => Input, mine: (world: World) => Input = () => IDLE) {
  let now = 0;
  const state = host.match!.state,
    round = host.start!.round,
    world = createWorld(state.mode, state.players.map((p) => p.team), state.level, 7, ticks(state.minutes * 60)),
    table = new LiveHost(host, round, () => now),
    views = guests.map((g) => new LiveGuest(g.room, round, () => now)),
    drawn = guests.map(() => createWorld(state.mode, state.players.map((p) => p.team), state.level, 99)),
    counts = guests.map(() => ({ kicks: 0, jumps: 0 })),
    hands = new Hands(),
    refused: string[] = [];
  const frame = async () => {
    views.forEach((v, i) => {
      const seat = guests[i].room.mySeat!,
        k = state.players.findIndex((p) => p.seat === seat),
        h = hand(drawn[i], k, seat);
      if (h.kickPress) counts[i].kicks++;
      if (h.jumpPress) counts[i].jumps++;
      v.tick(() => (guests[i].room.online ? inputOf({ x: h.x, y: h.y, kick: h.kick, kicks: counts[i].kicks, jump: !!h.jump, jumps: counts[i].jumps }) : null));
    });
    await settle();
    const live = host.match!.state;
    world.overtime = live.overtime;
    world.done = live.champion !== null;
    const inputs = hostInputs(world, live, (seat) => table.control(seat), (seat) => table.latest(seat), mine(world), hands);
    for (const event of step(world, inputs)) {
      const move = event.kind === "goal" ? { from: -1, to: GOAL + event.team, extra: -1 } : event.kind === "time" ? { from: -1, to: TIME, extra: -1 } : null;
      if (move) {
        const why = host.play(move, 0);
        if (why) refused.push(why);
      }
    }
    table.tick(() => snapOf(world));
    await settle();
    now += 1000 / 60;
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
  return { world, table, views, drawn, refused, frames };
}

describe("soccer messages", () => {
  test("the pitch and a hand are a few numbers, read back as sent", () => {
    const w = createWorld("flat", [0, 0, 0, 1, 1, 1], "normal", 3);
    for (let k = 0; k < 600; k++) step(w, w.men.map(() => IDLE));
    const data = snapOf(w),
      snap = readSnap(data)!;
    expect(data.length).toBe(18 + 6 * 7);
    expect(encode({ t: "live", round: 1, seq: 999, at: 1234567, cut: 0, paused: false, data }).length).toBeLessThan(700);
    expect([snap.tick, snap.phase, snap.men.length]).toEqual([w.tick, w.phase, 6]);
    const other = createWorld("flat", [0, 0, 0, 1, 1, 1], "normal", 9);
    follow(other, snap, snap, 1);
    other.men.forEach((m, k) => expect(m.x).toBeCloseTo(w.men[k].x, 3));
    expect(readSnap(data.slice(0, -1))).toBeNull();
    const sent = inputOf({ x: 0.5, y: -1, kick: true, kicks: 3, jump: false, jumps: 1 });
    expect(readInput(sent)).toEqual({ x: 0.5, y: -1, kick: true, kicks: 3, jump: false, jumps: 1 });
    expect(readInput(null)).toBeNull();
    // A press is a press once: the host's reading of the counts.
    const hands = new Hands();
    expect(hands.take(2, sent).kickPress).toBe(false);
    expect(hands.take(2, inputOf({ x: 0, y: 0, kick: true, kicks: 4, jump: false, jumps: 1 })).kickPress).toBe(true);
    expect(hands.take(2, inputOf({ x: 0, y: 0, kick: true, kicks: 4, jump: false, jumps: 1 })).kickPress).toBe(false);
  });
});

describe("soccer over Wi-Fi", () => {
  test("seats are red 1, blue 1, red 2, …: six on the flat pitch, four in gravity; people fill the teams in turn; the camps need both teams", async () => {
    expect(net.seats!("flat").map((s) => s.label)).toEqual(["레드 1", "블루 1", "레드 2", "블루 2", "레드 3", "블루 3"]);
    expect(net.seats!("gravity").length).toBe(4);
    const { host, guests } = await soccerRoom("gravity", 2);
    expect(host.seats.map((s) => s.kind)).toEqual(["person", "person", "person", "open"]);
    expect(guests[0].room.mySeat).toBe(1);
    expect(net.camps!.label!(host.seats)).toContain("중력 축구");
    expect(net.camps!.problem!(host.seats)).toBeNull();
    // Blue's only player moved to the watchers: blue is empty and the start is refused by the camps.
    host.sit(null, guests[0].room.me);
    expect(net.camps!.problem!(host.seats)).toContain("블루");
    host.setKind(3, "computer");
    expect(net.camps!.problem!(host.seats)).toBeNull();
    host.begin();
    await settle();
    const state = host.match!.state;
    // The left-out seat 1 is closed; the gravity pitch and the host's limits are the room's on every device.
    expect(host.seats.map((s) => s.kind)).toEqual(["person", "closed", "person", "computer"]);
    expect(state.players.map((p) => [p.team, p.seat])).toEqual([[0, 0], [0, 2], [1, 3]]);
    expect([state.mode, state.goals, state.minutes, state.net]).toEqual(["gravity", 1, 0, true]);
    for (const g of guests) expect(g.room.match!.state).toEqual(state);
    expect(host.rules.toMove(state)).toBe(HOST_ONLY);
    expect(net.hint!(state, 2)).toContain("레드 팀");
    expect(net.hint!(state, null)).toContain("구경");
  });

  test("a host and two guests play to the end, every device agrees on the score and each seat hears its own team's result", async () => {
    const { host, guests } = await soccerRoom("flat", 2, { 3: "computer" });
    host.begin();
    await settle();
    // Red: the host and guest 2 (idle); blue: guest 1 and the computer (playing).
    const run = match(host, guests, (world, k) => (k >= 0 && world.men[k].team === 1 ? IDLE : IDLE));
    expect(run.table.control(1)).toBe("remote");
    expect(run.table.control(3)).toBe("computer");
    await run.frames(60 * 150, () => host.match!.state.champion !== null);
    await run.frames(20);
    const state = host.match!.state;
    expect(run.refused).toEqual([]);
    expect(state.champion).toBe(1);
    expect(state.score).toEqual([0, 1]);
    for (const [i, g] of guests.entries()) {
      expect(g.room.match!.state).toEqual(state);
      expect(run.drawn[i].counts.goals).toBe(1);
    }
    expect(net.outcome!(state, 1)).toBe("win");
    expect(net.outcome!(state, 0)).toBe("lose");
    expect(net.outcome!(state, 2)).toBe("lose");
    expect(net.reason!(state)).toMatch(/^블루 팀이 1 대 0으로 이겼습니다/);
  });

  test("a guest's hand moves its own player on the host; a dropped guest is played by the computer and gets its seat back", async () => {
    const { host, guests } = await soccerRoom("flat", 1, {}, { goals: "0", minutes: "5", level: "normal" });
    host.begin();
    await settle();
    let push = true;
    const run = match(host, guests, () => (push ? { x: 0, y: 1, kick: false } : IDLE));
    const blue = host.match!.state.players.findIndex((p) => p.seat === 1);
    const start = { ...run.world.men[blue] };
    await run.frames(60);
    // Up the pitch (its y), on the host and on its own screen.
    expect(run.world.men[blue].y).toBeGreaterThan(start.y + 1);
    expect(run.drawn[0].men[blue].y).toBeGreaterThan(start.y + 0.5);
    expect(run.world.men[0].y).toBe(0);
    push = false;
    guests[0].link[1].close();
    await settle();
    expect(host.away(1)).toBe(true);
    expect(run.table.control(1)).toBe("computer");
    // The computer takes the stand-in's place: it waits through red's kickoff, then goes for the ball.
    await run.frames(60 * 9);
    expect(run.world.phase).toBe("play");
    expect(run.world.counts.kicks + Math.abs(run.world.ball.x) + Math.abs(run.world.ball.y)).toBeGreaterThan(0);
    const again = memoryLinks();
    host.connect(again[0]);
    guests[0].room.connect(again[1]);
    await settle();
    expect(run.table.control(1)).toBe("remote");
  });
});
