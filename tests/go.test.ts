import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import { BUDGET, boardOf, chooseMove } from "../src/games/go/ai";
import { BLACK, Board, EMPTY, WHITE } from "../src/games/go/engine";
import { goConfig } from "../src/games/go/config";
import { BOARD_TOP, goSubject, pointAt, stoneLift } from "../src/games/go/layout";
import { KOMI, PASS, RESIGN, counting, createGame, koPoints, moves, play, reason, type Size, type State } from "../src/games/go/rules";

const at = (size: number, r: number, c: number) => r * size + c;
const point = (to: number) => ({ from: -1, to, extra: -1 });
/** Plays the points (row, column) in turn from a new game, black first; a null is a pass. */
function game(size: Size, moves: ([number, number] | null)[]) {
  let s = createGame(size);
  for (const m of moves) {
    const next = play(s, point(m ? at(size, m[0], m[1]) : PASS));
    if (!next) throw new Error(`refused: ${JSON.stringify(m)} at ply ${s.ply}`);
    s = next;
  }
  return s;
}
/** A position laid out from rows of "X" (black), "O" (white) and "." with `turn` to move. */
function position(rows: string[], turn: 0 | 1 = 0): State {
  const size = rows.length as Size,
    s = createGame(size);
  const cells = rows.join("").split("").map((ch) => (ch === "X" ? 0 : ch === "O" ? 1 : null));
  return { ...s, cells, turn, history: [cells.map((c) => (c === null ? "." : c === 0 ? "b" : "w")).join("")] };
}
/** A clock that moves on a millisecond each time it is read, so that a search runs the same way every time. */
function steps() {
  let t = 0;
  return () => t++;
}

