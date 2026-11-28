import type { Move } from "../points/types";
import { COUNT, NEXT, RING, TO_WIN, opposite, play, type State } from "./rules";

/**
 * The computer of 구슬 밀기: an alpha-beta search (negamax, iterative deepening, a clock) on a board of its own
 * (`Int8Array`, 0 empty, 1 side 0, 2 side 1), made and unmade in place so that it can look a few moves ahead in the
 * time a move is given. It judges a position by the marbles out (far above all else), by how near the middle each
 * side's marbles stand, by how they hold together (neighbours of their own) and by the danger at the edge: a marble on
 * the rim that the other side's longer line stands behind can be pushed off at the next move.
 */
export type Level = "easy" | "normal" | "hard";
export const BUDGET: Record<Level, { ms: number; depth: number; noise: number }> = {
  easy: { ms: 150, depth: 1, noise: 70 },
  normal: { ms: 300, depth: 3, noise: 0 },
  hard: { ms: 900, depth: 7, noise: 0 },
};
const WIN = 1_000_000;
/** Weights of the judgement. */
const W = { out: 1000, centre: 7, together: 2, rim: 6, threatNow: 700, threatLater: 45 };
const opp = Int8Array.from({ length: 6 }, (_, d) => opposite(d));

/** A move packed into one number: ends a and b, the direction, the group's axis (7 for a single marble) and its kind (0 plain, 1 push, 2 push off). */
const pack = (a: number, b: number, d: number, axis: number, kind: number) => a | (b << 6) | (d << 12) | (axis << 15) | (kind << 18);
const A = (m: number) => m & 63,
  B = (m: number) => (m >> 6) & 63,
  D = (m: number) => (m >> 12) & 7,
  AX = (m: number) => (m >> 15) & 7,
  KIND = (m: number) => (m >> 18) & 3;

