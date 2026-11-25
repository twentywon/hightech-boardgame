import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";
import { cardName, rankOf, shuffle, suitOf } from "../deck/cards";

/**
 * 훌라 (Hula), the Korean rummy, for me and one to three computers (the user asked), with the 52 cards of a plain pack
 * and no jokers. Seven are dealt each and one is turned up to begin the discard pile; the rest are the stock.
 *
 * A turn: draw the stock's top card, or take the discard pile's top card only to register it at once (땡큐); then
 * register melds from the hand (등록: three or four of one rank, three or more running in one suit, the ace low or
 * high but not round the corner; and a 7 may be laid alone, or with a second 7, or with its neighbour of its suit),
 * attach cards to any meld on the table (붙이기, anyone's: the meld must stay good), and end by discarding one card.
 * A card just discarded may be claimed out of turn by anyone who can register it at once (땡큐: the next player
 * takes it on its own turn; the others are asked in the order of play); the claimer then plays its turn, and play
 * goes on after it (those between are passed over).
 *
 * The first to empty its hand wins the round, and every other pays it its hand's total (A 1, 2–10 as marked, J Q K
 * 10). Going out on a turn begun with nothing registered is 훌라: it is paid double. When the stock runs out the
 * round ends and the lowest hand wins (fewer cards, then the earlier in play from the next player, if equal). The
 * match is `rounds` rounds; the highest score wins it.
 *
 * Points: a card of my hand (0–51) picks it up or puts it back; the tools below; a meld on the table, `MELD_BASE + i`,
 * attaches the cards picked to it. A move's `extra` is -1 for my picked cards, or (the computer's moves) the cards it
 * means as a mask, the sum of `2 ** id` (52 bits fit a double exactly).
 */
export const STOCK = 60,
  THANK = 61,
  REGISTER = 62,
  DISCARD = 63,
  PASS = 64,
  SORT = 65,
  NEXT = 66,
  /** The 붙이기 button: my picked cards attached to the first meld they fit. */
  ATTACH = 67,
  MELD_BASE = 100,
  HAND = 7;
/** Where each seat sits round the table for 2, 3 or 4 players: 0 my place (south), 1 west, 2 north, 3 east. */
export const PLACES: Record<number, number[]> = { 2: [0, 2], 3: [0, 1, 3], 4: [0, 1, 2, 3] };
export const PLACE_NAME = ["나", "왼쪽 컴퓨터", "맞은편 컴퓨터", "오른쪽 컴퓨터"];
export const nameOf = (s: Pick<State, "players">, seat: number) => PLACE_NAME[PLACES[s.players][seat]];
export interface Meld {
  owner: number;
  cards: number[];
}
export type Phase = "claim" | "draw" | "meld" | "scored";
export interface RoundResult {
  winner: number;
  hula: boolean;
  /** The stock ran out (the lowest hand won). */
  dry: boolean;
  totals: number[];
  gains: number[];
}
export interface State {
  players: number;
  stock: number[];
  /** The discard pile, the top card last. */
  discard: number[];
  hands: number[][];
  melds: Meld[];
  /** Who is to move: the turn's player, or (`claim`) the one asked whether it claims the card just discarded. */
  seat: number;
  phase: Phase;
  /** While a discard may be claimed: who discarded it, and who is still to be asked after `seat`. */
  claim: { from: number; queue: number[] } | null;
  /** My cards picked up to do something with together. */
  picked: number[];
  /** Whether each player has registered or attached anything this round. */
  opened: boolean[];
  /** Whether the player now playing its turn had, when the turn began (a 훌라 is going out on a turn begun without). */
  wasOpen: boolean;
  sortBy: "suit" | "rank";
  round: number;
  rounds: number;
  scores: number[];
  /** The round just ended, until the next is dealt. */
  result: RoundResult | null;
  last: { seat: number; kind: "draw" | "thank" | "register" | "attach" | "discard" | "pass" | "deal"; cards: number[]; events: string[] } | null;
  winner: Winner;
  ply: number;
}
/** What a card left in hand costs: A 1, 2–10 as marked, J Q K 10. */
export const valueOf = (id: number) => Math.min(10, rankOf(id));
export const totalOf = (hand: number[]) => hand.reduce((sum, id) => sum + valueOf(id), 0);
export const maskOf = (ids: readonly number[]) => ids.reduce((m, id) => m + 2 ** id, 0);
export function idsOf(mask: number) {
  const out: number[] = [];
  for (let id = 0; id < 52 && mask > 0; id++) if (Math.floor(mask / 2 ** id) % 2 === 1) out.push(id);
  return out;
}
/** Whether ranks (each once) run without a gap, the ace low (A 2 3) or high (Q K A), never round the corner. */
function running(ranks: number[]) {
  const go = (rs: number[]) => {
    const sorted = [...rs].sort((a, b) => a - b);
    return sorted.every((r, i) => i === 0 || r === sorted[i - 1] + 1);
  };
  return go(ranks) || (ranks.includes(1) && go(ranks.map((r) => (r === 1 ? 14 : r))));
}
/**
 * What cards make together: `set` (3–4 of a rank), `run` (3+ running in a suit), `seven` (a 7 alone, two 7s, or a 7
 * with its neighbour of its suit), or null.
 */
