import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as M from "../src/games/marbledrop/rules";
import { CELL, TURNTABLE, boardMiddle, cellAt, cellUnder, keyPlaces, marbleSubject, sideways, tallest, toBench, toLocal, trayPlaces, traySlot } from "../src/games/marbledrop/layout";

const { OPEN, RAMP, FLAT, CORNER, CROSS, HANG, NORTH, EAST, SOUTH, WEST, UP, DOWN, GO, CELLS } = M;
/** Kit towers by letter. */
const K = Object.fromEntries(M.KIT.map((k, i) => [k.id, i])) as Record<"A" | "B" | "C" | "D" | "E" | "F", number>;
/** A tower of the kit at a place (or in the tray), standing, on its head or lying on its side `roll`. */
const tower = (kind: number, at = -1, level = at < 0 ? -1 : 0, yaw = 0, posture: "up" | "down" | number = "up"): M.Tower => ({
  kind,
  at,
  level,
  yaw,
  lying: typeof posture === "number",
  inverted: posture === "down",
  roll: typeof posture === "number" ? posture : 0,
});
/**
 * A puzzle laid by hand on the 4 × 4 grid (cells row × 4 + column, row 0 the far side). The start is D on cell 0
 * turned so that its top ramp (level 1) sends the marble east into cell 1 at level 1; the target is on cell 15.
 */
const START = tower(K.D, 0, 0, 3);
function laid(parts: Partial<M.State>): M.State {
  return { start: 0, goal: 15, given: [START], tray: [], answer: [], last: null, run: null, trouble: null, winner: null, ply: 0, stage: 1, ...parts };
}
const go = (state: M.State) => M.play(state, { from: -1, to: GO, extra: -1 })!;
const fault = (state: M.State) => {
  const after = go(state);
  expect(after.winner).toBe(1);
  return [after.trouble!.fault, after.trouble!.at];
};
/** Every tray tower set where the answer has it. */
const answered = (state: M.State) => ({ ...state, tray: state.tray.map((t, j) => ({ ...t, ...state.answer[j] })) });
const ways = (unit: M.Unit, pose: M.Pose) => M.exitsOf(unit, pose);
const none = [-1, -1, -1, -1, -1, -1];

describe("marble drop maze: the kit", () => {
  test("nine towers of heights 5, 4, 4, 3, 3, 2, 2, 1, 1, every unit kind used, no red cap", () => {
    const heights = M.KIT.flatMap((k) => Array<number>(k.count).fill(k.units.length)).sort((a, b) => b - a);
    expect(heights).toEqual([5, 4, 4, 3, 3, 2, 2, 1, 1]);
    const kinds = new Set(M.KIT.flatMap((k) => k.units.map((u) => u.kind)));
    for (const kind of [OPEN, RAMP, FLAT, CORNER, CROSS, HANG]) expect(kinds.has(kind as M.Kind)).toBe(true);
    for (const k of M.KIT) {
      const c = parseInt(k.paint.slice(1), 16),
        [r, g, b] = [c >> 16, (c >> 8) & 255, c & 255];
      expect(r > 180 && g < 90 && b < 90, k.id).toBe(false);
    }
    // Ramps within a tower face set ways apart, so that turning the tower turns them together.
    for (const k of M.KIT.filter((k) => k.units.filter((u) => u.kind === RAMP).length > 1)) expect(new Set(k.units.filter((u) => u.kind === RAMP).map((u) => u.face)).size).toBeGreaterThan(1);
  });
  test("a tower of more than one unit never makes the same thing at two yaws (answers are counted by what they make)", () => {
    for (let kind = 0; kind < M.KIT.length; kind++) {
      if (M.KIT[kind].units.length < 2) continue;
      for (const posture of ["up", "down", 0, 1, 2, 3] as const) {
        const keys = [0, 1, 2, 3].map((yaw) => M.contentKey(tower(kind, 5, 1, yaw, posture), 5, 1, yaw)).filter(Boolean);
        expect(new Set(keys).size, `${M.KIT[kind].id} ${posture}`).toBe(keys.length);
      }
    }
  });
});

