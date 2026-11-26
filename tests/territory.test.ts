import { describe, expect, it } from "vitest";
import { follow, hostWants, inputOf, laySlice, readInput, readSnap, snapOf } from "../src/games/territory/net";
import { END, OUT, createGame, createNet, packEnd, play as playMove, territory, unpackEnd } from "../src/games/territory/rules";
import { CELLS, COUNTDOWN, DT, HOME, N, autopilot, cellOf, createWorld, ranking, shares, step, ticks, type Event, type Level, type World } from "../src/games/territory/sim";

/** Runs the countdown off, so that the movers go. */
function started(world: World) {
  while (world.tick < ticks(COUNTDOWN)) step(world, []);
  return world;
}
/** Steers mover 0 along a list of headings, each held for its seconds; the others stand still (held in place). */
function drive(world: World, legs: [number, number][], others: (number | null)[] = []) {
  const events: Event[] = [];
  for (const [heading, seconds] of legs)
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      // The others are frozen where they are: their heading kept, their place put back.
      const keep = world.movers.map((m) => ({ x: m.x, y: m.y }));
      events.push(...step(world, [heading, ...others]));
      world.movers.forEach((m, k) => {
        if (k > 0 && others[k - 1] === undefined) {
          m.x = keep[k].x;
          m.y = keep[k].y;
        }
      });
    }
  return events;
}
const R = 0,
  D = Math.PI / 2,
  Lf = Math.PI,
  U = -Math.PI / 2;

