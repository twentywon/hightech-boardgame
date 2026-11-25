import { cryptoRandom } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import { SPOTS, limitOf, payoutOf } from "./bets";
import { colourOf, numberOf, type Colour } from "./sim";

/**
 * Roulette's books. A tap on the layout bets the chip chosen on that spot (the move to the spot's index); the tools
 * choose a chip (`CHIP + k`), take back the last chip (`UNDO`), take every chip back (`CLEAR`), lay the last spin's
 * bets again (`REBET`), spin (`SPIN`) and stand up with what one has (`CASH`, only with nothing on the table).
 *
 * The spin is decided here, not by the view: the state carries a seed, and `SPIN` runs the wheel's own physics from
 * it (`numberOf` in `sim.ts`) to the pocket the ball comes to rest in; the view runs the same spin from the same seed
 * and shows the ball coming to rest there. The next seed is drawn by the state's own generator, so no one can tell it
 * from what is shown. The game ends when the chips left cannot make the smallest bet (lost), or by `CASH`: won when
 * one stands up with more than one sat down with.
 */
export const CHIP = 1000,
  UNDO = 1100,
  CLEAR = 1101,
  REBET = 1102,
  SPIN = 1103,
  CASH = 1104;
/** The chips one may bet, and what one sits down with. */
export const CHIPS = [1, 5, 25, 100];
export const START = 1000;
/** How many past numbers the board keeps. */
export const HISTORY = 14;
export interface Result {
  number: number;
  colour: Colour;
  /** Bet on the spin, and paid back (stakes of the winning bets with their winnings). */
  staked: number;
  paid: number;
  /** The spots that won. */
  won: number[];
  /** The seed it was spun from (the view spins it again). */
  seed: number;
}
export interface State {
  /** Chips in hand (bets on the table are already taken from it). */
  balance: number;
  /** The chip chosen (its index in `CHIPS`). */
  chip: number;
  /** Chips on each spot, by its index in `SPOTS`. */
  bets: number[];
  /** The spots chips were laid on, in order (for 되돌리기), with each chip's value. */
  placed: [number, number][];
  /** The last spin's bets, for 다시 걸기. */
  lastBets: number[] | null;
  history: number[];
  spins: number;
  /** The seed of the next spin. */
  seed: number;
  result: Result | null;
  start: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
const empty = () => SPOTS.map(() => 0);
export const staked = (state: State) => state.bets.reduce((a, b) => a + b, 0);
const nextSeed = (seed: number) => (seed * 48271) % 2147483647 || 1;
export function createGame(seed = 1 + Math.floor(cryptoRandom() * 2147483645)): State {
  return { balance: START, chip: 0, bets: empty(), placed: [], lastBets: null, history: [], spins: 0, seed, result: null, start: START, winner: null, last: null, ply: 0 };
}
/** Whether the chip chosen can go on `spot` (it is in hand, and the spot's limit is not passed). */
export const canBet = (state: State, spot: number, value = CHIPS[state.chip]) => state.winner === null && !!SPOTS[spot] && state.balance >= value && state.bets[spot] + value <= limitOf(SPOTS[spot]);
/** Whether the last spin's bets can be laid again: nothing on the table yet, and enough in hand. */
export const canRebet = (state: State) => {
  const last = state.lastBets;
  return state.winner === null && !!last && staked(state) === 0 && last.reduce((a, b) => a + b, 0) <= state.balance;
};
const made = (to: number): Move => ({ from: -1, to, extra: -1 });
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const list: number[] = [];
  CHIPS.forEach((value, k) => {
    if (value <= state.balance + staked(state)) list.push(CHIP + k);
  });
  SPOTS.forEach((_, id) => {
    if (canBet(state, id)) list.push(id);
  });
  if (state.placed.length) list.push(UNDO, CLEAR, SPIN);
  if (canRebet(state)) list.push(REBET);
  if (!state.placed.length) list.push(CASH);
  return list.map(made);
}
/** The spin of `seed` played against `bets`: the number, and what each spot brings back. */
export function settle(bets: number[], seed: number): Result {
  const number = numberOf(seed),
    won: number[] = [];
  let paid = 0;
  bets.forEach((amount, id) => {
    if (amount > 0 && SPOTS[id].numbers.includes(number)) {
      won.push(id);
      paid += amount * (payoutOf(SPOTS[id].numbers.length) + 1);
    }
  });
  return { number, colour: colourOf(number), staked: bets.reduce((a, b) => a + b, 0), paid, won, seed };
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const to = move.to,
    next: State = { ...state, last: to, ply: state.ply + 1 };
  if (to >= 0 && to < SPOTS.length) {
    if (!canBet(state, to)) return null;
    const value = CHIPS[state.chip],
      bets = [...state.bets];
    bets[to] += value;
    return { ...next, bets, balance: state.balance - value, placed: [...state.placed, [to, value]], result: null };
  }
  if (to >= CHIP && to < CHIP + CHIPS.length) return { ...next, chip: to - CHIP };
  if (to === UNDO || to === CLEAR) {
    if (!state.placed.length) return null;
    if (to === CLEAR) return { ...next, bets: empty(), placed: [], balance: state.balance + staked(state) };
    const [spot, value] = state.placed[state.placed.length - 1],
      bets = [...state.bets];
    bets[spot] -= value;
    return { ...next, bets, placed: state.placed.slice(0, -1), balance: state.balance + value };
  }
  if (to === REBET) {
    if (!canRebet(state)) return null;
    const bets = [...state.lastBets!],
      placed: [number, number][] = [];
    bets.forEach((amount, id) => {
      if (amount > 0) placed.push([id, amount]);
    });
    return { ...next, bets, placed, balance: state.balance - staked({ ...state, bets }), result: null };
  }
  if (to === SPIN) {
    if (!state.placed.length) return null;
    const result = settle(state.bets, state.seed),
      balance = state.balance + result.paid;
    return {
      ...next,
      balance,
      bets: empty(),
      placed: [],
      lastBets: state.bets,
      history: [result.number, ...state.history].slice(0, HISTORY),
      spins: state.spins + 1,
      seed: nextSeed(state.seed),
      result,
      // Out of chips: not even the smallest bet can be made.
      winner: balance < CHIPS[0] ? 1 : null,
    };
  }
  if (to === CASH) {
    if (state.placed.length) return null;
    return { ...next, winner: state.balance > state.start ? 0 : state.balance === state.start ? "draw" : 1 };
  }
  return null;
}
const COLOUR_WORD: Record<Colour, string> = { red: "빨강", black: "검정", green: "초록" };
export const said = (r: Result) => `${r.number} ${COLOUR_WORD[r.colour]}`;
const effect = (): Effect | null => null;
export const roulette: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  // Only a spin counts as a move: laying chips, choosing one and taking them back are choices made toward it (no pause follows them).
  ply: (state) => state.spins,
  evaluate: (state) => state.balance + staked(state),
  hint: (state) => {
    const on = staked(state),
      r = state.result;
    if (r && !on) return `${said(r)}! ${r.paid ? `${r.paid}칩을 받았습니다.` : "건 칩을 잃었습니다."} 칩을 골라 판에 거세요.`;
    return on ? `건 칩 ${on} · 남은 칩 ${state.balance} — 더 걸거나 돌리기를 누르세요.` : `칩 ${state.balance} — 칩을 골라 판을 눌러 거세요.`;
  },
  tally: (state) => [`칩 ${state.balance} · 건 칩 ${staked(state)}`, ""],
  reason: (state) => {
    const gain = state.balance - state.start;
    if (state.balance < CHIPS[0]) return `칩을 모두 잃었습니다. ${state.spins}번 돌렸습니다.`;
    if (gain > 0) return `칩 ${state.balance}개를 들고 일어났습니다. 처음보다 ${gain}개 많습니다!`;
    if (gain === 0) return `칩 ${state.balance}개를 들고 일어났습니다. 처음과 같습니다.`;
    return `칩 ${state.balance}개를 들고 일어났습니다. 처음보다 ${-gain}개 적습니다.`;
  },
};