describe("marble drop maze: units turned with their towers", () => {
  const up = (yaw = 0): M.Pose => ({ lying: false, roll: 0, yaw }),
    down = (yaw = 0): M.Pose => ({ lying: false, inverted: true, roll: 0, yaw }),
    lying = (roll: number, yaw = 0): M.Pose => ({ lying: true, roll, yaw });
  test("faces: a yaw turns the sides clockwise; on its head north and south and top and foot swap; lying, the roll side faces down", () => {
    expect([0, 1, 2, 3, UP, DOWN].map((f) => M.faceIn(up(1), f))).toEqual([1, 2, 3, 0, UP, DOWN]);
    expect([0, 1, 2, 3, UP, DOWN].map((f) => M.faceIn(down(0), f))).toEqual([2, 1, 0, 3, DOWN, UP]);
    expect([0, 1, 2, 3, UP, DOWN].map((f) => M.faceIn(down(1), f))).toEqual([3, 2, 1, 0, DOWN, UP]);
    // Tipped over toward its east side: east faces down, west up, its top points east, its foot west.
    expect([0, 1, 2, 3, UP, DOWN].map((f) => M.faceIn(lying(EAST), f))).toEqual([0, DOWN, 2, UP, EAST, WEST]);
    // The same turned a quarter: it lies north–south, its top toward the south.
    expect([0, 1, 2, 3, UP, DOWN].map((f) => M.faceIn(lying(EAST, 1), f))).toEqual([1, DOWN, 3, UP, SOUTH, NORTH]);
    expect(M.axisOf(lying(EAST, 1))).toBe(SOUTH);
  });
  test("standing: a ramp is a descent out of its face, channels carry the marble, a hanging crossing is air", () => {
    expect(ways({ kind: RAMP, face: NORTH }, up(1))).toEqual([-1, -1, -1, -1, EAST, -1]);
    expect(M.wayKind(UP, EAST)).toBe("descent");
    expect(ways({ kind: FLAT, face: NORTH }, up(0))).toEqual([SOUTH, -1, NORTH, -1, -1, -1]);
    expect(ways({ kind: CORNER, face: SOUTH }, up(0))).toEqual([-1, -1, WEST, SOUTH, -1, -1]);
    expect(ways({ kind: CROSS, face: 0 }, up(0))).toEqual([SOUTH, WEST, NORTH, EAST, -1, -1]);
    expect(M.airIn({ kind: HANG, face: 0 }, up(2))).toBe(true);
    expect(ways({ kind: HANG, face: 0 }, up(2))).toEqual(none);
    expect(M.airIn({ kind: OPEN, face: 0 }, up(0))).toBe(true);
  });
  test("on its head: a ramp is blocked from every side and no floor; channels are air; a hanging crossing becomes a crossing", () => {
    for (let face = 0; face < 4; face++) {
      expect(ways({ kind: RAMP, face }, down(face)).filter((x, from) => x >= 0 && M.wayKind(from, x) !== "blocked")).toEqual([]);
      expect(M.airIn({ kind: RAMP, face }, down(face))).toBe(false);
    }
    for (const kind of [FLAT, CORNER, CROSS] as M.Kind[]) expect(M.airIn({ kind, face: 1 }, down(1))).toBe(true);
    expect(M.airIn({ kind: HANG, face: 0 }, down(3))).toBe(false);
    expect(ways({ kind: HANG, face: 0 }, down(3))).toEqual([SOUTH, WEST, NORTH, EAST, -1, -1]);
  });
  test("lying: a ramp is entered along the axis and turns, drops or is blocked by where its exit points; channels are air", () => {
    for (let roll = 0; roll < 4; roll++)
      for (let yaw = 0; yaw < 4; yaw++) {
        const pose = lying(roll, yaw),
          axis = M.axisOf(pose);
        for (let face = 0; face < 4; face++) {
          const ex = ways({ kind: RAMP, face }, pose),
            entries = ex.flatMap((x, from) => (x >= 0 ? [from] : []));
          // Its only way in is the face its top points to.
          expect(entries).toEqual([axis]);
          const out = ex[axis],
            kind = M.wayKind(axis, out);
          if (face === roll) expect([out, kind]).toEqual([DOWN, "fall"]);
          else if (face === (roll + 2) % 4) expect([out, kind]).toEqual([UP, "blocked"]);
          else {
            expect(kind).toBe("level");
            expect(out % 2).not.toBe(axis % 2);
          }
        }
        for (const kind of [FLAT, CORNER, CROSS, HANG] as M.Kind[]) expect(M.airIn({ kind, face: 2 }, pose)).toBe(true);
      }
  });
  test("a tower's units stand up from its foot, on its head from its top, and lie in a row with the middle over its cell", () => {
    expect(M.voxelsOf(tower(K.C, 5, 1)).map((v) => [v.cell, v.level, v.unit])).toEqual([
      [5, 1, 0],
      [5, 2, 1],
      [5, 3, 2],
    ]);
    expect(M.voxelsOf(tower(K.C, 5, 0, 0, "down")).map((v) => [v.level, v.unit])).toEqual([
      [2, 0],
      [1, 1],
      [0, 2],
    ]);
    // C lying on its west side turned so that its top points east: units from cell 4 to cell 6, the middle on 5.
    expect(M.voxelsOf(tower(K.C, 5, 2, 0, EAST)).map((v) => [v.cell, v.level])).toEqual([
      [4, 2],
      [5, 2],
      [6, 2],
    ]);
  });
});

