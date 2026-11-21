import type { Move } from "../points/types";
import { HEXES, NEAR2, NEIGHBOURS } from "./board";
import {
  ACCEPT,
  CAPITAL,
  CITY,
  END,
  NATION,
  NONE,
  PORT,
  PROPOSE,
  REFUSE,
  SPEECH,
  START,
  VILLAGE,
  allied,
  canSpeak,
  destinations,
  dominates,
  moveOnly,
  movable,
  offerable,
  standing,
  standingNations,
  type State,
} from "./rules";

/*
 * The computer of 헥스 정복전, our own. It plays one move at a time for the nation to move: every move of every army
 * that may still move is made on a copy (without passing the turn on) and the position after it is weighed against
 * the position before; 턴 종료 is weighed as the morale its idle armies would lose. A position is weighed by
 *  - material: men and morale of its own armies, less a share of the others' (a battle lost is a loss of men);
 *  - land: plain land, ports, towns and capitals held, less a share of what the others hold, and every nation still
 *    standing against it (a capital taken is worth far more than anything else);
 *  - the way ahead: each army's distance (in steps, over land and through ports and the sea) to the nearest estate
 *    it does not hold, and (more for the harder levels) to the capitals of the others;
 *  - the strike ahead: for each army the best thing within two steps that it could take next turn (an undefended
 *    estate, a weaker army, a capital whose guard it outweighs), so that armies join before a big attack;
 *  - the danger: an estate of its own that an enemy army within two steps outweighs, worst for its own capital (so
 *    that a guard stays, or comes back, when an enemy is near).
 * Easy is greedy and careless: it sees only material and land, often plays an untried move at random, and ignores
 * danger. Normal weighs everything with some noise; hard weighs the capitals and the danger fully. All of it reads
 * the public board only (everything in this game is public).
 *
 * Beyond the moves of its armies:
 *  - allies: it never moves onto an ally's hex or army (so it never breaks an alliance), does not count an ally's
 *    armies as a danger nor an ally's estates as goals; on the first move of its turn, while it does not dominate
 *    the field and has no ally, it may offer an alliance (`OFFER_CHANCE` a turn) to the strongest nation at least
 *    as strong as itself that borders it and would not refuse (and never one that would leave every nation allied);
 *    it answers an offer by the rules' own weighing (`dominates`);
 *  - the speech: it gives it when, with full morale, one of its armies could win a battle it would lose now against
 *    an army worth fighting, or when its morale is very low (its total morale under a quarter of its men, with at
 *    least 30 men); easy only for the latter.
 */
