import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * 빛 케이블 (LIGHT CABLE), a cable-wrapping puzzle of the kind of the game 'Filament': a cable is drawn from a socket
 * round brass posts standing on a board, and every post it goes round lights up. Only the kind of puzzle was taken;
 * the name, the boards, the rules in detail and the look are our own.
 *
 * The board is `size` × `size` cells, numbered row by row from the top left (`r * size + c`); row 0 is the far side.
 * A cell is free or holds a post. Outside the board's edge stands the start socket, joined to one edge cell (`start`,
 * a cell and the side it faces out by: N 1, E 2, S 4, W 8); from the second stage an exit socket stands at another
 * edge cell (`exit`).
 *
 * The cable (`path`) is a line of free cells, each beside the one before it (four directions), beginning at the start
 * cell (it is plugged in from the start, so `path` is never empty). It never uses a cell twice, so it can neither
 * cross nor overlap itself, and it never enters a post's cell.
 *
 * The lighting rule (judged on the grid, exactly): the cable passes a post on one of its sides when it enters the cell
 * beside the post on that side (north, east, south or west; diagonal cells do not count). A post lights when the
 * cable has passed it on at least `need` different sides: two for most posts, three or four for a counted post (its
 * number is shown). So a post is lit by going round its corner (north then east) or by passing it on both sides.
 * This rule was chosen over "any cell beside it" because it makes the cable wrap the posts as in the kind of game, so
 * that the order of the wraps matters: a run of cable that goes round one post walls off a side of the next.
 *
 * Colours (from the third stage): the cable starts white. A coloured post (red, blue, green) counts a side only when
 * the cable reaching that side is already of its colour; white posts count any colour. When the cable enters a cell
 * beside a coloured post, it takes that post's colour from there on (after the side is judged); beside posts of two
 * colours at once it keeps the colour it had. So a red post is lit by a cable that turns red at its first side and
 * goes on round two more, or by one that comes already red from another red post.
 *
 * Moves (every one goes through `play`), each one step, `{from: -1, to: cell, extra: -1}`:
 * - `to` beside the cable's end (the head), free and not on the cable: the cable is drawn on into it.
 * - `to` the cell before the head: the last step is taken back (the cable is wound in by one cell). A drag back over
 *   the cable, the Backspace key and a hint to go back are this move; undo takes back whatever was done last.
 * - Anything else is refused, and `refusal` says why (a post, a cell the cable already passes, a cell not beside the
 *   head, `OFF` for a step off the board).
 * A drag is played as one move a cell, so that undo unwinds it step by step.
 *
 * Won (`winner` 0) when every post is lit and, from the second stage on, the cable's end is in the exit cell (the
 * cable then plugs into the exit socket). There is no failure: a cable that can no longer light everything is wound
 * back.
 *
 * A puzzle is laid at random (`createGame`): a self-avoiding walk is drawn from the start socket (to an edge cell where
 * the exit is set), curling as it goes; posts are then set on cells beside it that the walk passes on enough sides
 * (`choosePosts`), some coloured where the walk still lights them in colour, some counted, and the walk is replayed
 * through `play` to confirm that it solves the board (it is kept as `plan`, which the hint follows while I do). A
 * board is judged by `luck`: how often a walker that steps at random among the steps that leave every post still
 * reachable gets through; it is kept when that is at most the stage's figure, or else the least lucky of the boards
 * tried. The hint off the plan is a depth-first search (`solve`) with the same pruning and a budget.
 */
export const N = 1,
  E = 2,
  S = 4,
  W = 8;
export const DIRS = [N, E, S, W];
export const opposite = (bit: number) => (bit === N ? S : bit === E ? W : bit === S ? N : E);
/** How many sides a mask holds. */
export const bitCount = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
/** A step off the board (the keyboard's arrow at the edge), refused with words. */
export const OFF = -2;
export const WHITE = 0,
  RED = 1,
  BLUE = 2,
  GREEN = 3;
/** The colours' names, for the words. */
export const COLOUR_NAMES = ["흰", "빨간", "파란", "초록"];

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
  for (const bit of DIRS) if (b >= 0 && neighbour(size, a, bit) === b) return bit;
  return 0;
}
/** The sides of an edge cell that face out of the board. */
export function outward(size: number, cell: number) {
  return DIRS.filter((bit) => neighbour(size, cell, bit) < 0);
}

