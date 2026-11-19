import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The laser reflection puzzle, of the kind ThinkFun sells as Laser Maze (its rules are followed; its look, cards and
 * challenges are not): optics set on a 5 × 5 grid steer a laser's beam so that it lights the targets asked for and
 * touches every piece on the board.
 *
 * Cells are `row × 5 + column`, row 0 the far side (north). Directions are 0 north, 1 east, 2 south (toward the
 * player), 3 west; a piece's `dir` is its turn in clockwise quarters. A beam travelling `t` enters a cell through its
 * side `back(t)`.
 *
 * Pieces (`meet` says what each does to a beam travelling `t`):
 * - laser: fires toward `dir`; a beam that comes back to it is stopped there;
 * - target-mirror: a block filling the half of the cell behind a mirror on the diagonal. Its two outer faces are the
 *   sides `dir` (the frosted target: a beam entering there lights it and stops) and `dir + 1` (plain: it stops the
 *   beam); a beam entering through either of the other two sides is turned 90° by the mirror;
 * - double mirror: a mirror on the diagonal, silvered on both faces: every beam is turned 90°;
 * - beam splitter: a half-silvered diagonal: every beam goes on straight and is also turned 90°;
 * - checkpoint: an aperture whose slot runs north–south at an even turn and east–west at an odd one; a beam along it
 *   passes (and only then has touched it), one across it is stopped;
 * - blocker: a rubber stopper under the beam: nothing may be set on its cell, the beam passes over it.
 * A diagonal is "\" (north-west to south-east) at an even turn and "/" at an odd one; a mirror, a splitter and a
 * checkpoint look the same turned half round, so only their turn modulo 2 counts (`norm`).
 *
 * The beam (`traceBoard`) is followed from the laser; it may split, it ends when it leaves the board or is stopped,
 * and a way already taken out of a cell (cell and direction) is not followed twice, so loops end.
 *
 * A puzzle: the laser and some pieces are fixed in place (`given`), some of them with their turn left free; the tray
 * holds the rest, to be set and turned (a tray piece's turn may be fixed too: `locked`). The puzzle is solved when
 * the laser is fired (`GO`) with every tray piece on the board, every piece but the blockers touched, and exactly
 * `need` targets lit. Firing is never a failure: the beam is shown until a piece is moved.
 *
 * Moves (`Move`), where a cell is a point 0–24 and tray piece j is the point `CELLS + j`:
 * - `{from: CELLS + j, to: cell}`: tray piece j is set on a free cell as it is turned;
 * - `{from: cell, to: cell}`: the piece there is turned a quarter clockwise (mine, or a given one whose turn is free);
 * - `{from: cell, to: other}`: my piece there is carried to a free cell;
 * - `{from: cell, to: CELLS + j}`: my piece there (tray piece j) goes back to the tray;
 * - `{from: CELLS + j or cell, to: PUT + other × 4 + dir}`: set or carried to `other` turned to `dir` (the hint's
 *   move; `other` may be its own cell, to turn it there);
 * - `{from: -1, to: GO}` (or `to` the laser's cell): the laser is fired.
 * `extra` is always -1. A move that breaks a rule is refused (`play` gives null; `refusal` says why).
 */
export const SIZE = 5,
  CELLS = SIZE * SIZE;
export const NORTH = 0,
  EAST = 1,
  SOUTH = 2,
  WEST = 3;
export type Kind = "laser" | "target" | "mirror" | "splitter" | "checkpoint" | "blocker";
/** Moves that are not points of the board. */
export const GO = 900,
  PUT = 1000;
export const put = (cell: number, dir: number) => PUT + cell * 4 + (((dir % 4) + 4) % 4);
export const slot = (j: number) => CELLS + j;
const DR = [-1, 0, 1, 0],
  DC = [0, 1, 0, -1];
/** The cell next to `cell` toward `dir`, or -1 off the board. */
export function neighbour(cell: number, dir: number) {
  if (cell < 0) return -1;
  const r = Math.floor(cell / SIZE) + DR[dir],
    c = (cell % SIZE) + DC[dir];
  return r < 0 || c < 0 || r >= SIZE || c >= SIZE ? -1 : r * SIZE + c;
}
export const back = (dir: number) => (dir + 2) % 4;
/** A direction as a step over the board: [columns, rows]. */
export const step = (dir: number): [number, number] => [DC[dir], DR[dir]];
/** How many turns of a kind differ. */
export const period = (kind: Kind) => (kind === "laser" || kind === "target" ? 4 : kind === "blocker" ? 1 : 2);
/** A turn as it acts: a mirror, a splitter and a checkpoint are the same turned half round. */
export const norm = (kind: Kind, dir: number) => {
  const n = period(kind);
  return ((dir % n) + n) % n;
};
/** The way a mirror on its diagonal sends a beam travelling `t`: "\" at an even turn, "/" at an odd one. */
export const reflect = (dir: number, t: number) => ((dir & 1) === 0 ? 3 - t : t ^ 1);
const CODE: Record<Kind, number> = { laser: 0, target: 1, mirror: 2, splitter: 3, checkpoint: 4, blocker: 5 };
const K_BLOCKER = 5;
/**
 * What a piece of kind code `k` turned to `d` does to a beam travelling `t`, as bits: 0–3 the ways it leaves, 4 a
 * target lit, 5 the piece touched (a checkpoint only when it is passed; a blocker or an empty cell never).
 */
function meetCode(k: number, d: number, t: number) {
  switch (k) {
    case 0:
      return 32;
    case 1: {
      const s = (t + 2) & 3;
      if (s === (d & 3)) return 48;
      if (s === ((d + 1) & 3)) return 32;
      return 32 | (1 << reflect(d, t));
    }
    case 2:
      return 32 | (1 << reflect(d, t));
    case 3:
      return 32 | (1 << t) | (1 << reflect(d, t));
    case 4:
      return (d & 1) === (t & 1) ? 32 | (1 << t) : 0;
    default:
      return 1 << t;
  }
}
export interface Meeting {
  /** The ways the beam leaves the cell. */
  out: number[];
  lit: boolean;
  touched: boolean;
}
/** What a piece turned to `dir` does to a beam travelling `t`. */
export function meet(kind: Kind, dir: number, t: number): Meeting {
  const code = meetCode(CODE[kind], dir, t),
    out: number[] = [];
  for (let o = 0; o < 4; o++) if (code & (1 << o)) out.push(o);
  return { out, lit: !!(code & 16), touched: !!(code & 32) };
}

export interface Piece {
  kind: Kind;
  /** Its cell, or -1 while it lies in the tray. */
  at: number;
  /** Its turn, in clockwise quarters from north: where a laser fires, where a target-mirror's target looks. */
  dir: number;
  /** Its turn may not be changed. */
  locked: boolean;
}
export interface Last {
  kind: "put" | "carry" | "back" | "turn" | "fire";
  /** Which piece: a given one or one of the tray, by index (-1 for the firing). */
  side: "given" | "tray";
  index: number;
}
export interface State {
  /** Pieces fixed in place from the start: the laser first, then the rest (blockers among them). */
  given: Piece[];
  /** The pieces to set: in the tray (`at` -1) or on the board. */
  tray: Piece[];
  /** Where each tray piece belongs and how it is turned (identical pieces may be swapped). */
  answer: { at: number; dir: number }[];
  /** Each given piece's turn in the answer. */
  turns: number[];
  /** How many targets must be lit. */
  need: number;
  /** The laser has been fired since the last piece moved: the beam is shown. */
  fired: boolean;
  last: Last | null;
  winner: Winner;
  ply: number;
  stage: number;
}
/** The board id of the piece on each cell: given g as g, tray j as `given.length + j`; -1 for none. */
export function occupancy(state: Pick<State, "given" | "tray">) {
  const occ = new Int16Array(CELLS).fill(-1);
  state.given.forEach((p, g) => (occ[p.at] = g));
  state.tray.forEach((p, j) => {
    if (p.at >= 0) occ[p.at] = state.given.length + j;
  });
  return occ;
}
/** Every piece on the board by its cell, or null. */
export function boardOf(state: Pick<State, "given" | "tray">): (Pick<Piece, "kind" | "dir"> | null)[] {
  const board: (Pick<Piece, "kind" | "dir"> | null)[] = new Array(CELLS).fill(null);
  for (const p of state.given) board[p.at] = p;
  for (const p of state.tray) if (p.at >= 0) board[p.at] = p;
  return board;
}

/*
 * The beam.
 */
/** A straight stretch of the beam in board units (x the column, z the row, cell middles whole), and how far from the laser it starts. */
export interface Segment {
  from: [number, number];
  to: [number, number];
  start: number;
  /** It runs off the board (the view lets it fade away beyond). */
  leaves?: boolean;
}
/** Where the beam strikes something: a mirror, a splitter, a target lit, a face that stops it, a checkpoint passed. */
export interface Strike {
  x: number;
  z: number;
  kind: "mirror" | "split" | "lit" | "stop" | "pass";
  cell: number;
  /** How far along the beam it is. */
  at: number;
}
export interface Beam {
  segments: Segment[];
  strikes: Strike[];
  /** The cells of targets lit. */
  lit: number[];
  /** Whether the piece on each cell has been touched. */
  touched: boolean[];
  /** The sides each cell's piece was entered by, as bits. */
  ways: number[];
  /** The stretches at the ends of rays that leave the board: the empty cells after the last piece, and the way the beam goes there. */
  loose: { cells: number[]; dir: number }[];
}
/** How far from a cell's middle the beam is stopped by a face of each kind. */
const FACE: Partial<Record<Kind, number>> = { laser: 0.3, target: 0.33, checkpoint: 0.07 };
/** How far past the last cell's middle a beam that leaves the board is drawn (to the plate's edge). */
export const OUT = 0.86;
/** Where the laser's beam starts, from its cell's middle. */
export const MUZZLE = 0.3;
/** The beam from the laser on `source` over a board of pieces; `light` leaves out the stretches and strikes (for the puzzle maker). */
export function traceBoard(board: (Pick<Piece, "kind" | "dir"> | null)[], source: number, light = false): Beam {
  const laser = board[source]!,
    segments: Segment[] = [],
    strikes: Strike[] = [],
    lit: number[] = [],
    touched = new Array<boolean>(CELLS).fill(false),
    ways = new Array<number>(CELLS).fill(0),
    loose: Beam["loose"] = [],
    emitted = new Uint8Array(CELLS * 4),
    mid = (cell: number): [number, number] => [cell % SIZE, Math.floor(cell / SIZE)];
  touched[source] = true;
  const [sx, sz] = mid(source),
    [lx, lz] = step(laser.dir);
  const queue: { cell: number; dir: number; x: number; z: number; start: number }[] = [{ cell: source, dir: laser.dir, x: sx + lx * MUZZLE, z: sz + lz * MUZZLE, start: 0 }];
  emitted[source * 4 + laser.dir] = 1;
  while (queue.length) {
    const ray = queue.shift()!,
      t = ray.dir,
      [dx, dz] = step(t),
      length = (x: number, z: number) => Math.hypot(x - ray.x, z - ray.z);
    let c = ray.cell,
      free: number[] = [];
    for (;;) {
      const n = neighbour(c, t);
      if (n < 0) {
        if (!light) {
          const [cx, cz] = mid(c);
          segments.push({ from: [ray.x, ray.z], to: [cx + dx * OUT, cz + dz * OUT], start: ray.start, leaves: true });
        }
        loose.push({ cells: free, dir: t });
        break;
      }
      const p = board[n];
      if (!p || p.kind === "blocker") {
        if (!p) free.push(n);
        c = n;
        continue;
      }
      const code = meetCode(CODE[p.kind], p.dir, t),
        [nx, nz] = mid(n);
      ways[n] |= 1 << back(t);
      if (code & 32) touched[n] = true;
      if (code & 16) lit.push(n);
      // A checkpoint passed: the beam goes straight on.
      if (code === (32 | (1 << t)) && p.kind === "checkpoint") {
        if (!light) strikes.push({ x: nx, z: nz, kind: "pass", cell: n, at: ray.start + length(nx, nz) });
        free = [];
        c = n;
        continue;
      }
      const outs = code & 15;
      if (!outs) {
        const face = FACE[p.kind] ?? 0.3,
          end: [number, number] = [nx - dx * face, nz - dz * face];
        if (!light) {
          segments.push({ from: [ray.x, ray.z], to: end, start: ray.start });
          strikes.push({ x: end[0], z: end[1], kind: code & 16 ? "lit" : "stop", cell: n, at: ray.start + length(end[0], end[1]) });
        }
        break;
      }
      const at = ray.start + length(nx, nz);
      if (!light) {
        segments.push({ from: [ray.x, ray.z], to: [nx, nz], start: ray.start });
        strikes.push({ x: nx, z: nz, kind: p.kind === "splitter" ? "split" : "mirror", cell: n, at });
      }
      for (let o = 0; o < 4; o++) {
        if (!(outs & (1 << o)) || emitted[n * 4 + o]) continue;
        emitted[n * 4 + o] = 1;
        queue.push({ cell: n, dir: o, x: nx, z: nz, start: at });
      }
      break;
    }
  }
  return { segments, strikes, lit, touched, ways, loose };
}
/** The beam the laser of a state fires. */
export const trace = (state: Pick<State, "given" | "tray">) => traceBoard(boardOf(state), state.given[0].at);
export interface Verdict {
  beam: Beam;
  won: boolean;
  /** Tray pieces still in the tray. */
  left: number[];
  /** Board ids (as `occupancy`) of pieces the beam did not touch (blockers aside). */
  untouched: number[];
  /** Checkpoints among them. */
  unpassed: number[];
}
/** What a firing of the laser shows. */
export function judge(state: Pick<State, "given" | "tray" | "need">): Verdict {
  const beam = trace(state),
    occ = occupancy(state),
    left = state.tray.flatMap((p, j) => (p.at < 0 ? [j] : [])),
    untouched: number[] = [],
    unpassed: number[] = [],
    pieceOf = (id: number) => (id < state.given.length ? state.given[id] : state.tray[id - state.given.length]);
  for (let cell = 0; cell < CELLS; cell++) {
    const id = occ[cell];
    if (id < 0 || beam.touched[cell]) continue;
    const kind = pieceOf(id).kind;
    if (kind === "blocker") continue;
    untouched.push(id);
    if (kind === "checkpoint") unpassed.push(id);
  }
  return { beam, won: !left.length && !untouched.length && beam.lit.length === state.need, left, untouched, unpassed };
}

/*
 * Moves.
 */
export type Refusal = "taken" | "blocked" | "locked" | "fixed" | "stopper";
const REFUSALS: Record<Refusal, string> = {
  taken: "이미 부품이 놓인 자리입니다.",
  blocked: "고무 마개가 꽂힌 자리에는 아무것도 놓을 수 없습니다.",
  locked: "방향이 정해진 부품이라 돌릴 수 없습니다.",
  fixed: "처음부터 놓인 부품은 옮길 수 없습니다.",
  stopper: "고무 마개는 그 자리에 꽂혀 있습니다. 빛은 그 위로 지나갑니다.",
};
export const refusalWords = (refusal: Refusal) => REFUSALS[refusal];
/** The state a move would make, the refusal of one that breaks a rule, or null for a move that is not one. */
export function attempt(state: State, move: Move): State | Refusal | null {
  const { from, to } = move;
  if (state.winner !== null || move.extra !== -1 || !Number.isInteger(from) || !Number.isInteger(to)) return null;
  const laser = state.given[0];
  if (from === -1) {
    if ((to !== GO && to !== laser.at) || state.fired) return null;
    const verdict = judge(state);
    return { ...state, fired: true, last: { kind: "fire", side: "given", index: 0 }, winner: verdict.won ? 0 : null, ply: state.ply + 1 };
  }
  const occ = occupancy(state),
    G = state.given.length,
    /** Whether a cell may take a piece: `null` when it may, else why not. */
    free = (cell: number, self = -1): Refusal | null => {
      const id = occ[cell];
      if (id < 0 || id === self) return null;
      return id < G && state.given[id].kind === "blocker" ? "blocked" : "taken";
    },
    done = (given: Piece[], tray: Piece[], last: Last): State => ({ ...state, given, tray, fired: false, last, ply: state.ply + 1 });
  // A tray piece set on the board.
  if (from >= CELLS) {
    const j = from - CELLS,
      p = state.tray[j];
    if (!p || p.at >= 0) return null;
    let cell = to,
      dir = p.dir;
    if (to >= PUT) {
      cell = Math.floor((to - PUT) / 4);
      dir = (to - PUT) % 4;
      if (p.locked && norm(p.kind, dir) !== norm(p.kind, p.dir)) return "locked";
    }
    if (cell < 0 || cell >= CELLS) return null;
    const why = free(cell);
    if (why) return why;
    return done(state.given, state.tray.map((q, k) => (k === j ? { ...q, at: cell, dir: norm(q.kind, dir) } : q)), { kind: "put", side: "tray", index: j });
  }
  if (from < 0 || from >= CELLS) return null;
  const id = occ[from];
  if (id < 0) return null;
  const turnTo = (p: Piece, dir: number): Refusal | Piece => (p.locked ? (p.kind === "blocker" ? "stopper" : "locked") : { ...p, dir: norm(p.kind, dir) });
  if (id < G) {
    const g = id,
      p = state.given[g];
    let dir = p.dir + 1;
    if (to >= PUT) {
      if (Math.floor((to - PUT) / 4) !== from) return p.kind === "blocker" ? "stopper" : "fixed";
      dir = (to - PUT) % 4;
    } else if (to !== from) return p.kind === "blocker" ? "stopper" : "fixed";
    if (g === 0) return "locked";
    const next = turnTo(p, dir);
    if (typeof next === "string") return next;
    if (next.dir === p.dir) return null;
    return done(
      state.given.map((q, k) => (k === g ? next : q)),
      state.tray,
      { kind: "turn", side: "given", index: g },
    );
  }
  const j = id - G,
    p = state.tray[j];
  if (to === CELLS + j) return done(state.given, state.tray.map((q, k) => (k === j ? { ...q, at: -1 } : q)), { kind: "back", side: "tray", index: j });
  let cell = to,
    dir = p.dir;
  if (to >= PUT) {
    cell = Math.floor((to - PUT) / 4);
    dir = (to - PUT) % 4;
  } else if (to === from) dir = p.dir + 1;
  if (cell < 0 || cell >= CELLS) return null;
  if (norm(p.kind, dir) !== norm(p.kind, p.dir)) {
    if (p.locked) return "locked";
  }
  if (cell === from) {
    if (norm(p.kind, dir) === p.dir) return null;
    return done(state.given, state.tray.map((q, k) => (k === j ? { ...q, dir: norm(q.kind, dir) } : q)), { kind: "turn", side: "tray", index: j });
  }
  const why = free(cell, id);
  if (why) return why;
  return done(state.given, state.tray.map((q, k) => (k === j ? { ...q, at: cell, dir: norm(q.kind, dir) } : q)), { kind: "carry", side: "tray", index: j });
}
/** A move of a piece or the firing of the laser; null (and the state left alone) when it may not be made. */
export function play(state: State, move: Move): State | null {
  const next = attempt(state, move);
  return next && typeof next !== "string" ? next : null;
}
/** Why a move is refused, in a sentence for the status line, or null when it is not refused for a rule. */
export function refusal(state: State, move: Move): string | null {
  const next = attempt(state, move);
  return typeof next === "string" ? refusalWords(next) : null;
}
/** Every move there is (the turned puts of the hint are made by `play` too, but not listed). */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = [],
    occ = occupancy(state),
    empty = Array.from({ length: CELLS }, (_, c) => c).filter((c) => occ[c] < 0);
  if (!state.fired) out.push({ from: -1, to: GO, extra: -1 }, { from: -1, to: state.given[0].at, extra: -1 });
  state.given.forEach((p, g) => {
    if (g > 0 && !p.locked && period(p.kind) > 1) out.push({ from: p.at, to: p.at, extra: -1 });
  });
  state.tray.forEach((p, j) => {
    if (p.at < 0) {
      for (const cell of empty) out.push({ from: CELLS + j, to: cell, extra: -1 });
      return;
    }
    if (!p.locked) out.push({ from: p.at, to: p.at, extra: -1 });
    for (const cell of empty) out.push({ from: p.at, to: cell, extra: -1 });
    out.push({ from: p.at, to: CELLS + j, extra: -1 });
  });
  return out;
}

/*
 * The solver: every way to set the tray's pieces (and turn the given pieces whose turn is free) so that a firing
 * wins, found by following the beam and deciding what stands on a cell only when the beam comes to it.
 */
export interface Answer {
  tray: { at: number; dir: number }[];
  given: number[];
}
/** The turns of a kind that act differently. */
const TURNS = [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1], [0, 1], [0, 1], [0]];
/**
 * Up to `cap` answers. Identical tray pieces swapped are one answer, and so are turns that act the same. The beam
 * is followed from the laser; at a cell nothing has decided yet it is tried empty and with each piece left in the
 * tray, each way that piece can be turned; a given piece whose turn is free is turned when the beam first reaches
 * it. Null when the search runs past `budget` steps (it never does for the puzzles made here).
 */
