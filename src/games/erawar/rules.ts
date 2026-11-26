import type { Effect, Move, PointGame, Winner } from "../points/types";
import { ERAS, paceOf } from "./sim";

/**
 * A match of 시대 전쟁: the lane itself is played in real time by the view (`sim.ts`); the only moves are its ends: a
 * base brought down (`FALL + side`, side the one that fell) and the time limit with the bases as they stand
 * (`TIME + 0` side 0 ahead, `TIME + 1` side 1 ahead, `TIME + 2` alike: a draw). Over Wi-Fi the host's view reports
 * them; side 0 is the left base (1번), side 1 the right (2번).
 */
export const FALL = 0,
  TIME = 10;
export interface State {
  /** 보통 or 빠른 판. */
  variant: string;
  /** The time limit (s). */
  limit: number;
  winner: Winner;
  /** How it ended: a base fell, or the time ran out. */
  end: "fall" | "time" | null;
  ply: number;
}
export const VARIANTS = [
  { value: "normal", label: "보통 · 20분" },
  { value: "quick", label: "빠른 판 · 10분" },
];
export const createGame = (variant = "normal"): State => {
  const v = VARIANTS.some((x) => x.value === variant) ? variant : "normal";
  return { variant: v, limit: paceOf(v).limit, winner: null, end: null, ply: 0 };
};
const tool = (to: number): Move => ({ from: -1, to, extra: -1 });
export const fallMove = (side: number) => tool(FALL + side);
export const timeMove = (lead: 0 | 1 | null) => tool(TIME + (lead === null ? 2 : lead));
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  return [tool(FALL), tool(FALL + 1), tool(TIME), tool(TIME + 1), tool(TIME + 2)];
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  if (move.to === FALL || move.to === FALL + 1) return { ...state, winner: move.to === FALL ? 1 : 0, end: "fall", ply: state.ply + 1 };
  if (move.to >= TIME && move.to <= TIME + 2) return { ...state, winner: move.to === TIME + 2 ? "draw" : ((move.to - TIME) as 0 | 1), end: "time", ply: state.ply + 1 };
  return null;
}
const effect = (): Effect | null => null;
const minutes = (s: State) => Math.round(s.limit / 60);
export const eraWar: PointGame<State> = {
  create: (variant) => createGame(variant),
  moves,
  play,
  // Nobody takes turns: both bases train and fight at once.
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [null, null],
  effect,
  ply: (s) => s.ply,
  evaluate: () => 0,
  hint: () => `병사를 뽑아 상대 기지를 무너뜨리세요. 경험치가 차면 다음 시대(${ERAS.map((e) => e.name).join(" → ")})로 넘어갑니다.`,
  tally: () => ["", ""],
  reason: (s) =>
    s.end === "time"
      ? s.winner === "draw"
        ? `${minutes(s)}분이 다 되었을 때 두 기지가 똑같이 남았습니다.`
        : `${minutes(s)}분이 다 되었을 때 기지가 더 많이 남은 쪽이 이깁니다.`
      : "상대 기지를 무너뜨렸습니다.",
};
