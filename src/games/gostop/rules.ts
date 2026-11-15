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
 *
 * Two bonus cards belong to no month: a double chaff (2피, card 48) and a
 * triple (3피, card 49). Played from the hand, one is taken at once with a
 * chaff of the other side's, a card is drawn from the pile in its place and
 * the turn goes on; turned over from the pile, it is taken and the next one
 * turned. One lying on the floor when the game is dealt goes to the first
 * player (선), and the pile fills its place. Three of a month in the hand may
 * be shown (흔들기) when one of them is played onto nothing, or, with the
 * fourth on the floor, played all at once (폭탄): either doubles the
 * player's winnings, and a bomb takes all four with a chaff and leaves two
 * turns in which the player only turns over the pile.
 */
export type Kind = "gwang" | "yeol" | "tti" | "pi" | "ssang" | "bonus";
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
/** The two bonus cards, worth two and three chaff; 48 cards of the months come before them. */
export const BONUS2 = 48,
  BONUS3 = 49,
  CARDS = 50;
export const isBonus = (id: number) => id >= 48;
/** A card's month, 0 for a bonus card. */
export const monthOf = (id: number) => (isBonus(id) ? 0 : Math.floor(id / 4) + 1);
/** The picture's name: `1-gwang`, `11-ssang`, `4-pi2`; `bonus2` and `bonus3` are painted. */
export const pictureOf = (id: number) => (isBonus(id) ? `bonus${id === BONUS2 ? 2 : 3}` : `${monthOf(id)}-${LAYOUT[monthOf(id)][id % 4]}`);
export const kindOf = (id: number): Kind => {
  if (isBonus(id)) return "bonus";
  const slot = LAYOUT[monthOf(id)][id % 4];
  return slot.startsWith("pi") ? "pi" : (slot as Kind);
};
const card = (month: number, slot: string) => (month - 1) * 4 + LAYOUT[month].indexOf(slot);
const HONG = [card(1, "tti"), card(2, "tti"), card(3, "tti")],
  CHEONG = [card(6, "tti"), card(9, "tti"), card(10, "tti")],
  CHO = [card(4, "tti"), card(5, "tti"), card(7, "tti")],
  GODORI = [card(2, "yeol"), card(4, "yeol"), card(8, "yeol")],
  RAIN = card(12, "gwang");
