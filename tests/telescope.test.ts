import { describe, expect, test } from "vitest";
import * as R from "../src/games/telescope/rules";
import { cellAt, cellUnder, scopePoint, telescopeSubject } from "../src/games/telescope/layout";

/**
 * A board from rows of glyphs: . an empty cell, ^ > v < a telescope's base pointing N E S W (numbered in reading
 * order), o the ball, @ the hole. Rows must make a square. Telescopes are purple (reach 4) unless `reaches` gives
 * each its own, in the same order.
 */
function board(rows: string[], reaches: R.Reach[] = []): R.State {
  const n = rows.length,
    scopes: R.Telescope[] = [];
  let ball = -1,
    hole = -1;
  rows.forEach((row, r) => {
    expect(row.length).toBe(n);
    for (let c = 0; c < n; c++) {
      const ch = row[c],
        cell = r * n + c,
        dir = "^>v<".indexOf(ch);
      if (dir >= 0) scopes.push({ cell, dir, reach: reaches[scopes.length] ?? 4 });
      if (ch === "o") ball = cell;
      if (ch === "@") hole = cell;
    }
  });
  return { size: n, scopes, lens: scopes.map(() => 0), ball, hole, start: ball, stage: 1, pressed: [], plan: [], best: 0, last: null, winner: null, ply: 0 };
}
const press = (s: R.State, t: number) => R.play(s, { from: -1, to: t, extra: -1 });
const at = (s: R.State, r: number, c: number) => r * s.size + c;

describe("telescope push: drawing out", () => {
  test("a telescope with room draws out four cells at once", () => {
    const s = board(["......", ">.....", "......", "......", "......", "o....@"]);
    const t = press(s, 0)!;
    expect(t.lens[0]).toBe(4);
    expect(t.last).toMatchObject({ t: 0, from: 0, to: 4, fell: false });
    expect(R.bodyOf(t, 0)).toEqual([at(s, 1, 1), at(s, 1, 2), at(s, 1, 3), at(s, 1, 4)]);
    expect(t.ball).toBe(s.ball);
    expect(t.ply).toBe(1);
  });
  test("it stops early at the edge, at another's base and at another's drawn-out body", () => {
    const edge = board(["....", "..>.", "....", "o..@"]);
    expect(press(edge, 0)!.lens[0]).toBe(1);
    const base = board([".....", ">..v.", ".....", ".....", "o...@"]);
    expect(press(base, 0)!.lens[0]).toBe(2);
    // Telescope 0 (pointing south) drawn out across row 2 stops telescope 1 there.
    const body = board(["..v...", "......", "......", ">.....", "......", "o....@"]);
    const crossed = press(body, 0)!;
    expect(crossed.lens[0]).toBe(4);
    expect(press(crossed, 1)!.lens[1]).toBe(1);
  });
  test("the ball ahead is pushed with the tip, and stops the tip when it cannot go on", () => {
    const s = board(["......", ">.o...", "......", "......", "......", ".....@"]);
    const t = press(s, 0)!;
    expect(t.lens[0]).toBe(4);
    expect(t.ball).toBe(at(s, 1, 5));
    expect(t.last!.balls).toEqual([at(s, 1, 2), at(s, 1, 2), at(s, 1, 3), at(s, 1, 4), at(s, 1, 5)]);
    // The ball against the edge stops the tip one short.
    const short = board(["....", ">.o.", "....", "...@"]);
    const u = press(short, 0)!;
    expect(u.lens[0]).toBe(2);
    expect(u.ball).toBe(at(short, 1, 3));
    // The ball against another telescope's base stops the tip behind it.
    const blocked = board([".......", ">.o.^..", ".......", ".......", ".......", ".......", "......@"]);
    const v = press(blocked, 0)!;
    expect(v.lens[0]).toBe(2);
    expect(v.ball).toBe(at(blocked, 1, 3));
  });
  test("the ball against a drawn-out body stops too", () => {
    const s = board(["...v...", ".......", ">o.....", ".......", ".......", ".......", "......@"]);
    const crossed = press(s, 0)!;
    expect(crossed.lens[0]).toBe(4);
    const t = press(crossed, 1)!;
    expect(t.ball).toBe(at(s, 2, 2));
    expect(t.lens[1]).toBe(1);
  });
  test("a press that cannot draw out at all is refused with words, and nothing changes", () => {
    const edge = board(["...>", "....", "....", "o..@"]);
    expect(press(edge, 0)).toBeNull();
    expect(R.refusal(edge, { from: -1, to: 0, extra: -1 })).toContain("가장자리");
    const facing = board(["....", "><..", "....", "o..@"]);
    expect(press(facing, 0)).toBeNull();
    expect(R.refusal(facing, { from: -1, to: 0, extra: -1 })).toContain("다른 망원경");
    const ballStuck = board(["....", "..>o", "....", "...@"]);
    expect(press(ballStuck, 0)).toBeNull();
    expect(R.refusal(ballStuck, { from: -1, to: 0, extra: -1 })).toContain("공");
    const body = board([".v...", ".....", ">....", ".....", "o...@"]);
    const crossed = press(body, 0)!;
    expect(crossed.lens[0]).toBe(4);
    expect(press(crossed, 1)).toBeNull();
    expect(R.refusal(crossed, { from: -1, to: 1, extra: -1 })).toContain("늘어난 망원경");
    expect(R.moves(crossed).map((m) => m.to)).toEqual([0]);
  });
});

