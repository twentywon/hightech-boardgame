import type { NetSpec } from "../../net/points";
import { turned } from "../../net/hidden";
import { josa } from "../../core/josa";
import type { Move, PointGame } from "../points/types";
import { SEATS, createFor, onward, play, rRoulette, type State } from "./rules";

/**
 * 러시안 룰렛 over one Wi-Fi (와이파이 여럿이, the user asked): two to four devices round the party table, in the room's
 * seat order (1번, then 2번 at its left, and so on; seats 3 and 4 may be closed or the host's computer's). 1번 (the
 * host's seat) holds the toy first. Nothing is hidden, and nobody knows where the cap is: each pull is drawn from the
 * random the host salts as it takes the move (`NetSpec`), the same on every device and known to none beforehand.
 * Each device is shown the table turned so that it sits on the near side (seat 0 of the game), the next seat in play
 * at its left (the "hidden" view of `src/net/hidden.ts`, used here only to turn the table).
 */
/** Where a room's seat sits as `seat` sees the table (0 the near side). */
const from = (k: number, seat: number) => (k - seat + SEATS) % SEATS;

export function netPlay(s: State, move: Move, random: () => number, seat: number): State | null {
  if (s.seat !== seat || s.winner !== null) return null;
  return play(s, move, random);
}
/** What a room's seat's device shows: the table turned so that it sits near. */
export function netView(s: State, seat: number): State {
  return {
    ...s,
    seated: turned(s.seated, seat),
    out: turned(s.out, seat),
    spins: turned(s.spins, seat),
    seat: from(s.seat, seat),
    last: s.last && { ...s.last, seat: from(s.last.seat, seat) },
    champion: s.champion === null ? null : from(s.champion, seat),
    winner: s.winner === null ? null : s.champion === seat ? 0 : 1,
  };
}

const PEOPLE = ["나", "왼쪽 사람", "맞은편 사람", "오른쪽 사람"];
const named = (k: number) => `${PEOPLE[k]}${josa(PEOPLE[k], "이", "가")}`;
/** The game the screen plays the views with: words for people round the table. */
const viewed: PointGame<State> = {
  ...rRoulette,
  hint: (s) => (s.seat === 0 ? rRoulette.hint(s) : `${PEOPLE[s.seat]} 차례`),
  reason: (s) => (s.champion === null ? "모두 펑!" : s.champion === 0 ? "끝까지 펑을 피했습니다." : `${named(s.champion)} 끝까지 펑을 피했습니다.`),
};

/** The seats' colours, for the room's window (the party hats of the table). */
export const SEAT_COLORS = ["#e0453a", "#2f7fd8", "#f2b81f", "#3fae5a"];
export const rRouletteNet: NetSpec<State> = {
  seats: () => ["1번", "2번", "3번", "4번"].map((label, i) => ({ label, color: SEAT_COLORS[i], kinds: i < 2 ? ["computer"] : ["computer", "closed"] })),
  create: (_variant, options, seated, random) => createFor(seated, options, random),
  play: netPlay,
  toMove: (s) => s.seat,
  winnerSeat: (s) => s.champion,
  hidden: {
    view: netView,
    move: (move) => move,
    // Side 1 of a view is whoever else holds the toy (the status line names the seat).
    seatOf: (s, side, seat) => (!side ? seat : s.seat !== seat ? s.seat : onward(s, seat)),
    game: viewed,
  },
};
