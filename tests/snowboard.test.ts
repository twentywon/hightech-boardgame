import { describe, expect, test } from "vitest";
import * as R from "../src/games/snowboard/rules";
import * as S from "../src/games/snowboard/sim";
import { clock } from "../src/games/snowboard/view";

/** Steps `world` for `seconds`, `hands` setting the press and the turn before each slice; everything that happened. */
function run(world: S.World, seconds: number, hands: (w: S.World) => void = () => {}, until: (e: S.Happening) => boolean = () => false) {
  const seen: S.Happening[] = [];
  for (let k = 0; k < seconds / S.DT; k++) {
    hands(world);
    for (const e of S.step(world)) {
      seen.push(e);
      if (until(e)) return seen;
    }
  }
  return seen;
}
/** A course of one hand-made shape (control points), for tests of the riding alone. */
function course(xs: number[], ys: number[]): S.Course {
  return { xs, ys, ms: xs.map(() => NaN), rocks: [], gates: [], flakes: [], seed: 1, sections: 99 };
}
/** A world on `c` (extended far so that `extend` adds nothing near), the rider placed at `x` going `v`. */
function on(c: S.Course, x: number, v: number) {
  const w = S.createWorld(1);
  w.course = c;
  S.placeRider(w, x, v);
  return w;
}
/** A long straight slope falling `grade` metres a metre (negative climbs), far enough for any test. */
const straight = (grade: number) => course([-100, 0, 2000], [100 * grade, 0, -2000 * grade]);

describe("snowboard: the course", () => {
  test("is the same for the same seed, different for another, and smooth (no step in height or slope)", () => {
    const a = S.createCourse(42, 1500),
      b = S.createCourse(42, 1500),
      c = S.createCourse(43, 1500);
    expect(b.xs).toEqual(a.xs);
    expect(b.ys).toEqual(a.ys);
    expect(b.rocks).toEqual(a.rocks);
    expect(c.ys.slice(5, 30)).not.toEqual(a.ys.slice(5, 30));
    for (let x = 0; x < 1400; x += 0.05) {
      const here = S.groundAt(a, x),
        next = S.groundAt(a, x + 0.01);
      expect(Math.abs(next.y - here.y), `${x}`).toBeLessThan(0.05);
      expect(Math.abs(next.slope - here.slope), `${x}`).toBeLessThan(0.1);
      // The slope agrees with the height's own change.
      expect(Math.abs((next.y - here.y) / 0.01 - here.slope), `${x}`).toBeLessThan(0.08);
    }
    // It goes downhill overall, with kickers (a lip turned up), rocks, gates and snowflakes on it.
    expect(S.heightAt(a, 1400)).toBeLessThan(-200);
    expect(a.ms.some((m) => m > 0.3)).toBe(true);
    expect(a.rocks.length).toBeGreaterThan(2);
    // Rocks lie only on the plain stretches: never on a kicker's run or lip, nor in a rolling dip (where the ground
    // is steep or bends sharply).
    for (const rock of S.createCourse(7, 6000).rocks) {
      const c = S.createCourse(7, 6000),
        here = S.groundAt(c, rock.x);
      expect(here.slope, `${rock.x}`).toBeLessThan(-0.1);
      expect(here.slope, `${rock.x}`).toBeGreaterThan(-0.3);
    }
    expect(a.gates.length).toBeGreaterThan(3);
    expect(a.flakes.length).toBeGreaterThan(3);
  });
  test("is laid on ahead as the rider goes", () => {
    const w = S.createWorld(5),
      before = w.course.xs.at(-1)!;
    w.rider.x = before - 10;
    S.step(w);
    expect(w.course.xs.at(-1)!).toBeGreaterThan(before + 200);
  });
});

