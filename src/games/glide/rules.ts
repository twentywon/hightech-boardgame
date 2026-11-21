import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Glide cube, the old ice-sliding puzzle (the kind known from Orbox): a board of tiles floating over a void, one
 * cube on it and one lit exit. A push sends the cube one way, and it slides on cell by cell until something stops it.
 *
 * Cells are numbered row by row from the top left (`r * w + c`); north is up (row − 1). Directions are N 0, E 1,
 * S 2, W 3. What a cell is (`kinds`): AIR (no tile: the void), FLOOR, BLOCK, SLASH ("/") and BACKSLASH ("\") turners,
 * ICE, PORTAL, SWITCH, GATE and GOAL; `tags` gives a portal its pair and a switch or gate its colour (else -1).
 *
 * A push in direction d (one move, `{from: -1, to: d, extra: -1}`, through `play`), exactly:
 * - The cube looks at the next cell q that way. Off the board or AIR: the cube slides off and falls; the puzzle is
 *   lost (`winner` 1, `trouble` says so) and is taken back with undo.
 * - BLOCK, unbroken ICE or a raised GATE: the cube stops where it is, before q. If q is ice, the ice shatters as the
 *   cube strikes it: the cell is open floor from then on. Ice breaks only when a sliding cube strikes it, so a push
 *   straight at a block, ice or a raised gate the cube already touches moves nothing and is refused.
 * - A turner: the cube enters it and leaves at a right angle, both faces alike: "/" turns N↔E and S↔W, "\" turns
 *   N↔W and E↔S. It keeps sliding; it never stops on a turner. If the cell the turner (or a run of turners) sends it
 *   into is a BLOCK, unbroken ICE or a raised GATE, the turner stands as a wall: the cube stops before it and nothing
 *   beyond is struck (ice beyond stays whole). A run of turners that lets out into the void lets the cube fall.
 * - A PORTAL: the cube enters it and comes out of the other portal of its pair, going the same way, and slides on
 *   from there; if the cell after the far portal stops it, it rests on the far portal. A cube starting on a portal
 *   leaves it without being sent anywhere (only entering a portal sends).
 * - A SWITCH: entering it (passing over or stopping on it) raises every lowered gate of its colour and lowers every
 *   raised one, at once. A lowered GATE is floor; a raised one stops the cube like a block.
 * - FLOOR, the GOAL, a lowered gate or broken ice: the cube goes on.
 * - The cube wins only by coming to rest on the GOAL (with something stopping it just beyond); sliding over the
 *   goal is not enough.
 * - A push that would send the cube round for ever (a closed circuit of turners and portals) is refused.
 *
 * A puzzle is laid at random and then climbed (`createGame`): a floating shape of tiles (a blob, a ring, islands or
 * corridors) with blocks, the stage's pieces and a start is changed a cell at a time, and after every change every
 * state the pushes reach (the cube's cell, the ice broken, the gates raised) is searched breadth first. The goal goes
 * on the plain tile the cube first comes to rest on last, so every puzzle can be solved, in exactly `best` pushes. A
 * board is kept when that count reaches the one aimed at in the stage's band and the shortest way uses every piece the
 * stage asks for and enough different pieces, passes enough pushes that fall off, often goes away from the goal, the
 * pushes reach enough states, a player pushing at random seldom finds it (`chance`, worked out exactly) and a greedy
 * one pushing toward the goal does not (`greedily`).
 */
export const N = 0,
  E = 1,
  S = 2,
  W = 3;
export const DR = [-1, 0, 1, 0],
  DC = [0, 1, 0, -1];
export const AIR = 0,
  FLOOR = 1,
  BLOCK = 2,
  SLASH = 3,
  BACKSLASH = 4,
  ICE = 5,
  PORTAL = 6,
  SWITCH = 7,
  GATE = 8,
  GOAL = 9;
/** The way a turner sends a cube that comes in going `dir`. */
export const turned = (dir: number, kind: number) => (kind === SLASH ? dir ^ 1 : 3 - dir);
export const isTurner = (kind: number) => kind === SLASH || kind === BACKSLASH;
/** One cell the cube passes through in a push, in order; `r`, `c` may lie off the board for the cell it falls into. */
export interface Step {
  r: number;
  c: number;
  /** The way the cube goes on from this cell. */
  dir: number;
  /** It was sent here by a portal (from the step before). */
  warp?: boolean;
  /** A turner turned it here. */
  turned?: boolean;
  /** A switch here flipped the gates of this colour. */
  toggle?: number;
}
export interface Slide {
  dir: number;
  /** Where the cube stood before the push. */
  from: number;
  path: Step[];
  /** How it ended: before a block, against ice (which broke), before a raised gate, before a turner standing as a wall, at rest on the goal, or fallen. */
  end: "block" | "ice" | "gate" | "wall" | "goal" | "fall";
  /** The cell that stopped it, or -1. */
  struck: number;
  /** The cell where it rests at last (stopped by `struck`; or, for a fall, the last tile it was on). */
  rest: number;
}
export interface State {
  w: number;
  h: number;
  kinds: number[];
  tags: number[];
  goal: number;
  start: number;
  cube: number;
  /** Ice cells already shattered. */
  broken: number[];
  /** Whether the gates of each colour stand raised. */
  raised: boolean[];
  /** The way the cube fell, once it has. */
  fell: number | null;
  last: Slide | null;
  /** The fewest pushes the puzzle needed as it was laid. */
  best: number;
  stage: number;
  winner: Winner;
  ply: number;
  trouble: string;
}

/*
 * The search's form of a board: plain typed arrays, the ice cells numbered as bits (a bit set is ice broken) and
 * the gate colours as bits (a bit set is raised).
 */
interface Compiled {
  w: number;
  h: number;
  n: number;
  kinds: Uint8Array;
  tags: Int8Array;
  partner: Int16Array;
  iceBit: Int8Array;
  iceCells: number[];
  nIce: number;
  nGates: number;
  goal: number;
  /** The cell beside each cell in each direction (`cell * 4 + dir`), or -1 off the board. */
  nbr: Int16Array;
}
const compiledCache = new WeakMap<number[], Compiled>();
type Board = Pick<State, "w" | "h" | "kinds" | "tags" | "goal" | "raised">;
function compile(state: Board): Compiled {
  const cached = compiledCache.get(state.kinds);
  if (cached && cached.goal === state.goal && cached.nGates === state.raised.length) return cached;
  const out = build(state);
  compiledCache.set(state.kinds, out);
  return out;
}
/** The search's form of a board, made afresh (the board may be changed in place afterwards, as it is while laid). */
function build(state: Board): Compiled {
  const n = state.w * state.h,
    kinds = Uint8Array.from(state.kinds),
    tags = Int8Array.from(state.tags),
    partner = new Int16Array(n).fill(-1),
    iceBit = new Int8Array(n).fill(-1),
    iceCells: number[] = [];
  for (let i = 0; i < n; i++) {
    if (kinds[i] === ICE) {
      iceBit[i] = iceCells.length;
      iceCells.push(i);
    }
    if (kinds[i] === PORTAL)
      for (let j = 0; j < n; j++) if (j !== i && kinds[j] === PORTAL && tags[j] === tags[i]) partner[i] = j;
  }
  const nbr = new Int16Array(n * 4);
  for (let i = 0; i < n; i++)
    for (let d = 0; d < 4; d++) {
      const r = Math.floor(i / state.w) + DR[d],
        c = (i % state.w) + DC[d];
      nbr[i * 4 + d] = r < 0 || c < 0 || r >= state.h || c >= state.w ? -1 : r * state.w + c;
    }
  return { w: state.w, h: state.h, n, kinds, tags, partner, iceBit, iceCells, nIce: iceCells.length, nGates: state.raised.length, goal: state.goal, nbr };
}
const NONE = 0,
  STOP = 1,
  WIN = 2,
  FALL = 3,
  LOOP = 4;
/** What a push came to: `code` (NONE, STOP, WIN, FALL, LOOP) and the cube, ice and gates after it. */
const result = { code: NONE, cube: 0, ice: 0, gates: 0, end: "block" as Slide["end"], struck: -1 };
/**
 * One push of the cube at `cube` going `dir`, with `ice` broken and `gates` raised, by the rules above; the cells
 * passed are written to `trace` when it is given. The result is left in `result`.
 */
function push(b: Compiled, cube: number, ice: number, gates: number, dir: number, trace: Step[] | null) {
  const { w, kinds, tags, partner, iceBit, nbr } = b,
    limit = b.n * 4 * (1 << b.nGates) + 4;
  let p = cube,
    d = dir,
    moved = false;
  for (let steps = 0; ; steps++) {
    if (steps > limit) return finish(LOOP, p, ice, gates, "block", -1);
    const q = nbr[p * 4 + d];
    if (q < 0 || kinds[q] === AIR) {
      trace?.push({ r: Math.floor(p / w) + DR[d], c: (p % w) + DC[d], dir: d });
      return finish(FALL, p, ice, gates, "fall", -1);
    }
    const k = kinds[q];
    if (stopsAt(b, q, ice, gates)) {
      if (!moved) return finish(NONE, p, ice, gates, "block", q);
      if (k === ICE) {
        ice |= 1 << iceBit[q];
        return finish(p === b.goal ? WIN : STOP, p, ice, gates, p === b.goal ? "goal" : "ice", q);
      }
      return finish(p === b.goal ? WIN : STOP, p, ice, gates, p === b.goal ? "goal" : k === GATE ? "gate" : "block", q);
    }
    if (k === SLASH || k === BACKSLASH) {
      // Where the turner, and any turners after it, let the cube out.
      let t = q,
        e = d,
        out = -1;
      for (let guard = 0; guard <= b.n; guard++) {
        e = turned(e, kinds[t]);
        out = nbr[t * 4 + e];
        if (out >= 0 && isTurner(kinds[out])) t = out;
        else break;
      }
      if (out >= 0 && kinds[out] !== AIR && stopsAt(b, out, ice, gates)) {
        if (!moved) return finish(NONE, p, ice, gates, "wall", q);
        return finish(p === b.goal ? WIN : STOP, p, ice, gates, p === b.goal ? "goal" : "wall", q);
      }
      p = q;
      d = turned(d, k);
      moved = true;
      trace?.push({ r: Math.floor(q / w), c: q % w, dir: d, turned: true });
      continue;
    }
    if (k === PORTAL && partner[q] >= 0) {
      trace?.push({ r: Math.floor(q / w), c: q % w, dir: d });
      p = partner[q];
      moved = true;
      trace?.push({ r: Math.floor(p / w), c: p % w, dir: d, warp: true });
      continue;
    }
    if (k === SWITCH) {
      gates ^= 1 << tags[q];
      p = q;
      moved = true;
      trace?.push({ r: Math.floor(q / w), c: q % w, dir: d, toggle: tags[q] });
      continue;
    }
    p = q;
    moved = true;
    trace?.push({ r: Math.floor(q / w), c: q % w, dir: d });
  }
}
/** Whether cell `q` stops the cube: a block, unbroken ice or a raised gate. */
function stopsAt(b: Compiled, q: number, ice: number, gates: number) {
  const k = b.kinds[q];
  return k === BLOCK || (k === ICE && !((ice >> b.iceBit[q]) & 1)) || (k === GATE && ((gates >> b.tags[q]) & 1) === 1);
}
function finish(code: number, cube: number, ice: number, gates: number, end: Slide["end"], struck: number) {
  result.code = code;
  result.cube = cube;
  result.ice = ice;
  result.gates = gates;
  result.end = end;
  result.struck = struck;
}
const iceOf = (b: Compiled, broken: number[]) => broken.reduce((m, cell) => (b.iceBit[cell] >= 0 ? m | (1 << b.iceBit[cell]) : m), 0);
const gatesOf = (raised: boolean[]) => raised.reduce((m, up, i) => (up ? m | (1 << i) : m), 0);
/** What a push of the state's cube going `dir` comes to: "none" (nothing moves), "loop", or the move made. */
export function attempt(state: State, dir: number): "none" | "loop" | "ok" {
  const b = compile(state);
  push(b, state.cube, iceOf(b, state.broken), gatesOf(state.raised), dir, null);
  return result.code === NONE ? "none" : result.code === LOOP ? "loop" : "ok";
}
/** The pushes there are: each way the cube can be sent. */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  return [N, E, S, W].filter((d) => attempt(state, d) === "ok").map((d) => ({ from: -1, to: d, extra: -1 }));
}
/** A push of the cube one way (`to`: N 0, E 1, S 2, W 3), by the rules above; null when it moves nothing or would never stop. */
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to) || move.to < 0 || move.to > 3) return null;
  const b = compile(state),
    path: Step[] = [];
  push(b, state.cube, iceOf(b, state.broken), gatesOf(state.raised), move.to, path);
  if (result.code === NONE || result.code === LOOP) return null;
  const { code, cube, ice, gates, end, struck } = result,
    broken = b.iceCells.filter((_, k) => (ice >> k) & 1),
    raised = state.raised.map((_, i) => ((gates >> i) & 1) === 1),
    fell = code === FALL;
  return {
    ...state,
    cube,
    broken,
    raised,
    fell: fell ? path[path.length - 1].dir : null,
    last: { dir: move.to, from: state.cube, path, end, struck, rest: cube },
    winner: code === WIN ? 0 : fell ? 1 : null,
    trouble: fell ? "거북이가 허공으로 떨어졌습니다." : "",
    ply: state.ply + 1,
  };
}
/** Why a push of mine is refused, or null. */
export function refusal(state: State, move: Move) {
  if (state.winner !== null || move.from !== -1 || move.to < 0 || move.to > 3) return null;
  const tried = attempt(state, move.to);
  return tried === "none" ? "그쪽은 막혀 있습니다." : tried === "loop" ? "그쪽으로 밀면 거북이가 끝없이 돕니다." : null;
}

