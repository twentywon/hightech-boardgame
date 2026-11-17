import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as M from "../src/games/marbledrop/rules";
import { CELL, TURNTABLE, WIDE, boardMiddle, cellAt, cellUnder, keyPlaces, marbleSubject, sideways, toBench, toLocal, trayPlaces, trayWidth } from "../src/games/marbledrop/layout";

const { OPEN: O, RAMP: R, FLAT: F, CORNER: C, NORTH, EAST, SOUTH, WEST, GO, CELLS } = M;
type Unit = [M.Kind, number?];
const units = (list: Unit[]) => list.map(([kind, face = 0]) => ({ kind, face }));
/** A column (bottom up) at a cell and level, or in the tray. */
const col = (list: Unit[], at = -1, level = at < 0 ? -1 : 0, yaw = 0): M.Piece => ({ shape: "column", units: units(list), at, level, yaw, paint: 0 });
const beam = (list: Unit[], at = -1, level = -1, yaw = 0): M.Piece => ({ shape: "beam", units: units(list), at, level, yaw, paint: 0 });
/**
 * A puzzle laid by hand on the 4 × 4 grid (cells row × 4 + column, row 0 the far side). The start stands on cell 0,
 * open frames under a ramp at level 2 that faces east; the target is on cell 15.
 */
