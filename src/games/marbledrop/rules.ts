import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The marble drop maze, a puzzle of the kind ThinkFun sells as Gravity Maze (only the kind of puzzle is taken):
 * wooden towers stand on the plots of a square board so that a marble put into the start tower runs by gravity alone
 * into the goal, a cup set into the board.
 *
 * Heights are whole storeys, 0 being the board. Each plot holds at most one thing:
 * - the start tower (fixed, the tallest): the marble is put in at its top and leaves by its spout at level
 *   `start.level` (one under its top), facing `start.dir`;
 * - a drop tower (낙하탑) of height t: an open cup at its top and one spout at level t − 1, facing its rotation; a
 *   marble that arrives at level t or above falls in and leaves by the spout;
 * - a trough (물길) of height t: a groove across its top at level t, straight (two openings opposite each other) or
 *   a corner (two openings at a right angle); a marble arriving at level t or above through one of its openings
 *   rolls along it and leaves by the other opening at level t;
 * - the goal (fixed, level 0): a marble arriving at any level falls in;
 * - a block (막힌 기둥, fixed): a solid pillar with no opening that stops the marble.
 *
 * The marble's way: after leaving a piece at level s in direction d, it comes to the next plot q. Off the board it is
 * lost; on an empty plot it falls onto the board; a piece whose top is higher than s is a wall it strikes; a block
 * stops it; a plot it has passed already is a loop; a trough with no opening toward it turns it away. Otherwise the
 * piece takes it as above, until it falls into the goal. The puzzle is won when it does with every piece of the tray
 * set on the board and passed through.
 *
 * Directions are 0 north (the far side, a row up), 1 east (a column right), 2 south (toward the player), 3 west. A
 * rotation is a number of quarter turns clockwise seen from above: a drop tower's spout faces `rot`, a straight
 * trough opens to `rot` and `rot + 2` (so it has two rotations, 0 and 1), a corner opens to `rot` and `rot + 1`.
 *
 * Moves (`Move`), where a plot is a number `row × size + column` and the tray's piece `j` is the point `size² + j`:
 * - `{from: size² + j, to: plot}`: tray piece j is put on an empty plot as it stands (its rotation kept);
 * - `{from: plot, to: other}`: the piece of the tray standing on `plot` is carried to the empty plot `other`;
 * - `{from: plot, to: plot}`: that piece is turned a quarter clockwise;
 * - `{from: plot, to: size² + j}`: it is carried off the board back to its own place j in the tray;
 * - `{from: size² + j or plot, to: PUT + other × 4 + rot}`: put or carried to `other` at rotation `rot` (the hint's
 *   move; `other` may be the plot it stands on, to turn it there);
 * - `{from: -1, to: GO}` (or `to` the start tower's plot): the marble is dropped. The run is made here: a run that
 *   fails is not refused but made, with `winner` 1 and a `trouble` saying where and why, to be taken back with undo.
 * `extra` is always -1.
 */
export type Kind = "drop" | "straight" | "corner";
export interface Piece {
  kind: Kind;
  height: number;
  rot: number;
  /** The plot it stands on, or -1 while it lies in the tray. */
  at: number;
}
export interface Stage {
  size: number;
  /** How many pieces the answer's way passes between the start and the goal, from `lo` to `hi`. */
  lo: number;
  hi: number;
  /** How many of them are taken off into the tray. */
  tray: number;
  /** The level of the start tower's spout. */
  spout: number;
}
/** The four stages: a larger board, a longer way and more pieces to set each time. */
export const STAGES: Stage[] = [
  { size: 4, lo: 3, hi: 4, tray: 2, spout: 3 },
  { size: 5, lo: 4, hi: 6, tray: 3, spout: 3 },
  { size: 5, lo: 5, hi: 7, tray: 4, spout: 4 },
  { size: 6, lo: 6, hi: 9, tray: 5, spout: 4 },
];
export const NORTH = 0,
  EAST = 1,
  SOUTH = 2,
  WEST = 3;
/** A block's height, for the table (the rules stop the marble at a block whatever its height): low enough not to hide the plot behind it. */
export const BLOCK_HEIGHT = 3;
/** The tallest a drop tower or a trough stands. */
export const MAX_HEIGHT = 4;
/** Moves that are not points of the board. */
export const GO = 900,
  PUT = 1000;
export const put = (plot: number, rot: number) => PUT + plot * 4 + rot;
const DR = [-1, 0, 1, 0],
  DC = [0, 1, 0, -1];
/** The plot beside `plot` in direction `dir`, or -1 off the board. */
export function neighbour(size: number, plot: number, dir: number) {
  const r = Math.floor(plot / size) + DR[dir],
    c = (plot % size) + DC[dir];
  return r < 0 || c < 0 || r >= size || c >= size ? -1 : r * size + c;
}
export const back = (dir: number) => (dir + 2) % 4;
/** How many rotations of a piece look different: a straight trough is the same turned half round. */
export const turnsOf = (kind: Kind) => (kind === "straight" ? 2 : 4);
export const normal = (kind: Kind, rot: number) => ((rot % turnsOf(kind)) + turnsOf(kind)) % turnsOf(kind);
/** The sides a trough opens to. */
export const openings = (kind: Kind, rot: number) => (kind === "straight" ? [rot % 4, (rot + 2) % 4] : kind === "corner" ? [rot % 4, (rot + 1) % 4] : []);
/** The tray's piece j as a point (a tray place), and back. */
export const slot = (state: Pick<State, "size">, j: number) => state.size * state.size + j;
export interface State {
  size: number;
  start: { at: number; level: number; dir: number };
  goal: number;
  blocks: number[];
  /** The answer's pieces left standing from the start, which stay as they are. */
  given: Piece[];
  /** The pieces to set: in the tray (`at` -1) or on the board. */
  tray: Piece[];
  /** Where each piece of the tray belongs, and turned how (normalised). */
  answer: { at: number; rot: number }[];
  /** What the last move did, for the table to show it. */
  last: { kind: "put" | "carry" | "back" | "turn" | "go"; piece: number; from: number; to: number } | null;
  /** The marble's way when it was dropped last. */
  run: Run | null;
  trouble: Trouble | null;
  winner: Winner;
  ply: number;
  stage: number;
}
export type Fault = "off" | "floor" | "wall" | "block" | "loop" | "closed" | "left" | "unused";
/** One thing the marble passed: where, what, the level it came at and from which way, and how it left. */
export interface Leg {
  at: number;
  kind: Kind | "start" | "goal";
  height: number;
  rot: number;
  /** The level it came at (the start: its top) and the way it was going (-1 at the start). */
  level: number;
  from: number;
  /** The level and direction it left by (-1 at the goal). */
  out: number;
  dir: number;
}
export interface Run {
  legs: Leg[];
  /** What went wrong after the last leg, or null when the marble fell into the goal. */
  fault: Fault | null;
  /** The plot it went wrong at (-1 off the board). */
  at: number;
}
export interface Trouble {
  fault: Fault;
  /** The plot of the trouble (-1 off the board, or the goal for pieces left over). */
  at: number;
  /** The tray's pieces the trouble is about (left in the tray, or not passed). */
  culprits: number[];
}
type Thing =
  | { kind: "start"; level: number; dir: number }
  | { kind: "goal" }
  | { kind: "block" }
  | { kind: Kind; height: number; rot: number; piece: number };
/** The top of a thing, in storeys. */
const topOf = (thing: Thing) => (thing.kind === "start" ? thing.level + 1 : thing.kind === "goal" ? 0 : thing.kind === "block" ? BLOCK_HEIGHT : thing.height);
/** What stands on every plot: the fixed things, the given pieces, and the tray's pieces set down (`piece` their index, -1 given). */
export function board(state: Pick<State, "size" | "start" | "goal" | "blocks" | "given" | "tray">): (Thing | null)[] {
  const grid: (Thing | null)[] = new Array(state.size * state.size).fill(null);
  grid[state.start.at] = { kind: "start", level: state.start.level, dir: state.start.dir };
  grid[state.goal] = { kind: "goal" };
  for (const b of state.blocks) grid[b] = { kind: "block" };
  for (const p of state.given) grid[p.at] = { kind: p.kind, height: p.height, rot: p.rot, piece: -1 };
  state.tray.forEach((p, j) => {
    if (p.at >= 0) grid[p.at] = { kind: p.kind, height: p.height, rot: p.rot, piece: j };
  });
  return grid;
}
/** How a piece takes a marble coming at level `s` going `d`: where it sends it, or why not. */
function take(kind: Kind, height: number, rot: number, s: number, d: number): { out: number; dir: number } | "wall" | "closed" {
  if (height > s) return "wall";
  if (kind === "drop") return { out: height - 1, dir: rot % 4 };
  const ways = openings(kind, rot),
    came = back(d);
  if (!ways.includes(came)) return "closed";
  return { out: height, dir: ways[0] === came ? ways[1] : ways[0] };
}
/** The marble's way from the start tower, as far as it goes. */
export function follow(state: Pick<State, "size" | "start" | "goal" | "blocks" | "given" | "tray">): Run {
  const grid = board(state),
    { start, size } = state,
    seen = new Set<number>([start.at]),
    legs: Leg[] = [{ at: start.at, kind: "start", height: start.level + 1, rot: start.dir, level: start.level + 1, from: -1, out: start.level, dir: start.dir }];
  let p = start.at,
    s = start.level,
    d = start.dir;
  for (;;) {
    const q = neighbour(size, p, d);
    if (q < 0) return { legs, fault: "off", at: -1 };
    const thing = grid[q];
    if (!thing) return { legs, fault: "floor", at: q };
    if (thing.kind === "goal") {
      legs.push({ at: q, kind: "goal", height: 0, rot: 0, level: s, from: d, out: -1, dir: -1 });
      return { legs, fault: null, at: q };
    }
    if (thing.kind === "block") return { legs, fault: "block", at: q };
    if (topOf(thing) > s) return { legs, fault: "wall", at: q };
    if (seen.has(q) || thing.kind === "start") return { legs, fault: "loop", at: q };
    const taken = take(thing.kind, thing.height, thing.rot, s, d);
    if (taken === "wall" || taken === "closed") return { legs, fault: taken, at: q };
    legs.push({ at: q, kind: thing.kind, height: thing.height, rot: thing.rot, level: s, from: d, out: taken.out, dir: taken.dir });
    seen.add(q);
    p = q;
    s = taken.out;
    d = taken.dir;
  }
}
/** What a drop of the marble comes to: its way, and the trouble (null when it is a win). */
export function judge(state: State): { run: Run; trouble: Trouble | null } {
  const run = follow(state);
  if (run.fault) return { run, trouble: { fault: run.fault, at: run.at, culprits: [] } };
  const left = state.tray.flatMap((p, j) => (p.at < 0 ? [j] : []));
  if (left.length) return { run, trouble: { fault: "left", at: state.goal, culprits: left } };
  const passed = new Set(run.legs.map((leg) => leg.at)),
    unused = state.tray.flatMap((p, j) => (passed.has(p.at) ? [] : [j]));
  if (unused.length) return { run, trouble: { fault: "unused", at: state.goal, culprits: unused } };
  return { run, trouble: null };
}
/** The tray's piece standing on a plot, or -1. */
export const pieceOn = (state: Pick<State, "tray">, plot: number) => state.tray.findIndex((p) => p.at === plot);
/** Whether nothing stands on a plot. */
export function empty(state: State, plot: number) {
  if (plot < 0 || plot >= state.size * state.size) return false;
  if (plot === state.start.at || plot === state.goal || state.blocks.includes(plot)) return false;
  return !state.given.some((p) => p.at === plot) && !state.tray.some((p) => p.at === plot);
}
/** Every move there is (the rotated puts of a hint are made by `play` too, but not listed). */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const n = state.size * state.size,
    free = Array.from({ length: n }, (_, i) => i).filter((i) => empty(state, i)),
    out: Move[] = [];
  state.tray.forEach((p, j) => {
    if (p.at < 0) for (const to of free) out.push({ from: n + j, to, extra: -1 });
    else {
      out.push({ from: p.at, to: p.at, extra: -1 });
      for (const to of free) out.push({ from: p.at, to, extra: -1 });
      out.push({ from: p.at, to: n + j, extra: -1 });
    }
  });
  out.push({ from: -1, to: GO, extra: -1 }, { from: -1, to: state.start.at, extra: -1 });
  return out;
}
/** A move of a piece or the drop of the marble; null (and the state left alone) when it may not be made. */
export function play(state: State, move: Move): State | null {
  const { from, to } = move,
    n = state.size * state.size;
  if (state.winner !== null || move.extra !== -1 || !Number.isInteger(from) || !Number.isInteger(to)) return null;
  const done = (tray: Piece[], last: State["last"]): State => ({ ...state, tray, last, run: null, trouble: null, ply: state.ply + 1 });
  if (from === -1) {
    if (to !== GO && to !== state.start.at) return null;
    const { run, trouble } = judge(state);
    return { ...state, last: { kind: "go", piece: -1, from: -1, to: -1 }, run, trouble, winner: trouble ? 1 : 0, ply: state.ply + 1 };
  }
  // The piece the move is of: one in the tray (by its place there) or one of the tray's on the board (by its plot).
  const j = from >= n ? from - n : pieceOn(state, from);
  if (j < 0 || j >= state.tray.length || (from >= n && state.tray[j].at >= 0)) return null;
  const piece = state.tray[j],
    tray = state.tray.map((p) => ({ ...p }));
  if (to >= PUT) {
    const plot = Math.floor((to - PUT) / 4),
      rot = (to - PUT) % 4;
    if (plot >= n || (plot !== piece.at && !empty(state, plot))) return null;
    if (plot === piece.at && normal(piece.kind, rot) === normal(piece.kind, piece.rot)) return null;
    tray[j] = { ...piece, at: plot, rot: normal(piece.kind, rot) };
    return done(tray, { kind: piece.at < 0 ? "put" : plot === piece.at ? "turn" : "carry", piece: j, from: piece.at, to: plot });
  }
  if (to === n + j) {
    if (piece.at < 0) return null;
    tray[j] = { ...piece, at: -1 };
    return done(tray, { kind: "back", piece: j, from: piece.at, to: -1 });
  }
  if (to < 0 || to >= n) return null;
  if (to === piece.at) {
    tray[j] = { ...piece, rot: normal(piece.kind, piece.rot + 1) };
    return done(tray, { kind: "turn", piece: j, from: to, to });
  }
  if (!empty(state, to)) return null;
  tray[j] = { ...piece, at: to };
  return done(tray, { kind: piece.at < 0 ? "put" : "carry", piece: j, from: piece.at, to });
}