export class Search {
  board = new Int8Array(COUNT);
  lost = [0, 0];
  /** Cells changed by each move made, to unmake it: pairs of (cell, old value), and the stack's height before it. */
  private undoCells = new Int16Array(4096);
  private undoTop = 0;
  private marks: number[] = [];
  private lostMarks: number[] = [];
  nodes = 0;
  constructor(state: State) {
    state.cells.forEach((o, c) => (this.board[c] = o === null ? 0 : o + 1));
    this.lost = [state.lost[0], state.lost[1]];
  }
  /** Every legal move of `side` (1 or 2), packed, into `out`; returns how many. */
  generate(side: number, out: Int32Array) {
    const b = this.board,
      them = 3 - side;
    let n = 0;
    for (let c = 0; c < COUNT; c++) {
      if (b[c] !== side) continue;
      for (let d = 0; d < 6; d++) {
        const t = NEXT[c * 6 + d];
        if (t >= 0 && b[t] === 0) out[n++] = pack(c, c, d, 7, 0);
      }
      for (let axis = 0; axis < 3; axis++) {
        const b1 = NEXT[c * 6 + axis];
        if (b1 < 0 || b[b1] !== side) continue;
        const b2 = NEXT[b1 * 6 + axis],
          three = b2 >= 0 && b[b2] === side;
        for (let len = 2; len <= (three ? 3 : 2); len++) {
          const end = len === 2 ? b1 : b2;
          // In-line, forward (lead = end) and back (lead = c).
          for (const [tail, lead, d] of [
            [c, end, axis],
            [end, c, opp[axis]],
          ]) {
            let x = NEXT[lead * 6 + d];
            if (x < 0 || b[x] === side) continue;
            if (b[x] === 0) {
              out[n++] = pack(tail, lead, d, axis, 0);
              continue;
            }
            let m = 0;
            while (x >= 0 && b[x] === them && m < len) {
              m++;
              x = NEXT[x * 6 + d];
            }
            if (m >= len) continue;
            if (x < 0) out[n++] = pack(tail, lead, d, axis, 2);
            else if (b[x] === 0) out[n++] = pack(tail, lead, d, axis, 1);
          }
          // Broadside: the four other directions, into empty cells only.
          for (let d = 0; d < 6; d++) {
            if (d === axis || d === opp[axis]) continue;
            const t0 = NEXT[c * 6 + d],
              t1 = NEXT[b1 * 6 + d],
              t2 = len === 3 ? NEXT[b2 * 6 + d] : 0;
            if (t0 < 0 || t1 < 0 || t2 < 0 || b[t0] !== 0 || b[t1] !== 0 || (len === 3 && b[t2] !== 0)) continue;
            out[n++] = pack(c, end, d, axis, 0);
          }
        }
      }
    }
    return n;
  }
  private set(cell: number, value: number) {
    this.undoCells[this.undoTop++] = cell;
    this.undoCells[this.undoTop++] = this.board[cell];
    this.board[cell] = value;
  }
  make(m: number) {
    const b = this.board,
      a = A(m),
      lead = B(m),
      d = D(m),
      axis = AX(m),
      side = b[a],
      them = 3 - side;
    this.marks.push(this.undoTop);
    this.lostMarks.push(-1);
    const inline = axis === 7 || axis === d || opp[axis] === d;
    if (inline) {
      const ahead = NEXT[lead * 6 + d];
      if (b[ahead] === them) {
        // The pushed row moves on by one: the cell after it takes the last marble, or that marble is out.
        let x = ahead;
        while (x >= 0 && b[x] === them) x = NEXT[x * 6 + d];
        if (x >= 0) this.set(x, them);
        else {
          this.lost[them - 1]++;
          this.lostMarks[this.lostMarks.length - 1] = them - 1;
        }
      }
      this.set(ahead, side);
      this.set(a, 0);
    } else {
      // The group's cells from one end to the other along its axis.
      let x = a;
      const cells: number[] = [];
      for (;;) {
        cells.push(x);
        if (x === lead) break;
        x = NEXT[x * 6 + axis];
      }
      for (const c of cells) this.set(c, 0);
      for (const c of cells) this.set(NEXT[c * 6 + d], side);
    }
  }
  unmake() {
    const to = this.marks.pop()!,
      lost = this.lostMarks.pop()!;
    while (this.undoTop > to) {
      const value = this.undoCells[--this.undoTop],
        cell = this.undoCells[--this.undoTop];
      this.board[cell] = value;
    }
    if (lost >= 0) this.lost[lost]--;
  }
  /** How good the position is for `side` (1 or 2), with `toMove` to move. */
  evaluate(side: number, toMove: number) {
    const b = this.board,
      lostMe = this.lost[side - 1],
      lostThem = this.lost[2 - side];
    if (lostMe >= TO_WIN) return -WIN;
    if (lostThem >= TO_WIN) return WIN;
    let score = (lostThem - lostMe) * W.out;
    for (let c = 0; c < COUNT; c++) {
      const v = b[c];
      if (!v) continue;
      const sign = v === side ? 1 : -1;
      let s = (4 - RING[c]) * W.centre;
      for (let d = 0; d < 3; d++) {
        const n = NEXT[c * 6 + d];
        if (n >= 0 && b[n] === v) s += W.together;
      }
      if (RING[c] === 4) {
        s -= W.rim;
        // A marble on the rim: is the other side's longer line behind it, so that it could be pushed off?
        for (let d = 0; d < 6; d++) {
          if (NEXT[c * 6 + d] >= 0) continue;
          const back = opp[d];
          let y = c,
            mine = 0;
          while (y >= 0 && b[y] === v) {
            mine++;
            y = NEXT[y * 6 + back];
          }
          if (mine > 2 || y < 0) continue;
          let theirs = 0;
          while (y >= 0 && b[y] === 3 - v && theirs < 3) {
            theirs++;
            y = NEXT[y * 6 + back];
          }
          if (theirs > mine) {
            s -= v === toMove ? W.threatLater : W.threatNow;
            break;
          }
        }
      }
      score += sign * s;
    }
    return score;
  }
  /** A quick guess of a move's worth, to look at the best first. */
  order(m: number) {
    const kind = KIND(m);
    if (kind === 2) return 100000;
    const a = A(m),
      lead = B(m),
      d = D(m),
      axis = AX(m);
    let gain = 0;
    if (axis === 7 || axis === d || opp[axis] === d) gain = RING[a] - RING[NEXT[lead * 6 + d]];
    else {
      let x = a;
      for (;;) {
        gain += RING[x] - RING[NEXT[x * 6 + d]];
        if (x === lead) break;
        x = NEXT[x * 6 + axis];
      }
    }
    return kind * 1000 + gain * 10 + (axis === 7 ? 0 : 1);
  }
}

