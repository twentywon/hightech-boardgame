import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as A from "../src/games/archery/rules";
import { DRAW, GAIN, RISE, TREMOR, dragAim, dragFor, fatigue, rising, tremor } from "../src/games/archery/layout";

const CALM: A.Wind = { speed: 0, dir: 0 };
/** The same state with still air for every arrow of the end under way. */
const calm = (s: A.State): A.State => ({ ...s, winds: s.winds.map(() => CALM) });
/** The middle of the zone worth `value` (10 down to 1), straight up from the middle of the face. */
const zone = (value: number) => (10 - value) * A.ZONE + A.ZONE / 2;
/** A person's shot (no scatter) at (x, y) mm. */
const at = (x: number, y: number) => ({ from: -1, to: A.aimCode(x, y), extra: 0 });
/** Shoots a value in still air. */
const shoot = (s: A.State, value: number) => A.play(calm(s), at(0, value === 11 ? 0 : zone(value)))!;
/** Shoots a whole set: my three values and theirs, in the order the set has them. */
function set(s: A.State, mine: number[], theirs: number[]) {
  const left = [[...mine], [...theirs]];
  for (let k = 0; k < 6; k++) s = shoot(s, left[s.turn].shift()!);
  return s;
}

describe("archery", () => {
  test("the rings score 10 to 1 out from the middle, X inside the 10, a line touched counts the higher, beyond the face a miss", () => {
    for (let value = 10; value >= 1; value--) {
      // The middle of each zone (the middle of the 10 lies in the X ring: halfway between it and the 9).
      const r = value === 10 ? 45 : zone(value),
        hit = A.scoreAt(0, r);
      expect([hit.value, hit.label]).toEqual([value, String(value)]);
      // Any way round: the face is scored by distance alone.
      expect(A.scoreAt(r * Math.SQRT1_2, -r * Math.SQRT1_2).value).toBe(value);
    }
    expect(A.scoreAt(0, 0)).toEqual({ value: 10, inner: true, label: "X" });
    expect(A.scoreAt(20, 0).label).toBe("X");
    expect(A.scoreAt(45, 0)).toEqual({ value: 10, inner: false, label: "10" });
    // An arrow's edge touching a line: the 10's line lies at 61 mm, the arrow is 5.5 mm thick.
    expect(A.scoreAt(61 + A.SHAFT, 0).value).toBe(10);
    expect(A.scoreAt(61 + A.SHAFT + 0.1, 0).value).toBe(9);
    expect(A.scoreAt(A.X_RING + A.SHAFT, 0).inner).toBe(true);
    expect(A.scoreAt(A.X_RING + A.SHAFT + 0.1, 0).inner).toBe(false);
    expect(A.scoreAt(A.FACE + A.SHAFT, 0).value).toBe(1);
    expect(A.scoreAt(A.FACE + A.SHAFT + 0.1, 0)).toEqual({ value: 0, inner: false, label: "M" });
    expect(A.scoreAt(0, -900).label).toBe("M");
  });
  test("in still air the arrow lands exactly on the pin: the sight allows for gravity, which is real at 70 m", () => {
    const random = seededRandom(4);
    for (let k = 0; k < 40; k++) {
      const x = Math.round((random() - 0.5) * 16000) / 10,
        y = Math.round((random() - 0.5) * 16000) / 10,
        flight = A.fly(x, y, CALM);
      expect(Math.abs(flight.x - x)).toBeLessThan(0.01);
      expect(Math.abs(flight.y - y)).toBeLessThan(0.01);
    }
    const middle = A.fly(0, 0, CALM, 10),
      launch = A.launchFor(0, 0);
    // About a second and a quarter in the air, slowed by the air, and pointed well up: the arrow drops metres on the way.
    expect(middle.t).toBeGreaterThan(1.15);
    expect(middle.t).toBeLessThan(1.35);
    expect(middle.speed).toBeLessThan(A.SPEED * 0.92);
    expect(middle.speed).toBeGreaterThan(A.SPEED * 0.8);
    expect(launch.pitch).toBeGreaterThan(0.08);
    const top = Math.max(...middle.path.map((p) => p.y));
    expect(top).toBeGreaterThan(A.LAUNCH + 1.4);
    expect(middle.path[0]).toEqual({ x: 0, y: A.LAUNCH, d: 0, t: 0 });
    expect(middle.path[middle.path.length - 1].d).toBe(A.DISTANCE);
    // A person's shot in still air lands where the pin was, to the tenth of a millimetre it is named by.
    const s = calm(A.createGame("match", seededRandom(1)));
    for (const [x, y] of [[0, 0], [-37.3, 151], [222.2, -88.8]]) {
      const arrow = A.play(s, at(x, y), seededRandom(2))!.last!;
      expect([arrow.x, arrow.y]).toEqual([x, y]);
    }
  });
  test("the wind carries the arrow its way: across it drifts that side, a tail wind lifts it, a head wind drops it, more the stronger", () => {
    const right = A.drift({ speed: 2, dir: 90 }),
      left = A.drift({ speed: 2, dir: 270 }),
      tail = A.drift({ speed: 3, dir: 0 }),
      head = A.drift({ speed: 3, dir: 180 }),
      strong = A.drift({ speed: 4, dir: 90 });
    expect(right.x).toBeGreaterThan(100);
    expect(left.x).toBeCloseTo(-right.x, 5);
    expect(Math.abs(right.y)).toBeLessThan(5);
    expect(tail.y).toBeGreaterThan(30);
    expect(head.y).toBeLessThan(-30);
    expect(Math.abs(tail.x)).toBeLessThan(0.01);
    // About 8 cm a metre a second across at 70 m, nearly in proportion.
    expect(right.x / 2).toBeGreaterThan(60);
    expect(right.x / 2).toBeLessThan(110);
    expect(strong.x / right.x).toBeGreaterThan(1.9);
    expect(strong.x / right.x).toBeLessThan(2.1);
    // A wind from the left and behind carries it right and up; the wind of the arrow is the one in the state.
    const both = A.drift({ speed: 2, dir: 45 });
    expect(both.x).toBeGreaterThan(0);
    expect(both.y).toBeGreaterThan(0);
    const s = A.createGame("match", seededRandom(9)),
      wind = { speed: 3, dir: 90 },
      arrow = A.play({ ...s, winds: [wind, ...s.winds.slice(1)] }, at(0, 0))!.last!;
    expect(arrow.x).toBeCloseTo(A.drift(wind).x, 0);
    expect(arrow.wind).toEqual(wind);
  });
  test("winds are drawn when an end begins, every arrow its own, and the same draws make the same match", () => {
    const a = A.createGame("match", seededRandom(5)),
      b = A.createGame("match", seededRandom(5)),
      c = A.createGame("match", seededRandom(6));
    expect(a.winds).toEqual(b.winds);
    expect(a.winds).not.toEqual(c.winds);
    expect(a.winds).toHaveLength(6);
    expect(new Set(a.winds.map((w) => `${w.speed},${w.dir}`)).size).toBeGreaterThan(3);
    for (const w of a.winds) {
      expect(w.speed).toBeGreaterThanOrEqual(0);
      expect(w.speed).toBeLessThanOrEqual(A.MAX_WIND);
      expect(w.dir).toBeGreaterThanOrEqual(0);
      expect(w.dir).toBeLessThan(360);
    }
    // A person's shot draws nothing from the random until an end is over; then the next end's winds are drawn from it.
    let draws = 0;
    const counted = () => (draws++, 0.5);
    let s = a;
    for (let k = 0; k < 5; k++) s = A.play(s, at(0, 0), counted)!;
    expect(draws).toBe(0);
    s = A.play(s, at(0, 0), counted)!;
    expect(draws).toBe(2 + 2 * 6);
    expect(s.winds).toEqual(A.drawWinds(6, () => 0.5));
    // Whole matches between computers, from the same draws, come out the same.
    const run = (seed: number) => {
      const random = seededRandom(seed);
      let m = A.createGame("match", random);
      while (m.winner === null) m = A.play(m, A.chooseShot(m, "normal", random)!, random)!;
      return m;
    };
    expect(run(31)).toEqual(run(31));
    expect(run(31).history).not.toEqual(run(32).history);
  });
  test("sets: the higher total takes 2 set points, a tie 1 each, arrows in turn, the one behind leading the next set; 6 wins", () => {
    let s = A.createGame("match", seededRandom(2));
    expect(s.order).toEqual([0, 1, 0, 1, 0, 1]);
    expect(s.turn).toBe(0);
    s = set(s, [10, 9, 9], [9, 9, 8]);
    expect(s.setPoints).toEqual([2, 0]);
    expect(s.history[0]).toMatchObject({ totals: [28, 26], points: [2, 0], shootOff: false });
    expect(s.arrows).toEqual([]);
    expect(s.closed).toBe(true);
    // The one behind leads off.
    expect(s.order).toEqual([1, 0, 1, 0, 1, 0]);
    expect(s.turn).toBe(1);
    s = set(s, [9, 9, 9], [10, 9, 8]);
    expect(s.setPoints).toEqual([3, 1]);
    expect(s.order[0]).toBe(1);
    s = set(s, [8, 8, 8], [10, 10, 10]);
    expect(s.setPoints).toEqual([3, 3]);
    // Level: the one who began the match leads off.
    expect(s.order[0]).toBe(0);
    s = set(s, [10, 10, 10], [9, 9, 9]);
    expect([s.setPoints, s.winner]).toEqual([[5, 3], null]);
    s = set(s, [7, 7, 7], [7, 7, 7]);
    // An X counts 10.
    let won = A.createGame("match", seededRandom(3));
    for (let k = 0; k < 3; k++) won = set(won, [11, 11, 10], [9, 9, 9]);
    expect([won.setPoints, won.winner, won.totals]).toEqual([[6, 0], 0, [90, 81]]);
    expect(A.moves(won)).toEqual([]);
    expect(A.play(won, at(0, 0))).toBeNull();
    expect(A.archery.reason(won)).toContain("6 대 0");
    expect(s.setPoints).toEqual([6, 4]);
    expect(s.winner).toBe(0);
    // The computer's side can win too.
    let lost = A.createGame("match", seededRandom(4));
    for (let k = 0; k < 3; k++) lost = set(lost, [5, 5, 5], [6, 6, 6]);
    expect([lost.setPoints, lost.winner]).toEqual([[0, 6], 1]);
  });
  test("at 5–5 one arrow each is shot off, the one closer to the middle wins; exactly as close, again", () => {
    let s = A.createGame("match", seededRandom(7));
    s = set(s, [10, 10, 10], [9, 9, 9]);
    s = set(s, [9, 9, 9], [10, 10, 10]);
    s = set(s, [9, 9, 9], [9, 9, 9]);
    s = set(s, [10, 10, 10], [9, 9, 9]);
    s = set(s, [9, 9, 9], [10, 10, 10]);
    expect([s.setPoints, s.shootOff, s.winner]).toEqual([[5, 5], true, null]);
    expect(s.order).toEqual([0, 1]);
    expect(s.winds).toHaveLength(2);
    // Both in the 10, mine nearer the middle.
    const off = calm(s),
      first = A.play(off, at(0, 40))!;
    expect([first.winner, first.turn]).toEqual([null, 1]);
    const done = A.play(calm(first), at(-30, -30))!;
    expect(done.winner).toBe(0);
    expect(done.setPoints).toEqual([6, 5]);
    expect(done.history[done.history.length - 1]).toMatchObject({ shootOff: true, points: [1, 0] });
    expect(A.archery.reason(done)).toContain("슛오프");
    expect(A.archery.reason(done)).toContain("40.0mm");
    // Theirs nearer.
    const theirs = A.play(calm(A.play(off, at(50, 0))!), at(0, 20))!;
    expect([theirs.winner, theirs.setPoints]).toEqual([1, [5, 6]]);
    // Exactly as close: another arrow each, the match goes on.
    const again = A.play(calm(A.play(off, at(30, 40))!), at(-50, 0), seededRandom(8))!;
    expect([again.winner, again.shootOff, again.setPoints, again.arrows.length]).toEqual([null, true, [5, 5], 0]);
    expect(again.order).toEqual([0, 1]);
  });
  test("alone: 12 arrows as two ends of six, or 36 as six, for a total", () => {
    expect(A.FORMATS.map((f) => f.value)).toEqual(["match", "12", "36"]);
    expect(A.formatOf("")).toBe("match");
    expect(A.archery.create("36").format).toBe("36");
    for (const [format, ends] of [["12", 2], ["36", 6]] as const) {
      let s = A.createGame(format, seededRandom(1));
      expect([s.perEnd, s.ends, s.order]).toEqual([6, ends, [0, 0, 0, 0, 0, 0]]);
      let shots = 0;
      while (s.winner === null) {
        expect(s.turn).toBe(0);
        s = shoot(s, shots % 3 === 0 ? 11 : 9);
        shots++;
      }
      expect(shots).toBe(ends * 6);
      expect(s.winner).toBe(0);
      expect(s.history).toHaveLength(ends);
      expect(s.totals[0]).toBe(ends * (10 * 2 + 9 * 4));
      expect(A.archery.reason(s)).toMatch(new RegExp(`^${ends * 6}발 합계 ${s.totals[0]}점입니다\\.`));
      expect(A.archery.reason(s)).toContain(`X ${ends * 2}발`);
    }
  });
  test("refused: a piece moved, a scatter out of range, a point out of reach, a match over; the state is never changed", () => {
    const s = A.createGame("match", seededRandom(11)),
      copy = JSON.parse(JSON.stringify(s));
    expect(A.play(s, { from: 2, to: A.aimCode(0, 0), extra: 0 })).toBeNull();
    expect(A.play(s, { from: -1, to: A.aimCode(0, 0), extra: -1 })).toBeNull();
    expect(A.play(s, { from: -1, to: A.aimCode(0, 0), extra: A.MAX_SPREAD + 1 })).toBeNull();
    expect(A.play(s, { from: -1, to: -3, extra: 0 })).toBeNull();
    A.play(s, at(10, 10), seededRandom(1));
    expect(s).toEqual(copy);
    // Aims are kept to a tenth of a millimetre, within two metres.
    expect(A.aimOf(A.aimCode(-37.26, 151.04))).toEqual({ x: -37.3, y: 151 });
    expect(A.aimOf(A.aimCode(9999, -9999))).toEqual({ x: 2000, y: -2000 });
    // Far off the face but on the boss it is a miss in the boss; past the boss it flies on into the grass.
    const wide = A.play(calm(s), at(650, 0))!.last!;
    expect([wide.label, wide.boss]).toEqual(["M", true]);
    expect(A.play(calm(s), at(900, 0))!.last!.boss).toBe(false);
  });
  test("the computer reads the wind and aims off for it, better and steadier the higher its level, and a match between computers ends", () => {
    const mean = (level: "easy" | "normal" | "hard") => {
      const random = seededRandom(13);
      let s = A.createGame("match", random),
        total = 0;
      for (let k = 0; k < 1200; k++) {
        if (s.winner !== null) s = A.createGame("match", random);
        const move = A.chooseShot(s, level, random)!;
        expect(move.extra).toBe(A.LEVELS[level].spread);
        s = A.play(s, move, random)!;
        total += s.last!.value;
      }
      return total / 1200;
    };
    const easy = mean("easy"),
      normal = mean("normal"),
      hard = mean("hard");
    expect(hard).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(easy);
    expect(hard).toBeGreaterThan(9);
    expect(easy).toBeGreaterThan(7);
    // It allows for the wind: a strong cross wind from the left, and it aims left of the middle.
    const s = A.createGame("match", seededRandom(1)),
      windy = { ...s, winds: s.winds.map(() => ({ speed: 4, dir: 90 })) },
      aim = A.aimOf(A.chooseShot(windy, "hard", seededRandom(3))!.to)!;
    expect(aim.x).toBeLessThan(-250);
    // Its arrows scatter about as widely as its level says.
    const random = seededRandom(19);
    let sum = 0;
    for (let k = 0; k < 1500; k++) {
      const arrow = A.play(calm(s), { from: -1, to: A.aimCode(0, 0), extra: A.LEVELS.normal.spread }, random)!.last!;
      sum += arrow.x * arrow.x + arrow.y * arrow.y;
    }
    expect(Math.sqrt(sum / 1500 / 2)).toBeGreaterThan(A.LEVELS.normal.spread * 0.9);
    expect(Math.sqrt(sum / 1500 / 2)).toBeLessThan(A.LEVELS.normal.spread * 1.1);
    for (const [level, seed] of [["easy", 1], ["normal", 2], ["hard", 3]] as const) {
      const random = seededRandom(seed);
      let m = A.createGame("match", random),
        shots = 0;
      while (m.winner === null) {
        const next = A.archery.play(m, A.archery.choose!(m, level, random)!, random);
        expect(next).not.toBeNull();
        expect(next!.ply).toBe(m.ply + 1);
        m = next!;
        expect(++shots).toBeLessThan(80);
      }
      expect(Math.max(...m.setPoints)).toBeGreaterThanOrEqual(A.WIN);
      expect(A.archery.reason(m).length).toBeGreaterThan(5);
    }
  });
  test("the hint and the tally tell the set, the arrow and the wind", () => {
    let s = A.createGame("match", seededRandom(1));
    expect(A.archery.hint(s)).toContain("1세트 · 1/3번째 화살");
    expect(A.archery.hint(s)).toContain(`${s.winds[0].speed.toFixed(1)} m/s`);
    s = shoot(s, 11);
    expect(A.archery.tally(s)[0]).toBe("세트 0점 · 이번 X (10)");
    expect(A.archery.hint(s)).toContain("1세트 · 1/3번째 화살");
    s = shoot(s, 8);
    expect(A.archery.hint(s)).toContain("1세트 · 2/3번째 화살");
    const alone = A.createGame("12", seededRandom(1));
    expect(A.archery.hint(alone)).toContain("1/2엔드 · 1/6번째 화살");
    expect(A.archery.tally(alone)[0]).toBe("합계 0점");
  });
  test("the hand: a drag moves the pin as dragFor says, the bow settles in as it comes up, the hold wanders and tires", () => {
    const h = 700;
    for (const [x, y] of [[0, 0], [120, -80], [-300, 45]]) {
      const d = dragFor(x, y, h),
        back = dragAim(d.dx, d.dy, h);
      expect(back.x).toBeCloseTo(x);
      expect(back.y).toBeCloseTo(y);
    }
    expect(dragAim(0, -h, h).y).toBe(GAIN);
    expect(dragAim(h / 10, 0, h).x).toBeGreaterThan(0);
    expect(rising(0)).toBe(-RISE);
    expect(rising(DRAW)).toBeCloseTo(0);
    expect(rising(DRAW * 2)).toBeCloseTo(0);
    expect(rising(DRAW / 2)).toBeGreaterThan(-RISE);
    // Fresh the hold wanders about as far as it says, never jumping; held long it shakes more and more.
    let sum = 0,
      count = 0,
      jump = 0;
    for (let seed = 0; seed < 30; seed++) {
      let before = tremor(0, seed * 7.3);
      for (let t = 1 / 60; t < TREMOR.steady; t += 1 / 60) {
        const now = tremor(t, seed * 7.3, t);
        sum += now.x * now.x + now.y * now.y;
        count += 2;
        jump = Math.max(jump, Math.hypot(now.x - before.x, now.y - before.y));
        before = now;
      }
    }
    expect(Math.sqrt(sum / count)).toBeGreaterThan(TREMOR.drift * 0.6);
    expect(Math.sqrt(sum / count)).toBeLessThan(TREMOR.drift * 1.3);
    expect(jump).toBeLessThan(8);
    expect(fatigue(0)).toBe(1);
    expect(fatigue(TREMOR.steady)).toBe(1);
    expect(fatigue(TREMOR.steady + 3)).toBeGreaterThan(1.8);
    expect(fatigue(TREMOR.steady + 8)).toBeGreaterThan(fatigue(TREMOR.steady + 3));
    expect(fatigue(60)).toBe(4);
    const spread = (held: number) => {
      let s = 0;
      for (let t = 0; t < 20; t += 0.05) {
        const p = tremor(t, 3, held);
        s += p.x * p.x + p.y * p.y;
      }
      return Math.sqrt(s / 800);
    };
    expect(spread(TREMOR.steady + 6)).toBeGreaterThan(spread(1) * 2);
    expect(tremor(2.5, 7, 1)).toEqual(tremor(2.5, 7, 1));
    expect(tremor(0, 1)).not.toEqual(tremor(0, 2));
  });
});
