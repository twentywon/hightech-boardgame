import type { Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import { HOLES, aimAt, fly, type Flight, type Outcome, type Pose } from "./sim";

/**
 * 투호 (tuho), the Korean game of throwing arrows into a pot, simplified from the old court game as follows.
 *
 * - Two sides (홍 and 청) stand at one line before a bronze pot with a long neck (its mouth, 호) and a short tube on
 *   either side of the neck (its ears, 귀). They throw `ARROWS` arrows each a round (판), one at a time in turn; the
 *   side that began a round lets the other begin the next. A game is one round or three (`ROUNDS`), and the higher
 *   total over them wins; equal totals are a draw.
 * - An arrow standing in the mouth scores `POINTS.mouth` (10), one standing in an ear `POINTS.ear` (20: an ear is far
 *   narrower). An arrow that goes into a hole too slanted to stand (more than `LEAN_MAX` from upright) is caught
 *   leaning against the rim (기댄 살) and scores nothing, as does an arrow that bounces off a rim or the pot and
 *   falls out, or comes down on the ground.
 * - Arrows in the pot stay there and arrows on the ground lie where they fell until the round is over; then all are
 *   gathered up. Arrows in the pot do not get in the way of later ones.
 *
 * A throw is a move whose `to` is the throw's turn and speed (`throwCode`: the turn in hundred-thousandths of a
 * radian, the speed in millimetres a second) and whose `extra` is how widely the computer's hand scatters it
 * (0 to `MAX_SPREAD`; a person's throws carry none: their unsteady hand is the tremor of the aim while they hold the
 * arrow, so the throw names exactly what they let go with). The scatter is drawn in `play` from the `random` passed
 * in; then the flight (`fly` in sim.ts) decides everything, the same way every time. Nothing is taken back
 * (`noUndo`): a throw is a matter of the hand.
 */
export const ARROWS = 10,
  POINTS: Record<Outcome, number> = { mouth: 10, ear: 20, lean: 0, miss: 0 },
  MAX_SPREAD = 60;
export const ROUND_CHOICES = [
  { value: "1", label: "한 판" },
  { value: "3", label: "세 판" },
];
export const roundsOf = (variant: string) => (variant === "3" ? 3 : 1);
/** The computer's levels: how widely its hand scatters the throw it chooses. */
export const LEVELS: Record<"easy" | "normal" | "hard", { label: string; spread: number }> = {
  easy: { label: "쉬움", spread: 46 },
  normal: { label: "보통", spread: 30 },
  hard: { label: "어려움", spread: 22 },
};
/** One unit of `extra`: the scatter of the turn (rad) and of the speed (m/s), one standard deviation each. */
export const SPREAD_YAW = 0.0006,
  SPREAD_SPEED = 0.0017;
export interface Throw {
  side: 0 | 1;
  /** What the arrow left the hand with, after the computer's scatter. */
  yaw: number;
  speed: number;
  outcome: Outcome;
  hole: number;
  rimmed: boolean;
  points: number;
  rest: Pose;
}
export interface State {
  rounds: number;
  /** The round under way (1-based; past the last once the game is over). */
  round: number;
  /** Who began the round under way. */
  starter: 0 | 1;
  /** Arrows thrown this round by each side. */
  thrown: [number, number];
  /** Totals over the game, and each finished round's own. */
  scores: [number, number];
  history: [number, number][];
  /** The arrows of the round under way, in the pot and on the ground, in the order thrown. */
  arrows: Throw[];
  /** The arrow thrown last, and whether it ended a round (its arrows then gathered up). */
  last: Throw | null;
  cleared: boolean;
  turn: 0 | 1;
  winner: Winner;
  ply: number;
}
const YAW_UNIT = 1e-5,
  YAW_REACH = 35000,
  SPEED_MIN = 1500,
  SPEED_MAX = 9000,
  SPEED_SPAN = SPEED_MAX - SPEED_MIN + 1;
/** A throw's turn (rad, within ±0.35) and speed (m/s, 1.5 to 9) as one number, and back. */
export function throwCode(yaw: number, speed: number) {
  const y = Math.max(-YAW_REACH, Math.min(YAW_REACH, Math.round(yaw / YAW_UNIT))) + YAW_REACH,
    s = Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(speed * 1000))) - SPEED_MIN;
  return y * SPEED_SPAN + s;
}
export function throwOf(code: number) {
  if (!Number.isInteger(code) || code < 0 || code >= (YAW_REACH * 2 + 1) * SPEED_SPAN) return null;
  return { yaw: (Math.floor(code / SPEED_SPAN) - YAW_REACH) * YAW_UNIT, speed: ((code % SPEED_SPAN) + SPEED_MIN) / 1000 };
}
export function createGame(rounds = 1): State {
  return { rounds, round: 1, starter: 0, thrown: [0, 0], scores: [0, 0], history: [], arrows: [], last: null, cleared: false, turn: 0, winner: null, ply: 0 };
}
/** The throws that come down through the middle of the mouth and of each ear, as a person would let them go. */
export const IDEAL = HOLES.map((hole) => aimAt(hole));
/** A few throws that stand for all of them (any turn and speed may be thrown): at the mouth and the ears, and short and long of the mouth. */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const m = IDEAL[0];
  return [...IDEAL.map((a) => throwCode(a.yaw, a.speed)), throwCode(m.yaw, m.speed - 0.3), throwCode(m.yaw, m.speed + 0.3)].map((to) => ({ from: -1, to, extra: 0 }));
}
/** A number drawn from the normal distribution (two draws from `random`). */
function gauss(random: Random) {
  const u = Math.max(1e-12, random()),
    v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const other = (side: 0 | 1): 0 | 1 => (side ? 0 : 1);
/** Who throws next: in a round, the side that has thrown fewer, the round's starter first when they are even. */
const nextUp = (thrown: [number, number], starter: 0 | 1): 0 | 1 => (thrown[0] === thrown[1] ? starter : thrown[0] < thrown[1] ? 0 : 1);
/** A flight as an arrow of `side`. */
function arrowOf(side: 0 | 1, yaw: number, speed: number, flight: Flight): Throw {
  return { side, yaw, speed, outcome: flight.outcome, hole: flight.hole, rimmed: flight.rimmed, points: POINTS[flight.outcome], rest: flight.rest };
}
export function play(state: State, move: Move, random?: Random): State | null {
  if (state.winner !== null || move.from !== -1) return null;
  const aim = throwOf(move.to);
  if (!aim || !Number.isInteger(move.extra) || move.extra < 0 || move.extra > MAX_SPREAD) return null;
  let { yaw, speed } = aim;
  if (random && move.extra > 0) {
    yaw += gauss(random) * move.extra * SPREAD_YAW;
    speed += gauss(random) * move.extra * SPREAD_SPEED;
    // Kept as finely as a move names a throw, so that what is recorded flies the same again.
    const kept = throwOf(throwCode(yaw, speed))!;
    yaw = kept.yaw;
    speed = kept.speed;
  }
  const side = state.turn,
    arrow = arrowOf(side, yaw, speed, fly(yaw, speed)),
    thrown: [number, number] = [...state.thrown],
    scores: [number, number] = [...state.scores];
  thrown[side]++;
  scores[side] += arrow.points;
  const next: State = { ...state, thrown, scores, arrows: [...state.arrows, arrow], last: arrow, cleared: false, ply: state.ply + 1 };
  if (thrown[0] < ARROWS || thrown[1] < ARROWS) return { ...next, turn: nextUp(thrown, state.starter) };
  // The round is over: its own score is kept and the arrows are gathered up.
  const before = state.history.reduce<[number, number]>((s, r) => [s[0] + r[0], s[1] + r[1]], [0, 0]),
    history = [...state.history, [scores[0] - before[0], scores[1] - before[1]] as [number, number]],
    done = history.length >= state.rounds,
    starter = other(state.starter);
  return {
    ...next,
    history,
    arrows: [],
    cleared: true,
    round: state.round + 1,
    starter,
    thrown: [0, 0],
    turn: starter,
    winner: done ? (scores[0] === scores[1] ? "draw" : scores[0] > scores[1] ? 0 : 1) : null,
  };
}
/**
 * The same scatter for every judgement: a fixed set of offsets (in standard deviations, turn and speed), so that the
 * computer weighs a throw the same way every time.
 */
const SAMPLES = (() => {
  let s = 12345;
  const next = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646,
    out: [number, number][] = [];
  for (let k = 0; k < 48; k++) {
    const u = Math.max(1e-9, next()),
      v = next(),
      r = Math.sqrt(-2 * Math.log(u));
    out.push([r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)]);
  }
  return out;
})();
/** What a throw is worth on average from a hand that scatters `spread` (tried through the same flight as `play`). */
export function worth(yaw: number, speed: number, spread: number) {
  if (spread <= 0) return POINTS[fly(yaw, speed).outcome];
  let sum = 0;
  for (const [a, b] of SAMPLES) sum += POINTS[fly(yaw + a * spread * SPREAD_YAW, speed + b * spread * SPREAD_SPEED).outcome];
  return sum / SAMPLES.length;
}
/**
 * The computer's throw: it tries throws round the middle of the mouth and of each ear through the flight, weighs each
 * by what its own hand would make of it, and throws the best; `play` then scatters it by the level.
 */
