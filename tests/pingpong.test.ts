import { describe, expect, test } from "vitest";
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import { EYE, HAND_Y, alongSight, handFor, liftFor, rallyCamera } from "../src/games/pingpong/layout";
import * as r from "../src/games/pingpong/rules";
import * as s from "../src/games/pingpong/sim";

const point = (state: r.State, to: 0 | 1, why = s.MISSED) => r.play(state, { from: -1, to, extra: why })!;
const ball = (x: number, y: number, z: number, vx = 0, vy = 0, vz = 0, wx = 0): s.Ball => ({ x, y, z, vx, vy, vz, wx, wy: 0, wz: 0 });
/** Steps a world until `until` says so or a point is decided; returns everything that happened. */
function run(world: s.World, level: s.Level, seconds: number, until: (e: s.Happening) => boolean = (e) => e.kind === "point" || e.kind === "let") {
  const seen: s.Happening[] = [];
  for (let k = 0; k < seconds / s.DT; k++)
    for (const e of s.step(world, level)) {
      seen.push(e);
      if (until(e)) return seen;
    }
  return seen;
}
/** A world mid-rally: the ball just struck by `hitter` with `shot`, my paddle kept out of the way. */
function rally(seed: number, hitter: 0 | 1, from: s.Ball, shot: s.Shot) {
  const world = s.createWorld(seed);
  world.hands[0] = { x: 1.3, z: s.HALF_L + 0.6 };
  world.paddles[0].x = 1.3;
  world.ball = from;
  s.launch(world, hitter, shot);
  // The paddle was set aside without a swing: nothing to curve the ball with.
  world.steer = null;
  return world;
}

describe("table tennis: the ball", () => {
  test("a dropped ball bounces up a little lower than it fell from", () => {
    const b = ball(0, 0.3, 0.6);
    let top = 0,
      bounced = false;
    for (let k = 0; k < 400; k++) {
      if (s.advanceBall(b).table === 0) bounced = true;
      if (bounced && b.vy > 0) top = Math.max(top, b.y);
    }
    expect(top).toBeGreaterThan(0.18);
    expect(top).toBeLessThan(0.27);
  });
  test("spin kicks the bounce: topspin runs on, backspin checks", () => {
    const after = (wx: number) => {
      const b = ball(0, 0.2, 0.6, 0, -1, -3, wx);
      for (let k = 0; k < 200; k++) if (s.advanceBall(b).table >= 0) return -b.vz;
      return NaN;
    };
    // Moving toward -z, topspin turns the ball's top toward -z (wx < 0).
    expect(after(-150)).toBeGreaterThan(after(0));
    expect(after(150)).toBeLessThan(after(0));
  });
  test("topspin makes a ball dip sooner than a flat one, backspin floats it", () => {
    const land = (wx: number) => {
      const b = ball(0, 0.3, 1.2, 0, 1, -5, wx);
      for (let k = 0; k < 800; k++) if (s.advanceBall(b).table >= 0) return b.z;
      return NaN;
    };
    expect(land(-150)).toBeGreaterThan(land(0));
    expect(land(150)).toBeLessThan(land(0));
  });
  test("the net stops a low ball and clips one that grazes its cord", () => {
    const low = ball(0, 0.09, 0.4, 0, 0.3, -4);
    let net = false;
    for (let k = 0; k < 300; k++) if (s.advanceBall(low).net) net = true;
    expect(net).toBe(true);
    expect(low.z).toBeGreaterThan(0);
    const graze = ball(0, s.NET_H + 0.012, 0.2, 0, 0, -4);
    let clipped = false;
    for (let k = 0; k < 300 && graze.z > -0.5; k++) if (s.advanceBall(graze).net) clipped = true;
    expect(clipped).toBe(true);
    expect(graze.z).toBeLessThan(0);
  });
});