describe("marble drop maze: the marble's way", () => {
  test("down the start's ramp, through air, into the target from one level up", () => {
    const state = laid({ goal: 1 }),
      run = M.follow(state, M.world(state));
    expect(run.fault).toBeNull();
    expect(run.legs.map((l) => [l.kind, l.cell, l.level])).toEqual([
      ["start", 0, 2],
      ["ramp", 0, 1],
      ["fall", 1, 1],
      ["goal", 1, 0],
    ]);
    const won = go(state);
    expect(won.winner).toBe(0);
    expect(M.marbleDrop.reason(won)).toMatch(/^성공! /);
  });
  test("a descent at a tower's middle (through its empty cube), a crossing, then the target rolled into at level 0", () => {
    // Cell 1: C turned so that its foot ramp (north at yaw 0) faces east; its hanging crossing over it is air, so the
    // marble rolling in at level 1 falls onto the ramp and leaves east at level 0 into cell 2: D's crossing, then cell 3.
    const state = laid({ given: [START, tower(K.C, 1, 0, 1), tower(K.D, 2, 0)], goal: 3 }),
      run = M.follow(state, M.world(state));
    expect(run.fault).toBeNull();
    expect(run.legs.map((l) => l.kind)).toEqual(["start", "ramp", "fall", "ramp", "flat", "goal"]);
    expect(run.legs[4]).toMatchObject({ cell: 2, level: 0, from: WEST, dir: EAST });
  });
  test("every fault: off the grid, a wall, momentum, onto a channel, more than one level, the grid, a tower left", () => {
    expect(fault(laid({ given: [tower(K.D, 3, 0, 3)], start: 3 }))).toEqual(["off", null]);
    // A ramp entered from its side: B's ramp at level 1.
    expect(fault(laid({ given: [START, tower(K.B, 1, 0)] }))).toEqual(["wall", { cell: 1, level: 1 }]);
    // Falling onto a crossing (F on its head at cell 1, level 0).
    expect(fault(laid({ given: [START, tower(K.F, 1, 0, 0, "down")] }))).toEqual(["flat", { cell: 1, level: 0 }]);
    // Falling two levels.
    expect(fault(laid({}))).toEqual(["drop", { cell: 1, level: 0 }]);
    // E as the start at level 0 sends the marble out level onto air at level 0: down onto the grid.
    expect(fault(laid({ given: [tower(K.E, 0, 0, 2)] }))).toEqual(["floor", { cell: 1, level: 0 }]);
    // Two crossings at level 1 after the start's ramp: F on its head on E (cell 1), C on its head (cell 2).
    expect(fault(laid({ given: [START, tower(K.E, 1, 0), tower(K.F, 1, 1, 0, "down"), tower(K.C, 2, 0, 0, "down")] }))).toEqual(["momentum", { cell: 2, level: 1 }]);
    // Home, but with a tower still in the tray.
    const left = go(laid({ goal: 1, tray: [tower(K.F)] }));
    expect([left.winner, left.trouble?.fault, left.trouble?.tray]).toEqual([1, "left", [0]]);
  });
  test("a lying ramp: in along its axis and turned across it, or dropped through its foot", () => {
    const pose = { lying: true, roll: NORTH, yaw: 1 },
      shape = M.shapeOf(K.E, pose),
      axis = M.axisOf(pose);
    // E's ramp faces west; lying with its top east (axis east), the ramp is entered from the east and its exit
    // (west → turned by yaw 1 → north) runs across: a level turn.
    expect(axis).toBe(EAST);
    expect(shape.exits[0][EAST]).toBe(NORTH);
  });
  test("a failed drop is made, not refused, and is the end until it is taken back", () => {
    const after = go(laid({}));
    expect(after.ply).toBe(1);
    expect(after.run?.legs.length).toBeGreaterThan(1);
    expect(M.moves(after)).toEqual([]);
    expect(M.hint(after)).toBeNull();
    expect(M.marbleDrop.reason(after)).toMatch(/^실패! /);
  });
  test("any arrangement that brings the marble home wins: a tower it does not pass is no fault", () => {
    const state = laid({ goal: 1, tray: [tower(K.F)] }),
      placed = M.play(state, { from: CELLS, to: 12, extra: -1 })!;
    expect(placed.tray[0].at).toBe(12);
    expect(go(placed).winner).toBe(0);
  });
});

