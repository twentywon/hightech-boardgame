import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as ah from "../src/games/airhockey/rules";
import * as hs from "../src/games/airhockey/sim";
import * as br from "../src/games/basketball/rules";
import * as bs from "../src/games/basketball/sim";
import { swipe, swipeFor } from "../src/games/basketball/layout";
import * as t3 from "../src/games/tictactoe/rules";

const at = (to: number) => ({ from: -1, to, extra: -1 });
function line(mode: t3.Mode, cells: number[]) {
  let s = t3.createGame(mode);
  for (const c of cells) s = t3.play(s, at(c))!;
  return s;
}
describe("tic-tac-toe", () => {
  test("three in a row wins, a full board is a draw, and a taken square is refused", () => {
    const won = line("classic", [0, 3, 1, 4, 2]);
    expect(won.winner).toBe(0);
    expect(won.line).toEqual([0, 1, 2]);
    expect(t3.play(line("classic", [4]), at(4))).toBeNull();
    const drawn = line("classic", [0, 1, 2, 4, 3, 5, 7, 6, 8]);
    expect(drawn.winner).toBe("draw");
  });
  test("in the vanishing game each side keeps only its last three marks", () => {
    const s = line("vanish", [0, 3, 1, 4, 8, 6]);
    expect(s.winner).toBeNull();
    const next = t3.play(s, at(7))!;
    // X's fourth mark takes its first one away.
    expect(next.last?.gone).toBe(0);
    expect(next.cells[0]).toBeNull();
    expect(next.cells.filter((c) => c === 0)).toHaveLength(t3.KEEP);
  });
  test("in misère whoever makes three in a row loses", () => {
    expect(line("misere", [0, 3, 1, 4, 2]).winner).toBe(1);
  });
  test("in the ultimate game a square sends the other to the board of its place, unless that board is decided", () => {
    const s = t3.play(t3.createGame("ultimate"), at(4))!;
    expect(s.active).toBe(4);
    expect(t3.moves(s).every((m) => Math.floor(m.to / 9) === 4)).toBe(true);
    // Sent to a board already won, the next player may go anywhere.
    const free = t3.createGame("ultimate");
    free.boards = free.boards.slice();
    free.boards[0] = 0;
    const sent = t3.play(free, at(9 * 5 + 0))!;
    expect(sent.active).toBe(-1);
  });
  test("the cube has 76 lines of four, and four down through the layers wins", () => {
    expect(t3.CUBE_LINES).toHaveLength(76);
    expect(new Set(t3.CUBE_LINES.map((l) => [...l].sort((a, b) => a - b).join())).size).toBe(76);
    expect(t3.CUBE_LINES.every((l) => l.length === 4)).toBe(true);
    const s = line("cube", [5, 0, 21, 1, 37, 2, 53]);
    expect(s.winner).toBe(0);
  });
  test("the computer blocks a line and wins when it can; two perfect players draw", () => {
    const random = seededRandom(5);
    // X threatens the top row; O must block at 2.
    const threat = line("classic", [0, 4, 1]);
    expect(t3.chooseMove(threat, "hard", random)?.to).toBe(2);
    // X can finish the top row at once (O threatens the middle one): it does.
    const chance = line("classic", [0, 3, 1, 4]);
    expect(t3.chooseMove(chance, "hard", random)?.to).toBe(2);
    let s = t3.createGame("classic");
    while (s.winner === null) s = t3.play(s, t3.chooseMove(s, "hard", random)!)!;
    expect(s.winner).toBe("draw");
  });
  test("every mode plays out to an end with legal moves", () => {
    for (const mode of t3.MODES.map((m) => m.value)) {
      const random = seededRandom(9);
      let s = t3.createGame(mode);
      for (let k = 0; k < 120 && s.winner === null; k++) {
        const m = mode === "ultimate" || mode === "cube" ? t3.moves(s)[Math.floor(random() * t3.moves(s).length)] : t3.chooseMove(s, "easy", random)!;
        expect(t3.moves(s).some((x) => x.to === m.to)).toBe(true);
        s = t3.play(s, m)!;
      }
      expect(s.winner).not.toBeNull();
    }
  });
});
describe("air hockey", () => {
  test("five goals win a set, the set starts again from nothing, and two sets of three win the match", () => {
    let s = ah.createGame();
    for (let k = 0; k < ah.POINTS - 1; k++) s = ah.play(s, at(1))!;
    expect(s.score).toEqual([0, ah.POINTS - 1]);
    for (let k = 0; k < ah.POINTS; k++) s = ah.play(s, at(0))!;
    // My fifth goal took the first set: the score is back to nothing.
    expect(s.sets).toEqual([1, 0]);
    expect(s.score).toEqual([0, 0]);
    expect(s.done).toEqual([[ah.POINTS, ah.POINTS - 1]]);
    expect(ah.setNumber(s)).toBe(2);
    for (let k = 0; k < ah.POINTS; k++) s = ah.play(s, at(1))!;
    expect(s.sets).toEqual([1, 1]);
    expect(s.winner).toBeNull();
    for (let k = 0; k < ah.POINTS; k++) s = ah.play(s, at(0))!;
    expect(s.sets).toEqual([2, 1]);
    expect(s.winner).toBe(0);
    expect(ah.play(s, at(1))).toBeNull();
  });
  test("each mallet stays in its own half, inside the rails", () => {
    expect(hs.keep(0, 9, -9)).toEqual({ x: hs.HALF_X - hs.MALLET, z: hs.MALLET * 0.6 });
    expect(hs.keep(1, -9, 9)).toEqual({ x: -hs.HALF_X + hs.MALLET, z: -hs.MALLET * 0.6 });
  });
  test("a puck through the far slot is my goal, through mine the computer's, and off the rail beside a slot it bounces", () => {
    const shoot = (x: number, vz: number) => {
      const w = hs.createWorld(0);
      // The mallets stand aside.
      w.mallets[0].x = w.targets[0].x = hs.HALF_X - hs.MALLET;
      w.mallets[1].x = w.targets[1].x = hs.HALF_X - hs.MALLET;
      Object.assign(w.puck, { x, z: 0, vx: 0, vz });
      for (let k = 0; k < 240 * 0.7; k++) {
        const scored = hs.step(w, "easy");
        if (scored !== null) return scored;
      }
      return w.puck.vz;
    };
    expect(shoot(0, -8)).toBe(0);
    expect(shoot(0, 8)).toBe(1);
    expect(shoot(-hs.HALF_X + 0.4, -8)).toBeGreaterThan(0);
  });
  test("my mallet goes all the way to the hand in one slice and sweeps the puck along instead of passing through it", () => {
    const w = hs.createWorld(0);
    expect(w.puck).toMatchObject({ x: 0, z: 1.5 });
    w.targets[0] = { x: 0, z: 0.3 };
    hs.step(w, "normal");
    expect(w.mallets[0].z).toBeCloseTo(0.3, 5);
    // The puck lay on the way: it is now ahead of the mallet, struck toward the far goal.
    expect(w.puck.z).toBeLessThan(w.mallets[0].z);
    expect(w.puck.vz).toBeLessThan(-5);
  });
  test("the computer meets a puck coming at its goal", () => {
    const w = hs.createWorld(0);
    Object.assign(w.puck, { x: 0.9, z: 1, vx: 0, vz: -6 });
    for (let k = 0; k < 120; k++) {
      hs.think(w, "hard", seededRandom(1));
      hs.step(w, "hard");
    }
    expect(Math.abs(w.mallets[1].x - w.puck.x)).toBeLessThan(0.8);
  });
});
describe("basketball", () => {
  const throwOnce = (power: number, yaw: number, level = 1) => {
    const w = bs.createWorld(level);
    expect(bs.shoot(w, power, yaw)).toBe(true);
    const seen: bs.Happening["kind"][] = [];
    for (let k = 0; k < 240 * 6; k++) for (const e of bs.step(w)) seen.push(e.kind);
    return { w, seen };
  };
  test("a throw through the middle of a still hoop goes in, and every ball rolls back to the tray", () => {
    const ideal = bs.idealThrow(0);
    const { w, seen } = throwOnce(ideal.power, ideal.yaw);
    expect(seen).toContain("score");
    expect(seen).not.toContain("miss");
    expect(bs.inTray(w)).toHaveLength(bs.BALLS);
    expect(bs.canShoot(w)).toBe(true);
  });
  test("the balls lie in the tray as they came down, not in a row, and the hand takes up the nearest", () => {
    const w = bs.createWorld(1),
      ideal = bs.idealThrow(0);
    let thrown = 0;
    for (let k = 0; k < 240 * 40; k++) {
      if (thrown < 12 && k % 150 === 0 && bs.shoot(w, ideal.power, 0)) thrown++;
      bs.step(w);
    }
    expect(thrown).toBe(12);
    const lying = bs.inTray(w).map((k) => w.balls[k]);
    expect(lying).toHaveLength(bs.BALLS);
    // Spread across the tray and at different depths: no line along the lane or across it.
    const xs = lying.map((b) => b.x),
      zs = lying.map((b) => b.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.8);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.05);
    // None in another, all inside the tray.
    for (const a of lying) {
      expect(a.z).toBeLessThanOrEqual(bs.TRAY_FRONT + 1e-9);
      for (const b of lying) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(bs.BALL * 2 - 0.02);
    }
    const ready = w.balls[bs.readyBall(w)];
    for (const b of lying) expect(Math.hypot(ready.x, ready.z - bs.HAND.z)).toBeLessThanOrEqual(Math.hypot(b.x, b.z - bs.HAND.z));
  });
  test("too weak or too far aside misses", () => {
    const ideal = bs.idealThrow(0);
    for (const [power, yaw] of [[ideal.power - 0.15, 0], [ideal.power, 0.12], [ideal.power, -0.12]]) expect(throwOnce(power, yaw).seen).toContain("miss");
  });
  test("the ball falls at the machine's scale of real gravity, and its bounces die away soon", () => {
    expect(bs.G).toBeCloseTo(9.81 / 0.6, 2);
    const w = bs.createWorld(1);
    bs.shoot(w, 0.3, 0);
    const ball = w.balls.find((b) => b.phase === "flight")!;
    // Let go from rest high over the lane.
    Object.assign(ball, { x: 0, y: 3.5, z: -2, vx: 0, vy: 0, vz: 0 });
    for (let k = 0; k < 120; k++) bs.step(w);
    expect(ball.vy).toBeCloseTo(-bs.G * 0.5, 1);
    let bounces = 0;
    for (let k = 0; k < 240 * 2 && ball.phase === "flight"; k++) bounces += bs.step(w).filter((e) => e.kind === "bounce").length;
    expect(ball.phase).not.toBe("flight");
    expect(bounces).toBeLessThanOrEqual(4);
  });
  test("the clock starts with the first throw and tells whole seconds", () => {
    const w = bs.createWorld(1);
    const seconds = (steps: number) => {
      let n = 0;
      for (let k = 0; k < steps; k++) n += bs.step(w).filter((e) => e.kind === "second").length;
      return n;
    };
    expect(seconds(240 * 3)).toBe(0);
    bs.shoot(w, 0.5, 0);
    expect(seconds(240 * 3 + 2)).toBe(3);
    // Only one ball can be thrown at a time from the hand.
    expect(bs.canShoot(w)).toBe(true);
    bs.shoot(w, 0.5, 0);
    expect(bs.canShoot(w)).toBe(false);
  });
  test("the hoop stands still at the first stage and slides wider and quicker at each after, never jumping", () => {
    expect(bs.hoopAt(1, 30)).toBe(0);
    expect(Math.abs(bs.hoopAt(2, 1.3))).toBeGreaterThan(0.1);
    const reach = (level: number) => Math.max(...Array.from({ length: 200 }, (_, k) => Math.abs(bs.hoopAt(level, k * 0.05))));
    for (let level = 2; level < bs.LEVELS.length; level++) expect(reach(level + 1)).toBeGreaterThan(reach(level));
    // A new stage starts its clock again, but the hoop goes there at its own pace.
    const w = bs.createWorld(5);
    bs.shoot(w, 0.5, 0);
    for (let k = 0; k < 150; k++) bs.step(w);
    const before = w.hoopX;
    bs.nextStage(w, 2);
    bs.step(w);
    expect(Math.abs(w.hoopX - before)).toBeLessThan(0.02);
  });
  test("a swipe up throws with the power of its length and the turn of its slant", () => {
    const made = swipeFor(0.54, 0.05, 800),
      read = swipe(made.dx, made.dy, 800)!;
    expect(read.power).toBeCloseTo(0.54, 5);
    expect(read.yaw).toBeCloseTo(0.05, 5);
    expect(swipe(0, 20, 800)).toBeNull();
    expect(swipe(0, -10, 800)).toBeNull();
  });
  test("fifty points in a stage clear it, the next begins with a full clock, and the last one cleared wins", () => {
    let s = br.createGame(1);
    s = br.play(s, at(br.SHOT))!;
    for (let k = 0; k < 10; k++) s = br.play(s, at(br.TICK))!;
    while (s.stage === 1) s = br.play(s, at(br.SCORE + 2))!;
    expect(s.stage).toBe(2);
    expect(s.cleared).toBe(1);
    expect(s.stageScore).toBe(0);
    expect(s.left).toBe(br.ROUND);
    expect(s.score).toBeGreaterThanOrEqual(br.GOAL);
    // Running out of time before the goal ends the run.
    let late = s;
    while (late.winner === null) late = br.play(late, at(br.TICK))!;
    expect(late.winner).toBe(1);
    // The last stage made wins it.
    let last = br.createGame(br.LAST_STAGE);
    while (last.winner === null) last = br.play(last, at(br.SCORE + 4))!;
    expect(last.winner).toBe(0);
    expect(last.cleared).toBe(1);
    expect(br.createGame(99).stage).toBe(br.LAST_STAGE);
  });
  test("a basket is worth 2, 3 in the last seconds and one more on fire; a miss puts the fire out", () => {
    let s = br.createGame(1);
    expect(br.worth(s)).toBe(2);
    for (let k = 0; k < br.FIRE; k++) s = br.play(s, at(br.SCORE + br.worth(s)))!;
    expect(br.onFire(s)).toBe(true);
    expect(br.worth(s)).toBe(3);
    s = br.play(s, at(br.MISS))!;
    expect(br.worth(s)).toBe(2);
    while (s.left > br.FINAL) s = br.play(s, at(br.TICK))!;
    expect(br.worth(s)).toBe(3);
    expect(br.play(s, at(br.SCORE + 5))).toBeNull();
    while (s.winner === null) s = br.play(s, at(br.TICK))!;
    expect(s.left).toBe(0);
    expect(s.winner).toBe(1);
    // Two, two, two (the third made the fire), then a miss.
    expect(s.score).toBe(2 + 2 + 2);
    expect(br.play(s, at(br.SHOT))).toBeNull();
  });
});
