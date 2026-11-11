import { describe, expect, it } from "vitest";
import * as K from "../src/games/mancala/rules";
import * as D from "../src/games/dots/rules";
import * as X from "../src/games/hex/rules";
import * as C from "../src/games/checkers/rules";
import * as L from "../src/games/snakes/rules";
import * as S from "../src/games/spider/rules";
import * as T from "../src/games/tour/rules";
import { choose } from "../src/games/points/ai";
import type { Move, PointGame } from "../src/games/points/types";
import { seededRandom } from "../src/core/ai";

const to = (point: number): Move => ({ from: -1, to: point, extra: -1 });
const step = (from: number, target: number): Move => ({ from, to: target, extra: -1 });
const frozen = (s: unknown) => JSON.stringify(s);
const still = () => 0;
/** A Random that returns the given values in turn, then 0.5. */
const feed = (values: number[]) => {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.5);
};
/** Die values as random numbers. */
const die = (...faces: number[]) => feed(faces.map((f) => (f - 0.5) / 6));
function playout<S>(game: PointGame<S>, variant: string, seed: number, limit = 3000) {
  const random = seededRandom(seed);
  let s = game.create(variant),
    steps = 0;
  while (game.winner(s) === null) {
    const legal = game.moves(s);
    expect(legal.length).toBeGreaterThan(0);
    const next = game.play(s, legal[Math.floor(random() * legal.length)], random);
    expect(next).not.toBeNull();
    s = next!;
    expect(++steps).toBeLessThan(limit);
  }
  return s;
}

describe("Mancala", () => {
  it("sows anticlockwise, skips the other store and keeps the turn on its own store", () => {
    const s = K.createGame();
    // Pit 2 holds four: 3, 4, 5 and the store.
    const again = K.play(s, to(2))!;
    expect(again.board.slice(0, 7)).toEqual([4, 4, 0, 5, 5, 5, 1]);
    expect(again.turn).toBe(0);
    expect(again.sown).toEqual({ pit: 2, path: [3, 4, 5, 6], captured: [] });
    const around = K.createGame();
    around.board[5] = 9;
    const next = K.play(around, to(5))!;
    // 6, 7–12, then past store 13 to 0 and 1.
    expect(next.board[13]).toBe(0);
    expect(next.sown!.path).toEqual([6, 7, 8, 9, 10, 11, 12, 0, 1]);
    expect(next.turn).toBe(1);
  });
  it("captures the pit opposite when the last stone lands in an empty pit of its own", () => {
    const s = K.createGame();
    s.board = [1, 0, 4, 4, 4, 4, 0, 4, 4, 4, 4, 5, 4, 0];
    const next = K.play(s, to(0))!;
    // Pit 1 was empty; opposite is pit 11.
    expect([next.board[1], next.board[11], next.board[6]]).toEqual([0, 0, 6]);
    expect(next.sown!.captured).toEqual([1, 11]);
  });
  it("ends when a side is empty, refuses illegal moves and always finishes", () => {
    const s = K.createGame();
    s.board = [0, 0, 0, 0, 0, 1, 20, 3, 0, 0, 0, 0, 0, 10];
    const over = K.play(s, to(5))!;
    expect(over.board).toEqual([0, 0, 0, 0, 0, 0, 21, 0, 0, 0, 0, 0, 0, 13]);
    expect(over.winner).toBe(0);
    const start = K.createGame(),
      before = frozen(start);
    expect(K.play(start, to(7))).toBeNull();
    expect(K.play(start, to(6))).toBeNull();
    expect(K.play(start, step(0, 1))).toBeNull();
    choose(K.mancala, start, 0, 3, still);
    expect(frozen(start)).toBe(before);
    for (let seed = 1; seed <= 8; seed++) {
      const end = playout(K.mancala, "", seed);
      expect(end.board[6] + end.board[13]).toBe(48);
    }
  });
});

describe("Dots and boxes", () => {
  it("gives the box and another turn to whoever draws its fourth side", () => {
    let s = D.createGame("3");
    expect(D.sides(3, 0)).toEqual([0, 3, 12, 13]);
    for (const line of [0, 3, 12]) s = D.play(s, to(line))!;
    expect(s.turn).toBe(1);
    s = D.play(s, to(13))!;
    expect([s.boxes[0], s.turn, s.last]).toEqual([1, 1, { line: 13, closed: [0] }]);
    expect(D.play(s, to(13))).toBeNull();
  });
  it("one line can close two boxes; the game ends when every line is drawn", () => {
    let s = D.createGame("3");
    // Everything round boxes 0 and 1 except the line between them (13).
    for (const line of [0, 1, 3, 4, 12, 14]) s = D.play(s, to(line))!;
    const closing = D.play(s, to(13))!;
    expect(closing.last!.closed).toEqual([0, 1]);
    for (let seed = 1; seed <= 6; seed++) {
      const end = playout(D.dots, "3", seed);
      expect(D.count(end, 0) + D.count(end, 1)).toBe(9);
      expect(end.lines.every((l) => l !== null)).toBe(true);
    }
    expect(D.createGame("5").lines).toHaveLength(60);
    expect(D.createGame("7").boxes).toHaveLength(49);
  });
  it("the computer takes a box that is ready", () => {
    let s = D.createGame("3");
    for (const line of [0, 3, 12]) s = D.play(s, to(line))!;
    expect(choose(D.dots, s, 0, 2, still)).toEqual(to(13));
  });
});

