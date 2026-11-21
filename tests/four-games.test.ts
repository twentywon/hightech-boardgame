import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import { choose } from "../src/games/points/ai";
import * as fox from "../src/games/foxgeese/rules";
import * as tafl from "../src/games/tafl/rules";
import * as ur from "../src/games/ur/rules";
import * as tents from "../src/games/tents/rules";

/** Plays a game out with the shared search at a fixed small depth, checking that every move it picks is legal. */
function playOut<S>(game: { moves(s: S): { from: number; to: number; extra: number }[]; play(s: S, m: { from: number; to: number; extra: number }): S | null; winner(s: S): unknown }, start: S, pick: (s: S) => { from: number; to: number; extra: number } | null, limit = 600) {
  let s = start;
  for (let n = 0; n < limit && game.winner(s) === null; n++) {
    const move = pick(s)!;
    expect(game.moves(s).some((m) => m.from === move.from && m.to === move.to)).toBe(true);
    s = game.play(s, move)!;
    expect(s).not.toBeNull();
  }
  return s;
}
describe("fox and geese", () => {
  const at = fox.indexOf;
  test("the cross has 33 points, thirteen geese and the fox", () => {
    const s = fox.createGame();
    expect(fox.POINTS).toHaveLength(33);
    expect(s.geese).toHaveLength(13);
    expect(s.turn).toBe(0);
    // A slanted line runs from the centre, none from a point whose column and row add up to an odd number.
    expect(fox.LINES[at(3, 3)]).toHaveLength(8);
    expect(fox.LINES[at(3, 2)]).toHaveLength(4);
  });
  test("geese never step back; the fox jumps a goose and may jump on or stay", () => {
    const s = fox.createGame();
    expect(fox.moves(s).every((m) => fox.POINTS[m.to].row <= fox.POINTS[m.from].row)).toBe(true);
    // The fox on the left arm of the middle row, two geese in a line with gaps behind them.
    const two = { ...s, turn: 1 as const, fox: at(1, 3), geese: [at(2, 3), at(4, 3), at(2, 6), at(3, 6), at(4, 6), at(2, 5), at(4, 5), at(3, 5)] };
    const jumped = fox.play(two, { from: at(1, 3), to: at(3, 3), extra: -1 })!;
    expect(jumped.geese).not.toContain(at(2, 3));
    expect(jumped.chain).toBe(true);
    expect(jumped.turn).toBe(1);
    expect(fox.moves(jumped).some((m) => m.to === fox.STAY)).toBe(true);
    const stayed = fox.play(jumped, { from: -1, to: fox.STAY, extra: -1 })!;
    expect(stayed.turn).toBe(0);
  });
  test("a penned fox loses; too few geese lose", () => {
    // The fox at the top of the cross; a goose steps sideways under it and it can neither step nor jump.
    const pen = { ...fox.createGame(), turn: 0 as const, fox: at(3, 0), geese: [at(2, 0), at(4, 0), at(3, 2), at(2, 1), ...[0, 1, 2].map((c) => at(c, 4))] };
    const closed = fox.play(pen, { from: at(2, 1), to: at(3, 1), extra: -1 })!;
    expect(closed.winner).toBe(0);
    const seeded = seededRandom(3);
    const end = playOut(fox.foxGeese, fox.createGame(), (st) => choose(fox.foxGeese, st, 1e9, 2, () => 0, 0.2, seeded));
    expect(end.winner).not.toBeNull();
  });
});
describe("hnefatafl", () => {
  const at = (c: number, r: number) => r * 11 + c;
  test("24 attackers, 12 defenders and the king on the throne; the attackers move first", () => {
    const s = tafl.createGame(0);
    expect(s.board.filter((p) => p === "a")).toHaveLength(24);
    expect(s.board.filter((p) => p === "d")).toHaveLength(12);
    expect(s.board[tafl.THRONE]).toBe("k");
    expect(s.turn).toBe(0);
    // Only the king may stop on a corner.
    expect(tafl.moves(s).some((m) => tafl.CORNERS.includes(m.to))).toBe(false);
  });
  test("a piece shut in between two enemies is taken, against a corner too", () => {
    const board: tafl.Piece[] = Array(121).fill(null);
    board[at(5, 5)] = "k";
    board[at(2, 2)] = "a";
    board[at(3, 2)] = "d";
    board[at(4, 4)] = "d";
    board[at(1, 0)] = "d";
    board[at(2, 5)] = "a";
    const s: tafl.State = { raider: 0, board, turn: 1, last: null, winner: null, ply: 0 };
    // A defender moves to (1,2): the attacker on (2,2) is between it and the one on (3,2).
    const took = tafl.play(s, { from: at(1, 0), to: at(1, 2), extra: -1 })!;
    expect(took.board[at(2, 2)]).toBeNull();
    expect(took.last!.taken).toEqual([at(2, 2)]);
    // Beside a corner one enemy is enough.
    const corner: tafl.Piece[] = Array(121).fill(null);
    corner[at(5, 5)] = "k";
    corner[at(0, 1)] = "a";
    corner[at(0, 4)] = "d";
    const c = tafl.play({ ...s, board: corner }, { from: at(0, 4), to: at(0, 2), extra: -1 })!;
    expect(c.board[at(0, 1)]).toBeNull();
  });
  test("the king reaching a corner wins; shut in on four sides he is taken", () => {
    const board: tafl.Piece[] = Array(121).fill(null);
    board[at(0, 5)] = "k";
    board[at(8, 8)] = "a";
    const free = tafl.play({ raider: 0, board, turn: 1, last: null, winner: null, ply: 0 }, { from: at(0, 5), to: at(0, 0), extra: -1 })!;
    expect(free.winner).toBe(1);
    const ring: tafl.Piece[] = Array(121).fill(null);
    ring[at(5, 3)] = "k";
    for (const [c, r] of [[4, 3], [6, 3], [5, 2]]) ring[at(c, r)] = "a";
    ring[at(5, 8)] = "a";
    ring[at(9, 9)] = "d";
    const taken = tafl.play({ raider: 0, board: ring, turn: 0, last: null, winner: null, ply: 0 }, { from: at(5, 8), to: at(5, 4), extra: -1 })!;
    expect(taken.winner).toBe(0);
  });
  test("a game against itself ends", () => {
    const seeded = seededRandom(5);
    const end = playOut(tafl.tafl, tafl.createGame(1), (st) => choose(tafl.tafl, st, 1e9, 1, () => 0, 0.3, seeded), 400);
    expect(end.winner).not.toBeNull();
  });
});
describe("royal game of Ur", () => {
  test("four dice give 0 to 4; a throw nobody can use passes the turn", () => {
    const s = ur.createGame();
    const thrown = ur.play(s, { from: -1, to: ur.THROW, extra: -1 }, seededRandom(2))!;
    expect(ur.thrown(thrown)).toBeGreaterThanOrEqual(0);
    expect(ur.thrown(thrown)).toBeLessThanOrEqual(4);
    const zero = ur.play(s, { from: -1, to: ur.THROW, extra: -1 }, () => 0.9)!;
    expect(ur.thrown(zero)).toBe(0);
    expect(zero.turn).toBe(1);
    expect(zero.phase).toBe("throw");
  });
  test("a rosette throws again; the middle row takes; the middle rosette is safe; off needs an exact throw", () => {
    const base = { ...ur.createGame(), phase: "move" as const };
    const four = { ...base, dice: [true, true, true, true] };
    const rosette = ur.play(four, { from: 0, to: ur.DEST_BASE + 4, extra: -1 })!;
    expect(rosette.turn).toBe(0);
    const take = { ...base, dice: [true, false, false, false], pieces: [[6, 0, 0, 0, 0, 0, 0], [7, 0, 0, 0, 0, 0, 0]] as [number[], number[]] };
    const took = ur.play(take, { from: 0, to: ur.DEST_BASE + 7, extra: -1 })!;
    expect(took.pieces[1][0]).toBe(0);
    expect(took.last!.sent).toEqual([7]);
    const safe = { ...base, dice: [true, true, false, false], pieces: [[6, 0, 0, 0, 0, 0, 0], [8, 0, 0, 0, 0, 0, 0]] as [number[], number[]] };
    expect(ur.moves(safe).some((m) => m.to === ur.DEST_BASE + 8)).toBe(false);
    const late = { ...base, dice: [true, true, true, false], pieces: [[13, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]] as [number[], number[]] };
    expect(ur.moves(late).some((m) => m.from === 0)).toBe(false);
  });
  test("games against itself end with seven pieces off", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const random = seededRandom(seed);
      let s = ur.createGame();
      for (let n = 0; n < 3000 && s.winner === null; n++) s = ur.play(s, ur.ur.choose!(s, "normal", random)!, random)!;
      expect(s.winner).not.toBeNull();
      expect(s.pieces[s.winner as 0 | 1].every((p) => p === ur.OFF)).toBe(true);
    }
  });
});
describe("tents", () => {
  test("every laid puzzle has one answer that keeps every rule, and the hint pitches it", () => {
    for (let stage = 1; stage <= tents.STAGES.length; stage++)
      for (let seed = 1; seed <= 5; seed++) {
        let state = tents.createGame(stage, seededRandom(seed * 31 + stage));
        const n = state.size;
        expect(tents.solutions(n, state.trees, state.rows, state.cols)).toBe(1);
        expect(tents.paired(n, state.trees, state.answer)).toBe(true);
        expect(state.answer.filter(Boolean).length).toBe(state.trees.filter(Boolean).length);
        expect(tents.crowded({ size: n, cells: state.answer.map((t) => (t ? tents.TENT : 0)) }).some(Boolean)).toBe(false);
        for (let m = 0; m < 300 && state.winner === null; m++) state = tents.play(state, tents.hint(state)!)!;
        expect(state.winner).toBe(0);
      }
  });
  test("a tap goes tent, grass, nothing; trees cannot be tapped; touching tents are told", () => {
    const s = tents.createGame(1, seededRandom(4)),
      free = s.trees.findIndex((t) => !t),
      tree = s.trees.findIndex(Boolean);
    let t = s;
    for (const mark of [tents.TENT, tents.GRASS, tents.EMPTY]) {
      t = tents.play(t, { from: -1, to: free, extra: -1 })!;
      expect(t.cells[free]).toBe(mark);
    }
    expect(tents.play(s, { from: -1, to: tree, extra: -1 })).toBeNull();
    const cells = new Array(25).fill(0);
    cells[0] = cells[6] = tents.TENT;
    expect(tents.crowded({ size: 5, cells })[0]).toBe(true);
  });
});