export function solutions(given: Piece[], tray: Pick<Piece, "kind" | "dir" | "locked">[], need: number, cap = 2, budget = 2_000_000): Answer[] | null {
  const kind = new Int8Array(CELLS).fill(-1),
    dir = new Int8Array(CELLS),
    clear = new Uint8Array(CELLS),
    touch = new Int16Array(CELLS),
    emitted = new Uint8Array(CELLS * 4);
  given.forEach((p, g) => {
    kind[p.at] = CODE[p.kind];
    dir[p.at] = p.locked || period(p.kind) === 1 ? norm(p.kind, p.dir) : -1;
  });
  const groups: { k: number; turns: number[] | null; members: number[]; cells: number[]; dirs: number[] }[] = [];
  tray.forEach((p, j) => {
    const k = CODE[p.kind],
      locked = p.locked ? norm(p.kind, p.dir) : -1,
      group = groups.find((g) => g.k === k && (g.turns === null ? locked < 0 : g.turns[0] === locked));
    if (group) group.members.push(j);
    else groups.push({ k, turns: locked < 0 ? null : [locked], members: [j], cells: [], dirs: [] });
  });
  const found: Answer[] = [],
    laser = given[0];
  let steps = 0,
    over = false,
    left = tray.length;
  touch[laser.at] = 1;
  const finish = (lit: number) => {
    if (lit !== need || left) return;
    for (let c = 0; c < CELLS; c++) if (kind[c] >= 0 && kind[c] !== K_BLOCKER && !touch[c]) return;
    const answer: Answer = { tray: new Array(tray.length), given: given.map((p) => dir[p.at]) };
    for (const g of groups) g.members.forEach((j, i) => (answer.tray[j] = { at: g.cells[i], dir: g.dirs[i] }));
    found.push(answer);
  };
  const run = (stack: number[], lit: number): void => {
    if (found.length >= cap || over) return;
    if (++steps > budget) {
      over = true;
      return;
    }
    if (!stack.length) return finish(lit);
    const top = stack[stack.length - 1];
    walk(top >> 2, top & 3, stack.slice(0, -1), lit);
  };
  const meetAt = (n: number, t: number, rest: number[], lit: number) => {
    const code = meetCode(kind[n], dir[n], t);
    if (code & 16 && lit + 1 > need) return;
    if (code & 32) touch[n]++;
    const set: number[] = [];
    let next = rest;
    for (let o = 0; o < 4; o++) {
      const key = n * 4 + o;
      if (!(code & (1 << o)) || emitted[key]) continue;
      emitted[key] = 1;
      set.push(key);
      next = next === rest ? [...rest, key] : (next.push(key), next);
    }
    run(next, lit + (code & 16 ? 1 : 0));
    for (const key of set) emitted[key] = 0;
    if (code & 32) touch[n]--;
  };
  const walk = (c: number, t: number, rest: number[], lit: number): void => {
    for (;;) {
      if (found.length >= cap || over) return;
      const n = neighbour(c, t);
      if (n < 0) return run(rest, lit);
      const k = kind[n];
      if (k < 0) {
        if (clear[n]) {
          c = n;
          continue;
        }
        // Left empty: the beam goes on through.
        clear[n] = 1;
        walk(n, t, rest, lit);
        clear[n] = 0;
        // Or a piece from the tray stands here.
        for (let gi = 0; gi < groups.length; gi++) {
          const g = groups[gi];
          if (g.cells.length >= g.members.length) continue;
          for (const d of g.turns ?? TURNS[g.k]) {
            if (found.length >= cap || over) return;
            kind[n] = g.k;
            dir[n] = d;
            g.cells.push(n);
            g.dirs.push(d);
            left--;
            meetAt(n, t, rest, lit);
            left++;
            g.cells.pop();
            g.dirs.pop();
            kind[n] = -1;
          }
        }
        return;
      }
      if (k === K_BLOCKER) {
        c = n;
        continue;
      }
      if (dir[n] < 0) {
        for (const d of TURNS[k]) {
          dir[n] = d;
          meetAt(n, t, rest, lit);
        }
        dir[n] = -1;
        return;
      }
      return meetAt(n, t, rest, lit);
    }
  };
  emitted[laser.at * 4 + laser.dir] = 1;
  run([laser.at * 4 + laser.dir], 0);
  return over ? null : found;
}

