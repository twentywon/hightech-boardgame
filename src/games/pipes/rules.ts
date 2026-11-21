import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Pipes, the old "Net" puzzle, laid out in a garden of our own: a square of paving stones with a length of pipe on
 * each, a water tank near the middle and a house at every dead end. Every piece has been turned at random; turn them
 * back so that each open end meets the end of its neighbour, none points off the garden, and the water of the tank
 * reaches every stone. A puzzle is a random spanning tree over the stones, kept only when the pieces, as they are
 * shaped, can be laid in one way only.
 */
/** The open ends of a piece, as bits of its mask. */
export const N = 1,
  E = 2,
  S = 4,
  W = 8;
export const DIRS = [N, E, S, W];
/** The end that meets `bit` from the neighbour's side. */
export const opposite = (bit: number) => (bit === N ? S : bit === E ? W : bit === S ? N : E);
/** A quarter turn clockwise, seen from above: north goes east, east south, and so on. */
export const turned = (mask: number) => ((mask << 1) | (mask >> 3)) & 15;
/** The distinct masks a piece can show, from the way it lies: four for a bend, two for a straight, one for a cross. */
export function rotations(mask: number) {
  const out = [mask];
  for (let m = turned(mask); m !== mask; m = turned(m)) out.push(m);
  return out;
}
/** How many quarter turns clockwise take `from` to `to` (0 to 3), or -1 when no turn does. */
export function turnsBetween(from: number, to: number) {
  for (let k = 0, m = from; k < 4; k++, m = turned(m)) if (m === to) return k;
  return -1;
}
/** How many open ends a mask has. */
export const ends = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
export interface Stage {
  size: number;
}
export const STAGES: Stage[] = [{ size: 4 }, { size: 5 }, { size: 6 }, { size: 7 }, { size: 8 }];
export interface State {
  size: number;
  /** The stone with the water tank. */
  source: number;
  /** The open ends of each piece as it lies now. */
  tiles: number[];
  /** The open ends of each piece in the one way the puzzle can be laid. */
  answer: number[];
  /** The stone last turned. */
  last: number | null;
  winner: Winner;
  ply: number;
}
/** The stone beside `cell` through end `bit`, or -1 at the garden's edge. */
export function neighbour(size: number, cell: number, bit: number) {
  const r = Math.floor(cell / size),
    c = cell % size;
  if (bit === N) return r > 0 ? cell - size : -1;
  if (bit === S) return r < size - 1 ? cell + size : -1;
  if (bit === E) return c < size - 1 ? cell + 1 : -1;
  return c > 0 ? cell - 1 : -1;
}
/** Masks (as bits of a 16-bit set) that have an end open, by the end's place in `DIRS`, and those that have it shut. */
const WITH = DIRS.map((bit) => {
    let set = 0;
    for (let m = 0; m < 16; m++) if (m & bit) set |= 1 << m;
    return set;
  }),
  WITHOUT = WITH.map((set) => ~set & 0xffff);
