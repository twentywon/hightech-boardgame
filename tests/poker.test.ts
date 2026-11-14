import { describe, expect, it } from "vitest";
import * as P from "../src/games/poker/rules";
import { cardText, equity, faceOf, poker } from "../src/games/poker/game";
import { createDeck } from "../src/games/blackjack/shoe";
import { difficulties, seededRandom, type Difficulty } from "../src/core/ai";
import { card } from "./blackjack-fixtures";
import { replay, stackValues } from "./card-fixtures";

const cards = (text: string) => text.split(" ").map(card);
const name = (text: string) => P.evaluate(cards(text)).name;
const score = (text: string) => P.evaluate(cards(text)).score;
/** A shuffle that deals `order` first; see the deal order in the tests below. */
const dealing = (order: string) => replay(stackValues(createDeck(1), faceOf, order.split(" ").filter(Boolean)));
const frozen = (s: P.State) => JSON.stringify(s);
/** Deals a hand and turns up seat 0's card at `show`, so the betting is open. */
const begin = (session: P.State, random: ReturnType<typeof dealing>, show = 2) =>
  P.choose(P.start(session, random)!, show)!;
const total = (s: P.State) => s.betting.seats.reduce((sum, x) => sum + x.chips, 0);

describe("Poker hands", () => {
  it("names every category from five cards", () => {
    expect(name("AS KS QS JS 10S")).toBe("로열 스트레이트 플러시");
    expect(name("9H 8H 7H 6H 5H")).toBe("스트레이트 플러시");
    expect(name("9H 9S 9D 9C 2H")).toBe("포카드");
    expect(name("9H 9S 9D 2C 2H")).toBe("풀하우스");
    expect(name("AH JH 8H 4H 2H")).toBe("플러시");
    expect(name("9H 8S 7D 6C 5H")).toBe("스트레이트");
    expect(name("AS 2D 3C 4H 5S")).toBe("스트레이트");
    expect(name("9H 9S 9D 4C 2H")).toBe("트리플");
    expect(name("9H 9S 4D 4C 2H")).toBe("투페어");
    expect(name("9H 9S 7D 4C 2H")).toBe("원페어");
    expect(name("AH JS 8D 4C 2H")).toBe("하이카드");
    expect(name("QS KS AS 2S 3D")).toBe("하이카드");
  });
  it("orders categories and breaks ties by rank", () => {
    const ladder = [
      "AS KS QS JS 10S", "9H 8H 7H 6H 5H", "9H 9S 9D 9C 2H", "9H 9S 9D 2C 2H", "AH JH 8H 4H 2H",
      "9H 8S 7D 6C 5H", "9H 9S 9D 4C 2H", "9H 9S 4D 4C 2H", "9H 9S 7D 4C 2H", "AH JS 8D 4C 2H",
    ].map(score);
    expect(ladder).toEqual([...ladder].sort((a, b) => b - a));
    expect(new Set(ladder).size).toBe(10);
    expect(score("AS AD KC 4H 2S")).toBeGreaterThan(score("KS KD AC 4H 2S"));
    expect(score("AS AD KC 4H 2S")).toBeGreaterThan(score("AH AC QC 4D 2D"));
    expect(score("KS KD 3C 3H AS")).toBeGreaterThan(score("QS QD JC JH AS"));
    expect(score("8S 8D 8C 2H 2S")).toBeGreaterThan(score("7S 7D 7C AH AS"));
    // The five-high straight is the lowest straight; suits never break a tie.
    expect(score("6S 5D 4C 3H 2S")).toBeGreaterThan(score("AS 2D 3C 4H 5S"));
    expect(score("AS KD QC JH 10S")).toBeGreaterThan(score("KS QD JC 10H 9S"));
    expect(score("AS KD 9C 4H 2S")).toBe(score("AH KC 9D 4S 2D"));
  });
  it("finds the best five of seven", () => {
    expect(name("AS KS QS JS 10S 10D 10C")).toBe("로열 스트레이트 플러시");
    expect(name("9H 9S 9D 2C 2H 2S KD")).toBe("풀하우스");
    expect(score("9H 9S 9D 2C 2H 2S KD")).toBe(score("9H 9S 9D 2C 2H"));
    expect(name("2H 5H 9H JH KH 3S 4D")).toBe("플러시");
    expect(name("2H 3S 4D 5C 6H KS KD")).toBe("스트레이트");
    expect(score("AS AD KC KH QS QD 2C")).toBe(score("AS AD KC KH QS"));
  });
  it("ranks fewer than five cards by pairs only", () => {
    expect(name("AS")).toBe("하이카드");
    expect(name("9S 9D")).toBe("원페어");
    expect(name("9S 9D 9C")).toBe("트리플");
    expect(name("9S 9D 4C 4H")).toBe("투페어");
    expect(name("2S 3S 4S 5S")).toBe("하이카드");
    expect(score("KS")).toBeGreaterThan(score("QS"));
    expect(score("2S 2D")).toBeGreaterThan(score("AS KD"));
  });
});

