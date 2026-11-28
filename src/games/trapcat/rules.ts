import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Trap the cat, the old hex puzzle (the kind known from the Flash game 'Chat Noir'): a cat sits in the middle of a
 * field of hexes and wants to get out over the edge; I set one block a turn and try to shut it in.
 *
 * The field is SIZE × SIZE hexes in offset rows: every odd row is shifted half a hex to the right. Cells are
 * numbered row by row from the top left (`r * SIZE + c`); row 0 is the far side, away from the eye. The edge hexes
 * are those in the first or last row or column.
 *
 * One move, `{from: -1, to: cell, extra: -1}` through `play`, is my block and the cat's answer together:
 * - I block an open hex the cat is not on (a blocked hex or the cat's own is refused, `refusal` says why).
 * - If the cat then has no open neighbour, it is trapped: the puzzle is won (`winner` 0) and the cat stays.
 * - Otherwise the cat steps at once to one open neighbour (by `catStep`, below). If that neighbour is an edge hex,
 *   the cat is out: from an edge hex it would step off the field next turn and no block can stop that, so the
 *   puzzle is lost there and then (`winner` 1, `trouble` says so), to be taken back with undo.
 * `last` records the block and where the cat went, for the view.
 *
 * The cat is deterministic, so that undo and a replay of the same blocks give the same game: everything it does
 * depends only on the field, its place, the stage and `seed` (kept in the state and moved on at every step). Its
 * ways, by stage (`Stage.cat`):
 * - An open edge hex next to it is always taken.
 * - PLAIN (쉬움): a step on a shortest way to the edge, the first in a fixed order of the six directions; now and
 *   then (one step in four, by `seed`) it wanders to another open neighbour instead.
 * - WAYS (보통): a shortest-way step that leaves it the most shortest ways on (neighbours one step nearer the edge).
 * - AHEAD (어려움) and SHREWD (고수, 달인): it looks a move ahead by the "two-distance": the edge is 0, and a hex is
 *   1 + the second smallest two-distance among its open neighbours, because whichever way it would go I can block the
 *   best one first. It steps to the neighbour of the smallest two-distance (then the smallest plain distance); SHREWD
 *   breaks ties further by the most ways on. Where every two-distance is endless it falls back on the plain distance.
 * - Once shut in (no way to any edge) it moves to the neighbour with the most open hexes behind it (then the most open
 *   neighbours), so that it is not trapped at once.
 *
 * A puzzle is laid at random (`createGame`): the cat in the middle, the stage's number of blocks anywhere but on the
 * cat or next to it, and the field kept only when a search of my blocks against the stage's cat (`solve`) finds a way
 * to shut it in within a fixed number of positions; that way is kept as `plan` and the hint follows it while I do.
 */
export const SIZE = 11,
  CELLS = SIZE * SIZE,
  MIDDLE = Math.floor(SIZE / 2) * SIZE + Math.floor(SIZE / 2);
/** How the cat thinks (see above). */
export const PLAIN = 0,
  WAYS = 1,
  AHEAD = 2,
  SHREWD = 3;
const FAR = 9999;
export const rowOf = (cell: number) => Math.floor(cell / SIZE),
  colOf = (cell: number) => cell % SIZE;
export const isEdge = (cell: number) => {
  const r = rowOf(cell),
    c = colOf(cell);
  return r === 0 || c === 0 || r === SIZE - 1 || c === SIZE - 1;
};
/**
 * The six neighbours of each cell, always in the same order: west, east, north-west, north-east, south-west,
 * south-east (those off the field left out). The order breaks the cat's ties.
 */
export const NEIGHBOURS: number[][] = Array.from({ length: CELLS }, (_, cell) => {
  const r = rowOf(cell),
    c = colOf(cell),
    shift = r & 1,
    out: number[] = [];
  for (const [dr, dc] of [
    [0, -1],
    [0, 1],
    [-1, shift - 1],
    [-1, shift],
    [1, shift - 1],
    [1, shift],
  ]) {
    const rr = r + dr,
      cc = c + dc;
    if (rr >= 0 && cc >= 0 && rr < SIZE && cc < SIZE) out.push(rr * SIZE + cc);
  }
  return out;
});
const EDGE = Array.from({ length: CELLS }, (_, i) => i).filter(isEdge);

export interface Last {
  /** The hex I blocked. */
  block: number;
  /** Where the cat stood, and where it went (the same when it was trapped). */
  from: number;
  to: number;
  trapped: boolean;
  escaped: boolean;
}
export interface State {
  /** 1 where a hex is blocked. */
  blocked: number[];
  /** The blocks the field was laid with (the rest are mine). */
  given: number[];
  /** My blocks, in the order set. */
  mine: number[];
  cat: number;
  /** The cat's own sequence, moved on at every step (it decides the easiest cat's wanderings). */
  seed: number;
  stage: number;
  /** A way to shut the cat in from the field as it was laid, found as it was laid; the hint follows it while I do. */
  plan: number[];
  last: Last | null;
  winner: Winner;
  ply: number;
  trouble: string;
}

/** The next value of the cat's sequence. */
const nextSeed = (seed: number) => (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;

/*
 * Scratch arrays shared by the searches (the game is played on one thread).
 */
const queue = new Int16Array(CELLS);
/** Distances from the open edge hexes over open hexes, into `out` (FAR where there is no way). */
function edgeDistance(blocked: ArrayLike<number>, out: Int16Array) {
  out.fill(FAR);
  let head = 0,
    tail = 0;
  for (const e of EDGE)
    if (!blocked[e]) {
      out[e] = 0;
      queue[tail++] = e;
    }
  while (head < tail) {
    const x = queue[head++],
      d = out[x] + 1;
    for (const y of NEIGHBOURS[x])
      if (!blocked[y] && out[y] > d) {
        out[y] = d;
        queue[tail++] = y;
      }
  }
  return out;
}
/** Distances from one hex over open hexes (the hex itself counts as open). */
function distanceFrom(blocked: ArrayLike<number>, from: number, out: Int16Array) {
  out.fill(FAR);
  out[from] = 0;
  queue[0] = from;
  let head = 0,
    tail = 1;
  while (head < tail) {
    const x = queue[head++],
      d = out[x] + 1;
    for (const y of NEIGHBOURS[x])
      if (!blocked[y] && out[y] > d) {
        out[y] = d;
        queue[tail++] = y;
      }
  }
  return out;
}
const seen = new Int16Array(CELLS),
  bucket = new Int16Array(CELLS),
  /** Buckets of hexes by tentative two-distance, as linked lists. */
  firstOf = new Int16Array(CELLS + 2),
  nextOf = new Int16Array(CELLS);
/** Two-distances (see the head of this file) into `out`. */
function twoDistance(blocked: ArrayLike<number>, out: Int16Array) {
  out.fill(FAR);
  seen.fill(0);
  bucket.fill(0);
  firstOf.fill(-1);
  const push = (cell: number, value: number) => {
    out[cell] = value;
    nextOf[cell] = firstOf[value];
    firstOf[value] = cell;
  };
  for (const e of EDGE) if (!blocked[e]) push(e, 0);
  for (let v = 0; v <= CELLS; v++) {
    for (let x = firstOf[v]; x >= 0; x = nextOf[x]) {
      if (seen[x]) continue;
      seen[x] = 1;
      for (const y of NEIGHBOURS[x]) {
        if (blocked[y] || seen[y] || out[y] <= v + 1) continue;
        // The second neighbour to be settled gives the second smallest value.
        if (++bucket[y] >= 2) push(y, v + 1);
      }
    }
  }
  return out;
}
/** How many open hexes are reached from `from` without passing `not` (a flood over open hexes). */
function room(blocked: ArrayLike<number>, from: number, not: number) {
  seen.fill(0);
  seen[from] = 1;
  seen[not] = 1;
  queue[0] = from;
  let head = 0,
    tail = 1;
  while (head < tail) {
    const x = queue[head++];
    for (const y of NEIGHBOURS[x])
      if (!blocked[y] && !seen[y]) {
        seen[y] = 1;
        queue[tail++] = y;
      }
  }
  return tail;
}
const plainDist = new Int16Array(CELLS),
  twoDist = new Int16Array(CELLS);
/** Open neighbours of `cell` one step nearer the edge, by `dist`. */
const waysOn = (blocked: ArrayLike<number>, cell: number, dist: Int16Array) => {
  let n = 0;
  for (const y of NEIGHBOURS[cell]) if (!blocked[y] && dist[y] < dist[cell]) n++;
  return n;
};
/**
 * Where the cat at `cat` steps on the field `blocked` (my block already set), thinking as `cat` level says, and its
 * sequence after the step; `to` is -1 when it has no open neighbour (trapped). `shut` says it has no way out.
 */
export function catStep(blocked: ArrayLike<number>, cat: number, seed: number, level: number) {
  const open = NEIGHBOURS[cat].filter((y) => !blocked[y]),
    after = nextSeed(seed);
  if (!open.length) return { to: -1, seed: after, shut: true };
  const edge = open.find(isEdge);
  if (edge !== undefined) return { to: edge, seed: after, shut: false };
  const d = edgeDistance(blocked, plainDist);
  if (d[cat] >= FAR) {
    // Shut in: toward the most room.
    let best = open[0],
      most = -1;
    for (const y of open) {
      const score = room(blocked, y, cat) * 8 + NEIGHBOURS[y].filter((z) => !blocked[z]).length;
      if (score > most) {
        most = score;
        best = y;
      }
    }
    return { to: best, seed: after, shut: true };
  }
  const nearest = open.filter((y) => d[y] === d[cat] - 1);
  if (level === PLAIN) {
    // Now and then a wander to another open neighbour, by the cat's own sequence.
    const others = open.filter((y) => d[y] < FAR && !nearest.includes(y));
    if (others.length && (after >>> 8) % 4 === 0) return { to: others[(after >>> 12) % others.length], seed: after, shut: false };
    return { to: nearest[0], seed: after, shut: false };
  }
  if (level === WAYS) {
    let best = nearest[0],
      most = -1;
    for (const y of nearest) {
      const w = waysOn(blocked, y, d);
      if (w > most) {
        most = w;
        best = y;
      }
    }
    return { to: best, seed: after, shut: false };
  }
  const v = twoDistance(blocked, twoDist);
  let best = open[0],
    key = Infinity;
  for (const y of open) {
    if (d[y] >= FAR) continue;
    // Smallest two-distance, then smallest plain distance, then (SHREWD) the most ways on.
    const k = Math.min(v[y], FAR) * 64 * 8 + d[y] * 8 + (level === SHREWD ? 7 - Math.min(7, waysOn(blocked, y, d) + (v[y] < FAR ? waysOn(blocked, y, v) : 0)) : 0);
    if (k < key) {
      key = k;
      best = y;
    }
  }
  return { to: best, seed: after, shut: false };
}
/** Whether the cat at `cat` can still reach an edge hex. */
export function shutIn(blocked: ArrayLike<number>, cat: number) {
  return edgeDistance(blocked, plainDist)[cat] >= FAR;
}

/** A stage: how many blocks the field is laid with, how the cat thinks, and how far the search may look. */
export interface Stage {
  blocks: [number, number];
  cat: number;
  /** How widely and deeply the search looks for a way to shut the cat in. */
  reach: Reach;
}
export const STAGES: Stage[] = [
  { blocks: [16, 21], cat: PLAIN, reach: { width: 12, branch: 16, depth: 30 } },
  { blocks: [11, 14], cat: WAYS, reach: { width: 12, branch: 16, depth: 30 } },
  { blocks: [9, 12], cat: AHEAD, reach: { width: 12, branch: 16, depth: 30 } },
  { blocks: [7, 9], cat: SHREWD, reach: { width: 12, branch: 16, depth: 30 } },
  { blocks: [5, 7], cat: SHREWD, reach: { width: 12, branch: 16, depth: 30 } },
];
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));

