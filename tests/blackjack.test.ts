import { describe, expect, it } from "vitest";
import {
  RANKS,
  RESHUFFLE_BELOW,
  SHOE_SIZE,
  SUITS,
  createDeck,
  createShoe,
  shuffle,
} from "../src/games/blackjack/shoe";
import * as B from "../src/games/blackjack/rules";
import { card, stacked } from "./blackjack-fixtures";

const cards = (...names: string[]) => names.map(card);
/** A session whose shoe deals `order` first: player, dealer up, player, hole, … */
function table(order: string[], bet = 100) {
  const session = B.createSession(stacked(order));
  const staked = B.setBet(session, bet)!;
  return { session, round: B.deal(staked, stacked([]))! };
}
const frozen = (state: B.State) => JSON.stringify(state);

describe("Blackjack card values", () => {
  it("scores number cards, face cards and aces", () => {
    expect(B.handValue(cards("2S", "9H"))).toEqual({ total: 11, soft: false });
    expect(B.handValue(cards("10S", "JH", "QD")).total).toBe(30);
    expect(B.handValue(cards("KC", "7D"))).toEqual({ total: 17, soft: false });
    expect(B.handValue(cards("AS", "6H"))).toEqual({ total: 17, soft: true });
    expect(B.handValue(cards("AS", "KH"))).toEqual({ total: 21, soft: true });
  });
  it("counts several aces as soft or hard as needed, and busts", () => {
    expect(B.handValue(cards("AS", "AH"))).toEqual({ total: 12, soft: true });
    expect(B.handValue(cards("AS", "AH", "AD", "8C"))).toEqual({ total: 21, soft: true });
    expect(B.handValue(cards("AS", "AH", "9D", "KC"))).toEqual({ total: 21, soft: false });
    expect(B.handValue(cards("AS", "6H", "10D"))).toEqual({ total: 17, soft: false });
    expect(B.handValue(cards("AS", "9H", "5D", "8C"))).toEqual({ total: 23, soft: false });
  });
});

describe("Blackjack shoe", () => {
  it("holds 312 cards, six of every rank and suit", () => {
    const shoe = createShoe(stacked([]));
    expect(shoe).toHaveLength(SHOE_SIZE);
    for (const suit of SUITS)
      for (const rank of RANKS)
        expect(shoe.filter((c) => c.rank === rank && c.suit === suit)).toHaveLength(6);
  });
  it("keeps the same cards when shuffled and is reproducible from its random source", () => {
    const seeded = (seed: number) => () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const deck = createDeck(),
      before = JSON.stringify(deck),
      a = shuffle(deck, seeded(7)),
      b = shuffle(deck, seeded(7)),
      c = shuffle(deck, seeded(8));
    expect(JSON.stringify(deck)).toBe(before);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).not.toEqual(deck);
    const key = (x: { rank: string; suit: string }) => x.rank + x.suit;
    expect(a.map(key).sort()).toEqual(deck.map(key).sort());
    expect(() => shuffle(deck, () => 1)).toThrow(RangeError);
  });
  it("deals in the stacked order: player, dealer up, player, hole", () => {
    const { round } = table(["5S", "9H", "6D", "7C"]);
    expect(round.hands[0].cards.map((c) => c.rank + c.suit)).toEqual(["5S", "6D"]);
    expect(round.dealer.map((c) => c.rank + c.suit)).toEqual(["9H", "7C"]);
    expect(round.shoe).toHaveLength(SHOE_SIZE - 4);
  });
  it("reshuffles only before a round that starts under the threshold", () => {
    const low = B.createSession(stacked([]), createDeck().slice(0, RESHUFFLE_BELOW - 1));
    const fresh = B.deal(B.setBet(low, 10)!, stacked(["5S", "9H", "6D", "7C"]))!;
    expect(fresh.reshuffled).toBe(true);
    expect(fresh.shoe).toHaveLength(SHOE_SIZE - 4);
    expect(fresh.hands[0].cards[0]).toMatchObject({ rank: "5", suit: "S" });
    // Exactly at the threshold the same shoe continues, and it is never
    // replaced during the round even as it runs down.
    const enough = B.createSession(stacked([]), [
      ...createDeck().slice(0, RESHUFFLE_BELOW - 6),
      ...cards("2C", "2D", "7C", "6D", "9H", "5S"),
    ]);
    let round = B.deal(B.setBet(enough, 10)!, () => {
      throw new Error("must not shuffle");
    })!;
    expect(round.reshuffled).toBe(false);
    expect(round.shoe).toHaveLength(RESHUFFLE_BELOW - 4);
    round = B.hit(round)!;
    expect(round.shoe).toHaveLength(RESHUFFLE_BELOW - 5);
    expect(round.hands[0].cards.at(-1)).toMatchObject({ rank: "2", suit: "D" });
  });
  it("hands every stake back when the shoe runs out mid-round", () => {
    // A round always starts with at least 104 cards, so the shoe cannot run
    // out in play; the guard is exercised from a prepared mid-round state
    // with one card left: 8♠ 8♦ against 5♥ and a hidden 6♣.
    const short: B.State = {
      ...B.createSession(stacked([])),
      phase: "playerTurn",
      chips: 900,
      lastBet: 100,
      round: 1,
      nextId: 4,
      holeHidden: true,
      hands: [
        { cards: [{ ...card("8S"), id: 0 }, { ...card("8D"), id: 2 }], bet: 100, done: false, doubled: false, split: false, splitAces: false },
      ],
      dealer: [{ ...card("5H"), id: 1 }, { ...card("6C"), id: 3 }],
      shoe: cards("3S"),
    };
    const before = frozen(short);
    const refunded = B.split(short)!;
    expect(refunded.phase).toBe("roundComplete");
    expect(refunded.chips).toBe(1000);
    expect(refunded.outcome).toEqual({
      hands: [{ bet: 100, result: "push", returned: 100, net: 0 }],
      returned: 100,
      net: 0,
      refunded: true,
    });
    expect(frozen(short)).toBe(before);
    // Doubling into an empty shoe returns the original stake, not the doubled one.
    const empty = B.double({ ...short, shoe: [] })!;
    expect(empty.chips).toBe(1000);
    expect(empty.outcome!.refunded).toBe(true);
    // The next round reshuffles and plays normally.
    const again = B.deal(B.setBet(B.nextRound(refunded)!, 50)!, stacked(["5S", "9H", "6D", "7C"]))!;
    expect(again.reshuffled).toBe(true);
    expect(again.chips).toBe(950);
  });
});