function laid(parts: Partial<M.State>): M.State {
  return {
    start: col([[O], [O], [R, EAST]], 0),
    goal: 15,
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
const go = (state: M.State) => M.play(state, { from: -1, to: GO, extra: -1 })!;
const fault = (state: M.State) => {
  const after = go(state);
  expect(after.winner).toBe(1);
  return [after.trouble!.fault, after.trouble!.at];
};
const put = (state: M.State, j: number, cell: number) => M.attempt(state, { from: CELLS + j, to: cell, extra: -1 });
/** Every tray piece set where the answer has it. */
function answered(state: M.State) {
  return { ...state, tray: state.tray.map((p, j) => ({ ...p, ...state.answer[j] })) };
}

describe("marble drop maze: the marble's way", () => {
  test("down ramp after ramp, one level at a time, into the target", () => {
    // Start (level 2, east) → cell 1: an open frame over a ramp facing south → cell 5: open over a ramp facing east → 6.
    const state = laid({ given: [col([[O], [R, SOUTH], [O]], 1), col([[R, EAST], [O]], 5)], goal: 6 });
    const run = M.follow(state, M.world(state));
    expect(run.fault).toBeNull();
    expect(run.legs.map((l) => [l.kind, l.cell, l.level])).toEqual([
      ["start", 0, 2],
      ["fall", 1, 2],
      ["ramp", 1, 1],
      ["fall", 5, 1],
      ["ramp", 5, 0],
      ["goal", 6, 0],
    ]);
    const won = go(state);
    expect(won.winner).toBe(0);
    expect(M.marbleDrop.reason(won)).toMatch(/^성공! /);
  });
  test("a flat lets it roll on level, a corner turns it to its other opening", () => {
    // One flat open east–west, then air over a ramp facing south, then a fall into the target from level 1.
    const flat = laid({ given: [col([[O], [O], [F, EAST]], 1), col([[O], [R, SOUTH]], 2)], goal: 6 });
    expect(go(flat).winner).toBe(0);
    expect(M.follow(flat, M.world(flat)).legs.map((l) => l.kind)).toEqual(["start", "flat", "fall", "ramp", "fall", "goal"]);
    // A corner facing south opens south and west: the marble coming from the west turns south.
    const corner = laid({ given: [col([[O], [O], [C, SOUTH]], 1), col([[O], [R, EAST]], 5)], goal: 6 });
    const run = M.follow(corner, M.world(corner));
    expect(run.legs[1]).toMatchObject({ kind: "corner", cell: 1, level: 2, from: EAST, dir: SOUTH });
    expect(go(corner).winner).toBe(0);
    // The target also takes a marble rolling in level at level 0.
    expect(go(laid({ start: col([[R, EAST]], 0), goal: 1 })).winner).toBe(0);
  });
  test("every fault: off the grid, a wall, momentum, onto a flat, more than one level, the grid", () => {
    expect(fault(laid({ start: col([[O], [O], [R, NORTH]], 0) }))).toEqual(["off", null]);
    // A ramp entered from its side is a wall, and so is a flat closed toward the marble.
    expect(fault(laid({ given: [col([[O], [O], [R, SOUTH]], 1)] }))).toEqual(["wall", { cell: 1, level: 2 }]);
    expect(fault(laid({ given: [col([[O], [O], [F, NORTH]], 1)] }))).toEqual(["wall", { cell: 1, level: 2 }]);
    // Two flats in a row: the second is one horizontal unit too many.
    expect(fault(laid({ given: [col([[O], [O], [F, EAST]], 1), col([[O], [O], [F, WEST]], 2)] }))).toEqual(["momentum", { cell: 2, level: 2 }]);
    // Falling onto a flat or a corner.
    expect(fault(laid({ given: [col([[O], [F, NORTH]], 1)] }))).toEqual(["flat", { cell: 1, level: 1 }]);
    expect(fault(laid({ given: [col([[O], [C, NORTH]], 1)] }))).toEqual(["flat", { cell: 1, level: 1 }]);
    // Falling through air, or through an open frame, onto nothing one level down.
    expect(fault(laid({}))).toEqual(["drop", { cell: 1, level: 1 }]);
    expect(fault(laid({ given: [col([[R, EAST], [O], [O]], 1)] }))).toEqual(["drop", { cell: 1, level: 1 }]);
    // Down to the grid itself.
    expect(fault(laid({ start: col([[R, EAST]], 0) }))).toEqual(["floor", { cell: 1, level: 0 }]);
    // An open frame of the start's own column is no way down either.
    expect(fault(laid({ start: col([[O], [O], [O], [R, EAST]], 1), given: [col([[O], [O], [R, WEST]], 2)] }))).toEqual(["drop", { cell: 1, level: 1 }]);
  });
  test("the momentum count starts again at every ramp", () => {
    // Ramp, flat, ramp below, flat, then the target at level 0: one flat after each ramp is allowed.
    const state = laid({
      start: col([[O], [R, EAST]], 0),
      given: [col([[O], [F, EAST]], 1), col([[R, SOUTH]], 2), col([[F, NORTH]], 6)],
      goal: 10,
    });
    expect(M.follow(state, M.world(state)).legs.map((l) => l.kind)).toEqual(["start", "flat", "fall", "ramp", "flat", "goal"]);
    expect(go(state).winner).toBe(0);
  });
  test("a failed drop is made, not refused, and is the end until it is taken back", () => {
    const after = go(laid({}));
    expect(after.ply).toBe(1);
    expect(after.run!.fault).toBe("drop");
    expect(M.moves(after)).toEqual([]);
    expect(M.play(after, { from: -1, to: GO, extra: -1 })).toBeNull();
    expect(M.marbleDrop.reason(after)).toMatch(/^실패! /);
    // The start's own cell drops the marble as GO does; another cell does not.
    const state = laid({});
    expect(M.play(state, { from: -1, to: 0, extra: -1 })!.run).not.toBeNull();
    expect(M.play(state, { from: -1, to: 3, extra: -1 })).toBeNull();
  });
  test("the target is a win only with every piece placed and passed", () => {
    const way = [col([[O], [R, SOUTH], [O]], 1), col([[R, EAST], [O]], 5)];
    // A piece left in the tray.
    const left = go(laid({ given: way, goal: 6, tray: [col([[O]])] }));
    expect(left.trouble).toMatchObject({ fault: "left", tray: [0], given: [] });
    // A tray piece set aside, and a given piece the marble never reaches.
    const aside = laid({ given: way, goal: 6, tray: [col([[O]])] });
    const placed = M.play(aside, { from: CELLS, to: 12, extra: -1 })!;
    expect(go(placed).trouble).toMatchObject({ fault: "unused", tray: [0], given: [] });
    expect(go(laid({ given: [...way, col([[F, NORTH]], 13)], goal: 6 })).trouble).toMatchObject({ fault: "unused", tray: [], given: [2] });
    // A piece the marble only falls through counts as passed.
    expect(go(laid({ given: [col([[O], [R, SOUTH]], 1), col([[R, EAST]], 5), col([[O]], 5, 1)], goal: 6 })).winner).toBe(0);
  });
});

describe("marble drop maze: building", () => {
  test("columns stack on top of their cell, three pieces at most", () => {
    let s = laid({ tray: [col([[O]]), col([[O], [O]]), col([[R, NORTH]]), col([[O]])] });
    for (const [j, level] of [
      [0, 0],
      [1, 1],
      [2, 3],
    ]) {
      const next = put(s, j, 4) as M.State;
      expect(next.tray[j]).toMatchObject({ at: 4, level });
      s = next;
    }
    expect(put(s, 3, 4)).toBe("crowded");
    expect(M.refusal(s, { from: CELLS + 3, to: 4, extra: -1 })).toBe("한 칸에는 세 개까지만 쌓을 수 있습니다.");
    // Only the top of the stack comes off: a press on the cell takes the top piece, never the one under it.
    expect(M.play(s, { from: 4, to: CELLS + 0, extra: -1 })).toBeNull();
    const lifted = M.play(s, { from: 4, to: CELLS + 2, extra: -1 })!;
    expect(lifted.tray[2]).toMatchObject({ at: -1, level: -1, yaw: 0 });
  });
  test("nothing goes on or over the start or the target, and nothing too high", () => {
    const s = laid({ tray: [col([[O]]), beam([[O], [O], [O]])], given: [col([[O], [O]], 1), col([[O], [O]], 4)] });
    expect(put(s, 0, 0)).toBe("reserved");
    expect(put(s, 0, 15)).toBe("reserved");
    // A beam over the start's cell, lying on two columns beside it, is refused too.
    expect(M.attempt(s, { from: CELLS + 1, to: M.put(1, 0), extra: -1 })).toBe("reserved");
    const tall = laid({ tray: [col([[O], [O], [O], [O], [O]]), col([[O], [O], [O], [O], [O]])] });
    const one = put(tall, 0, 5) as M.State;
    expect(put(one, 1, 5)).toBe("high");
  });
  test("a beam lies where two columns of its height end, may hang over air, never past the edge", () => {
    const base = laid({ given: [col([[O]], 5), col([[O]], 6)], tray: [beam([[O], [O], [F, EAST]])] });
    // Middle over cell 6: it rests on the columns of 5 and 6 at level 1 and hangs over 7.
    const lying = put(base, 0, 6) as M.State;
    expect(lying.tray[0]).toMatchObject({ at: 6, level: 1, yaw: 0 });
    // Over the edge.
    expect(M.attempt(base, { from: CELLS, to: M.put(4, 0), extra: -1 })).toBe("edge");
    // One support only: no way round fits there either.
    const lame = laid({ given: [col([[O], [O]], 5), col([[O]], 6)], tray: [beam([[O], [O]])] });
    expect(put(lame, 0, 5)).toBe("beamSupport");
    expect(M.refusal(lame, { from: CELLS, to: 5, extra: -1 })).toBe("다리는 높이가 같은 기둥 두 개 위에 걸쳐야 합니다.");
    // Nothing stands or lies on a beam.
    const more = { ...lying, tray: [...lying.tray, col([[O]]), beam([[O], [O]])] };
    expect(put(more, 1, 5)).toBe("onBeam");
    expect(M.attempt(more, { from: CELLS + 2, to: M.put(5, 0), extra: -1 })).toBe("beamOnBeam");
    // The columns under a beam cannot be lifted: a press there takes the beam.
    const held = laid({ given: [col([[O]], 6)], tray: [col([[O]]), beam([[O], [O]])] });
    const both = put(put(held, 0, 5) as M.State, 1, 5) as M.State;
    expect(both.tray[1]).toMatchObject({ at: 5, level: 1 });
    expect(M.play(both, { from: 5, to: CELLS + 0, extra: -1 })).toBeNull();
    expect(M.play(both, { from: 5, to: CELLS + 1, extra: -1 })!.tray[1].at).toBe(-1);
  });
  test("a beam set down turns to lie the way its supports run; a tap turns it about its middle, on to the next way that fits", () => {
    // Supports run north–south (cells 5 and 9): a beam taken from the tray (yaw 0, east–west) lies north–south.
    const s = laid({ given: [col([[O]], 5), col([[O]], 9)], tray: [beam([[O], [R, NORTH], [O]])] });
    const lying = put(s, 0, 9) as M.State;
    expect(lying.tray[0]).toMatchObject({ at: 9, level: 1, yaw: 1 });
    // A tap: a quarter more (west–east) does not fit, half a turn does (the same cells, read from the other end).
    const turned = M.play(lying, { from: 9, to: 9, extra: -1 })!;
    expect(turned.tray[0]).toMatchObject({ at: 9, yaw: 3 });
    expect(turned.last!.kind).toBe("turn");
    // A beam of two on supports east–west has no other way to lie about its middle: the tap is refused.
    const two = laid({ given: [col([[O]], 5), col([[O]], 6)], tray: [beam([[O], [O]])] });
    const set = put(two, 0, 5) as M.State;
    expect(M.play(set, { from: 5, to: 5, extra: -1 })).toBeNull();
    expect(M.refusal(set, { from: 6, to: 6, extra: -1 })).toBe("다리는 높이가 같은 기둥 두 개 위에 걸쳐야 합니다.");
  });
  test("a column turns a quarter at a tap; fixed pieces never move", () => {
    const s = put(laid({ given: [col([[F, NORTH]], 6)], tray: [col([[R, NORTH]])] }), 0, 5) as M.State;
    const turned = M.play(s, { from: 5, to: 5, extra: -1 })!;
    expect(turned.tray[0].yaw).toBe(1);
    expect(M.play(s, { from: 6, to: 6, extra: -1 })).toBeNull();
    expect(M.attempt(s, { from: 6, to: 7, extra: -1 })).toBe("fixed");
    expect(M.attempt(s, { from: 0, to: 7, extra: -1 })).toBe("fixed");
    // A column of open frames looks the same every way: turning it changes nothing and is refused.
    const plain = put(laid({ tray: [col([[O]])] }), 0, 5) as M.State;
    expect(M.play(plain, { from: 5, to: 5, extra: -1 })).toBeNull();
  });
  test("the rules themselves: floating columns and beams on one support are not a board", () => {
    const start = col([[R, EAST]], 0);
    expect(M.survey([start, col([[O]], 5, 1)], 15)).toBe("floating");
    expect(M.survey([start, col([[O]], 5), beam([[O], [O]], 5, 1)], 15)).toBe("beamSupport");
    expect(M.survey([start, col([[O]], 5), col([[O]], 6), beam([[O], [O]], 5, 1), col([[O]], 5, 2)], 15)).toBe("onBeam");
    expect(typeof M.survey([start, col([[O]], 5), col([[O]], 6), beam([[O], [O]], 5, 1)], 15)).toBe("object");
  });
  test("moves lists exactly what play accepts among the plain moves, and play never changes its input", () => {
    for (let seed = 1; seed <= 8; seed++) {
      let s = M.createGame(1 + (seed % 4), seededRandom(seed * 13));
      const random = seededRandom(seed);
      for (let step = 0; step < 6; step++) {
        const before = JSON.stringify(s),
          listed = M.moves(s),
          keys = new Set(listed.map((m) => `${m.from}>${m.to}`));
        // Each move once: the screen plays a choice only when exactly one move answers it.
        expect(keys.size).toBe(listed.length);
        for (let from = -1; from < CELLS + s.tray.length; from++)
          for (const to of [...Array.from({ length: CELLS + s.tray.length }, (_, i) => i), GO]) expect(!!M.play(s, { from, to, extra: -1 }), `${from}>${to}`).toBe(keys.has(`${from}>${to}`));
        expect(JSON.stringify(s)).toBe(before);
        const pieces = listed.filter((m) => m.from >= 0);
        if (!pieces.length) break;
        s = M.play(s, pieces[Math.floor(random() * pieces.length)])!;
      }
    }
  });
});

/** Every way of setting `loose` on a layout that wins, found by trying every place of every piece (for small cases). */
function bruteForce(layout: M.Layout, loose: M.Piece[]) {
  // Voxels the fixed pieces fill, and the cells nothing else may use: a place that meets them is no place at all.
  const taken = new Set([layout.start, ...layout.given].flatMap((p) => M.voxelsOf(p).map((v) => M.vox(v.cell, v.level)))),
    columns = new Set([layout.start, ...layout.given].filter((p) => p.shape === "column").flatMap((p) => M.voxelsOf(p).map((v) => M.vox(v.cell, v.level)))),
    cellsOf = new Map<M.Place, Set<number>>(),
    // The voxels a place needs filled under it (one for a column, one a unit for a beam), and how many the fixed fill.
    under = new Map<M.Place, { below: number[]; held: number; need: number }>();
  const placesOf = (p: M.Piece) => {
    const out: M.Place[] = [],
      seen = new Set<string>();
    for (let at = 0; at < CELLS; at++)
      for (let level = 0; level < 6; level++)
        for (let yaw = 0; yaw < 4; yaw++) {
          const key = M.contentKey(p, at, level, yaw),
            voxels = M.voxelsAt(p, at, level, yaw);
          if (!key || !voxels || seen.has(key)) continue;
          seen.add(key);
          if (voxels.some((v) => v.cell === layout.goal || v.cell === layout.start.at || taken.has(M.vox(v.cell, v.level)))) continue;
          const place = { at, level, yaw },
            below = level === 0 ? [] : p.shape === "column" ? [M.vox(at, level - 1)] : voxels.map((v) => M.vox(v.cell, level - 1));
          cellsOf.set(place, new Set(voxels.map((v) => M.vox(v.cell, v.level))));
          under.set(place, { below, held: below.filter((v) => columns.has(v)).length, need: p.shape === "column" ? (level === 0 ? 0 : 1) : 2 });
          out.push(place);
        }
    return out;
  };
  const lists = loose.map(placesOf),
    found = new Set<string>(),
    tryOne = (places: M.Place[]) => {
      const tray = loose.map((p, j) => ({ ...p, ...places[j] })),
        list = [layout.start, ...layout.given, ...tray],
        world = M.survey(list, layout.goal);
      if (typeof world === "string") return;
      const run = M.follow(layout, world);
      if (run.fault || list.some((_, id) => !run.passed.has(id))) return;
      // Identical pieces swapped are one way.
      found.add(
        tray
          .map((p) => `${M.unitsKey(p)}=${M.contentKey(p, p.at, p.level, p.yaw)}`)
          .sort()
          .join("|"),
      );
    };
  /** Whether a place can stand, the other loose piece (if any) at `other` helping to hold it up. */
  const stands = (place: M.Place, other?: M.Place) => {
    const u = under.get(place)!;
    return u.held + (other ? u.below.filter((v) => cellsOf.get(other)!.has(v)).length : 0) >= u.need;
  };
  if (loose.length === 1) for (const a of lists[0]) stands(a) && tryOne([a]);
  else
    for (const a of lists[0])
      for (const b of lists[1]) {
        const mine = cellsOf.get(a)!;
        if (stands(a, b) && stands(b, a) && ![...cellsOf.get(b)!].some((v) => mine.has(v))) tryOne([a, b]);
      }
  return found.size;
}

describe("marble drop maze: puzzles", () => {
  test("seeded puzzles of every stage come quickly, have exactly one answer, and that answer wins", () => {
    const times: number[][] = [];
    M.STAGES.forEach((stage, i) => {
      times.push([]);
      for (let seed = 1; seed <= 25; seed++) {
        const t0 = performance.now(),
          state = M.createGame(i + 1, seededRandom(seed * 7919 + i));
        times[i].push(performance.now() - t0);
        const all = [...state.given, ...state.tray],
          count = all.length + 2;
        expect(count).toBeGreaterThanOrEqual(stage.pieces[0]);
        expect(count).toBeLessThanOrEqual(stage.pieces[1]);
        expect(state.tray.length).toBeGreaterThanOrEqual(stage.tray[0]);
        expect(state.tray.length).toBeLessThanOrEqual(stage.tray[1]);
        expect(state.tray.every((p) => p.at === -1 && p.yaw === 0)).toBe(true);
        // What the stage has: stacks from the second, a beam in the tray from the third.
        const done = answered(state).tray,
          placed = [...state.given, ...done];
        expect(placed.some((p) => p.shape === "column" && p.level > 0)).toBe(stage.stacks);
        expect(placed.some((p) => p.shape === "beam")).toBe(stage.beams);
        if (stage.beams) expect(state.tray.some((p) => p.shape === "beam")).toBe(true);
        expect(placed.every((p) => p.units.length >= 1 && p.units.length <= (p.shape === "column" ? M.LONGEST : M.BEAM_LONGEST) && (p.shape === "column" || p.units.length >= 2))).toBe(true);
        // The board as given keeps the rules (no fixed piece stands on one of the tray's).
        expect(() => M.world(state)).not.toThrow();
        // One answer, and it is the one stored.
        const found = M.solutions(state, state.tray, 3);
        expect(found.length).toBe(1);
        expect(found[0].map((a, j) => M.contentKey(state.tray[j], a.at, a.level, a.yaw))).toEqual(state.answer.map((a, j) => M.contentKey(state.tray[j], a.at, a.level, a.yaw)));
        expect(go(answered(state)).winner).toBe(0);
      }
    });
    const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
    // About 200 ms in a browser is the budget; here they take a few milliseconds on average.
    for (const list of times) {
      expect(mean(list)).toBeLessThan(100);
      expect(Math.max(...list)).toBeLessThan(600);
    }
  });
  test("the same random numbers lay the same puzzle", () => {
    expect(M.createGame(3, seededRandom(5))).toEqual(M.createGame(3, seededRandom(5)));
    expect(M.createGame(4, seededRandom(6))).not.toEqual(M.createGame(4, seededRandom(7)));
  });
  test("the solver finds exactly the ways a brute-force search over every place finds", () => {
    let several = 0,
      cases = 0;
    for (let seed = 1; cases < 12 && seed < 80; seed++) {
      const random = seededRandom(seed * 101),
        state = M.createGame(1 + (seed % 3), random),
        full = answered(state),
        pieces = [...full.given, ...full.tray],
        // A piece with nothing resting on it, or two (the second also bare once the first is gone).
        bare = (list: M.Piece[], p: M.Piece) => {
          const top = new Set(M.voxelsOf(p).map((v) => `${v.cell}:${v.level + 1}`));
          return !list.some((q) => q !== p && M.voxelsOf(q).some((v) => top.has(`${v.cell}:${v.level}`)));
        },
        first = pieces.filter((p) => bare(pieces, p));
      if (!first.length) continue;
      const a = first[Math.floor(random() * first.length)],
        rest = pieces.filter((p) => p !== a),
        second = random() < 0.6 ? rest.filter((p) => bare(rest, p) && p.units.length <= 3) : [],
        loose = second.length ? [a, second[Math.floor(random() * second.length)]] : [a],
        given = pieces.filter((p) => !loose.includes(p)),
        layout = { start: state.start, goal: state.goal, given },
        solved = M.solutions(layout, loose, 1000).length,
        brute = bruteForce(layout, loose);
      expect(solved, `seed ${seed}`).toBe(brute);
      expect(solved).toBeGreaterThanOrEqual(1);
      if (solved > 1) several++;
      cases++;
    }
    expect(cases).toBe(12);
    expect(several).toBeGreaterThan(0);
  }, 60000);
  test("solutions counts identical pieces swapped once", () => {
    // Start (level 2, east) → cell 1: a fixed column [open, ramp facing south] → cell 5 needs a ramp at level 0
    // facing south (to the target on 9), and the open frame may stand on cell 5 over it or on the fixed column at 1.
    const layout = { start: col([[O], [O], [R, EAST]], 0), goal: 9, given: [col([[O], [R, SOUTH]], 1)] },
      two = [col([[O]]), col([[R, NORTH]])];
    expect(M.solutions(layout, two, 10).length).toBe(2);
    expect(bruteForce(layout, two)).toBe(2);
    // With two identical frames, both places are used and swapping them is the same answer.
    const three = [col([[O]]), col([[O]]), col([[R, NORTH]])],
      found = M.solutions(layout, three, 10);
    expect(found.length).toBe(1);
    expect(found[0].map((a) => [a.at, a.level]).sort()).toEqual([
      [1, 2],
      [5, 0],
      [5, 1],
    ]);
  });
  test("the hint leads home from the puzzle as laid and from pieces set wrongly, ending with the drop", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = seededRandom(seed * 31);
      let state = M.createGame(1 + (seed % 4), random);
      // Scatter: a few random legal moves (puts, carries, turns, lifts).
      for (let k = 0; k < 2 + (seed % 5); k++) {
        const pieces = M.moves(state).filter((m) => m.from >= 0);
        if (!pieces.length) break;
        state = M.play(state, pieces[Math.floor(random() * pieces.length)])!;
      }
      let steps = 0;
      for (;;) {
        const move = M.hint(state);
        expect(move).not.toBeNull();
        const next = M.play(state, move!);
        expect(next, JSON.stringify(move)).not.toBeNull();
        state = next!;
        if (move!.to === GO) break;
        expect(++steps).toBeLessThan(6 * state.tray.length + 6);
      }
      expect(state.winner).toBe(0);
      expect(M.hint(state)).toBeNull();
    }
  });
});

