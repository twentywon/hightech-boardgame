import { describe, expect, it } from "vitest";
import * as Y from "../src/games/yacht/rules";
import { advise, profiles } from "../src/games/yacht/ai";
import { difficulties, seededRandom, type Difficulty } from "../src/core/ai";
import { rolling } from "./yacht-fixtures";

const frozen = (s: Y.State) => JSON.stringify(s);
const rolled = (faces: number[], players: 1 | 2 = 1) => Y.roll(Y.createGame(players), rolling(faces))!;

describe("Yacht scoring", () => {
  it("scores the upper section as the sum of the matching face", () => {
    const dice = [1, 1, 3, 6, 6];
    expect(Y.UPPER.map((c) => Y.scoreFor(dice, c))).toEqual([2, 0, 3, 0, 0, 12]);
  });
  it("scores choice, four of a kind and full house as the sum of all dice", () => {
    expect(Y.scoreFor([2, 3, 4, 5, 6], "choice")).toBe(20);
    expect(Y.scoreFor([5, 5, 5, 5, 2], "fourKind")).toBe(22);
    expect(Y.scoreFor([5, 5, 5, 5, 5], "fourKind")).toBe(25);
    expect(Y.scoreFor([5, 5, 5, 2, 2], "fourKind")).toBe(0);
    expect(Y.scoreFor([5, 2, 5, 2, 5], "fullHouse")).toBe(19);
    expect(Y.scoreFor([5, 5, 5, 5, 2], "fullHouse")).toBe(0);
    expect(Y.scoreFor([6, 6, 6, 6, 6], "fullHouse")).toBe(0);
    expect(Y.scoreFor([1, 1, 2, 2, 3], "fullHouse")).toBe(0);
  });
  it("scores straights by run length regardless of order or a pair", () => {
    expect(Y.scoreFor([4, 1, 3, 2, 6], "smallStraight")).toBe(15);
    expect(Y.scoreFor([3, 4, 4, 5, 6], "smallStraight")).toBe(15);
    expect(Y.scoreFor([1, 2, 3, 5, 6], "smallStraight")).toBe(0);
    expect(Y.scoreFor([2, 3, 4, 5, 6], "smallStraight")).toBe(15);
    expect(Y.scoreFor([5, 4, 3, 2, 1], "largeStraight")).toBe(30);
    expect(Y.scoreFor([2, 3, 4, 5, 6], "largeStraight")).toBe(30);
    expect(Y.scoreFor([1, 2, 3, 4, 6], "largeStraight")).toBe(0);
  });
  it("scores a yacht only for five alike", () => {
    expect(Y.scoreFor([4, 4, 4, 4, 4], "yacht")).toBe(50);
    expect(Y.scoreFor([4, 4, 4, 4, 5], "yacht")).toBe(0);
  });
  it("adds the bonus from 63 upper points", () => {
    const card = Y.createGame().cards[0];
    const at62 = { ...card, ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 17, yacht: 50 };
    expect(Y.totals(at62)).toEqual({ upper: 62, bonus: 0, lower: 50, total: 112 });
    expect(Y.totals({ ...at62, sixes: 18 })).toEqual({ upper: 63, bonus: 35, lower: 50, total: 148 });
  });
});

