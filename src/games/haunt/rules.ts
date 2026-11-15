import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The haunted mirror maze, an old logic puzzle (also called Undead). Some
 * squares of the board hold a two-sided mirror, set corner to corner; every
 * other square hides one monster: a ghost, a vampire or a zombie. How many
 * of each there are is told. A number at the edge says how many monsters
 * are seen looking in from there, along a line that turns at every mirror.
 * A ghost is seen only in a mirror (after the line has turned), a vampire
 * only directly (before it has turned), a zombie always; a monster seen
 * twice is counted twice. A puzzle is laid by placing mirrors and monsters
 * at random and counting, and is kept only if its numbers leave one answer,
 * with some monsters shown on the easier stages.
 */
export const EMPTY = 0,
  GHOST = 1,
  VAMPIRE = 2,
  ZOMBIE = 3;
/** No mirror, a mirror like "\" and a mirror like "/". */
export const NONE = 0,
  BACK = 1,
  FORE = 2;
export interface Stage {
  size: number;
  /** The share of squares that hold a mirror. */
  mirrors: number;
  /** How many monsters are shown from the start. */
  shown: number;
}
export const STAGES: Stage[] = [
  { size: 4, mirrors: 0.32, shown: 2 },
  { size: 4, mirrors: 0.3, shown: 0 },
  { size: 5, mirrors: 0.3, shown: 1 },
  { size: 5, mirrors: 0.28, shown: 0 },
  { size: 6, mirrors: 0.28, shown: 0 },
];
export interface State {
  size: number;
  mirror: number[];
  /** What the player has put on each square (EMPTY where nothing yet or a mirror). */
  cells: number[];
  /** Monsters shown from the start, which stay. */
  fixed: boolean[];
  answer: number[];
  /** Ghosts, vampires and zombies in all. */
  totals: [number, number, number];
  /** The numbers round the edge: top (left to right), right (top to bottom), bottom (left to right), left (top to bottom). */
  clues: number[];
  last: number | null;
  winner: Winner;
  ply: number;
}
/** One square a line of sight passes, and whether it has turned at a mirror before reaching it. */
export interface Sight {
  cell: number;
  turned: boolean;
}
/** Where line `k` of the 4n round the edge comes in, and which way it then goes. */
function entry(size: number, k: number) {
  const side = Math.floor(k / size),
    i = k % size;
  if (side === 0) return { r: 0, c: i, dr: 1, dc: 0 };
  if (side === 1) return { r: i, c: size - 1, dr: 0, dc: -1 };
  if (side === 2) return { r: size - 1, c: i, dr: -1, dc: 0 };
  return { r: i, c: 0, dr: 0, dc: 1 };
}
/** The squares line `k` passes, in order, mirrors left out. */
export function sightline(size: number, mirror: number[], k: number): Sight[] {
  let { r, c, dr, dc } = entry(size, k),
    turned = false;
  const out: Sight[] = [];
  for (let steps = 0; steps < size * size * 4 && r >= 0 && r < size && c >= 0 && c < size; steps++) {
    const cell = r * size + c,
      m = mirror[cell];
    if (m === BACK) {
      [dr, dc] = [dc, dr];
      turned = true;
    } else if (m === FORE) {
      [dr, dc] = [-dc, -dr];
      turned = true;
    } else out.push({ cell, turned });
    r += dr;
    c += dc;
  }
  return out;
}
const seenOn = (kind: number, turned: boolean) => kind === ZOMBIE || (kind === GHOST && turned) || (kind === VAMPIRE && !turned);
/** How many monsters line `k` sees, with the board's monsters as `cells`. */
export function count(size: number, mirror: number[], cells: number[], k: number) {
  return sightline(size, mirror, k).filter((s) => seenOn(cells[s.cell], s.turned)).length;
}
/** The number every line sees. */
export const counts = (state: Pick<State, "size" | "mirror">, cells: number[]) => Array.from({ length: state.size * 4 }, (_, k) => count(state.size, state.mirror, cells, k));
/**
 * How many answers the numbers and totals leave (stopping at `cap`), with `known` squares already settled: a search
 * square by square that keeps every line's count within reach of its number.
 */
export function solutions(size: number, mirror: number[], clues: number[], totals: number[], known: number[] = [], cap = 2): number {
  const lines = Array.from({ length: size * 4 }, (_, k) => sightline(size, mirror, k)),
    // For each square, the lines through it and whether turned there (a square may be passed more than once).
    through: { line: number; turned: boolean }[][] = Array.from({ length: size * size }, () => []);
  lines.forEach((line, k) => line.forEach((s) => through[s.cell].push({ line: k, turned: s.turned })));
  const free = Array.from({ length: size * size }, (_, i) => i).filter((i) => mirror[i] === NONE),
    fixedCount = new Array(lines.length).fill(0),
    open = lines.map((line) => line.length),
    left = [...totals],
    cells = new Array(size * size).fill(EMPTY);
  const apply = (cell: number, kind: number, sign: number) => {
    cells[cell] = sign > 0 ? kind : EMPTY;
    left[kind - 1] -= sign;
    for (const { line, turned } of through[cell]) {
      open[line] -= sign;
      if (seenOn(kind, turned)) fixedCount[line] += sign;
    }
  };
  const fine = (cell: number) => through[cell].every(({ line }) => fixedCount[line] <= clues[line] && fixedCount[line] + open[line] >= clues[line]) && left.every((n) => n >= 0);
  const order = free.filter((i) => !known[i]).sort((a, b) => through[b].length - through[a].length);
  for (const i of free) if (known[i]) apply(i, known[i], 1);
  if (!free.every((i) => !known[i] || fine(i))) return 0;
  let found = 0;
  const go = (n: number) => {
    if (found >= cap) return;
    if (n === order.length) {
      if (left.every((x) => x === 0) && fixedCount.every((x, k) => x === clues[k])) found++;
      return;
    }
    const cell = order[n];
    for (const kind of [GHOST, VAMPIRE, ZOMBIE]) {
      if (left[kind - 1] <= 0) continue;
      apply(cell, kind, 1);
      if (fine(cell)) go(n + 1);
      apply(cell, kind, -1);
    }
  };
  go(0);
  return found;
}
const solved = (s: State) => s.cells.every((k, i) => s.mirror[i] !== NONE || k !== EMPTY) && counts(s, s.cells).every((n, k) => n === s.clues[k]) && [GHOST, VAMPIRE, ZOMBIE].every((kind) => s.cells.filter((k) => k === kind).length === s.totals[kind - 1]);
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : state.cells.flatMap((_, to) => (state.mirror[to] === NONE && !state.fixed[to] ? [{ from: -1, to, extra: -1 }] : []));
/**
 * Moves that a hand makes by dragging: a monster set on a square (`put(cell, kind)`, from the row in front of the
 * board when `from` is −1, or carried off another square `from`), and a monster carried off the board (`REMOVE`).
 */
