import { describe, expect, test } from "vitest";
import { decode, encode, type SeatInfo, type StartInfo } from "../src/net/protocol";
import { Match, NOBODY, type NetRules } from "../src/net/match";
import { GuestRoom, HostRoom, memoryLinks, type Link } from "../src/net/room";
import { streamFor } from "../src/net/random";
import { pointRules } from "../src/net/points";
import type { PointConfig } from "../src/ui/point-game";
import type { Move } from "../src/games/points/types";
import { ludoConfig } from "../src/games/ludo/config";
import { ROLL as LUDO_ROLL, chooseToken, type State as LudoState } from "../src/games/ludo/rules";
import { snakesConfig } from "../src/games/snakes/config";
import type { State as SnakesState } from "../src/games/snakes/rules";
import { backgammonConfig } from "../src/games/backgammon/config";
import { chooseMove as bgMove, type State as BgState } from "../src/games/backgammon/rules";
import { urConfig } from "../src/games/ur/config";
import type { State as UrState } from "../src/games/ur/rules";
import { tacticsConfig } from "../src/games/tactics/config";
import { WAIT, activeUnit, type State as TacticsState } from "../src/games/tactics/rules";

/*
 * 와이파이 여럿이 for the games of dice and for tactical battle: simulated devices joined by links in memory, each
 * playing only its own seat. Every device must reach the same state over the same moves, dice included, though each
 * die is drawn only when the host takes the move (the salt it sends with it).
 */
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const rulesOf = <S>(config: PointConfig<S>): NetRules<S> => pointRules(config.game, config.net!);
/** The seats a room of the game offers, as the point-game screen lays them out. */
function seatsOf<S>(config: PointConfig<S>): SeatInfo[] {
  const list = config.net!.seats?.("") ?? [0, 1].map((p) => ({ label: config.sides[p], color: config.colors![p], kinds: ["computer" as const] }));
  return list.map((s) => ({ ...s, kind: "open", person: null }));
}
async function room<S>(rules: NetRules<S>, seats: SeatInfo[], guests: string[], game: string) {
  const host = new HostRoom({ game, title: game, name: "방장", variant: "", options: {}, seats, quiet: true }, rules, "host");
  const others: { room: GuestRoom<S>; link: Link }[] = [];
  for (const [i, name] of guests.entries()) {
    const guest = new GuestRoom<S>({ game, title: game, name, quiet: true }, rules, `guest${i}`);
    const [a, b] = memoryLinks();
    host.connect(a);
    guest.connect(b);
    others.push({ room: guest, link: b });
    await settle();
  }
  return { host, guests: others };
}
type Device<S> = HostRoom<S> | GuestRoom<S>;
/**
 * Plays the game out through the room: the device of the seat to move moves (a guest sends, the host plays), the
 * host's computer plays computer seats; now and then another device tries out of turn and is refused. The moves come
 * from `pick`, which sees only that device's own copy of the game.
 */
async function playOut<S>(host: HostRoom<S>, devices: Device<S>[], pick: (state: S, random: () => number) => Move | null, most: number) {
  const random = streamFor(77, 1);
  let plies = 0,
    refused = 0;
  while (host.match!.toMove !== NOBODY && plies < most) {
    const seat = host.match!.toMove,
      device = host.seats[seat].kind === "computer" ? host : devices.find((d) => d.mySeat === seat)!,
      move = pick(device.match!.state, random)!;
    const other = devices.find((d) => !d.host && d.mySeat !== seat && d.mySeat !== null) as GuestRoom<S> | undefined;
    if (other && plies % 17 === 0) {
      expect(other.play(move)).toBe("상대 차례입니다.");
      refused++;
    }
    expect(device.host ? (device as HostRoom<S>).play(move, seat) : (device as GuestRoom<S>).play(move)).toBeNull();
    await settle();
    plies++;
  }
  for (const d of devices) {
    expect(d.match!.ply).toBe(host.match!.ply);
    expect(d.match!.state).toEqual(host.match!.state);
  }
  return { plies, refused };
}
const firstLegal =
  <S>(config: PointConfig<S>) =>
  (state: S, random: () => number) => {
    const legal = config.game.moves(state);
    return legal[Math.floor(random() * legal.length)] ?? null;
  };