describe("Blackjack betting", () => {
  it("validates range, step and balance without changing the state", () => {
    const s = B.createSession(stacked([]));
    const before = frozen(s);
    for (const amount of [5, 15, -10, 510, 1.5, NaN, Infinity])
      expect(B.setBet(s, amount)).toBeNull();
    expect(B.setBet(s, 500)!.bet).toBe(500);
    expect(B.addBet(B.setBet(s, 490)!, 10)!.bet).toBe(500);
    expect(B.addBet(B.setBet(s, 500)!, 10)).toBeNull();
    expect(B.addBet(s, 0)).toBeNull();
    expect(B.addBet(s, -10)).toBeNull();
    const poor = { ...s, chips: 40 };
    expect(B.setBet(poor, 50)).toBeNull();
    expect(B.betError(poor, 50)).toBe("칩이 부족합니다");
    expect(B.setBet(poor, 40)!.bet).toBe(40);
    expect(B.deal(s, stacked([]))).toBeNull();
    expect(B.deal({ ...s, bet: 5 }, stacked([]))).toBeNull();
    expect(B.deal({ ...s, bet: 2000 }, stacked([]))).toBeNull();
    expect(frozen(s)).toBe(before);
  });
  it("takes the stake at the deal and offers it again only when affordable", () => {
    const { round } = table(["5S", "9H", "6D", "7C"], 300);
    expect(round.chips).toBe(700);
    expect(round.lastBet).toBe(300);
    expect(round.bet).toBe(0);
    const done = B.stand(round)!;
    const next = B.nextRound(done)!;
    expect(next.bet).toBe(0);
    expect(B.rebet(next)!.bet).toBe(300);
    expect(B.rebet({ ...next, chips: 290 })).toBeNull();
    expect(B.rebet(B.createSession(stacked([])))).toBeNull();
  });
});

