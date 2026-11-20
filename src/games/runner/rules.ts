import type { Effect, Move, PointGame, Winner } from "../points/types";
import { HEARTS, STAGES, stageOf } from "./sim";

/**
 * 네모 러너: the runner runs round the inside of a square room by himself (see `sim.ts`, stepped by the view in real
 * time). The rules know only the stage, the hearts and the clock. A stage is won by lasting its time with a heart
 * left, or, in a boss stage, by bringing the boss down; it is lost when the last heart goes. No score is kept.
 *
 * Moves (all `{from: -1, to, extra: -1}`):
 * - `TICK`: a second of the stage gone by (timed stages only); the last one wins.
 * - `HURT`: a heart lost (a wall run into, a stack, a square, the boss); the last one loses.
 * - `BOSS`: the boss struck by a square knocked back at it; its last point wins.
 * - `SMASH`, `TURN`, `PORTAL`: a square knocked away, a tumble onto a wall, a hole gone through. They change nothing
 *   but `last` (the view reports them so that they are heard).
 * - `STRIKE`, `JUMP`: the player's tap and swipe (or keys). They are counted (`strikes`, `jumps`) and the view hands
 *   each to the room when it sees the count go up.
 */
export const TICK = 0,
  HURT = 1,
  BOSS = 2,
  SMASH = 3,
  TURN = 4,
  PORTAL = 5,
  STRIKE = 10,
  JUMP = 11;
export interface State {
  stage: number;
  hearts: number;
  /** Seconds left of a timed stage (0 in a boss stage), and the boss's points left (0 where there is none). */
  left: number;
  boss: number;
  bossMax: number;
  strikes: number;
  jumps: number;
  winner: Winner;
  last: number | null;
  /** Why it ended, for the result. */
  cause: "time" | "boss" | "hearts" | null;
  ply: number;
}
export const STAGE_COUNT = STAGES.length;
export const isBoss = (stage: number) => !!stageOf(stage).boss;
export function createGame(stage = 1): State {
  const spec = stageOf(stage);
  return {
    stage: STAGES.indexOf(spec) + 1,
    hearts: HEARTS,
    left: spec.time,
    boss: spec.boss?.hp ?? 0,
    bossMax: spec.boss?.hp ?? 0,
    strikes: 0,
    jumps: 0,
    winner: null,
    last: null,
    cause: null,
    ply: 0,
  };
}
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : [...(state.bossMax ? [BOSS] : [TICK]), HURT, SMASH, TURN, PORTAL, STRIKE, JUMP].map((to) => ({ from: -1, to, extra: -1 }));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const next: State = { ...state, last: move.to, ply: state.ply + 1 };
  switch (move.to) {
    case TICK: {
      if (state.bossMax) return null;
      const left = Math.max(0, state.left - 1);
      return { ...next, left, winner: left === 0 ? 0 : null, cause: left === 0 ? "time" : null };
    }
    case HURT: {
      const hearts = Math.max(0, state.hearts - 1);
      return { ...next, hearts, winner: hearts === 0 ? 1 : null, cause: hearts === 0 ? "hearts" : null };
    }
    case BOSS: {
      if (!state.bossMax) return null;
      const boss = Math.max(0, state.boss - 1);
      return { ...next, boss, winner: boss === 0 ? 0 : null, cause: boss === 0 ? "boss" : null };
    }
    case SMASH:
    case TURN:
    case PORTAL:
      return next;
    case STRIKE:
      return { ...next, strikes: state.strikes + 1 };
    case JUMP:
      return { ...next, jumps: state.jumps + 1 };
  }
  return null;
}
const effect = (): Effect | null => null;
/** A name with its object particle (을 after a final consonant, 를 after a vowel). */
const object = (name: string) => {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  return name + (code >= 0 && code < 11172 && code % 28 ? "을" : "를");
};
const hearts = (n: number) => `하트 ${n}개`;
export const runner: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: () => 0,
  hint: (s) =>
    `${s.stage}단계 ${stageOf(s.stage).name} · ${hearts(s.hearts)} · ${s.bossMax ? `보스 ${s.boss}/${s.bossMax}` : `남은 시간 ${s.left}초`}`,
  tally: (s) => [`${s.stage}단계 · ${hearts(s.hearts)} · ${s.bossMax ? `보스 ${s.boss}/${s.bossMax}` : `${s.left}초`}`, ""],
  reason: (s) =>
    s.winner === 0
      ? s.cause === "boss"
        ? `성공! ${object(stageOf(s.stage).boss!.name)} 쓰러뜨렸습니다. 하트 ${s.hearts}개가 남았습니다.`
        : `성공! ${stageOf(s.stage).time}초를 버텼습니다. 하트 ${s.hearts}개가 남았습니다.`
      : s.bossMax
        ? `실패. 하트를 모두 잃었습니다. 보스가 ${s.boss}번 더 맞아야 했습니다.`
        : `실패. 하트를 모두 잃었습니다. ${s.left}초만 더 버티면 됐습니다.`,
};