/*
 * Laying a puzzle.
 */
interface Layout {
  size: number;
  start: State["start"];
  goal: number;
  blocks: number[];
  given: Piece[];
}
/** A piece set by a way the marble could take: where, what and turned how (normalised). */
export interface Placement {
  at: number;
  kind: Kind;
  height: number;
  rot: number;
}
const placementKey = (list: Placement[]) =>
  list
    .map((p) => `${p.at}:${p.kind}:${p.height}:${p.rot}`)
    .sort()
    .join("|");
/**
 * The ways of setting the pieces `pieces` (kinds and heights) on a layout so that the marble falls into the goal with
 * every one of them passed, up to `cap` of them: the marble is followed from the start, and wherever its way comes to
 * an empty plot each distinct piece left is tried there in each of its distinct rotations that takes it.
 */
export function solutions(layout: Layout, pieces: { kind: Kind; height: number }[], cap = 2): Placement[][] {
  const { size } = layout,
    grid = board({ ...layout, tray: [] }),
    seen = new Uint8Array(size * size),
    kinds: { kind: Kind; height: number; left: number }[] = [],
    placed: Placement[] = [],
    found: Placement[][] = [];
  for (const p of pieces) {
    const same = kinds.find((k) => k.kind === p.kind && k.height === p.height);
    if (same) same.left++;
    else kinds.push({ kind: p.kind, height: p.height, left: 1 });
  }
  let remaining = pieces.length;
  seen[layout.start.at] = 1;
  const go = (p: number, s: number, d: number) => {
    if (found.length >= cap) return;
    const q = neighbour(size, p, d);
    if (q < 0 || seen[q]) return;
    const thing = grid[q];
    if (thing) {
      if (thing.kind === "goal") {
        if (!remaining) found.push(placed.slice());
        return;
      }
      if (thing.kind === "block" || thing.kind === "start") return;
      const taken = take(thing.kind, thing.height, thing.rot, s, d);
      if (typeof taken === "string") return;
      seen[q] = 1;
      go(q, taken.out, taken.dir);
      seen[q] = 0;
      return;
    }
    if (!remaining) return;
    for (const k of kinds) {
      if (!k.left || k.height > s) continue;
      for (let rot = 0; rot < turnsOf(k.kind); rot++) {
        const taken = take(k.kind, k.height, rot, s, d);
        if (typeof taken === "string") continue;
        const next = neighbour(size, q, taken.dir);
        if (next < 0 || seen[next]) continue;
        grid[q] = { kind: k.kind, height: k.height, rot, piece: 0 };
        seen[q] = 1;
        k.left--;
        remaining--;
        placed.push({ at: q, kind: k.kind, height: k.height, rot });
        go(q, taken.out, taken.dir);
        placed.pop();
        remaining++;
        k.left++;
        seen[q] = 0;
        grid[q] = null;
        if (found.length >= cap) return;
      }
    }
  };
  go(layout.start.at, layout.start.level, layout.start.dir);
  return found;
}
const pick = <X>(items: X[], random: Random) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
const shuffled = <X>(items: X[], random: Random) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
/** The stage a variant names (1 to 4). */
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));
/**
 * A way from a start tower to a goal, built forward from the start's spout: at each step the next plot must be on
 * the board and free, and a piece is chosen there that takes the marble as it comes (a drop tower no higher than its
 * level whose spout does not point back, or a trough no higher with an opening toward it, straight on or turned), until
 * the way is as long as was drawn and the goal can be set on the next plot. Null at a dead end.
 */
