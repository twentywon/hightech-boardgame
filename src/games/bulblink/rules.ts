import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * 전구 잇기 (BULB LINK), the kind of puzzle known from the small web game 'Switch the Bulb': a board of sockets, some
 * holding a bulb, and every bulb to be lit by one line of wire that goes from bulb to bulb in a straight line, along a
 * row, a column or a diagonal, visiting each bulb once. Only the kind of puzzle was taken; the rules below where the
 * original is not known are our own.
 *
 * The board is `size` × `size` cells, numbered row by row from the top left (`r * size + c`); row 0 is the far side,
 * away from the eye. A cell holds nothing (an empty socket), a bulb, or a box (a metal junction box).
 *
 * One move, `{from: -1, to: cell, extra: -1}` through `play`, lights one bulb:
 * - The first move chooses the bulb to start from: any bulb. It lights, and the battery is joined to it.
 * - Every move after that lays a wire from the last bulb lit (the head) to `to`, which must be a link of the head.
 * - The links of a bulb: in each of the eight directions (row, column, diagonal) the line runs from cell to cell and
 *   stops at the first bulb that is still unlit: that bulb is the link in that direction. The line passes over empty
 *   sockets and over bulbs already lit (they are on the wire already), never over an unlit bulb. A box stops the
 *   line: there is no link beyond it in that direction. The edge of the board stops it too. So a bulb has at most
 *   eight links.
 * - Wires may cross each other: a wire runs in the air from socket to socket.
 * - Anything else (an empty socket, a box, a bulb already lit, an unlit bulb no line reaches) is refused, and
 *   `refusal` says why.
 * - When every bulb is lit the puzzle is won (`winner` 0). There is no failure: a head with no link left while bulbs
 *   are still unlit is a dead end, told by the status line, and taken back with undo (the hint is then none).
 * `path` is the bulbs lit, in order; `last` the wire just laid (`from` -1 for the start), for the view.
 *
 * A puzzle is laid at random (`createGame`): a path of bulbs is walked by these very rules (from the bulb laid last,
 * a random direction and a random distance to an empty cell, cells in line with few other bulbs preferred), so that
 * each step, replayed, links to the first unlit bulb: a new bulb is never laid on a cell an earlier wire passed over.
 * Boxes are then set on cells no wire of that path passes over, where they cut some other line. A board is judged by
 * `luck` (how often lighting at random, from a random bulb along random links, gets through) and by how many bulbs a
 * way through can start from (`countSolutions`, a depth-first search over the lit set and the head with memory and
 * pruning): it is kept when lighting at random seldom gets through for the stage and few bulbs make a start, or else
 * the best of the first few hard enough. The path walked is kept as `plan`, and the hint follows it while I do.
 */
export const EMPTY = 0,
  BULB = 1,
  BOX = 2;
/** The eight directions, clockwise from north: N, NE, E, SE, S, SW, W, NW. */
export const DR = [-1, -1, 0, 1, 1, 1, 0, -1],
  DC = [0, 1, 1, 1, 0, -1, -1, -1];

export interface Last {
  /** The bulb the wire came from (-1 for the first bulb, joined to the battery). */
  from: number;
  to: number;
}
export interface State {
  size: number;
  /** What each cell holds: EMPTY, BULB or BOX. */
  cells: number[];
  /** The bulbs lit, in order; the last is the head. */
  path: number[];
  /** 1 where a bulb is lit. */
  lit: number[];
  stage: number;
  /** A way through found as the board was laid (the path walked); the hint follows it while I do. */
  plan: number[];
  last: Last | null;
  winner: Winner;
  ply: number;
}

/**
 * A stage: the board's size, how many bulbs and boxes, how often lighting at random may get through at most (`luck`),
 * and the largest share of the bulbs a way through may start from (`starts`).
 */
export interface Stage {
  size: number;
  bulbs: [number, number];
  boxes: number;
  luck: number;
  starts: number;
}
export const STAGES: Stage[] = [
  { size: 5, bulbs: [5, 6], boxes: 0, luck: 0.6, starts: 1 },
  { size: 6, bulbs: [8, 9], boxes: 0, luck: 0.25, starts: 0.7 },
  { size: 7, bulbs: [11, 13], boxes: 2, luck: 0.1, starts: 0.5 },
  { size: 8, bulbs: [15, 18], boxes: 3, luck: 0.04, starts: 0.5 },
  { size: 9, bulbs: [20, 24], boxes: 4, luck: 0.02, starts: 0.5 },
];
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));

