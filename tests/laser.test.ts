import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as L from "../src/games/laser/rules";
import { CARRY, PLATE_HALF, TRAY_STEP, cellAt, cellUnder, keyPlaces, laserSubject, onPlate, sideways, trayBox, trayPlaces } from "../src/games/laser/layout";

const { NORTH: N, EAST: E, SOUTH: S, WEST: W, GO, CELLS } = L;
const piece = (kind: L.Kind, at: number, dir = 0, locked = true): L.Piece => ({ kind, at, dir, locked });
/** A puzzle laid by hand on the 5 × 5 board (cells row × 5 + column, row 0 the far side). */
function laid(parts: Partial<L.State>): L.State {
  return { given: [], tray: [], answer: [], turns: [], need: 1, fired: false, last: null, winner: null, ply: 0, stage: 1, ...parts };
}
const cell = (row: number, column: number) => row * 5 + column;
/** The beam over a board given as pieces (the laser first). */
const beamOf = (pieces: L.Piece[]) => {
  const board: (L.Piece | null)[] = new Array(CELLS).fill(null);
  for (const p of pieces) board[p.at] = p;
  return L.traceBoard(board, pieces[0].at);
};

describe("laser reflection: what each piece does to the beam", () => {
  test("a laser stops a beam that comes back to it", () => {
    for (let t = 0; t < 4; t++) expect(L.meet("laser", 0, t)).toEqual({ out: [], lit: false, touched: true });
  });
  test("a target-mirror lights from its target face, stops on the face beside it, and turns the beam at its mirror", () => {
    for (let d = 0; d < 4; d++)
      for (let t = 0; t < 4; t++) {
        const enters = L.back(t),
          m = L.meet("target", d, t);
        expect(m.touched).toBe(true);
        if (enters === d) expect(m).toEqual({ out: [], lit: true, touched: true });
        else if (enters === (d + 1) % 4) expect(m).toEqual({ out: [], lit: false, touched: true });
        else {
          // Turned a quarter, out through the mirror's other open side.
          expect(m.lit).toBe(false);
          expect(m.out).toHaveLength(1);
          const out = m.out[0];
          expect(Math.abs(out - t) % 2).toBe(1);
          expect([(d + 2) % 4, (d + 3) % 4]).toContain(out);
          expect(out).not.toBe(enters);
        }
      }
    // Turned to the north (0), the target looks north and the mirror runs from north-west to south-east.
    expect(L.meet("target", 0, S).lit).toBe(true);
    expect(L.meet("target", 0, E).out).toEqual([S]);
    expect(L.meet("target", 0, N).out).toEqual([W]);
    expect(L.meet("target", 0, W).out).toEqual([]);
  });
  test("a double mirror turns every beam a quarter, alike turned half round", () => {
    const backslash: Record<number, number> = { [N]: W, [E]: S, [S]: E, [W]: N },
      slash: Record<number, number> = { [N]: E, [E]: N, [S]: W, [W]: S };
    for (let d = 0; d < 4; d++)
      for (let t = 0; t < 4; t++) {
        const m = L.meet("mirror", d, t);
        expect(m).toEqual({ out: [(d % 2 ? slash : backslash)[t]], lit: false, touched: true });
        expect(L.meet("mirror", d + 2, t)).toEqual(m);
      }
  });
  test("a splitter sends a beam on and turns a copy of it", () => {
    for (let d = 0; d < 4; d++)
      for (let t = 0; t < 4; t++) {
        const m = L.meet("splitter", d, t);
        expect(m.touched).toBe(true);
        expect(m.out.sort()).toEqual([t, L.reflect(d, t)].sort());
      }
  });
  test("a checkpoint passes a beam along its slot only, and counts as touched only then", () => {
    for (let d = 0; d < 4; d++)
      for (let t = 0; t < 4; t++) {
        const along = d % 2 === t % 2;
        expect(L.meet("checkpoint", d, t)).toEqual(along ? { out: [t], lit: false, touched: true } : { out: [], lit: false, touched: false });
      }
  });
  test("a blocker lets the beam over it and is never touched", () => {
    for (let t = 0; t < 4; t++) expect(L.meet("blocker", 0, t)).toEqual({ out: [t], lit: false, touched: false });
  });
  test("turns are counted as they act", () => {
    expect(L.period("laser")).toBe(4);
    expect(L.period("target")).toBe(4);
    expect(L.period("mirror")).toBe(2);
    expect(L.period("splitter")).toBe(2);
    expect(L.period("checkpoint")).toBe(2);
    expect(L.period("blocker")).toBe(1);
    expect(L.norm("mirror", 3)).toBe(1);
    expect(L.norm("target", -1)).toBe(3);
  });
});