describe("table tennis: serves and points", () => {
  test("the computer's serve bounces on its side and then on mine, at every level", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      let legal = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const world = s.createWorld(seed);
        world.hands[0] = { x: 1.3, z: s.HALF_L + 0.6 };
        s.serve(world, 1);
        const seen = run(world, level, 5, (e) => e.kind === "point" || e.kind === "let" || (e.kind === "bounce" && e.side === 0));
        const bounces = seen.filter((e) => e.kind === "bounce").map((e) => (e as { side: number }).side);
        if (bounces.join("") === "10" && s.canHit(world, 0)) legal++;
      }
      expect(legal, level).toBeGreaterThanOrEqual(18);
    }
  }, 20000);
  test("my serve: tossed, struck as it falls, it bounces on my side and then the computer's", () => {
    const world = s.createWorld(4);
    world.hands[0] = { x: 0.1, z: s.HALF_L + 0.4 };
    s.serve(world, 0);
    for (let k = 0; k < 20; k++) s.step(world, "normal");
    // Only the server tosses.
    expect(s.toss(world, 1)).toBe(false);
    expect(s.toss(world, 0)).toBe(true);
    // Wait for the ball to come down, then swing the paddle forward through it.
    let k = 0;
    while (world.ball.vy > -0.4 && k++ < 400) s.step(world, "normal");
    const seen: s.Happening[] = [];
    for (let j = 0; j < 240; j++) {
      world.hands[0] = { x: world.ball.x, z: world.hands[0].z - 3 * s.DT };
      seen.push(...s.step(world, "normal"));
      if (seen.some((e) => e.kind === "bounce" && e.side === 1)) break;
    }
    expect(seen.find((e) => e.kind === "hit")).toMatchObject({ kind: "hit", side: 0 });
    const bounces = seen.filter((e) => e.kind === "bounce").map((e) => (e as { side: number }).side);
    expect(bounces).toEqual([0, 1]);
    expect(world.phase).toBe("rally");
  });
  test("over Wi-Fi a person at the far end strikes its own toss: its serve bounces on its side and then on the near one", () => {
    // The user found a guest's serve never went: its tossed ball was struck only on side 0's serve, and fell back.
    const world = s.createWorld(6);
    world.people = [true, true];
    world.hands[0] = { x: 0, z: s.HALF_L + 0.4 };
    world.hands[1] = { x: -0.1, z: -s.HALF_L - 0.4 };
    s.serve(world, 1);
    for (let k = 0; k < 20; k++) s.step(world, "normal");
    // No computer tosses it for the person: it waits, held, until the person does.
    for (let k = 0; k < 240; k++) s.step(world, "normal");
    expect(world.phase).toBe("ready");
    expect(s.toss(world, 0)).toBe(false);
    expect(s.toss(world, 1)).toBe(true);
    let k = 0;
    while (world.ball.vy > -0.4 && k++ < 400) s.step(world, "normal");
    const seen: s.Happening[] = [];
    for (let j = 0; j < 240; j++) {
      // Forward for the far end is toward the net: up the table's z.
      world.hands[1] = { x: world.ball.x, z: world.hands[1].z + 3 * s.DT };
      seen.push(...s.step(world, "normal"));
      if (seen.some((e) => e.kind === "bounce" && e.side === 0)) break;
    }
    expect(seen.find((e) => e.kind === "hit")).toMatchObject({ kind: "hit", side: 1 });
    const bounces = seen.filter((e) => e.kind === "bounce").map((e) => (e as { side: number }).side);
    expect(bounces).toEqual([1, 0]);
    expect(world.phase).toBe("rally");
  });
  test("a toss is served by the swing alone: a hand already reaching forward, kept still, lets the ball fall (both ends)", () => {
    // The user found a serve went off by itself the moment it was tossed (the blade let forward through the ball).
    for (const side of [0, 1] as const) {
      const world = s.createWorld(8 + side),
        f = side === 0 ? 1 : -1;
      world.people = [true, true];
      world.hands[0] = { x: 0, z: side === 0 ? 0.8 : s.HALF_L + 0.4 };
      world.hands[1] = { x: 0, z: side === 1 ? -0.8 : -s.HALF_L - 0.4 };
      s.serve(world, side);
      for (let k = 0; k < 40; k++) s.step(world, "normal");
      expect(s.toss(world, side)).toBe(true);
      const still = run(world, "normal", 1.2);
      expect(still.some((e) => e.kind === "hit"), `side ${side}`).toBe(false);
      expect(world.phase).toBe("ready");
      // Tossed again and swung forward as it falls: served.
      expect(s.toss(world, side)).toBe(true);
      const seen: s.Happening[] = [];
      for (let k = 0; k < 240 && !seen.some((e) => e.kind === "hit"); k++) {
        if (world.ball.vy < -0.3) world.hands[side] = { x: 0, z: world.hands[side].z - f * 3 * s.DT };
        seen.push(...s.step(world, "normal"));
      }
      expect(seen.find((e) => e.kind === "hit"), `side ${side}`).toMatchObject({ kind: "hit", side });
    }
  });
  test("a tossed ball let fall is tossed again, without a point", () => {
    const world = s.createWorld(2);
    s.serve(world, 0);
    s.toss(world);
    const seen = run(world, "normal", 1.5);
    expect(seen.some((e) => e.kind === "point")).toBe(false);
    expect(world.phase).toBe("ready");
  });
  test("a serve straight onto the other side is a fault; one off the net that lands right is a let", () => {
    const fault = rally(3, 0, ball(0, 0.3, s.HALF_L + 0.1), { tx: 0, depth: 0.6, pace: 5, top: 0, side: 0 });
    fault.served = true;
    expect(run(fault, "normal", 3).at(-1)).toEqual({ kind: "point", to: 1, why: s.FAULT });
    const net = s.createWorld(3);
    Object.assign(net, { phase: "rally", served: true, hitter: 0, own: 1, other: 0, netted: true });
    net.ball = ball(0, 0.15, -0.4, 0, -1, -1);
    expect(run(net, "normal", 2).at(-1)).toEqual({ kind: "let" });
    expect(net.phase).toBe("dead");
  });
  test("a second let in a row loses the server the point; a point played between starts the count again", () => {
    const letServe = (world: s.World) => {
      Object.assign(world, { phase: "rally", served: true, hitter: 0, own: 1, other: 0, netted: true });
      world.ball = ball(0, 0.15, -0.4, 0, -1, -1);
      return run(world, "normal", 2).at(-1);
    };
    const world = s.createWorld(4);
    s.serve(world, 0);
    expect(letServe(world)).toEqual({ kind: "let" });
    // The view serves again after a let: the count is kept.
    s.serve(world, 0);
    expect(world.lets).toBe(1);
    expect(letServe(world)).toEqual({ kind: "point", to: 1, why: s.LETS });
    expect(s.WHY[s.LETS]).toBe("렛 두 번");
    expect(world.lets).toBe(0);
    s.serve(world, 0);
    expect(letServe(world)).toEqual({ kind: "let" });
  });
  test("a ball off the table is out, and a ball nobody returns is the striker's point", () => {
    const out = rally(5, 0, ball(0, 0.3, s.HALF_L + 0.1), { tx: 0, depth: 1.5, pace: 7, top: 0, side: 0 });
    expect(run(out, "normal", 3).at(-1)).toEqual({ kind: "point", to: 1, why: s.OUT });
    const wide = rally(5, 0, ball(0, 0.3, s.HALF_L + 0.1), { tx: 1.2, depth: 0.7, pace: 5, top: 0, side: 0 });
    expect(run(wide, "normal", 3).at(-1)).toEqual({ kind: "point", to: 1, why: s.OUT });
    // The computer's ball comes to me and I stand aside: it bounces once and is gone.
    const missed = rally(6, 1, ball(0, 0.3, -s.HALF_L - 0.2), { tx: 0, depth: 0.85, pace: 5, top: 60, side: 0 });
    const end = run(missed, "normal", 4).at(-1) as { kind: string; to: number; why: number };
    expect(end.kind).toBe("point");
    expect(end.to).toBe(1);
    expect([s.MISSED, s.DOUBLE]).toContain(end.why);
    // A short ball bounces twice on my side.
    const short = rally(6, 1, ball(0, 0.3, -s.HALF_L - 0.2), { tx: 0, depth: 0.3, pace: 2.6, top: -40, side: 0, loop: true });
    expect(run(short, "normal", 4).at(-1)).toEqual({ kind: "point", to: 1, why: s.DOUBLE });
  });
  test("a ball into the net is the striker's fault", () => {
    const world = rally(7, 0, ball(0, 0.08, 0.5), { tx: 0, depth: 0.5, pace: 4, top: 0, side: 0 });
    // Struck low and flat: aimed through the net.
    Object.assign(world.ball, { x: 0, y: 0.08, z: 0.5, vx: 0, vy: 0.3, vz: -6, wx: 0 });
    expect(run(world, "normal", 3).at(-1)).toEqual({ kind: "point", to: 1, why: s.NET });
  });
  test("a ball that has not bounced on my side passes my paddle by", () => {
    const world = rally(8, 1, ball(0, 0.3, -s.HALF_L - 0.2), { tx: 0, depth: 0.95, pace: 5, top: 0, side: 0 });
    // My paddle stands over my half, before the bounce.
    world.hands[0] = { x: 0, z: 0.4 };
    const seen = run(world, "normal", 4);
    expect(seen.some((e) => e.kind === "hit" && e.side === 0)).toBe(false);
  });
});