describe("Yacht turns", () => {
  it("rolls all five first, then only the dice that are not held, three times at most", () => {
    const start = Y.createGame();
    expect(start.dice).toEqual([0, 0, 0, 0, 0]);
    let s = Y.roll(start, rolling([1, 2, 3, 4, 5]))!;
    expect(s.dice).toEqual([1, 2, 3, 4, 5]);
    expect(s.rolled).toEqual([true, true, true, true, true]);
    expect(s.rollsLeft).toBe(2);
    s = Y.toggleHold(Y.toggleHold(s, 0)!, 4)!;
    expect(s.held).toEqual([true, false, false, false, true]);
    s = Y.toggleHold(Y.toggleHold(s, 4)!, 4)!;
    s = Y.roll(s, rolling([6, 6, 6]))!;
    expect(s.dice).toEqual([1, 6, 6, 6, 5]);
    expect(s.rolled).toEqual([false, true, true, true, false]);
    expect(s.held).toEqual([true, false, false, false, true]);
    s = Y.roll(s, rolling([2, 2, 2]))!;
    expect(s.dice).toEqual([1, 2, 2, 2, 5]);
    expect(s.rollsLeft).toBe(0);
    expect(s.rollId).toBe(3);
    expect(Y.roll(s, rolling([]))).toBeNull();
    expect(Y.toggleHold(s, 1)).toBeNull();
  });
  it("maps the random source onto faces 1–6 and is reproducible", () => {
    const edge = Y.roll(Y.createGame(), ((v) => () => v.shift()!)([0, 0.1666, 0.1667, 0.5, 0.999999]))!;
    expect(edge.dice).toEqual([1, 1, 2, 4, 6]);
    const a = Y.roll(Y.createGame(), seededRandom(11))!,
      b = Y.roll(Y.createGame(), seededRandom(11))!;
    expect(a.dice).toEqual(b.dice);
    expect(a.dice.every((d) => d >= 1 && d <= 6)).toBe(true);
    expect(() => Y.roll(Y.createGame(), () => 1)).toThrow(RangeError);
  });
  it("refuses holding or scoring before the first roll, and rolling with everything held", () => {
    const start = Y.createGame();
    expect(Y.toggleHold(start, 0)).toBeNull();
    expect(Y.score(start, "choice")).toBeNull();
    let s = rolled([1, 2, 3, 4, 5]);
    for (const i of [0, 1, 2, 3, 4]) s = Y.toggleHold(s, i)!;
    expect(Y.roll(s, rolling([]))).toBeNull();
    for (const i of [-1, 5, 1.5, NaN]) expect(Y.toggleHold(s, i)).toBeNull();
  });
  it("writes a category once, clears the dice and counts rounds", () => {
    let s = rolled([3, 3, 4, 5, 6]);
    s = Y.score(s, "smallStraight")!;
    expect(s.cards[0].smallStraight).toBe(15);
    expect(s).toMatchObject({ round: 2, rollsLeft: 3, dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false] });
    s = Y.roll(s, rolling([1, 1, 1, 1, 1]))!;
    expect(Y.score(s, "smallStraight")).toBeNull();
    expect(Y.score(s, "bogus" as Y.Category)).toBeNull();
    // A zero is a legal entry.
    s = Y.score(s, "largeStraight")!;
    expect(s.cards[0].largeStraight).toBe(0);
    expect(Y.openCategories(s.cards[0])).toHaveLength(10);
  });
  it("alternates two players and finishes after twelve rounds each", () => {
    let s = Y.createGame(2);
    const order: number[] = [];
    for (const category of Y.CATEGORIES)
      for (let player = 0; player < 2; player++) {
        order.push(s.turn);
        // Player 1 rolls sixes, player 2 rolls ones.
        s = Y.roll(s, rolling(Array(5).fill(player === 0 ? 6 : 1)))!;
        s = Y.score(s, category)!;
      }
    expect(order).toEqual(Array.from({ length: 24 }, (_, i) => i % 2));
    expect(s.over).toBe(true);
    expect(s.round).toBe(12);
    // Sixes: 30 + choice 30 + four of a kind 30 + yacht 50; no bonus at 30.
    expect(Y.totals(s.cards[0])).toEqual({ upper: 30, bonus: 0, lower: 110, total: 140 });
    expect(Y.totals(s.cards[1]).total).toBe(5 + 5 + 5 + 50);
    expect(Y.winner(s)).toBe(0);
    for (const act of [() => Y.roll(s, rolling([])), () => Y.toggleHold(s, 0), () => Y.score(s, "ones")])
      expect(act()).toBeNull();
  });
  it("reports a draw, and no winner in a solo game", () => {
    let s = Y.createGame(2);
    for (const category of Y.CATEGORIES)
      for (let player = 0; player < 2; player++)
        s = Y.score(Y.roll(s, rolling([2, 2, 2, 2, 2]))!, category)!;
    expect(Y.winner(s)).toBe("draw");
    let solo = Y.createGame();
    expect(Y.winner(solo)).toBeNull();
    for (const category of Y.CATEGORIES) solo = Y.score(Y.roll(solo, rolling([]))!, category)!;
    expect(solo.over).toBe(true);
    expect(Y.winner(solo)).toBeNull();
  });
  it("never changes the state it was given", () => {
    const start = Y.createGame(2),
      a = frozen(start);
    Y.roll(start, rolling([1, 2, 3, 4, 5]));
    expect(frozen(start)).toBe(a);
    const s = rolled([1, 2, 3, 4, 5], 2),
      b = frozen(s);
    Y.toggleHold(s, 2);
    Y.roll(s, rolling([6]));
    Y.score(s, "largeStraight");
    advise(s, "expert");
    expect(frozen(s)).toBe(b);
  });
});

