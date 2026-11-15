import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Go-stop for two (맞고), against the computer. Forty-eight hwatu cards,
 * four a month. Each is dealt ten, eight lie face up on the floor and the
 * rest are the pile. In a turn a card is played from the hand onto a floor
 * card of its month, taking the pair, or laid down when none matches; then
 * the top of the pile is turned over and does the same. Taken cards score:
 * brights (광), animals (열끗), ribbons (띠) and chaff (피), with sets
 * (고도리, 홍단, 청단, 초단). With 7 points or more a player says go and
 * plays on for more, or stop and wins.
 */
export type Kind = "gwang" | "yeol" | "tti" | "pi" | "ssang";
/** Card `id` is the `(id % 4)`-th card of month `floor(id / 4) + 1`. */
const LAYOUT: Record<number, string[]> = {
  1: ["gwang", "tti", "pi1", "pi2"],
  2: ["yeol", "tti", "pi1", "pi2"],
  3: ["gwang", "tti", "pi1", "pi2"],
  4: ["yeol", "tti", "pi1", "pi2"],
  5: ["yeol", "tti", "pi1", "pi2"],
  6: ["yeol", "tti", "pi1", "pi2"],
  7: ["yeol", "tti", "pi1", "pi2"],
  8: ["gwang", "yeol", "pi1", "pi2"],
  9: ["yeol", "tti", "pi1", "pi2"],
  10: ["yeol", "tti", "pi1", "pi2"],
  11: ["gwang", "ssang", "pi1", "pi2"],
  12: ["gwang", "yeol", "tti", "ssang"],
};
export const monthOf = (id: number) => Math.floor(id / 4) + 1;
/** The picture's name: `1-gwang`, `11-ssang`, `4-pi2`. */
export const pictureOf = (id: number) => `${monthOf(id)}-${LAYOUT[monthOf(id)][id % 4]}`;
export const kindOf = (id: number): Kind => {
  const slot = LAYOUT[monthOf(id)][id % 4];
  return slot.startsWith("pi") ? "pi" : (slot as Kind);
};
const card = (month: number, slot: string) => (month - 1) * 4 + LAYOUT[month].indexOf(slot);
const HONG = [card(1, "tti"), card(2, "tti"), card(3, "tti")],
  CHEONG = [card(6, "tti"), card(9, "tti"), card(10, "tti")],
  CHO = [card(4, "tti"), card(5, "tti"), card(7, "tti")],
  GODORI = [card(2, "yeol"), card(4, "yeol"), card(8, "yeol")],
  RAIN = card(12, "gwang");
/** How much a chaff card counts: two for a double. */
export const piValue = (id: number) => (kindOf(id) === "ssang" ? 2 : kindOf(id) === "pi" ? 1 : 0);
export const GO = 200,
  STOP = 201,
  /** Points needed to say go or stop. */
  GOAL = 7;
