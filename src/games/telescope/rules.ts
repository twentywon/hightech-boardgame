import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * 망원경 퍼즐 (TELESCOPE PUSH): a ball is brought into a hole by telescopes that push it out and pull it back. The kind
 * of puzzle is that of the web game 'Telescope Puzzle' (Mathsisfun); only the kind was taken, and the rules below,
 * where that game does not say, are our own.
 *
 * The board is `size` × `size` cells, numbered row by row from the top left (`r * size + c`); row 0 is the far side,
 * away from the eye. Directions are N 0 (row − 1), E 1, S 2, W 3. On it stand telescopes, one ball and one hole; there
 * is nothing else on the board (no blocks).
 *
 * A telescope stands on its base cell (the eyepiece end) and points one way, `dir`. Its length `lens[t]` is how many
 * cells its tip reaches beyond the base, 0 to its own `reach`. The colour of the ring at its tip tells its kind, and
 * the kind is its reach (the user asked; counted with the base, as the user counts): green spans at most 3 cells
 * (reach 2), yellow 4 (reach 3), purple 5 (reach 4, `MAX_REACH`). It occupies its base and, when drawn out, its body:
 * the `len` cells beyond the base. Its tip is the last of them; the cell just beyond the tip (the base's next cell
 * when it is closed) is the one it touches. Every telescope starts closed. Only these three kinds exist.
 *
 * One move, `{from: -1, to: t, extra: -1}` through `play`, presses telescope `t`:
 * - Closed (length 0): it is drawn out, all at once, cell by cell, up to its `reach`. The tip goes into the next
 *   cell unless that cell is off the board or taken by a telescope (another's base or drawn-out body). When the next
 *   cell holds the ball, the ball is pushed one cell ahead of the tip, unless the cell beyond the ball is off the
 *   board or taken by a telescope: then the ball cannot go and the tip stops where it is. A press that cannot draw
 *   the telescope out even one cell is refused, and `refusal` says what is in the way.
 * - Drawn out (length 1 to its reach): it closes fully, cell by cell. If the ball lies on the cell its tip touches (just
 *   beyond the tip, in its direction), the ball is held and comes back with the tip, a cell a step, and ends on the
 *   cell just beyond the base. The cells it comes through are the telescope's own body as it shortens, so nothing can
 *   ever be in its way and a pull is never stopped short. A ball beside the tip, or further off, stays where it is.
 *   Closing is never refused.
 * - The hole: the ball drops in, and the puzzle is solved (`winner` 0), as soon as it is moved onto the hole's cell,
 *   pushed or pulled (it need not stop there). A telescope drawn out over the hole passes above it; only the ball
 *   drops. A push that drops the ball ends there, the tip on the cell the ball left; a pull that drops it closes the
 *   telescope fully all the same. There is no failure: undo takes a press back, and 처음부터 begins again.
 * `pressed` is the telescopes pressed in order (undo replays them from the start); `last` the press just made, for
 * the view: the telescope, its length before and after, and the ball's cell before and after each cell the tip moved.
 *
 * A puzzle is laid at random and then climbed (`createGame`). A few journeys of the ball are laid first (`journey`:
 * from the ball alone on the board, telescopes are set down behind it and pressed, or ones already there pressed
 * again, so that it keeps coming onto new cells, pushed and pulled), and the telescopes of the best near the ball are
 * the core to climb. The core is then changed a telescope at a time (carried, turned, given another kind, added or
 * taken away), and after every change every arrangement the presses reach from the start is searched breadth first
 * (`explore`: every telescope's length and the ball's cell, packed into a few numbers); the hole goes on the cell the
 * ball first comes onto last, so every puzzle can be solved, in exactly `best` presses. A board is kept when that
 * count reaches the one aimed at in the stage's band and the shortest way uses enough telescopes, pulls and presses
 * that only set a telescope in the ball's way (or take one out of it). The rest of the stage's telescopes are then set
 * round it (`decorate`: crowded close where the fewest presses stay the same, searched again with `search`, an exact
 * A*; then quiet ones where nothing can reach them), and the board must hold all three kinds, their colours must matter
 * (`colourMatters`: were every telescope purple, the way laid would fail or the fewest presses change) and neither a
 * greedy player pressing toward the hole nor a random one may find the way (`naive`). After the stage's `budget` of
 * boards judged, the best in the band seen is taken. That shortest way is kept as `plan`; the hint follows it while I
 * do, and otherwise searches afresh from the arrangement shown (`solve`).
 */
export const N = 0,
  E = 1,
  S = 2,
  W = 3;
export const DR = [-1, 0, 1, 0],
  DC = [0, 1, 0, -1];
/**
 * The three kinds of telescope, told by the colour of the ring at the tip: how far each can be drawn out beyond its
 * base. Counted with the base, a green one spans at most 3 cells, a yellow one 4 and a purple one 5.
 */
export const REACHES = [2, 3, 4] as const;
export type Reach = (typeof REACHES)[number];
/** The furthest any telescope can be drawn out. */
export const MAX_REACH = 4;
/** The reach of each kind, by its colour. */
export const REACH_OF = { green: 2, yellow: 3, purple: 4 } as const satisfies Record<string, Reach>;
/** The kind's colour in words, by reach. */
export const KIND_NAME: Record<Reach, string> = { 2: "초록", 3: "노랑", 4: "보라" };

export interface Telescope {
  /** The base cell (the eyepiece end). */
  cell: number;
  /** Which way it points: N 0, E 1, S 2, W 3. */
  dir: number;
  /** How far it can be drawn out beyond its base (2 green, 3 yellow, 4 purple). */
  reach: Reach;
}
export interface Last {
  /** The telescope pressed. */
  t: number;
  /** Its length before and after. */
  from: number;
  to: number;
  /** The ball's cell before the press (first) and after each cell the tip moved (one more than |from − to|). */
  balls: number[];
  /** The ball went into the hole. */
  fell: boolean;
}
export interface State {
  size: number;
  scopes: Telescope[];
  lens: number[];
  ball: number;
  hole: number;
  /** Where the ball stood at the start. */
  start: number;
  stage: number;
  /** The telescopes pressed, in order. */
  pressed: number[];
  /** A shortest way found as the board was laid. */
  plan: number[];
  /** The fewest presses (for the hint and the tests; shown nowhere). */
  best: number;
  last: Last | null;
  winner: Winner;
  ply: number;
}

export interface Stage {
  size: number;
  scopes: [number, number];
  /** The band the fewest presses must lie in. */
  band: [number, number];
  /** How many steps the ball's journey is laid with, and how many of the telescopes are kept for crowding round it. */
  walk: number;
  crowd: number;
  /** How many telescopes the board is climbed with (the rest are crowded round after), within a square of `window` round the ball. */
  core: [number, number];
  window: number;
  /** How many arrangements a board's search may take up while it is climbed. */
  cap: number;
  /** How many changes a board is climbed through at most, and how many boards are judged in all before the best in the
   * band seen is taken. */
  climb: number;
  budget: number;
  /** What the shortest way must come to: telescopes used, pulls, and presses that only set or take away a stop. */
  used: number;
  pulls: number;
  stops: number;
}
export const STAGES: Stage[] = [
  { size: 7, scopes: [5, 7], band: [5, 7], walk: 8, crowd: 2, core: [3, 6], window: 6, cap: 3000, climb: 300, budget: 300, used: 3, pulls: 1, stops: 0 },
  { size: 8, scopes: [8, 10], band: [7, 10], walk: 12, crowd: 3, core: [4, 8], window: 7, cap: 3000, climb: 300, budget: 400, used: 4, pulls: 2, stops: 1 },
  { size: 10, scopes: [11, 14], band: [10, 13], walk: 16, crowd: 4, core: [5, 10], window: 8, cap: 4000, climb: 300, budget: 500, used: 5, pulls: 2, stops: 1 },
  { size: 11, scopes: [15, 18], band: [12, 16], walk: 14, crowd: 6, core: [6, 12], window: 8, cap: 4000, climb: 300, budget: 400, used: 6, pulls: 3, stops: 2 },
  { size: 13, scopes: [19, 23], band: [15, 19], walk: 14, crowd: 8, core: [6, 11], window: 8, cap: 2500, climb: 300, budget: 380, used: 7, pulls: 3, stops: 2 },
];
export const stageOf = (stage: number) => Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1));