describe("snowboard: riding", () => {
  test("downhill speeds the rider up, uphill slows it, and it skates on rather than stopping", () => {
    const down = on(straight(0.35), 0, 8);
    run(down, 2);
    expect(S.speedOf(down.rider)).toBeGreaterThan(13);
    expect(down.rider.ground).toBe(true);
    const up = on(straight(-0.2), 0, 12);
    run(up, 1);
    expect(S.speedOf(up.rider)).toBeLessThan(10);
    // On a long climb it never stalls: it skates up at a crawl.
    run(up, 8);
    expect(S.speedOf(up.rider)).toBeGreaterThan(S.CRAWL * 0.8);
    expect(up.rider.x).toBeGreaterThan(30);
  });
  test("tucked (↓) it goes faster than standing: much faster downhill, and a little even on the flat and uphill", () => {
    const fast = on(straight(0.3), 0, 8),
      plain = on(straight(0.3), 0, 8);
    run(fast, 1.5, (w) => (w.tuck = true));
    run(plain, 1.5);
    expect(S.speedOf(fast.rider)).toBeGreaterThan(S.speedOf(plain.rider) + 3);
    for (const grade of [0, -0.1]) {
      const tucked = on(straight(grade), 0, 14),
        upright = on(straight(grade), 0, 14);
      run(tucked, 1, (w) => (w.tuck = true));
      run(upright, 1);
      expect(S.speedOf(tucked.rider), `${grade}`).toBeGreaterThan(S.speedOf(upright.rider) + 1);
    }
  });
  test("the ride is quick: down a long 15° slope, tucked, it passes 150 km/h", () => {
    const w = on(straight(Math.tan((15 * Math.PI) / 180)), 0, 10);
    run(w, 12, (w) => (w.tuck = true));
    expect(S.speedOf(w.rider) * 3.6).toBeGreaterThan(150);
    expect(w.rider.ground).toBe(true);
  });
  test("a crest throws the rider into the air, and it comes down again on the ground", () => {
    // Down, then a sharp crest falling away steeply.
    const w = on(course([-100, 0, 20, 26, 60, 400], [40, 0, -6, -6.3, -40, -300]), 2, 16),
      seen = run(w, 8);
    expect(seen.filter((e) => e.kind === "launch")).toHaveLength(1);
    expect(w.rider.ground).toBe(true);
    // Left alone in the air, the board came round to its way of flight: down cleanly, no crash.
    expect(seen.some((e) => e.kind === "crash")).toBe(false);
    expect(seen.some((e) => e.kind === "land")).toBe(true);
    // A broad, gentle crest taken at an easy speed does not throw it: it rides over on the snow.
    const slow = on(course([-100, 0, 40, 80, 120, 600], [30, 0, 2, -4, -16, -160]), 2, 8),
      slowSeen = run(slow, 10);
    expect(slow.rider.x).toBeGreaterThan(48);
    expect(slowSeen.some((e) => e.kind === "launch")).toBe(false);
  });
  test("↑ pops the rider up at once; pressed a moment before touching down it pops on landing; in the air, or long before, nothing", () => {
    const w = on(straight(0.1), 0, 10);
    w.jumpAt = w.time;
    let highest = 0;
    const seen = run(w, 2, (w) => (highest = Math.max(highest, w.rider.y - S.heightAt(w.course, w.rider.x))));
    expect(seen.filter((e) => e.kind === "pop")).toHaveLength(1);
    expect(highest).toBeGreaterThan(0.8);
    // Thrown up a little: ↑ just before the board touches the snow still pops as it lands.
    const early = on(straight(0.1), 0, 10);
    early.rider.vy += 2;
    early.rider.ground = false;
    let pressed = false;
    const pops = run(early, 2, (w) => {
      if (!pressed && !w.rider.ground && w.rider.vy < 0 && w.rider.y - S.heightAt(w.course, w.rider.x) < 0.08) [w.jumpAt, pressed] = [w.time, true];
    }).filter((e) => e.kind === "pop");
    expect(pops).toHaveLength(1);
    // Pressed high in the air, long before landing: it is forgotten, no pop when it lands.
    const late = on(straight(0.1), 0, 10);
    late.rider.vy += 6;
    late.rider.ground = false;
    late.jumpAt = 0.05;
    expect(run(late, 3).some((e) => e.kind === "pop")).toBe(false);
  });
  test("← held on the ground starts turning the moment the rider leaves it", () => {
    const w = on(course([-100, 0, 20, 26, 60, 400], [40, 0, -6, -6.3, -40, -300]), 2, 16);
    let turnedOnGround = 0;
    run(w, 1.2, (w) => {
      w.turn = -1;
      if (w.rider.ground) turnedOnGround = Math.max(turnedOnGround, Math.abs(w.rider.turned));
    });
    expect(turnedOnGround).toBe(0);
    expect(w.rider.ground ? true : w.rider.turned > 0.5).toBe(true);
  });
});