/** What the lines need to know: the board and which bulbs are lit. */
type Board = { size: number; cells: ArrayLike<number>; lit: ArrayLike<number> };
const head = (s: State) => (s.path.length ? s.path[s.path.length - 1] : -1);
const inside = (n: number, r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n;

/** Where the line from `from` in direction `d` stops, by the rules above: the bulb it links to, or why there is none. */
export function lineFrom(state: Board, from: number, d: number): { to: number; stop: "bulb" | "box" | "edge"; at: number } {
  const n = state.size;
  let r = Math.floor(from / n) + DR[d],
    c = (from % n) + DC[d];
  for (; inside(n, r, c); r += DR[d], c += DC[d]) {
    const cell = r * n + c,
      kind = state.cells[cell];
    if (kind === BOX) return { to: -1, stop: "box", at: cell };
    if (kind === BULB && !state.lit[cell]) return { to: cell, stop: "bulb", at: cell };
  }
  return { to: -1, stop: "edge", at: -1 };
}
/** The links of `from` (at most eight unlit bulbs), in the order of the directions. */
export function links(state: Board, from: number) {
  const out: number[] = [];
  for (let d = 0; d < 8; d++) {
    const line = lineFrom(state, from, d);
    if (line.to >= 0) out.push(line.to);
  }
  return out;
}
/** The bulbs a tap may light now: any bulb at the start, the head's links after it. */
export function reachable(state: State) {
  if (state.winner !== null) return [];
  if (!state.path.length) return state.cells.flatMap((kind, i) => (kind === BULB ? [i] : []));
  return links(state, head(state));
}
/** Bulbs, in the order of the cells. */
export const bulbsOf = (state: Pick<State, "cells">) => state.cells.flatMap((kind, i) => (kind === BULB ? [i] : []));
/** Bulbs still unlit while the head has no link: the wire can go no further. */
export const deadEnd = (state: State) => state.winner === null && state.path.length > 0 && reachable(state).length === 0;

/** The direction from `a` to `b` when they share a row, a column or a diagonal; else -1. */
export function directionOf(n: number, a: number, b: number) {
  const dr = Math.floor(b / n) - Math.floor(a / n),
    dc = (b % n) - (a % n);
  if (a === b || (dr && dc && Math.abs(dr) !== Math.abs(dc))) return -1;
  const sr = Math.sign(dr),
    sc = Math.sign(dc);
  for (let d = 0; d < 8; d++) if (DR[d] === sr && DC[d] === sc) return d;
  return -1;
}

/** Why a tap on `move.to` is refused, or null. */
export function refusal(state: State, move: Move) {
  if (state.winner !== null || move.from !== -1 || move.to < 0 || move.to >= state.cells.length) return null;
  const cell = move.to,
    kind = state.cells[cell];
  if (kind === BOX) return "금속 상자입니다. 전구를 누르세요.";
  if (kind === EMPTY) return "빈 소켓입니다. 전구를 누르세요.";
  if (state.lit[cell]) return cell === head(state) ? "지금 줄 끝에 있는 전구입니다. 다음에 켤 전구를 누르세요." : "이미 켜진 전구입니다.";
  if (!state.path.length) return null;
  const from = head(state),
    d = directionOf(state.size, from, cell);
  if (d < 0) return "그 전구에는 줄이 닿지 않습니다. 가로·세로·대각선으로 곧게 이어진 전구만 켤 수 있습니다.";
  const line = lineFrom(state, from, d);
  if (line.to === cell) return null;
  if (line.stop === "box") return "상자에 막혔습니다.";
  return "그 전구에는 줄이 닿지 않습니다. 줄은 처음 만나는 꺼진 전구에서 멈춥니다.";
}
export function moves(state: State): Move[] {
  return reachable(state).map((to) => ({ from: -1, to, extra: -1 }));
}
/** The state after lighting `move.to`, or null when it may not be lit now. */
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to)) return null;
  const to = move.to;
  if (to < 0 || to >= state.cells.length || state.cells[to] !== BULB || state.lit[to]) return null;
  const from = head(state);
  if (from >= 0 && !links(state, from).includes(to)) return null;
  const lit = [...state.lit];
  lit[to] = 1;
  const path = [...state.path, to],
    total = state.cells.reduce((sum, kind) => sum + (kind === BULB ? 1 : 0), 0);
  return { ...state, path, lit, last: { from, to }, winner: path.length === total ? 0 : null, ply: state.ply + 1 };
}
/** The state with the last bulb taken back (the wire to it, or the start), replayed from the board as laid. */
export function undo(state: State): State {
  let s: State = { ...state, path: [], lit: state.cells.map(() => 0), last: null, winner: null, ply: 0 };
  for (const cell of state.path.slice(0, -1)) s = play(s, { from: -1, to: cell, extra: -1 })!;
  return s;
}

