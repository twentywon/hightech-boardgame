import { describe, expect, it } from "vitest";
import { COURSES, GRIP, buildTrack, laneLength, laneRadius, middle, safeSpeed, type Track } from "../src/games/slotcar/track";
import { COUNTDOWN, DT, FLY, MARSHAL, WAIT, autopilot, createWorld, progress, ranking, step, strain, ticks, type RaceEvent, type World } from "../src/games/slotcar/sim";
import { END, LAP, OFF, createFromOptions, packRanking, slotCar, unpackRanking, type State } from "../src/games/slotcar/rules";
import { coursePicture } from "../src/games/slotcar/art";

const tool = (to: number, extra = -1) => ({ from: -1, to, extra });
/** Runs a world until `until` says so or `seconds` pass, the pedals given by `pedal`; returns every event. */
function run(world: World, pedal: (w: World, k: number) => boolean, seconds: number, until: (e: RaceEvent[]) => boolean = () => false, level: "easy" | "normal" | "hard" = "normal") {
  const all: RaceEvent[] = [];
  for (let i = 0; i < seconds / DT; i++) {
    const events = step(world, world.cars.map((_, k) => pedal(world, k)), level);
    all.push(...events);
    if (until(events)) break;
  }
  return all;
}
/** The first curve of a track, and how far along its lane a car in `lane` must go to reach it. */
function firstCurve(track: Track, lane: number) {
  const d = track.offsets[lane];
  let before = 0;
  for (let i = 0; i < track.segments.length; i++) {
    const seg = track.segments[i];
    if (seg.kind === "curve") return { index: i, seg, before, d };
    before += laneLength(seg, d);
  }
  throw new Error("no curve");
}
/** A car set at the start of a segment with a speed, the race already under way. */
function launch(world: World, k: number, seg: number, v: number) {
  world.tick = ticks(COUNTDOWN);
  Object.assign(world.cars[k], { seg, u: 0, v });
}

describe("slot car courses", () => {
  it("every course closes on itself, and every lane is as long as the others", () => {
    for (const course of COURSES)
      for (const lanes of [2, 3, 4]) {
        const track = buildTrack(course.value, lanes),
          last = track.segments[track.segments.length - 1],
          end = middle(last, last.length),
          first = track.segments[0];
        expect(Math.hypot(end.x - first.x, end.y - first.y)).toBeLessThan(1e-6);
        expect(last.h1).toBeCloseTo(0, 6);
        const lengths = track.offsets.map((d) => track.segments.reduce((sum, seg) => sum + laneLength(seg, d), 0));
        for (const length of lengths) expect(length).toBeCloseTo(track.length, 6);
        // The start line is on the ground, on a straight.
        expect(first.kind).toBe("straight");
        expect(first.h0).toBe(0);
      }
  });
  it("the bridge carries the track over itself, and nowhere else does it come near itself", () => {
    for (const course of COURSES) {
      const track = buildTrack(course.value, 4),
        points: { x: number; y: number; h: number; s: number }[] = [];
      for (const seg of track.segments)
        for (let a = 0; a < seg.length; a += 0.25) {
          const m = middle(seg, a),
            f = a / seg.length;
          points.push({ x: m.x, y: m.y, h: seg.h0 + (seg.h1 - seg.h0) * f * f * (3 - 2 * f), s: seg.start + a });
        }
      let crossing = false;
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
          const apart = Math.min(Math.abs(points[i].s - points[j].s), track.length - Math.abs(points[i].s - points[j].s));
          if (apart < 6) continue;
          const near = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < track.half * 2 + 0.2;
          if (!near) continue;
          // Where it passes near itself, one pass is the bridge high over the other.
          expect(Math.abs(points[i].h - points[j].h)).toBeGreaterThan(0.8);
          crossing = true;
        }
      expect(crossing).toBe(true);
    }
  });
  it("the safe speed of a curve grows with its radius: lower in the inner lane, higher on a bank", () => {
    const track = buildTrack("eight", 4),
      curve = track.segments.find((s) => s.kind === "curve" && Math.abs(s.turn) > 3)!,
      speeds = track.offsets.map((d) => safeSpeed(curve, d)),
      radii = track.offsets.map((d) => laneRadius(curve, d));
    speeds.forEach((v, k) => expect(v * v).toBeCloseTo(GRIP * radii[k], 6));
    const inner = radii.indexOf(Math.min(...radii)),
      outer = radii.indexOf(Math.max(...radii));
    expect(speeds[inner]).toBeLessThan(speeds[outer]);
    expect(safeSpeed(track.segments[0], 0)).toBe(Infinity);
    const banked = buildTrack("bank", 4).segments.find((s) => s.bank > 0)!;
    expect(safeSpeed(banked, 0)).toBeGreaterThan(Math.sqrt(GRIP * banked.radius));
  });
  it("draws a picture of each course for the setup", () => {
    for (const course of COURSES) expect(coursePicture(course.value)).toMatch(/^<svg.*<path d="M/);
  });
});

