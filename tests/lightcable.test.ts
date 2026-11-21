import { describe, expect, it } from "vitest";
import * as R from "../src/games/lightcable/rules";
import { bendAt, cableLines, reachFor, restEnd } from "../src/games/lightcable/layout";

const seeded = (s: number) => () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 2147483648);
const post = (x: number, z: number, kind: R.Kind = "plain", colour = R.WHITE, need = kind === "ring" ? 0 : kind === "counted" ? 2 : 1): R.Post => ({
  x,
  z,
  r: kind === "ring" ? R.RING_R : R.POST_R,
  kind,
  colour,
  need,
});
const hazard = (x: number, z: number): R.Hazard => ({ x, z, r: R.HAZARD_R });
const start = { x: -3.8, z: 0 },
  exit = { x: 3.8, z: 0 };
const wrap = (p: number, side: R.Side) => R.wrapMove(p, side);
/** Plays the moves in order, each legal. */
function make(state: R.State, moves: ReturnType<typeof wrap>[]) {
  let s = state;
  for (const m of moves) {
    const next = R.play(s, m);
    expect(next, `move ${m.to}`).not.toBeNull();
    s = next!;
  }
  return s;
}
const close = (a: R.Pt, b: R.Pt, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.z).toBeCloseTo(b.z, digits);
};

describe("tangent geometry", () => {
  it("runs along the outer tangent for the same side and the inner one for opposite sides", () => {
    // Clockwise round both (seen from above, z toward the player): the cable runs along their far edges (z = −1).
    const same = R.tangent({ x: 0, z: 0, r: 1, s: R.CW }, { x: 10, z: 0, r: 1, s: R.CW })!;
    close(same.a, { x: 0, z: -1 });
    close(same.b, { x: 10, z: -1 });
    const other = R.tangent({ x: 0, z: 0, r: 1, s: R.CCW }, { x: 10, z: 0, r: 1, s: R.CCW })!;
    close(other.a, { x: 0, z: 1 });
    // Opposite sides: the run crosses between the circles, through their midpoint.
    const inner = R.tangent({ x: 0, z: 0, r: 1, s: R.CW }, { x: 10, z: 0, r: 1, s: R.CCW })!;
    expect(R.segmentDistance({ x: 5, z: 0 }, inner.a, inner.b)).toBeLessThan(1e-9);
    expect(inner.a.z).toBeLessThan(0);
    expect(inner.b.z).toBeGreaterThan(0);
  });
  it("touches each circle at a right angle to its radius, from a point too", () => {
    for (const [a, b] of [
      [{ x: -2, z: 1, r: 0, s: 0 }, { x: 1.5, z: -0.7, r: 0.4, s: R.CW }],
      [{ x: -2, z: 1, r: 0.3, s: R.CCW }, { x: 1.5, z: -0.7, r: 0.5, s: R.CW }],
      [{ x: 0.2, z: 2, r: 0.24, s: R.CW }, { x: -1, z: -1, r: 0, s: 0 }],
    ] as R.Anchor[][]) {
      const run = R.tangent(a, b)!,
        dx = run.b.x - run.a.x,
        dz = run.b.z - run.a.z;
      for (const [c, p] of [
        [a, run.a],
        [b, run.b],
      ] as const) {
        expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeCloseTo(c.r, 9);
        if (c.r) expect((p.x - c.x) * dx + (p.z - c.z) * dz).toBeCloseTo(0, 9);
        // The centre lies on the side the anchor says (right of the way run for clockwise).
        if (c.r) expect(Math.sign(dx * (c.z - p.z) - dz * (c.x - p.x))).toBe(c.s);
      }
    }
    expect(R.tangent({ x: 0, z: 0, r: 1, s: R.CW }, { x: 0.5, z: 0, r: 0, s: 0 })).toBeNull();
  });
  it("lays the cable as runs and arcs, the arcs bending the way of their wraps", () => {
    const s = make(R.boardOf(1, [post(0, -1)], [], start, exit), [wrap(0, R.CW)]),
      { runs, arcs } = R.cableOf(s, exit);
    expect(runs).toHaveLength(2);
    expect(arcs).toHaveLength(1);
    // Over the top of the post clockwise: arrive on its left side, leave on its right.
    expect(arcs[0].sweep).toBeGreaterThan(0);
    expect(arcs[0].sweep).toBeLessThan(Math.PI);
    close(R.arcPoint(arcs[0], 0), runs[0].b);
    close(R.arcPoint(arcs[0], 1), runs[1].a);
    // The drawn line is joined from the start to the end without gaps.
    const { fixed, free } = cableLines(s, exit);
    close(fixed[0], start);
    close(free[0], fixed[fixed.length - 1]);
    close(free[free.length - 1], exit);
    for (const line of [fixed, free]) for (let i = 1; i < line.length; i++) expect(Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z)).toBeLessThan(0.06);
  });
});