/** Why a block of mine is refused, or null. */
export function refusal(state: State, move: Move) {
  if (state.winner !== null || move.from !== -1 || move.to < 0 || move.to >= CELLS) return null;
  if (move.to === state.cat) return "고양이가 있는 칸은 막을 수 없습니다.";
  if (state.blocked[move.to]) return "이미 막힌 칸입니다.";
  return null;
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = [];
  for (let i = 0; i < CELLS; i++) if (!state.blocked[i] && i !== state.cat) out.push({ from: -1, to: i, extra: -1 });
  return out;
}
/** My block at `move.to` and the cat's answer, by the rules above; null when the block is not allowed. */
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to)) return null;
  const b = move.to;
  if (b < 0 || b >= CELLS || state.blocked[b] || b === state.cat) return null;
  const blocked = [...state.blocked];
  blocked[b] = 1;
  const step = catStep(blocked, state.cat, state.seed, STAGES[state.stage - 1].cat),
    trapped = step.to < 0,
    to = trapped ? state.cat : step.to,
    escaped = !trapped && isEdge(to);
  return {
    ...state,
    blocked,
    mine: [...state.mine, b],
    cat: to,
    seed: step.seed,
    last: { block: b, from: state.cat, to, trapped, escaped },
    winner: trapped ? 0 : escaped ? 1 : null,
    trouble: escaped ? "고양이가 빠져나갔습니다." : "",
    ply: state.ply + 1,
  };
}