describe("Hex", () => {
  it("measures how many cells each side still needs and ends when the edges meet", () => {
    let s = X.createGame("7");
    expect([X.distance(s, 0), X.distance(s, 1)]).toEqual([7, 7]);
    // Red fills column 3 from top to bottom; blue plays elsewhere.
    for (let r = 0; r < 7; r++) {
      s = X.play(s, to(r * 7 + 3))!;
      if (r < 6) {
        expect(s.winner).toBeNull();
        s = X.play(s, to(r * 7))!;
      }
    }
    expect(s.winner).toBe(0);
    expect(X.distance(s, 0)).toBe(0);
    expect(X.distance(s, 1)).toBe(Infinity);
    expect(X.moves(s)).toEqual([]);
  });
  it("touches six cells in the middle and fewer on the rim; no game is drawn", () => {
    expect(X.neighbours(7, 24).sort((a, b) => a - b)).toEqual([17, 18, 23, 25, 30, 31]);
    expect(X.neighbours(7, 0).sort((a, b) => a - b)).toEqual([1, 7]);
    for (const size of ["7", "9", "11"])
      for (let seed = 1; seed <= 3; seed++) expect(playout(X.hex, size, seed).winner).not.toBe("draw");
    const s = X.createGame("9"),
      before = frozen(s);
    expect(X.play(s, step(0, 1))).toBeNull();
    expect(X.play(X.play(s, to(4))!, to(4))).toBeNull();
    choose(X.hex, s, 0, 2, still);
    expect(frozen(s)).toBe(before);
  });
  it("the computer blocks a chain one cell from the edge", () => {
    const s = X.createGame("7");
    // Red holds column 3 down to row 5 and blue already stands on (6,2): only (6,3) completes it.
    for (let r = 0; r < 6; r++) s.cells[r * 7 + 3] = 0;
    s.cells[44] = 1;
    s.turn = 1;
    expect(choose(X.hex, s, 0, 2, still)).toEqual(to(45));
  });
});

describe("Checkers", () => {
  it("starts with twelve a side on dark squares and moves one step forward", () => {
    const s = C.createGame();
    expect([C.count(s, 0), C.count(s, 1)]).toEqual([12, 12]);
    expect(s.board[1]).toBe(1);
    expect(s.board[0]).toBeNull();
    expect(C.moves(s)).toHaveLength(7);
    expect(C.play(s, step(40, 33))!.board[33]).toBe(0);
    expect(C.play(s, step(40, 32))).toBeNull();
  });
  it("must capture, keeps jumping with the same piece and crowns on the far row", () => {
    const s = C.createGame();
    s.board = s.board.map(() => null);
    s.board[44] = 0;
    s.board[35] = 1;
    s.board[19] = 1;
    s.board[62] = 0;
    // 44 jumps 35 to 26, then 19 to 12.
    expect(C.moves(s)).toEqual([step(44, 26)]);
    let next = C.play(s, step(44, 26))!;
    expect([next.turn, next.must, next.board[35]]).toEqual([0, 26, null]);
    expect(C.moves(next)).toEqual([step(26, 12)]);
    next = C.play(next, step(26, 12))!;
    expect([next.winner, next.board[19]]).toEqual([0, null]);
    const crown = C.createGame();
    crown.board = crown.board.map(() => null);
    crown.board[10] = 0;
    crown.board[17] = 1;
    const king = C.play(crown, step(10, 1))!;
    expect(king.kings[1]).toBe(true);
    // A king steps backward too.
    const back = { ...king, turn: 0 as const };
    expect(C.moves(back).map((m) => m.to).sort((a, b) => a - b)).toEqual([8, 10]);
  });
  it("never changes its input and always ends", () => {
    const s = C.createGame(),
      before = frozen(s);
    choose(C.checkers, s, 0, 3, still);
    C.play(s, step(40, 33));
    expect(frozen(s)).toBe(before);
    for (let seed = 1; seed <= 6; seed++) playout(C.checkers, "", seed);
  });
});

