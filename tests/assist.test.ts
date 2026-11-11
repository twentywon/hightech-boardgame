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
