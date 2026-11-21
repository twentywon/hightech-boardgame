import { describe, expect, it } from "vitest";
import * as R from "../src/games/lightcable/rules";
import { CELL, cableLine, cellAt, cellUnder, outside, sideAt } from "../src/games/lightcable/layout";

const seeded = (s: number) => () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 2147483648);
const step = (to: number) => ({ from: -1, to, extra: -1 });
/**
 * A board from rows of glyphs: . a free cell, o a white post, r b g a red, blue or green post, 3 4 a white post that
 * needs that many sides; the start socket on the west of `start`, the exit (if given) on the east of `exit`.
 */
function board(rows: string[], start: number, exit: number | null = null, stage = 1): R.State {
  const n = rows.length,
    posts: R.Post[] = [];
  rows.forEach((row, r) => {
    expect(row.length).toBe(n);
    [...row].forEach((ch, c) => {
      const colour = "orbg".indexOf(ch);
      if (colour >= 0) posts.push({ cell: r * n + c, colour, need: 2 });
      else if (ch === "3" || ch === "4") posts.push({ cell: r * n + c, colour: R.WHITE, need: Number(ch) });
    });
  });
  return R.boardOf(n, stage, posts, { cell: start, bit: R.W }, exit === null ? null : { cell: exit, bit: R.E });
}
/** Draws the cable through the cells in order, each step legal. */
function draw(state: R.State, cells: number[]) {
  let s = state;
  for (const cell of cells) {
    const next = R.play(s, step(cell));
    expect(next, `cell ${cell}`).not.toBeNull();
    s = next!;
  }
  return s;
}
const litCells = (s: R.State) => s.posts.flatMap((p, i) => (R.isLit(s, i) ? [p.cell] : []));

describe("steps and refusals", () => {
  // The corner post (24) is never lit here, so that nothing is won.
  const s = board(
    [
      ".....", //
      ".o...",
      ".....",
      ".....",
      "....o",
    ],
    5,
  );
  it("starts plugged into the start cell and steps into free cells beside the head", () => {
    expect(s.path).toEqual([5]);
    expect(R.steps(s).sort((a, b) => a - b)).toEqual([0, 10]);
    expect(R.moves(s).map((m) => m.to).sort((a, b) => a - b)).toEqual([0, 10]);
    const t = draw(s, [10, 11]);
    expect(t.path).toEqual([5, 10, 11]);
    expect(t.ply).toBe(2);
    // The cell before the head is a move too: the cable wound back.
    expect(R.moves(t).map((m) => m.to)).toContain(10);
  });
  it("refuses a post, the head, a cell not beside the head, a cell the cable passes and a step off the board, with words", () => {
    const t = draw(s, [10, 11, 12, 7, 2, 1, 0]);
    expect(R.play(t, step(6))).toBeNull();
    expect(R.refusal(t, step(6))).toBe("기둥이 선 칸입니다. 케이블은 기둥 옆의 빈칸으로 지나가며 기둥을 감습니다.");
    expect(R.refusal(t, step(0))).toBe("케이블 끝이 있는 칸입니다. 끝을 옆 칸으로 끌어 늘이세요.");
    expect(R.play(t, step(20))).toBeNull();
    expect(R.refusal(t, step(20))).toBe("케이블 끝 바로 옆 칸(가로·세로)으로만 늘일 수 있습니다.");
    // 5 is the start, on the cable: the cable never crosses or overlaps itself.
    expect(R.play(t, step(5))).toBeNull();
    expect(R.refusal(t, step(5))).toBe("케이블이 이미 지나간 칸입니다. 케이블은 자기 자신과 겹치거나 엇갈릴 수 없습니다.");
    expect(R.play(t, step(R.OFF))).toBeNull();
    expect(R.refusal(t, step(R.OFF))).toBe("판 밖으로는 케이블을 끌 수 없습니다.");
    // A diagonal step is no step.
    expect(R.play(draw(s, [10]), step(16))).toBeNull();
    // The cell before the head is never refused: it winds back.
    expect(R.refusal(t, step(1))).toBeNull();
    expect(R.steps(t)).toEqual([]);
    expect(R.stuck(t)).toBe(true);
  });
  it("winds back one cell by a step to the cell before the head, and undo takes the last step back", () => {
    const t = draw(s, [10, 11, 12]),
      back = R.play(t, step(11))!;
    expect(back.path).toEqual([5, 10, 11]);
    expect(back.last).toMatchObject({ cell: 12, back: true });
    expect(back.ply).toBe(4);
    const undone = R.undo(t);
    expect(undone.path).toEqual([5, 10, 11]);
    expect(undone.ply).toBe(2);
    // At the start the cable cannot be pulled out of its socket.
    expect(R.moves(s).some((m) => m.to === 5)).toBe(false);
    expect(R.play(s, step(5))).toBeNull();
  });
});