/*
 * The search over states: the cube's cell, the ice broken and the gates raised, as one number
 * `cube + n * (ice | gates << nIce)`.
 */
interface Searched {
  /** Pushes from the start to each state, -1 where never reached. */
  dist: Int16Array;
  /** The state each was first reached from, and the push that did it. */
  parent: Int32Array;
  via: Int8Array;
  /** States in the order they were reached. */
  order: Int32Array;
  count: number;
  /** For each state reached, how many of its pushes fall off. */
  falls: Int8Array;
  /** The first state found with the cube at rest on the goal, or -1 (only when the goal is searched for). */
  found: number;
}
/**
 * The search's tables, kept between searches (a board is searched thousands of times while it is laid): only the
 * entries a search reached are cleared after it, by the next one. What a search returns holds until the next.
 */
let pool: Searched | null = null;
function search(b: Compiled, cube: number, ice: number, gates: number, toGoal: boolean): Searched {
  const n = b.n,
    size = n << (b.nIce + b.nGates);
  if (!pool || pool.dist.length < size) {
    const room = Math.max(size, 1024);
    pool = { dist: new Int16Array(room).fill(-1), parent: new Int32Array(room).fill(-1), via: new Int8Array(room).fill(-1), order: new Int32Array(room), count: 0, falls: new Int8Array(room), found: -1 };
  } else
    for (let j = 0; j < pool.count; j++) {
      const s = pool.order[j];
      pool.dist[s] = -1;
      pool.parent[s] = -1;
      pool.via[s] = -1;
      pool.falls[s] = 0;
    }
  pool.count = 0;
  const { dist, parent, via, falls, order } = pool,
    key = (c: number, i: number, g: number) => c + n * (i | (g << b.nIce)),
    start = key(cube, ice, gates);
  dist[start] = 0;
  order[0] = start;
  let count = 1,
    found = -1;
  if (toGoal && cube === b.goal) found = start;
  for (let head = 0; head < count && found < 0; head++) {
    const s = order[head],
      c = s % n,
      rest = Math.floor(s / n),
      i = rest & ((1 << b.nIce) - 1),
      g = rest >> b.nIce;
    for (let d = 0; d < 4; d++) {
      push(b, c, i, g, d, null);
      if (result.code === FALL) falls[s]++;
      if (result.code !== STOP && result.code !== WIN) continue;
      const t = key(result.cube, result.ice, result.gates);
      if (dist[t] >= 0) continue;
      dist[t] = dist[s] + 1;
      parent[t] = s;
      via[t] = d;
      order[count++] = t;
      if (toGoal && result.code === WIN) {
        found = t;
        break;
      }
    }
  }
  pool.count = count;
  pool.found = found;
  return pool;
}
/** The pushes from the search's start to state `t`. */
function pathTo(found: Searched, t: number) {
  const out: number[] = [];
  for (let s = t; found.parent[s] >= 0; s = found.parent[s]) out.push(found.via[s]);
  return out.reverse();
}
/** The fewest pushes from a state to the goal, as their directions (empty once solved, null when there is no way). */
export function solve(state: State): number[] | null {
  if (state.winner === 0) return [];
  if (state.winner !== null) return null;
  const b = compile(state),
    found = search(b, state.cube, iceOf(b, state.broken), gatesOf(state.raised), true);
  return found.found < 0 ? null : pathTo(found, found.found);
}
/** The first push of a shortest way to the goal, or null (solved, fallen, or no way left: then undo is the way). */
export function hint(state: State): Move | null {
  const path = solve(state);
  return path && path.length ? { from: -1, to: path[0], extra: -1 } : null;
}