export interface Post {
  cell: number;
  colour: number;
  /** How many different sides the cable must pass: 2, or 3 or 4 for a counted post. */
  need: number;
}
/** A socket: the edge cell it is joined to and the side of that cell it stands by. */
export interface Port {
  cell: number;
  bit: number;
}
export interface Last {
  /** The cell the step went into, or (`back`) the cell the cable was wound in from. */
  cell: number;
  back: boolean;
  /** Posts (indices) this move lit, and those it put out. */
  lit: number[];
  dimmed: number[];
}
export interface State {
  size: number;
  stage: number;
  posts: Post[];
  /** The post standing on each cell (its index), or -1. */
  postAt: number[];
  start: Port;
  exit: Port | null;
  /** The cable's cells from the start socket; the last is the head. */
  path: number[];
  /** The cable's colour as it leaves each cell of the path. */
  tints: number[];
  /** For each post, the sides (a mask) the cable has passed in a colour that counts. */
  sides: number[];
  /** A way through found as the board was laid; the hint follows it while I do. */
  plan: number[];
  last: Last | null;
  winner: Winner;
  ply: number;
}

/** What the lighting needs to know about a board. */
type Board = Pick<State, "size" | "posts" | "postAt">;
/**
 * The cable entering `cell` in colour `arrive`: the sides it passes are added to `sides`, and the colour it leaves
 * the cell in is returned (the rule above).
 */
export function visit(board: Board, cell: number, arrive: number, sides: number[]) {
  let dye = -1;
  for (const bit of DIRS) {
    const at = neighbour(board.size, cell, bit);
    if (at < 0) continue;
    const p = board.postAt[at];
    if (p < 0) continue;
    const post = board.posts[p];
    // The cell lies on the post's side facing back toward it.
    if (post.colour === WHITE || post.colour === arrive) sides[p] |= opposite(bit);
    if (post.colour !== WHITE) dye = dye === -1 || dye === post.colour ? post.colour : -2;
  }
  return dye >= 0 ? dye : arrive;
}
/** The colours and the sides passed of a whole cable. */
export function trace(board: Board, path: number[]) {
  const sides = board.posts.map(() => 0),
    tints: number[] = [];
  let tint = WHITE;
  for (const cell of path) tints.push((tint = visit(board, cell, tint, sides)));
  return { tints, sides };
}
export const isLit = (state: Pick<State, "posts" | "sides">, post: number) => bitCount(state.sides[post]) >= state.posts[post].need;
export const litCount = (state: Pick<State, "posts" | "sides">) => state.posts.reduce((sum, _, i) => sum + (isLit(state, i) ? 1 : 0), 0);
const head = (s: Pick<State, "path">) => s.path[s.path.length - 1];
/** The cell before the head, or -1. */
export const behind = (s: Pick<State, "path">) => (s.path.length > 1 ? s.path[s.path.length - 2] : -1);
/** The tint the cable has at its end. */
export const tintOf = (s: Pick<State, "tints">) => s.tints[s.tints.length - 1] ?? WHITE;
const done = (s: Pick<State, "posts" | "sides" | "exit" | "path">) => litCount(s) === s.posts.length && (!s.exit || head(s) === s.exit.cell);

