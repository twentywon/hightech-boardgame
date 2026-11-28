/**
 * The computer of 전술 대전. For the unit whose turn it is, it looks at every tile it can stand on and every strike
 * it can make from there (or first strike, then walk away), and weighs each: the damage done and the units felled,
 * friends caught in fire or light counted against it, health given back, and how dangerous the tile is to stand on
 * afterwards (what every enemy could reach and do there), with a little for high ground and for keeping the right
 * distance. 쉬움 takes any of the decent plans; 보통 the best; 어려움 also looks at what the next enemy to act could do
 * in answer to each of the best few. A plan is carried out a command at a time.
 */
import type { Move } from "../points/types";
import {
  CELLS,
  JOBS,
  STEP,
  STRIKE,
  WAIT,
  activeUnit,
  beams,
  canonical,
  distance,
  fieldOf,
  hitsOf,
  neighbour,
  play,
  queue,
  reach,
  targetsFrom,
  type Job,
  type State,
  type Unit,
} from "./rules";

type Level = "easy" | "normal" | "hard";
/** How much a unit of each kind is worth keeping (and felling). */
const WORTH: Record<Job, number> = { knight: 1, archer: 1.1, fire: 1.25, healer: 1.3, assassin: 1.15, light: 1.15, angel: 2.6 };
const RANGED = new Set<Job>(["archer", "fire", "light"]);
const wait: Move = { from: -1, to: WAIT, extra: -1 };
interface Plan {
  steps: Move[];
  score: number;
}
/** What a strike's damage is worth: a share of the unit, more when it falls. */
const harm = (v: Unit, amount: number) => WORTH[v.job] * ((30 * Math.min(amount, v.hp)) / v.max + (amount >= v.hp ? 26 : 0) + (amount < v.hp ? 6 * (1 - (v.hp - amount) / v.max) : 0));
/** What a strike from `from` at `target` is worth to the striker: harm done to enemies, less harm done to friends. */
export function strikeValue(state: State, unit: Unit, from: number, target: number) {
  let value = 0;
  for (const hit of hitsOf(state, unit, from, target)) {
    const v = state.units[hit.id];
    if (hit.heal) value += WORTH[v.job] * ((27 * hit.amount) / v.max + (v.hp / v.max < 0.45 ? 6 : 0));
    else if (v.side !== unit.side) value += harm(v, hit.amount);
    else value -= 1.5 * harm(v, hit.amount) + (v.id === unit.id ? 4 : 0);
  }
  return value;
}
/**
 * The tiles every enemy of `side` could strike next turn, and how hard: each enemy's reach and its strike's range
 * from every tile of it, with the damage it does to a unit of `side` standing there flat in front.
 */
function threats(state: State, side: number) {
  const field = fieldOf(state.field),
    enemies = state.units.filter((u) => u.hp > 0 && u.side !== side),
    marks: { enemy: Unit; cover: Uint8Array }[] = [];
  for (const enemy of enemies) {
    const cover = new Uint8Array(CELLS);
    if (enemy.job === "healer") {
      marks.push({ enemy, cover });
      continue;
    }
    const spots = [enemy.cell, ...reach(state, enemy).dests];
    for (const spot of spots) {
      if (enemy.job === "light") {
        for (const line of beams(state, spot)) for (const c of line) cover[c] = 1;
        continue;
      }
      const [lo, hi] = enemy.job === "archer" ? [2, 5] : enemy.job === "fire" ? [0, 5] : enemy.job === "angel" ? [1, 8] : [1, 1];
      if (hi === 1) {
        for (let d = 0; d < 4; d++) {
          const n = neighbour(spot, d);
          if (n >= 0 && Math.abs(field.height[n] - field.height[spot]) <= 2) cover[n] = 1;
        }
        continue;
      }
      for (let c = 0; c < CELLS; c++) {
        const k = distance(spot, c);
        if (k >= lo && k <= hi) cover[c] = 1;
      }
    }
    marks.push({ enemy, cover });
  }
  return marks;
}
type Threats = ReturnType<typeof threats>;
/** How much each kind minds standing where the enemy can reach: the knight little, the healer most. */
const CAUTION: Record<Job, number> = { knight: 0.18, assassin: 0.3, archer: 0.38, fire: 0.42, light: 0.4, healer: 0.5, angel: 0.5 };
/** How far each kind's strike reaches from where it stands. */
const FAR: Record<Job, number> = { knight: 1, assassin: 1, archer: 5, fire: 5, light: 4, healer: 1, angel: 8 };
/**
 * How good a tile is for `unit` to end its turn on, in the same units as a strike's worth: what the enemy could do to
 * it there, against what it could strike from there next turn; how close it keeps to the fight (more so the longer
 * the battle has gone on without an end), high ground, and not being left alone.
 */
