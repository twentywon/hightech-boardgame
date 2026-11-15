import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import { BLACK_JOKER, rankOf, shuffle } from "../deck/cards";

/**
 * Old Maid (도둑잡기) for me and three computers, with 52 cards and one joker.
 * Every card is dealt and pairs of the same rank are laid down. In turn each
 * player draws a card unseen from the next player's hand and lays down any
 * pair it makes; a player with no cards left is safe. Whoever is left
 * holding the joker at the end is the thief and loses. Seats round the table:
 * 0 is me, 1 at my left, 2 across, 3 at my right; I draw from seat 1, seat 1
 * from seat 2, seat 2 from seat 3 and seat 3 from me (a seat that is out is
 * passed over).
 */
export const SEATS = 4,
  JOKER = BLACK_JOKER;
export interface State {
  hands: number[][];
  /** Pairs laid down, in order. */
  pairs: number[];
  /** Whose turn: the seat that draws. */
  seat: number;
  last: { seat: number; from: number; card: number; laid: number[] } | null;
  /** The seat left with the joker, once the game is over. */
  thief: number | null;
  winner: Winner;
  ply: number;
}
/** Lays down every pair a hand holds (the joker never pairs). */
function lay(hand: number[]) {
  const kept: number[] = [],
    laid: number[] = [];
  for (const card of hand) {
    const mate = kept.findIndex((k) => k !== JOKER && card !== JOKER && rankOf(k) === rankOf(card));
    if (mate >= 0) laid.push(kept.splice(mate, 1)[0], card);
    else kept.push(card);
  }
  return { kept, laid };
}
export function createGame(random: Random = cryptoRandom): State {
  const deck = shuffle([...Array.from({ length: 52 }, (_, i) => i), JOKER], random),
    hands: number[][] = Array.from({ length: SEATS }, () => []),
    pairs: number[] = [];
  deck.forEach((card, i) => hands[i % SEATS].push(card));
  for (let s = 0; s < SEATS; s++) {
    const { kept, laid } = lay(hands[s]);
    hands[s] = shuffle(kept, random);
    pairs.push(...laid);
  }
  return finish({ hands, pairs, seat: 0, last: null, thief: null, winner: null, ply: 0 });
}
/** The next seat after `seat` that still holds cards. */
export function next(s: Pick<State, "hands">, seat: number) {
  for (let k = 1; k <= SEATS; k++) {
    const t = (seat + k) % SEATS;
    if (s.hands[t].length) return t;
  }
  return seat;
}
/** The seat a player draws from. */
export const source = (s: Pick<State, "hands">, seat: number) => next(s, seat);
/** Ends the game once only the joker is left in play; else makes sure the seat to move holds cards. */
function finish(s: State): State {
  const holding = s.hands.flatMap((h, i) => (h.length ? [i] : []));
  if (holding.length <= 1) {
    const thief = holding[0] ?? s.hands.findIndex((h) => h.includes(JOKER));
    return { ...s, thief, winner: thief === 0 ? 1 : 0 };
  }
  return s.hands[s.seat].length ? s : { ...s, seat: next(s, s.seat) };
}
export function moves(s: State): Move[] {
  if (s.winner !== null) return [];
  return s.hands[source(s, s.seat)].map((card) => ({ from: -1, to: card, extra: -1 }));
}
export function play(s: State, move: Move, random: Random = cryptoRandom): State | null {
  if (s.winner !== null || move.extra !== -1 || move.from !== -1) return null;
  const from = source(s, s.seat);
  if (!s.hands[from].includes(move.to)) return null;
  const hands = s.hands.map((h) => [...h]);
  hands[from] = hands[from].filter((c) => c !== move.to);
  const { kept, laid } = lay([...hands[s.seat], move.to]);
  // A hand that has been drawn from is shuffled, so that nothing can be told from where a card sits.
  hands[s.seat] = s.seat === 0 ? kept : shuffle(kept, random);
  hands[from] = from === 0 ? hands[from] : shuffle(hands[from], random);
  return finish({ ...s, hands, pairs: [...s.pairs, ...laid], seat: next({ hands }, s.seat), last: { seat: s.seat, from, card: move.to, laid }, ply: s.ply + 1 });
}
/** A computer draws blind: any card of the hand it draws from. */
export function chooseMove(s: State, _level: string, random: Random = Math.random): Move | null {
  const options = moves(s);
  return options.length ? options[Math.floor(random() * options.length) % options.length] : null;
}
const effect = (): Effect | null => null;
const SEAT_NAME = ["나", "왼쪽 컴퓨터", "맞은편 컴퓨터", "오른쪽 컴퓨터"];
export const oldMaid: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  choose: (s, level, random) => chooseMove(s, level, random),
  turn: (s) => (s.seat === 0 ? 0 : 1),
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: () => 0,
  hint: (s) => (s.seat === 0 ? `${SEAT_NAME[source(s, 0)]}의 카드 한 장을 뽑으세요.` : `${SEAT_NAME[s.seat]}가 ${SEAT_NAME[source(s, s.seat)]}의 카드를 뽑는 중`),
  tally: (s) => [`카드 ${s.hands[0].length}장`, `카드 ${s.hands.slice(1).map((h) => h.length).join(" · ")}장`],
  reason: (s) => (s.thief === 0 ? "조커가 내 손에 남았습니다. 내가 도둑입니다." : `${SEAT_NAME[s.thief ?? 1]}가 조커를 들고 남았습니다.`),
};
export { SEAT_NAME };
