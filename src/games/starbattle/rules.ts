import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Star Battle, a logic puzzle: an n × n grid cut into n regions. A star goes
 * into every row, every column and every region, once each, and no two stars
 * touch, not even at a corner. A puzzle is laid from a random placing of the
 * stars, with a region grown round each at random, and kept only when the
 * regions leave one answer.
 */
export const EMPTY = 0,
  STAR = 1,
  /** A square the player has marked as having no star, only as a help to themselves. */
  DOT = 2;
export const STAGES = [5, 6, 7, 8, 9];
export interface State {
  size: number;
  /** The region of each square, 0 to n − 1. */
  region: number[];
  cells: number[];
  /** The answer: the star's column in each row. */
  answer: number[];
  last: number | null;
  winner: Winner;
  ply: number;
}
const shuffled = <X>(items: X[], random: Random) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
/** A star's column for every row, one a column, rows next to each other never in columns next to each other. */
function placing(n: number, random: Random): number[] {
  const cols: number[] = [],
    used = new Array(n).fill(false);
  const go = (r: number): boolean => {
    if (r === n) return true;
    for (const c of shuffled(Array.from({ length: n }, (_, i) => i), random)) {
      if (used[c] || (r > 0 && Math.abs(cols[r - 1] - c) < 2)) continue;
      used[c] = true;
      cols[r] = c;
      if (go(r + 1)) return true;
      used[c] = false;
    }
    return false;
  };
  go(0);
  return cols;
}
/** Regions grown at random from each star until every square belongs to one. */
function grow(n: number, stars: number[], random: Random): number[] {
  const region = new Array(n * n).fill(-1);
  stars.forEach((c, r) => (region[r * n + c] = r));
  let left = n * n - n;
  while (left > 0) {
    const r = Math.floor(random() * n) % n,
      // A square of this region beside one that belongs to none.
      edge = region.flatMap((g, i) => (g !== r ? [] : near4(n, i).filter((j) => region[j] < 0)));
    if (!edge.length) continue;
    region[edge[Math.floor(random() * edge.length) % edge.length]] = r;
    left--;
  }
  return region;
}
const near4 = (n: number, i: number) => {
  const r = Math.floor(i / n),
    c = i % n;
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].flatMap(([y, x]) => (y >= 0 && y < n && x >= 0 && x < n ? [y * n + x] : []));
};
/**
 * Placings the regions allow, row by row (a column and a region not yet used, apart from the row above): how many
 * (stopping at `cap`), and the first found that differs from `except`.
 */
function search(n: number, region: number[], cap: number, except?: number[]) {
  const usedCol = new Array(n).fill(false),
    usedRegion = new Array(n).fill(false),
    cols: number[] = [];
  let found = 0,
    other: number[] | null = null;
  const go = (r: number) => {
    if (found >= cap) return;
    if (r === n) {
      found++;
      if (!other && except && cols.some((c, i) => c !== except[i])) other = [...cols];
      return;
    }
    for (let c = 0; c < n; c++) {
      const g = region[r * n + c];
      if (usedCol[c] || usedRegion[g] || (r > 0 && Math.abs(cols[r - 1] - c) < 2)) continue;
      usedCol[c] = usedRegion[g] = true;
      cols[r] = c;
      go(r + 1);
      usedCol[c] = usedRegion[g] = false;
    }
  };
  go(0);
  return { found, other: other as number[] | null };
}
export const solutions = (n: number, region: number[], cap = 2) => search(n, region, cap).found;
/** Whether every square of region `g` can be reached from every other through the region. */
function whole(n: number, region: number[], g: number) {
  const cells = region.flatMap((x, i) => (x === g ? [i] : []));
  if (!cells.length) return false;
  const seen = new Set([cells[0]]),
    queue = [cells[0]];
  while (queue.length) for (const j of near4(n, queue.pop()!)) if (region[j] === g && !seen.has(j)) seen.add(j), queue.push(j);
  return seen.size === cells.length;
}
/**
 * Mends regions that leave more than one answer: a star of another answer that the true one does not use is handed
 * to a neighbouring region (keeping both regions in one piece), until only the true answer is left.
 */
