import type { Random } from "../../core/random";
import type { Level } from "../points/ai";
import { groundAt, heightAt, type Hole, type P } from "./course";
import { SPEED_MAX, SPEED_MIN, aimYaw, distanceAt, inSight, roll, yawOf, type Shot } from "./sim";

/**
 * The computer's putt. It tries shots through the same physics the rules use (`roll`) and judges where each ends by
 * how many strokes are still likely to be needed from there (`after`), reckoned from the way round to the cup over
 * the walkable green (`distanceAt`: a grid searched outward from the cup round walls, blocks and ponds), so that a
 * bridge or a tunnel is followed rather than the straight line. A ball in the water or off the hole is costed
 * heavily (`WET`: far more than its penalty stroke, so that the computer would rather lay up before a narrow bridge
 * than gamble on it), a putt that gains little ground a stroke more (`STALL`), a ball left in sand a little more, a
 * ball holed nothing, and a harder putt a hair more (it carries its error further).
 *
 * The search, in fixed steps so that the same place always gives the same plan:
 * 1. a coarse look: a fan of directions all round (finer about the way to go) at speeds set by how far they roll,
 *    and straight at the cup when it is in sight;
 * 2. the best thirty that differ, tried again a little to each side as its own hand would err (`SCREEN`);
 * 3. the best eight of those over `SAMPLES`, aims and speeds spread about the shot as its level's hand shakes them
 *    (the aims at the middles of eight equally likely shares of its error), so that a shot is judged by what it
 *    comes to on average, not when it is struck perfectly;
 * 4. the best two refined by small steps while the average improves;
 * 5. at the windmill, the moment to strike that brings the shot through its door whatever the speed's small error.
 * The work is bounded: the steps above are counted in slices of physics (`BUDGET`), and the later steps are cut short
 * once that is spent (about 0.2–0.5 s on a desktop, run in one go while the table is at rest).
 *
 * Its hand then shakes as its level says (`aimedShot`): the easy computer still misses, it only plans as well.
 */
const G = 9.81,
  /** The carpet's rolling friction, as in `sim.ts`: how far a putt of a speed rolls on the flat. */
  GREEN = 0.068;
/** How many strokes a ball at rest `d` metres (by the way round) from the cup is still likely to need. */
const after = (d: number) => 1 + 0.55 * Math.pow(Math.max(0, d), 0.8);
/**
 * What a ball in the water or off the hole costs at each level, beyond the strokes from where it was hit: the penalty,
 * the stroke and a share more for caution (the easy computer cares least, and would rather try a bridge than stand).
 */
const WET: Record<Level, number> = { easy: 3, normal: 5, hard: 6 },
  /**
   * A putt that brings the ball no nearer (by the way round) than `GAIN` metres is a stroke spent for little: it costs
   * up to `STALL` more, so that the computer does not stand before a hazard tapping the ball about.
   */
  STALL = 1,
  GAIN = 0.3,
  /** What each metre a second of a putt's speed costs, to prefer the gentler of two shots alike. */
  HARD = 0.02,
  /** What a ball left in sand costs beyond its distance. */
  SAND = 0.4,
  /** How many slices of physics one plan may spend before its later steps are cut short. */
  BUDGET = 1_300_000;
/** How unsteady the computer's hand is at each level: in its aim (radians) and in its speed (a share of it). */
export const SCATTER: Record<Level, { angle: number; speed: number; phases: number }> = {
  easy: { angle: (6 * Math.PI) / 180, speed: 0.2, phases: 4 },
  normal: { angle: (3.6 * Math.PI) / 180, speed: 0.11, phases: 10 },
  hard: { angle: (2 * Math.PI) / 180, speed: 0.06, phases: 20 },
};
/**
 * The spread a shot is judged over, in its level's scatter (aim, speed): eight aims at the middles of eight equally
 * likely shares of a Gaussian error, then four speeds likewise, each with the other straight, and the four where both
 * are off together (a putt pushed wide and long, say, which is how a lay-up short of a pond goes in).
 */