/** What a shortest way may use: turners, ice broken, portals, switches. */
export type Use = "turn" | "ice" | "warp" | "toggle";
/**
 * A stage: the board's size, the fewest pushes its puzzles need (`lo` to `hi`), how full the board is, the pieces
 * laid, and what the shortest way must come to (see `createGame`).
 */
export interface Stage {
  w: number;
  h: number;
  lo: number;
  hi: number;
  /** Share of the board's cells that are tiles, lowest and highest. */
  fill: [number, number];
  turners: [number, number];
  ice: [number, number];
  /** Pairs of portals. */
  portals: [number, number];
  /** Colours of gates, each with its one switch, and how many gates each colour has. */
  colours: [number, number];
  gates: [number, number];
  /** The pieces the shortest way must use, each at least once. */
  needs: Use[];
  /** How many different pieces (cells) the shortest way must pass through or break. */
  touch: number;
  /** How many states along the way must have a push that falls off. */
  traps: number;
  /** How many of the way's pushes must leave the cube further from the goal than it was. */
  away: number;
  /** The most chance a player pushing at random may have of finding the way in twice the fewest pushes. */
  luck: number;
  /** How many states (the cube's place, the ice broken, the gates raised) the pushes must reach at least. */
  states: number;
  /** How many changes a board is climbed through before another is begun. */
  climb: number;
}
export const STAGES: Stage[] = [
  { w: 9, h: 9, lo: 7, hi: 10, fill: [0.6, 0.8], turners: [0, 0], ice: [0, 0], portals: [0, 0], colours: [0, 0], gates: [0, 0], needs: [], touch: 0, traps: 3, away: 1, luck: 0.03, states: 18, climb: 2600 },
  { w: 10, h: 10, lo: 9, hi: 13, fill: [0.6, 0.8], turners: [3, 5], ice: [0, 0], portals: [0, 0], colours: [0, 0], gates: [0, 0], needs: ["turn"], touch: 2, traps: 4, away: 2, luck: 0.025, states: 20, climb: 3200 },
  { w: 10, h: 10, lo: 13, hi: 18, fill: [0.6, 0.8], turners: [2, 4], ice: [2, 4], portals: [0, 0], colours: [0, 0], gates: [0, 0], needs: ["turn", "ice"], touch: 4, traps: 5, away: 3, luck: 0.02, states: 50, climb: 3800 },
  { w: 11, h: 11, lo: 16, hi: 22, fill: [0.58, 0.78], turners: [2, 4], ice: [2, 3], portals: [1, 2], colours: [0, 0], gates: [0, 0], needs: ["turn", "ice", "warp"], touch: 5, traps: 6, away: 4, luck: 0.015, states: 80, climb: 4200 },
  { w: 12, h: 12, lo: 20, hi: 28, fill: [0.58, 0.78], turners: [2, 4], ice: [1, 3], portals: [1, 1], colours: [1, 2], gates: [1, 3], needs: ["turn", "warp", "toggle"], touch: 6, traps: 7, away: 5, luck: 0.01, states: 150, climb: 4800 },
];
/** The stage a variant names (1 to 5). */
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));
const between = (range: [number, number], random: Random) => range[0] + Math.floor(random() * (range[1] - range[0] + 1));
/** A board as it is laid: its cells and tags, where the cube starts and which gate colours stand raised at first. */
interface Draft {
  w: number;
  h: number;
  kinds: number[];
  tags: number[];
  start: number;
  raised: boolean[];
}
const isPiece = (k: number) => k === SLASH || k === BACKSLASH || k === ICE || k === PORTAL || k === SWITCH || k === GATE;
/**
 * A first board of a stage: a floating shape of tiles grown from a few seeds in one of four manners (a compact
 * blob, a ring round a hole of void, islands, or branching corridors), blocks scattered over it and the stage's
 * pieces set on free tiles, the cube on one of them.
 */
