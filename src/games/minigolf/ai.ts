import type { Random } from "../../core/random";
import type { Level } from "../points/ai";
import { heightAt, type Hole, type P } from "./course";
import { SPEED_MAX, SPEED_MIN, aimYaw, distanceAt, inSight, roll, yawOf, type Shot } from "./sim";

/**
 * The computer's putt: it tries shots through the same physics the rules use and plays the one whose end looks
 * best by the way round to the cup (`distanceAt`), first over a coarse fan of directions and speeds, then finer
 * round the best, then once more round the few best with its hand a little off, so that it keeps to shots that
 * still come off when they are not quite right. The windmill's door is thought open at first; the moment to strike
 * is chosen after, for the shot found. Its hand then shakes as its level says.
 */
const G = 9.81;
/** How many strokes a ball at rest `d` metres (by the way round) from the cup is still likely to need. */
const after = (d: number) => 1 + 0.55 * Math.pow(Math.max(0, d), 0.8);
function cost(hole: Hole, at: P, shot: Shot, open: boolean) {
  const end = roll(hole, at, shot, open);
  if (end.result === "cup") return 0;
  // A ball in the water is played again from where it was, a stroke the worse.
  if (end.result !== "rest") return 2 + after(distanceAt(hole, at.x, at.z));
  return after(distanceAt(hole, end.x, end.z));
}
const wrap = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
const clampSpeed = (v: number) => Math.max(SPEED_MIN, Math.min(SPEED_MAX, v));
/** How unsteady the computer's hand is at each level: in its aim (radians) and in its speed (a share of it). */
export const SCATTER: Record<Level, { angle: number; speed: number; phases: number }> = {
  easy: { angle: (6 * Math.PI) / 180, speed: 0.2, phases: 4 },
  normal: { angle: (3.6 * Math.PI) / 180, speed: 0.11, phases: 10 },
  hard: { angle: (2 * Math.PI) / 180, speed: 0.06, phases: 20 },
};
/** The best shot from `at` as the computer sees it, before its hand shakes. */
export function planShot(hole: Hole, at: P, level: Level = "hard"): Shot {
  const tried: { shot: Shot; value: number }[] = [],
    tryShot = (angle: number, speed: number) => {
      const shot = { angle: wrap(angle), speed: clampSpeed(speed), phase: 0 };
      tried.push({ shot, value: cost(hole, at, shot, true) });
    };
  // Straight at the cup when nothing stands between, at about the speed that just reaches it.
  const cup = hole.cup;
  if (inSight(hole, at, cup)) {
    const d = Math.hypot(cup.x - at.x, cup.z - at.z),
      rise = heightAt(hole, cup.x, cup.z) - heightAt(hole, at.x, at.z),
      need = Math.sqrt(Math.max(0.05, 2 * 0.068 * G * d + 2 * (5 / 7) * G * rise)),
      angle = yawOf(cup.x - at.x, cup.z - at.z);
    for (const k of [0.98, 1.04, 1.1, 1.18, 1.28]) tryShot(angle, need * k);
  }
  // A fan of directions, wider about the way to go, at a spread of speeds.
  const ahead = aimYaw(hole, at);
  for (let k = 0; k < 48; k++) {
    const angle = ahead + (2 * Math.PI * k) / 48;
    for (const speed of [0.7, 1.15, 1.7, 2.4, 3.2, 4.3]) tryShot(angle, speed);
  }
  for (let k = -6; k <= 6; k++) if (k) for (const speed of [1.15, 1.7, 2.4, 3.2]) tryShot(ahead + k * 0.035, speed);
  const best = (n: number) => {
    const sorted = [...tried].sort((a, b) => a.value - b.value),
      out: typeof tried = [];
    for (const t of sorted) {
      if (out.length >= n) break;
      // Keep shots that differ, so that the finer look goes to more than one idea.
      if (out.every((o) => Math.abs(o.shot.angle - t.shot.angle) > 0.02 || Math.abs(o.shot.speed - t.shot.speed) / o.shot.speed > 0.08)) out.push(t);
    }
    return out;
  };
  // Finer round the best few.
  for (const { shot } of best(4))
    for (let a = -2; a <= 2; a++) for (let s = -2; s <= 2; s++) if (a || s) tryShot(shot.angle + a * 0.012, shot.speed * (1 + s * 0.035));
  // The few best tried again a little off, as the hand would make them: the shot that keeps best is played.
  const scatter = SCATTER[level];
  let chosen = tried[0].shot,
    least = Infinity;
  for (const { shot, value } of best(6)) {
    let sum = value;
    for (const [da, ds] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      sum += cost(hole, at, { angle: wrap(shot.angle + da * scatter.angle * 0.7), speed: clampSpeed(shot.speed * (1 + ds * scatter.speed * 0.7)), phase: 0 }, true);
    if (sum < least) {
      least = sum;
      chosen = shot;
    }
  }
  // With a windmill on the way, the moment to strike: the one that brings the shot through its door.
  if (hole.windmill) {
    let phase = 0,
      lowest = Infinity;
    for (let k = 0; k < scatter.phases; k++) {
      const p = k / scatter.phases,
        value = cost(hole, at, { ...chosen, phase: p }, false);
      if (value < lowest - 1e-9) {
        lowest = value;
        phase = p;
      }
    }
    chosen = { ...chosen, phase };
  }
  return chosen;
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
