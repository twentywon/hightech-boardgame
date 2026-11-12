import { describe, expect, it } from "vitest";
import * as F from "../src/games/fourrow/rules";
import * as W from "../src/games/twist/rules";
import * as H from "../src/games/hare/rules";
import * as B from "../src/games/seabattle/rules";
import { choose } from "../src/games/points/ai";
import type { Move, PointGame } from "../src/games/points/types";
import { seededRandom } from "../src/core/ai";

const to = (point: number, extra = -1): Move => ({ from: -1, to: point, extra });
const step = (from: number, target: number): Move => ({ from, to: target, extra: -1 });
const frozen = (s: unknown) => JSON.stringify(s);
const still = () => 0;
function playout<S>(game: PointGame<S>, seed: number, limit = 600) {
  const random = seededRandom(seed);
  let s = game.create(""),
    steps = 0;
  while (game.winner(s) === null) {
    const legal = game.moves(s);
    expect(legal.length).toBeGreaterThan(0);
    const before = frozen(s),
      next = game.play(s, legal[Math.floor(random() * legal.length)], random);
    expect(frozen(s)).toBe(before);
    expect(next).not.toBeNull();
    s = next!;
    expect(++steps).toBeLessThan(limit);
  }
  return s;
}

describe("Four in a row", () => {
  it("drops a disc to the lowest free place of its column and refuses a full one", () => {
    let s = F.createGame();
    s = F.play(s, to(3))!;
    s = F.play(s, to(3))!;
    expect([s.cells[3], s.cells[10], s.turn, s.last]).toEqual([0, 1, 0, 10]);
    for (let i = 0; i < 4; i++) s = F.play(s, to(3))!;
    expect(F.freeRow(s, 3)).toBe(-1);
    expect(F.play(s, to(3))).toBeNull();
    expect(F.moves(s).map((m) => m.to)).not.toContain(3);
    expect(F.play(s, to(7))).toBeNull();
    expect(F.play(s, step(0, 1))).toBeNull();
  });
  it("wins with four across, up or diagonally, and draws when the rack is full", () => {
    let s = F.createGame();
    // Red on the bottom row 0–3, yellow on top of it.
    for (const col of [0, 0, 1, 1, 2, 2]) s = F.play(s, to(col))!;
    s = F.play(s, to(3))!;
    expect([s.winner, s.line]).toEqual([0, [0, 1, 2, 3]]);
    expect(F.moves(s)).toEqual([]);
    let d = F.createGame();
    // A staircase: red ends on (0,0), (1,1), (2,2), (3,3).
    for (const col of [0, 1, 1, 2, 2, 3, 2, 3, 3, 6]) d = F.play(d, to(col))!;
    d = F.play(d, to(3))!;
    expect([d.winner, d.line]).toEqual([0, [0, 8, 16, 24]]);
    expect(F.LINES).toHaveLength(69);
    for (let seed = 1; seed <= 8; seed++) {
      const end = playout(F.fourRow, seed);
      if (end.winner === "draw") expect(end.cells.every((c) => c !== null)).toBe(true);
      else expect(end.line.length).toBeGreaterThanOrEqual(4);
    }
  });
  it("the computer takes a win and blocks a three", () => {
    let s = F.createGame();
    for (const col of [0, 6, 1, 6, 2]) s = F.play(s, to(col))!;
    // Yellow must stop red at column 3.
    expect(choose(F.fourRow, s, 0, 2, still)).toEqual(to(3));
    s = F.play(s, to(5))!;
    expect(choose(F.fourRow, s, 0, 2, still)).toEqual(to(3));
  });
});

