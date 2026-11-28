import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as bg from "../src/games/backgammon/rules";

/*
 * Backgammon's doubling cube (variant "cube"): the plain game is untouched; with the cube the side to roll may offer
 * to double, the other takes (and owns the cube at twice the value) or drops (and loses the value as it stood); a
 * game won is worth the cube times 1, 2 or 3.
 */
const roll = { from: -1, to: bg.ROLL, extra: -1 };
const move = (to: number) => ({ from: -1, to, extra: -1 });

describe("backgammon without the cube", () => {
  test("the default variant lays exactly the old game and never offers a double", () => {
    const plain = bg.backgammon.create("");
    expect(plain).toEqual(bg.createGame());
    expect("cube" in plain).toBe(false);
    expect(bg.moves(plain)).toEqual([roll]);
    expect(bg.play(plain, move(bg.DOUBLE))).toBeNull();
    expect(bg.backgammon.turn(plain)).toBe(0);
  });
  test("a game against itself plays the same moves and draws the same chances as before the cube existed", () => {
    // The computer of the plain game asks nothing of its random about the cube: the same seed, the same game.
    const random = seededRandom(7),
      again = seededRandom(7);
    let a = bg.createGame(),
      b = bg.backgammon.create("");
    for (let n = 0; n < 400 && a.winner === null; n++) {
      a = bg.play(a, bg.chooseMove(a, "easy", random)!, random)!;
      b = bg.play(b, bg.chooseMove(b, "easy", again)!, again)!;
      expect(b).toEqual(a);
    }
  });
});