const inside = (n: number, r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n;
/** The cell `k` steps from `cell` in direction `d`, or -1 off the board. */
export function stepFrom(n: number, cell: number, d: number, k = 1) {
  const r = Math.floor(cell / n) + DR[d] * k,
    c = (cell % n) + DC[d] * k;
  return inside(n, r, c) ? r * n + c : -1;
}
/** Which telescope holds each cell (base or drawn-out body), or -1. */
export function occupancy(n: number, scopes: Telescope[], lens: ArrayLike<number>, out = new Int16Array(n * n)) {
  out.fill(-1);
  scopes.forEach((s, t) => {
    out[s.cell] = t;
    for (let k = 1; k <= lens[t]; k++) out[stepFrom(n, s.cell, s.dir, k)] = t;
  });
  return out;
}
/** The cells of telescope `t` beyond its base (its body), tip last. */
export function bodyOf(state: Pick<State, "size" | "scopes" | "lens">, t: number) {
  const s = state.scopes[t],
    out: number[] = [];
  for (let k = 1; k <= state.lens[t]; k++) out.push(stepFrom(state.size, s.cell, s.dir, k));
  return out;
}
/** The cell telescope `t` touches: just beyond its tip (beyond its base when closed), or -1 off the board. */
export const touchOf = (state: Pick<State, "size" | "scopes" | "lens">, t: number) => stepFrom(state.size, state.scopes[t].cell, state.scopes[t].dir, state.lens[t] + 1);

/**
 * A press on telescope `t`, by the rules above, with `occ` the occupancy of the arrangement: the new length (-1 when
 * the press is refused), the ball's cells along the way written into `trail` (the cell before first), and in
 * `fell[0]` whether it dropped into the hole. Shared by `play` and the search.
 */
function pressOn(n: number, scopes: Telescope[], lens: ArrayLike<number>, occ: Int16Array, ball: number, hole: number, t: number, trail: number[], fell: boolean[]) {
  const { cell, dir } = scopes[t],
    len = lens[t];
  trail.length = 0;
  trail.push(ball);
  fell[0] = false;
  let b = ball;
  if (len > 0) {
    const held = ball === stepFrom(n, cell, dir, len + 1);
    for (let k = len - 1; k >= 0; k--) {
      if (held && !fell[0]) {
        b = stepFrom(n, cell, dir, k + 1);
        if (b === hole) fell[0] = true;
      }
      trail.push(b);
    }
    return 0;
  }
  const reach = scopes[t].reach;
  let k = 0;
  while (k < reach) {
    const next = stepFrom(n, cell, dir, k + 1);
    if (next < 0 || occ[next] >= 0) break;
    if (next === b) {
      const beyond = stepFrom(n, next, dir);
      if (beyond < 0 || occ[beyond] >= 0) break;
      b = beyond;
      if (b === hole) fell[0] = true;
    }
    k++;
    trail.push(b);
    if (fell[0]) break;
  }
  return k === 0 ? -1 : k;
}

/** Why a press on telescope `move.to` is refused, or null. */
export function refusal(state: State, move: Move) {
  if (state.winner !== null || move.from !== -1 || move.to < 0 || move.to >= state.scopes.length) return null;
  const t = move.to;
  if (state.lens[t] > 0) return null;
  const n = state.size,
    s = state.scopes[t],
    next = stepFrom(n, s.cell, s.dir);
  if (next < 0) return "판 가장자리를 향하고 있어 늘일 수 없습니다.";
  const occ = occupancy(n, state.scopes, state.lens),
    holder = occ[next];
  if (holder >= 0) return state.scopes[holder].cell === next ? "바로 앞에 다른 망원경이 서 있어 늘일 수 없습니다." : "바로 앞을 늘어난 망원경이 막고 있어 늘일 수 없습니다.";
  if (next === state.ball) {
    const beyond = stepFrom(n, next, s.dir);
    return beyond < 0 ? "공이 판 가장자리에 붙어 있어 더 밀 수 없습니다." : "공 너머가 망원경에 막혀 있어 공을 밀 수 없습니다.";
  }
  return null;
}
/** The state after pressing `move.to`, or null when the press is refused. */
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to)) return null;
  const t = move.to;
  if (t < 0 || t >= state.scopes.length) return null;
  const n = state.size,
    trail: number[] = [],
    fell = [false],
    len = pressOn(n, state.scopes, state.lens, occupancy(n, state.scopes, state.lens), state.ball, state.hole, t, trail, fell);
  if (len < 0) return null;
  const lens = [...state.lens];
  lens[t] = len;
  const ball = trail[trail.length - 1];
  return {
    ...state,
    lens,
    ball,
    pressed: [...state.pressed, t],
    last: { t, from: state.lens[t], to: len, balls: [...trail], fell: fell[0] },
    winner: fell[0] ? 0 : null,
    ply: state.ply + 1,
  };
}
/** The presses that may be made now (every telescope drawn out, and every closed one that can be drawn out). */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  return state.scopes.flatMap((_, t) => (play(state, { from: -1, to: t, extra: -1 }) ? [{ from: -1, to: t, extra: -1 }] : []));
}
/** The state at the start of this board, everything closed and the ball back where it was. */
export const restart = (state: State): State => ({ ...state, lens: state.scopes.map(() => 0), ball: state.start, pressed: [], last: null, winner: null, ply: 0 });
/** The state with the last press taken back, replayed from the start. */
export function undo(state: State): State {
  let s = restart(state);
  for (const t of state.pressed.slice(0, -1)) s = play(s, { from: -1, to: t, extra: -1 })!;
  return s;
}

/*
 * The search for a shortest way into the hole: A* over arrangements (every telescope's length and the ball's cell).
 * Arrangements are kept in flat typed arrays and known by a number (lengths in mixed radix, then the ball), or by
 * text when that number would not be exact.
 *
 * A looser board helps: one where only the bases and the edge stand in the ball's way (no drawn-out body, and any
 * telescope may be at any length up to its own reach). Every press that moves the ball on the real board moves it along one of the looser
 * board's lines (`lines`), so
 * - the cells the looser board can bring the ball onto from the start hold every cell it can ever be on; a telescope
 *   that can never reach one of them, nor reach into the way of a telescope that can (and so on), never matters, and
 *   is left out of the search (`relevant`), as are telescopes that can never be drawn out at all;
 * - the fewest presses the looser board needs from a cell (`distances`) never says more than the real board does.
 * The estimate of an arrangement is that, from the ball's cell, taken over each line that can move the ball next,
 * with one press more when its telescope must first be pressed for it (closed to push, drawn out to just that length
 * to pull): it never says more than the truth, so the search is exact. A ball the looser board cannot bring to the
 * hole is a dead end, given up at once.
 */
/** How many arrangements a search may take up before it gives up. */
export const CAP = 60000;
/** The longest each telescope can ever be, from its own reach, the bases and the edge alone. */
export function maxima(n: number, scopes: Telescope[]) {
  const bases = new Uint8Array(n * n);
  for (const s of scopes) bases[s.cell] = 1;
  return scopes.map((s) => {
    let k = 0;
    while (k < s.reach) {
      const next = stepFrom(n, s.cell, s.dir, k + 1);
      if (next < 0 || bases[next]) break;
      k++;
    }
    return k;
  });
}
/** A line of the looser board: telescope `t` moves a ball on `from` over `cells` (in order); a pull needs length `pull`, a push (`pull` 0) a closed telescope. */
export interface Line {
  t: number;
  from: number;
  cells: number[];
  pull: number;
}
/** Every line of the looser board (see above). */
export function lines(n: number, scopes: Telescope[]) {
  const most = maxima(n, scopes),
    bases = new Uint8Array(n * n),
    out: Line[] = [];
  for (const s of scopes) bases[s.cell] = 1;
  scopes.forEach((s, t) => {
    const m = most[t];
    // A push of a ball the tip meets j cells out: on while the next cell is open, at most one beyond the furthest tip.
    for (let j = 1; j <= m; j++) {
      const cells: number[] = [];
      for (let k = j; k <= m; k++) {
        const y = stepFrom(n, s.cell, s.dir, k + 1);
        if (y < 0 || bases[y]) break;
        cells.push(y);
      }
      if (cells.length) out.push({ t, from: stepFrom(n, s.cell, s.dir, j), cells, pull: 0 });
    }
    // A pull of a ball touching the tip at length L: back over the body to the cell beyond the base.
    for (let L = 1; L <= m; L++) {
      const x = stepFrom(n, s.cell, s.dir, L + 1);
      if (x < 0 || bases[x]) continue;
      const cells: number[] = [];
      for (let k = L; k >= 1; k--) cells.push(stepFrom(n, s.cell, s.dir, k));
      out.push({ t, from: x, cells, pull: L });
    }
  });
  return out;
}
/**
 * For every cell, the fewest presses that bring a ball there into the hole on the looser board (-1 when none can):
 * a line takes it into the hole when the hole is any cell it passes, and otherwise may leave it on any of them.
 */
