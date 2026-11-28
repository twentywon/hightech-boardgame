import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as cr from "../src/games/coinpusher/rules";
import * as cs from "../src/games/coinpusher/sim";

const made = (to: number) => ({ from: -1, to, extra: -1 });
/** Runs `seconds` of the machine, dropping a coin at `places` in turn every `every` seconds while any are left; returns what happened. */
function run(world: cs.World, seconds: number, places: number[] = [], every = 0.6) {
  const seen: cs.Happening[] = [];
  let next = 0.2,
    k = 0;
  for (let s = 0; s < seconds / cs.DT; s++) {
    if (k < places.length && world.t >= next) {
      cs.drop(world, places[k++]);
      next = world.t + every;
    }
    seen.push(...cs.step(world));
  }
  return seen;
}
/** A world with nothing on its board. */
function bare(seed = 1, coins: number | "endless" = 30) {
  const world = cs.createWorld(coins, seededRandom(seed));
  world.n = 0;
  return world;
}
describe("coin pusher machine", () => {
  test("the same seed and the same drops come to the same coins", () => {
    const a = cs.createWorld(30, seededRandom(7)),
      b = cs.createWorld(30, seededRandom(7)),
      places = [3, 12, 20, 7, 12, 0, 24, 15];
    run(a, 12, places);
    run(b, 12, places);
    expect(a.n).toBe(b.n);
    expect([a.won, a.lost, a.hand]).toEqual([b.won, b.lost, b.hand]);
    for (let i = 0; i < a.n; i++) expect([a.x[i], a.y[i], a.z[i], a.gx[i]]).toEqual([b.x[i], b.y[i], b.z[i], b.gx[i]]);
    // Another seed lays another board.
    const c = cs.createWorld(30, seededRandom(8));
    expect(c.n === a.n && c.x[0] === a.x[0]).toBe(false);
  });
  test("every coin is accounted for: in hand, on the board, won or lost", () => {
    for (const seed of [1, 2, 3]) {
      const world = cs.createWorld(30, seededRandom(seed)),
        laid = world.n;
      expect(laid).toBeGreaterThan(150);
      run(world, 40, Array.from({ length: 30 }, (_, k) => (k * 7) % cs.AIMS), 0.5);
      expect(world.hand + world.dropped).toBe(30 + world.roulette.queued * 0 + extraHand(world));
      expect(world.n).toBe(cs.booked(world, laid));
      expect(world.n + world.won + world.lost).toBe(laid + world.dropped + world.showered);
      // Nothing sinks into the floor or flies off.
      for (let i = 0; i < world.n; i++) {
        expect(world.y[i]).toBeGreaterThan(-0.31);
        expect(Math.abs(world.x[i])).toBeLessThan(cs.FIELD.w + cs.R * 2);
      }
    }
  });
  test("no coin can be dropped with none in hand, and coins without end never run out", () => {
    const world = cs.createWorld(2, seededRandom(3));
    expect(cs.drop(world, 5)).toBe(true);
    expect(cs.drop(world, 5)).toBe(true);
    expect(cs.drop(world, 5)).toBe(false);
    expect(world.dropped).toBe(2);
    const free = cs.createWorld("endless", seededRandom(3));
    for (let k = 0; k < 50; k++) expect(cs.drop(free, k % cs.AIMS)).toBe(true);
  });
  test("coins lie in layers without passing through each other", () => {
    const world = cs.createWorld(30, seededRandom(4));
    run(world, 15, [12, 12, 4, 20, 12, 8, 16]);
    let worst = 0;
    for (let i = 0; i < world.n; i++)
      for (let j = i + 1; j < world.n; j++)
        if (Math.abs(world.y[i] - world.y[j]) < cs.H * 0.5) worst = Math.max(worst, 2 * cs.R - Math.hypot(world.x[i] - world.x[j], world.z[i] - world.z[j]));
    expect(worst).toBeLessThan(cs.R * 0.15);
  });
  test("the pusher's face pushes a column of coins over the front edge", () => {
    const world = bare(5);
    for (let z = cs.PUSHER.back + cs.R + 0.01; z < cs.FIELD.front - cs.R * 0.5; z += 2 * cs.R) cs.place(world, 0, 0, z);
    const before = world.n,
      seen = run(world, 2 * cs.PUSHER.period);
    expect(seen.filter((e) => e.kind === "won").length).toBeGreaterThan(0);
    expect(world.won).toBeGreaterThan(0);
    expect(world.lost).toBe(0);
    expect(world.n + world.won).toBe(before);
    // A coin alone in the middle of the field, out of the face's reach, stays where it is.
    const still = bare(5);
    cs.place(still, 0.4, 0, 0.6);
    run(still, cs.PUSHER.period);
    expect(still.n).toBe(1);
    expect(still.z[0]).toBeCloseTo(0.6, 5);
  });
  test("a coin pushed over the side where the walls end falls down a gutter and is lost", () => {
    const world = bare(6);
    cs.place(world, cs.FIELD.w + 0.05, 0, cs.FIELD.gap + 0.3);
    const seen = run(world, 2);
    expect(seen.some((e) => e.kind === "lost")).toBe(true);
    expect([world.won, world.lost, world.n]).toEqual([0, 1, 0]);
    // Behind the gutters the side wall holds a coin in.
    const held = bare(6);
    cs.place(held, cs.FIELD.w + 0.05, 0, cs.FIELD.gap - 0.4);
    run(held, 2);
    expect(held.n).toBe(1);
    expect(held.x[0]).toBeLessThanOrEqual(cs.FIELD.w - cs.R + 1e-9);
  });
  test("a coin dropped from the chute lands on the pusher's top or before it", () => {
    for (const place of [0, 12, 24]) {
      const world = bare(8);
      cs.drop(world, place);
      run(world, 1);
      expect(world.n).toBe(1);
      expect(world.rest[0]).not.toBe(0);
      expect(world.x[0]).toBeCloseTo(cs.aimX(place), 1);
      expect(world.z[0]).toBeLessThan(0);
    }
    expect(cs.placeAt(cs.aimX(7))).toBe(7);
  });
  test("a prize token that falls in starts the roulette, and its prize rains coins or puts them in hand", () => {
    let showers = 0,
      hands = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const world = bare(seed, 0);
      cs.place(world, 0, 0, cs.FIELD.front + cs.R * 0.8, 1);
      const seen = run(world, cs.SPIN + cs.SHOW + 4);
      expect(seen.filter((e) => e.kind === "token")).toHaveLength(1);
      expect(seen.some((e) => e.kind === "tick")).toBe(true);
      const bonus = seen.find((e) => e.kind === "bonus") as { kind: "bonus"; prize: number };
      expect(bonus).toBeTruthy();
      const prize = cs.PRIZES[bonus.prize];
      if (prize.shower) {
        showers++;
        expect(world.showered).toBe(prize.shower);
      } else {
        hands++;
        expect(world.hand).toBe(prize.hand);
      }
      expect(world.roulette.phase).toBe("idle");
    }
    expect(showers).toBeGreaterThan(0);
    expect(showers + hands).toBe(12);
  });
  test("with nothing left in hand the board settles once", () => {
    const world = cs.createWorld(5, seededRandom(9)),
      seen = run(world, 70, [10, 11, 12, 13, 14]);
    expect(world.hand).toBe(0);
    expect(seen.filter((e) => e.kind === "settled")).toHaveLength(1);
    expect(world.settled).toBe(true);
    // Without end it never does.
    const free = cs.createWorld("endless", seededRandom(9));
    expect(run(free, 50, [10, 11, 12]).some((e) => e.kind === "settled")).toBe(false);
  });
  test("a slice with a full board stays cheap", () => {
    const world = cs.createWorld("endless", seededRandom(10));
    run(world, 30, Array.from({ length: 140 }, (_, k) => (k * 5) % cs.AIMS), 0.2);
    expect(world.n).toBeGreaterThan(220);
    const start = performance.now();
    for (let k = 0; k < 600; k++) cs.step(world);
    const each = (performance.now() - start) / 600;
    // A frame at 60 Hz runs two slices; this leaves the drawing nearly all of it.
    expect(each).toBeLessThan(2);
  });
});
/** Coins the roulette put in hand. */
function extraHand(world: cs.World) {
  return world.hand + world.dropped - 30;
}
describe("coin pusher rules", () => {
  test("a drop spends a coin from hand and is refused with none left", () => {
    let s = cr.createGame("30");
    expect([s.hand, s.won, s.endless]).toEqual([30, 0, false]);
    s = cr.play(s, made(cr.DROP + 4))!;
    expect([s.hand, s.dropped, s.aim]).toEqual([29, 1, 4]);
    expect(cr.play(s, made(cr.DROP + cs.AIMS))).toBeNull();
    for (const to of [cr.HOLD, cr.LET, cr.SLIDE, cr.SLIDE + 1, cr.STOP, cr.STOP + 1]) {
      const next = cr.play(s, made(to))!;
      expect(next.ply).toBe(s.ply + 1);
      expect(next.hand).toBe(s.hand);
    }
    let empty = { ...s, hand: 0 };
    expect(cr.play(empty, made(cr.DROP + 3))).toBeNull();
    empty = cr.play(empty, made(cr.BONUS + cs.PRIZES.findIndex((p) => p.hand > 0)))!;
    expect(empty.hand).toBeGreaterThan(0);
  });
  test("coins won and lost are counted, and the game ends only when the board settles with nothing in hand", () => {
    let s = cr.createGame("30");
    s = cr.play(s, made(cr.WON + 3))!;
    s = cr.play(s, made(cr.LOST + 2))!;
    expect([s.won, s.lost]).toEqual([3, 2]);
    expect(cr.play(s, made(cr.WON))).toBeNull();
    expect(cr.play(s, made(cr.SETTLED))).toBeNull();
    const done = cr.play({ ...s, hand: 0, won: 31 }, made(cr.SETTLED))!;
    expect(done.winner).toBe(0);
    expect(cr.coinPusher.reason(done)).toMatch(/^동전 31개를 땄습니다!/);
    expect(cr.play({ ...s, hand: 0, won: 30 }, made(cr.SETTLED))!.winner).toBe(1);
    expect(cr.moves(done)).toEqual([]);
    // Without end: no coin runs out and the game never ends.
    let free = cr.createGame("free");
    for (let k = 0; k < 100; k++) free = cr.play(free, made(cr.DROP + (k % cs.AIMS)))!;
    expect([free.endless, free.dropped, free.winner]).toEqual([true, 100, null]);
    expect(cr.play(free, made(cr.SETTLED))).toBeNull();
  });
});