describe("Twist five", () => {
  it("turns a quarter either way and back", () => {
    const s = W.createGame();
    s.cells[0] = 0;
    s.cells[1] = 1;
    // Clockwise, the top row becomes the right column.
    const cw = W.twisted(s.cells, { quarter: 0, clockwise: true });
    expect([cw[2], cw[8]]).toEqual([0, 1]);
    expect(W.twisted(cw, { quarter: 0, clockwise: false })).toEqual(s.cells);
    expect(W.quarterCells(3)).toEqual([21, 22, 23, 27, 28, 29, 33, 34, 35]);
    expect(W.LINES).toHaveLength(32);
  });
  it("places, then turns; a marble that makes five wins without a turn", () => {
    let s = W.createGame();
    expect(W.moves(s)).toHaveLength(36 * 8);
    expect(W.play(s, to(0))).toBeNull();
    expect(W.play(s, to(0, 99))).toBeNull();
    // The marble goes to the top left corner and its quarter turns clockwise: it ends top right of that quarter.
    s = W.play(s, to(0, W.TURN_BASE))!;
    expect([s.cells[0], s.cells[2], s.turn, s.last]).toEqual([null, 0, 1, { cell: 0, twist: { quarter: 0, clockwise: true } }]);
    expect(W.play(s, to(2, W.TURN_BASE))).toBeNull();
    const five = W.createGame();
    for (const cell of [0, 1, 2, 3]) five.cells[cell] = 0;
    expect(W.moves(five).filter((m) => m.to === 4)).toEqual([to(4)]);
    expect(W.play(five, to(4, W.TURN_BASE))).toBeNull();
    const won = W.play(five, to(4))!;
    expect([won.winner, won.line, won.last!.twist]).toEqual([0, [0, 1, 2, 3, 4], null]);
  });
  it("a turn can win for either side, or draw for both", () => {
    // Turning the top right quarter anticlockwise carries (0,5) and (1,5) to (0,3) and (0,4), and (0,3) and (1,3) to (2,3) and (2,4).
    const turn = to(35, W.TURN_BASE + 3),
      board = (black: number[], white: number[]) => {
        const s = W.createGame();
        for (const cell of black) s.cells[cell] = 0;
        for (const cell of white) s.cells[cell] = 1;
        return s;
      };
    const mine = W.play(board([0, 1, 2, 5, 11], []), turn)!;
    expect([mine.winner, mine.line]).toEqual([0, [0, 1, 2, 3, 4]]);
    // The same turn made by black lines up white's five instead: white wins.
    const theirs = W.play(board([], [0, 1, 2, 5, 11]), turn)!;
    expect([theirs.winner, theirs.turn]).toEqual([1, 1]);
    const both = W.play(board([0, 1, 2, 5, 11], [12, 13, 14, 3, 9]), turn)!;
    expect([both.winner, W.twist.reason(both)]).toEqual(["draw", "돌린 뒤 양쪽 모두 다섯이 이어졌습니다."]);
    expect(W.moves(both)).toEqual([]);
  });
  it("searches each resulting board once, never changes its input and always ends", () => {
    const s = W.createGame();
    // On an empty board every turn of an empty quarter gives the same board.
    expect(W.candidates(s).length).toBeLessThan(W.moves(s).length);
    const before = frozen(s);
    choose(W.twist, s, 0, 1, still);
    expect(frozen(s)).toBe(before);
    for (let seed = 1; seed <= 6; seed++) {
      const end = playout(W.twist, seed);
      expect(end.winner).not.toBeNull();
      if (end.winner !== "draw") expect(end.line.length).toBeGreaterThanOrEqual(5);
    }
  });
  it("the computer completes its five", () => {
    const s = W.createGame();
    for (const cell of [0, 1, 2, 3]) s.cells[cell] = 0;
    expect(choose(W.twist, s, 0, 1, still)).toEqual(to(4));
  });
});