function lay(stage: Stage, random: Random): { start: State["start"]; goal: number; pieces: Piece[] } | null {
  const { size, lo, hi, spout } = stage,
    length = lo + Math.min(hi - lo, Math.floor(random() * (hi - lo + 1))),
    at = Math.floor(random() * size * size),
    dirs = [0, 1, 2, 3].filter((d) => neighbour(size, at, d) >= 0),
    start = { at, level: spout, dir: pick(dirs, random) },
    used = new Set<number>([at]),
    pieces: Piece[] = [];
  let p = at,
    s = spout,
    d = start.dir;
  const open = (plot: number) => plot >= 0 && !used.has(plot);
  for (let i = 0; i < length; i++) {
    const q = neighbour(size, p, d);
    if (!open(q)) return null;
    const last = i === length - 1,
      options: { piece: Piece; out: number; dir: number; weight: number }[] = [];
    for (let t = 1; t <= Math.min(MAX_HEIGHT, s); t++) {
      // A drop tower: down a storey at least; down to the board only just before the goal.
      if (t > 1 || last)
        for (let e = 0; e < 4; e++) {
          if (e === back(d) || !open(neighbour(size, q, e))) continue;
          options.push({ piece: { kind: "drop", height: t, rot: e, at: q }, out: t - 1, dir: e, weight: 0.8 });
        }
      // A trough: straight on, or turned to either side.
      if (open(neighbour(size, q, d))) options.push({ piece: { kind: "straight", height: t, rot: d % 2, at: q }, out: t, dir: d, weight: 0.7 });
      for (const e of [(d + 1) % 4, (d + 3) % 4]) {
        if (!open(neighbour(size, q, e))) continue;
        const ways = [back(d), e],
          rot = (ways[0] + 1) % 4 === ways[1] ? ways[0] : ways[1];
        options.push({ piece: { kind: "corner", height: t, rot, at: q }, out: t, dir: e, weight: 0.55 });
      }
    }
    if (!options.length) return null;
    let roll = random() * options.reduce((sum, o) => sum + o.weight, 0),
      chosen = options[options.length - 1];
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) {
        chosen = option;
        break;
      }
    }
    pieces.push(chosen.piece);
    used.add(q);
    p = q;
    s = chosen.out;
    d = chosen.dir;
  }
  const goal = neighbour(size, p, d);
  return open(goal) ? { start, goal, pieces } : null;
}
/** How each kind of piece first lies in the tray: a drop tower's spout toward the player, a trough across. */
export const TRAY_ROT: Record<Kind, number> = { drop: SOUTH, straight: EAST % 2, corner: EAST };
const ORDER: Kind[] = ["drop", "straight", "corner"];
/** The most blocks set to rule out other answers before another choice of the tray's pieces is tried. */
const MAX_BLOCKS = 5;
/**
 * A puzzle of a stage with exactly one answer: a way is laid, the stage's count of its pieces are taken off into
 * the tray, and while another way of setting them also leads the marble home, a block is set on a plot that way
 * uses and the answer does not. When no such plot is left, the tray is chosen again, and then the way laid again.
 */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const k = stageOf(stage),
    spec = STAGES[k - 1];
  for (let tries = 0; ; tries++) {
    const laid = lay(spec, random);
    if (!laid) continue;
    const path = new Set([laid.start.at, laid.goal, ...laid.pieces.map((p) => p.at)]);
    for (let choice = 0; choice < 4; choice++) {
      const taken = new Set(shuffled(laid.pieces.map((_, i) => i), random).slice(0, spec.tray)),
        given = laid.pieces.filter((_, i) => !taken.has(i)),
        // The tray is sorted by kind and height, so that it tells nothing of the order of the way.
        loose = laid.pieces.filter((_, i) => taken.has(i)).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.height - b.height),
        answerKey = placementKey(loose.map((p) => ({ at: p.at, kind: p.kind, height: p.height, rot: normal(p.kind, p.rot) }))),
        blocks: number[] = [];
      for (;;) {
        const layout = { size: spec.size, start: laid.start, goal: laid.goal, blocks, given },
          found = solutions(layout, loose, 2);
        if (found.length === 1 && placementKey(found[0]) === answerKey)
          return {
            size: spec.size,
            start: laid.start,
            goal: laid.goal,
            blocks: [...blocks].sort((a, b) => a - b),
            given,
            tray: loose.map((p) => ({ kind: p.kind, height: p.height, rot: normal(p.kind, TRAY_ROT[p.kind]), at: -1 })),
            answer: loose.map((p) => ({ at: p.at, rot: normal(p.kind, p.rot) })),
            last: null,
            run: null,
            trouble: null,
            winner: null,
            ply: 0,
            stage: k,
          };
        const rival = found.find((f) => placementKey(f) !== answerKey);
        const spare = rival ? rival.map((p) => p.at).filter((plot) => !path.has(plot) && !blocks.includes(plot)) : [];
        if (!spare.length || blocks.length >= MAX_BLOCKS) break;
        blocks.push(pick(spare, random));
      }
    }
  }
}
/** Whether piece j of the tray stands where the answer has a piece of its kind and height (whatever its turn). */
function onItsPlace(state: State, j: number) {
  const p = state.tray[j];
  return p.at >= 0 && state.answer.some((a, i) => a.at === p.at && state.tray[i].kind === p.kind && state.tray[i].height === p.height);
}
/**
 * The next step toward the answer: the tray's first piece of the answer that is missing or wrong (in the tray's
 * order) is put on its plot at its rotation, from the tray or from wherever a like piece stands wrongly; a piece in
 * the way is carried where it belongs or back to the tray; one standing right but turned wrong is turned there. Once
 * every piece is right, the marble is dropped. Null when the puzzle is over.
 */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const n = state.size * state.size,
    like = (i: number, j: number) => state.tray[i].kind === state.tray[j].kind && state.tray[i].height === state.tray[j].height;
  for (let j = 0; j < state.tray.length; j++) {
    const want = state.answer[j],
      there = pieceOn(state, want.at);
    if (there >= 0 && like(there, j)) {
      if (normal(state.tray[there].kind, state.tray[there].rot) === want.rot) continue;
      return { from: want.at, to: put(want.at, want.rot), extra: -1 };
    }
    if (there >= 0) {
      // Something else stands there: to an empty plot where the answer wants it, or back into the tray.
      const home = state.answer.findIndex((a, i) => like(i, there) && empty(state, a.at));
      return home >= 0 ? { from: want.at, to: put(state.answer[home].at, state.answer[home].rot), extra: -1 } : { from: want.at, to: n + there, extra: -1 };
    }
    const sources = state.tray.flatMap((p, i) => (like(i, j) && !onItsPlace(state, i) ? [i] : [])),
      source = sources.find((i) => state.tray[i].at < 0) ?? sources[0];
    if (source === undefined) continue;
    const at = state.tray[source].at;
    return { from: at < 0 ? n + source : at, to: put(want.at, want.rot), extra: -1 };
  }
  return { from: -1, to: GO, extra: -1 };
}
/** The answer as moves from a state with every piece in the tray (for tests and the hint's checks). */
export function solve(state: State): Move[] {
  const out: Move[] = [];
  let s: State | null = state;
  for (let guard = 0; s && guard < 64; guard++) {
    const move = hint(s);
    if (!move) break;
    out.push(move);
    if (move.to === GO) break;
    s = play(s, move);
  }
  return out;
}
const WHY: Record<Fault, string> = {
  off: "구슬이 판 밖으로 굴러 나갔습니다.",
  floor: "구슬이 빈자리에 떨어졌습니다.",
  wall: "구슬이 더 높은 부품의 벽에 부딪혔습니다.",
  block: "구슬이 막힌 기둥에 막혔습니다.",
  loop: "구슬이 지나온 자리로 되돌아왔습니다.",
  closed: "물길이 구슬이 오는 쪽으로 열려 있지 않습니다.",
  left: "구슬은 컵에 들어갔지만 아직 놓지 않은 부품이 있습니다.",
  unused: "구슬은 컵에 들어갔지만 구슬이 지나가지 않은 부품이 있습니다.",
};
/** Why a drop failed, in a sentence. */
export const why = (fault: Fault) => WHY[fault];
const effect = (): Effect | null => null;
export const marbleDrop: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => new Array<null>(s.size * s.size).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: () => "부품을 판에 놓고 돌려 길을 이은 뒤, 출발탑의 깔때기를 눌러 구슬을 넣으세요",
  tally: () => ["", ""],
  reason: (s) => (s.winner === 0 ? "성공! 구슬이 모든 부품을 지나 도착 컵에 들어갔습니다." : `실패! ${s.trouble ? why(s.trouble.fault) : ""}`),
};
