import { describe, expect, test } from "vitest";
import { NOBODY, type NetRules } from "../src/net/match";
import { GuestRoom, HostRoom, memoryLinks } from "../src/net/room";
import { streamFor } from "../src/net/random";
import { pointRules } from "../src/net/points";
import type { HiddenView } from "../src/net/hidden";
import type { SeatInfo, SeatKind } from "../src/net/protocol";
import type { PointConfig } from "../src/ui/point-game";
import type { Move } from "../src/games/points/types";
import { BLIND, isBlind } from "../src/games/deck/blind";
import { oneCardConfig } from "../src/games/onecard/config";
import { BUST, DRAW, SEATS as ONE_SEATS, type State as OneState } from "../src/games/onecard/rules";
import { netBust } from "../src/games/onecard/net";
import { oldMaidConfig } from "../src/games/oldmaid/config";
import { JOKER, source, type State as MaidState } from "../src/games/oldmaid/rules";
import { indianConfig } from "../src/games/indian/config";
import { CALL, DECIDE, NEXT, READY, UP, type State as IndianState } from "../src/games/indian/rules";
import { gostopConfig } from "../src/games/gostop/config";
import { CARDS, GO, STOP, YES, type State as GoState } from "../src/games/gostop/rules";

/*
 * 와이파이 여럿이 for the card games with hidden hands (`src/net/hidden.ts`, `src/games/deck/blind.ts`): one card, old
 * maid, Indian poker and go-stop. Simulated devices joined by links in memory, each playing only its own seat from its
 * own view, its moves put back in the room's terms. Every device must reach the same state, and no view may hold a
 * card its seat may not see (in Indian poker: exactly its own).
 */
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const rulesOf = <S>(config: PointConfig<S>): NetRules<S> => pointRules(config.game, config.net!);
const hiddenOf = <S>(config: PointConfig<S>): HiddenView<S> => config.net!.hidden!;
type Device<S> = HostRoom<S> | GuestRoom<S>;

/** A room of the game: the host in seat 0, one guest a seat after it for each name, the rest of the seats as `rest`. */
async function room<S>(config: PointConfig<S>, guests: number, rest: SeatKind = "computer") {
  const seats: SeatInfo[] = config.net!.seats!("").map((s) => ({ ...s, kind: "open", person: null }));
  const rules = rulesOf(config),
    host = new HostRoom({ game: "g", title: "g", name: "방장", variant: "", options: {}, seats, quiet: true }, rules, "host"),
    devices: Device<S>[] = [host];
  for (let i = 0; i < guests; i++) {
    const guest = new GuestRoom<S>({ game: "g", title: "g", name: `손님${i + 1}`, quiet: true }, rules, `guest${i}`),
      [a, b] = memoryLinks();
    host.connect(a);
    guest.connect(b);
    devices.push(guest);
    await settle();
  }
  seats.forEach((_, i) => {
    if (i > guests) host.setKind(i, rest);
  });
  host.begin("", {});
  await settle();
  return { host, devices };
}
const deviceOf = <S>(host: HostRoom<S>, devices: Device<S>[], seat: number) => (host.seats[seat].kind === "computer" ? host : devices.find((d) => d.mySeat === seat)!);
function send<S>(config: PointConfig<S>, device: Device<S>, seat: number, move: Move) {
  const sent = hiddenOf(config).move(move, seat, device.match!.state);
  return device.host ? (device as HostRoom<S>).play(sent, seat) : (device as GuestRoom<S>).play(sent);
}
/**
 * Plays the game out through the room, each move chosen by the game's computer for that seat from that seat's view
 * on its own device; after each move every device holds the same state and `watch` sees every device's view.
 */
async function playOut<S>(config: PointConfig<S>, host: HostRoom<S>, devices: Device<S>[], most: number, watch: (view: S, seat: number, real: S) => void) {
  const hidden = hiddenOf(config),
    game = hidden.game ?? config.game,
    random = streamFor(17, 3);
  let moves = 0;
  while (host.match!.toMove !== NOBODY && moves < most) {
    const seat = host.match!.toMove,
      device = deviceOf(host, devices, seat),
      view = hidden.view(device.match!.state, seat),
      move = game.choose!(view, "normal", random);
    expect(move, `seat ${seat}`).not.toBeNull();
    expect(send(config, device, seat, move!)).toBeNull();
    await settle();
    moves++;
    for (const d of devices) {
      expect(d.match!.state).toEqual(host.match!.state);
      if (d.mySeat !== null) watch(hidden.view(d.match!.state, d.mySeat), d.mySeat, d.match!.state);
    }
  }
  return moves;
}
const allBlind = (ids: number[]) => ids.every(isBlind);

