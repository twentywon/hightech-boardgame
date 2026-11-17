import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as M from "../src/games/marbledrop/rules";
import { CELL, boardMiddle, marbleSubject, plotAt, plotUnder, sideways, trayAt } from "../src/games/marbledrop/layout";

const { NORTH, EAST, SOUTH, WEST, GO } = M;
/** A puzzle laid by hand on a 4 × 4 board (plots 0–15, row by row from the far side). */
function laid(parts: Partial<M.State>): M.State {
  return {
    size: 4,
    start: { at: 0, level: 3, dir: EAST },
    goal: 15,
    blocks: [],
    given: [],
    tray: [],
    answer: [],
    last: null,
    run: null,
    trouble: null,
    winner: null,
    ply: 0,
    stage: 1,
    ...parts,
  };
}
const drop = (height: number, rot: number, at = -1): M.Piece => ({ kind: "drop", height, rot, at });
const straight = (height: number, rot: number, at = -1): M.Piece => ({ kind: "straight", height, rot, at });
const corner = (height: number, rot: number, at = -1): M.Piece => ({ kind: "corner", height, rot, at });
const go = (state: M.State) => M.play(state, { from: -1, to: GO, extra: -1 })!;
/** Every move of the answer: each tray piece put at its plot and turn, then the drop. */
function answered(state: M.State) {
  let s = state;
  state.answer.forEach((a, j) => (s = M.play(s, { from: s.size * s.size + j, to: M.put(a.at, a.rot), extra: -1 })!));
  return s;
}

describe("marble drop maze: the marble's way", () => {
  test("a drop tower takes a marble at its height or above and lets it out a storey lower by its spout", () => {
    // Start (level 3) → plot 1: a drop tower 3 high, spout south → plot 5: a drop tower 2 high, spout east → 6: goal.
    const state = laid({ given: [drop(3, SOUTH, 1), drop(2, EAST, 5)], goal: 6 });
    const run = M.follow(state);
    expect(run.fault).toBeNull();
    expect(run.legs.map((l) => [l.at, l.out, l.dir])).toEqual([
      [0, 3, EAST],
      [1, 2, SOUTH],
      [5, 1, EAST],
      [6, -1, -1],
    ]);
    expect(go(state).winner).toBe(0);
  });
  test("a trough keeps the marble's level along its groove, straight on or round a corner", () => {
    // Start (3) → 1: straight east–west, 2 high → 2: corner west–south → 6: goal.
    const state = laid({ given: [straight(2, 1, 1), corner(1, 2, 2)], goal: 6 });
    const run = M.follow(state);
    expect(run.fault).toBeNull();
    expect(run.legs.map((l) => [l.at, l.out, l.dir])).toEqual([
      [0, 3, EAST],
      [1, 2, EAST],
      [2, 1, SOUTH],
      [6, -1, -1],
    ]);
  });
  test("every kind of trouble: off the board, an empty plot, a wall, a block, a closed groove, a loop", () => {
    const fault = (state: M.State) => {
      const after = go(state);
      expect(after.winner).toBe(1);
      return [after.trouble!.fault, after.trouble!.at];
    };
    expect(fault(laid({ start: { at: 0, level: 3, dir: NORTH } }))).toEqual(["off", -1]);
    expect(fault(laid({}))).toEqual(["floor", 1]);
    // A tower taller than the level the marble comes at is a wall.
    expect(fault(laid({ start: { at: 0, level: 1, dir: EAST }, given: [drop(2, SOUTH, 1)] }))).toEqual(["wall", 1]);
    expect(fault(laid({ blocks: [1] }))).toEqual(["block", 1]);
    // A straight groove running north–south does not open toward a marble coming from the west.
    expect(fault(laid({ given: [straight(2, 0, 1)] }))).toEqual(["closed", 1]);
    // Round a square of grooves back onto the first.
    expect(fault(laid({ given: [straight(2, 1, 1), corner(2, 2, 2), corner(2, 3, 6), corner(2, 0, 5)] }))).toEqual(["loop", 1]);
    // A drop tower whose spout points back sends the marble onto the start tower, which is taller: a wall.
    expect(fault(laid({ given: [drop(3, WEST, 1)] }))).toEqual(["wall", 0]);
  });
  test("a failed drop is made, not refused, and tells nothing more can be played until it is taken back", () => {
    const state = laid({});
    const after = go(state);
    expect(after).not.toBeNull();
    expect(after.ply).toBe(1);
    expect(after.run!.fault).toBe("floor");
    expect(M.moves(after)).toEqual([]);
    expect(M.play(after, { from: -1, to: GO, extra: -1 })).toBeNull();
    expect(M.marbleDrop.reason(after)).toMatch(/^실패! /);
  });
  test("the goal is a win only with every piece of the tray set and passed through", () => {
    const base = laid({ given: [drop(3, SOUTH, 1)], goal: 6, tray: [drop(2, EAST)], answer: [{ at: 5, rot: EAST }] });
    // Without the tray's piece the marble does not get home at all; with it, it does.
    expect(go(base).trouble!.fault).toBe("floor");
    const won = go(answered(base));
    expect(won.winner).toBe(0);
    expect(M.marbleDrop.reason(won)).toMatch(/^성공! /);
    // A way home that leaves a piece in the tray, or one set where the marble does not pass, is a failure.
    const short = laid({ given: [drop(3, SOUTH, 1), drop(2, EAST, 5)], goal: 6, tray: [straight(1, 0)] });
    const left = go(short);
    expect(left.trouble).toEqual({ fault: "left", at: 6, culprits: [0] });
    const aside = M.play(short, { from: 16, to: 12, extra: -1 })!;
    expect(go(aside).trouble).toEqual({ fault: "unused", at: 6, culprits: [0] });
  });
  test("the start tower's plot drops the marble as GO does", () => {
    const state = laid({ given: [drop(3, SOUTH, 1), drop(2, EAST, 5)], goal: 6 });
    expect(M.play(state, { from: -1, to: state.start.at, extra: -1 })!.winner).toBe(0);
    expect(M.play(state, { from: -1, to: 3, extra: -1 })).toBeNull();
  });
});

