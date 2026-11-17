import { describe, expect, it } from "vitest";
import {
  POCKET,
  SPEED_MAX,
  SPIN,
  aimAt,
  bowling,
  chooseMove,
  createGame,
  frameDone,
  marksOf,
  play,
  record,
  runningScores,
  throwMove,
  throwOf,
  total,
  type State,
} from "../src/games/bowling/rules";
import { HEAD, bowl, createWorld, deepest, rack, settled, step } from "../src/games/bowling/sim";

/** A small fixed sequence of numbers in [0, 1), so that racks and hands come out the same each run. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const anyThrow = throwMove({ x: 0, angle: 0, speed: 8, spin: 0 });
/** A ball that knocks down `n` of the pins standing, by the book, without the physics. */
function roll(state: State, n: number) {
  const knocked = state.standing.slice(0, n).map((p) => p.id),
    left = state.standing.slice(n);
  return record(state, knocked, left, anyThrow);
}
const rollAll = (state: State, counts: number[]) => counts.reduce(roll, state);

describe("bowling scoring", () => {
  it("scores a perfect game of twelve strikes as 300", () => {
    const end = rollAll(createGame(false), Array(12).fill(10));
    expect(end.winner).toBe(0);
    expect(total(end.frames[0])).toBe(300);
    expect(runningScores(end.frames[0])).toEqual([30, 60, 90, 120, 150, 180, 210, 240, 270, 300]);
    expect(marksOf(end.frames[0][9], 9)).toEqual(["X", "X", "X"]);
    expect(end.last?.run).toBe(12);
    expect(bowling.reason(end)).toContain("300점");
  });
  it("scores all spares of five and five, with a five to finish, as 150", () => {
    const end = rollAll(createGame(false), [...Array(21).fill(5)]);
    expect(end.winner).toBe(0);
    expect(total(end.frames[0])).toBe(150);
    expect(marksOf(end.frames[0][0], 0)).toEqual(["5", "/"]);
    expect(marksOf(end.frames[0][9], 9)).toEqual(["5", "/", "5"]);
  });
  it("gives the tenth frame its bonus balls after a strike or a spare, and none after an open frame", () => {
    // Nine open frames of 9, then a strike, seven and a spare in the tenth.
    let state = rollAll(createGame(false), Array.from({ length: 18 }, (_, i) => (i % 2 ? 0 : 9)));
    expect(state.frame).toBe(9);
    state = roll(state, 10);
    expect(state.winner).toBeNull();
    // After the strike a full rack is set again.
    expect(state.standing).toHaveLength(10);
    state = roll(state, 7);
    expect(state.standing).toHaveLength(3);
    state = roll(state, 3);
    expect(state.winner).toBe(0);
    expect(state.frames[0][9]).toEqual([10, 7, 3]);
    expect(marksOf(state.frames[0][9], 9)).toEqual(["X", "7", "/"]);
    expect(total(state.frames[0])).toBe(81 + 20);
    // An open tenth frame ends with its second ball.
    const open = rollAll(createGame(false), [...Array(18).fill(0), 4, 3]);
    expect(open.winner).toBe(0);
    expect(total(open.frames[0])).toBe(7);
    expect(frameDone([4, 3], 9)).toBe(true);
    expect(frameDone([6, 4], 9)).toBe(false);
  });
  it("scores a gutter game as nothing, marked with dashes", () => {
    const end = rollAll(createGame(false), Array(20).fill(0));
    expect(end.winner).toBe(0);
    expect(total(end.frames[0])).toBe(0);
    expect(marksOf(end.frames[0][3], 3)).toEqual(["-", "-"]);
  });
  it("leaves a strike or a spare unscored until its balls have been bowled", () => {
    let state = roll(createGame(false), 10);
    expect(runningScores(state.frames[0])[0]).toBeNull();
    state = roll(state, 3);
    expect(runningScores(state.frames[0]).slice(0, 2)).toEqual([null, null]);
    state = roll(state, 4);
    expect(runningScores(state.frames[0]).slice(0, 2)).toEqual([17, 24]);
    expect(state.last?.mark).toBeNull();
    // A gutter ball and then all ten is a spare, not a strike.
    state = roll(roll(state, 0), 10);
    expect(state.last?.mark).toBe("spare");
  });
  it("takes turns a frame at a time with two sides, and the higher total wins", () => {
    let state = createGame(true);
    state = roll(state, 10);
    expect(state.turn).toBe(1);
    expect(state.frame).toBe(0);
    state = rollAll(state, [3, 4]);
    expect(state.turn).toBe(0);
    expect(state.frame).toBe(1);
    // The rest: side 0 bowls nines, side 1 eights.
    while (state.winner === null) state = rollAll(state, state.turn === 0 ? [9, 0] : [8, 0]);
    expect(state.winner).toBe(0);
    expect(bowling.reason(state)).toMatch(/^\d+ 대 \d+입니다\.$/);
  });
});