describe("원카드 over Wi-Fi", () => {
  const hidden = hiddenOf(oneCardConfig);
  /** No card of another's hand or of the pile is in a view before the end: only blind ones, and not in `blinds`. */
  function secret(view: OneState, seat: number, real: OneState) {
    expect(view.hands[0]).toEqual(real.hands[seat]);
    expect(view.discard).toEqual(real.discard);
    expect(allBlind(view.pile)).toBe(true);
    expect(view.pile).toHaveLength(real.pile.length);
    const theirs = real.hands.flatMap((h, k) => (k === seat ? [] : h));
    if (real.winner === null) {
      for (let k = 1; k < ONE_SEATS; k++) expect(allBlind(view.hands[k])).toBe(true);
      for (const id of [...theirs, ...real.pile]) expect(view.blinds![id]).toBeUndefined();
      if (view.last && view.last.seat !== 0) expect(view.last.drew.every((id) => isBlind(id) || view.discard.includes(id))).toBe(true);
    } else for (let k = 1; k < ONE_SEATS; k++) expect(view.hands[k]).toEqual(real.hands[(seat + k) % ONE_SEATS]);
    expect(view.net).toBeUndefined();
    // The seat to move as this seat sees it.
    expect(view.seat).toBe((real.seat - seat + ONE_SEATS) % ONE_SEATS);
  }
  test("four devices agree on the deal; each sees its own seven near and the rest blind; 1번 plays first", async () => {
    const { host, devices } = await room(oneCardConfig, 3);
    const real = host.match!.state;
    for (const d of devices) expect(d.match!.state).toEqual(real);
    expect(real.hands.map((h) => h.length)).toEqual([7, 7, 7, 7]);
    expect(host.match!.toMove).toBe(0);
    devices.forEach((d) => secret(hidden.view(d.match!.state, d.mySeat!), d.mySeat!, real));
    // The next seat in play sits at my left: as 2번 sees the bed, 3번 is at its left and 1번 at its right.
    const second = hidden.view(real, 1);
    expect(second.hands[1].length).toBe(real.hands[2].length);
    expect(second.hands[3].length).toBe(real.hands[0].length);
    expect(second.seat).toBe(3);
    // Out of turn a seat is refused.
    expect((devices[2] as GuestRoom<OneState>).play({ from: -1, to: DRAW, extra: -1 })).not.toBeNull();
  });
  test("the pile run out over Wi-Fi: the discards are turned over and the game goes on on every device, to its end (the user found it stuck)", async () => {
    let turnedOver = 0,
      dry = 0;
    for (let round = 0; round < 12 && (turnedOver < 3 || round < 4); round++) {
      const { host, devices } = await room(oneCardConfig, 3);
      let before = host.match!.state;
      const moves = await playOut(oneCardConfig, host, devices, 3000, (view, seat, real) => {
        secret(view, seat, real);
        if (seat !== 0 || real === before) return;
        // The pile grew without a seat going out: the discards were turned over into a new one.
        if (real.pile.length > before.pile.length && real.out.filter(Boolean).length === before.out.filter(Boolean).length) turnedOver++;
        if (!real.pile.length && real.discard.length <= 1) dry++;
        before = real;
      });
      // Every game comes to its end: nobody is left unable to move it on.
      expect(host.match!.toMove, `round ${round} after ${moves} moves`).toBe(NOBODY);
    }
    expect(turnedOver).toBeGreaterThan(0);
    void dry;
  });
  test("played out by three devices and a computer, each from its own view; turns go round in the room's order", async () => {
    const { host, devices } = await room(oneCardConfig, 2);
    let last = host.match!.state;
    const moves = await playOut(oneCardConfig, host, devices, 2000, (view, seat, real) => {
      secret(view, seat, real);
      if (seat === 0) {
        // Each move is made by the seat that was to move.
        if (real.last && real.ply === last.ply + 1) expect(real.last.seat).toBe(last.seat);
        last = real;
      }
    });
    expect(moves).toBeGreaterThan(10);
    const end = host.match!.state;
    expect(end.winner).not.toBeNull();
    expect(end.champion).not.toBeNull();
    expect(oneCardConfig.net!.winnerSeat!(end)).toBe(end.champion);
    // The winner's own view says it won; another's says it lost.
    expect(hidden.view(end, end.champion!).winner).toBe(0);
    expect(hidden.view(end, (end.champion! + 1) % 4).winner).toBe(1);
  });
  test("seats closed are out from the start, their cards under the pile; two play it out", async () => {
    const { host, devices } = await room(oneCardConfig, 1, "closed");
    const real = host.match!.state;
    expect(real.out).toEqual([false, false, true, true]);
    expect(real.hands[2]).toEqual([]);
    expect(real.pile.length).toBe(54 - 14 - 1);
    await playOut(oneCardConfig, host, devices, 2000, (view, seat, state) => secret(view, seat, state));
    expect([0, 1]).toContain(host.match!.state.champion);
  });
  test("the host's computer stands in for a guest who drops, from the guest's own view", async () => {
    const { host, devices } = await room(oneCardConfig, 1, "closed"),
      guest = devices[1] as GuestRoom<OneState>;
    expect(send(oneCardConfig, host, 0, { from: -1, to: DRAW, extra: -1 })).toBeNull();
    await settle();
    guest.leave();
    await settle();
    expect(host.away(1)).toBe(true);
    expect(host.match!.toMove).toBe(1);
    // The computer for seat 1 sees only seat 1's hand, and its move is played as seat 1's.
    const view = hidden.view(host.match!.state, 1);
    expect(allBlind(view.hands[3])).toBe(true);
    const move = hidden.game!.choose!(view, "normal", streamFor(2, 2))!;
    expect(host.play(hidden.move(move, 1, host.match!.state), 1)).toBeNull();
    expect(host.match!.state.last!.seat).toBe(1);
  });
  test("a hand of twenty only takes that seat out over Wi-Fi, whoever's it is; the last one left wins", () => {
    const base = oneCardConfig.net!.create!("", {}, [true, true, true, false], streamFor(4, 4)),
      full = { ...base, hands: base.hands.map((h, k) => (k === 0 ? Array.from({ length: BUST }, (_, i) => i) : h)) },
      out = netBust(full, 0);
    expect(out.winner).toBeNull();
    expect(out.out[0]).toBe(true);
    expect(out.last).toBeNull();
    const two = netBust(out, 1);
    expect(two.winner).not.toBeNull();
    expect(two.champion).toBe(2);
  });
});