describe("table tennis: my stroke", () => {
  const world = s.createWorld(1);
  world.ball = ball(0, 0.25, s.HALF_L, 0, 0, 4);
  const paddle = (vx: number, vz: number): s.Paddle => ({ x: 0, y: 0.25, z: s.HALF_L + 0.05, vx, vy: 0, vz });
  test("a faster swing toward the net hits harder and deeper, with topspin; pulling back gives backspin", () => {
    const still = s.swingShot(world, 0, paddle(0, 0), 0, 0, false),
      drive = s.swingShot(world, 0, paddle(0, -5), 0, 0, false),
      chop = s.swingShot(world, 0, paddle(0, 2), 0, 0, false);
    expect(drive.pace).toBeGreaterThan(still.pace);
    expect(drive.depth).toBeGreaterThan(still.depth);
    expect(drive.top).toBeGreaterThan(0);
    expect(chop.top).toBeLessThan(0);
    expect(chop.pace).toBeLessThan(still.pace);
    // However wild the swing, it never goes long (the user asked: no outs).
    for (const [vx, vz] of [[0, -16], [0, -30], [16, -4], [-20, -10], [9, 0]]) {
      const shot = s.swingShot(world, 0, paddle(vx, vz), 0, 0, false);
      expect(shot.depth).toBeLessThanOrEqual(s.DEEPEST);
      expect(Math.abs(shot.tx)).toBeLessThanOrEqual(s.EDGE);
    }
  });
  test("the swing aims the stroke, not where the ball meets the blade: sideways curves it, quick forward smashes", () => {
    // The same swing gives the same stroke wherever on the blade the ball is met.
    expect(s.swingShot(world, 0, paddle(0, 0), -0.12, 0, false).tx).toBeCloseTo(s.swingShot(world, 0, paddle(0, 0), 0.12, 0, false).tx, 6);
    // A swing to one side sends it that way, with no sidespin of its own (the blade's way after the stroke curves it).
    expect(s.swingShot(world, 0, paddle(-4, 0), 0, 0, false).tx).toBeLessThan(-0.3);
    expect(s.swingShot(world, 0, paddle(4, 0), 0, 0, false).tx).toBeGreaterThan(0.3);
    expect(s.swingShot(world, 0, paddle(2, 0), 0, 0, false).side).toBe(0);
    expect(s.swingShot(world, 0, paddle(6, -3), 0, 0, true).side).toBe(0);
    // A quick swing toward the net is a smash: far quicker than a gentle one.
    expect(s.swingShot(world, 0, paddle(0, -12), 0, 0, false).pace).toBeGreaterThan(s.swingShot(world, 0, paddle(0, -1), 0, 0, false).pace + 4);
  });
  test("the racket's whole speed at contact decides a smash; slow is gentle, pulling back still cuts", () => {
    const at = (vx: number, vz: number) => s.swingShot(world, 0, paddle(vx, vz), 0, 0, false);
    // Just under the threshold, a gentle return; just over it, a smash, far quicker, deep, with topspin.
    const gentle = at(0, -(s.SMASH - 0.3)),
      smash = at(0, -(s.SMASH + 0.3));
    expect(gentle.smash).toBeFalsy();
    expect(smash.smash).toBe(true);
    expect(smash.pace).toBeGreaterThan(gentle.pace + 1);
    expect(smash.depth).toBeGreaterThan(0.78);
    expect(smash.top).toBeGreaterThanOrEqual(150);
    // The whole speed counts, not only its part toward the net: a quick swing that is mostly sideways is a smash too.
    expect(at(6, -1).smash).toBe(true);
    expect(at(3, -1).smash).toBeFalsy();
    // A slow racket gives a slow ball; the quicker the racket, the quicker the ball.
    expect(at(0, -0.5).pace).toBeLessThan(at(0, -4).pace);
    expect(at(0, -7).pace).toBeLessThan(at(0, -12).pace);
    // A quick swing back toward me is a cut, never a smash.
    const cut = at(0, 8);
    expect(cut.smash).toBeFalsy();
    expect(cut.top).toBeLessThan(0);
    expect(cut.pace).toBeLessThan(gentle.pace);
  });
  test("the racket's speed is what it went over the last slices, not smoothed away", () => {
    const w = s.createWorld(3);
    w.hands[0] = { x: 0, z: s.HALF_L + 0.4 };
    for (let k = 0; k < 60; k++) s.step(w, "normal");
    expect(Math.abs(w.paddles[0].vz)).toBeLessThan(1e-9);
    // A sudden flick toward the net at 9 m/s: after SWING_SLICES slices the speed is all of it.
    for (let k = 0; k < s.SWING_SLICES; k++) {
      w.hands[0] = { x: 0, z: w.hands[0].z - 9 * s.DT };
      s.step(w, "normal");
    }
    expect(w.paddles[0].vz).toBeCloseTo(-9, 6);
    expect(Math.hypot(w.paddles[0].vx, w.paddles[0].vz)).toBeGreaterThan(s.SMASH);
    // Stopped, it is still again as soon as the window has passed.
    for (let k = 0; k < s.SWING_SLICES; k++) s.step(w, "normal");
    expect(Math.abs(w.paddles[0].vz)).toBeLessThan(1e-9);
  });
  test("a smash met at any fair height clears the net and comes down deep on the other side", () => {
    for (const y of [0.15, 0.25, 0.35])
      for (const vz of [-6, -9, -12]) {
        const shot = s.swingShot(world, 0, paddle(0, vz), 0, 0, false);
        expect(shot.smash).toBe(true);
        const w = rally(9, 0, ball(0.1, y, s.HALF_L + 0.05), shot);
        const seen = run(w, "normal", 3, (e) => e.kind === "bounce" || e.kind === "point");
        expect(seen.at(-1), `${y} ${vz}`).toMatchObject({ kind: "bounce", side: 1 });
        expect(w.ball.z).toBeLessThan(-0.95);
      }
  });
  /**
   * My stroke, and then my hand moved across at `vx` (metres a second of the hall's clock) while the ball flies:
   * where the ball comes down on the computer's side, and the furthest it went each way on its way there.
   */
  const steered = (shot: s.Shot, vx: number, from = 0.1) => {
    const w = s.createWorld(9);
    s.place(w, 0, from, s.HALF_L + 0.3);
    w.ball = ball(from, 0.25, s.HALF_L + 0.05);
    s.launch(w, 0, shot);
    let most = -Infinity,
      least = Infinity;
    for (let k = 0; k < 2 / s.DT; k++) {
      w.hands[0] = { x: w.hands[0].x + vx * s.DT, z: w.hands[0].z };
      const seen = s.step(w, "normal");
      most = Math.max(most, w.ball.x);
      least = Math.min(least, w.ball.x);
      const bounce = seen.find((e) => e.kind === "bounce" || e.kind === "point");
      if (bounce) return { at: bounce, x: w.ball.x, z: w.ball.z, most, least, wy: w.ball.wy, bent: w.bent };
    }
    throw new Error("the ball never came down");
  };
  test("the blade's way after the stroke curves the ball: held still it goes straight, drawn back it curves back, pushed on it goes wider", () => {
    const right = s.swingShot(world, 0, paddle(2.5, -3), 0, 0, false);
    expect(right.side).toBe(0);
    const still = steered(right, 0),
      back = steered(right, -3),
      on = steered(right, 2.5);
    for (const f of [still, back, on]) expect(f.at).toMatchObject({ kind: "bounce", side: 1 });
    // Held still: no spin at all, straight to where the swing sent it.
    expect(still.wy).toBe(0);
    expect(Math.abs(still.x - right.tx)).toBeLessThan(0.03);
    expect(still.bent).toBe(0);
    // Struck to the right, then drawn back left: it goes out right and curves back left, coming down well left of it.
    expect(back.x).toBeLessThan(still.x - 0.2);
    expect(back.most).toBeGreaterThan(back.x + 0.1);
    expect(back.bent).toBeGreaterThan(0);
    // Pushed on to the right: it bends on out that way.
    expect(on.x).toBeGreaterThan(still.x + 0.1);
    // The same to the other side.
    const left = s.swingShot(world, 0, paddle(-2.5, -3), 0, 0, false);
    expect(steered(left, 3).x).toBeGreaterThan(steered(left, 0).x + 0.2);
    expect(steered(left, -2.5).x).toBeLessThan(steered(left, 0).x - 0.1);
  });
  test("however far the blade pushes the curve, the ball still comes down on the table (no outs)", () => {
    for (const vx of [-8, -4, 4, 8])
      for (const swing of [-6, 0, 6])
        for (const vz of [-2, -7, -12]) {
          const shot = s.swingShot(world, 0, paddle(swing, vz), 0, 0, false),
            f = steered(shot, vx, swing > 0 ? 0.5 : swing < 0 ? -0.5 : 0);
          expect(f.at, `${vx} ${swing} ${vz}`).toMatchObject({ kind: "bounce", side: 1 });
          expect(Math.abs(f.x), `${vx} ${swing} ${vz}`).toBeLessThanOrEqual(s.HALF_W - s.LAND_IN + 0.01);
          expect(f.z).toBeGreaterThan(-s.HALF_L);
        }
  });
  test("the curve is only for a moment after the stroke: a hand moved later does not bend the ball", () => {
    const shot = s.swingShot(world, 0, paddle(0, -3), 0, 0, false),
      w = s.createWorld(9);
    s.place(w, 0, 0.1, s.HALF_L + 0.3);
    w.ball = ball(0.1, 0.25, s.HALF_L + 0.05);
    s.launch(w, 0, shot);
    for (let k = 0; k < (s.STEER_TIME + 0.02) / s.DT; k++) s.step(w, "normal");
    expect(w.steer).toBeNull();
    const wy = w.ball.wy;
    for (let k = 0; k < 20; k++) {
      w.hands[0] = { x: w.hands[0].x + 6 * s.DT, z: w.hands[0].z };
      s.step(w, "normal");
    }
    expect(w.ball.wy).toBe(wy);
  });
  test("the judgement is generous: a ball well off the blade's middle is still struck", () => {
    expect(s.REACH).toBeGreaterThan(s.BLADE * 3);
    expect(s.REACH_Y).toBeGreaterThan(s.BLADE * 3.5);
  });
  test("a fair drive lands on the computer's side", () => {
    for (const vz of [0, -3, -6]) {
      const w = rally(9, 0, ball(0.1, 0.25, s.HALF_L + 0.05), s.swingShot(world, 0, paddle(0, vz), 0.02, 0, false));
      const seen = run(w, "normal", 3, (e) => e.kind === "bounce" || e.kind === "point");
      expect(seen.at(-1)).toMatchObject({ kind: "bounce", side: 1 });
    }
  });
});

