/**
 * Chips and betting shared by the card games played against computer seats.
 * It knows nothing about cards: a game deals, calls these helpers on a copy
 * of its state, and ranks the hands at the end.
 */
export interface Seat {
  chips: number;
  /** Chips put in during the current betting round. */
  street: number;
  /** Chips put in during the whole hand. */
  total: number;
  folded: boolean;
  allIn: boolean;
  /** Out of chips between hands; no longer dealt in. */
  out: boolean;
  /** Has acted since the last raise. */
  acted: boolean;
}
export interface Betting {
  seats: Seat[];
  /** Seat to act, or -1 when the betting round is over. */
  turn: number;
  /** Highest `street` amount so far. */
  high: number;
  raises: number;
  ante: number;
}
export type Action = "fold" | "call" | "raise" | "allIn";
export const MAX_RAISES = 3;
export const STEP = 10;

export const createSeat = (chips: number): Seat => ({
  chips,
  street: 0,
  total: 0,
  folded: false,
  allIn: false,
  out: chips <= 0,
  acted: false,
});
export const pot = (b: Betting) => b.seats.reduce((sum, s) => sum + s.total, 0);
/** Seats still competing for the pot. */
export const contenders = (b: Betting) =>
  b.seats.flatMap((s, i) => (!s.out && !s.folded ? [i] : []));
const canAct = (s: Seat) => !s.out && !s.folded && !s.allIn;
const put = (b: Betting, seat: Seat, amount: number) => {
  seat.chips -= amount;
  seat.street += amount;
  seat.total += amount;
  if (seat.chips === 0) seat.allIn = true;
  if (seat.street > b.high) {
    b.high = seat.street;
    b.raises++;
    for (const other of b.seats) if (other !== seat) other.acted = false;
  }
};
/** Takes the ante from every seat in the hand and clears the last hand. */
export function ante(b: Betting) {
  for (const s of b.seats) {
    s.street = s.total = 0;
    s.folded = s.acted = false;
    s.allIn = false;
    s.out = s.chips <= 0;
    if (s.out) continue;
    const amount = Math.min(b.ante, s.chips);
    s.chips -= amount;
    s.total += amount;
    if (s.chips === 0) s.allIn = true;
  }
}
/** Starts a betting round with the first seat at or after `first` that can act. */
export function openStreet(b: Betting, first: number) {
  for (const s of b.seats) {
    s.street = 0;
    s.acted = false;
  }
  b.high = 0;
  b.raises = 0;
  b.turn = -1;
  if (contenders(b).length < 2 || b.seats.filter(canAct).length < 2) return;
  for (let k = 0; k < b.seats.length; k++) {
    const i = (first + k) % b.seats.length;
    if (canAct(b.seats[i])) {
      b.turn = i;
      return;
    }
  }
}
/** What the seat to act may do, with the chips each choice costs. */
export function options(b: Betting) {
  const seat = b.seats[b.turn];
  if (!seat || !canAct(seat)) return null;
  const need = b.high - seat.street,
    call = Math.min(need, seat.chips),
    // A raise adds half the pot as it would stand after calling.
    half = Math.max(b.ante, Math.ceil((pot(b) + need) / 2 / STEP) * STEP),
    cost = need + half,
    // Nobody is left to answer a raise once every other seat is all in.
    answerable = b.seats.some((s) => s !== seat && canAct(s));
  return {
    fold: true,
    /** 0 is a check. */
    call,
    raise: answerable && b.raises < MAX_RAISES && cost < seat.chips ? cost : null,
    allIn: answerable && seat.chips > call ? seat.chips : null,
  };
}
/** Applies `action` for the seat to act on a draft. False when it is not allowed. */
export function apply(b: Betting, action: Action): boolean {
  const choice = options(b);
  if (!choice) return false;
  const seat = b.seats[b.turn];
  if (action === "fold") seat.folded = true;
  else if (action === "call") put(b, seat, choice.call);
  else if (action === "raise") {
    if (choice.raise === null) return false;
    put(b, seat, choice.raise);
  } else if (action === "allIn") {
    if (choice.allIn === null) return false;
    put(b, seat, choice.allIn);
  } else return false;
  seat.acted = true;
  b.turn = -1;
  if (contenders(b).length < 2) return true;
  for (let k = 1; k <= b.seats.length; k++) {
    const i = (b.seats.indexOf(seat) + k) % b.seats.length,
      next = b.seats[i];
    if (canAct(next) && (!next.acted || next.street < b.high)) {
      b.turn = i;
      break;
    }
  }
  return true;
}
/**
 * Splits the chips into a main pot and side pots by how much each seat that
 * is still in could match. Chips from folded seats stay in as dead money.
 */
export function sidePots(b: Betting) {
  const live = contenders(b),
    levels = [...new Set(live.map((i) => b.seats[i].total))].sort((x, y) => x - y),
    pots: { amount: number; eligible: number[] }[] = [];
  let previous = 0;
  for (const level of levels) {
    const amount = b.seats.reduce(
      (sum, s) => sum + Math.min(s.total, level) - Math.min(s.total, previous),
      0,
    );
    if (amount > 0)
      pots.push({ amount, eligible: live.filter((i) => b.seats[i].total >= level) });
    previous = level;
  }
  const rest = pot(b) - pots.reduce((sum, p) => sum + p.amount, 0);
  if (rest > 0 && pots.length) pots[pots.length - 1].amount += rest;
  return pots;
}
/**
 * Pays every pot to its strongest eligible seat and returns the chips each
 * seat received. Equal strengths share; an odd chip goes to the earliest seat.
 */
export function payout(b: Betting, strength: (seat: number) => number): number[] {
  const won = b.seats.map(() => 0);
  for (const { amount, eligible } of sidePots(b)) {
    const best = Math.max(...eligible.map(strength)),
      winners = eligible.filter((i) => strength(i) === best),
      share = Math.floor(amount / winners.length / STEP) * STEP;
    winners.forEach((i) => (won[i] += share));
    won[winners[0]] += amount - share * winners.length;
  }
  won.forEach((amount, i) => (b.seats[i].chips += amount));
  return won;
}
export const cloneBetting = (b: Betting): Betting => ({
  ...b,
  seats: b.seats.map((s) => ({ ...s })),
});
