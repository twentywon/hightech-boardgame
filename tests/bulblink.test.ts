import { describe, expect, it } from "vitest";
import * as R from "../src/games/bulblink/rules";
import { CELL, cellAt, cellUnder } from "../src/games/bulblink/layout";

const seeded = (s: number) => () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 2147483648);
const tap = (to: number) => ({ from: -1, to, extra: -1 });
/** A board from rows of glyphs: . an empty socket, o a bulb, # a box. */
function board(rows: string[], stage = 1): R.State {
  const n = rows.length,
    cells = rows.flatMap((row) => [...row].map((ch) => (ch === "o" ? R.BULB : ch === "#" ? R.BOX : R.EMPTY)));
  expect(cells.length).toBe(n * n);
  return { size: n, cells, path: [], lit: cells.map(() => 0), stage, plan: [], last: null, winner: null, ply: 0 };
}
/** Lights the cells in order, each move legal. */
function light(state: R.State, cells: number[]) {
  let s = state;
  for (const cell of cells) {
    const next = R.play(s, tap(cell));
    expect(next, `cell ${cell}`).not.toBeNull();
    s = next!;
  }
  return s;
}
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

describe("the link rule", () => {
  it("reaches the first unlit bulb in each of the eight directions", () => {
    const s = board([
      "o.o.o", //
      ".....",
      "o.o.o",
      ".....",
      "o.o.o",
    ]);
    expect(sorted(R.links(s, 12))).toEqual([0, 2, 4, 10, 14, 20, 22, 24]);
    // A corner sees only three ways.
    expect(sorted(R.links(s, 0))).toEqual([2, 10, 12]);
  });
  it("stops at the first bulb met, passing only over empty sockets: a lit bulb between blocks the way", () => {
    const s = board([
      "o.o.o", //
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    expect(R.links(s, 0)).toEqual([2]);
    // Empty sockets are passed over: 0 reaches 2 across the socket at 1.
    expect(R.lineFrom(s, 0, 2)).toEqual({ to: 2, stop: "bulb", at: 2 });
    const after = light(s, [2, 0]);
    // From 0, the line east meets the lit bulb at 2 and stops there: no wire skips a bulb, lit or not.
    expect(R.links(after, 0)).toEqual([]);
    expect(R.lineFrom(after, 0, 2)).toEqual({ to: -1, stop: "lit", at: 2 });
    expect(R.play(after, tap(4))).toBeNull();
    expect(R.refusal(after, tap(4))).toBe("켜진 전구를 건너뛸 수 없습니다. 줄은 처음 만나는 전구에서 멈춥니다.");
    expect(R.deadEnd(after)).toBe(true);
    // An unlit bulb between blocks it too.
    expect(R.play(R.play(s, tap(0))!, tap(4))).toBeNull();
    expect(R.refusal(R.play(s, tap(0))!, tap(4))).toBe("전구를 건너뛸 수 없습니다. 줄은 처음 만나는 전구에서 멈춥니다.");
    // Along the row the only ways through run end to end.
    expect(light(s, [0, 2, 4]).winner).toBe(0);
    expect(light(s, [4, 2, 0]).winner).toBe(0);
  });
  it("never links over a bulb on a diagonal either", () => {
    const s = board([
      "o....", //
      ".....",
      "..o..",
      ".....",
      "o...o",
    ]);
    // 0 sees 12 down the diagonal (24 lies behind it) and 20 down the column.
    expect(sorted(R.links(s, 0))).toEqual([12, 20]);
    const lit = light(s, [12, 20, 24]);
    expect(R.links(lit, 24)).toEqual([]);
    expect(R.refusal(lit, tap(0))).toContain("켜진 전구를 건너뛸 수 없습니다");
  });
  it("is stopped by a box", () => {
    const s = board([
      "o#o..", //
      ".....",
      "o....",
      ".....",
      "....o",
    ]);
    expect(sorted(R.links(s, 0))).toEqual([10, 24]);
    expect(R.lineFrom(s, 0, 2)).toEqual({ to: -1, stop: "box", at: 1 });
    // A box never becomes passable.
    expect(R.links(light(s, [0]), 0)).not.toContain(2);
  });
  it("does not link cells off a straight line", () => {
    const s = board([
      "o....", //
      "..o..",
      ".....",
      ".....",
      ".....",
    ]);
    expect(R.links(s, 0)).toEqual([]);
    expect(R.directionOf(5, 0, 7)).toBe(-1);
    expect(R.directionOf(5, 0, 24)).toBe(3);
    expect(R.directionOf(5, 24, 0)).toBe(7);
  });
});

describe("moves, refusals, the end and undo", () => {
  const s = board([
    "o#o..", //
    ".....",
    "o.o.o",
    ".....",
    "....o",
  ]);
  it("lets any bulb start, and only links after that", () => {
    expect(sorted(R.moves(s).map((m) => m.to))).toEqual([0, 2, 10, 12, 14, 24]);
    const started = light(s, [12]);
    expect(started.last).toEqual({ from: -1, to: 12 });
    expect(sorted(R.moves(started).map((m) => m.to))).toEqual(sorted(R.links(started, 12)));
    expect(R.play(s, { from: 0, to: 2, extra: -1 })).toBeNull();
    expect(R.play(s, tap(1))).toBeNull();
    expect(R.play(s, tap(3))).toBeNull();
  });
  it("says why a tap is refused", () => {
    const started = light(s, [10]);
    expect(R.refusal(started, tap(1))).toBe("금속 상자입니다. 전구를 누르세요.");
    expect(R.refusal(started, tap(3))).toBe("빈 소켓입니다. 전구를 누르세요.");
    expect(R.refusal(started, tap(10))).toContain("줄 끝에 있는 전구");
    expect(R.refusal(light(started, [12]), tap(10))).toBe("이미 켜진 전구입니다.");
    // Not in line with the head.
    expect(R.refusal(started, tap(24))).toContain("줄이 닿지 않습니다");
    // In line, but an unlit bulb stands between.
    expect(R.refusal(started, tap(14))).toBe("전구를 건너뛸 수 없습니다. 줄은 처음 만나는 전구에서 멈춥니다.");
    // In line, but a lit bulb stands between.
    expect(R.refusal(light(s, [12, 10]), tap(14))).toBe("켜진 전구를 건너뛸 수 없습니다. 줄은 처음 만나는 전구에서 멈춥니다.");
    // In line, but a box stands between.
    expect(R.refusal(light(s, [0]), tap(2))).toBe("상자에 막혔습니다.");
    // A legal tap is not refused.
    expect(R.refusal(started, tap(12))).toBeNull();
    expect(R.refusal(s, tap(24))).toBeNull();
  });
  it("is won when every bulb is lit", () => {
    const way = R.solve(s)!;
    expect(way).toHaveLength(6);
    const done = light(s, way);
    expect(done.winner).toBe(0);
    expect(R.moves(done)).toEqual([]);
    expect(R.bulbLink.reason(done)).toMatch(/^성공!/);
    expect(R.play(done, tap(way[0]))).toBeNull();
  });
  it("takes the last bulb back with undo, the start included", () => {
    const two = light(s, [10, 12]);
    const one = R.undo(two);
    expect(one.path).toEqual([10]);
    expect(one.lit[12]).toBe(0);
    expect(one.ply).toBe(1);
    expect(R.undo(one).path).toEqual([]);
    expect(R.undo(one).lit.every((x) => x === 0)).toBe(true);
  });
  it("tells a dead end, which is no failure, and gives no hint there", () => {
    const t = board([
      "o.o..", //
      ".....",
      ".....",
      ".....",
      "....o",
    ]);
    // 2 → 0 → 24 (down the diagonal) lights them all; 0 → 2 leaves 24 out of reach of 2.
    expect(light(t, [2, 0, 24]).winner).toBe(0);
    const dead = light(t, [0, 2]);
    expect(R.deadEnd(dead)).toBe(true);
    expect(dead.winner).toBeNull();
    expect(R.hint(dead)).toBeNull();
    expect(R.bulbLink.hint(dead)).toContain("무르기");
  });
});

describe("the search", () => {
  it("counts the ways through a small board and the bulbs they start from", () => {
    // Three bulbs in a row: only from either end along the row (from the middle, one end is cut off behind it).
    const s = board([
      "o.o.o", //
      ".....",
      ".....",
      ".....",
      ".....",
    ]);
    expect(R.countSolutions(s)).toEqual({ ways: 2, starts: 2 });
    expect(R.countSolutions(light(s, [2]))).toEqual({ ways: 0, starts: 1 });
    expect(R.solve(light(s, [2]))).toBeNull();
    expect(R.countSolutions(light(s, [0, 2, 4]))).toEqual({ ways: 1, starts: 1 });
  });
  it("finds a way exactly when the count has one", () => {
    const random = seeded(11);
    for (let k = 0; k < 40; k++) {
      const s = R.createGame(1 + (k % 3), random);
      let state = s;
      // A few random steps, then compare.
      for (let j = 0; j < 1 + (k % 5) && R.moves(state).length; j++) {
        const m = R.moves(state);
        state = R.play(state, m[Math.floor(random() * m.length)])!;
      }
      if (state.winner !== null) continue;
      const way = R.solve(state),
        counted = R.countSolutions(state)!;
      expect(!!way && way.length > 0).toBe(counted.ways > 0);
      if (way) expect(light(state, way).winner).toBe(0);
    }
  });
});

describe("the generator", () => {
  it("lays boards of each stage that can be solved, their plan included, quickly", () => {
    for (let stage = 1; stage <= R.STAGES.length; stage++) {
      const spec = R.STAGES[stage - 1],
        random = seeded(300 + stage),
        times: number[] = [];
      for (let k = 0; k < (stage < 5 ? 12 : 6); k++) {
        const t0 = performance.now(),
          s = R.createGame(stage, random);
        times.push(performance.now() - t0);
        const bulbs = R.bulbsOf(s),
          boxes = s.cells.filter((x) => x === R.BOX).length;
        expect(s.size).toBe(spec.size);
        expect(bulbs.length).toBeGreaterThanOrEqual(spec.bulbs[0]);
        expect(bulbs.length).toBeLessThanOrEqual(spec.bulbs[1]);
        expect(boxes).toBe(spec.boxes);
        expect(sorted(s.plan)).toEqual(bulbs);
        expect(light(s, s.plan).winner).toBe(0);
        const counted = R.countSolutions(s, 1)!;
        expect(counted.starts).toBeGreaterThan(0);
        // No wire of the plan passes over a box or a bulb: only empty sockets lie under it.
        for (const cell of R.crossedBy(s.size, s.plan)) expect(s.cells[cell]).toBe(R.EMPTY);
        // The hint follows a way through from the start.
        expect(R.hint(s)!.to).toBe(s.plan[0]);
      }
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      expect(mean, `stage ${stage}`).toBeLessThan(600);
    }
  }, 120000);
  it("makes the harder stages harder: lighting at random seldom gets through", () => {
    const luck = (stage: number) => {
      const random = seeded(900 + stage);
      let sum = 0;
      for (let k = 0; k < 6; k++) sum += R.luck(R.createGame(stage, random), 300, random);
      return sum / 6;
    };
    const easy = luck(1),
      hard = luck(4),
      master = luck(5);
    expect(easy).toBeGreaterThan(hard);
    expect(hard).toBeLessThan(0.05);
    expect(master).toBeLessThan(0.03);
  }, 120000);
  it("walks paths whose every link, replayed, goes to the first bulb in its direction, over empty sockets only", () => {
    const random = seeded(5);
    for (let k = 0; k < 50; k++) {
      const n = 5 + (k % 5),
        path = R.walk(n, 4 + (k % 10), random);
      if (!path) continue;
      const cells = new Array(n * n).fill(R.EMPTY);
      for (const cell of path) cells[cell] = R.BULB;
      const s: R.State = { size: n, cells, path: [], lit: cells.map(() => 0), stage: 1, plan: path, last: null, winner: null, ply: 0 };
      expect(light(s, path).winner).toBe(0);
      // No planned wire passes over a bulb.
      for (const cell of R.crossedBy(n, path)) expect(cells[cell]).toBe(R.EMPTY);
    }
  });
  it("lays the same board from the same random numbers", () => {
    expect(R.createGame(4, seeded(77))).toEqual(R.createGame(4, seeded(77)));
  });
});

describe("the hint", () => {
  /** Plays the hint until the board is won. */
  function follow(state: R.State) {
    let s = state;
    for (let k = 0; k < 40 && s.winner === null; k++) {
      const m = R.hint(s);
      expect(m).not.toBeNull();
      expect(R.refusal(s, m!)).toBeNull();
      s = R.play(s, m!)!;
    }
    return s;
  }
  it("leads to a win from the start of every stage", () => {
    for (let stage = 1; stage <= R.STAGES.length; stage++) {
      const s = R.createGame(stage, seeded(40 + stage));
      expect(R.hint(s)!.to).toBe(s.plan[0]);
      expect(follow(s).winner).toBe(0);
    }
  }, 60000);
  it("leads to a win from scattered partial paths that can still be finished, and is none where they cannot", () => {
    const random = seeded(123);
    let solvable = 0,
      stuck = 0;
    for (let k = 0; k < 40; k++) {
      const stage = 2 + (k % 4),
        s = R.createGame(stage, random),
        bulbs = R.bulbsOf(s);
      let state = R.play(s, tap(bulbs[Math.floor(random() * bulbs.length)]))!;
      const steps = Math.floor(random() * bulbs.length * 0.7);
      for (let j = 0; j < steps && R.moves(state).length; j++) {
        const m = R.moves(state);
        state = R.play(state, m[Math.floor(random() * m.length)])!;
      }
      if (state.winner !== null) continue;
      const t0 = performance.now(),
        m = R.hint(state);
      expect(performance.now() - t0).toBeLessThan(2000);
      if (R.solve(state)) {
        solvable++;
        expect(m).not.toBeNull();
        expect(follow(state).winner).toBe(0);
      } else {
        stuck++;
        expect(m).toBeNull();
      }
    }
    expect(solvable).toBeGreaterThan(0);
    expect(stuck).toBeGreaterThan(0);
  }, 120000);
});

describe("layout", () => {
  it("finds the cell under each socket's middle and nothing far off the board", () => {
    for (const n of [5, 9])
      for (let cell = 0; cell < n * n; cell++) {
        const at = cellAt(n, cell);
        expect(cellUnder(n, at.x, at.z)).toBe(cell);
        expect(cellUnder(n, at.x + CELL * 0.3, at.z - CELL * 0.3)).toBe(cell);
      }
    expect(cellUnder(5, 10, 0)).toBe(-1);
  });
});