describe("marble drop maze: building", () => {
  const put = (state: M.State, j: number, cell: number) => M.attempt(state, { from: CELLS + j, to: cell, extra: -1 });
  test("standing towers stack on top of their cell, three towers at most", () => {
    let state = laid({ tray: [tower(K.E), tower(K.F), tower(K.D), tower(K.F)] });
    for (let j = 0; j < 3; j++) state = M.play(state, { from: CELLS + j, to: 9, extra: -1 })!;
    expect(state.tray.slice(0, 3).map((t) => t.level)).toEqual([0, 1, 2]);
    expect(put(state, 3, 9)).toBe("crowded");
    // Only the top one comes off.
    expect(M.attempt(state, { from: 9, to: CELLS, extra: -1 })).toBe(null);
    expect(M.play(state, { from: 9, to: CELLS + 2, extra: -1 })?.tray[2].at).toBe(-1);
  });
  test("nothing goes on or over the start or the target, and fixed towers never move", () => {
    const state = laid({ tray: [tower(K.E)] });
    expect(put(state, 0, 0)).toBe("reserved");
    expect(put(state, 0, 15)).toBe("reserved");
    expect(M.attempt(state, { from: 0, to: 5, extra: -1 })).toBe("fixed");
    expect(M.refusal(state, { from: CELLS, to: 0, extra: -1 })).toBe("출발점과 도착점 위에는 아무것도 놓을 수 없습니다.");
  });
  test("a lying tower lies on two standing towers ending at its level, may hang over air, never past the edge", () => {
    const lyingC = tower(K.C, -1, -1, 0, NORTH),
      base = laid({ given: [START, tower(K.E, 8, 0), tower(K.E, 10, 0)], tray: [lyingC] });
    // C lying on its north side lies along north–south at yaw 0 (its top north); turned on to east–west it fits on 8–10.
    const on = M.play(base, { from: CELLS, to: 9, extra: -1 })!;
    expect(on.tray[0]).toMatchObject({ at: 9, level: 1 });
    expect(M.voxelsOf(on.tray[0]).map((v) => v.cell).sort((a, b) => a - b)).toEqual([8, 9, 10]);
    // One support only: refused.
    const one = laid({ given: [START, tower(K.E, 8, 0)], tray: [lyingC] });
    expect(put(one, 0, 9)).toBe("support");
    // On the grid: no supports at all.
    expect(put(laid({ tray: [lyingC] }), 0, 9)).toBe("support");
    // Past the edge: a lying tower of three centred on a corner cell never fits.
    expect(M.play(laid({ tray: [lyingC] }), { from: CELLS, to: 12, extra: -1 })).toBeNull();
    // Nothing stands on it, and no lying tower on it.
    const standOn = { ...on, tray: [...on.tray, tower(K.F)] };
    expect(put(standOn, 1, 9)).toBe("onLying");
    const twice = { ...on, tray: [...on.tray, tower(K.B, -1, -1, 0, EAST)] };
    expect(M.attempt(twice, { from: CELLS + 1, to: M.put(9, 0, 2), extra: -1 })).toBe("lyingOnLying");
  });
  test("a tap turns a standing tower a quarter; a lying one goes on to the next way that fits; the posture never changes", () => {
    let state = M.play(laid({ tray: [tower(K.D)] }), { from: CELLS, to: 5, extra: -1 })!;
    state = M.play(state, { from: 5, to: 5, extra: -1 })!;
    expect(state.tray[0].yaw).toBe(1);
    expect(M.attempt(state, { from: 5, to: M.put(5, 2, 2), extra: -1 })).toBe("posture");
    const lyingC = tower(K.C, -1, -1, 0, NORTH),
      on = M.play(laid({ given: [START, tower(K.E, 8, 0), tower(K.E, 10, 0)], tray: [lyingC] }), { from: CELLS, to: 9, extra: -1 })!,
      turned = M.play(on, { from: 9, to: 9, extra: -1 })!;
    // East–west both ways: the half turn is the only other way it fits.
    expect((turned.tray[0].yaw - on.tray[0].yaw + 4) % 4).toBe(2);
  });
  test("the rules themselves: floating and crowded boards are refused", () => {
    expect(M.survey([START, tower(K.E, 5, 1)], 0, 15, 2)).toBe("floating");
    expect(M.survey([START, tower(K.E, 5, 0), tower(K.E, 5, 0)], 0, 15, 3)).toBe("overlap");
  });
  test("moves lists exactly what play accepts among the plain moves, and play never changes its input", () => {
    const state = M.createGame(3, seededRandom(4)),
      listed = M.moves(state),
      key = (m: { from: number; to: number }) => `${m.from}>${m.to}`;
    const frozen = JSON.stringify(state);
    for (let from = -1; from < CELLS + state.tray.length; from++)
      for (let to = 0; to < CELLS + state.tray.length; to++) {
        const ok = M.play(state, { from, to, extra: -1 }) !== null;
        expect(listed.some((m) => key(m) === key({ from, to })), `${from}>${to}`).toBe(ok);
      }
    expect(JSON.stringify(state)).toBe(frozen);
  });
});