describe("marble drop maze: moves", () => {
  const state = laid({ given: [drop(3, SOUTH, 1)], goal: 6, blocks: [10], tray: [drop(2, EAST), straight(1, 1), corner(2, 1)], answer: [] });
  test("a piece is put, carried, turned and taken back; fixed things never move", () => {
    let s = M.play(state, { from: 16, to: 5, extra: -1 })!;
    expect(s.tray[0]).toEqual(drop(2, EAST, 5));
    expect(s.last).toEqual({ kind: "put", piece: 0, from: -1, to: 5 });
    s = M.play(s, { from: 5, to: 5, extra: -1 })!;
    expect(s.tray[0].rot).toBe(SOUTH);
    s = M.play(s, { from: 5, to: 9, extra: -1 })!;
    expect(s.tray[0].at).toBe(9);
    s = M.play(s, { from: 9, to: 16, extra: -1 })!;
    expect(s.tray[0]).toEqual(drop(2, SOUTH, -1));
    // Not onto the start, the goal, a block, a given piece, or another piece; nothing fixed moves.
    for (const to of [0, 6, 10, 1]) expect(M.play(state, { from: 16, to, extra: -1 })).toBeNull();
    const two = M.play(M.play(state, { from: 16, to: 5, extra: -1 })!, { from: 17, to: 4, extra: -1 })!;
    expect(M.play(two, { from: 18, to: 5, extra: -1 })).toBeNull();
    expect(M.play(two, { from: 4, to: 5, extra: -1 })).toBeNull();
    for (const from of [0, 1, 6, 10]) expect(M.play(state, { from, to: from, extra: -1 })).toBeNull();
    // Back to another piece's place in the tray, or a piece in the tray put twice, is refused.
    expect(M.play(two, { from: 5, to: 17, extra: -1 })).toBeNull();
    expect(M.play(two, { from: 16, to: 8, extra: -1 })).toBeNull();
  });
  test("a straight trough has two rotations: turning it goes 1 → 0 → 1, and a put at 2 or 3 is the same as 0 or 1", () => {
    let s = M.play(state, { from: 17, to: 5, extra: -1 })!;
    expect(s.tray[1].rot).toBe(1);
    s = M.play(s, { from: 5, to: 5, extra: -1 })!;
    expect(s.tray[1].rot).toBe(0);
    s = M.play(s, { from: 5, to: 5, extra: -1 })!;
    expect(s.tray[1].rot).toBe(1);
    expect(M.play(state, { from: 17, to: M.put(5, 3), extra: -1 })!.tray[1].rot).toBe(1);
    expect(M.play(state, { from: 17, to: M.put(5, 2), extra: -1 })!.tray[1].rot).toBe(0);
    // Setting the turn it already has changes nothing and is refused.
    expect(M.play(s, { from: 5, to: M.put(5, 3), extra: -1 })).toBeNull();
    expect(M.normal("corner", 7)).toBe(3);
    expect(M.normal("drop", -1)).toBe(3);
  });
  test("moves lists exactly what play accepts among the plain moves, and play never changes its input", () => {
    for (let seed = 1; seed <= 10; seed++) {
      let s = M.createGame(1 + (seed % 4), seededRandom(seed * 13));
      const random = seededRandom(seed);
      for (let step = 0; step < 6; step++) {
        const before = JSON.stringify(s),
          n = s.size * s.size,
          listed = M.moves(s),
          key = (m: { from: number; to: number }) => `${m.from}>${m.to}`,
          keys = new Set(listed.map(key));
        for (let from = -1; from < n + s.tray.length; from++)
          for (const to of [...Array.from({ length: n + s.tray.length }, (_, i) => i), GO]) {
            const next = M.play(s, { from, to, extra: -1 });
            expect(!!next, `${from}>${to}`).toBe(keys.has(`${from}>${to}`));
          }
        expect(JSON.stringify(s)).toBe(before);
        const pieces = listed.filter((m) => m.from >= 0);
        s = M.play(s, pieces[Math.floor(random() * pieces.length)])!;
      }
    }
  });
});