export function distances(n: number, scopes: Telescope[], hole: number, all = lines(n, scopes)) {
  const into: number[][] = Array.from({ length: n * n }, () => []);
  for (const line of all) for (const y of line.cells) into[y].push(line.from);
  const dist = new Int16Array(n * n).fill(-1),
    queue = [hole];
  dist[hole] = 0;
  for (let i = 0; i < queue.length; i++) {
    const y = queue[i];
    for (const x of into[y])
      if (dist[x] < 0) {
        dist[x] = dist[y] + 1;
        queue.push(x);
      }
  }
  return dist;
}
/** Which telescopes can matter to a ball starting on `ball` (see above). */
export function relevant(n: number, scopes: Telescope[], ball: number, all = lines(n, scopes)) {
  const most = maxima(n, scopes),
    from: Line[][] = Array.from({ length: n * n }, () => []);
  for (const line of all) from[line.from].push(line);
  // Every cell the looser board can bring the ball onto.
  const reach = new Uint8Array(n * n),
    queue = [ball];
  reach[ball] = 1;
  for (let i = 0; i < queue.length; i++)
    for (const line of from[queue[i]])
      for (const y of line.cells)
        if (!reach[y]) {
          reach[y] = 1;
          queue.push(y);
        }
  // A telescope's reach (the cells its tip may come onto, and the one beyond, where a ball it pushes would go) and its body's.
  const zone = scopes.map((s, t) => {
      const cells: number[] = [];
      for (let k = 1; k <= most[t] + 1; k++) {
        const x = stepFrom(n, s.cell, s.dir, k);
        if (x < 0) break;
        cells.push(x);
      }
      return cells;
    }),
    body = zone.map((cells, t) => cells.slice(0, most[t]));
  const keep = scopes.map((_, t) => most[t] > 0 && zone[t].some((x) => reach[x]));
  // Anything whose body can come into the reach of one kept is kept too.
  const watched = new Uint8Array(n * n);
  for (let changed = true; changed; ) {
    changed = false;
    scopes.forEach((_, t) => {
      if (keep[t]) for (const x of zone[t]) watched[x] = 1;
    });
    scopes.forEach((_, t) => {
      if (!keep[t] && most[t] > 0 && body[t].some((x) => watched[x])) keep[t] = changed = true;
    });
  }
  return keep;
}
export interface Found {
  /** The telescopes to press, in order; null when there is no way, or none was found within `cap`. */
  way: number[] | null;
  /** Arrangements taken up. */
  taken: number;
  /** The search gave up at `cap` (so null says nothing about whether there is a way). */
  capped: boolean;
}
/** A shortest way from (`lens`, `ball`) into `hole` (see above), taking up at most `cap` arrangements. */
export function search(n: number, scopes: Telescope[], lens: ArrayLike<number>, ball: number, hole: number, cap = CAP): Found {
  const all = lines(n, scopes),
    h0 = distances(n, scopes, hole, all);
  if (h0[ball] < 0) return { way: null, taken: 0, capped: false };
  const most = maxima(n, scopes),
    keep = relevant(n, scopes, ball, all),
    // A telescope drawn out at the start that does not matter stays drawn out (it is never pressed).
    live = scopes.flatMap((_, t) => (keep[t] ? [t] : [])),
    L = live.length;
  // From each cell, the lines that can move the ball next, each with the fewest presses after it.
  const leaving: { t: number; pull: number; after: number }[][] = Array.from({ length: n * n }, () => []);
  for (const line of all) {
    if (!keep[line.t]) continue;
    let after = -1;
    for (const y of line.cells) {
      if (y === hole) {
        after = 0;
        break;
      }
      if (h0[y] >= 0 && (after < 0 || h0[y] < after)) after = h0[y];
    }
    if (after >= 0) leaving[line.from].push({ t: line.t, pull: line.pull, after });
  }
  /** The estimate for the ball on `b` with the lengths `at` (by telescope): -1 for a dead end. */
  const estimate = (b: number, at: ArrayLike<number>) => {
    let best = -1;
    for (const e of leaving[b]) {
      const ready = e.pull ? at[e.t] === e.pull : at[e.t] === 0,
        v = (ready ? 1 : 2) + e.after;
      if (best < 0 || v < best) best = v;
    }
    return best;
  };
  let room = 1024,
    store = new Uint8Array(room * L),
    balls = new Int16Array(room),
    parent = new Int32Array(room),
    move = new Int16Array(room),
    cost = new Int16Array(room),
    rank = new Int16Array(room);
  const grow = () => {
    room *= 2;
    const s2 = new Uint8Array(room * L);
    s2.set(store);
    store = s2;
    const widen = <A extends Int16Array | Int32Array>(a: A, make: (k: number) => A) => {
      const b = make(room);
      b.set(a);
      return b;
    };
    balls = widen(balls, (k) => new Int16Array(k));
    parent = widen(parent, (k) => new Int32Array(k));
    move = widen(move, (k) => new Int16Array(k));
    cost = widen(cost, (k) => new Int16Array(k));
    rank = widen(rank, (k) => new Int16Array(k));
  };
  const full = Uint8Array.from({ length: scopes.length }, (_, t) => lens[t]),
    first = estimate(ball, full);
  if (first < 0) return { way: null, taken: 0, capped: false };
  // The arrangements already taken up, found by an open-addressed table of their numbers, keyed by a hash of their
  // lengths and ball and compared in full on a match (so the search stays exact however many telescopes there are).
  let mask = 4095,
    table = new Int32Array(mask + 1).fill(-1);
  const hashOf = (at: number, b: number) => {
      let x = Math.imul(b + 1, 0x9e3779b1);
      for (let i = 0; i < L; i++) x = Math.imul(x ^ store[at + i], 0x01000193);
      return (x ^ (x >>> 15)) >>> 0;
    },
    /** The slot holding the arrangement written at `at` with the ball on `b`, or the empty slot where it would go. */
    slotOf = (at: number, b: number) => {
      let slot = hashOf(at, b) & mask;
      for (;;) {
        const k = table[slot];
        if (k < 0) return slot;
        if (balls[k] === b) {
          let same = true;
          for (let i = 0, x = k * L; i < L; i++)
            if (store[x + i] !== store[at + i]) {
              same = false;
              break;
            }
          if (same) return slot;
        }
        slot = (slot + 1) & mask;
      }
    },
    widenTable = (count: number) => {
      mask = mask * 2 + 1;
      table = new Int32Array(mask + 1).fill(-1);
      for (let k = 0; k < count; k++) table[slotOf(k * L, balls[k])] = k;
    };
  for (let i = 0; i < L; i++) store[i] = lens[live[i]];
  balls[0] = ball;
  parent[0] = -1;
  move[0] = -1;
  cost[0] = 0;
  rank[0] = first;
  table[slotOf(0, ball)] = 0;
  let count = 1;
  // A bucket of arrangements for each estimate of the whole way (presses so far plus the estimate), the deepest first
  // within one. An estimate below the bucket being emptied is raised to it (so the order never goes back).
  const buckets: number[][] = [];
  let f = first;
  const push = (at: number, value: number) => {
    rank[at] = Math.max(value, f);
    (buckets[rank[at]] ??= []).push(at);
  };
  buckets[first] = [0];
  const occ = new Int16Array(n * n),
    trail: number[] = [],
    fell = [false],
    wayTo = (at: number, last: number) => {
      const out = [last];
      for (let s = at; s > 0; s = parent[s]) out.push(move[s]);
      return out.reverse();
    };
  let best: number[] | null = null;
  for (; f < buckets.length || best; f++) {
    // A way found ends the search once nothing left could be shorter.
    if (best && best.length <= f) return { way: best, taken: count, capped: false };
    const bucket = buckets[f];
    if (!bucket) continue;
    while (bucket.length) {
      const at = bucket.pop()!,
        g = cost[at];
      // Put here again since (more cheaply).
      if (rank[at] !== f) continue;
      rank[at] = -1;
      for (let i = 0; i < L; i++) full[live[i]] = store[at * L + i];
      occupancy(n, scopes, full, occ);
      const b = balls[at];
      for (let i = 0; i < L; i++) {
        const t = live[i],
          len = pressOn(n, scopes, full, occ, b, hole, t, trail, fell);
        if (len < 0) continue;
        if (fell[0]) {
          if (!best || g + 1 < best.length) best = wayTo(at, t);
          continue;
        }
        const nb = trail[trail.length - 1],
          was = full[t];
        full[t] = len;
        const h = estimate(nb, full);
        full[t] = was;
        if (h < 0) continue;
        if (count >= room) grow();
        const base = count * L;
        store.copyWithin(base, at * L, at * L + L);
        store[base + i] = len;
        const slot = slotOf(base, nb),
          known = table[slot];
        if (known >= 0) {
          if (cost[known] <= g + 1) continue;
          // Reached more cheaply: its way and cost are mended and it goes into a bucket again.
          cost[known] = g + 1;
          parent[known] = at;
          move[known] = t;
          push(known, g + 1 + h);
          continue;
        }
        table[slot] = count;
        balls[count] = nb;
        parent[count] = at;
        move[count] = t;
        cost[count] = g + 1;
        push(count, g + 1 + h);
        count++;
        if (count >= cap) return { way: null, taken: count, capped: true };
        if (count * 2 > mask) widenTable(count);
      }
    }
  }
  return { way: best, taken: count, capped: false };
}
/** A shortest way from the state shown into the hole, as telescopes to press; [] when solved, null when none was found. */
export function solve(state: State, cap = CAP * 3): number[] | null {
  if (state.winner !== null) return [];
  return search(state.size, state.scopes, state.lens, state.ball, state.hole, cap).way;
}
/** The hint: the next press of the plan while I follow it, else of a shortest way from here; null when none is found. */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const press = (t: number) => ({ from: -1, to: t, extra: -1 }),
    { plan, pressed } = state;
  if (pressed.length < plan.length && pressed.every((t, i) => plan[i] === t)) return press(plan[pressed.length]);
  const way = solve(state);
  return way && way.length ? press(way[0]) : null;
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
const pickBy = <X>(random: Random, items: X[], weight: (x: X) => number) => {
  let total = 0;
  for (const x of items) total += weight(x);
  let r = random() * total;
  for (const x of items) if ((r -= weight(x)) < 0) return x;
  return items[items.length - 1];
};
/** A board as the laying sees it: the telescopes, their lengths and the ball, with the ball's cells passed so far. */
interface Draft {
  n: number;
  scopes: Telescope[];
  lens: number[];
  ball: number;
  start: number;
  plan: number[];
  /** Cells the ball has been on, and after how many presses it first came onto each. */
  visited: Map<number, number>;
}
/** Presses `t` on the draft; false (and nothing changed) when it is refused. */
function pressDraft(d: Draft, t: number) {
  const trail: number[] = [],
    fell = [false],
    len = pressOn(d.n, d.scopes, d.lens, occupancy(d.n, d.scopes, d.lens), d.ball, -1, t, trail, fell);
  if (len < 0) return false;
  d.lens[t] = len;
  d.plan.push(t);
  for (const c of trail) if (!d.visited.has(c)) d.visited.set(c, d.plan.length);
  d.ball = trail[trail.length - 1];
  return true;
}
/** How many telescopes of each kind there are, by reach. */
function kindsOf(scopes: Telescope[]) {
  const have: Record<Reach, number> = { 2: 0, 3: 0, 4: 0 };
  for (const s of scopes) have[s.reach]++;
  return have;
}
/** How much more a kind is chosen for a new telescope behind the ball when its own reach is what stops the ball. */
const TELLING = 3;
/** The draft's cells held by a base, a body or the ball. */
function heldCells(d: Draft) {
  const occ = occupancy(d.n, d.scopes, d.lens);
  occ[d.ball] = 999;
  return occ;
}
/**
 * The ball's journey as the board is laid: from a ball alone on the board, `steps` times one of
 * - pressing a telescope already there that moves the ball onto a cell it has not been on (a push, or a pull back);
 * - setting down a new telescope behind the ball, on a free cell one to four cells back along a free line, pointing at
 *   it, and pressing it (a push), sometimes with a new telescope's base set down just where the push is to stop;
 * - now and then pressing a telescope that leaves the ball where it is (drawing one out to stand in the way later, or
 *   closing one),
 * never more than `most` telescopes in all. The ball must keep coming onto new cells; the walk ends early when it
 * cannot.
 */