const count16 = (set: number) => {
  let n = 0;
  for (let s = set; s; s &= s - 1) n++;
  return n;
};
class Union {
  parent: Int16Array;
  constructor(n: number) {
    this.parent = new Int16Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  /** Joins the sets of `a` and `b`; false when they were one already. */
  join(a: number, b: number) {
    const x = this.find(a),
      y = this.find(b);
    if (x === y) return false;
    this.parent[x] = y;
    return true;
  }
}
/**
 * How many ways the pieces can be laid (stopping at `cap`). Each stone keeps the set of masks it may still show
 * (masks, not turns, so a straight has two and a cross one); both sides of a seam must agree on it, and the garden's
 * edge is shut. Seams laid open join their stones into groups: one that would close a loop is shut, a group with a
 * single seam left to the rest must take it, and the stones must still be able to reach each other. What that leaves
 * undecided is tried mask by mask, on the stone with the fewest left.
 */
export function solutions(size: number, tiles: number[], cap = 2): number {
  const n = size * size,
    start = new Uint16Array(n);
  for (let c = 0; c < n; c++) {
    let set = 0;
    for (const m of rotations(tiles[c])) if (!DIRS.some((bit) => m & bit && neighbour(size, c, bit) < 0)) set |= 1 << m;
    if (!set) return 0;
    start[c] = set;
  }
  // Each seam once: its two stones, the end of the first that faces the second (east, 1, or south, 2, in `DIRS`) and the end facing back.
  const seams: [number, number, number, number][] = [];
  for (let c = 0; c < n; c++) {
    if (c % size < size - 1) seams.push([c, c + 1, 1, 3]);
    if (c + size < n) seams.push([c, c + size, 2, 0]);
  }
  /** Settles what can be settled; false on a contradiction. */
  const settle = (cand: Uint16Array): boolean => {
    for (;;) {
      for (let changed = true; changed; ) {
        changed = false;
        for (const [a, b, d, back] of seams) {
          const ca = cand[a],
            cb = cand[b];
          let na = ca,
            nb = cb;
          if (!(ca & WITH[d] && cb & WITH[back])) {
            na &= WITHOUT[d];
            nb &= WITHOUT[back];
          }
          if (!(ca & WITHOUT[d] && cb & WITHOUT[back])) {
            na &= WITH[d];
            nb &= WITH[back];
          }
          if (!na || !nb) return false;
          if (na !== ca || nb !== cb) {
            cand[a] = na;
            cand[b] = nb;
            changed = true;
          }
        }
      }
      // Seams laid open join their stones; a loop of them is no answer, and a seam that would close one is shut.
      const joined = new Union(n);
      for (const [a, b, d] of seams) if (!(cand[a] & WITHOUT[d]) && !joined.join(a, b)) return false;
      let shut = false;
      const loose: [number, number, number, number][] = [];
      for (const seam of seams) {
        const [a, b, d, back] = seam;
        if (!(cand[a] & WITH[d]) || !(cand[a] & WITHOUT[d])) continue;
        if (joined.find(a) === joined.find(b)) {
          cand[a] &= WITHOUT[d];
          cand[b] &= WITHOUT[back];
          if (!cand[a] || !cand[b]) return false;
          shut = true;
        } else loose.push(seam);
      }
      if (shut) continue;
      // The stones must still be able to reach each other through seams that may yet open.
      const reach = new Union(n);
      for (const [a, b, d] of seams) if (cand[a] & WITH[d]) reach.join(a, b);
      const root = reach.find(0);
      for (let c = 1; c < n; c++) if (reach.find(c) !== root) return false;
      // A group with a single seam left to the rest must take it.
      const exits = new Map<number, number>(),
        way = new Map<number, [number, number, number, number]>();
      for (let c = 0; c < n; c++) exits.set(joined.find(c), 0);
      if (exits.size === 1) return true;
      for (const seam of loose)
        for (const end of [seam[0], seam[1]]) {
          const g = joined.find(end);
          exits.set(g, exits.get(g)! + 1);
          way.set(g, seam);
        }
      let forced = false;
      for (const [g, out] of exits) {
        if (out === 0) return false;
        if (out > 1) continue;
        const [a, b, d, back] = way.get(g)!;
        if (!(cand[a] & WITHOUT[d])) continue;
        cand[a] &= WITH[d];
        cand[b] &= WITH[back];
        if (!cand[a] || !cand[b]) return false;
        forced = true;
      }
      if (!forced) return true;
    }
  };
  let found = 0;
  const search = (cand: Uint16Array) => {
    if (found >= cap || !settle(cand)) return;
    let pick = -1,
      fewest = 17;
    for (let c = 0; c < n; c++) {
      const k = count16(cand[c]);
      if (k > 1 && k < fewest) {
        fewest = k;
        pick = c;
      }
    }
    if (pick < 0) {
      found++;
      return;
    }
    for (let set = cand[pick]; set && found < cap; set &= set - 1) {
      const next = cand.slice();
      next[pick] = set & -set;
      search(next);
    }
  };
  search(start);
  return found;
}
/** How much more readily a dead end is carried on than another stone is branched from: bends and straights instead of a crowd of dead ends, but no long corridors. */
const TIP = 1.6;
/**
 * A random spanning tree over the stones, grown from `root` one seam at a time: each step takes a seam at random from
 * those that lead out of the tree, a seam from a dead end a little more readily (`tip`).
 */
export function grow(size: number, root: number, random: Random, tip = TIP): number[] {
  const n = size * size,
    masks = new Array(n).fill(0),
    inside = new Array(n).fill(false),
    frontier: [number, number][] = [];
  const enter = (c: number) => {
    inside[c] = true;
    for (const bit of DIRS) {
      const o = neighbour(size, c, bit);
      if (o >= 0 && !inside[o]) frontier.push([c, bit]);
    }
  };
  enter(root);
  for (let left = n - 1; left > 0; ) {
    const k = Math.min(frontier.length - 1, Math.floor(random() * frontier.length)),
      [c, bit] = frontier[k],
      o = neighbour(size, c, bit),
      drop = () => {
        frontier[k] = frontier[frontier.length - 1];
        frontier.pop();
      };
    if (inside[o]) {
      drop();
      continue;
    }
    if (random() > (ends(masks[c]) === 1 ? tip : 1) / Math.max(1, tip)) continue;
    drop();
    masks[c] |= bit;
    masks[o] |= opposite(bit);
    enter(o);
    left--;
  }
  return masks;
}
/** The longest run of stones with two ends joined one to the next: a corridor. */
export function corridor(size: number, masks: number[]) {
  const seen = masks.map(() => false);
  let longest = 0;
  masks.forEach((mask, start) => {
    if (seen[start] || ends(mask) !== 2) return;
    seen[start] = true;
    let length = 0;
    for (const stack = [start]; stack.length; ) {
      const c = stack.pop()!;
      length++;
      for (const bit of DIRS) {
        const o = masks[c] & bit ? neighbour(size, c, bit) : -1;
        if (o >= 0 && !seen[o] && ends(masks[o]) === 2) {
          seen[o] = true;
          stack.push(o);
        }
      }
    }
    longest = Math.max(longest, length);
  });
  return longest;
}
/**
 * For each stone the end its water comes in by, from the tank along seams whose two ends meet (0 for the tank and
 * for a stone the water does not reach), and which stones the water reaches.
 */
export function inlets(state: Pick<State, "size" | "source" | "tiles">) {
  const { size, source, tiles } = state,
    inlet = tiles.map(() => 0),
    wet = tiles.map(() => false);
  wet[source] = true;
  for (const queue = [source]; queue.length; ) {
    const c = queue.shift()!;
    for (const bit of DIRS) {
      const o = tiles[c] & bit ? neighbour(size, c, bit) : -1;
      if (o < 0 || wet[o] || !(tiles[o] & opposite(bit))) continue;
      wet[o] = true;
      inlet[o] = opposite(bit);
      queue.push(o);
    }
  }
  return { inlet, wet };
}
/** Which stones the water of the tank reaches. */
export const connected = (state: Pick<State, "size" | "source" | "tiles">) => inlets(state).wet;
/** Open ends that meet nothing (no open end on the neighbour's side, or the garden's edge), each as a stone and an end. */
export function leaks(state: Pick<State, "size" | "tiles">) {
  const out: { cell: number; bit: number }[] = [];
  state.tiles.forEach((mask, cell) => {
    for (const bit of DIRS) {
      if (!(mask & bit)) continue;
      const o = neighbour(state.size, cell, bit);
      if (o < 0 || !(state.tiles[o] & opposite(bit))) out.push({ cell, bit });
    }
  });
  return out;
}
/** The stones that are houses: the dead ends, but for the tank. */
export const houses = (state: Pick<State, "source" | "tiles">) => state.tiles.map((mask, i) => i !== state.source && ends(mask) === 1);
/** Every end meets its neighbour's, none points off the garden, and the water reaches every stone: the pipes are then one tree. */
export const solved = (state: Pick<State, "size" | "source" | "tiles">) => leaks(state).length === 0 && connected(state).every(Boolean);
const pickOf = <X>(items: X[], random: Random) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
/** A puzzle of a stage (1 to 5) that can be laid in one way only, every piece turned at random and not yet laid. */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const { size } = STAGES[Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1)) - 1],
    n = size * size,
    middle = (size - 1) / 2,
    // The stones nearest the middle: four on an even board, the centre and the four round it on an odd one.
    near = Array.from({ length: n }, (_, i) => i).filter((i) => Math.abs(Math.floor(i / size) - middle) + Math.abs((i % size) - middle) <= 1);
  for (;;) {
    const answer = grow(size, pickOf(near, random), random);
    if (corridor(size, answer) > size || solutions(size, answer) !== 1) continue;
    // The tank stands where pipes branch if it can; on an odd board the centre comes first.
    const branching = near.filter((i) => ends(answer[i]) >= 2),
      centre = branching.find((i) => size % 2 === 1 && i === (n - 1) / 2),
      source = centre ?? (branching.length ? pickOf(branching, random) : pickOf(near, random)),
      turnable = answer.filter((m) => turned(m) !== m).length;
    for (let attempt = 0; attempt < 40; attempt++) {
      const tiles = answer.map((mask) => {
        let m = mask;
        for (let k = Math.floor(random() * 4); k > 0; k--) m = turned(m);
        return m;
      });
      const wrong = tiles.filter((m, i) => m !== answer[i]).length;
      if (wrong * 2 < turnable || solved({ size, source, tiles })) continue;
      return { size, source, tiles, answer, last: null, winner: null, ply: 0 };
    }
  }
}
/** A tap turns a piece a quarter clockwise. A set move (`put`) lays a piece with the ends given, for the hint. */
export const SET = 1000,
  put = (cell: number, mask: number) => SET + cell * 16 + mask;
