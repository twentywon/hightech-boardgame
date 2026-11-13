import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Crossing the river: everyone starts on the near bank and must reach the
 * far one in a boat that holds only a few, while what is left together on
 * either bank must stay out of trouble. Three old problems are told here:
 * the farmer with a beast, its prey and that one's food; the flock, where
 * wolves must never outnumber sheep; and the jealous couples, where no wife
 * may be with another husband unless her own is there. A move against the
 * rule is made all the same and shown as a failure, to be taken back.
 */
export type Kind = "farmer" | "flock" | "couples";
export interface Actor {
  /** What it is (farmer, wolf, goat, cabbage, sheep, husband, wife and the like), what it is called, and which couple it belongs to. */
  role: string;
  name: string;
  pair: number;
  /** 0 the near bank, 1 the far one. */
  side: 0 | 1;
}
export interface State {
  kind: Kind;
  actors: Actor[];
  boat: 0 | 1;
  /** Who sits in the boat (they still count as on its bank). */
  aboard: number[];
  seats: number;
  /** For the farmer's problem: who eats whom, by role. */
  eats: [string, string][];
  /** The fewest crossings from the start. */
  best: number;
  crossings: number;
  /** What went wrong, once a crossing has broken the rule. */
  trouble: string;
  /** Those the trouble is about (the eater and the eaten, the wolves and the sheep, the wife and the husbands), for the table to point at. */
  culprits: number[];
  winner: Winner;
  last: { riders: number[]; from: 0 | 1 } | null;
  ply: number;
}
/** The point that sends the boat across; an actor's own index puts it in the boat or takes it out. */
export const GO = 100;
/** The farmer's three loads, in sets: the first eats the second, the second eats the third. */
export const LOADS: [string, string][][] = [
  [["wolf", "늑대"], ["goat", "염소"], ["cabbage", "양배추"]],
  [["fox", "여우"], ["hen", "닭"], ["grain", "곡식 자루"]],
  [["cat", "고양이"], ["mouse", "쥐"], ["cheese", "치즈"]],
];
const object = (name: string) => `${name}${(name.charCodeAt(name.length - 1) - 0xac00) % 28 ? "을" : "를"}`,
  subject = (name: string) => `${name}${(name.charCodeAt(name.length - 1) - 0xac00) % 28 ? "이" : "가"}`;