function seedBoard(spec: Stage, random: Random): Draft {
  const { w, h } = spec,
    n = w * h,
    kinds = new Array<number>(n).fill(AIR),
    tags = new Array<number>(n).fill(-1),
    target = Math.round(n * (spec.fill[0] + random() * (spec.fill[1] - spec.fill[0]))),
    style = Math.floor(random() * 4),
    rc = (r: number, c: number) => Math.max(0, Math.min(h - 1, Math.floor(r))) * w + Math.max(0, Math.min(w - 1, Math.floor(c))),
    core = (cell: number) => {
      const r = Math.floor(cell / w),
        c = cell % w;
      return style === 1 && Math.abs(r - (h - 1) / 2) < h / 5 && Math.abs(c - (w - 1) / 2) < w / 5;
    },
    around = (cell: number) => {
      let k = 0;
      for (let d = 0; d < 4; d++) {
        const r = Math.floor(cell / w) + DR[d],
          c = (cell % w) + DC[d];
        if (r >= 0 && c >= 0 && r < h && c < w && kinds[r * w + c] !== AIR) k++;
      }
      return k;
    };
  const seeds =
    style === 0
      ? [rc(h / 2 - 1 + random() * 2, w / 2 - 1 + random() * 2)]
      : style === 1
        ? [rc(1, 1 + random() * (w - 2)), rc(h - 2, 1 + random() * (w - 2))]
        : style === 2
          ? [rc(random() * h * 0.4, random() * w * 0.4), rc(h - 1 - random() * h * 0.4, w - 1 - random() * w * 0.4), rc(random() * h, random() * w)]
          : [rc(random() * h, random() * w), rc(random() * h, random() * w)];
  let tiles = 0;
  for (const s of seeds)
    if (kinds[s] === AIR) {
      kinds[s] = FLOOR;
      tiles++;
    }
  // Grown a tile at a time beside those laid: compact shapes favour cells with many tiles around, corridors those
  // with one.
  for (let guard = 0; tiles < target && guard < n * 8; guard++) {
    const cell = Math.floor(random() * n);
    if (kinds[cell] !== AIR || core(cell)) continue;
    const k = around(cell);
    if (!k) continue;
    const weight = style === 3 ? (k === 1 ? 1 : 0.15) : style === 2 ? 0.3 + k * 0.25 : 0.25 + k * 0.25;
    if (random() < weight) {
      kinds[cell] = FLOOR;
      tiles++;
    }
  }
  const free = () => {
    const cells = kinds.flatMap((k, c) => (k === FLOOR ? [c] : []));
    return cells[Math.floor(random() * cells.length)];
  };
  const start = free();
  const put = (kind: number, tag: number) => {
    for (let k = 0; k < 20; k++) {
      const c = free();
      if (c !== start) {
        kinds[c] = kind;
        tags[c] = tag;
        return;
      }
    }
  };
  for (let k = Math.round(tiles * (0.08 + random() * 0.08)); k > 0; k--) put(BLOCK, -1);
  for (let k = between(spec.turners, random); k > 0; k--) put(random() < 0.5 ? SLASH : BACKSLASH, -1);
  for (let k = between(spec.ice, random); k > 0; k--) put(ICE, -1);
  for (let pair = between(spec.portals, random) - 1; pair >= 0; pair--) {
    put(PORTAL, pair);
    put(PORTAL, pair);
  }
  const colours = between(spec.colours, random),
    raised: boolean[] = [];
  for (let colour = 0; colour < colours; colour++) {
    put(SWITCH, colour);
    for (let k = between(spec.gates, random); k > 0; k--) put(GATE, colour);
    raised.push(random() < 0.7);
  }
  return { w, h, kinds, tags, start, raised };
}
/**
 * One small change to a board as it is climbed: a tile turned to a block or back, a tile added at the shape's edge or
 * taken away into the void, a piece carried to another tile (mostly near by), a turner turned the other way or a
 * colour's gates set the other way at first, or the cube's start moved. The pieces stay as many as they were.
 */
