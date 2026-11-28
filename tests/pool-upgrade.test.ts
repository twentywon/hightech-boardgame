import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import { pointRules } from "../src/net/points";
import { poolConfig } from "../src/games/pool/config";
import { ARENA, CUE, FOOT, NINE, R, createGame, isNine, lowest, pool, settleFirst, type State } from "../src/games/pool/rules";
import { copy, settle, shotCode, strike, type Disc } from "../src/games/flick/physics";
import { pocketArc, pocketRest } from "../src/games/pool/table";

/*
 * The pocket-ball upgrade: nine-ball as a second variant ("nine"; "" is eight-ball exactly as before), the shot's
 * first ball told by `settleFirst` (the same slices as `settle`), and the table's pockets laid from the physics'
 * pocket circles.
 */
const ball = (id: number, x: number, z: number): Disc => ({ id, x, z, vx: 0, vz: 0, r: R, m: 1, on: true });
/** A nine-ball state with only the balls given on the table (the others already down). */
function laid(balls: [number, number, number][], cue: [number, number]): State {
  const start = createGame("nine"),
    discs = start.discs.map((d) => {
      if (d.id === CUE) return ball(CUE, cue[0], cue[1]);
      const at = balls.find(([id]) => id === d.id);
      return at ? ball(d.id, at[1], at[2]) : { ...ball(d.id, 0, 0), on: false };
    });
  return { ...start, discs };
}
/** The whole degrees from (x, z) toward (tx, tz), as a shot is told. */
const toward = (x: number, z: number, tx: number, tz: number) => (Math.atan2(tz - z, tx - x) * 180) / Math.PI;
/** A shot from the cue ball through `id` (straight in line) toward a pocket, the cue ball set behind it on that line. */
function lineUp(id: number, x: number, z: number, pocket: { x: number; z: number }, back = 1) {
  const d = Math.hypot(x - pocket.x, z - pocket.z),
    ux = (x - pocket.x) / d,
    uz = (z - pocket.z) / d;
  return { cue: [x + ux * back, z + uz * back] as [number, number], degrees: toward(x + ux * back, z + uz * back, pocket.x, pocket.z), id };
}
const corner = ARENA.pockets.find((p) => p.x < 0 && p.z < 0)!;

describe("pocket ball: eight-ball is as it was", () => {
  test("the default variant lays the old rack, and its states carry nothing of nine-ball", () => {
    const state = pool.create("");
    expect(state).toEqual(createGame());
    expect(state.discs).toHaveLength(16);
    expect(Object.keys(state).sort()).toEqual(["discs", "foul", "groups", "hand", "last", "placed", "ply", "sunk", "turn", "winner"]);
    const after = pool.play(state, pool.choose!(state, "hard", seededRandom(4))!)!;
    expect("nine" in after || "potted" in after || "first" in after).toBe(false);
    expect(isNine("")).toBe(false);
  });
  test("the first ball struck is told without changing how a shot ends", () => {
    for (const degrees of [268, 270, 275, 300, 45]) {
      const a = copy(createGame().discs),
        b = copy(a);
      strike(a[CUE], (degrees * Math.PI) / 180, 8);
      strike(b[CUE], (degrees * Math.PI) / 180, 8);
      const plain = settle(a, ARENA),
        told = settleFirst(b, ARENA);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      expect([told.gone, told.steps]).toEqual([plain.gone, plain.steps]);
    }
    // Straight up the table the cue ball meets the front ball of the rack first.
    const discs = copy(createGame().discs);
    strike(discs[CUE], (270 * Math.PI) / 180, 8);
    expect(settleFirst(discs, ARENA).first).toBe(1);
    // Away from every ball it meets none.
    const empty = copy(createGame().discs);
    strike(empty[CUE], (90 * Math.PI) / 180, 2);
    expect(settleFirst(empty, ARENA).first).toBeNull();
  });
});