describe("table tennis: stepping aside", () => {
  /** The computer's ball sent to me at `tx` across; I stand still, and the world is followed slice by slice. */
  const coming = (tx: number) => {
    const w = s.createWorld(5);
    w.hands[0] = { x: 0, z: s.HALF_L + 0.6 };
    w.ball = ball(0, 0.25, -s.HALF_L - 0.2);
    s.launch(w, 1, { tx, depth: 0.8, pace: 5.5, top: 60, side: 0 });
    return w;
  };
  test("I step the more the wider the ball will come, toward its side, and little for one in the middle", () => {
    expect(Math.abs(s.leanFor(0.1))).toBeLessThan(0.05);
    expect(s.leanFor(0.4)).toBeLessThan(s.leanFor(0.8));
    expect(s.leanFor(-0.8)).toBeCloseTo(-s.leanFor(0.8), 9);
    expect(s.leanFor(3)).toBe(s.LEAN_MAX);
    const wide = coming(0.72),
      middle = coming(0.02);
    expect(wide.stanceGoal).toBeGreaterThan(0.4);
    expect(Math.abs(middle.stanceGoal)).toBeLessThan(0.05);
    expect(coming(-0.72).stanceGoal).toBeLessThan(-0.4);
  });
  test("the step is eased: no jump, no overshoot, mostly there when the ball arrives, and back in the middle after the point", () => {
    const w = coming(0.72),
      goal = w.stanceGoal;
    let last = w.stance,
      most = 0,
      arrived = NaN;
    for (let k = 0; k < 240 * 4; k++) {
      s.step(w, "normal");
      most = Math.max(most, Math.abs(w.stance - last));
      last = w.stance;
      expect(w.stance).toBeLessThanOrEqual(goal + 1e-9);
      if (Number.isNaN(arrived) && w.ball.z >= s.HALF_L + 0.15) arrived = w.stance;
    }
    // Never more than about 1.6 m/s, so the eye glides.
    expect(most / s.DT).toBeLessThan(1.7);
    expect(arrived).toBeGreaterThan(goal * 0.85);
    // The ball went by me: the point is over, and I am back behind the middle.
    expect(w.phase).toBe("dead");
    expect(Math.abs(w.stance)).toBeLessThan(0.02);
  });
  test("my reach widens toward the side I have stepped to, and only that side", () => {
    expect(s.keep(0, 3, s.HALF_L).x).toBeCloseTo(s.HALF_W + 0.6, 9);
    expect(s.keep(0, 3, s.HALF_L, undefined, 0.5).x).toBeCloseTo(s.HALF_W + 1.1, 9);
    expect(s.keep(0, -3, s.HALF_L, undefined, 0.5).x).toBeCloseTo(-s.HALF_W - 0.6, 9);
    const w = coming(0.72);
    for (let k = 0; k < 120; k++) s.step(w, "normal");
    w.hands[0] = { x: 2.5, z: s.HALF_L + 0.6 };
    s.step(w, "normal");
    expect(w.paddles[0].x).toBeGreaterThan(s.HALF_W + 0.6 + 0.2);
  });
  test("a lean of a half (less motion) steps half as far", () => {
    const full = coming(0.72),
      half = coming(0.72);
    half.lean = 0.5;
    for (let k = 0; k < 150; k++) {
      s.step(full, "normal");
      s.step(half, "normal");
    }
    expect(half.stance).toBeCloseTo(full.stance / 2, 6);
  });
  test("the step aside is not taken for a swing: standing still while stepping sends the ball straight on", () => {
    const w = s.createWorld(1);
    w.ball = ball(0, 0.25, s.HALF_L, 0, 0, 4);
    w.stanceV = 1.4;
    const shot = s.swingShot(w, 0, { x: 0, y: 0.25, z: s.HALF_L + 0.05, vx: 1.4, vy: 0, vz: 0 }, 0, 0, false);
    expect(shot.side).toBeCloseTo(0, 9);
    expect(shot.tx).toBeCloseTo(0, 9);
  });
});

