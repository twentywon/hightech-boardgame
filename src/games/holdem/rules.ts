import { cryptoRandom, type Random } from "../../core/random";
import { createDeck, shuffle, type Card } from "../blackjack/shoe";
import { contenders, createSeat, pot, sidePots, STEP, type Action, type Betting, type Seat } from "../cards/betting";
import { evaluate } from "../poker/rules";
export type { Action } from "../cards/betting";
export type { Card } from "../blackjack/shoe";
export { evaluate, CATEGORIES, type Strength } from "../poker/rules";

/**
 * No-limit Texas hold'em for seat 0 and one to five computer seats. Seats sit
 * clockwise in index order (seat 1 at my left), so play passes to the next
 * index. Every amount is a multiple of `STEP` chips.
 */
export const START_CHIPS = 1000;
export const MAX_OPPONENTS = 5;
/** Small and big blind by level. They rise every `HANDS_PER_LEVEL` hands, so that a session comes to an end. */
export const BLINDS: readonly [number, number][] = [
  [10, 20],
  [20, 40],
  [30, 60],
  [50, 100],
  [80, 160],
  [100, 200],
  [150, 300],
  [200, 400],
  [300, 600],
  [500, 1000],
  [1000, 2000],
];
export const HANDS_PER_LEVEL = 8;
export const STREETS = ["프리플롭", "플롭", "턴", "리버"] as const;
export { STEP };

/** A card on the table with its deal order. */
export interface Dealt extends Card {
  id: number;
}
export interface Player extends Seat {
  /**
   * Faces an all-in raise short of a full raise after having acted already: it may call or fold, not raise
   * (an incomplete raise does not reopen the betting).
   */
  capped: boolean;
  /** What the seat did last this hand, as the table says it: "SB", "BB", "체크", "콜", "베팅", "레이즈", "올인", "폴드". */
  last: string;
  /** Bets and raises this seat made this hand, before the flop and after it (what everyone saw). */
  raised: [number, number];
}
export interface Table extends Betting {
  seats: Player[];
  /** The least a raise must add on top of the bet: the last full raise this round, at least the big blind. */
  minRaise: number;
  /** The blinds of this hand. */
  blinds: [number, number];
  /** The last seat to bet or raise this round, -1 for none. */
  raiser: number;
}
export type Phase = "idle" | "betting" | "handOver" | "sessionOver";
export interface Result {
  /** Seats that took chips. */
  winners: number[];
  net: number[];
  /** Hands shown at the showdown, by seat; null for seats that folded, sat out or won uncontested. */
  shown: (string | null)[];
  showdown: boolean;
  /** Each pot, main pot first, and the seats that shared it; an uncontested one is a bet handed back. */
  pots: { amount: number; winners: number[]; contested: boolean }[];
}
export interface State {
  phase: Phase;
  table: Table;
  /** Seat with the dealer button; -1 before the first hand. */
  button: number;
  deck: Card[];
  /** Each seat's two hole cards. */
  hands: Dealt[][];
  /** The community cards, face up in the middle: three on the flop, then the turn and the river. */
  board: Dealt[];
  /** 0 preflop, 1 flop, 2 turn, 3 river. */
  street: number;
  /** The seat that bet or raised last in the round before this one, -1 for none: it may follow its bet up. */
  aggressor: number;
  round: number;
  nextId: number;
  result: Result | null;
  /** True when seat 0 took every chip, false when it lost them. */
  won: boolean | null;
  /**
   * Over Wi-Fi (와이파이 여럿이): the seats played by people. Left out, the session ends when seat 0 or every other
   * seat runs out of chips; given, it ends when fewer than two seats hold chips or no person's seat does.
   */
  people?: number[];
}

export const blindsOf = (round: number): [number, number] => {
  const level = BLINDS[Math.min(BLINDS.length - 1, Math.floor(Math.max(0, round - 1) / HANDS_PER_LEVEL))];
  return [level[0], level[1]];
};
const player = (chips: number): Player => ({ ...createSeat(chips), capped: false, last: "", raised: [0, 0] });