describe("pocket ball: nine-ball", () => {
  test("nine balls in a diamond, the one on the foot spot and the nine in the middle", () => {
    const state = pool.create("nine");
    expect(state.nine).toBe(true);
    expect(state.discs.map((d) => d.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const one = state.discs[1],
      nine = state.discs[NINE],
      eight = state.discs[8];
    expect([one.x, one.z]).toEqual([FOOT.x, FOOT.z]);
    expect(nine.x).toBeCloseTo(0, 9);
    expect(nine.z).toBeCloseTo((one.z + eight.z) / 2, 9);
    expect(lowest(state)).toBe(1);
    expect(pool.tally(state)).toEqual(["넣은 공 0개 · 다음 1번", "넣은 공 0개 · 다음 1번"]);
  });
  test("a ball down on a fair shot earns another; the lowest ball must be struck first", () => {
    const { cue, degrees } = lineUp(1, -1.6, -3.6, corner),
      state = laid([[1, -1.6, -3.6], [2, 1.5, 1.5], [9, 1.8, -3]], cue),
      next = pool.play(state, { from: CUE, to: shotCode(degrees, 9), extra: -1 })!;
    expect(next.sunk).toEqual([1]);
    expect([next.first, next.foul, next.turn, next.hand, next.winner]).toEqual([1, false, 0, false, null]);
    expect(next.potted).toEqual([1, 0]);
    expect(lowest(next)).toBe(2);
    // The same shot with the one and the two changing places: the two is struck first, a foul, and the cue ball is the other's in hand.
    const behind = laid([[2, -1.6, -3.6], [1, 1.5, 1.5], [9, 1.8, -3]], cue),
      foul = pool.play(behind, { from: CUE, to: shotCode(degrees, 9), extra: -1 })!;
    expect([foul.first, foul.foul, foul.turn, foul.hand, foul.placed]).toEqual([2, true, 1, true, false]);
    expect(pool.hint(foul)).toContain("1번보다 2번을 먼저 맞혔습니다");
    expect(pool.hint(foul)).toContain("흰 공을 끌어 원하는 곳에 놓으세요");
    // A miss of everything is a foul too.
    const missed = pool.play(behind, { from: CUE, to: shotCode(degrees + 180, 3), extra: -1 })!;
    expect([missed.first, missed.foul, missed.turn, missed.hand]).toEqual([null, true, 1, true]);
  });
  test("the nine down on a fair shot wins, even early; down on a foul it comes back to the foot spot", () => {
    // The one is struck first and drives the nine, frozen in front of it, into the corner.
    const gap = R * 2 + 0.004,
      d = Math.hypot(-1.6 - corner.x, -3.6 - corner.z),
      ux = (-1.6 - corner.x) / d,
      uz = (-3.6 - corner.z) / d,
      { cue, degrees } = lineUp(1, -1.6 + ux * gap, -3.6 + uz * gap, corner),
      combo = laid([[9, -1.6, -3.6], [1, -1.6 + ux * gap, -3.6 + uz * gap], [3, 1.5, 2]], cue),
      won = pool.play(combo, { from: CUE, to: shotCode(degrees, 10), extra: -1 })!;
    expect(won.sunk).toContain(NINE);
    expect([won.first, won.foul, won.winner]).toEqual([1, false, 0]);
    expect(pool.reason!(won)).toBe("반칙 없이 9번을 넣었습니다.");
    // The same with the three in front of the nine and the one elsewhere: the wrong ball first, so the nine is spotted.
    const wrong = laid([[9, -1.6, -3.6], [3, -1.6 + ux * gap, -3.6 + uz * gap], [1, 1.5, 2]], cue),
      fouled = pool.play(wrong, { from: CUE, to: shotCode(degrees, 10), extra: -1 })!;
    expect(fouled.sunk).toContain(NINE);
    expect([fouled.first, fouled.foul, fouled.winner, fouled.spotted, fouled.turn, fouled.hand]).toEqual([3, true, null, true, 1, true]);
    const nine = fouled.discs[NINE];
    expect([nine.on, nine.x, nine.z]).toEqual([true, FOOT.x, FOOT.z]);
    expect(fouled.potted).toEqual([0, 0]);
    expect(pool.hint(fouled)).toContain("9번은 풋 스폿으로 돌아왔습니다");
  });
  test("the cue ball down is a foul that brings it back, in hand for the other side", () => {
    const state = laid([[1, 1.5, 0], [9, -1, -2]], [1.9, 4.3]),
      next = pool.play(state, { from: CUE, to: shotCode(45, 8), extra: -1 })!;
    expect(next.sunk).toContain(CUE);
    expect([next.foul, next.turn, next.hand, next.discs[CUE].on]).toEqual([true, 1, true, true]);
    expect(pool.hint(next)).toContain("흰 공이 빠졌습니다");
  });
  test("two computers play nine-ball out with legal shots, and a room lays the variant it was given", () => {
    let state = pool.create("nine");
    const random = seededRandom(11);
    let plies = 0;
    while (pool.winner(state) === null && plies < 300) {
      const move = pool.choose!(state, plies % 2 ? "hard" : "normal", random)!,
        before = JSON.stringify(state),
        next = pool.play(state, move);
      expect(next).not.toBeNull();
      expect(JSON.stringify(state)).toBe(before);
      state = next!;
      plies++;
    }
    expect(state.winner).not.toBeNull();
    expect(state.discs[NINE].on).toBe(false);
    const rules = pointRules(pool, poolConfig.net!),
      seats = [{ kind: "person" }, { kind: "person" }],
      start = (variant: string) => rules.create({ variant, options: {}, seats } as unknown as Parameters<typeof rules.create>[0], seededRandom(1));
    expect(start("nine").discs).toHaveLength(10);
    expect(start("").discs).toHaveLength(16);
    expect(start("")).toEqual(createGame());
  });
});

describe("pocket ball: the table", () => {
  test("each pocket's hole meets the cushions' backs on both sides, and its balls rest inside it", () => {
    for (const p of ARENA.pockets) {
      for (const inside of [true, false]) {
        const { points } = pocketArc(p, inside);
        expect(points.length).toBeGreaterThan(3);
        for (const q of points) expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeCloseTo(p.r, 6);
      }
      for (let k = 0; k < 4; k++) {
        const rest = pocketRest(p, k, R)!;
        expect(Math.hypot(rest.x - p.x, rest.z - p.z) + R).toBeLessThanOrEqual(p.r + 1e-9);
        expect(rest.y).toBeLessThan(0.05);
      }
      expect(pocketRest(p, 4, R)).toBeNull();
    }
  });
});
