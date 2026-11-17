import { describe, expect, it } from "vitest";
import * as H from "../src/games/holdem/rules";
import { chen, decide, draws, equity, legal, sight } from "../src/games/holdem/ai";
import { cardText, faceOf, holdem, raiseSizes } from "../src/games/holdem/game";
import { createDeck } from "../src/games/blackjack/shoe";
import { seededRandom, type Difficulty } from "../src/core/ai";
import { card } from "./blackjack-fixtures";
import { replay, stackValues } from "./card-fixtures";

const cards = (text: string) => text.split(" ").map(card);
const best = (text: string) => H.evaluate(cards(text));
/** A shuffle that deals `order` first: two rounds of hole cards from the button's left, then the board. */
const dealing = (order: string) => replay(stackValues(createDeck(1), faceOf, order.split(" ").filter(Boolean)));
const total = (s: H.State) => s.table.seats.reduce((sum, x) => sum + x.chips + x.total * Number(s.phase === "betting"), 0);
const session = (opponents: number, stacks?: number[]) => {
  const s = H.createSession(opponents);
  stacks?.forEach((chips, i) => (s.table.seats[i].chips = chips));
  return s;
};
const turn = (s: H.State) => s.table.turn;
const play = (s: H.State, ...steps: (H.Action | [H.Action, number])[]) =>
  steps.reduce<H.State>((state, step) => {
    const next = Array.isArray(step) ? H.act(state, step[0], step[1]) : H.act(state, step);
    if (!next) throw new Error(`refused: ${JSON.stringify(step)} at seat ${turn(state)}`);
    return next;
  }, s);

describe("Hold'em hands", () => {
  it("takes the best five of seven", () => {
    expect(best("AS KS QS JS 10S 2D 3C").name).toBe("로열 스트레이트 플러시");
    expect(best("9H 8H 7H 6H 5H KD KC").name).toBe("스트레이트 플러시");
    expect(best("9H 9S 9D 9C 2H KD QC").detail).toBe("9 포카드");
    expect(best("9H 9S 9D 2C 2H 2S KD").detail).toBe("9, 2 풀하우스");
    expect(best("AH JH 8H 4H 2H 3H KD").name).toBe("플러시");
    expect(best("2H 3S 4D 5C 6H KS KD").name).toBe("스트레이트");
    expect(best("AS KD QC 4H 2S 8D 9C").detail).toBe("A 하이카드");
  });
  it("plays the ace low in the wheel, the lowest straight", () => {
    const wheel = best("AS 2D 3C 4H 5S KD KC"),
      six = best("2S 3D 4C 5H 6S KD KC");
    expect(wheel.name).toBe("스트레이트");
    expect(wheel.detail).toBe("5 스트레이트");
    expect(six.score).toBeGreaterThan(wheel.score);
    expect(best("AH 2H 3H 4H 5H 9C 9D").name).toBe("스트레이트 플러시");
    // A-K-Q-J-10 off suit beats the wheel and K-high.
    expect(best("AS KD QC JH 10S 2C 3D").score).toBeGreaterThan(best("KS QD JC 10H 9S 2C 3D").score);
  });
  it("breaks ties by kickers, and only five cards count", () => {
    // A pair of aces: the king kicker beats the queen.
    expect(best("AS KD AC 7H 5S 3D 2C").score).toBeGreaterThan(best("AH QD AC 7H 5S 3D 2C").score);
    // Both play the board's top three kickers: the sixth card does not count.
    expect(best("AS 2D AC KH QS JD 9C").score).toBe(best("AH 3D AC KH QS JD 9C").score);
    // Two pair: the fifth card decides.
    expect(best("KS KD 8C 8H AS 2D 3C").score).toBeGreaterThan(best("KH KC 8D 8S QS 2D 3C").score);
    // Three pair: only the best two count, with the highest of the rest.
    expect(best("KS KD 8C 8H 4S 4D AC").detail).toBe("8, K 투페어");
    expect(best("KS KD 8C 8H 4S 4D AC").score).toBeGreaterThan(best("KS KD 8C 8H 4S 4D QC").score);
  });
});