export function createSession(opponents = 1, people?: number[]): State {
  const seats = Math.max(1, Math.min(MAX_OPPONENTS, Math.floor(opponents))) + 1;
  return {
    ...(people ? { people: people.slice() } : {}),
    phase: "idle",
    table: {
      seats: Array.from({ length: seats }, () => player(START_CHIPS)),
      turn: -1,
      high: 0,
      raises: 0,
      ante: 0,
      minRaise: BLINDS[0][1],
      blinds: [...BLINDS[0]] as [number, number],
      raiser: -1,
    },
    button: -1,
    deck: [],
    hands: Array.from({ length: seats }, () => []),
    board: [],
    street: 0,
    aggressor: -1,
    round: 0,
    nextId: 0,
    result: null,
    won: null,
  };
}
export const cloneTable = (t: Table): Table => ({
  ...t,
  blinds: [...t.blinds],
  seats: t.seats.map((s) => ({ ...s, raised: [...s.raised] as [number, number] })),
});
const clone = (s: State): State => ({
  ...s,
  table: cloneTable(s.table),
  deck: s.deck.slice(),
  hands: s.hands.map((h) => h.slice()),
  board: s.board.slice(),
});
const canAct = (s: Player) => !s.out && !s.folded && !s.allIn;
/** The next seat after `from`, clockwise, that is dealt in this hand. */
export function nextLive(t: Table, from: number) {
  const n = t.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n;
    if (!t.seats[i].out) return i;
  }
  return -1;
}
/**
 * Whether seat `i` still has something to do this round: a bet to answer, or no action yet while another seat
 * could still answer one of its own.
 */
function owes(t: Table, i: number) {
  const s = t.seats[i];
  if (!canAct(s)) return false;
  if (s.street < t.high) return true;
  return !s.acted && t.seats.some((o, j) => j !== i && canAct(o));
}
/** The first seat at or after `from` that has to act, or -1 when the round is over. */
function firstOwing(t: Table, from: number) {
  if (contenders(t).length < 2) return -1;
  const n = t.seats.length;
  for (let k = 0; k < n; k++) {
    const i = (((from + k) % n) + n) % n;
    if (owes(t, i)) return i;
  }
  return -1;
}
const put = (seat: Player, amount: number) => {
  seat.chips -= amount;
  seat.street += amount;
  seat.total += amount;
  if (seat.chips === 0) seat.allIn = true;
};
/** What the seat to act may do, with the chips each choice puts in now. */
export function options(t: Table) {
  const seat = t.seats[t.turn];
  if (!seat || !canAct(seat)) return null;
  const need = t.high - seat.street,
    call = Math.min(need, seat.chips),
    // Nobody is left to answer a raise once every other seat is all in.
    answerable = t.seats.some((s) => s !== seat && canAct(s)),
    open = answerable && !seat.capped && seat.chips > need,
    // The smallest full raise; with nothing bet yet, a bet of the big blind.
    least = need + t.minRaise;
  return {
    fold: true,
    /** 0 is a check. */
    call,
    /** The smallest raise (or bet); any amount from it up to below `allIn` may be made. */
    raise: open && least < seat.chips ? least : null,
    allIn: open ? seat.chips : null,
  };
}
export type Options = NonNullable<ReturnType<typeof options>>;
/** A raise of `cost` chips (put in now) by `seat`: a full raise reopens the betting, a short all-in does not. */
function raise(t: Table, seat: Player, cost: number, street: number) {
  const before = t.high;
  put(seat, cost);
  const increase = seat.street - before;
  if (increase <= 0) return;
  seat.raised[street > 0 ? 1 : 0]++;
  const full = increase >= t.minRaise;
  t.high = seat.street;
  t.raises++;
  t.raiser = t.seats.indexOf(seat);
  if (full) t.minRaise = increase;
  for (const other of t.seats)
    if (other !== seat && canAct(other)) {
      if (full) {
        other.acted = false;
        other.capped = false;
      } else if (other.acted) {
        other.acted = false;
        other.capped = true;
      }
    }
}
/**
 * Applies `action` for the seat to act on a draft table. `amount` is what a raise puts in now (the smallest raise
 * when left out). False when it is not allowed.
 */