/*
 * Stages and the making of a puzzle.
 */
export interface Stage {
  /** Targets to light. */
  need: number;
  /** How many pieces go into the tray. */
  tray: [number, number];
  targets: [number, number];
  mirrors: [number, number];
  splitters: [number, number];
  checkpoints: [number, number];
  blockers: [number, number];
  /** Given pieces whose turn is left free. */
  free: [number, number];
  /** The beam must enter some piece by two different sides. */
  twice: boolean;
}
export const STAGES: Stage[] = [
  { need: 1, tray: [2, 2], targets: [2, 3], mirrors: [0, 1], splitters: [0, 0], checkpoints: [0, 0], blockers: [0, 1], free: [0, 0], twice: false },
  { need: 1, tray: [3, 3], targets: [3, 3], mirrors: [0, 1], splitters: [0, 0], checkpoints: [1, 1], blockers: [0, 1], free: [0, 1], twice: false },
  { need: 2, tray: [4, 4], targets: [4, 4], mirrors: [0, 1], splitters: [1, 1], checkpoints: [0, 1], blockers: [0, 1], free: [1, 1], twice: false },
  { need: 3, tray: [4, 5], targets: [4, 5], mirrors: [0, 1], splitters: [2, 2], checkpoints: [0, 1], blockers: [0, 1], free: [0, 1], twice: true },
];
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));
const int = (n: number, random: Random) => Math.min(n - 1, Math.floor(random() * n));
const between = ([lo, hi]: [number, number], random: Random) => lo + int(hi - lo + 1, random);
const pickWeighted = <X>(items: { item: X; weight: number }[], random: Random): X => {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let r = random() * total;
  for (const i of items) {
    r -= i.weight;
    if (r < 0) return i.item;
  }
  return items[items.length - 1].item;
};
const shuffled = <X>(items: X[], random: Random) => {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const k = int(i + 1, random);
    [out[i], out[k]] = [out[k], out[i]];
  }
  return out;
};
/** How many cells lie ahead of `cell` toward `dir`. */
function room(cell: number, dir: number) {
  let n = 0;
  for (let c = neighbour(cell, dir); c >= 0; c = neighbour(c, dir)) n++;
  return n;
}
/** How many pieces are entered by two sides or more. */
const doubled = (beam: Beam, board: (Pick<Piece, "kind"> | null)[]) => beam.ways.filter((w, c) => board[c] && board[c]!.kind !== "laser" && (w & (w - 1)) !== 0).length;
type Board = ({ kind: Kind; dir: number } | null)[];
/** The empty cells a beam crosses, where a blocker may stand without changing anything. */
function crossed(beam: Beam, board: Board) {
  const out = new Set<number>();
  for (const s of beam.segments) {
    const [x0, z0] = s.from,
      [x1, z1] = s.to,
      n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 4);
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n),
        z = Math.round(z0 + ((z1 - z0) * k) / n);
      if (x >= 0 && z >= 0 && x < SIZE && z < SIZE && !board[z * SIZE + x]) out.add(z * SIZE + x);
    }
  }
  return out;
}
/**
 * Lays an answer: the laser, then piece after piece where the beam leaves the board, each turned to do something
 * (a target lit or used as a mirror, a mirror, a splitter, a checkpoint passed), keeping every piece set before it
 * touched and the targets lit within the stage's number. A few of the ways open at each step are tried in turn
 * (drawn by weight), going back when one leads nowhere, within a budget of steps. The stage's fewest blockers go on
 * cells the beam passes over.
 */
