import { describe, expect, it } from "vitest";
import { CHAMBERS, PULL, SPIN, SPINS, choose, create, legal, play, pullMove, rRoulette, seatsFor, spinMove, still, type State } from "../src/games/rroulette/rules";
import { netPlay, netView, rRouletteNet } from "../src/games/rroulette/net";

/** A random that gives the values in turn (then the last one forever). */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};
/** A seeded random, for long runs. */
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const SAFE = () => 0.999;

describe("러시안 룰렛 rules", () => {
  it("lays four seats, me first, six chambers unfired, two spins each", () => {
    const s = create("", {}, SAFE);
    expect(s.seated).toEqual([true, true, true, true]);
    expect(s.out).toEqual([false, false, false, false]);
    expect(s.seat).toBe(0);
    expect(s.left).toBe(CHAMBERS);
    expect(s.spins).toEqual([SPINS, SPINS, SPINS, SPINS]);
    expect(legal(s)).toEqual([spinMove, pullMove]);
  });
  it("seats one computer across from me, two at my sides, three all round", () => {
    expect(seatsFor(1)).toEqual([true, false, true, false]);
    expect(seatsFor(2)).toEqual([true, true, false, true]);
    expect(create("", { rivals: 1 }, SAFE).out).toEqual([false, true, false, true]);
    expect(create("", { spins: 0 }, SAFE).spins).toEqual([0, 0, 0, 0]);
    expect(legal(create("", { spins: 0 }, SAFE))).toEqual([pullMove]);
  });
  it("a click turns the cylinder a chamber on and passes the toy round the seats still in", () => {
    let s = create("", { rivals: 1 }, SAFE);
    s = play(s, pullMove, SAFE)!;
    expect(s.last).toEqual({ seat: 0, spun: false, bang: false, odds: 6 });
    expect(s.left).toBe(5);
    expect(s.seat).toBe(2);
    s = play(s, pullMove, SAFE)!;
    expect(s.seat).toBe(0);
    expect(s.left).toBe(4);
    expect(s.ply).toBe(2);
  });
  it("six pulls with no spin always find the cap: the chance is one in the chambers left", () => {
    let s = create("", {}, SAFE);
    for (let k = 0; k < 5; k++) {
      s = play(s, pullMove, SAFE)!;
      expect(s.last!.bang).toBe(false);
    }
    expect(s.left).toBe(1);
    const seat = s.seat;
    s = play(s, pullMove, SAFE)!;
    expect(s.last).toEqual({ seat, spun: false, bang: true, odds: 1 });
    expect(s.out[seat]).toBe(true);
    // A new cap and a spin for the next one.
    expect(s.left).toBe(CHAMBERS);
    expect(s.seat).toBe((seat + 1) % 4);
    expect(s.winner).toBeNull();
  });
  it("a spin costs one of the holder's spins and sets the chance back to one in six; none left, it is refused", () => {
    let s: State = { ...create("", {}, SAFE), left: 2 };
    s = play(s, spinMove, SAFE)!;
    expect(s.last).toEqual({ seat: 0, spun: true, bang: false, odds: 6 });
    expect(s.left).toBe(5);
    expect(s.spins[0]).toBe(SPINS - 1);
    expect(play({ ...s, seat: 0, spins: [0, 2, 2, 2] }, spinMove, SAFE)).toBeNull();
    expect(play(s, { from: -1, to: 7, extra: -1 }, SAFE)).toBeNull();
  });
  it("the last one left wins; side 0 is me", () => {
    let s = create("", { rivals: 1 }, SAFE);
    // Me: click. Across: 펑 (random 0 is always a 펑).
    s = play(s, pullMove, SAFE)!;
    s = play(s, pullMove, () => 0)!;
    expect(s.champion).toBe(0);
    expect(s.winner).toBe(0);
    expect(legal(s)).toEqual([]);
    expect(play(s, pullMove, SAFE)).toBeNull();
    expect(rRoulette.reason(s)).toContain("끝까지");
    let t = create("", { rivals: 1 }, SAFE);
    t = play(t, pullMove, () => 0)!;
    expect(t.champion).toBe(2);
    expect(t.winner).toBe(1);
  });
  it("a 펑 goes off as often as the chambers left say", () => {
    const random = seeded(12345);
    let first = 0,
      third = 0;
    const N = 12000;
    for (let k = 0; k < N; k++) {
      const s = create("", {}, random);
      if (play(s, pullMove, random)!.last!.bang) first++;
      if (play({ ...s, left: 3 }, pullMove, random)!.last!.bang) third++;
    }
    expect(first / N).toBeGreaterThan(1 / 6 - 0.02);
    expect(first / N).toBeLessThan(1 / 6 + 0.02);
    expect(third / N).toBeGreaterThan(1 / 3 - 0.025);
    expect(third / N).toBeLessThan(1 / 3 + 0.025);
  });
  it("the computer spins when it must and pulls a fresh cylinder; the levels differ in daring", () => {
    const s = create("", {}, SAFE);
    expect(choose(s, "hard", SAFE)).toEqual(pullMove);
    expect(choose({ ...s, left: 1 }, "easy", SAFE)).toEqual(spinMove);
    expect(choose({ ...s, left: 1, spins: [0, 2, 2, 2] }, "hard", SAFE)).toEqual(pullMove);
    expect(choose({ ...s, left: 2 }, "normal", SAFE)).toEqual(spinMove);
    expect(choose({ ...s, left: 5 }, "normal", SAFE)).toEqual(pullMove);
    expect(choose({ ...s, left: 3 }, "hard", SAFE)).toEqual(spinMove);
  });
  it("games of computers always end with one left, at every level and table size", () => {
    const random = seeded(99);
    for (const level of ["easy", "normal", "hard"] as const)
      for (const rivals of [1, 2, 3])
        for (let g = 0; g < 60; g++) {
          let s = create("", { rivals }, random),
            moves = 0;
          while (s.winner === null) {
            const m = choose(s, level, random)!;
            s = play(s, m, random)!;
            expect(++moves).toBeLessThan(200);
          }
          if (s.champion === null) {
            // Against the computer my 펑 ends it there.
            expect(s.out[0]).toBe(true);
            expect(s.winner).toBe(1);
          } else {
            expect(still(s)).toHaveLength(1);
            expect(s.champion).toBe(still(s)[0]);
          }
        }
  });
  it("against the computer my 펑 ends the game at once; over Wi-Fi the others play on", () => {
    let s = create("", {}, SAFE);
    s = play(s, pullMove, () => 0)!;
    expect(s.winner).toBe(1);
    expect(s.champion).toBeNull();
    expect(rRoulette.reason(s)).toBe("펑! 내가 탈락했습니다.");
    let n = rRouletteNet.create!("", {}, [true, true, true, true], SAFE);
    n = netPlay(n, pullMove, () => 0, 0)!;
    expect(n.winner).toBeNull();
    expect(n.seat).toBe(1);
  });
  it("hard beats easy more often than not, the spins kept for the worst odds", () => {
    const random = seeded(4242);
    let hard = 0;
    const N = 3000;
    for (let g = 0; g < N; g++) {
      let s: State = { ...create("", { rivals: 1 }, random), solo: false };
      // Seat 0 hard, seat 2 easy; who starts alternates.
      if (g % 2) s = { ...s, seat: 2 };
      while (s.winner === null) s = play(s, choose(s, s.seat === 0 ? "hard" : "easy", random)!, random)!;
      if (s.champion === 0) hard++;
    }
    expect(hard / N).toBeGreaterThan(0.53);
  });
});

