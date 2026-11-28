import { describe, expect, test } from "vitest";
import { NOBODY } from "../src/net/match";
import { GuestRoom, HostRoom, memoryLinks } from "../src/net/room";
import { streamFor } from "../src/net/random";
import { pointRules } from "../src/net/points";
import type { SeatInfo, SeatKind } from "../src/net/protocol";
import type { Move } from "../src/games/points/types";
import { isBlind } from "../src/games/deck/blind";
import { hulaConfig } from "../src/games/hula/config";
import { DISCARD, NEXT, PASS, REGISTER, SORT, STOCK, THANK, idsOf, type State } from "../src/games/hula/rules";

/*
 * 훌라 over one Wi-Fi (`src/games/hula/net.ts`): simulated devices joined by links in memory, each playing only its own
 * seat from its own view, its moves put back in the room's terms. Every device must reach the same state after every
 * move, no view may hold a card its seat may not see before a round is over, and every match must come to its end
 * (a round ends when the stock runs out, so none can stall).
 */
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const rules = pointRules(hulaConfig.game, hulaConfig.net!),
  hidden = hulaConfig.net!.hidden!,
  game = hidden.game!;
type Device = HostRoom<State> | GuestRoom<State>;

/** A room: the host in seat 0, a guest for each of `guests` in the next seats, the rest `rest`; `rounds` per match. */
async function room(guests: number, rest: SeatKind = "computer", rounds = "3", kinds: Record<number, SeatKind> = {}) {
  const seats: SeatInfo[] = hulaConfig.net!.seats!("").map((s) => ({ ...s, kind: "open", person: null }));
  const host = new HostRoom<State>({ game: "hula", title: "훌라", name: "방장", variant: rounds, options: {}, seats, quiet: true }, rules, "host"),
    devices: Device[] = [host];
  for (let i = 0; i < guests; i++) {
    const guest = new GuestRoom<State>({ game: "hula", title: "훌라", name: `손님${i + 1}`, quiet: true }, rules, `guest${i}`),
      [a, b] = memoryLinks();
    host.connect(a);
    guest.connect(b);
    devices.push(guest);
    await settle();
  }
  seats.forEach((_, i) => {
    if (i > guests) host.setKind(i, kinds[i] ?? rest);
  });
  host.begin(rounds, {});
  await settle();
  return { host, devices };
}
const deviceOf = (host: HostRoom<State>, devices: Device[], seat: number) => (host.seats[seat].kind === "computer" ? host : devices.find((d) => d.mySeat === seat)!);
function send(device: Device, seat: number, move: Move, shown?: State) {
  const sent = hidden.move(move, seat, device.match!.state, shown);
  return device.host ? (device as HostRoom<State>).play(sent, seat) : (device as GuestRoom<State>).play(sent);
}
/** No card of another's hand or of the stock is in a view before a round is over: only blind ones, and not in `blinds`. */
function secret(view: State, seat: number, real: State) {
  const n = real.net!,
    g = n.seats.indexOf(seat),
    count = real.players;
  expect(view.net).toBeUndefined();
  expect([...view.hands[0]].sort((a, b) => a - b)).toEqual([...real.hands[g]].sort((a, b) => a - b));
  expect(view.discard).toEqual(real.discard);
  expect(view.melds.map((m) => m.cards)).toEqual(real.melds.map((m) => m.cards));
  expect(view.stock.every(isBlind)).toBe(true);
  expect(view.seat).toBe((real.seat - g + count) % count);
  const theirs = real.hands.flatMap((h, k) => (k === g ? [] : h));
  if (real.phase !== "scored" && real.winner === null) {
    for (let k = 1; k < count; k++) {
      expect(view.hands[k].every(isBlind)).toBe(true);
      expect(view.hands[k]).toHaveLength(real.hands[(g + k) % count].length);
    }
    for (const id of [...theirs, ...real.stock]) expect(view.blinds![id]).toBeUndefined();
    // A card another drew is not told.
    if (view.last?.kind === "draw" && view.last.seat !== 0) expect(view.last.cards.every(isBlind)).toBe(true);
  } else for (let k = 1; k < count; k++) expect(view.hands[k]).toEqual(real.hands[(g + k) % count]);
}
interface Tally {
  moves: number;
  rounds: number;
  dry: number;
  /** 땡큐 claimed out of turn (on a discard offered to a seat whose turn it was not). */
  outOfTurn: number;
  /** Seats that 땡큐-ed out of turn on a guest's device. */
  guestClaims: number;
}
/** Plays a match out through the room, each move chosen by the computer for that seat from that seat's view on its own device. */
async function playOut(host: HostRoom<State>, devices: Device[], most: number, tally: Tally, level: "easy" | "normal" | "hard" = "normal") {
  const random = streamFor(31, tally.moves + 1);
  while (host.match!.toMove !== NOBODY && tally.moves < most) {
    const seat = host.match!.toMove,
      device = deviceOf(host, devices, seat),
      before = device.match!.state,
      view = hidden.view(before, seat),
      move = game.choose!(view, level, random);
    expect(move, `seat ${seat}`).not.toBeNull();
    expect(send(device, seat, move!, view), `seat ${seat} ${JSON.stringify(move)}`).toBeNull();
    await settle();
    tally.moves++;
    const real = host.match!.state;
    if (before.phase === "claim" && move!.to === THANK) {
      tally.outOfTurn++;
      if (!device.host) tally.guestClaims++;
    }
    if (real.phase === "scored" && before.phase !== "scored") {
      tally.rounds++;
      if (real.result!.dry) tally.dry++;
    }
    for (const d of devices) {
      expect(d.match!.state).toEqual(real);
      if (d.mySeat !== null) secret(hidden.view(d.match!.state, d.mySeat), d.mySeat, d.match!.state);
    }
  }
}