interface Trouble {
  text: string;
  who: number[];
}
/** What is wrong with those who are together in one place (a bank, or the boat for the couples), and whom it concerns; null when all is well. */
function wrong(state: Pick<State, "kind" | "actors" | "eats">, group: number[]): Trouble | null {
  const role = (i: number) => state.actors[i].role,
    of = (wanted: string) => group.filter((i) => role(i) === wanted);
  if (state.kind === "farmer") {
    if (of("farmer").length) return null;
    for (const [eater, eaten] of state.eats) {
      const [a] = of(eater),
        [b] = of(eaten);
      if (a !== undefined && b !== undefined) return { text: `농부가 없는 사이에 ${subject(state.actors[a].name)} ${object(state.actors[b].name)} 먹어 버렸습니다.`, who: [a, b] };
    }
    return null;
  }
  if (state.kind === "flock") {
    const sheep = of("sheep"),
      wolves = of("wolf");
    return sheep.length > 0 && wolves.length > sheep.length ? { text: `늑대 ${wolves.length}마리가 양 ${sheep.length}마리보다 많아져 양을 덮쳤습니다.`, who: [...wolves, ...sheep] } : null;
  }
  const husbands = of("husband");
  for (const wife of of("wife"))
    if (husbands.length && !husbands.some((i) => state.actors[i].pair === state.actors[wife].pair)) return { text: `${state.actors[wife].name}이 남편 없이 다른 남편과 함께 있게 되었습니다.`, who: [wife, ...husbands] };
  return null;
}
const drives = (state: Pick<State, "kind" | "actors">, riders: number[]) => riders.length > 0 && (state.kind !== "farmer" || riders.some((i) => state.actors[i].role === "farmer"));
/** The trouble a crossing with these riders leads to, or "". */
function crossed(state: State, riders: number[]) {
  const sides = state.actors.map((a, i) => (riders.includes(i) ? ((1 - a.side) as 0 | 1) : a.side)),
    bank = (side: number) => sides.flatMap((s, i) => (s === side ? [i] : []));
  const found = (state.kind === "couples" ? wrong(state, riders) : null) ?? wrong(state, bank(0)) ?? wrong(state, bank(1));
  return { sides, trouble: found?.text ?? "", culprits: found?.who ?? [] };
}
/** Every set of riders the boat could take from its bank. */
function crews(state: Pick<State, "kind" | "actors" | "seats">, sides: number[], boat: number) {
  const here = sides.flatMap((s, i) => (s === boat ? [i] : [])),
    out: number[][] = [];
  const pick = (from: number, crew: number[]) => {
    if (crew.length && drives(state, crew)) out.push(crew);
    if (crew.length < state.seats) for (let k = from; k < here.length; k++) pick(k + 1, [...crew, here[k]]);
  };
  pick(0, []);
  return out;
}
/** The shortest run of crossings (each a set of riders) that brings everyone over without trouble, or null. */
export function solve(state: State): number[][] | null {
  if (state.winner !== null) return null;
  const key = (sides: number[], boat: number) => sides.join("") + boat,
    start = state.actors.map((a) => a.side as number),
    seen = new Map<string, { prev: string; crew: number[] } | null>([[key(start, state.boat), null]]);
  let frontier: { sides: number[]; boat: number }[] = [{ sides: start, boat: state.boat }];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const at of frontier)
      for (const crew of crews(state, at.sides, at.boat)) {
        const moved = crossed({ ...state, actors: state.actors.map((a, i) => ({ ...a, side: at.sides[i] as 0 | 1 })) }, crew);
        if (moved.trouble) continue;
        const k = key(moved.sides, 1 - at.boat);
        if (seen.has(k)) continue;
        seen.set(k, { prev: key(at.sides, at.boat), crew });
        if (moved.sides.every((s) => s === 1)) {
          const path: number[][] = [];
          for (let j = k, step = seen.get(j); step; j = step.prev, step = seen.get(j)) path.unshift(step.crew);
          return path;
        }
        next.push({ sides: moved.sides, boat: 1 - at.boat });
      }
    frontier = next;
  }
  return null;
}
/** The next thing to press on the shortest way: someone to put in the boat or take out of it, or the boat itself. */
export function hint(state: State): Move | null {
  const crew = solve({ ...state, aboard: [] })?.[0];
  if (!crew) return null;
  const off = state.aboard.find((i) => !crew.includes(i)),
    on = crew.find((i) => !state.aboard.includes(i));
  return { from: -1, to: off ?? on ?? GO, extra: -1 };
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = [];
  state.actors.forEach((a, i) => {
    if (a.side === state.boat && (state.aboard.includes(i) || state.aboard.length < state.seats)) out.push({ from: -1, to: i, extra: -1 });
  });
  if (drives(state, state.aboard)) out.push({ from: -1, to: GO, extra: -1 });
  return out;
}
export function play(state: State, move: Move): State | null {
  if (!moves(state).some((m) => m.to === move.to) || move.from !== -1 || move.extra !== -1) return null;
  // Getting in and out is no crossing: the count stays.
  if (move.to !== GO) return { ...state, aboard: state.aboard.includes(move.to) ? state.aboard.filter((i) => i !== move.to) : [...state.aboard, move.to], last: null };
  const { sides, trouble, culprits } = crossed(state, state.aboard),
    actors = state.actors.map((a, i) => ({ ...a, side: sides[i] }));
  return {
    ...state,
    actors,
    boat: (1 - state.boat) as 0 | 1,
    aboard: [],
    crossings: state.crossings + 1,
    trouble,
    culprits,
    winner: trouble ? 1 : actors.every((a) => a.side === 1) ? 0 : null,
    last: { riders: state.aboard, from: state.boat },
    ply: state.ply + 1,
  };
}
const flock = (n: number, seats: number): Pick<State, "kind" | "actors" | "seats" | "eats"> => ({
  kind: "flock",
  seats,
  eats: [],
  actors: [...Array.from({ length: n }, (_, i) => ({ role: "sheep", name: `양 ${i + 1}`, pair: -1, side: 0 as const })), ...Array.from({ length: n }, (_, i) => ({ role: "wolf", name: `늑대 ${i + 1}`, pair: -1, side: 0 as const }))],
});
const FAMILIES = ["김", "이", "박", "최"];
const couples = (n: number, seats: number): Pick<State, "kind" | "actors" | "seats" | "eats"> => ({
  kind: "couples",
  seats,
  eats: [],
  actors: Array.from({ length: n }, (_, i) => [
    { role: "husband", name: `${FAMILIES[i]}씨`, pair: i, side: 0 as const },
    { role: "wife", name: `${FAMILIES[i]}씨 부인`, pair: i, side: 0 as const },
  ]).flat(),
});
/**
 * A problem of a stage: 1 the farmer (his loads drawn at random), 2 three
 * sheep and three wolves, 3 three couples, 4 a larger company drawn at
 * random. Its fewest crossings are found by search.
 */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const pick = <X>(list: X[]) => list[Math.floor(random() * list.length)];
  let setup: Pick<State, "kind" | "actors" | "seats" | "eats">;
  if (stage === 2) setup = flock(3, 2);
  else if (stage === 3) setup = couples(3, 2);
  else if (stage >= 4) setup = pick([() => flock(4, 3), () => flock(5, 3), () => couples(4, 3)])();
  else {
    const loads = pick(LOADS);
    setup = {
      kind: "farmer",
      seats: 2,
      eats: [
        [loads[0][0], loads[1][0]],
        [loads[1][0], loads[2][0]],
      ],
      actors: [{ role: "farmer", name: "농부", pair: -1, side: 0 }, ...loads.map(([role, name]) => ({ role, name, pair: -1, side: 0 as const }))],
    };
  }
  const state: State = { ...setup, boat: 0, aboard: [], best: 0, crossings: 0, trouble: "", culprits: [], winner: null, last: null, ply: 0 };
  return { ...state, best: solve(state)?.length ?? 0 };
}
export const ruleText = (s: State) =>
  s.kind === "farmer"
    ? `농부가 없으면 ${s.eats.map(([a, b]) => `${subject(s.actors.find((x) => x.role === a)!.name)} ${object(s.actors.find((x) => x.role === b)!.name)}`).join(", ")} 먹습니다`
    : s.kind === "flock"
      ? "어느 강가에서든 늑대가 양보다 많으면 안 됩니다"
      : "부인은 남편 없이 다른 남편과 함께 있을 수 없습니다";
const effect = (): Effect | null => null;
export const river: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.actors.map(() => 0),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => s.actors.filter((a) => a.side === 1).length,
  hint: (s) => `${ruleText(s)} · 배 정원 ${s.seats}${s.kind === "farmer" ? "(농부 포함)" : ""} · ${s.crossings}번 건넘 (최소 ${s.best}번)`,
  tally: (s) => [`${s.crossings}번 건넘 · 최소 ${s.best}번`, ""],
  reason: (s) => (s.winner === 0 ? `성공! ${s.crossings}번 만에 모두 건넜습니다. 최소 횟수는 ${s.best}번${s.crossings === s.best ? "으로, 가장 적게 건넜습니다!" : "입니다."}` : `실패! ${s.trouble}`),
};
