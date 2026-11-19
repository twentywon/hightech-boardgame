import type { Random } from "../../core/random";
import { winChance } from "./odds";
import { mustTrade, reachable, setsIn, territoriesOf, type Action, type State } from "./rules";

/**
 * The computer's next step, one at a time so that each is seen: it trades its sets, reinforces the borders it means
 * to attack from or must hold, attacks where the odds (worked out exactly, `winChance`) and what there is to gain are
 * good (a continent to finish, another's bonus to break, a capital, a player to knock out, a card for the turn),
 * follows a conquest in with what the old front can spare, and moves its idle armies toward the front. It reads
 * only what every player can see, and its own cards. Free of Three.js and DOM.
 */
export type Level = "easy" | "normal" | "hard";
export const LEVELS: Record<Level, { label: string; need: number; attacks: number; greed: number }> = {
  easy: { label: "쉬움", need: 0.7, attacks: 3, greed: 0.6 },
  normal: { label: "보통", need: 0.6, attacks: 8, greed: 1 },
  hard: { label: "어려움", need: 0.52, attacks: 14, greed: 1.25 },
};
/** Enemy armies next to a territory of `me`. */
function threat(s: State, t: number, me: number) {
  return s.map.territories[t].neighbours.reduce((n, x) => n + (s.owner[x] !== me ? s.armies[x] : 0), 0);
}
const facesEnemy = (s: State, t: number, me: number) => s.map.territories[t].neighbours.some((n) => s.owner[n] !== me);
/** What taking `t` is worth to `me`, beyond the territory itself. */
export function worth(s: State, t: number, me: number) {
  const map = s.map,
    continent = map.continents[map.territories[t].continent],
    held = continent.territories.filter((x) => s.owner[x] === me).length,
    holder = s.owner[t],
    owners = new Set(continent.territories.map((x) => s.owner[x]));
  let value = 1;
  // A continent nearly mine, finished by this.
  if (held + 1 === continent.territories.length) value += continent.bonus * 1.3;
  else value += ((held + 1) / continent.territories.length) * Math.min(3, continent.bonus) * 0.6;
  // Another player's bonus broken.
  if (owners.size === 1 && holder !== me) value += continent.bonus * 0.9;
  // A player knocked out gives up their cards.
  if (territoriesOf(s, holder) === 1) value += 2 + s.seats[holder].cards.length * 0.9;
  // Capitals win the 수도 점령 game; my own lost is won back first.
  if (s.mode === "capitals") {
    const capital = s.seats.findIndex((seat) => seat.capital === t);
    if (capital === me) value += 8;
    else if (capital >= 0) value += 5;
  }
  // A turn that has taken nothing yet earns no card.
  if (!s.conquered) value += 1;
  return value;
}
interface Plan {
  from: number;
  to: number;
  score: number;
  chance: number;
}
/** The best attacks open to the player to move, `extra` armies added on their own side first. */
function plans(s: State, me: number, extra: number) {
  const out: Plan[] = [];
  s.owner.forEach((o, from) => {
    if (o !== me) return;
    const armies = s.armies[from] + extra;
    if (armies < 2) return;
    for (const to of s.map.territories[from].neighbours) {
      if (s.owner[to] === me) continue;
      const chance = winChance(armies, s.armies[to]);
      out.push({ from, to, chance, score: chance * worth(s, to, me) - (1 - chance) * 1.2 });
    }
  });
  return out.sort((a, b) => b.score - a.score || a.from - b.from || a.to - b.to);
}
/** The territory of `me` most in danger: the most enemy armies around it for the armies on it, a capital counted twice. */
function weakest(s: State, me: number) {
  let best = -1,
    danger = -Infinity;
  s.owner.forEach((o, t) => {
    if (o !== me || !facesEnemy(s, t, me)) return;
    const capital = s.seats[me].capital === t ? 2 : 1,
      continent = s.map.continents[s.map.territories[t].continent],
      whole = continent.territories.every((x) => s.owner[x] === me) ? 1 + continent.bonus * 0.3 : 1,
      d = ((threat(s, t, me) + 1) / (s.armies[t] + 1)) * capital * whole;
    if (d > danger) {
      danger = d;
      best = t;
    }
  });
  return best;
}
export function decide(s: State, level: Level, random: Random): Action {
  const me = s.turn,
    rule = LEVELS[level];
  if (s.phase === "reinforce") {
    const sets = setsIn(s.seats[me].cards);
    if (sets.length && (mustTrade(s) || level !== "easy" || random() < 0.4)) return { type: "trade", cards: sets[0] };
    const R = s.reserve;
    if (level === "easy") {
      const borders = s.owner.flatMap((o, t) => (o === me && facesEnemy(s, t, me) ? [t] : []));
      const t = borders.length ? borders[Math.floor(random() * borders.length) % borders.length] : s.owner.indexOf(me);
      return { type: "place", territory: t, count: Math.min(R, 1 + Math.floor(random() * 3)) };
    }
    const best = plans(s, me, R)[0],
      guard = weakest(s, me);
    if (!best) return { type: "place", territory: guard >= 0 ? guard : s.owner.indexOf(me), count: R };
    // The front was reinforced a moment ago: the rest goes where it is most needed.
    const last = s.last;
    if (last?.kind === "place" && last.player === me && guard >= 0 && last.territory !== guard) return { type: "place", territory: guard, count: R };
    // Enough on the front to make the best attack likely; the rest, if a border is in danger, there.
    let need = 0;
    while (need < R && winChance(s.armies[best.from] + need, s.armies[best.to]) < (level === "hard" ? 0.8 : 0.7)) need++;
    const front = Math.max(1, Math.min(R, Math.max(need, Math.ceil(R * (level === "hard" ? 0.7 : 0.5)))));
    const pressed = guard >= 0 && guard !== best.from && threat(s, guard, me) > s.armies[guard];
    return { type: "place", territory: best.from, count: pressed ? front : R };
  }
  if (s.phase === "attack") {
    if (s.fights < rule.attacks) {
      const best = plans(s, me, 0).find((p) => p.chance >= rule.need && p.score * rule.greed > 0.35 && (level !== "easy" || random() < 0.75));
      if (best) return { type: "attack", from: best.from, to: best.to, blitz: true };
    }
    return { type: "next" };
  }
  if (s.phase === "occupy" && s.pending) {
    const { from, to, max } = s.pending;
    if (!facesEnemy(s, from, me)) return { type: "occupy", count: max };
    if (level === "easy") return { type: "occupy", count: random() < 0.5 ? max : Math.floor(max / 2) };
    const behind = threat(s, from, me),
      ahead = threat(s, to, me) + 1,
      // Pressing on: the front moves with the armies when there is more to take beyond.
      forward = s.map.territories[to].neighbours.some((n) => s.owner[n] !== me && winChance(s.armies[from], s.armies[n]) > 0.5) ? 1.3 : 1;
    return { type: "occupy", count: Math.max(0, Math.min(max, Math.round((max * ahead * forward) / (ahead * forward + behind)))) };
  }
  if (s.phase === "fortify") {
    if (level === "easy" && random() < 0.5) return { type: "next" };
    // The largest idle army goes to the front that needs it most.
    let from = -1;
    s.owner.forEach((o, t) => {
      if (o === me && s.armies[t] > 1 && !facesEnemy(s, t, me) && (from < 0 || s.armies[t] > s.armies[from])) from = t;
    });
    if (from >= 0) {
      const fronts = reachable(s, from).filter((t) => facesEnemy(s, t, me));
      if (fronts.length) {
        const to = fronts.reduce((a, b) => (threat(s, b, me) - s.armies[b] > threat(s, a, me) - s.armies[a] ? b : a));
        return { type: "fortify", from, to, count: s.armies[from] - 1 };
      }
    }
    if (level === "hard") {
      // A quiet front with armies to spare helps a pressed one it can reach.
      const guard = weakest(s, me);
      if (guard >= 0) {
        const spare = reachable(s, guard)
          .filter((t) => s.armies[t] > 2 && threat(s, t, me) * 1.5 < s.armies[t])
          .sort((a, b) => s.armies[b] - s.armies[a] || a - b)[0];
        if (spare !== undefined) {
          const count = s.armies[spare] - Math.max(1, Math.ceil(threat(s, spare, me) * 1.2));
          if (count > 0) return { type: "fortify", from: spare, to: guard, count: Math.min(count, s.armies[spare] - 1) };
        }
      }
    }
    return { type: "next" };
  }
  return { type: "next" };
}
