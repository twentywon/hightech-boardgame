import { describe, expect, it } from "vitest";
import { DT, HALF_X, HALF_Z, R, ball, copy, run, speedOf, step, strike, moving, type Ball, type Contact } from "../src/games/carom/sim";
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
  opening,
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
import { AIM_LENGTH, STRUCK_LENGTH, aimPath, dotsAlong, lengthOf } from "../src/games/carom/aim";

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

describe("carom line of aim", () => {
  const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
  it("runs straight for its whole length when nothing is in the way", () => {
    const path = aimPath({ x: 0, z: 0 }, -Math.PI / 2, [], 2);
    expect(path.cue).toHaveLength(2);
    near(path.cue[1].x, 0);
    near(path.cue[1].z, -2);
    expect(path.struck).toEqual([]);
  });
  it("turns at a cushion as a mirror turns light", () => {
    // From the middle at 45° toward the +x rail: it meets the rail where the middle is a radius from its face.
    const path = aimPath({ x: 0, z: 0 }, Math.PI / 4, [], 5),
      wall = HALF_X - R;
    expect(path.cue.length).toBe(3);
    near(path.cue[1].x, wall);
    near(path.cue[1].z, wall);
    // After it: x comes back, z goes on.
    expect(path.cue[2].x).toBeLessThan(wall);
    expect(path.cue[2].z).toBeGreaterThan(path.cue[1].z);
    near(path.cue[2].x - path.cue[1].x, -(path.cue[2].z - path.cue[1].z));
  });
  it("turns at a corner on both rails", () => {
    const wall = HALF_X - R,
      // Aimed exactly into a corner from a point on its diagonal.
      path = aimPath({ x: wall - 1, z: HALF_Z - R - 1 }, Math.PI / 4, [], 4);
    const end = path.cue[path.cue.length - 1];
    // It comes back along the way it went.
    expect(end.x).toBeLessThan(wall - 1);
    expect(end.z).toBeLessThan(HALF_Z - R - 1);
    near(lengthOf(path.cue), 4);
  });
  it("meets a ball two radii from its middle and leaves along the tangent line", () => {
    // A ball ahead along −z, offset half a radius: a thick hit.
    const target = { id: RED, x: R / 2, z: -2 },
      path = aimPath({ x: 0, z: 0 }, -Math.PI / 2, [target], 3),
      contact = path.cue[1];
    near(Math.hypot(contact.x - target.x, contact.z - target.z), 2 * R);
    near(contact.x, 0);
    // The struck ball goes along the line of the middles.
    expect(path.struck).toHaveLength(1);
    expect(path.struck[0].id).toBe(RED);
    const line = path.struck[0].line,
      nx = (target.x - contact.x) / (2 * R),
      nz = (target.z - contact.z) / (2 * R),
      ox = line[1].x - line[0].x,
      oz = line[1].z - line[0].z;
    near(line[0].x, target.x);
    near((ox * nx + oz * nz) / Math.hypot(ox, oz), 1);
    near(lengthOf(line), STRUCK_LENGTH);
    // The cue ball goes on at right angles to that line, to the other side.
    const after = path.cue[2],
      cx = after.x - contact.x,
      cz = after.z - contact.z;
    near((cx * nx + cz * nz) / Math.hypot(cx, cz), 0);
    expect(cx).toBeLessThan(0);
  });
  it("stops at a ball struck full", () => {
    const path = aimPath({ x: 0, z: 0 }, -Math.PI / 2, [{ id: RED, x: 0, z: -2 }], 5);
    expect(path.cue).toHaveLength(2);
    near(path.cue[1].z, -2 + 2 * R);
    expect(path.struck).toHaveLength(1);
    near(path.struck[0].line[1].x, 0);
    expect(path.struck[0].line[1].z).toBeLessThan(-2);
  });
  it("passes a ball it misses by more than two radii, and ignores balls behind", () => {
    const path = aimPath({ x: 0, z: 0 }, -Math.PI / 2, [{ id: RED, x: 2 * R + 0.01, z: -2 }, { id: YELLOW, x: 0, z: 1 }], 3);
    expect(path.struck).toEqual([]);
    expect(path.cue).toHaveLength(2);
  });
  it("keeps the same whole length whatever it meets, inside the cushions", () => {
    let turned = 0,
      struckAny = 0;
    for (const kind of ["four", "three"] as const)
      for (let k = 0; k < 72; k++) {
        const balls = opening(kind),
          path = aimPath(balls[WHITE], (k * Math.PI) / 36 + 0.01, balls.filter((b) => b.id !== WHITE));
        near(lengthOf(path.cue), AIM_LENGTH, 1e-6);
        turned += path.cue.length > 2 ? 1 : 0;
        struckAny += path.struck.length;
        for (const p of path.cue) {
          expect(Math.abs(p.x)).toBeLessThanOrEqual(HALF_X - R + 1e-9);
          expect(Math.abs(p.z)).toBeLessThanOrEqual(HALF_Z - R + 1e-9);
        }
      }
    expect(turned).toBeGreaterThan(50);
    expect(struckAny).toBeGreaterThan(0);
  });
  it("lays dots at even spacing across the turns", () => {
    const line = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }],
      dots = dotsAlong(line, 0.25, 0.1);
    expect(dots).toHaveLength(8);
    near(dots[0].x, 0.1);
    // 0.85 along: on the second piece.
    near(dots[3].x, 0.85);
    near(dots[4].x, 1);
    near(dots[4].z, 0.1);
  });
});