/** The free cells beside the head the cable may be drawn into. */
export function steps(state: State) {
  if (state.winner !== null) return [];
  const at = head(state),
    out: number[] = [];
  for (const bit of DIRS) {
    const cell = neighbour(state.size, at, bit);
    if (cell >= 0 && state.postAt[cell] < 0 && !state.path.includes(cell)) out.push(cell);
  }
  return out;
}
const step = (to: number): Move => ({ from: -1, to, extra: -1 });
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out = steps(state).map(step);
  if (state.path.length > 1) out.push(step(behind(state)));
  return out;
}
/** Why a step to `move.to` is refused, or null. */
export function refusal(state: State, move: Move) {
  if (state.winner !== null || move.from !== -1) return null;
  const to = move.to,
    n = state.size;
  if (to === OFF) return "판 밖으로는 케이블을 끌 수 없습니다.";
  if (to < 0 || to >= n * n) return null;
  if (to === head(state)) return "케이블 끝이 있는 칸입니다. 끝을 옆 칸으로 끌어 늘이세요.";
  if (state.postAt[to] >= 0) return "기둥이 선 칸입니다. 케이블은 기둥 옆의 빈칸으로 지나가며 기둥을 감습니다.";
  if (to === behind(state)) return null;
  if (state.path.includes(to)) return "케이블이 이미 지나간 칸입니다. 케이블은 자기 자신과 겹치거나 엇갈릴 수 없습니다.";
  if (!sideTo(n, head(state), to)) return "케이블 끝 바로 옆 칸(가로·세로)으로만 늘일 수 있습니다.";
  return null;
}
/** The state after one step (on, or back), or null when it may not be made. */
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to)) return null;
  const to = move.to,
    n = state.size,
    path = state.path,
    at = head(state);
  if (to === behind(state)) {
    const shorter = path.slice(0, -1),
      { tints, sides } = trace(state, shorter),
      dimmed = state.posts.flatMap((post, i) => (bitCount(state.sides[i]) >= post.need && bitCount(sides[i]) < post.need ? [i] : []));
    return { ...state, path: shorter, tints, sides, last: { cell: at, back: true, lit: [], dimmed }, winner: null, ply: state.ply + 1 };
  }
  if (to < 0 || to >= n * n || !sideTo(n, at, to) || state.postAt[to] >= 0 || path.includes(to)) return null;
  const sides = [...state.sides],
    tint = visit(state, to, tintOf(state), sides),
    lit = state.posts.flatMap((post, i) => (bitCount(sides[i]) >= post.need && bitCount(state.sides[i]) < post.need ? [i] : [])),
    next: State = { ...state, path: [...path, to], tints: [...state.tints, tint], sides, last: { cell: to, back: false, lit, dimmed: [] }, winner: null, ply: state.ply + 1 };
  if (done(next)) next.winner = 0;
  return next;
}
/** The state with the cable's last step taken back, replayed from the start. */
export function undo(state: State): State {
  let s = fresh(state, state.plan);
  for (const cell of state.path.slice(1, -1)) s = play(s, step(cell))!;
  return s;
}
/** A board as laid, its cable plugged into the start socket. */
function fresh(board: Pick<State, "size" | "stage" | "posts" | "postAt" | "start" | "exit">, plan: number[]): State {
  const path = [board.start.cell],
    { tints, sides } = trace(board, path);
  return { size: board.size, stage: board.stage, posts: board.posts, postAt: board.postAt, start: board.start, exit: board.exit, path, tints, sides, plan, last: null, winner: null, ply: 0 };
}
/** A board from its posts and sockets (tests and the generator). */
export function boardOf(size: number, stage: number, posts: Post[], start: Port, exit: Port | null, plan: number[] = []): State {
  const postAt = new Array(size * size).fill(-1);
  posts.forEach((post, i) => (postAt[post.cell] = i));
  return fresh({ size, stage, posts, postAt, start, exit }, plan);
}

/*
 * The search. A `Probe` holds a board and a cable in typed arrays and steps the cable on and back without copying,
 * so that the walker that judges a board and the hint's depth-first search are quick. A position is given up
 * (`hopeful` false) when some unlit post can no longer find enough sides among the free cells the head can still
 * reach (colours left out: they only make it harder), or when the exit can no longer be reached.
 */