function journey(n: number, steps: number, most: number, random: Random): Draft {
  const ball = (1 + Math.floor(random() * (n - 2))) * n + 1 + Math.floor(random() * (n - 2)),
    d: Draft = { n, scopes: [], lens: [], ball, start: ball, plan: [], visited: new Map([[ball, 0]]) };
  const tryPress = (t: number) => {
    const copy: Draft = { ...d, lens: [...d.lens], plan: [...d.plan], visited: new Map(d.visited) };
    if (!pressDraft(copy, t)) return null;
    return copy;
  };
  const sr = Math.floor(ball / n),
    sc = ball % n,
    farther = (cell: number) => 0.5 + (Math.abs(Math.floor(cell / n) - sr) + Math.abs((cell % n) - sc)) / n,
    // A ball on the rim has few ways out (none from a corner): the journey keeps off it.
    rim = (cell: number) => {
      const r = Math.floor(cell / n),
        c = cell % n,
        edges = Number(r === 0 || r === n - 1) + Number(c === 0 || c === n - 1);
      return edges === 2 ? 0.03 : edges ? 0.25 : 1;
    };
  let still = 0;
  for (let step = 0, moves = 0; moves < steps && step < steps * 3; step++) {
    const options: { weight: number; run: () => Draft | null }[] = [],
      idle: Draft[] = [];
    // Presses of telescopes already there.
    d.scopes.forEach((_, t) => {
      const after = tryPress(t);
      if (!after) return;
      const moved = after.ball !== d.ball,
        fresh = moved && !d.visited.has(after.ball);
      // A press that takes the ball further from where it began is preferred, so that the journey goes somewhere.
      if (fresh) options.push({ weight: 3 * farther(after.ball) * rim(after.ball), run: () => after });
      else if (!moved) idle.push(after);
      // Back onto a cell it has been on: seldom, to get out of a corner.
      else options.push({ weight: 0.25 * rim(after.ball), run: () => after });
    });
    // Presses that leave the ball where it is weigh as much as one fresh press all together, so that they come now and then.
    // (Never more than two in a row: a ball that cannot go on ends the journey.)
    if (idle.length && still < 2) options.push({ weight: 1, run: () => idle[Math.floor(random() * idle.length)] });
    // A new telescope behind the ball, of a kind chosen on purpose: mostly one whose own reach is what stops the ball
    // (a longer kind would push it further), so that the colour matters on the way laid.
    if (d.scopes.length < most) {
      const held = heldCells(d),
        have = kindsOf(d.scopes);
      for (let dir = 0; dir < 4; dir++) {
        const back = (dir + 2) % 4,
          ahead = stepFrom(n, d.ball, dir);
        // Where the ball would go: a fresh cell beyond it.
        if (ahead < 0 || held[ahead] >= 0) continue;
        for (let j = 1; j <= MAX_REACH; j++) {
          const base = stepFrom(n, d.ball, back, j);
          if (base < 0 || held[base] >= 0) break;
          // How far the ball could go ahead before something stops it, whatever the kind.
          let open = 0;
          for (let k = 1; k <= MAX_REACH - j + 1; k++) {
            const x = stepFrom(n, d.ball, dir, k);
            if (x < 0 || held[x] >= 0) break;
            open = k;
          }
          const kinds = REACHES.filter((reach) => reach >= j),
            prefer = (reach: Reach) => (reach - j + 1 < open ? TELLING : 1) / (1 + have[reach]),
            total = kinds.reduce((sum, reach) => sum + prefer(reach), 0);
          for (const reach of kinds) {
            const room = reach - j + 1,
              telling = room < open,
              // Where an unhindered push would leave it: at the rim, a stopper is set down more often.
              end = stepFrom(n, d.ball, dir, Math.min(room, open));
            options.push({
              weight: (1.2 * farther(end) * prefer(reach)) / total,
              run: () => {
                const copy: Draft = { ...d, scopes: [...d.scopes, { cell: base, dir, reach }], lens: [...d.lens, 0], plan: [...d.plan], visited: new Map(d.visited) };
                // Sometimes a base is set down where the ball is to stop, short of the furthest it could go (less
                // often when the kind's own reach stops it already).
                if (copy.scopes.length < most && random() < (telling ? 0.25 : rim(end) < 1 ? 0.85 : 0.4)) {
                  const stop = 1 + Math.floor(random() * room),
                    beyond = stepFrom(n, d.ball, dir, stop + 1);
                  if (beyond >= 0 && held[beyond] < 0 && beyond !== base) {
                    // The stopper points across the ball's way, a way with room, so that it is a telescope too.
                    const across = [0, 1, 2, 3].filter((w) => w !== dir && w !== back && stepFrom(n, beyond, w) >= 0);
                    const w = across.length ? across[Math.floor(random() * across.length)] : dir;
                    copy.scopes.push({ cell: beyond, dir: w, reach: pickBy(random, [...REACHES], (r) => 1 / (1 + have[r])) });
                    copy.lens.push(0);
                  }
                }
                if (!pressDraft(copy, copy.scopes.length - (copy.scopes[copy.scopes.length - 1].cell === base ? 1 : 2))) return null;
                return copy.ball !== d.ball && !d.visited.has(copy.ball) ? copy : null;
              },
            });
          }
        }
      }
    }
    let next: Draft | null = null;
    for (let k = 0; k < 6 && !next && options.length; k++) {
      const o = pickBy(random, options, (x) => x.weight);
      next = o.run();
      if (!next) options.splice(options.indexOf(o), 1);
    }
    if (!next) break;
    if (next.ball !== d.ball) {
      moves++;
      still = 0;
    } else still++;
    Object.assign(d, next);
  }
  return d;
}
/** Whether pressing `plan` from the start of the board brings the ball into `hole` with the last press, and not before. */
function lands(n: number, scopes: Telescope[], ball: number, hole: number, plan: number[]) {
  const lens = scopes.map(() => 0),
    trail: number[] = [],
    fell = [false];
  for (let i = 0; i < plan.length; i++) {
    const len = pressOn(n, scopes, lens, occupancy(n, scopes, lens), ball, hole, plan[i], trail, fell);
    if (len < 0) return false;
    if (fell[0]) return i === plan.length - 1;
    lens[plan[i]] = len;
    ball = trail[trail.length - 1];
  }
  return false;
}
/**
 * More telescopes set down on free cells, mostly next to those already there and each pointing a way with room,
 * until there are `count`; one that would spoil the way laid (`plan` no longer bringing the ball in) is taken away.
 */