const SAMPLES: [number, number][] = [
  ...[0.157, 0.489, 0.887, 1.534].flatMap((q): [number, number][] => [
    [q, 0],
    [-q, 0],
  ]),
  ...[0.674, 1.5].flatMap((q): [number, number][] => [
    [0, q],
    [0, -q],
  ]),
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];
/** The quick second look at many shots: the aim a little more than a scatter to either side. */
const SCREEN: [number, number][] = [
  [0, 0],
  [1.2, 0],
  [-1.2, 0],
];
const wrap = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
const turnApart = (a: number, b: number) => {
  const d = Math.abs(wrap(a) - wrap(b));
  return Math.min(d, 2 * Math.PI - d);
};
const clampSpeed = (v: number) => Math.max(SPEED_MIN, Math.min(SPEED_MAX, v));
/** The speed that rolls a ball `d` metres on the flat carpet. */
const speedFor = (d: number) => Math.sqrt(2 * GREEN * G * d);
/** The coarse look's speeds: those that roll so far on the flat, then two harder for banks and slopes. */
const SPEEDS = [0.3, 0.6, 1, 1.4, 1.9, 2.5, 3.2, 4, 5, 6.2].map(speedFor).concat([4.4, 5.2]);

interface Tried {
  angle: number;
  speed: number;
  value: number;
  x: number;
  z: number;
}
/** One plan's shots tried, each once (by its aim and speed), and the work spent. */
class Search {
  private seen = new Map<string, Tried>();
  spent = 0;
  constructor(
    private hole: Hole,
    private at: P,
    /** How far the ball lies from the cup now, by the way round, and what a ball in the water costs. */
    private start: number,
    private wet: number,
  ) {}
  get left() {
    return this.spent < BUDGET;
  }
  /** Where a shot ends and what that is worth (strokes still to come; lower is better). */
  value(angle: number, speed: number, open = true, phase = 0): Tried {
    angle = wrap(angle);
    speed = clampSpeed(speed);
    const key = `${Math.round(angle * 1e4)}|${Math.round(speed * 1e3)}|${open ? 1 : Math.round(phase * 1e3)}`,
      known = this.seen.get(key);
    if (known) return known;
    const hole = this.hole,
      end = roll(hole, this.at, { angle, speed, phase }, open);
    this.spent += end.steps;
    let value = HARD * speed;
    if (end.result === "rest") {
      const d = distanceAt(hole, end.x, end.z);
      value += after(d) + (groundAt(hole, end.x, end.z) === "sand" ? SAND : 0) + STALL * Math.max(0, Math.min(1, (d - this.start + GAIN) / GAIN));
    } else if (end.result !== "cup") value += this.wet + after(this.start);
    const out = { angle, speed, value, x: end.x, z: end.z };
    this.seen.set(key, out);
    return out;
  }
  /** The average a shot comes to over a spread of small errors in its aim and speed. */
  spread(angle: number, speed: number, scatter: { angle: number; speed: number }, samples: [number, number][], open = true, phase = 0) {
    let sum = 0;
    for (const [da, ds] of samples) sum += this.value(angle + da * scatter.angle, speed * Math.exp(ds * scatter.speed), open, phase).value;
    return sum / samples.length;
  }
}
/** The best `n` of `list` (lowest `score`) that differ from each other in aim, speed or where they end. */
function differing<T extends Tried>(list: T[], n: number, score: (t: T) => number) {
  const sorted = [...list].sort((a, b) => score(a) - score(b)),
    out: T[] = [];
  for (const t of sorted) {
    if (out.length >= n) break;
    if (out.every((o) => turnApart(o.angle, t.angle) > 0.04 || Math.abs(Math.log(o.speed / t.speed)) > 0.12 || Math.hypot(o.x - t.x, o.z - t.z) > 0.25))
      out.push(t);
  }
  return out;
}
/** The best shot from `at` as the computer sees it, before its hand shakes. */
export function planShot(hole: Hole, at: P, level: Level = "hard"): Shot {
  const scatter = SCATTER[level],
    search = new Search(hole, at, distanceAt(hole, at.x, at.z), WET[level]),
    tried: Tried[] = [];
  // 1. The coarse look. Straight at the cup when nothing stands between, at about the speed that just reaches it.
  const cup = hole.cup;
  if (inSight(hole, at, cup)) {
    const d = Math.hypot(cup.x - at.x, cup.z - at.z),
      rise = heightAt(hole, cup.x, cup.z) - heightAt(hole, at.x, at.z),
      need = Math.sqrt(Math.max(0.05, 2 * GREEN * G * d + 2 * (5 / 7) * G * rise)),
      angle = yawOf(cup.x - at.x, cup.z - at.z);
    for (const k of [0.98, 1.04, 1.1, 1.18, 1.28, 1.4]) tried.push(search.value(angle, need * k));
  }
  // A fan all round, and finer about the way to go.
  const ahead = aimYaw(hole, at);
  for (let k = 0; k < 48; k++) for (const speed of SPEEDS) tried.push(search.value(ahead + (2 * Math.PI * k) / 48, speed));
  for (let k = -10; k <= 10; k++) if (k && k % 4) for (const speed of SPEEDS.slice(2, 10)) tried.push(search.value(ahead + k * 0.033, speed));
  // 2. The best that differ, tried again with the aim a little off.
  let pool = differing(tried, 30, (t) => t.value).map((t) => ({ ...t, score: search.spread(t.angle, t.speed, scatter, SCREEN) }));
  // 3. The best of those over the whole spread.
  pool = differing(pool, 8, (t) => t.score);
  for (const t of pool) if (search.left || t === pool[0]) t.score = search.spread(t.angle, t.speed, scatter, SAMPLES);
  pool.sort((a, b) => a.score - b.score);
  // 4. The best two, refined by small steps while the average improves.
  let chosen = pool[0];
  for (const start of pool.slice(0, 2)) {
    let best = { ...start };
    for (let round = 0; round < 3 && search.left; round++) {
      let moved = false;
      for (const [da, ds] of [
        [0.5, 0],
        [-0.5, 0],
        [0, 0.7],
        [0, -0.7],
      ]) {
        if (!search.left) break;
        const angle = wrap(best.angle + da * scatter.angle),
          speed = clampSpeed(best.speed * Math.exp(ds * scatter.speed)),
          score = search.spread(angle, speed, scatter, SAMPLES);
        if (score < best.score - 1e-9) {
          best = { ...best, angle, speed, score };
          moved = true;
        }
      }
      if (!moved) break;
    }
    if (best.score < chosen.score - 1e-9) chosen = best;
  }
  let shot: Shot = { angle: wrap(chosen.angle), speed: clampSpeed(chosen.speed), phase: 0 };
  // 5. With a windmill on the way, the moment to strike: the one whose neighbours come through its door as well,
  // over the speed's small errors.
  if (hole.windmill) {
    const n = scatter.phases,
      speeds: [number, number][] = [
        [0, 0],
        [0, 1],
        [0, -1],
      ],
      scores = Array.from({ length: n }, (_, k) => search.spread(shot.angle, shot.speed, scatter, speeds, false, k / n));
    let phase = 0,
      lowest = Infinity;
    for (let k = 0; k < n; k++) {
      const value = scores[k] + 0.25 * (scores[(k + 1) % n] + scores[(k + n - 1) % n]);
      if (value < lowest - 1e-9) {
        lowest = value;
        phase = k / n;
      }
    }
    shot = { ...shot, phase };
  }
  return shot;
}
/** A Gaussian draw, for the computer's unsteady hand. */
function gauss(random: Random) {
  const u = Math.max(1e-9, random()),
    v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
/** The computer's putt at its level: the planned shot, made by a hand that shakes. */
export function aimedShot(hole: Hole, at: P, level: Level, random: Random): Shot {
  const plan = planShot(hole, at, level),
    shake = SCATTER[level];
  return { angle: wrap(plan.angle + gauss(random) * shake.angle), speed: clampSpeed(plan.speed * (1 + gauss(random) * shake.speed)), phase: plan.phase };
}