/*
 * The search over ways through. Bulbs are numbered 0..B-1 (B ≤ 30) in the order of the cells; a position is the set
 * of lit bulbs (a bit mask) and the head. For each bulb and direction, `rays` lists the bulbs along that line up to a
 * box or the edge; the link in that direction is the first of them not yet lit. `near` is every bulb on any of a
 * bulb's rays: whatever is lit later, a bulb can only ever be joined to those. A position is given up when an unlit
 * bulb has no unlit or head bulb near it, when two unlit bulbs have only one each (only the last bulb of a way may),
 * or when the unlit bulbs and the head do not hang together through `near`. Positions are remembered.
 */
interface Graph {
  cells: number[];
  rays: number[][][];
  near: number[];
  count: number;
}
function graphOf(state: Pick<State, "size" | "cells">): Graph {
  const n = state.size,
    cells = bulbsOf(state),
    index = new Map(cells.map((cell, i) => [cell, i])),
    rays: number[][][] = [],
    near: number[] = [];
  cells.forEach((cell) => {
    const mine: number[][] = [];
    let around = 0;
    for (let d = 0; d < 8; d++) {
      const ray: number[] = [];
      for (let r = Math.floor(cell / n) + DR[d], c = (cell % n) + DC[d]; inside(n, r, c); r += DR[d], c += DC[d]) {
        const at = r * n + c;
        if (state.cells[at] === BOX) break;
        if (state.cells[at] === BULB) {
          ray.push(index.get(at)!);
          around |= 1 << index.get(at)!;
        }
      }
      mine.push(ray);
    }
    rays.push(mine);
    near.push(around);
  });
  return { cells, rays, near, count: cells.length };
}
const bitCount = (x: number) => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};
/** Whether the position (lit `mask`, head `at`) may still lead through: the pruning described above. */
function hopeful(g: Graph, mask: number, at: number) {
  const full = g.count === 32 ? -1 >>> 0 : (1 << g.count) - 1,
    open = (full & ~mask) >>> 0,
    alive = (open | (1 << at)) >>> 0;
  let single = 0;
  for (let rest = open; rest; rest &= rest - 1) {
    const i = 31 - Math.clz32(rest & -rest),
      degree = bitCount((g.near[i] & alive) >>> 0);
    if (!degree) return false;
    if (degree === 1 && ++single > 1) return false;
  }
  // Everything unlit must hang together with the head.
  let reach = 1 << at,
    frontier = reach;
  while (frontier) {
    let next = 0;
    for (let f = frontier; f; f &= f - 1) next |= g.near[31 - Math.clz32(f & -f)];
    next = (next & alive & ~reach) >>> 0;
    reach = (reach | next) >>> 0;
    frontier = next;
  }
  return (reach & open) >>> 0 === open;
}
/** The links of bulb `at` with `mask` lit, as bulb numbers. */
function linksOf(g: Graph, mask: number, at: number, out: number[]) {
  out.length = 0;
  for (const ray of g.rays[at])
    for (const j of ray)
      if (!(mask & (1 << j))) {
        out.push(j);
        break;
      }
  return out;
}
/** How far a search may go (positions visited) before it gives up and says it does not know. */
const BUDGET = 400000;
interface Counter {
  g: Graph;
  memo: Map<number, number>;
  cap: number;
  visited: number;
  budget: number;
}
/** Ways through from (mask, at), up to `cap`; -1 once the budget is spent. */
function countFrom(k: Counter, mask: number, at: number): number {
  const full = (1 << k.g.count) - 1;
  if (mask === full) return 1;
  const key = mask * 32 + at,
    known = k.memo.get(key);
  if (known !== undefined) return known;
  if (++k.visited > k.budget) return -1;
  let total = 0;
  if (hopeful(k.g, mask, at)) {
    const next = linksOf(k.g, mask, at, []);
    for (const j of next) {
      const ways = countFrom(k, (mask | (1 << j)) >>> 0, j);
      if (ways < 0) return -1;
      total = Math.min(k.cap, total + ways);
      if (total >= k.cap) break;
    }
  }
  k.memo.set(key, total);
  return total;
}
/**
 * Ways through the board from the state shown (counted up to `cap`), and from how many bulbs a way can start when
 * nothing is lit yet; null when the search ran out of its budget.
 */