function crowd(n: number, scopes: Telescope[], ball: number, hole: number, plan: number[], count: number, random: Random) {
  const out = [...scopes];
  for (let tries = 0; out.length < count && tries < count * 12; tries++) {
    const taken = new Uint8Array(n * n);
    for (const s of out) taken[s.cell] = 1;
    taken[ball] = 1;
    if (hole >= 0) taken[hole] = 1;
    const cells: number[] = [];
    for (let c = 0; c < n * n; c++) if (!taken[c]) cells.push(c);
    if (!cells.length) break;
    // Next to others (sideways too, and corner to corner), so that they stand packed.
    const near = (c: number) => {
      let around = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const r = Math.floor(c / n) + dr,
            cc = (c % n) + dc;
          if ((dr || dc) && inside(n, r, cc) && taken[r * n + cc] && r * n + cc !== ball && r * n + cc !== hole) around++;
        }
      return around;
    };
    const cell = pickBy(random, cells, (c) => 1 + CLOSE * Math.min(3, near(c))),
      ways = [0, 1, 2, 3].filter((dir) => {
        const x = stepFrom(n, cell, dir);
        return x >= 0 && !(taken[x] && x !== ball && x !== hole);
      });
    if (!ways.length) continue;
    // A way that meets another telescope (or the ball) within the kind's reach is preferred: the two then face or
    // cross each other. The kinds fewest on the board so far are preferred, so that the three are mixed.
    const meets = (dir: number, reach: number) => {
      for (let k = 2; k <= reach + 1; k++) {
        const x = stepFrom(n, cell, dir, k);
        if (x < 0) return false;
        if (taken[x]) return true;
      }
      return false;
    };
    const have = kindsOf(out),
      choices = ways.flatMap((dir) => REACHES.map((reach) => ({ dir, reach }))),
      { dir, reach } = pickBy(random, choices, (o) => (meets(o.dir, o.reach) ? 3 : 1) / (1 + have[o.reach]) ** 2),
      trial = [...out, { cell, dir, reach }];
    if (hole < 0 || lands(n, trial, ball, hole, plan)) out.splice(0, out.length, ...trial);
  }
  return out;
}
/** How much a free cell next to telescopes already set is preferred for a new one (so that they stand close). */
const CLOSE = 3;
const blank = (n: number, scopes: Telescope[], ball: number, hole: number, stage: number, plan: number[]): State => ({
  size: n,
  scopes,
  lens: scopes.map(() => 0),
  ball,
  hole,
  start: ball,
  stage,
  pressed: [],
  plan,
  best: plan.length,
  last: null,
  winner: null,
  ply: 0,
});
/**
 * Whether the colours matter on a board: telescopes all of the longest kind would make another puzzle of it (the way
 * laid no longer brings the ball in, or the fewest presses change).
 */
export function colourMatters(state: State, cap = JUDGE_CAP) {
  const longest = state.scopes.map((s) => ({ ...s, reach: MAX_REACH as Reach }));
  if (!lands(state.size, longest, state.start, state.hole, state.plan)) return true;
  const found = search(state.size, longest, longest.map(() => 0), state.start, state.hole, cap);
  return found.capped || !found.way || found.way.length !== state.best;
}
/** How many cells of a journey are tried for the hole. */
const HOLES = 2;
/** How many journeys are laid for a board, the longest kept. */
const JOURNEYS = 6;
/** How many arrangements the search may take up while a board is judged (a board that needs more is passed over). */
const JUDGE_CAP = 20000;
/**
 * A journey laid for a stage (`journey`), before it is judged: the telescopes it set down, and the holes to try (the
 * cells it came onto last, each with the presses that brought the ball there); null when it went nowhere.
 */