describe("Blackjack naturals and the dealer's check", () => {
  it("pays a natural 3:2 at once", () => {
    const { round } = table(["AS", "9H", "KD", "7C"]);
    expect(round.phase).toBe("roundComplete");
    expect(round.holeHidden).toBe(false);
    expect(round.outcome!.hands[0]).toEqual({ bet: 100, result: "blackjack", returned: 250, net: 150 });
    expect(round.chips).toBe(1150);
  });
  it("pushes when both have blackjack", () => {
    const { round } = table(["AS", "AH", "KD", "QC"]);
    expect(round.outcome!.hands[0]).toEqual({ bet: 100, result: "push", returned: 100, net: 0 });
    expect(round.chips).toBe(1000);
  });
  it("ends the round before the player acts when the dealer shows an ace or ten with blackjack", () => {
    for (const order of [
      ["10S", "AH", "9D", "KC"],
      ["10S", "KH", "9D", "AC"],
    ]) {
      const { round } = table(order);
      expect(round.phase).toBe("roundComplete");
      expect(round.outcome!.hands[0]).toEqual({ bet: 100, result: "lose", returned: 0, net: -100 });
      expect(round.chips).toBe(900);
      for (const act of [B.hit, B.stand, B.double, B.split]) expect(act(round)).toBeNull();
    }
  });
  it("lets the player act when the dealer's ace or ten hides no blackjack", () => {
    const { round } = table(["10S", "AH", "9D", "9C"]);
    expect(round.phase).toBe("playerTurn");
    expect(round.holeHidden).toBe(true);
  });
  it("treats a later 21 as an ordinary win, and loses it to a dealer blackjack", () => {
    // 5+6, then a ten: 21 in three cards against a dealer 20.
    const { round } = table(["5S", "KH", "6D", "QC", "10D"]);
    const won = B.hit(round)!;
    expect(won.outcome!.hands[0]).toEqual({ bet: 100, result: "win", returned: 200, net: 100 });
    // Settlement itself ranks a dealer blackjack above a three-card 21.
    const forced: B.State = { ...round, dealer: [{ ...card("AS"), id: 90 }, { ...card("KS"), id: 91 }] };
    const lost = B.hit(forced)!;
    expect(lost.outcome!.hands[0].result).toBe("lose");
  });
});

