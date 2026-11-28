import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as hanoi from "../src/games/hanoi/rules";
import * as pour from "../src/games/pour/rules";
import * as queens from "../src/games/queens/rules";
import * as tour from "../src/games/knight/rules";
import * as amz from "../src/games/amazons/rules";
import { amazonsConfig } from "../src/games/amazons/config";
import { pointRules } from "../src/net/points";

describe("water pouring, upgraded", () => {
  test("four vessels: every puzzle drawn can be solved in the fewest pours it names, within its stage's band", () => {
    const kinds = new Set<string>();
    for (let level = 4; level <= pour.STAGE_COUNT; level++)
      for (let seed = 1; seed <= 14; seed++) {
        const start = pour.createGame(level, seededRandom(seed * 13 + level)),
          [low, high] = pour.BANDS4[level - 4],
          way = pour.solve(start)!;
        kinds.add(start.goal.kind);
        expect(pour.vesselsOf(level)).toBe(4);
        expect(start.amounts).toEqual([start.caps[0], 0, 0, 0]);
        expect(start.caps.every((cap, i) => i === 0 || cap < start.caps[i - 1])).toBe(true);
        expect(start.caps[3]).toBeGreaterThanOrEqual(2);
        expect([way.length, start.best >= low && start.best <= high]).toEqual([start.best, true]);
        const end = way.reduce((s, move) => pour.play(s, move)!, start);
        expect(end.winner).toBe(0);
        // Nothing is ever lost.
        expect(end.amounts.reduce((a, b) => a + b)).toBe(start.caps[0]);
        if (start.goal.kind === "thirds") expect(end.amounts.slice(0, 3)).toEqual([1, 2, 3].map(() => start.caps[0] / 3));
        if (start.goal.kind === "split") expect(end.amounts.slice(0, 2)).toEqual([start.caps[0] / 2, start.caps[0] / 2]);
        if (start.goal.kind === "make") expect(end.amounts).toContain(start.goal.amount);
        expect(pour.holding(end.amounts, end.goal)).not.toBeNull();
      }
    // All three kinds of goal come up.
    expect([...kinds].sort()).toEqual(["make", "split", "thirds"]);
  });
  test("a pour among four goes on until one is empty or the other full; the goal of thirds is told and met", () => {
    let state: pour.State = { caps: [12, 7, 5, 3], amounts: [12, 0, 0, 0], goal: { kind: "thirds", amount: 4 }, best: 0, winner: null, last: null, ply: 0 };
    expect(pour.moves(state).map((m) => [m.from, m.to])).toEqual([[0, 1], [0, 2], [0, 3]]);
    state = pour.play(state, { from: 0, to: 2, extra: -1 })!;
    state = pour.play(state, { from: 2, to: 3, extra: -1 })!;
    expect(state.amounts).toEqual([7, 0, 2, 3]);
    expect(pour.goalText(state)).toBe("12·7·5리터 그릇에 4리터씩 나누기");
    const way = pour.solve(state)!;
    const end = way.reduce((s, move) => pour.play(s, move)!, state);
    expect([end.winner, end.amounts.slice(0, 3)]).toEqual([0, [4, 4, 4]]);
    expect(pour.pouring.reason(end)).toMatch(/^성공!/);
    // The old stages are untouched: three vessels.
    expect(pour.createGame(3, seededRandom(5)).caps).toHaveLength(3);
  });
});