function standingValue(state: State, unit: Unit, cell: number, danger: Threats) {
  const field = fieldOf(state.field),
    stats = JOBS[unit.job];
  let feared = 0;
  for (const { enemy, cover } of danger) {
    if (!cover[cell]) continue;
    feared += enemy.job === "angel" ? unit.hp : Math.max(1, JOBS[enemy.job].power - stats.def) * (enemy.job === "assassin" ? 1.4 : 1.15);
  }
  let value = -CAUTION[unit.job] * WORTH[unit.job] * ((30 * Math.min(feared, unit.hp)) / unit.max + (feared >= unit.hp ? 16 : 0));
  const enemies = state.units.filter((u) => u.hp > 0 && u.side !== unit.side),
    friends = state.units.filter((u) => u.hp > 0 && u.side === unit.side && u.id !== unit.id),
    nearest = enemies.reduce((n, e) => Math.min(n, distance(cell, e.cell)), 99),
    push = 1 + Math.min(2.5, state.turns / 70);
  // What it could strike next turn from here: the best of the enemies within its move and reach.
  if (unit.job !== "healer") {
    let threat = 0;
    for (const e of enemies)
      if (distance(cell, e.cell) <= stats.move + FAR[unit.job]) threat = Math.max(threat, harm(e, unit.job === "angel" ? e.hp : Math.max(1, stats.power - JOBS[e.job].def)));
    value += 0.3 * push * threat;
  }
  if (unit.job === "healer") {
    // Close behind the most hurt friend, away from the enemy.
    const hurt = friends.reduce<Unit | null>((h, f) => (!h || f.hp / f.max < h.hp / h.max ? f : h), null);
    if (hurt) value -= 1.1 * Math.max(0, distance(cell, hurt.cell) - 1);
    if (nearest <= 2) value -= 3;
  } else if (RANGED.has(unit.job)) {
    value -= 1.2 * push * Math.max(0, nearest - FAR[unit.job]);
    if (nearest <= 1) value -= 4;
  } else if (unit.job === "angel") value -= 0.6 * push * Math.max(0, nearest - 8);
  else value -= 1.6 * push * Math.max(0, nearest - 1);
  value += (RANGED.has(unit.job) ? 1.2 : 0.5) * field.height[cell];
  // Not too far from friends: a unit alone is picked off.
  if (friends.length && unit.job !== "angel") value -= 0.25 * Math.max(0, friends.reduce((n, f) => Math.min(n, distance(cell, f.cell)), 99) - 3);
  return value;
}
/** The strikes worth looking at from `from`: for fire, only where it catches someone. */
function aims(state: State, unit: Unit, from: number) {
  const seen = new Set<number>(),
    out: number[] = [];
  for (const t of targetsFrom(state, unit, from)) {
    const to = canonical(state, from, unit, t);
    if (seen.has(to)) continue;
    seen.add(to);
    if (unit.job === "fire" && !state.units.some((u) => u.hp > 0 && u.id !== unit.id && distance(u.cell, to) <= 1)) continue;
    out.push(to);
  }
  return out;
}
/** Every plan for the rest of the active unit's turn, with its worth. */
function plans(state: State, care = 1): Plan[] {
  const unit = activeUnit(state),
    danger = threats(state, unit.side),
    walks = state.moved ? [] : reach(state, unit).dests,
    places = [unit.cell, ...walks],
    worth = new Map(places.map((c) => [c, care * standingValue(state, unit, c, danger)])),
    out: Plan[] = [];
  const stepTo = (from: number, to: number): Move => ({ from, to, extra: STEP }),
    strikeAt = (from: number, to: number): Move => ({ from, to, extra: STRIKE });
  // Only walking (or staying): a turn that only waits comes back sooner.
  for (const c of places) out.push({ steps: c === unit.cell ? [wait] : [stepTo(unit.cell, c), wait], score: worth.get(c)! + (c === unit.cell && !state.moved && !state.acted ? 1 : 0) });
  if (state.acted) return out;
  // Walking (or not), then striking from there.
  for (const c of places)
    for (const t of aims(state, { ...unit, cell: c }, c)) {
      const value = strikeValue(state, unit, c, t);
      if (value <= 0) continue;
      out.push({ steps: c === unit.cell ? [strikeAt(c, t), ...(state.moved ? [] : [wait])] : [stepTo(unit.cell, c), strikeAt(c, t)], score: value + worth.get(c)! });
    }
  // Striking first, then walking to the best tile.
  if (walks.length) {
    const best = walks.reduce((b, c) => (worth.get(c)! > worth.get(b)! ? c : b), walks[0]);
    for (const t of aims(state, unit, unit.cell)) {
      const value = strikeValue(state, unit, unit.cell, t);
      if (value > 0) out.push({ steps: [strikeAt(unit.cell, t), stepTo(unit.cell, best)], score: value + worth.get(best)! });
    }
  }
  return out;
}
/** Plays a plan's commands from `state` (stopping where one is refused). */
function carry(state: State, steps: Move[]) {
  let s = state;
  for (const step of steps) {
    const next = play(s, step);
    if (!next) break;
    s = next;
    if (s.turns !== state.turns) break;
  }
  return s;
}
/** What the best strike of the next enemy to act would be worth to it, after a plan has been carried out. */
function answer(after: State, side: number) {
  if (after.winner !== null) return after.winner === side ? -400 : 400;
  const next = queue(after, 13).find((id) => after.units[id].side !== side && after.units[id].hp > 0);
  if (next === undefined) return 0;
  const them: State = { ...after, active: next, moved: false, acted: false, origin: null, aim: null, preview: -1 },
    unit = them.units[next],
    places = [unit.cell, ...reach(them, unit).dests];
  let best = 0;
  for (const c of places) for (const t of aims(them, { ...unit, cell: c }, c)) best = Math.max(best, strikeValue(them, unit, c, t));
  return best;
}
/** The plan the computer means to carry out, kept between its commands. */
let planned: { field: string; turns: number; active: number; steps: Move[] } | null = null;
function decide(state: State, level: Level, random: () => number): Move[] {
  const unit = activeUnit(state),
    all = plans(state, level === "easy" ? 0.6 : 1);
  if (!all.length) return [wait];
  all.sort((a, b) => b.score - a.score);
  if (level === "easy") {
    // Any plan not far behind the best.
    const best = all[0].score,
      decent = all.filter((p) => p.score >= best - Math.max(10, Math.abs(best) * 0.4)).slice(0, 12);
    return decent[Math.floor(random() * decent.length)].steps;
  }
  if (level === "normal") {
    const near = all.filter((p) => p.score >= all[0].score - 1.5);
    return near[Math.floor(random() * near.length)].steps;
  }
  // 어려움: what the next enemy could do in answer to each of the best few.
  let best = all[0],
    bestScore = -Infinity;
  for (const plan of all.slice(0, 7)) {
    const score = plan.score - 0.7 * answer(carry(state, plan.steps), unit.side);
    if (score > bestScore) {
      bestScore = score;
      best = plan;
    }
  }
  return best.steps;
}
/** The computer's next command for the unit whose turn it is. */
export function chooseMove(state: State, level: Level, random: () => number): Move | null {
  if (state.winner !== null) return null;
  const fresh = !state.moved && !state.acted;
  if (!fresh && planned && planned.field === state.field && planned.turns === state.turns && planned.active === state.active) {
    while (planned.steps.length) {
      const step = planned.steps.shift()!;
      if (play(state, step)) return step;
    }
  }
  const steps = decide(state, level, random);
  planned = { field: state.field, turns: state.turns, active: state.active, steps: [...steps] };
  const first = planned.steps.shift()!;
  return play(state, first) ? first : wait;
}