describe("chance drawn when the host takes a move", () => {
  test("a stream without a salt is the one stage 1 drew; a salt gives another", () => {
    const plain = streamFor(1234, 3),
      again = streamFor(1234, 3, 0),
      salted = streamFor(1234, 3, 99);
    const a = Array.from({ length: 8 }, plain),
      b = Array.from({ length: 8 }, again),
      c = Array.from({ length: 8 }, salted);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
    expect(Array.from({ length: 8 }, streamFor(1234, 3, 99))).toEqual(c);
  });

  test("the seed alone does not tell the rolls: a device that plays them ahead without the salts is soon wrong", () => {
    const rules = rulesOf(snakesConfig),
      start: StartInfo = { round: 1, variant: "", options: {}, seed: 5150, seats: [{ kind: "person", person: "a" }, { kind: "person", person: "b" }, { kind: "closed", person: null }, { kind: "closed", person: null }] },
      honest = new Match(rules, start),
      foreseen = new Match(rules, start);
    const roll: Move = { from: -1, to: 0, extra: -1 };
    let differ = 0;
    for (let k = 1; k <= 20; k++) {
      honest.push(roll, honest.toMove, (k * 2654435761) >>> 0);
      foreseen.push(roll, foreseen.toMove);
      if (honest.state.roll!.die !== foreseen.state.roll!.die) differ++;
    }
    expect(differ).toBeGreaterThan(5);
    // The salts are kept in the list, so the honest game replays to itself.
    const rebuilt = new Match(rules, start);
    expect(rebuilt.replay(honest.moves)).toBe(true);
    expect(rebuilt.state).toEqual(honest.state);
  });

  test("a guest's roll is played only when the host tells it back, with the salt the host drew; the message carries it", async () => {
    const { host, guests } = await room(rulesOf(urConfig), seatsOf(urConfig), ["민수"], "royal-game-of-ur");
    host.begin();
    await settle();
    const guest = guests[0].room,
      throwMove: Move = urConfig.game.moves(host.match!.state)[0];
    // The host (흰 말) throws first.
    expect(host.play(throwMove, 0)).toBeNull();
    await settle();
    // Play on until it is the guest's throw.
    while (host.match!.toMove !== 1) {
      const move = urConfig.game.choose!(host.match!.state, "normal", streamFor(3, host.match!.ply));
      expect(host.play(move!, 0)).toBeNull();
      await settle();
    }
    const before = guest.match!.ply;
    expect(guest.play(urConfig.game.moves(guest.match!.state)[0])).toBeNull();
    // Sent, not yet played here.
    expect(guest.match!.ply).toBe(before);
    await settle();
    expect(guest.match!.ply).toBe(before + 1);
    const told = host.match!.moves[before];
    expect(told.salt).toBeGreaterThan(0);
    expect(guest.match!.moves[before]).toEqual(told);
    expect(guest.match!.state).toEqual(host.match!.state);
    // The relay as sent: the salt goes along and is read back; a salt that is not a 32-bit whole number is not.
    const text = encode({ t: "move", round: 1, ply: before, move: told.move, seat: told.seat, salt: told.salt });
    expect(decode(text)).toMatchObject({ t: "move", salt: told.salt });
    expect(decode(text.replace(`"salt":${told.salt}`, '"salt":1.5'))).toBeNull();
    expect(decode(text.replace(`"salt":${told.salt}`, '"salt":-3'))).toBeNull();
    // A stage-1 move without a salt is still read.
    expect(decode(encode({ t: "move", round: 1, ply: 0, move: told.move, seat: 0 }))).not.toBeNull();
  });
});

