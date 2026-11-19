import { describe, expect, it } from "vitest";
import { HOLES, PAR, groundAt, heightAt } from "../src/games/minigolf/course";
import { planShot } from "../src/games/minigolf/ai";
import { MAX_STROKES, chooseMove, createGame, minigolf, moves, play, record, shotMove, shotOf, total, type State } from "../src/games/minigolf/rules";
import { CUP_R, R, SPEED_MAX, SPEED_MIN, aimYaw, createWorld, roll, sailAngle, shut, step, yawOf } from "../src/games/minigolf/sim";
import { ORIGINS, pullFor, pullShot, golferCamera, ballWorld, speedOf, powerOf } from "../src/games/minigolf/layout";
import { PerspectiveCamera } from "three";

/** A small fixed sequence of numbers in [0, 1), so that the computer's hand shakes the same each run. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const towardCup = (k: number, at = HOLES[k].tee) => yawOf(HOLES[k].cup.x - at.x, HOLES[k].cup.z - at.z);
/** A putt so weak it moves the ball a few centimetres. */
const tap = shotMove({ angle: 0, speed: SPEED_MIN, phase: 0 });

describe("mini golf course", () => {
  it("has nine holes of par 2 to 4, each tee and cup on open green", () => {
    expect(HOLES).toHaveLength(9);
    for (const hole of HOLES) {
      expect(hole.par).toBeGreaterThanOrEqual(2);
      expect(hole.par).toBeLessThanOrEqual(4);
      expect(groundAt(hole, hole.tee.x, hole.tee.z)).toBe("green");
      expect(groundAt(hole, hole.cup.x, hole.cup.z)).toBe("green");
    }
    expect(PAR).toBe(HOLES.reduce((sum, h) => sum + h.par, 0));
    // The holes lie side by side across the garden, never overlapping.
    for (let k = 1; k < 9; k++) expect(ORIGINS[k].x).toBeGreaterThan(ORIGINS[k - 1].x);
  });
  it("can hole every hole: the computer's search, with a steady hand, finishes each within par", () => {
    HOLES.forEach((hole, k) => {
      let at = { ...hole.tee },
        strokes = 0,
        holed = false;
      while (strokes < MAX_STROKES && !holed) {
        const end = roll(hole, at, planShot(hole, at, "hard"));
        strokes += end.result === "rest" || end.result === "cup" ? 1 : 2;
        holed = end.result === "cup";
        if (end.result === "rest") at = { x: end.x, z: end.z };
      }
      expect(holed, `hole ${k + 1}`).toBe(true);
      expect(strokes, `hole ${k + 1}`).toBeLessThanOrEqual(hole.par);
    });
  }, 60000);
});

