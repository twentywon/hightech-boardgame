import { describe, expect, test } from "vitest";
import { HOST_ONLY, NOBODY } from "../src/net/match";
import { GuestRoom, HostRoom, memoryLinks } from "../src/net/room";
import type { SeatInfo } from "../src/net/protocol";
import type { Move } from "../src/games/points/types";
import type { Seated } from "../src/net/screens";
import { ACTIONS, BET, actMove, chooseMove, dealMove, holdemNet, pokerNet, seotdaNet, type BettingNet } from "../src/net/betting";
import { OWN_WIFI } from "../src/net/route";
import { STUDENT_EXCLUDED } from "../src/core/catalog";
import { streamFor } from "../src/net/random";
import * as seotdaRules from "../src/games/seotda/rules";
import * as pokerRules from "../src/games/poker/rules";
import * as holdemRules from "../src/games/holdem/rules";

/*
 * 와이파이 여럿이 for the betting card games (seotda, seven poker, Texas hold'em): rooms of simulated devices joined
 * by memory links. Every deal is drawn on each device from the move's own random stream (salted by the host), so
 * the devices hold the same cards; each device's view shows only its own hidden cards until the showdown; betting
 * is a move of the seat to act alone, and chips agree everywhere after every move.
 */
const settle = async () => {
  for (let i = 0; i < 60; i++) await Promise.resolve();
};
const seatsOf = <S>(net: BettingNet<S>): SeatInfo[] => net.seats.map((s) => ({ ...s, kind: "open", person: null }));

