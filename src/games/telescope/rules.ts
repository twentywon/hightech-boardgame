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
 * A puzzle is laid at random (`createGame`): first the ball's journey (`journey`): from the ball alone on the board,
 * telescopes are set down behind it and pressed, or ones already there pressed again, so that it keeps coming onto
 * new cells, pushed and pulled; the hole goes on the last cell it came onto. A telescope set down behind the ball is
 * mostly of a kind whose own reach is what stops the ball (a longer kind would push it further), and the kinds fewest
 * on the board are preferred. Then the rest of the stage's telescopes are crowded round, close to the others, side by
 * side or facing each other, of the kinds fewest so far (`crowd`), any that would spoil the journey left out. The
 * shortest way into the hole is then searched for (`search`, an exact A* over arrangements: every telescope's length
 * and the ball's cell), and the board is kept when its fewest presses lie within the stage's band, all three kinds
 * stand on it and their colours matter (`colourMatters`: were every telescope purple, the way laid would fail or the
 * fewest presses change); a board in the band without the last two is kept only when no better one is found within
 * `TRIES`. That shortest way is kept as `plan` (`best` presses); the hint follows it while I do, and otherwise
 * searches afresh from the arrangement shown (`solve`).
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
}
export const STAGES: Stage[] = [
  { size: 7, scopes: [4, 6], band: [3, 5], walk: 5, crowd: 1 },
  { size: 8, scopes: [7, 9], band: [5, 8], walk: 8, crowd: 3 },
  { size: 10, scopes: [10, 13], band: [7, 11], walk: 11, crowd: 4 },
  { size: 11, scopes: [14, 17], band: [9, 14], walk: 14, crowd: 6 },
  { size: 13, scopes: [18, 22], band: [12, 18], walk: 18, crowd: 8 },
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
    L = live.length,
    weight: number[] = [];
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
  let product = 1;
  for (const t of live) {
    weight.push(product);
    product *= most[t] + 1;
  }
  const exact = product * n * n < 2 ** 52,
    keyOf = (store: Uint8Array, at: number, b: number): number | string => {
      if (exact) {
        let code = 0;
        for (let i = 0; i < L; i++) code += store[at + i] * weight[i];
        return code * n * n + b;
      }
      let text = String(b);
      for (let i = 0; i < L; i++) text += store[at + i];
      return text;
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
  const seen = new Map<number | string, number>();
  for (let i = 0; i < L; i++) store[i] = lens[live[i]];
  balls[0] = ball;
  parent[0] = -1;
  move[0] = -1;
  cost[0] = 0;
  rank[0] = first;
  seen.set(keyOf(store, 0, ball), 0);
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
        const key = keyOf(store, base, nb),
          known = seen.get(key);
        if (known !== undefined) {
          if (cost[known] <= g + 1) continue;
          // Reached more cheaply: its way and cost are mended and it goes into a bucket again.
          cost[known] = g + 1;
          parent[known] = at;
          move[known] = t;
          push(known, g + 1 + h);
          continue;
        }
        seen.set(key, count);
        balls[count] = nb;
        parent[count] = at;
        move[count] = t;
        cost[count] = g + 1;
        push(count, g + 1 + h);
        count++;
        if (count >= cap) return { way: null, taken: count, capped: true };
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
    taken[ball] = taken[hole] = 1;
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
    if (lands(n, trial, ball, hole, plan)) out.splice(0, out.length, ...trial);
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
/** How many boards are tried at most before the one nearest the band is kept. */
const TRIES = 40;
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
export function lay(stage: number, random: Random) {
  const spec = STAGES[stage - 1],
    n = spec.size,
    count = spec.scopes[0] + Math.floor(random() * (spec.scopes[1] - spec.scopes[0] + 1));
  // Of a few journeys, the one with the most presses that brought the ball somewhere new.
  let d: Draft | null = null,
    most = -1;
  for (let k = 0; k < JOURNEYS; k++) {
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
/**
 * A new puzzle of `stage` (1–5): boards are laid (`lay`) and the shortest way into each hole searched for (`search`);
 * the first whose fewest presses lie within the stage's band is kept, its shortest way as `plan`. Failing that within
 * `TRIES`, the one nearest the band.
 */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const at = stageOf(stage),
    spec = STAGES[at - 1];
  // One number is drawn from `random`; the many the laying needs come from a quick generator seeded with it.
  random = quick(Math.floor(random() * 4294967296));
  let kept: { state: State; off: number } | null = null;
  for (let k = 0; k < TRIES || !kept; k++) {
    const laid = lay(at, random);
    if (!laid) continue;
    // The hole the journey reaches the hardest way, among the last cells it came onto.
    let deepest: { hole: number; way: number[] } | null = null;
    for (const { cell, plan } of laid.holes) {
      if (!lands(laid.n, laid.journey.scopes, laid.journey.start, cell, plan)) continue;
      const found = search(laid.n, laid.journey.scopes, laid.journey.scopes.map(() => 0), laid.journey.start, cell, JUDGE_CAP);
      if (found.way && (!deepest || found.way.length > deepest.way.length)) deepest = { hole: cell, way: found.way };
    }
    if (!deepest) continue;
    // The rest of the telescopes crowded round; the shortest way is searched for again, as they may open a shorter one.
    const scopes = crowd(laid.n, laid.journey.scopes, laid.journey.start, deepest.hole, deepest.way, laid.count, random),
      found = search(laid.n, scopes, scopes.map(() => 0), laid.journey.start, deepest.hole, JUDGE_CAP);
    if (!found.way) continue;
    const state = blank(laid.n, scopes, laid.journey.start, deepest.hole, at, found.way);
    // Within the band, a board is kept at once when it holds all three kinds and their colours matter; otherwise it
    // waits, behind any board without those flaws.
    let off = Math.max(0, spec.band[0] - found.way.length, found.way.length - spec.band[1]);
    if (!off) off = (new Set(scopes.map((x) => x.reach)).size < REACHES.length ? 0.4 : 0) + (colourMatters(state) ? 0 : 0.2);
    if (!off) return state;
    if (!kept || off < kept.off) kept = { state, off };
  }
  return kept.state;
}

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