describe("도둑잡기 over Wi-Fi", () => {
  const hidden = hiddenOf(oldMaidConfig);
  function secret(view: MaidState, seat: number, real: MaidState) {
    expect([...view.hands[0]].sort()).toEqual([...real.hands[seat]].sort());
    expect(view.pairs).toEqual(real.pairs);
    if (real.winner === null) {
      for (let k = 1; k < 4; k++) expect(allBlind(view.hands[k])).toBe(true);
      for (const id of real.hands.flatMap((h, k) => (k === seat ? [] : h))) expect(view.blinds![id]).toBeUndefined();
      // The card last drawn is told only to the two whose hands it went between, or once it made a pair.
      if (view.last && !isBlind(view.last.card)) expect(view.last.seat === 0 || view.last.from === 0 || view.pairs.includes(view.last.card)).toBe(true);
    }
    expect(view.net).toBeUndefined();
  }
  test("three devices and a closed seat: the pack dealt round three, each sees its own fan and the others blind", async () => {
    const { host, devices } = await room(oldMaidConfig, 2, "closed");
    const real = host.match!.state;
    for (const d of devices) expect(d.match!.state).toEqual(real);
    expect(real.hands[3]).toEqual([]);
    expect(real.hands.flat().length + real.pairs.length).toBe(53);
    devices.forEach((d) => secret(hidden.view(d.match!.state, d.mySeat!), d.mySeat!, real));
    // 1번 draws from 2번, whose fan is at its left; its view offers only blind cards, played as the real ones.
    const view = hidden.view(real, 0),
      offered = oldMaidConfig.game.moves(view);
    expect(source(view, 0)).toBe(1);
    expect(offered.length).toBe(real.hands[1].length);
    expect(offered.every((m) => m.to >= BLIND)).toBe(true);
    expect(real.hands[1]).toContain(hidden.move(offered[0], 0, real).to);
  });
  test("four seats played out, each from its own view; the thief loses and every other seat is safe", async () => {
    const { host, devices } = await room(oldMaidConfig, 2);
    await playOut(oldMaidConfig, host, devices, 2000, secret);
    const end = host.match!.state,
      outcome = oldMaidConfig.net!.outcome!;
    expect(end.thief).not.toBeNull();
    expect(end.hands[end.thief!]).toEqual([JOKER]);
    for (let seat = 0; seat < 4; seat++) expect(outcome(end, seat)).toBe(seat === end.thief ? "lose" : "win");
    // At the end the joker is in sight of everyone.
    expect(hidden.view(end, (end.thief! + 1) % 4).hands[3]).toEqual([JOKER]);
  });
});