describe("Blinds and the order of play", () => {
  it("heads-up: the button posts the small blind, speaks first before the flop and last after it", () => {
    let s = H.start(session(1))!;
    expect(s.button).toBe(0);
    expect(s.table.seats.map((x) => x.street)).toEqual([10, 20]);
    expect(s.table.seats.map((x) => x.last)).toEqual(["SB", "BB"]);
    expect(turn(s)).toBe(0);
    expect(H.options(s.table)).toEqual({ fold: true, call: 10, raise: 30, allIn: 990 });
    s = play(s, "call");
    // The big blind may still raise its own blind.
    expect(turn(s)).toBe(1);
    expect(H.options(s.table)).toMatchObject({ call: 0, raise: 20 });
    s = play(s, "call");
    expect(s.street).toBe(1);
    expect(s.board).toHaveLength(3);
    expect(turn(s)).toBe(1);
    // The next hand passes the button.
    s = play(s, "call", "call", "call", "call", "call", "call");
    expect(s.phase).toBe("handOver");
    s = H.start(s)!;
    expect(s.button).toBe(1);
    expect(s.table.seats.map((x) => x.last)).toEqual(["BB", "SB"]);
    expect(turn(s)).toBe(1);
  });
  it("from three seats: blinds left of the button, then the seat after the big blind; after the flop the button's left", () => {
    let s = H.start(session(3))!;
    expect(s.button).toBe(0);
    expect(s.table.seats.map((x) => x.last)).toEqual(["", "SB", "BB", ""]);
    expect(turn(s)).toBe(3);
    s = play(s, "call", "call", "call");
    expect(turn(s)).toBe(2);
    s = play(s, "call");
    expect(s.street).toBe(1);
    expect(turn(s)).toBe(1);
    s = play(s, "call", "call", "call", "call");
    expect(s.street).toBe(2);
    expect(turn(s)).toBe(1);
    // A fold takes the seat out of the order.
    s = play(s, "fold", "call", "call", "call");
    expect(s.street).toBe(3);
    expect(turn(s)).toBe(2);
    s = play(s, "call", "call", "call");
    expect(s.phase).toBe("handOver");
    s = H.start(s)!;
    expect(s.button).toBe(1);
    expect(s.table.seats.map((x) => x.last)).toEqual(["", "", "SB", "BB"]);
    expect(turn(s)).toBe(0);
  });
  it("deals two cards each from the button's left, then three, one and one in the middle", () => {
    const s = H.start(session(2), dealing("2C 3C 4C 2D 3D 4D AS KS QS JS 10S"))!;
    expect(s.hands.map((h) => h.map(faceOf))).toEqual([["4C", "4D"], ["2C", "2D"], ["3C", "3D"]]);
    let t = play(s, "call", "call", "call");
    expect(t.board.map(faceOf)).toEqual(["AS", "KS", "QS"]);
    t = play(t, "call", "call", "call");
    expect(t.board.map(faceOf)).toEqual(["AS", "KS", "QS", "JS"]);
    t = play(t, "call", "call", "call");
    expect(t.board.map(faceOf)).toEqual(["AS", "KS", "QS", "JS", "10S"]);
    // A royal flush on the board: everybody shares.
    t = play(t, "call", "call", "call");
    expect(t.result!.pots).toEqual([{ amount: 60, winners: [1, 2, 0], contested: true }]);
    expect(t.table.seats.map((x) => x.chips)).toEqual([1000, 1000, 1000]);
  });
  it("skips a seat that is out of chips and raises the blinds as hands go by", () => {
    let s = session(3, [1000, 0, 1000, 1000]);
    s = H.start(s)!;
    expect(s.table.seats[1].out).toBe(true);
    expect(s.hands[1]).toEqual([]);
    expect(s.table.seats.map((x) => x.last)).toEqual(["", "", "SB", "BB"]);
    expect(turn(s)).toBe(0);
    expect(H.blindsOf(1)).toEqual([10, 20]);
    expect(H.blindsOf(H.HANDS_PER_LEVEL)).toEqual([10, 20]);
    expect(H.blindsOf(H.HANDS_PER_LEVEL + 1)).toEqual([20, 40]);
    s = { ...s, phase: "handOver", round: H.HANDS_PER_LEVEL };
    s = H.start(s)!;
    expect(s.table.blinds).toEqual([20, 40]);
  });
  it("a short big blind still sets the price at the whole blind", () => {
    let s = H.start(session(2, [1000, 1000, 10]))!;
    expect(s.table.seats[2].allIn).toBe(true);
    expect(s.table.high).toBe(20);
    expect(H.options(s.table)).toMatchObject({ call: 20 });
    s = play(s, "call", "call");
    // The big blind is all in: the other two bet on for a side pot.
    expect(s.street).toBe(1);
    expect(turn(s)).toBe(1);
  });
});

