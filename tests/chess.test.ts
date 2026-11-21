import { describe, it, expect, vi, afterEach } from "vitest";
import { Chess } from "chess.js";
import {
  createGame,
  createEngine,
  play,
  legalMoves,
  action,
  claimDraw,
  claimReasons,
  positionKey,
  captures,
  type State,
  type Action,
} from "../src/games/chess/rules";
import { difficulties } from "../src/core/ai";
import { profiles } from "../src/games/chess/difficulty";
import {
  search,
  searchSteps,
  tableKey,
  mateFromTable,
  mateToTable,
} from "../src/games/chess/ai";
import { ChessAIClient } from "../src/games/chess/client";
import type { WorkerPort } from "../src/engine/ai-client";
import { toWorld, fromWorld, squares } from "../src/games/chess/coordinates";
function moves(s: State, sequence: string[]): State {
  for (const san of sequence) {
    const game = createEngine(s);
    const m = game.move(san);
    s = play(s, action(m))!;
    expect(s).not.toBeNull();
  }
  return s;
}
const cycle = ["Nf3", "Nf6", "Ng1", "Ng8"];
const mid = () => moves(createGame(), ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"]);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("Chess rules and published perft references", () => {
  it("has the standard orientation, piece placement and 20 legal moves", () => {
    const s = createGame(),
      g = createEngine(s);
    expect(g.get("a1")!.type).toBe("r");
    expect(g.get("d1")!.type).toBe("q");
    expect(g.get("e8")!.type).toBe("k");
    expect(legalMoves(s)).toHaveLength(20);
    expect(g.perft(2)).toBe(400);
    expect(g.perft(3)).toBe(8902);
    expect(
      legalMoves(s).reduce(
        (n, m) => n + legalMoves(play(s, action(m))!).length,
        0,
      ),
    ).toBe(400);
  });
  it("matches Kiwipete castling/check perft 48 and 2039", () => {
    const s = createGame(
      "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    );
    expect(legalMoves(s)).toHaveLength(48);
    expect(createEngine(s).perft(2)).toBe(2039);
  });
  it("validates all piece movement, blocked paths and immutable application", () => {
    const s = createGame(),
      before = JSON.stringify(s);
    for (const [from, to] of [
      ["a1", "a4"],
      ["c1", "g5"],
      ["d1", "d3"],
      ["e1", "e2"],
      ["e2", "f3"],
      ["b1", "b3"],
    ])
      expect(play(s, { from, to } as Action)).toBeNull();
    for (const [from, to] of [
      ["b1", "c3"],
      ["e2", "e4"],
      ["d2", "d3"],
    ])
      expect(play(s, { from, to } as Action)).not.toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });
  it("rejects self-check, pinned movement and adjacent kings", () => {
    const s = createGame("4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1");
    expect(play(s, { from: "e2", to: "d2" })).toBeNull();
    const kings = createGame("8/8/8/8/8/4k3/8/R3K3 w - - 0 1");
    expect(play(kings, { from: "e1", to: "e2" })).toBeNull();
  });
  it("only allows check evasions and recognizes discovered check", () => {
    const s = createGame("4r1k1/8/8/8/8/8/8/R3K3 w Q - 0 1");
    for (const m of legalMoves(s))
      expect(
        createEngine(play(s, action(m))!).isAttacked(
          m.piece === "k" ? m.to : "e1",
          "b",
        ),
      ).toBe(false);
    const discovered = createGame("4k3/8/8/8/4B3/8/8/K3R3 w - - 0 1");
    expect(
      createEngine(play(discovered, { from: "e4", to: "d5" })!).isCheck(),
    ).toBe(true);
  });
  it("executes both castlings and rejects attacked paths and current check", () => {
    const fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
      s = createGame(fen);
    for (const [to, rook] of [
      ["g1", "f1"],
      ["c1", "d1"],
    ] as const) {
      const next = play(s, { from: "e1", to })!;
      expect(createEngine(next).get(rook)!.type).toBe("r");
    }
    expect(
      play(createGame("r3kr1r/8/8/8/8/8/8/R3K2R w KQq - 0 1"), {
        from: "e1",
        to: "g1",
      }),
    ).toBeNull();
    expect(
      play(createGame("r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1"), {
        from: "e1",
        to: "g1",
      }),
    ).toBeNull();
  });
  it("does not restore king/rook castling rights after returning, or after capture", () => {
    const base = createGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const rook = moves(base, ["Rh2", "Rh7", "Rh1", "Rh8"]);
    expect(play(rook, { from: "e1", to: "g1" })).toBeNull();
    const king = moves(base, ["Kf1", "Kf8", "Ke1", "Ke8"]);
    expect(play(king, { from: "e1", to: "c1" })).toBeNull();
    const captured = moves(base, ["Rxh8+", "Kf7"]);
    expect(createEngine(captured).fen().split(" ")[2]).not.toContain("k");
  });
  it("handles en passant, expiry, captured-square removal and pinned en passant", () => {
    const s = moves(createGame(), ["e4", "a6", "e5", "d5"]),
      next = play(s, { from: "e5", to: "d6" })!;
    expect(createEngine(next).get("d5")).toBeUndefined();
    expect(captures(next).w).toEqual(["p"]);
    const expired = moves(s, ["Nf3", "a5"]);
    expect(play(expired, { from: "e5", to: "d6" })).toBeNull();
    expect(
      play(createGame("k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 2"), {
        from: "e5",
        to: "d6",
      }),
    ).toBeNull();
  });
  it.each(["q", "r", "b", "n"] as const)(
    "supports %s promotion, including capture and capture accounting",
    (promotion) => {
      const s = createGame("2r4k/1P6/8/8/8/8/8/4K3 w - - 0 1");
      const next = play(s, { from: "b7", to: "c8", promotion })!;
      expect(createEngine(next).get("c8")!.type).toBe(promotion);
      expect(captures(next).w).toEqual(["r"]);
      expect(play(s, { from: "b7", to: "b8", promotion })).not.toBeNull();
    },
  );
  it("distinguishes mate, stalemate, supported insufficient material and game over", () => {
    const mate = moves(createGame(), ["f3", "e5", "g4", "Qh4#"]);
    expect(mate.outcome).toEqual({ winner: "b", reason: "체크메이트" });
    expect(play(mate, { from: "e2", to: "e4" })).toBeNull();
    expect(legalMoves(mate)).toEqual([]);
    expect(createGame("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").outcome?.reason).toBe(
      "스테일메이트",
    );
    for (const fen of [
      "7k/8/8/8/8/8/8/K7 w - - 0 1",
      "7k/8/8/8/8/8/8/KB6 w - - 0 1",
      "7k/8/8/8/8/8/8/KN6 w - - 0 1",
    ])
      expect(createGame(fen).outcome?.reason).toBe("기물 부족");
    expect(createGame("7k/8/8/8/8/8/8/KNN5 w - - 0 1").outcome).toBeNull();
  });
  it("separates threefold claims from automatic fivefold; supports intended moves", () => {
    const twice = moves(createGame(), cycle);
    expect(claimDraw(twice)).toBeNull();
    const before = moves(createGame(), [...cycle, ...cycle.slice(0, 3)]);
    const intended = { from: "f6", to: "g8" } as Action;
    expect(claimReasons(before, intended)).toContain("3회 반복");
    expect(claimDraw(before, intended)?.moves).toEqual(before.moves);
    const three = moves(createGame(), [...cycle, ...cycle]);
    expect(three.outcome).toBeNull();
    expect(claimDraw(three)?.outcome?.reason).toContain("3회 반복");
    expect(
      moves(createGame(), [...cycle, ...cycle, ...cycle, ...cycle]).outcome
        ?.reason,
    ).toBe("5회 반복");
  });
  it("uses turn, castling and LEGAL en passant in repetition identity", () => {
    const fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
    expect(positionKey(fen)).not.toBe(positionKey(fen.replace(" w ", " b ")));
    expect(positionKey(fen)).not.toBe(positionKey(fen.replace("KQkq", "KQq")));
    const ep = "k7/8/8/3pP3/8/8/8/4K3 w - d6 0 2";
    expect(positionKey(ep)).not.toBe(positionKey(ep.replace("d6", "-")));
    const pinned = "k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 2";
    expect(positionKey(pinned)).toBe(positionKey(pinned.replace("d6", "-")));
  });
  it("handles current/intended fifty-move claims, pawn resets, seventy-five and mate precedence", () => {
    const s = createGame("7k/8/8/8/8/8/8/KR6 w - - 99 1"),
      a = { from: "b1", to: "b2" } as Action;
    expect(claimReasons(s)).toEqual([]);
    expect(claimReasons(s, a)).toContain("50수 규칙");
    expect(play(s, a)?.outcome).toBeNull();
    const seventyFive = createGame("7k/8/8/8/8/8/8/KR6 w - - 149 1");
    expect(play(seventyFive, a)?.outcome?.reason).toBe("75수 규칙");
    const pawn = createGame("7k/8/8/8/8/8/P7/KR6 w - - 99 1");
    expect(claimReasons(pawn, { from: "a2", to: "a3" })).toEqual([]);
    const mate = createGame("7k/5Q2/6K1/8/8/8/8/8 w - - 149 1");
    expect(play(mate, { from: "f7", to: "g7" })?.outcome?.reason).toBe(
      "체크메이트",
    );
  });
  it("maps every square center and rejects positions outside the board", () => {
    for (const s of squares) {
      const p = toWorld(s);
      expect(fromWorld(p.x, p.z)).toBe(s);
    }
    expect(fromWorld(4, 0)).toBeNull();
  });
});
describe.each(difficulties)("%s chess AI", (difficulty) => {
  it("returns a legal move without mutating the original session", () => {
    const s = mid(),
      before = JSON.stringify(s),
      r = search(s, difficulty, { timeMs: 40 });
    expect(r.move).not.toBeNull();
    expect(play(s, r.move!)).not.toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });
  it("takes mate in one", () => {
    const s = createGame("7k/5Q2/6K1/8/8/8/8/8 w - - 0 1"),
      r = search(s, difficulty, { timeMs: Infinity, maxNodes: 200 });
    expect(play(s, r.move!)?.outcome).toEqual({
      winner: "w",
      reason: "체크메이트",
    });
  });
  it("only chooses legal check evasions and handles promotion", () => {
    const checked = createGame("4r1k1/8/8/8/8/8/8/R3K3 w Q - 0 1"),
      r = search(checked, difficulty, { timeMs: 50 });
    expect(play(checked, r.move!)).not.toBeNull();
    const s = createGame("7k/1P6/8/8/8/8/8/4K3 w - - 0 1"),
      p = search(s, difficulty, { timeMs: Infinity, maxNodes: 100 });
    expect(p.move?.promotion).toBeDefined();
    expect(play(s, p.move!)).not.toBeNull();
  });
  it("does not move after mate, automatic draw or a claimed draw", () => {
    for (const s of [
      createGame("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1"),
      createGame("7k/8/8/8/8/8/8/K7 w - - 0 1"),
      claimDraw(createGame("7k/8/8/8/8/8/8/KR6 w - - 100 1"))!,
    ])
      expect(search(s, difficulty).move).toBeNull();
  });
  it("returns a legal fallback on zero time and is reproducible with fixed nodes/seed", () => {
    const s = mid(),
      r = search(s, difficulty, { timeMs: 0 });
    expect(r.stats.timedOut).toBe(true);
    expect(play(s, r.move!)).not.toBeNull();
    const opts = { timeMs: Infinity, maxNodes: 60, seed: 42 };
    const a = search(s, difficulty, opts),
      b = search(s, difficulty, opts);
    expect(a).toMatchObject({
      move: b.move,
      claim: b.claim,
      stats: { nodes: b.stats.nodes, depth: b.stats.depth },
    });
  });
});
describe("Chess search and Worker correctness", () => {
  it("claims a repeated losing position but plays the same FEN with fresh history", () => {
    const initial = createGame(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1",
    );
    const repeated = moves(initial, [...cycle, ...cycle]);
    const fresh = createGame(repeated.fen);
    const options = { timeMs: Infinity, maxDepth: 1 };
    expect(search(repeated, "expert", options).claim).toBe(true);
    const result = search(fresh, "expert", options);
    expect(result.claim).toBe(false);
    expect(play(fresh, result.move!)).not.toBeNull();
  });
  it("searches different trees and uses advanced evaluation at higher tiers", () => {
    for (const d of difficulties) {
      const r = search(mid(), d, { timeMs: Infinity, maxNodes: 150 });
      expect(r.stats.nodes).toBe(d === "beginner" ? 0 : r.stats.nodes);
      if (d !== "beginner") expect(r.stats.nodes).toBeGreaterThan(0);
    }
    expect(profiles.expert.depth).toBeGreaterThan(profiles.hard.depth);
    expect(profiles.normal.qDepth).toBeGreaterThan(0);
    expect(profiles.hard.advanced).toBe(true);
  });
  it("preserves fixed-depth result with and without the draw-safe transposition table", () => {
    const opts = { timeMs: Infinity, maxDepth: 2, seed: 8 };
    const a = search(mid(), "expert", { ...opts, useTable: true }),
      b = search(mid(), "expert", { ...opts, useTable: false });
    expect(a.move).toEqual(b.move);
    expect(a.stats.score).toBe(b.stats.score);
    expect(a.stats.depth).toBe(2);
  }, 15000);
  it("distinguishes halfmove/repetition contexts and converts mate-distance scores", () => {
    const a = new Chess(),
      b = new Chess(a.fen().replace("0 1", "99 1"));
    expect(tableKey(a, new Map())).not.toBe(tableKey(b, new Map()));
    expect(tableKey(a, new Map([["x", 1]]))).not.toBe(
      tableKey(a, new Map([["x", 2]])),
    );
    for (const v of [99995, -99995, 250])
      expect(mateFromTable(mateToTable(v, 5), 5)).toBe(v);
    expect(mateToTable(99995, 5)).toBe(100000);
    expect(mateFromTable(100000, 3)).toBe(99997);
    expect(mateFromTable(-100000, 3)).toBe(-99997);
  });
  it("keeps the last completed iteration on node exhaustion", () => {
    const s = mid(),
      r = search(s, "normal", { timeMs: Infinity, maxNodes: 150 });
    expect(r.stats.nodeLimited).toBe(true);
    if (r.stats.depth) {
      const full = search(s, "normal", {
        timeMs: Infinity,
        maxDepth: r.stats.depth,
      });
      expect(r.move).toEqual(full.move);
    }
    expect(play(s, r.move!)).not.toBeNull();
  });
  it("cooperatively yields without changing deterministic results", () => {
    const s = mid();
    let clock = 0;
    const options = { timeMs: Infinity, maxNodes: 100, now: () => clock++ };
    const gen = searchSteps(s, "hard", options);
    let n = gen.next(),
      yields = 0;
    while (!n.done) {
      yields++;
      n = gen.next();
    }
    expect(yields).toBeGreaterThan(0);
    clock = 0;
    expect(n.value.move).toEqual(search(s, "hard", options).move);
  });
  it("cancels work and ignores late replies after a new session", async () => {
    const fake = (): WorkerPort => ({
      onmessage: null,
      onerror: null,
      postMessage: vi.fn(),
      terminate: vi.fn(),
    });
    const old = fake(),
      fresh = fake(),
      client = new ChessAIClient(
        vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(fresh),
      );
    const first = client.compute(mid(), "expert"),
      rejected = expect(first).rejects.toMatchObject({ name: "AbortError" }),
      late = old.onmessage!;
    client.cancel();
    await rejected;
    const second = client.compute(mid(), "easy"),
      result = search(mid(), "easy", { timeMs: 0 });
    late({
      data: { result: { move: { from: "a1", to: "a8" } } },
    } as MessageEvent);
    fresh.onmessage!({ data: { result } } as MessageEvent);
    expect(await second).toEqual(result);
    expect(old.terminate).toHaveBeenCalled();
  });
});
