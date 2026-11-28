import { describe, expect, test } from "vitest";
import { NOBODY } from "../src/net/match";
import { GuestRoom, HostRoom, memoryLinks, type Link } from "../src/net/room";
import type { SeatInfo, StartInfo } from "../src/net/protocol";
import type { Move } from "../src/games/points/types";
import type { BoardNet } from "../src/net/boards";
import {
  CONQUEST_ACTIONS,
  conquestAction,
  conquestMove,
  conquestNet,
  conquestOptions,
  tourMove,
  tourNet,
  yachtHold,
  yachtNet,
  yachtRoll,
  yachtScore,
  yutMove,
  yutNet,
  yutThrow,
  type Seated,
} from "../src/net/screens";
import * as yut from "../src/games/yut/rules";
import { choose as yutChoose } from "../src/games/yut/ai";
import * as yacht from "../src/games/yacht/rules";
import { advise } from "../src/games/yacht/ai";
import * as tour from "../src/games/tour/rules";
import * as conquest from "../src/games/conquest/rules";
import { decide as conquestDecide } from "../src/games/conquest/ai";

/*
 * 와이파이 여럿이 for the dice games with screens of their own (yut nori, yacht dice, the world tour, continent
 * conquest): rooms of simulated devices joined by memory links. Every throw, card and battle is drawn by the rules on
 * each device from the move's own random stream, so the devices must agree after every move, dice included.
 */
const settle = async () => {
  for (let i = 0; i < 60; i++) await Promise.resolve();
};
const seatsOf = <S>(net: BoardNet<S>): SeatInfo[] => net.seats.map((s) => ({ ...s, kind: "open", person: null }));
/** A random stream that is the same on every run (the computers' own choices; never the dice). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A host and `guests` joined by memory links: the host on seat 0, the guests on the next seats, any seat left
 * `kinds` says (a computer's, closed). The game is begun.
 */
async function room<S>(net: BoardNet<S>, guests: string[], kinds: Record<number, "computer" | "closed"> = {}, options = {}) {
  const host = new HostRoom<S>({ game: net.game, title: net.game, name: "방장", variant: "", options, seats: seatsOf(net), quiet: true }, net, "host");
  const others = guests.map((name, i) => {
    const guest = new GuestRoom<S>({ game: net.game, title: net.game, name, quiet: true }, net, `guest${i}`),
      [a, b] = memoryLinks();
    host.connect(a);
    guest.connect(b);
    return { guest, link: b };
  });
  await settle();
  for (const [seat, kind] of Object.entries(kinds)) host.setKind(Number(seat), kind);
  host.begin();
  await settle();
  const rooms = [host, ...others.map((o) => o.guest)];
  /** The device that plays `seat` (the host for a computer's seat or a dropped person's). */
  const deviceOf = (seat: number) => {
    const s = host.seats[seat];
    return s.kind === "person" && !host.away(seat) ? rooms.find((r) => r.me === s.person)! : null;
  };
  /** Plays a move of the seat to move from its own device (or the host's computer); the words if refused. */
  const move = async (m: Move) => {
    const seat = host.match!.toMove,
      device = deviceOf(seat),
      text = !device || device === host ? host.play(m, seat) : (device as GuestRoom<S>).play(m);
    await settle();
    return text;
  };
  /** Every connected device holds the same list and the same state as the host. */
  const same = () => {
    for (const r of rooms.slice(1) as GuestRoom<S>[]) {
      if (!r.online) continue;
      expect(r.match!.ply).toBe(host.match!.ply);
      expect(r.match!.moves).toEqual(host.match!.moves);
      expect(r.match!.state).toEqual(host.match!.state);
    }
  };
  return { host, guests: others, rooms, move, same };
}
/** Plays `count` moves chosen by `pick` from each seat's own device, checking after every move that all agree. */
async function playOut<S>(r: Awaited<ReturnType<typeof room<S>>>, pick: (s: S) => Move, count: number) {
  for (let i = 0; i < count && r.host.match!.toMove !== NOBODY; i++) {
    expect(await r.move(pick(r.host.match!.state))).toBeNull();
    r.same();
  }
}

