import type { NetSpec } from "../../net/points";
import { playing, turned } from "../../net/hidden";
import { josa } from "../../core/josa";
import type { Move, PointGame } from "../points/types";
import { shuffle } from "../deck/cards";
import { aliases, blindOf, masksFor, realOf } from "../deck/blind";
import { JOKER, SEATS, finish, lay, next, oldMaid, play, source, type State } from "./rules";

/**
 * 도둑잡기 over one Wi-Fi (와이파이 여럿이, the user asked): two to four devices round the desks, one fan each, in the
 * room's seat order (1번, then 2번 at its left, and so on; seats 3 and 4 may be closed or the host's computer's); each
 * draws from the next seat that still holds cards, 1번 (the host's seat) first. The deal comes from the room's shared
 * seed (the "honest devices" of `src/net/hidden.ts`); each device is shown its own seat's view, in the first person as
 * against the computers: its fan held up at the bottom, the others' fans held by the students round the desks, and every
 * card it may not see a blind card (`deck/blind.ts`); a card drawn from another is a blind card picked, played in the
 * room's terms as the card it stands for. Every hand drawn from or into is shuffled (on one device mine is not: I see it
 * sorted). Whoever is left with the joker loses; everyone else is safe.
 */
type Net = NonNullable<State["net"]>;
const net = (s: State): Net => s.net ?? { masks: Array.from({ length: 53 }, (_, i) => i) };
const from = (k: number, seat: number) => (k - seat + SEATS) % SEATS;

/** A new game over Wi-Fi: the pack dealt round the seats taken only, pairs laid down. */
export function netCreate(seated: boolean[], random: () => number): State {
  const seats = playing(seated).filter((k) => k < SEATS),
    deck = shuffle([...Array.from({ length: 52 }, (_, i) => i), JOKER], random),
    hands: number[][] = Array.from({ length: SEATS }, () => []),
    pairs: number[] = [];
  deck.forEach((card, i) => hands[seats[i % seats.length]].push(card));
  for (let k = 0; k < SEATS; k++) {
    const { kept, laid } = lay(hands[k]);
    hands[k] = shuffle(kept, random);
    pairs.push(...laid);
  }
  return { ...finish({ hands, pairs, seat: seats[0] ?? 0, last: null, thief: null, winner: null, ply: 0 }), net: { masks: masksFor(53, random) } };
}
export function netPlay(s: State, move: Move, random: () => number, seat: number): State | null {
  if (s.seat !== seat || s.winner !== null) return null;
  // Every hand drawn from or into is shuffled: nobody's is kept in its order.
  return play(s, move, random, -1);
}
/** What a room's seat's device shows: its own fan, the pairs laid down; the others' cards blind until the end. */
export function netView(s: State, seat: number): State {
  const masks = net(s).masks,
    over = s.winner !== null,
    seen = new Set([...s.pairs, ...(over ? s.hands.flat() : s.hands[seat])]),
    see = (id: number) => (seen.has(id) ? id : blindOf(masks, id)),
    { net: _, ...rest } = s;
  return {
    ...rest,
    hands: turned(s.hands, seat).map((hand) => hand.map(see)),
    seat: from(s.seat, seat),
    last: s.last && { ...s.last, seat: from(s.last.seat, seat), from: from(s.last.from, seat), card: see(s.last.card) },
    thief: s.thief === null ? null : from(s.thief, seat),
    winner: over ? (s.thief === seat ? 1 : 0) : null,
    blinds: aliases(masks, seen),
  };
}
/** A card picked on a view (a blind one from the fan held out), in the room's terms. */
export const netMove = (move: Move, _seat: number, s: State): Move => ({ ...move, to: realOf(net(s).masks, move.to) });

const PEOPLE = ["나", "왼쪽 사람", "맞은편 사람", "오른쪽 사람"];
/** The game the screen plays the views with: words for people round the desks. */
const viewed: PointGame<State> = {
  ...oldMaid,
  hint: (s) => (s.seat === 0 ? `${PEOPLE[source(s, 0)]}의 카드 한 장을 뽑으세요.` : `${PEOPLE[s.seat]}${josa(PEOPLE[s.seat], "이", "가")} ${PEOPLE[source(s, s.seat)]}의 카드를 뽑는 중`),
  reason: (s) => (s.thief === 0 ? "조커가 내 손에 남았습니다. 내가 도둑입니다." : `${PEOPLE[s.thief ?? 1]}${josa(PEOPLE[s.thief ?? 1], "이", "가")} 조커를 들고 남았습니다.`),
};

const COLOURS = ["#c8321f", "#2f62c0", "#d9a521", "#3f9a5a"];
export const oldMaidNet: NetSpec<State> = {
  seats: () => ["1번", "2번", "3번", "4번"].map((label, i) => ({ label, color: COLOURS[i], kinds: i < 2 ? ["computer"] : ["computer", "closed"] })),
  create: (_variant, _options, seated, random) => netCreate(seated, random),
  play: netPlay,
  toMove: (s) => s.seat,
  // No one seat wins: the thief loses and every other seat is safe (`outcome`).
  winnerSeat: () => null,
  outcome: (s, seat) => (s.thief === null ? "draw" : s.thief === seat ? "lose" : "win"),
  hidden: {
    view: netView,
    move: netMove,
    // Side 1 of a view is whoever else is to move (the status line names the seat).
    seatOf: (s, side, seat) => (!side ? seat : s.seat !== seat ? s.seat : next(s, seat)),
    game: viewed,
  },
};
