import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";
import { BLACK_JOKER, COLOUR_JOKER, isJoker, rankOf, red, shuffle, suitOf, SUIT_NAME } from "../deck/cards";

/**
 * One Card (원카드), the Korean game of the Crazy Eights family, for me and
 * the computer with 52 cards and two jokers. Seven are dealt each and one is
 * turned up. A card goes on the pile when it shares the top card's suit or
 * rank. Attacks: a 2 gives the other side two cards to draw, an ace three
 * (the ace of spades five), the black joker five and the coloured one seven;
 * the side attacked may pass it on with an attack card of the same suit or
 * rank, or a stronger one, instead of drawing. A 7 names the suit to follow;
 * a J, Q or K lets the same side play again. Whoever cannot or will not play
 * draws a card. The first with no cards wins; a hand of twenty is bankrupt.
 */
export const DRAW = 60,
  /** The suit named after a 7: four tools. */
  SUIT_BASE = 70,
  HAND = 7,
  BUST = 20;
export interface State {
  pile: number[];
  /** The discard pile, the top card last. */
  discard: number[];
  hands: [number[], number[]];
  turn: 0 | 1;
  /** `play`, or `suit` while the side that played a 7 names the suit. */
  phase: "play" | "suit";
  /** The suit to follow after a 7 (or null: the top card's own). */
  suit: number | null;
  /** Cards the side to move must draw unless it passes the attack on. */
  attack: number;
  last: { side: 0 | 1; played: number | null; drew: number[]; events: string[] } | null;
  winner: Winner;
  ply: number;
}
/** How many cards an attack card makes the other side draw (0 for a card that does not attack). */
export function power(id: number) {
  if (id === COLOUR_JOKER) return 7;
  if (id === BLACK_JOKER) return 5;
  const r = rankOf(id);
  if (r === 1) return suitOf(id) === 0 ? 5 : 3;
  return r === 2 ? 2 : 0;
}
const plain = (id: number) => !isJoker(id) && power(id) === 0 && ![7, 11, 12, 13].includes(rankOf(id));
export function createGame(random: Random = cryptoRandom): State {
  const deck = shuffle(Array.from({ length: 54 }, (_, i) => i), random),
    hands: [number[], number[]] = [deck.slice(0, HAND), deck.slice(HAND, 2 * HAND)];
  let pile = deck.slice(2 * HAND);
  // The card turned up to begin with is a plain one; others go back under the pile.
  let k = pile.length - 1;
  while (!plain(pile[k])) k--;
  const top = pile[k];
  pile = pile.filter((_, i) => i !== k);
  return { pile, discard: [top], hands, turn: 0, phase: "play", suit: null, attack: 0, last: null, winner: null, ply: 0 };
}
export const top = (s: State) => s.discard[s.discard.length - 1];
/** Whether a card may go on the pile now. */
export function playable(s: State, id: number) {
  const t = top(s);
  if (s.attack > 0) {
    // Only an attack passes an attack on: a joker, or an attack card of the top's suit or rank, or one at least as strong.
    if (!power(id)) return false;
    if (isJoker(id)) return true;
    if (isJoker(t)) return power(id) >= power(t);
    return suitOf(id) === suitOf(t) || rankOf(id) === rankOf(t) || power(id) >= power(t);
  }
  if (isJoker(id)) return true;
  // After a joker anything goes; after a 7 its named suit; else suit or rank.
  if (isJoker(t)) return s.suit === null || suitOf(id) === s.suit;
  if (s.suit !== null) return suitOf(id) === s.suit || rankOf(id) === 7;
  return suitOf(id) === suitOf(t) || rankOf(id) === rankOf(t);
}
export function moves(s: State): Move[] {
  if (s.winner !== null) return [];
  if (s.phase === "suit") return [0, 1, 2, 3].map((i) => ({ from: -1, to: SUIT_BASE + i, extra: -1 }));
  return [...s.hands[s.turn].filter((id) => playable(s, id)), DRAW].map((to) => ({ from: -1, to, extra: -1 }));
}
/** Draws `n` from the pile, turning the discards (but the top) over into a new pile when it runs out. */
function draw(s: State, side: 0 | 1, n: number, random: Random) {
  let pile = [...s.pile],
    discard = [...s.discard];
  const hand = [...s.hands[side]],
    drew: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!pile.length) {
      if (discard.length <= 1) break;
      pile = shuffle(discard.slice(0, -1), random);
      discard = discard.slice(-1);
    }
    const card = pile.pop()!;
    hand.push(card);
    drew.push(card);
  }
  const hands = [...s.hands] as [number[], number[]];
  hands[side] = hand;
  return { ...s, pile, discard, hands, drew };
}
export function play(s: State, move: Move, random: Random = cryptoRandom): State | null {
  if (s.winner !== null || move.extra !== -1 || move.from !== -1) return null;
  const side = s.turn,
    other = (1 - side) as 0 | 1;
  if (s.phase === "suit") {
    const suit = move.to - SUIT_BASE;
    if (suit < 0 || suit > 3) return null;
    return { ...s, suit, phase: "play", turn: other, ply: s.ply + 1, last: { side, played: null, drew: [], events: [`${SUIT_NAME[suit]}!`] } };
  }
  if (move.to === DRAW) {
    const n = Math.max(1, s.attack),
      drawn = draw(s, side, n, random),
      { drew, ...rest } = drawn,
      next: State = { ...rest, attack: 0, turn: other, ply: s.ply + 1, last: { side, played: null, drew, events: s.attack ? [`${drew.length}장 받기`] : [] } };
    // A hand of twenty is bankrupt.
    return next.hands[side].length >= BUST ? { ...next, winner: other } : next;
  }
  const id = move.to;
  if (!s.hands[side].includes(id) || !playable(s, id)) return null;
  const hands = [...s.hands] as [number[], number[]];
  hands[side] = hands[side].filter((c) => c !== id);
  const r = rankOf(id),
    events: string[] = [];
  let next: State = { ...s, hands, discard: [...s.discard, id], suit: null, ply: s.ply + 1, turn: other, attack: s.attack + power(id), last: { side, played: id, drew: [], events } };
  if (power(id)) events.push(`+${next.attack}`);
  if (hands[side].length === 0) return { ...next, winner: side };
  if (hands[side].length === 1) events.push("원카드!");
  if (r === 7 && !isJoker(id)) return { ...next, phase: "suit", turn: side };
  // A jack, queen or king: the same side plays again (with two at the table, jump and reverse come to the same).
  if (!isJoker(id) && r >= 11) {
    events.push(r === 11 ? "점프!" : r === 12 ? "방향 바꾸기!" : "한 번 더!");
    next = { ...next, turn: side };
  }
  return next;
}
/**
 * The computer's card, from its own hand, the pile's top and how many cards I hold: it passes attacks on when it
 * can, attacks harder when I am close to going out, keeps jokers for defence, and plays the suit it holds most of.
 */