/** Buffers of moves, one per depth of the search. */
const BUFFERS = Array.from({ length: 16 }, () => new Int32Array(512));
const SCORES = Array.from({ length: 16 }, () => new Float64Array(512));
function sortMoves(s: Search, moves: Int32Array, scores: Float64Array, n: number, first = -1) {
  for (let i = 0; i < n; i++) scores[i] = moves[i] === first ? 1e9 : s.order(moves[i]);
  // Insertion sort, best first (n is small).
  for (let i = 1; i < n; i++) {
    const m = moves[i],
      v = scores[i];
    let j = i - 1;
    while (j >= 0 && scores[j] < v) {
      moves[j + 1] = moves[j];
      scores[j + 1] = scores[j];
      j--;
    }
    moves[j + 1] = m;
    scores[j + 1] = v;
  }
}
class OutOfTime extends Error {}
/** What coming back to a position already seen costs a move at the root. */
const AGAIN = 20;
/** The value of the position for the side to move, searched `depth` moves deep. */
function negamax(s: Search, side: number, depth: number, ply: number, alpha: number, beta: number, deadline: number, now: () => number): number {
  s.nodes++;
  if ((s.nodes & 1023) === 0 && now() > deadline) throw new OutOfTime();
  if (s.lost[side - 1] >= TO_WIN) return -WIN - depth;
  if (s.lost[2 - side] >= TO_WIN) return WIN + depth;
  if (depth === 0) return s.evaluate(side, side);
  const moves = BUFFERS[ply],
    n = s.generate(side, moves);
  if (!n) return s.evaluate(side, side);
  sortMoves(s, moves, SCORES[ply], n);
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    s.make(moves[i]);
    const v = -negamax(s, 3 - side, depth - 1, ply + 1, -beta, -alpha, deadline, now);
    s.unmake();
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}
/** A packed move as the rules write it. */
function unpack(m: number): Move {
  return { from: A(m), to: B(m), extra: D(m) };
}
/**
 * The computer's move for the side to move: deepening alpha-beta until the level's time is spent. A move that would
 * bring the same position up for the third time counts as a draw (0). `now` and `random` can be given for tests.
 */
export function chooseMove(
  state: State,
  level: Level = "normal",
  random: () => number = Math.random,
  now: () => number = () => performance.now(),
  budget?: { ms: number; depth: number; noise: number },
  /** Filled with how deep the last whole pass went and how many positions were looked at. */
  info?: { depth: number; nodes: number },
): Move | null {
  if (state.winner !== null) return null;
  const { ms, depth: maxDepth, noise } = budget ?? BUDGET[level],
    s = new Search(state),
    side = state.turn + 1,
    root = new Int32Array(512),
    n = s.generate(side, root);
  if (!n) return null;
  sortMoves(s, root, new Float64Array(512), n);
  const deadline = now() + ms,
    // The noise of the easy level: one draw a move, so that it plays the same position the same way within a search.
    jitter = Array.from({ length: n }, () => (noise ? (random() - 0.5) * 2 * noise : random() * 0.01));
  // Moves whose position would be the third of its kind end the game in a draw; one that comes back to a position
  // already seen is a little worse than one that goes on, so that a side ahead does not drift into the repetition.
  const repeats = new Set<number>(),
    again = new Set<number>();
  for (let i = 0; i < n; i++) {
    const next = play(state, unpack(root[i]));
    if (next && next.winner === "draw" && next.drawn === "repeat") repeats.add(root[i]);
    else if (next && next.seen.indexOf(next.seen[next.seen.length - 1]) < next.seen.length - 1) again.add(root[i]);
  }
  let choice = root[0];
  const values = new Float64Array(n);
  for (let depth = 1; depth <= maxDepth; depth++) {
    let alpha = -Infinity,
      bestIndex = 0;
    try {
      for (let i = 0; i < n; i++) {
        s.make(root[i]);
        let v = repeats.has(root[i]) ? 0 : -negamax(s, 3 - side, depth - 1, 1, -Infinity, -alpha + Math.abs(noise) * 2 + AGAIN + 1, deadline, now);
        s.unmake();
        v += jitter[i] - (again.has(root[i]) ? AGAIN : 0);
        values[i] = v;
        if (v > alpha) {
          alpha = v;
          bestIndex = i;
        }
      }
    } catch (e) {
      // The pass that ran out of time is left unfinished (its board is not used again); the last whole pass decides.
      if (!(e instanceof OutOfTime)) throw e;
      break;
    }
    choice = root[bestIndex];
    if (info) {
      info.depth = depth;
      info.nodes = s.nodes;
    }
    // The next pass looks at the best of this one first.
    const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => values[q] - values[p]),
      moves = order.map((i) => root[i]),
      jit = order.map((i) => jitter[i]);
    moves.forEach((m, i) => {
      root[i] = m;
      jitter[i] = jit[i];
    });
    if (alpha >= WIN) break;
  }
  return unpack(choice);
}
/** The judgement of a position for the shared screen's needs: `player`'s view of it with the side to move as it stands. */
export function evaluate(state: State, player: 0 | 1) {
  const s = new Search(state);
  return s.evaluate(player + 1, state.turn + 1);
}
