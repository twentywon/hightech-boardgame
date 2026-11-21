import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as A from "../src/games/archery/rules";
import { setResult } from "../src/games/archery/result";
import * as T from "../src/games/pingpong/rules";
import { gameResult } from "../src/games/pingpong/result";
import { MISSED } from "../src/games/pingpong/sim";

describe("table tennis: a game of the match told over the table", () => {
  const point = (state: T.State, to: 0 | 1) => T.play(state, { from: -1, to, extra: MISSED })!;
  /** Plays points until one more would end the game, returning the state before and after the last one. */
  function game(state: T.State, to: 0 | 1, loser = 0): [T.State, T.State] {
    for (let k = 0; k < loser; k++) state = point(state, (1 - to) as 0 | 1);
    for (let k = 0; k < 10; k++) state = point(state, to);
    return [state, point(state, to)];
  }
  test("a game won, a game lost, nothing in the middle of a game", () => {
    let s = T.createGame(3, 11);
    const mid = point(s, 0);
    expect(gameResult(s, mid)).toBeNull();
    let [before, after] = game(s, 0, 3);
    expect(gameResult(before, after)).toEqual({ outcome: "win", word: "1게임 승리", detail: "11 : 3 · 게임 1 : 0" });
    s = after;
    [before, after] = game(s, 1, 7);
    expect(gameResult(before, after)).toEqual({ outcome: "lose", word: "2게임 패배", detail: "7 : 11 · 게임 1 : 1" });
  });
  test("a game won at deuce gives its full score", () => {
    let s = T.createGame(3, 11);
    for (let k = 0; k < 10; k++) s = point(point(s, 0), 1);
    s = point(point(s, 1), 0);
    s = point(s, 1);
    const won = point(s, 1);
    expect(gameResult(s, won)).toEqual({ outcome: "lose", word: "1게임 패배", detail: "11 : 13 · 게임 0 : 1" });
  });
  test("the game that ends the match is left to the finale", () => {
    let s = T.createGame(3, 11);
    s = game(s, 0)[1];
    const [before, after] = game(s, 0);
    expect(after.winner).toBe(0);
    expect(gameResult(before, after)).toBeNull();
  });
});

describe("archery: a set of the match told over the table", () => {
  const CALM: A.Wind = { speed: 0, dir: 0 };
  const calm = (s: A.State): A.State => ({ ...s, winds: s.winds.map(() => CALM) });
  const zone = (value: number) => (10 - value) * A.ZONE + A.ZONE / 2;
  const at = (x: number, y: number) => ({ from: -1, to: A.aimCode(x, y), extra: 0 });
  const shoot = (s: A.State, value: number) => A.play(calm(s), at(0, zone(value)))!;
  /** Shoots a set: my three values and theirs; returns the state before its last arrow and after it. */
  function set(s: A.State, mine: number[], theirs: number[]): [A.State, A.State] {
    const left = [[...mine], [...theirs]];
    for (let k = 0; k < 5; k++) s = shoot(s, left[s.turn].shift()!);
    return [s, shoot(s, left[s.turn].shift()!)];
  }
  test("a set won, lost or drawn against the computer; nothing mid-set", () => {
    let s = A.createGame("match", seededRandom(3));
    const one = shoot(s, 9);
    expect(setResult(s, one, "ai")).toBeNull();
    let [before, after] = set(s, [10, 9, 9], [9, 9, 9]);
    expect(setResult(before, after, "ai")).toEqual({ outcome: "win", word: "1세트 승리", detail: "28 : 27 · 세트점 2 : 0" });
    [before, after] = set(after, [8, 8, 8], [9, 9, 9]);
    expect(setResult(before, after, "ai")).toEqual({ outcome: "lose", word: "2세트 패배", detail: "24 : 27 · 세트점 2 : 2" });
    [before, after] = set(after, [9, 9, 9], [9, 9, 9]);
    expect(setResult(before, after, "ai")).toEqual({ outcome: "draw", word: "3세트 무승부", detail: "27 : 27 · 세트점 3 : 3" });
  });
  test("two at one screen: the colour that took the set, a draw stays a draw", () => {
    const s = A.createGame("match", seededRandom(4));
    let [before, after] = set(s, [7, 7, 7], [9, 9, 9]);
    expect(setResult(before, after, "local")).toEqual({ outcome: "win", word: "1세트 · 파랑", detail: "21 : 27 · 세트점 0 : 2" });
    [before, after] = set(after, [9, 9, 9], [8, 8, 8]);
    expect(setResult(before, after, "local")?.word).toBe("2세트 · 빨강");
    [before, after] = set(after, [9, 9, 9], [9, 9, 9]);
    expect(setResult(before, after, "local")).toMatchObject({ outcome: "draw", word: "3세트 무승부" });
  });
  test("the set that makes it 5 all says the shoot-off comes; the match's last end tells nothing", () => {
    let s = A.createGame("match", seededRandom(7));
    s = set(s, [10, 10, 10], [9, 9, 9])[1];
    s = set(s, [9, 9, 9], [10, 10, 10])[1];
    s = set(s, [9, 9, 9], [9, 9, 9])[1];
    s = set(s, [10, 10, 10], [9, 9, 9])[1];
    const [before, five] = set(s, [9, 9, 9], [10, 10, 10]);
    expect(five.shootOff).toBe(true);
    expect(setResult(before, five, "ai")).toEqual({ outcome: "lose", word: "5세트 패배", detail: "27 : 30 · 세트점 5 : 5 · 슛오프" });
    // Exactly as close: another arrow each, told as a tie.
    const first = A.play(calm(five), at(30, 40))!;
    expect(setResult(five, first, "ai")).toBeNull();
    const again = A.play(calm(first), at(-50, 0), seededRandom(8))!;
    expect(again.winner).toBeNull();
    expect(setResult(first, again, "ai")).toEqual({ outcome: "draw", word: "슛오프 동점", detail: "50.0mm : 50.0mm · 한 발씩 더" });
    // The shoot-off decided ends the match: the finale alone.
    const near = A.play(calm(five), at(0, 40))!,
      done = A.play(calm(near), at(-30, -30))!;
    expect(done.winner).toBe(0);
    expect(setResult(near, done, "ai")).toBeNull();
  });
  test("a set that wins the match is left to the finale; the solo rounds have no sets", () => {
    let s = A.createGame("match", seededRandom(5));
    for (let k = 0; k < 2; k++) s = set(s, [10, 10, 10], [5, 5, 5])[1];
    const [before, after] = set(s, [10, 10, 10], [5, 5, 5]);
    expect(after.winner).toBe(0);
    expect(setResult(before, after, "ai")).toBeNull();
    let alone = A.createGame("12", seededRandom(6));
    for (let k = 0; k < 5; k++) alone = shoot(alone, 9);
    const ended = shoot(alone, 9);
    expect(ended.history).toHaveLength(1);
    expect(setResult(alone, ended, "ai")).toBeNull();
  });
});
