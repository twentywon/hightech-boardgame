import { describe, expect, it } from "vitest";
import { DT, HALF_Z, R, ball, copy, run, speedOf, step, strike, moving, type Ball, type Contact } from "../src/games/carom/sim";
import {
  RED,
  RED2,
  WHITE,
  YELLOW,
  carom,
  chooseShot,
  createGame,
  judge,
  moves,
  play,
  shotCode,
  shotOf,
  struck,
  targetOf,
  tipCode,
  tipOf,
  touches,
  type State,
} from "../src/games/carom/rules";

/** A contact of the cue ball (white) with a ball or with cushion `wall` (0–3), at slice `n`. */
const hit = (n: number, other: number): Contact => ({ slice: n, a: WHITE, b: other, speed: 2 });
const wall = (n: number, which = 0): Contact => ({ slice: n, a: WHITE, b: -1 - which, speed: 2 });
/** A state with the balls laid where a test wants them. */
function laid(kind: "four" | "three", places: [number, number][], extra: Partial<State> = {}): State {
  return { ...createGame(kind), balls: places.map(([x, z], id) => ball(id, x, z)), ...extra };
}
/** The direction from one ball to another, in degrees. */
const toward = (s: State, from: number, to: number) => (Math.atan2(s.balls[to].z - s.balls[from].z, s.balls[to].x - s.balls[from].x) * 180) / Math.PI;
const shot = (s: State, degrees: number, power: number, side = 0, high = 0) => play(s, { from: s.balls[s.turn === 0 ? WHITE : YELLOW].id, to: shotCode(degrees, power), extra: tipCode(side, high) });

describe("carom codes", () => {
  it("round-trips shots and tips, and refuses a tip off the ball", () => {
    const code = shotCode(123.4, 17);
    expect(shotOf(code)).toMatchObject({ degrees: 123.4, power: 17 });
    expect(shotOf(shotCode(-30, 5))!.degrees).toBe(330);
    expect(tipOf(tipCode(-6, 4))).toEqual({ side: -6, high: 4 });
    expect(tipOf(-1)).toEqual({ side: 0, high: 0 });
    expect(tipOf(tipCode(10, 10))).toBeNull();
    expect(tipOf(9999)).toBeNull();
  });
  it("takes the target chosen for each kind", () => {
    expect(targetOf("four", { target4: "30", target3: "15" })).toBe(30);
    expect(targetOf("three", { target4: "30", target3: "15" })).toBe(15);
    expect(targetOf("three", { target3: "30" })).toBe(10);
    expect(carom.create("three", { target3: "20" }).target).toBe(20);
    expect(carom.create("four", {}).balls).toHaveLength(4);
    expect(carom.create("three", {}).balls).toHaveLength(3);
  });
});

describe("4구 scoring", () => {
  it("scores both reds, fouls the other cue ball, and gives nothing for one red", () => {
    expect(judge("four", WHITE, [hit(3, RED), wall(9), hit(20, RED2)])).toMatchObject({ point: true, foul: false });
    expect(judge("four", WHITE, [hit(3, RED), hit(20, RED2), hit(40, YELLOW)])).toMatchObject({ point: false, foul: true });
    expect(judge("four", WHITE, [hit(3, RED), wall(9)])).toMatchObject({ point: false, foul: false, hit: [RED] });
    expect(judge("four", WHITE, [])).toMatchObject({ point: false, foul: false });
    // The yellow side's own ball is the yellow: touching the white is its foul.
    expect(judge("four", YELLOW, [{ slice: 1, a: YELLOW, b: WHITE, speed: 1 }])).toMatchObject({ foul: true });
  });
  it("keeps the turn on a point, passes it otherwise, and never takes a point below nought", () => {
    // Straight at the yellow ball: a foul.
    const s = laid("four", [[0, 3], [0, 1], [2, -4], [-2, -4]]);
    const fouled = shot(s, toward(s, WHITE, YELLOW), 6)!;
    expect(fouled.last).toMatchObject({ foul: true, point: false });
    expect(fouled.score).toEqual([0, 0]);
    expect(fouled.turn).toBe(1);
    const fouledAgain = shot({ ...s, score: [3, 0] }, toward(s, WHITE, YELLOW), 6)!;
    expect(fouledAgain.score).toEqual([2, 0]);
    // A shot the computer finds in a simple position scores, keeps the turn and counts the run.
    const easy = laid("four", [[0, 3.2], [2, -4], [0.25, 0.6], [-0.7, -1.4]]),
      move = chooseShot(easy, "hard", () => 0.5)!,
      made = play(easy, move)!;
    expect(made.last).toMatchObject({ point: true, foul: false });
    expect(made.score).toEqual([1, 0]);
    expect(made.turn).toBe(0);
    expect(made.run).toBe(1);
    expect(made.ply).toBe(1);
  });
  it("wins at the target", () => {
    const easy = laid("four", [[0, 3.2], [2, -4], [0.25, 0.6], [-0.7, -1.4]], { score: [9, 4], target: 10 }),
      made = play(easy, chooseShot(easy, "hard", () => 0.5)!)!;
    expect(made.winner).toBe(0);
    expect(moves(made)).toEqual([]);
    expect(play(made, moves(easy)[0])).toBeNull();
    expect(carom.reason(made)).toMatch(/^10점을 먼저 채웠습니다\./);
  });
  it("refuses a shot of the wrong ball or with a bad tip", () => {
    const s = createGame("four");
    expect(play(s, { from: YELLOW, to: shotCode(270, 10), extra: -1 })).toBeNull();
    expect(play(s, { from: WHITE, to: 12, extra: -1 })).toBeNull();
    expect(play(s, { from: WHITE, to: shotCode(270, 10), extra: 5000 })).toBeNull();
  });
});