describe("wraps, unwraps and refusals", () => {
  // Three posts in a row with one standing in the way of a straight run from the start to the far one.
  const board = R.boardOf(1, [post(-1, 0), post(1, 0), post(0, -1.5)], [], start, exit);
  it("lights a post it wraps, never a post it only passes, and frees it again", () => {
    const s = make(board, [wrap(2, R.CW)]);
    expect(R.isLit(s, 2)).toBe(true);
    expect(s.last).toMatchObject({ kind: "wrap", post: 2, lit: [2] });
    expect(R.isLit(s, 0)).toBe(false);
    const back = R.play(s, R.unwrapMove())!;
    expect(back.wraps).toEqual([]);
    expect(R.isLit(back, 2)).toBe(false);
    expect(back.last).toMatchObject({ kind: "unwrap", dimmed: [2] });
    expect(R.play(back, R.unwrapMove())).toBeNull();
    expect(R.refusal(back, R.unwrapMove())).toBe("감긴 기둥이 없습니다.");
  });
  it("refuses a run through another post, and the same post twice in a row", () => {
    // From the start straight to the post at (1, 0) the post at (−1, 0) stands in the way.
    expect(R.play(board, wrap(1, R.CW))).toBeNull();
    expect(R.refusal(board, wrap(1, R.CW))).toBe("케이블이 다른 기둥을 뚫고 지나갈 수 없습니다.");
    const s = make(board, [wrap(0, R.CCW)]);
    expect(R.play(s, wrap(0, R.CW))).toBeNull();
    expect(R.refusal(s, wrap(0, R.CW))).toContain("같은 기둥을 연달아");
    // After another post the first may be wrapped again.
    const t = make(s, [wrap(1, R.CCW), wrap(2, R.CCW)]);
    expect(R.play(t, wrap(0, R.CCW))).not.toBeNull();
  });
  it("undo replays every move but the last, unwraps included", () => {
    const s = make(board, [wrap(2, R.CW), wrap(1, R.CW), R.unwrapMove(), wrap(0, R.CCW)]);
    expect(s.ply).toBe(4);
    const u = R.undo(s);
    expect(u.ply).toBe(3);
    expect(u.wraps).toEqual([{ post: 2, side: R.CW }]);
    expect(R.undo(u).wraps).toEqual([
      { post: 2, side: R.CW },
      { post: 1, side: R.CW },
    ]);
  });
  it("lists the moves play makes", () => {
    const s = make(board, [wrap(2, R.CW)]),
      list = R.moves(s);
    expect(list).toContainEqual(R.unwrapMove());
    expect(list).not.toContainEqual(wrap(2, R.CCW));
    for (const m of list) expect(R.play(s, m)).not.toBeNull();
  });
});

describe("coils", () => {
  // A coil right on the way from the start to the post below it.
  const board = R.boardOf(1, [post(0, 1.5), post(0, -1.5)], [hazard(-1.9, 0.9)], start, exit);
  it("shorts when a fixed run touches a coil: made, a failure, taken back with undo", () => {
    expect(R.judgeWrap(board, 0, R.CCW)).toBe("short");
    const s = R.play(board, wrap(0, R.CCW))!;
    expect(s.winner).toBe(1);
    expect(s.trouble).toBe("케이블이 고압 코일에 닿았습니다");
    expect(R.lightCable.reason(s)).toBe("실패! 케이블이 고압 코일에 닿았습니다.");
    expect(R.moves(s)).toEqual([]);
    expect(R.play(s, R.unwrapMove())).toBeNull();
    const u = R.undo(s);
    expect(u.winner).toBeNull();
    expect(u.wraps).toEqual([]);
    // The other way round is clear of it.
    expect(R.judgeWrap(board, 1, R.CW)).toBe("");
  });
  it("shorts when the bend round the post before touches a coil, though no run does", () => {
    const b = R.boardOf(1, [post(0, 0), post(-2.5, -1)], [hazard(0.5, 0)], start, exit),
      s = make(b, [wrap(0, R.CCW)]);
    // Wrapped anticlockwise from below, the cable goes on round the post's right side (where the coil stands) to reach
    // the post up at the left.
    const run = R.tangent(R.pivotOf(s), { ...b.posts[1], s: R.CCW })!;
    expect(R.segmentDistance(b.hazards[0], run.a, run.b)).toBeGreaterThan(R.HAZARD_R);
    expect(R.segmentDistance(b.hazards[0], R.cableOf(s).runs[0].a, R.cableOf(s).runs[0].b)).toBeGreaterThan(R.HAZARD_R);
    expect(R.judgeWrap(s, 1, R.CCW)).toBe("short");
    expect(R.play(s, wrap(1, R.CCW))!.winner).toBe(1);
  });
});