describe("telescope push: the three kinds", () => {
  test("green, yellow and purple draw out 2, 3 and 4 cells beyond the base: 3, 4 and 5 cells with it", () => {
    const row = [">......", ">......", ">......", ".......", ".......", ".......", "o.....@"];
    const s = board(row, [R.REACH_OF.green, R.REACH_OF.yellow, R.REACH_OF.purple]);
    expect(s.scopes.map((x) => x.reach)).toEqual([2, 3, 4]);
    let t = s;
    for (let k = 0; k < 3; k++) t = press(t, k)!;
    expect(t.lens).toEqual([2, 3, 4]);
    expect([0, 1, 2].map((k) => 1 + R.bodyOf(t, k).length)).toEqual([3, 4, 5]);
    expect(R.KIND_NAME[2]).toBe("초록");
    expect(R.KIND_NAME[3]).toBe("노랑");
    expect(R.KIND_NAME[4]).toBe("보라");
    // Closed again, each closes fully.
    for (let k = 0; k < 3; k++) t = press(t, k)!;
    expect(t.lens).toEqual([0, 0, 0]);
    expect(R.maxima(s.size, s.scopes)).toEqual([2, 3, 4]);
  });
  test("a kind pushes the ball only as far as its own reach", () => {
    const rows = [".......", ">o.....", ".......", ".......", ".......", ".......", "......@"];
    const green = press(board(rows, [2]), 0)!,
      yellow = press(board(rows, [3]), 0)!,
      purple = press(board(rows, [4]), 0)!;
    expect([green.ball, yellow.ball, purple.ball]).toEqual([at(green, 1, 3), at(green, 1, 4), at(green, 1, 5)]);
    expect([green.lens[0], yellow.lens[0], purple.lens[0]]).toEqual([2, 3, 4]);
    // A green telescope can reach a ball two cells off and push it one; three cells off it does not reach it.
    const twoOff = press(board([".......", ">.o....", ".......", ".......", ".......", ".......", "......@"], [2]), 0)!;
    expect(twoOff.ball).toBe(at(twoOff, 1, 3));
    const threeOff = press(board([".......", ">..o...", ".......", ".......", ".......", ".......", "......@"], [2]), 0)!;
    expect(threeOff.lens[0]).toBe(2);
    expect(threeOff.ball).toBe(at(threeOff, 1, 3));
    // Pulled back by its own length.
    const back = press(green, 0)!;
    expect(back.ball).toBe(at(green, 1, 1));
  });
  test("a kind is still stopped earlier by the edge, a base, a body or a ball that cannot move", () => {
    expect(press(board(["....", "..>.", "....", "o..@"], [3]), 0)!.lens[0]).toBe(1);
    expect(press(board([".......", ">.v....", ".......", ".......", ".......", ".......", "o.....@"], [4, 2]), 0)!.lens[0]).toBe(1);
    const ballStuck = press(board([".......", ">.o^...", ".......", ".......", ".......", ".......", "......@"], [3, 2]), 0)!;
    expect(ballStuck.lens[0]).toBe(1);
    expect(ballStuck.ball).toBe(at(ballStuck, 1, 2));
    // A yellow body drawn down column 2 stops a purple one after a cell.
    const body = board(["..v....", ".......", ">......", ".......", ".......", ".......", "o.....@"], [3, 4]);
    const crossed = press(body, 0)!;
    expect(crossed.lens[0]).toBe(3);
    expect(press(crossed, 1)!.lens[1]).toBe(1);
  });
  test("the search counts each kind's reach", () => {
    // Green pushes the ball onto the hole two cells on; purple would push it past.
    const green = board([".......", ">o@....", ".......", ".......", ".......", ".......", "......."], [2]);
    expect(R.solve(green)).toEqual([0]);
    // A ball three cells beyond a green tip at its longest is out of its reach: no way in.
    const far = board([".......", ">..o@..", ".......", ".......", ".......", ".......", "......."], [2]);
    expect(R.solve(far)).toBeNull();
    const purple = board([".......", ">..o@..", ".......", ".......", ".......", ".......", "......."], [4]);
    expect(R.solve(purple)).toEqual([0]);
  });
});