describe("snowboard: tricks, landings and crashes", () => {
  /** A big jump: the rider thrown up off a long straight slope (a pop held long), turned by `turn` while `turning` says. */
  function jump(turn: -1 | 0 | 1, turning: (w: S.World) => boolean) {
    const w = on(straight(0.25), 0, 14);
    w.rider.vy += 9;
    w.rider.y += 0.05;
    w.rider.ground = false;
    w.rider.airAt = 0;
    const seen = run(w, 5, (w) => (w.turn = !w.rider.ground && turning(w) ? turn : 0), (e) => e.kind === "land" || e.kind === "crash");
    return { w, seen, end: seen.at(-1) };
  }
  test("in the air the hands turn the rider: left backward (counterclockwise), right forward", () => {
    const back = on(straight(0.2), 0, 10),
      front = on(straight(0.2), 0, 10);
    for (const w of [back, front]) {
      w.rider.vy += 8;
      w.rider.ground = false;
    }
    run(back, 0.4, (w) => (w.turn = -1));
    run(front, 0.4, (w) => (w.turn = 1));
    expect(back.rider.turned).toBeGreaterThan(1);
    expect(front.rider.turned).toBeLessThan(-1);
  });
  test("a clean landing scores its time in the air; a full flip landed level scores the flip and raises the multiplier", () => {
    const plain = jump(0, () => false);
    expect(plain.end).toMatchObject({ kind: "land", flips: 0 });
    expect((plain.end as { points: number }).points).toBeGreaterThan(0);
    expect(plain.w.multiplier).toBe(1);
    // A backflip: turned until a little short of a whole turn, then let go to come round to level.
    const flip = jump(-1, (w) => w.rider.turned < 2 * Math.PI - 0.9);
    expect(flip.end).toMatchObject({ kind: "land", flips: 1, back: true, multiplier: 1 });
    expect((flip.end as { points: number }).points).toBeGreaterThanOrEqual(S.POINTS.flip);
    expect(flip.w.multiplier).toBe(2);
    // The next landing's points are times the multiplier.
    const w = flip.w;
    expect(S.trickPoints(1, 1.5, false) * 2).toBe(2 * (S.POINTS.flip + 300));
    expect(w.crashes).toBe(0);
  });
  test("coming down crooked crashes: the rider tumbles a while, the multiplier goes back to ×1, then it rides on", () => {
    const w = on(straight(0.25), 0, 14);
    w.multiplier = 5;
    // Just over the snow with the board turned well across the slope, spinning on: no time to come round.
    w.rider.y += 0.3;
    w.rider.angle += 1.3;
    w.rider.ground = false;
    const seen = run(w, 5, (w) => (w.turn = w.rider.ground ? 0 : -1), (e) => e.kind === "crash" || e.kind === "land");
    expect(seen.at(-1)).toEqual({ kind: "crash", why: "landing" });
    expect(w.multiplier).toBe(1);
    expect(w.crashes).toBe(1);
    expect(w.rider.crashed).toBeGreaterThan(0);
    run(w, S.CRASH_TIME + 0.5);
    expect(w.rider.crashed).toBe(-1);
    expect(w.rider.ground).toBe(true);
    expect(Math.abs(S.wrap(w.rider.angle - Math.atan(S.groundAt(w.course, w.rider.x).slope)))).toBeLessThan(0.05);
  });
  test("a rock in the way crashes the rider; jumped over, it does not", () => {
    const into = on(straight(0.1), 0, 10);
    into.course.rocks.push({ x: 12, r: 0.6 });
    expect(run(into, 3, () => {}, (e) => e.kind === "crash").at(-1)).toEqual({ kind: "crash", why: "rock" });
    const over = on(straight(0.1), 0, 10);
    over.course.rocks.push({ x: 12, r: 0.6 });
    // ↑ a few metres before it: up and over.
    const seen = run(over, 3, (w) => {
      if (w.rider.x > 8 && w.rider.x < 8.2 && w.rider.ground) w.jumpAt = w.time;
    });
    expect(seen.some((e) => e.kind === "crash")).toBe(false);
    expect(over.rider.x).toBeGreaterThan(14);
  });
  test("a gate ridden through on the snow scores (times the multiplier); flown over high, it does not", () => {
    const through = on(straight(0.1), 0, 10);
    through.multiplier = 3;
    through.course.gates.push({ x: 8, passed: false });
    expect(run(through, 2).filter((e) => e.kind === "gate")).toEqual([{ kind: "gate", points: S.POINTS.gate * 3 }]);
    const above = on(straight(0.1), 0, 10);
    above.course.gates.push({ x: 8, passed: false });
    above.rider.vy += 10;
    above.rider.ground = false;
    expect(run(above, 2).some((e) => e.kind === "gate")).toBe(false);
  });
  test("a snowflake on the way is taken once", () => {
    const w = on(straight(0.1), 0, 10);
    w.course.flakes.push({ x: 10, y: S.heightAt(w.course, 10) + 0.9, taken: false });
    const flakes = run(w, 2).filter((e) => e.kind === "flake");
    expect(flakes).toEqual([{ kind: "flake", points: S.POINTS.flake }]);
  });
});

