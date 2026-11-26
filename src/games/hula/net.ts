import type { NetSpec } from "../../net/points";
import { playing, turned } from "../../net/hidden";
import type { Move, PointGame } from "../points/types";
import { aliases, blindOf, masksFor } from "../deck/blind";
import { SORT, PLACES, after, createGame, hula, maskOf, nameOf, play, type State } from "./rules";

/**
 * 훌라 over one Wi-Fi (와이파이 여럿이, the user asked): two to four devices round the camp table, one hand each, in the
 * room's seat order (1번, then 2번 at its left, and so on; seats 3 and 4 may be closed or the host's computer's). 1번
 * (the host's seat) begins the first round, and the winner of a round the next. The deal comes from the room's shared
 * seed (the "honest devices" of `src/net/hidden.ts`); each device is shown its own seat's view: the table turned so
 * that its hand is the near one, the next in play at its left, and every card it may not see (the others' hands, the
 * stock) a blind card (`deck/blind.ts`) until the round is over and the hands are shown. The blind numbers are dealt
 * again with every round, so that a card seen at the end of one says nothing in the next.
 *
 * Every choice is made on the device of the seat that makes it: drawing, 땡큐, 등록, 붙이기 and discarding on the
 * turn's device; a discard that others could claim out of turn is offered to them one at a time in the order of play
 * (the rules' `claim` phase), each on its own device (땡큐 or 패스), so no two can claim at once; 다음 판 on the host's.
 * The cards picked up before they are laid down, and the order the hand is sorted in, stay on the device (`local`):
 * the move sent names the cards. The rules end a round when the stock runs out (the lowest hand wins), so a round can
 * never stall on an empty stock.
 *
 * The room's state keeps the players in order of play (`net.seats`, the room's seat of each); a seat closed is not
 * dealt in at all.
 */
type Net = NonNullable<State["net"]>;
const net = (s: State): Net => s.net ?? { masks: Array.from({ length: 52 }, (_, i) => i), seats: s.hands.map((_, i) => i) };
/** The order each device sorts its own hand in (a device's own choice, never sent). */
const sorting = new Map<number, State["sortBy"]>();

/** A new match over Wi-Fi: the seated seats dealt in, in seat order; `variant` the rounds (1, 3 or 5). */
export function netCreate(variant: string, seated: boolean[], random: () => number): State {
  const seats = playing(seated),
    rounds = Number(variant) || 3,
    dealt = createGame(seats.length - 1, rounds, random);
  return { ...dealt, net: { masks: masksFor(52, random), seats } };
}
export function netPlay(s: State, move: Move, random: () => number, seat: number): State | null {
  const n = net(s);
  if (s.winner !== null || n.seats[s.seat] !== seat || move.from !== -1) return null;
  // The room's moves name their cards: a pick or a sort is a device's own (`local`).
  if (move.extra === -1 || move.to === SORT || (move.to >= 0 && move.to < 52)) return null;
  const next = play(s, move, random);
  if (!next) return null;
  // A new round dealt: the blind numbers dealt again.
  return next.round !== s.round ? { ...next, net: { ...n, masks: masksFor(52, random) } } : { ...next, net: n };
}
/** The people round the table as a device sees them, by their places. */
const PEOPLE = ["나", "왼쪽 사람", "맞은편 사람", "오른쪽 사람"];
/** The words said over a move, for a view (the room's words name the room's seats). */
function words(v: State): string[] {
  const l = v.last;
  if (!l) return [];
  const me = l.seat === 0,
    who = nameOf(v, l.seat),
    said = l.kind === "thank" ? [`${me ? "" : `${who} `}땡큐!`] : l.kind === "register" ? [`${me ? "" : `${who} `}등록!`] : l.kind === "attach" ? [me ? "붙이기!" : `${who} 붙이기`] : [];
  if (v.phase !== "scored" || !v.result) return said;
  const r = v.result;
  return [...said, r.hula ? "훌라!" : r.dry ? "더미가 떨어졌습니다" : `${nameOf(v, r.winner)} 승리`];
}
/** What a room's seat's device shows: its hand near, the others' and the stock blind until the round is over. */
export function netView(s: State, seat: number): State {
  const n = net(s),
    v = Math.max(0, n.seats.indexOf(seat)),
    count = s.players,
    at = (k: number) => (k - v + count) % count,
    shown = s.phase === "scored" || s.winner !== null,
    seen = new Set([...s.discard, ...s.melds.flatMap((m) => m.cards), ...(shown ? s.hands.flat() : s.hands[v])]),
    see = (id: number) => (seen.has(id) ? id : blindOf(n.masks, id)),
    best = Math.max(...s.scores),
    tops = s.scores.filter((x) => x === best).length,
    { net: _, ...rest } = s;
  const view: State = {
    ...rest,
    hands: turned(s.hands, v).map((hand) => hand.map(see)),
    stock: s.stock.map(see),
    melds: s.melds.map((m) => ({ ...m, owner: at(m.owner) })),
    seat: at(s.seat),
    claim: s.claim && { from: at(s.claim.from), queue: s.claim.queue.map(at) },
    picked: [],
    opened: turned(s.opened, v),
    sortBy: sorting.get(seat) ?? "suit",
    scores: turned(s.scores, v),
    result: s.result && { ...s.result, winner: at(s.result.winner), totals: turned(s.result.totals, v), gains: turned(s.result.gains, v) },
    last: s.last && { ...s.last, seat: at(s.last.seat), cards: s.last.cards.map(see) },
    winner: s.winner === null ? null : s.scores[v] === best ? (tops > 1 ? "draw" : 0) : 1,
    names: PLACES[count].map((place) => PEOPLE[place]),
    blinds: aliases(n.masks, seen),
    me: seat,
  };
  return { ...view, last: view.last && { ...view.last, events: words(view) } };
}
/** The game the screen plays the views with: people's words, and a 다음 판 that is the host's to press. */
const viewed: PointGame<State> = {
  ...hula,
  hint: (s) => (s.phase === "scored" && s.seat !== 0 ? hula.hint(s).replace("다음 판을 누르세요.", "방장이 다음 판을 누르면 이어집니다.") : hula.hint(s)),
};