/** How much a chaff card counts: two for a double, two or three for a bonus card. */
export const piValue = (id: number) => (id === BONUS3 ? 3 : id === BONUS2 || kindOf(id) === "ssang" ? 2 : kindOf(id) === "pi" ? 1 : 0);
export const GO = 200,
  STOP = 201,
  /** Shaking or bombing said yes or no to, and a turn that only turns over the pile (after a bomb). */
  YES = 202,
  NO = 203,
  FLIP = 204,
  /** September's animal kept as an animal or counted as a double chaff. */
  AS_PI = 205,
  AS_YEOL = 206,
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
/** The animal of September (국진), which its owner may count as a double chaff instead. */
export const GUKJIN = card(9, "yeol");
/** The points a player's taken cards are worth; with `gukjinPi` September's animal counts as a double chaff. */
export function score(taken: number[], gukjinPi = false): Score {
  const has = (ids: number[]) => ids.every((id) => taken.includes(id)),
    asPi = gukjinPi && taken.includes(GUKJIN),
    gwangs = taken.filter((id) => kindOf(id) === "gwang"),
    yeol = taken.filter((id) => kindOf(id) === "yeol").length - (asPi ? 1 : 0),
    tti = taken.filter((id) => kindOf(id) === "tti").length,
    pi = taken.reduce((n, id) => n + piValue(id), 0) + (asPi ? 2 : 0);
  const g = gwangs.length,
    gwang = g === 5 ? 15 : g === 4 ? 4 : g === 3 ? (gwangs.includes(RAIN) ? 2 : 3) : 0,
    yeolPoints = (yeol >= 5 ? yeol - 4 : 0) + (has(GODORI) ? 5 : 0),
    ttiPoints = (tti >= 5 ? tti - 4 : 0) + (has(HONG) ? 3 : 0) + (has(CHEONG) ? 3 : 0) + (has(CHO) ? 3 : 0),
    piPoints = pi >= 10 ? pi - 9 : 0;
  return { gwang, yeol: yeolPoints, tti: ttiPoints, pi: piPoints, total: gwang + yeolPoints + ttiPoints + piPoints, counts: { gwang: g, yeol, tti, pi } };
}
/** A side's score as it stands, September's animal counted as that side chose. */
export const points = (state: State, side: 0 | 1) => score(state.taken[side], state.gukjin[side] === "pi");
/** The sets a side has made, to be called out when made: 홍단, 청단, 초단, 고도리, and the brights (삼광, 비삼광, 사광, 오광). */
export function sets(taken: number[]) {
  const has = (ids: number[]) => ids.every((id) => taken.includes(id)),
    gwangs = taken.filter((id) => kindOf(id) === "gwang"),
    out: string[] = [];
  if (has(HONG)) out.push("홍단");
  if (has(CHEONG)) out.push("청단");
  if (has(CHO)) out.push("초단");
  if (has(GODORI)) out.push("고도리");
  const g = gwangs.length;
  if (g === 3) out.push(gwangs.includes(RAIN) ? "비삼광" : "삼광");
  if (g === 4) out.push("사광");
  if (g === 5) out.push("오광");
  return out;
}
/** What a side would pay double for if the other stopped now: 피박, 광박, 멍박. */
export function danger(state: State, side: 0 | 1) {
  const mine = points(state, side),
    theirs = points(state, (1 - side) as 0 | 1),
    out: string[] = [];
  if (theirs.pi > 0 && mine.counts.pi < 6) out.push("피박");
  if (theirs.gwang > 0 && mine.counts.gwang === 0) out.push("광박");
  if (theirs.counts.yeol >= 7) out.push("멍박");
  return out;
}
/** A line of the final reckoning, as printed on the receipt: what it is, its figure ("3점", "+1", "×2"). */
export interface Line {
  label: string;
  value: string;
}
export interface Last {
  /** Who played, the card from the hand, the card turned from the pile, and every card taken. */
  side: 0 | 1;
  played: number;
  flipped: number | null;
  taken: number[];
  /** What happened, for the table to tell: 쪽, 뻑, 따닥, 싹쓸이, 뻑 먹기, 흔들기, 폭탄, 보너스. */
  events: string[];
  /** Chaff taken from the other side. */
  stolen: number[];
  /** The other cards of a bomb, played with `played`; the three shown when shaking; bonus cards turned over before `flipped`. */
  bomb: number[];
  shown: number[];
  bonuses: number[];
  /** A card drawn into the hand for a bonus card played. */
  drawn: number | null;
  /** Sets each side made by this move, to be called out at its seat. */
  achieved: [string[], string[]];
}
export interface State {
  pile: number[];
  hands: [number[], number[]];
  floor: number[];
  taken: [number[], number[]];
  turn: 0 | 1;
  /**
   * `play`: a card from the hand; `declare`: whether to shake or bomb with `pending` (`offer` says which); `choose`:
   * which of two floor cards to take with `pending`; `gukjin`: whether September's animal counts as a double chaff
   * (asked once, when chaff begins to score); `decide`: go or stop.
   */
  phase: "play" | "declare" | "choose" | "gukjin" | "decide";
  /** The first player (선), who goes first and takes a bonus card dealt to the floor. */
  first: 0 | 1;
  /**
   * A turn waiting for the choice of which floor card the card turned from the pile takes (`pending`, lying on the
   * floor beside them): the turn as it began, and what had been played, to be carried out again with the choice.
   */
  resume: { base: State; played: number | null; choice: number | null; bomb: number[]; shown: number[] } | null;
  /** How each side counts September's animal, once asked. */
  gukjin: [null | "yeol" | "pi", null | "yeol" | "pi"];
  pending: number | null;
  offer: "shake" | "bomb" | null;
  /** The times each side has shaken or bombed (each doubles its winnings), and the turns left that only turn the pile. */
  shakes: [number, number];
  bombs: [number, number];
  dummies: [number, number];
  /** How the floor was dealt: the eight cards in the order laid, and each bonus card the first player took off it with the card that took its place. */
  opening: { laid: number[]; swaps: [number, number][] };
  /** How many times each side has said go, and the score at its last go (a go needs more than that). */
  gos: [number, number];
  saidAt: [number, number];
  /** Months where three cards stick together after a 뻑, and whose 뻑 it was. */
  stuck: Record<number, 0 | 1>;
  last: Last | null;
  winner: Winner;
  /** The points the winner takes, with what doubled them; how it ended. */
  result: { points: number; notes: string[]; lines: Line[] } | null;
  ply: number;
}
const shuffle = (random: Random) => {
  const deck = Array.from({ length: CARDS }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};
export function createGame(random: Random = cryptoRandom, lead: 0 | 1 = 0): State {
  for (;;) {
    const deck = shuffle(random),
      hands: [number[], number[]] = [deck.slice(0, 10), deck.slice(10, 20)],
      laid = deck.slice(20, 28),
      pile = deck.slice(28),
      floor = [...laid],
      swaps: [number, number][] = [],
      first: number[] = [];
    // A bonus card dealt to the floor goes to the first player, and the pile's top takes its place (again if that is one).
    for (let i = 0; i < floor.length; i++)
      while (isBonus(floor[i]) && pile.length) {
        const card = pile.pop()!;
        first.push(floor[i]);
        swaps.push([floor[i], card]);
        floor[i] = card;
      }
    // Four of a month on the floor is dealt again.
    if (floor.some(isBonus) || Array.from({ length: 12 }, (_, m) => floor.filter((id) => monthOf(id) === m + 1).length).some((n) => n === 4)) continue;
    return {
      pile,
      hands,
      floor,
      taken: lead === 0 ? [first, []] : [[], first],
      turn: lead,
      first: lead,
      gukjin: [null, null],
      resume: null,
      phase: "play",
      pending: null,
      offer: null,
      shakes: [0, 0],
      bombs: [0, 0],
      dummies: [0, 0],
      opening: { laid, swaps },
      gos: [0, 0],
      saidAt: [0, 0],
      stuck: {},
      last: null,
      winner: null,
      result: null,
      ply: 0,
    };
  }
}
const sameMonth = (cards: number[], id: number) => (isBonus(id) ? [] : cards.filter((c) => !isBonus(c) && monthOf(c) === monthOf(id)));
/** How much a card is worth having, for choosing which of two to take and for the computer. */
export function worth(id: number) {
  const k = kindOf(id);
  return k === "bonus" ? 3 : k === "gwang" ? 6 : GODORI.includes(id) ? 5 : k === "yeol" ? 3 : [...HONG, ...CHEONG, ...CHO].includes(id) ? 3.5 : k === "tti" ? 2 : k === "ssang" ? 2.5 : 1;
}
const better = (cards: number[]) => cards.reduce((a, b) => (worth(b) > worth(a) ? b : a));
/** One chaff card taken from the other side (the least worth first), for 쪽, 따닥, 싹쓸이, 뻑 먹기, 폭탄 and a bonus card. */
function steal(taken: [number[], number[]], side: 0 | 1) {
  const from = taken[1 - side],
    chaff = from.filter((id) => piValue(id) > 0).sort((a, b) => piValue(a) - piValue(b)),
    card = chaff[0];
  if (card === undefined) return null;
  taken[1 - side] = from.filter((id) => id !== card);
  taken[side] = [...taken[side], card];
  return card;
}
/**
 * A card played from the hand (with `choice`, the floor card it takes when two of its month lie there), then the
 * pile's top turned over; captures, 쪽, 뻑, 따닥, 싹쓸이 and stolen chaff; then go-or-stop or the next turn.
 */
/** Two floor cards of a month leave nothing to choose only when both are plain chaff (the user asked). */
const plain = (pair: number[]) => pair.length === 2 && kindOf(pair[0]) === "pi" && kindOf(pair[1]) === "pi";
function turnOver(state: State, played: number | null, choice: number | null, bomb: number[] = [], shown: number[] = [], flipChoice: number | null = null): State {
  const side = state.turn,
    hands: [number[], number[]] = [[...state.hands[0]], [...state.hands[1]]],
    taken: [number[], number[]] = [[...state.taken[0]], [...state.taken[1]]],
    stuck = { ...state.stuck },
    pile = [...state.pile],
    events: string[] = [],
    got: number[] = [];
  let floor = [...state.floor];
  hands[side] = hands[side].filter((id) => id !== played && !bomb.includes(id));
  const month = played === null ? -1 : monthOf(played),
    match = played === null ? [] : sameMonth(floor, played);
  // What the played card will take, once the turned card has been seen.
  let pair: number[] = [];
  let thieves = 0;
  const dummies = [...state.dummies] as [number, number];
  if (played === null) dummies[side]--;
  else if (bomb.length) {
    // A bomb: the three from the hand and the fourth from the floor, a chaff, and two turns of only turning the pile.
    pair = [played, ...bomb, ...match];
    events.push("폭탄");
    thieves++;
    dummies[side] += 2;
  } else if (shown.length) events.push("흔들기");
  if (played === null || bomb.length) {
    /* nothing more from the hand */
  } else if (match.length === 3) {
    // Three stuck cards and the fourth: all of them, and a chaff from the other side.
    pair = [played, ...match];
    // One's own 뻑 taken back (자뻑) takes two chaff.
    const own = stuck[month] === side;
    events.push(own ? "자뻑" : "뻑 먹기");
    delete stuck[month];
    thieves += own ? 2 : 1;
  } else if (match.length === 2) pair = [played, choice !== null && match.includes(choice) ? choice : better(match)];
  else if (match.length === 1) pair = [played, match[0]];
  floor = floor.filter((id) => !pair.includes(id));
  if (!pair.length && played !== null) floor.push(played);
  // The top of the pile; a bonus card turned over is taken and the next one turned.
  const bonuses: number[] = [];
  let flipped = pile.length ? pile.pop()! : null;
  while (flipped !== null && isBonus(flipped)) {
    // A bonus card however taken brings a chaff of the other's with it.
    bonuses.push(flipped);
    got.push(flipped);
    thieves++;
    flipped = pile.length ? pile.pop()! : null;
  }
  if (flipped !== null) {
    if (played !== null && monthOf(flipped) === month && pair.length !== 4) {
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
        const own = stuck[monthOf(flipped)] === side;
        delete stuck[monthOf(flipped)];
        events.push(own ? "자뻑" : "뻑 먹기");
        thieves += own ? 2 : 1;
      } else if (its.length === 2 && !plain(its) && (flipChoice === null || !its.includes(flipChoice))) {
        // The card turned over meets two floor cards that differ: the turn waits for the player to choose. Meanwhile the
        // table shows the card played laid down and the turned card beside its two.
        return {
          ...state,
          hands,
          pile,
          floor: [...state.floor, ...(played !== null && !state.floor.includes(played) ? [played, ...bomb] : []), flipped],
          taken: [[...state.taken[0], ...(side === 0 ? bonuses : [])], [...state.taken[1], ...(side === 1 ? bonuses : [])]],
          phase: "choose",
          pending: flipped,
          offer: null,
          resume: { base: state, played, choice, bomb, shown },
        };
      } else if (its.length >= 1) {
        const with_ = its.length === 2 ? (flipChoice ?? better(its)) : its[0];
        got.push(flipped, with_);
        floor = floor.filter((id) => id !== with_);
      } else floor.push(flipped);
    }
  }
  got.push(...pair);
  taken[side] = [...taken[side], ...got];
  // Nothing left on the floor while cards remain to play: 싹쓸이.
  if (!floor.length && (hands[0].length || hands[1].length || dummies[0] || dummies[1])) {
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
    offer: null,
    resume: null,
    phase: "play",
    dummies,
    shakes: shown.length || bomb.length ? (state.shakes.map((n, i) => (i === side ? n + 1 : n)) as [number, number]) : state.shakes,
    bombs: bomb.length ? (state.bombs.map((n, i) => (i === side ? n + 1 : n)) as [number, number]) : state.bombs,
    last: { side, played: played ?? -1, flipped, taken: got, events, stolen, bomb, shown, bonuses, drawn: null, achieved: made(state.taken, taken) },
    ply: state.ply + 1,
  };
  // Three 뻑 of one's own win at once.
  if (Object.values(stuck).filter((s) => s === side).length >= 3 && events.includes("뻑")) return finish(next, side, ["삼연뻑"]);
  // September's animal: once chaff would begin to score with it as a double, its owner is asked how to count it.
  if (next.gukjin[side] === null && taken[side].includes(GUKJIN) && score(taken[side]).counts.pi + 2 >= 10) return { ...next, phase: "gukjin" };
  return conclude(next);
}
/** The sets each side has newly made between two takings. */
const made = (before: [number[], number[]], after: [number[], number[]]): [string[], string[]] =>
  [0, 1].map((i) => {
    const had = sets(before[i]);
    return sets(after[i]).filter((name) => !had.includes(name));
  }) as [string[], string[]];