describe("mini golf physics", () => {
  it("is deterministic: the same putt from the same place always ends the same way", () => {
    const hole = HOLES[2],
      shot = { angle: towardCup(2) - 0.3, speed: 4.1, phase: 0 },
      a = roll(hole, hole.tee, shot),
      b = roll(hole, hole.tee, shot);
    expect(a).toEqual(b);
    // Stepped one slice at a time as the view does, the world comes to the very same place.
    const w = createWorld(hole, hole.tee, shot);
    while (!w.result) step(w);
    expect([w.x, w.z, w.result, w.steps]).toEqual([a.x, a.z, a.result, a.steps]);
    const s1 = play(createGame(false), shotMove(shot))!,
      s2 = play(createGame(false), shotMove(shot))!;
    expect(s1).toEqual(s2);
  });
  it("drops a slow ball into the cup and lets a fast one run over it", () => {
    const hole = HOLES[0],
      at = { x: 0, z: hole.cup.z + 0.6 };
    expect(roll(hole, at, { angle: 0, speed: 1.05, phase: 0 }).result).toBe("cup");
    const fast = roll(hole, at, { angle: 0, speed: 3.6, phase: 0 });
    expect(fast.result).toBe("rest");
    expect(Math.hypot(fast.x - hole.cup.x, fast.z - hole.cup.z)).toBeGreaterThan(CUP_R);
  });
  it("rolls a ball back down a slope it cannot climb", () => {
    const hole = HOLES[6],
      // Up the first ramp, too gently to reach the top.
      end = roll(hole, hole.tee, { angle: 0, speed: 1.9, phase: 0 });
    expect(end.result).toBe("rest");
    expect(heightAt(hole, end.x, end.z)).toBeLessThan(0.05);
  });
  it("slows a ball far more in sand", () => {
    const hole = HOLES[4],
      at = { x: -0.3, z: 1.6 },
      sand = roll(hole, at, { angle: 0, speed: 2.4, phase: 0 }),
      clear = roll(hole, { x: 0.5, z: 1.6 }, { angle: 0, speed: 2.4, phase: 0 });
    expect(groundAt(hole, sand.x, sand.z)).toBe("sand");
    expect(at.z - sand.z).toBeLessThan((1.6 - clear.z) / 2);
  });
  it("shuts the windmill's door while a sail is down", () => {
    const hole = HOLES[3],
      mill = hole.windmill!,
      shot = (phase: number) => ({ angle: 0, speed: 2.6, phase }),
      // When the ball comes up to the door, at that speed.
      arrive = (phase: number) => {
        const w = createWorld(hole, hole.tee, shot(phase));
        while (!w.result && w.z > mill.z + 0.03 + R + 0.025) step(w);
        return w.steps / 360;
      };
    let open = -1,
      closed = -1;
    for (let p = 0; p < 1 && (open < 0 || closed < 0); p += 0.02) {
      const t = arrive(p),
        down = [-0.02, 0, 0.02, 0.04].some((dt) => shut(hole, sailAngle(hole, p, t + dt)));
      if (!down && open < 0) open = p;
      if ([0, 0.01, 0.02].every((dt) => shut(hole, sailAngle(hole, p, t + dt))) && closed < 0) closed = p;
    }
    expect(open).toBeGreaterThanOrEqual(0);
    expect(closed).toBeGreaterThanOrEqual(0);
    expect(roll(hole, hole.tee, shot(open)).z).toBeLessThan(mill.z - mill.depth);
    expect(roll(hole, hole.tee, shot(closed)).z).toBeGreaterThan(mill.z);
  });
});

