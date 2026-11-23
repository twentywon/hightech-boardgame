import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The knight's journey: an old puzzle. A knight stands on a small board with
 * some squares missing and is to visit every square left exactly once, by
 * knight's moves (two squares one way and one to the side). A puzzle is laid
 * by letting a knight wander the board at random until it is stuck: the
 * squares it trod are the board, the ones it never reached are cut out, and
 * where it began is where the puzzle begins. So every puzzle can be solved.
 * The closed journey (asked for in the upgrade) must also end with one more
 * jump back onto the square it began on; its board is the wander cut short
 * where it stood a knight's move from its start, so it can be closed too.
 */
export interface Stage {
  cols: number;
  rows: number;
  /** The least share of the board the journey must cover. */
  fill: number;
  /** A closed journey: the knight must come home to its first square at the end. */
  closed?: boolean;
}
/** The open journeys by value: the first five as always, then 7×7 and 8×8 (values 6 and 7, added in the upgrade). */
export const STAGES: Stage[] = [
  { cols: 3, rows: 4, fill: 0.9 },
  { cols: 4, rows: 4, fill: 0.75 },
  { cols: 4, rows: 5, fill: 0.85 },
  { cols: 5, rows: 5, fill: 0.88 },
  { cols: 6, rows: 6, fill: 0.9 },
  { cols: 7, rows: 7, fill: 0.9 },
  { cols: 8, rows: 8, fill: 0.92 },
];
/** The closed journeys, values after the open ones. */
export const CLOSED: Stage[] = [
  { cols: 5, rows: 6, fill: 0.8, closed: true },
  { cols: 6, rows: 6, fill: 0.85, closed: true },
  { cols: 8, rows: 8, fill: 0.85, closed: true },
];
export const STAGE_COUNT = STAGES.length + CLOSED.length;
/** A stage from its value (1 to the last closed one). */
export function stageOf(value: number): Stage {
  const v = Math.max(1, Math.min(STAGE_COUNT, Math.round(value) || 1));
  return v > STAGES.length ? CLOSED[v - STAGES.length - 1] : STAGES[v - 1];
}
export interface State {
  cols: number;
  rows: number;
  /** Which squares are part of the board. */
  open: boolean[];
  /** The squares visited, in order; the first is where the knight began, the last where it stands (the first again when a closed journey is done). */
  path: number[];
  /** A closed journey (absent in the open ones). */
  closed?: boolean;
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
const openCount = (state: Pick<State, "open">) => state.open.filter(Boolean).length;
/** Where the knight may go next: open squares not yet visited, a knight's move away; in a closed journey with every square trodden, its first square. */
export function nextSquares(state: Pick<State, "cols" | "rows" | "open" | "path" | "closed">) {
  const here = state.path[state.path.length - 1],
    seen = new Set(state.path),
    reach = jumps(state.cols, state.rows, here);
  if (state.closed && seen.size === openCount(state)) return state.path.length > openCount(state) ? [] : reach.filter((cell) => cell === state.path[0]);
  return reach.filter((cell) => state.open[cell] && !seen.has(cell));
}
export const moves = (state: State): Move[] => (state.winner !== null ? [] : nextSquares(state).map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !nextSquares(state).includes(move.to)) return null;
  const path = [...state.path, move.to],
    next = { ...state, path, last: move.to, ply: state.ply + 1 },
    done = path.length === openCount(state) + (state.closed ? 1 : 0);
  // Every square visited (and, closed, home again) is a win; a knight with nowhere left to go is stuck, and is taken back with undo.
  return { ...next, winner: done ? 0 : nextSquares(next).length === 0 ? 1 : null };
}
/**
 * The rest of a journey from where the knight stands, or null when there is none: a search that tries first the
 * square with the fewest ways on (Warnsdorff's rule), giving up after a number of steps. A closed journey must end a
 * knight's move from its first square, and the way home is the last step given.
 */