/** The end of a turn: go or stop when the score has risen to it, else the other's turn. */
function conclude(next: State): State {
  const side = next.turn,
    total = points(next, side).total;
  if (total >= GOAL && total > next.saidAt[side]) {
    // With no cards left to play there is nothing to go on to: it is a stop.
    if (!playable(next, side)) return finish(next, side, []);
    return { ...next, phase: "decide" };
  }
  return endOfTurn(next);
}
/** Whether a side still has a turn to take: a card in the hand, or a turn left from a bomb. */
const playable = (state: State, side: 0 | 1) => state.hands[side].length > 0 || state.dummies[side] > 0;
function endOfTurn(state: State): State {
  if (!playable(state, 0) && !playable(state, 1)) return { ...state, winner: "draw", result: { points: 0, notes: ["나가리"], lines: [{ label: "나가리", value: "0점" }] } };
  const turn = (1 - state.turn) as 0 | 1;
  return { ...state, turn: playable(state, turn) ? turn : state.turn };
}
/** The winner stops: the score, its goes, and what doubles it. */
function finish(state: State, side: 0 | 1, notes: string[]): State {
  const mine = points(state, side),
    theirs = points(state, (1 - side) as 0 | 1),
    go = state.gos[side],
    why = [...notes],
    lines: Line[] = [];
  // The reckoning, line by line: the points of each kind, the goes, then every doubling.
  for (const [label, value] of [["광", mine.gwang], ["열끗", mine.yeol], ["띠", mine.tti], ["피", mine.pi]] as [string, number][]) if (value) lines.push({ label, value: `${value}점` });
  if (notes.includes("삼연뻑")) lines.push({ label: "삼연뻑", value: "승" });
  let won = mine.total + go;
  if (go) lines.push({ label: `${go}고`, value: `+${go}` });
  const double = (label: string, times = 1) => {
    won *= 2 ** times;
    why.push(label);
    lines.push({ label, value: `×${2 ** times}` });
  };
  // Each shake and each bomb doubles.
  for (let i = 0; i < state.shakes[side] - state.bombs[side]; i++) double("흔들기");
  for (let i = 0; i < state.bombs[side]; i++) double("폭탄");
  if (go >= 3) double(`${go}고`, go - 2);
  else if (go) why.push(`${go}고`);
  if (mine.pi > 0 && theirs.counts.pi < 6) double("피박");
  if (mine.gwang > 0 && theirs.counts.gwang === 0) double("광박");
  if (mine.counts.yeol >= 7) double("멍박");
  if (state.gos[1 - side] > 0) double("고박");
  return { ...state, phase: "play", winner: side, result: { points: won, notes: why, lines } };
}
/** The two floor cards to choose between, while a card waits for its choice (it may lie on the floor itself). */
export const choicesOf = (state: State) => (state.phase === "choose" && state.pending !== null ? sameMonth(state.floor, state.pending).filter((id) => id !== state.pending) : []);
export const moves = (state: State): Move[] => {
  if (state.winner !== null) return [];
  if (state.phase === "decide") return [GO, STOP].map((to) => ({ from: -1, to, extra: -1 }));
  if (state.phase === "declare") return [YES, NO].map((to) => ({ from: -1, to, extra: -1 }));
  if (state.phase === "gukjin") return [AS_PI, AS_YEOL].map((to) => ({ from: -1, to, extra: -1 }));
  // Which of two floor cards to take is a tap on that card.
  if (state.phase === "choose") return choicesOf(state).map((to) => ({ from: -1, to, extra: -1 }));
  return [...state.hands[state.turn], ...(state.dummies[state.turn] > 0 ? [FLIP] : [])].map((to) => ({ from: -1, to, extra: -1 }));
};
/** The other cards of the month in the hand of the player to move, beside `card`. */
const fellows = (state: State, card: number) => state.hands[state.turn].filter((id) => id !== card && !isBonus(id) && monthOf(id) === monthOf(card));
/** A card played on: the choice of which floor card to take, when two of its month lie there and differ. */
function onward(state: State, card: number, shown: number[] = []): State {
  const match = sameMonth(state.floor, card);
  if (match.length === 2 && !plain(match)) return { ...state, phase: "choose", pending: card, offer: null, last: shown.length ? { ...(state.last ?? emptyLast(state.turn)), shown } : state.last };
  return turnOver(state, card, null, [], shown);
}
const emptyLast = (side: 0 | 1): Last => ({ side, played: -1, flipped: null, taken: [], events: [], stolen: [], bomb: [], shown: [], bonuses: [], drawn: null, achieved: [[], []] });
/** A bonus card played from the hand: taken with a chaff of the other side's, and a card drawn from the pile in its place; the turn goes on. */
function bonus(state: State, card: number): State {
  const side = state.turn,
    hands: [number[], number[]] = [[...state.hands[0]], [...state.hands[1]]],
    taken: [number[], number[]] = [[...state.taken[0], ...(side === 0 ? [card] : [])], [...state.taken[1], ...(side === 1 ? [card] : [])]],
    pile = [...state.pile];
  hands[side] = hands[side].filter((id) => id !== card);
  const stolen = steal(taken, side),
    drawn = pile.length ? pile.pop()! : null;
  if (drawn !== null) hands[side].push(drawn);
  return {
    ...state,
    hands,
    taken,
    pile,
    ply: state.ply + 1,
    last: { ...emptyLast(side), played: card, taken: [card], events: ["보너스"], stolen: stolen === null ? [] : [stolen], drawn },
  };
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1) return null;
  const side = state.turn;
  if (state.phase === "decide") {
    if (move.to === STOP) return finish({ ...state, ply: state.ply + 1 }, side, []);
    if (move.to !== GO) return null;
    const gos = [...state.gos] as [number, number],
      saidAt = [...state.saidAt] as [number, number];
    gos[side]++;
    saidAt[side] = points(state, side).total;
    return endOfTurn({ ...state, gos, saidAt, phase: "play", ply: state.ply + 1, last: state.last && { ...state.last, events: [`${gos[side]}고`] } });
  }
  if (state.phase === "gukjin") {
    if (move.to !== AS_PI && move.to !== AS_YEOL) return null;
    const gukjin = [...state.gukjin] as State["gukjin"];
    gukjin[side] = move.to === AS_PI ? "pi" : "yeol";
    return conclude({ ...state, gukjin, phase: "play", last: state.last && { ...state.last, events: [], achieved: [[], []] } });
  }
  if (state.phase === "declare") {
    const card = state.pending!,
      others = fellows(state, card);
    if (move.to === NO) return onward({ ...state, phase: "play", pending: null, offer: null }, card);
    if (move.to !== YES) return null;
    if (state.offer === "bomb") return turnOver({ ...state, phase: "play", pending: null, offer: null }, card, null, others);
    return onward({ ...state, phase: "play", pending: null, offer: null }, card, [card, ...others]);
  }
  if (state.phase === "choose") {
    const choices = choicesOf(state);
    if (move.from !== -1 || !choices.includes(move.to)) return null;
    const resume = state.resume;
    if (resume) return turnOver(resume.base, resume.played, resume.choice, resume.bomb, resume.shown, move.to);
    return turnOver(state, state.pending!, move.to, [], state.last?.shown.includes(state.pending!) && state.last.played !== state.pending ? state.last.shown : []);
  }
  if (move.from !== -1) return null;
  if (move.to === FLIP) return state.dummies[side] > 0 ? turnOver(state, null, null) : null;
  if (!state.hands[side].includes(move.to)) return null;
  if (isBonus(move.to)) return bonus(state, move.to);
  // Three of a month in the hand: with the fourth on the floor a bomb is offered, with none of it there a shake.
  const others = fellows(state, move.to),
    match = sameMonth(state.floor, move.to);
  if (others.length === 2 && match.length <= 1) return { ...state, phase: "declare", pending: move.to, offer: match.length === 1 ? "bomb" : "shake" };
  return onward(state, move.to);
}
/**
 * The computer's move, from what it can see (its hand, the floor, what both have taken; never the pile or my hand):
 * the card that takes most, or else the one least useful to me; go while it is far ahead and has cards to spare.
 */