describe("No-limit betting", () => {
  it("a raise must add at least the last raise, and a bet at least the big blind", () => {
    let s = H.start(session(3))!;
    // Under the gun: to call 20, the smallest raise makes it 40.
    expect(H.options(s.table)).toEqual({ fold: true, call: 20, raise: 40, allIn: 1000 });
    expect(H.act(s, "raise", 30)).toBeNull();
    expect(H.act(s, "raise", 45)).toBeNull();
    expect(H.act(s, "raise", 1000)).toBeNull();
    s = play(s, ["raise", 70]);
    expect(s.table.high).toBe(70);
    expect(s.table.seats[3].last).toBe("레이즈");
    // The raise added 50, so the next must add at least 50 too: to 120.
    expect(H.options(s.table)).toMatchObject({ call: 70, raise: 120 });
    s = play(s, ["raise", 200]);
    expect(H.options(s.table)).toMatchObject({ call: 190, raise: 320 });
    s = play(s, "fold", "fold", "call");
    expect(s.street).toBe(1);
    // After the flop the first bet is at least the big blind.
    expect(H.options(s.table)).toMatchObject({ call: 0, raise: 20 });
    s = play(s, ["raise", 50]);
    expect(s.table.seats[s.table.seats.findIndex((x) => x.last === "베팅")].street).toBe(50);
    expect(H.options(s.table)).toMatchObject({ call: 50, raise: 100 });
  });
  it("an all-in short of a full raise does not reopen the betting to those who acted", () => {
    // Seat 3 has only 150: it goes all in over a raise to 100, which adds 50 of the 80 needed.
    let s = H.start(session(3, [1000, 1000, 1000, 1000]))!;
    s.table.seats[0].chips = 150;
    s = play(s, ["raise", 100]);
    expect(turn(s)).toBe(0);
    s = play(s, "allIn");
    expect(s.table.high).toBe(150);
    expect(s.table.minRaise).toBe(80);
    // The blinds have not acted on the raise yet: they may still raise, by the full raise.
    expect(H.options(s.table)).toMatchObject({ call: 140, raise: 220 });
    s = play(s, "fold", "call");
    // Seat 3 raised before the short all-in: it may only call or fold now.
    expect(turn(s)).toBe(3);
    expect(H.options(s.table)).toEqual({ fold: true, call: 50, raise: null, allIn: null });
    expect(H.act(s, "raise", 200)).toBeNull();
    expect(H.act(s, "allIn")).toBeNull();
    s = play(s, "call");
    expect(s.street).toBe(1);
  });
  it("offers raise sizes from the smallest raise up to below all in", () => {
    const s = H.start(session(1))!,
      sizing = raiseSizes(s)!;
    expect(sizing.word).toBe("레이즈");
    expect(sizing.amounts[0]).toBe(30);
    expect(sizing.amounts.every((a, i) => i === 0 || a > sizing.amounts[i - 1])).toBe(true);
    expect(Math.max(...sizing.amounts)).toBeLessThan(990);
    expect(sizing.amounts.every((a) => a % H.STEP === 0 && H.act(s, "raise", a) !== null)).toBe(true);
    const flop = play(s, "call", "call");
    expect(raiseSizes(flop)!.word).toBe("베팅");
    expect(raiseSizes(flop)!.amounts[0]).toBe(20);
  });
  it("cannot raise when nobody is left to answer", () => {
    let s = H.start(session(1, [1000, 300]))!;
    s = play(s, "allIn");
    expect(H.options(s.table)).toEqual({ fold: true, call: 280, raise: null, allIn: null });
    s = play(s, "call");
    // Everybody is all in: the board is dealt out at once.
    expect(s.board).toHaveLength(5);
    expect(s.phase === "handOver" || s.phase === "sessionOver").toBe(true);
    expect(total(s)).toBe(1300);
  });
});

