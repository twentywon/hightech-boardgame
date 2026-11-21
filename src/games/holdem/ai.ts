import { seededRandom, type Difficulty } from "../../core/ai";
import { createDeck, type Card } from "../blackjack/shoe";
import { contenders, pot } from "../cards/betting";
import { tempers } from "../cards/judgement";
import { evaluate } from "../poker/rules";
import type { Decision } from "../cards/game";
import { blindSeats, options, STEP, type Options, type State } from "./rules";

export type { Decision } from "../cards/game";
/**
 * Everything one seat may know when it acts: its own two cards, the board and what the betting has shown. Nothing
 * of the other seats' cards or the deck.
 */
export interface Sight {
  hole: Card[];
  board: Card[];
  choice: Options;
  /** Chips in the middle, this round's bets included. */
  pot: number;
  stack: number;
  /** What this seat has in front of it this round. */
  street: number;
  bigBlind: number;
  /** Seats still in the hand besides this one. */
  rivals: number;
  /** Seats that still speak after this one this round, 0 on the button. */
  after: number;
  /** Raises made this round. */
  raises: number;
  /** The highest bet of this round. */
  high: number;
  /** This seat bet or raised last in the round before (it may follow its bet up). */
  aggressor: boolean;
  /** Seats dealt in this hand. */
  dealt: number;
  /** This seat posted the big blind and nobody has raised: it checks for free. */
  option: boolean;
  /** What the betting says of each other seat still in. */
  ranges: Range[];
}
/** What a seat's betting tells of its two cards. */
export interface Range {
  /** The least Chen count its cards are taken to have: a raise before the flop speaks of a good start. */
  least: number;
  /** It bet or raised after the flop: its cards most likely meet the board (a pair or better, or a draw). */
  fits: boolean;
}
const VALUE: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };
export const value = (card: Card) => VALUE[card.rank] ?? Number(card.rank);
/** What the seat to act sees. */
export function sight(s: State): Sight | null {
  const t = s.table,
    me = t.turn,
    choice = options(t);
  if (!choice || me < 0) return null;
  const n = t.seats.length,
    live = contenders(t),
    seat = t.seats[me],
    [, big] = blindSeats(t, s.button),
    // The round ends with the big blind before the flop and with the button after it.
    last = s.street === 0 ? big : s.button;
  let after = 0;
  for (let i = me; i !== last; ) {
    i = (i + 1) % n;
    const other = t.seats[i];
    if (i !== me && !other.out && !other.folded && !other.allIn) after++;
  }
  return {
    hole: s.hands[me].map(({ rank, suit }) => ({ rank, suit })),
    board: s.board.map(({ rank, suit }) => ({ rank, suit })),
    choice,
    pot: pot(t),
    stack: seat.chips,
    street: seat.street,
    bigBlind: t.blinds[1],
    rivals: live.length - 1,
    after,
    raises: t.raises,
    high: t.high,
    aggressor: s.aggressor === me,
    dealt: t.seats.filter((x) => !x.out).length,
    option: s.street === 0 && me === big && t.high === t.blinds[1] && t.raises === 0,
    ranges: live
      .filter((i) => i !== me)
      .map((i) => {
        const other = t.seats[i];
        return {
          least: other.raised[0] >= 2 ? 9 : other.raised[0] === 1 ? 6 : -2,
          fits: s.street > 0 && (other.raised[1] >= 2 || ["베팅", "레이즈", "올인"].includes(other.last)),
        };
      }),
  };
}
/**
 * Preflop strength of two cards by Bill Chen's count: the higher card's points, doubled for a pair, two more when
 * suited, less for a gap between them, one more for close low cards. From -1 (7-2) to 20 (A-A).
 */