/** Every legal arrangement of the tray, built in every order by putting towers where they land, that wins. */
function bruteForce(state: M.State) {
  const found = new Set<string>();
  const walk = (s: M.State) => {
    const left = s.tray.flatMap((t, j) => (t.at < 0 ? [j] : []));
    if (!left.length) {
      if (!M.judge(s).trouble)
        found.add(
          s.tray
            .map((t) => M.contentKey(t, t.at, t.level, t.yaw))
            .sort()
            .join("|"),
        );
      return;
    }
    for (const j of left)
      for (let cell = 0; cell < CELLS; cell++)
        for (let yaw = 0; yaw < 4; yaw++) {
          const next = M.play(s, { from: CELLS + j, to: M.put(cell, yaw, M.postureOf(s.tray[j])), extra: -1 });
          if (next) walk({ ...next, last: null });
        }
  };
  walk(state);
  return found.size;
}

describe("marble drop maze: puzzles", () => {
  test("seeded puzzles of every stage come quickly, are laid as the stage says, have one answer, and win", () => {
    const times: number[][] = [];
    M.STAGES.forEach((stage, i) => {
      times.push([]);
      for (let seed = 1; seed <= 25; seed++) {
        const t0 = performance.now(),
          state = M.createGame(i + 1, seededRandom(seed * 7919 + i));
        times[i].push(performance.now() - t0);
        expect(state.tray.length).toBeGreaterThanOrEqual(stage.tray[0]);
        expect(state.tray.length).toBeLessThanOrEqual(stage.tray[1]);
        expect(state.tray.every((t) => t.at === -1 && t.yaw === 0)).toBe(true);
        // The kit: never more of a tower than it holds.
        const all = [...state.given, ...state.tray];
        M.KIT.forEach((k, kind) => expect(all.filter((t) => t.kind === kind).length).toBeLessThanOrEqual(k.count));
        if (stage.lying === "none") expect(all.some((t) => t.lying)).toBe(false);
        if (stage.lying === "always") expect(state.tray.some((t) => t.lying)).toBe(true);
        if (stage.inverted === "none") expect(all.some((t) => t.inverted)).toBe(false);
        const done = answered(state);
        if (stage.stacks) expect(done.tray.some((t) => !t.lying && t.level > 0)).toBe(true);
        else expect(done.tray.some((t) => t.level > 0)).toBe(false);
        expect(() => M.world(state)).not.toThrow();
        // Every tray tower is one the marble passes in the answer it was built with.
        const run = M.follow(done, M.world(done)),
          passed = new Set(run.legs.map((l) => l.piece));
        done.tray.forEach((_, j) => expect(passed.has(M.ids(done).tray(j))).toBe(true));
        expect(M.solutions(state, state.tray, 3).length).toBeLessThanOrEqual(stage.answers);
        expect(go(done).winner).toBe(0);
      }
    });
    const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
    // About 200 ms in a browser is the budget.
    for (const list of times) expect(mean(list)).toBeLessThan(150);
  }, 120000);
  test("the same random numbers lay the same puzzle", () => {
    expect(M.createGame(3, seededRandom(5))).toEqual(M.createGame(3, seededRandom(5)));
    expect(M.createGame(4, seededRandom(6))).not.toEqual(M.createGame(4, seededRandom(7)));
  });
  test("the solver counts exactly the winning arrangements a brute-force search over every place finds", () => {
    let several = 0,
      cases = 0;
    for (let seed = 1; cases < 14 && seed < 80; seed++) {
      const random = seededRandom(seed * 101),
        source = M.createGame(1 + (seed % 3), random),
        done = answered(source);
      // One or two of its towers that nothing rests on left loose, and now and then a spare kit tower besides.
      const everything = [...done.given.filter((t) => t.at !== done.start), ...done.tray],
        bare = (list: M.Tower[], t: M.Tower) => {
          const over = new Set(M.voxelsOf(t).map((v) => `${v.cell}:${v.level + 1}`));
          return !list.some((q) => q !== t && M.voxelsOf(q).some((v) => over.has(`${v.cell}:${v.level}`)));
        },
        first = everything.find((t) => bare(everything, t) && M.KIT[t.kind].units.length <= 4)!,
        rest = everything.filter((t) => t !== first),
        second = seed % 2 ? rest.find((t) => bare(rest, t) && M.KIT[t.kind].units.length <= 3) : undefined,
        loose = [first, ...(second ? [second] : [])],
        given = [...done.given, ...done.tray].filter((t) => !loose.includes(t)),
        used = [...given, ...loose].map((t) => t.kind),
        spare = M.KIT.findIndex((k, kind) => used.filter((u) => u === kind).length < k.count && k.units.length <= 2),
        tray = [...loose.map((t) => ({ ...t, at: -1, level: -1, yaw: 0 })), ...(seed % 3 === 0 && loose.length === 1 && spare >= 0 ? [tower(spare)] : [])],
        state = { ...source, given, tray, answer: [] as M.Place[] },
        solved = M.solutions(state, tray, 100000).length,
        brute = bruteForce(state);
      expect(solved, `seed ${seed}`).toBe(brute);
      expect(solved).toBeGreaterThanOrEqual(1);
      if (solved > 1) several++;
      cases++;
    }
    expect(cases).toBe(14);
    expect(several).toBeGreaterThan(0);
  }, 120000);
  test("solutions counts identical towers swapped once", () => {
    // From the start east into cell 1 at level 1: E (its ramp west, turned to face east) on cell 1 takes it from
    // above to the target on cell 2.
    const state = laid({ goal: 2 });
    expect(M.solutions(state, [tower(K.E)], 50)).toEqual([[{ at: 1, level: 0, yaw: 2 }]]);
    expect(bruteForce({ ...state, tray: [tower(K.E)] })).toBe(1);
    // A puzzle whose tray holds two of the same tower: the two set the other way round are the same answer.
    let checked = 0;
    for (let seed = 1; seed < 400 && checked < 2; seed++) {
      const puzzle = M.createGame(1, seededRandom(seed));
      if (puzzle.tray[0].kind !== puzzle.tray[1].kind) continue;
      expect(M.solutions(puzzle, puzzle.tray, 50).length).toBe(1);
      expect(bruteForce(puzzle)).toBe(1);
      checked++;
    }
    expect(checked).toBe(2);
  }, 60000);
  test("the hint leads home from the puzzle as laid and from towers set wrongly, ending with the drop", () => {
    for (let seed = 1; seed <= 32; seed++) {
      const random = seededRandom(seed * 31);
      let state = M.createGame(1 + (seed % 4), random);
      for (let k = 0; k < 2 + (seed % 4); k++) {
        const plain = M.moves(state).filter((m) => m.from >= 0);
        if (!plain.length) break;
        state = M.play(state, plain[Math.floor(random() * plain.length)])!;
      }
      let steps = 0;
      for (;;) {
        const move = M.hint(state);
        expect(move).not.toBeNull();
        const next = M.play(state, move!);
        expect(next, JSON.stringify(move)).not.toBeNull();
        state = next!;
        if (move!.to === GO) break;
        expect(++steps).toBeLessThan(4 * state.tray.length + 8);
      }
      expect(state.winner).toBe(0);
      expect(M.hint(state)).toBeNull();
    }
  }, 120000);
});

