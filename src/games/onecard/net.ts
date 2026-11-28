import type { NetSpec } from "../../net/points";
import { playing, turned } from "../../net/hidden";
import { josa } from "../../core/josa";
import type { Move, PointGame } from "../points/types";
import { aliases, blindOf, masksFor, remask } from "../deck/blind";
import { SEATS, createGame, onward, oneCard, play, type State } from "./rules";

/**
 * 원카드 over one Wi-Fi (와이파이 여럿이, the user asked): two to four devices round the bed, one hand each, in the room's
 * seat order (1번, then 2번 at its left, and so on; seats 3 and 4 may be closed or the host's computer's). 1번 (the
 * host's seat) plays first. The deal comes from the room's shared seed (the "honest devices" of `src/net/hidden.ts`);
 * each device is shown its own seat's view: the bed turned so that its hand is the near one (seat 0 of the game, as
 * against the computers), the next seat in play at its left, and every card it may not see (the others' hands, the
 * pile) a blind card (`deck/blind.ts`) until the game is over and the hands are shown.
 *
 * Over Wi-Fi a hand of twenty only takes that seat out (its cards go under the pile), whoever's it is; the first to
 * empty a hand wins, or the last left. A seat closed is out from the start, its cards under the pile.
 */
type Net = NonNullable<State["net"]>;
const net = (s: State): Net => s.net ?? { masks: Array.from({ length: 54 }, (_, i) => i) };
/** Where a room's seat sits as `seat` sees the bed (0 the near side). */
const from = (k: number, seat: number) => (k - seat + SEATS) % SEATS;

/** A new game over Wi-Fi: the deal as for four, the hands of seats closed put under the pile. */
export function netCreate(seated: boolean[], random: () => number): State {
  const dealt = createGame(random),
    on = Array.from({ length: SEATS }, (_, k) => playing(seated).includes(k));
  return {
    ...dealt,
    pile: [...dealt.hands.flatMap((hand, k) => (on[k] ? [] : hand)), ...dealt.pile],
    hands: dealt.hands.map((hand, k) => (on[k] ? hand : [])),
    out: on.map((o) => !o),
    net: { masks: masksFor(54, random) },
  };
}
/** A hand of twenty over Wi-Fi: the seat leaves the table, its cards under the pile; the last one left wins. */
export function netBust(s: State, side: number): State {
  const out = s.out.map((o, i) => o || i === side),
    next: State = {
      ...s,
      out,
      hands: s.hands.map((h, i) => (i === side ? [] : h)),
      pile: [...s.hands[side], ...s.pile],
      last: s.last && { ...s.last, events: [...s.last.events, `${side + 1}번 파산!`] },
    },
    left = out.flatMap((o, i) => (o ? [] : [i]));
  if (left.length <= 1) return { ...next, champion: left[0] ?? null, winner: 0 };
  return next.seat === side ? { ...next, seat: onward(next, side) } : next;
}
export function netPlay(s: State, move: Move, random: () => number, seat: number): State | null {
  if (s.seat !== seat || s.winner !== null) return null;
  const next = play(s, move, random, netBust);
  if (!next) return null;
  // The discards turned over into a new pile are out of everyone's sight: their blind numbers are dealt again.
  const turnedOver = next.pile.filter((id) => s.discard.includes(id));
  return turnedOver.length ? { ...next, net: { masks: remask(net(s).masks, turnedOver, random) } } : next;
}
/** What a room's seat's device shows: its hand near, the others' and the pile blind until the end. */
export function netView(s: State, seat: number): State {
  const masks = net(s).masks,
    over = s.winner !== null,
    hands = turned(s.hands, seat),
    seen = new Set([...s.discard, ...(over ? s.hands.flat() : s.hands[seat])]),
    see = (id: number) => (seen.has(id) ? id : blindOf(masks, id)),
    { net: _, ...rest } = s;
  return {
    ...rest,
    hands: hands.map((hand) => hand.map(see)),
    pile: s.pile.map(see),
    out: turned(s.out, seat),
    seat: from(s.seat, seat),
    last: s.last && { ...s.last, seat: from(s.last.seat, seat), drew: s.last.drew.map(see) },
    champion: s.champion === null ? null : from(s.champion, seat),
    winner: over ? (s.champion === seat ? 0 : 1) : null,
    blinds: aliases(masks, seen),
  };
}

/** The others as a person round the bed sees them. */
const PEOPLE = ["나", "왼쪽 사람", "맞은편 사람", "오른쪽 사람"];
const named = (k: number) => `${PEOPLE[k]}${josa(PEOPLE[k], "이", "가")}`;
/** The game the screen plays the views with: words for people round the bed. */
const viewed: PointGame<State> = {
  ...oneCard,
  hint: (s) => (s.seat === 0 ? oneCard.hint(s) : s.phase === "suit" ? `${named(s.seat)} 무늬를 고르는 중` : `${PEOPLE[s.seat]} 차례`),
  reason: (s) => {
    const c = s.champion;
    if (c === null) return "모두 파산했습니다.";
    if (s.drained) return c === 0 ? "더미가 바닥나 더 받을 카드가 없습니다. 카드가 가장 적은 내가 이겼습니다." : `더미가 바닥나 더 받을 카드가 없습니다. 카드가 가장 적은 ${named(c)} 이겼습니다.`;
    const emptied = s.hands[c].length === 0;
    if (c === 0) return emptied ? "카드를 모두 냈습니다." : "다른 사람이 모두 파산했습니다.";
    return emptied ? `${named(c)} 먼저 카드를 모두 냈습니다.` : `${PEOPLE[c]}만 남고 모두 파산했습니다.`;
  },
};

/** The seats' colours, for the room's window. */
const COLOURS = ["#c8321f", "#2f62c0", "#d9a521", "#3f9a5a"];
export const oneCardNet: NetSpec<State> = {
  seats: () => ["1번", "2번", "3번", "4번"].map((label, i) => ({ label, color: COLOURS[i], kinds: i < 2 ? ["computer"] : ["computer", "closed"] })),
  create: (_variant, _options, seated, random) => netCreate(seated, random),
  play: netPlay,
  toMove: (s) => s.seat,
  winnerSeat: (s) => s.champion,
  hidden: {
    view: netView,
    move: (move) => move,
    // Side 1 of a view is whoever else is to move (the status line names the seat).
    seatOf: (s, side, seat) => (!side ? seat : s.seat !== seat ? s.seat : onward(s, seat)),
    game: viewed,
  },
};