function mend(n: number, region: number[], answer: number[], random: Random) {
  const stars = new Set(answer.map((c, r) => r * n + c));
  for (let tries = 0; tries < 60; tries++) {
    const { found, other } = search(n, region, 2, answer);
    if (found === 1) return true;
    if (!other) return false;
    const loose = shuffled(other.map((c, r) => r * n + c).filter((i) => !stars.has(i)), random);
    let mended = false;
    for (const cell of loose) {
      const from = region[cell];
      for (const j of shuffled(near4(n, cell), random)) {
        const to = region[j];
        if (to === from) continue;
        region[cell] = to;
        if (whole(n, region, from)) {
          mended = true;
          break;
        }
        region[cell] = from;
      }
      if (mended) break;
    }
    if (!mended) return false;
  }
  return false;
}
/** A puzzle of a stage (1 to 5) whose regions leave one answer. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const n = STAGES[Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1)) - 1];
  for (;;) {
    const answer = placing(n, random),
      region = grow(n, answer, random);
    if (mend(n, region, answer, random)) return { size: n, region, cells: new Array(n * n).fill(EMPTY), answer, last: null, winner: null, ply: 0 };
  }
}
/** Stars that break a rule: a second star in a row, column or region, or a star touching another (shown red). */
export function clashes(state: Pick<State, "size" | "region" | "cells">) {
  const n = state.size,
    stars = state.cells.flatMap((k, i) => (k === STAR ? [i] : []));
  return state.cells.map((k, i) => {
    if (k !== STAR) return false;
    const r = Math.floor(i / n),
      c = i % n;
    return stars.some((j) => {
      if (j === i) return false;
      const rr = Math.floor(j / n),
        cc = j % n;
      return rr === r || cc === c || state.region[j] === state.region[i] || (Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1);
    });
  });
}
const solved = (state: State) => state.cells.every((k, i) => (k === STAR) === (state.answer[Math.floor(i / state.size)] === i % state.size));
/** A tap or Enter: nothing → star → dot → nothing. A set move (`put`) puts a chosen mark, for the hint. */
export const SET = 1000,
  put = (cell: number, mark: number) => SET + cell * 3 + mark;
export const moves = (state: State): Move[] => (state.winner !== null ? [] : state.cells.map((_, to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1 || move.from !== -1) return null;
  const cells = [...state.cells];
  let cell = move.to;
  if (move.to >= SET) {
    cell = Math.floor((move.to - SET) / 3);
    if (cell >= cells.length) return null;
    cells[cell] = (move.to - SET) % 3;
  } else {
    if (!Number.isInteger(cell) || cell < 0 || cell >= cells.length) return null;
    cells[cell] = (cells[cell] + 1) % 3;
  }
  if (cells[cell] === state.cells[cell]) return null;
  const next = { ...state, cells, last: cell, ply: state.ply + 1 };
  return { ...next, winner: solved(next) ? 0 : null };
}
/** A star where none belongs is marked with a dot; else a star still missing is set. */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const n = state.size,
    wrong = state.cells.findIndex((k, i) => k === STAR && state.answer[Math.floor(i / n)] !== i % n);
  if (wrong >= 0) return { from: -1, to: put(wrong, DOT), extra: -1 };
  const row = state.answer.findIndex((c, r) => state.cells[r * n + c] !== STAR);
  return row < 0 ? null : { from: -1, to: put(row * n + state.answer[row], STAR), extra: -1 };
}
const effect = (): Effect | null => null;
export const starBattle: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.cells.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: () => "가로줄·세로줄·색 구역마다 별 하나씩 · 별끼리는 대각선으로도 닿지 않게",
  tally: () => ["", ""],
  reason: () => "성공! 별을 모두 찾았습니다.",
};