describe("go rules", () => {
  test("a stone without liberties is taken and counted", () => {
    // White at (1,1), surrounded by black on four sides; the fourth black stone takes it.
    const s = game(9, [[0, 1], [1, 1], [1, 0], [8, 8], [1, 2], [8, 7], [2, 1]]);
    expect(s.cells[at(9, 1, 1)]).toBeNull();
    expect(s.captured).toEqual([1, 0]);
    expect(s.last).toEqual({ point: at(9, 2, 1), side: 0, removed: [at(9, 1, 1)] });
    expect(goConfig.game.effect(s)).toMatchObject({ kind: "place", to: at(9, 2, 1), removed: [at(9, 1, 1)] });
  });
  test("suicide is refused, but a move that takes something may fill its last liberty", () => {
    const s = position([
      ".O.......",
      "O........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
    ]);
    const before = JSON.stringify(s);
    expect(play(s, point(at(9, 0, 0)))).toBeNull();
    expect(moves(s).some((m) => m.to === at(9, 0, 0))).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
    // The same corner when the white stone beside it is in atari: black's stone takes it and lives.
    const capture = position([
      ".OX......",
      "OX.......",
      "X........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
    ]);
    const after = play(capture, point(at(9, 0, 0)))!;
    expect(after).not.toBeNull();
    expect(after.cells[at(9, 0, 1)]).toBeNull();
    expect(after.cells[at(9, 1, 0)]).toBeNull();
    expect(after.captured[0]).toBe(2);
  });
  test("a ko cannot be taken back at once, only after a move elsewhere", () => {
    // Black takes the white stone at (1,2) by playing (1,1)... laid out as the classic ko shape.
    const s = position([
      ".XO......",
      "X.XO.....",
      ".XO......",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
      ".........",
    ], 1);
    // White plays into the middle and takes the black stone at (1,2).
    const taken = play(s, point(at(9, 1, 1)))!;
    expect(taken.cells[at(9, 1, 2)]).toBeNull();
    expect(taken.captured[1]).toBe(1);
    // Black may not take back at once: that would bring the position back.
    expect(koPoints(taken)).toEqual([at(9, 1, 2)]);
    expect(play(taken, point(at(9, 1, 2)))).toBeNull();
    // After a move elsewhere and an answer, the ko may be taken.
    const away = play(play(taken, point(at(9, 7, 7)))!, point(at(9, 7, 1)))!;
    expect(koPoints(away)).toEqual([]);
    const back = play(away, point(at(9, 1, 2)))!;
    expect(back.cells[at(9, 1, 1)]).toBeNull();
    expect(back.captured[0]).toBe(1);
  });
  test("moves are the legal points, a pass and resigning; refused moves change nothing", () => {
    const s = createGame(9);
    const list = moves(s);
    expect(list).toHaveLength(81 + 2);
    expect(list.at(-2)!.to).toBe(PASS);
    expect(list.at(-1)!.to).toBe(RESIGN);
    const one = play(s, point(40))!;
    expect(play(one, point(40))).toBeNull();
    expect(play(one, { from: 3, to: 41, extra: -1 })).toBeNull();
    expect(one.cells.filter((c) => c !== null)).toHaveLength(1);
  });
  test("two passes end the game, and it is counted with territory, prisoners and komi", () => {
    // Black's wall down the fifth column, white's down the sixth; a white stone taken in the corner, and a white
    // stone left dead in black's area.
    const walls: [number, number][] = [];
    for (let r = 0; r < 9; r++) walls.push([r, 4], [r, 5]);
    const s = game(9, [...walls, [6, 2], [0, 0], [1, 0], [4, 2], [0, 1], null, null]);
    expect(s.winner).toBe(0);
    expect(s.dead).toEqual([at(9, 4, 2)]);
    expect(s.count).toEqual({ territory: [33, 27], prisoners: [2, 0], komi: KOMI, total: [35, 33.5] });
    expect(reason(s)).toMatch(/^흑 1\.5집 승\./);
    expect(s.area![at(9, 4, 2)]).toBe(0);
    expect(s.area![at(9, 0, 8)]).toBe(1);
    expect(moves(s)).toEqual([]);
    expect(goConfig.game.tally(s)).toEqual(["35집", "33.5집"]);
    // The same position is always counted the same way.
    expect(counting(s)).toEqual(counting(s));
  });
  test("an empty board passed out goes to white by komi", () => {
    const s = game(9, [null, null]);
    expect(s.winner).toBe(1);
    expect(reason(s)).toBe("백 6.5집 승. 흑 집 0 + 사석 0 = 0, 백 집 0 + 사석 0 + 덤 6.5 = 6.5.");
  });
  test("a group without eyes in the other's territory is dead; a group with two eyes lives", () => {
    const s = position([
      "...XO....",
      "...XO.OO.",
      "...XO.O.O",
      "XX.XOOOOO",
      ".X.XO....",
      "XX.XO.X..",
      "...XO....",
      "...XO....",
      "...XO....",
    ]);
    const { dead } = counting(s);
    // White's eyed group at the top right lives; black's lone stone in white's area is dead; black's small
    // group at the left, with its own eye, lives in black's area.
    expect(dead).toEqual([at(9, 5, 6)]);
  });
  test("resigning gives the game to the other side at once", () => {
    const s = play(play(createGame(13), point(84))!, point(RESIGN))!;
    expect(s.winner).toBe(0);
    expect(s.resigned).toBe(1);
    expect(reason(s)).toBe("흑 불계승. 백이 돌을 던졌습니다.");
    expect(goConfig.game.tally(s)).toEqual(["불계승", "기권"]);
  });
  test("the fast board takes stones as the rules do", () => {
    const random = seededRandom(9);
    for (const size of [9, 13] as const) {
      let s = createGame(size);
      const board = new Board(size);
      for (let k = 0; k < 160 && s.winner === null; k++) {
        const legal = moves(s).filter((m) => m.to < PASS);
        if (!legal.length) break;
        const m = legal[Math.floor(random() * legal.length)];
        const p = board.at(Math.floor(m.to / size), m.to % size),
          c = s.turn === 0 ? BLACK : WHITE;
        expect(board.legal(p, c) || p === board.ko).toBe(true);
        board.place(p, c);
        s = play(s, m)!;
        for (let i = 0; i < s.cells.length; i++) {
          const x = board.color[board.at(Math.floor(i / size), i % size)];
          expect(x === EMPTY ? null : x === BLACK ? 0 : 1).toBe(s.cells[i]);
        }
      }
    }
  });
});