describe("bowling moves", () => {
  it("says a throw in a move and reads it back", () => {
    const t = { x: 0.215, angle: 0.0123, speed: 8.37, spin: 1 },
      back = throwOf(throwMove(t))!;
    expect(back.x).toBeCloseTo(t.x, 2);
    expect(back.angle).toBeCloseTo(t.angle, 3);
    expect(back.speed).toBeCloseTo(t.speed, 2);
    expect(back.spin).toBe(1);
    expect(throwOf({ from: -1, to: SPIN, extra: -1 })).toBeNull();
    expect(play(createGame(true), { from: 400, to: 2000, extra: 0 })).toBeNull();
  });
  it("changes the spin of the side to bowl without a ball being thrown", () => {
    const state = createGame(true),
      next = play(state, { from: -1, to: SPIN, extra: -1 })!;
    expect(next.ply).toBe(0);
    expect(next.spin[0]).toBe((state.spin[0] + 1) % 3);
    expect(next.spin[1]).toBe(state.spin[1]);
  });
});

describe("bowling physics", () => {
  it("runs the same throw at the same pins the same way every time", () => {
    const pins = rack(seeded(3)),
      t = { x: 0.24, angle: aimAt(0.24, 8, 1, POCKET), speed: 8, spin: 1 },
      a = bowl(pins, t),
      b = bowl(pins, t);
    expect(a.knocked).toEqual(b.knocked);
    expect(a.left).toEqual(b.left);
    expect(a.world.steps).toBe(b.world.steps);
    // Stepped by hand, as the view does, it comes to the same pins.
    const world = createWorld(pins, t);
    while (!settled(world)) step(world);
    expect(world.pins.map((p) => [p.mode, p.x, p.d])).toEqual(a.world.pins.map((p) => [p.mode, p.x, p.d]));
  });
  it("strikes more often than not with a straight ball at full speed into the pocket", () => {
    let strikes = 0;
    const N = 60;
    for (let seed = 1; seed <= N; seed++) {
      const random = seeded(seed * 7919),
        pins = rack(random),
        // The hand is a little off each time: up to half a centimetre either way at the head pin.
        target = POCKET + (random() - 0.5) * 0.01,
        out = bowl(pins, { x: POCKET, angle: aimAt(POCKET, SPEED_MAX, 0, target), speed: SPEED_MAX, spin: 0 });
      if (out.knocked.length === 10) strikes++;
    }
    expect(strikes).toBeGreaterThan(N / 2);
  });
  it("leaves pins standing on a ball straight at the head pin, and none fall to a gutter ball", () => {
    const head = bowl(rack(), { x: 0, angle: 0, speed: 8, spin: 0 });
    expect(head.knocked.length).toBeGreaterThan(3);
    expect(head.knocked.length).toBeLessThan(10);
    const gutter = bowl(rack(), { x: 0.4, angle: 0.03, speed: 8, spin: 0 });
    expect(gutter.knocked).toEqual([]);
    expect(gutter.world.guttered).toBeGreaterThan(0);
  });
  it("never lets a pin pass through another pin or the ball", () => {
    const random = seeded(11);
    let worst = 0;
    for (let k = 0; k < 24; k++) {
      const spin = k % 3,
        x = (random() - 0.5) * 0.6,
        target = (random() - 0.5) * 0.4,
        speed = 5 + random() * 4.5,
        world = createWorld(rack(random), { x, angle: aimAt(x, speed, spin, target), speed, spin });
      while (!settled(world)) {
        step(world);
        if (world.ball.d > HEAD - 1) worst = Math.max(worst, deepest(world));
      }
    }
    expect(worst).toBeLessThan(0.5);
  });
});

describe("bowling computer", () => {
  it("bowls a whole game against another computer, ten frames each", () => {
    const random = seeded(5);
    let state = createGame(true, random),
      guard = 0;
    while (state.winner === null && guard++ < 60) {
      const move = chooseMove(state, state.turn === 0 ? "hard" : "easy", random);
      expect(move).not.toBeNull();
      state = play(state, move!, random)!;
      expect(state).not.toBeNull();
    }
    expect(state.winner).not.toBeNull();
    for (const side of [0, 1]) {
      expect(state.frames[side]).toHaveLength(10);
      state.frames[side].forEach((rolls, k) => expect(frameDone(rolls, k)).toBe(true));
      expect(total(state.frames[side])).toBeGreaterThanOrEqual(0);
      expect(total(state.frames[side])).toBeLessThanOrEqual(300);
    }
    expect(state.ply).toBeGreaterThanOrEqual(22);
    expect(state.ply).toBeLessThanOrEqual(42);
    expect(chooseMove(state, "normal", random)).toBeNull();
  });
});