describe("table tennis: the computer", () => {
  /** Balls I send to the computer, and how many of them it puts back on my side. */
  function returns(level: s.Level, attack: boolean) {
    let back = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const w = s.createWorld(seed * 7 + 3),
        rnd = () => s.rand(w);
      w.hands[0] = { x: 1.3, z: s.HALF_L + 0.6 };
      w.paddles[0].x = 1.3;
      w.ball = ball((rnd() - 0.5) * 0.6, 0.25, s.HALF_L + 0.15);
      s.launch(
        w,
        0,
        attack
          ? { tx: (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd() * 0.25), depth: 0.7 + rnd() * 0.2, pace: 6.5 + rnd() * 2, top: 150 * rnd(), side: 0 }
          : { tx: (rnd() - 0.5) * 0.6, depth: 0.55 + rnd() * 0.2, pace: 4 + rnd(), top: 60 * rnd(), side: 0 },
      );
      w.steer = null;
      const seen = run(w, level, 6, (e) => e.kind === "point" || (e.kind === "bounce" && e.side === 0 && w.hitter === 1));
      if (seen.at(-1)?.kind === "bounce") back++;
    }
    return back / 40;
  }
  test("it returns a fair share of simple balls at every level, more the harder it is", () => {
    const easy = returns("easy", false),
      normal = returns("normal", false),
      hard = returns("hard", false);
    expect(easy).toBeGreaterThanOrEqual(0.5);
    expect(easy).toBeLessThan(0.95);
    expect(normal).toBeGreaterThanOrEqual(0.8);
    expect(hard).toBeGreaterThanOrEqual(0.85);
  });
  test("quick, wide balls beat the easy computer far more often than the hard one", () => {
    const easy = returns("easy", true),
      hard = returns("hard", true);
    expect(easy).toBeLessThan(0.3);
    expect(hard).toBeGreaterThan(0.6);
    expect(hard - easy).toBeGreaterThan(0.4);
  });
});

describe("table tennis: the fixed-step table", () => {
  test("the same hand on the same seed plays out exactly the same", () => {
    const play = () => {
      const world = s.createWorld(77),
        log: string[] = [];
      s.serve(world, 1);
      for (let k = 0; k < 240 * 12; k++) {
        // A hand that sways across and back, and serves when it is its turn.
        world.hands[0] = { x: Math.sin(k / 90) * 0.5, z: s.HALF_L + 0.3 + Math.sin(k / 37) * 0.2 };
        for (const e of s.step(world, "normal")) log.push(JSON.stringify(e));
        if (world.phase === "dead" && world.dead > 1) s.serve(world, (1 - world.server) as 0 | 1);
        if (world.phase === "ready" && world.server === 0) s.toss(world);
      }
      return { log, ball: { ...world.ball }, paddles: JSON.stringify(world.paddles), seed: world.seed };
    };
    const a = play(),
      b = play();
    expect(a.log.length).toBeGreaterThan(10);
    expect(a.log.some((e) => e.includes('"point"'))).toBe(true);
    expect(b).toEqual(a);
  });
});