describe("Seven-card stud rounds", () => {
  // Deal order: each seat's first card, then the second, then the third — all face down.
  const three = "2S 3S 4S 5H 6H 7H KD 9C QC";
  it("antes, deals three down, and waits for seat 0 to turn one up", () => {
    const s = P.start(P.createSession(2), dealing(three))!;
    expect(s.phase).toBe("choosing");
    expect(s.betting.turn).toBe(-1);
    expect(P.potOf(s)).toBe(30);
    expect(s.hands[0].map((c) => c.up)).toEqual([false, false, false]);
    // The computers have already turned up their lowest card outside a pair.
    expect(s.hands.slice(1).map((h) => h.map((c) => cardText(c) + (c.up ? "↑" : "↓")))).toEqual([
      ["3♠↑", "6♥↓", "9♣↓"],
      ["4♠↑", "7♥↓", "Q♣↓"],
    ]);
    expect(P.act(s, "call")).toBeNull();
    for (const bad of [-1, 3, 1.5, NaN]) expect(P.choose(s, bad)).toBeNull();
    const open = P.choose(s, 2)!;
    expect(open.hands[0].map((c) => cardText(c) + (c.up ? "↑" : "↓"))).toEqual(["2♠↓", "5♥↓", "K♦↑"]);
    // The best card showing opens the betting.
    expect(open).toMatchObject({ phase: "betting", street: 3, round: 1 });
    expect(open.betting.turn).toBe(0);
    expect(P.choose(open, 0)).toBeNull();
    expect(total(open) + P.potOf(open)).toBe(3000);
    // Showing a low card instead hands the opening to another seat.
    expect(P.choose(s, 0)!.betting.turn).toBe(2);
  });
  it("keeps a pair hidden when a computer chooses its card to show", () => {
    const s = P.start(P.createSession(1), dealing("2S 9D 5H 9C KD 4S"))!;
    expect(s.hands[1].map((c) => cardText(c) + (c.up ? "↑" : "↓"))).toEqual(["9♦↓", "9♣↓", "4♠↑"]);
  });
  it("deals up cards on the fourth to sixth streets and the last one down", () => {
    let s = begin(P.createSession(1), dealing("2S 3S 5H 6H KD 9C"));
    while (s.phase === "betting") s = P.act(s, "call")!;
    expect(s.hands.map((h) => h.length)).toEqual([7, 7]);
    expect(s.hands[0].map((c) => c.up)).toEqual([false, false, true, true, true, true, false]);
    expect(s.hands[1].map((c) => c.up)).toEqual([true, false, false, true, true, true, false]);
    expect(new Set(s.hands.flat().map((c) => c.id)).size).toBe(14);
    expect(s.phase).toBe("handOver");
    expect(s.result!.reason).toBe("족보 대결");
    expect(s.result!.shown.every((h) => typeof h === "string")).toBe(true);
    expect(total(s)).toBe(2000);
  });
  it("pays the last seat standing without a showdown", () => {
    let s = begin(P.createSession(2), dealing(three));
    s = P.act(s, "raise")!;
    s = P.act(s, "fold")!;
    s = P.act(s, "fold")!;
    expect(s.phase).toBe("handOver");
    expect(s.street).toBe(3);
    expect(s.result).toMatchObject({ winners: [0], net: [20, -10, -10], reason: "모두 다이", shown: [null, null, null] });
  });
  it("splits the pot between equal hands", () => {
    const order = "2S 2H 3D 3C 10S 10H JD JC QS QH KD KC AS AH";
    let s = begin(P.createSession(1), dealing(order));
    while (s.phase === "betting") s = P.act(s, "call")!;
    expect(s.result!.shown).toEqual(["A 스트레이트", "A 스트레이트"]);
    expect(s.result).toMatchObject({ winners: [0, 1], net: [0, 0] });
  });
  it("runs the remaining cards out when everyone is all in", () => {
    const base = P.createSession(1);
    base.betting.seats[1].chips = 30;
    let s = begin(base, dealing("2S 3S 5H 6H KD 9C"));
    s = P.act(s, "allIn")!;
    s = P.act(s, "call")!;
    expect(s.hands.map((h) => h.length)).toEqual([7, 7]);
    expect(["handOver", "sessionOver"]).toContain(s.phase);
    // Seat 0 could only lose what the short stack could match.
    expect(total(s)).toBe(1030);
    expect(Math.abs(s.result!.net[0])).toBeLessThanOrEqual(30);
  });
  it("ends the session when a side has no chips left", () => {
    const base = P.createSession(1);
    base.betting.seats[1].chips = 10;
    // Seat 0 makes a pair of aces; the computer, all in on the ante, cannot.
    const s = begin(base, dealing("AS 2D AH 3C KD 7C 9S 4H 8C 5D 6S JD QH 10S"));
    expect(s.phase).toBe("sessionOver");
    expect(s.won).toBe(true);
    expect(P.start(s, dealing(""))).toBeNull();
  });
  it("refuses actions out of phase and never changes its input", () => {
    const idle = P.createSession(2);
    expect(P.act(idle, "call")).toBeNull();
    expect(P.choose(idle, 0)).toBeNull();
    const dealt = P.start(idle, dealing(three))!,
      waiting = frozen(dealt);
    P.choose(dealt, 1);
    expect(frozen(dealt)).toBe(waiting);
    const s = P.choose(dealt, 2)!,
      before = frozen(s);
    expect(P.start(s, dealing(""))).toBeNull();
    expect(P.act(s, "nope" as P.Action)).toBeNull();
    P.act(s, "raise");
    P.act(s, "fold");
    poker.view(s);
    poker.decide(s, "expert", 3);
    expect(frozen(s)).toBe(before);
  });
  it("shows seat 0 its own cards and only the face-up cards of the others", () => {
    const dealt = P.start(P.createSession(2), dealing(three))!;
    expect(poker.prompt(dealt)).toEqual({
      title: "상대에게 공개할 카드를 고르세요",
      options: [
        { label: "2♠ 공개", value: 0, cards: [0] },
        { label: "5♥ 공개", value: 1, cards: [3] },
        { label: "K♦ 공개", value: 2, cards: [6] },
      ],
    });
    let s = P.choose(dealt, 2)!;
    expect(poker.prompt(s)).toBeNull();
    let view = poker.view(s);
    expect(view.seats[0].cards.map((c) => c.text)).toEqual(["2♠", "5♥", "K♦"]);
    expect(view.seats[0].cards.map((c) => !!c.secret)).toEqual([true, true, false]);
    expect(view.seats[1].cards.map((c) => c.text)).toEqual(["3♠", "", ""]);
    expect(view.seats[1].cards.map((c) => c.face)).toEqual(["3S", null, null]);
    expect(view.seats[1].note).toBe("");
    expect(JSON.stringify(view.seats.slice(1))).not.toMatch(/6♥|9♣|7♥|Q♣|6H|9C|7H|QC/);
    s = P.act(s, "call")!;
    s = P.act(s, "fold")!;
    view = poker.view(s);
    // A folded hand stays at its seat, every card face down.
    expect(view.seats[1].note).toBe("다이");
    expect(view.seats[1].cards.map((c) => [c.face, c.text])).toEqual([[null, ""], [null, ""], [null, ""]]);
    while (s.phase === "betting") s = P.act(s, "call")!;
    // The seventh card comes face down for seat 0 to uncover; the paid pot is gone.
    expect(s.hands[0]).toHaveLength(7);
    view = poker.view(s);
    expect(view.pot).toBe(0);
    expect(view.seats[2].cards.every((c) => c.face && c.text)).toBe(true);
    expect(view.seats[2].note).toBe(P.evaluate(s.hands[2]).detail);
    expect(view.seats[1].cards.every((c) => c.face === null)).toBe(true);
  });
  it("marks the seventh card as one seat 0 uncovers by hand", () => {
    let s = begin(P.createSession(1), dealing("2S 3S 5H 6H KD 9C"));
    while (s.phase === "betting" && s.street < 7) s = P.act(s, "call")!;
    expect(s.street).toBe(7);
    const mine = poker.view(s).seats[0].cards;
    expect(mine.map((c) => !!c.peek)).toEqual([false, false, false, false, false, false, true]);
    // If I fold, my cards are turned over like anyone else's.
    const folded = P.act({ ...s, betting: { ...s.betting, turn: 0 } }, "fold")!;
    expect(poker.view(folded).seats[0].cards.every((c) => c.face === null && !c.peek)).toBe(true);
  });
});