export function countSolutions(state: State, cap = 1000, budget = BUDGET): { ways: number; starts: number } | null {
  const g = graphOf(state),
    k: Counter = { g, memo: new Map(), cap, visited: 0, budget },
    index = new Map(g.cells.map((cell, i) => [cell, i]));
  if (state.path.length) {
    let mask = 0;
    for (const cell of state.path) mask |= 1 << index.get(cell)!;
    const ways = countFrom(k, mask >>> 0, index.get(head(state))!);
    return ways < 0 ? null : { ways, starts: 1 };
  }
  let ways = 0,
    starts = 0;
  for (let i = 0; i < g.count; i++) {
    const w = countFrom(k, (1 << i) >>> 0, i);
    if (w < 0) return null;
    if (w > 0) starts++;
    ways = Math.min(cap, ways + w);
  }
  return { ways, starts };
}
/** One way through from (mask, at), as bulb numbers after the head; null when there is none. */
function findFrom(g: Graph, mask: number, at: number, failed: Set<number>, budget: { left: number }): number[] | null {
  const full = (1 << g.count) - 1;
  if (mask === full) return [];
  const key = mask * 32 + at;
  if (failed.has(key) || --budget.left < 0 || !hopeful(g, mask, at)) return null;
  // Bulbs with fewer links on first (Warnsdorff's rule), so that a way is found sooner.
  const next = linksOf(g, mask, at, [])
    .map((j) => ({ j, onward: linksOf(g, (mask | (1 << j)) >>> 0, j, []).length }))
    .sort((a, b) => a.onward - b.onward || a.j - b.j);
  for (const { j } of next) {
    const rest = findFrom(g, (mask | (1 << j)) >>> 0, j, failed, budget);
    if (rest) return [j, ...rest];
  }
  if (budget.left >= 0) failed.add(key);
  return null;
}
/**
 * A way through from the state shown: the cells to light, in order (the whole way, start included, when nothing is
 * lit); [] when everything is lit, null when there is none (or none found within the budget).
 */
export function solve(state: State): number[] | null {
  if (state.winner !== null) return [];
  const g = graphOf(state),
    index = new Map(g.cells.map((cell, i) => [cell, i])),
    failed = new Set<number>(),
    budget = { left: BUDGET };
  if (state.path.length) {
    let mask = 0;
    for (const cell of state.path) mask |= 1 << index.get(cell)!;
    const way = findFrom(g, mask >>> 0, index.get(head(state))!, failed, budget);
    return way && way.map((j) => g.cells[j]);
  }
  // The plan's start first, then the others.
  const order = [...g.cells.keys()].sort((a, b) => Number(g.cells[b] === state.plan[0]) - Number(g.cells[a] === state.plan[0]));
  for (const i of order) {
    const way = findFrom(g, (1 << i) >>> 0, i, failed, budget);
    if (way) return [g.cells[i], ...way.map((j) => g.cells[j])];
  }
  return null;
}
/**
 * The hint: the bulb to light next on a way through. While I have followed the plan the board was laid with, its next
 * bulb (its start at first); else the next bulb of a way the search finds. Null when there is none: a dead end or a
 * wire that can no longer light everything, which undo mends.
 */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const move = (to: number) => ({ from: -1, to, extra: -1 }),
    { plan, path } = state;
  if (path.length < plan.length && path.every((cell, i) => plan[i] === cell)) return move(plan[path.length]);
  const way = solve(state);
  return way && way.length ? move(way[0]) : null;
}