describe("slot car driving", () => {
  it("holding the pedal speeds a car up, letting go slows it down, and nothing moves before the lights go green", () => {
    const world = createWorld("eight", 2, 3);
    run(world, () => true, COUNTDOWN - 0.1);
    expect(world.cars[0].v).toBe(0);
    expect(progress(world, 0)).toBe(0);
    run(world, (_, k) => k === 0, 1.2);
    const fast = world.cars[0].v;
    expect(fast).toBeGreaterThan(5);
    expect(world.cars[1].v).toBe(0);
    run(world, () => false, 0.3);
    expect(world.cars[0].v).toBeLessThan(fast - 2);
  });
  it("a car below the safe speed holds its slot through a curve; well above it, it flies off and is set back after the penalty", () => {
    for (const lane of [0, 3]) {
      const calm = createWorld("eight", 4, 3),
        { index, seg, d } = firstCurve(calm.track, lane);
      launch(calm, lane, index, safeSpeed(seg, d) * 0.97);
      // Kept at that speed by a steady hand (the pedal held just enough), it goes all the way round.
      for (let i = 0; i < laneLength(seg, d) / (safeSpeed(seg, d) * 0.97) / DT; i++) {
        calm.cars[lane].v = safeSpeed(seg, d) * 0.97;
        step(calm, [false, false, false, false]);
      }
      expect(calm.cars[lane].offs).toBe(0);
      expect(calm.cars[lane].phase).toBe("slot");
      const wild = createWorld("eight", 4, 3);
      launch(wild, lane, index, safeSpeed(seg, d) * 1.35);
      const events = run(wild, (_, k) => k === lane, 1.5, (e) => e.some((x) => x.kind === "off"));
      expect(events.some((e) => e.kind === "off" && e.car === lane)).toBe(true);
      expect(wild.cars[lane].phase).toBe("off");
      const at = { seg: wild.cars[lane].seg, u: wild.cars[lane].u };
      // While it is off the pedal does nothing; after the penalty it is back in its slot where it left, at rest.
      const back = run(wild, () => true, FLY + MARSHAL + 0.1, (e) => e.some((x) => x.kind === "back"));
      expect(back.some((e) => e.kind === "back" && e.car === lane)).toBe(true);
      expect(wild.cars[lane].phase).toBe("slot");
      expect({ seg: wild.cars[lane].seg, u: wild.cars[lane].u }).toEqual(at);
      expect(wild.cars[lane].v).toBe(0);
    }
  });
  it("a little over the safe speed only steps the tail out; flat out round the course flies off", () => {
    const world = createWorld("eight", 2, 3),
      { index, seg, d } = firstCurve(world.track, 0);
    launch(world, 0, index, safeSpeed(seg, d) * 1.03);
    for (let i = 0; i < 0.4 / DT; i++) {
      world.cars[0].v = safeSpeed(seg, d) * 1.03;
      step(world, [false, false]);
    }
    expect(world.cars[0].phase).toBe("slot");
    expect(world.cars[0].slide).toBeGreaterThan(0);
    for (const course of COURSES) {
      const flat = createWorld(course.value, 2, 3),
        events = run(flat, (_, k) => k === 0, 20, (e) => e.some((x) => x.kind === "off"));
      expect(events.some((e) => e.kind === "off" && e.car === 0)).toBe(true);
    }
  });
  it("the tyres screech before a car flies off: a car let go at the first screech keeps its slot; held on, it flies off", () => {
    const world = createWorld("eight", 2, 3),
      { index, seg, d } = firstCurve(world.track, 0);
    // Calm through the curve: no screech. Near the grip: the screech starts before any slide.
    launch(world, 0, index, safeSpeed(seg, d) * 0.85);
    expect(strain(world, 0)).toBe(0);
    world.cars[0].v = safeSpeed(seg, d) * 0.98;
    expect(strain(world, 0)).toBeGreaterThan(0);
    expect(world.cars[0].slide).toBe(0);
    // Into the curve a fifth too fast: it screeches; let go at once, it slows and stays in its slot.
    for (const held of [false, true]) {
      const w = createWorld("eight", 2, 3);
      launch(w, 0, index, safeSpeed(seg, d) * 1.2);
      expect(strain(w, 0)).toBeGreaterThan(0.5);
      const events = run(w, (_, k) => k === 0 && held, 2.5, (e) => e.some((x) => x.kind === "off"));
      expect(events.some((e) => e.kind === "off")).toBe(held);
    }
    // On a straight a car flat out never flies off.
    const straight = world.track.segments.findIndex((s) => s.kind === "straight");
    const flat = createWorld("eight", 2, 3);
    launch(flat, 0, straight, 11);
    expect(strain(flat, 0)).toBe(0);
  });
  it("counts a lap each time a car crosses the line, and the car home first is first", () => {
    const world = createWorld("eight", 2, 2),
      // My car flies round at a careful speed; the other never moves.
      careful = (w: World, k: number) => k === 0 && autopilot(w, 0, "hard");
    const events = run(world, careful, 120, (e) => e.some((x) => x.kind === "end"));
    const laps = events.filter((e) => e.kind === "lap");
    expect(laps.map((e) => e.kind === "lap" && e.car)).toEqual([0, 0]);
    expect(world.cars[0].laps).toBe(2);
    expect(world.cars[0].place).toBe(0);
    expect(world.cars[0].best).not.toBeNull();
    // The other car never came home: the race closed the wait after the first car.
    const end = events.find((e) => e.kind === "end")!;
    expect(end.kind === "end" && end.ranking).toEqual([0, 1]);
    expect(world.closed! - world.cars[0].finish!).toBe(ticks(WAIT));
  });
  it("the computer's drivers finish a race at every level", () => {
    for (const course of COURSES)
      for (const level of ["easy", "normal", "hard"] as const) {
        const world = createWorld(course.value, 4, 3, level, 7),
          events = run(world, (w, k) => autopilot(w, k, level), 200, (e) => e.some((x) => x.kind === "end"), level);
        expect(events.some((e) => e.kind === "end")).toBe(true);
        expect(world.order).toHaveLength(4);
        expect(ranking(world)).toEqual(world.order);
      }
  });
  it("at every level the computer's drivers fly off now and then, going too fast into a curve (the lower the level, the more often), but not often", () => {
    const rate = (level: "easy" | "normal" | "hard") => {
      let offs = 0,
        laps = 0;
      for (const course of COURSES)
        for (let seed = 1; seed <= 4; seed++) {
          const world = createWorld(course.value, 4, 5, level, seed);
          run(world, (w, k) => autopilot(w, k, level), 300, (e) => e.some((x) => x.kind === "end"), level);
          offs += world.cars.reduce((sum, c) => sum + c.offs, 0);
          laps += world.cars.reduce((sum, c) => sum + c.laps, 0);
        }
      return offs / laps;
    };
    const easy = rate("easy"),
      normal = rate("normal"),
      hard = rate("hard");
    for (const r of [easy, normal, hard]) {
      expect(r).toBeGreaterThan(0.01);
      expect(r).toBeLessThan(0.15);
    }
    expect(easy).toBeGreaterThan(hard);
  });
  it("is the same race every time it is run with the same seed and the same pedals", () => {
    const race = () => {
      const world = createWorld("hairpin", 4, 3, "easy", 42),
        // My pedal pulses by the clock, the others drive themselves.
        pedal = (w: World, k: number) => (k === 0 ? Math.floor(w.tick / 50) % 3 !== 0 : autopilot(w, k, "easy")),
        events = run(world, pedal, 200, (e) => e.some((x) => x.kind === "end"), "easy");
      return { events: JSON.stringify(events), cars: JSON.stringify(world.cars), tick: world.tick };
    };
    expect(race()).toEqual(race());
  });
});