describe("Poker computer", () => {
  it("estimates a made hand far above a weak one, reproducibly", () => {
    const strong = begin(P.createSession(1), dealing("AS 2D AH 7C AD 9C")),
      weak = begin(P.createSession(1), dealing("2S AD 7H AH 3D AC"), 0);
    expect(strong.betting.turn).toBe(0);
    const high = equity(strong, 300, 5),
      low = equity({ ...weak, betting: { ...weak.betting, turn: 0 } }, 300, 5);
    expect(high).toBeGreaterThan(0.85);
    expect(low).toBeLessThan(0.45);
    expect(equity(strong, 300, 5)).toBe(high);
  });
  it("always chooses an action on offer and keeps every chip accounted for", () => {
    for (const d of difficulties)
      for (let seed = 1; seed <= 8; seed++) {
        let s = begin(P.createSession(3), seededRandom(seed), seed % 3),
          steps = 0;
        while (s.phase === "betting") {
          const next = P.act(s, poker.decide(s, d, seed + steps));
          expect(next).not.toBeNull();
          s = next!;
          expect(++steps).toBeLessThan(120);
        }
        expect(total(s)).toBe(4000);
      }
  });
  it("wins chips from weaker levels over many hands, whichever seat it takes", () => {
    // Every deal is played twice with the seats swapped, so the cards cancel
    // out. All-in pots make single hands swing widely, hence the large sample;
    // the measured edges are about six and four standard errors above zero.
    const edge = (strong: Difficulty, weak: Difficulty) => {
      let sum = 0;
      for (let seed = 1; seed <= 1500; seed++)
        for (const strongSeat of [0, 1]) {
          let s = begin(P.createSession(1), seededRandom(seed * 7 + 3), 0),
            steps = 0;
          while (s.phase === "betting")
            s = P.act(s, poker.decide(s, s.betting.turn === strongSeat ? strong : weak, seed * 17 + steps++))!;
          sum += s.result!.net[strongSeat];
        }
      return sum / 1500;
    };
    expect(edge("expert", "beginner")).toBeGreaterThan(10);
    expect(edge("hard", "normal")).toBeGreaterThan(5);
  }, 240000);
});

describe("Hands are named with the ranks that make them", () => {
  it.each([
    ["2S 2H 4D 4C 9S", "2, 4 투페어"],
    ["KS KH 3D 7C 9S", "K 원페어"],
    ["5S 5H 5D 9C 9S", "5, 9 풀하우스"],
    ["JS JH JD 2C 9S", "J 트리플"],
    ["AS QH 7D 4C 2S", "A 하이카드"],
  ])("%s is %s", (text, expected) => {
    expect(P.evaluate(cards(text)).detail).toBe(expected);
  });
});
