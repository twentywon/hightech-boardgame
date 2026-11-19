import type { Move } from "../points/types";
import { CELLS, COLS, DC, DEFLECTOR, DR, KING, LASER, LASER_CELL, LASER_FACINGS, ROWS, SHIELD, STEPS, SWITCH, TURN_LEFT, TURN_RIGHT, allowed, dirOf, kindOf, meet, piece, sideOf, type Kind, type State } from "./rules";

/**
 * The computer: an alpha-beta search over moves, each followed by its laser shot, deepening until its time is up
 * (on the main thread, like go's and ultimate tic-tac-toe's: a move is a few hundred thousand shots at most).
 *
 * Children are ordered by what their shot does (a king taken first, then an enemy piece, then killer and history
 * moves; a shot at one's own pieces last). A position is judged for the side to move by material, by how many of
 * the other side's moves would bring its beam onto my king (a move that leaves the beam's path alone leaves the
 * beam as it is, so only moves that touch the path are tried), by how far each beam reaches into the other half,
 * and by how freely the pieces can move. A position where the side to move can hit the other king at once is
 * counted as won.
 */
export const BUDGET = { easy: 200, normal: 600, hard: 1500 } as const;
export type Level = keyof typeof BUDGET;
const DEPTH: Record<Level, number> = { easy: 1, normal: 3, hard: 7 },
  /** How often the easy computer plays any move that does not lose at once instead of the best. */
  SLIP: Record<Level, number> = { easy: 0.25, normal: 0, hard: 0 };
const WIN = 1e6,
  SOON = WIN / 2,
  /** What a piece is worth: a deflector, a shield (a switch is never taken, a king is the game). */
  VALUE: number[] = [0, 0, 0, 3, 0, 2.2],
  /** The weight of each move of the other side that would hit my king, and of a beam's reach into the other half. */
  DANGER = 1.6,
  REACH = 0.05,
  MOBILITY = 0.025,
  /** A king is safer with its own pieces round it, and less safe on a line open to the edge of the board. */
  GUARD = 0.12,
  OPEN = 0.25;
/** The cell a step leads to, or -1 off the board: by cell and by direction (the four of a beam, then the eight steps). */
const NEXT = new Int16Array(CELLS * 4).fill(-1),
  STEP = new Int16Array(CELLS * 8).fill(-1);
for (let cell = 0; cell < CELLS; cell++) {
  const r = Math.floor(cell / COLS),
    c = cell % COLS;
  for (let d = 0; d < 4; d++) {
    const rr = r + DR[d],
      cc = c + DC[d];
    if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) NEXT[cell * 4 + d] = rr * COLS + cc;
  }
  STEPS.forEach(([dr, dc], k) => {
    const rr = r + dr,
      cc = c + dc;
    if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) STEP[cell * 8 + k] = rr * COLS + cc;
  });
}
/** A beam's way out of each piece it meets, by piece and direction (see `meet`). */
const MEET = new Int8Array(64 * 4);
for (let p = 8; p < 64; p++) for (let d = 0; d < 4; d++) MEET[p * 4 + d] = kindOf(p) ? meet(p, d) : 0;
/** A piece turned: by piece and by turn (0 against the clock, 1 with it). */
const TURNED = new Int8Array(64 * 2);
for (let p = 8; p < 48; p++) {
  const kind = kindOf(p) as Kind,
    side = sideOf(p),
    dir = dirOf(p);
  if (!kind) continue;
  if (kind === LASER) {
    const other = LASER_FACINGS[side][0] === dir ? LASER_FACINGS[side][1] : LASER_FACINGS[side][0];
    TURNED[p * 2] = TURNED[p * 2 + 1] = piece(kind, side, other);
  } else if (kind === SWITCH) TURNED[p * 2] = TURNED[p * 2 + 1] = piece(kind, side, dir ^ 1);
  else {
    TURNED[p * 2] = piece(kind, side, dir + 3);
    TURNED[p * 2 + 1] = piece(kind, side, dir + 1);
  }
}
const ALLOWED = [new Uint8Array(CELLS), new Uint8Array(CELLS)];
for (let cell = 0; cell < CELLS; cell++) for (const side of [0, 1] as const) ALLOWED[side][cell] = allowed(cell, side) ? 1 : 0;

