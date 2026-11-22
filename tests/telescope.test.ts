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
        // Lean: no more telescopes than the board was climbed with, and none that could go.
        expect(s.scopes.length).toBeGreaterThanOrEqual(3);
        expect(s.scopes.length).toBeLessThanOrEqual(spec.core[1]);
        expect(R.slack(s)).toEqual([]);
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
      // Well under the few hundred milliseconds a board may take in a browser (the top stage climbs the longest).
      // (Measured quiet: about 50–250 ms below 고수, 300–450 ms above; the margin is for a busy machine.)
      expect(mean).toBeLessThan(stage < 4 ? 600 : 1200);
      // The colours matter on nearly every board: were all the telescopes purple, it would be another puzzle.
      expect(mattering).toBeGreaterThanOrEqual(10);
    }
  }, 120000);
  test("the bands lie well above the old ones, and the boards are not solved the naive way", () => {
    // The fewest presses the stages asked for before the puzzles were made harder.
    const old = [[3, 5], [5, 8], [7, 11], [9, 14], [12, 18]];
    R.STAGES.forEach((spec, i) => {
      expect(spec.band[0]).toBeGreaterThan(old[i][0]);
      expect(spec.band[1]).toBeGreaterThanOrEqual(old[i][1]);
    });
    for (let stage = 2; stage <= R.STAGES.length; stage++) {
      const spec = R.STAGES[stage - 1];
      let naive = 0,
        rich = 0,
        mean = 0;
      for (let k = 0; k < 8; k++) {
        const s = R.createGame(stage, R.quick(stage * 7919 + k));
        mean += s.best / 8;
        // A greedy player pressing toward the hole, and a random one, in ten tries each.
        if (R.naive(s, R.quick(k + 1), 10)) naive++;
        // The way leans on several telescopes, pulls as well as pushes, and presses that only set a stop.
        const t = R.traits(s.size, s.scopes, s.start, s.plan);
        if (t.used >= spec.used - 2 && t.pulls >= 1 && t.stops >= 1) rich++;
      }
      expect(naive).toBeLessThanOrEqual(2);
      expect(rich).toBeGreaterThanOrEqual(6);
      expect(mean).toBeGreaterThan(old[stage - 1][0] + 1);
    }
  }, 120000);
  test("boards are lean: every telescope is pressed by every shortest way, and taking any away changes the puzzle", () => {
    for (let stage = 1; stage <= R.STAGES.length; stage++) {
      let everyWay = 0;
      for (let k = 0; k < 8; k++) {
        const s = R.createGame(stage, R.quick(stage * 4241 + k));
        // The plan presses every telescope on the board (no decoys), on every board.
        expect(new Set(s.plan).size).toBe(s.scopes.length);
        // Without any one of them the fewest presses change, or the way loses what the stage asks of it.
        expect(R.slack(s)).toEqual([]);
        s.scopes.forEach((_, t) => {
          const rest = s.scopes.filter((_, i) => i !== t),
            found = R.search(s.size, rest, rest.map(() => 0), s.start, s.hole, 200000);
          if (found.way && found.way.length === s.best) {
            // Kept only because the way found without it takes fewer turns or meets less of the stage.
            const before = R.motifs(s.size, s.scopes, s.start, s.hole, s.plan).set.size,
              after = R.motifs(s.size, rest, s.start, s.hole, found.way).set.size,
              t1 = R.traits(s.size, s.scopes, s.start, s.plan),
              t2 = R.traits(s.size, rest, s.start, found.way);
            expect(after < before || t2.used < t1.used || t2.pulls < t1.pulls || t2.stops < t1.stops || new Set(found.way).size < rest.length || after <= before).toBe(true);
          }
        });
        // Pressed by every shortest way (none can be left closed with the fewest presses kept).
        if (R.needed(s).every(Boolean)) everyWay++;
      }
      expect(everyWay).toBeGreaterThanOrEqual(7);
    }
  }, 180000);
  test("the ways take the turns a player must find, and stray from the hole", () => {
    for (let stage = 1; stage <= R.STAGES.length; stage++) {
      const spec = R.STAGES[stage - 1];
      let turned = 0,
        lucky = 0;
      for (let k = 0; k < 8; k++) {
        const s = R.createGame(stage, R.quick(stage * 3307 + k)),
          m = R.motifs(s.size, s.scopes, s.start, s.hole, s.plan);
        expect(m.set.size).toBeGreaterThanOrEqual(1);
        if ((m.set.size >= spec.turns && m.away >= spec.away) || stage === 1) turned++;
        // A random player, worked out exactly, within twice the fewest presses and four.
        if (R.chance(s, 2 * s.best + 4) > spec.luck) lucky++;
      }
      expect(turned).toBeGreaterThanOrEqual(5);
      expect(lucky).toBeLessThanOrEqual(3);
    }
  }, 180000);
  test("the turns are told from the way: a wall twice, a telescope taken out of the way, a pull whose length another set", () => {
    const n = 7,
      at = (r: number, c: number) => r * n + c,
      scopes: R.Telescope[] = [
        { cell: at(3, 0), dir: R.E, reach: 4 },
        { cell: at(1, 4), dir: R.S, reach: 3 },
        { cell: at(4, 6), dir: R.W, reach: 2 },
      ],
      ball = at(3, 1);
    // 1 is drawn out down column 4; 0 pushes the ball east until 1's body stops it at (3, 3); 2's tip is stopped by
    // the same body at (4, 5); 2 and 1 are closed; 2 is drawn out again through what 1's body held; 0 pulls the ball
    // back, its length set by 1.
    const m = R.motifs(n, scopes, ball, at(6, 6), [1, 0, 2, 2, 1, 2, 0]);
    expect([...m.set].sort()).toEqual(["again", "retract", "settip", "wall"]);
    // Pushed by one telescope and pulled straight back by the same one is no turn of its own.
    expect(R.motifs(n, scopes, ball, at(6, 6), [1, 0, 0]).set.has("back")).toBe(false);
  });
  test("the outward search agrees with the A* search: the hole on the last cell reached takes exactly that many presses", () => {
    for (let k = 0; k < 6; k++) {
      const s = R.createGame(3, R.quick(400 + k)),
        e = R.explore(s.size, s.scopes, s.start, 200000, s.best + 1);
      expect(e.arrive[s.hole]).toBe(s.best);
      expect(e.wayTo(s.hole)).toHaveLength(s.best);
      // Another reached cell made the hole: the A* search finds the same count.
      const other = [...e.arrive.keys()].find((c) => e.arrive[c] > 1 && e.arrive[c] < e.complete && c !== s.hole)!;
      expect(R.search(s.size, s.scopes, s.scopes.map(() => 0), s.start, other, 200000).way!.length).toBe(e.arrive[other]);
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
      // A press off the plan first (a legal one that is not the plan's first and from which there is still a way:
      // some presses now lead into dead ends, where the hint says to take a press back), then the hints.
      const off = R.moves(s).find((m) => m.to !== s.plan[0] && R.solve(R.play(s, m)!) !== null);
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