describe("laser reflection: the beam", () => {
  test("a beam bent by mirrors lights a target and ends there", () => {
    // Laser at a1 firing east; a mirror at d1 turns it south; a target at d4 looks north.
    const beam = beamOf([piece("laser", cell(0, 0), E), piece("mirror", cell(0, 3), 0), piece("target", cell(3, 3), N)]);
    expect(beam.lit).toEqual([cell(3, 3)]);
    expect(beam.touched[cell(0, 3)]).toBe(true);
    expect(beam.segments).toHaveLength(2);
    expect(beam.segments[0].from).toEqual([L.MUZZLE, 0]);
    expect(beam.segments[0].to).toEqual([3, 0]);
    // Stopped at the target's face, a third of a cell before its middle.
    expect(beam.segments[1].to[0]).toBe(3);
    expect(beam.segments[1].to[1]).toBeCloseTo(3 - 0.33, 5);
    expect(beam.loose).toEqual([]);
  });
  test("a beam leaving the board ends at the plate's edge, and its free run is a loose end", () => {
    const beam = beamOf([piece("laser", cell(2, 0), E)]);
    expect(beam.segments).toEqual([{ from: [L.MUZZLE, 2], to: [4 + L.OUT, 2], start: 0, leaves: true }]);
    expect(beam.loose).toEqual([{ cells: [cell(2, 1), cell(2, 2), cell(2, 3), cell(2, 4)], dir: E }]);
  });
  test("a splitter's two beams are both followed", () => {
    // Laser at c1 firing south into a splitter at c3 ("\"): on to c5, and turned east to e3.
    const beam = beamOf([piece("laser", cell(0, 2), S), piece("splitter", cell(2, 2), 0), piece("target", cell(4, 2), N), piece("target", cell(2, 4), W)]);
    expect(beam.lit.sort()).toEqual([cell(2, 4), cell(4, 2)].sort());
    expect(beam.strikes.filter((s) => s.kind === "split")).toHaveLength(1);
    expect(beam.segments).toHaveLength(3);
  });
  test("a checkpoint across the beam stops it; along it the beam goes on", () => {
    const across = beamOf([piece("laser", cell(2, 0), E), piece("checkpoint", cell(2, 2), 0), piece("target", cell(2, 4), E)]);
    expect(across.lit).toEqual([]);
    expect(across.touched[cell(2, 2)]).toBe(false);
    const along = beamOf([piece("laser", cell(2, 0), E), piece("checkpoint", cell(2, 2), 1), piece("target", cell(2, 4), W)]);
    expect(along.lit).toEqual([cell(2, 4)]);
    expect(along.touched[cell(2, 2)]).toBe(true);
    expect(along.strikes.some((s) => s.kind === "pass" && s.cell === cell(2, 2))).toBe(true);
  });
  test("a beam passes over a blocker", () => {
    const beam = beamOf([piece("laser", cell(2, 0), E), piece("blocker", cell(2, 2)), piece("target", cell(2, 4), W)]);
    expect(beam.lit).toEqual([cell(2, 4)]);
    expect(beam.touched[cell(2, 2)]).toBe(false);
  });
  test("a loop of mirrors fed by a splitter ends, and a piece struck from two sides is told", () => {
    // A ring of mirrors b2 d2 d4 b4 with a splitter at b3 on its west side, fed from a laser at a3: the light turned
    // north runs round the ring back into the splitter, which sends it round again and out to the east.
    const beam = beamOf([
      piece("laser", cell(2, 0), E),
      piece("splitter", cell(2, 1), 1),
      piece("mirror", cell(1, 1), 1),
      piece("mirror", cell(1, 3), 0),
      piece("mirror", cell(3, 3), 1),
      piece("mirror", cell(3, 1), 0),
    ]);
    expect(beam.segments.length).toBeLessThan(12);
    // The splitter is entered from the west (the laser) and from the south (the ring).
    expect(beam.ways[cell(2, 1)]).toBe((1 << W) | (1 << S));
    expect([cell(1, 1), cell(1, 3), cell(3, 3), cell(3, 1)].every((c) => beam.touched[c])).toBe(true);
  });
});