/*
 * The search: my blocks against the stage's cat, which is deterministic, so it is a search of one player. A field is
 * won once the cat is shut in (it can then be trapped at leisure). It is a beam search: from every position kept, each
 * block worth trying (a hex on or near the cat's shortest ways out) is played with the cat's answer, the positions
 * reached are judged (the cat's two-distance first, then its plain distance, then its ways on, all as seen with my
 * turn to come) and the best `width` of them, all different, are kept for the next block. It stops at the first
 * position with the cat shut in. Everything is in a fixed order, so the same field always gives the same way.
 */
const zobrist = Array.from({ length: CELLS }, (_, i) => {
  let x = Math.imul(i + 1, 2654435761);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return x >>> 0;
});
const fromCat = new Int16Array(CELLS),
  toEdge = new Int16Array(CELLS),
  /** Shortest ways counted from the cat and from the edge, for each hex. */
  waysFrom = new Float64Array(CELLS),
  waysTo = new Float64Array(CELLS);
/**
 * The blocks worth trying with the cat at `cat`: hexes within `slack` of a shortest way out, those on more of the
 * shortest ways and nearer the cat first, at most `limit`.
 */
function candidates(blocked: ArrayLike<number>, cat: number, limit: number, slack = 1) {
  edgeDistance(blocked, toEdge);
  distanceFrom(blocked, cat, fromCat);
  const D = toEdge[cat];
  if (D >= FAR) return [];
  // Counts of shortest ways: from the cat outward, and from the edge inward, along hexes of a shortest way.
  const on: number[] = [],
    near: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    if (blocked[i] || i === cat) continue;
    const length = fromCat[i] + toEdge[i];
    if (length === D) on.push(i);
    else if (length <= D + slack) near.push(i);
  }
  on.sort((a, b) => fromCat[a] - fromCat[b]);
  waysFrom.fill(0);
  waysTo.fill(0);
  waysFrom[cat] = 1;
  for (const x of on) for (const y of NEIGHBOURS[x]) if (fromCat[y] === fromCat[x] - 1 && fromCat[y] + toEdge[y] === D) waysFrom[x] += waysFrom[y];
  for (let k = on.length - 1; k >= 0; k--) {
    const x = on[k];
    if (toEdge[x] === 0) waysTo[x] = 1;
    else for (const y of NEIGHBOURS[x]) if (toEdge[y] === toEdge[x] - 1 && fromCat[y] === fromCat[x] + 1) waysTo[x] += waysTo[y];
  }
  let total = 0;
  for (const y of NEIGHBOURS[cat]) if (!blocked[y] && fromCat[y] + toEdge[y] === D) total += waysTo[y];
  const ranked = on
    .map((x) => ({ x, value: 1 + (waysFrom[x] * waysTo[x]) / (total || 1), near: fromCat[x] }))
    .concat(near.map((x) => ({ x, value: 0.5 / (fromCat[x] + 1), near: fromCat[x] + 0.5 })));
  ranked.sort((a, b) => b.value - a.value || a.near - b.near || a.x - b.x);
  return ranked.slice(0, limit).map((c) => c.x);
}
/** A position the search keeps: the field, the cat and its sequence, the blocks that led here, and its worth. */
interface Node {
  blocked: Uint8Array;
  cat: number;
  seed: number;
  hash: number;
  line: number[];
  worth: number;
}
/** How a stage's search looks: positions kept from block to block, blocks tried at each, and blocks at most. */
export interface Reach {
  width: number;
  branch: number;
  depth: number;
}
/**
 * A way to shut the cat in from this state: my blocks in order, against the stage's cat; [] when it is shut in
 * already, null when the search found none (or the game is over).
 */