/** How much less likely each further bulb in line with a cell makes the walk to choose it. */
const ALIGNED = 0.3;
/** How many bulbs lie in line with `cell` (on any of its eight lines, whatever lies between). */
function aligned(kinds: ArrayLike<number>, n: number, cell: number) {
  let count = 0;
  for (let d = 0; d < 8; d++)
    for (let r = Math.floor(cell / n) + DR[d], c = (cell % n) + DC[d]; inside(n, r, c); r += DR[d], c += DC[d]) if (kinds[r * n + c] === BULB) count++;
  return count;
}
/** A path of `count` bulbs walked by the rules on an empty board of `n`, or null when the walk got stuck. */
export function walk(n: number, count: number, random: Random): number[] | null {
  const kinds = new Uint8Array(n * n),
    // Cells some wire of the path passes over: no bulb may be laid there later.
    crossed = new Uint8Array(n * n);
  let at = Math.floor(random() * n * n);
  kinds[at] = BULB;
  const path = [at];
  while (path.length < count) {
    const options: { cell: number; weight: number; d: number; k: number }[] = [];
    for (let d = 0; d < 8; d++) {
      let over = false;
      for (let k = 1, r = Math.floor(at / n) + DR[d], c = (at % n) + DC[d]; inside(n, r, c); k++, r += DR[d], c += DC[d]) {
        const cell = r * n + c;
        if (kinds[cell]) {
          // A lit bulb: the line goes on over it.
          over = true;
          continue;
        }
        if (crossed[cell]) continue;
        // Lines that pass over lit bulbs and long lines are what make a board worth thinking about; a cell in line
        // with few other bulbs leaves few ways through, so that the order matters.
        options.push({ cell, weight: (over ? 3 : 1) * (k === 1 ? 0.7 : 1.2) * ALIGNED ** (aligned(kinds, n, cell) - 1), d, k });
      }
    }
    if (!options.length) return null;
    let pick = random() * options.reduce((sum, o) => sum + o.weight, 0),
      chosen = options[options.length - 1];
    for (const o of options) if ((pick -= o.weight) < 0) {
      chosen = o;
      break;
    }
    for (let k = 1; k < chosen.k; k++) {
      const cell = at + (DR[chosen.d] * n + DC[chosen.d]) * k;
      if (!kinds[cell]) crossed[cell] = 1;
    }
    kinds[chosen.cell] = BULB;
    path.push(chosen.cell);
    at = chosen.cell;
  }
  return path;
}
/** The cells some wire of `path` passes over (not the bulbs themselves). */
export function crossedBy(n: number, path: number[]) {
  const out = new Set<number>();
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      d = directionOf(n, a, b),
      step = DR[d] * n + DC[d];
    for (let cell = a + step; cell !== b; cell += step) out.add(cell);
  }
  return out;
}
const fresh = (size: number, cells: number[], stage: number, plan: number[]): State => ({
  size,
  cells,
  path: [],
  lit: cells.map(() => 0),
  stage,
  plan,
  last: null,
  winner: null,
  ply: 0,
});
/**
 * How often lighting bulbs at random gets through: from a bulb chosen at random, a link chosen at random each time,
 * `tries` times. A board where that seldom works is one where the order has to be thought out.
 */
export function luck(state: State, tries: number, random: Random) {
  const bulbs = bulbsOf(state),
    lit = new Uint8Array(state.cells.length),
    view = { size: state.size, cells: state.cells, lit };
  let won = 0;
  for (let t = 0; t < tries; t++) {
    lit.fill(0);
    let at = bulbs[Math.floor(random() * bulbs.length)],
      count = 1;
    lit[at] = 1;
    for (;;) {
      const next = links(view, at);
      if (!next.length) break;
      at = next[Math.floor(random() * next.length)];
      lit[at] = 1;
      count++;
    }
    if (count === bulbs.length) won++;
  }
  return won / tries;
}
/** How far the search for the bulbs a way can start from may go while a board is judged (else the board is passed over). */
const JUDGE_BUDGET = 60000;
/** Playouts a box is judged by, and the board as a whole. */
const BOX_TRIES = 60,
  BOARD_TRIES = 240;
/**
 * Boxes for a board: `count` cells that no wire of the plan passes over and that cut some line between two bulbs,
 * each chosen among a few at random as the one after which lighting at random gets through least often.
 */