describe("Pots", () => {
  it("splits side pots among the stacks that could match them", () => {
    // Seat 1 (100 chips) holds aces, seat 2 (300) kings and seat 0 (1000) queens; nothing on the board helps.
    let s = session(2, [1000, 100, 300]);
    s = H.start(s, dealing("AS KS QS AD KD QD 2C 7H 9S 4C 3D"))!;
    expect(s.hands.map((h) => h.map(faceOf))).toEqual([["QS", "QD"], ["AS", "AD"], ["KS", "KD"]]);
    // Only seat 0 can raise: the short stacks call all in.
    expect(H.act(s, "allIn")).not.toBeNull();
    s = play(s, "allIn");
    expect(H.options(s.table)).toEqual({ fold: true, call: 90, raise: null, allIn: null });
    s = play(s, "call", "call");
    const r = s.result!;
    expect(r.showdown).toBe(true);
    // Main pot 3 × 100 to the aces, side pot 2 × 200 to the kings, the rest of the queens' stake back to them.
    expect(r.pots).toEqual([
      { amount: 300, winners: [1], contested: true },
      { amount: 400, winners: [2], contested: true },
      { amount: 700, winners: [0], contested: false },
    ]);
    expect(s.table.seats.map((x) => x.chips)).toEqual([700, 300, 400]);
    expect(r.winners).toEqual([1, 2]);
    expect(r.net).toEqual([-300, 200, 100]);
  });
  it("splits a tie, with the odd chips to the winners nearest the button's left", () => {
    // Seats 0 and 2 both make the wheel; seat 1 folds its small blind.
    let s = session(2);
    s = H.start(s, dealing("9D AC AH 8S 3C 3H 4S 5D 2H KD KH"))!;
    expect(s.hands.map((h) => h.map(faceOf))).toEqual([["AH", "3H"], ["9D", "8S"], ["AC", "3C"]]);
    s = play(s, "call", "fold", "call", "call", "call", "call", "call", "call", "call");
    expect(s.result!.pots).toEqual([{ amount: 50, winners: [2, 0], contested: true }]);
    // 50 splits as 20 and 20, and the last 10 goes to seat 2, the first winner after the button.
    expect(s.table.seats.map((x) => x.chips)).toEqual([1000, 990, 1010]);
    expect(s.result!.shown).toEqual(["5 스트레이트", null, "5 스트레이트"]);
    expect(holdem.result(s)!.headline).toBe("나, 컴퓨터 2 판돈을 나눕니다 — 5 스트레이트");
  });
  it("gives the pot to the last seat in without a showdown, and keeps its cards hidden", () => {
    let s = H.start(session(2), dealing("AH AC 2D 3H 3C 2C"))!;
    s = play(s, ["raise", 100], "fold", "fold");
    expect(s.result!.showdown).toBe(false);
    expect(s.result!.winners).toEqual([0]);
    expect(holdem.result(s)!.headline).toBe("나 승리 — 모두 폴드");
    const view = holdem.view(s);
    expect(view.seats[1].cards.every((c) => c.face === null && c.text === "")).toBe(true);
    expect(view.seats[2].cards.every((c) => c.face === null && c.text === "")).toBe(true);
  });
  it("ends the session when I am broke, or when every computer is", () => {
    let s = H.start(session(1, [100, 1000]), dealing("AS 2D AD 7C 9S 4H JC 3D 8H"))!;
    s = play(s, "allIn", "call");
    expect(s.phase).toBe("sessionOver");
    expect(s.won).toBe(false);
    s = H.start(session(1, [1000, 100]), dealing("2D AS 7C AD 9S 4H JC 3D 8H"))!;
    s = play(s, "allIn", "call");
    expect(s.won).toBe(true);
    expect(H.start(s)).toBeNull();
  });
});