class Probe {
  readonly n: number;
  readonly cells: number;
  readonly count: number;
  readonly postAt: Int16Array;
  readonly colour: Uint8Array;
  readonly need: Uint8Array;
  /** The cell on each side of each post (post * 4 + side index), or -1. */
  readonly side: Int16Array;
  readonly used: Uint8Array;
  readonly sides: Uint8Array;
  readonly exit: number;
  readonly path: Int16Array;
  len = 0;
  tint = WHITE;
  lit = 0;
  private log: number[] = [];
  private seen: Int32Array;
  private stamp = 0;
  private queue: Int16Array;
  constructor(state: State) {
    const n = (this.n = state.size);
    this.cells = n * n;
    this.count = state.posts.length;
    this.postAt = Int16Array.from(state.postAt);
    this.colour = Uint8Array.from(state.posts.map((p) => p.colour));
    this.need = Uint8Array.from(state.posts.map((p) => p.need));
    this.side = new Int16Array(this.count * 4);
    state.posts.forEach((post, i) => DIRS.forEach((bit, k) => (this.side[i * 4 + k] = neighbour(n, post.cell, bit))));
    this.used = new Uint8Array(this.cells);
    this.sides = new Uint8Array(this.count);
    this.exit = state.exit ? state.exit.cell : -1;
    this.path = new Int16Array(this.cells);
    this.seen = new Int32Array(this.cells);
    this.queue = new Int16Array(this.cells);
    for (const cell of state.path) this.step(cell);
  }
  get head() {
    return this.path[this.len - 1];
  }
  free(cell: number) {
    return cell >= 0 && !this.used[cell] && this.postAt[cell] < 0;
  }
  /** Draws the cable into `cell` (assumed free and beside the head), keeping what to restore. */
  step(cell: number) {
    const n = this.n,
      log = this.log,
      arrive = this.tint;
    log.push(this.tint, this.lit);
    let changed = 0,
      dye = -1;
    for (let k = 0; k < 4; k++) {
      const at = neighbour(n, cell, DIRS[k]);
      if (at < 0) continue;
      const p = this.postAt[at];
      if (p < 0) continue;
      const colour = this.colour[p];
      if (colour === WHITE || colour === arrive) {
        const bit = opposite(DIRS[k]),
          before = this.sides[p];
        if (!(before & bit)) {
          log.push(p, before);
          changed++;
          const after = before | bit;
          this.sides[p] = after;
          if (bitCount(before) < this.need[p] && bitCount(after) >= this.need[p]) this.lit++;
        }
      }
      if (colour !== WHITE) dye = dye === -1 || dye === colour ? colour : -2;
    }
    log.push(changed);
    if (dye >= 0) this.tint = dye;
    this.used[cell] = 1;
    this.path[this.len++] = cell;
  }
  unstep() {
    const log = this.log,
      cell = this.path[--this.len];
    this.used[cell] = 0;
    let changed = log.pop()!;
    while (changed--) {
      const before = log.pop()!,
        p = log.pop()!;
      this.sides[p] = before;
    }
    this.lit = log.pop()!;
    this.tint = log.pop()!;
  }
  won() {
    return this.lit === this.count && (this.exit < 0 || this.head === this.exit);
  }
  /** The free cells beside the head. */
  open(out: number[]) {
    out.length = 0;
    const at = this.head;
    for (const bit of DIRS) {
      const cell = neighbour(this.n, at, bit);
      if (this.free(cell)) out.push(cell);
    }
    return out;
  }
  /** Marks the free cells the head can still reach (`seen` equal to the stamp returned). */
  private flood() {
    const stamp = ++this.stamp,
      seen = this.seen,
      queue = this.queue,
      n = this.n;
    let top = 0,
      end = 0;
    queue[end++] = this.head;
    seen[this.head] = stamp;
    while (top < end) {
      const at = queue[top++];
      for (const bit of DIRS) {
        const cell = neighbour(n, at, bit);
        if (cell >= 0 && seen[cell] !== stamp && this.free(cell)) {
          seen[cell] = stamp;
          queue[end++] = cell;
        }
      }
    }
    return stamp;
  }
  hopeful() {
    if (this.won()) return true;
    const stamp = this.flood(),
      seen = this.seen;
    if (this.exit >= 0 && this.head !== this.exit && seen[this.exit] !== stamp) return false;
    // Once everything is lit only the exit is wanted, and the flood has found it.
    if (this.lit === this.count) return this.exit >= 0;
    for (let p = 0; p < this.count; p++) {
      const have = this.sides[p],
        need = this.need[p];
      let count = bitCount(have);
      if (count >= need) continue;
      for (let k = 0; k < 4 && count < need; k++) {
        const cell = this.side[p * 4 + k];
        if (cell >= 0 && !(have & DIRS[k]) && seen[cell] === stamp && cell !== this.head) count++;
      }
      if (count < need) return false;
    }
    return true;
  }
  /** Sides of unlit posts that a step into `cell` would count. */
  gain(cell: number) {
    let gained = 0;
    for (let k = 0; k < 4; k++) {
      const at = neighbour(this.n, cell, DIRS[k]);
      if (at < 0) continue;
      const p = this.postAt[at];
      if (p < 0 || bitCount(this.sides[p]) >= this.need[p]) continue;
      const colour = this.colour[p];
      if ((colour === WHITE || colour === this.tint) && !(this.sides[p] & opposite(DIRS[k]))) gained++;
    }
    return gained;
  }
  /** Free cells beside `cell`, the head's cell left out. */
  onward(cell: number) {
    let count = 0;
    for (const bit of DIRS) if (this.free(neighbour(this.n, cell, bit))) count++;
    return count;
  }
}

