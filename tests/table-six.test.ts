import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as amz from "../src/games/amazons/rules";
import * as bg from "../src/games/backgammon/rules";
import * as one from "../src/games/onecard/rules";
import * as om from "../src/games/oldmaid/rules";
import * as oml from "../src/games/oldmaid/layout";
import * as cur from "../src/games/curling/rules";
import * as sb from "../src/games/starbattle/rules";
import { rankOf, suitOf } from "../src/games/deck/cards";

const card = (suit: number, rank: number) => suit * 13 + rank - 1;
describe("game of the amazons", () => {
  test("four amazons a side; a move lands like a queen and burns a square", () => {
    const s = amz.createGame();
    expect(s.board.filter((p) => p === 0)).toHaveLength(4);
    expect(s.board.filter((p) => p === 1)).toHaveLength(4);
    const m = amz.moves(s)[0],
      next = amz.play(s, m)!;
    expect(next.board[m.extra]).toBe(amz.BURNT);
    expect(next.board[m.to]).toBe(0);
    expect(next.turn).toBe(1);
    // An arrow may go back to the square the amazon left.
    expect(amz.moves(s).some((x) => x.extra === x.from)).toBe(true);
  });
  test("a side that cannot move loses, and the computer's moves are legal to the end", () => {
    const random = seededRandom(4);
    let s = amz.createGame();
    for (let n = 0; n < 120 && s.winner === null; n++) {
      const m = amz.chooseMove(s, "easy", random)!;
      s = amz.play(s, m)!;
      expect(s).not.toBeNull();
    }
    expect(s.winner).not.toBeNull();
    expect(amz.canMove(s.board, s.turn)).toBe(false);
  });
});
describe("backgammon", () => {
  test("fifteen checkers a side; doubles play four times; a blot hit goes to the bar and comes in first", () => {
    const s = bg.createGame();
    expect(s.points[0].reduce((a, b) => a + b, 0)).toBe(15);
    expect(bg.pips(s, 0)).toBe(167);
    const doubles = bg.play(s, { from: -1, to: bg.ROLL, extra: -1 }, () => 0.5)!;
    expect(doubles.left).toEqual([4, 4, 4, 4]);
    // A lone white checker on point 4; red's checker on point 0 lands on it with a 4.
    const blot = { ...bg.createGame(), phase: "move" as const, turn: 1 as const, left: [4, 2] };
    blot.points[0] = [...blot.points[0]];
    blot.points[0][5] = 4;
    blot.points[0][4] = 1;
    const hit = bg.play(blot, { from: 0, to: 4, extra: -1 })!;
    expect(hit.bar[0]).toBe(1);
    expect(hit.last!.hit).toBe(true);
    const back = { ...hit, turn: 0 as const, phase: "move" as const, left: [3, 5] };
    expect(bg.moves(back).every((m) => m.from === bg.BAR)).toBe(true);
  });
  test("games against itself end, with a gammon or backgammon counted", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const random = seededRandom(seed);
      let s = bg.createGame();
      for (let n = 0; n < 3000 && s.winner === null; n++) s = bg.play(s, bg.chooseMove(s, "normal", random)!, random)!;
      expect(s.winner).not.toBeNull();
      expect(s.off[s.winner as 0 | 1]).toBe(15);
      expect([1, 2, 3]).toContain(s.stake);
    }
  });
});
describe("one card", () => {
  test("four seats of seven and a plain card turned up; suit or rank goes on", () => {
    const s = one.createGame(seededRandom(2));
    expect(s.hands).toHaveLength(4);
    for (const hand of s.hands) expect(hand).toHaveLength(7);
    expect(s.seat).toBe(0);
    const top = one.top(s);
    expect(one.power(top)).toBe(0);
    for (const c of s.hands[0]) if (c < 52) expect(one.playable(s, c)).toBe(suitOf(c) === suitOf(top) || rankOf(c) === rankOf(top));
  });
  test("attacks fall on the next player and pass on; a 7 names the suit; J jumps, Q turns round, K plays again", () => {
    const base = { ...one.createGame(seededRandom(3)), discard: [card(1, 5)] };
    const four = (mine: number[], next: number[] = [card(3, 9)]) => ({ ...base, hands: [mine, next, [card(0, 4), card(3, 4)], [card(2, 9)]] });
    const a = one.play(four([card(1, 2), card(0, 9)], [card(2, 2), card(3, 9)]), { from: -1, to: card(1, 2), extra: -1 })!;
    expect(a.attack).toBe(2);
    expect(a.seat).toBe(1);
    expect(one.playable(a, card(2, 2))).toBe(true);
    expect(one.playable(a, card(3, 9))).toBe(false);
    const passed = one.play(a, { from: -1, to: card(2, 2), extra: -1 })!;
    expect(passed.attack).toBe(4);
    expect(passed.seat).toBe(2);
    const took = one.play(passed, { from: -1, to: one.DRAW, extra: -1 })!;
    expect(took.hands[2]).toHaveLength(6);
    expect(took.attack).toBe(0);
    expect(took.seat).toBe(3);
    const named = one.play(four([card(1, 7), card(0, 9)]), { from: -1, to: card(1, 7), extra: -1 })!;
    expect(named.phase).toBe("suit");
    expect(named.seat).toBe(0);
    const clubs = one.play(named, { from: -1, to: one.SUIT_BASE + 3, extra: -1 })!;
    expect(clubs.suit).toBe(3);
    expect(clubs.seat).toBe(1);
    expect(one.playable(clubs, card(3, 3))).toBe(true);
    expect(one.play(four([card(1, 11), card(0, 9)]), { from: -1, to: card(1, 11), extra: -1 })!.seat).toBe(2);
    const queen = one.play(four([card(1, 12), card(0, 9)]), { from: -1, to: card(1, 12), extra: -1 })!;
    expect(queen.dir).toBe(-1);
    expect(queen.seat).toBe(3);
    expect(one.play(four([card(1, 13), card(0, 9)]), { from: -1, to: card(1, 13), extra: -1 })!.seat).toBe(0);
  });
  test("a computer that reaches twenty leaves the game; mine loses it", () => {
    const base = one.createGame(seededRandom(4)),
      full = Array.from({ length: one.BUST - 1 }, (_, i) => i);
    const computer = one.play({ ...base, seat: 1, hands: [base.hands[0], full, base.hands[2], base.hands[3]], pile: [40, 41, 42] }, { from: -1, to: one.DRAW, extra: -1 })!;
    expect(computer.out[1]).toBe(true);
    expect(computer.hands[1]).toHaveLength(0);
    expect(computer.winner).toBeNull();
    expect(computer.seat).toBe(2);
    expect(one.onward(computer, 0)).toBe(2);
    const mine = one.play({ ...base, hands: [full, base.hands[1], base.hands[2], base.hands[3]], pile: [40, 41, 42] }, { from: -1, to: one.DRAW, extra: -1 })!;
    expect(mine.winner).toBe(1);
  });
  test("games of four end", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const random = seededRandom(seed);
      let s = one.createGame(random);
      for (let n = 0; n < 4000 && s.winner === null; n++) s = one.play(s, one.chooseMove(s, "normal", random)!, random)!;
      expect(s.winner).not.toBeNull();
    }
  });
});
describe("old maid", () => {
  test("every card dealt, pairs laid down at once, and the game ends with the joker in one hand", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const random = seededRandom(seed);
      let s = om.createGame(random);
      expect(s.hands.flat().length + s.pairs.length).toBe(53);
      // Four at the desks: I draw from my left, and the one at my right draws from me.
      expect(s.hands).toHaveLength(4);
      if (s.hands.every((h) => h.length)) {
        expect(om.source(s, 0)).toBe(1);
        expect(om.source(s, 3)).toBe(0);
      }
      for (const hand of s.hands) {
        const ranks = hand.filter((c) => c !== om.JOKER).map(rankOf);
        expect(new Set(ranks).size).toBe(ranks.length);
      }
      for (let n = 0; n < 500 && s.winner === null; n++) s = om.play(s, om.chooseMove(s, "normal", random)!, random)!;
      expect(s.winner).not.toBeNull();
      expect(s.hands[s.thief!]).toEqual([om.JOKER]);
      expect(s.winner).toBe(s.thief === 0 ? 1 : 0);
    }
  });
  test("no computer's cards ever turn their faces to my eyes, held before it or out to anyone", () => {
    for (let seat = 1; seat <= 3; seat++)
      for (const to of [null, 0, 1, 2, 3]) {
        if (to === seat) continue;
        const hold = oml.holdOf(seat, to);
        for (let i = 0; i < 8; i++) {
          const { centre } = oml.fanCard(hold, i, 8);
          expect(hold.n.dot(oml.OLDMAID.EYE.clone().sub(centre))).toBeLessThan(0);
        }
      }
  });
});
describe("curling", () => {
  test("a stone short of the hog line is taken off; strengths 11 to 15 stop in the house", () => {
    expect(cur.rest(cur.slide([], 0, 0, 3, 0), 0)).toHaveLength(0);
    for (const power of [11, 13, 15]) {
      const [stone] = cur.rest(cur.slide([], 0, 0, power, 0), 0);
      expect(Math.hypot(stone.x - cur.TEE, stone.z) - cur.R).toBeLessThan(cur.HOUSE);
    }
    // A turn makes it curl one way or the other.
    const [left] = cur.rest(cur.slide([], 0, 0, 13, 1), 0),
      [right] = cur.rest(cur.slide([], 0, 0, 13, 2), 0);
    expect(left.z).toBeLessThan(-0.2);
    expect(right.z).toBeGreaterThan(0.2);
  });
  test("the nearest stones score; a game of the ends chosen is played out", () => {
    const at = (id: number, x: number, z = 0) => ({ id, x, z, vx: 0, vz: 0, r: cur.R, m: 1, on: true });
    expect(cur.count([at(0, cur.TEE), at(1, cur.TEE + 0.5), at(4, cur.TEE + 0.8)])).toEqual([2, 0]);
    expect(cur.count([at(0, cur.TEE + 1), at(4, cur.TEE)])).toEqual([0, 1]);
    const random = seededRandom(6);
    let s = cur.createGame();
    expect(cur.play(s, { from: -1, to: cur.SPIN, extra: -1 })!.ply).toBe(0);
    for (let n = 0; n < 200 && s.winner === null; n++) s = cur.play(s, cur.chooseMove(s, "easy", random)!)!;
    expect(s.winner).not.toBeNull();
    expect(s.scores[0]).toHaveLength(3);
    // Five ends when chosen; anything else is the default three.
    let five = cur.curling.create("5");
    expect(five.ends).toBe(5);
    expect(cur.curling.create("x").ends).toBe(3);
    // Played out quickly with one plain shot (the computer's search is slow for forty stones).
    for (let n = 0; n < 300 && five.winner === null; n++) five = cur.play(five, cur.moves(five)[2])!;
    expect(five.scores[1]).toHaveLength(5);
  });
});
describe("star battle", () => {
  test("every laid puzzle has one answer, a star a row, column and region, none touching, and the hint finds it", () => {
    for (let stage = 1; stage <= sb.STAGES.length; stage++)
      for (let seed = 1; seed <= 4; seed++) {
        let s = sb.createGame(stage, seededRandom(seed * 17 + stage));
        const n = s.size;
        expect(sb.solutions(n, s.region)).toBe(1);
        expect(new Set(s.answer).size).toBe(n);
        expect(new Set(s.answer.map((c, r) => s.region[r * n + c])).size).toBe(n);
        s.answer.forEach((c, r) => r && expect(Math.abs(c - s.answer[r - 1])).toBeGreaterThan(1));
        for (let m = 0; m < 200 && s.winner === null; m++) s = sb.play(s, sb.hint(s)!)!;
        expect(s.winner).toBe(0);
      }
  });
  test("a tap goes star, dot, nothing; stars in each other's way clash", () => {
    const s = sb.createGame(1, seededRandom(2));
    let t = s;
    for (const mark of [sb.STAR, sb.DOT, sb.EMPTY]) {
      t = sb.play(t, { from: -1, to: 0, extra: -1 })!;
      expect(t.cells[0]).toBe(mark);
    }
    const cells = new Array(25).fill(0);
    cells[0] = cells[6] = sb.STAR;
    expect(sb.clashes({ size: 5, region: s.region, cells })[0]).toBe(true);
  });
});