describe("queens on the board, upgraded", () => {
  test("4×4, 9×9 and 10×10 have their known numbers of answers, and their puzzles finish in one way", () => {
    expect([4, 9, 10].map((n) => queens.answers(n).length)).toEqual([2, 352, 724]);
    for (const stage of [6, 7, 8])
      for (let seed = 1; seed <= 6; seed++) {
        const state = queens.createGame(stage, seededRandom(seed * 17 + stage)),
          { size, given } = queens.STAGES[stage - 1];
        expect([state.size, state.fixed.filter(Boolean).length, queens.clashing(state)]).toEqual([size, given, []]);
        const ways = queens.answers(size).filter((cols) => state.fixed.every((f, i) => !f || cols[Math.floor(i / size)] === i % size));
        expect(ways).toHaveLength(1);
      }
  });
  test("a repair board has every queen set, some misplaced in their rows; the hint mends it", () => {
    for (const [k, { size, wrong }] of queens.REPAIRS.entries())
      for (let seed = 1; seed <= 8; seed++) {
        const value = queens.STAGES.length + k + 1;
        let state = queens.createGame(value, seededRandom(seed * 5 + k));
        expect(queens.repairOf(value)).toEqual({ size, wrong });
        expect([state.size, state.queens.filter(Boolean).length, state.fixed.some(Boolean)]).toEqual([size, size, false]);
        // One queen a row, and at least as many in another's way as were misplaced.
        for (let r = 0; r < size; r++) expect(state.queens.slice(r * size, r * size + size).filter(Boolean)).toHaveLength(1);
        expect(queens.clashing(state).length).toBeGreaterThanOrEqual(wrong);
        expect(queens.queens.hint(state)).toContain("빨간 퀸을 옮겨");
        // A full board refuses another queen: one must be taken off or carried.
        const empty = state.queens.findIndex((q) => !q);
        expect(queens.play(state, { from: -1, to: empty, extra: -1 })).toBeNull();
        for (let step = 0; step < 4 * size && state.winner === null; step++) state = queens.play(state, queens.hint(state)!)!;
        expect(state.winner).toBe(0);
      }
  });
  test("a queen of mine is carried to an empty square in one move; a given one, or onto another, is refused", () => {
    const state = queens.createGame(1, seededRandom(3)),
      given = state.fixed.findIndex(Boolean),
      empty = (from: number) => state.queens.findIndex((q, i) => !q && i !== from);
    expect(queens.play(state, { from: given, to: empty(given), extra: -1 })).toBeNull();
    const set = queens.play(state, { from: -1, to: empty(-1), extra: -1 })!,
      mine = set.last!,
      to = set.queens.findIndex((q) => !q),
      moved = queens.play(set, { from: mine, to, extra: -1 })!;
    expect([moved.queens[mine], moved.queens[to], moved.last, moved.ply]).toEqual([false, true, to, 2]);
    expect(queens.play(set, { from: mine, to: given, extra: -1 })).toBeNull();
    // Lines of the clash: a pair for every two queens in each other's way.
    const pairs = queens.clashPairs({ size: 4, queens: [true, true, false, false, false, false, false, false, false, false, false, false, false, false, false, true] });
    expect(pairs).toEqual([[0, 1], [0, 15]]);
  });
});

describe("knight tour, upgraded", () => {
  test("7×7 and 8×8 boards are laid and can be travelled", () => {
    for (const stage of [6, 7])
      for (let seed = 1; seed <= 6; seed++) {
        const state = tour.createGame(stage, seededRandom(seed * 19 + stage)),
          { cols, rows, fill } = tour.STAGES[stage - 1];
        expect(state.open.filter(Boolean).length).toBeGreaterThanOrEqual(Math.ceil(cols * rows * fill));
        expect(state.closed).toBeUndefined();
        const way = tour.solve(state)!;
        expect(way).toHaveLength(state.open.filter(Boolean).length - 1);
      }
  });
  test("a closed journey covers its share, can be travelled round, and ends with the jump home", () => {
    for (const [k, stage] of tour.CLOSED.entries())
      for (let seed = 1; seed <= 8; seed++) {
        const value = tour.STAGES.length + k + 1;
        let state = tour.createGame(value, seededRandom(seed * 23 + k));
        const total = state.open.filter(Boolean).length,
          start = state.path[0];
        expect(state.closed).toBe(true);
        expect(total).toBeGreaterThanOrEqual(Math.ceil(stage.cols * stage.rows * stage.fill));
        // Following the hint: every square once, and then back onto the first.
        while (state.winner === null) state = tour.play(state, tour.hint(state)!)!;
        expect(state.winner).toBe(0);
        expect(state.path).toHaveLength(total + 1);
        expect(state.path[total]).toBe(start);
        expect(new Set(state.path).size).toBe(total);
        expect(tour.knight.reason(state)).toBe("성공! 모든 칸을 밟고 출발점으로 돌아왔습니다.");
      }
  });
  test("closed: the first square is refused until every other is trodden; trodden all but far from home is a failure", () => {
    // Three squares of a 3×4 board, laid by hand: a1 (0), b3 (7) and c1 (2). From a1 the knight reaches b3, from b3
    // both a1 and c1; c1 is no knight's move from a1, so this board cannot be closed.
    const cols = 3,
      rows = 4,
      open = Array.from({ length: cols * rows }, (_, i) => [0, 7, 2].includes(i)),
      start: tour.State = { cols, rows, open, path: [0], closed: true, last: null, winner: null, ply: 0 };
    let state = tour.play(start, { from: -1, to: 7, extra: -1 })!;
    // Back to a1 is not offered while c1 is left.
    expect(tour.nextSquares(state)).toEqual([2]);
    expect(tour.play(state, { from: -1, to: 0, extra: -1 })).toBeNull();
    state = tour.play(state, { from: -1, to: 2, extra: -1 })!;
    expect(state.winner).toBe(1);
    expect(tour.knight.reason(state)).toBe("실패! 출발점으로 돌아갈 수 없습니다.");
    expect(tour.hint(start)).toBeNull();
  });
});