export function solve(state: State, reach: Reach = STAGES[state.stage - 1].reach): number[] | null {
  if (state.winner !== null) return null;
  const level = STAGES[state.stage - 1].cat,
    root = Uint8Array.from(state.blocked);
  if (shutIn(root, state.cat)) return [];
  let hash = 0;
  for (let i = 0; i < CELLS; i++) if (root[i]) hash ^= zobrist[i];
  let beam: Node[] = [{ blocked: root, cat: state.cat, seed: state.seed, hash, line: [], worth: 0 }];
  const seenHash = new Set<number>();
  for (let depth = 0; depth < reach.depth && beam.length; depth++) {
    const next: Node[] = [];
    for (const node of beam) {
      const { blocked, cat, seed } = node;
      for (const b of candidates(blocked, cat, reach.branch)) {
        blocked[b] = 1;
        const step = catStep(blocked, cat, seed, level);
        if (step.shut) {
          blocked[b] = 0;
          return [...node.line, b];
        }
        if (!isEdge(step.to)) {
          // `catStep` left the plain distances for this field in `plainDist`; the two-distance is wanted too.
          const h = (node.hash ^ zobrist[b] ^ Math.imul(step.to + 1, 0x9e3779b1)) >>> 0;
          if (!seenHash.has(h)) {
            seenHash.add(h);
            const d = plainDist[step.to],
              v = twoDistance(blocked, twoDist)[step.to],
              ways = waysOn(blocked, step.to, plainDist);
            next.push({ blocked: blocked.slice(), cat: step.to, seed: step.seed, hash: h, line: [...node.line, b], worth: Math.min(v, 24) * 1000 + Math.min(d, 24) * 40 - ways * 6 - depth });
          }
        }
        blocked[b] = 0;
      }
    }
    next.sort((a, b) => b.worth - a.worth || a.hash - b.hash);
    beam = next.slice(0, reach.width);
  }
  return null;
}
/**
 * With the cat shut in, the block that leaves it the least room once it has answered (a block that traps it at once
 * first; then the hex nearest it, then the lowest): a choke point between it and most of its room is found so.
 */