/**
 * How often a walker gets through: from the start, at each step a step chosen at random among those that leave the
 * position hopeful, `tries` times. A board where that seldom works is one where the order of the wraps must be thought
 * out.
 */
export function luck(state: State, tries: number, random: Random) {
  const probe = new Probe(state),
    base = probe.len,
    open: number[] = [],
    good: number[] = [];
  let won = 0;
  for (let t = 0; t < tries; t++) {
    while (probe.len > base) probe.unstep();
    for (;;) {
      if (probe.won()) {
        won++;
        break;
      }
      probe.open(open);
      good.length = 0;
      for (const cell of open) {
        probe.step(cell);
        if (probe.hopeful()) good.push(cell);
        probe.unstep();
      }
      if (!good.length) break;
      probe.step(good[Math.floor(random() * good.length)]);
    }
  }
  return won / tries;
}
/** How many positions the hint's search may visit. */
const BUDGET = 60000;
/**
 * A way to finish from the state shown: the cells to draw the cable into, in order; [] when it is won, null when the
 * search finds none (none at all, or none within its budget).
 */
export function solve(state: State, budget = BUDGET): number[] | null {
  if (state.winner !== null) return [];
  const probe = new Probe(state),
    base = probe.len,
    left = { n: budget };
  const order = (cells: number[]) => {
    // Steps that pass unlit posts first; then, as Warnsdorff's rule has it, the cell with fewer ways on (so that the
    // cable hugs what it has laid and leaves no pockets); once everything is lit, the nearest way to the exit.
    if (probe.lit === probe.count && probe.exit >= 0) {
      const far = distances(probe);
      return cells.sort((a, b) => far[a] - far[b]);
    }
    return cells.map((cell) => ({ cell, score: probe.gain(cell) * 10 - probe.onward(cell) })).sort((a, b) => b.score - a.score || a.cell - b.cell).map((o) => o.cell);
  };
  const search = (): boolean => {
    if (probe.won()) return true;
    if (--left.n < 0 || !probe.hopeful()) return false;
    for (const cell of order(probe.open([]))) {
      probe.step(cell);
      if (search()) return true;
      probe.unstep();
    }
    return false;
  };
  if (!search()) return null;
  return Array.from(probe.path.slice(base, probe.len));
}
/** How far each free cell is from the exit, through free cells (unreached: a large number). */
function distances(probe: Probe) {
  const far = new Int32Array(probe.cells).fill(1 << 20),
    queue = [probe.exit];
  far[probe.exit] = 0;
  for (let top = 0; top < queue.length; top++) {
    const at = queue[top];
    for (const bit of DIRS) {
      const cell = neighbour(probe.n, at, bit);
      if (cell >= 0 && probe.free(cell) && far[cell] > far[at] + 1) {
        far[cell] = far[at] + 1;
        queue.push(cell);
      }
    }
  }
  return far;
}
/**
 * The hint: the next cell of a way through. While the cable follows the plan the board was laid with, the plan's next
 * cell; else the next cell of a way the search finds; when it finds none, a step back (the cell before the head),
 * which in the end brings the cable back onto a way that can be finished. Null when it is won.
 */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const { plan, path } = state;
  if (path.length < plan.length && path.every((cell, i) => plan[i] === cell)) return step(plan[path.length]);
  const way = solve(state);
  if (way && way.length) return step(way[0]);
  return path.length > 1 ? step(behind(state)) : null;
}
/** Whether the hint is to wind the cable back. */
export const hintsBack = (state: State, move: Move) => move.to === behind(state);
/** Unlit posts that the cable can no longer light, or an exit it can no longer reach: a dead end. */
export function stuck(state: State) {
  if (state.winner !== null) return false;
  const probe = new Probe(state);
  return !probe.hopeful() || (!probe.won() && probe.open([]).length === 0);
}

