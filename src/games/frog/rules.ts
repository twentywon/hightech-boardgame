import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Frog hop, an old puzzle of frogs on a row of stepping places: tree stumps standing in a swamp, each with a ribbon
 * tied round it in a colour (or none: a bare stump), and on most of them a frog of one of those colours. A frog hops
 * onto the next stump if it is empty, or jumps over exactly one frog beside it onto the empty stump just beyond; it
 * never jumps over two, nor over an empty stump. Every frog has to come to sit on a stump of its own colour.
 *
 * A puzzle is laid at random: the ribbons are tied (the goal), every arrangement the moves can reach from the solved
 * ones is explored outward, and a start is taken whose fewest moves lie in the stage's band. Moves go both ways (a
 * hop or a jump is undone by the same frog going back), so the family is one connected whole, and every start can be
 * solved in exactly `best` moves. In fact the family is every arrangement there is: with an empty stump and at least
 * three stumps, any frogs can be brought into any order (`reachable` counts them; a test holds it).
 */
/** How many colours there are (the view gives each a paint and a symbol). */
export const COLOURS = 8;
/** No frog on a stump (in `frogs`), or no ribbon round it (in `ribbons`). */
export const NONE = -1;
/** The longest row the search can number: each arrangement is one number below 9 ** 9. */
export const MAX_STUMPS = 9;
export interface Stage {
  stumps: number;
  /** How many colours the frogs wear; the first `pairs` of them are worn by two frogs each. */
  colours: number;
  pairs: number;
  /** Stumps left empty (and bare of a ribbon in the goal). */
  gaps: number;
  /** The fewest moves a puzzle of the stage needs, from `lo` to `hi`. */
  lo: number;
  hi: number;
}
/**
 * The stages: a longer row and more frogs each time, and deeper bands of fewest moves. The last has nine stumps,
 * two empty, and two colours worn by two frogs each, either of which may take either stump of that colour.
 */
export const STAGES: Stage[] = [
  { stumps: 5, colours: 4, pairs: 0, gaps: 1, lo: 4, hi: 7 },
  { stumps: 6, colours: 5, pairs: 0, gaps: 1, lo: 8, hi: 12 },
  { stumps: 7, colours: 6, pairs: 0, gaps: 1, lo: 13, hi: 17 },
  { stumps: 9, colours: 5, pairs: 2, gaps: 2, lo: 18, hi: 24 },
];
export interface State {
  /** The ribbon round each stump: the colour a frog must wear to sit there at the end, or `NONE` for a bare stump. */
  ribbons: number[];
  /** The frog on each stump, by its colour, or `NONE` where the stump is empty. */
  frogs: number[];
  /** The fewest moves the puzzle needed as it was laid. */
  best: number;
  /** The frog moved last (from and to which stump), for the table to animate. */
  last: { from: number; to: number } | null;
  winner: Winner;
  ply: number;
  stage: number;
}
/** Whether every frog sits on a stump of its own colour. */
export const solvedBy = (ribbons: readonly number[], frogs: readonly number[]) => frogs.every((f, i) => f === NONE || f === ribbons[i]);
/** How many frogs already sit on a stump of their colour. */
export const homeCount = (state: Pick<State, "ribbons" | "frogs">) => state.frogs.filter((f, i) => f !== NONE && f === state.ribbons[i]).length;
/** Where the frog on stump `from` can go: the next stump either side if it is empty, or the one beyond a frog beside it if that is empty. */
export function targets(state: Pick<State, "frogs">, from: number) {
  const { frogs } = state,
    out: number[] = [];
  if (frogs[from] === undefined || frogs[from] === NONE) return out;
  for (const dir of [-1, 1]) {
    const next = from + dir,
      beyond = from + 2 * dir;
    if (next < 0 || next >= frogs.length) continue;
    if (frogs[next] === NONE) out.push(next);
    else if (beyond >= 0 && beyond < frogs.length && frogs[beyond] === NONE) out.push(beyond);
  }
  return out.sort((a, b) => a - b);
}
/** Every move there is: `from` the frog's stump, `to` the stump it lands on, `extra` -1. */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = [];
  state.frogs.forEach((_, from) => targets(state, from).forEach((to) => out.push({ from, to, extra: -1 })));
  return out;
}
/** A hop or a jump of the frog on `from` to the empty stump `to`; else null (and the state is left alone). */
export function play(state: State, move: Move): State | null {
  const n = state.frogs.length,
    { from, to } = move;
  if (state.winner !== null || move.extra !== -1 || !Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 0 || from >= n || to < 0 || to >= n || state.frogs[from] === NONE || state.frogs[to] !== NONE) return null;
  const way = Math.abs(to - from);
  // The next stump, or the one just beyond a frog: never over an empty stump, never over two.
  if (way !== 1 && !(way === 2 && state.frogs[(from + to) / 2] !== NONE)) return null;
  const frogs = state.frogs.slice();
  frogs[to] = frogs[from];
  frogs[from] = NONE;
  return { ...state, frogs, last: { from, to }, ply: state.ply + 1, winner: solvedBy(state.ribbons, frogs) ? 0 : null };
}