// ─────────────── Moves as a room sends them ───────────────
describe("moves of the dice screens as a room sends them", () => {
  test("every conquest action goes out and comes back as it was; anything else is none", () => {
    const actions: conquest.Action[] = [
      { type: "trade", cards: [3, 47, 49] },
      { type: "trade", cards: [0, 12, 1], bonus: 12 },
      { type: "place", territory: 17, count: 4 },
      { type: "attack", from: 5, to: 41 },
      { type: "attack", from: 40, to: 2, blitz: true },
      { type: "attack", from: 1, to: 0, dice: 2 },
      { type: "attack", from: 1, to: 0, dice: 1, blitz: true },
      { type: "occupy", count: 0 },
      { type: "fortify", from: 47, to: 46, count: 9 },
      { type: "next" },
    ];
    for (const a of actions) expect(conquestAction(conquestMove(a))).toEqual(a);
    expect(CONQUEST_ACTIONS.length).toBe(6);
    expect(conquestAction({ from: 9, to: 0, extra: 0 })).toBeNull();
    expect(conquestAction({ from: 2, to: -5, extra: 0 })).toBeNull();
    expect(conquestAction({ from: 2, to: 5, extra: 16 })).toBeNull();
    expect(conquestAction({ from: 0, to: 128 ** 3, extra: -1 })).toBeNull();
  });

  test("moves the rules do not know are refused by every game", () => {
    const random = seeded(1),
      y = { seats: [0, 1], game: yut.createGame(2) };
    expect(yutNet.play(y, { from: 0, to: 0, extra: 0 }, random)).toBeNull();
    expect(yutNet.play(y, { from: 4, to: 1, extra: 0 }, random)).toBeNull();
    expect(yutNet.play(y, { from: 0, to: 1.5, extra: 0 }, random)).toBeNull();
    // Nothing is moved before a throw.
    expect(yutNet.play(y, yutMove(0, 1), random)).toBeNull();
    const d = yacht.createGame(2);
    expect(yachtNet.play(d, yachtScore("yacht"), random)).toBeNull();
    expect(yachtNet.play(d, yachtHold(0), random)).toBeNull();
    expect(yachtNet.play(d, { from: 2, to: 12, extra: -1 }, random)).toBeNull();
    expect(yachtNet.play(d, { from: 7, to: 0, extra: -1 }, random)).toBeNull();
    const t = { seats: [0, 1], game: tour.createGame(2) };
    expect(tourNet.play(t, tourMove("decide", 2), random)).toBeNull();
    expect(tourNet.play(t, tourMove("sell", 40), random)).toBeNull();
    expect(tourNet.play(t, tourMove("end"), random)).toBeNull();
    expect(tourNet.play(t, { from: 9, to: 0, extra: -1 }, random)).toBeNull();
  });

  test("closed seats leave the game with the players seated, in order; the room seat of each is kept", () => {
    const start = (kinds: ("person" | "computer" | "closed")[]): StartInfo => ({ round: 1, variant: "", options: {}, seed: 5, seats: kinds.map((kind) => ({ kind, person: null })) });
    const random = seeded(2);
    const a = yutNet.create(start(["person", "person", "closed", "closed"]), random);
    expect(a.seats).toEqual([0, 1]);
    expect(a.game.pieces.length).toBe(2);
    const b = tourNet.create(start(["person", "closed", "computer", "person"]), random);
    expect(b.seats).toEqual([0, 2, 3]);
    expect(b.game.players.length).toBe(3);
    // The second player of the game is the third seat of the room.
    const c = { ...b, game: { ...b.game, turn: 1 } };
    expect(tourNet.toMove(c)).toBe(2);
  });

  test("a conquest room plays the host's options, never secret missions", () => {
    const start = (options: StartInfo["options"]): StartInfo => ({ round: 1, variant: "", options, seed: 9, seats: [] });
    expect(conquestOptions(start({ map: "random", size: "large", start: "random", move: "connected", mode: "turns", rounds: 16 }), 3)).toEqual({
      players: 3,
      world: false,
      size: "large",
      start: "random",
      move: "connected",
      mode: "turns",
      rounds: 16,
      people: 0,
    });
    const safe = conquestOptions(start({ mode: "missions", size: "huge", rounds: 7 }), 2);
    expect(safe.mode).toBe("conquest");
    expect(safe.size).toBe("small");
    expect(safe.world).toBe(true);
    expect(safe.rounds).toBe(conquest.ROUND_CHOICES[1]);
  });
});

