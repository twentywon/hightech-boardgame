import { describe, expect, it } from "vitest";
import * as B from "../src/games/cards/betting";
import * as S from "../src/games/seotda/rules";
import { cardText, equity, seotda } from "../src/games/seotda/game";
import { difficulties, seededRandom, type Difficulty } from "../src/core/ai";
import { replay, stackValues } from "./card-fixtures";

/** "3광", "7열", "4" → a card. */
function card(text: string): S.Card {
  const month = parseInt(text, 10),
    kind = text.endsWith("광") ? "gwang" : text.endsWith("열") ? "yeol" : "plain";
  return { month, kind };
}
const hand = (a: string, b: string) => [card(a), card(b)];
const name = (a: string, b: string) => S.rank(hand(a, b)).name;
/** A shuffle that deals `order`: seat 0, 1, 2 first cards, then second cards. */
const dealing = (order: string[]) => replay(stackValues(S.createDeck(), cardText, order));
const frozen = (s: S.State) => JSON.stringify(s);
const betting = (chips: number[]): B.Betting => ({
  seats: chips.map(B.createSeat),
  turn: -1,
  high: 0,
  raises: 0,
  ante: 10,
});

describe("Betting", () => {
  it("takes antes, lets seats check round, and ends the round", () => {
    const b = betting([1000, 1000, 1000]);
    B.ante(b);
    B.openStreet(b, 1);
    expect(B.pot(b)).toBe(30);
    expect(b.turn).toBe(1);
    expect(B.options(b)).toEqual({ fold: true, call: 0, raise: 20, allIn: 990 });
    for (const seat of [1, 2, 0]) {
      expect(b.turn).toBe(seat);
      expect(B.apply(b, "call")).toBe(true);
    }
    expect(b.turn).toBe(-1);
    expect(B.pot(b)).toBe(30);
  });
  it("raises half the pot, reopens the action and caps the raises", () => {
    const b = betting([1000, 1000]);
    B.ante(b);
    B.openStreet(b, 0);
    B.apply(b, "raise"); // pot 20 → adds 10
    expect(b.seats[0].street).toBe(10);
    expect(B.options(b)).toMatchObject({ call: 10, raise: 30 });
    B.apply(b, "raise"); // calls 10, raises half of 40
    expect(b.seats[1].street).toBe(30);
    expect(b.turn).toBe(0);
    B.apply(b, "raise");
    expect(b.raises).toBe(3);
    expect(B.options(b)!.raise).toBeNull();
    expect(B.apply(b, "raise")).toBe(false);
    B.apply(b, "call");
    expect(b.turn).toBe(-1);
    expect(b.seats[0].total).toBe(b.seats[1].total);
  });
  it("ends at once when everyone else folds, and refuses anything after", () => {
    const b = betting([1000, 1000, 1000]);
    B.ante(b);
    B.openStreet(b, 0);
    B.apply(b, "raise");
    B.apply(b, "fold");
    B.apply(b, "fold");
    expect(b.turn).toBe(-1);
    expect(B.contenders(b)).toEqual([0]);
    expect(B.options(b)).toBeNull();
    expect(B.apply(b, "call")).toBe(false);
    expect(B.payout(b, () => 1)).toEqual([50, 0, 0]);
    expect(b.seats.map((s) => s.chips)).toEqual([1020, 990, 990]);
  });
  it("builds side pots for a short all-in and pays each to its best hand", () => {
    const b = betting([50, 300, 300]);
    B.ante(b);
    B.openStreet(b, 0);
    B.apply(b, "allIn"); // seat 0: 40 more, 50 in total
    B.apply(b, "raise"); // seat 1
    B.apply(b, "call"); // seat 2
    expect(b.turn).toBe(-1);
    const t = b.seats.map((s) => s.total);
    expect(t[0]).toBe(50);
    expect(t[1]).toBe(t[2]);
    expect(B.sidePots(b)).toEqual([
      { amount: 150, eligible: [0, 1, 2] },
      { amount: (t[1] - 50) * 2, eligible: [1, 2] },
    ]);
    // The short stack has the best hand: it wins only the main pot.
    const won = B.payout(b, (seat) => [3, 2, 1][seat]);
    expect(won).toEqual([150, (t[1] - 50) * 2, 0]);
    expect(b.seats.reduce((sum, s) => sum + s.chips, 0)).toBe(650);
  });
  it("splits equal hands and keeps dead money from folded seats in the pot", () => {
    const b = betting([1000, 1000, 1000]);
    B.ante(b);
    B.openStreet(b, 0);
    B.apply(b, "raise"); // +20
    B.apply(b, "call");
    B.apply(b, "fold"); // seat 2 leaves its ante
    expect(B.sidePots(b)).toEqual([{ amount: 70, eligible: [0, 1] }]);
    expect(B.payout(b, () => 5)).toEqual([40, 30, 0]);
  });
  it("offers no raise when nobody is left to answer it", () => {
    const b = betting([1000, 40]);
    B.ante(b);
    B.openStreet(b, 1);
    B.apply(b, "allIn"); // seat 1 puts in its last 30
    expect(B.options(b)).toEqual({ fold: true, call: 30, raise: null, allIn: null });
    B.apply(b, "call");
    expect(b.turn).toBe(-1);
  });
});