export function choose(state: State, _level: string, random: Random): Move | null {
  const side = state.turn,
    legal = moves(state);
  if (!legal.length) return null;
  if (state.phase === "gukjin") {
    // Whichever way scores more now; a double chaff when it is the same.
    const asPi = score(state.taken[side], true).total,
      asYeol = score(state.taken[side]).total;
    return { from: -1, to: asPi >= asYeol ? AS_PI : AS_YEOL, extra: -1 };
  }
  if (state.phase === "decide") {
    const mine = points(state, side).total,
      theirs = points(state, (1 - side) as 0 | 1).total;
    const go = state.hands[side].length >= 3 && theirs < 4 && mine < 12;
    return { from: -1, to: go ? GO : STOP, extra: -1 };
  }
  if (state.phase === "choose") return { from: -1, to: better(legal.map((m) => m.to)), extra: -1 };
  // It always shakes and bombs; a bonus card is played at once, for it costs nothing.
  if (state.phase === "declare") return { from: -1, to: YES, extra: -1 };
  const free = state.hands[side].find(isBonus);
  if (free !== undefined) return { from: -1, to: free, extra: -1 };
  let best = legal[0],
    value = -Infinity;
  for (const m of legal) {
    if (m.to === FLIP) {
      // A turn of only turning the pile keeps the hand: worth it when no card takes anything.
      const v = -0.2 + random() * 0.1;
      if (v > value) {
        value = v;
        best = m;
      }
      continue;
    }
    const match = sameMonth(state.floor, m.to),
      gain = match.length === 3 ? match.reduce((n, id) => n + worth(id), worth(m.to)) + 3 : match.length ? worth(m.to) + Math.max(...match.map(worth)) : -worth(m.to) * 0.6,
      // Holding two of a month keeps a later take sure; laying one of them down gives it away less.
      held = state.hands[side].filter((id) => monthOf(id) === monthOf(m.to)).length,
      bombing = held === 3 && match.length === 1 ? 6 : 0,
      v = gain + bombing - (match.length === 0 && held > 1 ? 0.5 : 0) + random() * 0.2;
    if (v > value) {
      value = v;
      best = m;
    }
  }
  return best;
}
const effect = (): Effect | null => null;
/** Who won the last game on this page (선 for the next); a 나가리 leaves it as it was. Kept in memory only. */
let leader: 0 | 1 = 0;
export const gostop: PointGame<State> = {
  create: () => createGame(cryptoRandom, leader),
  moves,
  play: (state, move) => {
    const next = play(state, move);
    if (next && (next.winner === 0 || next.winner === 1)) leader = next.winner;
    return next;
  },
  choose,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, p) => points(s, p).total - points(s, (1 - p) as 0 | 1).total,
  hint: (s) =>
    s.phase === "gukjin"
      ? s.turn === 0
        ? "피 점수가 나기 시작합니다! 9월 열끗(국진)을 쌍피로 쓰시겠습니까?"
        : "컴퓨터가 고르는 중"
      : s.phase === "declare"
      ? s.turn === 0
        ? s.offer === "bomb"
          ? "같은 달 세 장! 폭탄으로 한꺼번에 내시겠습니까?"
          : "같은 달 세 장! 흔드시겠습니까?"
        : "컴퓨터가 고르는 중"
      : s.phase === "decide"
      ? s.turn === 0
        ? `${points(s, 0).total}점! 고 하시겠습니까, 스톱 하시겠습니까?`
        : "컴퓨터가 고/스톱을 고르는 중"
      : s.phase === "choose"
        ? s.turn === 1
          ? "컴퓨터가 고르는 중"
          : s.resume
            ? "뒤집은 패로 가져올 카드를 고르세요"
            : "같은 달 두 장 중 가져올 카드를 고르세요"
        : s.turn === 0
          ? s.dummies[0] > 0
            ? `낼 카드를 고르거나, 더미를 눌러 뒤집기만 하세요 (${s.dummies[0]}번 남음)`
            : "낼 카드를 고르세요"
          : "컴퓨터 차례",
  // The panel is unseen, but readers hear it: the score, the goes and any double the side would pay now.
  tally: (s) =>
    [0, 1].map((p) => {
      const side = p as 0 | 1,
        risk = danger(s, side);
      return `${points(s, side).total}점${s.gos[side] ? ` · ${s.gos[side]}고` : ""}${risk.length ? ` · ${risk.join(" ")}` : ""}`;
    }) as [string, string],
  // The screen says who won first; this tells how.
  reason: (s) =>
    s.winner === "draw"
      ? "나가리입니다. 아무도 나지 못했습니다."
      : `${s.result!.points}점으로 났습니다.${s.result!.notes.length ? ` (${s.result!.notes.join(" · ")})` : ""}`,
};
/** Cards of a side's hand that take something from the floor now (shown with a blue edge). */
export const capturing = (state: State, side: 0 | 1) => state.hands[side].filter((id) => sameMonth(state.floor, id).length > 0);
/**
 * Pairs of a side's hand that it is sure to take back: the other two of the month have been taken already, so the
 * one laid down can only be taken by its fellow (shown with a grey edge).
 */
export function sure(state: State, side: 0 | 1) {
  const gone = [...state.taken[0], ...state.taken[1]];
  return state.hands[side].filter((id) => {
    if (isBonus(id)) return false;
    const month = monthOf(id),
      held = state.hands[side].filter((c) => !isBonus(c) && monthOf(c) === month).length,
      out = gone.filter((c) => !isBonus(c) && monthOf(c) === month).length;
    return held === 2 && out === 2;
  });
}
/** Three of a month in a side's hand, held together: a bomb when the fourth lies on the floor, else a shake. */
export function bundles(state: State, side: 0 | 1) {
  const out: { cards: number[]; bomb: boolean }[] = [];
  for (let month = 1; month <= 12; month++) {
    const cards = state.hands[side].filter((id) => !isBonus(id) && monthOf(id) === month);
    if (cards.length === 3) out.push({ cards, bomb: state.floor.some((id) => !isBonus(id) && monthOf(id) === month) });
  }
  return out;
}
