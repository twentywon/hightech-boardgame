import type { Effect, Move, PointGame, Winner } from "../points/types";
import { CAP, RAID } from "./sim";

/**
 * A match of 금화 쟁탈전: the valley itself is played in real time by the view (see `sim.ts`); the moves are what it
 * reports: gold brought home to a castle (`DEPOSIT`), gold robbed from a castle's gate (`RAIDED`), and the clock run
 * out (`TIME`). The first castle filled to its target wins; with a clock, the fuller castle when it runs out (a draw
 * when they are alike).
 */
/** A deposit by side s of n gold is a move to `DEPOSIT + s * 100 + n`; castle s robbed of n, to `RAIDED + s * 10 + n`. */
export const DEPOSIT = 100,
  RAIDED = 300,
  TIME = 400;
export const depositMove = (side: number, amount: number): Move => ({ from: -1, to: DEPOSIT + side * 100 + amount, extra: -1 });
export const raidedMove = (side: number, amount: number): Move => ({ from: -1, to: RAIDED + side * 10 + amount, extra: -1 });
/** The variants: a castle of 60, 100 or 150 gold, or three minutes on the clock ("time"). */
export const TARGETS: Record<string, number> = { "60": 60, "100": 100, "150": 150 };
export const TIMED = "time",
  TIMED_SECONDS = 180,
  /** With a clock a castle has room for more than can be brought in the time: only the clock ends it. */
  TIMED_ROOM = 9999;
export interface State {
  /** The gold that fills a castle, and the clock's seconds (0: none). */
  target: number;
  seconds: number;
  gold: [number, number];
  /** How many times each side has brought gold home, and been robbed at its gate. */
  deposits: [number, number];
  raided: [number, number];
  winner: Winner;
  /** What the last move was: who, how much, and whether it was a robbery. */
  last: { side: number; amount: number; raid: boolean } | null;
  ply: number;
}
export function createGame(variant = "100"): State {
  const timed = variant === TIMED;
  return { target: timed ? TIMED_ROOM : (TARGETS[variant] ?? 100), seconds: timed ? TIMED_SECONDS : 0, gold: [0, 0], deposits: [0, 0], raided: [0, 0], winner: null, last: null, ply: 0 };
}
/** The moves the valley can report (a deposit of any amount a sack holds, a robbery of any amount a blow takes, the clock). */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const list: Move[] = [];
  for (const side of [0, 1]) {
    for (let n = 1; n <= CAP; n++) list.push(depositMove(side, n));
    for (let n = 1; n <= Math.min(RAID, state.gold[side]); n++) list.push(raidedMove(side, n));
  }
  if (state.seconds) list.push({ from: -1, to: TIME, extra: -1 });
  return list;
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to)) return null;
  const base = { ...state, ply: state.ply + 1 };
  if (move.to === TIME) {
    if (!state.seconds) return null;
    const [a, b] = state.gold;
    return { ...base, last: null, winner: a === b ? "draw" : a > b ? 0 : 1 };
  }
  if (move.to > DEPOSIT && move.to <= DEPOSIT + 100 + CAP) {
    const side = Math.floor((move.to - DEPOSIT) / 100),
      amount = (move.to - DEPOSIT) % 100;
    if (amount < 1 || amount > CAP) return null;
    const gold: [number, number] = [state.gold[0], state.gold[1]],
      deposits: [number, number] = [state.deposits[0], state.deposits[1]];
    gold[side] += amount;
    deposits[side]++;
    return { ...base, gold, deposits, last: { side, amount, raid: false }, winner: gold[side] >= state.target ? (side as 0 | 1) : null };
  }
  if (move.to > RAIDED && move.to <= RAIDED + 10 + RAID) {
    const side = Math.floor((move.to - RAIDED) / 10),
      amount = (move.to - RAIDED) % 10;
    if (amount < 1 || amount > RAID || amount > state.gold[side]) return null;
    const gold: [number, number] = [state.gold[0], state.gold[1]],
      raided: [number, number] = [state.raided[0], state.raided[1]];
    gold[side] -= amount;
    raided[side]++;
    return { ...base, gold, raided, last: { side, amount, raid: true }, winner: null };
  }
  return null;
}
const effect = (): Effect | null => null;
const room = (s: State) => (s.seconds ? "" : ` / ${s.target}`);
export const goldRaid: PointGame<State> = {
  create: (variant) => createGame(variant),
  moves,
  play,
  // Nobody takes turns: both bandits run at once.
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [null, null],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => s.gold[player] - s.gold[player ? 0 : 1],
  hint: (s) => `금화 ${s.gold[0]}${room(s)} 대 ${s.gold[1]}${room(s)}. 금화를 주워 내 성문으로 가져가세요.`,
  tally: (s) => [0, 1].map((p) => `금화 ${s.gold[p]}${room(s)}`) as [string, string],
  reason: (s) =>
    s.winner === "draw"
      ? `시간이 끝났을 때 두 성의 금화가 ${s.gold[0]}닢으로 같았습니다.`
      : s.seconds
        ? `시간이 끝났을 때 금화 ${s.gold[0]} 대 ${s.gold[1]}이었습니다. 금화가 더 많은 성이 이깁니다.`
        : `성을 금화 ${s.target}닢으로 먼저 채웠습니다 (${s.gold[0]} 대 ${s.gold[1]}).`,
};
