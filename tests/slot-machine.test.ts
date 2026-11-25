import { describe, expect, test } from "vitest";
import * as R from "../src/games/slots/rules";
import * as S from "../src/games/slots/sim";

const count = (strip: number[], symbol: number) => strip.filter((s) => s === symbol).length;
/** The first stop (in strip order) of `reel` with `symbol` in the middle row. */
const at = (reel: number, symbol: number) => S.STRIPS[reel].indexOf(symbol);
const move = (to: number, extra = -1) => ({ from: -1, to, extra });

describe("slot machine: strips and pay table", () => {
  test("three strips of 24 with the documented symbol counts, no symbol beside itself", () => {
    expect(S.STRIPS).toHaveLength(3);
    for (const strip of S.STRIPS) {
      expect(strip).toHaveLength(S.N);
      for (let k = 0; k < S.N; k++) expect(strip[k], `${k}`).not.toBe(strip[(k + 1) % S.N]);
    }
    const counts = S.STRIPS.map((strip) => [S.CHERRY, S.LEMON, S.PLUM, S.BELL, S.BAR, S.SEVEN, S.STAR].map((s) => count(strip, s)));
    expect(counts).toEqual([
      [3, 5, 5, 4, 3, 2, 2],
      [3, 5, 5, 4, 3, 2, 2],
      [3, 6, 5, 4, 4, 1, 1],
    ]);
  });
  test("what a line pays: three of a kind, any three high symbols, cherries from the left", () => {
    expect(S.payOf(S.STAR, S.STAR, S.STAR)).toBe(300);
    expect(S.payOf(S.SEVEN, S.SEVEN, S.SEVEN)).toBe(100);
    expect(S.payOf(S.BAR, S.BAR, S.BAR)).toBe(40);
    expect(S.payOf(S.BELL, S.BELL, S.BELL)).toBe(20);
    expect(S.payOf(S.PLUM, S.PLUM, S.PLUM)).toBe(15);
    expect(S.payOf(S.LEMON, S.LEMON, S.LEMON)).toBe(10);
    expect(S.payOf(S.CHERRY, S.CHERRY, S.CHERRY)).toBe(10);
    expect(S.payOf(S.BAR, S.SEVEN, S.STAR)).toBe(S.ANY_HIGH);
    expect(S.payOf(S.CHERRY, S.CHERRY, S.BELL)).toBe(S.TWO_CHERRIES);
    expect(S.payOf(S.CHERRY, S.BELL, S.CHERRY)).toBe(S.ONE_CHERRY);
    // Cherries count from the left only; anything else pays nothing.
    expect(S.payOf(S.BELL, S.CHERRY, S.CHERRY)).toBe(0);
    expect(S.payOf(S.LEMON, S.LEMON, S.PLUM)).toBe(0);
    expect(S.payOf(S.BAR, S.BAR, S.BELL)).toBe(0);
  });
  test("each of the five lines reads its own rows, and only the lines played pay", () => {
    // Sevens in the middle row of every reel: the middle line pays 100 a coin.
    const sevens = [at(0, S.SEVEN), at(1, S.SEVEN), at(2, S.SEVEN)];
    expect(S.evaluate(sevens, 1, 2).wins).toEqual([{ line: 0, pay: 200, symbols: [S.SEVEN, S.SEVEN, S.SEVEN] }]);
    // Each line in turn: stops that put a star on its rows (the stop is the row's place minus its offset).
    S.LINES.forEach((rows, line) => {
      const stops = rows.map((row, reel) => (at(reel, S.STAR) - row + S.N) % S.N);
      const { wins } = S.evaluate(stops, 5, 1);
      expect(wins.find((w) => w.line === line), `line ${line}`).toEqual({ line, pay: 300, symbols: [S.STAR, S.STAR, S.STAR] });
      // With fewer lines played, a line beyond them pays nothing.
      if (line >= 1) expect(S.evaluate(stops, line, 1).wins.find((w) => w.line === line)).toBeUndefined();
    });
    // The rows read the strip around the stop: above is stop - 1, below stop + 1, wrapping round.
    expect(S.symbolAt(0, 0, -1)).toBe(S.STRIPS[0][S.N - 1]);
    expect(S.symbolAt(2, S.N - 1, 1)).toBe(S.STRIPS[2][0]);
  });
  test("the return to the player is 95.37%, the same for 1, 3 and 5 lines, by every stop of the reels", () => {
    const one = S.returnToPlayer(1);
    expect(one).toBeCloseTo(0.9537, 4);
    expect(S.returnToPlayer(3)).toBeCloseTo(one, 9);
    expect(S.returnToPlayer(5)).toBeCloseTo(one, 9);
  });
  test("stops are drawn evenly and the same seed draws the same stops; packed and unpacked", () => {
    const a = S.seeded(42),
      b = S.seeded(42);
    const first = Array.from({ length: 50 }, () => S.drawStops(a)),
      second = Array.from({ length: 50 }, () => S.drawStops(b));
    expect(second).toEqual(first);
    const seen = new Array(S.N).fill(0),
      r = S.seeded(7);
    for (let k = 0; k < 24000; k++) seen[S.drawStops(r)[1]]++;
    for (const n of seen) expect(Math.abs(n - 1000)).toBeLessThan(150);
    for (const stops of first) expect(S.unpackStops(S.packStops(stops))).toEqual(stops);
    expect(S.unpackStops(-1)).toBeNull();
    expect(S.unpackStops(S.N ** 3)).toBeNull();
    expect(S.unpackStops(1.5)).toBeNull();
  });
});