describe("Hare and hounds", () => {
  it("has eleven points; the ends touch three and the middle eight", () => {
    expect(H.PLACES).toHaveLength(11);
    expect(H.NEIGHBOURS[0].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(H.NEIGHBOURS[10].sort((a, b) => a - b)).toEqual([7, 8, 9]);
    expect(H.NEIGHBOURS[5]).toHaveLength(8);
    expect(H.NEIGHBOURS[1].sort((a, b) => a - b)).toEqual([0, 2, 4, 5]);
  });
  it("hounds move first and never back; the hare goes any way", () => {
    let s = H.createGame();
    expect([s.hounds, s.hare, s.turn]).toEqual([[0, 1, 3], 10, 0]);
    // The hound on the end may go only to the free middle of the first column.
    expect(H.moves(s).filter((m) => m.from === 0)).toEqual([step(0, 2)]);
    s = H.play(s, step(1, 4))!;
    expect(H.play(s, step(4, 1))).toBeNull();
    s = H.play(s, step(10, 8))!;
    // That hound cannot return to the column behind it.
    expect(H.moves(s).some((m) => m.from === 4 && m.to === 1)).toBe(false);
    expect(H.moves({ ...s, turn: 1 }).some((m) => m.from === 8 && m.to === 10)).toBe(true);
  });
  it("the hounds win by leaving the hare no move; the hare by passing them or by their stalling", () => {
    const trap: H.State = { ...H.createGame(), hounds: [8, 7, 5], hare: 10, turn: 0 };
    // The hare sits on the far end with two exits covered; the third hound closes the last.
    const closed = H.play(trap, step(5, 9))!;
    expect([closed.winner, H.hare.reason(closed)]).toEqual([0, "토끼가 갈 곳이 없습니다."]);
    const run: H.State = { ...H.createGame(), hounds: [4, 5, 6], hare: 2, turn: 1 };
    // From the first column the hare steps to the end, behind every hound.
    const away = H.play(run, step(2, 0))!;
    expect(away.winner).toBe(1);
    let s: H.State = { ...H.createGame(), hounds: [4, 5, 9], hare: 10, turn: 0 };
    for (let i = 0; i < H.STALL_LIMIT; i++) {
      s = H.play(s, i % 2 ? step(6, 5) : step(5, 6))!;
      if (s.winner !== null) break;
      s = H.play(s, i % 2 ? step(8, 10) : step(10, 8))!;
    }
    expect([s.winner, s.stall]).toEqual([1, H.STALL_LIMIT]);
    for (let seed = 1; seed <= 8; seed++) expect(playout(H.hare, seed).winner).not.toBe("draw");
  });
  it("lets side 0 play the hare: the hounds, now side 1, still move first", () => {
    let s = H.hare.create("hare");
    expect([s.hunter, s.turn, H.hare.owners(s)[10], H.hare.owners(s)[0]]).toEqual([1, 1, 0, 1]);
    expect(H.moves(s).every((m) => s.hounds.includes(m.from))).toBe(true);
    s = H.play(s, step(1, 4))!;
    expect([s.turn, H.moves(s).every((m) => m.from === 10)]).toEqual([0, true]);
    // Passing the hounds wins for side 0 here, and being penned in loses.
    const away = H.play({ ...s, hounds: [4, 5, 6], hare: 2, turn: 0 }, step(2, 0))!;
    expect(away.winner).toBe(0);
    const closed = H.play({ ...s, hounds: [8, 7, 5], hare: 10, turn: 1 }, step(5, 9))!;
    expect([closed.winner, H.hare.reason(closed)]).toEqual([1, "토끼가 갈 곳이 없습니다."]);
    expect(H.evaluate(s, 0)).toBe(-H.evaluate(s, 1));
  });
});

describe("Sea battle", () => {
  it("lays five ships of 17 squares without overlap, the same for the same chance", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const fleet = B.layFleet(seededRandom(seed)),
        cells = fleet.flatMap((ship) => ship.cells);
      expect(fleet.map((ship) => ship.cells.length)).toEqual([5, 4, 3, 3, 2]);
      expect(new Set(cells).size).toBe(17);
      for (const ship of fleet) {
        const rows = new Set(ship.cells.map((c) => Math.floor(c / 10))),
          cols = new Set(ship.cells.map((c) => c % 10));
        expect(Math.min(rows.size, cols.size)).toBe(1);
        expect(cells.every((c) => c >= 0 && c < 100)).toBe(true);
      }
    }
    expect(frozen(B.createBattle(seededRandom(5)))).toBe(frozen(B.createBattle(seededRandom(5))));
  });
  it("begins with side 0 laying its fleet: ship by ship, turned, or the rest by chance", () => {
    let s = B.createGame(seededRandom(9));
    expect([s.phase, s.fleets[0].length, s.fleets[1].length, s.turn]).toEqual(["place", 0, 5, 0]);
    // The carrier, across from A1; it cannot start where it would leave the chart.
    expect(B.play(s, to(6))).toBeNull();
    expect(B.play(s, to(100))).toBeNull();
    s = B.play(s, to(0))!;
    expect([s.fleets[0][0], s.phase, s.ply]).toEqual([{ name: "항공모함", cells: [0, 1, 2, 3, 4] }, "place", 0]);
    // The next ship may not cross it.
    expect(B.play(s, to(2))).toBeNull();
    s = B.play(s, to(B.TURN_SHIP))!;
    expect([s.across, s.fleets[0].length]).toEqual([false, 1]);
    expect(B.play(s, to(4))).toBeNull();
    s = B.play(s, to(10))!;
    expect(s.fleets[0][1]).toEqual({ name: "전함", cells: [10, 20, 30, 40] });
    // A cruiser of three cannot start on the ninth row going down.
    expect(B.play(s, to(80))).toBeNull();
    const before = JSON.stringify(s),
      ready = B.play(s, to(B.LAY_REST), seededRandom(3))!;
    expect(JSON.stringify(s)).toBe(before);
    expect([ready.phase, ready.fleets[0].length, new Set(ready.fleets[0].flatMap((ship) => ship.cells)).size]).toEqual(["battle", 5, 17]);
    expect(ready.fleets[0].slice(0, 2)).toEqual(s.fleets[0]);
    // In the battle the tools are gone and only the other waters can be fired at.
    expect(B.play(ready, to(B.TURN_SHIP))).toBeNull();
    expect(B.moves(ready).every((m) => m.to >= 100 && m.to < 200)).toBe(true);
    // Laid by hand to the end, the battle begins with the last ship.
    let hand = B.createGame(seededRandom(1));
    for (const bow of [0, 10, 20, 30, 40]) hand = B.play(hand, to(bow))!;
    expect([hand.phase, hand.fleets[0].map((ship) => ship.cells.length)]).toEqual(["battle", [5, 4, 3, 3, 2]]);
  });
  it("fires at the other side's waters only, once a square, and reports hits and sinkings", () => {
    let s = B.createBattle(seededRandom(2));
    const destroyer = s.fleets[1][4];
    expect(B.moves(s)).toHaveLength(100);
    expect(B.play(s, to(5))).toBeNull();
    s = B.play(s, to(100 + destroyer.cells[0]))!;
    expect([s.last, s.turn]).toEqual([{ point: 100 + destroyer.cells[0], hit: true, sunk: null }, 1]);
    // Side 1 misses somewhere in side 0's waters.
    const empty = Array.from({ length: 100 }, (_, c) => c).find((c) => !s.fleets[0].some((ship) => ship.cells.includes(c)))!;
    s = B.play(s, to(empty))!;
    expect(s.last).toEqual({ point: empty, hit: false, sunk: null });
    expect(B.play(s, to(100 + destroyer.cells[0]))).toBeNull();
    s = B.play(s, to(100 + destroyer.cells[1]))!;
    expect([s.last!.sunk, B.afloat(s, 1), B.afloat(s, 0)]).toEqual(["구축함", 4, 5]);
  });
  it("ends when a whole fleet is down", () => {
    let s = B.createBattle(seededRandom(3));
    const targets = s.fleets[1].flatMap((ship) => ship.cells),
      water = Array.from({ length: 100 }, (_, c) => c).filter((c) => !s.fleets[0].some((ship) => ship.cells.includes(c)));
    targets.forEach((cell, i) => {
      s = B.play(s, to(100 + cell))!;
      if (i < targets.length - 1) s = B.play(s, to(water[i]))!;
    });
    expect([s.winner, B.afloat(s, 1), B.moves(s)]).toEqual([0, 0, []]);
  });
  it("the computer fires only where it has not fired, follows up a hit, and wins without seeing the ships", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const random = seededRandom(7);
      let s = B.createBattle(seededRandom(11)),
        shots = 0;
      while (s.winner === null) {
        const before = frozen(s),
          move = B.aimShot(s, level, random)!;
        expect(frozen(s)).toBe(before);
        const next = B.play(s, move);
        expect(next).not.toBeNull();
        s = next!;
        shots++;
      }
      // Both sides shoot: at most every square of both charts.
      expect(shots).toBeLessThanOrEqual(200);
    }
    // After a hit with nothing sunk, the stronger levels fire beside it.
    let s = B.createBattle(seededRandom(4));
    const carrier = s.fleets[1][0];
    s = { ...B.play(s, to(100 + carrier.cells[2]))!, turn: 0 };
    for (const level of ["normal", "hard"] as const) {
      const shot = B.aimShot(s, level, seededRandom(1))!.to - 100,
        hit = carrier.cells[2];
      expect([1, 10]).toContain(Math.abs(shot - hit));
    }
    // Counting the placements, the hard level needs fewer shots than chance on average.
    const needed = (level: "easy" | "hard") => {
      let total = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const random = seededRandom(seed * 13);
        let g = B.createBattle(seededRandom(seed)),
          n = 0;
        while (g.winner === null) {
          g = { ...B.play(g, B.aimShot(g, level, random)!)!, turn: 0 };
          n++;
        }
        total += n;
      }
      return total / 12;
    };
    expect(needed("hard")).toBeLessThan(needed("easy") - 10);
    expect(needed("hard")).toBeLessThan(60);
  });
});
