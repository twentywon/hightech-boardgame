import { describe, expect, test } from "vitest";
import * as R from "../src/games/badminton/rules";
import * as S from "../src/games/badminton/sim";
import { powerOf, yawOf } from "../src/games/badminton/layout";

/** Steps the world until `until` holds or `seconds` pass; the happenings on the way. */
function run(w: S.World, seconds: number, until: (w: S.World, h: S.Happening[]) => boolean = () => false, level: S.Level = "normal") {
  const all: S.Happening[] = [];
  for (let t = 0; t < seconds; t += S.DT) {
    const h = S.step(w, level);
    all.push(...h);
    if (until(w, h)) break;
  }
  return all;
}
/** The power that sends the shuttle from where it is now to `depth` past the net (for my player in these tests). */
function aimed(w: S.World, depth: number) {
  let low = 0,
    high = S.MOST;
  for (let k = 0; k < 24; k++) {
    const p = (low + high) / 2,
      v = S.speedOf(p),
      e = S.elevationOf(w.shuttle.y),
      end = S.landing({ ...w.shuttle, vx: 0, vy: v * Math.sin(e), vz: -v * Math.cos(e) });
    if (end.net || end.z > -depth) low = p;
    else high = p;
  }
  return low;
}
const points = (h: S.Happening[]) => h.filter((e): e is Extract<S.Happening, { kind: "point" }> => e.kind === "point");

describe("badminton rules", () => {
  test("rally scoring: the winner of a point serves the next, from the right court when its score is even", () => {
    let s = R.createGame(1, 11);
    expect(R.serverOf(s)).toBe(0);
    expect(R.fromRight(s)).toBe(true);
    s = R.play(s, { from: -1, to: 1, extra: S.OUT })!;
    expect(R.serverOf(s)).toBe(1);
    expect(R.fromRight(s)).toBe(false);
    s = R.play(s, { from: -1, to: 1, extra: S.WON })!;
    expect(R.fromRight(s)).toBe(true);
  });
  test("a game is won by two, but no further than the cap (15 for 11, 30 for 21)", () => {
    let s = R.createGame(1, 11);
    for (let k = 0; k < 10; k++) s = R.play(R.play(s, { from: -1, to: 0, extra: 0 })!, { from: -1, to: 1, extra: 0 })!;
    expect(s.score).toEqual([10, 10]);
    s = R.play(s, { from: -1, to: 0, extra: 0 })!;
    expect(s.winner).toBeNull();
    for (let k = 0; k < 3; k++) s = R.play(R.play(s, { from: -1, to: 1, extra: 0 })!, { from: -1, to: 0, extra: 0 })!;
    expect(s.score).toEqual([14, 13]);
    s = R.play(s, { from: -1, to: 1, extra: 0 })!;
    expect(s.score).toEqual([14, 14]);
    s = R.play(s, { from: -1, to: 1, extra: 0 })!;
    expect(s.winner).toBe(1);
    expect(s.done[0]).toEqual([14, 15]);
    expect(R.capOf(21)).toBe(30);
  });
  test("best of three: games are kept and the match ends at two", () => {
    let s = R.createGame(3, 21);
    for (let g = 0; g < 2; g++) for (let k = 0; k < 21; k++) s = R.play(s, { from: -1, to: 0, extra: 0 })!;
    expect(s.games).toEqual([2, 0]);
    expect(s.winner).toBe(0);
    expect(R.badminton.reason(s)).toContain("이겼습니다");
    expect(R.badminton.create("21").points).toBe(21);
    expect(R.badminton.create("1").points).toBe(11);
  });
});

