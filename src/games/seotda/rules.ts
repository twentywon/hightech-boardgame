import { cryptoRandom, type Random } from "../../core/random";
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

export const START_CHIPS = 1000;
export const ANTE = 10;
/** A hwatu card: its month (1–10) and whether it is the month's picture card. */
export interface Card {
  month: number;
  /** "gwang" for the bright cards of 1, 3 and 8; "yeol" for the animal cards. */
  kind: "gwang" | "yeol" | "plain";
}
export interface Dealt extends Card {
  id: number;
}
/** The twenty cards: two per month, one special and one plain (8 has two specials). */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (let month = 1; month <= 10; month++) {
    const gwang = month === 1 || month === 3 || month === 8;
    cards.push({ month, kind: gwang ? "gwang" : "yeol" });
    cards.push({ month, kind: month === 8 ? "yeol" : "plain" });
  }
  return cards;
}
export function shuffle<X>(cards: readonly X[], random: Random): X[] {
  const result = cards.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const r = random();
    if (!(r >= 0 && r < 1)) throw new RangeError("Random must be in [0, 1)");
    const j = Math.floor(r * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export type Special = "ttaengjabi" | "amhaeng" | "gusa" | "meonggusa";
export interface Rank {
  name: string;
  /** Strength when no special rule applies; higher wins. */
  score: number;
  special?: Special;
}
const GWANG38 = 3000,
  GWANG18 = 2900,
  GWANG13 = 2800,
  TTAENG = 2000,
  ALI = 1600;
const kkeut = (n: number) => ({
  name: n === 9 ? "갑오" : n === 0 ? "망통" : `${n}끗`,
  score: 100 + n * 10,
});
/** Names and ranks a two-card hand. */
export function rank(hand: readonly Card[]): Rank {
  const [a, b] = hand[0].month <= hand[1].month ? hand : [hand[1], hand[0]],
    pair = `${a.month}-${b.month}`,
    bothGwang = a.kind === "gwang" && b.kind === "gwang",
    bothYeol = a.kind === "yeol" && b.kind === "yeol";
  if (bothGwang && pair === "3-8") return { name: "38광땡", score: GWANG38 };
  if (bothGwang && pair === "1-8") return { name: "18광땡", score: GWANG18 };
  if (bothGwang && pair === "1-3") return { name: "13광땡", score: GWANG13 };
  if (a.month === b.month)
    return { name: a.month === 10 ? "장땡" : `${a.month}땡`, score: TTAENG + a.month * 10 };
  const named: Record<string, [string, number]> = {
    "1-2": ["알리", ALI],
    "1-4": ["독사", 1500],
    "1-9": ["구삥", 1400],
    "1-10": ["장삥", 1300],
    "4-10": ["장사", 1200],
    "4-6": ["세륙", 1100],
  };
  if (named[pair]) return { name: named[pair][0], score: named[pair][1] };
  const points = kkeut((a.month + b.month) % 10);
  if (pair === "3-7" && a.kind === "gwang" && b.kind === "yeol")
    return { name: "땡잡이", score: points.score, special: "ttaengjabi" };
  if (pair === "4-7" && bothYeol)
    return { name: "암행어사", score: points.score, special: "amhaeng" };
  if (pair === "4-9")
    return bothYeol
      ? { name: "멍텅구리구사", score: points.score, special: "meonggusa" }
      : { name: "구사", score: points.score, special: "gusa" };
  return points;
}
/**
 * Decides a showdown between the hands still in. Returns the strongest seats;
 * `voided` when a 구사 cancels the round, `rematch` then or when the best
 * hands are equal.
 * Special hands are judged against the plain strength of the other hands.
 */
export function showdown(hands: { seat: number; cards: readonly Card[] }[]) {
  const ranks = hands.map((h) => ({ seat: h.seat, rank: rank(h.cards) }));
  const others = (seat: number) =>
    Math.max(0, ...ranks.filter((r) => r.seat !== seat).map((r) => r.rank.score));
  const strength = new Map<number, number>();
  let voided = false;
  for (const { seat, rank: r } of ranks) {
    const best = others(seat);
    let value = r.score;
    // 땡잡이 beats 1땡–9땡; 암행어사 beats 13·18광땡.
    if (r.special === "ttaengjabi" && best > TTAENG && best < TTAENG + 100) value = TTAENG + 95;
    if (r.special === "amhaeng" && (best === GWANG13 || best === GWANG18)) value = GWANG18 + 50;
    // 구사 voids the round up to 알리, 멍텅구리구사 up to 9땡.
    if (r.special === "gusa" && best <= ALI) voided = true;
    if (r.special === "meonggusa" && best < TTAENG + 100) voided = true;
    strength.set(seat, value);
  }
  const top = Math.max(...strength.values()),
    winners = ranks.filter((r) => strength.get(r.seat) === top).map((r) => r.seat);
  return { strength, winners, voided, rematch: voided || winners.length > 1 };
}

export type Phase = "idle" | "betting" | "handOver" | "sessionOver";
export interface Result {
  /** Seats that took chips; empty when the round is replayed. */
  winners: number[];
  /** Chips each seat gained or lost over the hand. */
  net: number[];
  /** Seats that play the replay, when the pot stays on the table. */
  rematch: number[] | null;
  /** Hands shown at the end, by seat; null for seats that folded or sat out. */
  shown: (string | null)[];
  reason: string;
}
export interface State {
  phase: Phase;
  betting: Betting;
  deck: Card[];
  hands: Dealt[][];
  /** Seat that acts first; moves on each hand. */
  first: number;
  round: number;
  nextId: number;
  result: Result | null;
  /** Seat 0 lost every chip, or every computer did. */
  won: boolean | null;
}
export function createSession(opponents = 2): State {
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
    first: 0,
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
function dealTo(s: State, seats: number[], random: Random) {
  s.deck = shuffle(createDeck(), random);
  s.hands = s.hands.map(() => []);
  for (let card = 0; card < 2; card++)
    for (const seat of seats) s.hands[seat].push({ ...s.deck.pop()!, id: s.nextId++ });
}
/** Ends the hand: pays the pot or sets up a replay. */
function finish(s: State) {
  const b = s.betting,
    live = contenders(b),
    before = b.seats.map((seat) => seat.total);
  s.phase = "handOver";
  const shown = b.seats.map((_, i) =>
    live.length > 1 && live.includes(i) ? rank(s.hands[i]).name : null,
  );
  if (live.length === 1) {
    const won = payout(b, () => 1);
    s.result = {
      winners: live,
      net: won.map((w, i) => w - before[i]),
      rematch: null,
      shown,
      reason: "모두 다이",
    };
  } else {
    const verdict = showdown(live.map((seat) => ({ seat, cards: s.hands[seat] })));
    if (verdict.rematch) {
      // The pot stays; only the tied seats, or everyone after a 구사, play again.
      const again = verdict.voided ? live : verdict.winners;
      s.result = {
        winners: [],
        net: b.seats.map(() => 0),
        rematch: again,
        shown,
        reason: verdict.voided ? "구사 — 재경기" : "동점 — 재경기",
      };
      return;
    }
    const won = payout(b, (seat) => verdict.strength.get(seat) ?? 0);
    s.result = {
      winners: verdict.winners,
      net: won.map((w, i) => w - before[i]),
      rematch: null,
      shown,
      reason: "족보 대결",
    };
  }
  for (const seat of b.seats) seat.out = seat.chips <= 0;
  if (b.seats[0].out) {
    s.phase = "sessionOver";
    s.won = false;
  } else if (b.seats.slice(1).every((seat) => seat.out)) {
    s.phase = "sessionOver";
    s.won = true;
  }
}
/** Deals a new hand, or the replay of a voided one with the pot left in. */
export function start(state: State, random: Random = cryptoRandom): State | null {
  if (state.phase !== "idle" && state.phase !== "handOver") return null;
  const s = clone(state),
    b = s.betting,
    again = state.result?.rematch ?? null;
  s.result = null;
  s.phase = "betting";
  if (again) {
    // Seats outside the replay keep their chips in the pot as folded hands.
    b.seats.forEach((seat, i) => {
      if (!again.includes(i)) seat.folded = true;
    });
    dealTo(s, again, random);
  } else {
    s.round++;
    s.first = nextSeat(b, state.round === 0 ? 0 : state.first + 1);
    ante(b);
    dealTo(s, contenders(b), random);
  }
  openStreet(b, s.first);
  if (b.turn === -1) finish(s);
  return s;
}
function nextSeat(b: Betting, from: number) {
  for (let k = 0; k < b.seats.length; k++) {
    const i = (from + k) % b.seats.length;
    if (b.seats[i].chips > 0) return i;
  }
  return 0;
}
/** One betting action by the seat to act. */
export function act(state: State, action: Action): State | null {
  if (state.phase !== "betting" || state.betting.turn < 0) return null;
  const s = clone(state);
  if (!apply(s.betting, action)) return null;
  if (s.betting.turn === -1) finish(s);
  return s;
}
export const potOf = (state: State) => pot(state.betting);