describe("slot machine: the credits", () => {
  test("a spin takes the bet at once and pays its win when the reels rest", () => {
    let s = R.createGame("1000");
    expect(s.credits).toBe(1000);
    s = R.play(s, move(R.BET + 2))!;
    expect(R.stakeOf(s)).toBe(10);
    const sevens = [at(0, S.SEVEN), at(1, S.SEVEN), at(2, S.SEVEN)];
    s = R.play(s, move(R.PULL))!;
    s = R.play(s, move(R.SPIN, S.packStops(sevens)))!;
    expect(s.credits).toBe(990);
    expect(s.pending!.total).toBe(200);
    // Nothing else while the reels turn but a hurried stop and their rest.
    expect(R.play(s, move(R.PULL))).toBeNull();
    expect(R.play(s, move(R.SPIN, 0))).toBeNull();
    expect(R.play(s, move(R.BET + 1))).toBeNull();
    expect(R.play(s, move(R.CASH))).toBeNull();
    s = R.play(s, move(R.HURRY))!;
    s = R.play(s, move(R.SETTLE))!;
    expect(s.credits).toBe(1190);
    expect(s.paid).toBe(200);
    expect(s.won).toBe(200);
    expect(s.staked).toBe(10);
    expect(s.best).toBe(200);
    expect(s.shown).toEqual(sevens);
    expect(R.play(s, move(R.SETTLE))).toBeNull();
  });
  test("every spin's credits add up: start - staked + won", () => {
    let s = R.createGame("300");
    const r = S.seeded(9);
    for (let k = 0; k < 400 && s.winner === null; k++) {
      s = R.play(s, move(R.SPIN, S.packStops(S.drawStops(r))))!;
      s = R.play(s, move(R.SETTLE))!;
      expect(s.credits).toBe(s.start - s.staked + s.won);
      expect(R.stakeOf(s)).toBeLessThanOrEqual(Math.max(s.credits, 1));
    }
  });
  test("bets are limited by the credits; out of credits the game is lost; 정산 ends it, won when ahead", () => {
    let s = { ...R.createGame("300"), credits: 12, lines: 1, bet: 1 };
    expect(R.play(s, move(R.BET + 10))).not.toBeNull();
    expect(R.play({ ...s, lines: 3 }, move(R.BET + 5))).toBeNull();
    expect(R.play(s, move(R.LINES + 5))).not.toBeNull();
    expect(R.play({ ...s, bet: 3 }, move(R.LINES + 5))).toBeNull();
    expect(R.play(s, move(R.LINES + 2))).toBeNull();
    expect(R.play(s, move(R.BET + 4))).toBeNull();
    // 최대 베팅: as many lines as the credits pay for, then the largest bet.
    expect(R.most(12)).toEqual({ lines: 5, bet: 2 });
    expect(R.most(4)).toEqual({ lines: 3, bet: 1 });
    expect(R.most(1)).toEqual({ lines: 1, bet: 1 });
    expect(R.most(0)).toBeNull();
    expect(R.play(s, move(R.MAX))).toMatchObject({ lines: 5, bet: 2 });
    // Cycling buttons skip what the credits do not cover.
    expect(R.nextBet({ ...s, lines: 5, bet: 2 })).toBe(1);
    expect(R.nextLines({ ...s, lines: 5, bet: 3 })).toBe(1);
    expect(R.play({ ...s, lines: 1, bet: 2 }, move(R.LINES))).toMatchObject({ lines: 3 });
    expect(R.play({ ...s, lines: 1, bet: 10 }, move(R.BET))).toMatchObject({ bet: 1 });
    expect(R.play({ ...s, lines: 5, bet: 1 }, move(R.BET))).toMatchObject({ bet: 2 });
    // A spin that leaves too little for the bet brings the bet down, then the lines.
    s = { ...s, lines: 5, bet: 2, credits: 10 };
    let blank = [0, 0, 0];
    for (let k = 0; S.evaluate(blank, 5, 2).total > 0; k++) blank = [k % S.N, Math.floor(k / S.N) % S.N, 5];
    expect(S.evaluate(blank, 5, 2).total).toBe(0);
    s = R.play(R.play(s, move(R.SPIN, S.packStops(blank)))!, move(R.SETTLE))!;
    expect(s.credits).toBe(0);
    expect(s.winner).toBe(1);
    expect(R.moves(s)).toEqual([]);
    // 정산 ahead is a win, behind a loss.
    expect(R.play({ ...R.createGame("300"), credits: 301 }, move(R.CASH))).toMatchObject({ winner: 0, cashed: true });
    expect(R.play({ ...R.createGame("300"), credits: 300 }, move(R.CASH))).toMatchObject({ winner: 1 });
    // A spin the credits cannot pay for is refused.
    expect(R.play({ ...R.createGame("300"), credits: 4, lines: 5, bet: 1 }, move(R.SPIN, 0))).toBeNull();
    expect(R.play({ ...R.createGame("300"), credits: 4, lines: 5, bet: 1 }, move(R.PULL))).toBeNull();
  });
});