describe("the lighting rule", () => {
  it("lights a post the cable goes round the corner of: two different sides", () => {
    const s = board([".....", ".o...", ".....", ".....", "....."], 0);
    // 0 → 1 passes the post (6) on its north side (1): one side, not lit yet.
    let t = draw(s, [1]);
    expect(t.sides[0]).toBe(R.N);
    expect(litCells(t)).toEqual([]);
    // 2 is diagonal to the post: nothing. 7 is its east side: two sides, lit.
    t = draw(t, [2]);
    expect(t.sides[0]).toBe(R.N);
    t = draw(t, [7]);
    expect(t.sides[0]).toBe(R.N | R.E);
    expect(litCells(t)).toEqual([6]);
    expect(t.last!.lit).toEqual([0]);
  });
  it("lights a post passed on both sides, and counts a side once however often it is passed", () => {
    const s = board([".....", ".....", "..o..", ".....", "....."], 5);
    // Along row 1 over the post (north side 7), then back along row 3 under it (south side 17).
    let t = draw(s, [6, 7, 8]);
    expect(t.sides[0]).toBe(R.N);
    expect(litCells(t)).toEqual([]);
    t = draw(t, [9, 14, 19, 18, 17]);
    expect(t.sides[0]).toBe(R.N | R.S);
    expect(litCells(t)).toEqual([12]);
  });
  it("puts a post out again when the step that lit it is wound back", () => {
    const s = board([".....", ".o...", ".....", ".....", "....o"], 0),
      t = draw(s, [1, 2, 7]),
      back = R.play(t, step(2))!;
    expect(litCells(back)).toEqual([]);
    expect(back.last!.dimmed).toEqual([0]);
  });
  it("needs three or four different sides for a counted post", () => {
    const s = board([".....", ".3...", ".....", ".....", "....."], 0);
    let t = draw(s, [1, 2, 7]);
    expect(R.bitCount(t.sides[0])).toBe(2);
    expect(litCells(t)).toEqual([]);
    t = draw(t, [12, 11]);
    expect(R.bitCount(t.sides[0])).toBe(3);
    expect(litCells(t)).toEqual([6]);
    const four = board([".....", ".4...", ".....", ".....", "....."], 0),
      round = draw(four, [1, 2, 7, 12, 11, 10]);
    expect(litCells(round)).toEqual([]);
    expect(litCells(draw(round, [5]))).toEqual([6]);
  });
});

describe("colours", () => {
  it("turns the cable the colour of a coloured post it comes beside, after that side is judged", () => {
    const s = board([".....", ".r...", ".....", ".....", "....."], 0);
    // The cable reaches the red post's north side white: the side does not count, and the cable turns red there.
    let t = draw(s, [1]);
    expect(t.sides[0]).toBe(0);
    expect(t.tints).toEqual([R.WHITE, R.RED]);
    // On round the corner, red: the east side counts (one), the south side too (two): lit.
    t = draw(t, [2, 7]);
    expect(t.sides[0]).toBe(R.E);
    expect(litCells(t)).toEqual([]);
    t = draw(t, [12, 11]);
    expect(t.sides[0]).toBe(R.E | R.S);
    expect(litCells(t)).toEqual([6]);
  });
  it("lights a coloured post only for a cable of its colour, and white posts for any", () => {
    const s = board(["......", ".r..b.", "......", "......", "....o.", "......"], 0);
    // Red at 7 makes the cable red; it then meets the blue post (10) red: the west side does not count, the cable turns blue.
    let t = draw(s, [1, 2, 3]);
    expect(R.tintOf(t)).toBe(R.RED);
    t = draw(t, [9]);
    expect(t.sides[1]).toBe(0);
    expect(R.tintOf(t)).toBe(R.BLUE);
    // On round the blue post in blue: its south and east sides count.
    const round = draw(t, [15, 16, 17, 11]);
    expect(round.sides[1]).toBe(R.S | R.E);
    expect(litCells(round)).toEqual([10]);
    // A white post counts a blue cable: round the corner of 28 (north 22, west 27).
    const white = draw(t, [15, 16, 17, 23, 22, 21, 27]);
    expect(white.sides[2]).toBe(R.N | R.W);
    expect(litCells(white)).toEqual([28]);
    // The red post was passed only on its north side, white, which did not count.
    expect(white.sides[0]).toBe(0);
  });
  it("keeps its colour in a cell beside posts of two colours", () => {
    const s = board([".....", ".....", "r.b..", ".....", "....."], 0);
    // 11 lies between the red post (10) and the blue one (12): the white cable stays white there, and counts neither.
    let t = draw(s, [1, 6, 11]);
    expect(R.tintOf(t)).toBe(R.WHITE);
    expect(t.sides).toEqual([0, 0]);
    t = draw(t, [16]);
    expect(R.tintOf(t)).toBe(R.WHITE);
    // 15 is beside the red post alone: red from there.
    t = draw(t, [15]);
    expect(R.tintOf(t)).toBe(R.RED);
  });
});