/** The cell `side`'s shot takes on board `b`, or -1 when it takes nothing; `mark` (with `stamp`) records the cells it crosses. */
function shoot(b: Int8Array, side: 0 | 1, mark: Int32Array | null = null, stamp = 0) {
  let cell = LASER_CELL[side],
    dir = b[cell] & 3;
  if (mark) mark[cell] = stamp;
  for (let step = 0; step < 4 * CELLS; step++) {
    cell = NEXT[cell * 4 + dir];
    if (cell < 0) return -1;
    if (mark) mark[cell] = stamp;
    const p = b[cell];
    if (!p) continue;
    const out = MEET[p * 4 + dir];
    if (out === -1) return -1;
    if (out === -2) return cell;
    dir = out;
  }
  return -1;
}
/** The moves of `side` as numbers (`from * 128 + to`), written into `out` from 0; their count. A switch's two turns are one. */
function generate(b: Int8Array, side: 0 | 1, out: Int32Array) {
  let n = 0;
  const may = ALLOWED[side];
  for (let from = 0; from < CELLS; from++) {
    const p = b[from];
    if (!p || ((p >> 2) & 1) !== side) continue;
    const kind = p >> 3;
    if (kind === LASER) {
      const other = TURNED[p * 2];
      out[n++] = from * 128 + ((dirOf(p) + 1) % 4 === dirOf(other) ? TURN_RIGHT : TURN_LEFT);
      continue;
    }
    for (let k = 0; k < 8; k++) {
      const to = STEP[from * 8 + k];
      if (to < 0 || !may[to]) continue;
      const q = b[to];
      if (!q) out[n++] = from * 128 + to;
      else if (kind === SWITCH && ((q >> 3) === DEFLECTOR || (q >> 3) === SHIELD) && ALLOWED[(q >> 2) & 1][from]) out[n++] = from * 128 + to;
    }
    if (kind === SWITCH) out[n++] = from * 128 + TURN_RIGHT;
    else if (kind !== KING) {
      out[n++] = from * 128 + TURN_LEFT;
      out[n++] = from * 128 + TURN_RIGHT;
    }
  }
  return n;
}
/** Makes the move (no shot); what was on its two cells, packed, so that `unplace` can put them back. */
function place(b: Int8Array, m: number) {
  const from = m >> 7,
    to = m & 127,
    p = b[from];
  if (to >= CELLS) {
    b[from] = TURNED[p * 2 + (to === TURN_RIGHT ? 1 : 0)];
    return p;
  }
  const q = b[to];
  b[to] = p;
  b[from] = q;
  return p | (q << 8);
}
function unplace(b: Int8Array, m: number, saved: number) {
  const from = m >> 7,
    to = m & 127;
  b[from] = saved & 255;
  if (to < CELLS) b[to] = saved >> 8;
}
const kingCell = (b: Int8Array, side: 0 | 1) => {
  const king = (KING << 3) | (side << 2);
  for (let cell = 0; cell < CELLS; cell++) if ((b[cell] & ~3) === king) return cell;
  return -1;
};