describe("What seat 0 sees", () => {
  it("shows my cards marked secret, the board to all, and nobody else's cards before a showdown", () => {
    let s = H.start(session(2), dealing("AH AC 2D 3H 3C 2C 4S 5D 6C 7D KH"))!;
    let view = holdem.view(s);
    expect(view.dealer).toBe(0);
    expect(view.board).toEqual([]);
    expect(view.seats[0].cards.map((c) => [c.text, c.secret])).toEqual([["2♦", true], ["2♣", true]]);
    expect(view.seats[0].note).toBe("2 원페어");
    expect(view.seats[1].cards.every((c) => c.face === null)).toBe(true);
    expect(view.seats[1].note).toBe("SB");
    s = play(s, "call", "call", "call");
    view = holdem.view(s);
    expect(view.board!.map((c) => c.text)).toEqual(["4♠", "5♦", "6♣"]);
    expect(JSON.stringify(view.seats.slice(1))).not.toMatch(/A♥|A♣|3♥|3♣|AH|AC/);
    s = play(s, "call", "call", "call", "call", "call", "call", "call", "call", "call");
    view = holdem.view(s);
    expect(view.pot).toBe(0);
    expect(view.seats[1].cards.map((c) => c.text)).toEqual(["A♥", "3♥"]);
    expect(view.seats[1].note).toBe("7 스트레이트");
    expect(view.seats[0].cards.every((c) => !c.secret)).toBe(true);
  });
  it("a folded hand lies face down, mine included", () => {
    let s = H.start(session(1))!;
    s = play(s, "fold");
    const view = holdem.view(s);
    expect(view.seats[0].cards.every((c) => c.face === null)).toBe(true);
    expect(view.seats[0].note).toBe("폴드");
  });
});