describe("3쿠션 cushion counting", () => {
  it("needs three cushions before the second ball", () => {
    expect(judge("three", WHITE, [wall(2, 0), wall(30, 2), hit(50, RED), wall(70, 1), hit(90, YELLOW)])).toMatchObject({ point: true, cushions: 3 });
    expect(judge("three", WHITE, [hit(5, RED), wall(30, 0), wall(60, 3), hit(90, YELLOW)])).toMatchObject({ point: false, cushions: 2 });
    expect(judge("three", WHITE, [hit(5, RED), wall(30, 0), wall(60, 3), wall(80, 1), hit(90, YELLOW)])).toMatchObject({ point: true, cushions: 3 });
    // Cushions after the second ball do not count, and one ball alone is no point.
    expect(judge("three", WHITE, [hit(5, RED), hit(9, YELLOW), wall(30), wall(50, 2), wall(60, 1)])).toMatchObject({ point: false, cushions: 0 });
    expect(judge("three", WHITE, [wall(1), wall(20, 2), wall(40, 1), hit(60, RED)])).toMatchObject({ point: false });
  });
  it("counts a double touch of one cushion once", () => {
    expect(touches([wall(10, 0), wall(13, 0), wall(40, 2)], WHITE)).toEqual([-1, -1]);
    expect(touches([wall(10, 0), wall(30, 0)], WHITE)).toEqual([-1, -1]);
    expect(judge("three", WHITE, [hit(2, RED), wall(10, 0), wall(12, 0), wall(30, 2), hit(60, YELLOW)])).toMatchObject({ point: false, cushions: 2 });
  });
  it("counts the cushions a real shot strikes", () => {
    const b = [ball(WHITE, 0, 3)];
    strike(b[0], (-60 * Math.PI) / 180, speedOf(20));
    const { contacts } = run(b);
    expect(touches(contacts, WHITE).filter((t) => t === -1).length).toBeGreaterThanOrEqual(3);
  });
  it("lets the computer score the opening three-cushion shot", () => {
    const s = createGame("three"),
      made = play(s, chooseShot(s, "hard", () => 0.5)!)!;
    expect(made.last).toMatchObject({ point: true });
    expect(made.last!.cushions).toBeGreaterThanOrEqual(3);
    expect(made.score).toEqual([1, 0]);
  });
});

describe("carom physics", () => {
  /** Where a lone ball comes to rest after it is sent straight at the far cushion with this tip. */
  const rebound = (side: number) => {
    const b = [ball(WHITE, 0, 3)];
    strike(b[0], -Math.PI / 2, speedOf(8), side, 0);
    run(b);
    return b[0];
  };
  it("turns a cushion rebound with side spin", () => {
    const left = rebound(-1),
      none = rebound(0),
      right = rebound(1);
    expect(Math.abs(none.x)).toBeLessThan(1e-9);
    expect(right.x).toBeGreaterThan(0.5);
    expect(left.x).toBeLessThan(-0.5);
    expect(right.x).toBeCloseTo(-left.x, 6);
  });
  it("follows with top spin and draws back with back spin", () => {
    /** Where the cue ball is half a second after it has struck a red close before it, full in the face. */
    const after = (high: number) => {
      const balls: Ball[] = [ball(WHITE, 0, 0.9), ball(RED, 0, 0)];
      strike(balls[0], -Math.PI / 2, speedOf(8), 0, high);
      run(balls, (contacts, n) => contacts.length > 0 && n > contacts[0].slice + 60);
      return balls[0].z;
    };
    const follow = after(1),
      stun = after(0),
      draw = after(-1);
    // Struck in its middle it still slides when it meets the red, and stops close by; above its middle it runs on
    // after the red, below it comes back toward where it started.
    expect(Math.abs(stun - 2 * R)).toBeLessThan(0.5);
    expect(follow).toBeLessThan(stun - 0.3);
    expect(draw).toBeGreaterThan(stun + 0.5);
    expect(draw).toBeGreaterThan(2 * R);
  });
  it("keeps every ball on the cloth", () => {
    const balls = createGame("four").balls;
    strike(balls[WHITE], 1.1, speedOf(20), 1, -1);
    run(balls);
    for (const b of balls) expect(Math.abs(b.z)).toBeLessThanOrEqual(HALF_Z - R + 1e-9);
  });
  it("is deterministic, and the view's slice-by-slice replay ends where the rules do", () => {
    const s = createGame("three"),
      move = { from: WHITE, to: shotCode(287.3, 14), extra: tipCode(5, -3) },
      a = play(s, move)!,
      b = play(s, move)!;
    expect(JSON.stringify(a.balls)).toBe(JSON.stringify(b.balls));
    expect(a.last).toEqual(b.last);
    // As the view runs it: struck, then stepped a slice at a time.
    const live = struck(s, move)!;
    let n = 0;
    while (moving(live) && n < 120 * 40) step(live, [], n++);
    expect(n * DT).toBeGreaterThan(0.5);
    live.forEach((ball, i) => {
      expect(ball.x).toBe(a.balls[i].x);
      expect(ball.z).toBe(a.balls[i].z);
    });
    // The state handed in is never changed.
    expect(s.balls).toEqual(copy(createGame("three").balls));
  });
});

describe("carom computer", () => {
  it("answers at every level with a legal shot of its own ball", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const s = { ...createGame("four"), turn: 1 as const },
        move = chooseShot(s, level, () => 0.3)!;
      expect(move.from).toBe(YELLOW);
      expect(play(s, move)).not.toBeNull();
    }
  });
});
