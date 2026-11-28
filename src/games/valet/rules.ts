import type { Effect, Move, PointGame, Winner } from "../points/types";
import { ANGRY_FINE, BUMP_FINE, PAY, STAGE_NAMES, TIDY, TIP } from "./sim";

/**
 * A valet's shift at a car park: customers leave their cars at the entrance and come back for them, and I drive each
 * into a bay and later out to the exit. The lot itself is played in real time by the view (see `sim.ts`); the moves
 * are what it reports: a car parked or handed back (for its pay), a bump, a customer out of patience, and the end of
 * the shift.
 */
export const BUMP = 1,
  ANGRY = 2,
  END = 3,
  /** A car parked is a move to `PARKED + pay`, one handed back to `RETURNED + pay`. */
  PARKED = 100,
  RETURNED = 200,
  MOST = PAY + TIP + TIDY;
export interface State {
  /** The lot: 1 to 3. */
  stage: number;
  money: number;
  parked: number;
  returned: number;
  bumps: number;
  angry: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
export const stageOf = (variant: string) => Math.max(1, Math.min(STAGE_NAMES.length, Math.round(Number(variant)) || 1));
export const createGame = (stage = 1): State => ({ stage: stageOf(String(stage)), money: 0, parked: 0, returned: 0, bumps: 0, angry: 0, winner: null, last: null, ply: 0 });
const plain = (to: number): Move => ({ from: -1, to, extra: -1 });
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : [BUMP, ANGRY, END, ...Array.from({ length: MOST + 1 }, (_, n) => PARKED + n), ...Array.from({ length: MOST + 1 }, (_, n) => RETURNED + n)].map(plain);
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to)) return null;
  const next: State = { ...state, last: move.to, ply: state.ply + 1 };
  if (move.to === BUMP) return { ...next, bumps: state.bumps + 1, money: state.money - BUMP_FINE };
  if (move.to === ANGRY) return { ...next, angry: state.angry + 1, money: state.money - ANGRY_FINE };
  if (move.to === END) return { ...next, winner: 0 };
  const back = move.to >= RETURNED,
    pay = move.to - (back ? RETURNED : PARKED);
  if (move.to < PARKED || pay < 0 || pay > MOST) return null;
  return back ? { ...next, returned: state.returned + 1, money: state.money + pay } : { ...next, parked: state.parked + 1, money: state.money + pay };
}
export const parkedMove = (pay: number) => plain(PARKED + pay);
export const returnedMove = (pay: number) => plain(RETURNED + pay);
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const effect = (): Effect | null => null;
export const valet: PointGame<State> = {
  create: (variant) => createGame(stageOf(variant)),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state) => state.money,
  hint: (state) => `수입 ${won(state.money * 100)} · 주차 ${state.parked}대 · 출차 ${state.returned}대`,
  tally: (state) => [`수입 ${won(state.money * 100)} · 주차 ${state.parked} · 출차 ${state.returned} · 접촉 ${state.bumps} · 화난 손님 ${state.angry}`, ""],
  reason: (state) => `수입 ${won(state.money * 100)}! 차 ${state.parked}대를 주차하고 ${state.returned}대를 내어 드렸습니다. 접촉 사고 ${state.bumps}번, 화난 손님 ${state.angry}명.`,
};