describe("colours and counted posts", () => {
  it("lights a coloured post only with a cable of its colour, which a ring gives", () => {
    const b = R.boardOf(4, [post(-2, -1, "ring", R.RED), post(0, 1, "coloured", R.RED), post(2, -1, "coloured", R.BLUE)], [], start, exit);
    const dark = make(b, [wrap(1, R.CCW)]);
    expect(R.isLit(dark, 1)).toBe(false);
    expect(dark.tint).toBe(R.WHITE);
    const red = make(b, [wrap(0, R.CW), wrap(1, R.CCW)]);
    expect(red.tint).toBe(R.RED);
    expect(R.isLit(red, 1)).toBe(true);
    // Rings need no lighting; a blue post stays dark on a red cable.
    expect(R.mustLight(b.posts[0])).toBe(false);
    const blue = make(red, [wrap(2, R.CW)]);
    expect(R.isLit(blue, 2)).toBe(false);
    expect(R.unlitCount(blue)).toBe(1);
    // The cable's colour runs from the ring on.
    expect(R.cableOf(blue).tints).toEqual([R.WHITE, R.RED, R.RED]);
  });
  it("lights a counted post after that many separate wraps", () => {
    const b = R.boardOf(1, [post(0, 0, "counted", R.WHITE, 2), post(-1.5, 1.5), post(1.5, -1.5)], [], start, exit),
      once = make(b, [wrap(0, R.CW)]);
    expect(once.counts[0]).toBe(1);
    expect(R.isLit(once, 0)).toBe(false);
    const twice = make(once, [wrap(2, R.CW), wrap(0, R.CW)]);
    expect(twice.counts[0]).toBe(2);
    expect(R.isLit(twice, 0)).toBe(true);
    expect(twice.last!.lit).toEqual([0]);
  });
});

describe("crossing", () => {
  // Four posts at the corners of a square: round the top left, over to the top right and back down to the bottom
  // right, which cuts across the first run.
  const posts = () => [post(-1, -1), post(1, -1), post(1, 1), post(-1, 1)];
  const moves = [wrap(0, R.CW), wrap(1, R.CCW), wrap(2, R.CW)];
  it("lets the cable cross itself on the first stages and refuses it from 어려움", () => {
    const loose = R.boardOf(2, posts(), [], { x: -3.8, z: -1.6 }, exit);
    expect(loose.crossing).toBe(true);
    const crossed = make(loose, moves);
    expect(crossed.wraps).toHaveLength(3);
    const { runs } = R.cableOf(crossed);
    expect(R.crosses(runs[0].a, runs[0].b, runs[2].a, runs[2].b) || R.crosses(runs[1].a, runs[1].b, runs[2].a, runs[2].b)).toBe(true);
    const strict = R.boardOf(3, posts(), [], { x: -3.8, z: -1.6 }, exit);
    expect(strict.crossing).toBe(false);
    const s = make(strict, moves.slice(0, 2));
    expect(R.play(s, moves[2])).toBeNull();
    expect(R.refusal(s, moves[2])).toContain("케이블이 서로 겹칠 수 없습니다.");
  });
});