describe("Blackjack play", () => {
  it("hides only the hole card until the dealer's turn", () => {
    const { round } = table(["5S", "9H", "6D", "7C"]);
    expect(B.dealerCards(round)).toEqual([
      { rank: "9", suit: "H", id: 1 },
      { id: 3, hidden: true },
    ]);
    expect(B.dealerShown(round)).toEqual({ total: 9, soft: false });
    const done = B.stand(round)!;
    expect(B.dealerCards(done).every((c) => !("hidden" in c))).toBe(true);
    expect(B.dealerShown(done).total).toBe(handValueOf(done.dealer));
  });
  it("makes the dealer hit to 16 and stand on every 17, soft 17 included", () => {
    // Dealer 9+7=16 draws a 2 → 18.
    let done = B.stand(table(["10S", "9H", "8D", "7C", "2S"]).round)!;
    expect(done.dealer.map((c) => c.rank)).toEqual(["9", "7", "2"]);
    expect(done.outcome!.hands[0].result).toBe("push");
    // Soft 17 (A+6) stands.
    done = B.stand(table(["10S", "6H", "8D", "AC", "5S"]).round)!;
    expect(done.dealer).toHaveLength(2);
    expect(done.outcome!.hands[0].result).toBe("win");
    // Hard 17 stands.
    done = B.stand(table(["10S", "10H", "6D", "7C", "5S"]).round)!;
    expect(done.dealer).toHaveLength(2);
    expect(done.outcome!.hands[0].result).toBe("lose");
    // Soft 16 (A+5) hits; A+5+A = soft 17 stands.
    done = B.stand(table(["10S", "5H", "8D", "AC", "AS", "9S"]).round)!;
    expect(done.dealer.map((c) => c.rank)).toEqual(["5", "A", "A"]);
    // Dealer bust pays the standing hand.
    done = B.stand(table(["10S", "9H", "2D", "7C", "KS"]).round)!;
    expect(B.handValue(done.dealer).total).toBe(26);
    expect(done.outcome!.hands[0]).toEqual({ bet: 100, result: "win", returned: 200, net: 100 });
  });
  it("loses a bust at once and the dealer draws nothing more", () => {
    // 10+6, hit K → 26. Dealer 5+6 would otherwise draw.
    const { round } = table(["10S", "5H", "6D", "6C", "KS", "10D"]);
    const bust = B.hit(round)!;
    expect(bust.phase).toBe("roundComplete");
    expect(bust.dealer).toHaveLength(2);
    expect(bust.holeHidden).toBe(false);
    expect(bust.outcome!.hands[0]).toEqual({ bet: 100, result: "bust", returned: 0, net: -100 });
    expect(bust.chips).toBe(900);
    expect(bust.shoe).toHaveLength(SHOE_SIZE - 5);
  });
  it("keeps hitting below 21 and stops by itself at 21", () => {
    const { round } = table(["2S", "9H", "3D", "8C", "4S", "5D", "7H"]);
    let s = B.hit(round)!;
    expect(s.phase).toBe("playerTurn");
    s = B.hit(s)!;
    expect(B.handValue(s.hands[0].cards).total).toBe(14);
    s = B.hit(s)!;
    expect(B.handValue(s.hands[0].cards).total).toBe(21);
    expect(s.phase).toBe("roundComplete");
    expect(s.outcome!.hands[0].result).toBe("win");
  });
  it("doubles on the first two cards only: one card, stake taken, hand closed", () => {
    const { round } = table(["5S", "9H", "6D", "8C", "9S"]);
    expect(B.doubleError(round)).toBeNull();
    const done = B.double(round)!;
    expect(done.hands[0].cards).toHaveLength(3);
    expect(done.hands[0].bet).toBe(200);
    expect(done.outcome!.hands[0]).toEqual({ bet: 200, result: "win", returned: 400, net: 200 });
    expect(done.chips).toBe(1200);
    // After a hit the hand has three cards.
    const hitFirst = B.hit(table(["2S", "9H", "3D", "8C", "4S"]).round)!;
    expect(B.double(hitFirst)).toBeNull();
    expect(B.doubleError(hitFirst)).toBe("처음 두 장일 때만 가능합니다");
    // Not enough chips for the second stake.
    const poor = { ...round, chips: 90 };
    expect(B.double(poor)).toBeNull();
    expect(B.doubleError(poor)).toBe("칩이 부족합니다");
  });
  it("splits only equal ranks, once, with a second stake", () => {
    const pair = table(["KS", "9H", "KD", "7C", "5S", "6D"]).round;
    expect(B.splitError(pair)).toBeNull();
    const mixed = table(["KS", "9H", "QD", "7C"]).round;
    expect(B.split(mixed)).toBeNull();
    expect(B.splitError(mixed)).toBe("같은 랭크 두 장일 때만 가능합니다");
    expect(B.split({ ...pair, chips: 90 })).toBeNull();
    const two = B.split(pair)!;
    expect(two.chips).toBe(800);
    expect(two.hands.map((h) => h.cards.map((c) => c.rank))).toEqual([["K", "5"], ["K", "6"]]);
    expect(two.hands.map((h) => h.bet)).toEqual([100, 100]);
    expect(two.active).toBe(0);
    // Re-splitting is refused even with another pair.
    const again = table(["8S", "9H", "8D", "7C", "8H", "8C"]).round;
    const split = B.split(again)!;
    expect(split.hands[0].cards.map((c) => c.rank)).toEqual(["8", "8"]);
    expect(B.split(split)).toBeNull();
    expect(B.splitError(split)).toBe("한 라운드에 한 번만 가능합니다");
  });
  it("plays split hands left to right and settles each on its own", () => {
    // 8,8 vs dealer 10+7. Left: 8+3, double → +K = 21. Right: 8+9=17, stand.
    const start = table(["8S", "10H", "8D", "7C", "3S", "9D", "KS"]).round;
    let s = B.split(start)!;
    expect(s.active).toBe(0);
    expect(B.doubleError(s)).toBeNull();
    s = B.double(s)!;
    expect(s.chips).toBe(700);
    expect(s.active).toBe(1);
    expect(s.phase).toBe("playerTurn");
    s = B.stand(s)!;
    expect(s.phase).toBe("roundComplete");
    expect(s.outcome!.hands).toEqual([
      { bet: 200, result: "win", returned: 400, net: 200 },
      { bet: 100, result: "push", returned: 100, net: 0 },
    ]);
    expect(s.outcome!.net).toBe(200);
    expect(s.outcome!.returned).toBe(500);
    expect(s.chips).toBe(1200);
  });
  it("moves on from a bust split hand and still plays the dealer for the other", () => {
    // Left 9+7 hits K → bust. Right 9+10 stands. Dealer 6+10 draws 5 → 21.
    const start = table(["9S", "6H", "9D", "10C", "7S", "10D", "KS", "5H"]).round;
    let s = B.split(start)!;
    s = B.hit(s)!;
    expect(s.hands[0].done).toBe(true);
    expect(s.active).toBe(1);
    expect(B.hit({ ...s, active: 0 })).toBeNull();
    s = B.stand(s)!;
    expect(s.dealer.map((c) => c.rank)).toEqual(["6", "10", "5"]);
    expect(s.outcome!.hands.map((h) => h.result)).toEqual(["bust", "lose"]);
    expect(s.chips).toBe(800);
  });
  it("gives split aces one card each, no further action, and an ordinary 21", () => {
    // A,A vs dealer 9+8. Left A+K = 21, right A+5 = 16.
    const start = table(["AS", "9H", "AD", "8C", "KS", "5D", "QH"]).round;
    const s = B.split(start)!;
    expect(s.phase).toBe("roundComplete");
    expect(s.hands.map((h) => h.cards.length)).toEqual([2, 2]);
    expect(s.dealer).toHaveLength(2);
    expect(s.outcome!.hands).toEqual([
      { bet: 100, result: "win", returned: 200, net: 100 },
      { bet: 100, result: "lose", returned: 0, net: -100 },
    ]);
    expect(s.chips).toBe(1000);
    // While still in play, split aces accept nothing.
    const open: B.State = { ...s, phase: "playerTurn", outcome: null };
    for (const act of [B.hit, B.stand, B.double, B.split]) expect(act(open)).toBeNull();
    expect(B.doubleError({ ...open, hands: open.hands.map((h) => ({ ...h, done: false })) })).toBe(
      "스플릿한 에이스는 더블할 수 없습니다",
    );
  });
  it("counts a split ten-plus-ace as 21, not blackjack", () => {
    const start = table(["KS", "9H", "KD", "8C", "AS", "AD"]).round;
    const s = B.split(start)!;
    expect(s.phase).toBe("roundComplete");
    expect(s.outcome!.hands.map((h) => h.result)).toEqual(["win", "win"]);
    expect(s.outcome!.returned).toBe(400);
  });
});

