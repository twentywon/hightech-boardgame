import { describe, expect, it } from "vitest";
import * as H from "../src/games/hexa/rules";
import * as M from "../src/games/morris/rules";
import * as G from "../src/games/gonu/rules";
import { choose } from "../src/games/points/ai";
import type { Move, PointGame } from "../src/games/points/types";
import { seededRandom } from "../src/core/ai";

const move = (from: number, to: number, extra = -1): Move => ({ from, to, extra });
const frozen = (s: unknown) => JSON.stringify(s);
/** A clock that never runs out, so a search goes to its full depth. */
const still = () => 0;
/** Plays random legal moves to the end and checks every step is accepted. */
function playout<S>(game: PointGame<S>, variant: string, seed: number, limit = 2000) {
  const random = seededRandom(seed);
  let s = game.create(variant),
    steps = 0;
  while (game.winner(s) === null) {
    const legal = game.moves(s);
    expect(legal.length).toBeGreaterThan(0);
    const next = game.play(s, legal[Math.floor(random() * legal.length)]);
    expect(next).not.toBeNull();
    s = next!;
    expect(++steps).toBeLessThan(limit);
  }
  expect(game.moves(s)).toEqual([]);
  return s;
}

describe("Hexa germ war", () => {
  it("lays out 61 cells, walls off the map's holes and starts with three germs in alternate corners", () => {
    const s = H.createGame();
    expect(H.CELLS).toHaveLength(61);
    expect([H.count(s, 0), H.count(s, 1)]).toEqual([3, 3]);
    expect(s.blocked.filter(Boolean)).toHaveLength(3);
    expect(s.blocked[H.at(1, 0)]).toBe(true);
    expect(s.cells[H.at(4, 0)]).toBe(0);
    expect(s.cells[H.at(4, -4)]).toBe(1);
  });
  it("copies into a neighbouring cell and jumps two cells away", () => {
    const s = H.createGame(),
      corner = H.at(4, 0);
    const copy = H.play(s, move(corner, H.at(3, 0)))!;
    expect([copy.cells[corner], copy.cells[H.at(3, 0)], H.count(copy, 0)]).toEqual([0, 0, 4]);
    expect(copy.effect).toMatchObject({ kind: "clone", from: corner });
    const jump = H.play(s, move(corner, H.at(2, 0)))!;
    expect([jump.cells[corner], jump.cells[H.at(2, 0)], H.count(jump, 0)]).toEqual([null, 0, 3]);
    expect(jump.effect!.kind).toBe("jump");
    expect(jump.turn).toBe(1);
  });
  it("turns every enemy germ next to the landing cell", () => {
    const s = H.createGame();
    s.cells[H.at(2, 0)] = 1;
    s.cells[H.at(2, 1)] = 1;
    s.cells[H.at(0, 0)] = 1;
    const next = H.play(s, move(H.at(4, 0), H.at(3, 0)))!;
    expect(next.effect!.converted.sort()).toEqual([H.at(2, 0), H.at(2, 1)].sort());
    expect([next.cells[H.at(2, 0)], next.cells[H.at(2, 1)], next.cells[H.at(0, 0)]]).toEqual([0, 0, 1]);
  });
  it("refuses moves that are not legal and never changes its input", () => {
    const s = H.createGame(),
      before = frozen(s);
    expect(H.play(s, move(H.at(4, -4), H.at(3, -3)))).toBeNull();
    expect(H.play(s, move(H.at(4, 0), H.at(1, 0)))).toBeNull();
    expect(H.play(s, move(H.at(4, 0), H.at(0, 0)))).toBeNull();
    expect(H.play(s, move(H.at(4, 0), H.at(4, -4)))).toBeNull();
    H.play(s, move(H.at(4, 0), H.at(3, 0)));
    choose(H.hexa, s, 0, 2, still);
    expect(frozen(s)).toBe(before);
  });
  it("gives the empty cells to the side that can still move and counts the board", () => {
    const s = H.createGame();
    s.cells = s.cells.map(() => null);
    s.cells[H.at(4, 0)] = 0;
    s.cells[H.at(3, 0)] = 1;
    // Blue copies next to red's only germ, which turns: red has nothing left.
    const next = H.play(s, move(H.at(4, 0), H.at(4, -1)))!;
    expect(next.winner).toBe(0);
    expect(H.count(next, 1)).toBe(0);
    expect(H.moves(next)).toEqual([]);
  });
  it("every map keeps the corners open and ends with a counted board that leaves the holes empty", () => {
    for (const map of Object.keys(H.MAPS)) {
      const start = H.createGame(map);
      expect(start.map).toBe(map);
      expect(start.blocked.filter(Boolean)).toHaveLength(H.MAPS[map].holes.length);
      expect(start.cells.some((c, i) => c !== null && start.blocked[i])).toBe(false);
      for (let seed = 1; seed <= 3; seed++) {
        const s = playout(H.hexa, map, seed);
        const [a, b] = [H.count(s, 0), H.count(s, 1)];
        expect(s.winner).toBe(a === b ? "draw" : a > b ? 0 : 1);
        expect(s.cells.some((c, i) => c !== null && s.blocked[i])).toBe(false);
      }
    }
    expect(H.createGame("nowhere").map).toBe("classic");
    // A germ cannot enter a hole but may jump across it.
    const wall = H.createGame("wall");
    wall.cells[H.at(0, -1)] = 0;
    expect(H.play(wall, move(H.at(0, -1), H.at(0, 0)))).toBeNull();
    expect(H.play(wall, move(H.at(0, -1), H.at(0, 1)))).not.toBeNull();
  });
});