describe("Snakes and ladders", () => {
  it("walks by the die, climbs ladders, slides down snakes and rolls again on a six", () => {
    let s = L.play(L.createGame(), to(0), die(3))!;
    expect(s.positions).toEqual([22, 0]);
    expect(s.roll).toEqual({ player: 0, die: 3, path: [1, 2, 3], slide: 22 });
    expect(s.turn).toBe(1);
    s = L.play(s, to(0), die(6))!;
    expect([s.positions[1], s.turn]).toEqual([6, 1]);
    const snake = L.createGame();
    snake.positions = [15, 0];
    expect(L.play(snake, to(0), die(2))!.positions[0]).toBe(4);
  });
  it("needs an exact roll to finish and always ends", () => {
    const s = L.createGame();
    s.positions = [97, 0];
    expect(L.play(s, to(0), die(5))!.positions[0]).toBe(97);
    const won = L.play(s, to(0), die(3))!;
    expect([won.positions[0], won.winner]).toEqual([100, 0]);
    expect(L.moves(won)).toEqual([]);
    expect(L.play(s, step(0, 0))).toBeNull();
    for (let seed = 1; seed <= 5; seed++) expect(playout(L.snakes, "", seed).positions).toContain(100);
    // No ladder or snake starts where another ends, and none starts on the last square.
    const ends = [...Object.values(L.LADDERS), ...Object.values(L.SNAKES)];
    for (const start of [...Object.keys(L.LADDERS), ...Object.keys(L.SNAKES)]) expect(ends).not.toContain(Number(start));
  });
});

describe("Spider solitaire", () => {
  const card = (rank: number, suit = 0, up = true): S.Card => ({ id: rank * 10 + suit, rank, suit, up });
  const table = (columns: S.Card[][], stock: S.Card[] = []): S.State => ({
    suits: 4,
    columns: [...columns, ...Array.from({ length: 10 - columns.length }, () => [card(1, 3)])],
    stock,
    done: [],
    moves: 0,
    won: false,
  });
  it("deals 54 cards with the last of each column face up and fifty in the stock", () => {
    for (const variant of ["1", "2", "4"]) {
      const s = S.createGame(variant, seededRandom(3));
      expect(s.columns.map((c) => c.length)).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
      expect(s.stock).toHaveLength(50);
      expect(s.columns.every((c) => c.every((x, i) => x.up === (i === c.length - 1)))).toBe(true);
      expect(new Set([...s.columns.flat(), ...s.stock].map((c) => c.suit)).size).toBe(Number(variant));
      expect(new Set([...s.columns.flat(), ...s.stock].map((c) => c.id)).size).toBe(104);
    }
  });
  it("moves a run of one suit onto the next rank of any suit, and turns the card under it", () => {
    const s = table([[card(9, 0, false), card(6, 1), card(5, 1)], [card(7, 2)], [card(6, 0), card(5, 1)]]);
    expect(S.movable(s, 0, 1)).toBe(true);
    expect(S.movable(s, 2, 0)).toBe(false);
    expect(S.movable(s, 0, 0)).toBe(false);
    expect(S.targets(s, 0, 1)).toEqual([1]);
    const next = S.move(s, 0, 1, 1)!;
    expect(next.columns[1].map((c) => c.rank)).toEqual([7, 6, 5]);
    expect(next.columns[0]).toEqual([card(9, 0, true)]);
    expect(S.move(s, 0, 1, 2)).toBeNull();
    expect(frozen(s)).toBe(frozen(table([[card(9, 0, false), card(6, 1), card(5, 1)], [card(7, 2)], [card(6, 0), card(5, 1)]])));
  });
  it("takes a complete run off the table and wins with eight", () => {
    const run = Array.from({ length: 12 }, (_, i) => card(13 - i, 2));
    const s = table([run, [card(1, 2)]]);
    s.done = [0, 0, 0, 0, 1, 1, 1];
    const next = S.move(s, 1, 0, 0)!;
    expect(next.columns[0]).toEqual([]);
    expect(next.done).toHaveLength(8);
    expect(next.won).toBe(true);
    expect(S.move(next, 2, 0, 0)).toBeNull();
  });
  it("deals a row only when no column is empty, and prefers its own suit for a tap", () => {
    const stock = Array.from({ length: 10 }, (_, i) => card(2, i % 4, false));
    const s = table([[card(5, 1)], [card(6, 2)], [card(6, 1)]], stock);
    expect(S.bestTarget(s, 0, 0)).toBe(2);
    const dealt = S.deal(s)!;
    expect(dealt.stock).toHaveLength(0);
    expect(dealt.columns.every((c) => c[c.length - 1].rank === 2 && c[c.length - 1].up)).toBe(true);
    const gap = table([[]], stock);
    expect(S.dealError(gap)).toBe("빈 줄이 있으면 새 카드를 돌릴 수 없습니다.");
    expect(S.deal(gap)).toBeNull();
    expect(S.stuck(table([[card(5, 1)]]))).toBe(true);
  });
});