class Searcher {
  nodes = 0;
  out = false;
  private mark = new Int32Array(CELLS);
  private stamp = 0;
  /** The moves of each ply in the order they are tried, and what ordering made of them. */
  lists: Int32Array[] = [];
  scores: Float64Array[] = [];
  private killers = new Int32Array(64 * 2).fill(-1);
  private history = new Int32Array(CELLS * 128);
  private scratch = new Int32Array(200);
  constructor(
    readonly b: Int8Array,
    readonly deadline: number,
    readonly now: () => number,
  ) {}
  list(ply: number) {
    while (this.lists.length <= ply) {
      this.lists.push(new Int32Array(200));
      this.scores.push(new Float64Array(200));
    }
    return this.lists[ply];
  }
  /**
   * How many moves of `attacker` would make its shot take `side`'s king (stopping at `cap`). Moves that leave the
   * attacker's present beam path alone leave its shot as it is.
   */
  threats(attacker: 0 | 1, cap: number) {
    const b = this.b,
      king = kingCell(b, (1 - attacker) as 0 | 1);
    if (king < 0) return 0;
    const stamp = ++this.stamp,
      now = shoot(b, attacker, this.mark, stamp) === king,
      list = this.scratch,
      n = generate(b, attacker, list);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const m = list[i],
        from = m >> 7,
        to = m & 127;
      let hit = now;
      if (this.mark[from] === stamp || (to < CELLS && this.mark[to] === stamp)) {
        const saved = place(b, m);
        hit = shoot(b, attacker) === king;
        unplace(b, m, saved);
      }
      if (hit && ++count >= cap) return count;
    }
    return count;
  }
  /** How good the board looks to `side`, the side to move. */
  evaluate(side: 0 | 1) {
    const b = this.b,
      other = (1 - side) as 0 | 1;
    if (this.threats(side, 1)) return SOON;
    let score = 0;
    for (let cell = 0; cell < CELLS; cell++) {
      const p = b[cell];
      if (!p) continue;
      const kind = p >> 3,
        sign = ((p >> 2) & 1) === side ? 1 : -1;
      score += sign * VALUE[kind];
      if (kind === LASER) continue;
      if (kind === KING) {
        score += sign * this.cover(cell, (p >> 2) & 1);
        continue;
      }
      // Room to move: the empty squares round a piece that its side may step onto.
      const may = ALLOWED[(p >> 2) & 1];
      let room = 0;
      for (let k = 0; k < 8; k++) {
        const to = STEP[cell * 8 + k];
        if (to >= 0 && !b[to] && may[to]) room++;
      }
      score += sign * MOBILITY * room;
    }
    const danger = this.threats(other, 4);
    score -= DANGER * danger + (danger >= 2 ? 2.5 : 0);
    score += REACH * (this.reach(side) - this.reach(other));
    return score;
  }
  /** What a king's surroundings are worth: its own pieces next to it, less every straight line from it that runs open to the edge. */
  private cover(cell: number, side: number) {
    const b = this.b;
    let guards = 0,
      open = 0;
    for (let k = 0; k < 8; k++) {
      const to = STEP[cell * 8 + k];
      if (to >= 0 && b[to] && ((b[to] >> 2) & 1) === side) guards++;
    }
    for (let d = 0; d < 4; d++) {
      let at = NEXT[cell * 4 + d];
      while (at >= 0 && !b[at]) at = NEXT[at * 4 + d];
      if (at < 0) open++;
    }
    return GUARD * guards - OPEN * open;
  }
  /** How many cells of the other half `side`'s beam crosses. */
  private reach(side: 0 | 1) {
    const stamp = ++this.stamp;
    shoot(this.b, side, this.mark, stamp);
    let n = 0;
    const half = side === 0 ? (cell: number) => cell < CELLS / 2 : (cell: number) => cell >= CELLS / 2;
    for (let cell = 0; cell < CELLS; cell++) if (this.mark[cell] === stamp && half(cell)) n++;
    return n;
  }
  /**
   * The children of a node in the order they are worth trying, with what their shot does: a king of the other side
   * taken (a win), a piece of the other side, a killer or a move that has often cut, a piece of one's own (last; a
   * shot at one's own king is a loss).
   */
  order(side: 0 | 1, ply: number, first: number) {
    const b = this.b,
      list = this.list(ply),
      scores = this.scores[ply],
      n = generate(b, side, list);
    for (let i = 0; i < n; i++) {
      const m = list[i],
        saved = place(b, m),
        hit = shoot(b, side);
      let s = this.history[m] / 64;
      if (hit >= 0) {
        const q = b[hit],
          mine = ((q >> 2) & 1) === side;
        if (q >> 3 === KING) s = mine ? -1e9 : 1e9;
        else s += mine ? -500 - VALUE[q >> 3] : 1000 + 100 * VALUE[q >> 3];
      }
      if (m === first) s += 1e7;
      else if (m === this.killers[ply * 2] || m === this.killers[ply * 2 + 1]) s += 300;
      scores[i] = s;
      unplace(b, m, saved);
    }
    // Insertion sort, best first: the lists are short.
    for (let i = 1; i < n; i++) {
      const m = list[i],
        s = scores[i];
      let j = i - 1;
      while (j >= 0 && scores[j] < s) {
        list[j + 1] = list[j];
        scores[j + 1] = scores[j];
        j--;
      }
      list[j + 1] = m;
      scores[j + 1] = s;
    }
    return n;
  }
  /** Negamax with alpha-beta: the value of the position for `side`, to move, `depth` moves deep. */
  search(side: 0 | 1, depth: number, alpha: number, beta: number, ply: number): number {
    if ((++this.nodes & 255) === 0 && this.now() > this.deadline) this.out = true;
    if (this.out) return 0;
    if (depth <= 0) return this.evaluate(side);
    const b = this.b,
      list = this.list(ply),
      n = this.order(side, ply, -1),
      other = (1 - side) as 0 | 1;
    let best = -Infinity;
    for (let i = 0; i < n; i++) {
      const m = list[i],
        saved = place(b, m),
        hit = shoot(b, side);
      let value: number;
      const taken = hit >= 0 ? b[hit] : 0;
      if (hit >= 0) b[hit] = 0;
      if (taken >> 3 === KING) value = ((taken >> 2) & 1) === side ? -WIN + ply : WIN - ply;
      else value = -this.search(other, depth - 1, -beta, -alpha, ply + 1);
      if (hit >= 0) b[hit] = taken;
      unplace(b, m, saved);
      if (this.out) return 0;
      if (value > best) best = value;
      if (value > alpha) alpha = value;
      if (alpha >= beta) {
        if (!taken && this.killers[ply * 2] !== m) {
          this.killers[ply * 2 + 1] = this.killers[ply * 2];
          this.killers[ply * 2] = m;
        }
        this.history[m] += depth * depth;
        break;
      }
    }
    return best;
  }
  /** Every root move with its value at `depth`, searched in `order`; null when the time ran out first. */
  root(side: 0 | 1, depth: number, order: number[]) {
    const b = this.b,
      other = (1 - side) as 0 | 1,
      out: [number, number][] = [];
    let alpha = -Infinity;
    for (const m of order) {
      const saved = place(b, m),
        hit = shoot(b, side),
        taken = hit >= 0 ? b[hit] : 0;
      if (hit >= 0) b[hit] = 0;
      let value: number;
      if (taken >> 3 === KING) value = ((taken >> 2) & 1) === side ? -WIN : WIN;
      // A window just below the best so far: later moves need only be shown no better (their value is then a bound).
      else value = -this.search(other, depth - 1, -Infinity, -alpha + 1e-6, 1);
      if (hit >= 0) b[hit] = taken;
      unplace(b, m, saved);
      if (this.out) return null;
      out.push([m, value]);
      if (value > alpha) alpha = value;
    }
    return out;
  }
}
const toMove = (m: number): Move => ({ from: m >> 7, to: m & 127, extra: -1 });