describe("Nine men's morris", () => {
  it("joins 24 points with 16 lines of three", () => {
    expect(M.MILLS).toHaveLength(16);
    expect(M.NEIGHBOURS[0].sort()).toEqual([1, 7]);
    expect(M.NEIGHBOURS[1].sort((a, b) => a - b)).toEqual([0, 2, 9]);
    expect(M.NEIGHBOURS[9].sort((a, b) => a - b)).toEqual([1, 8, 10, 17]);
    expect(M.NEIGHBOURS[17].sort((a, b) => a - b)).toEqual([9, 16, 18]);
  });
  it("places men in turn and takes a man with a mill", () => {
    let s = M.createGame();
    for (const to of [0, 8, 1, 9]) s = M.play(s, move(-1, to))!;
    // Closing 0-1-2 offers each white man outside a mill.
    const closing = M.moves(s).filter((m) => m.to === 2);
    expect(closing.map((m) => m.extra).sort()).toEqual([8, 9]);
    expect(M.play(s, move(-1, 2))).toBeNull();
    s = M.play(s, move(-1, 2, 9))!;
    expect([s.board[9], M.count(s, 1), s.placed, s.turn]).toEqual([null, 1, [3, 2], 1]);
    expect(s.effect).toMatchObject({ kind: "place", to: 2, removed: [9] });
  });
  it("spares men in a mill unless every man stands in one", () => {
    const s = M.createGame();
    [8, 9, 10, 16].forEach((p) => (s.board[p] = 1));
    [0, 1].forEach((p) => (s.board[p] = 0));
    s.placed = [2, 4];
    expect(M.moves(s).filter((m) => m.to === 2).map((m) => m.extra)).toEqual([16]);
    s.board[16] = null;
    expect(M.moves(s).filter((m) => m.to === 2).map((m) => m.extra).sort()).toEqual([10, 8, 9].sort());
  });
  it("moves along lines, flies with three men and ends below three or without a move", () => {
    const s = M.createGame();
    s.placed = [9, 9];
    [0, 3, 5, 12].forEach((p) => (s.board[p] = 0));
    [16, 18, 20].forEach((p) => (s.board[p] = 1));
    expect(M.moves(s).filter((m) => m.from === 0).map((m) => m.to).sort()).toEqual([1, 7]);
    const t = { ...s, turn: 1 as const };
    // Three men fly to any empty point.
    expect(new Set(M.moves(t).filter((m) => m.from === 16).map((m) => m.to)).size).toBe(24 - 7);
    // Black closes 3-11-19 by 12→11 and takes a man: white has two left.
    s.board[19] = 0;
    const won = M.play(s, move(12, 11, 16))!;
    expect(won.winner).toBe(0);
    expect(M.morris.reason(won)).toBe("말이 둘만 남았습니다.");
  });
  it("refuses illegal moves, never changes its input and always ends", () => {
    const s = M.createGame(),
      before = frozen(s);
    expect(M.play(s, move(0, 1))).toBeNull();
    expect(M.play(s, move(-1, 24))).toBeNull();
    expect(M.play(s, move(-1, 0, 3))).toBeNull();
    M.play(s, move(-1, 0));
    choose(M.morris, s, 0, 2, still);
    expect(frozen(s)).toBe(before);
    for (let seed = 1; seed <= 8; seed++) playout(M.morris, "", seed);
  });
});