describe("territory (땅따먹기): the field", () => {
  it("begins with a small patch for each mover, apart, and nothing else owned", () => {
    for (const n of [2, 3, 4]) {
      const world = createWorld(n, 180, 7);
      expect(world.movers).toHaveLength(n);
      const patch = (2 * HOME + 1) ** 2 - 4;
      world.movers.forEach((m, k) => {
        expect(m.land).toBe(patch);
        expect(world.owner[m.cell]).toBe(k + 1);
      });
      expect([...world.owner].filter(Boolean)).toHaveLength(patch * n);
      // Shares sum to what is owned.
      expect(shares(world).reduce((a, b) => a + b, 0)).toBeCloseTo((patch * n) / CELLS, 6);
    }
  });
  it("stands still through the countdown, then every mover runs on by itself", () => {
    const world = createWorld(2, 180, 1),
      at = world.movers.map((m) => ({ x: m.x, y: m.y })),
      events: Event[] = [];
    while (world.tick < ticks(COUNTDOWN) - 1) events.push(...step(world, []));
    world.movers.forEach((m, k) => expect(m.x).toBe(at[k].x));
    expect(events.filter((e) => e.kind === "count")).toHaveLength(3);
    events.push(...step(world, []), ...step(world, []));
    expect(events.some((e) => e.kind === "go")).toBe(true);
    for (let i = 0; i < 60; i++) step(world, []);
    world.movers.forEach((m, k) => expect(Math.hypot(m.x - at[k].x, m.y - at[k].y)).toBeGreaterThan(3));
  });
  it("leaves a trail off its land, and coming back takes the trail and all it closes round", () => {
    const world = started(createWorld(2, 180, 3)),
      m = world.movers[0];
    m.heading = R;
    const before = m.land;
    // Out to the right, down, back left and up into the patch again: a loop.
    const events = drive(world, [
      [R, 1.6],
      [D, 1.4],
      [Lf, 1.6],
      [U, 1.2],
    ]);
    expect(m.alive).toBe(true);
    const claim = events.find((e) => e.kind === "claim");
    expect(claim).toBeTruthy();
    expect(m.trail).toHaveLength(0);
    expect([...world.trail].filter(Boolean)).toHaveLength(0);
    // More than the trail itself: the inside of the loop as well.
    expect(m.land).toBeGreaterThan(before + 20);
    // No hole in what it took: every cell inside its bounds that it surrounds is its own.
    const cells = [...world.owner.keys()].filter((c) => world.owner[c] === 1),
      xs = cells.map((c) => c % N),
      ys = cells.map((c) => Math.floor(c / N));
    let holes = 0;
    for (let y = Math.min(...ys) + 1; y < Math.max(...ys); y++)
      for (let x = Math.min(...xs) + 1; x < Math.max(...xs); x++) {
        const c = y * N + x;
        if (world.owner[c] !== 1 && [c - 1, c + 1, c - N, c + N].every((n) => world.owner[n] === 1)) holes++;
      }
    expect(holes).toBe(0);
  });
  it("takes the others' land that its loop closes round", () => {
    const world = started(createWorld(2, 180, 3)),
      [a, b] = world.movers;
    // Mover 1's patch is put right beside mover 0's, inside the loop that 0 will run.
    for (let c = 0; c < CELLS; c++) if (world.owner[c] === 2) world.owner[c] = 0;
    b.land = 0;
    const bx = Math.floor(a.x) + 5,
      by = Math.floor(a.y) + 3;
    for (let y = by; y < by + 2; y++)
      for (let x = bx; x < bx + 2; x++) {
        world.owner[y * N + x] = 2;
        b.land++;
      }
    b.x = 50.5;
    b.y = 50.5;
    b.cell = cellOf(b.x, b.y);
    const events = drive(world, [
      [R, 1.9],
      [D, 1.5],
      [Lf, 1.9],
      [U, 1.7],
    ]);
    expect(events.some((e) => e.kind === "claim" && e.who === 0)).toBe(true);
    // All of 1's land is closed in and taken: with nothing left, 1 is out.
    expect(b.land).toBe(0);
    expect(events.some((e) => e.kind === "out" && e.who === 1 && e.how === "engulfed")).toBe(true);
  });
  it("is out when another runs over its trail, and the one who ran over it is not", () => {
    const world = started(createWorld(2, 180, 5)),
      [a, b] = world.movers;
    a.heading = R;
    drive(world, [[R, 1.2]]);
    expect(a.trail.length).toBeGreaterThan(3);
    // Mover 1 is set down just beside the trail's middle and runs across it.
    const c = a.trail[Math.floor(a.trail.length / 2)];
    b.x = (c % N) + 0.5;
    b.y = Math.floor(c / N) - 1.5;
    b.cell = cellOf(b.x, b.y);
    b.heading = D;
    const events: Event[] = [];
    for (let i = 0; i < 40; i++) events.push(...step(world, [R, D]));
    const out = events.find((e) => e.kind === "out");
    expect(out).toMatchObject({ who: 0, by: 1, how: "cut" });
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(true);
    expect(b.kos).toBe(1);
    expect(a.land).toBe(0);
    expect([...world.trail].filter((t) => t === 1)).toHaveLength(0);
    // It comes back a few seconds later with a new patch.
    for (let i = 0; i < ticks(3.2); i++) step(world, [null, null]);
    expect(a.alive).toBe(true);
    expect(a.land).toBe((2 * HOME + 1) ** 2 - 4);
  });
  it("is out when it crosses its own trail, but not on a tight turn beside the trail's newest cells", () => {
    const world = started(createWorld(2, 180, 9)),
      a = world.movers[0];
    a.heading = R;
    // A full turn the tightest way: back beside its own newest cells, not through older ones.
    drive(world, [[R, 2.0]]);
    const events = drive(world, [
      [D, 0.4],
      [Lf, 0.4],
    ]);
    expect(events.filter((e) => e.kind === "out")).toHaveLength(0);
    // Now straight up through the trail it laid going right.
    const out = drive(world, [
      [Lf, 0.3],
      [U, 1.0],
    ]).find((e) => e.kind === "out");
    expect(out).toMatchObject({ who: 0, by: 0, how: "self" });
  });
  it("slides along the wall instead of leaving the field", () => {
    const world = started(createWorld(2, 180, 2)),
      a = world.movers[0];
    a.heading = U;
    drive(world, [[U, 6]]);
    expect(a.y).toBeGreaterThan(0);
    expect(a.y).toBeLessThan(1);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x).toBeLessThan(N);
  });
  it("ends when the time is up, the most land first", () => {
    const world = createWorld(3, 5, 4),
      events: Event[] = [];
    world.movers[2].land += 30;
    while (world.closed === null) events.push(...step(world, [null, null, null]));
    expect(world.tick).toBe(ticks(COUNTDOWN + 5));
    const end = events.find((e) => e.kind === "end")!;
    expect(end.kind === "end" && end.ranking[0]).toBe(ranking(world)[0]);
    expect(step(world, [])).toEqual([]);
  });
});

describe("territory: the computer's movers", () => {
  const play = (level: Level, seed: number, seconds = 120) => {
    const world = createWorld(4, seconds, seed),
      events: Event[] = [];
    while (world.closed === null) events.push(...step(world, world.movers.map((_, k) => autopilot(world, k, level))));
    return { world, events };
  };
  for (const level of ["easy", "normal", "hard"] as Level[])
    it(`${level}: run loops and take land, and seldom put themselves out`, () => {
      let selfOuts = 0,
        claims = 0,
        most = 0;
      for (const seed of [1, 2, 3]) {
        const { world, events } = play(level, seed);
        selfOuts += events.filter((e) => e.kind === "out" && e.how === "self").length;
        claims += events.filter((e) => e.kind === "claim").length;
        most = Math.max(most, ...shares(world));
        // The field's land is never more than the field.
        expect(world.movers.reduce((s, m) => s + m.land, 0)).toBe([...world.owner].filter(Boolean).length);
      }
      // Twelve movers over two minutes each.
      expect(claims).toBeGreaterThan(12 * 8);
      expect(selfOuts).toBeLessThanOrEqual(6);
      expect(most).toBeGreaterThan(0.04);
    }, 60000);
  it("hard beats easy more often than not", () => {
    let wins = 0;
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const world = createWorld(2, 120, seed);
      while (world.closed === null) step(world, [autopilot(world, 0, "hard"), autopilot(world, 1, "easy")]);
      if (ranking(world)[0] === 0) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(4);
  }, 60000);
});