export interface Score {
  gwang: number;
  yeol: number;
  tti: number;
  pi: number;
  total: number;
  /** How many of each were taken: brights, animals, ribbons, chaff (doubles twice). */
  counts: { gwang: number; yeol: number; tti: number; pi: number };
}
/** The points a player's taken cards are worth. */
export function score(taken: number[]): Score {
  const has = (ids: number[]) => ids.every((id) => taken.includes(id)),
    gwangs = taken.filter((id) => kindOf(id) === "gwang"),
    yeol = taken.filter((id) => kindOf(id) === "yeol").length,
    tti = taken.filter((id) => kindOf(id) === "tti").length,
    pi = taken.reduce((n, id) => n + piValue(id), 0);
  const g = gwangs.length,
    gwang = g === 5 ? 15 : g === 4 ? 4 : g === 3 ? (gwangs.includes(RAIN) ? 2 : 3) : 0,
    yeolPoints = (yeol >= 5 ? yeol - 4 : 0) + (has(GODORI) ? 5 : 0),
    ttiPoints = (tti >= 5 ? tti - 4 : 0) + (has(HONG) ? 3 : 0) + (has(CHEONG) ? 3 : 0) + (has(CHO) ? 3 : 0),
    piPoints = pi >= 10 ? pi - 9 : 0;
  return { gwang, yeol: yeolPoints, tti: ttiPoints, pi: piPoints, total: gwang + yeolPoints + ttiPoints + piPoints, counts: { gwang: g, yeol, tti, pi } };
}
export interface Last {
  /** Who played, the card from the hand, the card turned from the pile, and every card taken. */
  side: 0 | 1;
  played: number;
  flipped: number | null;
  taken: number[];
  /** What happened, for the table to tell: 쪽, 뻑, 따닥, 싹쓸이, 뻑 먹기. */
  events: string[];
  /** Chaff taken from the other side. */
  stolen: number[];
}
export interface State {
  pile: number[];
  hands: [number[], number[]];
  floor: number[];
  taken: [number[], number[]];
  turn: 0 | 1;
  /** `play`: a card from the hand; `choose`: which of two floor cards to take with `pending`; `decide`: go or stop. */
  phase: "play" | "choose" | "decide";
  pending: number | null;
  /** How many times each side has said go, and the score at its last go (a go needs more than that). */
  gos: [number, number];
  saidAt: [number, number];
  /** Months where three cards stick together after a 뻑, and whose 뻑 it was. */
  stuck: Record<number, 0 | 1>;
  last: Last | null;
  winner: Winner;
  /** The points the winner takes, with what doubled them; how it ended. */
  result: { points: number; notes: string[] } | null;
  ply: number;
}
const shuffle = (random: Random) => {
  const deck = Array.from({ length: 48 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};
export function createGame(random: Random = cryptoRandom): State {
  for (;;) {
    const deck = shuffle(random),
      hands: [number[], number[]] = [deck.slice(0, 10), deck.slice(10, 20)],
      floor = deck.slice(20, 28),
      pile = deck.slice(28);
    // Four of a month on the floor is dealt again.
    if (Array.from({ length: 12 }, (_, m) => floor.filter((id) => monthOf(id) === m + 1).length).some((n) => n === 4)) continue;
    return { pile, hands, floor, taken: [[], []], turn: 0, phase: "play", pending: null, gos: [0, 0], saidAt: [0, 0], stuck: {}, last: null, winner: null, result: null, ply: 0 };
  }
}
const sameMonth = (cards: number[], id: number) => cards.filter((c) => monthOf(c) === monthOf(id));
/** How much a card is worth having, for choosing which of two to take and for the computer. */
export function worth(id: number) {
  const k = kindOf(id);
  return k === "gwang" ? 6 : GODORI.includes(id) ? 5 : k === "yeol" ? 3 : [...HONG, ...CHEONG, ...CHO].includes(id) ? 3.5 : k === "tti" ? 2 : k === "ssang" ? 2.5 : 1;
}
const better = (cards: number[]) => cards.reduce((a, b) => (worth(b) > worth(a) ? b : a));
/** One chaff card taken from the other side (a single before a double), for 쪽, 따닥, 싹쓸이 and 뻑 먹기. */
function steal(taken: [number[], number[]], side: 0 | 1) {
  const from = taken[1 - side],
    card = from.find((id) => kindOf(id) === "pi") ?? from.find((id) => kindOf(id) === "ssang");
  if (card === undefined) return null;
  taken[1 - side] = from.filter((id) => id !== card);
  taken[side] = [...taken[side], card];
  return card;
}
/**
 * A card played from the hand (with `choice`, the floor card it takes when two of its month lie there), then the
 * pile's top turned over; captures, 쪽, 뻑, 따닥, 싹쓸이 and stolen chaff; then go-or-stop or the next turn.
 */
function turnOver(state: State, played: number, choice: number | null): State {
  const side = state.turn,
    hands: [number[], number[]] = [[...state.hands[0]], [...state.hands[1]]],
    taken: [number[], number[]] = [[...state.taken[0]], [...state.taken[1]]],
    stuck = { ...state.stuck },
    pile = [...state.pile],
    events: string[] = [],
    got: number[] = [];
  let floor = [...state.floor];
  hands[side] = hands[side].filter((id) => id !== played);
  const month = monthOf(played),
    match = sameMonth(floor, played);
  // What the played card will take, once the turned card has been seen.
  let pair: number[] = [];
  let thieves = 0;
  if (match.length === 3) {
    // Three stuck cards and the fourth: all of them, and a chaff from the other side.
    pair = [played, ...match];
    events.push("뻑 먹기");
    delete stuck[month];
    thieves++;
  } else if (match.length === 2) pair = [played, choice !== null && match.includes(choice) ? choice : better(match)];
  else if (match.length === 1) pair = [played, match[0]];
  floor = floor.filter((id) => !pair.includes(id));
  if (!pair.length) floor.push(played);
  // The top of the pile.
  const flipped = pile.length ? pile.pop()! : null;
  if (flipped !== null) {
    if (monthOf(flipped) === month && pair.length !== 4) {
      if (!pair.length) {
        // 쪽: played onto nothing, and the pile gave its mate.
        floor = floor.filter((id) => id !== played);
        got.push(played, flipped);
        events.push("쪽");
        thieves++;
      } else if (match.length === 1) {
        // 뻑: three of the month now stick on the floor.
        floor.push(...pair, flipped);
        pair = [];
        stuck[month] = side;
        events.push("뻑");
      } else {
        // 따닥: the other floor card of the month as well.
        const rest = match.filter((id) => !pair.includes(id));
        floor = floor.filter((id) => !rest.includes(id));
        got.push(...rest, flipped);
        events.push("따닥");
        thieves++;
      }
    } else {
      const its = sameMonth(floor, flipped);
      if (its.length === 3) {
        got.push(flipped, ...its);
        floor = floor.filter((id) => !its.includes(id));
        delete stuck[monthOf(flipped)];
        events.push("뻑 먹기");
        thieves++;
      } else if (its.length >= 1) {
        const with_ = its.length === 2 ? better(its) : its[0];
        got.push(flipped, with_);
        floor = floor.filter((id) => id !== with_);
      } else floor.push(flipped);
    }
  }
  got.push(...pair);
  taken[side] = [...taken[side], ...got];
  // Nothing left on the floor while cards remain to play: 싹쓸이.
  if (!floor.length && (hands[0].length || hands[1].length)) {
    events.push("싹쓸이");
    thieves++;
  }
  const stolen: number[] = [];
  for (let i = 0; i < thieves; i++) {
    const c = steal(taken, side);
    if (c !== null) stolen.push(c);
  }
  const next: State = {
    ...state,
    pile,
    hands,
    floor,
    taken,
    stuck,
    pending: null,
    phase: "play",
    last: { side, played, flipped, taken: got, events, stolen },
    ply: state.ply + 1,
  };
  // Three 뻑 of one's own win at once.
  if (Object.values(stuck).filter((s) => s === side).length >= 3 && events.includes("뻑")) return finish(next, side, ["삼연뻑"]);
  const points = score(taken[side]).total;
  if (points >= GOAL && points > state.saidAt[side]) {
    // With no cards left to play there is nothing to go on to: it is a stop.
    if (!hands[side].length) return finish(next, side, []);
    return { ...next, phase: "decide" };
  }
  return endOfTurn(next);
}
function endOfTurn(state: State): State {
  if (!state.hands[0].length && !state.hands[1].length) return { ...state, winner: "draw", result: { points: 0, notes: ["나가리"] } };
  const turn = (1 - state.turn) as 0 | 1;
  return { ...state, turn: state.hands[turn].length ? turn : state.turn };
}
/** The winner stops: the score, its goes, and what doubles it. */
function finish(state: State, side: 0 | 1, notes: string[]): State {
  const mine = score(state.taken[side]),
    theirs = score(state.taken[1 - side]),
    go = state.gos[side];
  let points = mine.total + go;
  const why = [...notes];
  if (go >= 3) {
    points *= 2 ** (go - 2);
    why.push(`${go}고`);
  } else if (go) why.push(`${go}고`);
  if (mine.pi > 0 && theirs.counts.pi < 6) {
    points *= 2;
    why.push("피박");
  }
  if (mine.gwang > 0 && theirs.counts.gwang === 0) {
    points *= 2;
    why.push("광박");
  }
  if (mine.counts.yeol >= 7) {
    points *= 2;
    why.push("멍박");
  }
  if (state.gos[1 - side] > 0) {
    points *= 2;
    why.push("고박");
  }
  return { ...state, phase: "play", winner: side, result: { points, notes: why } };
}
export const moves = (state: State): Move[] => {
  if (state.winner !== null) return [];
  if (state.phase === "decide") return [GO, STOP].map((to) => ({ from: -1, to, extra: -1 }));
  // Which of two floor cards to take is a tap on that card.
  if (state.phase === "choose") return sameMonth(state.floor, state.pending!).map((to) => ({ from: -1, to, extra: -1 }));
  return state.hands[state.turn].map((to) => ({ from: -1, to, extra: -1 }));
};
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1) return null;
  const side = state.turn;
  if (state.phase === "decide") {
    if (move.to === STOP) return finish({ ...state, ply: state.ply + 1 }, side, []);
    if (move.to !== GO) return null;
    const gos = [...state.gos] as [number, number],
      saidAt = [...state.saidAt] as [number, number];
    gos[side]++;
    saidAt[side] = score(state.taken[side]).total;
    return endOfTurn({ ...state, gos, saidAt, phase: "play", ply: state.ply + 1, last: state.last && { ...state.last, events: [`${gos[side]}고`] } });
  }
  if (state.phase === "choose") {
    const choices = sameMonth(state.floor, state.pending!);
    if (move.from !== -1 || !choices.includes(move.to)) return null;
    return turnOver(state, state.pending!, move.to);
  }
  if (move.from !== -1 || !state.hands[side].includes(move.to)) return null;
  const match = sameMonth(state.floor, move.to);
  // Two of the month on the floor and of different worth: the player picks which to take.
  if (match.length === 2 && kindOf(match[0]) !== kindOf(match[1])) return { ...state, phase: "choose", pending: move.to };
  return turnOver(state, move.to, null);
}
/**
 * The computer's move, from what it can see (its hand, the floor, what both have taken; never the pile or my hand):
 * the card that takes most, or else the one least useful to me; go while it is far ahead and has cards to spare.
 */
