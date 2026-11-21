import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as R from "../src/games/tuho/rules";
import { ARROW_R, HOLES, LEAN_MAX, fly } from "../src/games/tuho/sim";
import { CENTRE, LEAST, TREMOR, gesture, pullFor, tremor } from "../src/games/tuho/layout";

const throwOf = (yaw: number, speed: number) => ({ from: -1, to: R.throwCode(yaw, speed), extra: 0 });
const mouth = R.IDEAL[0];
/** The first throw on a grid round the mouth's that comes to `outcome` (and has struck a rim, when asked). */
function find(outcome: string, rimmed?: boolean) {
  for (let ds = -0.2; ds <= 0.2; ds += 0.005)
    for (let dy = -0.06; dy <= 0.06; dy += 0.005) {
      const aim = R.throwOf(R.throwCode(mouth.yaw + dy, mouth.speed + ds))!,
        f = fly(aim.yaw, aim.speed);
      if (f.outcome === outcome && (rimmed === undefined || f.rimmed === rimmed)) return aim;
    }
  throw new Error(`no ${outcome}`);
}
/** Plays `n` throws, each side throwing at the mouth. */
function throws(state: R.State, n: number) {
  for (let k = 0; k < n; k++) state = R.play(state, throwOf(mouth.yaw, mouth.speed))!;
  return state;
}
describe("tuho", () => {
  test("a flight is the same every time, and a scattered throw with the same draws lands the same", () => {
    const a = fly(mouth.yaw + 0.013, mouth.speed + 0.09, true),
      b = fly(mouth.yaw + 0.013, mouth.speed + 0.09, true);
    expect(a).toEqual(b);
    const move = { from: -1, to: R.throwCode(mouth.yaw, mouth.speed), extra: 30 },
      one = R.play(R.createGame(), move, seededRandom(5))!,
      two = R.play(R.createGame(), move, seededRandom(5))!;
    expect(one).toEqual(two);
    // What is recorded flies to the same end again.
    expect(fly(one.last!.yaw, one.last!.speed).outcome).toBe(one.last!.outcome);
    // A person's throw carries no scatter: with or without draws it is the same.
    expect(R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed), seededRandom(9))).toEqual(R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed)));
  });
  test("throws are kept to a hundred-thousandth of a radian and a millimetre a second", () => {
    for (const [yaw, speed] of [[0, 4.2], [-0.12345, 5.678], [0.3, 2.5]]) {
      const back = R.throwOf(R.throwCode(yaw, speed))!;
      expect(back.yaw).toBeCloseTo(yaw, 5);
      expect(back.speed).toBeCloseTo(speed, 3);
    }
    expect(R.throwOf(-1)).toBeNull();
    expect(R.play(R.createGame(), { from: 0, to: R.throwCode(0, 4), extra: 0 })).toBeNull();
    expect(R.play(R.createGame(), { from: -1, to: R.throwCode(0, 4), extra: R.MAX_SPREAD + 1 })).toBeNull();
  });
  test("an arrow standing in the mouth scores 10 and one in an ear 20", () => {
    const inMouth = R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed))!;
    expect([inMouth.last!.outcome, inMouth.last!.points, inMouth.scores]).toEqual(["mouth", R.POINTS.mouth, [10, 0]]);
    expect(R.POINTS.ear).toBeGreaterThan(R.POINTS.mouth);
    for (const k of [1, 2]) {
      const ear = R.play(R.createGame(), throwOf(R.IDEAL[k].yaw, R.IDEAL[k].speed))!;
      expect([ear.last!.outcome, ear.last!.hole, ear.last!.points]).toEqual(["ear", k, 20]);
      // It stands in its ear: the point below the rim, inside the tube.
      const tip = ear.last!.rest.tip,
        hole = HOLES[k];
      expect(tip.y).toBeLessThan(hole.top);
      expect(Math.hypot(tip.x - hole.x, tip.z - hole.z)).toBeLessThan(hole.inner);
    }
    const tip = inMouth.last!.rest.tip;
    expect(Math.hypot(tip.x, tip.z)).toBeLessThan(HOLES[0].inner);
    expect(Math.acos(-inMouth.last!.rest.dir.y)).toBeLessThanOrEqual(LEAN_MAX);
  });
  test("an arrow leaning against the rim, one bounced out and one on the ground score nothing", () => {
    const lean = find("lean"),
      leaning = R.play(R.createGame(), throwOf(lean.yaw, lean.speed))!.last!;
    expect([leaning.outcome, leaning.points]).toEqual(["lean", 0]);
    // It leans steeply, its point in the hole.
    expect(Math.acos(-leaning.rest.dir.y)).toBeGreaterThan(0.6);
    const bounced = find("miss", true),
      out = R.play(R.createGame(), throwOf(bounced.yaw, bounced.speed))!.last!;
    expect([out.outcome, out.rimmed, out.points]).toEqual(["miss", true, 0]);
    for (const ds of [-0.5, 0.6]) {
      const miss = R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed + ds))!.last!;
      expect([miss.outcome, miss.points]).toEqual(["miss", 0]);
      // It lies flat on the ground, clear of the pot.
      expect(miss.rest.tip.y).toBeCloseTo(ARROW_R, 6);
      expect(miss.rest.dir.y).toBe(0);
      expect(Math.hypot(miss.rest.tip.x, miss.rest.tip.z)).toBeGreaterThan(0.2);
    }
    // Short falls before the pot, long beyond it.
    expect(R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed - 0.5))!.last!.rest.tip.z).toBeGreaterThan(0);
    expect(R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed + 0.6))!.last!.rest.tip.z).toBeLessThan(0);
  });
  test("the sides throw in turn, ten arrows each; the round's arrows are gathered and the higher total wins", () => {
    let state = R.createGame(1);
    const order: number[] = [];
    for (let k = 0; k < R.ARROWS * 2; k++) {
      order.push(state.turn);
      expect(state.winner).toBeNull();
      // Side 0 throws at the mouth, side 1 short.
      state = R.play(state, throwOf(mouth.yaw, state.turn === 0 ? mouth.speed : mouth.speed - 0.5))!;
      if (k < R.ARROWS * 2 - 1) expect(state.arrows.length).toBe(k + 1);
    }
    expect(order).toEqual(Array.from({ length: 20 }, (_, k) => k % 2));
    expect(state.cleared).toBe(true);
    expect(state.arrows).toEqual([]);
    expect(state.scores).toEqual([100, 0]);
    expect(state.history).toEqual([[100, 0]]);
    expect(state.winner).toBe(0);
    expect(state.ply).toBe(20);
    expect(R.play(state, throwOf(mouth.yaw, mouth.speed))).toBeNull();
    expect(R.tuho.reason(state)).toMatch(/^합계 100 대 0점입니다\./);
  });
  test("three rounds: the other side begins each round, totals add up, and equal totals are a draw", () => {
    let state = R.createGame(R.roundsOf("3"));
    expect(state.rounds).toBe(3);
    state = throws(state, 20);
    expect([state.round, state.starter, state.turn, state.winner, state.history]).toEqual([2, 1, 1, null, [[100, 100]]]);
    state = throws(state, 20);
    expect([state.round, state.turn]).toEqual([3, 0]);
    state = throws(state, 20);
    expect(state.scores).toEqual([300, 300]);
    expect(state.winner).toBe("draw");
    expect(R.tuho.reason(state)).toMatch(/무승부/);
    expect(R.roundsOf("1")).toBe(1);
  });
  test("the computer weighs throws through the flight; the harder its level, the more it scores", () => {
    const rates = (["easy", "normal", "hard"] as const).map((level, i) => {
      const move = R.chooseThrow(R.createGame(), level)!;
      expect(move.extra).toBe(R.LEVELS[level].spread);
      const random = seededRandom(100 + i);
      let points = 0,
        hits = 0;
      for (let k = 0; k < 160; k++) {
        const last = R.play(R.createGame(), move, random)!.last!;
        points += last.points;
        if (last.points) hits++;
      }
      return { points: points / 160, hits: hits / 160 };
    });
    expect(rates[0].points).toBeLessThan(rates[1].points);
    expect(rates[1].points).toBeLessThan(rates[2].points);
    expect(rates[0].hits).toBeLessThan(rates[1].hits);
    expect(rates[1].hits).toBeLessThan(rates[2].hits);
    expect(rates[0].hits).toBeGreaterThan(0.15);
    expect(rates[2].hits).toBeGreaterThan(0.6);
    // With no scatter its throw goes in.
    const steady = R.chooseThrow(R.createGame(), "hard")!;
    expect(R.play(R.createGame(), { ...steady, extra: 0 })!.last!.points).toBeGreaterThan(0);
  });
  test("a pull or a swipe sets the throw; a straight pull of the centre length throws at the mouth; the hand trembles a little", () => {
    const height = 860,
      straight = gesture(0, CENTRE * height, height)!;
    expect(straight.yaw).toBeCloseTo(mouth.yaw, 9);
    expect(straight.speed).toBeCloseTo(mouth.speed, 9);
    // Pushed up the same length, the same throw.
    expect(gesture(0, -CENTRE * height, height)).toEqual(straight);
    expect(gesture(0, (LEAST / 2) * height, height)).toBeNull();
    for (const [yaw, speed] of [[mouth.yaw, mouth.speed], [R.IDEAL[1].yaw, R.IDEAL[1].speed], [0.04, 4.6]]) {
      const pull = pullFor(yaw, speed, height),
        back = gesture(pull.dx, pull.dy, height)!;
      expect(back.yaw).toBeCloseTo(yaw, 6);
      expect(back.speed).toBeCloseTo(speed, 6);
    }
    // Pulled down and to the right, it goes left.
    expect(gesture(80, 250, height)!.yaw).toBeLessThan(mouth.yaw);
    let most = { yaw: 0, speed: 0 };
    for (let t = 0; t < 20; t += 0.05) {
      const off = tremor(t, 3.7);
      most = { yaw: Math.max(most.yaw, Math.abs(off.yaw)), speed: Math.max(most.speed, Math.abs(off.speed)) };
    }
    expect(most.yaw).toBeGreaterThan(TREMOR.yaw * 0.5);
    expect(most.yaw).toBeLessThan(TREMOR.yaw * 4);
    expect(most.speed).toBeLessThan(TREMOR.speed * 4);
    expect(tremor(1.234, 8)).toEqual(tremor(1.234, 8));
  });
});
