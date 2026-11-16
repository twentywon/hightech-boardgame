import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as b from "../src/games/scale/rules";

/** Follows the hints until the puzzle is solved (or gives up). */
function byHints(s: b.State) {
  for (let n = 0; n < 400 && s.winner === null; n++) {
    const move = b.hint(s);
    if (!move) break;
    s = b.play(s, move)!;
  }
  return s;
}
describe("balance quiz", () => {
  test("coins: every puzzle can be made sure of, the hints find the false coin, and a guess loses", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = b.createGame(1, seededRandom(seed));
      expect(s.kind).toBe("coins");
      expect(b.solvable(s)).toBe(true);
      const done = byHints(s);
      expect(done.winner).toBe(0);
      expect(done.log.length).toBeLessThanOrEqual(s.allowed);
      // Naming a coin at once, before any weighing, is never right.
      const guessed = b.play(b.play(s, { from: -1, to: b.ACCUSE, extra: -1 })!, { from: -1, to: 0, extra: -1 })!;
      expect(guessed.winner).toBe(1);
    }
  });
  test("coins: a weighing needs as many coins on each pan, and the beam is never forced to tell more than it must", () => {
    const s = b.createGame(1, seededRandom(4)),
      one = b.play(s, { from: -1, to: 0, extra: -1 })!;
    expect(b.play(one, { from: -1, to: b.WEIGH, extra: -1 })).toBeNull();
    const two = b.play(b.play(one, { from: -1, to: 1, extra: -1 })!, { from: -1, to: 1, extra: -1 })!,
      weighed = b.play(two, { from: -1, to: b.WEIGH, extra: -1 })!;
    expect(weighed.log).toHaveLength(1);
    // One coin against one: the beam stays level, which leaves the most in doubt.
    expect(weighed.log[0].tip).toBe(0);
  });
  test("a coin or weight dragged lies where it is let go; nothing is put where it already lies, nor while naming the false coin", () => {
    const s = b.createGame(1, seededRandom(4)),
      left = b.play(s, { from: -1, to: b.putOn(2, 1), extra: -1 })!;
    expect(left.pans[2]).toBe(1);
    expect(left.ply).toBe(1);
    const right = b.play(left, { from: -1, to: b.putOn(2, 2), extra: -1 })!;
    expect(right.pans[2]).toBe(2);
    expect(b.play(right, { from: -1, to: b.putOn(2, 2), extra: -1 })).toBeNull();
    expect(b.play(right, { from: -1, to: b.putOn(2, 0), extra: -1 })!.pans[2]).toBe(0);
    expect(b.play(s, { from: -1, to: b.putOn(s.coins, 1), extra: -1 })).toBeNull();
    const naming = b.play(s, { from: -1, to: b.ACCUSE, extra: -1 })!;
    expect(b.play(naming, { from: -1, to: b.putOn(0, 1), extra: -1 })).toBeNull();
    // The weights: dragged into the setting that levels it, the scale is level and the puzzle solved.
    const w = b.createGame(2, seededRandom(3));
    let done = w;
    w.answer.forEach((pan, i) => {
      if (pan) done = b.play(done, { from: -1, to: b.putOn(i, pan), extra: -1 })!;
    });
    expect(done.winner).toBe(0);
    // The hint names where a coin or weight goes.
    expect(b.putOf(b.hint(w)!.to)).not.toBeNull();
  });
  test("weights: one setting levels the scale, and the hints find it", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = b.createGame(2, seededRandom(seed));
      expect(b.levellings(s.load, s.weights)).toHaveLength(1);
      expect(s.answer).toContain(1);
      expect(byHints(s).winner).toBe(0);
    }
  });
  test("goods: the scales leave one answer within the dials, with a weight on some pan", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = b.createGame(3, seededRandom(seed));
      expect(s.scales.length).toBeGreaterThanOrEqual(s.answer.length - 1);
      for (const sc of s.scales) expect(b.panWeight(sc.left, s.answer)).toBe(b.panWeight(sc.right, s.answer));
      expect(s.scales.some((sc) => [...sc.left, ...sc.right].some((x) => x >= b.WEIGHT))).toBe(true);
      expect(byHints(s).winner).toBe(0);
    }
  });
  test("mobile: every rod balances with the true weights, the hidden ones come out one way, and the hints find them", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = b.createGame(4, seededRandom(seed));
      for (const rod of b.rods(s.mobile!)) expect(b.lean(rod, s.leaves)).toBe(0);
      expect(s.hidden.length).toBeGreaterThan(0);
      expect(s.hidden.length).toBeLessThan(s.leaves.length);
      expect(byHints(s).winner).toBe(0);
    }
  });
});
