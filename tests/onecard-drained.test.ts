import { describe, expect, test } from "vitest";
import { DRAW, createGame, play, type State } from "../src/games/onecard/rules";
import { netCreate, netPlay, netView, oneCardNet } from "../src/games/onecard/net";

const draw = { from: -1, to: DRAW, extra: -1 };
/** A table of four where every card is in a hand but the discard's top: nothing is left to draw, and nobody can follow it. */
function drained(): State {
  const s = createGame(() => 0.3),
    top = 0; // the ace of spades... any card: the hands hold the rest
  const rest = Array.from({ length: 54 }, (_, i) => i).filter((i) => i !== top),
    hands = [rest.slice(0, 13), rest.slice(13, 26), rest.slice(26, 40), rest.slice(40)];
  return { ...s, pile: [], discard: [top], hands, seat: 0, dir: 1, out: [false, false, false, false], attack: 0, suit: null, phase: "play" };
}

describe("one card: a pile run dry (the user found a Wi-Fi game stuck there)", () => {
  test("a draw that finds nothing passes the turn; once every seat still in has drawn nothing, the fewest cards win", () => {
    let s = drained();
    for (let k = 0; k < 3; k++) {
      s = play(s, draw)!;
      expect(s.winner).toBeNull();
      expect(s.dry).toBe(k + 1);
      expect(s.last?.events).toContain("받을 카드가 없습니다");
    }
    s = play(s, draw)!;
    expect(s.drained).toBe(true);
    // Seats 0 and 1 hold 13 each, 2 and 3 hold 14 and 13: the first of the fewest after the last drawer (seat 3) is 0.
    expect(s.champion).toBe(0);
    expect(s.winner).toBe(0);
  });
  test("a card played in between starts the count again", () => {
    let s = drained();
    s = play(s, draw)!;
    s = play(s, draw)!;
    expect(s.dry).toBe(2);
    // Seat 2 follows the top if it can; else the test lays one it can follow.
    const id = s.hands[2].find((c) => play(s, { from: -1, to: c, extra: -1 }));
    if (id !== undefined) {
      s = play(s, { from: -1, to: id, extra: -1 })!;
      expect(s.dry).toBe(0);
    }
  });
  test("over Wi-Fi the game ends too, and every device is told who won", () => {
    let r = 7;
    const random = () => ((r = (r * 9301 + 49297) % 233280) / 233280),
      base = netCreate([true, true, true, true], random);
    let s: State = { ...drained(), net: base.net };
    for (let k = 0; k < 4 && s.winner === null; k++) s = netPlay(s, draw, random, s.seat)!;
    expect(s.drained).toBe(true);
    expect(oneCardNet.winnerSeat!(s)).toBe(s.champion);
    for (let seat = 0; seat < 4; seat++) {
      const view = netView(s, seat);
      expect(view.winner).toBe(seat === s.champion ? 0 : 1);
      expect(oneCardNet.hidden!.game!.reason(view)).toContain("더미가 바닥나");
    }
  });
});