function mutate(d: Draft, spec: Stage, random: Random, hot: number[]) {
  const { w, h, kinds, tags } = d,
    n = w * h,
    pick = (ok: (c: number) => boolean) => {
      for (let k = 0; k < 40; k++) {
        const c = Math.floor(random() * n);
        if (c !== d.start && ok(c)) return c;
      }
      return -1;
    },
    near = (p: number, ok: (c: number) => boolean) => {
      for (let k = 0; k < 20; k++) {
        const r = Math.floor(p / w) + Math.floor(random() * 5) - 2,
          c = (p % w) + Math.floor(random() * 5) - 2;
        if (r >= 0 && c >= 0 && r < h && c < w && r * w + c !== d.start && r * w + c !== p && ok(r * w + c)) return r * w + c;
      }
      return -1;
    },
    plain = (c: number) => kinds[c] === FLOOR || kinds[c] === BLOCK,
    swap = (a: number, b: number) => {
      [kinds[a], kinds[b]] = [kinds[b], kinds[a]];
      [tags[a], tags[b]] = [tags[b], tags[a]];
    };
  let tiles = 0;
  for (const k of kinds) if (k !== AIR) tiles++;
  const r = random();
  if (r < 0.42) {
    // Mostly a cell the cube comes to or rests beside, where a change tells.
    const c = hot.length && random() < 0.6 ? hot[Math.floor(random() * hot.length)] : pick(plain);
    if (c === d.start || !plain(c)) return;
    if (c >= 0) kinds[c] = kinds[c] === FLOOR ? BLOCK : FLOOR;
  } else if (r < 0.58) {
    const c = pick((c) => kinds[c] === AIR || plain(c));
    if (c < 0) return;
    if (kinds[c] === AIR) {
      if (tiles < spec.fill[1] * n) kinds[c] = random() < 0.2 ? BLOCK : FLOOR;
    } else if (tiles > spec.fill[0] * n) kinds[c] = AIR;
  } else if (r < 0.86) {
    const pieces = kinds.flatMap((k, c) => (isPiece(k) ? [c] : []));
    if (!pieces.length) {
      const c = pick(plain);
      if (c >= 0) kinds[c] = kinds[c] === FLOOR ? BLOCK : FLOOR;
      return;
    }
    const p = pieces[Math.floor(random() * pieces.length)],
      q = random() < 0.6 ? near(p, (c) => kinds[c] === FLOOR) : pick((c) => kinds[c] === FLOOR);
    if (q >= 0) swap(p, q);
  } else if (r < 0.93) {
    const turners = kinds.flatMap((k, c) => (isTurner(k) ? [c] : []));
    if (d.raised.length && (!turners.length || random() < 0.3)) {
      const k = Math.floor(random() * d.raised.length);
      d.raised[k] = !d.raised[k];
    } else if (turners.length) {
      const c = turners[Math.floor(random() * turners.length)];
      kinds[c] = kinds[c] === SLASH ? BACKSLASH : SLASH;
    }
  } else {
    const c = random() < 0.5 ? near(d.start, (c) => kinds[c] === FLOOR) : pick((c) => kinds[c] === FLOOR);
    if (c >= 0) d.start = c;
  }
}
/** What a way of pushes from the board's start passes: the kinds of piece it uses, and how many pieces (cells). */
function traced(b: Compiled, start: number, gates: number, way: number[]) {
  const used = new Set<Use>(),
    cells = new Map<number, number>(),
    trace: Step[] = [];
  let cube = start,
    ice = 0;
  for (const d of way) {
    trace.length = 0;
    push(b, cube, ice, gates, d, trace);
    if (result.end === "ice") {
      used.add("ice");
      cells.set(result.struck, (cells.get(result.struck) ?? 0) + 1);
    }
    for (const step of trace) {
      const cell = step.r * b.w + step.c;
      if (step.turned) used.add("turn");
      if (step.warp) used.add("warp");
      if (step.toggle !== undefined) used.add("toggle");
      if (step.turned || step.warp || step.toggle !== undefined) cells.set(cell, (cells.get(cell) ?? 0) + 1);
    }
    cube = result.cube;
    ice = result.ice;
    gates = result.gates;
  }
  return { used, pieces: cells.size };
}
/**
 * Whether a greedy player finds the way on a board with its goal: one that always makes the push that leaves the cube
 * nearest the goal (new states first, ties at random), never off the edge, in a few tries of three times the fewest
 * pushes.
 */
