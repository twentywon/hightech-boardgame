import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * 2048: numbered tiles on a four by four board. A move slides every tile as
 * far as it goes one way; two equal tiles that meet become one of twice the
 * number, once a move. After each move a 2 (or, one time in ten, a 4)
 * appears on an empty square. Making 2048 wins; a full board with nothing
 * to join loses.
 */
export const N = 4,
  GOAL = 2048,
  UP = 0,
  RIGHT = 1,
  DOWN = 2,
  LEFT = 3;
export interface State {
  /** The sixteen squares, row by row from the far side; 0 is empty. */
  cells: number[];
  score: number;
  winner: Winner;
  /** What the last move did: where each tile went, which squares were joined, and where the new tile came. */
  last: { dir: number; slides: number[]; merged: number[]; spawn: number } | null;
  ply: number;
}
/** The squares of each line, from the edge the tiles slide toward. */
const lines = (dir: number) =>
  Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, k) => (dir === UP ? k * N + i : dir === DOWN ? (N - 1 - k) * N + i : dir === LEFT ? i * N + k : i * N + (N - 1 - k))),
  );
/** Slides and joins without adding a tile. */
export function slide(cells: number[], dir: number) {
  const out = Array(N * N).fill(0),
    slides = Array(N * N).fill(-1),
    merged: number[] = [];
  let gained = 0,
    moved = false;
  for (const line of lines(dir)) {
    let place = 0,
      joinable = false;
    for (const from of line) {
      const value = cells[from];
      if (!value) continue;
      if (joinable && out[line[place - 1]] === value) {
        // Joined with the tile before it; that one cannot be joined again in this move.
        const to = line[place - 1];
        out[to] = value * 2;
        gained += value * 2;
        merged.push(to);
        slides[from] = to;
        joinable = false;
      } else {
        const to = line[place++];
        out[to] = value;
        slides[from] = to;
        joinable = true;
      }
      if (slides[from] !== from) moved = true;
    }
  }
  return { cells: out, slides, merged, gained, moved };
}
function spawn(cells: number[], random: Random) {
  const empty = cells.flatMap((v, i) => (v ? [] : [i]));
  if (!empty.length) return -1;
  const at = empty[Math.floor(random() * empty.length)];
  cells[at] = random() < 0.9 ? 2 : 4;
  return at;
}
export function createGame(random: Random = cryptoRandom): State {
  const cells = Array(N * N).fill(0);
  spawn(cells, random);
  spawn(cells, random);
  return { cells, score: 0, winner: null, last: null, ply: 0 };
}
export const best = (state: State) => Math.max(...state.cells);
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : [UP, RIGHT, DOWN, LEFT].filter((dir) => slide(state.cells, dir).moved).map((to) => ({ from: -1, to, extra: -1 }));
export function play(state: State, move: Move, random: Random = cryptoRandom): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || ![UP, RIGHT, DOWN, LEFT].includes(move.to)) return null;
  const slid = slide(state.cells, move.to);
  if (!slid.moved) return null;
  const at = spawn(slid.cells, random),
    next: State = { cells: slid.cells, score: state.score + slid.gained, winner: null, last: { dir: move.to, slides: slid.slides, merged: slid.merged, spawn: at }, ply: state.ply + 1 };
  next.winner = slid.cells.some((v) => v >= GOAL) ? 0 : [UP, RIGHT, DOWN, LEFT].some((dir) => slide(slid.cells, dir).moved) ? null : 1;
  return next;
}
const effect = (): Effect | null => null;
export const merge: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => Array(N * N).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => s.score,
  // The score stands on its own card on the desk; the line over the table says only what to do.
  hint: () => "타일을 한쪽으로 밀어 같은 수끼리 합치세요.",
  tally: (s) => [`점수 ${s.score} · 가장 큰 수 ${best(s)}`, ""],
  reason: (s) => (s.winner === 0 ? `${GOAL}을 만들었습니다! 점수 ${s.score}.` : `더 밀 수 있는 곳이 없습니다. 가장 큰 수 ${best(s)}, 점수 ${s.score}.`),
};
