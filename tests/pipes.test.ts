import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as pipes from "../src/games/pipes/rules";
import { pipesConfig } from "../src/games/pipes/config";
import { TILE_TOP, cellAt, pipesSubject } from "../src/games/pipes/view";

const { N, E, S, W } = pipes;
/** Plain backtracking, to check the solver by: seams matched as the stones are laid row by row, the whole checked for one tree at the end. */
function brute(size: number, tiles: number[]) {
  const n = size * size,
    laid = new Array(n).fill(0);
  let found = 0;
  const go = (c: number) => {
    if (c === n) {
      const state = { size, source: 0, tiles: laid };
      if (pipes.solved(state)) found++;
      return;
    }
    const r = Math.floor(c / size),
      q = c % size;
    for (const m of pipes.rotations(tiles[c])) {
      if ((r === 0 && m & N) || (r === size - 1 && m & S) || (q === 0 && m & W) || (q === size - 1 && m & E)) continue;
      if (q > 0 && !!(m & W) !== !!(laid[c - 1] & E)) continue;
      if (r > 0 && !!(m & N) !== !!(laid[c - size] & S)) continue;
      laid[c] = m;
      go(c + 1);
    }
    laid[c] = 0;
  };
  go(0);
  return found;
}
describe("pipes", () => {
  test("every laid puzzle has one answer, a tree over the garden, and starts unsolved", () => {
    for (let stage = 1; stage <= pipes.STAGES.length; stage++)
      for (let seed = 1; seed <= 12; seed++) {
        const state = pipes.createGame(stage, seededRandom(seed * 53 + stage)),
          n = state.size;
        expect(n).toBe(pipes.STAGES[stage - 1].size);
        expect(pipes.solutions(n, state.answer, 3)).toBe(1);
        expect(pipes.solved({ ...state, tiles: state.answer })).toBe(true);
        expect(pipes.solved(state)).toBe(false);
        expect(state.winner).toBeNull();
        expect(state.ply).toBe(0);
        // Each piece is its answer turned; the tank stands next to the middle.
        state.tiles.forEach((m, i) => expect(pipes.rotations(state.answer[i])).toContain(m));
        const r = Math.floor(state.source / n),
          c = state.source % n,
          mid = (n - 1) / 2;
        expect(Math.abs(r - mid) + Math.abs(c - mid)).toBeLessThanOrEqual(1);
        // Seams open in the answer: one fewer than the stones, as in a tree.
        expect(state.answer.reduce((sum, m) => sum + pipes.ends(m), 0)).toBe(2 * (n * n - 1));
        expect(pipes.corridor(n, state.answer)).toBeLessThanOrEqual(n);
      }
  });
  test("the pieces are of every kind", () => {
    const kinds = { end: 0, straight: 0, bend: 0, tee: 0, cross: 0 };
    for (let seed = 1; seed <= 20; seed++)
      for (const m of pipes.createGame(5, seededRandom(seed)).answer) {
        const k = pipes.ends(m);
        if (k === 1) kinds.end++;
        else if (k === 2) kinds[m === (N | S) || m === (E | W) ? "straight" : "bend"]++;
        else if (k === 3) kinds.tee++;
        else kinds.cross++;
      }
    const all = 20 * 64;
    expect(kinds.cross).toBeGreaterThan(0);
    for (const k of ["straight", "bend", "tee"] as const) expect(kinds[k] / all).toBeGreaterThan(0.08);
    expect(kinds.end / all).toBeLessThan(0.45);
  });
  test("following the hint from the start lays every piece right within the number of stones", () => {
    for (let stage = 1; stage <= pipes.STAGES.length; stage++)
      for (let seed = 1; seed <= 8; seed++) {
        let state = pipes.createGame(stage, seededRandom(seed * 7 + stage * 1000));
        const n = state.size * state.size;
        for (let m = 0; m < n && state.winner === null; m++) {
          const move = pipes.hint(state)!;
          expect(move.to).toBeGreaterThanOrEqual(pipes.SET);
          const { cell, mask } = pipes.unput(move.to);
          expect(mask).toBe(state.answer[cell]);
          expect(state.tiles[cell]).not.toBe(mask);
          state = pipes.play(state, move)!;
          expect(state).not.toBeNull();
          expect(state.last).toBe(cell);
        }
        expect(state.winner).toBe(0);
        expect(state.tiles).toEqual(state.answer);
        expect(pipes.hint(state)).toBeNull();
        expect(pipes.moves(state)).toEqual([]);
        expect(pipes.connected(state).every(Boolean)).toBe(true);
      }
  });
  test("tapping turns a piece a quarter clockwise; four taps bring it back", () => {
    expect(pipes.turned(N)).toBe(E);
    expect(pipes.turned(N | E)).toBe(E | S);
    expect(pipes.turned(W)).toBe(N);
    expect(pipes.rotations(N | S)).toEqual([N | S, E | W]);
    expect(pipes.rotations(15)).toEqual([15]);
    expect(pipes.turnsBetween(N | E, W | N)).toBe(3);
    const s = pipes.createGame(3, seededRandom(11)),
      cell = s.tiles.findIndex((m) => pipes.rotations(m).length === 4);
    let t = s;
    for (let k = 1; k <= 4 && t.winner === null; k++) {
      const next = pipes.play(t, { from: -1, to: cell, extra: -1 });
      // The fourth tap could only be refused if the third had solved the puzzle, which it cannot here.
      expect(next).not.toBeNull();
      t = next!;
      expect(t.ply).toBe(k);
      expect(t.last).toBe(cell);
      if (k < 4) expect(t.tiles[cell]).not.toBe(s.tiles[cell]);
    }
    expect(t.tiles[cell]).toBe(s.tiles[cell]);
    expect(t.tiles).toEqual(s.tiles);
    // The moves are a tap on every piece that a turn changes.
    expect(pipes.moves(s).map((m) => m.to)).toEqual(s.tiles.flatMap((m, i) => (m === 15 ? [] : [i])));
  });
  test("refused moves return null and change nothing", () => {
    const s = pipes.createGame(2, seededRandom(5)),
      copy = JSON.parse(JSON.stringify(s)),
      n = s.tiles.length,
      bend = s.tiles.findIndex((m) => pipes.rotations(m).length === 4),
      straight = s.tiles.findIndex((m) => m === (N | S) || m === (E | W));
    const bad = [
      { from: 0, to: bend, extra: -1 },
      { from: -1, to: bend, extra: 0 },
      { from: -1, to: -1, extra: -1 },
      { from: -1, to: n, extra: -1 },
      { from: -1, to: 1.5, extra: -1 },
      { from: -1, to: pipes.put(n, 1), extra: -1 },
      // A set move that names the mask the piece already shows, or one it cannot show.
      { from: -1, to: pipes.put(bend, s.tiles[bend]), extra: -1 },
      { from: -1, to: pipes.put(bend, 15), extra: -1 },
      { from: -1, to: pipes.put(bend, N | S), extra: -1 },
    ];
    if (straight >= 0) bad.push({ from: -1, to: pipes.put(straight, N | E), extra: -1 });
    for (const move of bad) expect(pipes.play(s, move)).toBeNull();
    // A cross looks the same however it lies: it cannot be turned.
    const cross = { ...s, tiles: [...s.tiles] };
    cross.tiles[bend] = 15;
    expect(pipes.play(cross, { from: -1, to: bend, extra: -1 })).toBeNull();
    expect(pipes.moves(cross).some((m) => m.to === bend)).toBe(false);
    // Nothing more once it is solved.
    const done = { ...s, tiles: [...s.answer], winner: 0 as const };
    expect(pipes.play(done, { from: -1, to: bend, extra: -1 })).toBeNull();
    expect(s).toEqual(copy);
    // A good move leaves its input as it was too.
    expect(pipes.play(s, { from: -1, to: bend, extra: -1 })).not.toBeNull();
    expect(pipes.play(s, pipes.hint(s)!)).not.toBeNull();
    expect(s).toEqual(copy);
  });
  test("water runs from the tank through ends that meet, and open ends that meet nothing are leaks", () => {
    // Three across the middle, the tank in a cross at the centre, and a house above and below each.
    const size = 3,
      tiles = [S, S, S, N | E | S, N | E | S | W, N | W | S, N, N, N];
    const line = { size, source: 4, tiles };
    expect(pipes.solved(line)).toBe(true);
    expect(pipes.leaks(line)).toEqual([]);
    expect(pipes.houses(line)).toEqual([true, true, true, false, false, false, true, true, true]);
    const broken = { size, source: 4, tiles: [...tiles] };
    broken.tiles[3] = N | W | S;
    expect(pipes.solved(broken)).toBe(false);
    const wet = pipes.connected(broken);
    expect(wet[3]).toBe(false);
    expect(wet[0]).toBe(false);
    expect(wet[6]).toBe(false);
    expect(wet[5]).toBe(true);
    expect(pipes.leaks(broken).some((l) => l.cell === 3 && l.bit === W)).toBe(true);
    expect(pipes.leaks(broken).some((l) => l.cell === 4 && l.bit === W)).toBe(true);
    expect(pipes.inlets(line).inlet[5]).toBe(W);
    expect(pipes.inlets(line).inlet[2]).toBe(S);
  });
  test("the solver counts as plain backtracking does", () => {
    for (const size of [3, 4, 5]) {
      const random = seededRandom(size * 7);
      let several = 0;
      for (let i = 0; i < (size === 5 ? 40 : 150); i++) {
        const root = Math.floor(size / 2) * size + Math.floor(size / 2),
          masks = pipes.grow(size, root, random),
          count = brute(size, masks);
        if (count > 1) several++;
        expect(pipes.solutions(size, masks, 1e6)).toBe(count);
      }
      if (size === 3) expect(several).toBeGreaterThan(0);
    }
  });
  test("a puzzle is laid quickly at every stage", () => {
    const times: string[] = [];
    for (let stage = 1; stage <= pipes.STAGES.length; stage++) {
      const random = seededRandom(stage * 977),
        count = 30,
        start = performance.now();
      for (let i = 0; i < count; i++) pipes.createGame(stage, random);
      const average = (performance.now() - start) / count;
      times.push(`${pipes.STAGES[stage - 1].size}x${pipes.STAGES[stage - 1].size}: ${average.toFixed(2)} ms`);
      expect(average).toBeLessThan(400);
    }
    console.log(`pipes: average time to lay a puzzle — ${times.join(", ")}`);
  });
  test("the view's helpers and the texts load without a page", () => {
    // Browser tests aim with these under plain Node: stones evenly spaced about the middle, all inside the frame.
    for (const { size } of pipes.STAGES) {
      const first = cellAt(size, 0),
        last = cellAt(size, size * size - 1),
        subject = pipesSubject(size, 16 / 9);
      expect(first.x).toBeCloseTo(-last.x);
      expect(first.z).toBeCloseTo(-last.z);
      expect(cellAt(size, 1).x - first.x).toBeCloseTo(cellAt(size, size).z - first.z);
      expect(subject.half).toBeGreaterThan(last.x);
      expect(subject.halfZ!).toBeGreaterThan(last.z);
      expect(pipesSubject(size, 0.6).half).toBeGreaterThan(last.x);
    }
    expect(TILE_TOP).toBeGreaterThan(0);
    expect(pipesConfig.game).toBe(pipes.pipes);
    expect(pipesConfig.stages!.map((s) => s.value)).toEqual(["1", "2", "3", "4", "5"]);
    for (const stage of pipesConfig.stages!) expect(stage.art.startsWith(`<svg viewBox="0 0 140 140"`)).toBe(true);
    expect(pipesConfig.puzzle?.hint).toBe(pipes.hint);
    expect(pipesConfig.game.reason(pipes.createGame(1, seededRandom(1))).startsWith("성공!")).toBe(true);
    expect(pipesConfig.rules).toContain("<h3>기본 규칙</h3>");
    expect(pipesConfig.rules).toContain("<h3>처음이라면</h3>");
    expect(pipesConfig.rules).not.toContain("조작");
    const state = pipes.createGame(2, seededRandom(3));
    expect(pipesConfig.keyPoints!(state)).toHaveLength(25);
    expect(pipesConfig.game.owners(state).every((o) => o === null)).toBe(true);
    expect(pipesConfig.game.turn(state)).toBe(0);
    expect(pipesConfig.game.effect(state)).toBeNull();
  });
});
