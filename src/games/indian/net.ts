import type { NetSpec } from "../../net/points";
import type { Move, PointGame } from "../points/types";
import { ROUNDS, createGame, indian, play, type State } from "./rules";

/**
 * 인디언 포커 over one Wi-Fi (와이파이 여럿이, the user asked): two devices across the table, each in the chair as against
 * the computer, the other player standing for the lay figure. The pack comes from the room's shared seed (the "honest
 * devices" of `src/net/hidden.ts`). This is the hidden game turned round: each device is shown the other's card on
 * the figure's forehead and never its own, until the round is shown (`view` leaves out exactly the seat's own card,
 * 0, and the order of the pack). Before the cards are raised both lie face down, so the other's is left out too.
 *
 * The one who bets first in a round raises the cards (이마에 얹기) and, once the round is shown, deals the next
 * (다음 판); the rest is played by whose turn it is. 1번 (the host's seat) bets first in the first round.
 */
/** The seat to move: the bettor whose turn it is, or the round's first bettor to raise the cards or deal the next. */
export const netToMove = (s: State) => (s.phase === "bet" ? s.turn : s.first);
export function netPlay(s: State, move: Move, _random: () => number, seat: number): State | null {
  if (s.winner !== null || netToMove(s) !== seat) return null;
  return play(s, move);
}
/** A round's outcome as `seat` reads it: 나 and the other told apart from its own side. */
function retell(result: string, seat: number) {
  return result.replace(/^(나|컴퓨터)(가|의)/, (_, who: string, ending: string) => {
    const mine = (who === "나") === (seat === 0);
    return ending === "가" ? (mine ? "내가" : "상대가") : mine ? "나의" : "상대의";
  });
}
const swap = <X>(pair: [X, X], seat: number): [X, X] => (seat ? [pair[1], pair[0]] : [pair[0], pair[1]]);
const side = (k: 0 | 1, seat: number) => (k === seat ? 0 : 1);
/** What a room's seat's device shows: its side near, its own card left out until the round is shown. */
export function netView(s: State, seat: number): State {
  const cards = swap(s.cards, seat),
    shown = s.phase === "show";
  return {
    ...s,
    // The pack's order is no one's to know; its size says how many rounds are left.
    deck: s.deck.map(() => 0),
    cards: [shown ? cards[0] : 0, s.phase === "ready" ? 0 : cards[1]],
    chips: swap(s.chips, seat),
    bets: swap(s.bets, seat),
    turn: s.phase === "bet" ? side(s.turn, seat) : netToMove(s) === seat ? 0 : 1,
    first: side(s.first, seat),
    folded: s.folded === null ? null : side(s.folded, seat),
    result: retell(s.result, seat),
    winner: s.winner === null || s.winner === "draw" ? s.winner : side(s.winner as 0 | 1, seat),
  };
}

/** The game the screen plays the views with: 상대 for 컴퓨터. */
const viewed: PointGame<State> = {
  ...indian,
  reason: (s) => indian.reason(s).replace("컴퓨터의", "상대의").replace("나의 칩", "내 칩"),
};

export function indianNet(colors: [string, string]): NetSpec<State> {
  return {
    seats: () => [
      { label: "1번", color: colors[0], kinds: ["computer"] },
      { label: "2번", color: colors[1], kinds: ["computer"] },
    ],
    create: (_variant, _options, _seated, random) => createGame(random),
    play: netPlay,
    toMove: netToMove,
    hidden: {
      view: netView,
      move: (move) => move,
      // While the other raises the cards or deals the next round, the round just shown stays told.
      waiting: (s, seat) => {
        if (s.winner !== null || netToMove(s) === seat) return null;
        if (s.phase === "ready") return `${s.round}/${ROUNDS}판 · 카드를 받았습니다. 상대가 카드를 이마에 얹기를 기다립니다.`;
        if (s.phase !== "show") return null;
        const v = netView(s, seat);
        return `${v.result} 내 카드 ${v.cards[0]}, 상대 카드 ${v.cards[1]}. 상대가 다음 판을 받기를 기다립니다.`;
      },
      game: viewed,
    },
  };
}