export function kindOf(cards: readonly number[]): "set" | "run" | "seven" | null {
  const n = cards.length;
  if (!n || new Set(cards).size !== n || cards.some((id) => id < 0 || id > 51)) return null;
  const ranks = cards.map(rankOf),
    suits = cards.map(suitOf),
    sameRank = ranks.every((r) => r === ranks[0]),
    sameSuit = suits.every((x) => x === suits[0]);
  if (n >= 3 && n <= 4 && sameRank) return "set";
  if (n >= 3 && sameSuit && running(ranks)) return "run";
  if (n <= 2 && ranks.includes(7) && (sameRank || (sameSuit && running(ranks)))) return "seven";
  return null;
}
export const valid = (cards: readonly number[]) => kindOf(cards) !== null;
/** A meld's cards in the order they lie: a run (or a 7 with its neighbour) up its suit, a set by suit. */
export function ordered(cards: readonly number[]) {
  const ranks = cards.map(rankOf),
    high = ranks.includes(1) && ranks.includes(13);
  const key = (id: number) => (kindOf(cards) === "set" || ranks.every((r) => r === ranks[0]) ? suitOf(id) : rankOf(id) === 1 && high ? 14 : rankOf(id));
  return [...cards].sort((a, b) => key(a) - key(b));
}
/** Whether `cards` may be attached to meld `i`. */
export const attachable = (s: State, i: number, cards: readonly number[]) => !!cards.length && !!s.melds[i] && valid([...s.melds[i].cards, ...cards]);
/** A hand in its order: by suit then rank, or by rank then suit. */
export function sortHand(hand: readonly number[], by: "suit" | "rank") {
  const key = (id: number) => (by === "suit" ? suitOf(id) * 13 + rankOf(id) : rankOf(id) * 4 + suitOf(id));
  return [...hand].sort((a, b) => key(a) - key(b));
}
/** The seat after `seat` in the order of play. */
export const after = (s: Pick<State, "players">, seat: number) => (seat + 1) % s.players;

function deal(players: number, rounds: number, round: number, scores: number[], first: number, sortBy: State["sortBy"], random: Random): State {
  const deck = shuffle(Array.from({ length: 52 }, (_, i) => i), random),
    hands = Array.from({ length: players }, (_, k) => deck.slice(k * HAND, (k + 1) * HAND)),
    rest = deck.slice(players * HAND);
  return {
    players,
    stock: rest.slice(1),
    discard: [rest[0]],
    hands,
    melds: [],
    seat: first,
    phase: "draw",
    claim: null,
    picked: [],
    opened: hands.map(() => false),
    wasOpen: false,
    sortBy,
    round,
    rounds,
    scores,
    result: null,
    last: { seat: first, kind: "deal", cards: [], events: [] },
    winner: null,
    ply: 0,
  };
}
/** A new match: me and `rivals` computers, `rounds` rounds; I begin the first. */
export function createGame(rivals = 3, rounds = 3, random: Random = cryptoRandom): State {
  const players = Math.max(2, Math.min(4, Math.round(rivals) + 1)),
    n = [1, 3, 5].includes(rounds) ? rounds : 3;
  return deal(players, n, 1, Array(players).fill(0), 0, "suit", random);
}
const top = (s: State) => s.discard[s.discard.length - 1];
/**
 * The ways `seat` may register `card` at once: the cards of its hand to lay with it (as a mask), or 0 for the card
 * alone (attached to the first meld it fits, or a 7 laid by itself).
 */