describe("mini golf rules", () => {
  it("writes a putt as a move and reads it back", () => {
    const shot = { angle: 1.234, speed: 3.21, phase: 0.456 },
      back = shotOf(shotMove(shot))!;
    expect(back.angle).toBeCloseTo(shot.angle, 2);
    expect(back.speed).toBeCloseTo(shot.speed, 2);
    expect(back.phase).toBeCloseTo(0.456, 3);
    expect(shotOf({ from: 1, to: 2000, extra: 0 })).toBeNull();
    expect(shotOf({ from: 0, to: 999, extra: 0 })).toBeNull();
    expect(play(createGame(false), { from: 0, to: 2000, extra: 1000 })).toBeNull();
    expect(speedOf(powerOf(2.7))).toBeCloseTo(2.7, 6);
    expect(speedOf(0)).toBe(SPEED_MIN);
    expect(speedOf(1)).toBe(SPEED_MAX);
  });
  it("costs a stroke for the water and puts the ball back where it was hit", () => {
    const hole = HOLES[5];
    let angle = 0;
    for (let a = 0.05; a < 0.4; a += 0.01)
      if (roll(hole, hole.tee, { angle: a, speed: 2.2, phase: 0 }).result === "water") {
        angle = a;
        break;
      }
    expect(angle).toBeGreaterThan(0);
    let state: State = { ...createGame(false), hole: 5, ball: { ...hole.tee } };
    state = play(state, shotMove({ angle, speed: 2.2, phase: 0 }))!;
    expect(state.last?.result).toBe("water");
    expect(state.strokes).toBe(2);
    expect(state.ball).toEqual(hole.tee);
    expect(minigolf.hint(state)).toContain("3타째");
  });
  it("picks the ball up after eight strokes and counts the hole as eight", () => {
    let state = createGame(true);
    for (let n = 1; n <= MAX_STROKES; n++) {
      expect(state.turn).toBe(0);
      state = play(state, tap)!;
    }
    expect(state.last?.picked).toBe(true);
    expect(state.cards[0][0]).toBe(MAX_STROKES);
    // The other side now plays the first hole from its tee.
    expect(state.turn).toBe(1);
    expect(state.hole).toBe(0);
    expect(state.ball).toEqual(HOLES[0].tee);
    // A ball in the water on the seventh stroke counts eight, not nine.
    const pond = HOLES[5];
    let wet: State = { ...createGame(false), hole: 5, ball: { ...pond.tee }, strokes: 6 };
    let angle = 0;
    for (let a = 0.05; a < 0.4 && !angle; a += 0.01) if (roll(pond, pond.tee, { angle: a, speed: 2.2, phase: 0 }).result === "water") angle = a;
    wet = play(wet, shotMove({ angle, speed: 2.2, phase: 0 }))!;
    expect(wet.cards[0][5]).toBe(MAX_STROKES);
    expect(wet.last?.picked).toBe(true);
    expect(wet.hole).toBe(6);
  });
  it("scores the round: the honour, the totals and the lower score wins", () => {
    let state = createGame(true);
    const finish = (n: number) => {
      for (let i = 1; i < n; i++) state = record(state, { x: state.ball.x, z: state.ball.z - 0.01, result: "rest" }, tap);
      state = record(state, { ...HOLES[state.hole].cup, result: "cup" }, tap);
    };
    // Hole 1: red 3, blue 2; blue then has the honour on hole 2.
    finish(3);
    expect(state.turn).toBe(1);
    finish(2);
    expect(state.hole).toBe(1);
    expect(state.order).toEqual([1, 0]);
    expect(state.turn).toBe(1);
    expect(minigolf.tally(state)).toEqual(["3타", "2타"]);
    // A tie keeps the order.
    finish(2);
    finish(2);
    expect(state.order).toEqual([1, 0]);
    for (let k = 2; k < 9; k++) {
      finish(2);
      finish(3);
    }
    expect(state.winner).not.toBeNull();
    const red = total(state.cards[0]),
      blue = total(state.cards[1]);
    expect(red).toBe(3 + 2 + 7 * 3);
    expect(blue).toBe(2 + 2 + 7 * 2);
    expect(state.winner).toBe(1);
    expect(minigolf.reason(state)).toBe(`${red}타 대 ${blue}타입니다.`);
    expect(moves(state)).toEqual([]);
    expect(play(state, tap)).toBeNull();
    // Alone, a round is told against the course's par.
    let solo = createGame(false);
    for (let k = 0; k < 9; k++) solo = record(solo, { ...HOLES[k].cup, result: "cup" }, tap);
    expect(solo.winner).toBe(0);
    expect(minigolf.reason(solo)).toBe(`9타로 아홉 홀을 마쳤습니다. 파 ${PAR}보다 ${PAR - 9}타 적습니다!`);
  });
  it("gives the computer a putt it can make at every level", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const state = createGame(true),
        move = chooseMove(state, level, seeded(5))!;
      const next = play(state, move);
      expect(next).not.toBeNull();
      expect(next!.ply).toBe(1);
    }
  }, 30000);
});

describe("mini golf aiming", () => {
  it("turns a pull drawn by `pullFor` back into the same putt", () => {
    const camera = new PerspectiveCamera(38, 1280 / 700, 0.1, 400),
      tee = HOLES[0].tee;
    golferCamera(camera, 0, tee);
    const ball = ballWorld(0, tee),
      angle = aimYaw(HOLES[0], tee) + 0.02,
      pull = pullFor(camera, ball, angle, 2.4, 1280, 700),
      shot = pullShot(camera, pull.start, { x: pull.start.x + pull.dx, y: pull.start.y + pull.dy }, 1280, 700, ball.y)!;
    expect(pull.dy).toBeGreaterThan(0);
    expect(shot.angle).toBeCloseTo(angle, 4);
    expect(shot.speed).toBeCloseTo(2.4, 3);
    expect(R).toBeGreaterThan(0);
  });
});