describe("table tennis: low balls and the hardest computer's smash", () => {
  /** The computer's return from a ball at its end, and how high it rises in flight and after its bounce on my side. */
  const returned = (seed: number, level: s.Level, y?: number) => {
    const world = s.createWorld(seed),
      rnd = () => s.rand(world);
    world.ball = ball((rnd() - 0.5) * 1.2, y ?? 0.05 + rnd() * 0.35, -s.HALF_L - 0.1 - rnd() * 0.4, 0, 0, 3);
    const shot = s.computerShot(world, level);
    s.launch(world, 1, shot);
    let flight = 0,
      after = 0;
    for (let k = 0; k < world.pathLen; k++) {
      const [py, pz, mine] = [world.path[k * 4 + 1], world.path[k * 4 + 2], world.path[k * 4 + 3] % 8];
      if (mine === 0 && pz < 0) flight = Math.max(flight, py);
      if (mine >= 2 || pz > s.HALF_L + 0.6) break;
      if (mine === 1) after = Math.max(after, py);
    }
    return { shot, flight, after };
  };
  test("no level loops the ball high: the flight stays low and it sits up little after its bounce", () => {
    for (const level of ["easy", "normal", "hard"] as s.Level[]) {
      const tops = Array.from({ length: 200 }, (_, k) => returned(k + 1, level)).filter((x) => x.after > 0);
      const after = tops.map((x) => x.after).sort((a, b) => a - b),
        flight = tops.map((x) => x.flight).sort((a, b) => a - b);
      expect(after[Math.floor(after.length * 0.9)]).toBeLessThan(0.4);
      expect(flight[Math.floor(flight.length * 0.9)]).toBeLessThan(s.FLIGHT_TOP + 0.15);
    }
  });
  test("a slow stroke is sent flatter rather than looped", () => {
    const from = { x: 0, y: 0.2, z: -s.HALF_L - 0.2 },
      top = (b: s.Ball) => {
        let y = b.y;
        for (let k = 0; k < 400 && b.z < 0; k++) {
          s.advanceBall(b);
          y = Math.max(y, b.y);
        }
        return y;
      };
    const slow = s.aimed(from, 1, { tx: 0, depth: 0.8, pace: 3, top: 0, side: 0 });
    expect(top({ ...slow })).toBeLessThan(s.FLIGHT_TOP + 0.02);
    expect(Math.hypot(slow.vx, slow.vz)).toBeGreaterThan(3);
  });
  test("the hardest computer smashes a ball that sits up, and sometimes one that does not; the easiest never", () => {
    const high = Array.from({ length: 100 }, (_, k) => returned(k + 1, "hard", 0.34).shot),
      plain = Array.from({ length: 200 }, (_, k) => returned(k + 1, "hard", 0.2).shot),
      easy = Array.from({ length: 100 }, (_, k) => returned(k + 1, "easy", 0.34).shot);
    const smashes = (shots: s.Shot[]) => shots.filter((x) => x.smash).length;
    expect(smashes(high)).toBeGreaterThan(45);
    expect(smashes(plain)).toBeGreaterThan(5);
    expect(smashes(plain)).toBeLessThan(50);
    expect(smashes(easy)).toBe(0);
    for (const shot of high.filter((x) => x.smash)) expect(shot.pace).toBeGreaterThan(7);
  });
});

describe("table tennis: the match", () => {
  test("the serve changes every two points, and every point from 10 all", () => {
    let state = r.createGame(1);
    // The computer serves first in the first game.
    const servers: number[] = [];
    for (let k = 0; k < 8; k++) {
      servers.push(r.serverOf(state));
      state = point(state, (k % 2) as 0 | 1);
    }
    expect(servers).toEqual([1, 1, 0, 0, 1, 1, 0, 0]);
    state = { ...state, score: [10, 10] };
    const deuce: number[] = [];
    for (let k = 0; k < 4; k++) {
      deuce.push(r.serverOf(state));
      state = point(state, (k % 2) as 0 | 1);
    }
    expect(deuce).toEqual([1, 0, 1, 0]);
    expect(state.score).toEqual([12, 12]);
  });
  test("a game is eleven points, two clear; the next game opens with the other server", () => {
    let state = r.createGame(3, 11);
    for (let k = 0; k < 10; k++) state = point(state, 0);
    for (let k = 0; k < 10; k++) state = point(state, 1);
    expect(r.deuce(state)).toBe(true);
    state = point(state, 0);
    expect(state.score).toEqual([11, 10]);
    expect(state.games).toEqual([0, 0]);
    state = point(state, 1);
    state = point(state, 0);
    state = point(state, 0);
    expect(state.games).toEqual([1, 0]);
    expect(state.done).toEqual([[13, 11]]);
    expect(state.score).toEqual([0, 0]);
    expect(r.gameNumber(state)).toBe(2);
    expect(r.serverOf(state)).toBe(0);
    // 11 to 9 is won at once.
    for (let k = 0; k < 9; k++) state = point(state, 1);
    for (let k = 0; k < 11; k++) state = point(state, 0);
    expect(state.winner).toBe(0);
    expect(state.games).toEqual([2, 0]);
    expect(r.play(state, { from: -1, to: 0, extra: s.MISSED })).toBeNull();
    expect(r.tableTennis.reason(state)).toMatch(/^게임 스코어 2 대 0로 이겼습니다/);
  });
  test("three games go to seven, deuce at 6 all; a single game goes to eleven; a bad move is refused", () => {
    let state = r.tableTennis.create("3");
    expect([state.best, state.points]).toEqual([3, 7]);
    for (let k = 0; k < 6; k++) state = point(point(state, 0), 1);
    expect(r.deuce(state)).toBe(true);
    // From 6 all the serve changes every point.
    const servers: number[] = [];
    for (let k = 0; k < 4; k++) {
      servers.push(r.serverOf(state));
      state = point(state, (k % 2) as 0 | 1);
    }
    expect(servers).toEqual([1, 0, 1, 0]);
    state = point(point(state, 1), 1);
    expect(state.done).toEqual([[8, 10]]);
    const game = (to: 0 | 1) => {
      for (let k = 0; k < 7; k++) state = point(state, to);
    };
    game(0);
    expect(state.winner).toBeNull();
    expect(r.gameNumber(state)).toBe(3);
    game(1);
    expect(state.winner).toBe(1);
    expect(state.games).toEqual([1, 2]);
    let single = r.tableTennis.create("1");
    expect([single.best, single.points]).toEqual([1, 11]);
    for (let k = 0; k < 10; k++) single = point(point(single, 0), 1);
    expect(r.deuce(single)).toBe(true);
    single = point(point(single, 0), 0);
    expect(single.winner).toBe(0);
    expect(r.tableTennis.reason(single)).toMatch(/^12 대 10로 이겼습니다/);
    expect(r.play(r.createGame(3), { from: 0, to: 0, extra: -1 })).toBeNull();
    expect(r.play(r.createGame(3), { from: -1, to: 2, extra: -1 })).toBeNull();
    expect(r.play(r.createGame(3), { from: -1, to: 0, extra: 99 })).toBeNull();
    expect(r.tableTennis.create("5").best).toBe(1);
  });
});

