import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The tower of Hanoi: discs of different sizes stand on the first of three
 * pegs, the largest lowest. One disc is moved at a time, the top one of a
 * peg, and never onto a smaller one; the whole tower is to stand on any
 * of the other pegs. The four-peg kind (the user asked for one) plays the
 * same way with a fourth peg to spare, which makes far shorter ways.
 */
export const PEGS = 3,
  MIN = 3,
  MAX = 8;
/** The towers of the four-peg kind: how many discs each of its stages has. */
export const FOUR = [5, 6, 7, 8];
/** The most discs any stage has, and the most pegs. */
export const MOST = Math.max(MAX, ...FOUR),
  MOST_PEGS = 4;
export interface State {
  discs: number;
  /** Each peg from the bottom up; a disc is its size, 1 the smallest. Three pegs, or four in the four-peg kind. */
  pegs: number[][];
  /** The fewest moves from the start. */
  best: number;
  last: { from: number; to: number } | null;
  winner: Winner;
  ply: number;
}
/**
 * A stage's value, as the stage window gives it: a bare count of discs ("3" to "8", as always) is a tower on three
 * pegs; "4p" and a count ("4p5" to "4p8") is one on four.
 */
export function stageOf(variant: string | undefined): { pegs: number; discs: number } {
  const four = /^4p(\d+)$/.exec(variant ?? "");
  if (four) return { pegs: 4, discs: FOUR.includes(Number(four[1])) ? Number(four[1]) : FOUR[0] };
  return { pegs: PEGS, discs: Math.max(MIN, Math.min(MAX, Math.round(Number(variant)) || MIN)) };
}
export function createGame(discs = MIN, pegs = PEGS): State {
  const four = pegs === 4,
    n = four ? (FOUR.includes(Math.round(discs)) ? Math.round(discs) : FOUR[0]) : Math.max(MIN, Math.min(MAX, Math.round(discs) || MIN)),
    start: number[][] = [Array.from({ length: n }, (_, i) => n - i), [], [], ...(four ? [[]] : [])];
  return { discs: n, pegs: start, best: four ? fourPegTable(n)[code(start)] : 2 ** n - 1, last: null, winner: null, ply: 0 };
}
const top = (peg: number[]) => peg[peg.length - 1] ?? Infinity;
export const moves = (state: State): Move[] =>
  state.winner !== null
    ? []
    : state.pegs.flatMap((peg, from) => (peg.length ? state.pegs.flatMap((other, to) => (to !== from && top(peg) < top(other) ? [{ from, to, extra: -1 }] : [])) : []));
export function play(state: State, move: Move): State | null {
  if (!moves(state).some((m) => m.from === move.from && m.to === move.to) || move.extra !== -1) return null;
  const pegs = state.pegs.map((peg) => [...peg]);
  pegs[move.to].push(pegs[move.from].pop()!);
  return { ...state, pegs, last: { from: move.from, to: move.to }, ply: state.ply + 1, winner: pegs.some((peg, i) => i > 0 && peg.length === state.discs) ? 0 : null };
}
/** The next move of the shortest way to bring the discs up to `size` onto `target`, from wherever they stand; null when they are there. */
function next(where: number[], size: number, target: number): { from: number; to: number } | null {
  if (size === 0) return null;
  if (where[size] === target) return next(where, size - 1, target);
  // Everything smaller must first stand on the third peg; then this disc goes over.
  return next(where, size - 1, PEGS - where[size] - target) ?? { from: where[size], to: target };
}
/** How many moves the shortest way takes to bring the discs up to `size` onto `target`. */
function far(where: number[], size: number, target: number): number {
  if (size === 0) return 0;
  return where[size] === target ? far(where, size - 1, target) : far(where, size - 1, PEGS - where[size] - target) + 2 ** (size - 1);
}
/** A placing of the discs on four pegs as one number: disc d (from 1) is the d-th digit in base four, its peg. */
function code(pegs: number[][]) {
  let n = 0;
  pegs.forEach((peg, p) => peg.forEach((disc) => (n += p * 4 ** (disc - 1))));
  return n;
}
/** The tops of the four pegs in a placing (Infinity for an empty peg), read from its number. */
function topsOf(n: number, discs: number, tops: number[]) {
  tops.fill(Infinity);
  // The smallest disc on a peg is its top: going up from the smallest, the first met on each peg is kept.
  for (let d = 1, rest = n; d <= discs; d++, rest = Math.floor(rest / 4)) {
    const p = rest % 4;
    if (tops[p] === Infinity) tops[p] = d;
  }
  return tops;
}
const tables = new Map<number, Uint8Array>();
/**
 * For every placing of `discs` discs on four pegs, the fewest moves to a whole tower on any peg but the first: one
 * search outward from those towers, made once a count (4⁸ placings at most). Moves go both ways, so the search can
 * run backward from the end.
 */
export function fourPegTable(discs: number): Uint8Array {
  const known = tables.get(discs);
  if (known) return known;
  const size = 4 ** discs,
    dist = new Uint8Array(size).fill(255),
    queue = new Int32Array(size),
    tops = [0, 0, 0, 0];
  let tail = 0;
  for (const p of [1, 2, 3]) {
    const n = p * ((size - 1) / 3);
    dist[n] = 0;
    queue[tail++] = n;
  }
  for (let head = 0; head < tail; head++) {
    const n = queue[head];
    topsOf(n, discs, tops);
    for (let from = 0; from < 4; from++) {
      const disc = tops[from];
      if (disc === Infinity) continue;
      for (let to = 0; to < 4; to++) {
        if (to === from || tops[to] < disc) continue;
        const m = n + (to - from) * 4 ** (disc - 1);
        if (dist[m] !== 255) continue;
        dist[m] = dist[n] + 1;
        queue[tail++] = m;
      }
    }
  }
  tables.set(discs, dist);
  return dist;
}
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  if (state.pegs.length === 4) {
    // Any move that comes one nearer the end, the first such in the order of `moves`.
    const table = fourPegTable(state.discs),
      here = table[code(state.pegs)];
    for (const move of moves(state)) {
      const after = play(state, move)!;
      if (table[code(after.pegs)] === here - 1) return move;
    }
    return null;
  }
  const where: number[] = [];
  state.pegs.forEach((peg, i) => peg.forEach((disc) => (where[disc] = i)));
  // Either of the other pegs will do: the nearer one is made for.
  const target = far(where, state.discs, 1) < far(where, state.discs, 2) ? 1 : 2,
    step = next(where, state.discs, target);
  return step && { ...step, extra: -1 };
}
const effect = (): Effect | null => null;
export const hanoi: PointGame<State> = {
  create: (variant) => {
    const { pegs, discs } = stageOf(variant);
    return createGame(discs, pegs);
  },
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.pegs.map(() => 0),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: (s) => `원판 ${s.discs}개를 모두 다른 기둥으로`,
  tally: () => ["", ""],
  reason: () => "성공! 탑을 모두 옮겼습니다.",
};
