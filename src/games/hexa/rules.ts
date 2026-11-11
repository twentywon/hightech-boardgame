import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Hexa germ war: a hexagon of 58 cells. A germ copies itself into a
 * neighbouring cell or jumps two cells away; every enemy germ next to where
 * it lands changes sides. The larger colony wins.
 */
export const RADIUS = 4;
const HOLES = new Set(["1,0", "0,-1", "-1,1"]);
/** Axial coordinates of every cell. */
export const CELLS: [number, number][] = [];
for (let q = -RADIUS; q <= RADIUS; q++)
  for (let r = -RADIUS; r <= RADIUS; r++)
    if (Math.abs(q + r) <= RADIUS && !HOLES.has(`${q},${r}`)) CELLS.push([q, r]);
const INDEX = new Map(CELLS.map(([q, r], i) => [`${q},${r}`, i]));
export const at = (q: number, r: number) => INDEX.get(`${q},${r}`) ?? -1;
const distance = (a: number, b: number) => {
  const dq = CELLS[a][0] - CELLS[b][0],
    dr = CELLS[a][1] - CELLS[b][1];
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};
/** Cells one step and two steps from each cell. */
export const NEAR = CELLS.map((_, i) => CELLS.flatMap((__, j) => (distance(i, j) === 1 ? [j] : [])));
export const FAR = CELLS.map((_, i) => CELLS.flatMap((__, j) => (distance(i, j) === 2 ? [j] : [])));
export interface State {
  cells: (0 | 1 | null)[];
  turn: 0 | 1;
  ply: number;
  effect: Effect | null;
  winner: Winner;
}
export function createGame(): State {
  const cells: (0 | 1 | null)[] = CELLS.map(() => null);
  for (const [q, r] of [[RADIUS, 0], [0, -RADIUS], [-RADIUS, RADIUS]]) cells[at(q, r)] = 0;
  for (const [q, r] of [[RADIUS, -RADIUS], [-RADIUS, 0], [0, RADIUS]]) cells[at(q, r)] = 1;
  return { cells, turn: 0, ply: 0, effect: null, winner: null };
}
export const count = (state: State, player: 0 | 1) => state.cells.filter((c) => c === player).length;
function movesFor(cells: (0 | 1 | null)[], player: 0 | 1): Move[] {
  const found: Move[] = [];
  cells.forEach((owner, from) => {
    if (owner !== player) return;
    for (const to of NEAR[from]) if (cells[to] === null) found.push({ from, to, extra: -1 });
    for (const to of FAR[from]) if (cells[to] === null) found.push({ from, to, extra: -1 });
  });
  return found;
}
export const moves = (state: State): Move[] => (state.winner !== null ? [] : movesFor(state.cells, state.turn));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1) return null;
  const { from, to } = move,
    me = state.turn,
    them = me === 0 ? 1 : 0;
  if (state.cells[from] !== me || state.cells[to] !== null) return null;
  const near = NEAR[from].includes(to);
  if (!near && !FAR[from].includes(to)) return null;
  const cells = state.cells.slice();
  if (!near) cells[from] = null;
  cells[to] = me;
  const converted = NEAR[to].filter((n) => cells[n] === them);
  for (const n of converted) cells[n] = me;
  // A side that cannot move forfeits the empty cells to the other; then the board is counted.
  const stuck = movesFor(cells, them).length === 0;
  if (stuck && cells.includes(them)) cells.forEach((c, i) => c === null && (cells[i] = me));
  const mine = cells.filter((c) => c === me).length,
    theirs = cells.filter((c) => c === them).length;
  return {
    cells,
    turn: them,
    ply: state.ply + 1,
    effect: { kind: near ? "clone" : "jump", from, to, converted, removed: [] },
    winner: stuck ? (mine === theirs ? "draw" : mine > theirs ? me : them) : null,
  };
}
export const hexa: PointGame<State> = {
  create: createGame,
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.cells,
  effect: (s) => s.effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => count(s, player) - count(s, player === 0 ? 1 : 0),
  hint: () => "세균을 고르세요. 옆 칸은 복제, 두 칸은 점프입니다.",
  tally: (s) => [`${count(s, 0)}칸`, `${count(s, 1)}칸`],
  reason: (s) => `${count(s, 0)} : ${count(s, 1)}`,
};