describe("Seotda hands", () => {
  it("has twenty cards with the right picture cards", () => {
    const deck = S.createDeck();
    expect(deck).toHaveLength(20);
    expect(deck.filter((c) => c.kind === "gwang").map((c) => c.month)).toEqual([1, 3, 8]);
    expect(deck.filter((c) => c.kind === "yeol").map((c) => c.month)).toEqual([2, 4, 5, 6, 7, 8, 9, 10]);
    for (let m = 1; m <= 10; m++) expect(deck.filter((c) => c.month === m)).toHaveLength(2);
  });
  it("names every kind of hand", () => {
    expect(name("3광", "8광")).toBe("38광땡");
    expect(name("1광", "8광")).toBe("18광땡");
    expect(name("1광", "3광")).toBe("13광땡");
    expect(name("8광", "8열")).toBe("8땡");
    expect(name("10열", "10")).toBe("장땡");
    expect(name("1", "1광")).toBe("1땡");
    expect(name("2", "1광")).toBe("알리");
    expect(name("1", "4")).toBe("독사");
    expect(name("9", "1")).toBe("구삥");
    expect(name("1광", "10")).toBe("장삥");
    expect(name("10열", "4")).toBe("장사");
    expect(name("6", "4열")).toBe("세륙");
    expect(name("2", "7")).toBe("갑오");
    expect(name("5", "3")).toBe("8끗");
    expect(name("2열", "8열")).toBe("망통");
    expect(name("3광", "7열")).toBe("땡잡이");
    expect(name("3", "7열")).toBe("망통");
    expect(name("4열", "7열")).toBe("암행어사");
    expect(name("4", "7열")).toBe("1끗");
    expect(name("4열", "9열")).toBe("멍텅구리구사");
    expect(name("4", "9열")).toBe("구사");
    // 1 and 8 without both brights is an ordinary nine.
    expect(name("1", "8광")).toBe("갑오");
  });
  it("orders the hands: 광땡 > 땡 > 알리…세륙 > 끗", () => {
    const order = [
      hand("3광", "8광"), hand("1광", "8광"), hand("1광", "3광"), hand("10열", "10"),
      hand("9열", "9"), hand("1광", "1"), hand("1광", "2"), hand("1", "4"), hand("1", "9"),
      hand("1", "10"), hand("4", "10"), hand("4", "6"), hand("2", "7"), hand("3", "5"),
      hand("5", "6"), hand("2열", "8열"),
    ].map((h) => S.rank(h).score);
    expect(order).toEqual([...order].sort((a, b) => b - a));
    expect(new Set(order).size).toBe(order.length);
  });
  const duel = (a: S.Card[], b: S.Card[]) =>
    S.showdown([{ seat: 0, cards: a }, { seat: 1, cards: b }]);
  it("lets 땡잡이 catch 1땡–9땡 only", () => {
    const catcher = hand("3광", "7열");
    expect(duel(catcher, hand("9열", "9")).winners).toEqual([0]);
    expect(duel(catcher, hand("1광", "1")).winners).toEqual([0]);
    expect(duel(catcher, hand("10열", "10")).winners).toEqual([1]);
    expect(duel(catcher, hand("3광", "8광")).winners).toEqual([1]);
    // Against anything else it is a zero.
    expect(duel(catcher, hand("2", "9")).winners).toEqual([1]);
    expect(duel(catcher, hand("2열", "8열")).rematch).toBe(true);
  });
  it("lets 암행어사 catch 13·18광땡 only", () => {
    const inspector = hand("4열", "7열");
    expect(duel(inspector, hand("1광", "3광")).winners).toEqual([0]);
    expect(duel(inspector, hand("1광", "8광")).winners).toEqual([0]);
    expect(duel(inspector, hand("3광", "8광")).winners).toEqual([1]);
    expect(duel(inspector, hand("2", "8")).winners).toEqual([0]);
    expect(duel(inspector, hand("5", "7")).winners).toEqual([1]);
  });
  it("voids the round with 구사 up to 알리 and with 멍텅구리구사 up to 9땡", () => {
    expect(duel(hand("4", "9"), hand("1광", "2"))).toMatchObject({ voided: true, rematch: true });
    expect(duel(hand("4", "9"), hand("2", "7")).voided).toBe(true);
    expect(duel(hand("4", "9"), hand("1광", "1"))).toMatchObject({ voided: false, winners: [1] });
    expect(duel(hand("4열", "9열"), hand("9", "9열")).voided).toBe(true);
    expect(duel(hand("4열", "9열"), hand("10열", "10"))).toMatchObject({ voided: false, winners: [1] });
  });
  it("replays equal best hands without calling it a 구사", () => {
    const tie = S.showdown([
      { seat: 0, cards: hand("2", "5") },
      { seat: 1, cards: hand("2열", "5열") },
      { seat: 2, cards: hand("3", "10") },
    ]);
    expect(tie).toMatchObject({ winners: [0, 1], voided: false, rematch: true });
  });
});

