import { describe, expect, test } from "vitest";
import * as R from "../src/games/runner/rules";
import {
  BOSS_HALF,
  DT,
  HALF,
  HEARTS,
  N,
  REACH,
  SAFE,
  SQUARE,
  STAGES,
  TALL,
  aheadOf,
  createWorld,
  groundAt,
  jump,
  profile,
  runnerCentre,
  step,
  strike,
  strikeBox,
  toWorld,
  type Event,
  type Square,
  type World,
} from "../src/games/runner/sim";

const move = (to: number) => ({ from: -1, to, extra: -1 });
/** A room with nothing flying in and the boss holding its throws. */
function quiet(stage = 1): World {
  const world = createWorld(stage, 7);
  world.next = Infinity;
  if (world.boss) world.boss.next = Infinity;
  world.runner.safe = 0;
  return world;
}
/** Steps the room for some seconds (or until `until` says so), gathering what happened. */
function run(world: World, seconds: number, until?: (events: Event[]) => boolean) {
  const all: Event[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const events = step(world);
    all.push(...events);
    if (until?.(events)) break;
  }
  return all;
}
const hurts = (events: Event[]) => events.filter((e) => e.kind === "hurt").length;
/** A square of the plain kind, at rest, at a point of the room. */
function square(world: World, x: number, y: number, extra: Partial<Square> = {}): Square {
  const s: Square = { id: world.ids++, kind: "drift", x, y, vx: 0, vy: 0, appear: 0, knocked: false, angle: 0, spin: 0, orbit: null, slot: 0, ...extra };
  world.squares.push(s);
  return s;
}
/** Runs until his front is `gap` from the wall ahead. */
function approach(world: World, gap: number) {
  run(world, 10, () => aheadOf(world.runner) <= gap);
}

describe("running round the room", () => {
  test("he runs along the floor by himself, the way round he starts", () => {
    const world = quiet(),
      start = world.runner.u;
    run(world, 1);
    expect(world.runner.side).toBe(0);
    expect(world.runner.u - start).toBeCloseTo(STAGES[0].speed, 0);
    expect(world.runner.h).toBe(0);
  });
  test("a jump near the wall turns him a quarter onto it, and four take him all the way round", () => {
    const world = quiet(),
      sides: number[] = [];
    for (let k = 0; k < 4; k++) {
      approach(world, 1.5);
      expect(jump(world)).toBe(true);
      sides.push(world.runner.side);
      // He lands on the wall and runs on along it.
      run(world, 0.8);
      expect(world.runner.air).toBe(false);
    }
    expect(sides).toEqual([1, 2, 3, 0]);
    expect(world.runner.safe).toBeLessThanOrEqual(0);
  });
  test("the turn keeps his middle where it was on the screen", () => {
    const world = quiet();
    approach(world, 2);
    const before = runnerCentre(world.runner);
    jump(world);
    const after = runnerCentre(world.runner);
    expect(after[0]).toBeCloseTo(before[0], 5);
    expect(after[1]).toBeCloseTo(before[1], 5);
    // On the right wall, gravity is toward it: he falls onto it, then runs up.
    run(world, 0.6);
    expect(world.runner.h).toBe(0);
    expect(toWorld(1, world.runner.u, 0)[0]).toBe(N);
  });
  test("a jump far from the wall is a leap that comes down on the same side", () => {
    const world = quiet();
    expect(aheadOf(world.runner)).toBeGreaterThan(REACH);
    jump(world);
    expect(world.runner.air).toBe(true);
    let peak = 0;
    run(world, 2, () => ((peak = Math.max(peak, world.runner.h)), !world.runner.air));
    expect(peak).toBeGreaterThan(4);
    expect(world.runner.side).toBe(0);
    // No jumping again in the air (unless the wall is near).
    jump(world);
    expect(jump(world)).toBe(false);
  });
  test("a leap still in the air when it meets the wall turns him without a hurt", () => {
    const world = quiet();
    approach(world, REACH + 0.6);
    jump(world);
    expect(world.runner.side).toBe(0);
    const events = run(world, 1.5, () => world.runner.side === 1);
    expect(world.runner.side).toBe(1);
    expect(hurts(events)).toBe(0);
  });
  test("running into the wall on his feet costs a heart, and he is set on the wall all the same", () => {
    const world = quiet(),
      events = run(world, 6, () => world.runner.side === 1);
    expect(hurts(events)).toBe(1);
    expect(events.find((e) => e.kind === "hurt")).toMatchObject({ by: "wall" });
    expect(world.runner.side).toBe(1);
    expect(world.runner.safe).toBeCloseTo(SAFE, 1);
    // He blinks for a while: the next wall within it would not hurt (and the clock runs on).
    run(world, 0.5);
    expect(world.runner.safe).toBeGreaterThan(0);
  });
  test("the way round turns in a stage that says so, and is warned of first", () => {
    const world = quiet(9);
    const events = run(world, STAGES[8].flip! + 0.1, (e) => e.some((x) => x.kind === "flip"));
    expect(events.some((e) => e.kind === "flip")).toBe(true);
    expect(world.runner.dir).toBe(-1);
  });
});

