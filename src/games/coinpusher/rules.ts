import type { Effect, Move, PointGame, Winner } from "../points/types";
import { AIMS, PRIZES } from "./sim";

/**
 * The coin pusher's books. The machine itself is played in real time by the view (see `sim.ts`); this side knows
 * only the counts. The player's moves are a coin dropped at a place of the chute (`DROP + place`), the chute pushed
 * along to the left or right while a key or button is held (`SLIDE + dir`, let go by `STOP + dir`; dir 0 is left) and
 * a held key or button that keeps dropping coins (`HOLD`, let go by `LET`), which the view carries out; the machine reports what came of them: coins won over the front edge (`WON + n`), coins lost down the
 * gutters (`LOST + n`), a roulette prize (`BONUS + lamp`) and, with nothing left in hand, the board come to rest
 * (`SETTLED`), which ends the game: won when more coins came out than were put in.
 */
export const DROP = 100,
  SLIDE = 200,
  STOP = 210,
  HOLD = 300,
  LET = 301,
  WON = 400,
  LOST = 500,
  BONUS = 600,
  SETTLED = 700;
/** The most coins one move reports. */
export const BATCH = 99;
/** The ways to play: a purse of coins, or coins without end. */
export const MODES = [
  { value: "30", name: "동전 30개", coins: 30 },
  { value: "60", name: "동전 60개", coins: 60 },
  { value: "free", name: "끝없이", coins: 0 },
];
export interface State {
  mode: string;
  /** Coins the game began with (0 without end). */
  start: number;
  endless: boolean;
  hand: number;
  won: number;
  lost: number;
  dropped: number;
  /** The roulette's prizes, by lamp, in order. */
  bonuses: number[];
  /** Where the chute was set for the last coin. */
  aim: number;
  winner: Winner;
  last: number | null;
  ply: number;
}
export function createGame(mode = "30"): State {
  const chosen = MODES.find((m) => m.value === mode) ?? MODES[0];
  return { mode: chosen.value, start: chosen.coins, endless: !chosen.coins, hand: chosen.coins, won: 0, lost: 0, dropped: 0, bonuses: [], aim: Math.floor(AIMS / 2), winner: null, last: null, ply: 0 };
}
const made = (to: number): Move => ({ from: -1, to, extra: -1 });
export const moves = (state: State): Move[] => {
  if (state.winner !== null) return [];
  const list = [HOLD, LET, SLIDE, SLIDE + 1, STOP, STOP + 1];
  if (state.endless || state.hand > 0) list.push(...Array.from({ length: AIMS }, (_, k) => DROP + k));
  return list.map(made);
};
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const to = move.to,
    next: State = { ...state, last: to, ply: state.ply + 1 };
  if (to >= DROP && to < DROP + AIMS) {
    if (!state.endless && state.hand <= 0) return null;
    return { ...next, hand: state.endless ? 0 : state.hand - 1, dropped: state.dropped + 1, aim: to - DROP };
  }
  if (to === HOLD || to === LET || to === SLIDE || to === SLIDE + 1 || to === STOP || to === STOP + 1) return next;
  if (to > WON && to <= WON + BATCH) return { ...next, won: state.won + to - WON };
  if (to > LOST && to <= LOST + BATCH) return { ...next, lost: state.lost + to - LOST };
  if (to >= BONUS && to < BONUS + PRIZES.length) {
    const prize = PRIZES[to - BONUS];
    return { ...next, bonuses: [...state.bonuses, to - BONUS], hand: state.endless ? 0 : state.hand + prize.hand };
  }
  if (to === SETTLED) {
    if (state.endless || state.hand > 0) return null;
    return { ...next, winner: state.won > state.start ? 0 : 1 };
  }
  return null;
}
const effect = (): Effect | null => null;
const purse = (state: State) => (state.endless ? `넣은 동전 ${state.dropped}개` : `남은 동전 ${state.hand}개`);
export const coinPusher: PointGame<State> = {
  create: (variant) => createGame(variant || "30"),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state) => state.won,
  hint: (state) => `${purse(state)} · 딴 동전 ${state.won}개 — 동전을 떨어뜨릴 곳을 누르세요.`,
  tally: (state) => [`딴 동전 ${state.won}개 · ${purse(state)}`, ""],
  reason: (state) =>
    state.won > state.start
      ? `동전 ${state.won}개를 땄습니다! 넣은 ${state.start}개보다 ${state.won - state.start}개 많습니다.`
      : `동전 ${state.won}개를 땄습니다. 넣은 ${state.start}개를 넘지 못했습니다.`,
};