/*
 * The search. An arrangement is one number: each stump a digit in base 9, 0 for an empty stump and a frog of colour
 * c as c + 1. A move only takes a digit from one place and puts it in another, so the number of the next
 * arrangement is found without taking the arrangement apart.
 */
const BASE = COLOURS + 1,
  POWERS = Array.from({ length: MAX_STUMPS + 1 }, (_, i) => BASE ** i);
const encode = (frogs: readonly number[]) => frogs.reduce((code, f, i) => code + (f + 1) * POWERS[i], 0);
const decode = (code: number, n: number) => Array.from({ length: n }, (_, i) => (Math.floor(code / POWERS[i]) % BASE) - 1);
interface Walk {
  count: number;
  codes: Int32Array;
  dist: Uint8Array;
  /** Where each arrangement was first reached from (-1 for a source), and the move that did it (from × 16 + to). */
  parent: Int32Array;
  via: Uint8Array;
  /** The first arrangement found that `stop` accepts, or -1. */
  goal: number;
}
/**
 * Every arrangement of `n` stumps reached from `sources`, breadth first, as far as `limit` moves out; a walk that is
 * given `stop` ends at the first arrangement it accepts. Arrangements met are kept in a table of open addressing.
 */
function walk(sources: number[], n: number, limit: number, stop: ((digits: Int32Array) => boolean) | null = null): Walk {
  let room = 1024,
    codes = new Int32Array(room),
    dist = new Uint8Array(room),
    parent = new Int32Array(room),
    via = new Uint8Array(room),
    count = 0,
    bits = 12,
    keys = new Int32Array(1 << bits).fill(-1),
    goal = -1;
  const slot = (key: number) => {
    const mask = (1 << bits) - 1;
    let h = Math.imul(key, 0x9e3779b1) >>> (32 - bits);
    while (keys[h] !== -1 && keys[h] !== key) h = (h + 1) & mask;
    return h;
  };
  const add = (key: number, d: number, from: number, move: number) => {
    if (count === room) {
      room *= 2;
      const c = new Int32Array(room),
        e = new Uint8Array(room),
        p = new Int32Array(room),
        v = new Uint8Array(room);
      c.set(codes);
      e.set(dist);
      p.set(parent);
      v.set(via);
      codes = c;
      dist = e;
      parent = p;
      via = v;
    }
    codes[count] = key;
    dist[count] = d;
    parent[count] = from;
    via[count] = move;
    count++;
    if (count * 2 > 1 << bits) {
      // Half full: a table twice the size, filled again.
      bits++;
      keys = new Int32Array(1 << bits).fill(-1);
      for (let i = 0; i < count; i++) keys[slot(codes[i])] = codes[i];
    }
  };
  const digits = new Int32Array(n);
  const read = (code: number) => {
    for (let i = 0; i < n; i++) {
      digits[i] = code % BASE;
      code = (code - digits[i]) / BASE;
    }
    return digits;
  };
  for (const source of sources) {
    const h = slot(source);
    if (keys[h] !== -1) continue;
    keys[h] = source;
    add(source, 0, -1, 0);
    if (stop && goal < 0 && stop(read(source))) goal = count - 1;
  }
  if (goal >= 0) return { count, codes, dist, parent, via, goal };
  for (let head = 0; head < count; head++) {
    const code = codes[head],
      d = dist[head];
    if (d >= limit) break;
    read(code);
    for (let gap = 0; gap < n; gap++) {
      if (digits[gap]) continue;
      // The frogs that can land on this empty stump: the next either side, and the one beyond a frog either side.
      for (let k = 0; k < 4; k++) {
        const from = k === 0 ? gap - 1 : k === 1 ? gap + 1 : k === 2 ? gap - 2 : gap + 2;
        if (from < 0 || from >= n || !digits[from] || (k >= 2 && !digits[(from + gap) >> 1])) continue;
        const next = code + digits[from] * (POWERS[gap] - POWERS[from]),
          h = slot(next);
        if (keys[h] !== -1) continue;
        keys[h] = next;
        add(next, d + 1, head, from * 16 + gap);
        if (stop) {
          const at = digits[from];
          digits[gap] = at;
          digits[from] = 0;
          const found = stop(digits);
          digits[from] = at;
          digits[gap] = 0;
          if (found) return { count, codes, dist, parent, via, goal: count - 1 };
        }
      }
    }
  }
  return { count, codes, dist, parent, via, goal };
}
/**
 * The solved arrangements of a row: every way of seating `frogs` (a list of colours) so that each sits on a ribbon of
 * its colour, the other stumps empty. When there are as many ribbons of each colour as frogs wearing it (as every
 * puzzle laid here has) there is only one; more ribbons than frogs leave a choice of where the frogs sit.
 */