describe("snowboard: the run and its score", () => {
  test("the run ends when its clock runs out, once, and nothing moves after", () => {
    const w = S.createWorld(9),
      seen = run(w, S.RUN + 1);
    expect(seen.filter((e) => e.kind === "end")).toHaveLength(1);
    expect(w.over).toBe(true);
    const x = w.rider.x;
    expect(S.step(w)).toEqual([]);
    expect(w.rider.x).toBe(x);
  });
  test("the same hands on the same seed ride the same run", () => {
    const ride = () => {
      const w = S.createWorld(31),
        log: string[] = [];
      run(w, 30, (w) => {
        w.tuck = Math.sin(w.time * 1.7) > 0.2;
        if (Math.sin(w.time * 2.3) > 0.995) w.jumpAt = w.time;
        w.turn = Math.sin(w.time * 0.9) > 0.6 ? -1 : 0;
      }).forEach((e) => log.push(JSON.stringify(e)));
      return { log, x: w.rider.x, y: w.rider.y };
    };
    const a = ride();
    expect(a.log.length).toBeGreaterThan(3);
    expect(ride()).toEqual(a);
  });
  test("the rules add the scores up, count the crashes and end with the run's end", () => {
    let s = R.createGame();
    s = R.play(s, R.scoreMove(1200))!;
    s = R.play(s, R.scoreMove(100))!;
    s = R.play(s, { from: -1, to: R.CRASH, extra: -1 })!;
    expect(s).toMatchObject({ score: 1300, crashes: 1, best: 1200, winner: null });
    expect(R.play(s, { from: -1, to: R.SCORE + 0, extra: -1 })).toBeNull();
    s = R.play(s, { from: -1, to: R.END, extra: -1 })!;
    expect(s.winner).toBe(0);
    expect(R.play(s, R.scoreMove(100))).toBeNull();
    expect(R.snowboard.reason!(s)).toContain("1,300");
  });
  test("the clock reads minutes, seconds and hundredths", () => {
    expect(clock(120)).toBe("2:00.00");
    expect(clock(83.456)).toBe("1:23.45");
    expect(clock(-1)).toBe("0:00.00");
  });
});