describe("game of the Amazons, upgraded", () => {
  test("the board is chosen by variant: 10×10 as always, 8×8 and 6×6, four amazons a side, mirrored", () => {
    for (const [variant, size] of [["", 10], ["10", 10], ["8", 8], ["6", 6], ["7", 10]] as const) {
      const s = amz.amazons.create(variant);
      expect([amz.sizeOf(s.board), s.board.filter((p) => p === 0).length, s.board.filter((p) => p === 1).length]).toEqual([size, 4, 4]);
      // Black stands where white does, across the middle.
      s.board.forEach((p, i) => p === 0 && expect(s.board[(size - 1 - Math.floor(i / size)) * size + (i % size)]).toBe(1));
    }
    // A move on the small board lands like a queen within its edges and burns a square.
    const small = amz.createGame(6),
      m = amz.moves(small)[0],
      next = amz.play(small, m)!;
    expect([next.board[m.to], next.board[m.extra], next.turn]).toEqual([0, amz.BURNT, 1]);
    expect(amz.moves(small).every((x) => x.to >= 0 && x.to < 36 && x.extra >= 0 && x.extra < 36)).toBe(true);
    // A queen's reach stops at the board's edge: from a corner of an empty 8×8 board, 21 squares.
    expect(amz.reach(new Array(64).fill(amz.EMPTY), 0)).toHaveLength(21);
  });
  test("over Wi-Fi the room lays the board the host chose, and a move is played the same way", () => {
    const rules = pointRules(amz.amazons, amazonsConfig.net!),
      seats = [{ kind: "person" }, { kind: "person" }],
      laid = rules.create({ variant: "8", options: {}, seats } as unknown as Parameters<typeof rules.create>[0], seededRandom(1));
    expect(amz.sizeOf(laid.board)).toBe(8);
    expect(rules.toMove(laid)).toBe(0);
    const move = amz.moves(laid)[3],
      after = rules.play(laid, move, seededRandom(2))!;
    expect([after.board[move.to], after.board[move.extra], rules.toMove(after)]).toEqual([0, amz.BURNT, 1]);
    // The classic board is still what a room without a choice lays.
    expect(amz.sizeOf(rules.create({ variant: "", options: {}, seats } as unknown as Parameters<typeof rules.create>[0], seededRandom(1)).board)).toBe(10);
  });
  test("the hard computer plays legal moves to the end and beats the normal one from either side", () => {
    let wins = 0;
    for (let g = 0; g < 4; g++) {
      const random = seededRandom(g + 1),
        hardSide = g % 2;
      let s = amz.createGame(8);
      while (s.winner === null) {
        const m = amz.chooseMove(s, s.turn === hardSide ? "hard" : "normal", random)!;
        s = amz.play(s, m)!;
        expect(s).not.toBeNull();
      }
      expect(amz.canMove(s.board, s.turn)).toBe(false);
      if (s.winner === hardSide) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(3);
  }, 60000);
});

describe("tower of Hanoi, upgraded", () => {
  test("the old stages keep their values; '4p' and a count lays a tower on four pegs", () => {
    expect(hanoi.stageOf("5")).toEqual({ pegs: 3, discs: 5 });
    expect(hanoi.stageOf("")).toEqual({ pegs: 3, discs: hanoi.MIN });
    expect(hanoi.stageOf("4p7")).toEqual({ pegs: 4, discs: 7 });
    const start = hanoi.hanoi.create("4p5");
    expect(start.pegs).toEqual([[5, 4, 3, 2, 1], [], [], []]);
    expect(hanoi.moves(start).map((m) => [m.from, m.to])).toEqual([[0, 1], [0, 2], [0, 3]]);
    expect(hanoi.hanoi.create("6").pegs).toHaveLength(3);
  });
  test("four pegs: the hint moves every tower in the fewest moves (13, 17, 25, 33), from a detour as well", () => {
    const fewest: Record<number, number> = { 5: 13, 6: 17, 7: 25, 8: 33 };
    for (const discs of hanoi.FOUR) {
      let state = hanoi.createGame(discs, 4);
      expect(state.best).toBe(fewest[discs]);
      while (state.winner === null) state = hanoi.play(state, hanoi.hint(state)!)!;
      expect(state.ply).toBe(fewest[discs]);
      expect(state.pegs.slice(1).some((peg) => peg.length === discs)).toBe(true);
      expect(hanoi.hint(state)).toBeNull();
    }
    // Two wrong moves, and the hint still leads home.
    let state = hanoi.createGame(6, 4);
    state = hanoi.play(state, { from: 0, to: 3, extra: -1 })!;
    state = hanoi.play(state, { from: 3, to: 0, extra: -1 })!;
    for (let i = 0; i < 60 && state.winner === null; i++) state = hanoi.play(state, hanoi.hint(state)!)!;
    expect([state.winner, state.ply]).toEqual([0, 2 + 17]);
    // A tower on the fourth peg counts as on any other.
    const almost = { ...hanoi.createGame(5, 4), pegs: [[1], [], [], [5, 4, 3, 2]] } as hanoi.State;
    expect(hanoi.hint(almost)).toMatchObject({ from: 0, to: 3 });
    expect(hanoi.play(almost, { from: 0, to: 3, extra: -1 })!.winner).toBe(0);
  });
});