/** A host and `guests` joined by memory links: the host on seat 0, the guests after it; `kinds` sets other seats. */
async function room<S>(net: BettingNet<S>, guests: string[], kinds: Record<number, "computer" | "closed"> = {}, options = {}) {
  const host = new HostRoom<Seated<S>>({ game: net.game, title: net.game, name: "방장", variant: "", options, seats: seatsOf(net), quiet: true }, net, "host");
  const others = guests.map((name, i) => {
    const guest = new GuestRoom<Seated<S>>({ game: net.game, title: net.game, name, quiet: true }, net, `guest${i}`),
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
  /** The device that plays `seat` (null: the host's computer, for a computer's seat or a dropped person's). */
  const deviceOf = (seat: number) => {
    const s = host.seats[seat];
    return s.kind === "person" && !host.away(seat) ? rooms.find((r) => r.me === s.person)! : null;
  };
  /** Plays a move of the seat to move from its own device (the host for a deal or a computer); the words if refused. */
  const move = async (m: Move) => {
    const to = host.match!.toMove,
      device = to === HOST_ONLY ? host : deviceOf(to),
      text = !device || device === host ? host.play(m, to) : (device as GuestRoom<Seated<S>>).play(m);
    await settle();
    return text;
  };
  /** The move the seat to move makes: the host deals, every seat decides as the host's computer would. */
  const next = () => (host.match!.toMove === HOST_ONLY ? dealMove() : net.standIn(host.match!.state)!);
  /** Every connected device holds the same list and the same state as the host. */
  const same = () => {
    for (const r of rooms.slice(1) as GuestRoom<Seated<S>>[]) {
      if (!r.online) continue;
      expect(r.match!.moves).toEqual(host.match!.moves);
      expect(r.match!.state).toEqual(host.match!.state);
    }
  };
  return { host, guests: others, rooms, move, next, same };
}
/** All the chips at the table, in stacks and in the pot (as any device's view counts them): they never change. */
const total = <S>(net: BettingNet<S>, game: S) => {
  const v = net.rules.view(game, -1);
  return v.pot + v.seats.reduce((sum, s) => sum + s.chips, 0);
};

describe("betting moves as a room sends them", () => {
  test("a deal, every action and a choice go out as the room's moves", () => {
    expect(dealMove()).toEqual({ from: BET.deal, to: -1, extra: -1 });
    expect(ACTIONS.map((a) => actMove(a).to)).toEqual([0, 1, 2, 3]);
    expect(actMove("raise", 120)).toEqual({ from: BET.act, to: 2, extra: 120 });
    expect(chooseMove(1)).toEqual({ from: BET.choose, to: 1, extra: -1 });
  });

  test("moves the rules do not know are refused; a raise of a size only where a raise may be of any size", () => {
    const random = streamFor(5, 1);
    const s = { seats: [0, 1], game: seotdaRules.createSession(1, "two", [0, 1]) };
    // Nothing is bet before a deal, and a deal is a deal only.
    expect(seotdaNet.play(s, actMove("call"), random)).toBeNull();
    expect(seotdaNet.play(s, { from: BET.deal, to: 3, extra: -1 }, random)).toBeNull();
    const dealt = seotdaNet.play(s, dealMove(), random)!;
    expect(dealt.game.phase).toBe("betting");
    expect(seotdaNet.play(dealt, dealMove(), random)).toBeNull();
    expect(seotdaNet.play(dealt, { from: BET.act, to: 4, extra: -1 }, random)).toBeNull();
    expect(seotdaNet.play(dealt, { from: BET.act, to: 1.5, extra: -1 }, random)).toBeNull();
    expect(seotdaNet.play(dealt, actMove("raise", 50), random)).toBeNull();
    expect(seotdaNet.play(dealt, chooseMove(0), random)).toBeNull();
    expect(seotdaNet.play(dealt, { from: 7, to: 0, extra: -1 }, random)).toBeNull();
    const h = holdemNet.play({ seats: [0, 1], game: holdemRules.createSession(1, [0, 1]) }, dealMove(), random)!;
    // Hold'em raises by an amount: a size off the chip step is refused, a fitting one taken.
    expect(holdemNet.play(h, actMove("raise", 45), random)).toBeNull();
    expect(holdemNet.play(h, actMove("raise", -40), random)).toBeNull();
    // Heads up the button has posted the small blind (10) and speaks first: 60 more makes its bet 70.
    expect(holdemNet.play(h, actMove("raise", 60), random)?.game.table.high).toBe(70);
  });

  test("each game seats as many as at one screen; seats after the second may be closed", () => {
    expect(seotdaNet.seats.length).toBe(4);
    expect(pokerNet.seats.length).toBe(4);
    expect(holdemNet.seats.length).toBe(6);
    for (const net of [seotdaNet, pokerNet, holdemNet]) {
      expect(net.seats.slice(0, 2).every((s) => !s.kinds.includes("closed"))).toBe(true);
      expect(net.seats.slice(2).every((s) => s.kinds.includes("closed") && s.kinds.includes("computer"))).toBe(true);
    }
  });

  test("the three games have Wi-Fi play and stay out of the student edition", () => {
    for (const id of ["seotda", "seven-poker", "texas-holdem"]) expect(OWN_WIFI).toContain(id);
    for (const name of ["SEOTDA", "SEVEN POKER", "TEXAS HOLDEM"]) expect(STUDENT_EXCLUDED).toContain(name);
  });
});

describe("a deal agreed by every device, its hidden cards seen by their own device only", () => {
  test("seotda: both devices deal the same cards from the room's random; each sees only its own", async () => {
    const r = await room(seotdaNet, ["민수"], { 2: "computer" });
    const [host, guest] = r.rooms;
    expect(host.match!.state.seats).toEqual([0, 1, 2]);
    expect(host.match!.state.game.people).toEqual([0, 1]);
    // Between hands only the host's device deals.
    expect(host.match!.toMove).toBe(HOST_ONLY);
    expect((guest as GuestRoom<Seated<seotdaRules.State>>).play(dealMove())).toBe("방장이 고르는 차례입니다.");
    expect(await r.move(dealMove())).toBeNull();
    r.same();
    const g = guest.match!.state.game;
    expect(g.hands.every((h) => h.length === 2)).toBe(true);
    // Another room's seed deals other cards: the shuffle is the room's, not a fixed one.
    const other = await room(seotdaNet, ["민수"], { 2: "computer" });
    await other.move(dealMove());
    expect(other.host.match!.state.game.hands).not.toEqual(g.hands);
    // Each device's view: its own two cards face up, every other seat's face down.
    const mine = seotdaNet.rules.view(g, 1),
      hosts = seotdaNet.rules.view(g, 0),
      watching = seotdaNet.rules.view(g, -1);
    expect(mine.seats[1].cards.every((c) => c.face && c.text)).toBe(true);
    expect(mine.seats[0].cards.every((c) => !c.face && !c.text)).toBe(true);
    expect(mine.seats[2].cards.every((c) => !c.face && !c.text)).toBe(true);
    expect(hosts.seats[0].cards.every((c) => c.face)).toBe(true);
    expect(hosts.seats[1].cards.every((c) => !c.face)).toBe(true);
    expect(watching.seats.every((s) => s.cards.every((c) => !c.face))).toBe(true);
    // Nor is the hand of another named before the showdown.
    expect(mine.seats[0].note).toBe("");
    expect(mine.seats[1].note).not.toBe("");
    // Played to the showdown, the hands still in are shown on every device.
    while (r.host.match!.state.game.phase === "betting") {
      expect(await r.move(actMove("call"))).toBeNull();
      r.same();
    }
    const over = guest.match!.state.game;
    expect(["handOver", "sessionOver"]).toContain(over.phase);
    const shown = seotdaNet.rules.view(over, 1);
    if (!over.result!.rematch) for (const i of [0, 1, 2]) expect(shown.seats[i].cards.every((c) => c.face)).toBe(true);
  });

  test("hold'em and seven poker: every device holds the same deal, and sees only its own hole cards", async () => {
    for (const net of [holdemNet, pokerNet] as BettingNet<holdemRules.State | pokerRules.State>[]) {
      const r = await room(net, ["민수", "지아"]);
      await r.move(dealMove());
      r.same();
      // Stud: each person turns up a card of their own, in seat order, the host's computer none.
      while (net.rules.phase(r.host.match!.state.game) === "choosing") {
        const g = r.host.match!.state.game as pokerRules.State;
        const who = net.chooser(g);
        // Until everyone has chosen, nobody sees what another turned up.
        for (let me = 0; me < 3; me++)
          for (let i = 0; i < 3; i++) if (i !== me) expect(net.rules.view(g, me).seats[i].cards.every((c) => !c.face)).toBe(true);
        // Only the chooser's device may choose.
        const wrong = r.rooms[(who + 1) % 3];
        expect(wrong === r.host ? r.host.play(chooseMove(0), (who + 1) % 3) : (wrong as GuestRoom<Seated<unknown>>).play(chooseMove(0))).toBe("상대 차례입니다.");
        expect(await r.move(chooseMove(who))).toBeNull();
        r.same();
      }
      const g = r.rooms[2].match!.state.game;
      for (let me = 0; me < 3; me++) {
        const v = net.rules.view(g, me);
        for (let i = 0; i < 3; i++) {
          const hidden = v.seats[i].cards.filter((c) => !c.face).length;
          if (i === me) expect(hidden).toBe(0);
          // Hold'em: two hole cards face down; stud: two of the first three, one turned up.
          else expect(hidden).toBe(net === holdemNet ? 2 : 2);
        }
      }
    }
  });

  test("three-card seotda: each person shows a card, then picks their pair at the end, on their own device", async () => {
    const r = await room(seotdaNet, ["민수"], { 2: "computer" }, { variant: "three" });
    expect(r.host.match!.state.game.variant).toBe("three");
    await r.move(dealMove());
    const g = r.host.match!.state.game;
    expect(g.phase).toBe("choosing");
    expect(seotdaNet.chooser(g)).toBe(0);
    // The computer showed its card already, but nobody sees it until both people have shown theirs.
    expect(g.open[2]).not.toBeNull();
    expect(seotdaNet.rules.view(g, 1).seats[2].cards.every((c) => !c.face)).toBe(true);
    expect(seotdaNet.rules.prompt(g, 1)).toBeNull();
    expect(seotdaNet.rules.prompt(g, 0)?.options.length).toBe(2);
    expect(await r.move(chooseMove(1))).toBeNull();
    const after = r.rooms[1].match!.state.game;
    expect(seotdaNet.chooser(after)).toBe(1);
    expect(seotdaNet.rules.prompt(after, 1)?.options.length).toBe(2);
    expect(seotdaNet.rules.view(after, 1).seats[0].cards.every((c) => !c.face)).toBe(true);
    expect(await r.move(chooseMove(0))).toBeNull();
    r.same();
    const betting = r.rooms[1].match!.state.game;
    expect(betting.phase).toBe("betting");
    // Now the shown cards are face up for everyone, the other card still hidden.
    const seen = seotdaNet.rules.view(betting, 1);
    expect(seen.seats[0].cards.map((c) => !!c.face)).toEqual([false, true]);
    expect(seen.seats[2].cards.filter((c) => c.face).length).toBe(1);
    // Everyone calls through both rounds; then the people pick their pairs, in seat order.
    for (let i = 0; i < 30 && r.host.match!.state.game.phase === "betting"; i++) expect(await r.move(actMove("call"))).toBeNull();
    const picking = r.host.match!.state.game;
    expect(picking.phase).toBe("choosing");
    expect(picking.hands[0].length).toBe(3);
    expect(seotdaNet.chooser(picking)).toBe(0);
    expect(seotdaNet.rules.prompt(picking, 0)?.options.length).toBe(3);
    expect(await r.move(chooseMove(2))).toBeNull();
    expect(seotdaNet.chooser(r.host.match!.state.game)).toBe(1);
    expect(await r.move(chooseMove(0))).toBeNull();
    r.same();
    const done = r.rooms[1].match!.state.game;
    expect(["handOver", "sessionOver"]).toContain(done.phase);
    expect(done.picks[0]).toEqual(seotdaRules.PAIRS[2]);
    expect(done.picks[1]).toEqual(seotdaRules.PAIRS[0]);
  });
});

describe("betting turns and chips", () => {
  test("each seat bets on its own device in its own turn; out of turn is refused; chips agree everywhere", async () => {
    const r = await room(holdemNet, ["민수"], { 2: "computer" });
    await r.move(dealMove());
    const start = total(holdemNet, r.host.match!.state.game);
    expect(start).toBe(3 * holdemRules.START_CHIPS);
    for (let i = 0; i < 400 && r.host.match!.toMove !== NOBODY; i++) {
      const to = r.host.match!.toMove;
      if (to >= 0) {
        // Whoever's turn it is not may not act: the guest for the host, the host for the guest.
        if (to !== 1) expect((r.rooms[1] as GuestRoom<Seated<holdemRules.State>>).play(actMove("call"))).not.toBeNull();
        if (to === 1) expect(r.host.play(actMove("call"), 0)).toBe("상대 차례입니다.");
      }
      expect(await r.move(r.next())).toBeNull();
      r.same();
      const g = r.rooms[1].match!.state.game;
      expect(total(holdemNet, g)).toBe(start);
    }
    // The session ended: one seat holds every chip, or no person holds any.
    const g = r.host.match!.state.game;
    expect(g.phase).toBe("sessionOver");
    const holders = g.table.seats.filter((s) => s.chips > 0).length;
    expect(holders === 1 || g.people!.every((p) => g.table.seats[p].chips === 0)).toBe(true);
    const verdict = holdemNet.result(r.host.match!.state);
    if (holders === 1) expect(verdict).toBe(g.table.seats.findIndex((s) => s.chips > 0));
    for (const p of [0, 1]) expect(holdemNet.rules.won(g, p)).toBe(g.table.seats[p].chips > 0);
  });

  test("seotda and seven poker play many hands with every device agreeing and no chip made or lost", async () => {
    for (const net of [seotdaNet, pokerNet] as BettingNet<seotdaRules.State | pokerRules.State>[]) {
      const r = await room(net, ["민수", "지아"], { 3: "computer" });
      for (let i = 0; i < 300 && r.host.match!.toMove !== NOBODY && r.host.match!.state.game.round < 12; i++) {
        expect(await r.move(r.next())).toBeNull();
        r.same();
        expect(total(net, r.rooms[2].match!.state.game)).toBe(4 * 1000);
      }
      expect(r.host.match!.state.game.round).toBeGreaterThan(3);
    }
  });

  test("a person out of chips is dealt no more while the others play on", () => {
    let s = seotdaRules.createSession(2, "two", [0, 1]);
    s = { ...s, betting: { ...s.betting, seats: s.betting.seats.map((seat, i) => ({ ...seat, chips: i === 1 ? 0 : seat.chips })) } };
    const dealt = seotdaRules.start(s, streamFor(9, 1))!;
    expect(dealt.hands[1]).toEqual([]);
    expect(dealt.hands[0].length).toBe(2);
    // With no person left holding chips the session ends, the computers' chips notwithstanding.
    const none = { ...s, people: [1] };
    let t = seotdaRules.start(none, streamFor(9, 2))!;
    while (t.phase === "betting") t = seotdaRules.act(t, "call")!;
    expect(t.phase).toBe("sessionOver");
  });
});

describe("leaving", () => {
  test("a guest who drops is played by the host's computer, choices and bets, and gets the seat back", async () => {
    const r = await room(pokerNet, ["민수"]);
    await r.move(dealMove());
    // The host turns up its card; then the guest is to choose, and drops.
    expect(await r.move(chooseMove(0))).toBeNull();
    expect(r.host.match!.toMove).toBe(1);
    r.guests[0].link.close();
    await settle();
    expect(r.host.away(1)).toBe(true);
    // The host's computer stands in: its choice for the seat, then its bets, through the host's room.
    for (let i = 0; i < 40 && r.host.match!.toMove !== HOST_ONLY; i++) {
      const to = r.host.match!.toMove;
      expect(r.host.play(pokerNet.standIn(r.host.match!.state)!, to)).toBeNull();
      await settle();
    }
    expect(["handOver", "sessionOver"]).toContain(r.host.match!.state.game.phase);
    // Back again: the guest is resynced to the same table.
    const [a, b] = memoryLinks();
    r.host.connect(a);
    r.guests[0].guest.connect(b);
    await settle();
    expect(r.host.away(1)).toBe(false);
    expect(r.guests[0].guest.match!.state).toEqual(r.host.match!.state);
  });

  test("the host leaving ends the room for every guest", async () => {
    const r = await room(seotdaNet, ["민수"]);
    r.host.leave();
    await settle();
    expect(r.guests[0].guest.hostLeft).toBe(true);
  });
});