describe("Seotda rounds", () => {
  it("antes, deals two cards to each seat in order, and waits for seat 0", () => {
    const s = S.start(S.createSession(2), dealing(["3광", "1", "2", "8광", "1광", "5"]))!;
    expect(s.hands.map((h) => h.map(cardText))).toEqual([["3광", "8광"], ["1", "1광"], ["2", "5"]]);
    expect(s.betting.seats.map((x) => x.chips)).toEqual([990, 990, 990]);
    expect(S.potOf(s)).toBe(30);
    expect(s).toMatchObject({ phase: "betting", round: 1 });
    expect(s.betting.turn).toBe(0);
    expect(new Set(s.hands.flat().map((c) => c.id)).size).toBe(6);
  });
  it("pays the pot to the last seat standing without showing hands", () => {
    let s = S.start(S.createSession(2), dealing(["2열", "1", "2", "8열", "1광", "5"]))!;
    s = S.act(s, "raise")!;
    s = S.act(s, "fold")!;
    s = S.act(s, "fold")!;
    expect(s.phase).toBe("handOver");
    expect(s.result).toMatchObject({ winners: [0], net: [20, -10, -10], rematch: null, reason: "모두 다이" });
    expect(s.result!.shown).toEqual([null, null, null]);
    expect(s.betting.seats.map((x) => x.chips)).toEqual([1020, 990, 990]);
    // Opponents' cards stay hidden from seat 0.
    const view = seotda.view(s);
    expect(view.seats[1].cards).toEqual([]);
  });
  it("shows down, pays the best hand, and moves the first seat on", () => {
    let s = S.start(S.createSession(2), dealing(["3광", "1", "2", "8광", "1광", "5"]))!;
    for (let i = 0; i < 3; i++) s = S.act(s, "call")!;
    expect(s.phase).toBe("handOver");
    expect(s.result).toMatchObject({ winners: [0], net: [20, -10, -10], shown: ["38광땡", "1땡", "7끗"] });
    const next = S.start(s, dealing(["3광", "1", "2", "8광", "1광", "5"]))!;
    expect(next.round).toBe(2);
    expect(next.first).toBe(1);
    expect(next.betting.turn).toBe(1);
    expect(S.potOf(next)).toBe(30);
  });
  it("leaves the pot in for a replay among the tied seats only", () => {
    // Seats 0 and 1 both hold a seven; seat 2 holds less.
    let s = S.start(S.createSession(2), dealing(["2", "2열", "3", "5", "5열", "10"]))!;
    for (let i = 0; i < 3; i++) s = S.act(s, "call")!;
    expect(s.result).toMatchObject({ winners: [], rematch: [0, 1], reason: "동점 — 재경기" });
    expect(S.potOf(s)).toBe(30);
    expect(s.betting.seats.map((x) => x.chips)).toEqual([990, 990, 990]);
    const again = S.start(s, dealing(["3광", "1", "8광", "1광"]))!;
    expect(again.round).toBe(1);
    expect(S.potOf(again)).toBe(30);
    expect(again.hands.map((h) => h.length)).toEqual([2, 2, 0]);
    expect(again.betting.seats[2].folded).toBe(true);
    let done = S.act(again, "call")!;
    done = S.act(done, "call")!;
    expect(done.result).toMatchObject({ winners: [0], net: [20, -10, -10] });
  });
  it("replays everyone still in after a 구사", () => {
    let s = S.start(S.createSession(2), dealing(["4", "2", "3", "9", "7", "5"]))!;
    for (let i = 0; i < 3; i++) s = S.act(s, "call")!;
    expect(s.result).toMatchObject({ rematch: [0, 1, 2], reason: "구사 — 재경기" });
  });
  it("ends the session when seat 0 or every computer is out of chips", () => {
    const base = S.createSession(1);
    base.betting.seats[1].chips = 10;
    let s = S.start(base, dealing(["3광", "2", "8광", "5"]))!;
    // The computer is all in on the ante, so the hand runs straight to the showdown.
    expect(s.phase).toBe("sessionOver");
    expect(s.won).toBe(true);
    expect(s.betting.seats.map((x) => x.chips)).toEqual([1010, 0]);
    expect(S.start(s, dealing([]))).toBeNull();
    const broke = S.createSession(1);
    broke.betting.seats[0].chips = 10;
    s = S.start(broke, dealing(["2", "3광", "5", "8광"]))!;
    expect(s).toMatchObject({ phase: "sessionOver", won: false });
  });
  it("refuses actions out of turn or phase and never changes its input", () => {
    const idle = S.createSession(2);
    expect(S.act(idle, "call")).toBeNull();
    const s = S.start(idle, dealing(["3광", "1", "2", "8광", "1광", "5"]))!;
    const before = frozen(s);
    expect(S.start(s, dealing([]))).toBeNull();
    expect(S.act(s, "bogus" as S.Action)).toBeNull();
    S.act(s, "raise");
    S.act(s, "fold");
    seotda.view(s);
    seotda.decide(s, "expert", 1);
    expect(frozen(s)).toBe(before);
    expect(frozen(idle)).toBe(frozen(S.createSession(2)));
  });
  it("hides the other seats' cards until a showdown they reach", () => {
    let s = S.start(S.createSession(2), dealing(["3광", "1", "2", "8광", "1광", "5"]))!;
    let view = seotda.view(s);
    expect(view.seats[0].cards.map((c) => c.text)).toEqual(["3광", "8광"]);
    expect(view.seats[0].note).toBe("38광땡");
    for (const seat of [1, 2]) {
      expect(view.seats[seat].cards.map((c) => [c.face, c.text])).toEqual([[null, ""], [null, ""]]);
      expect(view.seats[seat].note).toBe("");
    }
    expect(JSON.stringify(view.seats.slice(1))).not.toMatch(/광|1땡|끗/);
    s = S.act(s, "call")!;
    s = S.act(s, "fold")!;
    s = S.act(s, "call")!;
    view = seotda.view(s);
    expect(view.seats[1]).toMatchObject({ note: "다이", cards: [] });
    expect(view.seats[2].cards.map((c) => c.text)).toEqual(["2", "5"]);
    expect(view.seats[2].note).toBe("7끗");
  });
});