/** Plays a solo game with `difficulty` deciding every step; returns the total. */
function solo(difficulty: Difficulty, seed: number) {
  const random = seededRandom(seed);
  let s = Y.createGame();
  while (!s.over) {
    if (!Y.hasRolled(s)) {
      s = Y.roll(s, random)!;
      continue;
    }
    const advice = advise(s, difficulty, seed);
    if (advice.category) s = Y.score(s, advice.category)!;
    else {
      // The advice is applied only through the public rules.
      advice.hold!.forEach((keep, i) => {
        if (keep !== s.held[i]) s = Y.toggleHold(s, i)!;
      });
      const next = Y.roll(s, random);
      s = next ?? Y.score(s, advise({ ...s, rollsLeft: 0 }, difficulty, seed).category!)!;
    }
  }
  return Y.totals(s.cards[0]).total;
}
describe("Yacht computer", () => {
  it("asks for a roll first and for a category when no roll is left", () => {
    expect(advise(Y.createGame(), "expert")).toEqual({ hold: null, category: null });
    let s = rolled([1, 2, 2, 5, 6]);
    s = Y.roll(Y.roll(s, rolling([1, 2, 2, 5, 6]))!, rolling([1, 2, 2, 5, 6]))!;
    for (const d of difficulties) {
      const advice = advise(s, d);
      expect(advice.hold).toBeNull();
      expect(Y.openCategories(s.cards[0])).toContain(advice.category);
    }
  });
  it("takes a rolled yacht and keeps four alike when planning", () => {
    for (const d of ["easy", "normal", "hard", "expert"] as const)
      expect(advise(rolled([4, 4, 4, 4, 4]), d)).toEqual({ hold: null, category: "yacht" });
    for (const d of ["normal", "hard", "expert"] as const)
      expect(advise(rolled([3, 3, 3, 3, 5]), d).hold).toEqual([true, true, true, true, false]);
  });
  it("keeps a made straight run and rolls the odd die for the large straight", () => {
    const s = rolled([2, 3, 4, 5, 5]);
    // With the small straight already written, the fifth die goes back.
    const open = { ...s, cards: [{ ...s.cards[0], smallStraight: 15 }] };
    for (const d of ["normal", "hard", "expert"] as const) {
      const hold = advise(open, d).hold!;
      expect(hold.filter(Boolean)).toHaveLength(4);
      expect(open.dice.filter((_, i) => hold[i]).sort()).toEqual([2, 3, 4, 5]);
    }
  });
  it("always gives legal steps and finishes a game at every level", () => {
    for (const d of difficulties) {
      const total = solo(d, 3);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(12 * 50);
    }
  });
  it("scores higher on average the stronger the level", () => {
    const mean = (d: Difficulty) => {
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) total += solo(d, seed);
      return total / 40;
    };
    const scores = Object.fromEntries(difficulties.map((d) => [d, mean(d)])) as Record<Difficulty, number>;
    expect(scores.easy).toBeGreaterThan(scores.beginner + 5);
    expect(scores.normal).toBeGreaterThan(scores.easy + 5);
    expect(scores.hard).toBeGreaterThan(scores.normal + 5);
    // The top two levels differ in judgement, not in lookahead; they score alike.
    expect(scores.expert).toBeGreaterThan(scores.hard - 3);
    expect(profiles.expert.plans).toBe(true);
  }, 120000);
});
