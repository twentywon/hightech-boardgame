import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";

/**
 * Sea battle: each side hides a fleet on its own 10×10 chart and the two
 * take turns to fire at one square of the other's. Whoever sinks the whole
 * of the other fleet wins. Points 0–99 are side 0's waters, 100–199 side 1's.
 */
export const SIZE = 10,
  CELLS = SIZE * SIZE,
  /** Lengths of the five ships, with their names. */
  FLEET: [string, number][] = [
    ["항공모함", 5],
    ["전함", 4],
    ["순양함", 3],
    ["잠수함", 3],
    ["구축함", 2],
  ];
export interface Ship {
  name: string;
  cells: number[];
}
export interface State {
  fleets: [Ship[], Ship[]];
  /** Squares of each side's waters that have been fired at. */
  shots: [boolean[], boolean[]];
  turn: 0 | 1;
  winner: Winner;
  last: { point: number; hit: boolean; sunk: string | null } | null;
  ply: number;
}
/** A fleet laid out at random: no two ships share a square. */
export function layFleet(random: Random): Ship[] {
  const taken = new Set<number>();
  return FLEET.map(([name, length]) => {
    for (;;) {
      const across = random() < 0.5,
        row = Math.floor(random() * (across ? SIZE : SIZE - length + 1)),
        col = Math.floor(random() * (across ? SIZE - length + 1 : SIZE)),
        cells = Array.from({ length }, (_, k) => (across ? row * SIZE + col + k : (row + k) * SIZE + col));
      if (cells.some((c) => taken.has(c))) continue;
      cells.forEach((c) => taken.add(c));
      return { name, cells };
    }
  });
}
export const createGame = (random: Random = cryptoRandom): State => ({
  fleets: [layFleet(random), layFleet(random)],
  shots: [Array(CELLS).fill(false), Array(CELLS).fill(false)],
  turn: 0,
  winner: null,
  last: null,
  ply: 0,
});
export const sunk = (state: State, side: number, ship: Ship) => ship.cells.every((c) => state.shots[side][c]);
export const afloat = (state: State, side: number) => state.fleets[side].filter((ship) => !sunk(state, side, ship)).length;
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const target = state.turn ? 0 : 1,
    out: Move[] = [];
  for (let c = 0; c < CELLS; c++) if (!state.shots[target][c]) out.push({ from: -1, to: target * CELLS + c, extra: -1 });
  return out;
}
export function play(state: State, move: Move): State | null {
  const target = state.turn ? 0 : 1,
    cell = move.to - target * CELLS;
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !Number.isInteger(cell) || cell < 0 || cell >= CELLS || state.shots[target][cell])
    return null;
  const shots: [boolean[], boolean[]] = [state.shots[0].slice(), state.shots[1].slice()];
  shots[target][cell] = true;
  const next: State = { ...state, shots, turn: target as 0 | 1, ply: state.ply + 1, last: null },
    ship = state.fleets[target].find((s) => s.cells.includes(cell));
  next.last = { point: move.to, hit: !!ship, sunk: ship && sunk(next, target, ship) ? ship.name : null };
  if (!afloat(next, target)) next.winner = state.turn;
  return next;
}
/**
 * Where a computer fires. It knows only what a player at the table knows:
 * which of its shots hit, and which ships have gone down.
 */
export function aimShot(state: State, level: Level, random: Random = Math.random): Move | null {
  const legal = moves(state);
  if (!legal.length) return null;
  const target = state.turn ? 0 : 1,
    shots = state.shots[target],
    fleet = state.fleets[target],
    down = new Set(fleet.filter((s) => sunk(state, target, s)).flatMap((s) => s.cells)),
    hit = (c: number) => shots[c] && !down.has(c) && fleet.some((s) => s.cells.includes(c)),
    miss = (c: number) => shots[c] && !hit(c),
    any = () => legal[Math.floor(random() * legal.length)];
  if (level === "easy" && random() < 0.5) return any();
  // How many ways the ships still afloat could cover each square, weighted toward open hits.
  const weight = Array<number>(CELLS).fill(0);
  for (const ship of fleet) {
    if (sunk(state, target, ship)) continue;
    const length = ship.cells.length;
    for (const across of [true, false])
      for (let row = 0; row < (across ? SIZE : SIZE - length + 1); row++)
        for (let col = 0; col < (across ? SIZE - length + 1 : SIZE); col++) {
          const cells = Array.from({ length }, (_, k) => (across ? row * SIZE + col + k : (row + k) * SIZE + col));
          if (cells.some(miss)) continue;
          const hits = cells.filter(hit).length,
            value = hits ? 100 ** hits : 1;
          for (const c of cells) if (!shots[c]) weight[c] += value;
        }
  }
  if (level !== "hard") {
    // Without counting: beside an open hit when there is one (along the line of two, if two lie together), otherwise every other square.
    const beside = (c: number) =>
        [c - SIZE, c + SIZE, c % SIZE ? c - 1 : -1, c % SIZE < SIZE - 1 ? c + 1 : -1].filter((n) => n >= 0 && n < CELLS),
      near = legal.filter((m) => beside(m.to - target * CELLS).some(hit)),
      inLine = near.filter((m) => {
        const c = m.to - target * CELLS;
        return beside(c).some((n) => hit(n) && hit(n + (n - c)) && Math.abs((n % SIZE) - (c % SIZE)) <= 1);
      }),
      pool = inLine.length ? inLine : near;
    if (pool.length) return pool[Math.floor(random() * pool.length)];
    const checked = legal.filter((m) => (Math.floor((m.to % CELLS) / SIZE) + (m.to % SIZE)) % 2 === 0);
    return (checked.length ? checked : legal)[Math.floor(random() * (checked.length || legal.length))];
  }
  const best = Math.max(...legal.map((m) => weight[m.to - target * CELLS])),
    top = legal.filter((m) => weight[m.to - target * CELLS] === best);
  return top[Math.floor(random() * top.length)];
}
const effect = (state: State): Effect | null =>
  state.last ? { kind: "place", from: -1, to: state.last.point, converted: [], removed: [] } : null;
export const seaBattle: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  choose: aimShot,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => Array(CELLS * 2).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => afloat(s, player) - afloat(s, player ? 0 : 1),
  hint: (s) => (s.last?.sunk ? `${s.last.sunk} 격침! 쏠 칸을 고르세요.` : "상대 해역에서 쏠 칸을 고르세요."),
  tally: (s) => [0, 1].map((p) => `남은 배 ${afloat(s, p)}척`) as [string, string],
  reason: () => "상대 함대를 모두 가라앉혔습니다.",
};
