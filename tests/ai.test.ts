import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createGame,
  play,
  type State,
  type Player,
} from "../src/games/gomoku/rules";
import { search } from "../src/games/gomoku/ai/search";
import { analyze } from "../src/games/gomoku/ai/evaluator";
import {
  difficulties,
  profiles,
  normalizeAI,
} from "../src/games/gomoku/ai/difficulty";
import { AIClient, type WorkerPort } from "../src/games/gomoku/ai/client";
import {
  getAIOptions,
  setAIOptions,
  encode,
  decode,
} from "../src/core/storage";
function fixture(stones: [number, number, Player][], turn: Player = 1): State {
  const s = createGame();
  s.turn = turn;
  for (const [row, col, player] of stones) {
    s.board[row][col] = player;
    s.moves.push({ row, col, player });
  }
  return s;
}
const tactic = (player: Player) =>
  fixture([
    [7, 0, player],
    [7, 1, player],
    [7, 2, player],
    [7, 3, player],
    [5, 4, player === 1 ? 2 : 1],
  ]);
const complex = fixture([
  [7, 7, 1],
  [6, 7, 2],
  [8, 8, 1],
  [8, 7, 2],
  [6, 6, 1],
  [9, 9, 2],
  [5, 7, 1],
  [9, 6, 2],
]);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe.each(difficulties)("%s AI", (difficulty) => {
  it("takes immediate wins and blocks an opponent single win", () => {
    for (const player of [1, 2] as const) {
      const s = tactic(player);
      expect(search(s, difficulty).move).toEqual({ row: 7, col: 4 });
      s.turn = 2;
      expect(search(s, difficulty).move).toEqual({ row: 7, col: 4 });
    }
  });
  it("prioritizes its own win over defense", () => {
    const s = tactic(2);
    for (let c = 0; c < 4; c++) {
      s.board[3][c] = 1;
      s.moves.push({ row: 3, col: c, player: 1 });
    }
    expect(search(s, difficulty).move).toEqual({ row: 3, col: 4 });
  });
  it("returns legal unoccupied moves without mutating state", () => {
    const before = JSON.stringify(complex);
    const r = search(complex, difficulty, { timeMs: 50, seed: 23 });
    expect(r.move).not.toBeNull();
    expect(play(complex, r.move!)).not.toBeNull();
    expect(JSON.stringify(complex)).toBe(before);
  });
  it("does not play after win or draw", () => {
    for (const winner of [1, 2, "draw"] as const)
      expect(search({ ...complex, winner }, difficulty).move).toBeNull();
  });
  it("is reproducible with the same seed and deterministic node budget", () => {
    const opts = { seed: 42, timeMs: Infinity, maxNodes: 40 };
    const a = search(complex, difficulty, opts),
      b = search(complex, difficulty, opts);
    expect(a.move).toEqual(b.move);
    expect(a.stats.nodes).toEqual(b.stats.nodes);
  });
  it("returns a legal fallback on an expired deadline", () => {
    const r = search(complex, difficulty, { timeMs: 0 });
    expect(r.stats.timedOut).toBe(true);
    expect(play(complex, r.move!)).not.toBeNull();
  });
});
describe("Pattern and compound-threat analysis", () => {
  function threat(cols: number[], other: number[] = []) {
    const s = fixture([
      ...cols.map((c) => [7, c, 1] as [number, number, Player]),
      ...other.map((c) => [7, c, 2] as [number, number, Player]),
    ]);
    return analyze(Int8Array.from(s.board.flat()), 7 * 15 + 7, 1);
  }
  it("distinguishes five, overline, open four, closed four, threes and twos", () => {
    expect(threat([3, 4, 5, 6]).five).toBe(1);
    expect(threat([3, 4, 5, 6, 8]).five).toBe(1);
    expect(threat([5, 6, 8]).openFour).toBe(1);
    expect(threat([5, 6, 8], [4]).closedFour).toBe(1);
    expect(threat([6, 8]).openThree).toBe(1);
    expect(threat([5, 6], [4]).closedThree).toBe(1);
    expect(threat([6]).openTwo).toBe(1);
  });
  it("recognizes broken fours and crossed multiple threats", () => {
    expect(threat([4, 5, 8]).closedFour).toBe(1);
    const s = fixture([
      [7, 6, 1],
      [7, 8, 1],
      [6, 7, 1],
      [8, 7, 1],
    ]);
    expect(analyze(Int8Array.from(s.board.flat()), 112, 1).multiple).toBe(2);
  });
  it("does not mistake unrelated patterns for threats at a candidate", () => {
    expect(threat([2, 3, 4]).openThree).toBe(0);
  });
  it("hard and expert prevent a double-four fork before it becomes an immediate win", () => {
    const s = fixture(
      [
        [7, 4, 2],
        [7, 5, 2],
        [7, 6, 2],
        [4, 7, 2],
        [5, 7, 2],
        [6, 7, 2],
      ],
      1,
    );
    for (const d of ["hard", "expert"] as const) {
      const r = search(s, d, { maxNodes: 600, timeMs: Infinity });
      expect(r.move).toEqual({ row: 7, col: 7 });
    }
  });
  it("reports two independent immediate wins as an unavoidable threat, still returns legal", () => {
    const s = fixture([
      [7, 5, 2],
      [7, 6, 2],
      [7, 7, 2],
      [7, 8, 2],
    ]);
    const r = search(s, "expert");
    expect(r.stats.reason).toBe("multiple immediate losses");
    expect(play(s, r.move!)).not.toBeNull();
  });
  it("expert transposition cache preserves an uncached fixed-depth result", () => {
    const options = { timeMs: Infinity, maxDepth: 4, seed: 7 };
    const cached = search(complex, "expert", { ...options, useTable: true });
    const reference = search(complex, "expert", {
      ...options,
      useTable: false,
    });
    expect(cached.stats.depth).toBe(4);
    expect(reference.stats.depth).toBe(4);
    expect(cached.move).toEqual(reference.move);
    expect(cached.stats.tableHits).toBeGreaterThan(0);
  }, 15000);
  it("search tiers actually visit a tree; heuristic tiers do not", () => {
    for (const d of difficulties) {
      const r = search(complex, d, { maxNodes: 300, timeMs: Infinity });
      if (profiles[d].depth === 0) expect(r.stats.nodes).toBe(0);
      else expect(r.stats.nodes).toBeGreaterThan(0);
    }
    expect(profiles.expert.depth).toBeGreaterThan(profiles.hard.depth);
    expect(profiles.hard.width).toBeGreaterThan(profiles.normal.width);
  });
});
describe("Search deadline recovery", () => {
  it("keeps the last fully completed iteration when time expires mid-search", () => {
    let ticks = 0;
    const stopped = search(complex, "normal", {
      timeMs: 300,
      now: () => ticks++,
    });
    expect(stopped.stats.timedOut).toBe(true);
    expect(stopped.stats.depth).toBeGreaterThan(0);
    const completed = search(complex, "normal", {
      timeMs: Infinity,
      maxDepth: stopped.stats.depth,
    });
    expect(stopped.move).toEqual(completed.move);
    expect(play(complex, stopped.move!)).not.toBeNull();
  });
});