function setBoxes(state: State, count: number, random: Random) {
  const n = state.size,
    crossed = crossedBy(n, state.plan);
  let s = state;
  for (let b = 0; b < count; b++) {
    // Empty cells lying between two bulbs of a line, clear of the plan's wires.
    const cutting: number[] = [];
    for (let cell = 0; cell < n * n; cell++) {
      if (s.cells[cell] !== EMPTY || crossed.has(cell)) continue;
      // A bulb on both sides of it along some line (before a box or the edge): a box here cuts that line.
      for (let d = 0; d < 4; d++)
        if (sideBulb(s, cell, d) && sideBulb(s, cell, d + 4)) {
          cutting.push(cell);
          break;
        }
    }
    if (!cutting.length) return null;
    let best = s,
      score = Infinity;
    for (let k = 0; k < 5; k++) {
      const cell = cutting[Math.floor(random() * cutting.length)],
        cells = [...s.cells];
      cells[cell] = BOX;
      const trial = fresh(n, cells, s.stage, s.plan),
        value = luck(trial, BOX_TRIES, random);
      if (value < score) {
        score = value;
        best = trial;
      }
    }
    s = best;
  }
  return s;
}
/** Whether a bulb lies along direction `d` from `cell` before a box or the edge. */
function sideBulb(state: State, cell: number, d: number) {
  const n = state.size;
  for (let r = Math.floor(cell / n) + DR[d], c = (cell % n) + DC[d]; inside(n, r, c); r += DR[d], c += DC[d]) {
    const kind = state.cells[r * n + c];
    if (kind === BOX) return false;
    if (kind === BULB) return true;
  }
  return false;
}
/** A board laid at random for a stage, before it is judged: the bulbs of a path walked, and its boxes. */
export function lay(stage: number, random: Random): State | null {
  const spec = STAGES[stage - 1],
    n = spec.size,
    count = spec.bulbs[0] + Math.floor(random() * (spec.bulbs[1] - spec.bulbs[0] + 1));
  const path = walk(n, count, random);
  if (!path) return null;
  const cells = new Array(n * n).fill(EMPTY);
  for (const cell of path) cells[cell] = BULB;
  const state = fresh(n, cells, stage, path);
  return spec.boxes ? setBoxes(state, spec.boxes, random) : state;
}
/**
 * How a laid board is judged: how often lighting at random gets through, and, for a board that passes that, from how
 * many bulbs a way through can start; null when the search ran out of budget.
 */
export function judge(state: State, random: Random) {
  const chance = luck(state, BOARD_TRIES, random),
    spec = STAGES[state.stage - 1];
  if (chance > spec.luck) return { chance, starts: Infinity };
  const counted = countSolutions(state, 1, JUDGE_BUDGET);
  return counted && { chance, starts: counted.starts };
}
/** A quick generator of numbers in [0, 1) from a 32-bit seed (mulberry32). */
export function quick(seed: number): Random {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/** How many boards that are hard enough by `luck` are looked at for the one with the fewest bulbs to start from. */
const PICK = 6;
/** How many boards are tried at most before the best one met so far is kept. */
const TRIES = 400;
/**
 * A new puzzle of `stage` (1–5), its way through kept as `plan`: the first board that is hard enough by `luck` and
 * leaves at most the stage's share of bulbs to start from; failing that, of the first few hard enough, the one with
 * the fewest starts (then the least luck).
 */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const at = stageOf(stage),
    spec = STAGES[at - 1];
  // One number is drawn from `random`; the many the laying and judging need come from a quick generator seeded with it
  // (the platform's secure one is slow when asked tens of thousands of times).
  random = quick(Math.floor(random() * 4294967296));
  let kept: { state: State; score: number } | null = null,
    hard = 0;
  for (let k = 0; k < TRIES && hard < PICK; k++) {
    const state = lay(at, random);
    if (!state) continue;
    const judged = judge(state, random);
    if (!judged) continue;
    const starts = judged.starts / state.plan.length;
    if (judged.chance <= spec.luck) {
      hard++;
      if (starts <= spec.starts) return state;
    }
    const score = (judged.chance <= spec.luck ? 0 : 10 + judged.chance) + Math.min(1, starts) + judged.chance * 0.1;
    if (!kept || score < kept.score) kept = { state, score };
  }
  return kept!.state;
}

const effect = (s: State): Effect | null => (s.last ? { kind: "place", from: s.last.from, to: s.last.to, converted: [], removed: [] } : null);
export const bulbLink: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.cells.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => s.path.length,
  hint: (s) =>
    !s.path.length
      ? "처음 켤 전구를 누르세요"
      : deadEnd(s)
        ? "막다른 곳입니다 · 무르기로 되돌리세요"
        : "다음 전구를 누르세요 · 줄은 처음 닿는 꺼진 전구까지",
  tally: () => ["", ""],
  reason: (s) => (s.winner === 0 ? "성공! 전구를 모두 켰습니다." : ""),
};
