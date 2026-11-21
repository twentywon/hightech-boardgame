import { describe, expect, it } from "vitest";
import {
  AHEAD,
  CELLS,
  MIDDLE,
  NEIGHBOURS,
  PLAIN,
  SHREWD,
  SIZE,
  STAGES,
  WAYS,
  catStep,
  createGame,
  hint,
  isEdge,
  moves,
  play,
  refusal,
  shutIn,
  solve,
  trapCat,
  type State,
} from "../src/games/trapcat/rules";
import { RADIUS, STEP, hexAt, hexUnder } from "../src/games/trapcat/layout";

const seeded = (s: number) => () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 2147483648);
const block = (to: number) => ({ from: -1, to, extra: -1 });
const at = (r: number, c: number) => r * SIZE + c;
/** A plain field with the cat at `cat` and blocks at `blocks`. */
function field(cat: number, blocks: number[], stage = 3, seed = 1): State {
  const blocked = new Array(CELLS).fill(0);
  for (const b of blocks) blocked[b] = 1;
  return { blocked, given: [...blocks], mine: [], cat, seed, stage, plan: [], last: null, winner: null, ply: 0, trouble: "" };
}
/** Distances to the edge over open hexes, plainly. */
function distances(blocked: number[]) {
  const d = new Array(CELLS).fill(Infinity),
    queue: number[] = [];
  for (let i = 0; i < CELLS; i++)
    if (isEdge(i) && !blocked[i]) {
      d[i] = 0;
      queue.push(i);
    }
  while (queue.length) {
    const x = queue.shift()!;
    for (const y of NEIGHBOURS[x])
      if (!blocked[y] && d[y] > d[x] + 1) {
        d[y] = d[x] + 1;
        queue.push(y);
      }
  }
  return d;
}
/** Plays the hint until the puzzle ends. */
function followHints(state: State) {
  let s = state;
  for (let k = 0; k < 200 && s.winner === null; k++) {
    const m = hint(s);
    expect(m).not.toBeNull();
    s = play(s, m!)!;
    expect(s).not.toBeNull();
  }
  return s;
}

describe("trap the cat: the field", () => {
  it("has six neighbours inside, symmetric, one step apart on the table", () => {
    for (let i = 0; i < CELLS; i++) {
      if (!isEdge(i)) expect(NEIGHBOURS[i]).toHaveLength(6);
      for (const j of NEIGHBOURS[i]) {
        expect(NEIGHBOURS[j]).toContain(i);
        const a = hexAt(i),
          b = hexAt(j);
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(STEP, 6);
      }
    }
    expect(isEdge(MIDDLE)).toBe(false);
    for (let i = 0; i < CELLS; i++) {
      const p = hexAt(i);
      expect(hexUnder(p.x, p.z)).toBe(i);
      expect(hexUnder(p.x + RADIUS * 0.5, p.z)).toBe(i);
    }
  });
});

describe("trap the cat: blocks and the cat's answer", () => {
  it("refuses a blocked hex and the cat's own, with words", () => {
    const s = field(MIDDLE, [at(2, 2)]);
    expect(play(s, block(at(2, 2)))).toBeNull();
    expect(play(s, block(MIDDLE))).toBeNull();
    expect(play(s, block(-1))).toBeNull();
    expect(refusal(s, block(at(2, 2)))).toBe("이미 막힌 칸입니다.");
    expect(refusal(s, block(MIDDLE))).toBe("고양이가 있는 칸은 막을 수 없습니다.");
    expect(refusal(s, block(at(3, 3)))).toBeNull();
    expect(moves(s)).toHaveLength(CELLS - 2);
    expect(moves(s).some((m) => m.to === MIDDLE || m.to === at(2, 2))).toBe(false);
  });
  it("blocks the hex and lets the cat step one hex nearer the edge", () => {
    for (const stage of [1, 2, 3, 4, 5]) {
      const s = field(MIDDLE, [], stage, 3),
        next = play(s, block(at(0, 0)))!,
        d = distances(next.blocked);
      expect(next.blocked[at(0, 0)]).toBe(1);
      expect(next.mine).toEqual([at(0, 0)]);
      expect(NEIGHBOURS[MIDDLE]).toContain(next.cat);
      expect(d[next.cat]).toBe(d[MIDDLE] - 1);
      expect(next.last).toMatchObject({ block: at(0, 0), from: MIDDLE, to: next.cat, trapped: false, escaped: false });
      expect(next.winner).toBeNull();
      expect(next.ply).toBe(1);
    }
  });
  it("breaks ties in a fixed order: the plain cat goes west first, the others keep the most ways on", () => {
    // From the middle of an empty field every neighbour is one step nearer, so the plain cat never wanders here.
    const seed = 1,
      blocked = new Array(CELLS).fill(0);
    expect(catStep(blocked, MIDDLE, seed, PLAIN).to).toBe(MIDDLE - 1);
    for (const level of [WAYS, AHEAD, SHREWD]) {
      const a = catStep(blocked, MIDDLE, seed, level),
        b = catStep(blocked, MIDDLE, seed, level);
      expect(a).toEqual(b);
    }
  });
  it("always takes an open edge hex beside it, and that is the loss", () => {
    const cat = at(1, 5),
      s = field(cat, [], 4),
      next = play(s, block(at(5, 5)))!;
    expect(isEdge(next.cat)).toBe(true);
    expect(next.winner).toBe(1);
    expect(next.trouble).toBe("고양이가 빠져나갔습니다.");
    expect(next.last!.escaped).toBe(true);
    expect(trapCat.reason(next)).toMatch(/^실패!/);
    expect(hint(next)).toBeNull();
    expect(play(next, block(at(5, 6)))).toBeNull();
  });
  it("is trapped when my block takes its last open neighbour", () => {
    const around = NEIGHBOURS[MIDDLE],
      s = field(MIDDLE, around.slice(1)),
      next = play(s, block(around[0]))!;
    expect(next.winner).toBe(0);
    expect(next.cat).toBe(MIDDLE);
    expect(next.last).toMatchObject({ trapped: true, escaped: false, from: MIDDLE, to: MIDDLE });
    expect(trapCat.reason(next)).toMatch(/^성공!/);
  });
  it("once shut in, goes toward the most room", () => {
    // A ring round the middle two hexes out, leaving inside a pocket to the west (one hex) and room to the east.
    const ring = new Set<number>();
    for (const a of NEIGHBOURS[MIDDLE]) for (const b of NEIGHBOURS[a]) if (b !== MIDDLE && !NEIGHBOURS[MIDDLE].includes(b)) ring.add(b);
    // Wall off the western neighbour from the rest of the inside.
    const west = MIDDLE - 1,
      s = field(MIDDLE, [...ring, ...NEIGHBOURS[west].filter((y) => y !== MIDDLE && !ring.has(y))]);
    expect(shutIn(s.blocked, MIDDLE)).toBe(true);
    const step = catStep(s.blocked, MIDDLE, 5, SHREWD);
    expect(step.shut).toBe(true);
    expect(step.to).not.toBe(west);
    expect(NEIGHBOURS[MIDDLE]).toContain(step.to);
    // The hint now cuts the western pocket's side off: the cat is left the least room, and the hints trap it soon.
    const m = hint(s)!;
    expect(s.blocked[m.to]).toBe(0);
    const done = followHints(s);
    expect(done.winner).toBe(0);
    expect(done.ply).toBeLessThanOrEqual(8);
  });
  it("gives the same game again for the same blocks (undo and replay)", () => {
    for (const stage of [1, 3, 5]) {
      const start = createGame(stage, seeded(stage * 17));
      const blocks = moves(start)
        .map((m) => m.to)
        .filter((_, i) => i % 13 === 0)
        .slice(0, 6);
      const replay = () => {
        let s: State = start;
        const seen: State[] = [];
        for (const b of blocks) {
          if (s.winner !== null) break;
          const next = play(s, block(b));
          if (!next) continue;
          seen.push(next);
          s = next;
        }
        return seen;
      };
      expect(replay()).toEqual(replay());
    }
  });
});

