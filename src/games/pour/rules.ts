import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Sharing out by pouring: three vessels without marks, the largest full and
 * the others empty. Pouring goes on until the vessel poured from is empty or
 * the one poured into is full; nothing else can be measured. The aim is
 * either to share the whole equally between the two larger vessels, or to
 * have a given amount in any one of them. Every puzzle is drawn at random
 * and checked by search: it can be solved, and the fewest pours are known.
 */
export interface Goal {
  /** "split": half in each of the two larger vessels; "make": `amount` in any vessel. */
  kind: "split" | "make";
  amount: number;
}
export interface State {
  /** How much each vessel holds when full, largest first, and how much is in it now. */
  caps: number[];
  amounts: number[];
  goal: Goal;
  /** The fewest pours that reach the goal from the start. */
  best: number;
  winner: Winner;
  last: { from: number; to: number; amount: number } | null;
  ply: number;
}
/** How many pours the fewest way takes, by level: easy, normal, hard. */
export const BANDS: [number, number][] = [
  [2, 4],
  [5, 7],
  [8, 14],
];
const met = (caps: number[], amounts: number[], goal: Goal) => (goal.kind === "split" ? amounts[0] === goal.amount && amounts[1] === goal.amount : amounts.includes(goal.amount));
const pours = (caps: number[], amounts: number[]) => {
  const out: { from: number; to: number; amount: number }[] = [];
  for (let from = 0; from < 3; from++)
    for (let to = 0; to < 3; to++) {
      const amount = from === to ? 0 : Math.min(amounts[from], caps[to] - amounts[to]);
      if (amount > 0) out.push({ from, to, amount });
    }
  return out;
};
const pour = (amounts: number[], p: { from: number; to: number; amount: number }) => amounts.map((v, i) => (i === p.from ? v - p.amount : i === p.to ? v + p.amount : v));
/** The shortest run of pours from `amounts` to the goal, or null when there is none. */
function search(caps: number[], amounts: number[], goal: Goal): Move[] | null {
  const key = (a: number[]) => a.join(),
    seen = new Map<string, { prev: string; move: Move } | null>([[key(amounts), null]]);
  let frontier = [amounts];
  if (met(caps, amounts, goal)) return [];
  while (frontier.length) {
    const next: number[][] = [];
    for (const at of frontier)
      for (const p of pours(caps, at)) {
        const after = pour(at, p);
        if (seen.has(key(after))) continue;
        seen.set(key(after), { prev: key(at), move: { from: p.from, to: p.to, extra: -1 } });
        if (met(caps, after, goal)) {
          const path: Move[] = [];
          for (let k = key(after), step = seen.get(k); step; k = step.prev, step = seen.get(k)) path.unshift(step.move);
          return path;
        }
        next.push(after);
      }
    frontier = next;
  }
  return null;
}
export const solve = (state: State) => (state.winner !== null ? null : search(state.caps, state.amounts, state.goal));
export const moves = (state: State): Move[] => (state.winner !== null ? [] : pours(state.caps, state.amounts).map(({ from, to }) => ({ from, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1) return null;
  const p = pours(state.caps, state.amounts).find((x) => x.from === move.from && x.to === move.to);
  if (!p) return null;
  const amounts = pour(state.amounts, p);
  return { ...state, amounts, last: p, ply: state.ply + 1, winner: met(state.caps, amounts, state.goal) ? 0 : null };
}
/** A puzzle of a level (1 easy, 2 normal, 3 hard): the vessels, one of the two kinds of goal, and its fewest pours within the level's band. */
export function createGame(level = 1, random: Random = cryptoRandom): State {
  const [low, high] = BANDS[Math.max(1, Math.min(BANDS.length, Math.round(level) || 1)) - 1],
    pick = (from: number, to: number) => from + Math.floor(random() * (to - from + 1));
  for (let attempt = 0; attempt < 3000; attempt++) {
    const a = pick(6, 16),
      b = pick(3, a - 1),
      c = pick(2, b - 1),
      caps = [a, b, c],
      start = [a, 0, 0],
      goals: Goal[] = [];
    if (c < 2 || b <= c) continue;
    if (random() < 0.5) {
      if (a % 2 === 0 && b >= a / 2) goals.push({ kind: "split", amount: a / 2 });
    } else {
      // An amount that no vessel holds simply by being full or empty.
      const amount = pick(1, a - 1);
      if (!caps.includes(amount) && amount !== a - b && amount !== a - c) goals.push({ kind: "make", amount });
    }
    for (const goal of goals) {
      const way = search(caps, start, goal);
      if (way && way.length >= low && way.length <= high) return { caps, amounts: start, goal, best: way.length, winner: null, last: null, ply: 0 };
    }
  }
  // Never reached in practice: the old problem of eight, five and three.
  return { caps: [8, 5, 3], amounts: [8, 0, 0], goal: { kind: "split", amount: 4 }, best: 7, winner: null, last: null, ply: 0 };
}
export const goalText = (s: State) => (s.goal.kind === "split" ? `${s.caps[0]}리터와 ${s.caps[1]}리터 그릇에 ${s.goal.amount}리터씩 나누기` : `어느 그릇에든 ${s.goal.amount}리터 만들기`);
const effect = (): Effect | null => null;
export const pouring: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [0, 0, 0],
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: (s) => `목표: ${goalText(s)} · ${s.ply}번 부음 (최소 ${s.best}번)`,
  tally: (s) => [`${s.ply}번 부음 · 최소 ${s.best}번`, ""],
  reason: (s) => `성공! ${s.ply}번 만에 나눴습니다. 최소 횟수는 ${s.best}번${s.ply === s.best ? "으로, 가장 적게 부었습니다!" : "입니다."}`,
};
