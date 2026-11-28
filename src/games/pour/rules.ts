import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Sharing out by pouring: three vessels without marks (four on the harder
 * stages the user asked for), the largest full and the others empty. Pouring
 * goes on until the vessel poured from is empty or the one poured into is
 * full; nothing else can be measured. The aim is to share the whole equally
 * between the two larger vessels, to have a given amount in any one of them,
 * or (with four vessels) to share it in three equal parts among the three
 * larger. Every puzzle is drawn at random and checked by search: it can be
 * solved, and the fewest pours are known.
 */
export interface Goal {
  /** "split": half in each of the two larger vessels; "make": `amount` in any vessel; "thirds": `amount` in each of the three larger. */
  kind: "split" | "make" | "thirds";
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
/** How many pours the fewest way takes, by level: easy, normal, hard (three vessels; stages 1 to 3). */
export const BANDS: [number, number][] = [
  [2, 4],
  [5, 7],
  [8, 14],
];
/** The same for the stages with four vessels (4 and 5): normal and hard. */
export const BANDS4: [number, number][] = [
  [4, 7],
  [8, 16],
];
/** How many stages there are, and how many vessels a stage has. */
export const STAGE_COUNT = BANDS.length + BANDS4.length;
export const vesselsOf = (level: number) => (level > BANDS.length ? 4 : 3);
/** Whether the goal is met: the vessels that hold it, or null. */
export function holding(amounts: number[], goal: Goal): number[] | null {
  if (goal.kind === "split") return amounts[0] === goal.amount && amounts[1] === goal.amount ? [0, 1] : null;
  if (goal.kind === "thirds") return [0, 1, 2].every((i) => amounts[i] === goal.amount) ? [0, 1, 2] : null;
  const at = amounts.flatMap((v, i) => (v === goal.amount ? [i] : []));
  return at.length ? at : null;
}
const met = (amounts: number[], goal: Goal) => holding(amounts, goal) !== null;
const pours = (caps: number[], amounts: number[]) => {
  const out: { from: number; to: number; amount: number }[] = [];
  for (let from = 0; from < caps.length; from++)
    for (let to = 0; to < caps.length; to++) {
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
  if (met(amounts, goal)) return [];
  while (frontier.length) {
    const next: number[][] = [];
    for (const at of frontier)
      for (const p of pours(caps, at)) {
        const after = pour(at, p);
        if (seen.has(key(after))) continue;
        seen.set(key(after), { prev: key(at), move: { from: p.from, to: p.to, extra: -1 } });
        if (met(after, goal)) {
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
  return { ...state, amounts, last: p, ply: state.ply + 1, winner: met(amounts, state.goal) ? 0 : null };
}
/**
 * A puzzle of a level (1 easy, 2 normal, 3 hard with three vessels; 4 normal, 5 hard with four): the vessels, a goal,
 * and its fewest pours within the level's band.
 */
export function createGame(level = 1, random: Random = cryptoRandom): State {
  const stage = Math.max(1, Math.min(STAGE_COUNT, Math.round(level) || 1));
  if (stage > BANDS.length) return createFour(BANDS4[stage - BANDS.length - 1], random);
  const [low, high] = BANDS[stage - 1],
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
/** A puzzle with four vessels, the largest full: one of the three kinds of goal, its fewest pours within `band`. */
function createFour([low, high]: [number, number], random: Random): State {
  const pick = (from: number, to: number) => from + Math.floor(random() * (to - from + 1));
  for (let attempt = 0; attempt < 4000; attempt++) {
    const a = pick(9, 18),
      b = pick(4, a - 1),
      c = pick(3, b - 1),
      d = pick(2, c - 1),
      caps = [a, b, c, d],
      start = [a, 0, 0, 0],
      roll = random();
    if (!(a > b && b > c && c > d && d >= 2)) continue;
    let goal: Goal | null = null;
    if (roll < 0.3) {
      if (a % 3 === 0 && c >= a / 3) goal = { kind: "thirds", amount: a / 3 };
    } else if (roll < 0.55) {
      if (a % 2 === 0 && b >= a / 2) goal = { kind: "split", amount: a / 2 };
    } else {
      // An amount that no vessel holds by being full, nor the largest by being poured into one other.
      const amount = pick(1, a - 1);
      if (!caps.includes(amount) && caps.every((cap) => amount !== a - cap)) goal = { kind: "make", amount };
    }
    if (!goal) continue;
    const way = search(caps, start, goal);
    if (way && way.length >= low && way.length <= high) return { caps, amounts: start, goal, best: way.length, winner: null, last: null, ply: 0 };
  }
  // Never reached in practice: twelve shared into three fours.
  const caps = [12, 7, 5, 3],
    goal: Goal = { kind: "thirds", amount: 4 };
  return { caps, amounts: [12, 0, 0, 0], goal, best: search(caps, [12, 0, 0, 0], goal)!.length, winner: null, last: null, ply: 0 };
}
export const goalText = (s: State) =>
  s.goal.kind === "split"
    ? `${s.caps[0]}리터와 ${s.caps[1]}리터 그릇에 ${s.goal.amount}리터씩 나누기`
    : s.goal.kind === "thirds"
      ? `${s.caps[0]}·${s.caps[1]}·${s.caps[2]}리터 그릇에 ${s.goal.amount}리터씩 나누기`
      : `어느 그릇에든 ${s.goal.amount}리터 만들기`;
const effect = (): Effect | null => null;
export const pouring: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.caps.map(() => 0),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: (s) => `목표: ${goalText(s)}`,
  tally: () => ["", ""],
  reason: () => "성공! 물을 다 나눴습니다.",
};
