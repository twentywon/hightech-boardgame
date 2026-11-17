import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as D from "../src/games/darts/rules";
import { CENTRE, GAIN, LEAST, boardPoint, swipe, swipeFor } from "../src/games/darts/layout";

/** A point at `radius` millimetres in the middle of the segment of number `n`. */
function at(n: number, radius: number) {
  const a = (D.ORDER.indexOf(n) * 18 * Math.PI) / 180;
  return { x: Math.sin(a) * radius, y: Math.cos(a) * radius };
}
/** A throw that lands exactly where it is aimed (no scatter, no random). */
const exact = (x: number, y: number) => ({ from: -1, to: D.aimCode(x, y), extra: 0 });
const throwAt = (state: D.State, n: number, radius: number) => {
  const p = at(n, radius);
  return D.play(state, exact(p.x, p.y))!;
};
const bed = (name: string) => D.target(name);
const hit = (state: D.State, name: string) => D.play(state, exact(bed(name).x, bed(name).y))!;
describe("darts", () => {
  test("every ring of every segment scores as the board says, in the classic order", () => {
    expect(D.ORDER).toEqual([20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]);
    for (const n of D.ORDER) {
      const inner = D.hitAt(at(n, 60).x, at(n, 60).y),
        treble = D.hitAt(at(n, 103).x, at(n, 103).y),
        outer = D.hitAt(at(n, 135).x, at(n, 135).y),
        double = D.hitAt(at(n, 166).x, at(n, 166).y),
        miss = D.hitAt(at(n, 190).x, at(n, 190).y);
      expect([inner.ring, inner.points, inner.label, inner.double]).toEqual(["single", n, String(n), false]);
      expect([treble.ring, treble.points, treble.label, treble.double]).toEqual(["treble", n * 3, `T${n}`, false]);
      expect([outer.ring, outer.points]).toEqual(["single", n]);
      expect([double.ring, double.points, double.label, double.double]).toEqual(["double", n * 2, `D${n}`, true]);
      expect([miss.ring, miss.points, miss.label]).toEqual(["miss", 0, "MISS"]);
      // Either edge of a segment, a degree inside it, still counts for it.
      for (const edge of [-8.5, 8.5]) {
        const a = ((D.ORDER.indexOf(n) * 18 + edge) * Math.PI) / 180;
        expect(D.segmentAt(Math.sin(a) * 80, Math.cos(a) * 80)).toBe(n);
      }
    }
    // The ring edges: inner edges belong to the ring, outer edges too.
    expect(D.hitAt(0, 99).ring).toBe("treble");
    expect(D.hitAt(0, 107).ring).toBe("treble");
    expect(D.hitAt(0, 98.9).ring).toBe("single");
    expect(D.hitAt(0, 162).ring).toBe("double");
    expect(D.hitAt(0, 170).ring).toBe("double");
    expect(D.hitAt(0, 170.1).ring).toBe("miss");
    // The bulls: 50 counts as a double, 25 does not.
    expect([D.hitAt(0, 0).points, D.hitAt(0, 0).double, D.hitAt(3, 3).label]).toEqual([50, true, "BULL"]);
    expect([D.hitAt(0, 10).points, D.hitAt(0, 10).double, D.hitAt(-10, 0).label]).toEqual([25, false, "25"]);
    // Where the numbers sit: 6 at the right, 3 at the bottom, 11 at the left.
    expect(D.segmentAt(100, 0)).toBe(6);
    expect(D.segmentAt(0, -100)).toBe(3);
    expect(D.segmentAt(-100, 0)).toBe(11);
    // Beyond the cabinet a dart falls and scores nothing.
    expect(D.hitAt(400, 0).fell).toBe(true);
    expect(D.hitAt(200, 0).fell).toBe(false);
  });
  test("a throw is decided in play from the random passed in, the same draws landing the same dart", () => {
    const start = D.createGame("501"),
      move = { from: -1, to: D.aimCode(0, 103), extra: 22 },
      a = D.play(start, move, seededRandom(9))!,
      b = D.play(start, move, seededRandom(9))!,
      c = D.play(start, move, seededRandom(10))!;
    expect(a.last).toEqual(b.last);
    expect(a.last).not.toEqual(c.last);
    // Without random it lands where aimed; with no scatter too.
    expect(D.play(start, move)!.last!.label).toBe("T20");
    expect(D.play(start, { ...move, extra: 0 }, seededRandom(3))!.last!.label).toBe("T20");
    // The scatter is about as wide as asked.
    const random = seededRandom(5);
    let sum = 0;
    for (let k = 0; k < 2000; k++) {
      const dart = D.play(start, { from: -1, to: D.aimCode(0, 0), extra: 20 }, random)!.last!;
      sum += dart.x * dart.x + dart.y * dart.y;
    }
    expect(Math.sqrt(sum / 2000 / 2)).toBeGreaterThan(17);
    expect(Math.sqrt(sum / 2000 / 2)).toBeLessThan(23);
    // Refused: a piece moved, a scatter out of range, a point out of reach, a game over; the input is never changed.
    expect(D.play(start, { ...move, from: 3 })).toBeNull();
    expect(D.play(start, { ...move, extra: -1 })).toBeNull();
    expect(D.play(start, { ...move, extra: D.MAX_SPREAD + 1 })).toBeNull();
    expect(D.play(start, { ...move, to: -5 })).toBeNull();
    expect(start).toEqual(D.createGame("501"));
    expect(D.aimOf(D.aimCode(-37, 151))).toEqual({ x: -37, y: 151 });
  });
  test("501: three darts a visit come off the score, then the turn passes", () => {
    let s = D.createGame("501");
    s = hit(s, "T20");
    expect([s.scores[0], s.turn, s.darts.length, s.ended]).toEqual([441, 0, 1, false]);
    s = hit(s, "T20");
    s = hit(s, "T20");
    expect([s.scores[0], s.turn, s.darts.length, s.ended, s.bust]).toEqual([321, 1, 0, true, false]);
    expect(s.visits[0]).toHaveLength(1);
    expect([s.visits[0][0].total, s.visits[0][0].after]).toEqual([180, 321]);
    expect(s.start).toBe(501);
    s = hit(s, "19");
    expect([s.scores, s.turn]).toEqual([[321, 482], 1]);
  });
  test("501: a bust (below nothing, one left, or nothing without a double) counts nothing and passes the turn at once", () => {
    const at = (left: number): D.State => ({ ...D.createGame("501"), scores: [left, 501], start: left });
    // Below nothing.
    let s = hit(at(30), "T20");
    expect([s.scores[0], s.turn, s.bust, s.ended]).toEqual([30, 1, true, true]);
    expect(s.visits[0][0]).toMatchObject({ bust: true, total: 0, after: 30 });
    // Exactly one left, after a dart already scored: the whole visit goes.
    s = hit(at(40), "19");
    expect(s.scores[0]).toBe(21);
    s = hit(s, "20");
    expect([s.scores[0], s.turn, s.bust]).toEqual([40, 1, true]);
    // Nothing, but not on a double.
    s = hit(at(20), "20");
    expect([s.scores[0], s.bust, s.winner]).toEqual([20, true, null]);
    s = hit(at(50), "T10");
    s = hit(s, "20");
    expect([s.scores[0], s.bust]).toEqual([50, true]);
    // Nothing on a double, or on the bull, wins.
    const won = hit(at(32), "D16");
    expect([won.scores[0], won.winner, won.ended, won.bust]).toEqual([0, 0, true, false]);
    expect(D.moves(won)).toHaveLength(0);
    expect(D.play(won, exact(0, 0))).toBeNull();
    expect(hit(at(50), "BULL").winner).toBe(0);
    // 25 on the outer bull is not a double.
    expect(hit(at(25), "25").bust).toBe(true);
    // A checkout after a scoring dart in the same visit.
    s = hit(at(60), "20");
    s = hit(s, "D20");
    expect(s.winner).toBe(0);
    expect(D.darts.reason(s)).toContain("D20");
  });
  test("count-up: eight rounds of three, every dart adds, the higher total wins or it is a draw", () => {
    let s = D.createGame("countup");
    for (let round = 0; round < D.ROUNDS; round++)
      for (const side of [0, 1])
        for (let k = 0; k < 3; k++) {
          expect(s.winner).toBeNull();
          expect(s.turn).toBe(side);
          s = side === 0 ? hit(s, "T20") : throwAt(s, 19, 135);
        }
    expect(s.scores).toEqual([8 * 180, 8 * 57]);
    expect(s.visits[0].map((v) => v.after)).toEqual(Array.from({ length: 8 }, (_, k) => (k + 1) * 180));
    expect(s.winner).toBe(0);
    expect(D.darts.reason(s)).toContain(`${8 * 180} 대 ${8 * 57}`);
    // Nothing is bust in count-up; a draw when the totals are the same.
    let t = D.createGame("countup");
    for (let k = 0; k < D.ROUNDS * 6; k++) t = hit(t, k % 3 === 1 ? "BULL" : "20");
    expect(t.winner).toBe("draw");
    expect(t.visits[0].every((v) => !v.bust)).toBe(true);
  });
  test("the checkout table knows the usual ways out, and the computer goes for them", () => {
    const names = (left: number, darts: number) => D.checkout(left, darts)?.map((t) => t.name).join(" ") ?? null;
    expect(names(170, 3)).toBe("T20 T20 BULL");
    expect(names(100, 2)).toBe("T20 D20");
    expect(names(40, 1)).toBe("D20");
    expect(names(32, 3)).toBe("D16");
    expect(names(50, 1)).toBe("BULL");
    for (const bogey of [169, 168, 166, 165, 163, 162, 159]) expect(names(bogey, 3)).toBeNull();
    expect(names(41, 1)).toBeNull();
    // Every route ends on a double and adds up.
    const table = D.checkouts();
    for (let darts = 1; darts <= 3; darts++)
      for (let left = 2; left <= 170; left++) {
        const route = table[darts][left];
        if (!route) continue;
        expect(route.length).toBeLessThanOrEqual(darts);
        expect(route.reduce((s, t) => s + t.points, 0)).toBe(left);
        expect(route[route.length - 1].double).toBe(true);
      }
    const at = (left: number, thrown = 0): D.State => ({ ...D.createGame("501"), scores: [left, 501], start: left, darts: Array.from({ length: thrown }, () => D.hitAt(0, -300)) });
    expect(D.aimFor(at(501)).name).toBe("T20");
    expect(D.aimFor(at(100, 1)).name).toBe("T20");
    expect(D.aimFor(at(40, 2)).name).toBe("D20");
    // One dart left and no way out: a single that leaves a double.
    const setup = D.aimFor(at(41, 2));
    expect(setup.double).toBe(false);
    expect([32, 40, 16, 20, 24, 36, 8, 12].includes(41 - setup.points)).toBe(true);
    // Never a bed that would bust.
    for (let left = 2; left <= 501; left++)
      for (let thrown = 0; thrown < 3; thrown++) {
        const t = D.aimFor(at(left, thrown));
        expect(left - t.points === 0 ? t.double : left - t.points >= 2).toBe(true);
      }
    expect(D.aimFor(D.createGame("countup")).name).toBe("T20");
  });
  test("the computer's throws are legal at every level, scatter by level, and a game between computers ends", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const move = D.chooseThrow(D.createGame("501"), level)!;
      expect(move.from).toBe(-1);
      expect(move.extra).toBe(D.LEVELS[level].spread);
      expect(D.aimOf(move.to)).toEqual({ x: Math.round(D.target("T20").x), y: Math.round(D.target("T20").y) });
      expect(D.play(D.createGame("501"), move, seededRandom(1))).not.toBeNull();
    }
    expect(D.LEVELS.easy.spread).toBeGreaterThan(D.LEVELS.normal.spread);
    expect(D.LEVELS.normal.spread).toBeGreaterThan(D.LEVELS.hard.spread);
    // Whole games, 501 and count-up, between two computers.
    for (const [mode, level, seed] of [["501", "hard", 1], ["501", "normal", 2], ["501", "easy", 3], ["countup", "normal", 4]] as const) {
      const random = seededRandom(seed);
      let s = D.createGame(mode),
        throws = 0;
      while (s.winner === null) {
        const move = D.darts.choose!(s, level, random)!;
        const next = D.darts.play(s, move, random);
        expect(next).not.toBeNull();
        expect(next!.ply).toBe(s.ply + 1);
        s = next!;
        expect(s.scores.every((v) => v >= 0)).toBe(true);
        expect(++throws).toBeLessThanOrEqual(2 * 3 * D.LIMIT);
      }
      if (mode === "countup") expect(throws).toBe(2 * 3 * D.ROUNDS);
      expect(D.darts.reason(s).length).toBeGreaterThan(5);
    }
    // Hard computers mostly finish 501 well before the limit.
    let finished = 0;
    for (let seed = 10; seed < 30; seed++) {
      const random = seededRandom(seed);
      let s = D.createGame("501");
      while (s.winner === null) s = D.play(s, D.chooseThrow(s, "hard")!, random)!;
      if (s.scores.includes(0)) finished++;
    }
    expect(finished).toBeGreaterThanOrEqual(18);
  });
  test("a swipe up aims by its slant and length, the way swipeFor says", () => {
    const h = 800;
    expect(swipe(0, 30, h)).toBeNull();
    expect(swipe(0, -LEAST * h * 0.5, h)).toBeNull();
    expect(swipe(0, -CENTRE * h, h)).toEqual({ x: 0, y: 0 });
    for (const [x, y] of [[0, 103], [-80, -40], [120, 160], [0, 0]]) {
      const s = swipeFor(x, y, h),
        aim = swipe(s.dx, s.dy, h)!;
      expect(aim.x).toBeCloseTo(x);
      expect(aim.y).toBeCloseTo(y);
    }
    // Longer is higher, slanted right is to the right.
    expect(swipe(0, -0.45 * h, h)!.y).toBeGreaterThan(swipe(0, -0.35 * h, h)!.y);
    expect(swipe(60, -0.3 * h, h)!.x).toBeGreaterThan(0);
    expect(GAIN).toBeGreaterThan(0);
    // The bull is the board's middle in the world.
    expect(boardPoint(0, 0).y).toBeCloseTo(0);
  });
});
