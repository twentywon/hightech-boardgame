import type { Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";
import { HEAD, SPOTS, START_D, bowl, crossing, rack, type Spot, type Throw } from "./sim";

/**
 * Ten-pin bowling: ten frames for each side, the standard way. A frame is two balls at a rack of ten unless the
 * first knocks all ten down (a strike); all ten with the two is a spare. A strike scores ten and the next two
 * balls, a spare ten and the next ball; the tenth frame gives one or two more balls to finish a strike or a spare
 * there. One person may bowl alone (`two` false), or two sides take turns a frame at a time, a person against the
 * computer or two at one screen.
 *
 * A throw is one move: where the ball is set across the approach (`from`), its direction and speed (`to`) and its
 * spin (`extra`). `play` rolls it through the lane's physics (`sim.ts`) at the pins standing and records which fell;
 * the view runs the same physics to show it. Pins left standing are set down again where they stood; a new rack is
 * spotted a little unevenly, as a pinsetter does, from the `random` passed in.
 */
export const FRAMES = 10,
  /** The spin tool: it changes the spin of the side to bowl, without a ball being thrown. */
  SPIN = 900,
  /** A throw is a move to `THROW + angle × 1000 + speed`, from the place it is set (`START` steps across). */
  THROW = 1000;
/** Where the ball may be set across the approach, in steps of `START_STEP`, from `START_MIN`. */
export const START_MIN = -0.45,
  START_STEP = 0.005,
  START_CODES = Math.round((-2 * START_MIN) / START_STEP);
/** The direction of a throw, at most `ANGLE_MAX` either side of straight, in steps of `ANGLE_STEP` (radians). */
export const ANGLE_MAX = (3 * Math.PI) / 180,
  ANGLE_STEP = ANGLE_MAX / 300;
/** The speed of a throw, metres a second. */
export const SPEED_MIN = 4,
  SPEED_MAX = 9.5,
  SPEED_STEP = 0.01;
/** Where a ball should cross the head pin's row for a strike, right of it for a hook to the left (the 1–3 pocket). */
export const POCKET = 0.06;
export const SPIN_NAMES = ["직구", "왼쪽 훅", "오른쪽 훅"];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** The move for a throw, rounded to the steps a move can say. */
export function throwMove(t: Throw): Move {
  const from = clamp(Math.round((t.x - START_MIN) / START_STEP), 0, START_CODES),
    angle = clamp(Math.round(t.angle / ANGLE_STEP) + 300, 0, 600),
    speed = clamp(Math.round((t.speed - SPEED_MIN) / SPEED_STEP), 0, Math.round((SPEED_MAX - SPEED_MIN) / SPEED_STEP));
  return { from, to: THROW + angle * 1000 + speed, extra: clamp(Math.round(t.spin), 0, 2) };
}
/** The throw a move says, or null when it is no throw. */
export function throwOf(move: Move): Throw | null {
  const code = move.to - THROW,
    angle = Math.floor(code / 1000),
    speed = code % 1000;
  if (move.to < THROW || angle > 600 || speed > Math.round((SPEED_MAX - SPEED_MIN) / SPEED_STEP)) return null;
  if (!Number.isInteger(move.from) || move.from < 0 || move.from > START_CODES || ![0, 1, 2].includes(move.extra)) return null;
  return { x: START_MIN + move.from * START_STEP, angle: (angle - 300) * ANGLE_STEP, speed: SPEED_MIN + speed * SPEED_STEP, spin: move.extra };
}
export interface Last {
  side: 0 | 1;
  frame: number;
  ball: number;
  move: Move;
  /** The pins knocked down, by number. */
  knocked: number[];
  /** All ten with the first ball at a full rack, all left with the next, or neither. */
  mark: "strike" | "spare" | null;
  /** Strikes in a row the side has now. */
  run: number;
  /** A new rack is set after this ball. */
  reset: boolean;
}
export interface State {
  /** Two sides taking turns, or one person alone. */
  two: boolean;
  /** The pins each ball knocked down, frame by frame, for each side. */
  frames: [number[][], number[][]];
  turn: 0 | 1;
  /** The frame of the side to bowl (0–9) and its ball in that frame (0–2). */
  frame: number;
  ball: number;
  /** The pins standing for the next ball. */
  standing: Spot[];
  /** The spin each side has set for its next ball. */
  spin: [number, number];
  last: Last | null;
  winner: Winner;
  ply: number;
}
export function createGame(two = true, random?: Random): State {
  return { two, frames: [[], []], turn: 0, frame: 0, ball: 0, standing: rack(random), spin: [1, 1], last: null, winner: null, ply: 0 };
}
/** Whether a frame's balls are all thrown: the tenth (`k` 9) gives a third ball after a strike or a spare. */
export function frameDone(rolls: number[], k: number) {
  if (k < FRAMES - 1) return rolls[0] === 10 || rolls.length >= 2;
  return rolls.length >= 3 || (rolls.length === 2 && rolls[0] + rolls[1] < 10);
}
/** The running score after each frame, as far as it is known yet (null where a strike or spare still waits for its balls). */
export function runningScores(frames: number[][]): (number | null)[] {
  const rolls = frames.flat(),
    out: (number | null)[] = [];
  let at = 0,
    sum = 0,
    known = true;
  for (let k = 0; k < FRAMES; k++) {
    const f = frames[k];
    if (!f || !f.length || !known) {
      out.push(null);
      known = false;
      continue;
    }
    let score: number | null = null;
    if (k < FRAMES - 1) {
      if (f[0] === 10) {
        score = rolls.length > at + 2 ? 10 + rolls[at + 1] + rolls[at + 2] : null;
        at += 1;
      } else if (f.length >= 2) {
        score = f[0] + f[1] === 10 ? (rolls.length > at + 2 ? 10 + rolls[at + 2] : null) : f[0] + f[1];
        at += 2;
      }
    } else if (frameDone(f, k)) score = f.reduce((a, b) => a + b, 0);
    if (score === null) {
      out.push(null);
      known = false;
    } else {
      sum += score;
      out.push(sum);
    }
  }
  return out;
}
/** The score as far as it is known. */
export function total(frames: number[][]) {
  const scores = runningScores(frames).filter((s): s is number => s !== null);
  return scores.length ? scores[scores.length - 1] : 0;
}
/** The marks of a frame's boxes as the score screen writes them: X a strike, / a spare, - nothing knocked down. */
export function marksOf(rolls: number[], k: number): string[] {
  const plain = (n: number) => (n === 0 ? "-" : String(n));
  if (k < FRAMES - 1) {
    if (rolls[0] === 10) return ["", "X"];
    return [rolls.length ? plain(rolls[0]) : "", rolls.length > 1 ? (rolls[0] + rolls[1] === 10 ? "/" : plain(rolls[1])) : ""];
  }
  const out: string[] = [],
    seen = racks(rolls, k);
  rolls.forEach((n, i) => out.push(seen[i].fresh && n === 10 ? "X" : !seen[i].fresh && seen[i].down + n === 10 ? "/" : plain(n)));
  while (out.length < 3) out.push("");
  return out;
}
/**
 * The rack each ball of a frame is thrown at, and the one for the ball to come: whether it is a full rack just set
 * (`fresh`), and how many of its pins are down already. In the tenth frame a strike or a spare brings a new rack.
 */
function racks(rolls: number[], k: number) {
  const out: { fresh: boolean; down: number }[] = [];
  let fresh = true,
    down = 0;
  for (const n of rolls) {
    out.push({ fresh, down });
    if (k < FRAMES - 1) {
      fresh = false;
      down += n;
    } else if ((fresh && n === 10) || (!fresh && down + n === 10)) {
      fresh = true;
      down = 0;
    } else {
      fresh = false;
      down += n;
    }
  }
  out.push({ fresh, down });
  return out;
}
/** Strikes in a row at the end of a side's balls so far (anything else ends the run). */
function strikeRun(frames: number[][]) {
  let run = 0;
  frames.forEach((rolls, k) => {
    const down = racks(rolls, k);
    rolls.forEach((n, i) => (run = down[i].fresh && n === 10 ? run + 1 : 0));
  });
  return run;
}
/** Records a ball that knocked down `knocked` pins, leaving `left` standing, and moves on to the next ball, frame or side. */
export function record(state: State, knocked: number[], left: Spot[], move: Move, random?: Random): State {
  const side = state.turn,
    frames: [number[][], number[][]] = [state.frames[0].map((f) => [...f]), state.frames[1].map((f) => [...f])],
    mine = frames[side],
    k = state.frame;
  if (!mine[k]) mine[k] = [];
  const rolls = mine[k],
    count = knocked.length,
    // The rack this ball meets: a full one just set (the first ball of a frame, or a new rack in the tenth), or what was left.
    rack0 = racks(rolls, k)[rolls.length];
  rolls.push(count);
  const strike = rack0.fresh && count === 10,
    spare = !rack0.fresh && rack0.down + count === 10,
    mark: Last["mark"] = strike ? "strike" : spare ? "spare" : null,
    done = frameDone(rolls, k);
  let next: State = { ...state, frames, ply: state.ply + 1 };
  // A new rack after the frame, or in the tenth after a strike or a spare while balls remain.
  const fresh = done || strike || spare;
  if (!done) next = { ...next, ball: state.ball + 1, standing: fresh ? rack(random) : left };
  else {
    const lastSide = !state.two || side === 1;
    if (k === FRAMES - 1 && lastSide) {
      const a = total(frames[0]),
        b = total(frames[1]);
      next = { ...next, standing: left, winner: !state.two ? 0 : a > b ? 0 : b > a ? 1 : "draw" };
    } else {
      const turn: 0 | 1 = state.two ? ((1 - side) as 0 | 1) : 0;
      next = { ...next, turn, frame: lastSide ? k + 1 : k, ball: 0, standing: rack(random) };
    }
  }
  return { ...next, last: { side, frame: k, ball: state.ball, move, knocked, mark, run: strike ? strikeRun(frames[side]) : 0, reset: fresh && next.winner === null } };
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  // A few throws stand for every one the hand can make; the spin is set first.
  return [{ from: -1, to: SPIN, extra: -1 }, ...[0, 1, 2].map((spin) => throwMove({ x: 0, angle: 0, speed: 8, spin }))];
}
export function play(state: State, move: Move, random?: Random): State | null {
  if (state.winner !== null) return null;
  if (move.to === SPIN) {
    if (move.from !== -1 || move.extra !== -1) return null;
    const spin: [number, number] = [state.spin[0], state.spin[1]];
    spin[state.turn] = (spin[state.turn] + 1) % 3;
    return { ...state, spin };
  }
  const t = throwOf(move);
  if (!t) return null;
  const out = bowl(state.standing, t);
  return record(state, out.knocked, out.left, move, random);
}
/** A Gaussian draw, for the computer's unsteady hand. */
function gauss(random: Random) {
  const u = Math.max(1e-9, random()),
    v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
/** The angle that sends a ball set at `x` across `atD` at `target`, found by halving (the way crosses further right the more it turns right). */
export function aimAt(x: number, speed: number, spin: number, target: number, atD = HEAD) {
  let lo = -ANGLE_MAX,
    hi = ANGLE_MAX;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2,
      c = crossing({ x, angle: mid, speed, spin }, atD),
      cx = c ? c.x : mid > 0 ? 9 : -9;
    if (cx < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
/** How unsteady the computer's hand is at each level: in its aim (radians), its speed and where it sets the ball. */
export const SCATTER: Record<Level, { angle: number; speed: number; start: number }> = {
  easy: { angle: 0.0085, speed: 0.8, start: 0.05 },
  normal: { angle: 0.0052, speed: 0.55, start: 0.03 },
  hard: { angle: 0.0017, speed: 0.22, start: 0.01 },
};
/**
 * The computer's ball. At a full rack it hooks into the pocket (the easy level throws straight); at a spare it
 * tries places across the pins standing, rolls each through the same physics at the pins as they stand, and throws
 * at the one that takes the most down even when it is a little off. Then its hand shakes as its level says.
 */
export function chooseMove(state: State, level: Level, random: Random = Math.random): Move | null {
  if (state.winner !== null) return null;
  const pins = state.standing,
    hook = level === "easy" ? 0 : 1,
    speed = level === "hard" ? 8.4 : level === "normal" ? 8 : 7.4;
  let plan: Throw;
  if (pins.length === 10 || !pins.length) {
    const x = hook ? 0.24 : POCKET;
    plan = { x, angle: aimAt(x, speed, hook, POCKET), speed, spin: hook };
  } else {
    // Straight at a spare, from across the lane for a corner pin.
    const front = Math.min(...pins.map((p) => p.d)),
      middle = pins.reduce((a, p) => a + p.x, 0) / pins.length,
      lo = Math.min(...pins.map((p) => p.x)) - 0.12,
      hi = Math.max(...pins.map((p) => p.x)) + 0.12;
    let best = -Infinity;
    plan = { x: 0, angle: 0, speed, spin: 0 };
    // A straight ball keeps its line, so its aim is found at once.
    const straight = (x: number, target: number) => Math.atan2(target - x, front - START_D);
    for (let k = 0; k <= 8; k++) {
      const target = lo + ((hi - lo) * k) / 8,
        x = clamp(-target * 0.7, -0.4, 0.4),
        angle = straight(x, target);
      let value = 0;
      for (const off of [-0.012, 0, 0.012]) value += bowl(pins, { x, angle: straight(x, target + off), speed, spin: 0 }).knocked.length;
      value -= Math.abs(target - middle) * 0.01;
      if (value > best) {
        best = value;
        plan = { x, angle, speed, spin: 0 };
      }
    }
  }
  const shake = SCATTER[level];
  return throwMove({
    x: clamp(plan.x + gauss(random) * shake.start, START_MIN, -START_MIN),
    angle: clamp(plan.angle + gauss(random) * shake.angle, -ANGLE_MAX, ANGLE_MAX),
    speed: clamp(plan.speed + gauss(random) * shake.speed, SPEED_MIN, SPEED_MAX),
    spin: plan.spin,
  });
}
/** The ten spots, for a view that draws the rack's marks on the deck. */
export { SPOTS };
const effect = (): Effect | null => null;
const ballName = (state: State) => (state.frame === FRAMES - 1 ? ["첫 공", "둘째 공", "보너스 공"][state.ball] : state.ball ? "둘째 공" : "첫 공");
export const bowling: PointGame<State> = {
  create: (variant) => createGame(variant !== "solo"),
  moves,
  play,
  choose: (state, level, random) => chooseMove(state, level, random),
  turn: (state) => state.turn,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state, player) => total(state.frames[player]) - total(state.frames[1 - player]),
  // How to bowl is told while the first frame lasts; after that, only where the game stands.
  hint: (state) => `${state.frame + 1}프레임 ${ballName(state)}${state.frame === 0 ? " — 공을 옆으로 끌어 자리를 잡고, 위로 밀어 굴리세요." : ""}`,
  tally: (state) => [`${total(state.frames[0])}점`, `${total(state.frames[1])}점`],
  reason: (state) => {
    const a = total(state.frames[0]),
      b = total(state.frames[1]);
    if (!state.two) return `${a}점으로 게임을 마쳤습니다.${a === 300 ? " 퍼펙트 게임!" : ""}`;
    return state.winner === "draw" ? `${a} 대 ${b}로 같습니다.` : `${a} 대 ${b}입니다.`;
  },
};
