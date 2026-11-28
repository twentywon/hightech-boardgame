import { describe, expect, it } from "vitest";
import { LADDERS, SNAKES } from "../src/games/snakes/rules";
import { BOARD_X, CELL, LADDER_LINES, LADDER_TOP, SNAKE_LINES, TABLE_Y, restHeight, rungsOf, squareAt, worldAt } from "../src/games/snakes/layout";

describe("Snakes and ladders table", () => {
  it("numbers the squares back and forth from the near left corner", () => {
    expect(squareAt(1)).toEqual({ x: -4.5 * CELL, z: 4.5 * CELL });
    expect(squareAt(10)).toEqual({ x: 4.5 * CELL, z: 4.5 * CELL });
    expect(squareAt(11)).toEqual({ x: 4.5 * CELL, z: 3.5 * CELL });
    expect(squareAt(100)).toEqual({ x: -4.5 * CELL, z: -4.5 * CELL });
    expect(worldAt(1).x).toBeCloseTo(-4.5 * CELL + BOARD_X);
  });
  it("lays a ladder for every ladder of the rules, with rungs to climb", () => {
    expect(LADDER_LINES.map((l) => [l.from, l.to])).toEqual(Object.entries(LADDERS).map(([a, b]) => [Number(a), b]));
    for (const l of LADDER_LINES) {
      expect(rungsOf(l).length).toBeGreaterThanOrEqual(2);
      // A token that has climbed stands on the ladder's top end.
      expect(restHeight(l.to)).toBe(LADDER_TOP);
    }
  });
  it("lays every snake on the board, from its head square to its tail square", () => {
    expect(SNAKE_LINES.map((s) => [s.head, s.tail])).toEqual(Object.entries(SNAKES).map(([a, b]) => [Number(a), b]));
    for (const s of SNAKE_LINES) {
      const head = worldAt(s.head),
        tail = worldAt(s.tail),
        first = s.points[0],
        last = s.points[s.points.length - 1];
      expect(Math.hypot(first.x - head.x, first.z - head.z)).toBeLessThan(1e-6);
      expect(Math.hypot(last.x - tail.x, last.z - tail.z)).toBeLessThan(1e-6);
      for (const p of s.points) {
        expect(Math.abs(p.x - BOARD_X)).toBeLessThanOrEqual(3.85 + 1e-9);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(3.85 + 1e-9);
      }
    }
  });
  it("raises a snake over one laid before it where they cross", () => {
    // The snakes from 48 and from 34 cross; the later one passes over.
    const later = SNAKE_LINES.find((s) => s.head === 48)!;
    expect(Math.max(...later.points.map((p) => p.lift))).toBeGreaterThan(0.15);
    expect(SNAKE_LINES[0].points.every((p) => p.lift === 0)).toBe(true);
  });
  it("stands a waiting token on the table and others on the board or what lies over it", () => {
    expect(restHeight(0)).toBe(TABLE_Y);
    for (let square = 1; square <= 100; square++) {
      expect(restHeight(square)).toBeGreaterThanOrEqual(0);
      expect(restHeight(square)).toBeLessThanOrEqual(LADDER_TOP + 0.3);
    }
  });
});
