import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as G from "../src/games/glide/rules";
import { CELL, arrowAt, cellAt, cellUnder, glideSubject, swipeDir } from "../src/games/glide/layout";

/**
 * A board from rows of glyphs: space the void, . floor, # block, / and \ turners, * ice, A/B portals of pairs 0/1,
 * s a switch and G a gate (colour 0, raised unless `lowered`), @ the goal, C the cube (on floor).
 */
function board(rows: string[], lowered = false): G.State {
  const h = rows.length,
    w = Math.max(...rows.map((r) => r.length)),
    kinds: number[] = [],
    tags: number[] = [];
  let cube = -1,
    goal = -1,
    gates = false;
  const glyph: Record<string, number> = { " ": G.AIR, ".": G.FLOOR, "#": G.BLOCK, "/": G.SLASH, "\\": G.BACKSLASH, "*": G.ICE, A: G.PORTAL, B: G.PORTAL, s: G.SWITCH, G: G.GATE, "@": G.GOAL, C: G.FLOOR };
  rows.forEach((row, r) => {
    for (let c = 0; c < w; c++) {
      const ch = row[c] ?? " ",
        i = r * w + c;
      kinds.push(glyph[ch]);
      tags.push(ch === "A" ? 0 : ch === "B" ? 1 : ch === "s" || ch === "G" ? 0 : -1);
      if (ch === "C") cube = i;
      if (ch === "@") goal = i;
      if (ch === "s" || ch === "G") gates = true;
    }
  });
  return { w, h, kinds, tags, goal, start: cube, cube, broken: [], raised: gates ? [!lowered] : [], fell: null, last: null, best: 0, stage: 1, winner: null, ply: 0, trouble: "" };
}
const push = (s: G.State, to: number) => G.play(s, { from: -1, to, extra: -1 });
const at = (s: G.State, r: number, c: number) => r * s.w + c;

