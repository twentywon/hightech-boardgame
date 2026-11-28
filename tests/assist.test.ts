import { describe, it, expect, beforeEach } from "vitest";
import { createGame, play, undo, type Point } from "../src/games/gomoku/rules";
import { addResult, getSettings, getStats } from "../src/core/storage";

function moves(points: Point[]) {
  let s = createGame();
  for (const p of points) s = play(s, p)!;
  return s;
}
describe("Gomoku undo", () => {
  it("takes back moves and restores the turn without mutating the input", () => {
    const s = moves([
      { row: 7, col: 7 },
      { row: 7, col: 8 },
      { row: 8, col: 8 },
    ]);
    const one = undo(s)!;
    expect(one.moves).toHaveLength(2);
    expect(one.turn).toBe(1);
    expect(one.board[8][8]).toBe(0);
    expect(undo(s, 3)).toEqual(createGame());
    expect(s.moves).toHaveLength(3);
    expect(s.board[8][8]).toBe(1);
  });
  it("reopens a finished game by replaying the remaining moves", () => {
    const points: Point[] = [];
    for (let i = 0; i < 5; i++) {
      points.push({ row: 7, col: i });
      if (i < 4) points.push({ row: 0, col: i * 2 });
    }
    const won = moves(points);
    expect(won.winner).toBe(1);
    const before = undo(won)!;
    expect(before.winner).toBeNull();
    expect(before.line).toEqual([]);
    expect(play(before, { row: 7, col: 4 })!.winner).toBe(1);
  });
  it("rejects counts beyond the history", () => {
    const s = moves([{ row: 7, col: 7 }]);
    for (const n of [0, 2, -1, 1.5, NaN]) expect(undo(s, n)).toBeNull();
    expect(undo(createGame())).toBeNull();
  });
});
describe("Results against the computer", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  });
  it("counts per difficulty and survives a reload", () => {
    addResult("hard", "win");
    addResult("hard", "win");
    addResult("hard", "loss");
    addResult("easy", "draw");
    const stats = getStats();
    expect(stats.hard).toEqual({ win: 2, loss: 1, draw: 0 });
    expect(stats.easy).toEqual({ win: 0, loss: 0, draw: 1 });
    expect(stats.expert).toEqual({ win: 0, loss: 0, draw: 0 });
  });
  it("ignores corrupted or tampered numbers", () => {
    for (const raw of [
      "{",
      "null",
      JSON.stringify({ version: 2, hard: { win: 9 } }),
      JSON.stringify({ version: 1, hard: { win: -3, loss: 1.5, draw: "7" } }),
    ]) {
      store.set("wtg.gomoku.stats.v1", raw);
      expect(getStats().hard).toEqual({ win: 0, loss: 0, draw: 0 });
    }
  });
  it("keeps counting in memory terms when storage refuses writes", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(addResult("normal", "win").normal.win).toBe(1);
  });
  it("shows coordinates unless they were switched off", () => {
    expect(getSettings().labels).toBe(true);
    store.set("wtg.settings.v1", JSON.stringify({ labels: false }));
    expect(getSettings().labels).toBe(false);
  });
});
import * as R from "../src/games/reversi/rules";
import * as C from "../src/games/chess/rules";
import { findPassHistory } from "./reversi-fixtures";

describe("Reversi undo", () => {
  it("restores flipped discs, counts and the turn", () => {
    let s = R.createGame();
    const first = R.point(R.legalMoves(s.board, s.turn)[0].index);
    s = R.play(s, first)!;
    const second = R.point(R.legalMoves(s.board, s.turn)[0].index);
    const two = R.play(s, second)!;
    const back = R.undo(two)!;
    expect([...back.board]).toEqual([...s.board]);
    expect(back.turn).toBe(s.turn);
    expect(back.moves).toEqual(s.moves);
    const start = R.undo(two, 2)!;
    expect([...start.board]).toEqual([...R.createGame().board]);
    expect(R.counts(start.board)).toMatchObject({ black: 2, white: 2 });
    expect(two.moves).toHaveLength(2);
  });
  it("reconstructs automatic passes when undoing across them", () => {
    const history = findPassHistory().moves;
    let s = R.createGame();
    const states = [s];
    for (const m of history) {
      s = R.play(s, m)!;
      states.push(s);
    }
    expect(s.passes.length).toBeGreaterThan(0);
    for (let count = 1; count <= history.length; count++) {
      const back = R.undo(s, count)!,
        expected = states[history.length - count];
      expect([...back.board]).toEqual([...expected.board]);
      expect(back.turn).toBe(expected.turn);
      expect(back.passes).toEqual(expected.passes);
      expect(back.lastPassed).toBe(expected.lastPassed);
    }
  });
  it("rejects counts beyond the history", () => {
    const s = R.play(R.createGame(), R.point(R.legalMoves(R.createGame().board, 1)[0].index))!;
    for (const n of [0, 2, -1, 1.5]) expect(R.undo(s, n)).toBeNull();
    expect(R.undo(R.createGame())).toBeNull();
  });
});
describe("Chess undo", () => {
  const line = (moves: [string, string][]) => {
    let s = C.createGame();
    for (const [from, to] of moves)
      s = C.play(s, { from: from as C.Square, to: to as C.Square })!;
    return s;
  };
  it("takes back moves, captures and the side to move", () => {
    const s = line([
      ["e2", "e4"],
      ["d7", "d5"],
      ["e4", "d5"],
    ]);
    expect(C.captures(s).w).toEqual(["p"]);
    const back = C.undo(s)!;
    expect(back.moves).toHaveLength(2);
    expect(back.fen).toBe(line([["e2", "e4"], ["d7", "d5"]]).fen);
    expect(C.captures(back).w).toEqual([]);
    expect(C.undo(s, 3)).toEqual(C.createGame());
    expect(s.moves).toHaveLength(3);
  });
  it("reopens a checkmated game", () => {
    const mate = line([
      ["f2", "f3"],
      ["e7", "e5"],
      ["g2", "g4"],
      ["d8", "h4"],
    ]);
    expect(mate.outcome).toEqual({ winner: "b", reason: "체크메이트" });
    const back = C.undo(mate)!;
    expect(back.outcome).toBeNull();
    expect(C.legalMoves(back).length).toBeGreaterThan(0);
  });
  it("keeps a custom starting position and rejects bad counts", () => {
    const fen = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
    const s = C.play(C.createGame(fen), { from: "e2", to: "e4" })!;
    expect(C.undo(s)!.fen).toBe(C.createGame(fen).fen);
    for (const n of [0, 2, -1, 1.5]) expect(C.undo(s, n)).toBeNull();
  });
});