describe("table tennis: the contact marker, the paddle under the finger and the high reach", () => {
  const GAP = s.BALL + s.FACE;
  /** The computer's ball sent to me with `shot` from its end; my hand at `hand`. */
  const sent = (shot: s.Shot, hand = { x: 0.3, z: s.HALF_L + 0.35 }) => {
    const w = s.createWorld(5);
    w.hands[0] = { ...hand };
    w.ball = ball(0, 0.25, -s.HALF_L - 0.2);
    s.launch(w, 1, shot);
    return w;
  };
  /** A hand on the line of sight from `eye` that has the blade meet the coming ball in the middle of its face (found by a few rounds, as the meeting moves with the hand). */
  const aimedHand = (w: s.World, eye: s.Sight, z: number) => {
    w.sight = eye;
    w.hands[0] = s.handFor(eye, { x: 0, z }, 0.3);
    for (let round = 0; round < 6; round++) {
      const c = s.contact(w)!,
        blade = s.alongSight(eye, w.hands[0], c.y);
      w.hands[0] = s.handFor(eye, { x: c.x, z: blade.z }, c.y);
    }
    return w.hands[0];
  };
  /** Steps until my stroke, keeping the hand as it is; returns the marker's first and last predictions and where the ball was met. */
  const meet = (w: s.World, follow = false) => {
    const first = s.contact(w)!;
    let last = first,
      most = 0,
      met: s.Ball | null = null,
      landed: number | null = null,
      speed = NaN,
      face = NaN;
    for (let k = 0; k < 240 * 4 && landed === null; k++) {
      const c = s.contact(w);
      if (c) {
        most = Math.max(most, Math.hypot(c.x - first.x, c.y - first.y, c.z - first.z));
        last = c;
        if (follow) w.hands[0] = { ...w.hands[0], x: c.x };
      }
      for (const e of s.step(w, "normal")) {
        if (e.kind === "hit" && e.side === 0 && !met) [met, speed, face] = [{ ...w.ball }, Math.hypot(w.paddles[0].vx, w.paddles[0].vz), w.paddles[0].z - GAP];
        else if (e.kind === "bounce" && met && landed === null) landed = e.side;
        else if (e.kind === "point" && landed === null) landed = -1 - e.to;
      }
    }
    return { first, last, most, met, landed, speed, face };
  };
  test("the marker's predicted point is where the ball is met", () => {
    // The hand following the marker across, the blade at the hand: met exactly where the marker said, a slice's way at most.
    for (const shot of [
      { tx: 0.15, depth: 0.8, pace: 5, top: 60, side: 0 },
      { tx: -0.4, depth: 0.7, pace: 6, top: 120, side: 40 },
      { tx: 0.3, depth: 0.95, pace: 3.4, top: -60, side: 0 },
    ]) {
      const r = meet(sent(shot), true);
      expect(r.met, JSON.stringify(shot)).not.toBeNull();
      expect(Math.hypot(r.met!.x - r.last.x, r.met!.y - r.last.y, r.met!.z - r.last.z)).toBeLessThan(0.002);
    }
    // On the line of sight, the hand held still: the marker never moves while the ball comes, and the ball is met on it.
    const eye = { x: 0, y: 0.9, z: s.HALF_L + 1.35 },
      w = sent({ tx: 0.2, depth: 0.85, pace: 4.5, top: 40, side: 0 });
    // (Back from the end line, where the ball has risen off the table: met lower, the ring stands at the blade's lowest.)
    aimedHand(w, eye, s.HALF_L + 0.5);
    const r = meet(w);
    expect(r.most).toBeLessThan(1e-6);
    expect(r.met).not.toBeNull();
    expect(Math.hypot(r.met!.x - r.first.x, r.met!.y - r.first.y, r.met!.z - r.first.z)).toBeLessThan(0.002);
    // The marker is at the face of the blade: the ball's middle one ball and the face's half-thickness before it.
    expect(r.met!.z).toBeCloseTo(r.face, 6);
  });
  test("a lob coming up to 1.1 m is returned by a paddle held where the marker shows", () => {
    const lob = { tx: 0.2, depth: 1, pace: 3, top: 0, side: 0, loop: true };
    const plain = sent(lob, { x: 0.2, z: s.HALF_L + 0.48 });
    expect(s.highest(plain)).toBeGreaterThan(1.05);
    const c = s.contact(plain)!;
    // Too high for the blade's old top (0.62): it would have passed over it.
    expect(c.y).toBeGreaterThan(s.THEIR_TOP + s.REACH_Y);
    expect(c.y).toBeLessThanOrEqual(s.REACH_TOP);
    const r = meet(plain, true);
    expect(r.met!.y).toBeGreaterThan(1);
    expect(r.landed).toBe(1);
    // The same with the eye raised for it, as the view does, the hand on the line of sight through the marker.
    const camera = new PerspectiveCamera(50, 1.5, 0.05, 100),
      w = sent(lob);
    rallyCamera(camera, 1.5, 0, liftFor(s.highest(w)));
    const eye = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    expect(eye.y).toBeGreaterThan(s.highest(w) + s.SIGHT_GAP);
    aimedHand(w, eye, s.HALF_L + 0.45);
    const high = meet(w);
    expect(high.met!.y).toBeGreaterThan(1);
    expect(high.landed).toBe(1);
    // Held still, the blade only rose along the line of sight: no swing, so a gentle block, neither a smash nor a cut.
    expect(high.speed).toBeLessThan(0.05);
    // A player who points at the ball's way where it will be high (seen from the eye, it rises to the pointer after
    // its bounce, or comes down past it): wherever the marker then shows, the ball is met there, high up.
    let highest = 0;
    for (const depth of [s.HALF_L + 0.2, s.HALF_L + 0.3, s.HALF_L + 0.4, s.HALF_L + 0.5]) {
      const v = sent(lob);
      v.sight = eye;
      let k = Math.max(0, v.pathAt + 1);
      while (!(v.path[k * 4 + 3] % 8 >= 1 && v.path[k * 4 + 2] >= depth - GAP)) k++;
      v.hands[0] = s.handFor(eye, { x: v.path[k * 4], z: depth }, v.path[k * 4 + 1]);
      const c = s.contact(v);
      expect(c, `${depth}`).not.toBeNull();
      const r = meet(v);
      expect(Math.hypot(r.met!.x - c!.x, r.met!.y - c!.y, r.met!.z - c!.z), `${depth}`).toBeLessThan(0.01);
      expect(r.landed, `${depth}`).toBe(1);
      highest = Math.max(highest, r.met!.y);
    }
    expect(highest).toBeGreaterThan(0.95);
  });
  test("the blade stays under the same point of the screen whatever height it is raised to", () => {
    const camera = new PerspectiveCamera(50, 1.5, 0.05, 100),
      ray = new Raycaster(),
      plane = new Plane(new Vector3(0, 1, 0), -HAND_Y),
      hand = new Vector3();
    for (const lift of [0, 0.3, liftFor(s.REACH_TOP)]) {
      rallyCamera(camera, 1.5, 0.2, lift);
      const eye = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      for (const [nx, ny] of [
        [0, -0.6],
        [0.5, -0.3],
        [-0.7, -0.8],
        [0.2, -0.05],
      ]) {
        ray.setFromCamera(new Vector2(nx, ny), camera);
        if (!ray.ray.intersectPlane(plane, hand)) continue;
        for (const y of [0.06, 0.2, 0.5, 0.9, 1.2]) {
          if (y > eye.y - s.SIGHT_GAP) continue;
          const blade = alongSight(eye, { x: hand.x, z: hand.z }, y),
            seen = new Vector3(blade.x, y, blade.z).project(camera);
          expect(seen.x, `${lift} ${nx},${ny} ${y}`).toBeCloseTo(nx, 9);
          expect(seen.y, `${lift} ${nx},${ny} ${y}`).toBeCloseTo(ny, 9);
          // `handFor` undoes it.
          const back = handFor(eye, blade, y);
          expect(back.x).toBeCloseTo(hand.x, 9);
          expect(back.z).toBeCloseTo(hand.z, 9);
        }
      }
    }
    // Raised for the highest ball, the eye still sees it where it will be met, in the middle of the view (below the
    // scoreboard at the top), and the far end of the table; unraised, it is the eye it was.
    for (const aspect of [1.0, 1.5, 2.2]) {
      rallyCamera(camera, aspect, 0, liftFor(s.REACH_TOP));
      const high = new Vector3(0.3, s.REACH_TOP, s.HALF_L + 0.45).project(camera),
        far = new Vector3(0, 0, -s.HALF_L).project(camera);
      expect(high.y, `${aspect}`).toBeLessThan(0.55);
      expect(high.y, `${aspect}`).toBeGreaterThan(-0.3);
      expect(Math.abs(far.y), `${aspect}`).toBeLessThan(0.9);
    }
    rallyCamera(camera, 1.5, 0, 0);
    expect(camera.position.y).toBeCloseTo(EYE.y, 9);
    // Raised for the highest ball, the eye stays above the blade by more than the line of sight needs.
    expect(EYE.y + liftFor(s.REACH_TOP)).toBeGreaterThan(s.REACH_TOP + s.SIGHT_GAP);
    expect(liftFor(0.2)).toBe(0);
  });
  test("a quick sideways swing seen to pass through the ball strikes it, a little before or after it comes to the face", () => {
    const V = 14,
      z = s.HALF_L + 0.35,
      /** A sweep across at V m/s whose blade passes the ball's place `shift` slices after the ball comes to the face. */
      sweep = (shift: number) => {
        const w = sent({ tx: 0.1, depth: 0.8, pace: 5, top: 60, side: 0 }, { x: -1, z }),
          c = s.contact(w)!,
          cross = c.k;
        const xAt = (j: number) => c.x + V * s.DT * (j - cross - shift);
        let hit: { j: number; off: number } | null = null;
        for (let j = 0; j < 240 * 2 && !hit; j++) {
          w.hands[0] = { x: xAt(j), z };
          for (const e of s.step(w, "normal")) if (e.kind === "hit" && e.side === 0) hit = { j, off: Math.abs(xAt(cross) - c.x) };
        }
        return { hit, off: Math.abs(xAt(cross) - c.x), w };
      };
    for (const shift of [-6, -3, 3, 6]) {
      const r = sweep(shift);
      expect(r.hit, `${shift}`).not.toBeNull();
      // Where the ball came to the face the blade was wider of it than the reach.
      if (Math.abs(shift) === 6) expect(r.off).toBeGreaterThan(s.REACH);
      // Struck while sweeping across at that speed: a smash, sent across the way of the swing.
      expect(r.w.ball.vx).toBeGreaterThan(0);
    }
    // A sweep well before the ball came, or well after it had gone, does not.
    for (const shift of [-14, 14]) expect(sweep(shift).hit, `${shift}`).toBeNull();
  });
});
