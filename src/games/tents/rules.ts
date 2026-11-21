import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Tents, an old logic puzzle: a field with trees, and a tent to be pitched
 * beside every tree. Each tent stands next to its own tree (above, below,
 * left or right of it), no two tents touch, not even at a corner, and the
 * numbers along the edges say how many tents each row and column holds. A
 * puzzle is laid from a random pitch of tents and trees and kept only when
 * its numbers leave one answer.
 */
export const EMPTY = 0,
  TENT = 1,
  /** A square the player has marked with an X (no tent; a tent tapped again), only as a help to themselves. */
  GRASS = 2;
export interface Stage {
  size: number;
  /** About how many tents, as a share of the squares. */
  share: number;
}
export const STAGES: Stage[] = [
  { size: 5, share: 0.2 },
  { size: 6, share: 0.2 },
  { size: 7, share: 0.2 },
  { size: 8, share: 0.19 },
  { size: 9, share: 0.19 },
];
export interface State {
  size: number;
  trees: boolean[];
  /** What the player has put on each square: nothing, a tent, or grass. */
  cells: number[];
  answer: boolean[];
  /** Tents in each row (top to bottom) and each column (left to right). */
  rows: number[];
  cols: number[];
  last: number | null;
  winner: Winner;
  ply: number;
}
const near4 = (size: number, i: number) => {
  const r = Math.floor(i / size),
    c = i % size;
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].flatMap(([y, x]) => (y >= 0 && y < size && x >= 0 && x < size ? [y * size + x] : []));
};
const near8 = (size: number, i: number) => {
  const r = Math.floor(i / size),
    c = i % size,
    out: number[] = [];
  for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) if ((y !== r || x !== c) && y >= 0 && y < size && x >= 0 && x < size) out.push(y * size + x);
  return out;
};
/** Whether every tree can be given a tent of its own beside it and every tent a tree (a matching found by augmenting paths). */
export function paired(size: number, trees: boolean[], tents: boolean[]) {
  const treeList = trees.flatMap((t, i) => (t ? [i] : [])),
    tentList = tents.flatMap((t, i) => (t ? [i] : []));
  if (treeList.length !== tentList.length) return false;
  const owner = new Map<number, number>();
  const take = (tent: number, seen: Set<number>): boolean => {
    for (const tree of near4(size, tent)) {
      if (!trees[tree] || seen.has(tree)) continue;
      seen.add(tree);
      const held = owner.get(tree);
      if (held === undefined || take(held, seen)) {
        owner.set(tree, tent);
        return true;
      }
    }
    return false;
  };
  return tentList.every((tent) => take(tent, new Set()));
}
/**
 * How many pitches of tents the trees and numbers allow (stopping at `cap`): rows are filled in turn with exactly
 * their number of tents, among squares beside a tree, apart from each other and from the row above, and a column
 * never holds more than its number; a full pitch must pair with the trees.
 */
