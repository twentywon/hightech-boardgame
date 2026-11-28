import type { Effect, Move, PointGame, Winner } from "../points/types";
import { BETS, LINE_CHOICES, SYMBOLS, evaluate, unpackStops, type LineWin } from "./sim";

/**
 * The slot machine's books. The reels turn in the view; this side keeps the credits and decides nothing by chance.
 * The moves: the lines played (`LINES + n`, or `LINES` alone for the next the credits cover: the cabinet's button), the
 * bet a line (`BET + b`, or `BET` alone for the next), the most the credits allow (`MAX`), the
 * lever pulled (`PULL`: the view then draws the stops and plays them), the spin itself (`SPIN`, its `extra` the three
 * stops packed, `packStops`: the bet is taken and the win known, but not yet paid), a hurried stop of the next reel
 * (`HURRY`, while the reels turn: it changes nothing here), the reels all come to rest (`SETTLE`: the win is paid),
 * and 정산 (`CASH`): the game ends, won when more credits are left than it began with. Out of credits, it is lost.
 */
export const LINES = 10,
  BET = 20,
  MAX = 40,
  PULL = 100,
  SPIN = 101,
  HURRY = 102,
  SETTLE = 200,
  CASH = 300;
/** The purses one may begin with. */
export const MODES = [
  { value: "300", name: "크레딧 300", credits: 300 },
  { value: "1000", name: "크레딧 1000", credits: 1000 },
  { value: "3000", name: "크레딧 3000", credits: 3000 },
];
export interface State {
  mode: string;
  start: number;
  credits: number;
  lines: number;
  bet: number;
  spins: number;
  /** Credits bet and won over the game, and the best single win. */
  staked: number;
  won: number;
  best: number;
  /** The spin under way: its stops and wins (paid at `SETTLE`). */
  pending: { stops: [number, number, number]; wins: LineWin[]; total: number } | null;
  /** The last spin settled: its stops and what it paid. */
  shown: [number, number, number];
  paid: number;
  cashed: boolean;
  winner: Winner;
  last: number | null;
  ply: number;
}
export function createGame(mode = "1000"): State {
  const chosen = MODES.find((m) => m.value === mode) ?? MODES[1];
  return { mode: chosen.value, start: chosen.credits, credits: chosen.credits, lines: 5, bet: 1, spins: 0, staked: 0, won: 0, best: 0, pending: null, shown: [0, 0, 0], paid: 0, cashed: false, winner: null, last: null, ply: 0 };
}
const made = (to: number, extra = -1): Move => ({ from: -1, to, extra });
/** What a spin costs. */
export const stakeOf = (state: Pick<State, "lines" | "bet">) => state.lines * state.bet;
/** The most a spin can cost with these credits: as many lines as can be paid for, then the largest bet. */
export function most(credits: number) {
  for (const lines of [...LINE_CHOICES].reverse()) {
    const bet = [...BETS].reverse().find((b) => b * lines <= credits);
    if (bet) return { lines, bet };
  }
  return null;
}
/** The bet after `bet` that the credits still cover with these lines (back to the least after the largest). */
export function nextBet(state: State) {
  const fits = BETS.filter((b) => b * state.lines <= state.credits);
  if (!fits.length) return null;
  return fits.find((b) => b > state.bet) ?? fits[0];
}
/** The lines after these that the credits cover at this bet (back to one after five). */
export function nextLines(state: State) {
  const fits = LINE_CHOICES.filter((n) => n * state.bet <= state.credits);
  if (!fits.length) return null;
  return fits.find((n) => n > state.lines) ?? fits[0];
}
/** The lines and bet kept within the credits after a spin: the bet comes down first, then the lines. */
function within(state: State): State {
  let { lines, bet } = state;
  while (lines * bet > state.credits && bet > BETS[0]) bet = [...BETS].reverse().find((b) => b < bet)!;
  while (lines * bet > state.credits && lines > LINE_CHOICES[0]) lines = [...LINE_CHOICES].reverse().find((n) => n < lines)!;
  return { ...state, lines, bet };
}
const idle = (state: State) => state.winner === null && !state.pending;
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  if (state.pending) return [made(HURRY), made(SETTLE)];
  const list: Move[] = [made(CASH)];
  if (nextLines(state) !== null) list.push(made(LINES));
  if (nextBet(state) !== null) list.push(made(BET));
  for (const n of LINE_CHOICES) if (n * state.bet <= state.credits) list.push(made(LINES + n));
  for (const b of BETS) if (b * state.lines <= state.credits) list.push(made(BET + b));
  if (most(state.credits)) list.push(made(MAX));
  if (stakeOf(state) <= state.credits) list.push(made(PULL));
  return list;
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1) return null;
  const to = move.to,
    next: State = { ...state, last: to, ply: state.ply + 1 };
  if (to === SPIN) {
    const stops = unpackStops(move.extra);
    if (!idle(state) || !stops || stakeOf(state) > state.credits) return null;
    const { wins, total } = evaluate(stops, state.lines, state.bet);
    return { ...next, credits: state.credits - stakeOf(state), staked: state.staked + stakeOf(state), spins: state.spins + 1, pending: { stops, wins, total } };
  }
  if (move.extra !== -1) return null;
  if (to === HURRY) return state.pending ? next : null;
  if (to === SETTLE) {
    const p = state.pending;
    if (!p) return null;
    const settled = within({ ...next, credits: state.credits + p.total, won: state.won + p.total, best: Math.max(state.best, p.total), pending: null, shown: p.stops, paid: p.total });
    // Out of credits for the least spin: the game is lost.
    return settled.credits < LINE_CHOICES[0] * BETS[0] ? { ...settled, winner: 1 } : settled;
  }
  if (!idle(state)) return null;
  if (to === PULL) return stakeOf(state) <= state.credits ? next : null;
  if (to === CASH) return { ...next, cashed: true, winner: state.credits > state.start ? 0 : 1 };
  if (to === MAX) {
    const m = most(state.credits);
    return m ? { ...next, ...m } : null;
  }
  if (to === LINES) {
    const n = nextLines(state);
    return n === null ? null : { ...next, lines: n };
  }
  if (to === BET) {
    const b = nextBet(state);
    return b === null ? null : { ...next, bet: b };
  }
  if (to > LINES && to <= LINES + 5) {
    const n = to - LINES;
    return LINE_CHOICES.includes(n) && n * state.bet <= state.credits ? { ...next, lines: n } : null;
  }
  if (to > BET && to <= BET + 10) {
    const b = to - BET;
    return BETS.includes(b) && b * state.lines <= state.credits ? { ...next, bet: b } : null;
  }
  return null;
}
/** The words of a win: each line that paid, with its symbols. */
export const winWords = (wins: LineWin[]) => wins.map((w) => `${w.line + 1}번 라인 ${w.symbols.map((s) => SYMBOLS[s]).join("·")} ${w.pay}`).join(", ");
const effect = (): Effect | null => null;
export const slotMachine: PointGame<State> = {
  create: (variant) => createGame(variant || "1000"),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state) => state.credits,
  hint: (state) =>
    state.pending
      ? "릴이 돌고 있습니다 — 스페이스로 다음 릴을 빨리 멈춥니다."
      : `크레딧 ${state.credits} · ${state.lines}라인 × ${state.bet} = ${stakeOf(state)} — 레버를 당기거나 스페이스를 누르세요.${state.paid ? ` 방금 ${state.paid} 당첨!` : ""}`,
  tally: (state) => [`크레딧 ${state.credits} · 베팅 ${stakeOf(state)} · 당첨 ${state.paid}`, ""],
  reason: (state) =>
    state.cashed
      ? state.credits > state.start
        ? `정산: 크레딧 ${state.credits}! 처음 ${state.start}보다 ${state.credits - state.start} 늘었습니다(${state.spins}번 돌림, 가장 큰 당첨 ${state.best}).`
        : `정산: 크레딧 ${state.credits}. 처음 ${state.start}보다 ${state.start - state.credits} 줄었습니다(${state.spins}번 돌림).`
      : `크레딧을 모두 잃었습니다. ${state.spins}번 돌렸고 가장 큰 당첨은 ${state.best}이었습니다.`,
};