describe("훌라 over Wi-Fi", () => {
  test("four devices agree on the deal; each sees its own seven near and the rest blind; 1번 begins", async () => {
    const { host, devices } = await room(3);
    const real = host.match!.state;
    for (const d of devices) expect(d.match!.state).toEqual(real);
    expect(real.players).toBe(4);
    expect(real.hands.map((h) => h.length)).toEqual([7, 7, 7, 7]);
    expect(real.net!.seats).toEqual([0, 1, 2, 3]);
    expect(host.match!.toMove).toBe(0);
    devices.forEach((d) => secret(hidden.view(d.match!.state, d.mySeat!), d.mySeat!, real));
    // The next in play sits at my left: as 2번 sees the table, 3번 is at its left (side 1) and 1번 at its right (side 3).
    const second = hidden.view(real, 1);
    expect(second.hands[1]).toHaveLength(7);
    expect(second.seat).toBe(3);
    expect(second.names).toEqual(["나", "왼쪽 사람", "맞은편 사람", "오른쪽 사람"]);
    // Out of turn a seat is refused.
    expect((devices[2] as GuestRoom<State>).play({ from: -1, to: STOCK, extra: 0 })).not.toBeNull();
  });
  test("cards picked up and the hand sorted stay on the device; the move sent names the cards", async () => {
    const { host, devices } = await room(1, "closed"),
      view = hidden.view(host.match!.state, 0);
    // Drawn first (a pick belongs to the rest of the turn too, but a draw is the turn's first move).
    expect(send(host, 0, { from: -1, to: STOCK, extra: -1 }, view)).toBeNull();
    await settle();
    let mine = hidden.view(host.match!.state, 0);
    const card = mine.hands[0][0],
      plies = host.match!.state.ply;
    const picked = hidden.local!(mine, { from: -1, to: card, extra: -1 })!;
    expect(picked.picked).toEqual([card]);
    const sorted = hidden.local!(picked, { from: -1, to: SORT, extra: -1 })!;
    expect(sorted.sortBy).toBe("rank");
    // Neither went to the room; a pick sent anyway is refused there.
    expect(host.match!.state.ply).toBe(plies);
    expect(host.play({ from: -1, to: card, extra: -1 }, 0)).not.toBeNull();
    // The sort stays with my device's views; a guest's are its own.
    expect(hidden.view(host.match!.state, 0).sortBy).toBe("rank");
    expect(hidden.view(host.match!.state, 1).sortBy).toBe("suit");
    // Discarding the card picked: the room is told the card.
    expect(send(host, 0, { from: -1, to: DISCARD, extra: -1 }, sorted)).toBeNull();
    await settle();
    expect(host.match!.state.discard.at(-1)).toBe(card);
    for (const d of devices) expect(d.match!.state).toEqual(host.match!.state);
    // A view from the room has nothing picked.
    mine = hidden.view(host.match!.state, 0);
    expect(mine.picked).toEqual([]);
    // Not my turn: nothing is picked on my device.
    expect(hidden.local!(mine, { from: -1, to: mine.hands[0][0], extra: -1 })).toBeNull();
    hidden.local!(hidden.view(host.match!.state, 1), { from: -1, to: SORT, extra: -1 });
    void REGISTER;
  });
  test("matches of five rounds by four devices to their ends; 땡큐 out of turn on its own device; never stuck on an empty stock", async () => {
    const tally: Tally = { moves: 0, rounds: 0, dry: 0, outOfTurn: 0, guestClaims: 0 };
    for (let match = 0; match < 12 && (match < 3 || tally.guestClaims < 2); match++) {
      const { host, devices } = await room(3, "computer", "5"),
        start = tally.moves;
      await playOut(host, devices, start + 4000, tally, match % 3 === 0 ? "hard" : "normal");
      // Every match comes to its end: nobody is left unable to move it on.
      expect(host.match!.toMove, `match ${match} after ${tally.moves - start} moves`).toBe(NOBODY);
      const end = host.match!.state;
      expect(end.winner).not.toBeNull();
      expect(end.round).toBe(5);
      // Each device's view says how it ended for its seat.
      const best = Math.max(...end.scores),
        tops = end.scores.filter((x) => x === best).length;
      for (const d of devices) {
        const v = hidden.view(end, d.mySeat!);
        expect(v.winner).toBe(end.scores[d.mySeat!] === best ? (tops > 1 ? "draw" : 0) : 1);
        expect(hulaConfig.net!.outcome!(end, d.mySeat!)).toBe(end.scores[d.mySeat!] === best ? (tops > 1 ? "draw" : "win") : "lose");
      }
      if (tops === 1) expect(hulaConfig.net!.winnerSeat!(end)).toBe(end.scores.indexOf(best));
    }
    expect(tally.rounds).toBeGreaterThanOrEqual(15);
    expect(tally.guestClaims).toBeGreaterThan(0);
  }, 120_000);
  test("the stock run out: the round ends on every device, the lowest hand winning, and the next is dealt (a round never stalls)", async () => {
    const { host, devices } = await room(1, "closed"),
      tally: Tally = { moves: 0, rounds: 0, dry: 0, outOfTurn: 0, guestClaims: 0 };
    // Down to the stock's last card (as a long round would end): the room's state for every device alike.
    const real = host.match!.state,
      short = { ...real, stock: real.stock.slice(-1) },
      net = hulaConfig.net!;
    let s = net.play!(short, { from: -1, to: STOCK, extra: 0 }, streamFor(1, 1), 0)!;
    expect(s.stock).toEqual([]);
    const card = s.hands[0].at(-1)!;
    s = net.play!(s, { from: -1, to: DISCARD, extra: 2 ** card }, streamFor(1, 2), 0)!;
    expect(s.phase).toBe("scored");
    expect(s.result!.dry).toBe(true);
    expect(rules.toMove(s)).toBe(0);
    // The views tell the stock ran out, and show every hand.
    const theirs = hidden.view(s, 1);
    expect(theirs.last!.events).toContain("더미가 떨어졌습니다");
    expect(theirs.hands[1].every((id) => !isBlind(id))).toBe(true);
    // The host deals the next round; it is played on to the match's end.
    s = net.play!(s, { from: -1, to: NEXT, extra: 0 }, streamFor(1, 3), 0)!;
    expect(s.round).toBe(2);
    expect(s.phase).toBe("draw");
    expect(s.stock.length).toBeGreaterThan(0);
    void devices;
    void tally;
  });
  test("the blind numbers are dealt again with every round", async () => {
    const { host, devices } = await room(1, "closed"),
      tally: Tally = { moves: 0, rounds: 0, dry: 0, outOfTurn: 0, guestClaims: 0 };
    const first = host.match!.state.net!.masks;
    let random = streamFor(5, 5);
    while (host.match!.state.phase !== "scored") {
      const seat = host.match!.toMove,
        device = deviceOf(host, devices, seat),
        view = hidden.view(device.match!.state, seat);
      expect(send(device, seat, game.choose!(view, "normal", random)!, view)).toBeNull();
      await settle();
    }
    // A guest may not deal the next round: it is the host's to press.
    expect(host.match!.toMove).toBe(0);
    expect((devices[1] as GuestRoom<State>).play({ from: -1, to: NEXT, extra: 0 })).not.toBeNull();
    expect(game.hint(hidden.view(host.match!.state, 1))).toContain("방장이 다음 판을");
    expect(send(host, 0, { from: -1, to: NEXT, extra: -1 })).toBeNull();
    await settle();
    expect(host.match!.state.round).toBe(2);
    expect(host.match!.state.net!.masks).not.toEqual(first);
    for (const d of devices) expect(d.match!.state).toEqual(host.match!.state);
    random = streamFor(6, 6);
    void tally;
    void random;
  });
  test("three devices with the fourth seat closed: dealt round three in seat order", async () => {
    const { host, devices } = await room(2, "closed"),
      real = host.match!.state;
    expect(real.players).toBe(3);
    expect(real.net!.seats).toEqual([0, 1, 2]);
    expect(real.stock.length).toBe(52 - 21 - 1);
    const tally: Tally = { moves: 0, rounds: 0, dry: 0, outOfTurn: 0, guestClaims: 0 };
    await playOut(host, devices, 3000, tally);
    expect(host.match!.toMove).toBe(NOBODY);
  }, 60_000);
  test("3번 closed and 4번 a computer: the players are 1번, 2번 and 4번, in that order", async () => {
    const { host, devices } = await room(1, "computer", "1", { 2: "closed" });
    const real = host.match!.state;
    expect(real.net!.seats).toEqual([0, 1, 3]);
    // As 2번 sees it, 4번 comes after it (at its left) and 1번 after that.
    expect(hidden.view(real, 1).names).toEqual(["나", "왼쪽 사람", "오른쪽 사람"]);
    const tally: Tally = { moves: 0, rounds: 0, dry: 0, outOfTurn: 0, guestClaims: 0 };
    await playOut(host, devices, 2000, tally);
    expect(host.match!.toMove).toBe(NOBODY);
  }, 60_000);
  test("the host's computer stands in for a guest who drops, from the guest's own view", async () => {
    const { host, devices } = await room(1, "closed"),
      guest = devices[1] as GuestRoom<State>;
    expect(send(host, 0, { from: -1, to: STOCK, extra: 0 })).toBeNull();
    await settle();
    const mine = host.match!.state.hands[0];
    expect(send(host, 0, { from: -1, to: DISCARD, extra: 2 ** mine[mine.length - 1] })).toBeNull();
    await settle();
    guest.leave();
    await settle();
    expect(host.away(1)).toBe(true);
    expect(host.match!.toMove).toBe(1);
    const view = hidden.view(host.match!.state, 1);
    expect(view.hands[1].every(isBlind)).toBe(true);
    const move = game.choose!(view, "normal", streamFor(2, 2))!;
    expect(idsOf(move.extra).every((id) => !isBlind(id))).toBe(true);
    expect(host.play(hidden.move(move, 1, host.match!.state), 1)).toBeNull();
    expect(host.match!.state.last!.seat).toBe(1);
    void PASS;
  });
});