describe("obstacles", () => {
  test("a stack of one or two he runs up and down by himself", () => {
    const world = quiet(2);
    // The floor's first stack is one high at column 5, and the right wall's two high at column 5.
    expect(profile(world, 0, 5)).toEqual([1, 1]);
    expect(profile(world, 1, 5)).toEqual([2, 2]);
    let highest = 0;
    const events = run(world, 5, () => ((highest = Math.max(highest, world.runner.air ? 0 : world.runner.h)), world.runner.u >= 6.6));
    expect(hurts(events)).toBe(0);
    expect(highest).toBe(1);
    // Off it again on his feet: a step down that low is walked, not fallen.
    expect(world.runner.air).toBe(false);
    expect(world.runner.h).toBe(0);
  });
  test("a jump pressed just after walking off an edge, or just before landing, is still made", () => {
    const world = quiet(2);
    // On top of the floor's stack of three, about to walk off it.
    world.runner.u = 8.5;
    world.runner.h = 3;
    run(world, 2, () => world.runner.air);
    expect(world.runner.vh).toBe(0);
    run(world, 0.06);
    expect(jump(world)).toBe(true);
    expect(world.runner.vh).toBeGreaterThan(15);
    // A plain leap; pressed again on the way down, it is made as soon as he lands.
    const plain = quiet();
    jump(plain);
    run(plain, 2, () => plain.runner.vh < 0 && plain.runner.h < 0.8);
    expect(jump(plain)).toBe(false);
    run(plain, 0.5, () => plain.runner.vh > 0);
    expect(plain.runner.vh).toBeGreaterThan(0);
    expect(plain.runner.jumps).toBe(2);
  });
  test("a stack of three must be jumped: run into, it costs a heart and throws him over", () => {
    const world = quiet(2);
    expect(profile(world, 0, 8)).toEqual([3, 3]);
    const events = run(world, 2.5, (e) => e.some((x) => x.kind === "hurt"));
    expect(events.find((e) => e.kind === "hurt")).toMatchObject({ by: "stack" });
    expect(world.runner.air).toBe(true);
    // Thrown over, he comes down beyond it.
    run(world, 1.5, () => !world.runner.air);
    expect(world.runner.u).toBeGreaterThan(8);
  });
  test("jumped in time, the stack of three is cleared without a hurt", () => {
    const world = quiet(2);
    // Take off a little over a cell before its face.
    run(world, 5, () => world.runner.u + HALF >= 8 - 1.3);
    jump(world);
    const events = run(world, 1.1);
    expect(hurts(events)).toBe(0);
    expect(world.runner.u).toBeGreaterThan(9);
  });
  test("slopes are followed on his feet", () => {
    const world = quiet(3);
    expect(groundAt(world, 0, 5.5)).toBeCloseTo(1.5);
    const heights: number[] = [];
    const events = run(world, 1.6, () => (heights.push(world.runner.h), false));
    expect(hurts(events)).toBe(0);
    expect(Math.max(...heights)).toBeGreaterThan(1.8);
  });
  test("a piston rises and falls", () => {
    const world = quiet(6),
      seen = new Set<number>();
    for (let t = 0; t < 4; t += 0.1) {
      run(world, 0.1);
      seen.add(Math.round(world.pistons[0].height));
    }
    expect(seen.has(0)).toBe(true);
    expect(seen.has(3)).toBe(true);
  });
});