export const REMOVE = 999,
  SET = 1000,
  put = (cell: number, kind: number) => SET + cell * 4 + kind;
const free = (state: State, cell: number) => Number.isInteger(cell) && cell >= 0 && cell < state.cells.length && state.mirror[cell] === NONE && !state.fixed[cell];
/**
 * A monster dragged onto a square takes its place (whatever stood there goes); one dragged off a square leaves it
 * empty. The keyboard turns a square over instead (`to` the square itself): nothing, ghost, vampire, zombie, nothing.
 */
export function play(state: State, move: Move): State | null {
  const { from, to } = move;
  if (state.winner !== null || move.extra !== -1 || !Number.isInteger(to)) return null;
  const cells = [...state.cells];
  let last: number;
  if (to >= SET) {
    const cell = Math.floor((to - SET) / 4),
      kind = (to - SET) % 4;
    if (!free(state, cell) || kind === 0 || (from !== -1 && (!free(state, from) || state.cells[from] !== kind))) return null;
    if (from !== -1) cells[from] = 0;
    cells[cell] = kind;
    last = cell;
  } else if (to === REMOVE) {
    if (!free(state, from) || !state.cells[from]) return null;
    cells[from] = 0;
    last = from;
  } else {
    if (from !== -1 || !free(state, to)) return null;
    cells[to] = (cells[to] + 1) % 4;
    last = to;
  }
  if (cells.every((k, i) => k === state.cells[i])) return null;
  const next = { ...state, cells, last, ply: state.ply + 1 };
  return { ...next, winner: solved(next) ? 0 : null };
}
/** A puzzle of a stage (1 to 5) whose numbers leave one answer. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const { size, mirrors, shown } = STAGES[Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1)) - 1],
    n = size * size;
  for (let attempt = 0; ; attempt++) {
    const mirror = Array.from({ length: n }, () => (random() < mirrors ? (random() < 0.5 ? BACK : FORE) : NONE)),
      answer = mirror.map((m) => (m === NONE ? 1 + (Math.floor(random() * 3) % 3) : EMPTY)),
      free = answer.filter((k) => k !== EMPTY).length;
    // Some of each kind, and every square seen by some line.
    const totals = [GHOST, VAMPIRE, ZOMBIE].map((kind) => answer.filter((k) => k === kind).length) as [number, number, number];
    if (free < n * 0.55 || totals.some((t) => t === 0)) continue;
    const lines = Array.from({ length: size * 4 }, (_, k) => sightline(size, mirror, k));
    if (!mirror.every((m, i) => m !== NONE || lines.some((line) => line.some((s) => s.cell === i)))) continue;
    const clues = counts({ size, mirror }, answer);
    // Shown monsters first make the puzzle easier; if the numbers alone leave more than one answer, more are shown.
    const known = new Array(n).fill(EMPTY),
      cells = answer.map((_, i) => i).filter((i) => answer[i] !== EMPTY);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)) % (i + 1);
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    let shownCount = 0;
    for (const cell of cells.slice(0, shown)) {
      known[cell] = answer[cell];
      shownCount++;
    }
    let ways = solutions(size, mirror, clues, totals, known);
    while (ways > 1 && shownCount < shown + 2 && attempt > 30) {
      const cell = cells[shownCount++];
      known[cell] = answer[cell];
      ways = solutions(size, mirror, clues, totals, known);
    }
    if (ways !== 1) continue;
    const fixed = known.map((k) => k !== EMPTY);
    return { size, mirror, cells: [...known], fixed, answer, totals, clues, last: null, winner: null, ply: 0 };
  }
}
/** A square that is wrong or empty, and the monster that belongs there (dragged from the row in front). */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const cell = state.cells.findIndex((k, i) => state.mirror[i] === NONE && !state.fixed[i] && k !== state.answer[i]);
  return cell < 0 ? null : { from: -1, to: put(cell, state.answer[cell]), extra: -1 };
}
export const NAMES = ["", "유령", "뱀파이어", "좀비"];
const effect = (): Effect | null => null;
export const haunt: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.cells.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: (s) => `앞줄의 괴물을 칸으로 끌어다 놓으세요 · 유령 ${s.totals[0]} · 뱀파이어 ${s.totals[1]} · 좀비 ${s.totals[2]}`,
  tally: () => ["", ""],
  reason: () => "성공! 괴물을 모두 찾았습니다.",
};
