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
 * A puzzle is laid at random: a floating shape of tiles with holes, blocks and the stage's pieces, a start, and then
 * every state the pushes reach (the cube's cell, the ice broken, the gates raised) is searched breadth first. The
 * goal is put on a plain tile where the cube first comes to rest after a number of pushes in the stage's band, so
 * every puzzle can be solved, in exactly `best` pushes; it is kept only when the way there uses the stage's newest
 * piece and wrong pushes along it fall off.
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
}
const compiledCache = new WeakMap<number[], Compiled>();
function compile(state: Pick<State, "w" | "h" | "kinds" | "tags" | "goal" | "raised">): Compiled {
  const cached = compiledCache.get(state.kinds);
  if (cached && cached.goal === state.goal && cached.nGates === state.raised.length) return cached;
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
  const out = { w: state.w, h: state.h, n, kinds, tags, partner, iceBit, iceCells, nIce: iceCells.length, nGates: state.raised.length, goal: state.goal };
  compiledCache.set(state.kinds, out);
  return out;
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
  const { w, h, kinds, tags, partner, iceBit } = b,
    stops = (q: number) => {
      const k = kinds[q];
      return k === BLOCK || (k === ICE && !((ice >> iceBit[q]) & 1)) || (k === GATE && ((gates >> tags[q]) & 1) === 1);
    },
    next = (p: number, d: number) => {
      const r = Math.floor(p / w) + DR[d],
        c = (p % w) + DC[d];
      return r < 0 || c < 0 || r >= h || c >= w ? -1 : r * w + c;
    },
    limit = b.n * 4 * (1 << b.nGates) + 4;
  let p = cube,
    d = dir,
    moved = false;
  const finish = (code: number, end: Slide["end"], struck: number) => {
    result.code = code;
    result.cube = p;
    result.ice = ice;
    result.gates = gates;
    result.end = end;
    result.struck = struck;
  };
  for (let steps = 0; ; steps++) {
    if (steps > limit) return finish(LOOP, "block", -1);
    const q = next(p, d);
    if (q < 0 || kinds[q] === AIR) {
      trace?.push({ r: Math.floor(p / w) + DR[d], c: (p % w) + DC[d], dir: d });
      return finish(FALL, "fall", -1);
    }
    const k = kinds[q];
    if (stops(q)) {
      if (!moved) return finish(NONE, "block", q);
      if (k === ICE) {
        ice |= 1 << iceBit[q];
        return finish(p === b.goal ? WIN : STOP, p === b.goal ? "goal" : "ice", q);
      }
      return finish(p === b.goal ? WIN : STOP, p === b.goal ? "goal" : k === GATE ? "gate" : "block", q);
    }
    if (isTurner(k)) {
      // Where the turner, and any turners after it, let the cube out.
      let t = q,
        e = d,
        out = -1;
      for (let guard = 0; guard <= b.n; guard++) {
        e = turned(e, kinds[t]);
        out = next(t, e);
        if (out >= 0 && isTurner(kinds[out])) t = out;
        else break;
      }
      if (out >= 0 && kinds[out] !== AIR && stops(out)) {
        if (!moved) return finish(NONE, "wall", q);
        return finish(p === b.goal ? WIN : STOP, p === b.goal ? "goal" : "wall", q);
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
function search(b: Compiled, cube: number, ice: number, gates: number, toGoal: boolean): Searched {
  const n = b.n,
    size = n << (b.nIce + b.nGates),
    dist = new Int16Array(size).fill(-1),
    parent = new Int32Array(size).fill(-1),
    via = new Int8Array(size).fill(-1),
    falls = new Int8Array(size),
    order = new Int32Array(size),
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
  return { dist, parent, via, order, count, falls, found };
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

/** A stage: the board's size, the fewest pushes its puzzles need (`lo` to `hi`) and the pieces laid. */
export interface Stage {
  w: number;
  h: number;
  lo: number;
  hi: number;
  /** Share of the tiles that are blocks. */
  blocks: number;
  turners: [number, number];
  ice: [number, number];
  portals: number;
  /** Gates of one colour and their switch: how many gates (0 for none). */
  gates: [number, number];
  /** The piece the way to the goal must use. */
  needs: "none" | "turn" | "ice" | "warp" | "toggle";
  /** How many states along the way to the goal must have a push that falls off. */
  traps: number;
}
export const STAGES: Stage[] = [
  { w: 7, h: 7, lo: 3, hi: 5, blocks: 0.13, turners: [0, 0], ice: [0, 0], portals: 0, gates: [0, 0], needs: "none", traps: 2 },
  { w: 8, h: 8, lo: 5, hi: 8, blocks: 0.12, turners: [2, 4], ice: [0, 0], portals: 0, gates: [0, 0], needs: "turn", traps: 3 },
  { w: 8, h: 8, lo: 7, hi: 11, blocks: 0.12, turners: [1, 3], ice: [2, 3], portals: 0, gates: [0, 0], needs: "ice", traps: 3 },
  { w: 9, h: 9, lo: 9, hi: 13, blocks: 0.11, turners: [1, 3], ice: [1, 3], portals: 1, gates: [0, 0], needs: "warp", traps: 4 },
  { w: 9, h: 9, lo: 12, hi: 18, blocks: 0.11, turners: [1, 3], ice: [1, 2], portals: 1, gates: [1, 3], needs: "toggle", traps: 4 },
];
/** The stage a variant names (1 to 5). */
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));
const between = (range: [number, number], random: Random) => range[0] + Math.floor(random() * (range[1] - range[0] + 1));
/**
 * A board of a stage laid at random, without its goal: a walk of pushes is laid first (runs over new tiles, each
 * ended by a block or ice set just beyond it, now and then turned by a turner, sent on by a portal or let through a
 * gate by a switch passed earlier), then tiles are grown round it at random, a few blocks and pieces scattered over
 * them as decoys, and everything else left as the void. The search then finds what the board really needs.
 */
function lay(stage: Stage, random: Random) {
  const { w, h } = stage,
    n = w * h,
    UNSET = -1,
    kinds = new Array<number>(n).fill(UNSET),
    tags = new Array<number>(n).fill(-1),
    next = (p: number, d: number) => {
      const r = Math.floor(p / w) + DR[d],
        c = (p % w) + DC[d];
      return r < 0 || c < 0 || r >= h || c >= w ? -1 : r * w + c;
    },
    open = (c: number) => c >= 0 && (kinds[c] === UNSET || kinds[c] === FLOOR),
    stopper = (c: number) => c >= 0 && (kinds[c] === BLOCK || kinds[c] === ICE),
    pick = <X>(items: X[]) => items[Math.floor(random() * items.length)];
  /** The cells of a run of `len` from `p` going `d`, or null when one is taken. */
  const run = (p: number, d: number, len: number) => {
    const cells: number[] = [];
    for (let i = 0; i < len; i++) {
      p = next(p, d);
      if (!open(p)) return null;
      cells.push(p);
    }
    return cells;
  };
  const turnersMax = stage.turners[1],
    iceMax = stage.ice[1];
  let turners = 0,
    ice = 0,
    portal = stage.portals === 0,
    switched = stage.gates[1] === 0,
    gated = stage.gates[1] === 0,
    p = Math.floor(h / 2 - 1 + random() * 2) * w + Math.floor(random() * w),
    prev = -1;
  const start = p;
  kinds[p] = FLOOR;
  const stopAt = (c: number) => {
    if (kinds[c] !== UNSET) return;
    if (ice < iceMax && random() < 0.4) {
      kinds[c] = ICE;
      ice++;
    } else kinds[c] = BLOCK;
  };
  for (let step = 0, tries = 0; step < stage.hi + 3 && tries < 200; tries++) {
    const d = pick([N, E, S, W].filter((x) => x !== prev)),
      cells = run(p, d, 1 + Math.floor(random() * 4));
    if (!cells) continue;
    let end = cells[cells.length - 1],
      way = d;
    const extra: { cell: number; kind: number; tag: number }[] = [];
    let more: number[] = [];
    if (!portal && step >= 1 && random() < 0.35) {
      // Into a portal just beyond the run, and out of its partner somewhere free, on the same way.
      const a = next(end, d),
        others = kinds.map((_, c) => c).filter((c) => kinds[c] === UNSET && c !== a && Math.abs((c % w) - (end % w)) + Math.abs(Math.floor(c / w) - Math.floor(end / w)) > 3),
        b = others.length ? pick(others) : -1,
        after = b >= 0 && a >= 0 && kinds[a] === UNSET ? run(b, d, 1 + Math.floor(random() * 3)) : null;
      if (!after || after.includes(a)) continue;
      extra.push({ cell: a, kind: PORTAL, tag: 0 }, { cell: b, kind: PORTAL, tag: 0 });
      more = after;
      end = after[after.length - 1];
    } else if (turners < turnersMax && random() < 0.4) {
      // Turned at a right angle by a turner just beyond the run, and on again.
      const t = next(end, d),
        kind = random() < 0.5 ? SLASH : BACKSLASH,
        e = turned(d, kind),
        after = t >= 0 && kinds[t] === UNSET ? run(t, e, 1 + Math.floor(random() * 3)) : null;
      if (!after) continue;
      extra.push({ cell: t, kind, tag: -1 });
      more = after;
      end = after[after.length - 1];
      way = e;
    }
    const stop = next(end, way);
    if (stop < 0 || [...cells, ...more].includes(stop) || extra.some((x) => x.cell === stop) || !(kinds[stop] === UNSET || stopper(stop))) continue;
    for (const c of [...cells, ...more]) if (kinds[c] === UNSET) kinds[c] = FLOOR;
    for (const x of extra) {
      kinds[x.cell] = x.kind;
      tags[x.cell] = x.tag;
      if (x.kind === PORTAL) portal = true;
      else turners++;
    }
    stopAt(stop);
    // A switch on this run, and later a raised gate across a run that the switch has let through.
    const fresh = cells.filter((c) => kinds[c] === FLOOR && c !== start);
    if (!switched && step >= 1 && fresh.length && random() < 0.4) {
      const c = pick(fresh);
      kinds[c] = SWITCH;
      tags[c] = 0;
      switched = true;
    } else if (switched && !gated && fresh.length && random() < 0.5) {
      const c = pick(fresh);
      kinds[c] = GATE;
      tags[c] = 0;
      gated = true;
    }
    p = end;
    prev = way;
    step++;
  }
  if (!portal || !gated) return null;
  // Tiles grown round the walk, then the void.
  for (let ring = 0; ring < 2; ring++) {
    const grow = kinds.map((k, c) => k === UNSET && [N, E, S, W].some((d) => next(c, d) >= 0 && kinds[next(c, d)] !== UNSET && kinds[next(c, d)] !== AIR));
    grow.forEach((g, c) => {
      if (g && random() < (ring ? 0.3 : 0.55)) kinds[c] = FLOOR;
    });
  }
  for (let c = 0; c < n; c++) if (kinds[c] === UNSET) kinds[c] = AIR;
  // Decoys on the grown tiles: blocks, and the stage's pieces up to their counts.
  const spare = () => {
    const free = kinds.map((_, c) => c).filter((c) => kinds[c] === FLOOR && c !== start);
    return free.length ? pick(free) : -1;
  };
  const decoys = Math.round(kinds.filter((k) => k !== AIR).length * stage.blocks * random());
  for (let k = 0; k < decoys; k++) {
    const c = spare();
    if (c >= 0) kinds[c] = BLOCK;
  }
  for (let want = between(stage.turners, random); turners < want; turners++) {
    const c = spare();
    if (c >= 0) kinds[c] = random() < 0.5 ? SLASH : BACKSLASH;
  }
  for (let want = between(stage.ice, random); ice < want; ice++) {
    const c = spare();
    if (c >= 0) kinds[c] = ICE;
  }
  for (let want = between(stage.gates, random), have = kinds.filter((k) => k === GATE).length; have < want; have++) {
    const c = spare();
    if (c >= 0) {
      kinds[c] = GATE;
      tags[c] = 0;
    }
  }
  return { kinds, tags, start, raised: stage.gates[1] ? [true] : [] };
}
/** What a way of pushes passes: turners, ice broken, portals, switches. */
function uses(state: State, way: number[]) {
  const seen = { turn: false, ice: false, warp: false, toggle: false, none: true };
  let s: State | null = state;
  for (const d of way) {
    s = play(s!, { from: -1, to: d, extra: -1 });
    if (!s) break;
    const last = s.last!;
    if (last.end === "ice") seen.ice = true;
    for (const step of last.path) {
      if (step.turned) seen.turn = true;
      if (step.warp) seen.warp = true;
      if (step.toggle !== undefined) seen.toggle = true;
    }
  }
  return seen;
}
/**
 * A puzzle of a stage: boards are laid at random until one has a plain tile where the cube, from the walk's start,
 * first comes to rest after a number of pushes in the stage's band (no fewer than the count aimed at while patience
 * lasts), by a way that uses the stage's newest piece and passes enough states where a wrong push falls off; the
 * goal goes there. Everything follows from one number drawn from `given`, so a sequence of numbers always lays the
 * same puzzle.
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
    // The fewest pushes aimed at, drawn evenly from the band; after a while any count in the band will do.
    want = spec.lo + Math.floor(random() * (spec.hi - spec.lo + 1));
  for (let boards = 0; ; boards++) {
    const laid = lay(spec, random);
    if (!laid) continue;
    const least = spec.lo + Math.max(0, want - spec.lo - Math.floor(boards / PATIENCE)),
      start = laid.start,
      base: State = {
        w: spec.w,
        h: spec.h,
        kinds: laid.kinds,
        tags: laid.tags,
        goal: -1,
        start,
        cube: start,
        broken: [],
        raised: laid.raised,
        fell: null,
        last: null,
        best: 0,
        stage: k,
        winner: null,
        ply: 0,
        trouble: "",
      },
      b = compile(base),
      n = b.n,
      found = search(b, start, 0, gatesOf(laid.raised), false),
      // The first state each tile is rested on.
      first = new Int32Array(n).fill(-1);
    for (let j = 0; j < found.count; j++) {
      const s = found.order[j],
        c = s % n;
      if (first[c] < 0) first[c] = s;
    }
    const cells: { cell: number; off: number; key: number }[] = [];
    for (let c = 0; c < n; c++) {
      const s = first[c];
      if (s >= 0 && laid.kinds[c] === FLOOR && c !== start && found.dist[s] >= least && found.dist[s] <= spec.hi)
        cells.push({ cell: c, off: Math.abs(found.dist[s] - want), key: random() });
    }
    // Places nearest the count aimed at first, at random among those as near.
    cells.sort((x, y) => x.off - y.off || x.key - y.key);
    for (const { cell: goal } of cells.slice(0, 4)) {
      let trapped = 0;
      for (let s = found.parent[first[goal]]; s >= 0; s = found.parent[s]) if (found.falls[s] > 0) trapped++;
      if (trapped < spec.traps) continue;
      const way = pathTo(found, first[goal]),
        kinds = [...laid.kinds];
      kinds[goal] = GOAL;
      const state: State = { ...base, kinds, goal, best: way.length };
      if (!uses(state, way)[spec.needs]) continue;
      // The goal changes nothing on the way, but the count is made again on the board as it is played.
      const check = solve(state);
      if (!check || check.length !== way.length) continue;
      return state;
    }
  }
}
/** After how many boards the count aimed at is lowered by one. */
const PATIENCE = 200;
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