function lay(spec: Stage, random: Random): { board: Board; laser: number } | null {
  const board: Board = new Array(CELLS).fill(null),
    laser = int(CELLS, random),
    aims = [0, 1, 2, 3].filter((d) => room(laser, d) >= 2);
  if (!aims.length) return null;
  board[laser] = { kind: "laser", dir: pickWeighted(aims.map((d) => ({ item: d, weight: room(laser, d) })), random) };
  const pool: Kind[] = [];
  const add = (kind: Kind, n: number) => {
    for (let i = 0; i < n; i++) pool.push(kind);
  };
  add("target", between(spec.targets, random));
  add("mirror", between(spec.mirrors, random));
  add("splitter", between(spec.splitters, random));
  add("checkpoint", between(spec.checkpoints, random));
  let budget = 28;
  type Option = { cell: number; dir: number; beam: Beam; kind: Kind };
  const grow = (beam: Beam): boolean => {
    if (!pool.length) {
      return beam.lit.length === spec.need && (!spec.twice || doubled(beam, board) > 0);
    }
    if (--budget < 0) return false;
    const options: { item: Option; weight: number }[] = [],
      before = doubled(beam, board),
      after = pool.length - 1,
      targets = pool.filter((k) => k === "target").length;
    for (const kind of new Set(pool)) {
      const targetsAfter = targets - (kind === "target" ? 1 : 0);
      for (const end of beam.loose)
        end.cells.forEach((cell, i) => {
          const t = end.dir,
            turns = kind === "checkpoint" ? [t & 1] : period(kind) === 4 ? [0, 1, 2, 3] : [0, 1];
          for (const d of turns) {
            board[cell] = { kind, dir: d };
            const next = traceBoard(board, laser, true),
              lit = next.lit.length,
              fits = lit <= spec.need && lit + targetsAfter >= spec.need && !board.some((p, c) => p && p.kind !== "blocker" && !next.touched[c]) && (!after || next.loose.some((l) => l.cells.length)),
              twice = fits && spec.twice && doubled(next, board) > before,
              // The last piece of a stage that wants a piece entered from two sides must make one, if none is yet.
              ok = fits && (!spec.twice || after || before > 0 || twice);
            board[cell] = null;
            if (!ok) continue;
            const m = meetCode(CODE[kind], d, t);
            let weight = (1 + 0.25 * i) * (kind === "splitter" ? 3 : 1);
            // A target that stops the beam on its plain face is seldom wanted.
            if (kind === "target" && !(m & 15) && !(m & 16)) weight *= 0.15;
            // A target lit early leaves little to go on with.
            if (kind === "target" && m & 16 && after && next.loose.length < 2) weight *= 0.4;
            if (twice) weight *= 8;
            options.push({ item: { cell, dir: d, beam: next, kind }, weight });
          }
        });
    }
    for (let tries = 0; tries < 3 && options.length; tries++) {
      const option = pickWeighted(options, random);
      options.splice(
        options.findIndex((o) => o.item === option),
        1,
      );
      board[option.cell] = { kind: option.kind, dir: option.dir };
      pool.splice(pool.indexOf(option.kind), 1);
      if (grow(option.beam)) return true;
      pool.push(option.kind);
      board[option.cell] = null;
      if (budget < 0) return false;
    }
    return false;
  };
  if (!grow(traceBoard(board, laser, true))) return null;
  const beam = traceBoard(board, laser),
    path = crossed(beam, board);
  // A blocker the light runs over now and then, or the stage's fewest; one more may be spent to make the answer the only one.
  for (let b = Math.max(spec.blockers[0], spec.blockers[1] && random() < 0.35 ? 1 : 0); b > 0; b--) {
    const onBeam = [...path].filter((c) => !board[c]),
      anywhere = board.flatMap((p, c) => (p ? [] : [c])),
      from = onBeam.length && random() < 0.75 ? onBeam : anywhere;
    if (!from.length) break;
    board[from[int(from.length, random)]] = { kind: "blocker", dir: 0 };
  }
  return { board, laser };
}
/** The order the tray's pieces lie in, and the board's given pieces after the laser. */
const ORDER: Kind[] = ["laser", "target", "mirror", "splitter", "checkpoint", "blocker"];
const byKind = (a: { kind: Kind }, b: { kind: Kind }) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind);
/** A key telling tray pieces that can stand for each other. */
const likeKey = (p: Pick<Piece, "kind" | "dir" | "locked">) => `${p.kind}:${p.locked ? norm(p.kind, p.dir) : "free"}`;
/**
 * A puzzle of a stage with exactly one answer: an answer is laid and made into a puzzle (`settle`), a few ways,
 * before another answer is laid.
 */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const k = stageOf(stage),
    spec = STAGES[k - 1];
  for (;;) {
    const laid = lay(spec, random);
    if (!laid) continue;
    const { laser } = laid,
      cells = laid.board.flatMap((p, c) => (p && p.kind !== "laser" && p.kind !== "blocker" ? [c] : []));
    // A few ways of choosing the tray from one answer, before another answer is laid.
    for (let choice = 0; choice < 2; choice++) {
      const made = settle(spec, k, laid.board.slice(), laser, cells, random);
      if (made) return made;
    }
  }
}
/** How far the maker lets the solver search before it gives a placement up (about a hundredth of a second). */
const CHECK_STEPS = 60_000;
/**
 * Makes a puzzle of an answer laid on `board`: its pieces are taken into the tray one by one (a splitter first where
 * the stage has splitters, the rest at random), each kept there only while the solver still finds the answer alone
 * (a spare blocker may be set on a cell the other answer would use and the answer leaves empty); then some given
 * pieces have their turn freed, again only while the answer stays the only one. Null when fewer pieces than the
 * stage asks for could be taken.
 */
