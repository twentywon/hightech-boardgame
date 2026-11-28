import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Chinese checkers for two: a six-pointed star of 121 holes. Each side
 * starts with ten marbles in one point of the star and races them into the
 * point opposite. A marble steps to a neighbouring hole, or hops over one
 * marble next to it into the hole beyond, and may go on hopping. Nothing is
 * ever taken.
 */
export interface Hole {
  /** Column and row on the slanted grid; row grows toward side 0's home. */
  q: number;
  r: number;
}
export const HOLES: Hole[] = [];
for (let r = -8; r <= 8; r++)
  for (let q = -8; q <= 8; q++) {
    const s = -q - r;
    // Two big triangles laid over each other make the star.
    if ((q <= 4 && r <= 4 && s <= 4) || (q >= -4 && r >= -4 && s >= -4)) HOLES.push({ q, r });
  }
const key = (q: number, r: number) => `${q},${r}`;
const byPlace = new Map(HOLES.map((hole, i) => [key(hole.q, hole.r), i]));
const WAYS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];
/** For every hole, the hole next to it each way and the hole beyond that (or -1). */
const NEXT = HOLES.map((hole) => WAYS.map(([dq, dr]) => byPlace.get(key(hole.q + dq, hole.r + dr)) ?? -1)),
  BEYOND = HOLES.map((hole) => WAYS.map(([dq, dr]) => byPlace.get(key(hole.q + dq * 2, hole.r + dr * 2)) ?? -1));
/** The ten holes of the near point (side 0 starts there) and of the far point (side 1). */
export const HOME: [number[], number[]] = [HOLES.flatMap((h, i) => (h.r > 4 ? [i] : [])), HOLES.flatMap((h, i) => (h.r < -4 ? [i] : []))];
export const TURN_LIMIT = 400;
export interface State {
  cells: (0 | 1 | null)[];
  turn: 0 | 1;
  winner: Winner;
  /** The last move, with the holes the marble touched on its way. */
  last: { from: number; to: number; path: number[] } | null;
  ply: number;
}
export function createGame(): State {
  const cells: (0 | 1 | null)[] = HOLES.map(() => null);
  HOME[0].forEach((i) => (cells[i] = 0));
  HOME[1].forEach((i) => (cells[i] = 1));
  return { cells, turn: 0, winner: null, last: null, ply: 0 };
}
/** Every hole a marble can reach, with the way there: one step, or any chain of hops. */
export function reach(state: State, from: number) {
  const paths = new Map<number, number[]>();
  for (const to of NEXT[from]) if (to >= 0 && state.cells[to] === null) paths.set(to, [to]);
  const hop = (at: number, path: number[]) => {
    for (let way = 0; way < 6; way++) {
      const over = NEXT[at][way],
        to = BEYOND[at][way];
      if (over < 0 || to < 0 || state.cells[over] === null || state.cells[to] !== null || to === from) continue;
      // A step already found stays the shorter way; a hop is noted once.
      if (paths.has(to) && paths.get(to)!.length <= path.length + 1) continue;
      paths.set(to, [...path, to]);
      hop(to, [...path, to]);
    }
  };
  hop(from, []);
  return paths;
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = [];
  state.cells.forEach((owner, from) => {
    if (owner === state.turn) for (const to of reach(state, from).keys()) out.push({ from, to, extra: -1 });
  });
  return out;
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1 || state.cells[move.from] !== state.turn) return null;
  const path = reach(state, move.from).get(move.to);
  if (!path) return null;
  const cells = state.cells.slice(),
    me = state.turn,
    ply = state.ply + 1;
  cells[move.from] = null;
  cells[move.to] = me;
  // Home is the point opposite one's own. A marble the other side leaves behind there cannot keep the game from ending:
  // the point counts as filled when every hole is taken and at least one marble in it is the mover's.
  const target = HOME[me ? 0 : 1],
    home = target.every((i) => cells[i] !== null) && target.some((i) => cells[i] === me);
  return { cells, turn: me ? 0 : 1, winner: home ? me : ply >= TURN_LIMIT ? "draw" : null, last: { from: move.from, to: move.to, path }, ply };
}
/** How many holes lie between a hole and the far tip of the point a side is bound for. */
const TIP = [
    { q: 4, r: -8 },
    { q: -4, r: 8 },
  ],
  FAR = [0, 1].map((side) => HOLES.map((h) => (Math.abs(h.q - TIP[side].q) + Math.abs(h.r - TIP[side].r) + Math.abs(h.q + h.r - TIP[side].q - TIP[side].r)) / 2));
/** How far a side's marbles still are from that tip, all together; the one left furthest behind counts again. */
function toGo(state: State, side: number) {
  let sum = 0,
    worst = 0;
  state.cells.forEach((owner, i) => {
    if (owner !== side) return;
    sum += FAR[side][i];
    worst = Math.max(worst, FAR[side][i]);
  });
  return sum + worst;
}
export const evaluate = (state: State, player: 0 | 1) => toGo(state, player ? 0 : 1) - toGo(state, player);
/** The moves that gain most ground; when few do, the sideways ones too, which is how the last holes get filled. */
export function candidates(state: State): Move[] {
  const far = FAR[state.turn],
    gain = (m: Move) => far[m.from] - far[m.to],
    all = moves(state).sort((a, b) => gain(b) - gain(a)),
    forward = all.filter((m) => gain(m) > 0);
  return (forward.length >= 6 ? forward : all).slice(0, 14);
}
const effect = (state: State): Effect | null =>
  state.last ? { kind: state.last.path.length > 1 ? "jump" : "move", from: state.last.from, to: state.last.to, converted: [], removed: [] } : null;
export const starHop: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  candidates,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.cells,
  effect,
  ply: (s) => s.ply,
  evaluate,
  hint: () => "옮길 구슬을 고르세요.",
  tally: (s) => [0, 1].map((p) => `집에 든 구슬 ${HOME[p ? 0 : 1].filter((i) => s.cells[i] === p).length} / 10`) as [string, string],
  reason: (s) => (s.winner === "draw" ? `${TURN_LIMIT}수가 지났습니다.` : "구슬 열 개를 모두 맞은편 집에 넣었습니다."),
};