describe("telescope push: closing and pulling", () => {
  test("a drawn-out telescope closes fully, bringing back a ball touching its tip", () => {
    // Pushed against a base, the ball rests touching the tip; closing pulls it back to the cell before the base.
    const s = board([".......", ">.o.^..", ".......", ".......", ".......", ".......", "......@"]);
    const pushed = press(s, 0)!;
    const pulled = press(pushed, 0)!;
    expect(pulled.lens[0]).toBe(0);
    expect(pulled.ball).toBe(at(s, 1, 1));
    expect(pulled.last!.balls).toEqual([at(s, 1, 3), at(s, 1, 2), at(s, 1, 1)]);
  });
  test("a ball beside the tip, or further off, is not pulled", () => {
    const s = board(["......", ">.....", ".....o", "......", "......", ".....@"]);
    const out = press(s, 0)!;
    expect(out.lens[0]).toBe(4);
    // The tip is at (1, 4); the ball at (2, 5) is diagonal to the touching cell, and the closing leaves it.
    const back = press(out, 0)!;
    expect(back.lens[0]).toBe(0);
    expect(back.ball).toBe(s.ball);
    expect(back.last!.balls.every((b) => b === s.ball)).toBe(true);
    const far = board(["........", ">......o", "........", "........", "........", "........", "........", ".......@"]);
    const farOut = press(far, 0)!;
    expect(farOut.ball).toBe(far.ball);
    expect(press(farOut, 0)!.ball).toBe(far.ball);
  });
  test("bodies block other telescopes and the ball until they close", () => {
    const s = board(["..v...", "......", "o.....", "......", "......", ">....@"]);
    // Telescope 0 drawn out down column 2 to row 4 holds those cells; closed, it gives them back.
    const t = press(s, 0)!;
    expect(R.bodyOf(t, 0)).toContain(at(s, 2, 2));
    const occ = R.occupancy(s.size, t.scopes, t.lens);
    expect(occ[at(s, 4, 2)]).toBe(0);
    const closed = press(t, 0)!;
    expect(R.occupancy(s.size, closed.scopes, closed.lens)[at(s, 4, 2)]).toBe(-1);
  });
});

describe("telescope push: the hole", () => {
  test("a pushed ball drops in as soon as it comes onto the hole, and the tip stops there", () => {
    const s = board(["......", ">o.@..", "......", "......", "......", "......"]);
    const t = press(s, 0)!;
    expect(t.winner).toBe(0);
    expect(t.last!.fell).toBe(true);
    expect(t.ball).toBe(s.hole);
    expect(t.lens[0]).toBe(2);
    expect(R.telescope.reason(t)).toMatch(/^성공!/);
    expect(R.moves(t)).toEqual([]);
    expect(press(t, 0)).toBeNull();
  });
  test("a pulled ball drops in on its way back, and the telescope closes all the same", () => {
    // Push the ball against the base at (1, 5), then pull it back over the hole at (1, 2).
    const s = board([".......", ">.@o.^.", ".......", ".......", ".......", ".......", "......."]);
    // The tip passes over the hole at (1, 2) and pushes the ball from (1, 3) against the base at (1, 5).
    const out = press(s, 0)!;
    expect(out.winner).toBeNull();
    expect(out.ball).toBe(at(s, 1, 4));
    expect(out.lens[0]).toBe(3);
    const back = press(out, 0)!;
    expect(back.winner).toBe(0);
    expect(back.lens[0]).toBe(0);
    expect(back.ball).toBe(s.hole);
    expect(back.last!.balls).toEqual([at(s, 1, 4), at(s, 1, 3), at(s, 1, 2), at(s, 1, 2)]);
  });
  test("a telescope drawn over the hole passes above it", () => {
    const s = board(["......", ">.@...", "......", "......", "o.....", "......"]);
    const t = press(s, 0)!;
    expect(t.lens[0]).toBe(4);
    expect(t.winner).toBeNull();
  });
});

describe("telescope push: undo, restart, search", () => {
  test("undo takes the last press back by replaying from the start; restart begins again", () => {
    const s = board([".......", ">.o.^..", ".......", ".......", ".......", ".......", "......@"]);
    const a = press(s, 0)!,
      b = press(a, 0)!;
    const u = R.undo(b);
    expect(u.lens).toEqual(a.lens);
    expect(u.ball).toBe(a.ball);
    expect(u.pressed).toEqual([0]);
    expect(u.ply).toBe(1);
    expect(R.undo(u).ball).toBe(s.ball);
    const r = R.restart(b);
    expect(r).toMatchObject({ ball: s.ball, ply: 0, pressed: [], winner: null });
    expect(r.lens).toEqual([0, 0]);
  });
  test("the search finds the fewest presses, pulls included", () => {
    // The ball must be pushed east against the stopper, then pulled back over the hole: two presses.
    const s = board([".......", ">.@o.^.", ".......", ".......", ".......", ".......", "......."]);
    expect(R.solve(s)).toEqual([0, 0]);
    expect(R.hint(s)).toEqual({ from: -1, to: 0, extra: -1 });
    // A board with no way in.
    const none = board(["o....", ".....", "..@..", ".....", "....>"]);
    expect(R.solve(none)).toBeNull();
    expect(R.hint(none)).toBeNull();
  });
  test("the estimate never says more than the true fewest presses", () => {
    for (let k = 0; k < 6; k++) {
      const s = R.createGame(2, R.quick(500 + k));
      const h = R.distances(s.size, s.scopes, s.hole);
      expect(h[s.start]).toBeGreaterThan(0);
      expect(h[s.start]).toBeLessThanOrEqual(s.best);
    }
  });
});