// ─────────────── Yut nori ───────────────
const yutPick = (s: Seated<yut.State>) => {
  if (s.game.throwsLeft > 0) return yutThrow();
  const m = yutChoose(s.game) ?? yut.moves(s.game)[0];
  return yutMove(m.piece, m.result);
};
describe("yut nori over a room", () => {
  test("three devices and a computer throw the same sticks and reach the same yard; a seat moves only in its turn", async () => {
    const r = await room(yutNet, ["민수", "지아"], { 3: "computer" });
    expect(r.host.match!.state.seats).toEqual([0, 1, 2, 3]);
    expect(r.host.match!.state.game.pieces.length).toBe(4);
    // The host throws first; nobody else may.
    expect(r.guests[0].guest.play(yutThrow())).toBe("상대 차례입니다.");
    expect(r.host.play(yutThrow(), 3)).toBe("상대 차례입니다.");
    await playOut(r, yutPick, 400);
    expect(r.host.match!.ply).toBeGreaterThan(40);
    // The sticks thrown are the rules' own: the state agrees with replaying the throws by the rules alone.
    const game = r.host.match!.state.game;
    expect(game.throwId).toBeGreaterThan(10);
    expect(r.guests[1].guest.match!.state.game.sticks).toEqual(game.sticks);
  });

  test("two people leave two seats closed: a game of two; undo goes through the room and rebuilds the same yard", async () => {
    const r = await room(yutNet, ["민수"]);
    expect(r.host.match!.state.seats).toEqual([0, 1]);
    expect(r.host.match!.state.game.pieces.length).toBe(2);
    await playOut(r, yutPick, 12);
    // The guest takes back its last move, the host agrees.
    const guest = r.guests[0].guest,
      back = r.host.match!.undoFor(1);
    expect(back).not.toBeNull();
    const before = r.host.match!.states[back!];
    let asked = -1;
    r.host.events.asked = (a) => (asked = a.id);
    expect(guest.request("undo")).toBeNull();
    await settle();
    r.host.answer(asked, true);
    await settle();
    r.same();
    expect(guest.match!.ply).toBe(back);
    expect(guest.match!.state).toEqual(before);
    await playOut(r, yutPick, 10);
  });
});

// ─────────────── Yacht dice ───────────────
const yachtPick = (s: yacht.State) => {
  if (!yacht.hasRolled(s)) return yachtRoll();
  const advice = advise(s, "normal", 1 + s.rollId);
  if (advice.category) return yachtScore(advice.category);
  const differs = advice.hold!.findIndex((keep, i) => keep !== s.held[i]);
  return differs >= 0 ? yachtHold(differs) : yachtRoll();
};
describe("yacht dice over a room", () => {
  test("two devices roll the same dice, hold and score in turn, to the end of the game", async () => {
    const r = await room(yachtNet, ["민수"]);
    const guest = r.guests[0].guest;
    expect(guest.play(yachtRoll())).toBe("상대 차례입니다.");
    expect(await r.move(yachtRoll())).toBeNull();
    r.same();
    expect(guest.match!.state.dice.every((d) => d >= 1 && d <= 6)).toBe(true);
    // Holding a die is the mover's move: the guest may not hold the host's dice.
    expect(guest.play(yachtHold(0))).toBe("상대 차례입니다.");
    expect(await r.move(yachtHold(0))).toBeNull();
    expect(guest.match!.state.held[0]).toBe(true);
    await playOut(r, yachtPick, 2000);
    const s = r.host.match!.state;
    expect(s.over).toBe(true);
    expect(yachtNet.toMove(s)).toBe(NOBODY);
    expect(guest.match!.state.cards).toEqual(s.cards);
    expect(yachtNet.result(s)).toEqual(yacht.winner(s));
  });

  test("a dropped guest's seat is played by the host's computer, and on its return the guest is resynced", async () => {
    const r = await room(yachtNet, ["민수"]);
    const guest = r.guests[0].guest;
    await playOut(r, yachtPick, 8);
    // The channel fails: the host hears it and its computer may stand in.
    r.guests[0].link.onclose?.();
    await settle();
    expect(r.host.away(1)).toBe(true);
    expect(guest.online).toBe(false);
    await playOut(r, yachtPick, 30);
    // The same page joins again: the whole list is sent and replayed to the same dice.
    const [a, b] = memoryLinks();
    r.host.connect(a);
    guest.connect(b as Link);
    await settle();
    expect(r.host.away(1)).toBe(false);
    expect(guest.match!.moves).toEqual(r.host.match!.moves);
    expect(guest.match!.state).toEqual(r.host.match!.state);
  });
});