describe("marble drop maze: layout", () => {
  test("cells are found again under themselves at any turn, and the tray keeps clear of the turntable", () => {
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
      const tray = [col([[O], [O], [O], [O], [O]]), col([[O]]), beam([[O], [O], [O]]), beam([[O], [O]]), col([[O], [O]])],
        places = trayPlaces(tray, aspect),
        middle = boardMiddle(aspect);
      places.forEach((p, j) => {
        expect(Math.hypot(p.x - middle.x, p.z - middle.z)).toBeGreaterThan(TURNTABLE);
        // No two pieces of a row overlap.
        places.forEach((q, k) => {
          if (k <= j || Math.abs(p.z - q.z) > 0.01) return;
          expect(Math.abs(p.x - q.x)).toBeGreaterThan((trayWidth(tray[j]) + trayWidth(tray[k])) / 2 - WIDE);
        });
      });
      if (sideways(aspect)) expect(places.every((p) => p.x > middle.x + TURNTABLE)).toBe(true);
      else expect(places.every((p) => p.z > middle.z + TURNTABLE)).toBe(true);
      expect(keyPlaces(tray, 0, aspect)).toHaveLength(CELLS + tray.length);
      expect(marbleSubject(aspect, 9).tilt).toBeLessThan(1.4);
    }
  });
});