export type Level = "easy" | "normal" | "hard";
const WEIGHTS: Record<Level, { approach: number; capitals: number; strike: number; danger: number; noise: number; slip: number }> = {
  easy: { approach: 0.6, capitals: 0, strike: 0, danger: 0, noise: 6, slip: 0.25 },
  normal: { approach: 1.2, capitals: 0.4, strike: 0.35, danger: 0.6, noise: 1.5, slip: 0 },
  hard: { approach: 1.4, capitals: 1, strike: 0.5, danger: 1, noise: 0.4, slip: 0 },
};
const VALUE = { plain: 2, port: 14, village: 40, city: 60, capital: 70, conquest: 420 };
const worthOf = (e: number) => (e === VILLAGE ? VALUE.village : e === CITY ? VALUE.city : e === PORT ? VALUE.port : e === CAPITAL ? VALUE.capital : VALUE.plain);
/** The chance a turn that a computer not dominating the field offers an alliance, by level. */
export const OFFER_CHANCE: Record<Level, number> = { easy: 0.15, normal: 0.3, hard: 0.3 };
/** Steps from every hex to the nearest of `sources`, as an army would go if nothing stood in the way. */
function steps(s: State, sources: number[]) {
  const far = new Array<number>(HEXES).fill(99),
    queue = [...sources];
  for (const h of sources) far[h] = 0;
  const { land, estate } = s.map;
  while (queue.length) {
    const h = queue.shift()!;
    for (const n of NEIGHBOURS[h]) {
      if (far[n] <= far[h] + 1) continue;
      // Walking back from the target: from n one may step onto h.
      if (land[n] && !land[h] && estate[n] !== PORT) continue;
      far[n] = far[h] + 1;
      queue.push(n);
    }
  }
  return far;
}
interface Context {
  nation: number;
  goals: number[];
  capitals: number[];
}
function context(s: State, nation: number): Context {
  const goals: number[] = [],
    capitals: number[] = [];
  for (let h = 0; h < HEXES; h++) {
    if (!s.map.land[h] || s.owner[h] === nation || allied(s, nation, s.owner[h])) continue;
    if (s.map.estate[h] !== NONE) goals.push(h);
    if (s.map.estate[h] === CAPITAL) capitals.push(h);
  }
  // With every estate held, the others' land itself is the way ahead.
  if (!goals.length) for (let h = 0; h < HEXES; h++) if (s.map.land[h] && s.owner[h] >= 0 && s.owner[h] !== nation && !allied(s, nation, s.owner[h])) goals.push(h);
  return { nation, goals: steps(s, goals.length ? goals : [s.nations[nation].capital]), capitals: steps(s, capitals.length ? capitals : [s.nations[nation].capital]) };
}
const power = (a: { count: number; morale: number }) => a.count + a.morale;
/** What taking hex `h` would be worth to `nation`. */
function prize(s: State, h: number, nation: number) {
  const e = s.map.estate[h],
    owner = s.owner[h];
  if (owner === nation || allied(s, nation, owner)) return 0;
  if (e === CAPITAL) return s.nations[owner]?.capital === h ? VALUE.conquest : VALUE.capital;
  if (e !== NONE) return worthOf(e);
  return s.map.land[h] ? VALUE.plain : 0;
}
function weigh(s: State, ctx: Context, level: Level) {
  const { nation } = ctx,
    w = WEIGHTS[level];
  if (!s.nations[nation].alive) return -1e6;
  let v = 0;
  const own: number[] = [];
  for (let h = 0; h < HEXES; h++) {
    const a = s.armies[h];
    if (a) {
      if (a.nation === nation) {
        own.push(h);
        v += a.count + 0.5 * a.morale;
      } else if (!allied(s, nation, a.nation)) {
        v -= 0.35 * (a.count + 0.5 * a.morale);
      }
    }
    const o = s.owner[h];
    if (o < 0) continue;
    const worth = worthOf(s.map.estate[h]);
    v += o === nation ? worth : allied(s, nation, o) ? 0 : -0.2 * worth;
  }
  for (let i = 0; i < s.nations.length; i++) if (i !== nation && s.nations[i].present && s.nations[i].alive) v -= VALUE.conquest;
  if (level === "easy") {
    for (const h of own) v -= w.approach * ctx.goals[h];
    return v;
  }
  // The strike ahead: each thing within two steps of an army that outweighs it, counted once, at what taking it is worth.
  const strikes = new Map<number, number>();
  for (const h of own) {
    const a = s.armies[h]!;
    v -= w.approach * ctx.goals[h];
    // A big army makes for the capitals; a small one for whatever is near.
    v -= w.capitals * ctx.capitals[h] * Math.min(1, power(a) / 60) * 2;
    for (const t of NEAR2[h]) {
      const there = s.armies[t];
      if (there && (there.nation === nation || allied(s, nation, there.nation) || power(there) >= power(a))) continue;
      const gain = prize(s, t, nation) + (there ? there.count * 0.8 : 0);
      if (gain > (strikes.get(t) ?? 0)) strikes.set(t, gain);
    }
  }
  for (const gain of strikes.values()) v += w.strike * gain;
  // The danger: an estate of its own that an enemy within two steps outweighs.
  for (let h = 0; h < HEXES; h++) {
    if (s.owner[h] !== nation || s.map.estate[h] === NONE) continue;
    const guard = s.armies[h]?.nation === nation ? power(s.armies[h]!) : 0;
    let threat = 0;
    for (const e of NEAR2[h]) {
      const there = s.armies[e];
      if (there && there.nation !== nation && !allied(s, nation, there.nation)) threat = Math.max(threat, power(there));
    }
    if (threat <= guard) continue;
    const e = s.map.estate[h],
      worth = s.nations[nation].capital === h ? VALUE.conquest * 0.8 : worthOf(e) * 0.5;
    v -= w.danger * worth;
  }
  return v;
}
const PRUNE = 24;
/** The armies most worth moving: those next to something not theirs, then the strongest. */
function prune(s: State, armies: number[]) {
  const nation = s.seat,
    touching = (h: number) => NEAR2[h].some((t) => (s.armies[t] && s.armies[t]!.nation !== nation) || (s.map.land[t] && s.owner[t] !== nation));
  const ranked = [...armies].sort((a, b) => Number(touching(b)) - Number(touching(a)) || power(s.armies[b]!) - power(s.armies[a]!));
  return ranked.slice(0, PRUNE);
}
/** Whether two nations' land or armies touch: a hex of one next to a hex of the other. */
function borders(s: State, a: number, b: number) {
  const of = (h: number, n: number) => (s.map.land[h] && s.owner[h] === n) || s.armies[h]?.nation === n;
  for (let h = 0; h < HEXES; h++) if (of(h, a) && NEAR2[h].some((m) => of(m, b))) return true;
  return false;
}
/** The nation the nation to move would offer an alliance this turn, or -1. */
function suitor(s: State, level: Level, random: () => number) {
  const nation = s.seat;
  // One ally at a time: a computer with an ally offers no more (alliances it never breaks would choke the field).
  if (s.left !== s.budget || s.asked || s.allies[nation] || dominates(s, nation)) return -1;
  const mine = standing(s, nation).power,
    nations = standingNations(s);
  const options = offerable(s, nation).filter((t) => {
    if (t !== s.me && dominates(s, t)) return false;
    if (standing(s, t).power < mine || !borders(s, nation, t)) return false;
    // Never the alliance that would leave every nation allied with every other (it would end them all).
    const after = s.allies.map((x, i) => (i === nation ? x | (1 << t) : i === t ? x | (1 << nation) : x));
    return !nations.every((a) => nations.every((b) => a === b || after[a] & (1 << b)));
  });
  if (!options.length || random() >= OFFER_CHANCE[level]) return -1;
  return options.sort((a, b) => standing(s, b).power - standing(s, a).power)[0];
}
/** Whether a speech now is worth it: a battle it would lose that full morale wins, or very low morale. */
function wantsSpeech(s: State, level: Level) {
  if (!canSpeak(s)) return false;
  const st = standing(s, s.seat);
  if (st.totalMorale * 4 < st.men && st.men >= 30) return true;
  if (level === "easy") return false;
  for (const h of movable(s)) {
    const a = s.armies[h]!;
    for (const d of destinations(s, h)) {
      const there = s.armies[d.to];
      if (!there || there.nation === s.seat || allied(s, s.seat, there.nation)) continue;
      const defence = power(there);
      if (power(a) <= defence && a.count * 2 > defence && (s.map.estate[d.to] !== NONE || there.count >= 15)) return true;
    }
  }
  return false;
}
/** The computer's move for the nation to move. */
export function chooseMove(s: State, level: Level, random: () => number): Move {
  const tool = (to: number): Move => ({ from: -1, to, extra: -1 });
  if (s.phase === "setup") return tool(START);
  if (s.phase === "offer") return tool(dominates(s, s.me) ? REFUSE : ACCEPT);
  if (s.phase === "propose") return tool(PROPOSE);
  if (wantsSpeech(s, level)) return tool(SPEECH);
  const ask = suitor(s, level, random);
  if (ask >= 0) return tool(NATION + ask);
  return chooseArmyMove(s, level, random);
}
/** The best move of an army, or 턴 종료. */
function chooseArmyMove(s: State, level: Level, random: () => number): Move {
  const end: Move = { from: -1, to: END, extra: -1 },
    nation = s.seat,
    w = WEIGHTS[level],
    armies = movable(s, nation),
    options: Move[] = [];
  // With a great many armies only the strongest and those in touch with others are weighed, to keep each move quick.
  const weighed = armies.length > PRUNE ? prune(s, armies) : armies;
  // Never onto an ally's hex or army: the computers do not break alliances.
  for (const h of weighed)
    for (const d of destinations(s, h)) {
      const there = s.armies[d.to],
        whose = there && there.nation !== nation ? there.nation : s.map.land[d.to] ? s.owner[d.to] : -1;
      if (!allied(s, nation, whose)) options.push({ from: h, to: d.to, extra: -1 });
    }
  if (!options.length) return end;
  if (random() < w.slip) return options[Math.floor(random() * options.length)];
  const ctx = context(s, nation),
    base = weigh(s, ctx, level);
  // Ending the turn now costs every army that has not moved a point of morale.
  let best = end,
    bestScore = -armies.length * 0.8;
  for (const move of options) {
    const after = moveOnly(s, move.from, move.to);
    if (!after) continue;
    const score = weigh(after, ctx, level) - base + 0.8 + (random() - 0.5) * w.noise;
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}
