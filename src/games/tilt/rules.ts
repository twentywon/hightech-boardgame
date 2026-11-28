import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The turning maze: a square maze stands upright and is turned a quarter at
 * a time, to the left or to the right. Two blocks inside it, red and blue,
 * fall straight down after every turn until a wall, the frame or the other
 * block stops them. The red block is to come to rest on the red mark and the
 * blue on the blue one. A puzzle is laid at random: walls are scattered,
 * the blocks dropped in, every state the turns can reach is searched, and
 * the marks are put where the blocks first come to rest after the most
 * turns (at least the stage's number), so every puzzle can be solved.
 */
export const LEFT = 0,
  RIGHT = 1;
export interface Stage {
  size: number;
  /** The fewest turns the puzzle must need. */
  turns: number;
}
export const STAGES: Stage[] = [
  { size: 5, turns: 3 },
  { size: 6, turns: 5 },
  { size: 6, turns: 7 },
  { size: 7, turns: 8 },
  { size: 8, turns: 10 },
];
export interface State {
  size: number;
  /** A wall under a cell (between it and the cell below), and one at its right. */
  floor: boolean[];
  side: boolean[];
  /** How many quarter turns to the right the maze stands turned (0 to 3). */
  turn: number;
  /** Where the red and the blue block are, and their marks. */
  blocks: [number, number];
  marks: [number, number];
  last: number | null;
  winner: Winner;
  ply: number;
}
/** Down, left, up, right in the maze's own rows and columns. */
const STEP = [
  [1, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
];
/** Which way is down in the maze when it stands turned `turn` quarters to the right. */
export const downOf = (turn: number) => [0, 3, 2, 1][((turn % 4) + 4) % 4];
type Walls = Pick<State, "size" | "floor" | "side">;
/** Whether a block on `cell` can move one cell in direction `dir`. */
export function open(walls: Walls, cell: number, dir: number) {
  const { size } = walls,
    r = Math.floor(cell / size),
    c = cell % size;
  if (dir === 0) return r < size - 1 && !walls.floor[cell];
  if (dir === 2) return r > 0 && !walls.floor[cell - size];
  if (dir === 3) return c < size - 1 && !walls.side[cell];
  return c > 0 && !walls.side[cell - 1];
}
const neighbour = (size: number, cell: number, dir: number) => cell + STEP[dir][0] * size + STEP[dir][1];
/** Lets both blocks fall down (`dir` in the maze) until they rest; the lower one falls first. */
export function settle(walls: Walls, blocks: [number, number], dir: number): [number, number] {
  const out: [number, number] = [blocks[0], blocks[1]],
    { size } = walls,
    depth = (cell: number) => STEP[dir][0] * Math.floor(cell / size) + STEP[dir][1] * (cell % size),
    order = depth(out[0]) >= depth(out[1]) ? [0, 1] : [1, 0];
  for (const i of order)
    for (;;) {
      const next = neighbour(size, out[i], dir);
      if (!open(walls, out[i], dir) || next === out[1 - i]) break;
      out[i] = next;
    }
  return out;
}
/** The state after turning the maze a quarter to the left or the right, before anything is checked. */
function turned(state: State, to: number): State {
  const turn = (state.turn + (to === RIGHT ? 1 : 3)) % 4,
    blocks = settle(state, state.blocks, downOf(turn));
  return { ...state, turn, blocks, last: to, ply: state.ply + 1 };
}
const solved = (s: Pick<State, "blocks" | "marks">) => s.blocks[0] === s.marks[0] && s.blocks[1] === s.marks[1];
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [LEFT, RIGHT].map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || (move.to !== LEFT && move.to !== RIGHT)) return null;
  const next = turned(state, move.to);
  return { ...next, winner: solved(next) ? 0 : null };
}
/** Every state the turns reach from `start`, keyed by turn and both blocks, with the turns taken to reach it first. */
function search(start: State) {
  const key = (s: State) => `${s.turn}:${s.blocks[0]}:${s.blocks[1]}`,
    seen = new Map<string, { state: State; depth: number; first: number }>(),
    queue: State[] = [start];
  seen.set(key(start), { state: start, depth: 0, first: -1 });
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i],
      { depth, first } = seen.get(key(here))!;
    for (const to of [LEFT, RIGHT]) {
      const next = turned(here, to),
        k = key(next);
      if (seen.has(k)) continue;
      seen.set(k, { state: next, depth: depth + 1, first: depth === 0 ? to : first });
      queue.push(next);
    }
  }
  return [...seen.values()];
}
/** A puzzle of a stage (1 to 5). */
export function createGame(stage = 1, random: Random = cryptoRandom): State {
  const { size, turns } = STAGES[Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1)) - 1],
    n = size * size;
  let best: State | null = null,
    bestDepth = -1;
  for (let attempt = 0; attempt < 400 && (bestDepth < turns || bestDepth > turns + 3); attempt++) {
    const density = 0.22 + random() * 0.18,
      floor = Array.from({ length: n }, () => random() < density),
      side = Array.from({ length: n }, () => random() < density),
      a = Math.floor(random() * n) % n;
    let b = Math.floor(random() * n) % n;
    if (b === a) b = (a + 1 + (Math.floor(random() * (n - 1)) % (n - 1))) % n;
    const walls = { size, floor, side },
      start: State = { size, floor, side, turn: 0, blocks: settle(walls, [a, b], 0), marks: [-1, -1], last: null, winner: null, ply: 0 };
    // The fewest turns to bring each pair of resting places about, whatever way the maze then stands.
    const first = new Map<string, number>();
    for (const { state, depth } of search(start)) {
      const k = `${state.blocks[0]}:${state.blocks[1]}`;
      if (!first.has(k) || first.get(k)! > depth) first.set(k, depth);
    }
    const startKey = `${start.blocks[0]}:${start.blocks[1]}`,
      far = [...first.entries()].filter(([k]) => k !== startKey).sort((x, y) => y[1] - x[1]);
    if (!far.length) continue;
    // Among the pairs that need enough turns but not many more (so that a stage keeps its difficulty), one at random;
    // otherwise the farthest.
    const enough = far.filter(([, d]) => d >= turns && d <= turns + 3),
      [k, depth] = enough.length ? enough[Math.floor(random() * enough.length) % enough.length] : far[0];
    const fits = (d: number) => d >= turns && d <= turns + 3;
    if (bestDepth < 0 || (fits(depth) && !fits(bestDepth)) || (!fits(bestDepth) && depth > bestDepth)) {
      const [red, blue] = k.split(":").map(Number);
      best = { ...start, marks: [red, blue] };
      bestDepth = depth;
    }
  }
  return best!;
}
/** The first turn of the shortest way from the present state to both marks, or null when there is none. */
export function hint(state: State): Move | null {
  if (state.winner !== null) return null;
  const goal = search({ ...state, ply: 0 })
    .filter(({ state: s, depth }) => depth > 0 && solved(s))
    .sort((a, b) => a.depth - b.depth)[0];
  return goal ? { from: -1, to: goal.first, extra: -1 } : null;
}
const effect = (): Effect | null => null;
export const tilt: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [null, null],
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -s.ply,
  hint: () => "미로를 돌려 빨간 블록은 빨간 표시에, 파란 블록은 파란 표시에 멈추게 하세요",
  tally: () => ["", ""],
  reason: () => "성공! 두 블록이 제자리에 멈췄습니다.",
};