export function chooseMove(s: State, level: Level, random: Random = Math.random): Move | null {
  const side = s.turn,
    hand = s.hands[side];
  if (s.phase === "suit") {
    const counts = [0, 1, 2, 3].map((suit) => hand.filter((c) => suitOf(c) === suit).length);
    return { from: -1, to: SUIT_BASE + counts.indexOf(Math.max(...counts)), extra: -1 };
  }
  const options = hand.filter((c) => playable(s, c));
  if (!options.length) return { from: -1, to: DRAW, extra: -1 };
  if (level === "easy" && random() < 0.4) return { from: -1, to: options[Math.floor(random() * options.length)], extra: -1 };
  const theirs = s.hands[1 - side].length,
    held = (suit: number) => hand.filter((c) => suitOf(c) === suit).length;
  let best = options[0],
    top = -Infinity;
  for (const c of options) {
    const score =
      (s.attack ? 50 - power(c) : 0) +
      (power(c) ? (theirs <= 2 ? 30 : 4) : 0) -
      (isJoker(c) && !s.attack ? 25 : 0) +
      (rankOf(c) >= 11 && !isJoker(c) ? 6 : 0) +
      (rankOf(c) === 7 ? -4 : 0) +
      held(suitOf(c)) * 1.5 +
      random() * 0.5;
    if (score > top) {
      top = score;
      best = c;
    }
  }
  return { from: -1, to: best, extra: -1 };
}
const effect = (): Effect | null => null;
export const oneCard: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  choose: (s, level, random) => chooseMove(s, level, random),
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, p) => s.hands[1 - p].length - s.hands[p].length,
  hint: (s) =>
    s.phase === "suit"
      ? s.turn === 0
        ? "7! 바꿀 무늬를 고르세요."
        : "컴퓨터가 무늬를 고르는 중"
      : s.turn === 1
        ? "컴퓨터 차례"
        : s.attack
          ? `공격을 받았습니다! 막을 카드를 내거나, 더미를 눌러 ${s.attack}장을 받으세요.`
          : s.suit !== null
            ? `${SUIT_NAME[s.suit]}로 바뀌었습니다. 낼 카드를 고르거나 더미에서 한 장 받으세요.`
            : "낼 카드를 고르거나 더미에서 한 장 받으세요.",
  tally: (s) => [0, 1].map((p) => `카드 ${s.hands[p].length}장`) as [string, string],
  reason: (s) => (s.hands[s.winner === 0 ? 1 : 0].length >= BUST ? `카드가 ${BUST}장이 되어 파산했습니다.` : "카드를 모두 냈습니다."),
};
/** Whether a card shows red, for the table. */
export const shownRed = red;