function greedy(b: Compiled, start: number, gates: number, best: number, random: Random) {
  const gr = Math.floor(b.goal / b.w),
    gc = b.goal % b.w,
    apart = (cell: number) => Math.abs(Math.floor(cell / b.w) - gr) + Math.abs((cell % b.w) - gc),
    options: number[] = [];
  for (let attempt = 0; attempt < GREEDY_TRIES; attempt++) {
    const seen = new Set<number>();
    let cube = start,
      ice = 0,
      g = gates;
    for (let k = 0; k < 3 * best + 6; k++) {
      options.length = 0;
      for (let d = 0; d < 4; d++) {
        push(b, cube, ice, g, d, null);
        if (result.code === WIN) return true;
        if (result.code === STOP) options.push(result.cube, result.ice, result.gates);
      }
      if (!options.length) break;
      let at = 0,
        least = Infinity,
        ties = 0;
      for (const fresh of [true, false]) {
        for (let i = 0; i < options.length; i += 3) {
          if (fresh && seen.has(options[i] + b.n * (options[i + 1] | (options[i + 2] << b.nIce)))) continue;
          const v = apart(options[i]);
          if (v < least) {
            least = v;
            at = i;
            ties = 1;
          } else if (v === least && random() * ++ties < 1) at = i;
        }
        if (least < Infinity) break;
      }
      cube = options[at];
      ice = options[at + 1];
      g = options[at + 2];
      seen.add(cube + b.n * (ice | (g << b.nIce)));
    }
  }
  return false;
}
/**
 * The chance that a player pushing at random (each push that does not fall alike) brings the cube to rest on the goal
 * within `steps` pushes, worked out exactly over the states the pushes reach.
 */
