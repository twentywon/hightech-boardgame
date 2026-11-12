import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createGame,
  play,
  pass,
  resolveTurn,
  legalMoves,
  flipsAt,
  counts,
  outcome,
  point,
  directions,
  type State,
  type Player,
} from "../src/games/reversi/rules";
import { search, searchSteps, profiles } from "../src/games/reversi/ai";
import { stableEdges, positional } from "../src/games/reversi/evaluator";
import { difficulties } from "../src/core/ai";
import {
  getOptions,
  setOptions,
  OPTIONS_KEY,
} from "../src/games/reversi/storage";
import { fromWorld, toWorld } from "../src/games/reversi/coordinates";
import { playout, findPassHistory } from "./reversi-fixtures";
function blank(): State {
  const s = createGame();
  s.board.fill(0);
  return s;
}
afterEach(() => vi.unstubAllGlobals());
describe("Reversi rules", () => {
  it("initial arrangement and black legal D3 C4 F5 E6", () => {
    const s = createGame();
    expect(s.turn).toBe(1);
    expect(counts(s.board)).toEqual({ black: 2, white: 2, empty: 60 });
    expect([...s.board].flatMap((v, i) => (v === 1 ? [i] : []))).toEqual([
      28, 35,
    ]);
    expect(legalMoves(s.board, 1).map((m) => point(m.index))).toEqual([
      { row: 2, col: 3 },
      { row: 3, col: 2 },
      { row: 4, col: 5 },
      { row: 5, col: 4 },
    ]);
  });
  it("D3 flips D4 and alternates", () => {
    const s = createGame(),
      next = play(s, { row: 2, col: 3 })!;
    expect(next.flipped).toEqual([{ row: 3, col: 3 }]);
    expect(counts(next.board)).toEqual({ black: 4, white: 1, empty: 59 });
    expect(next.turn).toBe(2);
    expect(s.board[27]).toBe(2);
  });
  for (const [dr, dc] of directions)
    it(`captures direction ${dr},${dc}`, () => {
      const s = blank();
      s.board[(3 + dr) * 8 + 3 + dc] = 2;
      s.board[(3 + dr * 2) * 8 + 3 + dc * 2] = 1;
      const next = play(s, { row: 3, col: 3 })!;
      expect(next.flipped).toEqual([{ row: 3 + dr, col: 3 + dc }]);
    });
  it("flips all eight directions atomically", () => {
    const s = blank();
    for (const [r, c] of directions) {
      s.board[(3 + r) * 8 + 3 + c] = 2;
      s.board[(3 + r * 2) * 8 + 3 + c * 2] = 1;
    }
    const next = play(s, { row: 3, col: 3 })!;
    expect(next.flipped).toHaveLength(8);
    expect(counts(next.board)).toEqual({ black: 17, white: 0, empty: 47 });
    expect(next.winner).toBe(1);
  });
  it("rejects occupied, out of bounds and non-capturing squares without mutation", () => {
    const s = createGame(),
      before = s.board.slice();
    for (const p of [
      { row: 3, col: 3 },
      { row: 0, col: 0 },
      { row: -1, col: 0 },
      { row: 8, col: 0 },
      { row: 0.5, col: 3 },
    ])
      expect(play(s, p)).toBeNull();
    expect(s.board).toEqual(before);
  });
  it("cannot jump gaps, wrap edges or capture an unclosed line", () => {
    const s = blank();
    s.board[28] = 2;
    s.board[30] = 1;
    expect(flipsAt(s.board, 27, 1)).toEqual([]);
    s.board.fill(0);
    s.board[8] = 2;
    s.board[9] = 1;
    expect(flipsAt(s.board, 7, 1)).toEqual([]);
    s.board.fill(0);
    s.board[0] = 2;
    s.board[1] = 2;
    expect(flipsAt(s.board, 2, 1)).toEqual([]);
  });
  it("captures a long edge and a corner", () => {
    const s = blank();
    s.board.fill(2, 1, 7);
    s.board[7] = 1;
    expect(play(s, { row: 0, col: 0 })!.flipped).toHaveLength(6);
  });
  it("automatically passes opponent, then finishes with correct actual counts", () => {
    const s = blank();
    s.board.fill(1);
    s.board[0] = s.board[56] = 0;
    s.board[1] = s.board[57] = 2;
    const n = play(s, { row: 0, col: 0 })!;
    expect(n.lastPassed).toBe(2);
    expect(n.turn).toBe(1);
    expect(n.passes).toEqual([{ player: 2, after: 1 }]);
    const end = play(n, { row: 7, col: 0 })!;
    expect(end.winner).toBe(1);
    expect(counts(end.board)).toEqual({ black: 64, white: 0, empty: 0 });
    expect(play(end, { row: 0, col: 0 })).toBeNull();
    expect(pass(end)).toBeNull();
  });
  it("allows only forced passes; two immobile players end even with empty squares", () => {
    expect(pass(createGame())).toBeNull();
    const s = blank();
    s.board.fill(1);
    s.board[0] = 0;
    s.board[1] = 2;
    s.turn = 2;
    expect(pass(s)!.turn).toBe(1);
    s.board[1] = 1;
    const end = resolveTurn(s);
    expect(end.winner).toBe(1);
    expect(counts(end.board).black).toBe(63);
  });
  it("draws and white wins on real final counts", () => {
    const s = blank();
    for (let i = 0; i < 64; i++) s.board[i] = (i % 2) + 1;
    expect(resolveTurn(s).winner).toBe("draw");
    s.board.fill(2);
    s.board[0] = 0;
    s.board[1] = 1;
    s.turn = 2;
    const end = play(s, { row: 0, col: 0 })!;
    expect(end.winner).toBe(2);
    expect(outcome(end.board)).toBe(2);
  });
  it("move generation agrees with capture rules through complete legal games", () => {
    for (let seed = 1; seed <= 3; seed++) {
      let s = createGame();
      while (!s.winner) {
        const moves = legalMoves(s.board, s.turn);
        expect(moves.length).toBeGreaterThan(0);
        for (let i = 0; i < 64; i++)
          expect(moves.some((m) => m.index === i)).toBe(
            flipsAt(s.board, i, s.turn).length > 0,
          );
        s = play(
          s,
          point(moves[(seed + s.moves.length) % moves.length].index),
        )!;
      }
      expect(s.moves.length).toBeLessThanOrEqual(60);
      expect(counts(s.board).black + counts(s.board).white).toBe(
        s.moves.length + 4,
      );
    }
  });
  it("restarts and round-trips cell coordinates", () => {
    expect(createGame()).toEqual(createGame());
    for (let i = 0; i < 64; i++) {
      const p = point(i),
        w = toWorld(p);
      expect(fromWorld(w.x, w.z)).toEqual(p);
    }
    expect(fromWorld(3, 0)).toBeNull();
  });
});
describe.each(difficulties)("Reversi %s AI", (difficulty) => {
  it("chooses legal unoccupied moves and preserves input", () => {
    const s = playout(5, 40),
      copy = s.board.slice();
    const result = search(s, difficulty, { timeMs: 35, seed: 7 });
    expect(result.move && play(s, result.move)).toBeTruthy();
    expect(s.board).toEqual(copy);
  });
  it("takes an available unique corner", () => {
    const s = blank();
    s.board.fill(1);
    s.board[0] = 0;
    s.board[1] = 2;
    expect(search(s, difficulty).move).toEqual({ row: 0, col: 0 });
  });
  it("handles passes and finished states without illegal actions", () => {
    const s = blank();
    s.board.fill(1);
    s.board[0] = 0;
    s.board[1] = 2;
    s.turn = 2;
    expect(search(s, difficulty).pass).toBe(true);
    expect(search(s, difficulty).move).toBeNull();
    s.winner = 1;
    expect(search(s, difficulty).pass).toBe(false);
    expect(search(s, difficulty).move).toBeNull();
    s.winner = null;
    s.board.fill(1);
    expect(search(s, difficulty).stats.reason).toBe("finished");
  });
  it("returns a legal fallback on deadline and reproduces a seeded node-limited search", () => {
    const s = playout(2, 40);
    const expired = search(s, difficulty, { timeMs: 0 });
    expect(expired.stats.timedOut).toBe(true);
    expect(expired.move && play(s, expired.move)).toBeTruthy();
    const options = { timeMs: Infinity, maxNodes: 40, seed: 101 };
    const a = search(s, difficulty, options),
      b = search(s, difficulty, options);
    expect(a.move).toEqual(b.move);
    expect(a.stats.nodes).toEqual(b.stats.nodes);
  });
});
// Independent small-endgame oracle uses public immutable play, including same-player
// turns after automatic passes; it does not reuse AI make/unmake or negamax code.
function oracle(s: State, root: Player): number {
  if (s.winner) {
    const c = counts(s.board);
    return root === 1 ? c.black - c.white : c.white - c.black;
  }
  const values = legalMoves(s.board, s.turn).map((m) =>
    oracle(play(s, point(m.index))!, root),
  );
  return s.turn === root ? Math.max(...values) : Math.min(...values);
}
describe("Reversi strategic and exact search", () => {
  it("adjusts corner-neighbor danger after the corner is occupied", () => {
    const b = new Int8Array(64);
    const empty = positional(b, 1);
    b[9] = 1;
    expect(positional(b, 1) - empty).toBeLessThan(0);
    b[0] = 1;
    const withX = positional(b, 1);
    b[9] = 0;
    expect(withX - positional(b, 1)).toBe(0);
  });
  it("counts only conservative corner-anchored stable edge discs", () => {
    const b = new Int8Array(64);
    b[27] = 1;
    expect(stableEdges(b, 1)).toBe(0);
    b.fill(1);
    expect(stableEdges(b, 1)).toBe(28);
  });
  it("matches independent exact terminal search, with and without transposition table", () => {
    for (const seed of [3, 8, 15]) {
      const s = playout(seed, 6);
      expect(s.winner).toBeNull();
      const value = oracle(s, s.turn);
      for (const useTable of [true, false]) {
        const r = search(s, "expert", { timeMs: Infinity, useTable });
        expect(r.stats.solved).toBe(true);
        expect(r.stats.score).toBe(value * 10000);
        expect(oracle(play(s, r.move!)!, s.turn)).toBe(value);
      }
    }
  }, 15000);
  it("can solve a small endgame more accurately than the introductory heuristic", () => {
    const s = playout(3, 6);
    const low = search(s, "beginner", { seed: 7 }),
      high = search(s, "expert", { timeMs: Infinity });
    const a = oracle(play(s, low.move!)!, s.turn),
      b = oracle(play(s, high.move!)!, s.turn);
    expect(b).toBeGreaterThan(a);
    expect(high.stats.solved).toBe(true);
    expect(
      search(playout(5, 40), "normal", { timeMs: Infinity, maxNodes: 50 }).stats
        .nodes,
    ).toBeGreaterThan(0);
  });
  it("cooperative suspension preserves deterministic search and the original board", () => {
    const state = playout(5, 40),
      before = state.board.slice();
    const baseline = search(state, "expert", {
      timeMs: Infinity,
      maxNodes: 150,
      now: () => 0,
    });
    let ticks = 0,
      yields = 0;
    const iterator = searchSteps(state, "expert", {
      timeMs: Infinity,
      maxNodes: 150,
      now: () => (ticks += 2),
    });
    let step = iterator.next();
    while (!step.done) {
      yields++;
      expect(state.board).toEqual(before);
      step = iterator.next();
    }
    expect(yields).toBeGreaterThan(0);
    expect(step.value.move).toEqual(baseline.move);
    expect(step.value.stats.nodes).toBe(baseline.stats.nodes);
    expect(state.board).toEqual(before);
  });
  it("leaves an incomplete exact search explicitly unsolved", () => {
    const r = search(playout(8, 8), "expert", {
      timeMs: Infinity,
      maxNodes: 3,
    });
    expect(r.stats.solved).toBe(false);
    expect(r.stats.nodeLimited).toBe(true);
  });
});
describe("Reversi preferences", () => {
  it("keeps its options apart from Gomoku and survives unavailable storage", () => {
    const map = new Map<string, string>([["wtg.ai.v1", "gomoku preferences"]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => map.set(k, v),
    });
    setOptions({ difficulty: "expert", color: "random" });
    expect(getOptions()).toEqual({ difficulty: "expert", color: "random" });
    expect(map.get("wtg.ai.v1")).toBe("gomoku preferences");
    expect(map.has(OPTIONS_KEY)).toBe(true);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error();
      },
      setItem: () => {
        throw Error();
      },
    });
    expect(getOptions()).toEqual({ difficulty: "normal", color: "black" });
    expect(() => setOptions({ difficulty: "hard", color: "white" })).not.toThrow();
  });
});
