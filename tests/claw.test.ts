import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as cr from "../src/games/claw/rules";
import * as cs from "../src/games/claw/sim";

/** Runs the machine until a try comes to something, with the claw sent over a toy (or a point) and let down. */
function attempt(world: cs.World, x: number, z: number) {
  cs.aimAt(world, x, z);
  for (let k = 0; k < 400; k++) cs.step(world);
  cs.drop(world);
  const seen: cs.Happening[] = [];
  for (let k = 0; k < 60 * 20 && !seen.some((e) => e.kind !== "closed"); k++) seen.push(...cs.step(world));
  return seen;
}
describe("claw machine", () => {
  test("the toys lie in the pit clear of the chute, on the floor or on each other", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const toys = cs.lay(seededRandom(seed));
      expect(toys.length).toBeGreaterThan(12);
      for (const toy of toys) {
        expect(toy.x <= cs.CHUTE.x1 && toy.z >= cs.CHUTE.z0).toBe(false);
        expect(toy.y).toBeGreaterThanOrEqual(toy.r * 0.89);
        expect(toy.x).toBeGreaterThanOrEqual(cs.PIT.x0);
        expect(toy.x).toBeLessThanOrEqual(cs.PIT.x1);
      }
    }
  });
  test("a claw let down squarely on a toy often brings it to the chute; on the bare floor it brings nothing", () => {
    let prizes = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const world = cs.createWorld(1, seededRandom(seed)),
        toy = world.toys.find((t) => t.y < t.r + 0.01 && world.toys.every((o) => o === t || Math.hypot(o.x - t.x, o.z - t.z) > o.r + t.r))!;
      if (!toy) continue;
      const seen = attempt(world, toy.x, toy.z);
      if (seen.some((e) => e.kind === "prize" && !e.bonus)) prizes++;
      else expect(seen.some((e) => e.kind === "missed" || e.kind === "prize")).toBe(true);
      // The claw is back over the chute, ready for the next try.
      for (let k = 0; k < 120; k++) cs.step(world);
      expect(world.claw.phase).toBe("aim");
      expect(world.aimLeft).toBeGreaterThan(cs.AIM_TIME - 3);
    }
    expect(prizes).toBeGreaterThan(10);
    // The far right back corner, where no toy lies under the claw's prongs: nothing.
    const world = cs.createWorld(1, seededRandom(99));
    world.toys = [];
    expect(attempt(world, cs.PIT.x1 - 0.4, cs.PIT.z0 + 0.4).some((e) => e.kind === "missed")).toBe(true);
  });
  test("the claw goes down by itself when the time to aim is up, and each try is counted once", () => {
    const world = cs.createWorld(2, seededRandom(5));
    for (let k = 0; k < (cs.AIM_TIME + 0.2) / cs.DT; k++) cs.step(world);
    expect(world.claw.phase).not.toBe("aim");
    let s = cr.createGame(1);
    expect(s.tries).toBe(cr.LEVELS[0].tries);
    s = cr.play(s, { from: -1, to: cr.STEER + 1, extra: -1 })!;
    s = cr.play(s, { from: -1, to: cr.DROP, extra: -1 })!;
    expect(s.tries).toBe(cr.LEVELS[0].tries);
    s = cr.play(s, { from: -1, to: cr.PRIZE + 2, extra: -1 })!;
    s = cr.play(s, { from: -1, to: cr.BONUS + 0, extra: -1 })!;
    expect(s.prizes).toEqual([2, 0]);
    expect(s.tries).toBe(cr.LEVELS[0].tries - 1);
    while (s.winner === null) s = cr.play(s, { from: -1, to: cr.MISSED, extra: -1 })!;
    expect(s.winner).toBe(0);
    let none = cr.createGame(2);
    while (none.winner === null) none = cr.play(none, { from: -1, to: cr.MISSED, extra: -1 })!;
    expect(none.winner).toBe(1);
  });
});
