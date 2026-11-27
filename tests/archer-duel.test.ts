import { describe, expect, it } from "vitest";
import * as R from "../src/games/bowduel/rules";
import { FULL_PULL, LEAST_PULL, pullAim, pullFor, powerOf, shareOf } from "../src/games/bowduel/layout";

/** A seeded stream, so that every run lays the same fields. */
function seeded(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
/** The shot that brings an arrow down on the foe's middle (the computer's reckoning without its error). */
const perfect = (s: R.State, angle = 45) => R.shotMove(angle, Math.round(R.powerFor(s.land, s.turn, angle) * 10) / 10);

describe("archer duel (활잡이 결투)", () => {
  it("lays a field: a gap and mounds within their bounds, full health; the field is always calm", () => {
    const random = seeded(3);
    for (let k = 0; k < 40; k++) {
      const s = R.createGame("calm", random);
      expect(s.land.span).toBeGreaterThanOrEqual(R.SPAN.least);
      expect(s.land.span).toBeLessThanOrEqual(R.SPAN.most);
      expect(s.land.mounds.every((m) => m >= 0.6 && m <= 3)).toBe(true);
      expect(s.health).toEqual([R.HEALTH, R.HEALTH]);
      expect(s.turn).toBe(0);
      expect("wind" in s).toBe(false);
    }
    // Over Wi-Fi every device lays the same from the room's shared stream.
    expect(R.bowDuel.create("calm", {}, seeded(9))).toEqual(R.bowDuel.create("calm", {}, seeded(9)));
    // The windy field was taken out: a remembered (or an older room's) "wind" lays a calm field.
    expect(R.bowDuel.create("wind").variant).toBe("calm");
    expect(R.bowDuel.create("wind", {}, seeded(9))).toEqual(R.bowDuel.create("calm", {}, seeded(9)));
  });
  it("finds the head, the body and the legs where the figure has them, nothing beside them", () => {
    const land = R.createGame("calm", seeded(5)).land,
      f = R.feet(land, 1);
    expect(R.partAt(land, 1, f.x, f.y + R.FIGURE.head.y)).toBe("head");
    expect(R.partAt(land, 1, f.x + 0.1, f.y + 1.2)).toBe("body");
    expect(R.partAt(land, 1, f.x - 0.1, f.y + 0.4)).toBe("legs");
    expect(R.partAt(land, 1, f.x + 0.4, f.y + 1.2)).toBeNull();
    expect(R.partAt(land, 1, f.x, f.y + 2.2)).toBeNull();
    expect(R.HURT.head).toBeGreaterThan(R.HURT.body);
    expect(R.HURT.body).toBeGreaterThan(R.HURT.legs);
  });
  it("a well reckoned arrow strikes the foe and hurts it by where it strikes; it stays standing in it", () => {
    const random = seeded(11);
    let hits = 0;
    for (let k = 0; k < 30; k++) {
      const s = R.createGame("calm", random),
        next = R.play(s, perfect(s))!;
      expect(next.ply).toBe(1);
      expect(next.turn).toBe(1);
      expect(next.shots).toEqual([1, 0]);
      const shot = next.last!;
      if (shot.target === 1) {
        hits++;
        expect(shot.hurt).toBe(R.HURT[shot.part!]);
        expect(next.health[1]).toBe(R.HEALTH - shot.hurt);
        expect(next.stuck.at(-1)).toMatchObject({ in: 1, side: 0, part: shot.part });
      }
    }
    expect(hits).toBeGreaterThanOrEqual(27);
  });
  it("a short arrow stands in the ground where it came down; the same shot always flies the same", () => {
    const s = R.createGame("calm", seeded(21)),
      next = R.play(s, R.shotMove(45, R.POWER.least))!;
    expect(next.last!.target).toBeNull();
    expect(next.stuck).toHaveLength(1);
    const stuck = next.stuck[0];
    expect(stuck.in).toBe(-1);
    expect(stuck.y).toBeCloseTo(R.ground(s.land, stuck.x), 2);
    expect(next.health).toEqual([R.HEALTH, R.HEALTH]);
    expect(next.prev[0]).toBe(next.last);
    // No wind: the next archer's same shot lands as far out on its own side, and a shot played again flies the same.
    expect(R.flight(s.land, 0, 45, R.POWER.least).x).toBeCloseTo(next.last!.x, 3);
    expect(R.play(s, R.shotMove(45, R.POWER.least))!.last).toEqual(next.last);
  });
  it("the first brought to nothing loses; nothing more is played", () => {
    const random = seeded(31);
    let s = R.createGame("calm", random);
    while (s.winner === null) {
      // Side 0 shoots true; side 1 shoots short.
      s = R.play(s, s.turn === 0 ? perfect(s) : R.shotMove(40, R.POWER.least))!;
      expect(s.ply).toBeLessThan(40);
    }
    expect(s.winner).toBe(0);
    expect(s.health[1]).toBe(0);
    expect(R.play(s, perfect(s))).toBeNull();
    expect(R.bowDuel.moves(s)).toEqual([]);
    expect(R.bowDuel.reason(s)).toContain("승부가 났습니다");
  });
  it("refuses shots out of the bow's reach", () => {
    const s = R.createGame("calm", seeded(2));
    expect(R.play(s, { from: -1, to: 900, extra: 200 })).toBeNull();
    expect(R.play(s, { from: -1, to: 450, extra: 50 })).toBeNull();
    expect(R.play(s, { from: -1, to: 450, extra: 400 })).toBeNull();
    expect(R.play(s, { from: 3, to: 450, extra: 200 })).toBeNull();
    expect(R.readShot(R.shotMove(42.5, 19.3))).toEqual({ angle: 42.5, power: 19.3 });
  });
  it("keeps the arrows standing to a few, the oldest pulled out first", () => {
    const random = seeded(8);
    let s = R.createGame("calm", random);
    for (let k = 0; k < R.KEEP + 6; k++) s = R.play(s, R.shotMove(45, R.POWER.least))!;
    expect(s.stuck).toHaveLength(R.KEEP);
  });
  it("the computer closes in from where its arrows fall: the harder, the sooner it strikes", () => {
    const first = (level: R.Level) => {
      const random = seeded(level.length * 101),
        firsts: number[] = [];
      for (let g = 0; g < 40; g++) {
        let s = R.createGame("calm", random),
          at = 0;
        while (!at && s.ply < 60) {
          const side = s.turn,
            next = R.play(s, side === 0 ? R.chooseShot(s, level, random)! : R.shotMove(45, R.POWER.least))!;
          if (side === 0 && next.last!.target === 1) at = next.shots[0];
          s = next;
          if (s.winner !== null) break;
        }
        firsts.push(at || 30);
      }
      return firsts.reduce((a, b) => a + b, 0) / firsts.length;
    };
    const easy = first("easy"),
      normal = first("normal"),
      hard = first("hard");
    expect(hard).toBeLessThan(normal);
    expect(normal).toBeLessThan(easy);
    // Even the easiest comes to strike within a dozen or so arrows, on average.
    expect(easy).toBeLessThan(12);
    expect(hard).toBeLessThan(4.5);
  });
  it("a pull back draws: the arrow against the pull, the longer the harder; the keys' numbers round trip", () => {
    const w = 1200,
      h = 700;
    expect(pullAim(3, 4, w, h, 1)).toBeNull();
    expect(Math.hypot(3, 4)).toBeLessThan(LEAST_PULL);
    // Pulled down and to the left, the archer facing right shoots up and to the right.
    const aim = pullAim(-100, 100, w, h, 1)!;
    expect(aim.angle).toBeCloseTo(45, 1);
    expect(aim.power).toBeCloseTo(powerOf(Math.hypot(100, 100) / (FULL_PULL * h)), 1);
    // Facing left, the same angle wants a pull to the right.
    expect(pullAim(100, 100, w, h, -1)!.angle).toBeCloseTo(45, 1);
    // A pull up points the arrow down: it is taken as level.
    expect(pullAim(-100, -50, w, h, 1)!.angle).toBe(0);
    // As long a pull as the screen allows is the fullest draw, no more.
    expect(pullAim(-2000, 2000, w, h, 1)!.power).toBe(R.POWER.most);
    for (const [angle, power, face] of [
      [30, 15, 1],
      [62.5, 24.4, -1],
    ] as const) {
      const p = pullFor(angle, power, w, h, face);
      expect(pullAim(p.dx, p.dy, w, h, face)).toEqual({ angle, power });
    }
    expect(shareOf(powerOf(0.37))).toBeCloseTo(0.37, 6);
  });
});
