import type { Random } from "../../core/random";
import { winChance } from "./odds";
import { bonusTerritories, moveTargets, mustTrade, setsIn, territoriesOf, type Action, type Mission, type State } from "./rules";

/**
 * The computer's next step, one at a time so that each is seen. Setting up, it claims territories where it can make
 * a continent its own (the smaller and the less contested the better, next to what it already has, as its mission
 * says), reinforces its fronts, and in a game for two lays the neutral army's armies across the other player's way.
 * Playing, it trades its sets (the two extra armies on a front), reinforces the borders it means to attack from or
 * must hold, attacks where the odds (worked out exactly, `winChance`) and what there is to gain are good (a continent
 * to finish, another's bonus to break, a capital, a player to knock out, its mission, a card for the turn), follows a
 * conquest in with what the old front can spare, and moves its idle armies toward the front. It reads only what
 * every player can see, its own cards and its own mission. Free of Three.js and DOM.
 */
export type Level = "easy" | "normal" | "hard";
export const LEVELS: Record<Level, { label: string; need: number; attacks: number; greed: number }> = {
  easy: { label: "쉬움", need: 0.7, attacks: 3, greed: 0.6 },
  normal: { label: "보통", need: 0.6, attacks: 8, greed: 1 },
  hard: { label: "어려움", need: 0.52, attacks: 14, greed: 1.25 },
};
/** Armies of others next to a territory of `me`. */
function threat(s: State, t: number, me: number) {
  return s.map.territories[t].neighbours.reduce((n, x) => n + (s.owner[x] !== me && s.owner[x] >= 0 ? s.armies[x] : 0), 0);
}
const facesEnemy = (s: State, t: number, me: number) => s.map.territories[t].neighbours.some((n) => s.owner[n] !== me && s.owner[n] >= 0);
const missionOf = (s: State, me: number): Mission | null => (s.mode === "missions" ? s.seats[me].mission : null);
/** What `me`'s mission makes of holding `t`, beyond the territory itself. */
function missionWorth(s: State, t: number, me: number) {
  const mission = missionOf(s, me);
  if (!mission) return 0;
  const continent = s.map.territories[t].continent;
  if (mission.kind === "continents") return mission.continents.includes(continent) ? 1.6 + s.map.continents[continent].bonus * 0.25 : mission.extra ? 0.35 : 0;
  if (mission.kind === "territories") return 0.7;
  const holder = s.owner[t];
  return holder === mission.target ? 2.2 + (territoriesOf(s, holder) <= 2 ? 5 : 0) : 0;
}
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
  if (owners.size === 1 && holder !== me && !s.seats[holder]?.neutral) value += continent.bonus * 0.9;
  // A player knocked out gives up their cards (the neutral army has none).
  if (!s.seats[holder]?.neutral && territoriesOf(s, holder) === 1) value += 2 + s.seats[holder].cards.length * 0.9;
  // Capitals win the 수도 점령 game; my own lost is won back first.
  if (s.mode === "capitals") {
    const capital = s.seats.findIndex((seat) => seat.capital === t);
    if (capital === me) value += 8;
    else if (capital >= 0) value += 5;
  }
  value += missionWorth(s, t, me);
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
/** How much of `t`'s continent is `me`'s, and how much another's: [mine, others', size]. */
function shares(s: State, t: number, me: number) {
  const c = s.map.continents[s.map.territories[t].continent];
  let mine = 0,
    others = 0;
  for (const x of c.territories) {
    if (s.owner[x] === me) mine++;
    else if (s.owner[x] >= 0) others++;
  }
  return [mine, others, c.territories.length] as const;
}
/** How good an empty territory is to claim: a continent one can make one's own, next to one's own, as the mission says. */
function claimValue(s: State, t: number, me: number) {
  const [mine, others, size] = shares(s, t, me),
    c = s.map.continents[s.map.territories[t].continent],
    around = s.map.territories[t].neighbours;
  let value = ((mine + 1) / size) * 2.4 - (others / size) * 1.8 + (c.bonus / size) * 1.1;
  if (others === 0) value += (0.9 * (mine + 1)) / size;
  // A continent another is about to fill: one territory of it taken keeps its bonus from them.
  const holders = new Map<number, number>();
  for (const x of c.territories) if (s.owner[x] >= 0 && s.owner[x] !== me) holders.set(s.owner[x], (holders.get(s.owner[x]) ?? 0) + 1);
  const free = c.territories.filter((x) => s.owner[x] < 0).length,
    rival = Math.max(0, ...holders.values());
  if (mine === 0 && holders.size === 1 && rival / size >= 0.5) value += (c.bonus * 0.55 * rival) / size + (free <= 2 ? 0.8 : 0);
  value += around.filter((n) => s.owner[n] === me).length * 0.35 - around.filter((n) => s.owner[n] >= 0 && s.owner[n] !== me).length * 0.12;
  const mission = missionOf(s, me);
  if (mission?.kind === "continents" && mission.continents.includes(c.id)) value += 1.2;
  return value;
}
/** Where one more army of `me` does most good while setting up: a front in danger, in a continent it means to hold. */
function frontValue(s: State, t: number, me: number) {
  if (s.owner[t] !== me || !facesEnemy(s, t, me)) return -Infinity;
  const [mine, , size] = shares(s, t, me),
    mission = missionOf(s, me),
    hold = (mine / size) * 1.4 + (mission?.kind === "continents" && mission.continents.includes(s.map.territories[t].continent) ? 0.6 : 0);
  return ((threat(s, t, me) + 2) / (s.armies[t] + 1)) * (0.6 + hold);
}
/** Where the neutral army's army does most good for `me` in a game for two: in the other player's way. */
function blockValue(s: State, t: number, me: number) {
  if (s.owner[t] !== s.neutral) return -Infinity;
  let value = 0;
  for (const n of s.map.territories[t].neighbours) {
    const o = s.owner[n];
    if (o === me) value -= 0.7;
    else if (o >= 0 && o !== s.neutral) {
      const [theirs, , size] = shares(s, n, o);
      value += 1 + theirs / size;
    }
  }
  return value - s.armies[t] * 0.08;
}
/** The best of `choices` by `value`; at the easy level, now and then another of the better half. */
function best(choices: number[], value: (t: number) => number, level: Level, random: Random) {
  const jitter = level === "hard" ? 0 : level === "normal" ? 0.25 : 0.9,
    scored = choices.map((t) => ({ t, v: value(t) + (jitter ? (random() - 0.5) * jitter : 0) })).sort((a, b) => b.v - a.v || a.t - b.t);
  if (level === "easy" && scored.length > 2 && random() < 0.35) return scored[Math.floor(random() * Math.ceil(scored.length / 2)) % scored.length].t;
  return scored[0].t;
}
/** Steps from each territory of `me` to the nearest one that faces another, along its own (Infinity where none). */
function frontDistance(s: State, me: number) {
  const d = s.owner.map(() => Infinity),
    queue: number[] = [];
  s.owner.forEach((o, t) => {
    if (o === me && facesEnemy(s, t, me)) {
      d[t] = 0;
      queue.push(t);
    }
  });
  for (let q = 0; q < queue.length; q++)
    for (const n of s.map.territories[queue[q]].neighbours)
      if (s.owner[n] === me && d[n] === Infinity) {
        d[n] = d[queue[q]] + 1;
        queue.push(n);
      }
  return d;
}
export function decide(s: State, level: Level, random: Random): Action {
  const me = s.turn,
    rule = LEVELS[level],
    mine = () => s.owner.flatMap((o, t) => (o === me ? [t] : []));
  if (s.phase === "claim") {
    const free = s.owner.flatMap((o, t) => (o < 0 ? [t] : []));
    return { type: "place", territory: best(free, (t) => claimValue(s, t, me), level, random), count: 1 };
  }
  if (s.phase === "deploy") {
    if (s.quota && s.quota.own === 0) {
      const neutral = s.owner.flatMap((o, t) => (o === s.neutral ? [t] : []));
      return { type: "place", territory: best(neutral, (t) => blockValue(s, t, me), level, random), count: 1 };
    }
    const fronts = mine().filter((t) => facesEnemy(s, t, me));
    return { type: "place", territory: best(fronts.length ? fronts : mine(), (t) => frontValue(s, t, me), level, random), count: 1 };
  }
  if (s.phase === "reinforce") {
    const sets = setsIn(s.seats[me].cards);
    if (sets.length && (mustTrade(s) || level !== "easy" || random() < 0.4) && (!s.resume || mustTrade(s))) {
      // The set that puts its two extra armies where they help most.
      const scored = sets.map((cards) => {
        const named = bonusTerritories(s, me, cards),
          bonus = named.length ? named.reduce((a, b) => (frontValue(s, b, me) > frontValue(s, a, me) ? b : a)) : -1;
        return { cards, bonus };
      });
      const pick = scored.find((x) => x.bonus >= 0) ?? scored[0];
      return pick.bonus >= 0 ? { type: "trade", cards: pick.cards, bonus: pick.bonus } : { type: "trade", cards: pick.cards };
    }
    const R = s.reserve;
    if (level === "easy") {
      const borders = mine().filter((t) => facesEnemy(s, t, me));
      const t = borders.length ? borders[Math.floor(random() * borders.length) % borders.length] : s.owner.indexOf(me);
      return { type: "place", territory: t, count: Math.min(R, 1 + Math.floor(random() * 3)) };
    }
    const top = plans(s, me, R)[0],
      guard = weakest(s, me);
    if (!top) return { type: "place", territory: guard >= 0 ? guard : s.owner.indexOf(me), count: R };
    // The front was reinforced a moment ago: the rest goes where it is most needed.
    const last = s.last;
    if (last?.kind === "place" && last.player === me && guard >= 0 && last.territory !== guard) return { type: "place", territory: guard, count: R };
    // Enough on the front to make the best attack likely; the rest, if a border is in danger, there.
    let need = 0;
    while (need < R && winChance(s.armies[top.from] + need, s.armies[top.to]) < (level === "hard" ? 0.8 : 0.7)) need++;
    const front = Math.max(1, Math.min(R, Math.max(need, Math.ceil(R * (level === "hard" ? 0.7 : 0.5)))));
    const pressed = guard >= 0 && guard !== top.from && threat(s, guard, me) > s.armies[guard];
    return { type: "place", territory: top.from, count: pressed ? front : R };
  }
  if (s.phase === "attack") {
    if (s.fights < rule.attacks) {
      const pick = plans(s, me, 0).find((p) => p.chance >= rule.need && p.score * rule.greed > 0.35 && (level !== "easy" || random() < 0.75));
      if (pick) return { type: "attack", from: pick.from, to: pick.to, blitz: true };
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
    // The largest idle army goes toward the front that needs it most: all the way by the connected rule, a step by the classic one.
    const distance = frontDistance(s, me);
    let from = -1;
    s.owner.forEach((o, t) => {
      if (o === me && s.armies[t] > 1 && distance[t] > 0 && distance[t] < Infinity && moveTargets(s, t).length && (from < 0 || s.armies[t] > s.armies[from])) from = t;
    });
    if (from >= 0) {
      const options = moveTargets(s, from).filter((t) => distance[t] < distance[from]);
      if (options.length) {
        const to = options.reduce((a, b) => (distance[b] < distance[a] || (distance[b] === distance[a] && threat(s, b, me) - s.armies[b] > threat(s, a, me) - s.armies[a]) ? b : a));
        return { type: "fortify", from, to, count: s.armies[from] - 1 };
      }
    }
    if (level === "hard") {
      // A quiet front with armies to spare helps a pressed one it can reach.
      const guard = weakest(s, me);
      if (guard >= 0) {
        const spare = s.owner
          .flatMap((o, t) => (o === me && t !== guard && moveTargets(s, t).includes(guard) ? [t] : []))
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