export function lay(stage: number, random: Random, journeys = JOURNEYS) {
  const spec = STAGES[stage - 1],
    n = spec.size,
    count = spec.scopes[0] + Math.floor(random() * (spec.scopes[1] - spec.scopes[0] + 1));
  // Of a few journeys, the one with the most presses that brought the ball somewhere new.
  let d: Draft | null = null,
    most = -1;
  for (let k = 0; k < journeys; k++) {
    const trial = journey(n, spec.walk, Math.max(2, count - spec.crowd), random),
      fresh = new Set(trial.visited.values()).size;
    if (fresh > most) {
      most = fresh;
      d = trial;
    }
  }
  if (!d) return null;
  // Holes to try: the cells the ball came onto last for the first time (where a press of the journey left it
  // first), the journey cut after the press that brought it there.
  const order = [...d.visited].filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1]);
  if (!order.length) return null;
  return { n, journey: d, count, holes: order.slice(0, HOLES).map(([cell, k]) => ({ cell, plan: d.plan.slice(0, k) })) };
}
/** What a search outward from the start found (`explore`). */
export interface Explored {
  /** For each cell, the fewest presses that bring the ball onto it (pushed or pulled over it, or left on it), -1 for none found. */
  arrive: Int16Array;
  /** The presses that first brought the ball onto a cell (good until the next search: the tables are shared). */
  wayTo: (cell: number) => number[];
  /** Every count of presses below this was searched in full; at and beyond it, not (the search was capped). */
  complete: number;
  /** Arrangements taken up. */
  taken: number;
}
/** The search's tables, kept between searches and grown as needed (a board is searched hundreds of times while it is laid). */
const tables = {
  room: 0,
  store: new Int32Array(0),
  parent: new Int32Array(0),
  move: new Int16Array(0),
  depth: new Int16Array(0),
  /** The open-addressed table of arrangements; a slot holds something only when its stamp is this search's. */
  slots: new Int32Array(0),
  stamps: new Int32Array(0),
  stamp: 0,
};
/**
 * A search outward from an arrangement with every telescope closed, breadth first, over every arrangement the
 * presses reach (with no hole), up to `cap` arrangements and `deepest` presses: for every cell, the fewest presses
 * after which the ball has come onto it. With the hole put on a cell, the game goes as it does here until the ball
 * first comes onto it, so that count is the fewest presses the puzzle needs, and the presses that did it are a
 * shortest way. Exact for every count below `complete`.
 *
 * Built for speed, as a board is searched hundreds of times while it is laid: each telescope that can matter has its
 * cells laid out once (`ray`), an arrangement is its lengths, three bits a telescope packed ten to a word, and the
 * ball's cell in a word of its own, and the arrangements taken up are found by an open-addressed table.
 */
export function explore(n: number, scopes: Telescope[], ball: number, cap: number, deepest = 1 << 14): Explored {
  const keep = relevant(n, scopes, ball),
    live = scopes.flatMap((_, t) => (keep[t] ? [t] : [])),
    L = live.length,
    R = MAX_REACH + 2,
    ray = new Int16Array(L * R).fill(-1),
    reach = new Uint8Array(L),
    wordOf = new Uint8Array(L),
    shiftOf = new Uint8Array(L),
    lens = new Uint8Array(L),
    trail = new Int16Array(MAX_REACH + 2),
    baseOcc = new Int16Array(n * n).fill(-1),
    arrive = new Int16Array(n * n).fill(-1),
    // For each cell, the arrangement it was first come onto from and the telescope pressed.
    from = new Int32Array(n * n).fill(-1),
    by = new Int16Array(n * n);
  scopes.forEach((s, t) => (baseOcc[s.cell] = t));
  for (let i = 0; i < L; i++) {
    const s = scopes[live[i]];
    reach[i] = s.reach;
    wordOf[i] = Math.floor(i / 10);
    shiftOf[i] = (i % 10) * 3;
    for (let k = 1; k <= s.reach + 1; k++) ray[i * R + k] = stepFrom(n, s.cell, s.dir, k);
  }
  // What can stand on each cell of each telescope's way: off the board or a base, always (`fixed`); or the body of
  // another telescope drawn out far enough (the pairs `coverJ`, `coverM` from `coverAt[i * R + k]` up to the next:
  // telescope j covers it once its length is at least m). So no picture of the whole board is made per arrangement.
  const fixed = new Uint8Array(L * R),
    coverAt = new Int32Array(L * R + 1),
    coverJ: number[] = [],
    coverM: number[] = [];
  for (let i = 0; i < L; i++)
    for (let k = 0; k < R; k++) {
      const at = i * R + k,
        cell = ray[at];
      coverAt[at] = coverJ.length;
      if (k === 0) continue;
      if (cell < 0 || baseOcc[cell] >= 0) fixed[at] = 1;
      else
        for (let j = 0; j < L; j++)
          for (let m = 1; m <= reach[j]; m++)
            if (j !== i && ray[j * R + m] === cell) {
              coverJ.push(j);
              coverM.push(m);
            }
    }
  coverAt[L * R] = coverJ.length;
  const held = (at: number) => {
    if (fixed[at]) return true;
    for (let x = coverAt[at], end = coverAt[at + 1]; x < end; x++) if (lens[coverJ[x]] >= coverM[x]) return true;
    return false;
  };
  // Ten telescopes a word, then the ball's cell in a word of its own.
  const W = Math.ceil(L / 10) + 1,
    ballWord = W - 1,
    T = tables;
  if (T.room < cap + 1 || T.store.length < (cap + 1) * W) {
    T.room = Math.max(cap + 1, T.room);
    T.store = new Int32Array(T.room * Math.max(W, 3));
    T.parent = new Int32Array(T.room);
    T.move = new Int16Array(T.room);
    T.depth = new Int16Array(T.room);
    let size = 1024;
    while (size < 2 * T.room) size *= 2;
    T.slots = new Int32Array(size);
    T.stamps = new Int32Array(size);
    T.stamp = 0;
  }
  const { store, parent, move, depth, slots, stamps } = T,
    mask = slots.length - 1,
    stamp = ++T.stamp;
  const key = new Int32Array(W),
    slotOf = (words: Int32Array, at: number) => {
      let x = 0x811c9dc5;
      for (let i = 0; i < W; i++) x = Math.imul(x ^ words[at + i], 0x01000193);
      let slot = (x ^ (x >>> 15)) & mask;
      for (;;) {
        if (stamps[slot] !== stamp) return slot;
        const k = slots[slot];
        let same = true;
        for (let i = 0, y = k * W; i < W; i++)
          if (store[y + i] !== words[at + i]) {
            same = false;
            break;
          }
        if (same) return slot;
        slot = (slot + 1) & mask;
      }
    },
    wayTo = (cell: number) => {
      if (from[cell] < 0) return [];
      const out = [by[cell]];
      for (let s = from[cell]; s > 0; s = parent[s]) out.push(move[s]);
      return out.reverse();
    };
  for (let w = 0; w < W; w++) store[w] = 0;
  store[ballWord] = ball;
  parent[0] = -1;
  move[0] = -1;
  depth[0] = 0;
  let first = slotOf(store, 0);
  stamps[first] = stamp;
  slots[first] = 0;
  arrive[ball] = 0;
  let count = 1,
    complete = Infinity;
  for (let head = 0; head < count; head++) {
    const g = depth[head],
      at = head * W;
    if (g >= deepest) {
      complete = Math.min(complete, g + 1);
      break;
    }
    // The arrangement: lengths and the ball.
    for (let i = 0; i < L; i++) lens[i] = (store[at + wordOf[i]] >>> shiftOf[i]) & 7;
    const b = store[at + ballWord];
    for (let i = 0; i < L; i++) {
      const len = lens[i],
        base = i * R;
      let size = 0,
        nb = b,
        now = 0;
      if (len > 0) {
        // Closing: a ball touching the tip comes back over the body to the cell beyond the base.
        if (b === ray[base + len + 1]) {
          for (let k = len; k >= 1; k--) trail[size++] = ray[base + k];
          nb = ray[base + 1];
        }
      } else {
        let k = 0;
        while (k < reach[i]) {
          const next = ray[base + k + 1];
          if (held(base + k + 1)) break;
          if (next === nb) {
            const beyond = ray[base + k + 2];
            if (held(base + k + 2)) break;
            nb = beyond;
            trail[size++] = nb;
          }
          k++;
        }
        if (k === 0) continue;
        now = k;
      }
      for (let j = 0; j < size; j++)
        if (arrive[trail[j]] < 0) {
          arrive[trail[j]] = g + 1;
          from[trail[j]] = head;
          by[trail[j]] = live[i];
        }
      // The arrangement after it.
      for (let w = 0; w < W; w++) key[w] = store[at + w];
      const word = wordOf[i],
        shift = shiftOf[i];
      key[word] = (key[word] & ~(7 << shift)) | (now << shift);
      key[ballWord] = nb;
      const slot = slotOf(key, 0);
      if (stamps[slot] === stamp) continue;
      if (count >= cap) {
        complete = Math.min(complete, g + 1);
        return { arrive, wayTo, complete, taken: count };
      }
      store.set(key, count * W);
      stamps[slot] = stamp;
      slots[slot] = count;
      parent[count] = head;
      move[count] = live[i];
      depth[count] = g + 1;
      count++;
    }
  }
  return { arrive, wayTo, complete, taken: count };
}

