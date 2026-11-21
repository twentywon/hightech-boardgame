import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The knight's journey: an old puzzle. A knight stands on a small board with
 * some squares missing and is to visit every square left exactly once, by
 * knight's moves (two squares one way and one to the side). A puzzle is laid
 * by letting a knight wander the board at random until it is stuck: the
 * squares it trod are the board, the ones it never reached are cut out, and
 * where it began is where the puzzle begins. So every puzzle can be solved.
 */
export interface Stage {
  cols: number;
  rows: number;
  /** The least share of the board the journey must cover. */
  fill: number;
}
export const STAGES: Stage[] = [
  { cols: 3, rows: 4, fill: 0.9 },
  { cols: 4, rows: 4, fill: 0.75 },
  { cols: 4, rows: 5, fill: 0.85 },
  { cols: 5, rows: 5, fill: 0.88 },
  { cols: 6, rows: 6, fill: 0.9 },
];
export interface State {
  cols: number;
  rows: number;
  /** Which squares are part of the board. */
  open: boolean[];
  /** The squares visited, in order; the first is where the knight began, the last where it stands. */
  path: number[];
  last: number | null;
  winner: Winner;
  ply: number;
}
const JUMPS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
/** The squares a knight on `cell` can reach on a board of `cols` by `rows`. */
export function jumps(cols: number, rows: number, cell: number) {
  const r = Math.floor(cell / cols),
    c = cell % cols,
    out: number[] = [];
  for (const [dr, dc] of JUMPS) {
    const rr = r + dr,
      cc = c + dc;
    if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
  }
  return out;
}
/** Where the knight may go next: open squares not yet visited, a knight's move away. */
export function nextSquares(state: Pick<State, "cols" | "rows" | "open" | "path">) {
  const here = state.path[state.path.length - 1],
    seen = new Set(state.path);
  return jumps(state.cols, state.rows, here).filter((cell) => state.open[cell] && !seen.has(cell));
}
const openCount = (state: Pick<State, "open">) => state.open.filter(Boolean).length;
export const moves = (state: State): Move[] => (state.winner !== null ? [] : nextSquares(state).map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !nextSquares(state).includes(move.to)) return null;
  const path = [...state.path, move.to],
    next = { ...state, path, last: move.to, ply: state.ply + 1 },
    done = path.length === openCount(state);
  // Every square visited is a win; a knight with nowhere left to go is stuck, and is taken back with undo.
  return { ...next, winner: done ? 0 : nextSquares(next).length === 0 ? 1 : null };
}
/**
 * The rest of a journey from where the knight stands, or null when there is none: a search that tries first the
 * square with the fewest ways on (Warnsdorff's rule), giving up after a number of steps.
 */
export function solve(state: Pick<State, "cols" | "rows" | "open" | "path">, limit = 60000): number[] | null {
  const { cols, rows, open } = state,
    total = open.filter(Boolean).length,
    seen = new Set(state.path),
    path: number[] = [];
  let steps = 0;
  const onward = (cell: number) => jumps(cols, rows, cell).filter((c) => open[c] && !seen.has(c));
  const go = (here: number): boolean => {
    if (seen.size === total) return true;
    if (++steps > limit) return false;
    const next = onward(here).sort((a, b) => onward(a).length - onward(b).length);
    for (const cell of next) {
      seen.add(cell);
      path.push(cell);
      if (go(cell)) return true;
      seen.delete(cell);
      path.pop();
    }
    return false;
  };
  return go(state.path[state.path.length - 1]) ? path : null;
}
/** A puzzle of a stage (1 to 5): a knight's random wander, long enough, whose untrodden squares are cut out. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const { cols, rows, fill } = STAGES[Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1)) - 1],
    n = cols * rows,
    need = Math.ceil(n * fill);
  let best: number[] = [];
  for (let attempt = 0; attempt < 400 && best.length < need; attempt++) {
    const path = [Math.floor(random() * n) % n],
      seen = new Set(path);
    for (;;) {
      const here = path[path.length - 1],
        next = jumps(cols, rows, here).filter((c) => !seen.has(c));
      if (!next.length) break;
      // Mostly toward the square with the fewest ways on, now and then anywhere, so that walks differ.
      const ways = (c: number) => jumps(cols, rows, c).filter((d) => !seen.has(d) && d !== c).length;
      next.sort((a, b) => ways(a) - ways(b));
      const pick = random() < 0.75 ? next[0] : next[Math.floor(random() * next.length) % next.length];
      path.push(pick);
      seen.add(pick);
    }
    if (path.length > best.length) best = path;
  }
  const open = new Array<boolean>(n).fill(false);
  for (const cell of best) open[cell] = true;
  return { cols, rows, open, path: [best[0]], last: null, winner: null, ply: 0 };
}
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const rest = solve(state);
  return rest?.length ? { from: -1, to: rest[0], extra: -1 } : null;
}
const effect = (): Effect | null => null;
export const knight: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.open.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => s.path.length,
  hint: () => "나이트로 모든 칸을 한 번씩만 밟으세요",
  tally: () => ["", ""],
  reason: (s) => (s.winner === 0 ? "성공! 모든 칸을 한 번씩 밟았습니다." : "실패! 더 갈 수 있는 칸이 없습니다."),
};