describe("the go computer", () => {
  test("answers with a legal move within its time, on every board and level", () => {
    for (const size of [9, 13, 19] as const)
      for (const level of ["easy", "normal", "hard"] as const) {
        const s = game(size, [[2, 2], [size - 3, size - 3], [2, size - 3]]);
        const started = performance.now(),
          m = chooseMove(s, level, seededRandom(size));
        expect(performance.now() - started).toBeLessThan(BUDGET[level] + 150);
        expect(moves(s).some((x) => x.to === m.to)).toBe(true);
      }
  }, 30000);
  test("takes a stone in atari", () => {
    const s = position([
      ".........",
      ".........",
      "...X.....",
      "..XO.....",
      "...X.....",
      ".........",
      ".........",
      ".........",
      ".........",
    ]);
    expect(chooseMove(s, "normal", seededRandom(2), steps()).to).toBe(at(9, 3, 4));
  });
  test("passes when only its own eyes are left to fill", () => {
    const s = position([
      "XXXXOOOOO",
      "XXXXOOOOO",
      "X.XXOO.OO",
      "XXXXOOOOO",
      "XXXXOOOOO",
      "XXXXOOOOO",
      "X.XXOO.OO",
      "XXXXOOOOO",
      "XXXXOOOOO",
    ]);
    for (const turn of [0, 1] as const) expect(chooseMove({ ...s, turn }, "hard", seededRandom(3), steps()).to).toBe(PASS);
  });
  test("passes after the other side's pass when the count is in its favour", () => {
    const walls: [number, number][] = [];
    for (let r = 0; r < 9; r++) walls.push([r, 4], [r, 5]);
    // Black to move after white's pass, with the count at 35 to 33.5.
    const s = game(9, [...walls, [6, 2], [0, 0], [1, 0], [4, 2], [0, 1], null]);
    expect(chooseMove(s, "normal", seededRandom(4), steps()).to).toBe(PASS);
  });
  test("a game of computer against computer on nine lines comes to an end, and never fills its own eyes", () => {
    for (const seed of [1, 2]) {
      let s = createGame(9);
      const random = seededRandom(seed),
        clock = steps();
      while (s.winner === null && s.ply < 300) {
        const m = chooseMove(s, s.turn === 0 ? "easy" : "normal", random, clock);
        if (m.to < PASS) {
          const board = boardOf(s);
          expect(board.eye(board.at(Math.floor(m.to / 9), m.to % 9), s.turn === 0 ? BLACK : WHITE)).toBe(false);
        }
        const next = play(s, m);
        expect(next).not.toBeNull();
        s = next!;
      }
      expect(s.winner).not.toBeNull();
      expect(s.ply).toBeLessThan(250);
      expect(reason(s)).toMatch(/^(흑|백) (\d+(\.5)?집 승|불계승)\./);
    }
  }, 60000);
});

describe("go layout", () => {
  test("points lie on the board's face, a stone's middle above it, and the camera keeps the whole board", () => {
    for (const size of [9, 13, 19] as const) {
      const corner = pointAt(size, 0),
        last = pointAt(size, size * size - 1);
      expect(corner.y).toBe(BOARD_TOP);
      expect(corner.x).toBeCloseTo(-last.x);
      expect(corner.z).toBeLessThan(0);
      expect(stoneLift(size)).toBeGreaterThan(BOARD_TOP);
      const wide = goSubject(size, 1.6);
      expect(wide.half).toBeGreaterThan(-corner.x);
      expect(wide.halfZ).toBeGreaterThan(-corner.z);
    }
  });
});