export function solve(state: Pick<State, "cols" | "rows" | "open" | "path" | "closed">, limit = 60000): number[] | null {
  const { cols, rows, open } = state,
    total = open.filter(Boolean).length,
    start = state.path[0],
    seen = new Set(state.path),
    path: number[] = [];
  if (state.closed && seen.size === total) return nextSquares(state).length ? [start] : state.path.length > total ? [] : null;
  let steps = 0,
    order = 0;
  const near = open.map((isOpen, cell) => (isOpen ? jumps(cols, rows, cell).filter((c) => open[c]) : [])),
    onward = (cell: number) => near[cell].filter((c) => !seen.has(c)),
    home = new Set(state.closed ? near[start] : []),
    middle = ((cols - 1) / 2) ** 2 + ((rows - 1) / 2) ** 2,
    outer = (cell: number) => middle - (((cell % cols) - (cols - 1) / 2) ** 2 + ((Math.floor(cell / cols) - (rows - 1) / 2) ** 2)),
    /** Ties broken differently on each of four tries: nearer the edge, nearer the middle, in reading order, backward. */
    tie = (a: number, b: number) => [outer(a) - outer(b), outer(b) - outer(a), a - b, b - a][order];
  /** Whether the squares left can still all be joined from `here`: none cut off, and at most one dead end, which must be the last (beside home when closed). */
  const hopeful = (here: number) => {
    let ends = 0;
    for (let u = 0; u < open.length; u++) {
      if (!open[u] || seen.has(u)) continue;
      const ways = onward(u).length + (near[u].includes(here) ? 1 : 0);
      if (ways === 0) return false;
      if (ways === 1 && (++ends > 1 || (state.closed && !home.has(u)))) return false;
    }
    return true;
  };
  const go = (here: number): boolean => {
    if (seen.size === total) return !state.closed || home.has(here);
    if (++steps > limit / 4 || !hopeful(here)) return false;
    // Fewest ways on first; closed, a square beside home is kept for the end where there is a choice; then by the order of this try.
    const next = onward(here).sort((a, b) => onward(a).length - onward(b).length || (home.has(a) ? 1 : 0) - (home.has(b) ? 1 : 0) || tie(a, b));
    for (const cell of next) {
      seen.add(cell);
      path.push(cell);
      if (go(cell)) return true;
      seen.delete(cell);
      path.pop();
    }
    return false;
  };
  // Four tries, each with a quarter of the steps, that break ties another way: one that strays far is cut short.
  for (order = 0; order < 4; order++) {
    steps = 0;
    if (go(state.path[state.path.length - 1])) return state.closed ? [...path, start] : path;
  }
  return null;
}
/** A puzzle of a stage: a knight's random wander, long enough, whose untrodden squares are cut out (closed: cut short where it could jump home). */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const { cols, rows, fill, closed } = stageOf(stage),
    n = cols * rows,
    need = Math.ceil(n * fill);
  // A board the hint's search cannot travel from its start is laid again (every board can be travelled: the wander
  // did it, but the search gives up after so many steps). The first one almost always does.
  for (let round = 0; ; round++) {
    const state = lay(cols, rows, need, !!closed, random);
    if (round >= 20 || solve(state)) return state;
  }
}
function lay(cols: number, rows: number, need: number, closed: boolean, random: Random): State {
  const n = cols * rows;
  let best: number[] = [];
  for (let attempt = 0; attempt < 400 && best.length < (closed ? n : need); attempt++) {
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
    if (closed) {
      // The longest stretch from the start that ends a knight's move from it: those squares can be travelled round.
      const home = new Set(jumps(cols, rows, path[0]));
      let end = path.length;
      while (end > 2 && !home.has(path[end - 1])) end--;
      if (end > best.length && end >= 4 && home.has(path[end - 1])) best = path.slice(0, end);
    } else if (path.length > best.length) best = path;
  }
  const open = new Array<boolean>(n).fill(false);
  for (const cell of best) open[cell] = true;
  return { cols, rows, open, path: [best[0]], ...(closed ? { closed: true } : {}), last: null, winner: null, ply: 0 };
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
  hint: (s) => (s.closed ? "모든 칸을 한 번씩 밟고 출발점으로 돌아오세요" : "나이트로 모든 칸을 한 번씩만 밟으세요"),
  tally: () => ["", ""],
  reason: (s) =>
    s.winner === 0
      ? s.closed
        ? "성공! 모든 칸을 밟고 출발점으로 돌아왔습니다."
        : "성공! 모든 칸을 한 번씩 밟았습니다."
      : s.closed && new Set(s.path).size === openCount(s)
        ? "실패! 출발점으로 돌아갈 수 없습니다."
        : "실패! 더 갈 수 있는 칸이 없습니다.",
};
