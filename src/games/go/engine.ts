/**
 * A fast go board for the computer and for counting at the end, free of Three.js and DOM.
 *
 * The board is padded with a frame of edge points, so that a point's four neighbours are always `p ± 1` and
 * `p ± W`. Each chain is a ring of stones (`next`) named by its head (`head`), and keeps its pseudo-liberties
 * at the head: how many there are counted once per stone beside them, their sum and the sum of their squares. A
 * chain is down to one liberty exactly when count × squares = sum², and that liberty is then sum / count, so
 * atari, captures and suicide are known without walking the chain.
 *
 * Random games are played out on it (`playout`): random legal moves that never fill one's own eye, a stone left
 * in atari by the last move is taken, and a chain of one's own put in atari by it runs out when that gains
 * liberties. They end when neither side has such a move, and are counted by area (`area`).
 */
export const EMPTY = 0,
  BLACK = 1,
  WHITE = 2,
  EDGE = 3;
/** A small quick generator (xorshift), seeded from any number. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next() {
    let s = this.s;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.s = s >>> 0;
    return this.s;
  }
  /** A whole number from 0 up to `n` (not included). */
  below(n: number) {
    return ((this.next() >>> 0) % n) | 0;
  }
  /** A number in [0, 1). */
  float() {
    return this.next() / 4294967296;
  }
}
export class Board {
  readonly size: number;
  /** Width with the frame. */
  readonly W: number;
  readonly N: number;
  readonly color: Uint8Array;
  readonly head: Int16Array;
  readonly next: Int16Array;
  readonly stones: Int16Array;
  readonly libs: Int16Array;
  readonly lsum: Int32Array;
  readonly lsq: Int32Array;
  readonly empties: Int16Array;
  readonly emptyAt: Int16Array;
  /** The points of the board (without the frame), in reading order. */
  readonly points: Int16Array;
  /** How far each point lies from the nearest edge (0 on the first line). */
  readonly line: Int8Array;
  /** The stones the last move took. */
  readonly removed: Int16Array;
  removedCount = 0;
  emptyCount = 0;
  /** The point the side to move may not take back at once (simple ko), or -1. */
  ko = -1;
  /** Stones taken so far by black and by white. */
  takenBlack = 0;
  takenWhite = 0;
  constructor(size: number) {
    this.size = size;
    const W = (this.W = size + 2),
      N = (this.N = W * W);
    this.color = new Uint8Array(N).fill(EDGE);
    this.head = new Int16Array(N);
    this.next = new Int16Array(N);
    this.stones = new Int16Array(N);
    this.libs = new Int16Array(N);
    this.lsum = new Int32Array(N);
    this.lsq = new Int32Array(N);
    this.empties = new Int16Array(N);
    this.emptyAt = new Int16Array(N).fill(-1);
    this.removed = new Int16Array(N);
    this.points = new Int16Array(size * size);
    this.line = new Int8Array(N);
    let k = 0;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const p = (r + 1) * W + c + 1;
        this.points[k++] = p;
        this.color[p] = EMPTY;
        this.line[p] = Math.min(r, c, size - 1 - r, size - 1 - c);
        this.emptyAt[p] = this.emptyCount;
        this.empties[this.emptyCount++] = p;
      }
  }
  /** The padded index of the point in row `r`, column `c`. */
  at(r: number, c: number) {
    return (r + 1) * this.W + c + 1;
  }
  /** The plain index (row × size + column) of a padded point. */
  plain(p: number) {
    return (Math.floor(p / this.W) - 1) * this.size + (p % this.W) - 1;
  }
  /** A board laid out as `cells` has it (row × size + column; 0 black, 1 white, null empty). */
  static from(size: number, cells: readonly (0 | 1 | null)[]) {
    const board = new Board(size);
    for (let i = 0; i < cells.length; i++) {
      const owner = cells[i];
      if (owner === null) continue;
      board.place(board.at(Math.floor(i / size), i % size), owner === 0 ? BLACK : WHITE);
    }
    board.ko = -1;
    board.takenBlack = board.takenWhite = 0;
    return board;
  }
  copyFrom(b: Board) {
    this.color.set(b.color);
    this.head.set(b.head);
    this.next.set(b.next);
    this.stones.set(b.stones);
    this.libs.set(b.libs);
    this.lsum.set(b.lsum);
    this.lsq.set(b.lsq);
    this.empties.set(b.empties);
    this.emptyAt.set(b.emptyAt);
    this.emptyCount = b.emptyCount;
    this.ko = b.ko;
    this.takenBlack = b.takenBlack;
    this.takenWhite = b.takenWhite;
    this.removedCount = 0;
  }
  clone() {
    const b = new Board(this.size);
    b.copyFrom(this);
    return b;
  }
  /** Whether the chain headed by `h` has a single liberty left. */
  atari(h: number) {
    const n = this.libs[h];
    return n > 0 && n * this.lsq[h] === this.lsum[h] * this.lsum[h];
  }
  /** The one liberty of a chain in atari. */
  liberty(h: number) {
    return this.lsum[h] / this.libs[h];
  }
  /** How many empty points lie beside `p`. */
  emptyAround(p: number) {
    const c = this.color,
      W = this.W;
    return (c[p - 1] === EMPTY ? 1 : 0) + (c[p + 1] === EMPTY ? 1 : 0) + (c[p - W] === EMPTY ? 1 : 0) + (c[p + W] === EMPTY ? 1 : 0);
  }
  /** Whether colour `c` may play at `p`: empty, not the ko point, and not suicide unless it takes something. */
  legal(p: number, c: number) {
    const color = this.color;
    if (color[p] !== EMPTY || p === this.ko) return false;
    const W = this.W;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p - 1 : k === 1 ? p + 1 : k === 2 ? p - W : p + W,
        x = color[q];
      if (x === EMPTY) return true;
      if (x === EDGE) continue;
      // A chain beside an empty point in atari has that point for its last liberty.
      const atari = this.atari(this.head[q]);
      if (x === c ? !atari : atari) return true;
    }
    return false;
  }
  /**
   * Whether `p` is an eye of colour `c`: every neighbour is `c` or the edge, and the diagonals do not make it false
   * (two of the other colour, or one where the point stands on the edge).
   */
  eye(p: number, c: number) {
    const color = this.color,
      W = this.W;
    if (color[p] !== EMPTY) return false;
    for (let k = 0; k < 4; k++) {
      const x = color[k === 0 ? p - 1 : k === 1 ? p + 1 : k === 2 ? p - W : p + W];
      if (x !== c && x !== EDGE) return false;
    }
    const o = 3 - c;
    let bad = 0,
      edge = 0;
    for (let k = 0; k < 4; k++) {
      const x = color[k === 0 ? p - W - 1 : k === 1 ? p - W + 1 : k === 2 ? p + W - 1 : p + W + 1];
      if (x === EDGE) edge = 1;
      else if (x === o) bad++;
    }
    return bad + edge < 2;
  }
  private removeEmpty(p: number) {
    const i = this.emptyAt[p],
      last = this.empties[--this.emptyCount];
    this.empties[i] = last;
    this.emptyAt[last] = i;
    this.emptyAt[p] = -1;
  }
  private addEmpty(p: number) {
    this.emptyAt[p] = this.emptyCount;
    this.empties[this.emptyCount++] = p;
  }
  private merge(a: number, b: number) {
    const { head, next, stones, libs, lsum, lsq } = this;
    if (stones[a] < stones[b]) {
      const t = a;
      a = b;
      b = t;
    }
    let s = b;
    do {
      head[s] = a;
      s = next[s];
    } while (s !== b);
    const t = next[a];
    next[a] = next[b];
    next[b] = t;
    stones[a] += stones[b];
    libs[a] += libs[b];
    lsum[a] += lsum[b];
    lsq[a] += lsq[b];
  }
  private capture(h: number) {
    const { color, head, next, libs, lsum, lsq, W } = this;
    let s = h,
      count = 0;
    do {
      color[s] = EMPTY;
      this.addEmpty(s);
      this.removed[this.removedCount++] = s;
      count++;
      s = next[s];
    } while (s !== h);
    s = h;
    do {
      for (let k = 0; k < 4; k++) {
        const q = k === 0 ? s - 1 : k === 1 ? s + 1 : k === 2 ? s - W : s + W,
          x = color[q];
        if (x === BLACK || x === WHITE) {
          const g = head[q];
          libs[g]++;
          lsum[g] += s;
          lsq[g] += s * s;
        }
      }
      s = next[s];
    } while (s !== h);
    return count;
  }
  /** Plays colour `c` at `p`, which must be legal; returns how many stones it took. */
  place(p: number, c: number) {
    const { color, head, next, stones, libs, lsum, lsq, W } = this,
      o = 3 - c;
    this.removeEmpty(p);
    color[p] = c;
    head[p] = p;
    next[p] = p;
    stones[p] = 1;
    libs[p] = 0;
    lsum[p] = 0;
    lsq[p] = 0;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p - 1 : k === 1 ? p + 1 : k === 2 ? p - W : p + W,
        x = color[q];
      if (x === EMPTY) {
        libs[p]++;
        lsum[p] += q;
        lsq[p] += q * q;
      } else if (x !== EDGE) {
        const h = head[q];
        libs[h]--;
        lsum[h] -= p;
        lsq[h] -= p * p;
      }
    }
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p - 1 : k === 1 ? p + 1 : k === 2 ? p - W : p + W;
      if (color[q] === c && head[q] !== head[p]) this.merge(head[p], head[q]);
    }
    let taken = 0,
      at = -1;
    this.removedCount = 0;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p - 1 : k === 1 ? p + 1 : k === 2 ? p - W : p + W;
      if (color[q] === o && libs[head[q]] === 0) {
        at = q;
        taken += this.capture(head[q]);
      }
    }
    if (c === BLACK) this.takenBlack += taken;
    else this.takenWhite += taken;
    this.ko = -1;
    // One stone taken by one stone that is left with that single liberty: it may not be taken back at once.
    if (taken === 1) {
      const h = head[p];
      if (stones[h] === 1 && libs[h] === 1) this.ko = at;
    }
    return taken;
  }
  /** A pass: only the ko is lifted. */
  pass() {
    this.ko = -1;
  }
  /**
   * A move the last one calls for: taking a chain it left in atari, or running out with a chain of one's own it
   * put in atari, when that gains liberties. -1 when there is none.
   */
  tactical(last: number, c: number) {
    const color = this.color,
      W = this.W;
    if (last < 0 || color[last] === EMPTY) return -1;
    if (color[last] === 3 - c) {
      const h = this.head[last];
      if (this.atari(h)) {
        const p = this.liberty(h);
        if (this.legal(p, c)) return p;
      }
    }
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? last - 1 : k === 1 ? last + 1 : k === 2 ? last - W : last + W;
      if (color[q] !== c) continue;
      const h = this.head[q];
      if (!this.atari(h)) continue;
      const p = this.liberty(h);
      if (this.emptyAround(p) >= 2 && this.legal(p, c)) return p;
    }
    return -1;
  }
  /** A random legal move for `c` that fills no eye of its own, or -1. */
  randomMove(c: number, rng: Rng) {
    const E = this.empties,
      at = this.emptyAt,
      n = this.emptyCount;
    for (let t = 0; t < n; t++) {
      const j = t + rng.below(n - t),
        p = E[j];
      if (j !== t) {
        const q = E[t];
        E[t] = p;
        E[j] = q;
        at[p] = t;
        at[q] = j;
      }
      if (this.legal(p, c) && !this.eye(p, c)) return p;
    }
    return -1;
  }
  /**
   * Plays the game out at random from here, `c` to move after `last`. Each move's point is written into `first`
   * (when given) with its colour if nothing was written there yet. Ends when both sides pass, or after `limit` moves.
   */
  playout(c: number, last: number, rng: Rng, first: Uint8Array | null, limit: number) {
    let passes = 0;
    for (let moves = 0; moves < limit; moves++) {
      let p = this.tactical(last, c);
      if (p < 0) p = this.randomMove(c, rng);
      if (p < 0) {
        if (++passes >= 2) return;
        this.pass();
        last = -1;
      } else {
        passes = 0;
        this.place(p, c);
        if (first && first[p] === 0) first[p] = c;
        last = p;
      }
      c = 3 - c;
    }
  }
  /** Black's area less white's: stones, and empty points beside one colour only. */
  area() {
    const color = this.color,
      W = this.W,
      pts = this.points;
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i],
        x = color[p];
      if (x === BLACK) s++;
      else if (x === WHITE) s--;
      else {
        const a = color[p - 1],
          b = color[p + 1],
          d = color[p - W],
          e = color[p + W];
        const black = a === BLACK || b === BLACK || d === BLACK || e === BLACK,
          white = a === WHITE || b === WHITE || d === WHITE || e === WHITE;
        if (black && !white) s++;
        else if (white && !black) s--;
      }
    }
    return s;
  }
  /** Adds who holds each point at the end of a playout to `own` (+1 black, -1 white), by plain index. */
  tallyOwners(own: Float32Array) {
    const color = this.color,
      W = this.W,
      pts = this.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i],
        x = color[p];
      if (x === BLACK) own[i]++;
      else if (x === WHITE) own[i]--;
      else {
        const a = color[p - 1],
          b = color[p + 1],
          d = color[p - W],
          e = color[p + W];
        const black = a === BLACK || b === BLACK || d === BLACK || e === BLACK,
          white = a === WHITE || b === WHITE || d === WHITE || e === WHITE;
        if (black && !white) own[i]++;
        else if (white && !black) own[i]--;
      }
    }
  }
}
/**
 * Who holds each point, on average over `runs` random games played out from `board` with `c` to move: +1 always
 * black, -1 always white, by plain index.
 */
export function ownership(board: Board, c: number, runs: number, rng: Rng, last = -1) {
  const own = new Float32Array(board.size * board.size),
    work = new Board(board.size),
    limit = board.size * board.size * 3;
  for (let i = 0; i < runs; i++) {
    work.copyFrom(board);
    work.playout(c, last, rng, null, limit);
    work.tallyOwners(own);
  }
  for (let i = 0; i < own.length; i++) own[i] /= runs;
  return own;
}
