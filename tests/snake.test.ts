import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as sn from "../src/games/snake/rules";

const tick = { from: -1, to: sn.TICK, extra: -1 },
  turn = (d: number) => ({ from: -1, to: sn.TURN + d, extra: -1 });
describe("snake", () => {
  test("the snake crawls a square a step, turns but never straight back, and two turns may wait", () => {
    const s = sn.createGame(1, seededRandom(1)),
      head = sn.xy(s.body[0]);
    const moved = sn.play(s, tick, seededRandom(2))!;
    expect(sn.xy(moved.body[0])).toEqual([head[0] + 1, head[1]]);
    expect(moved.body).toHaveLength(3);
    // Going right: left (straight back) and right (already so) are refused; up then left may both wait.
    expect(sn.play(moved, turn(3))).toBeNull();
    expect(sn.play(moved, turn(1))).toBeNull();
    const up = sn.play(moved, turn(0))!,
      both = sn.play(up, turn(3))!;
    expect(both.queue).toEqual([0, 3]);
    expect(sn.play(both, turn(0))).toBeNull();
    const a = sn.play(both, tick)!,
      b = sn.play(a, tick)!;
    expect(sn.xy(a.body[0])).toEqual([head[0] + 1, head[1] - 1]);
    expect(sn.xy(b.body[0])).toEqual([head[0], head[1] - 1]);
  });
  test("an apple makes it longer and comes up elsewhere; a golden one comes after every few apples", () => {
    let s = sn.createGame(1, seededRandom(3));
    const [hx, hy] = sn.xy(s.body[0]);
    s = { ...s, apple: sn.at(hx + 1, hy) };
    const ate = sn.play(s, tick, seededRandom(4))!;
    expect(ate.eaten).toBe(1);
    expect(ate.score).toBe(sn.APPLE);
    expect(ate.apple).not.toBe(s.apple);
    expect([...ate.body, ...ate.stones]).not.toContain(ate.apple);
    const grown = sn.play(ate, tick)!;
    expect(grown.body).toHaveLength(4);
    // The fifth apple brings up a golden one.
    const fifth = sn.play({ ...s, eaten: sn.GOLD_EVERY - 1 }, tick, seededRandom(5))!;
    expect(fifth.gold).not.toBeNull();
    expect(fifth.goldLeft).toBe(sn.GOLD_LIFE);
  });
  test("the fence, a stone or its own body ends the game; enough apples make it a win", () => {
    let s = sn.createGame(1, seededRandom(6));
    for (let n = 0; n < 40 && s.winner === null; n++) s = sn.play(s, tick)!;
    expect(s.winner).toBe(1);
    expect(s.last?.crashed).toBe(true);
    const fed = sn.createGame(1, seededRandom(6));
    let t = { ...fed, eaten: sn.GOAL };
    for (let n = 0; n < 40 && t.winner === null; n++) t = sn.play(t, tick)!;
    expect(t.winner).toBe(0);
    // Its own body: a long snake turned round on itself.
    const long = { ...fed, body: [sn.at(5, 5), sn.at(4, 5), sn.at(4, 6), sn.at(5, 6), sn.at(6, 6)], dir: 1, apple: sn.at(0, 0) },
      bit = sn.play(sn.play(long, turn(2))!, tick)!;
    expect(bit.winner).toBe(1);
    // Stones lie clear of where the snake starts, on every level.
    for (let lv = 1; lv <= sn.LEVELS.length; lv++) {
      const game = sn.createGame(lv, seededRandom(lv));
      expect(game.stones.filter((st) => game.body.includes(st) || game.apple === st)).toEqual([]);
    }
  });
});
