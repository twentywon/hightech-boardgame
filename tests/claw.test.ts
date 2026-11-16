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
  test("the lever held moves the claw on and on, it stops shortly when let go, and the hanging claw swings and settles", () => {
    const world = cs.createWorld(1, seededRandom(3)),
      from = world.claw.x;
    cs.press(world, 1, true);
    for (let k = 0; k < 60; k++) cs.step(world);
    // A second held to the right: well past a single step, at nearly full speed.
    const moved = world.claw.x - from;
    expect(moved).toBeGreaterThan(cs.SPEED * 0.7);
    expect(world.claw.vx).toBeCloseTo(cs.SPEED, 1);
    cs.press(world, 1, false);
    const stopped = world.claw.x;
    for (let k = 0; k < 30; k++) cs.step(world);
    expect(world.claw.vx).toBe(0);
    expect(world.claw.x - stopped).toBeGreaterThan(0.05);
    expect(world.claw.x - stopped).toBeLessThan(0.4);
    // Stopped short, the claw swings on past the trolley, and the swing dies away.
    let widest = 0;
    for (let k = 0; k < 60; k++) {
      cs.step(world);
      widest = Math.max(widest, Math.abs(world.claw.sx));
    }
    expect(widest).toBeGreaterThan(0.04);
    for (let k = 0; k < 60 * 5; k++) cs.step(world);
    expect(Math.abs(world.claw.sx)).toBeLessThan(0.01);
    // Held at the end of the rails, it goes no further.
    cs.press(world, 1, true);
    for (let k = 0; k < 60 * 4; k++) cs.step(world);
    expect(world.claw.x).toBeLessThanOrEqual(cs.PIT.x1 - 0.35 + 1e-9);
    cs.letGo(world);
    expect(cs.leverOf(world)).toEqual({ x: 0, z: 0 });
  });
  test("a toy caught by its body off the middle is lifted as it lay and dropped only at the top or on the way to the chute", () => {
    let dropped = 0,
      onTheWay = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const world = cs.createWorld(1, seededRandom(seed)),
        toy = world.toys.find((t) => t.y < t.r + 0.01 && t.x + t.r < cs.PIT.x1 - 0.4 && world.toys.every((o) => o === t || Math.hypot(o.x - t.x, o.z - t.z) > o.r + t.r))!;
      if (!toy) continue;
      cs.aimAt(world, toy.x + toy.r * 0.6, toy.z);
      for (let k = 0; k < 400; k++) cs.step(world);
      cs.drop(world);
      let offset: number | null = null,
        seen: cs.Happening[] = [],
        was = false;
      for (let k = 0; k < 60 * 20 && !seen.some((e) => e.kind !== "closed"); k++) {
        seen = [...seen, ...cs.step(world)];
        if (toy.held) {
          // By its body: lifted as it lay, still off to the side of the claw by as much as it was.
          expect(world.claw.part).toBe(-1);
          const hub = cs.hubOf(world.claw);
          offset ??= toy.x - hub.x;
          expect(toy.x - hub.x).toBeCloseTo(offset, 6);
        } else if (was && world.claw.phase !== "release" && world.claw.phase !== "rest") {
          // Let go: never on the way up, only all the way up or on the way to the chute.
          expect(world.claw.y).toBeCloseTo(cs.TOP, 6);
          dropped++;
          if (world.claw.phase === "home" && world.claw.t > 0) onTheWay++;
        }
        was = toy.held;
      }
      expect(offset).not.toBeNull();
      expect(-offset!).toBeGreaterThan(toy.r * 0.5);
    }
    expect(dropped).toBeGreaterThan(5);
    expect(onTheWay).toBeGreaterThan(0);
  });
  test("a toy caught by a limb hangs from it under the claw and is seldom brought to the chute; by its middle, mostly", () => {
    let byLimb = 0,
      limbPrizes = 0,
      byBody = 0,
      bodyPrizes = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const where of ["limb", "body"] as const) {
        // A toy lying on the floor by itself, and the point 4/5 along one of its limbs that the claw can reach and that
        // lies clear of the other toys' bodies (or the toy's middle).
        const world = cs.createWorld(1, seededRandom(seed)),
          reach = (x: number, z: number) => Math.abs(x) < cs.PIT.x1 - 0.4 && Math.abs(z) < cs.PIT.z1 - 0.4,
          aims = world.toys
            .filter((t) => t.y < t.r + 0.01 && world.toys.every((o) => o === t || Math.hypot(o.x - t.x, o.z - t.z) > o.r + t.r))
            .flatMap((t) =>
              cs.limbsOf(t).map((limb) => {
                const x = limb.a[0] + (limb.b[0] - limb.a[0]) * 0.8,
                  z = limb.a[2] + (limb.b[2] - limb.a[2]) * 0.8,
                  clear = Math.min(...world.toys.filter((o) => o !== t).map((o) => Math.hypot(o.x - x, o.z - z) - o.r));
                return { toy: t, x, z, clear };
              }),
            )
            .filter((aim) => reach(aim.x, aim.z) && reach(aim.toy.x, aim.toy.z) && aim.clear > 0.12);
        if (!aims.length) continue;
        const toy = aims[0].toy,
          [x, z] = where === "limb" ? [aims[0].x, aims[0].z] : [toy.x, toy.z];
        cs.aimAt(world, x, z);
        for (let k = 0; k < 400; k++) cs.step(world);
        cs.drop(world);
        let part: number | null = null,
          hung = false;
        const seen: cs.Happening[] = [];
        for (let k = 0; k < 60 * 20 && !seen.some((e) => e.kind !== "closed"); k++) {
          seen.push(...cs.step(world));
          if (toy.held) part ??= world.claw.part;
          // Lifted by a limb, the body hangs below the prongs.
          if (toy.held && world.claw.hang && world.claw.y >= cs.TOP - 1e-6) hung ||= toy.y < cs.gripOf(world.claw).y - toy.r * 0.5;
        }
        const won = seen.some((e) => e.kind === "prize" && e.toy === toy.id && !e.bonus);
        if (where === "limb" && part !== null && part >= 0) {
          byLimb++;
          if (won) limbPrizes++;
          if (world.claw.hang === null && part >= 0 && won) expect(hung).toBe(true);
        } else if (where === "body" && part === -1) {
          byBody++;
          if (won) bodyPrizes++;
        }
      }
    }
    expect(byLimb).toBeGreaterThan(8);
    expect(byBody).toBeGreaterThan(8);
    expect(limbPrizes / byLimb).toBeLessThan(0.35);
    expect(bodyPrizes / byBody).toBeGreaterThan(0.8);
  });
});
