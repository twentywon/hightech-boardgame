import { describe, it, expect } from "vitest";
import {
  createGame,
  play,
  winningLine,
  type Point,
  type State,
} from "../src/games/gomoku/rules";
import { chooseMove } from "../src/games/gomoku/ai";
import { encode, decode } from "../src/core/storage";
import { toWorld, fromWorld } from "../src/games/gomoku/coordinates";
function moves(points: Point[]) {
  let s = createGame();
  for (const p of points) {
    const n = play(s, p);
    expect(n).not.toBeNull();
    s = n!;
  }
  return s;
}
describe("Gomoku rules", () => {
  it("starts black and alternates without mutating input", () => {
    const s = createGame(),
      n = play(s, { row: 7, col: 7 })!;
    expect(s.board[7][7]).toBe(0);
    expect(s.turn).toBe(1);
    expect(n.turn).toBe(2);
    expect(play(n, { row: 8, col: 7 })!.turn).toBe(1);
  });
  it("rejects duplicate and invalid moves", () => {
    const s = play(createGame(), { row: 0, col: 0 })!;
    expect(play(s, { row: 0, col: 0 })).toBeNull();
    for (const p of [
      { row: -1, col: 0 },
      { row: 15, col: 0 },
      { row: 0.5, col: 0 },
      { row: NaN, col: 0 },
    ])
      expect(play(s, p)).toBeNull();
  });
  for (const [label, dr, dc, row, col] of [
    ["horizontal", 0, 1, 0, 0],
    ["vertical", 1, 0, 0, 14],
    ["diagonal", 1, 1, 0, 0],
    ["reverse diagonal", 1, -1, 0, 14],
  ] as const) {
    it(`wins ${label} at edge and blocks post-win moves`, () => {
      const points: Point[] = [];
      for (let i = 0; i < 5; i++) {
        points.push({ row: row + dr * i, col: col + dc * i });
        if (i < 4) points.push({ row: 14, col: i * 2 });
      }
      const s = moves(points);
      expect(s.winner).toBe(1);
      expect(s.line).toHaveLength(5);
      expect(play(s, { row: 7, col: 7 })).toBeNull();
    });
  }
  it("wins with six stones bridging a gap", () => {
    const ps: Point[] = [];
    for (const c of [0, 1, 2, 4, 5])
      ps.push({ row: 7, col: c }, { row: 0, col: c * 2 });
    ps.push({ row: 7, col: 3 });
    const s = moves(ps);
    expect(s.winner).toBe(1);
    expect(s.line).toHaveLength(6);
  });
  it("draws on a full board without a winner", () => {
    const groups: Point[][] = [[], []];
    for (let row = 0; row < 15; row++)
      for (let col = 0; col < 15; col++)
        groups[(row + Math.floor(col / 2)) % 2].push({ row, col });
    let s = createGame();
    while (s.moves.length < 225) {
      const p = groups[s.turn - 1].shift()!;
      s = play(s, p)!;
      expect(s).not.toBeNull();
    }
    expect(s.winner).toBe("draw");
    expect(s.line).toEqual([]);
  });
  it("restarts to a clean state", () => {
    const previous = moves([{ row: 7, col: 7 }]);
    const next = createGame();
    expect(next.moves).toHaveLength(0);
    expect(next.board.flat().every((x) => x === 0)).toBe(true);
    expect(next.turn).toBe(1);
    expect(previous.moves).toHaveLength(1);
  });
});
describe("AI", () => {
  it("chooses center on empty board", () =>
    expect(chooseMove(createGame())).toEqual({ row: 7, col: 7 }));
  it("wins immediately", () => {
    const s = moves([
      { row: 0, col: 0 },
      { row: 7, col: 0 },
      { row: 0, col: 2 },
      { row: 7, col: 1 },
      { row: 0, col: 4 },
      { row: 7, col: 2 },
      { row: 0, col: 6 },
      { row: 7, col: 3 },
      { row: 1, col: 0 },
    ]);
    const snapshot = encode({ state: s, mode: "ai" });
    expect(chooseMove(s)).toEqual({ row: 7, col: 4 });
    expect(encode({ state: s, mode: "ai" })).toBe(snapshot);
  });
  it("blocks opponent immediate win", () => {
    const s = moves([
      { row: 7, col: 0 },
      { row: 0, col: 0 },
      { row: 7, col: 1 },
      { row: 0, col: 2 },
      { row: 7, col: 2 },
      { row: 0, col: 4 },
      { row: 7, col: 3 },
    ]);
    expect(chooseMove(s)).toEqual({ row: 7, col: 4 });
  });
  it("returns only legal nearby moves and terminates on a finished game", () => {
    let s = createGame();
    for (let i = 0; i < 50 && !s.winner; i++) {
      const p = chooseMove(s)!;
      expect(p).toBeTruthy();
      s = play(s, p)!;
      expect(s).toBeTruthy();
    }
    if (s.winner) expect(chooseMove(s)).toBeNull();
  });
});
describe("Persistence and coordinates", () => {
  it("replays saved games exactly", () => {
    const state = moves([
      { row: 7, col: 7 },
      { row: 8, col: 8 },
    ]);
    expect(decode(encode({ state, mode: "ai" }))).toEqual({
      state,
      mode: "ai",
    });
  });
  it("rejects corrupted data and illegal histories", () => {
    for (const raw of [
      "{",
      "null",
      '{"version":2}',
      '{"version":1,"mode":"local","moves":[null]}',
      JSON.stringify({
        version: 1,
        mode: "ai",
        moves: [{ row: 0, col: 0, player: 2 }],
      }),
      JSON.stringify({
        version: 1,
        mode: "local",
        moves: [
          { row: 0, col: 0, player: 1 },
          { row: 0, col: 0, player: 2 },
        ],
      }),
    ])
      expect(decode(raw)).toBeNull();
  });
  it("round-trips all intersections", () => {
    for (let row = 0; row < 15; row++)
      for (let col = 0; col < 15; col++) {
        const p = { row, col },
          v = toWorld(p);
        expect(fromWorld(v.x, v.z)).toEqual(p);
      }
    expect(fromWorld(3.3, 0)).toBeNull();
  });
});