/** The stone and the mask a set move names. */
export const unput = (to: number) => ({ cell: Math.floor((to - SET) / 16), mask: (to - SET) % 16 });
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : state.tiles.flatMap((mask, to) => (turned(mask) === mask ? [] : [{ from: -1, to, extra: -1 }]));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(move.to) || move.to < 0) return null;
  const n = state.tiles.length;
  let cell = move.to,
    mask: number;
  if (move.to >= SET) {
    ({ cell, mask } = unput(move.to));
    if (cell >= n || !rotations(state.tiles[cell]).includes(mask)) return null;
  } else {
    if (cell >= n) return null;
    mask = turned(state.tiles[cell]);
  }
  if (mask === state.tiles[cell]) return null;
  const tiles = [...state.tiles];
  tiles[cell] = mask;
  const next = { ...state, tiles, last: cell, ply: state.ply + 1 };
  return { ...next, winner: solved(next) ? 0 : null };
}
/** How far each stone lies from the tank along the pipes of the answer. */
function depths(state: State) {
  const depth = state.answer.map(() => -1);
  depth[state.source] = 0;
  for (const queue = [state.source]; queue.length; ) {
    const c = queue.shift()!;
    for (const bit of DIRS) {
      const o = state.answer[c] & bit ? neighbour(state.size, c, bit) : -1;
      if (o >= 0 && depth[o] < 0) {
        depth[o] = depth[c] + 1;
        queue.push(o);
      }
    }
  }
  return depth;
}
/** The piece nearest the tank (along the answer's pipes) that lies wrong, laid as it belongs; null once all are right. */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const depth = depths(state);
  let best = -1;
  state.tiles.forEach((mask, i) => {
    if (mask !== state.answer[i] && (best < 0 || depth[i] < depth[best])) best = i;
  });
  return best < 0 ? null : { from: -1, to: put(best, state.answer[best]), extra: -1 };
}
const effect = (): Effect | null => null;
export const pipes: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.tiles.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: () => "관의 끝은 모두 이웃 관과 맞물리게 · 정원 밖을 향하는 끝은 없게 · 물탱크의 물이 모든 집에 닿게",
  tally: () => ["", ""],
  reason: () => "성공! 모든 집에 물이 닿았습니다.",
};
