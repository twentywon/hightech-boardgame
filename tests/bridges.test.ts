import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import { cryptoRandom } from "../src/core/random";
import * as b from "../src/games/bridges/rules";
import { bridgesConfig } from "../src/games/bridges/config";
import { CELL, ISLAND_TOP, bridgesSubject, cellAt } from "../src/games/bridges/view";

const sum = (state: b.State, cell: number, counts: number[]) => state.edges.reduce((total, e, i) => total + (e.a === cell || e.b === cell ? counts[i] : 0), 0);

describe("bridges", () => {
  test("every laid puzzle has one answer that keeps every rule, the start is not solved, and the hint solves it", () => {
    for (let stage = 1; stage <= b.STAGES.length; stage++)
      for (let seed = 1; seed <= 6; seed++) {
        let state = b.createGame(stage, seededRandom(seed * 97 + stage));
        const spec = b.STAGES[stage - 1];
        expect(state.size).toBe(spec.size);
        expect(state.islands.length).toBe(spec.islands);
        const tried = { cases: 0 };
        expect(b.solutions(state.size, state.islands, state.edges, 2, tried)).toBe(1);
        // The harder stages need a step beyond counting.
        expect(tried.cases).toBeGreaterThanOrEqual(spec.depth);
        // The numbers are the answer's bridges, no island has more than eight and none is next to another.
        const land = new Set(state.islands.map((island) => island.cell));
        for (const island of state.islands) {
          expect(sum(state, island.cell, state.answer)).toBe(island.need);
          expect(island.need).toBeGreaterThanOrEqual(1);
          expect(island.need).toBeLessThanOrEqual(8);
          if (island.cell % state.size < state.size - 1) expect(land.has(island.cell + 1)).toBe(false);
          expect(land.has(island.cell + state.size)).toBe(false);
        }
        // The answer crosses nothing and joins every island.
        state.edges.forEach((e, i) => {
          expect(state.answer[i]).toBeLessThanOrEqual(2);
          if (state.answer[i]) for (const f of e.crosses) expect(state.answer[f]).toBe(0);
        });
        expect(b.solved({ ...state, bridges: state.answer })).toBe(true);
        expect(state.winner).toBeNull();
        expect(b.solved(state)).toBe(false);
        for (let m = 0; m < 400 && state.winner === null; m++) {
          const move = b.hint(state)!;
          expect(move).not.toBeNull();
          state = b.play(state, move)!;
          expect(state).not.toBeNull();
        }
        expect(state.winner).toBe(0);
        expect(b.hint(state)).toBeNull();
        expect(b.moves(state)).toEqual([]);
      }
  });
  test("from any muddle of legal moves, following the hint still solves the puzzle", () => {
    for (let stage = 1; stage <= b.STAGES.length; stage++) {
      const random = seededRandom(stage * 31);
      let state = b.createGame(stage, random);
      for (let m = 0; m < 40 && state.winner === null; m++) {
        const options = b.moves(state);
        state = b.play(state, options[Math.floor(random() * options.length)])!;
      }
      for (let m = 0; m < 400 && state.winner === null; m++) state = b.play(state, b.hint(state)!)!;
      expect(state.winner).toBe(0);
      expect(state.bridges).toEqual(state.answer);
    }
  });
  test("the hint first takes up a bridge the answer does not have", () => {
    let state = b.createGame(2, seededRandom(11));
    const wrong = state.answer.findIndex((n, i) => n < 2 && !b.blocked(state, i));
    state = b.play(state, b.set(wrong, state.answer[wrong] + 1))!;
    expect(b.hint(state)).toEqual(b.set(wrong, state.answer[wrong]));
  });
  test("bridges between two islands go 0, 1, 2, 0, from either island", () => {
    const start = b.createGame(1, seededRandom(5)),
      e = start.edges[0];
    let state = start;
    for (const [from, to, count] of [
      [e.a, e.b, 1],
      [e.b, e.a, 2],
      [e.a, e.b, 0],
    ]) {
      state = b.play(state, { from, to, extra: -1 })!;
      expect(state.bridges[0]).toBe(count);
      expect(state.last).toBe(0);
    }
    expect(state.ply).toBe(3);
    expect(start.bridges[0]).toBe(0);
    // Every move listed is legal, and both ways round.
    for (const m of b.moves(start)) expect(b.play(start, m)).not.toBeNull();
    expect(b.moves(start).length).toBe(start.edges.length * 2);
  });
  test("a bridge is refused over another, between islands that do not see each other, and never changes the state", () => {
    let found = false;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const start = b.createGame(3, seededRandom(seed)),
        e = start.edges.findIndex((edge) => edge.crosses.length > 0);
      if (e < 0) continue;
      found = true;
      const f = start.edges[e].crosses[0],
        state = b.play(start, { from: start.edges[e].a, to: start.edges[e].b, extra: -1 })!,
        before = JSON.stringify(state);
      const across = start.edges[f];
      expect(b.play(state, { from: across.a, to: across.b, extra: -1 })).toBeNull();
      expect(b.play(state, { from: across.b, to: across.a, extra: -1 })).toBeNull();
      expect(b.play(state, b.set(f, 1))).toBeNull();
      expect(b.play(state, b.set(f, 2))).toBeNull();
      // Neither way round is offered while the other bridge stands.
      expect(b.moves(state).some((m) => (m.from === across.a && m.to === across.b) || (m.from === across.b && m.to === across.a))).toBe(false);
      // Raising the standing bridge to two and back to none is allowed; then the crossing one may be laid.
      const two = b.play(state, { from: start.edges[e].a, to: start.edges[e].b, extra: -1 })!;
      expect(two.bridges[e]).toBe(2);
      const none = b.play(two, { from: start.edges[e].a, to: start.edges[e].b, extra: -1 })!;
      expect(b.play(none, { from: across.a, to: across.b, extra: -1 })!.bridges[f]).toBe(1);
      // Islands that do not see each other, an island with itself, sea and setting what is already there.
      const [one, other] = start.islands.map((island) => island.cell).filter((cell, _, all) => all.some((x) => x !== cell && b.edgeBetween(start, cell, x) < 0));
      const far = start.islands.map((island) => island.cell).find((cell) => cell !== one && b.edgeBetween(start, one, cell) < 0)!;
      expect(other).toBeDefined();
      expect(b.play(state, { from: one, to: far, extra: -1 })).toBeNull();
      expect(b.play(state, { from: one, to: one, extra: -1 })).toBeNull();
      const sea = Array.from({ length: start.size * start.size }, (_, i) => i).find((cell) => !start.islands.some((island) => island.cell === cell))!;
      expect(b.play(state, { from: one, to: sea, extra: -1 })).toBeNull();
      expect(b.play(state, { from: start.edges[e].a, to: start.edges[e].b, extra: 0 })).toBeNull();
      expect(b.play(state, b.set(e, 1))).toBeNull();
      expect(b.play(state, b.set(start.edges.length, 1))).toBeNull();
      expect(JSON.stringify(state)).toBe(before);
    }
    expect(found).toBe(true);
  });
  test("any answer counts as solved, and a solved puzzle takes no more moves", () => {
    const start = b.createGame(1, seededRandom(21));
    let state = start;
    state.answer.forEach((count, i) => {
      if (count && state.winner === null) state = b.play(state, b.set(i, count))!;
    });
    expect(state.winner).toBe(0);
    expect(b.play(state, { from: start.edges[0].a, to: start.edges[0].b, extra: -1 })).toBeNull();
    expect(b.islandState(state, start.islands[0].cell)).toBe("done");
  });
  test("puzzles are laid quickly at every stage", () => {
    // With the secure generator the game itself uses, not only a seeded one.
    const times: string[] = [];
    for (let stage = 1; stage <= b.STAGES.length; stage++) {
      const count = 20,
        begun = performance.now();
      let slowest = 0;
      for (let i = 0; i < count; i++) {
        const one = performance.now();
        b.createGame(stage, i % 2 ? cryptoRandom : seededRandom(500 + i * 13 + stage));
        slowest = Math.max(slowest, performance.now() - one);
      }
      const average = (performance.now() - begun) / count;
      times.push(`${stage}: ${average.toFixed(1)} ms (slowest ${slowest.toFixed(1)})`);
      expect(average).toBeLessThan(500);
    }
    console.log(`bridges generation, average per puzzle — ${times.join(", ")}`);
  });
  test("the setup offers five stages, the rules keep the usual order, and the keyboard walks the islands", () => {
    expect(bridgesConfig.stages!.map((stage) => stage.value)).toEqual(["1", "2", "3", "4", "5"]);
    expect(bridgesConfig.stages!.map((stage) => stage.name)).toEqual(["7×7 · 쉬움", "8×8 · 보통", "9×9 · 도전", "10×10 · 어려움", "12×12 · 고수"]);
    for (const stage of bridgesConfig.stages!) expect(stage.art).toContain('viewBox="0 0 140 140"');
    expect(bridgesConfig.stages!.every((stage) => !/<text/.test(stage.art))).toBe(true);
    expect(bridgesConfig.rules).toMatch(/^<h3>기본 규칙<\/h3>/);
    expect(bridgesConfig.rules).toContain("<h3>처음이라면</h3>");
    expect(bridgesConfig.rules).not.toContain("조작");
    expect(b.bridges.reason(b.createGame(1, seededRandom(3)))).toMatch(/^성공!/);
    const state = b.createGame(2, seededRandom(8)),
      points = bridgesConfig.keyPoints!(state),
      land = new Set(state.islands.map((island) => island.cell));
    expect(points.length).toBe(state.size * state.size);
    points.forEach((p, i) => expect(Number.isFinite(p.x)).toBe(land.has(i)));
    expect(land.has(bridgesConfig.keyStart!(state))).toBe(true);
    // The hint's words follow what it asks for.
    const text = bridgesConfig.puzzle!.hintText as (s: b.State, m: { from: number; to: number; extra: number }) => string;
    expect(text(state, b.set(0, 2))).toContain("두 개");
    expect(text(state, b.set(0, 1))).toContain("하나 놓으세요");
    expect(text(state, b.set(0, 0))).toContain("걷으세요");
  });
  test("the view's helpers place the cells where the camera frames them", () => {
    expect(cellAt(7, 0)).toEqual({ x: -3 * CELL, z: -3 * CELL });
    expect(cellAt(7, 48)).toEqual({ x: 3 * CELL, z: 3 * CELL });
    expect(cellAt(8, 9)).toEqual({ x: -2.5 * CELL, z: -2.5 * CELL });
    for (const size of [7, 12]) {
      const subject = bridgesSubject(size, 1.6);
      expect(subject.half).toBeGreaterThan((size * CELL) / 2);
      expect(subject.halfZ!).toBeGreaterThan((size * CELL) / 2);
    }
    expect(ISLAND_TOP).toBeGreaterThan(0);
  });
});
