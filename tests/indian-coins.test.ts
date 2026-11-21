import { describe, expect, it } from "vitest";
import { COIN_H, COIN_R, ROLES, THROW, flightAt, pairs, restOf, type Counts, type Flight } from "../src/games/indian/coins";
import { Quaternion, Vector3 } from "three";

describe("indian poker coins", () => {
  it("never lays two coins of a pile into each other", () => {
    for (const role of ROLES) {
      const all = Array.from({ length: 60 }, (_, i) => restOf(role, i).p);
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const sameLayer = Math.abs(all[i].y - all[j].y) < COIN_H * 0.5;
          if (sameLayer) expect(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z)).toBeGreaterThanOrEqual(2 * COIN_R);
        }
    }
  });
  it("keeps the piles apart from one another", () => {
    const centres = (role: (typeof ROLES)[number]) => Array.from({ length: 60 }, (_, i) => restOf(role, i).p);
    for (let a = 0; a < ROLES.length; a++)
      for (let b = a + 1; b < ROLES.length; b++)
        for (const p of centres(ROLES[a])) for (const q of centres(ROLES[b])) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(2 * COIN_R);
  });
  it("moves every coin that leaves a place to a place that gains one", () => {
    const before: Counts = { mine: 27, bet: 3, pot: 2, theirs: 28 },
      after: Counts = { mine: 26, bet: 0, pot: 6, theirs: 28 },
      moved = pairs(before, after);
    expect(moved).toHaveLength(4);
    // The bet goes first, from its top; the pot fills from where it stood.
    expect(moved[0].from).toEqual({ role: "bet", index: 2 });
    expect(moved.map((m) => m.to.index)).toEqual([2, 3, 4, 5]);
    expect(moved[3].from).toEqual({ role: "mine", index: 26 });
  });
  it("brings a thrown coin to rest exactly where it belongs", () => {
    const to = restOf("bet", 4),
      flight: Flight = {
        style: "throw",
        from: { p: new Vector3(3, 6, 12), q: new Quaternion() },
        to,
        target: { role: "bet", index: 4 },
        kind: 0,
        landKind: 0,
        start: 0,
        turns: 2,
        phase: 1,
        heard: 0,
      },
      out = { p: new Vector3(), q: new Quaternion() };
    // In the air it is above the felt, and at the end it lies flat on its place.
    flightAt(flight, THROW.fly / 2, out);
    expect(out.p.y).toBeGreaterThan(to.p.y);
    const end = flightAt(flight, THROW.fly + THROW.bounce + THROW.wobble, out);
    expect(end.done).toBe(true);
    expect(out.p.distanceTo(to.p)).toBeLessThan(1e-9);
    expect(out.q.angleTo(to.q)).toBeLessThan(1e-6);
  });
});