describe("The computer", () => {
  it("ranks starting hands by Chen's count and sees draws", () => {
    expect(chen(cards("AS AD"))).toBe(20);
    expect(chen(cards("KS KD"))).toBe(16);
    expect(chen(cards("AS KS"))).toBe(12);
    expect(chen(cards("2S 2D"))).toBe(5);
    expect(chen(cards("7S 2D"))).toBe(-1);
    expect(chen(cards("JH 10H"))).toBe(9);
    expect(draws(cards("AH 5H"), cards("KH 9H 2C"))).toEqual({ flush: true, straight: false });
    expect(draws(cards("8C 9D"), cards("10H JS 2C"))).toEqual({ flush: false, straight: true });
    expect(draws(cards("8C 9D"), cards("10H 2S 2C"))).toEqual({ flush: false, straight: false });
  });
  it("estimates its chance of winning sensibly", () => {
    const random = seededRandom(5);
    expect(equity(cards("AS AD"), [], 1, 600, random)).toBeGreaterThan(0.78);
    expect(equity(cards("7S 2D"), [], 1, 600, random)).toBeLessThan(0.4);
    expect(equity(cards("AS AD"), cards("AH AC 2D"), 3, 200, random)).toBeGreaterThan(0.95);
  });
  it("reads only its own cards, the board and the betting", () => {
    const s = play(H.start(session(3), dealing("AH AC 2D 3H 3C 2C KS QS JD 4S 5D 6C KD KH"))!, "call", "call", "call", "call");
    const seat = turn(s),
      other = structuredClone(s);
    // Swap every other seat's cards and the deck for different ones.
    const pool = createDeck(1).filter(
      (c) => ![...s.hands[seat], ...s.board].some((k) => k.rank === c.rank && k.suit === c.suit),
    );
    other.hands = other.hands.map((h, i) => (i === seat ? h : h.map((c, k) => ({ ...pool[i * 2 + k], id: c.id }))));
    other.deck = pool.slice(20);
    for (const seed of [1, 2, 3, 4, 5]) expect(decide(other, "normal", seed)).toEqual(decide(s, "normal", seed));
    expect(sight(s)!.hole).toEqual(s.hands[seat].map(({ rank, suit }) => ({ rank, suit })));
  });
  it("always makes a legal choice", () => {
    expect(legal({ action: "fold" }, { fold: true, call: 0, raise: 20, allIn: 500 })).toEqual({ action: "call" });
    expect(legal({ action: "raise", amount: 15 }, { fold: true, call: 0, raise: 20, allIn: 500 })).toEqual({ action: "raise", amount: 20 });
    expect(legal({ action: "raise", amount: 600 }, { fold: true, call: 0, raise: 20, allIn: 500 })).toEqual({ action: "allIn" });
    expect(legal({ action: "raise", amount: 60 }, { fold: true, call: 50, raise: null, allIn: null })).toEqual({ action: "call" });
    expect(legal({ action: "allIn" }, { fold: true, call: 50, raise: null, allIn: null })).toEqual({ action: "call" });
    const levels: Difficulty[] = ["beginner", "normal", "expert"];
    for (let seed = 1; seed <= 12; seed++) {
      let s = H.createSession(1 + (seed % 5)),
        steps = 0;
      const random = seededRandom(seed * 977);
      for (let hand = 0; hand < 6 && s.phase !== "sessionOver"; hand++) {
        s = H.start(s, random)!;
        while (s.phase === "betting" && steps < 5000) {
          const choice = holdem.decide(s, levels[seed % 3], seed + steps++),
            next = H.act(s, choice.action, choice.amount);
          expect(next, JSON.stringify({ choice, options: H.options(s.table) })).not.toBeNull();
          s = next!;
        }
      }
    }
  });
  it("plays a whole session to its end, keeping every chip", () => {
    for (const opponents of [1, 3, 5]) {
      let s = H.createSession(opponents),
        hands = 0,
        steps = 0;
      const random = seededRandom(opponents * 31 + 7),
        chips = (opponents + 1) * H.START_CHIPS;
      while (s.phase !== "sessionOver" && hands < 400) {
        s = H.start(s, random)!;
        hands++;
        while (s.phase === "betting") {
          const choice = holdem.decide(s, "normal", 1 + steps++);
          s = H.act(s, choice.action, choice.amount)!;
        }
        expect(s.table.seats.reduce((sum, x) => sum + x.chips, 0)).toBe(chips);
        expect(s.table.seats.every((x) => x.chips >= 0 && x.chips % H.STEP === 0)).toBe(true);
      }
      expect(s.phase).toBe("sessionOver");
      expect(typeof s.won).toBe("boolean");
      // I hold every chip, or none.
      expect(s.table.seats[0].chips).toBe(s.won ? chips : 0);
    }
  }, 60000);
  it("names cards for the panel", () => {
    expect(cardText(card("10D"))).toBe("10♦");
    expect(faceOf(card("QS"))).toBe("QS");
  });
});