export function chooseThrow(state: State, level: "easy" | "normal" | "hard"): Move | null {
  if (state.winner !== null) return null;
  const spread = LEVELS[level]?.spread ?? LEVELS.normal.spread;
  let best = { yaw: IDEAL[0].yaw, speed: IDEAL[0].speed, value: -1 };
  IDEAL.forEach((ideal, i) => {
    const steps = i === 0 ? [-0.02, 0, 0.02] : [0];
    for (const ds of steps)
      for (const dy of i === 0 ? [-0.004, 0, 0.004] : [0]) {
        const yaw = ideal.yaw + dy,
          speed = ideal.speed + ds,
          // An ear must look clearly better than the mouth to be tried: a few samples flatter a narrow hole.
          value = worth(yaw, speed, spread) * (i === 0 ? 1 : 1 / EAR_DOUBT);
        if (value > best.value + 1e-9) best = { yaw, speed, value };
      }
  });
  return { from: -1, to: throwCode(best.yaw, best.speed), extra: spread };
}
/** How much better an ear must look than the mouth before the computer goes for it. */
const EAR_DOUBT = 1.25;
const NAMES: Record<Outcome, string> = { mouth: "입", ear: "귀", lean: "기댄 살", miss: "빗나감" };
export const outcomeName = (o: Outcome) => NAMES[o];
const effect = (): Effect | null => null;
export const tuho: PointGame<State> = {
  create: (variant) => createGame(roundsOf(variant)),
  moves,
  play,
  choose: (state, level) => chooseThrow(state, level),
  turn: (state) => state.turn,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state, player) => state.scores[player] - state.scores[other(player)],
  hint: (state) => {
    const round = state.rounds > 1 ? `${Math.min(state.round, state.rounds)}/${state.rounds}판 · ` : "",
      how = state.ply === 0 ? " · 화살을 누른 채 아래로 당겼다 놓으세요" : "";
    return `${round}${state.thrown[state.turn] + 1}/${ARROWS}번째 화살${how}`;
  },
  tally: (state) => [0, 1].map((side) => (state.winner !== null ? `${state.scores[side]}점` : `${state.scores[side]}점 · 화살 ${ARROWS - state.thrown[side]}개 남음`)) as [string, string],
  reason: (state) => {
    const [a, b] = state.scores,
      over = state.rounds > 1 ? `${state.rounds}판 합계` : "합계";
    return state.winner === "draw" ? `${over} ${a}점으로 같습니다. 무승부입니다.` : `${over} ${a} 대 ${b}점입니다.`;
  },
};
