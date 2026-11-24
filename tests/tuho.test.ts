import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as R from "../src/games/tuho/rules";
import { ARROW_LENGTH, ARROW_R, BALANCE, HOLES, LEAN_MAX, MASS, POINT_MASS, SAMPLE, fly, judge, sunk, type Flight, type Pose } from "../src/games/tuho/sim";
import { CENTRE, LEAST, TREMOR, gesture, pullFor, tremor } from "../src/games/tuho/layout";

const throwOf = (yaw: number, speed: number) => ({ from: -1, to: R.throwCode(yaw, speed), extra: 0 });
const mouth = R.ideal()[0];
const lean = (pose: Pose) => Math.acos(-pose.dir.y);
/** Every throw on a grid round the mouth's, as a move would name it. */
function* grid(ds = 0.006, dy = 0.004) {
  for (let s = -0.16; s <= 0.16 + 1e-9; s += ds) for (let y = -0.05; y <= 0.05 + 1e-9; y += dy) yield R.throwOf(R.throwCode(mouth.yaw + y, mouth.speed + s))!;
}
/** The first throw on the grid (among `others`) whose whole flight answers `want`; quick flights pick the candidates. */
function find(want: (f: Flight) => boolean, others: Pose[] = [], quickly?: (f: Flight) => boolean) {
  for (const aim of grid()) {
    if (quickly && !quickly(fly(aim.yaw, aim.speed, { others, quick: true }))) continue;
    const f = fly(aim.yaw, aim.speed, { others });
    if (want(f)) return { aim, flight: f };
  }
  throw new Error("no such throw");
}
/** A pot with a few arrows standing in the mouth, thrown round the middle. */
function filled(count: number) {
  const others: Pose[] = [];
  const random = seededRandom(4);
  for (let k = 0; k < count; k++) others.push(fly(mouth.yaw + (random() - 0.5) * 0.03, mouth.speed + (random() - 0.5) * 0.08, { others }).rest);
  return others;
}
describe("tuho", () => {
  test("the arrow is heavy at the point: its centre of mass lies in the front quarter", () => {
    expect(POINT_MASS / MASS).toBeGreaterThan(0.5);
    expect(BALANCE).toBeGreaterThan(0.1);
    expect(BALANCE).toBeLessThan(ARROW_LENGTH / 4);
  });
  test("a flight is the same every time, among the same arrows too, and a scattered throw with the same draws lands the same", () => {
    const a = fly(mouth.yaw + 0.013, mouth.speed + 0.03, { record: true }),
      b = fly(mouth.yaw + 0.013, mouth.speed + 0.03, { record: true });
    expect(a).toEqual(b);
    const others = filled(4);
    expect(fly(mouth.yaw, mouth.speed, { record: true, others })).toEqual(fly(mouth.yaw, mouth.speed, { record: true, others }));
    const move = { from: -1, to: R.throwCode(mouth.yaw, mouth.speed), extra: 30 },
      one = R.play(R.createGame(), move, seededRandom(5))!,
      two = R.play(R.createGame(), move, seededRandom(5))!;
    expect(one).toEqual(two);
    // What is recorded flies to the same end again.
    expect(fly(one.last!.yaw, one.last!.speed).outcome).toBe(one.last!.outcome);
    // A person's throw carries no scatter: with or without draws it is the same.
    expect(R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed), seededRandom(9))).toEqual(R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed)));
    // The path the view replays ends where the rules laid the arrow, turn and all.
    const kept = R.throwOf(R.throwCode(mouth.yaw, mouth.speed))!,
      path = fly(kept.yaw, kept.speed, { record: true }).path;
    expect(path[path.length - 1]).toEqual(R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed))!.last!.rest);
    expect(path.length).toBeGreaterThan(60);
    expect(path[0].q).toHaveLength(4);
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
  test("it flies point first: the feathers turn it into its way, and it comes down nose first at the rim", () => {
    const f = fly(mouth.yaw, mouth.speed, { record: true }),
      i = f.path.findIndex((p, k) => k > 0 && p.tip.y < HOLES[0].top && f.path[k - 1].tip.y >= HOLES[0].top),
      a = f.path[i - 1],
      b = f.path[i],
      v = { x: (b.tip.x - a.tip.x) / SAMPLE, y: (b.tip.y - a.tip.y) / SAMPLE, z: (b.tip.z - a.tip.z) / SAMPLE },
      speed = Math.hypot(v.x, v.y, v.z);
    // Going down steeply, the shaft along the way within some degrees (a slow lob turns faster than the feathers follow).
    expect(b.dir.y).toBeLessThan(-0.7);
    expect((v.x * b.dir.x + v.y * b.dir.y + v.z * b.dir.z) / speed).toBeGreaterThan(0.95);
    // It spins slowly about itself as it flies (the turn changes about the shaft).
    expect(f.path[30].q).not.toEqual(f.path[31].q);
  });
  test("an arrow standing in the mouth scores 10 and one in an ear 20, judged from where it rests", () => {
    const inMouth = R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed))!;
    expect([inMouth.last!.outcome, inMouth.last!.points, inMouth.scores]).toEqual(["mouth", R.POINTS.mouth, [10, 0]]);
    expect(R.POINTS.ear).toBeGreaterThan(R.POINTS.mouth);
    for (const k of [1, 2]) {
      const ear = R.play(R.createGame(), throwOf(R.ideal()[k].yaw, R.ideal()[k].speed))!;
      expect([ear.last!.outcome, ear.last!.hole, ear.last!.points]).toEqual(["ear", k, 20]);
      // It stands in its ear: the point on the ear's bottom, inside the tube.
      const tip = ear.last!.rest.tip,
        hole = HOLES[k];
      expect(tip.y).toBeCloseTo(hole.top - hole.depth + ARROW_R, 2);
      expect(Math.hypot(tip.x - hole.x, tip.z - hole.z)).toBeLessThan(hole.inner);
      expect(judge(ear.last!.rest)).toEqual({ outcome: "ear", hole: k });
    }
    // In the mouth the point rests on the beans and the walls hold the shaft upright.
    const tip = inMouth.last!.rest.tip;
    expect(Math.hypot(tip.x, tip.z)).toBeLessThan(HOLES[0].inner);
    expect(tip.y).toBeCloseTo(HOLES[0].top - HOLES[0].depth + ARROW_R, 2);
    expect(lean(inMouth.last!.rest)).toBeLessThanOrEqual(LEAN_MAX);
  });
  test("each way an arrow can end is reached: clean in, off the rim and in, off the rim and out, on the mat, leaning", { timeout: 60000 }, () => {
    const inMouth = (f: Flight) => f.outcome === "mouth",
      clean = find((f) => f.outcome === "mouth" && !f.rimmed && f.knocks[0].kind === "in", [], inMouth),
      rimIn = find((f) => f.outcome === "mouth" && f.rimmed && f.knocks[0].kind === "rim", [], inMouth),
      rimOut = find((f) => f.outcome === "miss" && f.rimmed && f.knocks[0].kind === "rim", [], (f) => f.outcome === "miss" && f.knocks[0]?.kind === "rim"),
      leaning = find((f) => f.outcome === "lean", filled(6), (f) => f.outcome === "lean");
    // Clean in: through the opening before anything touches it, and nothing struck hard.
    expect(clean.flight.knocks.filter((k) => k.kind === "rim").every((k) => k.strength < 0.3)).toBe(true);
    // Struck the rim first, it pivots in and rattles down: the pot rings hollow after the clack.
    expect(rimIn.flight.knocks.findIndex((k) => k.kind === "in")).toBeGreaterThan(0);
    expect(rimOut.flight.rest.tip.y).toBeCloseTo(ARROW_R, 3);
    // Leaning: its point in the mouth, its shaft lying further over than an arrow can stand.
    expect(leaning.flight.hole).toBe(0);
    expect(lean(leaning.flight.rest)).toBeGreaterThan(LEAN_MAX);
    for (const ds of [-0.5, 0.6]) {
      const miss = R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed + ds))!.last!;
      expect([miss.outcome, miss.points]).toEqual(["miss", 0]);
      // It lies flat on the ground, clear of the pot.
      expect(miss.rest.tip.y).toBeCloseTo(ARROW_R, 3);
      expect(Math.abs(miss.rest.dir.y)).toBeLessThan(0.01);
      expect(Math.hypot(miss.rest.tip.x, miss.rest.tip.z)).toBeGreaterThan(0.15);
    }
    // Short falls before the pot, long beyond it.
    expect(R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed - 0.5))!.last!.rest.tip.z).toBeGreaterThan(0);
    expect(R.play(R.createGame(), throwOf(mouth.yaw, mouth.speed + 0.6))!.last!.rest.tip.z).toBeLessThan(0);
    // A leaning arrow scores nothing.
    const state = { ...R.createGame(), arrows: filled(6).map((rest) => ({ side: 1 as const, yaw: 0, speed: 0, outcome: "mouth" as const, hole: 0, rimmed: false, points: 10, rest })) },
      out = R.play(state, throwOf(leaning.aim.yaw, leaning.aim.speed))!.last!;
    expect([out.outcome, out.points]).toEqual(["lean", 0]);
  });
  test("arrows already thrown stand in the way: a later arrow knocks against them and they never sink into anything", { timeout: 60000 }, () => {
    const others = filled(8),
      knocked = find((f) => f.knocks.some((k) => k.kind === "arrow"), others);
    const knock = knocked.flight.knocks.find((k) => k.kind === "arrow")!;
    expect(knock.other).toBeGreaterThanOrEqual(0);
    expect(knock.other).toBeLessThan(others.length);
    // The same throw into an empty pot goes another way.
    expect(fly(knocked.aim.yaw, knocked.aim.speed).knocks.some((k) => k.kind === "arrow")).toBe(false);
    // Rests touch the bronze, the ground and one another but never sink in beyond a fraction of a millimetre.
    for (const rest of others) expect(sunk(rest, others.filter((o) => o !== rest))).toBeLessThan(0.001);
    expect(sunk(knocked.flight.rest, others)).toBeLessThan(0.001);
  });
  test("a quick weighing (stopped once the outcome is sure) agrees with the whole flight", { timeout: 60000 }, () => {
    let same = 0,
      all = 0;
    for (const others of [[], filled(5)])
      for (const aim of grid(0.02, 0.01)) {
        all++;
        if (fly(aim.yaw, aim.speed, { others, quick: true }).outcome === fly(aim.yaw, aim.speed, { others }).outcome) same++;
      }
    expect(same / all).toBeGreaterThan(0.97);
  });
  test("the sides throw in turn, ten arrows each; the round's arrows are gathered and the higher total wins", { timeout: 60000 }, () => {
    let state = R.createGame(1);
    const order: number[] = [];
    let mine = 0;
    for (let k = 0; k < R.ARROWS * 2; k++) {
      order.push(state.turn);
      expect(state.winner).toBeNull();
      // Side 0 throws at the mouth, side 1 short.
      state = R.play(state, throwOf(mouth.yaw, state.turn === 0 ? mouth.speed : mouth.speed - 0.5))!;
      if (state.last!.side === 0) mine += state.last!.points;
      else expect(state.last!.points).toBe(0);
      if (k < R.ARROWS * 2 - 1) expect(state.arrows.length).toBe(k + 1);
    }
    expect(order).toEqual(Array.from({ length: 20 }, (_, k) => k % 2));
    expect(state.cleared).toBe(true);
    expect(state.arrows).toEqual([]);
    // The first arrows go in; later ones meet those standing there, but most still score.
    expect(mine).toBeGreaterThanOrEqual(50);
    expect(state.scores).toEqual([mine, 0]);
    expect(state.history).toEqual([[mine, 0]]);
    expect(state.winner).toBe(0);
    expect(state.ply).toBe(20);
    expect(R.play(state, throwOf(mouth.yaw, mouth.speed))).toBeNull();
    expect(R.tuho.reason(state)).toMatch(new RegExp(`^합계 ${mine} 대 0점입니다\\.`));
  });
  test("three rounds: the other side begins each round, totals add up, and equal totals are a draw", { timeout: 60000 }, () => {
    let state = R.createGame(R.roundsOf("3"));
    expect(state.rounds).toBe(3);
    const short = (s: R.State, n: number) => {
      for (let k = 0; k < n; k++) s = R.play(s, throwOf(mouth.yaw, mouth.speed - 0.5))!;
      return s;
    };
    state = R.play(state, throwOf(mouth.yaw, mouth.speed))!;
    state = short(state, 19);
    expect([state.round, state.starter, state.turn, state.winner, state.history]).toEqual([2, 1, 1, null, [[10, 0]]]);
    state = R.play(state, throwOf(mouth.yaw, mouth.speed))!;
    state = short(state, 19);
    expect([state.round, state.turn, state.history[1]]).toEqual([3, 0, [0, 10]]);
    state = short(state, 20);
    expect(state.scores).toEqual([10, 10]);
    expect(state.winner).toBe("draw");
    expect(R.tuho.reason(state)).toMatch(/무승부/);
    expect(R.roundsOf("1")).toBe(1);
  });
  test("the computer weighs throws through the same flight, quickly; the harder its level, the more it scores", { timeout: 60000 }, () => {
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
    // Into a pot that is filling up it still chooses in a moment (about a tenth of a second; generous here).
    let state = R.createGame();
    const random = seededRandom(3);
    for (let k = 0; k < 12; k++) state = R.play(state, R.chooseThrow(state, "normal")!, random)!;
    const start = performance.now();
    R.chooseThrow(state, "normal");
    expect(performance.now() - start).toBeLessThan(1500);
  });
  test("a pull or a swipe sets the throw; a straight pull of the centre length throws at the mouth; the hand trembles a little", () => {
    const height = 860,
      straight = gesture(0, CENTRE * height, height)!;
    expect(straight.yaw).toBeCloseTo(mouth.yaw, 9);
    expect(straight.speed).toBeCloseTo(mouth.speed, 9);
    // Pushed up the same length, the same throw.
    expect(gesture(0, -CENTRE * height, height)).toEqual(straight);
    expect(gesture(0, (LEAST / 2) * height, height)).toBeNull();
    for (const [yaw, speed] of [[mouth.yaw, mouth.speed], [R.ideal()[1].yaw, R.ideal()[1].speed], [0.04, 4.6]]) {
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
    // The hand's tremor at its widest still lands a straight pull of the centre length in the mouth.
    for (const [dy, ds] of [[TREMOR.yaw * 3, TREMOR.speed * 3], [-TREMOR.yaw * 3, -TREMOR.speed * 3], [TREMOR.yaw * 3, -TREMOR.speed * 3]])
      expect(fly(mouth.yaw + dy, mouth.speed + ds).outcome).toBe("mouth");
  });
});