describe("squares", () => {
  test("a strike knocks away a square before him", () => {
    const world = quiet(),
      r = world.runner,
      [x, y] = toWorld(0, r.u + 1.2, 0.6),
      s = square(world, x, y);
    expect(strike(world)).toBe(true);
    const events = run(world, 0.05);
    expect(events.some((e) => e.kind === "smash")).toBe(true);
    expect(s.knocked).toBe(true);
    expect(hurts(run(world, 1))).toBe(0);
    // It flies off and breaks on the frame.
    expect(world.squares).toHaveLength(0);
  });
  test("a square that reaches him unstruck costs a heart and breaks", () => {
    const world = quiet(),
      r = world.runner,
      [x, y] = toWorld(0, r.u + 1.2, 0.6);
    square(world, x, y);
    const events = run(world, 0.6);
    expect(hurts(events)).toBe(1);
    expect(events.find((e) => e.kind === "hurt")).toMatchObject({ by: "square" });
    expect(world.squares).toHaveLength(0);
    // Blinking, another passes through him.
    const [x2, y2] = toWorld(0, world.runner.u + 1, 0.6);
    square(world, x2, y2);
    expect(hurts(run(world, 0.4))).toBe(0);
  });
  test("strikes wait a moment between them, and the box lies before him", () => {
    const world = quiet();
    expect(strike(world)).toBe(true);
    expect(strike(world)).toBe(false);
    run(world, 0.3);
    expect(strike(world)).toBe(true);
    const [x0, , x1] = strikeBox(world.runner);
    expect(x1 - world.runner.u).toBeGreaterThan(2);
    expect(world.runner.u - x0).toBeLessThan(1);
  });
  test("a square still appearing can neither be struck nor hurt", () => {
    const world = quiet(),
      [x, y] = toWorld(0, world.runner.u + 0.5, 0.6);
    square(world, x, y, { appear: 5 });
    strike(world);
    expect(hurts(run(world, 0.3))).toBe(0);
    expect(world.squares[0].knocked).toBe(false);
  });
  test("squares come in by themselves, never on top of him", () => {
    const world = createWorld(7, 3);
    for (let t = 0; t < 10; t += DT) {
      step(world);
      for (const s of world.squares)
        if (s.appear > 0.69) {
          const [rx, ry] = runnerCentre(world.runner);
          expect(Math.hypot(s.x - rx, s.y - ry)).toBeGreaterThan(3.5);
        }
    }
    expect(world.ids).toBeGreaterThan(4);
  });
});

describe("holes", () => {
  test("falling into a hole brings him out of its pair, going on his way", () => {
    const world = quiet(5);
    expect(profile(world, 0, 6)).toBeNull();
    const events = run(world, 3, (e) => e.some((x) => x.kind === "portal"));
    const portal = events.find((e) => e.kind === "portal");
    expect(portal).toMatchObject({ from: { side: 0, col: 6 }, to: { side: 2, col: 5 } });
    expect(world.runner.side).toBe(2);
    expect(world.runner.dir).toBe(1);
    // He climbs out and runs on along the ceiling, past the hole, unhurt.
    const after = run(world, 1);
    expect(hurts(after)).toBe(0);
    expect(world.runner.side).toBe(2);
    expect(world.runner.h).toBeGreaterThanOrEqual(0);
    expect(world.runner.u).toBeGreaterThan(6);
  });
  test("a jump carries him over a hole", () => {
    const world = quiet(5);
    run(world, 3, () => world.runner.u >= 5);
    jump(world);
    const events = run(world, 1.2);
    expect(events.some((e) => e.kind === "portal")).toBe(false);
    expect(world.runner.side).toBe(0);
  });
});

describe("the boss", () => {
  test("a square knocked back flies at the boss and hurts it", () => {
    const world = quiet(8),
      boss = world.boss!,
      [x, y] = toWorld(0, world.runner.u + 1, 0.8);
    square(world, x, y, { kind: "shot" });
    strike(world);
    const events = run(world, 2, (e) => e.some((x) => x.kind === "boss"));
    expect(events.find((e) => e.kind === "boss")).toMatchObject({ hp: STAGES[7].boss!.hp - 1 });
    expect(boss.hp).toBe(STAGES[7].boss!.hp - 1);
    expect(boss.flash).toBeGreaterThan(0);
  });
  test("the boss throws squares at him, and touching it hurts", () => {
    const world = createWorld(8, 2);
    world.next = Infinity;
    run(world, 3);
    expect(world.squares.some((s) => s.kind === "shot")).toBe(true);
    const near = quiet(8),
      boss = near.boss!;
    boss.vx = boss.vy = 0;
    near.runner.u = boss.x;
    near.runner.h = N - boss.y - TALL / 2 - BOSS_HALF + 0.5;
    near.runner.air = true;
    near.runner.vh = 0.1;
    expect(hurts(run(near, DT * 2))).toBe(1);
  });
});