describe("Gonu", () => {
  it("well gonu: the first move may not shut the other side in, later ones may", () => {
    const s = G.createGame("well");
    // Black (bottom, 2 and 3) could win at once with 3→4; only 2→4 is allowed.
    expect(G.moves(s)).toEqual([move(2, 4)]);
    expect(G.play(s, move(3, 4))).toBeNull();
    let t = G.play(s, move(2, 4))!;
    expect(G.moves(t).map((m) => [m.from, m.to])).toEqual([[0, 2]]);
    t = G.play(t, move(0, 2))!;
    // 4→0 leaves white (1 and 2) with 2→4 only; nothing is shut yet.
    t = G.play(t, move(4, 0))!;
    expect(t.winner).toBeNull();
  });
  it("well gonu ends when a side cannot move", () => {
    const s = G.createGame("well");
    s.ply = 4;
    s.board = [1, 1, 0, 0, null];
    s.turn = 0;
    // White stands on 0 and 1; black's 3→4 takes the centre and shuts both in.
    const won = G.play(s, move(3, 4))!;
    expect(won.winner).toBe(0);
    expect(G.gonu.reason(won)).toBe("더 움직일 수 없습니다.");
  });
  it("line gonu takes a piece caught between two in a row, by the piece that moved", () => {
    const s = G.createGame("line");
    expect([G.count(s, 0), G.count(s, 1)]).toEqual([4, 4]);
    s.board = s.board.map(() => null);
    s.board[5] = 1;
    s.board[9] = 1;
    s.board[6] = 0;
    s.board[8] = 0;
    // 8→4 puts white's 5 between 4 and 6.
    const next = G.play(s, move(8, 4))!;
    expect(next.effect!.removed).toEqual([5]);
    expect(next.board[5]).toBeNull();
    expect(next.winner).toBe(0);
    // Stepping between two enemies is safe: only the mover captures.
    const t = G.createGame("line");
    t.board = t.board.map(() => null);
    t.board[4] = 1;
    t.board[6] = 1;
    t.board[9] = 0;
    t.board[15] = 0;
    expect(G.play(t, move(9, 5))!.board[5]).toBe(0);
  });
  it("pumpkin gonu keeps pieces out of both homes once they have left", () => {
    let s = G.createGame("pumpkin");
    expect(G.moves(s)).toEqual([move(9, 5)]);
    s = G.play(s, move(9, 5))!;
    s = G.play(s, move(1, 3))!;
    // Inside the home a piece may still step sideways; the one outside may not return.
    expect(G.moves(s).map((m) => [m.from, m.to]).sort()).toEqual(
      [[5, 4], [5, 6], [5, 7], [8, 9], [10, 9]].sort(),
    );
    s = G.play(s, move(5, 7))!;
    expect(G.moves(s).some((m) => [8, 9, 10].includes(m.to))).toBe(false);
  });
  it("car gonu steps one point and takes only by running through a loop", () => {
    const s = G.createGame("car");
    // At the start a piece steps forward; no enemy can be reached through a loop.
    expect(G.moves(s).map((m) => [m.from, m.to]).sort()).toEqual([[12, 8], [13, 9], [14, 10], [15, 11]].sort());
    // Black on 13 runs up its column (9, 5, 1 empty), round the top-left loop and meets white on 4.
    s.board = s.board.map(() => null);
    s.board[13] = 0;
    s.board[4] = 1;
    s.board[3] = 1;
    expect(G.moves(s).filter((m) => m.from === 13).map((m) => m.to).sort()).toEqual([12, 14, 4, 9].sort((a, b) => String(a).localeCompare(String(b))));
    const taken = G.play(s, move(13, 4))!;
    expect([taken.board[13], taken.board[4], G.count(taken, 1)]).toEqual([null, 0, 1]);
    expect(taken.effect).toMatchObject({ kind: "jump", removed: [4] });
    // A piece in the way stops the run, and a straight line without a loop takes nothing.
    s.board[5] = 0;
    expect(G.moves(s).some((m) => m.from === 13 && m.to === 4)).toBe(false);
    const line = G.createGame("car");
    line.board = line.board.map(() => null);
    line.board[8] = 0;
    line.board[11] = 1;
    // Along the row there is no loop; the long way round is open, until 13 is blocked.
    expect(G.moves(line).some((m) => m.from === 8 && m.to === 11)).toBe(true);
    line.board[13] = 0;
    expect(G.moves(line).some((m) => m.from === 8 && m.to === 11)).toBe(false);
    // Taking the last piece wins.
    const last = G.createGame("car");
    last.board = last.board.map(() => null);
    last.board[13] = 0;
    last.board[4] = 1;
    expect(G.play(last, move(13, 4))!.winner).toBe(0);
  });
  it("cham gonu places twelve pieces each and counts the corner lines as rows of three", () => {
    let s = G.createGame("cham");
    expect(G.gonu.tally(s)).toEqual(["판 위 0 · 남은 말 12", "판 위 0 · 남은 말 12"]);
    // Corners 0, 8 and 16 lie on one line here, unlike in nine men's morris.
    for (const to of [0, 1, 8, 2]) s = G.play(s, move(-1, to))!;
    expect(G.moves(s).filter((m) => m.to === 16).map((m) => m.extra).sort()).toEqual([1, 2]);
    s = G.play(s, move(-1, 16, 2))!;
    expect([s.board[2], s.turn, s.ply, s.variant]).toEqual([null, 1, 5, "cham"]);
    expect(G.play(s, move(0, 7))).toBeNull();
  });
  it("refuses illegal moves, never changes its input and always ends", () => {
    for (const variant of G.VARIANTS) {
      const s = G.createGame(variant),
        before = frozen(s);
      expect(G.play(s, move(0, 1, 2))).toBeNull();
      expect(G.play(s, move(4, 4, variant === "cham" ? 0 : -1))).toBeNull();
      choose(G.gonu, s, 0, 3, still);
      expect(frozen(s)).toBe(before);
      for (let seed = 1; seed <= 6; seed++) playout(G.gonu, variant, seed);
    }
  });
});