describe("territory: the round as moves", () => {
  it("packs the finishing order and the shares into one move and reads them back", () => {
    const { ranking, shares } = unpackEnd(packEnd([2, 0, 3, 1], [0.123, 0.5, 0.0, 0.271]), 4);
    expect(ranking).toEqual([2, 0, 3, 1]);
    expect(shares).toEqual([0.123, 0.5, 0, 0.271]);
    expect(Number.isSafeInteger(packEnd([3, 2, 1, 0], [1, 1, 1, 1]))).toBe(true);
  });
  it("counts who was put out and by whom, and ends with the order: I win only from first place", () => {
    let s = createGame(180, 3);
    s = playMove(s, { from: -1, to: OUT + 1, extra: 0 })!;
    expect(s.outs).toEqual([0, 1, 0]);
    expect(s.kos).toEqual([1, 0, 0]);
    s = playMove(s, { from: -1, to: OUT + 0, extra: -1 })!;
    expect(s.outs).toEqual([1, 1, 0]);
    expect(playMove(s, { from: -1, to: END, extra: packEnd([0, 0, 1], [0.1, 0.1, 0.1]) })).toBeNull();
    const won = playMove(s, { from: -1, to: END, extra: packEnd([0, 2, 1], [0.3, 0.1, 0.2]) })!;
    expect(won.winner).toBe(0);
    expect(territory.reason(won)).toContain("1위 나 30.0%");
    expect(playMove(s, { from: -1, to: END, extra: packEnd([1, 0, 2], [0.2, 0.3, 0.1]) })!.winner).toBe(1);
    expect(playMove(won, { from: -1, to: OUT, extra: -1 })).toBeNull();
  });
  it("over Wi-Fi a mover for each seat taken, in seat order", () => {
    const s = createNet("120", [true, true, false, true]);
    expect(s.movers).toBe(3);
    expect(s.seats).toEqual([0, 1, 3]);
    expect(s.seconds).toBe(120);
  });
});

describe("territory over Wi-Fi: the host's round as numbers", () => {
  it("two states in a row hold the whole field, and a guest lays it exactly", () => {
    const world = started(createWorld(4, 180, 21));
    for (let i = 0; i < ticks(25); i++) step(world, world.movers.map((_, k) => autopilot(world, k, "normal")));
    const guest = createWorld(4, 180, 1);
    guest.owner.fill(0);
    const changed = new Set<number>();
    const a = readSnap(snapOf(world, 0))!,
      b = readSnap(snapOf(world, 1))!;
    expect(snapOf(world, 0).length).toBeLessThanOrEqual(256);
    laySlice(guest.owner, a, changed, 4);
    laySlice(guest.owner, b, changed, 4);
    expect([...guest.owner]).toEqual([...world.owner]);
    expect(changed.size).toBe([...world.owner].filter(Boolean).length);
    // The movers between two states, their counts as the later has them.
    follow(guest, a, b, 0.5);
    world.movers.forEach((m, k) => {
      expect(guest.movers[k].x).toBeCloseTo(m.x, 2);
      expect(guest.movers[k].land).toBe(m.land);
      expect(guest.movers[k].trail.length).toBe(m.trail.length);
      expect(guest.movers[k].alive).toBe(m.alive);
    });
  });
  it("a guest's hand: a heading or straight on; the host steers each mover by whoever drives it", () => {
    expect(readInput(inputOf(1.234))).toBeCloseTo(1.234, 3);
    expect(readInput(inputOf(null))).toBeNull();
    expect(readInput(null)).toBeNull();
    const world = started(createWorld(3, 180, 2));
    const wants = hostWants(
      world,
      [0, 1, 3],
      (seat) => (seat === 0 ? "me" : seat === 1 ? "remote" : "computer"),
      (seat) => (seat === 1 ? inputOf(-1) : null),
      0.5,
      "normal",
    );
    expect(wants[0]).toBe(0.5);
    expect(wants[1]).toBeCloseTo(-1, 3);
    expect(typeof wants[2]).toBe("number");
  });
});