describe("laser reflection: moves and the win", () => {
  const puzzle = () =>
    laid({
      given: [piece("laser", cell(0, 0), E), piece("blocker", cell(0, 2)), piece("target", cell(3, 3), E, false)],
      tray: [piece("mirror", -1, 0, false)],
      answer: [{ at: cell(0, 3), dir: 0 }],
      turns: [E, 0, N],
    });
  test("pieces are set, turned, carried and sent back; nothing is changed in place", () => {
    const s = puzzle(),
      before = JSON.stringify(s);
    const put = L.play(s, { from: CELLS, to: cell(4, 4), extra: -1 })!;
    expect(put.tray[0].at).toBe(cell(4, 4));
    expect(put.last).toEqual({ kind: "put", side: "tray", index: 0 });
    const turned = L.play(put, { from: cell(4, 4), to: cell(4, 4), extra: -1 })!;
    expect(turned.tray[0].dir).toBe(1);
    expect(L.play(turned, { from: cell(4, 4), to: cell(4, 4), extra: -1 })!.tray[0].dir).toBe(0);
    const carried = L.play(turned, { from: cell(4, 4), to: cell(1, 1), extra: -1 })!;
    expect(carried.tray[0]).toMatchObject({ at: cell(1, 1), dir: 1 });
    const back = L.play(carried, { from: cell(1, 1), to: CELLS, extra: -1 })!;
    expect(back.tray[0].at).toBe(-1);
    expect(back.ply).toBe(4);
    expect(JSON.stringify(s)).toBe(before);
  });
  test("what is refused says why", () => {
    const s = puzzle();
    expect(L.play(s, { from: CELLS, to: cell(0, 2), extra: -1 })).toBeNull();
    expect(L.refusal(s, { from: CELLS, to: cell(0, 2), extra: -1 })).toBe("고무 마개가 꽂힌 자리에는 아무것도 놓을 수 없습니다.");
    expect(L.refusal(s, { from: CELLS, to: cell(3, 3), extra: -1 })).toBe("이미 부품이 놓인 자리입니다.");
    expect(L.refusal(s, { from: cell(3, 3), to: cell(2, 2), extra: -1 })).toBe("처음부터 놓인 부품은 옮길 수 없습니다.");
    expect(L.refusal(s, { from: cell(0, 0), to: cell(0, 0), extra: -1 })).toBe("방향이 정해진 부품이라 돌릴 수 없습니다.");
    const locked = laid({ ...s, tray: [piece("mirror", cell(4, 4), 1, true)] });
    expect(L.refusal(locked, { from: cell(4, 4), to: cell(4, 4), extra: -1 })).toBe("방향이 정해진 부품이라 돌릴 수 없습니다.");
    // A given piece whose turn is free turns.
    expect(L.play(s, { from: cell(3, 3), to: cell(3, 3), extra: -1 })!.given[2].dir).toBe(2);
  });
  test("firing is never a failure: the beam is shown until a piece moves", () => {
    const s = puzzle(),
      fired = L.play(s, { from: -1, to: GO, extra: -1 })!;
    expect(fired.fired).toBe(true);
    expect(fired.winner).toBeNull();
    expect(L.laserPuzzle.hint(fired)).toContain("쟁반에 아직 부품이 남아 있습니다");
    // Fired once, the laser waits for something to change.
    expect(L.play(fired, { from: -1, to: GO, extra: -1 })).toBeNull();
    const moved = L.play(fired, { from: CELLS, to: cell(4, 4), extra: -1 })!;
    expect(moved.fired).toBe(false);
    // A tap on the laser fires it as well.
    expect(L.play(moved, { from: -1, to: cell(0, 0), extra: -1 })!.fired).toBe(true);
  });
  test("the win needs every tray piece set, every piece touched and exactly the targets asked for", () => {
    const s = puzzle(),
      set = L.play(s, { from: CELLS, to: cell(0, 3), extra: -1 })!;
    // The target is turned east: the beam reaches its mirror side and goes off the board unlit.
    const wrong = L.play(set, { from: -1, to: GO, extra: -1 })!;
    expect(wrong.winner).toBeNull();
    expect(L.judge(set).beam.lit).toEqual([]);
    const right = L.play(L.play(set, { from: cell(3, 3), to: L.put(cell(3, 3), N), extra: -1 })!, { from: -1, to: GO, extra: -1 })!;
    expect(right.winner).toBe(0);
    expect(L.laserPuzzle.reason(right)).toMatch(/^성공!/);
    // A piece the beam misses spoils it, the blocker aside.
    const missed = laid({ ...right, given: [...right.given, piece("mirror", cell(4, 0))], winner: null, fired: false });
    expect(L.judge(missed).won).toBe(false);
    expect(L.judge(missed).untouched).toHaveLength(1);
    // Too many targets lit spoils it too.
    const greedy = laid({
      given: [piece("laser", cell(0, 2), S), piece("splitter", cell(2, 2), 0), piece("target", cell(4, 2), N), piece("target", cell(2, 4), W)],
      need: 1,
    });
    expect(L.judge(greedy).won).toBe(false);
    expect(L.judge({ ...greedy, need: 2 }).won).toBe(true);
    // A checkpoint met across its slot is not passed.
    const blocked = laid({ given: [piece("laser", cell(2, 0), E), piece("checkpoint", cell(2, 2), 0), piece("target", cell(2, 4), W)] });
    expect(L.judge(blocked).unpassed).toEqual([1]);
  });
});