export function claims(s: State, seat: number, card = top(s)): number[] {
  if (card === undefined) return [];
  const hand = s.hands[seat],
    out = new Set<number>(),
    r = rankOf(card),
    suit = suitOf(card);
  if (r === 7 || s.melds.some((_, i) => attachable(s, i, [card]))) out.add(0);
  // Sets of three or four with it.
  const same = hand.filter((id) => rankOf(id) === r);
  for (const k of [2, 3]) if (same.length >= k) for (const group of combos(same, k)) out.add(maskOf(group));
  // Runs through it: every stretch of its suit that holds it (the ace low or high).
  const at = (rank: number) => hand.find((id) => suitOf(id) === suit && rankOf(id) === (rank === 14 ? 1 : rank)),
    mine = (rank: number) => rank === r || (r === 1 && rank === 14);
  for (let low = 1; low <= 12; low++)
    for (let high = low + 2; high <= 14; high++) {
      if (low === 1 && high === 14) continue;
      const ranks = Array.from({ length: high - low + 1 }, (_, k) => low + k);
      if (ranks.filter(mine).length !== 1) continue;
      const others = ranks.filter((x) => !mine(x)).map(at);
      if (others.every((id) => id !== undefined)) out.add(maskOf(others as number[]));
    }
  // A 7 with another 7 or its neighbour; a neighbour of a 7 in hand with that 7.
  for (const id of hand) if (valid([id, card])) out.add(maskOf([id]));
  return [...out];
}
function combos<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return items.flatMap((x, i) => combos(items.slice(i + 1), k - 1).map((rest) => [x, ...rest]));
}
/** Whether `seat` may claim the top of the discard pile now. */
export const canClaim = (s: State, seat: number) => claims(s, seat).length > 0;
/** Every meld `seat` might register from its hand: sets, runs and 7s. */
export function meldsIn(hand: readonly number[]): number[][] {
  const out: number[][] = [];
  for (let r = 1; r <= 13; r++) {
    const same = hand.filter((id) => rankOf(id) === r);
    if (same.length >= 3) for (const k of [3, 4]) if (same.length >= k) out.push(...combos(same, k));
  }
  for (let suit = 0; suit < 4; suit++) {
    const has = (rank: number) => hand.find((id) => suitOf(id) === suit && rankOf(id) === (rank === 14 ? 1 : rank));
    for (let low = 1; low <= 12; low++)
      for (let high = low + 2; high <= 14; high++) {
        if (low === 1 && high === 14) continue;
        const run = Array.from({ length: high - low + 1 }, (_, k) => has(low + k));
        if (run.some((id) => id === undefined)) break;
        out.push(run as number[]);
      }
  }
  for (const id of hand) if (rankOf(id) === 7) out.push([id]);
  return out;
}
/** Every move `s.seat` may make. Mine use my picked cards (`extra` -1); a computer's name their cards. */
export function moves(s: State): Move[] {
  if (s.winner !== null) return [];
  const m = (to: number, extra = -1): Move => ({ from: -1, to, extra });
  if (s.phase === "scored") return [m(NEXT)];
  const seat = s.seat,
    hand = s.hands[seat];
  if (seat === 0) {
    const out = [...hand.map((id) => m(id)), m(SORT)];
    if (s.phase === "claim" || s.phase === "draw") {
      out.push(m(s.phase === "claim" ? PASS : STOCK));
      if (thankWith(s, 0, s.picked) !== null) out.push(m(THANK));
    } else {
      if (valid(s.picked)) out.push(m(REGISTER));
      s.melds.forEach((_, i) => attachable(s, i, s.picked) && out.push(m(MELD_BASE + i)));
      if (s.melds.some((_, i) => attachable(s, i, s.picked))) out.push(m(ATTACH));
      if (s.picked.length === 1) out.push(m(DISCARD));
    }
    return out;
  }
  return options(s);
}
/** The moves of `s.seat` that name their cards (the computer's; for my seat too, where the computer plays it in tests). */
export function options(s: State): Move[] {
  if (s.winner !== null) return [];
  const m = (to: number, extra = -1): Move => ({ from: -1, to, extra });
  if (s.phase === "scored") return [m(NEXT)];
  const seat = s.seat,
    hand = s.hands[seat];
  if (s.phase === "claim" || s.phase === "draw") return [m(s.phase === "claim" ? PASS : STOCK, 0), ...claims(s, seat).map((mask) => m(THANK, mask))];
  return [
    ...meldsIn(hand).map((cards) => m(REGISTER, maskOf(cards))),
    ...s.melds.flatMap((_, i) => hand.filter((id) => attachable(s, i, [id])).map((id) => m(MELD_BASE + i, maskOf([id])))),
    ...hand.map((id) => m(DISCARD, maskOf([id]))),
  ];
}
/** What a 땡큐 with these cards of the hand does: a new meld of them and the card, or (none) the card attached to the first meld it fits, or the 7 alone. */
function thankWith(s: State, seat: number, cards: readonly number[]): { meld: number[] } | { attach: number } | null {
  const card = top(s);
  if (card === undefined || cards.some((id) => !s.hands[seat].includes(id))) return null;
  if (cards.length) return valid([...cards, card]) ? { meld: [...cards, card] } : null;
  const i = s.melds.findIndex((_, k) => attachable(s, k, [card]));
  if (i >= 0) return { attach: i };
  return rankOf(card) === 7 ? { meld: [card] } : null;
}
const without = (hand: number[], cards: readonly number[]) => hand.filter((id) => !cards.includes(id));
/** The round won by `winner` (or, `dry`, ended by the stock running out): its scores; the last round decides the match. */
function endRound(s: State, winner: number | null, events: string[]): State {
  const totals = s.hands.map(totalOf),
    dry = winner === null;
  let w = winner ?? 0;
  if (dry) {
    // The lowest hand, then fewer cards, then the earlier in play from the player who would have drawn next.
    const order = Array.from({ length: s.players }, (_, k) => (after(s, s.seat) + k) % s.players);
    w = order.reduce((best, p) => (totals[p] < totals[best] || (totals[p] === totals[best] && s.hands[p].length < s.hands[best].length) ? p : best), order[0]);
  }
  const hula = !dry && !s.wasOpen,
    times = hula ? 2 : 1,
    gains = totals.map((t, p) => (p === w ? 0 : -t * times));
  gains[w] = -gains.reduce((a, b) => a + b, 0);
  const scores = s.scores.map((x, p) => x + gains[p]),
    result: RoundResult = { winner: w, hula, dry, totals, gains },
    said = [...events, hula ? "훌라!" : dry ? "더미가 떨어졌습니다" : `${nameOf(s, w)} 승리`],
    done: State = { ...s, scores, result, phase: "scored", seat: 0, claim: null, picked: [], last: { seat: w, kind: s.last?.kind ?? "discard", cards: s.last?.cards ?? [], events: said } };
  if (s.round < s.rounds) return done;
  const best = Math.max(...scores),
    tops = scores.filter((x) => x === best).length;
  return { ...done, winner: scores[0] === best ? (tops > 1 ? "draw" : 0) : 1 };
}
/** `seat`'s turn begins: it is to draw (or 땡큐). */
const turnOf = (s: State, seat: number): State => ({ ...s, phase: "draw", seat, claim: null, wasOpen: s.opened[seat], picked: [] });
/** After `from` discarded: the others who can register it are asked in turn (the next player on its own turn), unless the stock is out. */
function offered(s: State, from: number): State {
  if (!s.stock.length) return endRound(s, null, s.last?.events ?? []);
  const queue: number[] = [];
  for (let k = 2; k < s.players; k++) {
    const p = (from + k) % s.players;
    if (canClaim(s, p)) queue.push(p);
  }
  if (!queue.length) return turnOf(s, after(s, from));
  return { ...s, phase: "claim", seat: queue[0], claim: { from, queue: queue.slice(1) }, picked: [] };
}
/** `seat` registers or attaches what it did; out of cards, it has won the round. */
function settled(s: State, seat: number, events: string[]): State {
  return s.hands[seat].length ? s : endRound(s, seat, events);
}
export function play(s: State, move: Move, random: Random = cryptoRandom): State | null {
  if (s.winner !== null || move.from !== -1) return null;
  const seat = s.seat,
    hand = s.hands[seat],
    to = move.to,
    base = { ...s, ply: s.ply + 1 };
  if (s.phase === "scored") {
    if (to !== NEXT || !s.result) return null;
    return { ...deal(s.players, s.rounds, s.round + 1, s.scores, s.result.winner, s.sortBy, random), ply: s.ply + 1 };
  }
  // My picks and the order of my hand.
  // (Neither is a move of the game: the count stays, so that picking cards up is not held back between taps.)
  if (to === SORT) return seat === 0 ? { ...s, sortBy: s.sortBy === "suit" ? "rank" : "suit" } : null;
  if (to >= 0 && to < 52 && move.extra === -1) {
    if (seat !== 0 || !hand.includes(to)) return null;
    return { ...s, picked: s.picked.includes(to) ? s.picked.filter((id) => id !== to) : [...s.picked, to] };
  }
  const cards = move.extra === -1 ? s.picked : idsOf(move.extra);
  if (cards.some((id) => !hand.includes(id))) return null;
  const hands = (next: number[]) => s.hands.map((h, p) => (p === seat ? next : h)),
    opened = s.opened.map((o, p) => o || p === seat);
  if (s.phase === "claim" || s.phase === "draw") {
    if (to === PASS && s.phase === "claim") {
      const queue = s.claim?.queue ?? [],
        from = s.claim?.from ?? 0,
        next = { ...base, picked: [], last: { seat, kind: "pass" as const, cards: [], events: [] } };
      return queue.length ? { ...next, seat: queue[0], claim: { from, queue: queue.slice(1) } } : turnOf(next, after(s, from));
    }
    if (to === STOCK && s.phase === "draw") {
      if (!s.stock.length) return null;
      const card = s.stock[s.stock.length - 1];
      return { ...base, stock: s.stock.slice(0, -1), hands: hands([...hand, card]), phase: "meld", picked: [], last: { seat, kind: "draw", cards: [card], events: [] } };
    }
    if (to !== THANK) return null;
    const how = thankWith(s, seat, cards),
      card = top(s);
    if (!how) return null;
    const kept = without(hand, cards),
      melds = "meld" in how ? [...s.melds, { owner: seat, cards: ordered(how.meld) }] : s.melds.map((m, i) => (i === how.attach ? { ...m, cards: ordered([...m.cards, card]) } : m)),
      events = [`${seat === 0 ? "" : `${nameOf(s, seat)} `}땡큐!`],
      next: State = {
        ...base,
        discard: s.discard.slice(0, -1),
        hands: hands(kept),
        melds,
        opened,
        phase: "meld",
        seat,
        claim: null,
        picked: [],
        // Claimed out of turn, the claimer's turn begins here.
        wasOpen: s.phase === "claim" ? s.opened[seat] : s.wasOpen,
        last: { seat, kind: "thank", cards: [card, ...cards], events },
      };
    return settled(next, seat, events);
  }
  // The rest of the turn: register, attach, discard.
  if (to === REGISTER) {
    if (!valid(cards)) return null;
    const events = [`${seat === 0 ? "" : `${nameOf(s, seat)} `}등록!`],
      next: State = { ...base, hands: hands(without(hand, cards)), melds: [...s.melds, { owner: seat, cards: ordered(cards) }], opened, picked: [], last: { seat, kind: "register", cards: [...cards], events } };
    return settled(next, seat, events);
  }
  if (to >= MELD_BASE || to === ATTACH) {
    const i = to === ATTACH ? s.melds.findIndex((_, k) => attachable(s, k, cards)) : to - MELD_BASE;
    if (!attachable(s, i, cards)) return null;
    const events = [seat === 0 ? "붙이기!" : `${nameOf(s, seat)} 붙이기`],
      next: State = { ...base, hands: hands(without(hand, cards)), melds: s.melds.map((m, k) => (k === i ? { ...m, cards: ordered([...m.cards, ...cards]) } : m)), opened, picked: [], last: { seat, kind: "attach", cards: [...cards], events } };
    return settled(next, seat, events);
  }
  if (to === DISCARD) {
    if (cards.length !== 1) return null;
    const kept = without(hand, cards),
      next: State = { ...base, hands: hands(kept), discard: [...s.discard, cards[0]], picked: [], last: { seat, kind: "discard", cards: [...cards], events: [] } };
    return kept.length ? offered(next, seat) : endRound(next, seat, []);
  }
  return null;
}
/**
 * The computer's move from its own hand and the table: it claims a discard it can register (the most of its cards
 * with it; the easiest now and then lets one go), registers the biggest meld it holds, attaches what fits, and
 * discards the card least likely to make a meld, the highest first, keeping back any card another could 땡큐 (a 7,
 * a card that fits a meld on the table) where it can.
 */