describe("Blackjack settlement and guards", () => {
  it("returns stake plus winnings exactly for each result", () => {
    expect(table(["AS", "9H", "KD", "7C"]).round.chips).toBe(1150); // blackjack
    expect(B.stand(table(["10S", "9H", "9D", "8C"]).round)!.chips).toBe(1100); // win
    expect(B.stand(table(["10S", "9H", "8D", "9C"]).round)!.chips).toBe(1000); // push
    expect(B.stand(table(["10S", "9H", "7D", "KC"]).round)!.chips).toBe(900); // lose
    // A 3:2 payout on the smallest stake stays a whole number.
    expect(table(["AS", "9H", "KD", "7C"], 10).round.chips).toBe(1015);
  });
  it("settles once and refuses actions in the wrong phase", () => {
    const { session, round } = table(["10S", "9H", "9D", "8C"]);
    for (const act of [B.hit, B.stand, B.double, B.split, B.nextRound])
      expect(act(session)).toBeNull();
    expect(B.nextRound(round)).toBeNull();
    expect(B.setBet(round, 50)).toBeNull();
    expect(B.deal({ ...round, bet: 50 }, stacked([]))).toBeNull();
    const done = B.stand(round)!;
    const before = frozen(done);
    for (const act of [B.hit, B.stand, B.double, B.split]) expect(act(done)).toBeNull();
    expect(B.deal({ ...done, bet: 50 }, stacked([]))).toBeNull();
    expect(done.chips).toBe(1100);
    expect(frozen(done)).toBe(before);
    const next = B.nextRound(done)!;
    expect(next).toMatchObject({ phase: "betting", hands: [], dealer: [], outcome: null, chips: 1100 });
    expect(B.nextRound(next)).toBeNull();
  });
  it("never changes the state it was given", () => {
    const { session, round } = table(["8S", "10H", "8D", "7C", "3S", "9D", "KS", "2H", "4C"]);
    const start = frozen(session),
      mid = frozen(round);
    B.setBet(session, 100);
    B.addBet(session, 50);
    B.deal(B.setBet(session, 100)!, stacked([]));
    expect(frozen(session)).toBe(start);
    for (const act of [B.hit, B.stand, B.double, B.split]) act(round);
    B.dealerCards(round);
    B.dealerShown(round);
    expect(frozen(round)).toBe(mid);
    const split = B.split(round)!,
      afterSplit = frozen(split);
    B.hit(split);
    B.double(split);
    B.stand(split);
    expect(frozen(split)).toBe(afterSplit);
  });
  it("offers a new session only when the chips cannot cover the minimum", () => {
    const s = B.createSession(stacked([]));
    expect(B.isBroke(s)).toBe(false);
    expect(B.isBroke({ ...s, chips: 5 })).toBe(true);
    expect(B.isBroke({ ...s, chips: 0, phase: "roundComplete" })).toBe(true);
    expect(B.isBroke({ ...s, chips: 0, phase: "playerTurn" })).toBe(false);
    const fresh = B.createSession(stacked(["5S", "9H", "6D", "7C"]));
    expect(fresh.chips).toBe(B.START_CHIPS);
    expect(fresh.shoe).toHaveLength(SHOE_SIZE);
  });
});
function handValueOf(list: B.Dealt[]) {
  return B.handValue(list).total;
}