/**
 * One small change to a board as it is climbed: a telescope carried to a free cell (mostly near by), turned another
 * way or given another kind, or one taken away or set down, the count kept within `fewest` to `most`. Null when the
 * change cannot be made.
 */
function reshape(n: number, scopes0: Telescope[], ball: number, fewest: number, most: number, random: Random, win = n): Telescope[] | null {
  const r0 = Math.max(0, Math.min(n - win, Math.floor(ball / n) - Math.floor(win / 2))),
    c0 = Math.max(0, Math.min(n - win, (ball % n) - Math.floor(win / 2))),
    within = (cell: number) => Math.floor(cell / n) >= r0 && Math.floor(cell / n) < r0 + win && cell % n >= c0 && cell % n < c0 + win;
  const scopes = scopes0.map((s) => ({ ...s })),
    taken = new Uint8Array(n * n);
  for (const s of scopes) taken[s.cell] = 1;
  taken[ball] = 1;
  const free = (near: number) => {
      for (let k = 0; k < 30; k++) {
        let cell = Math.floor(random() * n * n);
        if (near >= 0 && random() < 0.7) {
          const r = Math.floor(near / n) + Math.floor(random() * 5) - 2,
            c = (near % n) + Math.floor(random() * 5) - 2;
          cell = inside(n, r, c) ? r * n + c : -1;
        }
        if (cell >= 0 && !taken[cell] && within(cell)) return cell;
      }
      return -1;
    },
    kind = () => REACHES[Math.floor(random() * REACHES.length)],
    t = Math.floor(random() * scopes.length),
    r = random();
  if (r < 0.35) {
    const cell = free(scopes[t].cell);
    if (cell < 0) return null;
    scopes[t].cell = cell;
    if (random() < 0.5) scopes[t].dir = Math.floor(random() * 4);
  } else if (r < 0.6) scopes[t].dir = (scopes[t].dir + 1 + Math.floor(random() * 3)) % 4;
  else if (r < 0.8) {
    const reach = kind();
    if (reach === scopes[t].reach) return null;
    scopes[t].reach = reach;
  } else if (r < 0.9) {
    if (scopes.length >= most) return null;
    const cell = free(scopes[t].cell);
    if (cell < 0) return null;
    scopes.push({ cell, dir: Math.floor(random() * 4), reach: kind() });
  } else {
    if (scopes.length <= fewest) return null;
    scopes.splice(t, 1);
  }
  return scopes;
}
/** What a way of presses from the start does: how many telescopes it uses, its pulls, its presses that leave the ball where it is, and the telescopes pressed three times or more. */
export function traits(n: number, scopes: Telescope[], ball: number, way: number[]) {
  const lens = scopes.map(() => 0),
    trail: number[] = [],
    fell = [false],
    count = new Map<number, number>();
  let pulls = 0,
    stops = 0;
  for (const t of way) {
    const len = pressOn(n, scopes, lens, occupancy(n, scopes, lens), ball, -1, t, trail, fell);
    if (len < 0) break;
    const nb = trail[trail.length - 1];
    if (nb === ball) stops++;
    else if (lens[t] > 0) pulls++;
    lens[t] = len;
    ball = nb;
    count.set(t, (count.get(t) ?? 0) + 1);
  }
  let again = 0;
  for (const k of count.values()) if (k >= 3) again++;
  return { used: count.size, pulls, stops, again };
}
/** What a board comes to, judged for climbing: the hole it would take, the way there, and how well it meets the stage. */
interface Judged {
  score: number;
  depth: number;
  hole: number;
  way: number[];
  taken: number;
  ready: boolean;
  parts: { depth: number; used: number; pulls: number; stops: number; again: number };
}
/**
 * Judges a board: every arrangement the presses reach from the start is searched (`explore`, up to the stage's `cap`
 * and the band's top), and the hole would go on the cell the ball comes onto last (the most presses). The score grows
 * with those presses up to the count aimed at, then with the telescopes the way uses, its pulls, its presses that only
 * set a telescope in the ball's way (or take one out of it), and telescopes it presses three times or more.
 */
function judge(n: number, scopes: Telescope[], ball: number, spec: Stage, want: number): Judged {
  const e = explore(n, scopes, ball, spec.cap, spec.band[1]);
  let hole = -1;
  for (let c = 0; c < n * n; c++) if (e.arrive[c] > 0 && e.arrive[c] < e.complete && (hole < 0 || e.arrive[c] > e.arrive[hole])) hole = c;
  if (hole < 0) return { score: -1, depth: 0, hole, way: [], taken: e.taken, ready: false, parts: { depth: 0, used: 0, pulls: 0, stops: 0, again: 0 } };
  const way = e.wayTo(hole),
    depth = way.length,
    { used, pulls, stops, again } = traits(n, scopes, ball, way),
    parts = { depth, used, pulls, stops, again },
    score = scoreOf(parts, spec, want),
    ready = depth >= want && used >= spec.used && pulls >= spec.pulls && stops >= spec.stops;
  return { score, depth, hole, way, taken: e.taken, ready, parts };
}
/** The score of a way's traits for a count aimed at (see `judge`). */
function scoreOf(p: Judged["parts"], spec: Stage, want: number) {
  return 4 * Math.min(p.depth, want) + 2 * Math.min(p.used, spec.used) + Math.min(p.pulls, spec.pulls) + Math.min(p.stops, spec.stops) + Math.min(p.again, 1);
}
/**
 * Whether a naive player finds the way: a greedy one that always presses what brings the ball nearest the hole (new
 * arrangements first, ties at random), or one pressing at random; each has a few tries of a few times the fewest
 * presses.
 */