describe("winning", () => {
  it("is won as the last post lights on a board without an exit", () => {
    const s = board([".....", ".o...", ".....", "...o.", "....."], 0),
      t = draw(s, [1, 2, 7, 12, 13, 14]);
    expect(litCells(t)).toEqual([6]);
    expect(t.winner).toBeNull();
    const u = draw(t, [19]);
    expect(u.sides[1]).toBe(R.N | R.E);
    expect(u.winner).toBe(0);
    expect(R.moves(u)).toEqual([]);
    expect(R.play(u, step(19))).toBeNull();
    expect(R.lightCable.reason(u)).toBe("성공! 기둥을 모두 밝혔습니다.");
  });
  it("needs the cable's end in the exit cell once every post is lit, where there is an exit", () => {
    const s = board([".....", ".o...", ".....", ".....", "....."], 0, 4, 2);
    let t = draw(s, [1, 2, 7]);
    expect(litCells(t)).toEqual([6]);
    expect(t.winner).toBeNull();
    t = draw(t, [8, 3]);
    expect(t.winner).toBeNull();
    t = draw(t, [4]);
    expect(t.winner).toBe(0);
    expect(R.lightCable.reason(t)).toBe("성공! 기둥을 모두 밝히고 출구에 꽂았습니다.");
    // The exit cell passed through before everything is lit is only a cell.
    const early = board(["....o", ".....", ".....", ".....", "....o"], 0, 9, 2),
      through = draw(early, [1, 2, 3, 8, 9]);
    expect(litCells(through)).toEqual([4]);
    expect(through.winner).toBeNull();
    expect(draw(through, [14]).winner).toBeNull();
  });
});