function luck(b: Compiled, start: number, gates: number, steps: number) {
  const index = new Map<number, number>(),
    keys: number[] = [],
    next: number[][] = [],
    won: boolean[] = [],
    keyOf = (c: number, i: number, g: number) => c + b.n * (i | (g << b.nIce)),
    add = (key: number, win: boolean) => {
      let at = index.get(key);
      if (at === undefined) {
        at = keys.length;
        index.set(key, at);
        keys.push(key);
        next.push([]);
        won.push(win);
      }
      return at;
    };
  add(keyOf(start, 0, gates), start === b.goal);
  for (let at = 0; at < keys.length; at++) {
    if (won[at]) continue;
    const key = keys[at],
      c = key % b.n,
      rest = Math.floor(key / b.n);
    for (let d = 0; d < 4; d++) {
      push(b, c, rest & ((1 << b.nIce) - 1), rest >> b.nIce, d, null);
      if (result.code === STOP || result.code === WIN) next[at].push(add(keyOf(result.cube, result.ice, result.gates), result.code === WIN));
    }
  }
  let now = new Float64Array(keys.length),
    then = new Float64Array(keys.length),
    reached = 0;
  now[0] = 1;
  for (let k = 0; k < steps; k++) {
    then.fill(0);
    for (let at = 0; at < keys.length; at++) {
      const p = now[at];
      if (!p || !next[at].length) continue;
      const share = p / next[at].length;
      for (const to of next[at]) {
        if (won[to]) reached += share;
        else then[to] += share;
      }
    }
    [now, then] = [then, now];
  }
  return reached;
}
/** The chance that pushing at random (never off the edge) wins from the state shown within `steps` pushes. */
export const chance = (state: State, steps: number) => {
  const b = compile(state);
  return state.winner === 0 ? 1 : state.winner !== null ? 0 : luck(b, state.cube, gatesOf(state.raised), steps);
};
/** Whether a greedy player pushing toward the goal finds the way in a few tries (see `greedy`). */
export const greedily = (state: State, random: Random) => greedy(compile(state), state.cube, gatesOf(state.raised), state.best, random);
const GREEDY_TRIES = 24;
/** What a board comes to, judged for climbing: the goal it would take and how well it meets the stage. */
interface Judged {
  score: number;
  goal: number;
  way: number[];
  /** All the stage asks but the naive players' failing; then all of it. */
  ready: boolean;
  done: boolean;
  /** The cells the cube rests on in the states reached, and those beside them. */
  hot: number[];
}
/**
 * Judges a board: every state the pushes reach is searched, and the goal would go on the plain tile the cube first
 * comes to rest on last (the most pushes, no more than the stage's `hi`). The score grows with those pushes, up to the
 * count aimed at, then with the pieces the way uses, the falls beside it, the pushes on it that go away from the goal
 * and the states there are; a board that meets all of it is tried against the naive players.
 */
function judge(d: Draft, spec: Stage, want: number, random: Random, strict: boolean): Judged {
  const b = build({ ...d, goal: -1 }),
    n = b.n,
    gates = gatesOf(d.raised),
    found = search(b, d.start, 0, gates, false),
    first = new Int32Array(n).fill(-1);
  for (let j = 0; j < found.count; j++) {
    const s = found.order[j],
      c = s % n;
    if (first[c] < 0) first[c] = s;
  }
  let goal = -1;
  for (let c = 0; c < n; c++) if (first[c] >= 0 && d.kinds[c] === FLOOR && c !== d.start && found.dist[first[c]] <= spec.hi && (goal < 0 || found.dist[first[c]] > found.dist[first[goal]])) goal = c;
  const hot: number[] = [];
  for (let c = 0; c < n; c++)
    if (first[c] >= 0)
      for (let k = 0; k < 4; k++) {
        const r = Math.floor(c / b.w) + DR[k],
          cc = (c % b.w) + DC[k];
        if (r >= 0 && cc >= 0 && r < b.h && cc < b.w) hot.push(r * b.w + cc);
      }
  if (goal < 0) return { score: -1, goal, way: [], ready: false, done: false, hot };
  const depth = found.dist[first[goal]],
    way = pathTo(found, first[goal]),
    { used, pieces } = traced(b, d.start, gates, way),
    needs = spec.needs.filter((x) => used.has(x)).length;
  let traps = 0,
    away = 0;
  const gr = Math.floor(goal / b.w),
    gc = goal % b.w,
    apart = (cell: number) => Math.abs(Math.floor(cell / b.w) - gr) + Math.abs((cell % b.w) - gc);
  for (let s = first[goal]; found.parent[s] >= 0; s = found.parent[s]) {
    const p = found.parent[s];
    if (found.falls[p] > 0) traps++;
    if (apart(s % n) > apart(p % n)) away++;
  }
  let score =
      4 * Math.min(depth, want) +
      3 * needs +
      Math.min(pieces, spec.touch) +
      0.5 * Math.min(traps, spec.traps) +
      0.7 * Math.min(away, spec.away) +
      12 * Math.min(1, found.count / spec.states) +
      Math.min(found.count, 4 * spec.states) / spec.states,
    done = false,
    lucky = -1;
  const ready = depth >= want && needs === spec.needs.length && pieces >= spec.touch && traps >= spec.traps && away >= spec.away && found.count >= spec.states;
  // Once the way is long enough, how likely a random player is to stumble on it counts too.
  if (depth >= want) {
    const kinds = [...d.kinds];
    kinds[goal] = GOAL;
    const solved = build({ ...d, kinds, goal });
    lucky = luck(solved, d.start, gates, 2 * depth);
    score += 8 * Math.min(1, spec.luck / Math.max(lucky, 1e-9));
    if (ready) done = !strict || (lucky <= spec.luck && !greedy(solved, d.start, gates, depth, random));
  }
  return { score, goal, way, ready, done, hot };
}
/**
 * A puzzle of a stage. A count of pushes is aimed at, drawn evenly from the stage's band; a board is laid
 * (`seedBoard`) and climbed: one change at a time (`mutate`), kept when the board judges no worse (`judge`), and now
 * and then when a little worse (less often as the climb goes on), until the shortest way to its goal takes at least
 * that many pushes and no more than `hi`, uses every piece the stage needs and enough different pieces, passes
 * enough falls and goes away from the goal often enough, and neither a greedy player pushing toward the goal nor a
 * random one finds it. A board that does not get there within `climb` changes is given up for another; after a few,
 * the naive players are no longer asked about, and later only the band counts. Everything follows from one number
 * drawn from `given`, so a sequence of numbers always lays the same puzzle.
 */
