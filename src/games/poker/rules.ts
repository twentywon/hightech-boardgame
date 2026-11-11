import { cryptoRandom, type Random } from "../../core/random";
import { createDeck, shuffle, type Card } from "../blackjack/shoe";
import {
  ante,
  apply,
  cloneBetting,
  contenders,
  createSeat,
  openStreet,
  payout,
  pot,
  type Action,
  type Betting,
} from "../cards/betting";
export type { Action } from "../cards/betting";
export type { Card } from "../blackjack/shoe";

export const START_CHIPS = 1000;
export const ANTE = 10;
/** A card on the table: its deal order and whether it lies face up. */
export interface Dealt extends Card {
  id: number;
  up: boolean;
}
const VALUE: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };
const value = (card: Card) => VALUE[card.rank] ?? Number(card.rank);
export const CATEGORIES = [
  "하이카드",
  "원페어",
  "투페어",
  "트리플",
  "스트레이트",
  "플러시",
  "풀하우스",
  "포카드",
  "스트레이트 플러시",
  "로열 스트레이트 플러시",
] as const;
export interface Strength {
  /** Index into CATEGORIES. */
  category: number;
  /** Comparable across hands: category first, then the deciding ranks. */
  score: number;
  name: string;
}
const pack = (category: number, ranks: number[]) =>
  ranks.reduce((score, r) => score * 15 + r, category) * 15 ** (5 - ranks.length);
const make = (category: number, tiebreak: number[]): Strength => ({
  category,
  score: pack(category, tiebreak),
  name: CATEGORIES[category],
});
/** Highest card of a five-card run in a bit set of ranks; the ace also plays low. */
function runHigh(mask: number) {
  const low = mask | (mask & (1 << 14) ? 2 : 0);
  for (let high = 14; high >= 5; high--) if (((low >> (high - 4)) & 31) === 31) return high;
  return 0;
}
/** Ranks set in `mask`, highest first, at most `limit` of them. */
function top(mask: number, limit: number, skip = 0) {
  const ranks: number[] = [];
  for (let r = 14; r >= 2 && ranks.length < limit; r--)
    if (mask & (1 << r) && !(skip & (1 << r))) ranks.push(r);
  return ranks;
}
/**
 * Best five-card hand among `cards`. With fewer than five cards only pairs,
 * trips and quads count, which also ranks the cards a seat is showing.
 */
export function evaluate(cards: readonly Card[]): Strength {
  const count = new Uint8Array(15),
    suited: Record<string, number> = { S: 0, H: 0, D: 0, C: 0 },
    suitSize: Record<string, number> = { S: 0, H: 0, D: 0, C: 0 };
  let mask = 0;
  for (const card of cards) {
    const v = value(card);
    count[v]++;
    mask |= 1 << v;
    suited[card.suit] |= 1 << v;
    suitSize[card.suit]++;
  }
  // Ranks held four, three and two times, as bit sets.
  let quads = 0,
    trips = 0,
    pairs = 0;
  for (let r = 2; r <= 14; r++)
    if (count[r] === 4) quads |= 1 << r;
    else if (count[r] === 3) trips |= 1 << r;
    else if (count[r] === 2) pairs |= 1 << r;
  const full = cards.length >= 5;
  if (full)
    for (const suit of "SHDC")
      if (suitSize[suit] >= 5) {
        const high = runHigh(suited[suit]);
        if (high) return make(high === 14 ? 9 : 8, [high]);
      }
  if (quads) {
    const four = top(quads, 1)[0];
    return make(7, [four, ...top(mask, 1, 1 << four)]);
  }
  if (full && trips && (pairs || trips & (trips - 1))) {
    const three = top(trips, 1)[0];
    return make(6, [three, top(pairs | trips, 1, 1 << three)[0]]);
  }
  if (full) {
    for (const suit of "SHDC") if (suitSize[suit] >= 5) return make(5, top(suited[suit], 5));
    const high = runHigh(mask);
    if (high) return make(4, [high]);
  }
  if (trips) {
    const three = top(trips, 1)[0];
    return make(3, [three, ...top(mask, 2, 1 << three)]);
  }
  if (pairs & (pairs - 1)) {
    const two = top(pairs, 2);
    return make(2, [...two, ...top(mask, 1, (1 << two[0]) | (1 << two[1]))]);
  }
  if (pairs) {
    const pair = top(pairs, 1)[0];
    return make(1, [pair, ...top(mask, 3, 1 << pair)]);
  }
  return make(0, top(mask, 5));
}