/** The seats' colours, for the room's window. */
const COLOURS = ["#d2462f", "#26406a", "#d9a521", "#3f9a5a"];
/** The best score of a match over and how many hold it. */
const top = (s: State) => {
  const best = Math.max(...s.scores);
  return { best, tops: s.scores.filter((x) => x === best).length };
};
export const hulaNet: NetSpec<State> = {
  seats: () => ["1번", "2번", "3번", "4번"].map((label, i) => ({ label, color: COLOURS[i], kinds: i < 2 ? ["computer"] : ["computer", "closed"] })),
  create: (variant, _options, seated, random) => netCreate(variant, seated, random),
  play: netPlay,
  toMove: (s) => net(s).seats[s.seat],
  winnerSeat: (s) => {
    const { best, tops } = top(s);
    return s.winner === null || tops > 1 ? null : net(s).seats[s.scores.indexOf(best)];
  },
  outcome: (s, seat) => {
    const g = net(s).seats.indexOf(seat),
      { best, tops } = top(s);
    return g < 0 || s.scores[g] !== best ? "lose" : tops > 1 ? "draw" : "win";
  },
  hidden: {
    view: netView,
    // A move made with the cards picked on this device names them.
    move: (move, _seat, _state, shown) => (move.extra === -1 ? { ...move, extra: maskOf(shown?.picked ?? []) } : move),
    // Cards picked up and the hand sorted stay on the device.
    local: (shown, move) => {
      if (move.from !== -1 || move.extra !== -1 || !(move.to === SORT || (move.to >= 0 && move.to < 52))) return null;
      const next = play(shown, move);
      if (next && move.to === SORT && shown.me !== undefined) sorting.set(shown.me, next.sortBy);
      return next;
    },
    // Side 1 of a view is whoever else is to move; while a discard is offered, the one whose turn comes next (the
    // seat asked whether it claims is not named), and after a round the host, who deals the next.
    seatOf: (s, side, seat) => {
      const n = net(s),
        g = n.seats.indexOf(seat);
      if (!side) return seat;
      if (s.phase === "claim" && s.claim) return n.seats[after(s, s.claim.from)];
      if (s.phase === "scored") return n.seats[0];
      return s.seat !== g ? n.seats[s.seat] : n.seats[after(s, Math.max(0, g))];
    },
    waiting: (s) => (s.phase === "claim" ? "버린 카드를 땡큐할 사람이 있는지 묻는 중…" : s.phase === "scored" && s.winner === null ? "방장이 다음 판을 누르면 이어집니다." : null),
    game: viewed,
  },
};