/** A stage: the board's size, how many posts, how much of the board the walk covers, the rules in play and how lucky a walker may be. */
export interface Stage {
  size: number;
  posts: [number, number];
  share: [number, number];
  exit: boolean;
  /** How many colours the coloured posts are drawn from (0: none), and how many posts are coloured. */
  colours: number;
  coloured: [number, number];
  /** How many posts are counted (need three or four sides). */
  counted: [number, number];
  luck: number;
}
export const STAGES: Stage[] = [
  { size: 5, posts: [3, 4], share: [0.56, 0.72], exit: false, colours: 0, coloured: [0, 0], counted: [0, 0], luck: 0.35 },
  { size: 6, posts: [5, 6], share: [0.58, 0.74], exit: true, colours: 0, coloured: [0, 0], counted: [0, 0], luck: 0.12 },
  { size: 7, posts: [6, 8], share: [0.58, 0.74], exit: true, colours: 2, coloured: [2, 3], counted: [0, 0], luck: 0.06 },
  { size: 8, posts: [9, 11], share: [0.6, 0.72], exit: true, colours: 2, coloured: [3, 5], counted: [0, 0], luck: 0.03 },
  { size: 9, posts: [11, 13], share: [0.6, 0.72], exit: true, colours: 3, coloured: [4, 6], counted: [1, 3], luck: 0.02 },
];
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));