describe("telescope push: generated puzzles", () => {
  test("every stage lays solvable boards with the fewest presses in its band, quickly", () => {
    for (let stage = 1; stage <= R.STAGES.length; stage++) {
      const spec = R.STAGES[stage - 1],
        times: number[] = [];
      let mattering = 0;
      for (let k = 0; k < 12; k++) {
        const t0 = performance.now(),
          s = R.createGame(stage, R.quick(stage * 1000 + k));
        times.push(performance.now() - t0);
        expect(s.size).toBe(spec.size);
        expect(s.scopes.length).toBeGreaterThanOrEqual(spec.scopes[0]);
        expect(s.scopes.length).toBeLessThanOrEqual(spec.scopes[1]);
        expect(s.best).toBeGreaterThanOrEqual(spec.band[0]);
        expect(s.best).toBeLessThanOrEqual(spec.band[1]);
        expect(s.plan.length).toBe(s.best);
        // Only the three kinds, all three on every board.
        expect(s.scopes.every((x) => (R.REACHES as readonly number[]).includes(x.reach))).toBe(true);
        expect(new Set(s.scopes.map((x) => x.reach)).size).toBe(3);
        if (R.colourMatters(s)) mattering++;
        // Nothing stands on the ball or the hole, and every base is a different cell.
        const bases = new Set(s.scopes.map((x) => x.cell));
        expect(bases.size).toBe(s.scopes.length);
        expect(bases.has(s.ball)).toBe(false);
        expect(bases.has(s.hole)).toBe(false);
        expect(s.ball).not.toBe(s.hole);
        // The plan wins, and with its last press only.
        let x = s;
        s.plan.forEach((t, i) => {
          x = press(x, t)!;
          expect(x).not.toBeNull();
          expect(x.winner).toBe(i === s.plan.length - 1 ? 0 : null);
        });
      }
      const mean = times.reduce((a, b) => a + b) / times.length;
      expect(mean).toBeLessThan(stage < 5 ? 150 : 600);
      // The colours matter on nearly every board: were all the telescopes purple, it would be another puzzle.
      expect(mattering).toBeGreaterThanOrEqual(10);
    }
  }, 60000);
  test("the plan is a shortest way: the search from the start finds no shorter", () => {
    for (let stage = 1; stage <= 3; stage++) {
      const s = R.createGame(stage, R.quick(77 + stage));
      expect(R.solve(s)!.length).toBe(s.best);
    }
  });
  test("following the hints from the start, and from off the plan, reaches the hole", () => {
    for (let stage = 1; stage <= 4; stage++) {
      let s = R.createGame(stage, R.quick(31 + stage));
      // A press off the plan first (any legal one that is not the plan's first), then the hints.
      const off = R.moves(s).find((m) => m.to !== s.plan[0]);
      if (off) s = R.play(s, off)!;
      for (let k = 0; k < 60 && s.winner === null; k++) {
        const m = R.hint(s);
        expect(m).not.toBeNull();
        s = R.play(s, m!)!;
      }
      expect(s.winner).toBe(0);
    }
  }, 60000);
  test("the same random numbers lay the same puzzle", () => {
    const a = R.createGame(3, R.quick(9)),
      b = R.createGame(3, R.quick(9));
    expect(b.scopes).toEqual(a.scopes);
    expect(b.scopes.map((x) => x.reach)).toEqual(a.scopes.map((x) => x.reach));
    expect([b.ball, b.hole, b.plan]).toEqual([a.ball, a.hole, a.plan]);
  });
});

describe("telescope push: layout", () => {
  test("cells, taps and framing", () => {
    expect(cellAt(7, 0)).toEqual({ x: -3, z: -3 });
    expect(cellUnder(7, 0.2, -0.1)).toBe(24);
    expect(cellUnder(7, 9, 0)).toBe(-1);
    expect(scopePoint(7, 24).y).toBeGreaterThan(0);
    expect(telescopeSubject(13, 1.5).half).toBeGreaterThan(telescopeSubject(7, 1.5).half);
  });
});