describe("backgammon with the doubling cube", () => {
  test("a double is offered before the throw, answered by the other side, and the cube changes hands", () => {
    const s = bg.createGame(bg.CUBE_VARIANT);
    expect(s.cube).toEqual({ value: 1, owner: null });
    expect(bg.moves(s)).toEqual([roll, move(bg.DOUBLE)]);
    const offered = bg.play(s, move(bg.DOUBLE))!;
    expect(offered.phase).toBe("answer");
    expect(offered.turn).toBe(0);
    // The side offered the cube is the one to move now, and it may only take or drop.
    expect(bg.backgammon.turn(offered)).toBe(1);
    expect(bg.moves(offered)).toEqual([move(bg.TAKE), move(bg.DROP)]);
    expect(bg.play(offered, roll)).toBeNull();
    expect(bg.backgammon.hint(offered)).toContain("더블 제안");
    const taken = bg.play(offered, move(bg.TAKE))!;
    expect(taken.cube).toEqual({ value: 2, owner: 1 });
    expect(taken.phase).toBe("roll");
    expect(bg.backgammon.turn(taken)).toBe(0);
    // White no longer owns the cube: it can only throw; red may redouble on its own turn.
    expect(bg.moves(taken)).toEqual([roll]);
    const redTurn = { ...taken, turn: 1 as const };
    expect(bg.moves(redTurn)).toEqual([roll, move(bg.DOUBLE)]);
    expect(bg.play(bg.play(redTurn, move(bg.DOUBLE))!, move(bg.TAKE))!.cube).toEqual({ value: 4, owner: 0 });
    expect(bg.backgammon.tally(taken)[1]).toContain("큐브 2");
  });
  test("a drop ends the game at the cube's value as it stood; the cube stops at 64", () => {
    const s = { ...bg.createGame(bg.CUBE_VARIANT), cube: { value: 4, owner: 1 as const }, turn: 1 as const },
      dropped = bg.play(bg.play(s, move(bg.DOUBLE))!, move(bg.DROP))!;
    expect(dropped.winner).toBe(1);
    expect(dropped.stake).toBe(4);
    expect(bg.moves(dropped)).toEqual([]);
    expect(bg.backgammon.reason(dropped)).toBe("더블을 받지 않아 4점으로 끝났습니다.");
    expect(bg.canDouble({ ...s, cube: { value: 64, owner: 1 } })).toBe(false);
  });
  test("a win counts the cube times single, gammon or backgammon", () => {
    // White bears off its last checker with double sixes; red has borne nothing off and still has a checker in white's home.
    const s: bg.State = { ...bg.createGame(bg.CUBE_VARIANT), cube: { value: 2, owner: 0 }, phase: "move", dice: [6, 6], left: [6, 6, 6, 6], off: [14, 0] };
    s.points = [new Array(24).fill(0), new Array(24).fill(0)];
    s.points[0][5] = 1;
    s.points[1][3] = 1;
    s.points[1][20] = 14;
    const won = bg.play(s, { from: 5, to: bg.OFF, extra: -1 })!;
    expect(won.winner).toBe(0);
    expect(won.stake).toBe(6);
    expect(bg.backgammon.reason(won)).toBe("백개먼! 큐브 2 × 3 = 6점.");
    const single = bg.play({ ...s, off: [14, 1] as [number, number], points: [s.points[0], s.points[1].map((n, p) => (p === 3 ? 0 : n))] as [number[], number[]] }, { from: 5, to: bg.OFF, extra: -1 })!;
    expect(single.stake).toBe(2);
  });
  test("the computer doubles a race it leads well, drops a hopeless one, takes a close one and keeps the cube when it trails", () => {
    const race = (mine: number, theirs: number): bg.State => {
      const s = { ...bg.createGame(bg.CUBE_VARIANT) };
      s.points = [new Array(24).fill(0), new Array(24).fill(0)];
      // White (to roll) in its home board, red in its own; the counts set the pips.
      s.points[0][5] = 15;
      s.points[1][23 - 5] = 15;
      s.off = [15 - mine, 15 - theirs];
      s.points[0][5] = mine;
      s.points[1][18] = theirs;
      return s;
    };
    const ahead = race(6, 12);
    expect(bg.racing(ahead)).toBe(true);
    expect(bg.winChance(ahead)).toBeGreaterThan(0.75);
    expect(bg.chooseMove(ahead, "normal")).toEqual(move(bg.DOUBLE));
    const offered = bg.play(ahead, move(bg.DOUBLE))!;
    expect(bg.chooseMove(offered, "normal")).toEqual(move(bg.DROP));
    const even = race(10, 10);
    expect(bg.chooseMove(even, "normal")).toEqual(roll);
    expect(bg.chooseMove(bg.play(even, move(bg.DOUBLE))!, "normal")).toEqual(move(bg.TAKE));
    const behind = race(12, 6);
    expect(bg.chooseMove(behind, "hard")).toEqual(roll);
    // At the opening the position is even: the computer takes and does not double.
    const start = bg.createGame(bg.CUBE_VARIANT);
    expect(bg.chooseMove(start, "normal")).toEqual(roll);
    expect(bg.chooseMove(bg.play(start, move(bg.DOUBLE))!, "normal")).toEqual(move(bg.TAKE));
  });
  test("games of the computer against itself with the cube end, the stake a multiple of the cube", () => {
    let doubled = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const random = seededRandom(seed);
      let s = bg.createGame(bg.CUBE_VARIANT);
      for (let n = 0; n < 4000 && s.winner === null; n++) {
        const m = bg.chooseMove(s, seed % 3 ? "normal" : "easy", random)!;
        expect(bg.moves(s).some((x) => x.from === m.from && x.to === m.to)).toBe(true);
        s = bg.play(s, m, random)!;
        expect(s).not.toBeNull();
      }
      expect(s.winner).not.toBeNull();
      const value = s.cube!.value;
      if (value > 1) doubled++;
      if (s.last?.cube === "drop") expect(s.stake).toBe(value);
      else {
        expect(s.off[s.winner as 0 | 1]).toBe(15);
        expect([1, 2, 3].map((k) => k * value)).toContain(s.stake);
      }
    }
    expect(doubled).toBeGreaterThan(4);
  });
});