describe("glide cube: the pieces", () => {
  test("the cube slides until the cell before a block, and a push straight into a block is refused", () => {
    const s = board(["C...#"]);
    const t = push(s, G.E)!;
    expect(t.cube).toBe(3);
    expect(t.winner).toBeNull();
    expect(t.last!.end).toBe("block");
    expect(t.last!.path.map((p) => p.c)).toEqual([1, 2, 3]);
    expect(push(t, G.E)).toBeNull();
    expect(G.refusal(t, { from: -1, to: G.E, extra: -1 })).toBe("그쪽은 막혀 있습니다.");
    expect(G.moves(t).map((m) => m.to)).toEqual([G.N, G.S, G.W]);
  });
  test("the cube slides off into the void: lost, with a reason, and undo is the state before", () => {
    const s = board(["C.. ", "...."]);
    const t = push(s, G.E)!;
    expect(t.winner).toBe(1);
    expect(t.fell).toBe(G.E);
    expect(t.cube).toBe(2);
    expect(t.trouble).toContain("떨어졌");
    expect(G.glide.reason(t)).toMatch(/^실패!/);
    expect(G.moves(t)).toHaveLength(0);
    expect(G.hint(t)).toBeNull();
    // Off the board's own edge too.
    expect(push(s, G.N)!.winner).toBe(1);
    // Taking it back is the state before, untouched.
    expect(s.cube).toBe(0);
    expect(push(s, G.S)!.cube).toBe(4);
  });
  test("passing over the goal is not enough; resting on it wins", () => {
    expect(push(board(["C.@.. "]), G.E)!.winner).toBe(1);
    const won = push(board(["C.@#"]), G.E)!;
    expect(won.winner).toBe(0);
    expect(won.last!.end).toBe("goal");
    expect(G.glide.reason(won)).toMatch(/^성공!/);
  });
  test("a / turner sends east to north and south to west; a \\ turner sends east to south and north to west", () => {
    // East into "/" goes north and stops under the block.
    const a = push(board([".#", "..", "C/"]), G.E)!;
    expect(a.cube).toBe(3);
    expect(a.last!.path.some((p) => p.turned)).toBe(true);
    // South into "/" goes west.
    const b = push(board(["..C", "#./"]), G.S)!;
    expect(b.cube).toBe(4);
    // East into "\" goes south.
    const c = push(board(["C\\", "..", ".#"]), G.E)!;
    expect(c.cube).toBe(3);
    // North into "\" goes west.
    const e = push(board(["#.\\", "...", "..C"]), G.N)!;
    expect(e.cube).toBe(1);
  });
  test("a turner whose way out is blocked stands as a wall, and the cube never rests on it", () => {
    const s = board(["  #", "C./"]);
    const t = push(s, G.E)!;
    expect(t.cube).toBe(4);
    expect(t.last!.end).toBe("wall");
    // Right before the wall it is refused.
    expect(push(t, G.E)).toBeNull();
    // Ice beyond a wall-turner is not struck.
    const iced = push(board(["  *", "C./", "..."]), G.E)!;
    expect(iced.broken).toEqual([]);
  });
  test("ice stops the cube and shatters, opening its cell; ice already touched cannot be pushed into", () => {
    const s = board(["C..*.#"]);
    const t = push(s, G.E)!;
    expect(t.cube).toBe(2);
    expect(t.last!.end).toBe("ice");
    expect(t.broken).toEqual([3]);
    // The cell is open now: the cube slides through it to the block.
    const u = push(t, G.E)!;
    expect(u.cube).toBe(4);
    // A cube resting against whole ice cannot break it by a push.
    const v = board(["C*.#"]);
    expect(push(v, G.E)).toBeNull();
    expect(G.refusal(v, { from: -1, to: G.E, extra: -1 })).toBe("그쪽은 막혀 있습니다.");
  });
  test("a portal sends the cube out of its partner the same way; blocked there, it rests on the far portal", () => {
    // Into A at (0,2), out of A at (2,0), going east to the block.
    const s = board(["CA.", "...", "A.#"]);
    const t = push(s, G.E)!;
    expect(t.cube).toBe(at(t, 2, 1));
    expect(t.last!.path.some((p) => p.warp)).toBe(true);
    // Far portal with a block right after it: rests on it.
    const r = push(board(["CA.", "...", "A#."]), G.E)!;
    expect(r.cube).toBe(at(r, 2, 0));
    // Leaving a portal sends nowhere.
    const l = push(r, G.N)!;
    expect(l.last!.path.some((p) => p.warp)).toBe(false);
    expect(l.last!.path[0]).toMatchObject({ r: 1, c: 0 });
  });
  test("passing a switch flips every gate of its colour: a raised gate stops, a lowered one is floor", () => {
    // Raised gate stops the cube; after passing the switch it is lowered.
    const s = board(["C.sG.#"]);
    const t = push(s, G.E)!;
    expect(t.raised).toEqual([false]);
    expect(t.cube).toBe(4);
    expect(t.last!.path.find((p) => p.toggle === 0)).toBeTruthy();
    // Without the switch on the way the raised gate stops it.
    const u = push(board([".sCG.#"]), G.E);
    expect(u).toBeNull();
    // Coming back over the switch raises it again.
    const back = push(board(["#.sCG#"], true), G.W)!;
    expect(back.raised).toEqual([true]);
  });
  test("a push that would go round for ever is refused", () => {
    // A ring of turners round floor: east from C runs round and round.
    const s = board(["/..\\", ".  .", "C  .", "\\../"]);
    // From C going north: (0,0) "/" turns north to east, along the top to "\" turning east to south, down to "/" turning south to west, along the bottom to "\" turning west to north, up past C again...
    expect(push(s, G.N)).toBeNull();
    expect(G.refusal(s, { from: -1, to: G.N, extra: -1 })).toContain("끝없이");
  });
  test("malformed moves are refused", () => {
    const s = board(["C...#"]);
    for (const move of [{ from: 0, to: 1, extra: -1 }, { from: -1, to: 4, extra: -1 }, { from: -1, to: 1, extra: 2 }, { from: -1, to: 1.5, extra: -1 }]) expect(G.play(s, move)).toBeNull();
  });
});
describe("glide cube: puzzles", () => {
  test("every stage lays puzzles whose fewest pushes lie in its band, quickly, and the hint wins in exactly that many", () => {
    for (let stage = 1; stage <= G.STAGES.length; stage++) {
      const { lo, hi } = G.STAGES[stage - 1],
        started = performance.now(),
        count = 12;
      for (let seed = 1; seed <= count; seed++) {
        const start = G.createGame(stage, seededRandom(seed * 977 + stage));
        expect(start.best).toBeGreaterThanOrEqual(lo);
        expect(start.best).toBeLessThanOrEqual(hi);
        expect(start.kinds[start.goal]).toBe(G.GOAL);
        expect(start.kinds[start.cube]).toBe(G.FLOOR);
        expect(G.solve(start)!.length).toBe(start.best);
        // Some wrong pushes fall off.
        let falls = 0;
        for (let d = 0; d < 4; d++) if (push(start, d)?.winner === 1) falls++;
        let state = start;
        for (let k = 0; k < start.best; k++) {
          const move = G.hint(state)!;
          expect(G.moves(state).some((m) => m.to === move.to)).toBe(true);
          for (let d = 0; d < 4; d++) if (d !== move.to && push(state, d)?.winner === 1) falls++;
          state = G.play(state, move)!;
        }
        expect(falls).toBeGreaterThan(0);
        expect(state.winner).toBe(0);
        expect(state.ply).toBe(start.best);
        expect(G.hint(state)).toBeNull();
      }
      // Well under the few hundred milliseconds a puzzle may take in a browser, on average.
      expect((performance.now() - started) / count).toBeLessThan(600);
    }
  }, 120000);
  test("each stage's way uses every piece the stage asks for, and the same numbers lay the same puzzle", () => {
    for (let stage = 2; stage <= 5; stage++)
      for (let seed = 1; seed <= 5; seed++) {
        const start = G.createGame(stage, seededRandom(seed * 31 + stage)),
          again = G.createGame(stage, seededRandom(seed * 31 + stage));
        expect(again.kinds).toEqual(start.kinds);
        expect(again.cube).toBe(start.cube);
        let state = start;
        const used = new Set<string>();
        for (const d of G.solve(start)!) {
          state = push(state, d)!;
          const last = state.last!;
          if (last.end === "ice") used.add("ice");
          for (const p of last.path) {
            if (p.turned) used.add("turn");
            if (p.warp) used.add("warp");
            if (p.toggle !== undefined) used.add("toggle");
          }
        }
        for (const need of G.STAGES[stage - 1].needs) expect(used.has(need)).toBe(true);
      }
  }, 60000);
  test("the bands lie well above the old ones, and naive players do not find the way", () => {
    // The fewest pushes the stages asked for before the puzzles were made harder.
    const old = [[3, 5], [5, 8], [7, 11], [9, 13], [12, 18]];
    G.STAGES.forEach((spec, i) => {
      expect(spec.lo).toBeGreaterThan(old[i][1]);
      expect(spec.hi).toBeGreaterThan(old[i][1]);
    });
    for (let stage = 1; stage <= G.STAGES.length; stage++) {
      const spec = G.STAGES[stage - 1];
      let lucky = 0,
        greedy = 0,
        small = 0,
        straight = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const s = G.createGame(stage, seededRandom(seed * 7919 + stage * 13));
        // Pushing at random, never off the edge, for twice the fewest pushes: worked out exactly.
        if (G.chance(s, 2 * s.best) > spec.luck) lucky++;
        if (G.greedily(s, seededRandom(seed))) greedy++;
        // The pushes reach many states (counted with the goal as a plain tile, as the board was judged).
        const kinds = [...s.kinds];
        kinds[s.goal] = G.FLOOR;
        const plain: G.State = { ...s, kinds, goal: -1 },
          seen = new Set<string>([`${s.cube}|${s.broken}|${s.raised}`]),
          queue = [plain];
        for (let i = 0; i < queue.length; i++)
          for (const m of G.moves(queue[i])) {
            const t = G.play(queue[i], m)!;
            const key = `${t.cube}|${t.broken}|${t.raised}`;
            if (t.winner === null && !seen.has(key)) {
              seen.add(key);
              queue.push(t);
            }
          }
        if (seen.size < spec.states) small++;
        // The shortest way goes away from the goal now and then.
        const apart = (x: G.State) => Math.abs((x.cube % x.w) - (x.goal % x.w)) + Math.abs(Math.floor(x.cube / x.w) - Math.floor(x.goal / x.w));
        let state = s,
          away = 0;
        for (const d of G.solve(s)!) {
          const before = apart(state);
          state = push(state, d)!;
          if (apart(state) > before) away++;
        }
        if (away < spec.away) straight++;
      }
      expect(lucky).toBeLessThanOrEqual(1);
      expect(greedy).toBeLessThanOrEqual(1);
      expect(small).toBeLessThanOrEqual(1);
      expect(straight).toBeLessThanOrEqual(1);
    }
  }, 120000);
  test("from states scattered off the way, the hint still reaches the goal or says there is none", () => {
    const random = seededRandom(4242);
    for (let stage = 1; stage <= 5; stage++) {
      const start = G.createGame(stage, seededRandom(stage * 13));
      for (let trial = 0; trial < 8; trial++) {
        let state = start;
        for (let k = 0; k < 6 && state.winner === null; k++) {
          const options = G.moves(state).filter((m) => push(state, m.to)!.winner === null);
          if (!options.length) break;
          state = G.play(state, options[Math.floor(random() * options.length)])!;
        }
        if (state.winner !== null) continue;
        const way = G.solve(state);
        if (!way) {
          expect(G.hint(state)).toBeNull();
          continue;
        }
        for (let k = 0; k < way.length; k++) state = G.play(state, G.hint(state)!)!;
        expect(state.winner).toBe(0);
      }
    }
  }, 60000);
  test("the game adapter and the layout helpers agree", () => {
    const s = G.glide.create("3");
    expect(s.stage).toBe(3);
    expect(G.glide.moves(s).length).toBeGreaterThan(0);
    expect(cellUnder(s.w, s.h, cellAt(s.w, s.h, s.cube).x, cellAt(s.w, s.h, s.cube).z)).toBe(s.cube);
    expect(arrowAt(7, 7, 24, G.E).x - cellAt(7, 7, 24).x).toBeGreaterThan(CELL / 2);
    expect(swipeDir(0, -40)).toBe(G.N);
    expect(swipeDir(40, 5)).toBe(G.E);
    expect(swipeDir(-3, 40)).toBe(G.S);
    expect(swipeDir(-40, 0)).toBe(G.W);
    expect(glideSubject(9, 9, 1.6).halfZ).toBeGreaterThan(4.5);
  });
});
