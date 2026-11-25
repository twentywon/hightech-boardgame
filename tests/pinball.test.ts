import { describe, expect, test } from "vitest";
import * as R from "../src/games/pinball/rules";
import * as S from "../src/games/pinball/sim";

/** Steps the world `seconds`, collecting what happened (and stopping early when `until` says so). */
function run(w: S.World, seconds: number, until: (h: S.Happening[]) => boolean = () => false) {
  const all: S.Happening[] = [];
  for (let k = 0; k < seconds / S.DT; k++) {
    const h = S.step(w);
    all.push(...h);
    if (until(h)) break;
  }
  return all;
}
/** A world with the ball in play at (x, y) moving at (vx, vy), the ball save over. */
function at(x: number, y: number, vx = 0, vy = 0) {
  const w = S.createWorld(5);
  Object.assign(w.ball, { x, y, vx, vy });
  w.phase = "play";
  w.savedUntil = -1;
  return w;
}
/** A point on the left flipper's face at its rest, `share` of the way from the pivot to the tip, just above it. */
function onLeftFlipper(share: number) {
  const f = S.createWorld(1).flippers[0],
    d = S.flipperDir(f),
    r = S.FLIPPER.base + (S.FLIPPER.tip - S.FLIPPER.base) * share;
  // The face's upward normal: the direction turned a quarter round to the left.
  return { x: f.px + d.x * S.FLIPPER.length * share - d.y * (r + S.BALL_R + 0.0005), y: f.py + d.y * S.FLIPPER.length * share + d.x * (r + S.BALL_R + 0.0005) };
}

describe("pinball: the flippers", () => {
  test("a flick sends the ball up the field, faster from the tip than from near the pivot", () => {
    const flick = (share: number) => {
      const p = onLeftFlipper(share),
        w = at(p.x, p.y);
      S.flip(w, 0, true);
      run(w, 0.06);
      return { vy: w.ball.vy, speed: Math.hypot(w.ball.vx, w.ball.vy) };
    };
    const tip = flick(0.9),
      near = flick(0.25);
    expect(tip.vy).toBeGreaterThan(1.2);
    expect(near.vy).toBeGreaterThan(0.2);
    expect(tip.speed).toBeGreaterThan(near.speed * 1.4);
  });
  test("a held flipper cradles the ball: it rolls down to the flipper's root and stays there", () => {
    const w = at(-0.05, 0.25);
    S.flip(w, 0, true);
    const h = run(w, 4);
    expect(h.some((e) => e.kind === "drain" || e.kind === "save")).toBe(false);
    expect(Math.hypot(w.ball.vx, w.ball.vy)).toBeLessThan(0.05);
    // Held near the root of the left flipper, above it.
    expect(w.ball.x).toBeLessThan(-0.04);
    expect(w.ball.y).toBeGreaterThan(S.FLIPPER.y - 0.01);
    // Let go, it rolls off and down.
    S.flip(w, 0, false);
    expect(run(w, 4, (h) => h.some((e) => e.kind === "drain")).some((e) => e.kind === "drain")).toBe(true);
  });
  test("pressing a flipper moves the lit lanes its way", () => {
    const w = S.createWorld(1);
    w.lanes = [true, false, false];
    S.flip(w, 1, true);
    expect(w.lanes).toEqual([false, true, false]);
    S.flip(w, 1, false);
    S.flip(w, 0, true);
    expect(w.lanes).toEqual([true, false, false]);
  });
});