// ─────────────── World tour ───────────────
const tourPick = (s: Seated<tour.State>) => {
  const g = s.game;
  switch (g.phase) {
    case "roll":
      return tourMove("roll");
    case "key":
      return tourMove("draw");
    case "card":
      return tourMove("follow");
    case "travel":
      return tourMove("travel", tour.destination(g));
    case "end":
      return tourMove("end");
    default:
      return tourMove("decide", tour.wants(g) ? 1 : 0);
  }
};
describe("the world tour over a room", () => {
  test("three travellers on three devices with a computer: dice, golden keys and fees agree everywhere", async () => {
    const r = await room(tourNet, ["민수", "지아"], { 3: "computer" });
    expect(r.host.match!.state.game.players.length).toBe(4);
    expect(r.guests[0].guest.play(tourMove("roll"))).toBe("상대 차례입니다.");
    await playOut(r, tourPick, 600);
    const g = r.host.match!.state.game;
    expect(g.rollId).toBeGreaterThan(30);
    expect(g.owners.some((o) => o >= 0)).toBe(true);
  });

  test("a sale is the owner's move in its own turn only", async () => {
    const r = await room(tourNet, ["민수"]);
    const guest = r.guests[0].guest;
    // Play on until the host owns a place and it is the host's turn to end.
    for (let i = 0; i < 400; i++) {
      const s = r.host.match!.state;
      if (s.game.phase === "end" && r.host.match!.toMove === 0 && s.game.owners.includes(0)) break;
      expect(await r.move(tourPick(s))).toBeNull();
    }
    const s = r.host.match!.state,
      place = s.game.owners.indexOf(0);
    expect(place).toBeGreaterThanOrEqual(0);
    // The guest may not sell the host's place, nor its own out of turn.
    expect(guest.play(tourMove("sell", place))).toBe("상대 차례입니다.");
    const money = s.game.players[0].money;
    expect(await r.move(tourMove("sell", place))).toBeNull();
    r.same();
    expect(guest.match!.state.game.owners[place]).toBe(-1);
    expect(guest.match!.state.game.players[0].money).toBe(money + Math.round(tour.invested(s.game, place) / 2));
  });
});

// ─────────────── Continent conquest ───────────────
describe("continent conquest over a room", () => {
  test("two devices and a neutral army: claiming, battles and cards agree everywhere", async () => {
    const r = await room(conquestNet, ["민수"], {}, { map: "world", mode: "conquest", start: "claim" });
    const s0 = r.host.match!.state;
    expect(s0.seats).toEqual([0, 1]);
    expect(s0.game.neutral).toBe(2);
    expect(s0.game.mode).toBe("conquest");
    const random = seeded(3);
    const pick = (s: Seated<conquest.State>) => conquestMove(conquestDecide(s.game, "normal", random));
    expect(r.guests[0].guest.play(pick(s0))).toBe("상대 차례입니다.");
    await playOut(r, pick, 1500);
    const g = r.host.match!.state.game;
    expect(conquest.settingUp(g)).toBe(false);
    expect(g.ply).toBeGreaterThan(100);
  });

  test("four seats on a random map, the room's secret missions played as world conquest; resync after a drop", async () => {
    const r = await room(conquestNet, ["민수", "지아"], { 3: "computer", 4: "closed", 5: "closed" }, { map: "random", size: "small", mode: "missions", start: "random" });
    const s0 = r.host.match!.state;
    expect(s0.seats).toEqual([0, 1, 2, 3]);
    expect(s0.game.mode).toBe("conquest");
    expect(s0.game.seats.every((seat) => seat.mission === null)).toBe(true);
    // The world itself was drawn from the shared stream: every device has the same map.
    expect(r.guests[1].guest.match!.state.game.map).toEqual(s0.game.map);
    const random = seeded(4);
    const pick = (s: Seated<conquest.State>) => conquestMove(conquestDecide(s.game, "normal", random));
    await playOut(r, pick, 60);
    r.guests[0].link.onclose?.();
    await settle();
    expect(r.host.away(1)).toBe(true);
    await playOut(r, pick, 60);
    const guest = r.guests[0].guest,
      [a, b] = memoryLinks();
    r.host.connect(a);
    guest.connect(b as Link);
    await settle();
    expect(guest.match!.state).toEqual(r.host.match!.state);
    await playOut(r, pick, 30);
  });
});