describe("ludo for four over Wi-Fi", () => {
  const rules = rulesOf(ludoConfig);

  test("four colours on four devices: the road's order, the same dice and the same board everywhere", async () => {
    const { host, guests } = await room(rules, seatsOf(ludoConfig), ["민수", "지아", "하늘"], "ludo");
    // 빨강 the host, then 초록, 노랑, 파랑 in the order people came.
    expect(host.seats.map((s) => s.person)).toEqual(["host", "guest0", "guest1", "guest2"]);
    host.begin();
    await settle();
    const devices: Device<LudoState>[] = [host, ...guests.map((g) => g.room)];
    for (const d of devices) expect(d.match!.state).toEqual(host.match!.state);
    expect(host.match!.state.colors).toEqual([0, 2, 1, 3]);
    // Red rolls first; the yellow device's roll is refused.
    expect(host.match!.toMove).toBe(0);
    expect(guests[1].room.play({ from: -1, to: LUDO_ROLL, extra: -1 })).toBe("상대 차례입니다.");
    const { plies, refused } = await playOut(host, devices, (s, r) => chooseToken(s, "normal", r), 4000);
    expect(refused).toBeGreaterThan(3);
    expect(host.match!.toMove).toBe(NOBODY);
    const state = host.match!.state;
    expect(state.winner).not.toBeNull();
    expect(plies).toBeGreaterThan(100);
    // Every colour played, turn by turn in the road's order: red, yellow, green, blue.
    const seats = host.match!.moves.map((m) => m.seat),
      changes = seats.filter((seat, i) => i && seat !== seats[i - 1]);
    for (let i = 1; i < changes.length; i++) {
      const before = changes[i - 1],
        order = [0, 2, 1, 3];
      expect(changes[i]).toBe(order[(order.indexOf(before) + 1) % 4]);
    }
    // The winner's seat is its colour's.
    expect(ludoConfig.net!.winnerSeat!(state)).toBe(state.colors[state.winner!]);
  });

  test("three people and an empty corner: closed yellow is left out, blue is the host's computer", async () => {
    const { host, guests } = await room(rules, seatsOf(ludoConfig), ["민수"], "ludo");
    host.setKind(2, "closed");
    host.setKind(3, "computer");
    expect(host.startProblem()).toBeNull();
    host.begin();
    await settle();
    expect(host.match!.state.colors).toEqual([0, 1, 3]);
    expect(host.match!.state.tokens.length).toBe(3);
    await playOut(host, [host, guests[0].room], (s, r) => chooseToken(s, "normal", r), 600);
    expect(new Set(host.match!.moves.map((m) => m.seat))).toEqual(new Set([0, 1, 3]));
  });

  test("two colours that face each other are the game for two at one screen", () => {
    const start: StartInfo = { round: 1, variant: "", options: {}, seed: 1, seats: [{ kind: "person", person: "a" }, { kind: "person", person: "b" }, { kind: "closed", person: null }, { kind: "closed", person: null }] };
    expect(new Match(rules, start).state).toEqual(ludoConfig.game.create(""));
  });
});

