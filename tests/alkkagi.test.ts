import { describe, expect, it } from "vitest";
import * as A from "../src/games/alkkagi/rules";
import * as S from "../src/games/alkkagi/physics";
import * as P from "../src/games/flick/physics";
import { seededRandom } from "../src/core/ai";

const frozen = (s: unknown) => JSON.stringify(s);
const stone = (id: number, x: number, z: number, r = 0.235, m = 1): S.Stone => ({ id, x, z, vx: 0, vz: 0, r, m, on: true, w: 0, a: 0, hop: 0 });
const GO = A.arenaOf("go"),
  JANGGI = A.arenaOf("janggi");
/** Runs a list of stones to rest on an open board with nothing round it (so that nothing falls). */
const wide: S.StoneArena = { ...GO, halfX: 40, halfZ: 40 };

describe("Alkkagi stones", () => {
  it("the same shot always ends the same way, turns and falls included, in the rules and in their replay", () => {
    const s: A.State = { ...A.createGame("go-3"), phase: "play", toPlace: [0, 0], discs: [stone(0, 0, 2), stone(1, 0.2, 0), stone(2, -0.3, -1.5), stone(3, 3, -4.2)], owners: [0, 1, 1, 1], labels: ["", "", "", ""] },
      move = { from: 0, to: P.shotCode(265, 15), extra: -1 };
    const a = A.play(s, move)!,
      b = A.play(s, move)!;
    expect(frozen(a)).toBe(frozen(b));
    // Stepping slice by slice, as the view replays a shot, comes to the very same stones.
    const live = P.copy(s.discs) as S.Stone[],
      shot = P.shotOf(move.to)!;
    P.strike(live[0], shot.angle, P.speedOf(shot.power));
    while (S.stirring(live)) S.stepStones(live, GO);
    for (const d of live) expect([d.on, d.x, d.z, d.a, d.fell]).toEqual([a.discs[d.id].on, a.discs[d.id].x, a.discs[d.id].z, a.discs[d.id].a, a.discs[d.id].fell]);
    // Somebody turned: a stone struck off its middle.
    expect(a.discs.some((d) => Math.abs(d.a ?? 0) > 0.01)).toBe(true);
  });
  it("a square knock turns nothing; a glancing one sets both stones turning, the same way round", () => {
    const square = [stone(0, -2, 0), stone(1, 0, 0)];
    P.strike(square[0], 0, 8);
    S.settleStones(square, wide);
    expect([Math.abs(square[0].a!) < 1e-9, Math.abs(square[1].a!) < 1e-9, square[1].x > 0.8]).toEqual([true, true, true]);
    // The struck stone sits a little to +z of the line: the knock grips at the touching edges as they slip.
    const glance = [stone(0, -2, 0), stone(1, 0, 0.25)];
    P.strike(glance[0], 0, 8);
    let first: [number, number] | null = null;
    while (S.stirring(glance)) {
      S.stepStones(glance, wide);
      if (!first && (glance[0].w || glance[1].w)) first = [glance[0].w!, glance[1].w!];
    }
    expect(first).not.toBeNull();
    expect(Math.sign(first![0])).toBe(Math.sign(first![1]));
    expect(Math.abs(first![1])).toBeGreaterThan(1);
    // Seen from above, the striker passes over the struck stone's far side going right and drags that edge along:
    // it turns clockwise, which is a negative turn (a positive one takes +x toward −z, as `rotation.y` does).
    expect(first![1]).toBeLessThan(0);
    // Glazed go stones grip less than wooden janggi pieces, and give back more of a knock.
    expect([GO.grip < JANGGI.grip, GO.bounce > JANGGI.bounce]).toEqual([true, true]);
  });
  it("a turning stone glides farther, and its slide and turn die together", () => {
    const plain = [stone(0, 0, 0)],
      spun = [stone(0, 0, 0)];
    P.strike(plain[0], 0, 5);
    P.strike(spun[0], 0, 5);
    spun[0].w = 30;
    S.settleStones(plain, wide);
    let stopped = -1,
      turnedTill = -1,
      n = 0;
    while (S.stirring(spun)) {
      S.stepStones(spun, wide);
      n++;
      if (stopped < 0 && spun[0].vx === 0) stopped = n;
      if (spun[0].w !== 0) turnedTill = n;
    }
    // Without a turn it slides v² / 2μ, as the flicked games always did.
    expect(plain[0].x).toBeCloseTo(25 / 24, 1);
    expect(spun[0].x).toBeGreaterThan(plain[0].x * 1.1);
    expect(Math.abs(stopped - turnedTill)).toBeLessThan(20);
  });
  it("a stone whose middle stays on the board stays; one whose middle goes over tips off and lies below", () => {
    const short = [stone(0, 3.8, 0)],
      over = [stone(0, 3.8, 0)];
    P.strike(short[0], 0, 4.7);
    P.strike(over[0], 0, 5.1);
    S.settleStones(short, GO);
    const { gone } = S.settleStones(over, GO);
    // Its edge hangs past the board, its middle does not.
    expect([short[0].on, short[0].x > 4.8 - short[0].r, short[0].x < 4.8, short[0].fell]).toEqual([true, true, true, undefined]);
    expect([gone, over[0].on, over[0].fell?.nx, over[0].fell?.nz]).toEqual([[0], false, 1, 0]);
    const track = S.fallTrack(over[0].fell!, GO.below),
      rest = track[track.length - 1];
    // A slow stone tips about the edge before it drops: its turn grows while its middle is still up by the board.
    const tipping = track.filter((p) => p.y > -0.2);
    expect(tipping.length).toBeGreaterThan(5);
    expect(tipping[tipping.length - 1].tip).toBeGreaterThan(0.3);
    // It lands on the floor beyond the edge, lying flat, and strikes it on the way.
    expect(rest.x).toBeGreaterThan(4.8);
    expect(rest.y).toBeCloseTo(A.FLOOR + over[0].fell!.h, 3);
    expect(Math.abs(Math.sin(rest.tip))).toBeLessThan(1e-6);
    expect(track.some((p) => (p.thud ?? 0) > 6)).toBe(true);
    expect(frozen(S.fallTrack(over[0].fell!, GO.below))).toBe(frozen(track));
    // It never comes to lie inside a bowl.
    for (const bowl of A.BOWLS) expect(Math.hypot(rest.x - bowl.x, rest.z - bowl.z)).toBeGreaterThanOrEqual(bowl.r);
  });
  it("a janggi piece pushed gently off lies on the table; one sent hard flies past it to the floor", () => {
    const gentle = [stone(0, 0, 4.3, 0.31, 1.5)],
      hard = [stone(0, 0, 4.3, 0.31, 1.5)];
    P.strike(gentle[0], Math.PI / 2, 5.6);
    P.strike(hard[0], Math.PI / 2, 15);
    S.settleStones(gentle, JANGGI);
    S.settleStones(hard, JANGGI);
    expect([gentle[0].on, hard[0].on]).toEqual([false, false]);
    expect(S.fallRest(gentle[0].fell!, JANGGI.below).y).toBeCloseTo(A.TABLE.y + JANGGI.thick, 3);
    expect(S.fallRest(hard[0].fell!, JANGGI.below).y).toBeCloseTo(A.FLOOR + JANGGI.thick, 3);
  });
  it("a stone that flew comes down with a small bounce and touches nothing meanwhile", () => {
    const pair = [stone(0, -2, 0), stone(1, 0, 0)];
    P.strike(pair[0], 0, 10);
    P.launch(pair[0], 0.3);
    let hopped = false;
    for (let i = 0; i < 60; i++) {
      S.stepStones(pair, wide);
      if (pair[0].hop) hopped = true;
    }
    expect([hopped, pair[1].x]).toEqual([true, 0]);
  });
  it("the computer still thinks a game through to the end, quickly enough", () => {
    for (const variant of ["go-5", "janggi"]) {
      const random = seededRandom(9);
      let s = A.createGame(variant);
      if (s.phase === "place") s = A.play(s, { from: -1, to: A.LAY_ROW, extra: -1 })!;
      while (s.phase === "place") s = A.play(s, A.chooseShot(s, "normal", random)!)!;
      let shots = 0,
        slowest = 0;
      while (s.winner === null && shots < 60) {
        const started = performance.now(),
          move = A.chooseShot(s, "hard", random)!;
        slowest = Math.max(slowest, performance.now() - started);
        expect(s.owners[move.from]).toBe(s.turn);
        s = A.play(s, move, random)!;
        shots++;
      }
      expect(shots).toBeGreaterThan(1);
      expect(s.discs.filter((d) => !d.on).every((d) => d.fell)).toBe(true);
      expect(slowest).toBeLessThan(4000);
    }
  }, 60000);
});