function settle(spec: Stage, k: number, board: Board, laser: number, cells: number[], random: Random): State | null {
  const size = between(spec.tray, random),
    truthOf = (c: number) => norm(board[c]!.kind, board[c]!.dir),
    order = shuffled(cells, random),
    split = order.findIndex((c) => board[c]!.kind === "splitter");
  if (cells.length < spec.tray[0]) return null;
  if (split > 0 && spec.splitters[1] > 0) order.unshift(...order.splice(split, 1));
  const taken = new Set<number>(),
    freed = new Set<number>(),
    piecesOf = () => {
      const given: Piece[] = board.flatMap((p, c) => (p && !taken.has(c) ? [{ kind: p.kind, at: c, dir: p.dir, locked: !freed.has(c) }] : []));
      given.sort((a, b) => (a.kind === "laser" ? -1 : b.kind === "laser" ? 1 : a.at - b.at));
      const trayCells = [...taken].sort((a, b) => byKind(board[a]!, board[b]!) || a - b);
      return { given, trayCells, tray: trayCells.map((c) => ({ kind: board[c]!.kind, at: -1, dir: 0, locked: false })) };
    },
    /** 1 when the answer is the only one, else the other answer found (null when the search gave up). */
    check = (): 1 | Answer | null => {
      const { given, tray } = piecesOf(),
        // A search that runs long is taken for a puzzle with more than one answer: it is not made so.
        found = solutions(given, tray, spec.need, 2, CHECK_STEPS);
      if (!found || !found.length) return null;
      if (found.length === 1) return 1;
      const truth = new Set([...taken].map((c) => `${board[c]!.kind}@${c}:${truthOf(c)}`));
      return found.find((f) => f.tray.some((a, j) => !truth.has(`${tray[j].kind}@${a.at}:${a.dir}`))) ?? found[1];
    };
  let blockers = board.filter((p) => p?.kind === "blocker").length;
  for (const [i, c] of order.entries()) {
    if (taken.size >= size || taken.size + order.length - i < spec.tray[0]) break;
    taken.add(c);
    let verdict = check();
    // Another answer that sets a piece on a cell the answer leaves empty: a spare blocker shuts it out.
    for (let spare = 0; verdict !== 1 && verdict && spare < 2 && blockers < spec.blockers[1]; spare++) {
      const cell = verdict.tray.map((a) => a.at).find((at) => !board[at]);
      if (cell === undefined) break;
      board[cell] = { kind: "blocker", dir: 0 };
      blockers++;
      verdict = check();
      if (verdict !== 1) {
        board[cell] = null;
        blockers--;
      }
    }
    if (verdict !== 1) taken.delete(c);
  }
  if (taken.size < spec.tray[0]) return null;
  // Given pieces whose turn is left free.
  const want = between(spec.free, random);
  for (const c of shuffled(
    board.flatMap((p, c) => (p && !taken.has(c) && p.kind !== "laser" && period(p.kind) > 1 ? [c] : [])),
    random,
  )) {
    if (freed.size >= want) break;
    freed.add(c);
    if (check() !== 1) freed.delete(c);
  }
  const { given, trayCells, tray } = piecesOf();
  return {
    // Given pieces whose turn is free start turned at random.
    given: given.map((p) => (p.locked ? p : { ...p, dir: int(period(p.kind), random) })),
    tray,
    answer: trayCells.map((c) => ({ at: c, dir: truthOf(c) })),
    turns: given.map((p) => truthOf(p.at)),
    need: spec.need,
    fired: false,
    last: null,
    winner: null,
    ply: 0,
    stage: k,
  };
}