export function solutions(size: number, trees: boolean[], rows: number[], cols: number[], cap = 2): number {
  const tents = new Array(size * size).fill(false),
    colCount = new Array(size).fill(0),
    open = trees.map((t, i) => !t && near4(size, i).some((j) => trees[j]));
  let found = 0;
  const fillRow = (r: number) => {
    if (found >= cap) return;
    if (r === size) {
      if (colCount.every((n, c) => n === cols[c]) && paired(size, trees, tents)) found++;
      return;
    }
    const pick = (c: number, left: number) => {
      if (found >= cap) return;
      if (left === 0) {
        // Columns that can no longer reach their number cut the search short.
        // A column holds at most every other square of the rows still to come.
        if (colCount.every((n, x) => cols[x] - n <= Math.ceil((size - r - 1) / 2))) fillRow(r + 1);
        return;
      }
      for (let x = c; x <= size - left; x++) {
        const i = r * size + x;
        if (!open[i] || colCount[x] >= cols[x] || near8(size, i).some((j) => tents[j])) continue;
        tents[i] = true;
        colCount[x]++;
        pick(x + 2, left - 1);
        tents[i] = false;
        colCount[x]--;
      }
    };
    pick(0, rows[r]);
  };
  fillRow(0);
  return found;
}
const shuffled = <X>(items: X[], random: Random) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
/** A puzzle of a stage (1 to 5) whose numbers leave one answer. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const { size, share } = STAGES[Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1)) - 1],
    n = size * size,
    want = Math.round(n * share);
  for (;;) {
    const tents = new Array(n).fill(false),
      trees = new Array(n).fill(false);
    let placed = 0;
    for (const i of shuffled(Array.from({ length: n }, (_, k) => k), random)) {
      if (placed >= want) break;
      if (trees[i] || near8(size, i).some((j) => tents[j])) continue;
      const spots = shuffled(near4(size, i), random).filter((j) => !trees[j] && !tents[j]);
      if (!spots.length) continue;
      tents[i] = true;
      trees[spots[0]] = true;
      placed++;
    }
    if (placed < want * 0.85) continue;
    const rows = Array.from({ length: size }, (_, r) => tents.slice(r * size, r * size + size).filter(Boolean).length),
      cols = Array.from({ length: size }, (_, c) => tents.filter((t, i) => t && i % size === c).length);
    if (solutions(size, trees, rows, cols) !== 1) continue;
    return { size, trees, cells: new Array(n).fill(EMPTY), answer: tents, rows, cols, last: null, winner: null, ply: 0 };
  }
}
/** Squares whose tent touches another tent (shown red). */
export const crowded = (state: Pick<State, "size" | "cells">) => state.cells.map((k, i) => k === TENT && near8(state.size, i).some((j) => state.cells[j] === TENT));
/** How a row's or column's number stands: met (green), passed (red) or still open. */
export function lineState(state: State, row: boolean, k: number): "open" | "done" | "over" {
  const want = row ? state.rows[k] : state.cols[k],
    have = state.cells.filter((c, i) => c === TENT && (row ? Math.floor(i / state.size) === k : i % state.size === k)).length;
  return have > want ? "over" : have === want ? "done" : "open";
}
const solved = (state: State) => state.cells.every((k, i) => (k === TENT) === state.answer[i]);
/** A tap or Enter: nothing → tent → X → nothing. A set move (`put`) puts a chosen mark, for the hint. */
export const SET = 1000,
  put = (cell: number, mark: number) => SET + cell * 3 + mark;
export const moves = (state: State): Move[] => (state.winner !== null ? [] : state.cells.flatMap((_, to) => (state.trees[to] ? [] : [{ from: -1, to, extra: -1 }])));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1 || move.from !== -1) return null;
  const cells = [...state.cells];
  let cell = move.to;
  if (move.to >= SET) {
    cell = Math.floor((move.to - SET) / 3);
    if (cell >= cells.length || state.trees[cell]) return null;
    cells[cell] = (move.to - SET) % 3;
  } else {
    if (!Number.isInteger(cell) || cell < 0 || cell >= cells.length || state.trees[cell]) return null;
    cells[cell] = (cells[cell] + 1) % 3;
  }
  if (cells[cell] === state.cells[cell]) return null;
  const next = { ...state, cells, last: cell, ply: state.ply + 1 };
  return { ...next, winner: solved(next) ? 0 : null };
}
/** A tent where none belongs is marked with an X; else a tent still missing is pitched. */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const wrong = state.cells.findIndex((k, i) => k === TENT && !state.answer[i]);
  if (wrong >= 0) return { from: -1, to: put(wrong, GRASS), extra: -1 };
  const missing = state.answer.findIndex((t, i) => t && state.cells[i] !== TENT);
  return missing < 0 ? null : { from: -1, to: put(missing, TENT), extra: -1 };
}
const effect = (): Effect | null => null;
export const tents: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.cells.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: () => "나무마다 옆에 텐트를 하나씩 · 텐트끼리는 닿지 않게 · 가장자리 숫자는 그 줄의 텐트 수",
  tally: () => ["", ""],
  reason: () => "성공! 텐트를 모두 쳤습니다.",
};