export function choose(state: State, _level: string, random: Random): Move | null {
  const side = state.turn,
    legal = moves(state);
  if (!legal.length) return null;
  if (state.phase === "decide") {
    const mine = score(state.taken[side]).total,
      theirs = score(state.taken[1 - side]).total;
    const go = state.hands[side].length >= 3 && theirs < 4 && mine < 12;
    return { from: -1, to: go ? GO : STOP, extra: -1 };
  }
  if (state.phase === "choose") return { from: -1, to: better(legal.map((m) => m.to)), extra: -1 };
  let best = legal[0],
    value = -Infinity;
  for (const m of legal) {
    const match = sameMonth(state.floor, m.to),
      gain = match.length === 3 ? match.reduce((n, id) => n + worth(id), worth(m.to)) + 3 : match.length ? worth(m.to) + Math.max(...match.map(worth)) : -worth(m.to) * 0.6,
      // Holding two of a month keeps a later take sure; laying one of them down gives it away less.
      held = state.hands[side].filter((id) => monthOf(id) === monthOf(m.to)).length,
      v = gain - (match.length === 0 && held > 1 ? 0.5 : 0) + random() * 0.2;
    if (v > value) {
      value = v;
      best = m;
    }
  }
  return best;
}
const effect = (): Effect | null => null;
export const gostop: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  choose,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, p) => score(s.taken[p]).total - score(s.taken[1 - p]).total,
  hint: (s) =>
    s.phase === "decide"
      ? s.turn === 0
        ? `${score(s.taken[0]).total}점! 고 하시겠습니까, 스톱 하시겠습니까?`
        : "컴퓨터가 고/스톱을 고르는 중"
      : s.phase === "choose"
        ? "같은 달 두 장 중 가져올 카드를 고르세요"
        : s.turn === 0
          ? "낼 카드를 고르세요"
          : "컴퓨터 차례",
  tally: (s) => [`${score(s.taken[0]).total}점${s.gos[0] ? ` · ${s.gos[0]}고` : ""}`, `${score(s.taken[1]).total}점${s.gos[1] ? ` · ${s.gos[1]}고` : ""}`],
  // The screen says who won first; this tells how.
  reason: (s) =>
    s.winner === "draw"
      ? "나가리입니다. 아무도 나지 못했습니다."
      : `${s.result!.points}점으로 났습니다.${s.result!.notes.length ? ` (${s.result!.notes.join(" · ")})` : ""}`,
};