/** The list shuffled in place (Fisher–Yates). */
function shuffle<T>(list: T[], random: Random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
const between = (range: [number, number], random: Random) => range[0] + Math.floor(random() * (range[1] - range[0] + 1));
const onEdge = (n: number, cell: number) => outward(n, cell).length > 0;
/**
 * How the walk weighs going straight on against turning, how much it prefers cells with few ways on (`hug`), how
 * much a step that passes a cell on its second side is worth (`wrap`), and how likely such a cell is to be kept for a
 * post (`keep`).
 */
const WALK = { straight: 1, turn: 2, hug: 1.2, wrap: 3, keep: 0.9 };
/** How many steps a walk may try, going back where it got stuck, before it gives up. */
const WALK_BUDGET = 500;
/**
 * A self-avoiding walk from a start socket on an edge, `length` cells or a little more, ending (when `exit`) on
 * another edge cell where the exit socket is set; null when it could not be finished. As it goes it curls round cells
 * it has passed on one side, and a cell it has passed on two sides is often kept free of it from then on (`kept`,
 * until `posts` are kept), so that posts can stand there. Where it is hemmed in it goes back and tries another way.
 */
export function walk(n: number, length: number, exit: boolean, random: Random, posts = 0): { path: number[]; start: Port; exit: Port | null } | null {
  const edges = [...Array(n * n).keys()].filter((cell) => onEdge(n, cell)),
    first = edges[Math.floor(random() * edges.length)],
    sides = outward(n, first),
    start = { cell: first, bit: sides[Math.floor(random() * sides.length)] },
    path: number[] = [];
  // 0 free, 1 on the walk, 2 kept for a post.
  let used = new Uint8Array(n * n),
    passed = new Uint8Array(n * n),
    kept = 0,
    budget = WALK_BUDGET,
    end: Port | null = null;
  const free = (cell: number) => cell >= 0 && !used[cell];
  const enter = (cell: number) => {
    if (used[cell] === 2) kept--;
    used[cell] = 1;
    path.push(cell);
    for (const bit of DIRS) {
      const at = neighbour(n, cell, bit);
      if (!free(at)) continue;
      passed[at] |= opposite(bit);
      if (kept < posts && bitCount(passed[at]) === 2 && random() < WALK.keep) {
        used[at] = 2;
        kept++;
      }
    }
  };
  const extend = (dir: number): boolean => {
    if (--budget < 0) return false;
    const at = path[path.length - 1];
    if (path.length >= length) {
      if (!exit) return true;
      if (at !== first && onEdge(n, at)) {
        const out = outward(n, at);
        end = { cell: at, bit: out[Math.floor(random() * out.length)] };
        return true;
      }
      if (path.length > length * 1.5) return false;
    }
    const options: { cell: number; bit: number; weight: number }[] = [];
    for (const bit of DIRS) {
      const cell = neighbour(n, at, bit);
      if (cell < 0 || used[cell] === 1) continue;
      let onward = 0,
        wrapped = 0;
      for (const b of DIRS) {
        const next = neighbour(n, cell, b);
        if (!free(next)) continue;
        if (next !== at) onward++;
        if (bitCount(passed[next]) === 1 && !(passed[next] & opposite(b))) wrapped++;
      }
      let weight = (bit === dir ? WALK.straight : WALK.turn) * (onward === 0 ? 0.03 : 1 / onward ** WALK.hug) * (1 + WALK.wrap * wrapped);
      // A cell kept for a post is given up only where nothing else is left.
      if (used[cell] === 2) weight *= 0.002;
      // Past its length the walk makes for the edge, where the exit can stand.
      if (exit && path.length >= length && onEdge(n, cell)) weight *= 6;
      options.push({ cell, bit, weight });
    }
    // The ways on, tried in a random order drawn by their weights.
    while (options.length) {
      let pick = random() * options.reduce((sum, o) => sum + o.weight, 0),
        index = options.length - 1;
      for (let i = 0; i < options.length; i++)
        if ((pick -= options[i].weight) < 0) {
          index = i;
          break;
        }
      const [chosen] = options.splice(index, 1),
        saved = { used: used.slice(), passed: passed.slice(), kept };
      enter(chosen.cell);
      if (extend(chosen.bit)) return true;
      path.pop();
      ({ used, passed, kept } = saved);
      if (budget < 0) return false;
    }
    return false;
  };
  enter(first);
  if (!extend(opposite(start.bit))) return null;
  return { path, start, exit: end };
}
/** Whether a mask of sides holds two that meet at a corner (a wrap, rather than two runs on either side). */
const wraps = (mask: number) => !!(mask & (((mask << 1) | (mask >> 3)) & 15));
/**
 * Posts for a walk: `count` cells off the walk that it passes on at least two sides, chosen at random (posts it goes
 * round preferred to posts it only runs past on both sides, posts in the open to posts beside another).
 */
function choosePosts(n: number, path: number[], count: number, wantMore: boolean, random: Random): number[] | null {
  const on = new Uint8Array(n * n);
  for (const cell of path) on[cell] = 1;
  const masks = new Array(n * n).fill(0);
  for (const cell of path)
    for (const bit of DIRS) {
      const at = neighbour(n, cell, bit);
      if (at >= 0 && !on[at]) masks[at] |= opposite(bit);
    }
  const chosen: number[] = [],
    taken = new Uint8Array(n * n);
  for (let k = 0; k < count; k++) {
    const options: { cell: number; weight: number }[] = [];
    for (let cell = 0; cell < n * n; cell++) {
      if (on[cell] || taken[cell] || bitCount(masks[cell]) < 2) continue;
      let weight = (wraps(masks[cell]) ? 2.2 : 1) * (wantMore && bitCount(masks[cell]) >= 3 ? 2.5 : 1);
      for (const bit of DIRS) if (taken[neighbour(n, cell, bit)] && neighbour(n, cell, bit) >= 0) weight *= 0.35;
      options.push({ cell, weight });
    }
    if (!options.length) return null;
    let pick = random() * options.reduce((sum, o) => sum + o.weight, 0),
      cell = options[options.length - 1].cell;
    for (const o of options)
      if ((pick -= o.weight) < 0) {
        cell = o.cell;
        break;
      }
    taken[cell] = 1;
    chosen.push(cell);
  }
  return chosen;
}
/** The walk replayed on a board: whether every post is lit by its end (and the cable stands in the exit). */
function lights(board: State, path: number[]) {
  const { sides } = trace(board, path);
  return board.posts.every((post, i) => bitCount(sides[i]) >= post.need);
}
/** A board laid at random for a stage, before it is judged; null when the walk or the posts did not come out. */
export function lay(stage: number, random: Random): State | null {
  const spec = STAGES[stage - 1],
    n = spec.size,
    length = Math.round(n * n * (spec.share[0] + random() * (spec.share[1] - spec.share[0]))),
    walked = walk(n, length, spec.exit, random, spec.posts[1] + 2);
  if (!walked) return null;
  const cells = choosePosts(n, walked.path, between(spec.posts, random), spec.colours > 0 || spec.counted[1] > 0, random);
  if (!cells) return null;
  const posts: Post[] = cells.map((cell) => ({ cell, colour: WHITE, need: 2 }));
  let board = boardOf(n, stage, posts, walked.start, walked.exit);
  // Colours: posts in a random order, each given a colour where the walk still lights every post.
  if (spec.colours) {
    const want = between(spec.coloured, random),
      order = shuffle([...posts.keys()], random);
    let made = 0;
    for (const i of order) {
      if (made >= want) break;
      // The colour used least so far first (the others after it), so that the colours are mixed.
      const used = (c: number) => posts.filter((p) => p.colour === c).length,
        tries = shuffle([...Array(spec.colours).keys()].map((k) => k + 1), random).sort((a, b) => used(a) - used(b));
      for (const colour of tries) {
        posts[i].colour = colour;
        if (lights(board, walked.path)) break;
        posts[i].colour = WHITE;
      }
      if (posts[i].colour !== WHITE) made++;
    }
    if (made < spec.coloured[0]) return null;
    // Two colours at least, so that the colours mean something.
    if (new Set(posts.map((p) => p.colour).filter(Boolean)).size < Math.min(2, made)) return null;
  }
  // Counted posts: some of those the walk passes on three or four sides need that many.
  if (spec.counted[1]) {
    const want = between(spec.counted, random),
      { sides } = trace(board, walked.path),
      able = shuffle([...posts.keys()].filter((i) => bitCount(sides[i]) >= 3), random);
    if (able.length < spec.counted[0]) return null;
    for (const i of able.slice(0, want)) posts[i].need = bitCount(sides[i]);
  }
  board = boardOf(n, stage, posts, walked.start, walked.exit);
  // The plan: the walk, as far as it takes to win (without an exit the puzzle is won as the last post lights).
  let s = board;
  const plan = [walked.path[0]];
  for (const cell of walked.path.slice(1)) {
    if (s.winner !== null) break;
    const next = play(s, step(cell));
    if (!next) return null;
    s = next;
    plan.push(cell);
  }
  if (s.winner !== 0) return null;
  return { ...board, plan };
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
/** Walkers a board is judged by, how many boards are tried at most, and how many that pass are compared. */
const TRIES = 120,
  BOARDS = 40,
  PICK = 4;
/** Free cells a board leaves that its plan does not use: the fewer, the less room to go wrong in without noticing. */
const spareOf = (s: State) => s.size * s.size - s.posts.length - s.plan.length;
/**
 * A new puzzle of `stage` (1–5): of the first few boards laid on which the random walker gets through no more often
 * than the stage allows, the one with the least spare room; failing those, the least lucky of the boards tried. Its
 * walk, replayed through `play`, solves it and is kept as `plan`.
 */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const at = stageOf(stage),
    spec = STAGES[at - 1];
  // One number is drawn from `random`; the many the laying and judging need come from a quick generator seeded with it.
  random = quick(Math.floor(random() * 4294967296));
  let kept: { state: State; luck: number } | null = null,
    best: State | null = null,
    passed = 0;
  for (let k = 0; (k < BOARDS || !kept) && k < BOARDS * 20 && passed < PICK; k++) {
    const state = lay(at, random);
    if (!state) continue;
    const chance = luck(state, TRIES, random);
    if (chance <= spec.luck) {
      passed++;
      if (!best || spareOf(state) < spareOf(best)) best = state;
    } else if (!kept || chance < kept.luck) kept = { state, luck: chance };
  }
  return best ?? kept!.state;
}

const effect = (s: State): Effect | null => (s.last ? { kind: "place", from: -1, to: s.last.cell, converted: [], removed: [] } : null);
export const lightCable: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.postAt.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => litCount(s),
  hint: (s) => {
    const left = s.posts.length - litCount(s);
    if (!left && s.exit) return "기둥이 모두 켜졌습니다 · 케이블을 출구 소켓까지 끄세요";
    return s.path.length === 1 ? "릴 옆 케이블 끝을 끌어 기둥을 감으세요" : `케이블 끝을 끌어 기둥을 감으세요 · 남은 기둥 ${left}개`;
  },
  tally: () => ["", ""],
  reason: (s) => (s.winner === 0 ? (s.exit ? "성공! 기둥을 모두 밝히고 출구에 꽂았습니다." : "성공! 기둥을 모두 밝혔습니다.") : ""),
};