describe("rules", () => {
  test("hearts and the clock", () => {
    let s = R.createGame(1);
    expect(s).toMatchObject({ hearts: HEARTS, left: STAGES[0].time, boss: 0, winner: null });
    s = R.play(s, move(R.TICK))!;
    expect(s.left).toBe(STAGES[0].time - 1);
    s = R.play(s, move(R.HURT))!;
    expect(s.hearts).toBe(HEARTS - 1);
    expect(s.winner).toBeNull();
  });
  test("a timed stage is won when its time runs out with a heart left", () => {
    let s = R.createGame(2);
    s = R.play(s, move(R.HURT))!;
    for (let k = 0; k < STAGES[1].time; k++) s = R.play(s, move(R.TICK))!;
    expect(s.winner).toBe(0);
    expect(s.cause).toBe("time");
    expect(R.runner.reason(s)).toMatch(/^성공!/);
    expect(R.play(s, move(R.TICK))).toBeNull();
  });
  test("with no heart left it is lost", () => {
    let s = R.createGame(1);
    for (let k = 0; k < HEARTS; k++) s = R.play(s, move(R.HURT))!;
    expect(s.winner).toBe(1);
    expect(R.runner.reason(s)).toMatch(/^실패\./);
  });
  test("a boss stage has no clock and is won by bringing the boss down", () => {
    let s = R.createGame(8);
    expect(R.isBoss(8)).toBe(true);
    expect(R.play(s, move(R.TICK))).toBeNull();
    for (let k = 0; k < STAGES[7].boss!.hp; k++) s = R.play(s, move(R.BOSS))!;
    expect(s.winner).toBe(0);
    expect(R.runner.reason(s)).toBe("성공! 네모 왕을 쓰러뜨렸습니다. 하트 3개가 남았습니다.");
    expect(R.runner.reason({ ...R.createGame(10), winner: 0, cause: "boss" })).toContain("최후의 네모를");
  });
  test("the player's strikes and jumps are counted for the room, and the other reports change nothing", () => {
    let s = R.createGame(1);
    s = R.play(s, move(R.STRIKE))!;
    s = R.play(s, move(R.JUMP))!;
    s = R.play(s, move(R.SMASH))!;
    expect(s).toMatchObject({ strikes: 1, jumps: 1, hearts: HEARTS, left: STAGES[0].time, ply: 3, last: R.SMASH });
    expect(R.play(s, { from: 0, to: R.STRIKE, extra: -1 })).toBeNull();
  });
});

describe("stages", () => {
  test("ten stages of 30 to 60 seconds or a boss, the rooms laid clear of the corners where he turns", () => {
    expect(STAGES).toHaveLength(10);
    for (const [i, spec] of STAGES.entries()) {
      expect(spec.boss ? spec.time === 0 : spec.time >= 30 && spec.time <= 60).toBe(true);
      const world = createWorld(i + 1);
      for (let side = 0; side < 4; side++) {
        // No hole or stack in the two columns next to a corner, save the stairs of the stairs stage.
        for (const col of [0, 13]) if (!spec.stairs) expect(profile(world, side, col)).toEqual([0, 0]);
        for (const hole of world.holes) expect(hole.col).toBeGreaterThanOrEqual(3);
      }
      // He starts on clear floor.
      expect(groundAt(world, 0, world.runner.u)).toBe(0);
    }
  });
  test("the stairs fill each corner alike, so that a turn lands on them or beyond", () => {
    const world = quiet(4);
    expect([11, 12, 13].map((c) => profile(world, 0, c)![0])).toEqual([1, 2, 3]);
    expect([0, 1, 2].map((c) => profile(world, 1, c)![0])).toEqual([3, 2, 1]);
    const events = run(world, 3, () => aheadOf(world.runner) <= 0.8);
    expect(hurts(events)).toBe(0);
    jump(world);
    expect(world.runner.side).toBe(1);
    expect(hurts(run(world, 1))).toBe(0);
  });
});

/**
 * A plain player: jumps when the wall is near or a tall stack or a hole comes up, strikes when a square is in reach.
 * It plays every stage through, and the room must be fair to it (most hearts kept, every boss beaten).
 */
function bot(world: World) {
  const r = world.runner;
  if (r.tumble === 0 && aheadOf(r) <= 1.6) jump(world);
  if (!r.air) {
    const front = r.u + r.dir * HALF;
    for (let d = 0.6; d <= 1.4; d += 0.2) {
      const col = Math.floor(front + r.dir * d);
      if (col < 0 || col >= N) continue;
      const p = profile(world, r.side, col);
      if (!p || Math.max(...p) - r.h > 2.05) {
        jump(world);
        break;
      }
    }
  }
  const reach = strikeBox(r);
  if (world.squares.some((s) => !s.knocked && s.appear <= 0 && s.x + SQUARE > reach[0] && s.x - SQUARE < reach[2] && s.y + SQUARE > reach[1] && s.y - SQUARE < reach[3])) strike(world);
}
describe("a plain player gets through", () => {
  test.each(STAGES.map((spec, i) => [i + 1, spec.name] as const))("stage %i (%s)", (stage) => {
    let lost = 0,
      won = false;
    for (const seed of [1, 2, 3]) {
      const world = createWorld(stage, seed);
      let hearts = HEARTS;
      const limit = STAGES[stage - 1].time || 150;
      for (let t = 0; t < limit && hearts > 0; t += DT) {
        bot(world);
        const events = step(world);
        hearts -= hurts(events);
        if (world.boss && world.boss.hp <= 0) break;
      }
      lost += HEARTS - Math.max(0, hearts);
      won ||= hearts > 0 && (!world.boss || world.boss.hp <= 0);
    }
    expect(won).toBe(true);
    expect(lost).toBeLessThanOrEqual(6);
  });
});