describe("인디언 포커 over Wi-Fi", () => {
  const hidden = hiddenOf(indianConfig),
    key = (to: number): Move => ({ from: -1, to, extra: -1 });
  /** Exactly the seat's own card is left out (and the other's before the cards are raised), until the round is shown. */
  function secret(view: IndianState, seat: number, real: IndianState) {
    const mine = real.cards[seat],
      theirs = real.cards[seat ? 0 : 1];
    if (real.phase === "show") expect(view.cards).toEqual([mine, theirs]);
    else {
      expect(view.cards[0]).toBe(0);
      expect(view.cards[1]).toBe(real.phase === "ready" ? 0 : theirs);
    }
    expect(view.deck).toEqual(real.deck.map(() => 0));
    expect(view.chips).toEqual([real.chips[seat], real.chips[seat ? 0 : 1]]);
  }
  test("the guest sees the host's card and never its own; 1번 raises the cards and bets first", async () => {
    const { host, devices } = await room(indianConfig, 1),
      guest = devices[1] as GuestRoom<IndianState>;
    expect(guest.match!.state).toEqual(host.match!.state);
    secret(hidden.view(guest.match!.state, 1), 1, guest.match!.state);
    expect(host.match!.toMove).toBe(0);
    expect(guest.play(key(READY))).not.toBeNull();
    expect(send(indianConfig, host, 0, key(READY))).toBeNull();
    await settle();
    const real = host.match!.state;
    expect(real.phase).toBe("bet");
    const view = hidden.view(guest.match!.state, 1);
    secret(view, 1, real);
    expect(view.cards[1]).toBe(real.cards[0]);
    expect(view.turn).toBe(1);
    // The host sets a bet of one more and makes it; the guest calls; the round is shown to both.
    expect(send(indianConfig, host, 0, key(UP))).toBeNull();
    expect(send(indianConfig, host, 0, key(DECIDE))).toBeNull();
    await settle();
    expect(hidden.view(guest.match!.state, 1).turn).toBe(0);
    expect(send(indianConfig, guest, 1, key(CALL))).toBeNull();
    await settle();
    const shown = host.match!.state;
    expect(shown.phase).toBe("show");
    expect(guest.match!.state).toEqual(shown);
    secret(hidden.view(shown, 1), 1, shown);
    // The round's words are the guest's own: 나 is the guest.
    const words = hidden.view(shown, 1).result,
      hostWords = hidden.view(shown, 0).result;
    if (shown.cards[0] !== shown.cards[1]) expect(words.startsWith("나의") || words.startsWith("상대의")).toBe(true);
    if (shown.cards[0] > shown.cards[1]) expect([hostWords, words]).toEqual(["나의 카드가 높습니다.", "상대의 카드가 높습니다."]);
    // While the host has the next round to deal, the guest is told the round.
    expect(hidden.waiting!(shown, 1)).toContain(`내 카드 ${shown.cards[1]}, 상대 카드 ${shown.cards[0]}`);
    expect(send(indianConfig, host, 0, key(NEXT))).toBeNull();
    await settle();
    // The next round is raised and opened by 2번.
    expect(host.match!.toMove).toBe(1);
    expect(host.match!.state.first).toBe(1);
  });
  test("played out to the end of the pack by a person's device and a computer, each from its own view", async () => {
    const { host, devices } = await room(indianConfig, 1);
    await playOut(indianConfig, host, devices, 800, secret);
    expect(host.match!.toMove).toBe(NOBODY);
    expect(host.match!.state.winner).not.toBeNull();
  });
});