describe("the other games of dice over Wi-Fi", () => {
  test("snakes and ladders for three: one token each, the same rolls everywhere, an empty seat left out", async () => {
    const rules = rulesOf(snakesConfig);
    const { host, guests } = await room(rules, seatsOf(snakesConfig), ["민수", "지아"], "snakes-and-ladders");
    host.setKind(3, "closed");
    host.begin();
    await settle();
    const devices: Device<SnakesState>[] = [host, ...guests.map((g) => g.room)];
    expect(host.match!.state.colors).toEqual([0, 1, 2]);
    await playOut(host, devices, firstLegal(snakesConfig), 3000);
    expect(host.match!.toMove).toBe(NOBODY);
    const state = host.match!.state;
    expect(state.positions[state.winner!]).toBe(100);
    // The rolls were real: more than one face came up, and sixes rolled again.
    const dice = new Set(host.match!.states.slice(1).map((s) => s.roll!.die));
    expect(dice.size).toBe(6);
  });

  test("backgammon on two devices: every throw and checker the same on both", async () => {
    const { host, guests } = await room(rulesOf(backgammonConfig), seatsOf(backgammonConfig), ["민수"], "backgammon");
    host.begin();
    await settle();
    const { plies } = await playOut<BgState>(host, [host, guests[0].room], (s, r) => bgMove(s, "normal", r), 3000);
    expect(plies).toBeGreaterThan(80);
    expect(host.match!.toMove).toBe(NOBODY);
  });

  test("the Royal Game of Ur on two devices, the guest's seat played by the host's computer while it is away, then resynced", async () => {
    const rules = rulesOf(urConfig);
    const { host, guests } = await room(rules, seatsOf(urConfig), ["민수"], "royal-game-of-ur");
    host.begin();
    await settle();
    const guest = guests[0].room,
      choose = (s: UrState, r: () => number) => urConfig.game.choose!(s, "normal", r);
    const random = streamFor(9, 9);
    for (let i = 0; i < 30; i++) {
      const seat = host.match!.toMove,
        device: Device<UrState> = seat === 0 ? host : guest;
      expect(device.host ? host.play(choose(device.match!.state, random)!, seat) : guest.play(choose(guest.match!.state, random)!)).toBeNull();
      await settle();
    }
    expect(guest.match!.state).toEqual(host.match!.state);
    // The guest's channel drops: the host plays on for it (as its computer would), dice and all.
    guests[0].link.close();
    await settle();
    expect(host.away(1)).toBe(true);
    for (let i = 0; i < 40 && host.match!.toMove !== NOBODY; i++) expect(host.play(choose(host.match!.state, random)!, host.match!.toMove)).toBeNull();
    expect(guest.match!.ply).toBeLessThan(host.match!.ply);
    // It comes back on a new channel and is given the list with its salts: the same game, every die the same.
    const [a, b] = memoryLinks();
    host.connect(a);
    guest.connect(b);
    await settle();
    expect(guest.online).toBe(true);
    expect(guest.match!.ply).toBe(host.match!.ply);
    expect(guest.match!.state).toEqual(host.match!.state);
    expect(guest.match!.moves).toEqual(host.match!.moves);
  });

  test("an undo through the room: asked, accepted, and both rebuilt to the same state from the salted list", async () => {
    const rules = rulesOf(snakesConfig);
    const { host, guests } = await room(rules, seatsOf(snakesConfig), ["민수"], "snakes-and-ladders");
    host.begin();
    await settle();
    const guest = guests[0].room,
      roll: Move = { from: -1, to: 0, extra: -1 };
    for (let i = 0; i < 9; i++) {
      const seat = host.match!.toMove;
      expect(seat === 0 ? host.play(roll, 0) : guest.play(roll)).toBeNull();
      await settle();
    }
    const length = host.match!.undoFor(1)!,
      expected = host.match!.states[length];
    expect(guest.request("undo")).toBeNull();
    await settle();
    expect(host.pending?.kind).toBe("undo");
    host.answer(host.pending!.id, true);
    await settle();
    expect(host.match!.ply).toBe(length);
    expect(host.match!.state).toEqual(expected);
    expect(guest.match!.state).toEqual(expected);
    expect(guest.match!.moves).toEqual(host.match!.moves);
  });
});

describe("tactical battle over Wi-Fi", () => {
  test("each device leads one army: the side of the unit to act moves, often twice running, and both fields agree", async () => {
    const rules = rulesOf(tacticsConfig);
    const { host, guests } = await room(rules, seatsOf(tacticsConfig), ["민수"], "tactical-battle");
    host.begin();
    await settle();
    const guest = guests[0].room;
    // The first to act is the fastest unit; the other side's device is refused.
    const first = host.match!.toMove,
      waiting = first === 0 ? guest : null;
    if (waiting) expect(waiting.play({ from: -1, to: WAIT, extra: -1 })).toBe("상대 차례입니다.");
    expect(first).toBe(activeUnit(host.match!.state).side);
    // A command that only chooses (이동) is a move of the room too: every copy of the game follows it.
    const device: Device<TacticsState> = first === 0 ? host : guest,
      aim = { from: -1, to: 1000, extra: -1 };
    expect(device.host ? host.play(aim, first) : guest.play(aim)).toBeNull();
    await settle();
    expect(guest.match!.state.aim).toBe("move");
    expect(host.match!.state.aim).toBe("move");
    const { plies } = await playOut<TacticsState>(host, [host, guest], (s, r) => tacticsConfig.game.choose!(s, "easy", r), 400);
    expect(plies).toBeGreaterThan(40);
    const seats = host.match!.moves.map((m) => m.seat);
    expect(seats.some((s, i) => i && s === seats[i - 1])).toBe(true);
    expect(new Set(seats)).toEqual(new Set([0, 1]));
  });
});