export function apply(t: Table, action: Action, amount?: number, street = 0): boolean {
  const choice = options(t);
  if (!choice) return false;
  const seat = t.seats[t.turn],
    opened = t.high > 0;
  if (action === "fold") {
    seat.folded = true;
    seat.last = "폴드";
  } else if (action === "call") {
    put(seat, choice.call);
    seat.last = choice.call === 0 ? "체크" : seat.allIn ? "올인" : "콜";
  } else if (action === "raise") {
    const cost = amount ?? choice.raise;
    if (
      choice.raise === null ||
      cost === null ||
      !Number.isInteger(cost) ||
      cost % STEP !== 0 ||
      cost < choice.raise ||
      cost >= seat.chips
    )
      return false;
    raise(t, seat, cost, street);
    seat.last = opened ? "레이즈" : "베팅";
  } else if (action === "allIn") {
    if (choice.allIn === null) return false;
    raise(t, seat, seat.chips, street);
    seat.last = "올인";
  } else return false;
  seat.acted = true;
  seat.capped = false;
  t.turn = firstOwing(t, t.turn + 1);
  return true;
}
/** Posts a blind: all the seat has when it has less. */
function post(seat: Player, blind: number, name: string) {
  put(seat, Math.min(blind, seat.chips));
  seat.last = name;
}
/**
 * Pays every pot to its strongest eligible seats. Equal hands split it; chips that cannot be split evenly go one
 * `STEP` at a time to the winners nearest the button's left. Returns the chips each seat received.
 */
function award(s: State, strength: (seat: number) => number) {
  const t = s.table,
    n = t.seats.length,
    won = t.seats.map(() => 0),
    // Seats in order from the button's left.
    order = (seats: number[]) =>
      seats.slice().sort((a, b) => ((a - s.button - 1 + n * 2) % n) - ((b - s.button - 1 + n * 2) % n)),
    pots: Result["pots"] = [];
  for (const { amount, eligible } of sidePots(t)) {
    const best = Math.max(...eligible.map(strength)),
      winners = order(eligible.filter((i) => strength(i) === best)),
      share = Math.floor(amount / winners.length / STEP) * STEP;
    winners.forEach((i) => (won[i] += share));
    let rest = amount - share * winners.length;
    for (let k = 0; rest > 0; k = (k + 1) % winners.length) {
      const chip = Math.min(STEP, rest);
      won[winners[k]] += chip;
      rest -= chip;
    }
    // A pot only one seat could take is a bet nobody called, handed back.
    pots.push({ amount, winners, contested: eligible.length > 1 });
  }
  won.forEach((amount, i) => (t.seats[i].chips += amount));
  return { won, pots };
}
/** The best hand a seat makes with the board. */
export const handOf = (s: State, seat: number) => evaluate([...s.hands[seat], ...s.board]);
function finish(s: State) {
  const t = s.table,
    alive = contenders(t),
    showdown = alive.length > 1,
    before = t.seats.map((seat) => seat.total),
    scores = t.seats.map((_, i) => (showdown && alive.includes(i) ? handOf(s, i).score : 0)),
    { won, pots } = award(s, (seat) => (showdown ? scores[seat] : 1));
  s.phase = "handOver";
  t.turn = -1;
  s.result = {
    // Those who took a pot somebody else could have taken; the last seat in when everybody else folded.
    winners: showdown ? [...new Set(pots.flatMap((p) => (p.contested ? p.winners : [])))].sort((a, b) => a - b) : alive,
    net: won.map((w, i) => w - before[i]),
    shown: t.seats.map((_, i) => (showdown && alive.includes(i) ? handOf(s, i).detail : null)),
    showdown,
    pots,
  };
  for (const seat of t.seats) seat.out = seat.chips <= 0;
  if (s.people) {
    if (t.seats.filter((seat) => !seat.out).length < 2 || s.people.every((i) => t.seats[i]?.out ?? true)) s.phase = "sessionOver";
  } else if (t.seats[0].out) {
    s.phase = "sessionOver";
    s.won = false;
  } else if (t.seats.slice(1).every((seat) => seat.out)) {
    s.phase = "sessionOver";
    s.won = true;
  }
}
/**
 * Moves on while no seat has to act: deals the next community cards and opens their betting round, or ends the
 * hand. With every seat all in, the rest of the board is dealt out in one go.
 */