describe("laser reflection: the solver", () => {
  test("it finds every answer, and the one a hand-laid puzzle has", () => {
    const given = [piece("laser", cell(0, 0), E), piece("target", cell(3, 3), N)],
      found = L.solutions(given, [{ kind: "mirror", dir: 0, locked: false }], 1, 5)!;
    expect(found).toEqual([{ tray: [{ at: cell(0, 3), dir: 0 }], given: [E, N] }]);
    // With the target's turn free it may also be lit from the other side? Not from the mirror's way: one answer still.
    const free = L.solutions([given[0], { ...given[1], locked: false }], [{ kind: "mirror", dir: 0, locked: false }], 1, 5)!;
    expect(free.length).toBeGreaterThanOrEqual(1);
    for (const answer of free) {
      const board = laid({ given: [given[0], { ...given[1], dir: answer.given[1] }], tray: [piece("mirror", answer.tray[0].at, answer.tray[0].dir, false)] });
      expect(L.judge(board).won).toBe(true);
    }
  });
  test("its answers are exactly those a brute force over every placement finds, on small puzzles", () => {
    const random = seededRandom(7);
    for (let k = 0; k < 6; k++) {
      const made = L.createGame(1, random),
        // Every other puzzle with all its turns freed, so that it has more than one answer to find.
        s = k % 2 ? { ...made, given: made.given.map((p, g) => (g && p.kind !== "blocker" ? { ...p, locked: false } : p)) } : made,
        found = L.solutions(s.given, s.tray, s.need, 50)!,
        empty = Array.from({ length: CELLS }, (_, c) => c).filter((c) => !s.given.some((p) => p.at === c)),
        wins = new Set<string>();
      const fixedTurns = s.given.map((p) => (p.locked ? [p.dir] : Array.from({ length: L.period(p.kind) }, (_, d) => d)));
      const each = (j: number, used: Set<number>, places: { at: number; dir: number }[], dirs: number[]) => {
        if (j === s.tray.length) {
          const board = laid({ given: s.given.map((p, g) => ({ ...p, dir: dirs[g] })), tray: s.tray.map((p, i) => ({ ...p, ...places[i] })), need: s.need });
          if (L.judge(board).won)
            wins.add(
              s.tray
                .map((p, i) => `${p.kind}@${places[i].at}:${L.norm(p.kind, places[i].dir)}`)
                .sort()
                .join("|") + `#${dirs.map((d, g) => L.norm(s.given[g].kind, d)).join(",")}`,
            );
          return;
        }
        for (const at of empty) {
          if (used.has(at)) continue;
          used.add(at);
          for (let d = 0; d < L.period(s.tray[j].kind); d++) each(j + 1, used, [...places, { at, dir: d }], dirs);
          used.delete(at);
        }
      };
      const turns = (g: number, dirs: number[]) => {
        if (g === s.given.length) return each(0, new Set(), [], dirs);
        for (const d of fixedTurns[g]) turns(g + 1, [...dirs, d]);
      };
      turns(0, []);
      expect(found.length).toBe(wins.size);
      if (s === made) expect(wins.size).toBe(1);
    }
  });
});