describe("marble drop maze: puzzles", () => {
  test("50 seeded puzzles of every stage come quickly, with one answer that wins, within the stage's band", () => {
    M.STAGES.forEach((stage, i) => {
      let slowest = 0;
      for (let seed = 1; seed <= 50; seed++) {
        const t0 = performance.now(),
          state = M.createGame(i + 1, seededRandom(seed * 7919 + i));
        slowest = Math.max(slowest, performance.now() - t0);
        expect(state.size).toBe(stage.size);
        expect(state.start.level).toBe(stage.spout);
        expect(state.tray.length).toBe(stage.tray);
        expect(state.tray.every((p) => p.at === -1)).toBe(true);
        const length = state.given.length + state.tray.length;
        expect(length).toBeGreaterThanOrEqual(stage.lo);
        expect(length).toBeLessThanOrEqual(stage.hi);
        // Nothing stands twice on a plot, and blocks stand off the answer's way.
        const used = [state.start.at, state.goal, ...state.blocks, ...state.given.map((p) => p.at), ...state.answer.map((a) => a.at)];
        expect(new Set(used).size).toBe(used.length);
        const found = M.solutions(state, state.tray, 3);
        expect(found.length).toBe(1);
        expect(found[0].map((p) => `${p.at}:${p.rot}`).sort()).toEqual(state.answer.map((a) => `${a.at}:${a.rot}`).sort());
        const won = go(answered(state));
        expect(won.winner).toBe(0);
        // The tray tells nothing of the way: it is sorted by kind and height.
        const order = ["drop", "straight", "corner"];
        for (let j = 1; j < state.tray.length; j++) {
          const a = state.tray[j - 1],
            b = state.tray[j];
          expect(order.indexOf(a.kind) * 10 + a.height).toBeLessThanOrEqual(order.indexOf(b.kind) * 10 + b.height);
        }
      }
      expect(slowest).toBeLessThan(100);
    });
  });
  test("the same random numbers lay the same puzzle", () => {
    expect(M.createGame(3, seededRandom(5))).toEqual(M.createGame(3, seededRandom(5)));
  });
  test("solutions counts a straight trough's two looks once each", () => {
    // Start (3) east → 1 empty → 2 goal: only a straight trough (or a drop tower spouting east) fits plot 1.
    const layout = { size: 4, start: { at: 0, level: 3, dir: EAST }, goal: 2, blocks: [], given: [] };
    expect(M.solutions(layout, [{ kind: "straight", height: 2 }], 5)).toEqual([[{ at: 1, kind: "straight", height: 2, rot: 1 }]]);
    expect(M.solutions(layout, [{ kind: "drop", height: 2 }], 5)).toEqual([[{ at: 1, kind: "drop", height: 2, rot: EAST }]]);
    // Two identical pieces swapped are the same answer.
    const longer = { ...layout, goal: 3 };
    expect(M.solutions(longer, [{ kind: "straight", height: 1 }, { kind: "straight", height: 1 }], 5).length).toBe(1);
  });
  test("the hint leads home from the puzzle as laid and from pieces set wrongly, ending with the drop", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const stage = 1 + (seed % 4),
        random = seededRandom(seed * 31);
      let state = M.createGame(stage, random);
      // Scatter some of the tray's pieces over empty plots, turned at random.
      const n = state.size * state.size;
      state.tray.forEach((_, j) => {
        if (random() < 0.5) return;
        const free = Array.from({ length: n }, (_, i) => i).filter((i) => M.empty(state, i));
        const to = free[Math.floor(random() * free.length)];
        state = M.play(state, { from: n + j, to: M.put(to, Math.floor(random() * 4)), extra: -1 })!;
      });
      let steps = 0;
      for (;;) {
        const move = M.hint(state);
        expect(move).not.toBeNull();
        state = M.play(state, move!)!;
        expect(state).not.toBeNull();
        if (move!.to === GO) break;
        expect(++steps).toBeLessThan(4 * state.tray.length + 4);
      }
      expect(state.winner).toBe(0);
      expect(M.hint(state)).toBeNull();
    }
  });
});

describe("marble drop maze: layout", () => {
  test("plots and tray places are found again under themselves, before the board or beside it", () => {
    for (const aspect of [1.1, 2]) {
      for (const size of [4, 5, 6]) {
        for (let plot = 0; plot < size * size; plot++) {
          const at = plotAt(size, plot, aspect);
          expect(plotUnder(size, at.x, at.z, aspect)).toBe(plot);
          expect(plotUnder(size, at.x + CELL * 0.45, at.z - CELL * 0.45, aspect)).toBe(plot);
        }
        const middle = boardMiddle(aspect);
        for (let j = 0; j < 5; j++) {
          const at = trayAt(size, 5, j, aspect);
          expect(plotUnder(size, at.x, at.z, aspect)).toBe(-1);
          // The tray lies before the board on a narrow canvas and at its right on a wide one.
          if (sideways(aspect)) expect(at.x).toBeGreaterThan(middle.x + (size * CELL) / 2);
          else expect(at.z).toBeGreaterThan(middle.z + (size * CELL) / 2);
        }
        expect(marbleSubject(size, aspect).half).toBeGreaterThan(0);
      }
    }
  });
});