describe("the generator, the solver and the hint", () => {
  it("lays boards that its plan solves, by the rules of each stage, quickly", () => {
    for (let stage = 1; stage <= R.STAGES.length; stage++) {
      const spec = R.STAGES[stage - 1],
        random = seeded(stage * 1931);
      let total = 0,
        coloured = 0,
        counted = 0;
      for (let k = 0; k < 12; k++) {
        const t0 = performance.now(),
          s = R.createGame(stage, random);
        total += performance.now() - t0;
        const n = s.size;
        expect(n).toBe(spec.size);
        expect(s.posts.length).toBeGreaterThanOrEqual(spec.posts[0]);
        expect(s.posts.length).toBeLessThanOrEqual(spec.posts[1]);
        expect(!!s.exit).toBe(spec.exit);
        // The sockets stand on edge cells, by an outward side, apart.
        expect(R.outward(n, s.start.cell)).toContain(s.start.bit);
        if (s.exit) {
          expect(R.outward(n, s.exit.cell)).toContain(s.exit.bit);
          expect(s.exit.cell).not.toBe(s.start.cell);
        }
        for (const post of s.posts) expect(s.plan).not.toContain(post.cell);
        // Every post must be passable on enough sides: the plan, replayed through play, wins.
        let state = s;
        for (const cell of s.plan.slice(1)) state = R.play(state, step(cell))!;
        expect(state.winner).toBe(0);
        if (spec.exit) expect(state.path[state.path.length - 1]).toBe(s.exit!.cell);
        coloured += s.posts.filter((p) => p.colour !== R.WHITE).length;
        counted += s.posts.filter((p) => p.need > 2).length;
        if (!spec.colours) expect(s.posts.every((p) => p.colour === R.WHITE)).toBe(true);
        if (!spec.counted[1]) expect(s.posts.every((p) => p.need === 2)).toBe(true);
      }
      if (spec.colours) expect(coloured / 12).toBeGreaterThanOrEqual(spec.coloured[0]);
      if (spec.counted[1]) expect(counted).toBeGreaterThan(0);
      // Well under the 300 ms a board may take in a browser.
      expect(total / 12).toBeLessThan(150);
    }
  }, 60000);
  it("lays the same board from the same numbers", () => {
    const a = R.createGame(3, seeded(77)),
      b = R.createGame(3, seeded(77));
    expect(a.posts).toEqual(b.posts);
    expect(a.plan).toEqual(b.plan);
  });
  it("keeps boards on which stepping at random seldom gets through, harder as the stages rise", () => {
    const mean = (stage: number) => {
      let sum = 0;
      for (let k = 0; k < 6; k++) sum += R.luck(R.createGame(stage, seeded(stage * 100 + k)), 150, seeded(9));
      return sum / 6;
    };
    const first = mean(1),
      third = mean(3);
    expect(first).toBeLessThanOrEqual(R.STAGES[0].luck + 0.15);
    expect(third).toBeLessThan(first);
    expect(third).toBeLessThanOrEqual(R.STAGES[2].luck + 0.05);
  }, 30000);
  it("finds a way through from the start, and the hint reaches a win from the start", () => {
    for (let stage = 1; stage <= R.STAGES.length; stage++) {
      const random = seeded(stage * 53);
      for (let k = 0; k < 4; k++) {
        const s = R.createGame(stage, random);
        // The search finds a way within its budget on the smaller boards (on the larger the hint follows the plan).
        if (stage <= 3) {
          const way = R.solve(s)!;
          expect(way, `stage ${stage}`).not.toBeNull();
          let t = s;
          for (const cell of way) t = R.play(t, step(cell))!;
          expect(t.winner).toBe(0);
        }
        let t = s;
        for (let guard = 0; guard < 200 && t.winner === null; guard++) t = R.play(t, R.hint(t)!)!;
        expect(t.winner).toBe(0);
        expect(R.hint(t)).toBeNull();
      }
    }
  }, 60000);
  it("brings a cable that has gone astray back onto a way through, by hints alone", () => {
    for (let stage = 1; stage <= 4; stage++) {
      const random = seeded(stage * 71);
      for (let k = 0; k < 4; k++) {
        const s = R.createGame(stage, random);
        // A few random steps of my own first.
        let t = s;
        for (let i = 0; i < 6; i++) {
          const open = R.steps(t);
          if (!open.length || t.winner !== null) break;
          t = R.play(t, step(open[Math.floor(random() * open.length)]))!;
        }
        let backs = 0;
        for (let guard = 0; guard < 400 && t.winner === null; guard++) {
          const m = R.hint(t)!;
          expect(m).not.toBeNull();
          if (R.hintsBack(t, m)) backs++;
          t = R.play(t, m)!;
        }
        expect(t.winner, `stage ${stage}`).toBe(0);
        expect(backs).toBeLessThanOrEqual(8);
      }
    }
  }, 60000);
  it("hints a step back where the cable can no longer light everything", () => {
    // The post at 3 is passed on its west side (2); the cable then walls itself in at 6, the post still dark.
    const s = board(["...o.", ".....", ".....", ".....", "....."], 10),
      t = draw(s, [11, 12, 7, 2, 1, 0, 5, 6]);
    expect(t.sides[0]).toBe(R.W);
    expect(R.steps(t)).toEqual([]);
    expect(R.stuck(t)).toBe(true);
    expect(R.solve(t)).toBeNull();
    expect(R.hint(t)).toEqual(step(5));
    expect(R.hintsBack(t, R.hint(t)!)).toBe(true);
    // Followed, the hints wind back until a way through opens, and then take it.
    let u = t;
    for (let guard = 0; guard < 60 && u.winner === null; guard++) u = R.play(u, R.hint(u)!)!;
    expect(u.winner).toBe(0);
  });
});

describe("layout", () => {
  it("finds the cell under each cell's middle, and none in the margin", () => {
    for (const n of [5, 9])
      for (let cell = 0; cell < n * n; cell++) {
        const at = cellAt(n, cell);
        expect(cellUnder(n, at.x, at.z)).toBe(cell);
        expect(cellUnder(n, at.x + CELL * 0.45, at.z - CELL * 0.45)).toBe(cell);
      }
    const away = outside(5, { cell: 10, bit: R.W });
    expect(cellUnder(5, away.x, away.z)).toBe(-1);
  });
  it("draws the cable from the reel to the middle of the head, colours changing at the middle of a cell", () => {
    const s = board([".....", ".r...", ".....", ".....", "....."], 0),
      t = draw(s, [1, 2]),
      line = cableLine(5, t.start, t.path, t.tints),
      reel = outside(5, t.start, 0.38),
      head = cellAt(5, 2);
    expect(line[0].x).toBeCloseTo(reel.x);
    expect(line[line.length - 1].x).toBeCloseTo(head.x);
    expect(line[line.length - 1].z).toBeCloseTo(head.z);
    // White up to the middle of cell 1 (beside the red post), red from there.
    const middle = cellAt(5, 1),
      red = line.findIndex((p) => p.tint === R.RED);
    expect(line[red - 1].x).toBeCloseTo(middle.x, 1);
    expect(line.slice(red).every((p) => p.tint === R.RED)).toBe(true);
    // It passes through the middle of the side between two cells.
    const side = sideAt(5, 0, R.E);
    expect(line.some((p) => Math.abs(p.x - side.x) < 1e-9 && Math.abs(p.z - side.z) < 1e-9)).toBe(true);
  });
});