describe("Seotda computer", () => {
  it("rates hands by their chance against a random hand", () => {
    expect(equity(hand("3광", "8광"))).toBe(1);
    expect(equity(hand("10열", "10"))).toBeGreaterThan(0.95);
    expect(equity(hand("2", "7"))).toBeGreaterThan(equity(hand("2", "6")));
    expect(equity(hand("2열", "8열"))).toBeLessThan(0.1);
  });
  it("always chooses an action that is on offer", () => {
    for (const d of difficulties)
      for (let seed = 1; seed <= 30; seed++) {
        let s = S.start(S.createSession(3), seededRandom(seed))!;
        let steps = 0;
        while (s.phase === "betting") {
          const next = S.act(s, seotda.decide(s, d, seed + steps));
          expect(next).not.toBeNull();
          s = next!;
          expect(++steps).toBeLessThan(40);
        }
        expect(s.betting.seats.reduce((sum, x) => sum + x.chips, 0) + (s.result?.rematch ? S.potOf(s) : 0)).toBe(4000);
      }
  });
  it("wins chips from weaker levels over many hands", () => {
    // Heads-up, the same deals for every pairing; chips are topped up each hand.
    const profit = (strong: Difficulty, weak: Difficulty) => {
      let total = 0;
      for (let seed = 1; seed <= 400; seed++) {
        let s = S.start(S.createSession(1), seededRandom(seed))!;
        let steps = 0;
        while (s.phase === "betting")
          s = S.act(s, seotda.decide(s, s.betting.turn === 0 ? strong : weak, seed * 13 + steps++))!;
        if (!s.result!.rematch) total += s.result!.net[0];
      }
      return total;
    };
    expect(profit("expert", "beginner")).toBeGreaterThan(0);
    expect(profit("hard", "easy")).toBeGreaterThan(0);
    expect(profit("beginner", "expert")).toBeLessThan(0);
  });
});
