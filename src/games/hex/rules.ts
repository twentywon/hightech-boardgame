import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Hex on a rhombus of hexagons, row by row. The first player joins the top
 * edge to the bottom, the second the left edge to the right. A full board
 * always has exactly one winner.
 */
export const sizeOf = (variant: string) => (variant === "7" ? 7 : variant === "11" ? 11 : 9);
export interface State {
  size: number;
  cells: (0 | 1 | null)[];
  turn: 0 | 1;
  ply: number;
  effect: Effect | null;
  winner: Winner;
}
export const createGame = (variant: string = "9"): State => {
  const size = sizeOf(variant);
  return { size, cells: Array(size * size).fill(null), turn: 0, ply: 0, effect: null, winner: null };
};
/** The up to six cells that touch a cell. */
export function neighbours(size: number, cell: number) {
  const r = Math.floor(cell / size),
    c = cell % size,
    out: number[] = [];
  for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, -1], [-1, 1]]) {
    const nr = r + dr,
      nc = c + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) out.push(nr * size + nc);
  }
  return out;
}
/**
 * Fewest empty cells `player` still needs to join its two edges, or Infinity
 * when the way is shut. Zero means the edges are joined.
 */
export function distance(state: { size: number; cells: (0 | 1 | null)[] }, player: 0 | 1) {
  const { size, cells } = state,
    cost = (cell: number) => (cells[cell] === player ? 0 : cells[cell] === null ? 1 : Infinity),
    start = (i: number) => (player === 0 ? i : i * size),
    goal = (cell: number) => (player === 0 ? Math.floor(cell / size) === size - 1 : cell % size === size - 1),
    best: number[] = Array(size * size).fill(Infinity);
  // A 0–1 breadth-first search: cells of one's own are free to cross.
  const queue: number[] = [];
  for (let i = 0; i < size; i++) {
    const cell = start(i);
    if (cost(cell) < best[cell]) {
      best[cell] = cost(cell);
      if (cost(cell) === 0) queue.unshift(cell);
      else if (cost(cell) === 1) queue.push(cell);
    }
  }
  let found = Infinity;
  while (queue.length) {
    const cell = queue.shift()!;
    if (goal(cell)) found = Math.min(found, best[cell]);
    for (const next of neighbours(size, cell)) {
      const total = best[cell] + cost(next);
      if (total < best[next]) {
        best[next] = total;
        if (cost(next) === 0) queue.unshift(next);
        else queue.push(next);
      }
    }
  }
  return found;
}
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : state.cells.flatMap((c, to) => (c === null ? [{ from: -1, to, extra: -1 }] : []));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || state.cells[move.to] !== null) return null;
  const me = state.turn,
    cells = state.cells.slice();
  cells[move.to] = me;
  return {
    size: state.size,
    cells,
    turn: me === 0 ? 1 : 0,
    ply: state.ply + 1,
    effect: { kind: "place", from: -1, to: move.to, converted: [], removed: [] },
    winner: distance({ size: state.size, cells }, me) === 0 ? me : null,
  };
}
export const hex: PointGame<State> = {
  create: createGame,
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.cells,
  effect: (s) => s.effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => {
    const mine = distance(s, player),
      theirs = distance(s, player === 0 ? 1 : 0);
    return (Math.min(theirs, 99) - Math.min(mine, 99)) * 10;
  },
  // Only cells near the stones already placed are worth searching.
  candidates(s) {
    const taken = s.cells.flatMap((c, i) => (c === null ? [] : [i]));
    if (!taken.length) return [{ from: -1, to: Math.floor((s.size * s.size) / 2), extra: -1 }];
    const near = new Set<number>();
    for (const cell of taken)
      for (const a of neighbours(s.size, cell)) {
        near.add(a);
        for (const b of neighbours(s.size, a)) near.add(b);
      }
    return [...near].filter((c) => s.cells[c] === null).map((to) => ({ from: -1, to, extra: -1 }));
  },
  hint: (s) => (s.turn === 0 ? "칸을 칠해 위쪽과 아래쪽 변을 이으세요." : "칸을 칠해 왼쪽과 오른쪽 변을 이으세요."),
  tally: (s) => [0, 1].map((p) => `칸 ${s.cells.filter((c) => c === p).length}`) as [string, string],
  reason: (s) => (s.winner === 0 ? "위쪽과 아래쪽 변이 이어졌습니다." : "왼쪽과 오른쪽 변이 이어졌습니다."),
};