describe("laser reflection: puzzles", () => {
  test.each(L.STAGES.map((spec, i) => [i + 1, spec] as const))("stage %i: random puzzles with one answer only, made quickly, solved by the hint", (stage, spec) => {
    const random = seededRandom(1000 + stage),
      times: number[] = [],
      count = 12;
    // The first puzzle warms the engine up and is not timed.
    L.createGame(stage, seededRandom(stage));
    for (let k = 0; k < count; k++) {
      const t0 = performance.now(),
        s = L.createGame(stage, random);
      times.push(performance.now() - t0);
      expect(s.stage).toBe(stage);
      expect(s.need).toBe(spec.need);
      expect(s.tray.length).toBeGreaterThanOrEqual(spec.tray[0]);
      expect(s.tray.length).toBeLessThanOrEqual(spec.tray[1]);
      expect(s.given[0].kind).toBe("laser");
      expect(s.tray.every((p) => p.at === -1)).toBe(true);
      expect(s.given.filter((p) => p.kind === "blocker").length).toBeLessThanOrEqual(spec.blockers[1]);
      // One answer, the one the puzzle keeps.
      const found = L.solutions(s.given, s.tray, s.need, 2)!;
      expect(found).toHaveLength(1);
      const answer = laid({ ...s, given: s.given.map((p, g) => ({ ...p, dir: s.turns[g] })), tray: s.tray.map((p, j) => ({ ...p, ...s.answer[j] })) }),
        verdict = L.judge(answer);
      expect(verdict.won).toBe(true);
      if (spec.splitters[0]) expect([...s.given, ...s.tray].some((p) => p.kind === "splitter")).toBe(true);
      // The hardest stage has the beam enter some piece from two sides.
      if (spec.twice) expect(verdict.beam.ways.some((w, c) => (w & (w - 1)) !== 0 && answer.given.concat(answer.tray).some((p) => p.at === c && p.kind !== "laser"))).toBe(true);
      // The hint's moves, followed, win.
      let state: L.State | null = s;
      for (const move of L.solve(s)) state = state && L.play(state, move);
      expect(state?.winner).toBe(0);
    }
    // Under a tenth of a second for a puzzle (a few hundredths on a quiet machine), with room for a busy one.
    times.sort((a, b) => a - b);
    expect(times[count >> 1]).toBeLessThan(100);
    expect(times.reduce((sum, t) => sum + t, 0) / count).toBeLessThan(200);
  });
  test("the hint finds its way from a muddled board too", () => {
    const random = seededRandom(31);
    for (const stage of [2, 3, 4]) {
      let s = L.createGame(stage, random);
      // Every tray piece set somewhere free, turned at random, and a given piece turned wrongly where it may turn.
      s.tray.forEach((_, j) => {
        const free = Array.from({ length: CELLS }, (_, c) => c).filter((c) => L.occupancy(s)[c] < 0);
        const next = L.play(s, { from: CELLS + j, to: L.put(free[Math.floor(random() * free.length)], Math.floor(random() * 4)), extra: -1 });
        if (next) s = next;
      });
      s = L.play(s, { from: -1, to: GO, extra: -1 }) ?? s;
      let state: L.State | null = s;
      for (let guard = 0; state && state.winner === null && guard < 40; guard++) {
        const move = L.hint(state);
        if (!move) break;
        state = L.play(state, move);
      }
      expect(state?.winner).toBe(0);
    }
  });
});

describe("laser reflection: layout", () => {
  test("cells and the tray are where the view and the browser tests look for them", () => {
    for (const aspect of [1, 1.3, 2.2]) {
      for (let c = 0; c < CELLS; c++) {
        const at = cellAt(c, aspect);
        expect(cellUnder(at.x, at.z, aspect)).toBe(c);
        expect(cellUnder(at.x + 0.45, at.z - 0.45, aspect)).toBe(c);
        expect(onPlate(at.x, at.z, aspect)).toBe(true);
      }
      const places = trayPlaces(5, aspect),
        box = trayBox(aspect);
      for (const p of places) {
        expect(cellUnder(p.x, p.z, aspect)).toBe(-1);
        expect(onPlate(p.x, p.z, aspect)).toBe(false);
        expect(Math.abs(p.x - box.x)).toBeLessThan(box.wide / 2);
        expect(Math.abs(p.z - box.z)).toBeLessThan(box.deep / 2);
      }
      expect(Math.hypot(places[1].x - places[0].x, places[1].z - places[0].z)).toBeCloseTo(TRAY_STEP, 6);
      expect(keyPlaces(3, aspect)).toHaveLength(CELLS + 3);
      const subject = laserSubject(aspect);
      expect(subject.half).toBeGreaterThan(sideways(aspect) ? PLATE_HALF + 0.8 : PLATE_HALF);
    }
    expect(CARRY).toBeGreaterThan(0.5);
  });
});