export function chooseMove(s: State, level: Level, random: Random = Math.random): Move | null {
  const all = options(s);
  if (!all.length) return null;
  if (s.phase === "scored") return all[0];
  const seat = s.seat,
    hand = s.hands[seat],
    weight = (mask: number) => idsOf(mask).reduce((sum, id) => sum + 1 + valueOf(id) / 20, 0);
  if (s.phase === "claim" || s.phase === "draw") {
    const thanks = all.filter((m) => m.to === THANK);
    if (thanks.length && (level !== "easy" || random() < 0.6)) return thanks.reduce((best, m) => (weight(m.extra) > weight(best.extra) ? m : best));
    return all[0];
  }
  // Register: the meld holding the most of the hand's points (an easy computer now and then waits).
  const registers = all.filter((m) => m.to === REGISTER);
  if (registers.length && (level !== "easy" || random() < 0.75)) {
    const value = (m: Move) => idsOf(m.extra).reduce((sum, id) => sum + 2 + valueOf(id), 0);
    return registers.reduce((best, m) => (value(m) > value(best) ? m : best));
  }
  const attaches = all.filter((m) => m.to >= MELD_BASE);
  if (attaches.length && (level !== "easy" || random() < 0.75)) return attaches.reduce((best, m) => (valueOf(idsOf(m.extra)[0]) > valueOf(idsOf(best.extra)[0]) ? m : best));
  // Discard: the card with the fewest ties to the rest of the hand, the highest first; a card others could claim kept back.
  const ties = (id: number) =>
    hand.reduce((sum, other) => {
      if (other === id) return sum;
      if (rankOf(other) === rankOf(id)) return sum + 6;
      if (suitOf(other) !== suitOf(id)) return sum;
      const gap = Math.abs(rankOf(other) - rankOf(id));
      return sum + (gap === 1 ? 5 : gap === 2 ? 2.5 : 0);
    }, 0);
  const risky = (id: number) => rankOf(id) === 7 || s.melds.some((_, i) => attachable(s, i, [id])),
    worth = (id: number) => valueOf(id) - ties(id) - (rankOf(id) === 7 ? 12 : 0) - (level === "hard" && risky(id) ? 9 : level === "normal" && risky(id) ? 4 : 0) + (level === "easy" ? random() * 8 : random() * 0.5);
  const card = hand.reduce((best, id) => (worth(id) > worth(best) ? id : best), hand[0]);
  return { from: -1, to: DISCARD, extra: maskOf([card]) };
}
/** Where my hand's cards stand, in order. */
export const myHand = (s: State) => sortHand(s.hands[0], s.sortBy);
const effect = (): Effect | null => null;
const scoreText = (n: number) => (n > 0 ? `+${n}` : `${n}`);
export const hula: PointGame<State> = {
  create: (variant, options, random) => createGame(Number(options?.rivals ?? 3), Number(variant) || 3, random ?? cryptoRandom),
  moves,
  play,
  choose: (s, level, random) => chooseMove(s, level, random),
  turn: (s) => (s.seat === 0 ? 0 : 1),
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, p) => (p === 0 ? s.scores[0] - Math.max(...s.scores.slice(1)) : 0),
  hint: (s) => {
    if (s.phase === "scored") {
      const r = s.result!;
      return `${s.round}판 끝: ${r.hula ? "훌라! " : ""}${nameOf(s, r.winner)} ${scoreText(r.gains[r.winner])}점. ${s.winner === null ? "다음 판을 누르세요." : ""}`;
    }
    if (s.seat !== 0) return s.phase === "claim" ? "다음 차례를 기다리는 중" : `${nameOf(s, s.seat)} 차례`;
    const card = cardName(top(s));
    if (s.phase === "claim") return `땡큐! 버린 ${card}로 바로 등록할 수 있습니다. 함께 낼 카드를 고르고 버린 카드를 누르거나, 패스하세요.`;
    if (s.phase === "draw") return `더미에서 한 장 가져오세요. 버린 ${card}로 바로 등록할 수 있으면 함께 낼 카드를 고르고 버린 카드를 눌러 땡큐.`;
    return "카드를 골라 등록하거나 바닥의 묶음에 붙이고, 한 장을 골라 버린 카드 자리를 눌러 버리세요.";
  },
  tally: (s) => [`${s.round}/${s.rounds}판 · 나 ${scoreText(s.scores[0])}점 · 카드 ${s.hands[0].length}장`, s.scores.slice(1).map((x, k) => `${nameOf(s, k + 1)} ${scoreText(x)}점`).join(" · ")],
  reason: (s) => {
    const best = Math.max(...s.scores);
    if (s.winner === "draw") return `${s.rounds}판을 마치고 동점입니다(${best}점).`;
    if (s.winner === 0) return `${s.rounds}판 합계 ${scoreText(s.scores[0])}점으로 1등입니다.`;
    const champ = s.scores.indexOf(best);
    return `${nameOf(s, champ)}가 ${scoreText(best)}점으로 1등입니다. 나는 ${scoreText(s.scores[0])}점입니다.`;
  },
};