function closing(state: State, blocked: Uint8Array) {
  const level = STAGES[state.stage - 1].cat,
    cat = state.cat;
  // The hexes it can still reach.
  const reach: number[] = [];
  distanceFrom(blocked, cat, fromCat);
  for (let i = 0; i < CELLS; i++) if (i !== cat && !blocked[i] && fromCat[i] < FAR) reach.push(i);
  const near = reach.map((i) => fromCat[i]);
  let best = reach[0],
    least = Infinity;
  reach.forEach((b, k) => {
    blocked[b] = 1;
    const step = catStep(blocked, cat, state.seed, level),
      left = step.to < 0 ? -1 : room(blocked, step.to, step.to),
      score = left * 1000 + near[k] * 10;
    blocked[b] = 0;
    if (score < least) {
      least = score;
      best = b;
    }
  });
  return best;
}
/** Ways found by hints, by the position they start from, so that a hint followed is followed on at once. */
const found = new Map<string, number[]>();
const keyOf = (state: State) => `${state.stage}:${state.cat}:${state.seed}:${state.blocked.join("")}`;
/**
 * The hint: a block that still shuts the cat in. While I have followed the plan the puzzle was laid with, its next
 * block; else a way the search finds (remembered for the next hint); once the cat is shut in, the hex it is about to
 * step to; and when no way is found, the block on its shortest ways that leaves it the fewest ways out. Null once
 * the puzzle is over (after a loss the way on is undo).
 */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const move = (to: number) => ({ from: -1, to, extra: -1 });
  const { plan, mine } = state;
  if (mine.length < plan.length && mine.every((b, i) => plan[i] === b)) return move(plan[mine.length]);
  const blocked = Uint8Array.from(state.blocked);
  if (shutIn(blocked, state.cat)) {
    return move(closing(state, blocked));
  }
  const key = keyOf(state),
    known = found.get(key);
  if (known?.length) return move(known[0]);
  const way = solve(state);
  if (way?.length) {
    // Each block of the way, with the cat's answer, leads to the next: remember them all.
    let s: State | null = state;
    for (let k = 0; k < way.length && s && s.winner === null; k++) {
      found.set(keyOf(s), way.slice(k));
      s = play(s, move(way[k]));
    }
    if (found.size > 400) found.delete(found.keys().next().value!);
    return move(way[0]);
  }
  // No way found: the block on its shortest ways after which the cat is furthest out, with the fewest ways out.
  let best = -1,
    score = -Infinity;
  for (const b of candidates(blocked, state.cat, 24)) {
    blocked[b] = 1;
    const d = edgeDistance(blocked, plainDist)[state.cat];
    const ways = d >= FAR ? 0 : NEIGHBOURS[state.cat].filter((y) => !blocked[y] && plainDist[y] === d - 1).length;
    const value = Math.min(d, 99) * 10 - ways;
    blocked[b] = 0;
    if (value > score) {
      score = value;
      best = b;
    }
  }
  if (best >= 0) return move(best);
  const open = NEIGHBOURS[state.cat].find((y) => !blocked[y]);
  return open === undefined ? null : move(open);
}

