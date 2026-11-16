import type { Effect, Move, PointGame, Winner } from "../points/types";
import { KINDS } from "./sim";

/**
 * A claw machine: a number of tries (coins), each steering the claw over a
 * pit of soft toys and letting it down to catch one. The machine itself is
 * played in real time by the view (see `sim.ts`). The player's own moves are
 * the lever pushed one way and let go again (`STEER + dir`, `RELEASE + dir`)
 * and the button (`DROP`), which change nothing here but are passed on to
 * the machine; the machine reports what a
 * try came to: a toy down the chute (`PRIZE + kind`) or nothing (`MISSED`),
 * and now and then a toy that fell in by itself (`BONUS + kind`). The game
 * ends with the last try, won if anything was caught.
 */
export const STEER = 10,
  RELEASE = 14,
  DROP = 20,
  MISSED = 1,
  PRIZE = 30,
  BONUS = 40;
/** The levels: the machine's grip (see `GRIP` in the machine) and the tries a game gives. */
export const LEVELS = [
  { name: "후한 기계", tries: 10 },
  { name: "보통 기계", tries: 10 },
  { name: "짠 기계", tries: 12 },
];
export interface State {
  level: number;
  tries: number;
  /** The kinds of toy caught, in order. */
  prizes: number[];
  winner: Winner;
  last: number | null;
  ply: number;
}
export const createGame = (level = 1): State => {
  const lv = Math.max(1, Math.min(LEVELS.length, Math.round(level) || 1));
  return { level: lv, tries: LEVELS[lv - 1].tries, prizes: [], winner: null, last: null, ply: 0 };
};
const ended = (state: State): State => (state.tries <= 0 ? { ...state, winner: state.prizes.length ? 0 : 1 } : state);
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : [STEER, STEER + 1, STEER + 2, STEER + 3, RELEASE, RELEASE + 1, RELEASE + 2, RELEASE + 3, DROP, MISSED, ...KINDS.flatMap((_, k) => [PRIZE + k, BONUS + k])].map((to) => ({ from: -1, to, extra: -1 }));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const to = move.to,
    next = { ...state, last: to, ply: state.ply + 1 };
  if ((to >= STEER && to < RELEASE + 4) || to === DROP) return next;
  if (to === MISSED) return ended({ ...next, tries: state.tries - 1 });
  if (to >= PRIZE && to < PRIZE + KINDS.length) return ended({ ...next, tries: state.tries - 1, prizes: [...state.prizes, to - PRIZE] });
  if (to >= BONUS && to < BONUS + KINDS.length) return { ...next, prizes: [...state.prizes, to - BONUS] };
  return null;
}
const effect = (): Effect | null => null;
export const clawMachine: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state) => state.prizes.length,
  hint: (state) => `남은 횟수 ${state.tries} · 뽑은 인형 ${state.prizes.length}개 — 집게를 옮기고 뽑기 버튼을 누르세요.`,
  tally: (state) => [`뽑은 인형 ${state.prizes.length}개 · 남은 횟수 ${state.tries}`, ""],
  reason: (state) =>
    state.prizes.length
      ? `인형 ${state.prizes.length}개를 뽑았습니다! ${state.prizes.map((k) => KINDS[k].name).join(", ")}.`
      : "하나도 뽑지 못했습니다. 집게를 인형 한가운데에 맞춰 내려 보세요.",
};
