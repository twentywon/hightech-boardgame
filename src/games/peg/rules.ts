import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Peg solitaire on the English board: thirty-three holes in a cross, a peg
 * in every hole but the middle. A peg jumps over a neighbour, along a row or
 * a column, into the empty hole beyond, and the peg jumped over comes off.
 * The game is won with one peg left.
 */
export const SIZE = 7;
const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < SIZE && z < SIZE && ((x >= 2 && x <= 4) || (z >= 2 && z <= 4));
/** The holes, row by row from the far side; `HOLES[i]` is where hole `i` lies on the 7×7 grid. */
export const HOLES: { x: number; z: number }[] = [];
const at = new Map<number, number>();
for (let z = 0; z < SIZE; z++)
  for (let x = 0; x < SIZE; x++)
    if (inside(x, z)) {
      at.set(z * SIZE + x, HOLES.length);
      HOLES.push({ x, z });
    }
export const holeAt = (x: number, z: number) => (inside(x, z) ? at.get(z * SIZE + x)! : -1);
export const CENTRE = holeAt(3, 3);
/** Every jump the board allows: from, over, to. */
export const JUMPS: [number, number, number][] = [];
HOLES.forEach(({ x, z }, from) => {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const over = holeAt(x + dx, z + dz),
      to = holeAt(x + dx * 2, z + dz * 2);
    if (over >= 0 && to >= 0) JUMPS.push([from, over, to]);
  }
});
export interface State {
  pegs: boolean[];
  winner: Winner;
  last: { from: number; over: number; to: number } | null;
  ply: number;
}
export const createGame = (): State => ({ pegs: HOLES.map((_, i) => i !== CENTRE), winner: null, last: null, ply: 0 });
export const left = (state: State) => state.pegs.filter(Boolean).length;
const open = (pegs: boolean[]) => JUMPS.filter(([from, over, to]) => pegs[from] && pegs[over] && !pegs[to]);
export const moves = (state: State): Move[] => (state.winner !== null ? [] : open(state.pegs).map(([from, , to]) => ({ from, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1) return null;
  const jump = open(state.pegs).find(([from, , to]) => from === move.from && to === move.to);
  if (!jump) return null;
  const pegs = state.pegs.slice(),
    [from, over, to] = jump;
  pegs[from] = pegs[over] = false;
  pegs[to] = true;
  const count = pegs.filter(Boolean).length;
  // One peg left is the game won; no jump left with more is the game lost.
  return { pegs, winner: count === 1 ? 0 : open(pegs).length ? null : 1, last: { from, over, to }, ply: state.ply + 1 };
}
const effect = (state: State): Effect | null => (state.last ? { kind: "jump", from: state.last.from, to: state.last.to, converted: [], removed: [state.last.over] } : null);
export const peg: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.pegs.map((p) => (p ? 0 : null)),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => -left(s),
  hint: (s) => `구슬 ${left(s)}개 · 구슬 하나로 옆 구슬을 뛰어넘어 빈 구멍에 놓으세요.`,
  tally: (s) => [`남은 구슬 ${left(s)}`, ""],
  reason: (s) =>
    s.winner === 0
      ? s.pegs[CENTRE]
        ? "구슬 하나가 한가운데에 남았습니다. 완벽합니다!"
        : "구슬 하나만 남겼습니다. 성공!"
      : `더 뛰어넘을 구슬이 없습니다. 구슬 ${left(s)}개가 남았습니다.`,
};