export function createGame(stage = 1, given: Random = cryptoRandom): State {
  // One number is drawn from `given`, and a quick generator seeded from it draws the rest: a secure draw for each of
  // the thousands of numbers a board takes cost more than the search itself.
  let seed = Math.floor(given() * 4294967296) >>> 0;
  const random: Random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const k = stageOf(stage),
    spec = STAGES[k - 1],
    want = spec.lo + Math.floor(random() * (spec.hi - spec.lo + 1));
  for (let round = 0; ; round++) {
    // Patience: the count aimed at comes down to the band's foot, then the naive players and the rest stop counting.
    const aim = Math.max(spec.lo, want - round),
      strict = round < STRICT_ROUNDS,
      loose = round >= LOOSE_ROUNDS,
      d = seedBoard(spec, random);
    let cur = judge(d, spec, aim, random, strict),
      top = { d: copy(d), j: cur },
      kept: { d: Draft; j: Judged } | null = null;
    for (let step = 0; step < spec.climb && !cur.done; step++) {
      const saved = copy(d);
      mutate(d, spec, random, cur.hot);
      const next = judge(d, spec, aim, random, strict),
        heat = HEAT * (1 - step / spec.climb) + 0.05;
      if (next.score >= cur.score || random() < Math.exp((next.score - cur.score) / heat)) cur = next;
      else Object.assign(d, saved);
      if (cur.score > top.j.score) top = { d: copy(d), j: cur };
      // A climb that has wandered down from the best it found goes back there now and then.
      else if (step % BACK === BACK - 1 && cur.score < top.j.score) {
        Object.assign(d, copy(top.d));
        cur = top.j;
      }
      if (loose && cur.way.length >= spec.lo && (!kept || cur.score > kept.j.score)) kept = { d: copy(d), j: cur };
    }
    const chosen = cur.done ? { d, j: cur } : kept;
    if (!chosen) continue;
    const kinds = [...chosen.d.kinds];
    kinds[chosen.j.goal] = GOAL;
    const state: State = {
      w: spec.w,
      h: spec.h,
      kinds,
      tags: chosen.d.tags,
      goal: chosen.j.goal,
      start: chosen.d.start,
      cube: chosen.d.start,
      broken: [],
      raised: chosen.d.raised,
      fell: null,
      last: null,
      best: chosen.j.way.length,
      stage: k,
      winner: null,
      ply: 0,
      trouble: "",
    };
    // The goal changes nothing on the way, but the count is made again on the board as it is played.
    const check = solve(state);
    if (check && check.length === state.best && state.best >= spec.lo && state.best <= spec.hi) return state;
  }
}
/** After how many boards the naive players stop counting, and after how many any board in the band will do. */
const STRICT_ROUNDS = 14,
  LOOSE_ROUNDS = 20,
  /** How readily a climb takes a change for the worse at first, and how often it goes back to its best. */
  HEAT = 0.3,
  BACK = 80;
const copy = (d: Draft): Draft => ({ ...d, kinds: [...d.kinds], tags: [...d.tags], raised: [...d.raised] });
const effect = (): Effect | null => null;
export const glide: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => new Array(s.w * s.h).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: () => "밀면 막힐 때까지 미끄러집니다 · 빛나는 출구 위에 거북이를 멈추세요",
  tally: () => ["", ""],
  reason: (s) => (s.winner === 0 ? "성공! 거북이가 출구에 들어갔습니다." : `실패! ${s.trouble}`),
};
