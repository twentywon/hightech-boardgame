import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Train tracks, the old logic puzzle: a square of cells on a model railway's baseboard, an entrance on its left edge
 * and an exit on its bottom edge (or the other way round). One railway runs from the entrance to the exit through
 * some of the cells, each holding a straight (north–south or east–west) or a curve (NE, NW, SE, SW); it never
 * branches, crosses itself or closes a loop. The numbers over the columns and beside the rows say how many cells of
 * each the railway passes. Some pieces are given (the entrance's and the exit's always). A puzzle is a random
 * self-avoiding path, kept with as many given pieces as it takes for one answer only.
 *
 * Cells are numbered row by row from the top left (`r * size + c`). What lies in a cell is a mask of the sides its
 * rails run to (N 1, E 2, S 4, W 8); `links` holds them for the whole board and is always symmetric (a link from a
 * cell to its neighbour is a bit on both), except that the two port cells also carry the bit of their outer side.
 *
 * Moves (every one goes through `play`):
 * - `{from: -1, to: cell, extra: -1}`, a tap: marks a cell as having no track, or takes the mark off. A cell with
 *   rails or a given piece cannot be marked.
 * - `{from: a, to: b, extra: -1}`, b beside a: toggles the link between them (a drag from a into b, the keyboard's
 *   Shift+arrow, the hint). A link cannot be laid into a marked cell or a cell that has two already, and a given
 *   piece's links cannot be lifted.
 * - `{from: a, to: STROKE, extra: code}`, a drag that runs on over several cells: `code` is its steps from `a`, a
 *   leading 1 and then one base-4 digit a step (N 0, E 1, S 2, W 3; `stroke`, `strokeSteps`), at most
 *   `MAX_STROKE`. Its first step that can change something lays or lifts as a single link would (steps along a
 *   given piece's links are passed over), and that sets what the rest does: a stroke that lays goes on laying and
 *   passes over links already there; one that lifts goes on lifting and passes over cells without a link and over
 *   given links. A stroke is refused whole when any of its steps would be.
 */
export const N = 1,
  E = 2,
  S = 4,
  W = 8;
export const DIRS = [N, E, S, W];
export const opposite = (bit: number) => (bit === N ? S : bit === E ? W : bit === S ? N : E);
/** How many sides a mask joins. */
export const ends = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
/** The cell beside `cell` through side `bit`, or -1 off the board. */
export function neighbour(size: number, cell: number, bit: number) {
  const r = Math.floor(cell / size),
    c = cell % size;
  if (bit === N) return r > 0 ? cell - size : -1;
  if (bit === S) return r < size - 1 ? cell + size : -1;
  if (bit === E) return c < size - 1 ? cell + 1 : -1;
  return c > 0 ? cell - 1 : -1;
}
/** The side of `a` that faces `b`, or 0 when they are not side by side. */
export function sideTo(size: number, a: number, b: number) {
  for (const bit of DIRS) if (neighbour(size, a, bit) === b && b >= 0) return bit;
  return 0;
}
/** A port: a cell at the board's edge and its side that faces out. */
export interface Port {
  cell: number;
  bit: number;
}
export interface Stage {
  size: number;
  /** The share of the cells the railway passes, from and to. */
  share: [number, number];
  /** Given pieces laid beyond what one answer needs. */
  extra: number;
  /** Given pieces that one answer does not need are taken away again (the hardest stage). */
  trim: boolean;
}
export const STAGES: Stage[] = [
  { size: 5, share: [0.48, 0.64], extra: 3, trim: false },
  { size: 6, share: [0.46, 0.6], extra: 2, trim: false },
  { size: 8, share: [0.42, 0.56], extra: 2, trim: false },
  { size: 10, share: [0.4, 0.52], extra: 1, trim: false },
  { size: 10, share: [0.42, 0.54], extra: 0, trim: true },
];
export interface State {
  size: number;
  /** Cells the railway passes in each row (top to bottom) and each column (left to right). */
  rows: number[];
  cols: number[];
  /** The entrance and the exit. */
  ports: [Port, Port];
  /** A given piece's mask (with the outer side at a port), 0 where nothing is given. */
  given: number[];
  links: number[];
  /** Cells marked as having no track. */
  marks: boolean[];
  answer: number[];
  /** The cells the last move changed. */
  last: number[] | null;
  winner: Winner;
  ply: number;
}
/** Cells the railway passes (links of a cell, a port's outer side included), by row and by column. */
export function counts(state: Pick<State, "size" | "links">) {
  const n = state.size,
    rows = new Array(n).fill(0),
    cols = new Array(n).fill(0);
  state.links.forEach((mask, i) => {
    if (!mask) return;
    rows[Math.floor(i / n)]++;
    cols[i % n]++;
  });
  return { rows, cols };
}
/** How a number stands: still short, met exactly, or passed. */
export function clueState(have: number, want: number): "open" | "done" | "over" {
  return have === want ? "done" : have > want ? "over" : "open";
}
/** The cells of the railway from the entrance, as far as it runs on unbroken (it may stop short of the exit). */
export function route(state: Pick<State, "size" | "links" | "ports">) {
  const { size, links, ports } = state,
    out: number[] = [],
    seen = new Set<number>();
  let cell = ports[0].cell,
    from = ports[0].bit;
  while (cell >= 0 && !seen.has(cell) && links[cell] & from && ends(links[cell]) === 2) {
    seen.add(cell);
    out.push(cell);
    const on = links[cell] & ~from;
    if (cell === ports[1].cell && on === ports[1].bit) return { cells: out, whole: true };
    const next = neighbour(size, cell, on);
    if (next < 0) break;
    cell = next;
    from = opposite(on);
  }
  return { cells: out, whole: false };
}
/** Every number met, every cell with rails joined into one railway from the entrance to the exit: no loose end, branch, loop or stray piece. */
export function solved(state: Pick<State, "size" | "links" | "ports" | "rows" | "cols">) {
  const { rows, cols } = counts(state);
  if (rows.some((k, i) => k !== state.rows[i]) || cols.some((k, i) => k !== state.cols[i])) return false;
  if (state.links.some((mask) => mask && ends(mask) !== 2)) return false;
  const { cells, whole } = route(state);
  return whole && cells.length === state.links.filter(Boolean).length;
}
/** The side a port cell faces out by, or 0. */
const portBit = (ports: Port[], cell: number) => ports.reduce((bits, p) => (p.cell === cell ? bits | p.bit : bits), 0);
const OUT = -2;
/**
 * The answers of a puzzle, up to `cap` of them. The cells are decided row by row; a rail crossing the line between
 * the cells decided and those to come is an open end, and each knows where the other end of its stretch of rail is
 * (another open end, or a port). A piece that would join the two ends of one stretch closes a loop and is refused;
 * one that joins the two ports finishes the railway, which leaves every later cell empty. Numbers are checked as the
 * cells are laid, and a position found to lead to no answer is remembered and not searched again.
 */
export function answers(size: number, rows: number[], cols: number[], ports: Port[], given: number[], cap = 2): number[][] {
  return search(size, rows, cols, ports, given, cap, Infinity).found;
}
/** The search behind `answers`, given up after `budget` positions (`whole` is then false and what was found so far is returned). */
function search(size: number, rows: number[], cols: number[], ports: Port[], given: number[], cap: number, budget: number) {
  const n = size,
    cells = n * n,
    found: number[][] = [],
    laid = new Array(cells).fill(0),
    dead = new Set<string>(),
    sideBits = new Array(cells).fill(0);
  for (let i = 0; i < cells; i++) sideBits[i] = portBit(ports, i);
  // Rows that need no cell from some point on: what remains of the board must be empty then.
  const later = new Array(n + 1).fill(0);
  for (let r = n - 1; r >= 0; r--) later[r] = later[r + 1] + rows[r];
  const go = (i: number, active: Int8Array, mate: Int16Array, col: Int8Array, row: number, done: boolean): boolean => {
    if (found.length >= cap || --budget < 0) return true;
    if (i === cells) {
      if (done) found.push([...laid]);
      return done;
    }
    const r = Math.floor(i / n),
      c = i % n;
    if (done) {
      // The railway is finished: the rest is empty, so every number must be met already.
      if (row !== rows[r] || later[r + 1] !== 0) return false;
      for (let k = 0; k < n; k++) if (col[k] !== cols[k]) return false;
      for (let k = i; k < cells; k++) if (given[k]) return false;
      const answer = [...laid];
      for (let k = i; k < cells; k++) answer[k] = 0;
      found.push(answer);
      return true;
    }
    let key = `${i}|${row}|`;
    for (let k = 0; k <= n; k++) key += active[k] ? `${mate[k]},` : "_,";
    for (let k = 0; k < n; k++) key += String.fromCharCode(65 + col[k]);
    if (dead.has(key)) return false;
    const before = found.length,
      outer = sideBits[i],
      nIn = r > 0 ? active[c] === 1 : !!(outer & N),
      wIn = c > 0 ? active[n] === 1 : !!(outer & W),
      // What is at the other end of each stretch coming in.
      handles: number[] = [];
    if (nIn) handles.push(r > 0 ? mate[c] : OUT);
    if (wIn) handles.push(c > 0 ? mate[n] : OUT);
    if (outer & E) handles.push(OUT);
    if (outer & S) handles.push(OUT);
    const fixed = given[i],
      canE = c < n - 1,
      canS = r < n - 1;
    for (const [e, s] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      if ((e && !canE) || (s && !canS)) continue;
      const k = handles.length + (e ? 1 : 0) + (s ? 1 : 0);
      if (k !== 0 && k !== 2) continue;
      const mask = (nIn ? N : 0) | (wIn ? W : 0) | (e || outer & E ? E : 0) | (s || outer & S ? S : 0);
      if (fixed && mask !== fixed) continue;
      const on = mask ? 1 : 0;
      if (row + on > rows[r] || col[c] + on > cols[c]) continue;
      // What the rest of the row and the column can still give.
      if (row + on + (n - 1 - c) < rows[r] || col[c] + on + (n - 1 - r) < cols[c]) continue;
      if (c === n - 1 && row + on !== rows[r]) continue;
      if (r === n - 1 && col[c] + on !== cols[c]) continue;
      const a2 = active.slice(),
        m2 = mate.slice();
      if (nIn && r > 0) a2[c] = 0;
      if (wIn && c > 0) a2[n] = 0;
      let finished = false;
      if (handles.length === 2) {
        const [a, b] = handles;
        // Both ends of one stretch: a loop.
        if (nIn && wIn && r > 0 && c > 0 && a === n) continue;
        if (a === OUT && b === OUT) {
          if (a2.some(Boolean)) continue;
          finished = true;
        } else {
          if (a >= 0) m2[a] = b;
          if (b >= 0) m2[b] = a;
        }
      } else if (handles.length === 1) {
        const a = handles[0],
          slot = e ? n : c;
        a2[slot] = 1;
        m2[slot] = a;
        if (a >= 0) m2[a] = slot;
      } else if (e && s) {
        a2[n] = a2[c] = 1;
        m2[n] = c;
        m2[c] = n;
      }
      laid[i] = mask;
      const col2 = col.slice();
      col2[c] += on;
      const endOfRow = c === n - 1;
      go(i + 1, a2, m2, col2, endOfRow ? 0 : row + on, finished);
      laid[i] = 0;
      if (found.length >= cap) return true;
    }
    if (found.length === before && budget >= 0) dead.add(key);
    return found.length > before;
  };
  go(0, new Int8Array(n + 1), new Int16Array(n + 1).fill(-1), new Int8Array(n), 0, false);
  return { found, whole: budget >= 0 };
}
/** How many answers a puzzle has, stopping at `cap`. */
export const solutions = (size: number, rows: number[], cols: number[], ports: Port[], given: number[], cap = 2) => answers(size, rows, cols, ports, given, cap).length;
/** The masks of a railway laid along `path` (consecutive cells side by side), with its ports' outer sides. */
export function masksOf(size: number, path: number[], ports: Port[]) {
  const masks = new Array(size * size).fill(0);
  for (let k = 0; k + 1 < path.length; k++) {
    const bit = sideTo(size, path[k], path[k + 1]);
    masks[path[k]] |= bit;
    masks[path[k + 1]] |= opposite(bit);
  }
  for (const p of ports) masks[p.cell] |= p.bit;
  return masks;
}
const pickOf = <X>(items: X[], random: Random) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
function shuffle<X>(items: X[], random: Random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
/**
 * A random railway from a cell of the left edge to one of the bottom edge: first a random way that only goes down
 * and right, then detours pushed out of it at random (a link of the way is replaced by three round a square beside
 * it), until it passes about `length` cells or no detour is left.
 */
export function wander(size: number, length: number, random: Random) {
  for (;;) {
    const row = Math.floor(random() * size),
      column = Math.floor(random() * size);
    if (row === size - 1 && column === 0) continue;
    const path = [row * size];
    for (let r = row, c = 0; r < size - 1 || c < column; ) {
      if (r < size - 1 && (c >= column || random() < 0.5)) r++;
      else c++;
      path.push(r * size + c);
    }
    const on = new Uint8Array(size * size);
    for (const cell of path) on[cell] = 1;
    for (let tries = 0; path.length < length && tries < size * size * 60; tries++) {
      const k = Math.floor(random() * (path.length - 1)),
        a = path[k],
        b = path[k + 1],
        along = sideTo(size, a, b),
        across = along === N || along === S ? (random() < 0.5 ? E : W) : random() < 0.5 ? N : S,
        a2 = neighbour(size, a, across),
        b2 = neighbour(size, b, across);
      if (a2 < 0 || b2 < 0 || on[a2] || on[b2]) continue;
      path.splice(k + 1, 0, a2, b2);
      on[a2] = on[b2] = 1;
    }
    return path;
  }
}
/** How many positions a search may visit while a puzzle is laid. */
const BUDGET = 40000;
/** A puzzle of a stage (1 to 5) with one answer only, nothing laid yet but its given pieces. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const index = Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1)) - 1,
    { size, share, extra, trim } = STAGES[index],
    n = size * size;
  for (;;) {
    const target = Math.round(n * (share[0] + random() * (share[1] - share[0]))),
      path = wander(size, target, random);
    if (path.length < n * share[0] - 1) continue;
    // Which end is the entrance: the left edge's or the bottom edge's.
    const left: Port = { cell: path[0], bit: W },
      bottom: Port = { cell: path[path.length - 1], bit: S },
      ports: [Port, Port] = random() < 0.5 ? [left, bottom] : [bottom, left];
    if (ports[0] === bottom) path.reverse();
    const answer = masksOf(size, path, ports),
      rows = new Array(size).fill(0),
      cols = new Array(size).fill(0);
    for (const cell of path) {
      rows[Math.floor(cell / size)]++;
      cols[cell % size]++;
    }
    const given = new Array(n).fill(0);
    for (const p of ports) given[p.cell] = answer[p.cell];
    // Searches are bounded so that a puzzle is laid quickly; one whose search runs too long is dropped.
    const check = () => {
        const { found, whole } = search(size, rows, cols, ports, given, 2, BUDGET);
        return whole ? found : null;
      };
    let found = check(),
      guard = 0;
    // While there is more than one answer, give a piece where another answer differs from this one.
    while (found && found.length > 1 && guard++ < n) {
      const other = found.find((a) => a.some((m, i) => m !== answer[i]))!,
        differ = path.filter((cell) => other[cell] !== answer[cell] && !given[cell]);
      if (!differ.length) break;
      const cell = pickOf(differ, random);
      given[cell] = answer[cell];
      found = check();
    }
    if (!found || found.length !== 1) continue;
    if (trim) {
      // Pieces given on the way that the answer no longer needs are taken away again, the ports' kept.
      for (const cell of shuffle(path.filter((c) => given[c] && !ports.some((p) => p.cell === c)), random)) {
        const keep = given[cell];
        given[cell] = 0;
        if (check()?.length !== 1) given[cell] = keep;
      }
    }
    const free = shuffle(path.filter((cell) => !given[cell]), random);
    for (let k = 0; k < extra && k < free.length; k++) given[free[k]] = answer[free[k]];
    const links = new Array(n).fill(0);
    given.forEach((mask, cell) => {
      if (!mask) return;
      links[cell] |= mask;
      for (const bit of DIRS) {
        const other = mask & bit ? neighbour(size, cell, bit) : -1;
        if (other >= 0) links[other] |= opposite(bit);
      }
    });
    const state: State = { size, rows, cols, ports, given, links, marks: new Array(n).fill(false), answer, last: null, winner: null, ply: 0 };
    if (solved(state)) continue;
    return state;
  }
}
/** The move that toggles the link between two cells side by side. */
export const link = (a: number, b: number): Move => ({ from: a, to: b, extra: -1 });
/** The `to` of a stroke; its steps are in `extra`. */
export const STROKE = 10000,
  MAX_STROKE = 24;
const DIGIT: Record<number, number> = { [N]: 0, [E]: 1, [S]: 2, [W]: 3 };
/** A stroke from `from` through `cells` (each beside the one before). */
export function stroke(size: number, from: number, cells: number[]): Move {
  let code = 1,
    at = from;
  for (const cell of cells) {
    code = code * 4 + DIGIT[sideTo(size, at, cell)];
    at = cell;
  }
  return { from, to: STROKE, extra: code };
}
/** The sides a stroke's code steps through, in order. */
export function strokeSteps(code: number) {
  const out: number[] = [];
  for (let c = code; c > 1; c = Math.floor(c / 4)) out.unshift(DIRS[c % 4]);
  return code >= 1 && Number.isInteger(code) ? out : [];
}
/** Why a cell cannot be marked, or a link between `a` and `b` laid or lifted: null when it can. */
type Why = "given" | "track" | "mark" | "third" | "far" | null;
function linkWhy(state: Pick<State, "links" | "given" | "marks">, a: number, b: number, bit: number, lay: boolean): Why {
  if (!lay) return state.given[a] & bit || state.given[b] & opposite(bit) ? "given" : null;
  if (state.marks[a] || state.marks[b]) return "mark";
  if (ends(state.links[a]) >= 2 || ends(state.links[b]) >= 2) return "third";
  return null;
}
/** What a move would do: the links and marks after it and the cells it changed, or why it is refused. */
function attempt(state: State, move: Move, empty = false): { links: number[]; marks: boolean[]; changed: number[] } | { why: Why } {
  const n = state.size * state.size,
    { from, to, extra } = move;
  if (!Number.isInteger(from) || !Number.isInteger(to) || !Number.isInteger(extra)) return { why: "far" };
  if (from === -1) {
    if (extra !== -1 || to < 0 || to >= n) return { why: "far" };
    if (state.given[to]) return { why: "given" };
    if (state.links[to]) return { why: "track" };
    const marks = [...state.marks];
    marks[to] = !marks[to];
    return { links: state.links, marks, changed: [to] };
  }
  if (from < 0 || from >= n) return { why: "far" };
  let sides: number[];
  if (to === STROKE) {
    sides = strokeSteps(extra);
    if (!sides.length || sides.length > MAX_STROKE) return { why: "far" };
  } else {
    if (extra !== -1 || to < 0 || to >= n) return { why: "far" };
    const bit = sideTo(state.size, from, to);
    if (!bit) return { why: "far" };
    sides = [bit];
  }
  const links = [...state.links],
    changed = new Set<number>(),
    view = { links, given: state.given, marks: state.marks };
  let at = from,
    lay: boolean | null = null;
  for (const bit of sides) {
    const next = neighbour(state.size, at, bit);
    if (next < 0) return { why: "far" };
    const present = !!(links[at] & bit);
    // A given piece's link sets nothing: a stroke may start along one and lay on from its end.
    if (lay === null && present && linkWhy(view, at, next, bit, false) === "given") {
      at = next;
      continue;
    }
    if (lay === null) lay = !present;
    if (present !== lay) {
      const why = linkWhy(view, at, next, bit, lay);
      if (why) {
        // A stroke that lifts passes over a given piece's links, as it passes over cells without any.
        if (!(why === "given" && changed.size)) return { why };
      } else {
        links[at] ^= bit;
        links[next] ^= opposite(bit);
        changed.add(at).add(next);
      }
    }
    at = next;
  }
  return changed.size || empty ? { links, marks: state.marks, changed: [...changed] } : { why: "given" };
}
/**
 * What a drag through `cells` from `from` has laid so far, as a state to draw (not a move made: its ply and its
 * winner are left as they were); the state itself while the drag has only run along given rails, and null when a
 * step of it would be refused.
 */
export function drawn(state: State, from: number, cells: number[]): State | null {
  if (!cells.length) return state;
  const made = attempt(state, cells.length === 1 ? link(from, cells[0]) : stroke(state.size, from, cells), true);
  return "why" in made ? null : made.changed.length ? { ...state, links: made.links } : state;
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null) return null;
  const made = attempt(state, move);
  if ("why" in made) return null;
  const next: State = { ...state, links: made.links, marks: made.marks, last: made.changed, ply: state.ply + 1 };
  return { ...next, winner: solved(next) ? 0 : null };
}
/** What the status line says when a move of mine is refused. */
export function refusal(state: State, move: Move): string | null {
  if (state.winner !== null) return null;
  const made = attempt(state, move);
  if (!("why" in made)) return null;
  switch (made.why) {
    case "given":
      return move.from === -1 ? "주어진 선로가 놓인 칸입니다. 바꿀 수 없습니다." : "주어진 선로는 걷어 낼 수 없습니다.";
    case "track":
      return "선로가 지나는 칸에는 X를 놓을 수 없습니다. 선로를 먼저 걷어 내세요.";
    case "mark":
      return "X로 막은 칸에는 선로를 놓을 수 없습니다.";
    case "third":
      return "한 칸에는 선로가 두 갈래까지만 닿습니다. 선로는 갈라지지 않습니다.";
    default:
      return null;
  }
}
/** Every tap is offered (a refused one is told why); links are made by drags, keys and the hint. */
export const moves = (state: State): Move[] => (state.winner !== null ? [] : state.links.map((_, to) => ({ from: -1, to, extra: -1 })));
/**
 * One step toward the answer: a wrong link lifted, else the next link of the answer from the entrance that is not
 * laid yet (a mark in its way taken off first); null once solved. Played one after another, they always solve it.
 */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const { size, links, answer } = state;
  for (let a = 0; a < links.length; a++)
    for (const bit of DIRS) {
      if (!(links[a] & bit) || answer[a] & bit) continue;
      const b = neighbour(size, a, bit);
      if (b >= 0) return link(a, b);
    }
  let cell = state.ports[0].cell,
    from = state.ports[0].bit;
  for (let guard = 0; guard < links.length; guard++) {
    const on = answer[cell] & ~from;
    if (cell === state.ports[1].cell && on === state.ports[1].bit) break;
    const next = neighbour(size, cell, on);
    if (next < 0) break;
    if (!(links[cell] & on)) {
      if (state.marks[cell]) return { from: -1, to: cell, extra: -1 };
      if (state.marks[next]) return { from: -1, to: next, extra: -1 };
      return link(cell, next);
    }
    cell = next;
    from = opposite(on);
  }
  // Everything laid: only marks can be left (they do not count), which is solved already.
  return null;
}
const effect = (): Effect | null => null;
export const tracks: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.links.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: () => "끌어서 선로를 놓아 터널과 역을 이으세요",
  tally: () => ["", ""],
  reason: () => "성공! 기차가 입구에서 출구까지 달립니다.",
};