describe("plugging in", () => {
  const board = R.boardOf(1, [post(0, -1), post(1.5, 1)], [], start, exit);
  it("refuses while a post is dark, naming how many are left, and wins once all are lit", () => {
    const s = make(board, [wrap(0, R.CW)]);
    expect(R.play(s, R.plugMove())).toBeNull();
    expect(R.refusal(s, R.plugMove())).toBe("아직 불이 들어오지 않은 기둥이 1개 있습니다. 모두 밝힌 다음 출구에 꽂으세요.");
    const t = make(s, [wrap(1, R.CCW)]),
      won = R.play(t, R.plugMove())!;
    expect(won.winner).toBe(0);
    expect(R.lightCable.reason(won)).toMatch(/^성공!/);
    expect(R.hint(won)).toBeNull();
  });
  it("refuses a run to the exit that a post or a coil stands in", () => {
    // Post 1 stands on the way from post 0 to the exit (counted as lit, so that only the way is judged).
    const posted = make(R.boardOf(1, [post(0, -1), post(2, -0.45)], [], start, exit), [wrap(0, R.CW)]);
    expect(R.judgePlug({ ...posted, counts: [1, 1] })).toBe("through");
    const coiled = make(R.boardOf(1, [post(0, -1)], [hazard(2, -0.55)], start, exit), [wrap(0, R.CW)]);
    expect(R.play(coiled, R.plugMove())).toBeNull();
    expect(R.refusal(coiled, R.plugMove())).toContain("고압 코일");
  });
});

describe("the free end", () => {
  it("rests a little round the last post, bent the way of the wrap", () => {
    const s = make(R.boardOf(1, [post(0, -1), post(1.5, 1)], [], start, exit), [wrap(0, R.CW)]),
      end = restEnd(s),
      bend = bendAt(s, end);
    expect(bend).toBeGreaterThan(0.5);
    expect(bend).toBeLessThan(Math.PI);
    expect(restEnd(R.boardOf(1, [post(0, 0)], [], start, exit))).toEqual({ x: start.x + 0.45, z: start.z });
  });
});

/** Plays the hints from `state` until it is over. */
function byHints(state: R.State, guard = 60) {
  let s = state;
  for (let k = 0; k < guard && s.winner === null; k++) {
    const m = R.hint(s);
    expect(m).not.toBeNull();
    s = R.play(s, m!)!;
    expect(s).not.toBeNull();
  }
  return s;
}

describe("laying a puzzle, the search and the hint", () => {
  it("lays boards of every stage that its plan and the search both solve, quickly", () => {
    for (let stage = 1; stage <= R.STAGES.length; stage++) {
      const random = seeded(stage * 131),
        spec = R.STAGES[stage - 1];
      let total = 0;
      const count = 20;
      for (let k = 0; k < count; k++) {
        const t0 = performance.now(),
          s = R.createGame(stage, random);
        total += performance.now() - t0;
        expect(s.stage).toBe(stage);
        expect(s.crossing).toBe(spec.crossing);
        const must = s.posts.filter(R.mustLight);
        expect(must.length).toBeGreaterThanOrEqual(spec.posts[0]);
        expect(must.length).toBeLessThanOrEqual(spec.posts[1]);
        expect(s.posts.filter((p) => p.kind === "ring")).toHaveLength(spec.rings);
        expect(s.posts.filter((p) => p.kind === "coloured").length).toBeGreaterThanOrEqual(spec.coloured[0]);
        expect(s.posts.filter((p) => p.kind === "counted").length).toBeGreaterThanOrEqual(spec.counted[0]);
        expect(s.hazards.length).toBeGreaterThanOrEqual(spec.hazards[0]);
        // Posts and coils stand apart and on the board.
        for (const p of s.posts) {
          expect(Math.abs(p.x)).toBeLessThan(R.WIDTH);
          expect(Math.abs(p.z)).toBeLessThan(R.DEPTH);
          for (const h of s.hazards) expect(Math.hypot(p.x - h.x, p.z - h.z)).toBeGreaterThan(p.r + h.r);
        }
        // The plan wins through play.
        let t = s;
        for (const m of s.plan) t = R.play(t, m)!;
        expect(t.winner).toBe(0);
        // So does the search on its own.
        const way = R.solve(s, 25000, false);
        expect(way, `stage ${stage} board ${k}`).not.toBeNull();
        let u = s;
        for (const m of way!) u = R.play(u, m)!;
        expect(u.winner).toBe(0);
        // And the hints.
        expect(byHints(s).winner).toBe(0);
      }
      // Well under 300 ms a board on average (a browser runs about as fast).
      expect(total / count, `stage ${stage}`).toBeLessThan(300);
    }
  }, 120000);
  it("is laid the same from the same numbers, from one draw", () => {
    let draws = 0;
    const counted = () => (draws++, 0.37);
    const a = R.createGame(3, counted);
    expect(draws).toBe(1);
    const b = R.createGame(3, () => 0.37);
    expect(b.posts).toEqual(a.posts);
    expect(b.hazards).toEqual(a.hazards);
  });
  it("seldom lets a random wrapper through, and less often on the harder stages", () => {
    const mean = (stage: number) => {
      const random = seeded(stage * 977);
      let sum = 0;
      for (let k = 0; k < 8; k++) sum += R.luck(R.createGame(stage, random), 200, random);
      return sum / 8;
    };
    const easy = mean(1),
      hard = mean(3);
    expect(easy).toBeLessThan(0.35);
    expect(hard).toBeLessThan(easy);
  }, 60000);
  it("brings a cable gone astray back to a win by hints alone, freeing wraps where it must", () => {
    for (let stage = 1; stage <= R.STAGES.length; stage++) {
      const random = seeded(stage * 71);
      for (let k = 0; k < 4; k++) {
        let s = R.createGame(stage, random);
        // A few random wraps of my own first (no short circuits).
        for (let i = 0; i < 3; i++) {
          const options = R.moves(s).filter((m) => m.to >= 0 && R.play(s, m)!.winner === null);
          if (!options.length) break;
          s = R.play(s, options[Math.floor(random() * options.length)])!;
        }
        expect(byHints(s, 80).winner, `stage ${stage}`).toBe(0);
      }
    }
  }, 60000);
  it("hints the unwrap where the cable cannot be finished", () => {
    // A wall of coils across the board: nothing beyond it can be reached.
    const wall = [-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5].map((z) => hazard(0, z)),
      b = R.boardOf(1, [post(-2, 0), post(2, 0)], wall, start, exit),
      s = make(b, [wrap(0, R.CW)]);
    expect(R.solve(s)).toBeNull();
    expect(R.hint(s)).toEqual(R.unwrapMove());
  });
});