describe("badminton court", () => {
  test("a quicker swipe sends the shuttle harder and further, and a much quicker one long", () => {
    expect(powerOf(0.5)).toBe(0);
    expect(powerOf(4)).toBeLessThan(powerOf(7));
    let last = -Infinity;
    for (const p of [0.2, 0.4, 0.6, 0.8, 1, 1.2]) {
      const v = S.speedOf(p),
        e = S.elevationOf(2),
        end = S.landing({ x: 0, y: 2, z: 3.7, vx: 0, vy: v * Math.sin(e), vz: -v * Math.cos(e) });
      expect(end.net).toBe(false);
      expect(end.z).toBeLessThan(last === -Infinity ? 0 : last);
      last = end.z;
    }
    // From the middle of my half: a medium swipe lands deep in the far court, the hardest goes out over the back line.
    const at = (p: number) => {
      const v = S.speedOf(p),
        e = S.elevationOf(2);
      return S.landing({ x: 0, y: 2, z: 3.7, vx: 0, vy: v * Math.sin(e), vz: -v * Math.cos(e) }).z;
    };
    expect(at(0.65)).toBeLessThan(-S.HALF_L + 1.5);
    expect(at(0.65)).toBeGreaterThan(-S.HALF_L);
    expect(at(S.MOST)).toBeLessThan(-S.HALF_L);
    // A swipe leaning right aims right.
    expect(yawOf(40, -200)).toBeGreaterThan(0);
    expect(yawOf(-40, -200)).toBeLessThan(0);
  });
  test("my serve: a gentle swipe drops short into the diagonal service court and wins the point if left", () => {
    const w = S.createWorld(5);
    S.serve(w, 0, true);
    expect(w.players[0].x).toBeGreaterThan(0);
    expect(w.players[1].x).toBeLessThan(0);
    expect(S.swing(w, 0, 0.25, 0)).toBe(true);
    expect(w.phase).toBe("flying");
    expect(w.served).toBe(true);
    // The computer is told to leave it, to see where it lands.
    w.plan = { from: 0, leave: true, smash: false, miss: false };
    const end = S.landing(w.shuttle);
    expect(end.net).toBe(false);
    expect(S.goodServe(w, end.x, end.z)).toBe(true);
    const got = points(run(w, 6, (_, h) => h.some((e) => e.kind === "point")));
    expect(got[0].to).toBe(0);
  });
  test("a serve into the wrong court is a fault", () => {
    const w = S.createWorld(5);
    S.serve(w, 0, true);
    expect(S.goodServe(w, -1, -4)).toBe(true);
    expect(S.goodServe(w, 1, -4)).toBe(false);
    expect(S.goodServe(w, -1, -1.5)).toBe(false);
  });
  test("a smash is played only from a jump: the jump button, then the swipe in the air", () => {
    const w = S.createWorld(9);
    S.serve(w, 1, true);
    // A high shuttle coming down over my player.
    w.phase = "flying";
    w.hitter = 1;
    w.served = false;
    w.players[0].x = 0;
    w.players[0].z = 3;
    w.plan = null;
    w.shuttle = { x: 0.1, y: 4.5, z: 3.05, vx: 0, vy: -1, vz: 0 };
    expect(S.airborne(w, 0)).toBe(false);
    expect(S.jump(w, 0)).toBe(true);
    expect(S.airborne(w, 0)).toBe(true);
    // In the air, the swing is a smash.
    run(w, 0.15);
    S.swing(w, 0, 0.8, 0);
    expect(w.players[0].swing?.smash).toBe(true);
    const h = run(w, 1.2, (w) => w.hitter === 0);
    const hit = h.find((e) => e.kind === "hit");
    expect(hit && hit.kind === "hit" && hit.smash).toBe(true);
    // Fast and steeply down over the net.
    expect(w.shuttle.vy).toBeLessThan(0);
    expect(Math.hypot(w.shuttle.vx, w.shuttle.vy, w.shuttle.vz)).toBeGreaterThan(30);
    const end = S.landing(w.shuttle);
    expect(end.net).toBe(false);
    expect(end.z).toBeLessThan(0);
    // On the floor, the same swing is no smash.
    const v = S.createWorld(9);
    S.serve(v, 1, true);
    Object.assign(v, { phase: "flying", hitter: 1, served: false });
    S.swing(v, 0, 0.8, 0);
    expect(v.players[0].swing?.smash).toBe(false);
  });
  test("a shuttle into the net is the striker's point lost; one left to fall out is the striker's too", () => {
    const w = S.createWorld(3);
    S.serve(w, 1, true);
    Object.assign(w, { phase: "flying", hitter: 0, served: false, plan: { from: 0, leave: true, smash: false, miss: false } });
    w.shuttle = { x: 0, y: 1, z: 2, vx: 0, vy: 0, vz: -10 };
    const net = points(run(w, 4, (_, h) => h.some((e) => e.kind === "point")));
    expect(net[0]).toEqual({ kind: "point", to: 1, why: S.NET });
    const v = S.createWorld(3);
    S.serve(v, 1, true);
    Object.assign(v, { phase: "flying", hitter: 0, served: false, plan: { from: 0, leave: true, smash: false, miss: false } });
    v.shuttle = { x: 0, y: 2, z: 3.5, vx: 0, vy: 40, vz: -60 };
    const out = points(run(v, 6, (_, h) => h.some((e) => e.kind === "point")));
    expect(out[0]).toEqual({ kind: "point", to: 1, why: S.OUT });
  });
  test("the computer returns the shuttle, and a seeded rally plays the same each time", () => {
    const play = () => {
      const w = S.createWorld(42),
        log: string[] = [];
      S.serve(w, 1, true);
      for (let t = 0; t < 20 && log.length < 12; t += S.DT) {
        // My player swings whenever the shuttle comes into reach (a medium swipe).
        if (w.phase === "flying" && w.hitter === 1 && !w.players[0].swing && S.inReach(w, 0)) S.swing(w, 0, aimed(w, 4.5), 0);
        for (const e of S.step(w, "normal")) if (e.kind === "hit" || e.kind === "point") log.push(`${e.kind}:${"side" in e ? e.side : e.to}`);
        if (w.phase === "dead") break;
      }
      return log;
    };
    const a = play();
    expect(a.filter((e) => e === "hit:1").length).toBeGreaterThan(1);
    expect(a.filter((e) => e === "hit:0").length).toBeGreaterThan(0);
    expect(play()).toEqual(a);
  });
  test("my player runs to the shuttle by itself and the computer lets a shuttle go that is clearly out", () => {
    const w = S.createWorld(7);
    S.serve(w, 1, true);
    Object.assign(w, { phase: "flying", hitter: 1, served: false });
    w.shuttle = { x: -1.5, y: 2.2, z: -2, vx: -1.5, vy: 6, vz: 11 };
    const before = { ...w.players[0] };
    run(w, 0.6);
    expect(Math.hypot(w.players[0].x - before.x, w.players[0].z - before.z)).toBeGreaterThan(0.5);
    const v = S.createWorld(7);
    S.serve(v, 0, true);
    Object.assign(v, { phase: "flying", hitter: 0, served: false, plan: null });
    v.shuttle = { x: 0, y: 2, z: 3, vx: 0, vy: 30, vz: -55 };
    // My shot goes long: the computer does not touch it, and the point is its own.
    const h = run(v, 6, (_, h) => h.some((e) => e.kind === "point"), "hard");
    expect(h.some((e) => e.kind === "hit")).toBe(false);
    expect(points(h)[0]).toEqual({ kind: "point", to: 1, why: S.OUT });
  });
});