describe("고스톱 over Wi-Fi", () => {
  const hidden = hiddenOf(gostopConfig);
  function secret(view: GoState, seat: number, real: GoState) {
    const other = seat ? 0 : 1;
    expect([...view.hands[0]]).toEqual(real.hands[seat]);
    expect(view.floor).toEqual(real.floor);
    expect(view.taken).toEqual([real.taken[seat], real.taken[other]]);
    expect(allBlind(view.pile)).toBe(true);
    if (real.winner === null) {
      const lifted = real.pending !== null && (real.phase === "declare" || real.phase === "choose") ? [real.pending] : [];
      // Only the card being played (lifted) and the three shown when shaking are in sight of the other hand.
      view.hands[1].forEach((id, i) => expect(isBlind(id) || lifted.includes(id) || !!real.last?.shown.includes(id), `card ${i}`).toBe(true));
      for (const id of [...real.pile]) expect(view.blinds![id]).toBeUndefined();
    } else expect(view.hands[1]).toEqual(real.hands[other]);
    // The turn as this seat sees it.
    expect(view.turn).toBe(real.turn === seat ? 0 : 1);
    expect(view.net).toBeUndefined();
  }
  test("both devices agree on the deal; each sees its own ten near and the other's hand and the pile blind", async () => {
    const { host, devices } = await room(gostopConfig, 1);
    const real = host.match!.state;
    expect(devices[1].match!.state).toEqual(real);
    expect(real.hands.map((h) => h.length)).toEqual([10, 10]);
    expect(host.match!.toMove).toBe(0);
    for (const d of devices) secret(hidden.view(d.match!.state, d.mySeat!), d.mySeat!, real);
    expect(hidden.view(real, 1).hands[1].every((id) => id >= BLIND && id < BLIND + CARDS)).toBe(true);
  });
  test("played out by the two devices, every choice (go or stop, shaking, which card) made on the deciding seat's own", async () => {
    let decided = 0;
    // Three games, each dealt from its room's own seed.
    for (let game = 0; game < 3; game++) {
      const { host, devices } = await room(gostopConfig, 1);
      await playOut(gostopConfig, host, devices, 400, (view, seat, real) => {
        secret(view, seat, real);
        // A choice waits for the seat whose turn it is: only that seat may move.
        if (["decide", "declare", "choose", "gukjin"].includes(real.phase) && real.winner === null) {
          expect(host.match!.movers).toEqual([real.turn]);
          if (seat === real.turn) {
            expect(gostopConfig.game.moves(view).length).toBeGreaterThan(0);
            decided++;
          }
        }
      });
      expect(host.match!.toMove).toBe(NOBODY);
    }
    expect(decided).toBeGreaterThan(0);
  });
  test("the other seat's choice is refused: go or stop belongs to the one who scored", () => {
    const real = gostopConfig.net!.create!("", {}, [true, true], streamFor(9, 9)),
      deciding = { ...real, phase: "decide" as const, turn: 1 as const },
      rules = rulesOf(gostopConfig);
    expect(rules.play(deciding, { from: -1, to: STOP, extra: -1 }, () => 0.5, 0)).toBeNull();
    expect(rules.play(deciding, { from: -1, to: GO, extra: -1 }, () => 0.5, 1)).not.toBeNull();
    const shaking = { ...real, phase: "declare" as const, pending: real.hands[0][0], offer: "shake" as const };
    expect(rules.play(shaking, { from: -1, to: YES, extra: -1 }, () => 0.5, 1)).toBeNull();
  });
});