/** A field laid at random for a stage, before it is checked. */
export function lay(stage: number, random: Random): State {
  const spec = STAGES[stage - 1],
    count = spec.blocks[0] + Math.floor(random() * (spec.blocks[1] - spec.blocks[0] + 1)),
    blocked = new Array(CELLS).fill(0),
    near = new Set([MIDDLE, ...NEIGHBOURS[MIDDLE]]),
    given: number[] = [];
  while (given.length < count) {
    const cell = Math.floor(random() * CELLS);
    if (near.has(cell) || blocked[cell]) continue;
    blocked[cell] = 1;
    given.push(cell);
  }
  given.sort((a, b) => a - b);
  return {
    blocked,
    given,
    mine: [],
    cat: MIDDLE,
    seed: Math.floor(random() * 0x7fffffff),
    stage,
    plan: [],
    last: null,
    winner: null,
    ply: 0,
    trouble: "",
  };
}
/** How many fields are tried before the search's budget is given up on and the last field with a way is kept. */
const TRIES = 400;
/** A new puzzle of `stage` (1–5): a field the search has shut the cat in on, with that way as its `plan`. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const at = stageOf(stage);
  for (let k = 0; ; k++) {
    const state = lay(at, random),
      way = solve(state);
    if (way && way.length) return { ...state, plan: way };
    // Never reached in practice: past many fields, a more generous search.
    if (k >= TRIES) {
      const { reach } = STAGES[at - 1],
        generous = solve(state, { ...reach, width: reach.width * 4 });
      if (generous && generous.length) return { ...state, plan: generous };
    }
  }
}

const effect = (s: State): Effect | null => (s.last ? { kind: "place", from: -1, to: s.last.block, converted: [], removed: [] } : null);
export const trapCat: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => new Array(CELLS).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: (s) => (shutIn(s.blocked, s.cat) ? "고양이가 갇혔습니다 · 남은 칸을 막아 꼼짝 못 하게 하세요" : "빈 칸을 눌러 막으세요 · 고양이가 가장자리에 닿기 전에 가두세요"),
  tally: () => ["", ""],
  reason: (s) => (s.winner === 0 ? "성공! 고양이를 가두었습니다." : `실패! ${s.trouble}`),
};
