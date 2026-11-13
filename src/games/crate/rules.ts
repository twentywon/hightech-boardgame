import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * The warehouse keeper: crates stand about a small warehouse and each has
 * to be pushed onto a marked square. The keeper walks one square at a time
 * and pushes a crate that stands in the way, if the square beyond it is
 * free; a crate cannot be pulled, and two cannot be pushed at once. Every
 * warehouse is laid out at random and played backwards from the solved
 * state (the keeper pulling the crates away), so it can always be solved.
 */
export const W = 9,
  H = 8,
  DX = [0, 1, 0, -1],
  DY = [-1, 0, 1, 0];
export interface State {
  wall: boolean[];
  goals: number[];
  crates: number[];
  keeper: number;
  /** The way the keeper last went. */
  face: number;
  winner: Winner;
  /** What the last step did: the way, and whether a crate was pushed. */
  last: { dir: number; pushed: boolean } | null;
  ply: number;
}
const beside = (at: number, dir: number) => at + DX[dir] + DY[dir] * W;
export const home = (state: State) => state.crates.filter((c) => state.goals.includes(c)).length;
/** Whether the keeper can step that way: onto a free square, or against a crate with a free square beyond it. */
function open(state: State, dir: number) {
  const to = beside(state.keeper, dir);
  if (state.wall[to]) return false;
  if (!state.crates.includes(to)) return true;
  const beyond = beside(to, dir);
  return !state.wall[beyond] && !state.crates.includes(beyond);
}
export const moves = (state: State): Move[] => (state.winner !== null ? [] : [0, 1, 2, 3].filter((dir) => open(state, dir)).map((to) => ({ from: -1, to, extra: -1 })));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || ![0, 1, 2, 3].includes(move.to) || !open(state, move.to)) return null;
  const to = beside(state.keeper, move.to),
    pushed = state.crates.includes(to),
    crates = state.crates.map((c) => (c === to ? beside(c, move.to) : c)),
    next: State = { ...state, crates, keeper: to, face: move.to, last: { dir: move.to, pushed }, ply: state.ply + 1 };
  return { ...next, winner: home(next) === crates.length ? 0 : null };
}
/** A warehouse with `count` crates that can be solved. */
export function createGame(count = 3, random: Random = cryptoRandom): State {
  const want = Math.max(1, Math.min(6, Math.round(count) || 3)),
    pick = (n: number) => Math.floor(random() * n);
  for (let attempt = 0; attempt < 4000; attempt++) {
    // The floor: a few rooms that run into one another.
    const wall: boolean[] = Array(W * H).fill(true),
      floor: number[] = [];
    for (let room = 0; room < 5 + Math.floor(want / 2); room++) {
      const w = 2 + pick(3),
        h = 2 + pick(2),
        through = floor.length ? floor[pick(floor.length)] : (1 + pick(H - 2)) * W + 1 + pick(W - 2),
        x0 = Math.max(1, Math.min(W - 1 - w, (through % W) - pick(w))),
        y0 = Math.max(1, Math.min(H - 1 - h, Math.floor(through / W) - pick(h)));
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++)
          if (wall[y * W + x]) {
            wall[y * W + x] = false;
            floor.push(y * W + x);
          }
    }
    if (floor.length < want * 3 + 12) continue;
    const spare = floor.slice(),
      take = () => spare.splice(pick(spare.length), 1)[0],
      goals = Array.from({ length: want }, take),
      crates = goals.slice();
    let keeper = take(),
      pulls = 0;
    // Played backwards: the keeper walks about and, with a crate at his back, draws it after him.
    for (let step = 0; step < 300 + want * 150; step++) {
      const dir = pick(4),
        to = beside(keeper, dir),
        behind = beside(keeper, (dir + 2) % 4);
      if (wall[to] || crates.includes(to)) continue;
      const drawn = crates.indexOf(behind);
      if (drawn >= 0 && random() < 0.8) {
        crates[drawn] = keeper;
        pulls++;
      }
      keeper = to;
    }
    // Worth solving: no crate left where it belongs, and enough pulling done.
    if (crates.some((c) => goals.includes(c)) || pulls < want * 3) continue;
    return { wall, goals, crates, keeper, face: 2, winner: null, last: null, ply: 0 };
  }
  // Never reached in practice: one crate to push one square along a corridor.
  const wall: boolean[] = Array(W * H).fill(true);
  for (let x = 1; x <= 4; x++) wall[W + x] = false;
  return { wall, goals: [W + 4], crates: [W + 3], keeper: W + 1, face: 1, winner: null, last: null, ply: 0 };
}
const effect = (): Effect | null => null;
export const crate: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 3),
  moves,
  play: (state, move) => play(state, move),
  turn: () => 0,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => home(s),
  hint: (s) => `상자 ${s.crates.length}개 중 ${home(s)}개 제자리 · ${s.ply}걸음 · 상자를 밀어 초록 표시 위에 올리세요.`,
  tally: (s) => [`제자리 ${home(s)}/${s.crates.length} · ${s.ply}걸음`, ""],
  reason: (s) => `상자 ${s.crates.length}개를 모두 제자리에 놓았습니다! ${s.ply}걸음.`,
};