describe("pinball: what the ball meets", () => {
  test("a pop bumper kicks a slow ball away quickly and scores", () => {
    const [bx, by] = S.BUMPERS[2],
      w = at(bx, by + S.BUMPER_R + S.BALL_R + 0.02, 0, -0.3),
      h = run(w, 0.3, (h) => h.some((e) => e.kind === "hit" && e.what === "bumper"));
    expect(h.find((e) => e.kind === "hit" && e.what === "bumper")).toMatchObject({ points: S.POINTS.bumper, id: 2 });
    expect(Math.hypot(w.ball.vx, w.ball.vy)).toBeGreaterThan(S.KICK * 0.9);
    expect(w.ball.vy).toBeGreaterThan(0);
  });
  test("a slingshot fires the ball back out", () => {
    // Rolling down onto the left sling's face.
    const w = at(-0.1, 0.33, -0.3, -0.6),
      h = run(w, 0.5, (h) => h.some((e) => e.kind === "hit" && e.what === "sling"));
    expect(h.some((e) => e.kind === "hit" && e.what === "sling")).toBe(true);
    expect(Math.hypot(w.ball.vx, w.ball.vy)).toBeGreaterThan(S.SLING_KICK * 0.9);
    expect(w.ball.vx).toBeGreaterThan(0);
  });
  test("drop targets fall when hit; all three down score the bank and come back up", () => {
    const w = at(0, 0.5);
    let seen: S.Happening[] = [];
    // Each struck from in front (down and to the right of the bank), toward the bank.
    const n = { x: S.BANK.by - S.BANK.ay, y: -(S.BANK.bx - S.BANK.ax) },
      len = Math.hypot(n.x, n.y);
    for (const [x, y] of S.TARGETS) {
      Object.assign(w.ball, { x: x + (n.x / len) * 0.04, y: y + (n.y / len) * 0.04, vx: (-n.x / len) * 2, vy: (-n.y / len) * 2 });
      seen = seen.concat(run(w, 0.15, (h) => h.some((e) => e.kind === "hit" && e.what === "target")));
    }
    expect(seen.filter((e) => e.kind === "hit" && e.what === "target")).toHaveLength(3);
    expect(seen.find((e) => e.kind === "hit" && e.what === "bank")).toMatchObject({ points: S.POINTS.bank });
    expect(w.down).toEqual([true, true, true]);
    Object.assign(w.ball, { x: 0, y: 0.5, vx: 0, vy: 0 });
    run(w, 1.4);
    expect(w.down).toEqual([false, false, false]);
  });
  test("rolling over all three top lanes lights the bonus multiplier", () => {
    const w = at(0, 0.5);
    for (const x of S.LANES) {
      Object.assign(w.ball, { x, y: S.LANE_LINE + 0.02, vx: 0, vy: -0.5 });
      run(w, 0.06);
    }
    expect(w.multiplier).toBe(2);
    expect(w.lanes).toEqual([false, false, false]);
  });
  test("the spinner scores more turns the faster the ball goes through", () => {
    const turns = (vy: number) => {
      const w = at((S.SPINNER.x0 + S.SPINNER.x1) / 2, S.SPINNER.y - 0.02, 0, vy),
        h = run(w, 0.1, (h) => h.some((e) => e.kind === "hit" && e.what === "spinner"));
      return (h.find((e) => e.kind === "hit" && e.what === "spinner") as { points: number } | undefined)?.points ?? 0;
    };
    expect(turns(0.6)).toBeGreaterThan(0);
    expect(turns(3)).toBeGreaterThan(turns(0.6) * 2);
  });
});

