import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Hexa germ war: a hexagon of 61 cells, some walled off by the map. A germ copies itself into a
 * neighbouring cell or jumps two cells away; every enemy germ next to where
 * it lands changes sides. The larger colony wins.
 */
export const RADIUS = 4;
/** Axial coordinates of every cell of the full hexagon; a map blocks some of them. */
export const CELLS: [number, number][] = [];
for (let q = -RADIUS; q <= RADIUS; q++)
  for (let r = -RADIUS; r <= RADIUS; r++) if (Math.abs(q + r) <= RADIUS) CELLS.push([q, r]);
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
/** The maps: which cells are walled off. Germs always start in the six corners. */
export const MAPS: Record<string, { name: string; holes: [number, number][] }> = {
  classic: { name: "기본", holes: [[1, 0], [0, -1], [-1, 1]] },
  open: { name: "빈 판", holes: [] },
  ring: { name: "고리", holes: [[0, 0], [2, 0], [2, -2], [0, -2], [-2, 0], [-2, 2], [0, 2]] },
  wall: { name: "장벽", holes: [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0]] },
  flower: { name: "꽃", holes: [[2, -1], [1, 1], [-1, 2], [-2, 1], [-1, -1], [1, -2]] },
  islands: {
    name: "징검다리",
    holes: [[0, 0], [3, -1], [1, 2], [-2, 3], [-3, 1], [-1, -2], [2, -3], [1, -1], [-1, 1]],
  },
};
export const mapOf = (variant: string) => (variant in MAPS ? variant : "classic");
/** True where `variant` walls a cell off. */
export function blockedIn(variant: string) {
  const holes = new Set(MAPS[mapOf(variant)].holes.map(([q, r]) => at(q, r)));
  return CELLS.map((_, i) => holes.has(i));
}
export interface State {
  map: string;
  /** True for cells no germ can enter. */
  blocked: boolean[];
  cells: (0 | 1 | null)[];
  turn: 0 | 1;
  ply: number;
  effect: Effect | null;
  winner: Winner;
}
export function createGame(variant: string = "classic"): State {
  const cells: (0 | 1 | null)[] = CELLS.map(() => null);
  for (const [q, r] of [[RADIUS, 0], [0, -RADIUS], [-RADIUS, RADIUS]]) cells[at(q, r)] = 0;
  for (const [q, r] of [[RADIUS, -RADIUS], [-RADIUS, 0], [0, RADIUS]]) cells[at(q, r)] = 1;
  return { map: mapOf(variant), blocked: blockedIn(variant), cells, turn: 0, ply: 0, effect: null, winner: null };
}
export const count = (state: State, player: 0 | 1) => state.cells.filter((c) => c === player).length;
function movesFor(cells: (0 | 1 | null)[], blocked: boolean[], player: 0 | 1): Move[] {
  const found: Move[] = [];
  cells.forEach((owner, from) => {
    if (owner !== player) return;
    for (const to of NEAR[from]) if (cells[to] === null && !blocked[to]) found.push({ from, to, extra: -1 });
    for (const to of FAR[from]) if (cells[to] === null && !blocked[to]) found.push({ from, to, extra: -1 });
  });
  return found;
}
export const moves = (state: State): Move[] => (state.winner !== null ? [] : movesFor(state.cells, state.blocked, state.turn));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1) return null;
  const { from, to } = move,
    me = state.turn,
    them = me === 0 ? 1 : 0;
  if (state.cells[from] !== me || state.cells[to] !== null || state.blocked[to]) return null;
  const near = NEAR[from].includes(to);
  if (!near && !FAR[from].includes(to)) return null;
  const cells = state.cells.slice();
  if (!near) cells[from] = null;
  cells[to] = me;
  const converted = NEAR[to].filter((n) => cells[n] === them);
  for (const n of converted) cells[n] = me;
  // A side that cannot move forfeits the empty cells to the other; then the board is counted.
  const stuck = movesFor(cells, state.blocked, them).length === 0;
  if (stuck && cells.includes(them)) cells.forEach((c, i) => c === null && !state.blocked[i] && (cells[i] = me));
  const mine = cells.filter((c) => c === me).length,
    theirs = cells.filter((c) => c === them).length;
  return {
    map: state.map,
    blocked: state.blocked,
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