export function chen(hole: readonly Card[]) {
  const [a, b] = hole.map(value).sort((x, y) => y - x),
    points = (v: number) => (v === 14 ? 10 : v === 13 ? 8 : v === 12 ? 7 : v === 11 ? 6 : v / 2);
  if (a === b) return Math.max(5, points(a) * 2);
  let score = points(a);
  if (hole[0].suit === hole[1].suit) score += 2;
  const gap = a - b - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && a < 12) score += 1;
  return Math.ceil(score);
}
/** Four to a flush or an open-ended straight, using at least one of the hole cards. */
export function draws(hole: readonly Card[], board: readonly Card[]) {
  const all = [...hole, ...board];
  let flush = false;
  for (const suit of "SHDC")
    if (all.filter((c) => c.suit === suit).length === 4 && hole.some((c) => c.suit === suit)) flush = true;
  let mask = 0;
  for (const c of all) mask |= 1 << value(c);
  if (mask & (1 << 14)) mask |= 2;
  let straight = false;
  const mine = hole.reduce((m, c) => m | (1 << value(c)) | (value(c) === 14 ? 2 : 0), 0);
  // Four in a row that a card at either end would complete (2-5 up to 10-K), one of them mine.
  for (let low = 2; low <= 10; low++) {
    const run = 15 << low;
    if ((mask & run) === run && !(mask & (1 << (low - 1))) && !(mask & (1 << (low + 4))) && mine & run) straight = true;
  }
  return { flush, straight };
}
/** Whether two cards meet the board: a pocket pair, a pair with it, or a draw to a flush or a straight. */
export function meets(hole: readonly Card[], board: readonly Card[]) {
  if (hole[0].rank === hole[1].rank || hole.some((c) => board.some((b) => b.rank === c.rank))) return true;
  const { flush, straight } = draws(hole, board);
  return flush || straight;
}
/**
 * Chance of winning a showdown against the seats still in, by dealing the unseen cards at random `samples` times.
 * Each rival's two cards are drawn again (a few times at most) while they do not fit what its betting said, and a
 * hand that bet after the flop may still be a bluff now and then. A tie counts as a share.
 */
export function equity(
  hole: readonly Card[],
  board: readonly Card[],
  rivals: number | readonly Range[],
  samples: number,
  random: () => number,
) {
  const key = (c: Card) => c.rank + c.suit,
    known = new Set([...hole, ...board].map(key)),
    unseen = createDeck(1).filter((c) => !known.has(key(c))),
    ranges: readonly Range[] = typeof rivals === "number" ? Array.from({ length: rivals }, () => ({ least: -2, fits: false })) : rivals,
    fill = 5 - board.length,
    // The board's cards and two for each rival, then spares for the hands that are drawn again.
    need = Math.min(unseen.length, fill + ranges.length * 2 + 24);
  let score = 0;
  for (let n = 0; n < samples; n++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(random() * (unseen.length - i));
      [unseen[i], unseen[j]] = [unseen[j], unseen[i]];
    }
    const full = [...board, ...unseen.slice(0, fill)],
      mine = evaluate([...hole, ...full]).score;
    let best = -1,
      ties = 0,
      spare = fill + ranges.length * 2;
    ranges.forEach((range, r) => {
      let theirs = [unseen[fill + r * 2], unseen[fill + r * 2 + 1]];
      for (let tries = 0; tries < 6 && spare + 1 < need; tries++) {
        const fits =
          chen(theirs) >= range.least && (!range.fits || meets(theirs, board) || random() < 0.25);
        if (fits) break;
        theirs = [unseen[spare++], unseen[spare++]];
      }
      const score = evaluate([...theirs, ...full]).score;
      if (score > best) {
        best = score;
        ties = 1;
      } else if (score === best) ties++;
    });
    score += mine > best ? 1 : mine === best ? 1 / (ties + 1) : 0;
  }
  return score / samples;
}
const round = (chips: number) => Math.round(chips / STEP) * STEP;
/** A raise that puts in about `cost` now; one that would leave little behind goes all in (see `legal`). */
function sized(cost: number, choice: Options): Decision {
  if (choice.allIn !== null && cost >= choice.allIn * 0.85) return { action: "allIn" };
  return { action: "raise", amount: round(cost) };
}
/** Folds unless checking is free. */
const giveUp = (choice: Options): Decision => ({ action: choice.call === 0 ? "call" : "fold" });