describe("slot car rules", () => {
  const ai = () => createFromOptions("eight", { laps: 3, computers: 2 }),
    local = () => createFromOptions("bank", { laps: 5, people: 4, computers: 3 });
  it("sets up a race against the computer or for people at one screen", () => {
    expect(ai()).toMatchObject({ course: "eight", laps: 3, cars: 3, people: 1 });
    expect(local()).toMatchObject({ course: "bank", laps: 5, cars: 4, people: 4 });
    expect(slotCar.create("", {})).toMatchObject({ course: COURSES[0].value, laps: 5, cars: 4, people: 1 });
  });
  it("counts laps and flights off, and keeps the order cars come home in", () => {
    let s: State = ai();
    for (let k = 0; k < 3; k++) s = slotCar.play(s, tool(LAP + 1))!;
    expect(s.done[1]).toBe(3);
    expect(s.order).toEqual([1]);
    // A car home makes no more laps; a car that does not exist makes none.
    expect(slotCar.play(s, tool(LAP + 1))).toBeNull();
    expect(slotCar.play(s, tool(LAP + 3))).toBeNull();
    s = slotCar.play(s, tool(OFF + 0))!;
    expect(s.offs).toEqual([1, 0, 0]);
    expect(slotCar.winner(s)).toBeNull();
  });
  it("ends with every car's place: against the computer I win only from first place, at one screen someone always wins", () => {
    let s: State = ai();
    for (let k = 0; k < 3; k++) s = slotCar.play(s, tool(LAP + 2))!;
    // The places must begin with the cars home, in their order, and name every car once.
    expect(slotCar.play(s, tool(END, packRanking([0, 2, 1])))).toBeNull();
    expect(slotCar.play(s, tool(END, packRanking([2, 0])))).toBeNull();
    const lost = slotCar.play(s, tool(END, packRanking([2, 0, 1])))!;
    expect(lost.ranking).toEqual([2, 0, 1]);
    expect(slotCar.winner(lost)).toBe(1);
    expect(slotCar.moves(lost)).toEqual([]);
    expect(slotCar.reason(lost)).toContain("1위 컴퓨터 2");
    let mine: State = ai();
    for (let k = 0; k < 3; k++) mine = slotCar.play(mine, tool(LAP + 0))!;
    expect(slotCar.winner(slotCar.play(mine, tool(END, packRanking([0, 1, 2])))!)).toBe(0);
    let people: State = local();
    for (let k = 0; k < 5; k++) people = slotCar.play(people, tool(LAP + 3))!;
    const done = slotCar.play(people, tool(END, packRanking([3, 1, 0, 2])))!;
    expect(slotCar.winner(done)).toBe(0);
    expect(slotCar.reason(done)).toMatch(/^1위 4번 초록 · 2위 2번 파랑\(완주 못 함\)/);
  });
  it("packs a finishing order into one number and back", () => {
    for (const order of [[0, 1], [3, 2, 1, 0], [1, 0, 2]]) expect(unpackRanking(packRanking(order))).toEqual(order);
  });
});
