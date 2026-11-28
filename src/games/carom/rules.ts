import type { Random } from "../../core/random";
import type { Effect, GameOptions, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";
import { HALF_X, HALF_Z, R, ball, copy, going, isCushion, run, speedOf, strike, type Ball, type Contact } from "./sim";

/**
 * Carom billiards for two on a table without pockets, in two kinds.
 *
 * 4구 (four balls): two red balls, my white cue ball and the other side's
 * yellow one. My cue ball touching both reds in one shot, without touching the
 * other cue ball, is a point and keeps the turn; touching the other cue ball is
 * a foul that costs a point (never below nought); anything else passes the
 * turn. Played to 10, 20 or 30.
 *
 * 3쿠션 (three cushions): white, yellow and red. My cue ball must touch both
 * other balls, and before it touches the second it must have struck the
 * cushions three times or more. Played to 10, 15 or 20.
 *
 * Every shot is struck with the cue ball where it lies, along a direction, at
 * one of twenty strengths, with the tip set off the ball's middle (`extra`), and
 * run through the same physics as the view shows it.
 */
export type Kind = "four" | "three";
export const WHITE = 0,
  YELLOW = 1,
  RED = 2,
  /** The second red ball, in 4구 only. */
  RED2 = 3;
export const TARGETS: Record<Kind, number[]> = { four: [10, 20, 30], three: [10, 15, 20] };
export const kindOf = (variant: string): Kind => (variant === "three" ? "three" : "four");
/** The cue ball each side strikes: side 0 the white, side 1 the yellow. */
export const cueOf = (side: number) => (side === 0 ? WHITE : YELLOW);
/** The spots: the head spot at the shooter's end (+z), the middle, the foot spot at the far end. */
export const HEAD = HALF_Z / 2,
  FOOT = -HALF_Z / 2,
  /** How far beside the head spot the breaker's cue ball is set. */
  BESIDE = 0.64;
/** Where the balls lie for the first shot. */
export function opening(kind: Kind): Ball[] {
  const balls = [ball(WHITE, BESIDE, HEAD), ball(YELLOW, 0, HEAD), ball(RED, 0, FOOT)];
  if (kind === "four") balls.push(ball(RED2, 0, 0));
  return balls;
}
/** A shot is told as a direction in tenths of a degree and one of twenty strengths. */
export const POWERS = 20,
  SHOT_BASE = 10_000;
export const shotCode = (degrees: number, power: number) => {
  const tenths = ((Math.round(degrees * 10) % 3600) + 3600) % 3600;
  return SHOT_BASE + tenths * 32 + Math.max(1, Math.min(POWERS, Math.round(power)));
};
export function shotOf(code: number) {
  const value = code - SHOT_BASE,
    tenths = Math.floor(value / 32),
    power = value % 32;
  if (!Number.isInteger(code) || value < 0 || tenths >= 3600 || power < 1 || power > POWERS) return null;
  return { degrees: tenths / 10, power, angle: (tenths / 10) * (Math.PI / 180) };
}
/**
 * Where the tip strikes the ball (당점), as steps of a tenth across (`side`, right positive, seen from behind the
 * cue) and up (`high`, top positive), within a circle of ten steps: told in `extra` as (side + 10) · 21 + (high + 10).
 * −1 is the middle.
 */
export const TIP_STEPS = 10;
export const tipCode = (side: number, high: number) => (Math.round(side) + TIP_STEPS) * (2 * TIP_STEPS + 1) + (Math.round(high) + TIP_STEPS);
export function tipOf(extra: number): { side: number; high: number } | null {
  if (extra === -1) return { side: 0, high: 0 };
  if (!Number.isInteger(extra) || extra < 0 || extra >= (2 * TIP_STEPS + 1) ** 2) return null;
  const side = Math.floor(extra / (2 * TIP_STEPS + 1)) - TIP_STEPS,
    high = (extra % (2 * TIP_STEPS + 1)) - TIP_STEPS;
  return side * side + high * high <= TIP_STEPS * TIP_STEPS ? { side, high } : null;
}
/** The nearest tip within the circle to a point given in steps. */
export function nearestTip(side: number, high: number) {
  let s = Math.round(side),
    h = Math.round(high);
  const d = Math.hypot(s, h);
  if (d > TIP_STEPS) {
    s = Math.trunc((side / Math.hypot(side, high)) * TIP_STEPS);
    h = Math.trunc((high / Math.hypot(side, high)) * TIP_STEPS);
  }
  return { side: s, high: h };
}
/** What a shot came to. */
export interface Verdict {
  /** The other balls the cue ball touched, in the order it first touched them. */
  hit: number[];
  /** Cushions the cue ball struck before it touched its second ball (all of them when it never did). */
  cushions: number;
  point: boolean;
  /** 4구: the other side's cue ball was touched. */
  foul: boolean;
}
export interface State {
  kind: Kind;
  /** The balls at rest, by id. */
  balls: Ball[];
  turn: 0 | 1;
  score: [number, number];
  target: number;
  /** Points made in a row by the side to shoot, in this turn at the table. */
  run: number;
  winner: Winner;
  last: ({ by: 0 | 1; code: number; extra: number } & Verdict) | null;
  ply: number;
}
export function createGame(kind: Kind = "four", target = TARGETS[kind][0]): State {
  return { kind, balls: opening(kind), turn: 0, score: [0, 0], target: TARGETS[kind].includes(target) ? target : TARGETS[kind][0], run: 0, winner: null, last: null, ply: 0 };
}
/** The target chosen in the setup for a kind (`target4`, `target3`). */
export const targetOf = (kind: Kind, options?: GameOptions) => {
  const value = Number(options?.[kind === "four" ? "target4" : "target3"]);
  return TARGETS[kind].includes(value) ? value : TARGETS[kind][0];
};
/** The balls the cue ball must touch. */
export const objectsOf = (kind: Kind, cue: number) => (kind === "four" ? [RED, RED2] : [1 - cue, RED]);
/** A cushion struck again by the same ball within this many slices, nothing touched between, is one contact. */
const SAME_CUSHION = 8;
/** The cue ball's own contacts, in order: other balls by id, cushions as −1 (a double touch of one cushion counted once). */
export function touches(contacts: Contact[], cue: number) {
  const out: number[] = [];
  let lastWall = 0,
    lastSlice = -Infinity;
  for (const c of contacts) {
    if (c.a !== cue && c.b !== cue) continue;
    if (isCushion(c.b)) {
      if (c.b === lastWall && c.slice - lastSlice <= SAME_CUSHION) {
        lastSlice = c.slice;
        continue;
      }
      lastWall = c.b;
      lastSlice = c.slice;
      out.push(-1);
    } else {
      lastWall = 0;
      out.push(c.a === cue ? c.b : c.a);
    }
  }
  return out;
}
/** What the contacts of a shot come to under the rules of `kind`. */
export function judge(kind: Kind, cue: number, contacts: Contact[]): Verdict {
  const hit: number[] = [];
  let cushions = 0,
    atSecond = -1;
  for (const t of touches(contacts, cue)) {
    if (t === -1) {
      if (hit.length < 2) cushions++;
    } else if (!hit.includes(t)) {
      hit.push(t);
      if (hit.length === 2) atSecond = cushions;
    }
  }
  if (kind === "four") {
    const foul = hit.includes(1 - cue);
    return { hit, cushions, foul, point: !foul && hit.includes(RED) && hit.includes(RED2) };
  }
  return { hit, cushions, foul: false, point: hit.length === 2 && atSecond >= 3 };
}
/** The balls of `s` with the shot of `move` struck, before they run; null when the move is no shot of the side to shoot. */
export function struck(s: State, move: Move): Ball[] | null {
  const shot = shotOf(move.to),
    tip = tipOf(move.extra),
    cue = cueOf(s.turn);
  if (!shot || !tip || move.from !== cue) return null;
  const balls = copy(s.balls);
  strike(balls[cue], shot.angle, speedOf(shot.power), tip.side / TIP_STEPS, tip.high / TIP_STEPS);
  return balls;
}
export function play(s: State, move: Move): State | null {
  if (s.winner !== null) return null;
  const balls = struck(s, move);
  if (!balls) return null;
  const cue = cueOf(s.turn),
    verdict = judge(s.kind, cue, run(balls).contacts),
    me = s.turn,
    score: [number, number] = [s.score[0], s.score[1]];
  if (verdict.point) score[me]++;
  else if (verdict.foul) score[me] = Math.max(0, score[me] - 1);
  const won = score[me] >= s.target;
  return {
    ...s,
    balls,
    score,
    turn: verdict.point ? me : ((1 - me) as 0 | 1),
    run: verdict.point ? s.run + 1 : 0,
    winner: won ? me : null,
    last: { by: me, code: move.to, extra: move.extra, ...verdict },
    ply: s.ply + 1,
  };
}
/** Plain shots at each ball the cue ball must touch: what the screen offers (a pull makes any other). */
export function moves(s: State): Move[] {
  if (s.winner !== null) return [];
  const cue = cueOf(s.turn),
    from = s.balls[cue];
  return objectsOf(s.kind, cue).flatMap((id) => {
    const to = s.balls[id],
      degrees = (Math.atan2(to.z - from.z, to.x - from.x) * 180) / Math.PI;
    return [6, 10, 14].map((power) => ({ from: cue, to: shotCode(degrees, power), extra: -1 }));
  });
}

/** How the computer rates what a shot it tried came to: a point first, a near thing next, a foul never. */
function rate(kind: Kind, v: Verdict) {
  if (v.point) return 100;
  if (v.foul) return -50;
  if (kind === "four") return v.hit.length * 3;
  return v.hit.length * 3 + Math.min(v.cushions, 3) * (v.hit.length === 2 ? 2 : 1);
}
/** A shot tried in the computer's head, cut short once its outcome is settled. */
function tryShot(s: State, cue: number, degrees: number, power: number, side: number, high: number): Verdict {
  const balls = copy(s.balls);
  strike(balls[cue], (degrees * Math.PI) / 180, speedOf(power), side / TIP_STEPS, high / TIP_STEPS);
  const object = objectsOf(s.kind, cue);
  const { contacts } = run(balls, (contacts) => {
    if (!contacts.length) return false;
    // In 3쿠션 the point is settled once both balls have been touched; in either kind once the cue ball is still.
    if (s.kind === "three") {
      const seen = new Set(touches(contacts, cue).filter((t) => t >= 0));
      if (object.every((id) => seen.has(id))) return true;
    }
    return !going(balls[cue]);
  });
  return judge(s.kind, cue, contacts);
}
/**
 * The levels: how widely the computer looks, and how steady its cue is (degrees and strengths it may be off by). Played
 * against itself it scores about one shot in seven at 4구 (one in twelve at 3쿠션) when easy, one in three when normal,
 * and two in three when hard.
 */
const SEARCH: Record<Level, { cuts: number[]; powers: Record<Kind, number[]>; spins: Record<Kind, [number, number][]>; banks: number; wobble: number; shake: number }> = {
  easy: {
    cuts: [-0.84, -0.7, -0.56, -0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.84],
    powers: { four: [7, 11], three: [11, 15] },
    spins: { four: [[0, 0]], three: [[0, 0], [6, 0], [-6, 0]] },
    banks: 0,
    wobble: 1.2,
    shake: 1,
  },
  normal: {
    cuts: [-0.84, -0.7, -0.56, -0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.84],
    powers: { four: [6, 9, 12], three: [10, 13, 16] },
    spins: { four: [[0, 0], [0, 5], [0, -5]], three: [[0, 0], [6, 0], [-6, 0], [6, 4], [-6, 4]] },
    banks: 0,
    wobble: 0.6,
    shake: 0,
  },
  hard: {
    cuts: [-0.9, -0.8, -0.7, -0.6, -0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    powers: { four: [5, 8, 11, 14], three: [10, 13, 16, 19] },
    spins: { four: [[0, 0], [0, 5], [0, -5], [5, 0], [-5, 0]], three: [[0, 0], [7, 0], [-7, 0], [6, 5], [-6, 5], [6, -5], [-6, -5]] },
    banks: 72,
    wobble: 0.3,
    shake: 0,
  },
};
/**
 * The computer's shot. It tries shots in its head with the same physics: at each ball it must touch, cut thin to
 * full on either side, at a few strengths and tips (and, at the hardest level, every way round off the cushions in
 * 3쿠션). Of the shots that score it takes the one in the middle of the widest run of neighbours that score too, so
 * that a small slip of the cue still scores; its hand then slips a little, more at the easier levels.
 */
export function chooseShot(s: State, level: Level, random: Random = Math.random): Move | null {
  if (s.winner !== null) return null;
  const cue = cueOf(s.turn),
    from = s.balls[cue],
    plan = SEARCH[level],
    object = objectsOf(s.kind, cue);
  let best = { degrees: 0, power: 10, side: 0, high: 0, value: -Infinity };
  const consider = (degrees: number, power: number, side: number, high: number, value: number) => {
    if (value > best.value) best = { degrees, power, side, high, value };
  };
  for (const target of object) {
    const to = s.balls[target],
      dx = to.x - from.x,
      dz = to.z - from.z,
      d = Math.hypot(dx, dz),
      toward = Math.atan2(dz, dx);
    for (const power of plan.powers[s.kind])
      for (const [side, high] of plan.spins[s.kind]) {
        // One family of shots: the cut from thin on one side to thin on the other.
        const values = plan.cuts.map((cut) => {
          const offset = Math.asin(Math.max(-0.999, Math.min(0.999, (cut * 2 * R) / Math.max(d, 2 * R)))),
            degrees = ((toward + offset) * 180) / Math.PI,
            value = rate(s.kind, tryShot(s, cue, degrees, power, side, high));
          return { degrees, value };
        });
        values.forEach(({ degrees, value }, i) => {
          // Neighbours that score too make the shot safer.
          let width = 0;
          if (value >= 100) for (let k = i - 1; k >= 0 && values[k].value >= 100; k--) width++;
          if (value >= 100) for (let k = i + 1; k < values.length && values[k].value >= 100; k++) width++;
          consider(degrees, power, side, high, value + Math.min(width, 3) * 4 - power * 0.05 - (Math.abs(side) + Math.abs(high)) * 0.02 + random() * 0.01);
        });
      }
  }
  // Off the cushions first: every way round, at a strength or two.
  if (plan.banks && s.kind === "three" && best.value < 100)
    for (let k = 0; k < plan.banks; k++) {
      const degrees = (360 * k) / plan.banks;
      for (const [power, side] of [[14, 6], [14, -6], [18, 0]]) consider(degrees, power, side, 0, rate(s.kind, tryShot(s, cue, degrees, power, side, 0)) - 1 + random() * 0.01);
    }
  const wobble = (random() * 2 - 1) * plan.wobble,
    shake = Math.round((random() * 2 - 1) * plan.shake);
  return { from: cue, to: shotCode(best.degrees + wobble, best.power + shake), extra: tipCode(best.side, best.high) };
}
const NAMES = ["흰 공", "노란 공"];
export const ballName = (id: number) => (id === WHITE ? "흰 공" : id === YELLOW ? "노란 공" : "빨간 공");
export const carom: PointGame<State> = {
  create: (variant, options) => {
    const kind = kindOf(variant);
    return createGame(kind, targetOf(kind, options));
  },
  moves,
  play: (state, move) => play(state, move),
  choose: chooseShot,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => [],
  effect: (): Effect | null => null,
  ply: (s) => s.ply,
  evaluate: (s, player) => s.score[player] - s.score[1 - player],
  hint: (s) => {
    const mine = NAMES[s.turn],
      other = NAMES[1 - s.turn],
      runs = s.run > 0 ? ` (연속 ${s.run}점)` : "";
    return s.kind === "four"
      ? `${mine}으로 빨간 공 두 개를 맞히면 1점 · ${other}을 맞히면 −1점${runs}`
      : `${mine}으로 두 공을 맞히되, 두 번째 공 전에 쿠션 세 번 이상이면 1점${runs}`;
  },
  tally: (s) => [0, 1].map((p) => `${s.score[p]}점 / ${s.target}점`) as [string, string],
  reason: (s) => {
    const w = s.winner === 1 ? 1 : 0;
    return `${s.target}점을 먼저 채웠습니다. ${s.score[w]} 대 ${s.score[1 - w]}.`;
  },
};
export { HALF_X, HALF_Z, R };