describe("Versioned AI preferences and session", () => {
  function storage() {
    const map = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => map.set(k, v),
    });
    return map;
  }
  it("saves and restores difficulty and color with safe fallbacks", () => {
    const map = storage();
    expect(getAIOptions()).toEqual({ difficulty: "normal", color: "black" });
    setAIOptions({ difficulty: "expert", color: "random" });
    expect(getAIOptions()).toEqual({ difficulty: "expert", color: "random" });
    for (const value of [
      "{",
      "null",
      JSON.stringify({ version: 0, difficulty: "hard" }),
      JSON.stringify({ version: 1, difficulty: "fake", color: "pink" }),
    ]) {
      map.set("wtg.ai.v1", value);
      expect(getAIOptions()).toEqual({ difficulty: "normal", color: "black" });
    }
  });
  it("preserves the active session settings and resolved random color", () => {
    const s = play(createGame(), { row: 7, col: 7 })!;
    expect(
      decode(encode({ state: s, mode: "ai", difficulty: "hard", human: 2 })),
    ).toEqual({ state: s, mode: "ai", difficulty: "hard", human: 2 });
    expect(
      decode(JSON.stringify({ version: 1, mode: "ai", moves: [] }))?.state,
    ).toEqual(createGame());
  });
  it("handles unavailable localStorage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error();
      },
      setItem: () => {
        throw Error();
      },
    });
    expect(() =>
      setAIOptions({ difficulty: "easy", color: "white" }),
    ).not.toThrow();
    expect(getAIOptions()).toEqual(normalizeAI(null));
  });
});
describe("Worker cancellation", () => {
  function fake(): WorkerPort {
    return {
      onmessage: null,
      onerror: null,
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };
  }
  it("terminates and rejects old work; late messages cannot resolve a new game", async () => {
    const old = fake(),
      fresh = fake(),
      factory = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(fresh);
    const client = new AIClient(factory);
    const first = client.compute(complex, "expert");
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    const late = old.onmessage!;
    client.cancel();
    await rejected;
    expect(old.terminate).toHaveBeenCalled();
    const second = client.compute(complex, "easy");
    const result = search(complex, "easy");
    late({ data: { result: { move: { row: 0, col: 0 } } } } as MessageEvent);
    fresh.onmessage!({ data: { result } } as MessageEvent);
    expect(await second).toEqual(result);
    client.cancel();
  });
  it("reports worker startup errors and terminates its process", async () => {
    const worker = fake(),
      client = new AIClient(() => worker);
    const pending = client.compute(complex, "normal");
    const rejection = expect(pending).rejects.toThrow("Worker");
    worker.onerror!({} as ErrorEvent);
    await rejection;
    expect(worker.terminate).toHaveBeenCalled();
  });
  it.each([null, undefined, {}, { result: null }])("rejects malformed Worker payload %j and allows a fresh request", async (data) => {
    const worker = fake(), client = new AIClient(() => worker);
    const pending = client.compute(complex, "normal");
    const rejection = expect(pending).rejects.toThrow("응답");
    expect(() => worker.onmessage!({ data } as MessageEvent)).not.toThrow();
    await rejection;
    expect(worker.terminate).toHaveBeenCalled();
    const retried = client.compute(complex, "easy");
    const result = search(complex, "easy");
    worker.onmessage!({ data: { result } } as MessageEvent);
    expect(await retried).toEqual(result);
  });
  it("rejects message deserialization failure without leaving a pending request", async () => {
    const worker = fake(), client = new AIClient(() => worker);
    const pending = client.compute(complex, "normal");
    const rejection = expect(pending).rejects.toThrow("응답");
    worker.onmessageerror!({} as MessageEvent);
    await rejection;
    expect(worker.terminate).toHaveBeenCalled();
  });
  it("surfaces worker failure and watchdog timeout without blocking fallback", async () => {
    vi.useFakeTimers();
    const worker = fake(),
      client = new AIClient(() => worker);
    const promise = client.compute(complex, "expert");
    const rejection = expect(promise).rejects.toThrow("초과");
    await vi.advanceTimersByTimeAsync(8001);
    await rejection;
    expect(worker.terminate).toHaveBeenCalled();
  });
});