/**
 * The computer's move for the side to move, or null when the game is over. `now` is injected so that tests can
 * search to a fixed depth; the easy level now and then plays any move that does not lose at once.
 */
export function chooseMove(state: State, level: Level = "normal", random: () => number = Math.random, now: () => number = () => performance.now(), budget: number = BUDGET[level], maxDepth = DEPTH[level]): Move | null {
  if (state.winner !== null) return null;
  const b = Int8Array.from(state.board),
    side = state.turn,
    searcher = new Searcher(b, now() + budget, now),
    first = searcher.list(0),
    n = searcher.order(side, 0, -1);
  if (!n) return null;
  let order = Array.from(first.subarray(0, n));
  // A king of the other side within reach of one shot is taken at once, whatever the level.
  if (searcher.scores[0][0] >= 1e9) return toMove(order[0]);
  let best = order[0],
    values: [number, number][] = order.map((m) => [m, 0]);
  for (let depth = 1; depth <= maxDepth; depth++) {
    const result = searcher.root(side, depth, order);
    if (!result) break;
    values = result;
    // The best first, ties kept in the order they were searched; a little noise so that equal moves vary.
    const noisy = result.map(([m, v], i) => [m, v + (Math.abs(v) < SOON / 2 ? random() * 0.08 : 0), i] as [number, number, number]);
    noisy.sort((a, c) => c[1] - a[1] || a[2] - c[2]);
    order = noisy.map(([m]) => m);
    best = order[0];
    if (Math.abs(noisy[0][1]) > SOON / 2) break;
  }
  if (SLIP[level] > 0 && random() < SLIP[level]) {
    const safe = values.filter(([, v]) => v > -SOON / 2).map(([m]) => m);
    if (safe.length) best = safe[Math.floor(random() * safe.length)];
  }
  return toMove(best);
}