export type Phase = "idle" | "betting" | "handOver" | "sessionOver";
export interface Result {
  /** Seats that took chips. */
  winners: number[];
  net: number[];
  /** Hands shown at the end, by seat; null for seats that folded or sat out. */
  shown: (string | null)[];
  reason: string;
}
export interface State {
  phase: Phase;
  betting: Betting;
  deck: Card[];
  hands: Dealt[][];
  /** Cards each seat in the hand holds: 3 to 7. */
  street: number;
  round: number;
  nextId: number;
  result: Result | null;
  won: boolean | null;
}
export function createSession(opponents = 3): State {
  return {
    phase: "idle",
    betting: {
      seats: Array.from({ length: opponents + 1 }, () => createSeat(START_CHIPS)),
      turn: -1,
      high: 0,
      raises: 0,
      ante: ANTE,
    },
    deck: [],
    hands: Array.from({ length: opponents + 1 }, () => []),
    street: 0,
    round: 0,
    nextId: 0,
    result: null,
    won: null,
  };
}
const clone = (s: State): State => ({
  ...s,
  betting: cloneBetting(s.betting),
  deck: s.deck.slice(),
  hands: s.hands.map((h) => h.slice()),
});
function dealRound(s: State, up: boolean) {
  for (const seat of contenders(s.betting))
    s.hands[seat].push({ ...s.deck.pop()!, id: s.nextId++, up });
}
/** The seat whose face-up cards rank highest opens the betting; ties go to the earlier seat. */
function opener(s: State) {
  let best = 0,
    bestScore = -1;
  for (const seat of contenders(s.betting)) {
    const score = evaluate(s.hands[seat].filter((c) => c.up)).score;
    if (score > bestScore) {
      bestScore = score;
      best = seat;
    }
  }
  return best;
}
function finish(s: State) {
  const b = s.betting,
    live = contenders(b),
    before = b.seats.map((seat) => seat.total),
    showdown = live.length > 1,
    strength = (seat: number) => (showdown ? evaluate(s.hands[seat]).score : 1),
    won = payout(b, strength);
  s.phase = "handOver";
  s.result = {
    winners: won.flatMap((w, i) => (w > 0 ? [i] : [])),
    net: won.map((w, i) => w - before[i]),
    shown: b.seats.map((_, i) => (showdown && live.includes(i) ? evaluate(s.hands[i]).name : null)),
    reason: showdown ? "족보 대결" : "모두 다이",
  };
  for (const seat of b.seats) seat.out = seat.chips <= 0;
  if (b.seats[0].out) {
    s.phase = "sessionOver";
    s.won = false;
  } else if (b.seats.slice(1).every((seat) => seat.out)) {
    s.phase = "sessionOver";
    s.won = true;
  }
}
/**
 * Moves on while no seat has to act: deals the next card and opens its
 * betting round, or ends the hand. With everyone all in the remaining cards
 * are dealt out in one go.
 */
function advance(s: State) {
  while (s.betting.turn === -1) {
    if (contenders(s.betting).length < 2 || s.street === 7) {
      finish(s);
      return;
    }
    s.street++;
    dealRound(s, s.street < 7);
    openStreet(s.betting, opener(s));
  }
}
/** Antes, shuffles and deals two cards down and one up to every seat. */
export function start(state: State, random: Random = cryptoRandom): State | null {
  if (state.phase !== "idle" && state.phase !== "handOver") return null;
  const s = clone(state);
  s.result = null;
  s.phase = "betting";
  s.round++;
  ante(s.betting);
  s.deck = shuffle(createDeck(1), random);
  s.hands = s.hands.map(() => []);
  dealRound(s, false);
  dealRound(s, false);
  dealRound(s, true);
  s.street = 3;
  openStreet(s.betting, opener(s));
  advance(s);
  return s;
}
/** One betting action by the seat to act. */
export function act(state: State, action: Action): State | null {
  if (state.phase !== "betting" || state.betting.turn < 0) return null;
  const s = clone(state);
  if (!apply(s.betting, action)) return null;
  advance(s);
  return s;
}
export const potOf = (state: State) => pot(state.betting);