/** Before the flop: by the starting hand, the price and how many still speak after this seat. */
function preflop(v: Sight, blur: number, bluff: number, random: () => number): Decision {
  const { choice, bigBlind } = v,
    late = v.after <= 1 ? 1.5 : v.after <= 2 ? 0.7 : 0,
    // Fewer players at the table make every hand worth more.
    short = (6 - Math.min(6, v.dealt)) * 0.55,
    strength = chen(v.hole) + (random() + random() - 1) * blur * 12 + late + short,
    blinds = v.stack / bigBlind,
    raised = v.high > bigBlind;
  // A short stack shoves or folds.
  if (blinds <= 10) {
    if (strength >= (raised ? 10 : 8)) return choice.allIn !== null ? { action: "allIn" } : { action: "call" };
    return giveUp(choice);
  }
  if (!raised) {
    if (strength >= 10 || (random() < bluff * 2 && late > 1)) {
      const limpers = Math.max(0, Math.round((v.pot - bigBlind * 1.5) / bigBlind));
      return sized(bigBlind * (3 + limpers) - v.street, choice);
    }
    if (strength >= 7 || v.option) return { action: "call" };
    // The small blind completes cheaply.
    if (choice.call <= bigBlind / 2 && strength >= 5) return { action: "call" };
    return giveUp(choice);
  }
  const price = choice.call / (v.pot + choice.call),
    heavy = choice.call >= v.stack * 0.4;
  if (strength >= 13.5 || (strength >= 12 && v.raises < 2)) {
    if (heavy || v.raises >= 2) return choice.allIn !== null ? { action: "allIn" } : { action: "call" };
    return sized(v.high * 3 - v.street, choice);
  }
  if (heavy) return strength >= 11 ? { action: "call" } : giveUp(choice);
  if (strength >= 9 && choice.call <= v.stack * 0.2) return { action: "call" };
  if (strength >= 7 && choice.call <= v.stack * 0.08 && price <= 0.34) return { action: "call" };
  return giveUp(choice);
}
/** After the flop: by the chance of winning against the seats still in, the price and the draws. */
function postflop(v: Sight, temper: (typeof tempers)[Difficulty], random: () => number, samples: number): Decision {
  const { choice } = v,
    raw = equity(v.hole, v.board, v.ranges, samples, random),
    read = Math.min(1, Math.max(0, raw + (random() + random() - 1) * temper.blur)),
    fair = 1 / (v.rivals + 1),
    // How far the hand stands above its even share: 0 is an average hand, 1 the nuts.
    power = (read - fair) / (1 - fair),
    { flush, straight } = v.board.length < 5 ? draws(v.hole, v.board) : { flush: false, straight: false },
    drawing = flush || straight,
    bluffing = random() < temper.bluff * (v.rivals === 1 ? 2.5 : 1),
    pressure = v.stack <= v.pot * 1.2;
  if (choice.call === 0) {
    if (power >= 0.62) {
      // Now and then a monster checks to trap.
      if (power >= 0.85 && random() < 0.15 && v.board.length < 5) return { action: "call" };
      if (pressure) return choice.allIn !== null ? { action: "allIn" } : sized(v.pot, choice);
      return sized(v.pot * (0.6 + random() * 0.4), choice);
    }
    if (power >= 0.3 && random() < 0.75) return sized(v.pot * (0.45 + random() * 0.25), choice);
    // A follow-up bet on the flop, a draw played fast, or a bluff.
    if ((v.aggressor && v.board.length === 3 && random() < 0.55 && v.rivals <= 2) || (drawing && random() < 0.35) || bluffing)
      return sized(v.pot * (0.5 + random() * 0.2), choice);
    return { action: "call" };
  }
  const price = choice.call / (v.pot + choice.call),
    // A large bet speaks of a strong hand: trust the reading a little less.
    doubt = Math.min(0.14, (choice.call / Math.max(v.pot, 1)) * 0.12) + (v.raises >= 2 ? 0.06 : 0),
    odds = read - doubt + (drawing ? 0.07 : 0);
  if (power >= 0.72 && v.raises < 3) {
    if (pressure || v.raises >= 2) return choice.allIn !== null ? { action: "allIn" } : { action: "call" };
    return sized(choice.call + (v.pot + choice.call) * (0.7 + random() * 0.3), choice);
  }
  if (power >= 0.45 && random() < 0.2 && v.raises < 2) return sized(choice.call + (v.pot + choice.call) * 0.6, choice);
  if (odds >= price * temper.price + 0.02) return { action: "call" };
  if (bluffing && drawing && v.raises < 2 && choice.raise !== null) return sized(choice.call + (v.pot + choice.call) * 0.7, choice);
  return { action: "fold" };
}
/**
 * The computer's betting choice for the seat to act: before the flop from its starting hand, after it from the
 * chance of winning with the board, both against the price of the call, with a little bluffing.
 */
export function decide(s: State, difficulty: Difficulty, seed: number, samples = 220): Decision {
  const v = sight(s);
  if (!v) return { action: "call" };
  const temper = tempers[difficulty],
    random = seededRandom(seed),
    choice = v.choice,
    pick = v.board.length === 0 ? preflop(v, temper.blur, temper.bluff, random) : postflop(v, temper, random, samples);
  return legal(pick, choice);
}
/** Makes a choice legal whatever it was: a raise within its bounds, no fold when checking is free. */
export function legal(pick: Decision, choice: Options): Decision {
  if (pick.action === "fold") return choice.call === 0 ? { action: "call" } : pick;
  if (pick.action === "allIn") return choice.allIn !== null ? pick : { action: "call" };
  if (pick.action === "raise") {
    if (choice.raise === null) return choice.allIn !== null && (pick.amount ?? 0) >= choice.allIn ? { action: "allIn" } : { action: "call" };
    const amount = Math.max(choice.raise, round(pick.amount ?? choice.raise));
    if (choice.allIn !== null && amount >= choice.allIn) return { action: "allIn" };
    return { action: "raise", amount };
  }
  return { action: "call" };
}