describe("marble drop maze: layout", () => {
  test("cells are found again under themselves at any turn, the tray keeps clear of the turntable, the camera frames the tallest stack", () => {
    for (const aspect of [1.1, 2]) {
      for (const turn of [0, 0.4, Math.PI / 2, 2.5]) {
        for (let cell = 0; cell < CELLS; cell++) {
          const at = cellAt(cell, turn, aspect);
          expect(cellUnder(at.x, at.z, turn, aspect)).toBe(cell);
          const back = toLocal(at.x, at.z, turn, aspect),
            again = toBench(back.x, back.z, turn, aspect);
          expect(again.x).toBeCloseTo(at.x, 9);
          expect(again.z).toBeCloseTo(at.z, 9);
        }
        expect(cellUnder(boardMiddle(aspect).x + 2.95 * CELL, boardMiddle(aspect).z, turn, aspect)).toBe(-1);
      }
      const tray = [tower(K.A), tower(K.B, -1, -1, 0, 1), tower(K.C, -1, -1, 0, "down"), tower(K.D), tower(K.F)],
        places = trayPlaces(tray, aspect),
        middle = boardMiddle(aspect);
      places.forEach((p, j) => {
        expect(Math.hypot(p.x - middle.x, p.z - middle.z) - traySlot(tray[j]) / 2).toBeGreaterThan(TURNTABLE);
        places.forEach((q, k) => {
          if (k <= j) return;
          const apart = Math.max(Math.abs(p.x - q.x), Math.abs(p.z - q.z));
          expect(apart).toBeGreaterThanOrEqual((traySlot(tray[j]) + traySlot(tray[k])) / 2 - 1e-9);
        });
      });
      if (sideways(aspect)) expect(places.every((p) => p.x > middle.x + TURNTABLE)).toBe(true);
      else expect(places.every((p) => p.z > middle.z + TURNTABLE)).toBe(true);
      expect(keyPlaces(tray, 0, aspect)).toHaveLength(CELLS + tray.length);
      expect(marbleSubject(aspect, 9).tilt).toBeLessThan(1.4);
      expect(marbleSubject(aspect, 0, 6).height).toBeGreaterThan(marbleSubject(aspect, 0, 3).height);
    }
    const state = M.createGame(4, seededRandom(3));
    expect(tallest(state)).toBeGreaterThanOrEqual(4);
  });
});