describe("trap the cat: puzzles", () => {
  it("lays fields of the stage's blocks clear of the cat, each proven by a way that shuts the cat in, fast", () => {
    const report: string[] = [];
    for (let stage = 1; stage <= STAGES.length; stage++) {
      const random = seeded(stage * 1013 + 5),
        spec = STAGES[stage - 1];
      let total = 0,
        worst = 0;
      const N = 30;
      for (let k = 0; k < N; k++) {
        const t = performance.now(),
          s = createGame(stage, random),
          dt = performance.now() - t;
        total += dt;
        worst = Math.max(worst, dt);
        expect(s.cat).toBe(MIDDLE);
        expect(s.stage).toBe(stage);
        expect(s.given.length).toBeGreaterThanOrEqual(spec.blocks[0]);
        expect(s.given.length).toBeLessThanOrEqual(spec.blocks[1]);
        for (const b of s.given) expect(b === MIDDLE || NEIGHBOURS[MIDDLE].includes(b)).toBe(false);
        expect(s.blocked.reduce((a, b) => a + b, 0)).toBe(s.given.length);
        // Its plan, played against the stage's cat, shuts the cat in without its escaping.
        let p: State = s;
        for (const b of s.plan) {
          expect(p.winner).toBeNull();
          p = play(p, block(b))!;
          expect(p).not.toBeNull();
          expect(p.winner).not.toBe(1);
        }
        expect(p.winner === 0 || shutIn(p.blocked, p.cat)).toBe(true);
        // And the hints from there trap it.
        expect(followHints(p).winner).toBe(0);
      }
      report.push(`stage ${stage}: mean ${(total / N).toFixed(1)} ms, worst ${worst.toFixed(0)} ms`);
      expect(total / N).toBeLessThan(300);
    }
    process.stderr.write(`\ntrap the cat generation (node): ${report.join("; ")}\n`);
  }, 120000);
  it("follows hints from the start of a few boards to a win", () => {
    for (let stage = 1; stage <= STAGES.length; stage++) {
      const random = seeded(stage * 7 + 1);
      for (let k = 0; k < 4; k++) {
        const s = createGame(stage, random);
        expect(hint(s)).toEqual(block(s.plan[0]));
        expect(followHints(s).winner).toBe(0);
      }
    }
  }, 60000);
  it("finds a way again after I leave the plan, whenever the search finds one there", () => {
    let tried = 0;
    for (let stage = 1; stage <= STAGES.length; stage++) {
      const random = seeded(stage * 31 + 9);
      for (let k = 0; k < 3; k++) {
        const s = createGame(stage, random),
          // A block far from the cat that the plan does not begin with.
          off = moves(s).find((m) => isEdge(m.to) && m.to !== s.plan[0])!,
          next = play(s, off)!;
        if (next.winner !== null) continue;
        const way = solve(next);
        if (!way) {
          // No way found: the hint still names a hex on the cat's way.
          const m = hint(next)!;
          expect(next.blocked[m.to]).toBe(0);
          expect(m.to).not.toBe(next.cat);
          continue;
        }
        tried++;
        expect(followHints(next).winner).toBe(0);
      }
    }
    expect(tried).toBeGreaterThan(5);
  }, 60000);
  it("is deterministic for a seeded generator", () => {
    expect(createGame(4, seeded(99))).toEqual(createGame(4, seeded(99)));
  });
});