describe("The shared computer", () => {
  it("slips into a random legal move only as often as its level says", () => {
    const s = G.createGame("line"),
      best = choose(G.gonu, s, 0, 2, still);
    // A slip is decided by the first draw; the second picks the move.
    expect(choose(G.gonu, s, 0, 2, still, 0.3, () => 0.9)).toEqual(best);
    const draws = [0.1, 0.999];
    expect(choose(G.gonu, s, 0, 2, still, 0.3, () => draws.shift()!)).toEqual(G.moves(s).at(-1));
  });
  it("takes a win in one move and blocks one", () => {
    const s = G.createGame("well");
    s.ply = 4;
    s.board = [1, 1, 0, 0, null];
    expect(choose(G.gonu, s, 0, 3, still)).toEqual(move(3, 4));
    // Morris: white must stop 0-1-2 by placing on 2.
    let m = M.createGame();
    for (const to of [0, 8, 1]) m = M.play(m, move(-1, to))!;
    expect(choose(M.morris, m, 0, 2, still)).toMatchObject({ to: 2 });
  });
  it("beats random play at hexa far more often than not", () => {
    let wins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const random = seededRandom(seed);
      let s = H.createGame();
      while (s.winner === null) {
        const legal = H.moves(s);
        s = H.play(s, s.turn === 0 ? choose(H.hexa, s, 0, 2, still)! : legal[Math.floor(random() * legal.length)])!;
      }
      if (s.winner === 0) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(5);
  });
});