describe("World tour", () => {
  const dice = (...faces: number[]) => die(...faces);
  it("lays out 32 spaces with cities whose fees rise with every building", () => {
    expect(T.SPACES).toHaveLength(32);
    expect(T.SPACES.filter((s) => s.kind === "city")).toHaveLength(23);
    const seoul = T.SPACES[31];
    expect([0, 1, 2, 3].map((level) => T.feeOf(seoul, level))).toEqual([90, 270, 590, 1130]);
    expect([1, 2, 3].map((level) => T.buildCost(seoul, level))).toEqual([230, 360, 540]);
  });
  it("offers a free city, sells it, and charges the next visitor", () => {
    let s = T.roll(T.createGame(2), dice(1, 2))!;
    expect([s.players[0].at, s.phase, s.path]).toEqual([3, "buy", [1, 2, 3]]);
    expect(T.roll(s, dice(1, 1))).toBeNull();
    s = T.decide(s, true)!;
    expect([s.owners[3], s.players[0].money, s.turn, s.phase]).toEqual([0, 1920, 1, "roll"]);
    s = T.roll(s, dice(2, 1))!;
    // Bangkok's fee on bare land is 20.
    expect([s.players[1].money, s.players[0].money, s.turn]).toEqual([1980, 1940, 0]);
    expect(T.decide(s, true)).toBeNull();
  });
  it("builds one level at a time on a return visit, and a double rolls again", () => {
    let s = T.createGame(2);
    s.owners[3] = 0;
    s.players[0].at = 1;
    s = T.roll(s, dice(1, 1))!;
    expect(s.phase).toBe("build");
    s = T.decide(s, true)!;
    expect([s.levels[3], s.players[0].money, s.turn]).toEqual([1, 2000 - 40, 0]);
    expect(s.note).toContain("집");
    const passed = T.decide({ ...T.roll(T.createGame(2), dice(1, 2))! }, false)!;
    expect([passed.owners[3], passed.turn]).toEqual([-1, 1]);
  });
  it("pays the salary past the start, taxes, waits out the storm and flies from the airport", () => {
    let s = T.createGame(2);
    s.players[0].at = 30;
    s = T.roll(s, dice(3, 4))!;
    // 30 → 5 passes the start (+200) and lands on the tax (−100).
    expect([s.players[0].at, s.players[0].money]).toEqual([5, 2100]);
    s = T.createGame(2);
    s.players[0].at = 5;
    s = T.roll(s, dice(1, 2))!;
    expect([s.players[0].at, s.players[0].wait, s.turn]).toEqual([8, 2, 1]);
    // The other traveller declines Jakarta; then the storm costs one of the two turns.
    s = T.roll(T.decide(T.roll(s, dice(1, 3))!, false)!, dice(2, 3))!;
    expect([s.players[0].at, s.players[0].wait]).toEqual([8, 1]);
    s = T.createGame(2);
    s.players[0].at = 20;
    s = T.roll(s, dice(1, 3))!;
    expect([s.players[0].at, s.players[0].money]).toEqual([0, 2200]);
  });
  it("sells cities to cover a debt, and the last traveller with money wins", () => {
    let s = T.createGame(2);
    s.owners[31] = 1;
    s.levels[31] = 3;
    s.owners[1] = 0;
    s.players[0].money = 100;
    s.players[0].at = 28;
    s = T.roll(s, dice(1, 2))!;
    // The fee is 1130: Hanoi is sold for 30 and it is still not enough.
    expect(s.players[0].out).toBe(true);
    expect(s.owners[1]).toBe(-1);
    expect([s.phase, s.winners]).toEqual(["over", [1]]);
    expect(s.players[1].money).toBe(2000 + 130);
  });
  it("never changes its input and ends by the last round at the latest", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const random = seededRandom(seed);
      let s = T.createGame(2 + (seed % 3)),
        steps = 0;
      while (s.phase !== "over") {
        const before = frozen(s),
          next = s.phase === "roll" ? T.roll(s, random) : T.decide(s, T.wants(s));
        expect(frozen(s)).toBe(before);
        expect(next).not.toBeNull();
        s = next!;
        expect(++steps).toBeLessThan(2000);
        expect(s.players.every((p) => p.money >= 0)).toBe(true);
      }
      expect(s.winners.length).toBeGreaterThan(0);
      expect(s.round).toBeLessThanOrEqual(T.ROUNDS + 1);
    }
  });
});
