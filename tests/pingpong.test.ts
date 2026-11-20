import { describe, expect, test } from "vitest";
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
    // Wait for the ball to come down to the blade, which stays at its one height, then swing the paddle forward through it.
    let k = 0;
    while ((world.ball.vy > 0 || world.ball.y > s.HAND_Y + 0.08) && k++ < 400) {
      s.step(world, "normal");
      expect(world.paddles[0].y).toBe(s.HAND_Y);
    }
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
    const short = rally(6, 1, ball(0, 0.3, -s.HALF_L - 0.2), { tx: 0, depth: 0.3, pace: 2.6, top: -40, side: 0 });
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
    // A wild swing goes long.
    expect(s.swingShot(world, 0, paddle(0, -16), 0, 0, false).depth).toBeGreaterThan(1);
  });
  test("where the ball meets the blade aims it, and a sideways swing spins it", () => {
    expect(s.swingShot(world, 0, paddle(0, 0), -0.08, 0, false).tx).toBeLessThan(-0.3);
    expect(s.swingShot(world, 0, paddle(0, 0), 0.08, 0, false).tx).toBeGreaterThan(0.3);
    expect(s.swingShot(world, 0, paddle(2, 0), 0, 0, false).side).not.toBe(0);
  });
  test("a fair drive lands on the computer's side", () => {
    for (const vz of [0, -3, -6]) {
      const w = rally(9, 0, ball(0.1, 0.25, s.HALF_L + 0.05), s.swingShot(world, 0, paddle(0, vz), 0.02, 0, false));
      const seen = run(w, "normal", 3, (e) => e.kind === "bounce" || e.kind === "point");
      expect(seen.at(-1)).toMatchObject({ kind: "bounce", side: 1 });
    }
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

describe("table tennis: one height for the blades, stepping back for a high ball", () => {
  /** A high, slow, deep ball from the computer: it bounces on my half and rises far over the blades. */
  const lob = (seed: number) => {
    const world = s.createWorld(seed);
    world.hands[0] = { x: 1.3, z: s.HALF_L + 0.35 };
    world.paddles[0].x = 1.3;
    world.ball = ball(0, 0.3, -s.HALF_L - 0.3);
    s.launch(world, 1, { tx: 0, depth: 0.9, pace: 3, top: 0, side: 0 });
    return world;
  };
  /** Where the lob comes down to the blades' height behind my end: the first slice after its bounce on its way down there. */
  const comingDown = (world: s.World) => {
    for (let k = 1; k < world.pathLen; k++) {
      const y = world.path[k * 4 + 1];
      if (world.path[k * 4 + 3] % 8 === 1 && y < world.path[(k - 1) * 4 + 1] && y <= s.HAND_Y && world.path[k * 4 + 2] > s.HALF_L) return { x: world.path[k * 4], z: world.path[k * 4 + 2] };
    }
    throw new Error("the lob never came down");
  };
  test("neither paddle ever rises or drops: through serves, tosses and rallies they stay at the blades' height", () => {
    const world = s.createWorld(31);
    s.serve(world, 1);
    let points = 0;
    for (let k = 0; k < 240 * 30; k++) {
      world.hands[0] = { x: world.ball.x + Math.sin(k / 50) * 0.05, z: s.HALF_L + 0.3 + Math.sin(k / 41) * 0.25 };
      for (const e of s.step(world, "hard")) if (e.kind === "point") points++;
      for (const pad of world.paddles) {
        expect(pad.y).toBe(s.HAND_Y);
        expect(pad.vy).toBe(0);
      }
      if (world.phase === "dead" && world.dead > 1) s.serve(world, (1 - world.server) as 0 | 1);
      if (world.phase === "ready" && world.server === 0) s.toss(world);
    }
    expect(points).toBeGreaterThanOrEqual(3);
  });
  test("a high ball lets me step back, and stepping back I return it where it has come down to the blade", () => {
    const world = lob(11);
    // The lob rises well over the blades, so my reach may go back: as far as where it comes down to them, and a little more.
    expect(world.deep[0]).toBeGreaterThan(0.2);
    const down = comingDown(world);
    expect(down.z).toBeGreaterThan(s.HALF_L + s.BACK + 0.1);
    expect(s.HALF_L + s.BACK + world.deep[0]).toBeGreaterThan(down.z + s.BALL + s.FACE);
    // My hand waits there, behind the ball's line; the reach walks back to it and the paddle meets the ball.
    const seen: s.Happening[] = [];
    for (let k = 0; k < 4 / s.DT && !seen.some((e) => e.kind === "hit" || e.kind === "point"); k++) {
      world.hands[0] = { x: down.x, z: down.z + 0.06 };
      expect(world.stepped[0]).toBeLessThanOrEqual(world.deep[0] + 1e-9);
      seen.push(...s.step(world, "normal"));
      expect(world.paddles[0].y).toBe(s.HAND_Y);
    }
    expect(seen.find((e) => e.kind === "hit" || e.kind === "point")).toMatchObject({ kind: "hit", side: 0 });
    expect(world.paddles[0].z).toBeGreaterThan(s.HALF_L + s.BACK + 0.05);
    // Struck back, the ball needs no more stepping back: my reach walks forward again, never at once.
    expect(world.deep[0]).toBe(0);
    const was = world.stepped[0];
    s.step(world, "normal");
    expect(world.stepped[0]).toBeLessThan(was);
    expect(was - world.stepped[0]).toBeLessThanOrEqual(s.STEP_IN * s.DT + 1e-9);
  });
  test("without stepping back the same lob passes over a paddle held at the end of the usual reach", () => {
    const world = lob(11),
      down = comingDown(world);
    const seen: s.Happening[] = [];
    for (let k = 0; k < 4 / s.DT && !seen.some((e) => e.kind === "point"); k++) {
      world.deep = [0, 0];
      world.hands[0] = { x: down.x, z: down.z + 0.06 };
      seen.push(...s.step(world, "normal"));
      expect(world.paddles[0].z).toBeLessThanOrEqual(s.HALF_L + s.BACK + 1e-9);
    }
    expect(seen.some((e) => e.kind === "hit" && e.side === 0)).toBe(false);
    expect(seen.at(-1)).toMatchObject({ kind: "point", to: 1 });
  });
  test("a low ball needs no step, and the reach is back to the usual when a point is served", () => {
    const low = s.createWorld(3);
    low.ball = ball(0, 0.25, -s.HALF_L - 0.2);
    s.launch(low, 1, { tx: 0, depth: 0.7, pace: 7, top: 120, side: 0 });
    expect(low.deep[0]).toBe(0);
    const world = lob(11);
    for (let k = 0; k < 120; k++) s.step(world, "normal");
    expect(world.stepped[0]).toBeGreaterThan(0);
    s.serve(world, 0);
    expect(world.deep).toEqual([0, 0]);
  });
  test("the computer steps back for my high balls too, and returns them", () => {
    let high = 0,
      back = 0,
      deep = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const world = s.createWorld(seed * 13 + 1);
      world.hands[0] = { x: 1.3, z: s.HALF_L + 0.6 };
      world.paddles[0].x = 1.3;
      world.ball = ball((s.rand(world) - 0.5) * 0.4, 0.3, s.HALF_L + 0.2);
      // A topspin lob: it comes down deep and kicks on high.
      s.launch(world, 0, { tx: (s.rand(world) - 0.5) * 0.5, depth: 0.85 + s.rand(world) * 0.1, pace: 2.6 + s.rand(world) * 0.8, top: 120 + s.rand(world) * 80, side: 0 });
      if (world.deep[1] <= 0) continue;
      high++;
      const seen = run(world, "hard", 6, (e) => e.kind === "point" || (e.kind === "hit" && e.side === 1));
      if (seen.at(-1)?.kind !== "hit") continue;
      back++;
      if (world.paddles[1].z < -s.HALF_L - s.FAR_BACK) deep++;
      expect(world.paddles[1].y).toBe(s.HAND_Y);
    }
    expect(high).toBeGreaterThanOrEqual(10);
    expect(back / high).toBeGreaterThanOrEqual(0.7);
    expect(deep).toBeGreaterThan(0);
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

describe("table tennis: the match", () => {
  test("the serve changes every two points, and every point from 10 all", () => {
    let state = r.createGame(3);
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
    let state = r.createGame(3);
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
  test("best of five needs three games; a bad move is refused", () => {
    let state = r.createGame(5);
    const game = (to: 0 | 1) => {
      for (let k = 0; k < 11; k++) state = point(state, to);
    };
    game(1);
    game(0);
    game(1);
    game(0);
    expect(state.winner).toBeNull();
    expect(r.gameNumber(state)).toBe(5);
    game(1);
    expect(state.winner).toBe(1);
    expect(state.games).toEqual([2, 3]);
    expect(r.play(r.createGame(3), { from: 0, to: 0, extra: -1 })).toBeNull();
    expect(r.play(r.createGame(3), { from: -1, to: 2, extra: -1 })).toBeNull();
    expect(r.play(r.createGame(3), { from: -1, to: 0, extra: 99 })).toBeNull();
    expect(r.tableTennis.create("5").best).toBe(5);
    expect(r.tableTennis.create("3").best).toBe(3);
  });
});