describe("the way a hand draws the end for a move", () => {
  it("sweeps the free run onto the post on the side the hint names, without catching any other", () => {
    // A small simulation of the view's sweep: catches by touch, side by the run's old direction, unwraps by bend.
    function drawAlong(state: R.State, from: R.Pt, points: R.Pt[]) {
      let s = state,
        end = from;
      const bends = s.wraps.map(() => 0.5);
      if (bends.length) bends[bends.length - 1] = bendAt(s, end);
      for (const target of points) {
        const steps = Math.max(1, Math.ceil(Math.hypot(target.x - end.x, target.z - end.z) / 0.025));
        const a = end;
        for (let i = 1; i <= steps; i++) {
          const p = { x: a.x + ((target.x - a.x) * i) / steps, z: a.z + ((target.z - a.z) * i) / steps };
          while (s.wraps.length) {
            const before = bends[bends.length - 1],
              bend = before + R.wrapPi(bendAt(s, p) - R.turnOf(before));
            if (bend >= 0) {
              bends[bends.length - 1] = bend;
              break;
            }
            s = R.play(s, R.unwrapMove())!;
            bends.pop();
          }
          const run = R.tangent(R.pivotOf(s), R.pointAnchor(p))!,
            old = R.tangent(R.pivotOf(s), R.pointAnchor(end))!,
            last = s.wraps.length ? s.wraps[s.wraps.length - 1].post : -1;
          const hit = s.posts.findIndex((q, k) => k !== last && R.segmentDistance(q, run.a, run.b) < q.r);
          if (hit >= 0) {
            const q = s.posts[hit],
              ox = old.b.x - old.a.x,
              oz = old.b.z - old.a.z,
              side: R.Side = ox * (q.z - old.a.z) - oz * (q.x - old.a.x) >= 0 ? R.CW : R.CCW;
            s = R.play(s, R.wrapMove(hit, side))!;
            const bend = bendAt(s, p);
            bends.push(bend > Math.PI ? 1e-3 : bend);
          }
          end = p;
        }
      }
      return { state: s, end };
    }
    for (let stage = 1; stage <= 5; stage++) {
      const random = seeded(stage * 53);
      for (let k = 0; k < 3; k++) {
        let s = R.createGame(stage, random),
          end = restEnd(s);
        for (let guard = 0; guard < 30 && s.winner === null; guard++) {
          const m = R.hint(s)!;
          if (m.to === R.PLUG) {
            s = R.play(s, m)!;
            break;
          }
          const drawn = drawAlong(s, end, reachFor(s, end, m)),
            want = R.play(s, m)!;
          expect(drawn.state.wraps, `stage ${stage} board ${k} move ${guard}`).toEqual(want.wraps);
          s = want;
          end = drawn.end;
        }
        expect(s.winner).toBe(0);
      }
    }
  }, 60000);
});