export function solvedArrangements(ribbons: readonly number[], frogs: readonly number[]) {
  const left = new Map<number, number>();
  for (const f of frogs) if (f !== NONE) left.set(f, (left.get(f) ?? 0) + 1);
  const out: number[][] = [],
    seat = new Array<number>(ribbons.length).fill(NONE),
    room = (from: number, colour: number) => ribbons.slice(from).filter((r) => r === colour).length;
  const place = (i: number) => {
    if (i === ribbons.length) {
      if ([...left.values()].every((k) => k === 0)) out.push(seat.slice());
      return;
    }
    const colour = ribbons[i],
      want = left.get(colour) ?? 0;
    // A frog of this colour sits here, or the stump stays empty while enough ribbons of its colour lie ahead.
    if (colour !== NONE && want > 0) {
      left.set(colour, want - 1);
      seat[i] = colour;
      place(i + 1);
      seat[i] = NONE;
      left.set(colour, want);
    }
    if (colour === NONE || want === 0 || room(i + 1, colour) >= want) place(i + 1);
  };
  place(0);
  return out;
}
/** How many arrangements the moves reach from the solved ones of a row of ribbons whose frogs are those the ribbons name. */
export function reachable(ribbons: readonly number[], frogs: readonly number[] = ribbons) {
  return walk(solvedArrangements(ribbons, frogs).map(encode), ribbons.length, Infinity).count;
}
/** How many arrangements there are of a row's frogs over its stumps: frogs of one colour, and empty stumps, are alike. */
export function arrangements(stumps: number, frogs: readonly number[]) {
  const factorial = (k: number): number => (k <= 1 ? 1 : k * factorial(k - 1)),
    kinds = new Map<number, number>();
  for (const f of frogs) if (f !== NONE) kinds.set(f, (kinds.get(f) ?? 0) + 1);
  const seated = frogs.filter((f) => f !== NONE).length;
  return [...kinds.values()].reduce((total, k) => total / factorial(k), factorial(stumps) / factorial(stumps - seated));
}
const pick = <X>(items: X[], random: Random) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
const shuffled = <X>(items: X[], random: Random) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
/** The stage a variant names (1 to 4). */
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));
/**
 * A puzzle of a stage whose fewest moves lie in the stage's band: the colours are drawn, the ribbons tied at random,
 * the arrangements explored outward from the solved one as far as the band reaches, a count of moves drawn from those
 * the band and the family share (so that the band is spread evenly), and an arrangement at that count taken, one
 * with at most one frog already home where there is such.
 */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const k = stageOf(stage),
    { stumps, colours, pairs, gaps, lo, hi } = STAGES[k - 1];
  for (let tries = 0; ; tries++) {
    const worn = shuffled(
        Array.from({ length: COLOURS }, (_, c) => c),
        random,
      ).slice(0, colours),
      frogs = [...worn, ...worn.slice(0, pairs)],
      ribbons = shuffled([...frogs, ...new Array<number>(gaps).fill(NONE)], random),
      sources = solvedArrangements(ribbons, frogs).map(encode),
      family = walk(sources, stumps, hi),
      counts = new Set<number>();
    for (let j = 0; j < family.count; j++) if (family.dist[j] >= lo) counts.add(family.dist[j]);
    // Never so far (the band is well inside every family laid); a fresh row of ribbons all the same.
    if (!counts.size && tries < 20) continue;
    const want = counts.size ? pick([...counts], random) : family.dist[family.count - 1],
      at: number[] = [],
      calm: number[] = [];
    for (let j = 0; j < family.count; j++) {
      if (family.dist[j] !== want) continue;
      at.push(j);
      if (homeCount({ ribbons, frogs: decode(family.codes[j], stumps) }) <= 1) calm.push(j);
    }
    const j = pick(calm.length ? calm : at, random);
    return { ribbons, frogs: decode(family.codes[j], stumps), best: want, last: null, winner: null, ply: 0, stage: k };
  }
}
/** The shortest way from a state to every frog at home, as its moves (empty when it is solved, null when there is none). */
export function solve(state: State): Move[] | null {
  if (state.winner !== null || solvedBy(state.ribbons, state.frogs)) return [];
  const n = state.frogs.length,
    want = state.ribbons.map((r) => r + 1),
    { parent, via, goal } = walk([encode(state.frogs)], n, Infinity, (digits) => {
      for (let i = 0; i < n; i++) if (digits[i] && digits[i] !== want[i]) return false;
      return true;
    });
  if (goal < 0) return null;
  const path: Move[] = [];
  for (let j = goal; parent[j] >= 0; j = parent[j]) path.push({ from: via[j] >> 4, to: via[j] & 15, extra: -1 });
  return path.reverse();
}
/** The first move of a shortest way home, or null when there is none to make. */
export function hint(state: State): Move | null {
  return solve(state)?.[0] ?? null;
}
/** The fewest moves still needed (-1 when there is no way). */
export const distance = (state: State) => {
  const path = solve(state);
  return path ? path.length : -1;
};
const effect = (): Effect | null => null;
export const frogHop: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.frogs.map((f) => (f === NONE ? null : 0)),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: () => "옆 빈 그루터기로 폴짝, 개구리 하나는 뛰어넘기 · 모두 제 색 리본으로",
  tally: () => ["", ""],
  reason: () => "성공! 개구리가 모두 제 색 그루터기에 앉았습니다.",
};