/*
 * The hint.
 */
/** The tray pieces that stand where the answer has a piece like them (each answer place used once), by place. */
export function matched(state: State): { slotOf: number[]; filled: number[] } {
  const n = state.tray.length,
    slotOf = new Array<number>(n).fill(-1),
    filled = new Array<number>(n).fill(-1);
  state.tray.forEach((p, j) => {
    if (p.at < 0) return;
    for (let i = 0; i < n; i++)
      if (filled[i] < 0 && state.answer[i].at === p.at && state.answer[i].dir === norm(p.kind, p.dir) && likeKey(state.tray[i]) === likeKey(p)) {
        filled[i] = j;
        slotOf[j] = i;
        return;
      }
  });
  return { slotOf, filled };
}
/**
 * The next step toward the answer: a given piece turned wrongly is turned; then the answer's places in turn get a
 * piece like theirs (one standing there turned wrongly is turned, one of another kind is sent back to the tray, and
 * a piece comes from the tray, or from a wrong place); once everything stands right, the laser is fired. Null when
 * the puzzle is over.
 */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  for (let g = 1; g < state.given.length; g++) {
    const p = state.given[g];
    if (!p.locked && norm(p.kind, p.dir) !== state.turns[g]) return { from: p.at, to: put(p.at, state.turns[g]), extra: -1 };
  }
  const { slotOf, filled } = matched(state),
    occ = occupancy(state),
    G = state.given.length;
  for (let i = 0; i < state.tray.length; i++) {
    if (filled[i] >= 0) continue;
    const want = state.answer[i],
      key = likeKey(state.tray[i]),
      there = occ[want.at];
    if (there >= G) {
      const j = there - G;
      if (likeKey(state.tray[j]) === key && slotOf[j] < 0) return { from: want.at, to: put(want.at, want.dir), extra: -1 };
      return { from: want.at, to: CELLS + j, extra: -1 };
    }
    const like = state.tray.flatMap((p, j) => (likeKey(p) === key && slotOf[j] < 0 ? [j] : [])),
      source = like.find((j) => state.tray[j].at < 0) ?? like[0];
    if (source === undefined) continue;
    const p = state.tray[source];
    return { from: p.at < 0 ? CELLS + source : p.at, to: put(want.at, want.dir), extra: -1 };
  }
  return state.fired ? null : { from: -1, to: GO, extra: -1 };
}
/** The answer as moves from a state (for tests): the hints followed to the firing. */
export function solve(state: State): Move[] {
  const out: Move[] = [];
  let s: State | null = state;
  for (let guard = 0; s && guard < 64; guard++) {
    const move = hint(s);
    if (!move) break;
    out.push(move);
    s = play(s, move);
    if (move.to === GO) break;
  }
  return out;
}
/** What the status line says after a firing that did not solve the puzzle. */
export function report(state: State) {
  const v = judge(state),
    lit = `표적 ${state.need}개 가운데 ${Math.min(v.beam.lit.length, state.need)}개에 불이 들어왔습니다.`;
  if (v.beam.lit.length > state.need) return `켜야 할 표적은 ${state.need}개인데 ${v.beam.lit.length}개가 켜졌습니다. 부품을 옮기거나 돌려 보세요.`;
  if (v.left.length) return `${lit} 쟁반에 아직 부품이 남아 있습니다.`;
  if (v.unpassed.length) return `${lit} 빛이 통과 고리를 지나지 않았습니다. 빛은 고리의 구멍으로만 지나갑니다.`;
  if (v.untouched.length) return `${lit} 빛이 닿지 않은 부품이 있습니다(붉은 고리).`;
  return `${lit} 표적을 더 켜야 합니다.`;
}
const effect = (): Effect | null => null;
export const laserPuzzle: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => new Array<null>(CELLS + s.tray.length).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: (s) =>
    s.fired
      ? report(s)
      : s.tray.some((p) => p.at < 0)
        ? "쟁반의 부품을 판의 자리로 끌어다 놓고, 놓은 부품을 눌러 돌리세요"
        : "레이저를 눌러 빛을 쏘아 보세요",
  tally: () => ["", ""],
  reason: (s) => (s.winner === 0 ? `성공! 빛이 모든 부품을 지나 표적 ${s.need}개에 불을 켰습니다.` : ""),
};