describe("러시안 룰렛 over Wi-Fi", () => {
  const seated = [true, true, false, true];
  it("lays the room's seats, a closed one out from the start, with the spins set", () => {
    const s = rRouletteNet.create!("", { spins: 3 }, seated, SAFE);
    expect(s.seated).toEqual(seated);
    expect(s.out).toEqual([false, false, true, false]);
    expect(s.spins).toEqual([3, 3, 0, 3]);
    expect(rRouletteNet.toMove!(s)).toBe(0);
    expect(rRouletteNet.seats!("").map((x) => x.kinds)).toEqual([["computer"], ["computer"], ["computer", "closed"], ["computer", "closed"]]);
  });
  it("only the seat holding the toy may pull, and the toy goes round past the closed seat", () => {
    let s = rRouletteNet.create!("", {}, seated, SAFE);
    expect(netPlay(s, pullMove, SAFE, 1)).toBeNull();
    s = netPlay(s, pullMove, SAFE, 0)!;
    expect(s.seat).toBe(1);
    s = netPlay(s, pullMove, SAFE, 1)!;
    expect(s.seat).toBe(3);
    s = netPlay(s, pullMove, SAFE, 3)!;
    expect(s.seat).toBe(0);
  });
  it("each device sees the table turned so that it sits near, and whose turn it is as the screen names it", () => {
    let s = rRouletteNet.create!("", {}, seated, SAFE);
    s = netPlay(s, pullMove, SAFE, 0)!;
    // Seat 1's device: it holds the toy (near), the host at its right (3 places on), the closed seat across...
    const v = netView(s, 1);
    expect(v.seat).toBe(0);
    expect(v.seated).toEqual([true, false, true, true]);
    expect(v.last!.seat).toBe(3);
    expect(rRouletteNet.hidden!.seatOf!(s, 1, 1)).toBe(3);
    expect(rRouletteNet.hidden!.game!.hint(netView(s, 0))).toBe("왼쪽 사람 차례");
    expect(rRouletteNet.hidden!.game!.hint(v)).toContain("당기세요");
    // The end: the host wins on every device's terms.
    const end: State = { ...s, out: [false, true, true, true], champion: 0, winner: 0 };
    expect(netView(end, 0).winner).toBe(0);
    expect(netView(end, 1).winner).toBe(1);
    expect(netView(end, 1).champion).toBe(3);
    expect(rRouletteNet.winnerSeat!(end)).toBe(0);
  });
  it("the same moves and the same salted draws give every device the same game", () => {
    const a = seeded(7),
      b = seeded(7);
    let x = rRouletteNet.create!("", {}, [true, true, true, true], a),
      y = rRouletteNet.create!("", {}, [true, true, true, true], b);
    while (x.winner === null) {
      const m = x.spins[x.seat] && x.left <= 2 ? spinMove : pullMove;
      x = netPlay(x, m, a, x.seat)!;
      y = netPlay(y, m, b, y.seat)!;
      expect(y).toEqual(x);
    }
    expect(x.champion).not.toBeNull();
    expect([SPIN, PULL]).toEqual([0, 1]);
  });
});