function advance(s: State) {
  const t = s.table;
  while (t.turn === -1) {
    if (contenders(t).length < 2 || s.street === 3) {
      finish(s);
      return;
    }
    s.street++;
    s.aggressor = t.raiser;
    t.raiser = -1;
    for (let k = s.street === 1 ? 3 : 1; k > 0; k--) s.board.push({ ...s.deck.pop()!, id: s.nextId++ });
    for (const seat of t.seats) {
      seat.street = 0;
      seat.acted = false;
      seat.capped = false;
      if (!seat.folded && !seat.allIn) seat.last = "";
    }
    t.high = 0;
    t.raises = 0;
    t.minRaise = t.blinds[1];
    // After the flop the first seat left of the button speaks first.
    t.turn = firstOwing(t, s.button + 1);
  }
}
/** The seats that post the small and big blind this hand, for a button at `button`. */
export function blindSeats(t: Table, button: number): [number, number] {
  const dealt = t.seats.filter((seat) => !seat.out).length,
    // Two players: the button posts the small blind and speaks first before the flop.
    small = dealt === 2 ? button : nextLive(t, button);
  return [small, nextLive(t, small)];
}
/**
 * Moves the button, posts the blinds, shuffles and deals two cards to every seat still in the game, one at a
 * time from the button's left. The seat after the big blind speaks first.
 */
export function start(state: State, random: Random = cryptoRandom): State | null {
  if (state.phase !== "idle" && state.phase !== "handOver") return null;
  const s = clone(state),
    t = s.table;
  for (const seat of t.seats) {
    seat.street = seat.total = 0;
    seat.folded = seat.acted = seat.allIn = seat.capped = false;
    seat.out = seat.chips <= 0;
    seat.last = "";
    seat.raised = [0, 0];
  }
  if (t.seats.filter((seat) => !seat.out).length < 2) return null;
  s.result = null;
  s.round++;
  s.button = nextLive(t, s.button);
  t.blinds = blindsOf(s.round);
  const [small, big] = blindSeats(t, s.button);
  post(t.seats[small], t.blinds[0], "SB");
  post(t.seats[big], t.blinds[1], "BB");
  // The bet to call is the whole big blind, even when the big blind could not post all of it.
  t.high = t.blinds[1];
  t.minRaise = t.blinds[1];
  t.raises = 0;
  t.ante = 0;
  t.raiser = -1;
  s.aggressor = -1;
  s.deck = shuffle(createDeck(1), random);
  s.hands = s.hands.map(() => []);
  s.board = [];
  s.street = 0;
  for (let round = 0; round < 2; round++)
    for (let k = 0, i = s.button; k < t.seats.length; k++) {
      i = nextLive(t, i);
      s.hands[i].push({ ...s.deck.pop()!, id: s.nextId++ });
      if (i === s.button) break;
    }
  s.phase = "betting";
  t.turn = firstOwing(t, big + 1);
  advance(s);
  return s;
}
/** One betting action by the seat to act; `amount` is what a raise puts in now. */
export function act(state: State, action: Action, amount?: number): State | null {
  if (state.phase !== "betting" || state.table.turn < 0) return null;
  const s = clone(state);
  if (!apply(s.table, action, amount, s.street)) return null;
  advance(s);
  return s;
}
export const potOf = (state: State) => pot(state.table);