describe("pinball: the plunger, the drain and the ball save", () => {
  test("the plunger's pull sets the launch: a full one goes round the arch into the field, a weak one falls back", () => {
    const launch = (pull: number) => {
      const w = S.createWorld(2);
      S.plunge(w, true);
      w.plunger.drag = pull;
      const out = S.plunge(w, false);
      const v = w.ball.vy;
      let top = 0;
      let inField = false;
      for (let k = 0; k < 2.5 / S.DT; k++) {
        S.step(w);
        top = Math.max(top, w.ball.y);
        if (w.ball.x < S.WALL_X - 0.02) inField = true;
      }
      return { out, v, top, inField, back: S.onPlunger(w) };
    };
    const full = launch(1),
      weak = launch(0.05);
    expect(full.out[0]).toMatchObject({ kind: "launch" });
    expect(full.v).toBeCloseTo(S.LAUNCH[1], 6);
    expect(full.v).toBeGreaterThan(weak.v + 2);
    expect(full.top).toBeGreaterThan(0.95);
    expect(full.inField).toBe(true);
    expect(weak.inField).toBe(false);
    expect(weak.back).toBe(true);
  });
  test("held, the plunger charges by itself", () => {
    const w = S.createWorld(2);
    S.plunge(w, true);
    run(w, S.CHARGE_TIME / 2);
    expect(w.plunger.charge).toBeGreaterThan(0.45);
    expect(w.plunger.charge).toBeLessThan(0.55);
    S.plunge(w, false);
    expect(w.ball.vy).toBeCloseTo(S.launchSpeed(0.5), 1);
  });
  test("a ball down the drain is lost with its bonus; drained soon after its launch it is saved once", () => {
    const w = S.createWorld(3);
    S.plunge(w, true);
    w.plunger.drag = 1;
    S.plunge(w, false);
    // Soon after the launch the ball goes down the middle: given back on the plunger.
    Object.assign(w.ball, { x: 0, y: 0.05, vx: 0, vy: -1 });
    expect(run(w, 0.2, (h) => h.length > 0).some((e) => e.kind === "save")).toBe(true);
    expect(S.onPlunger(w)).toBe(true);
    // Launched again and drained again: no second save.
    S.plunge(w, true);
    w.plunger.drag = 1;
    S.plunge(w, false);
    w.bonus = 300;
    w.multiplier = 2;
    Object.assign(w.ball, { x: 0, y: 0.05, vx: 0, vy: -1 });
    const h = run(w, 0.2, (h) => h.length > 0);
    expect(h.find((e) => e.kind === "drain")).toEqual({ kind: "drain", bonus: 600, multiplier: 2 });
    expect(w.multiplier).toBe(1);
    expect(w.bonus).toBe(0);
    expect(S.onPlunger(w)).toBe(true);
  });
  test("a ball down an outlane drains", () => {
    const w = at(-0.2, 0.4, 0, -0.5);
    expect(run(w, 3, (h) => h.some((e) => e.kind === "drain")).some((e) => e.kind === "drain")).toBe(true);
  });
});

describe("pinball: a long game", () => {
  test("played by flipping now and then, the ball stays on the table, scores, and the same play comes out the same", () => {
    const play = () => {
      const w = S.createWorld(11),
        log: string[] = [];
      let top = 0;
      for (let k = 0; k < 90 / S.DT; k++) {
        if (S.onPlunger(w) && !w.plunger.held) S.plunge(w, true);
        if (w.plunger.held && w.plunger.charge > 0.85) S.plunge(w, false);
        // Flip when the ball comes near a flipper on its way down.
        for (const side of [0, 1] as const) {
          const f = w.flippers[side],
            near = Math.hypot(w.ball.x - f.px, w.ball.y - f.py) < S.FLIPPER.length + 0.02 && w.ball.vy < -0.1;
          S.flip(w, side, near || (f.held && f.angle < S.FLIPPER.up));
        }
        for (const e of S.step(w)) log.push(e.kind === "hit" ? e.what : e.kind);
        expect(Number.isFinite(w.ball.x + w.ball.y)).toBe(true);
        top = Math.max(top, w.ball.y);
        expect(Math.abs(w.ball.x)).toBeLessThanOrEqual(S.HALF_W);
        expect(w.ball.y).toBeLessThan(S.TOP);
      }
      return { log, top };
    };
    const a = play(),
      b = play();
    expect(a.log).toEqual(b.log);
    expect(a.top).toBeGreaterThan(0.9);
    expect(a.log.filter((e) => e === "flipper").length).toBeGreaterThan(5);
    expect(a.log.some((e) => e === "bumper" || e === "sling" || e === "target" || e === "lane" || e === "spinner")).toBe(true);
  });
});

describe("pinball rules", () => {
  test("points add up, and the third ball drained ends the game", () => {
    let s = R.createGame();
    s = R.play(s, R.scoreMove(2500))!;
    s = R.play(s, R.scoreMove(100))!;
    expect(s.score).toBe(2600);
    expect(s.award).toBe(100);
    expect(R.play(s, { from: -1, to: R.SCORE, extra: -1 })).toBeNull();
    s = R.play(s, { from: -1, to: R.SAVE, extra: -1 })!;
    expect(s.ball).toBe(1);
    s = R.play(s, { from: -1, to: R.DRAIN, extra: -1 })!;
    expect(s.ball).toBe(2);
    s = R.play(s, { from: -1, to: R.DRAIN, extra: -1 })!;
    expect(s.winner).toBeNull();
    s = R.play(s, { from: -1, to: R.DRAIN, extra: -1 })!;
    expect(s.winner).toBe(0);
    expect(R.play(s, R.scoreMove(100))).toBeNull();
  });
});