export function naive(state: State, random: Random, tries = NAIVE_TRIES) {
  const n = state.size,
    apart = (b: number) => Math.abs(Math.floor(b / n) - Math.floor(state.hole / n)) + Math.abs((b % n) - (state.hole % n));
  for (let attempt = 0; attempt < 2 * tries; attempt++) {
    const greedy = attempt < tries,
      seen = new Set<string>();
    let s = state;
    for (let k = 0; k < (greedy ? 3 : 2) * state.best + 4 && s.winner === null; k++) {
      const after = s.scopes.flatMap((_, t) => {
        const x = play(s, { from: -1, to: t, extra: -1 });
        return x ? [x] : [];
      });
      if (!after.length) break;
      if (after.some((x) => x.winner === 0)) return true;
      if (!greedy) {
        s = after[Math.floor(random() * after.length)];
        continue;
      }
      const fresh = after.filter((x) => !seen.has(x.lens.join("") + "|" + x.ball)),
        pool = fresh.length ? fresh : after;
      let least = Infinity,
        ties = 0;
      for (const x of pool) {
        const v = apart(x.ball);
        if (v < least) {
          least = v;
          s = x;
          ties = 1;
        } else if (v === least && random() * ++ties < 1) s = x;
      }
      seen.add(s.lens.join("") + "|" + s.ball);
    }
  }
  return false;
}
/** How many tries each naive player has. */
const NAIVE_TRIES = 10;
/**
 * A new puzzle of `stage` (1–5). A count of presses is aimed at, drawn evenly from the stage's band. A few journeys
 * are laid (`lay`), cut to the stage's core of telescopes, and the one judged best (`judge`) is climbed: one change at
 * a time (`reshape`), kept when the board judges no worse, now and then when a little worse (less often as the climb
 * goes on), until the cell the ball comes onto last takes at least that many presses and the way there uses enough
 * telescopes, pulls and stops. The hole goes there and that way is the plan (`best` presses). The rest of the stage's
 * telescopes are then crowded round (`crowd`, none that spoils the plan) and the fewest presses searched for again
 * (`search`): they must still lie in the band. A board is kept when all three kinds stand on it, their colours matter
 * (`colourMatters`) and neither naive player finds the way (`naive`); after a few boards, any in the band will do.
 */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const at = stageOf(stage),
    spec = STAGES[at - 1],
    n = spec.size;
  // One number is drawn from `random`; the many the laying needs come from a quick generator seeded with it.
  random = quick(Math.floor(random() * 4294967296));
  const want = spec.band[0] + Math.floor(random() * (spec.band[1] - spec.band[0] + 1));
  // The best board in the band seen on the way (by its score at the band's foot), for when patience runs out.
  let spare: { scopes: Telescope[]; ball: number; j: Judged } | null = null,
    judged = 0;
  for (let round = 0; ; round++) {
    const aim = Math.max(spec.band[0], want - round),
      strict = judged < spec.budget,
      judgeOf = (scopes: Telescope[], ball: number) => {
        judged++;
        const j = judge(n, scopes, ball, spec, aim);
        if (j.depth >= spec.band[0] && j.depth <= spec.band[1]) {
          const base = scoreOf(j.parts, spec, spec.band[0]);
          if (!spare || base > scoreOf(spare.j.parts, spec, spec.band[0])) spare = { scopes, ball, j };
        }
        return j;
      };
    if (!strict && spare) {
      const { scopes, ball, j } = spare as { scopes: Telescope[]; ball: number; j: Judged };
      return finish(n, scopes, ball, j, spec, at, random, false)!;
    }
    // The best of a few journeys to climb from, its telescopes near the ball (within `window`) cut to the core.
    let ball = -1,
      scopes: Telescope[] = [],
      cur: Judged | null = null;
    for (let k = 0; k < SEEDS; k++) {
      const laid = lay(at, random, 1);
      if (!laid || laid.journey.scopes.length < 2) continue;
      const start = laid.journey.start,
        near = windowOf(n, start, spec.window),
        core = laid.journey.scopes.filter((x) => near(x.cell) && x.cell !== start).slice(0, spec.core[1]),
        j = judgeOf(core, start);
      if (!cur || j.score > cur.score) {
        cur = j;
        ball = start;
        scopes = core;
      }
    }
    if (!cur) continue;
    // The climb: it ends when the board is ready, or when it has gone `STALL` changes without a better one (the next
    // board then aims a press lower), or after `climb` changes.
    let top = cur.score;
    for (let step = 0, since = 0; step < spec.climb && since < STALL && (judged < spec.budget || !spare); step++, since++) {
      if (cur.ready) {
        const state = finish(n, scopes, ball, cur, spec, at, random, true);
        if (state) return state;
        break;
      }
      const next = reshape(n, scopes, ball, spec.core[0], spec.core[1], random, spec.window);
      if (!next) continue;
      const j = judgeOf(next, ball),
        heat = HEAT * (1 - step / spec.climb) + 0.05;
      if (j.score >= cur.score || random() < Math.exp((j.score - cur.score) / heat)) {
        scopes = next;
        cur = j;
      }
      if (cur.score > top) {
        top = cur.score;
        since = 0;
      }
    }
  }
}/** Which cells lie within a square of `size` round the ball (kept on the board). */
function windowOf(n: number, ball: number, size: number) {
  const r0 = Math.max(0, Math.min(n - size, Math.floor(ball / n) - Math.floor(size / 2))),
    c0 = Math.max(0, Math.min(n - size, (ball % n) - Math.floor(size / 2)));
  return (cell: number) => {
    const r = Math.floor(cell / n),
      c = cell % n;
    return r >= r0 && r < r0 + size && c >= c0 && c < c0 + size;
  };
}
/**
 * More telescopes for a board climbed to the stage's asking, up to the stage's count: first a few crowded round the
 * others (`crowd`), each kept only when the fewest presses stay what they were (searched again); then, if more are
 * wanted, quiet ones (`quiet`) on cells nothing can reach, which cannot change the way. A kind the board lacks is given
 * to one of them where that keeps the fewest presses.
 */
function decorate(n: number, core: Telescope[], ball: number, j: Judged, spec: Stage, random: Random) {
  const count = spec.scopes[0] + Math.floor(random() * (spec.scopes[1] - spec.scopes[0] + 1));
  let scopes = core;
  const same = (trial: Telescope[]) => {
    const found = search(n, trial, trial.map(() => 0), ball, j.hole, DECOY_CAP);
    return !!found.way && found.way.length === j.way.length;
  };
  for (let tries = 0; scopes.length < count && tries < DECOYS; tries++) {
    const trial = crowd(n, scopes, ball, j.hole, j.way, scopes.length + 1, random);
    if (trial.length > scopes.length && same(trial)) scopes = trial;
  }
  for (let tries = 0; scopes.length < count && tries < count * 4; tries++) {
    const extra = quiet(n, scopes, ball, j.hole, random);
    if (extra) scopes = [...scopes, extra];
  }
  for (const reach of REACHES) {
    if (scopes.some((x) => x.reach === reach)) continue;
    for (let t = scopes.length - 1; t >= core.length; t--) {
      const trial = scopes.map((x, i) => (i === t ? { ...x, reach } : x));
      if (lands(n, trial, ball, j.hole, j.way) && same(trial)) {
        scopes = trial;
        break;
      }
    }
  }
  return scopes;
}
/**
 * A telescope that can never matter, set where it changes nothing: its base on a cell that no telescope can reach into
 * (nor push a ball onto) and that the ball can never come onto, and the telescope itself one that cannot matter
 * (`relevant`). Null when the cell drawn is not such a one.
 */
function quiet(n: number, scopes: Telescope[], ball: number, hole: number, random: Random): Telescope | null {
  const cell = Math.floor(random() * n * n),
    most = maxima(n, scopes);
  if (cell === ball || cell === hole || scopes.some((s) => s.cell === cell)) return null;
  for (let t = 0; t < scopes.length; t++)
    for (let k = 1; k <= most[t] + 1; k++) if (stepFrom(n, scopes[t].cell, scopes[t].dir, k) === cell) return null;
  const all = lines(n, scopes);
  for (const line of all) if (line.from === cell || line.cells.includes(cell)) return null;
  const extra: Telescope = { cell, dir: Math.floor(random() * 4), reach: REACHES[Math.floor(random() * REACHES.length)] },
    keep = relevant(n, [...scopes, extra], ball);
  // Nothing that mattered may stop mattering, nor may the new one matter.
  const before = relevant(n, scopes, ball);
  if (keep[scopes.length] || before.some((k, t) => k !== keep[t])) return null;
  return extra;
}
/**
 * A board climbed to the stage's asking made a puzzle: the hole on the cell the ball comes onto last and more
 * telescopes round it (`decorate`). Null when it is not good enough: not all three kinds stand on it, the colours do
 * not matter (`colourMatters`), or (while `strict`) a naive player finds the way (`naive`).
 */
function finish(n: number, core: Telescope[], ball: number, j: Judged, spec: Stage, stage: number, random: Random, strict: boolean): State | null {
  let state: State | null = null;
  // The decoys are drawn again a few times where the colours do not matter with them (they may make it matter).
  for (let k = 0; k < (strict ? 1 : 3); k++) {
    const scopes = decorate(n, core, ball, j, spec, random);
    state = blank(n, scopes, ball, j.hole, stage, j.way);
    if (new Set(scopes.map((x) => x.reach)).size === REACHES.length && colourMatters(state)) return !strict || !naive(state, random) ? state : null;
  }
  return strict ? null : state;
}
/** How many journeys are laid to climb from; how many stretches of `climb` changes a board may take (the aim coming
 * down by one after each); how readily a climb takes a change for the worse at first; after how many changes without
 * a better board it goes back to its best; how many telescopes are tried as decoys, and how far each is searched;
 * after how many boards any board in the band will do. */
const SEEDS = 6,
  HEAT = 1,
  STALL = 120,
  DECOYS = 8,
  DECOY_CAP = 6000,
  STRICT_ROUNDS = 2;

const effect = (s: State): Effect | null => (s.last ? { kind: "move", from: s.last.balls[0], to: s.ball, converted: [], removed: [] } : null);
export const telescope: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.scopes.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: () => "망원경을 눌러 공을 밀고 당기세요",
  tally: () => ["", ""],
  reason: (s) => (s.winner === 0 ? "성공! 공이 구멍에 들어갔습니다." : ""),
};
