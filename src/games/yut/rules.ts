import type { Random } from "../../core/random";

/**
 * Yut nori for two players with four pieces each.
 *
 * Stations: 0 is the start/finish corner (참먹이); 1–19 run round the outer
 * ring; 5, 10 and 15 are the other corners. 20–21 lead from corner 5 to the
 * centre 22 and on through 23–24 to corner 15; 25–26 lead from corner 10 to
 * the centre and on through 27–28 to station 0.
 */
export const WAITING = -1,
  FINISHED = 99,
  PIECES = 4;
/** Steps of a throw: 빽도 is one step back. */
export type Result = -1 | 1 | 2 | 3 | 4 | 5;
export const RESULT_NAMES: Record<Result, string> = {
  [-1]: "빽도",
  1: "도",
  2: "개",
  3: "걸",
  4: "윷",
  5: "모",
};
export interface Move {
  /** Index of one of the pieces that move (a stack moves together). */
  piece: number;
  result: Result;
  from: number;
  to: number;
  /** Stations passed on the way, ending with `to`. */
  path: number[];
}
export interface State {
  /** Whose turn it is: two to four players take turns in order. */
  turn: number;
  /** Station of each piece, `WAITING` or `FINISHED`, player by player. */
  pieces: number[][];
  /** Throws the player to move still has. */
  throwsLeft: number;
  /** Thrown results not yet used for a move. */
  pending: Result[];
  /** The last throw: true where a stick lies flat side up. Stick 0 is the marked one. */
  sticks: boolean[];
  thrown: Result | null;
  throwId: number;
  moveId: number;
  last: { player: number; move: Move; count: number; captured: number } | null;
  /** Results the previous player had to give up because no piece could use them. */
  forfeited: Result[];
  winner: number | null;
}

export const MAX_PLAYERS = 4;
export function createGame(players = 2): State {
  return {
    turn: 0,
    pieces: Array.from({ length: Math.max(2, Math.min(MAX_PLAYERS, players)) }, () => Array<number>(PIECES).fill(WAITING)),
    throwsLeft: 1,
    pending: [],
    sticks: [false, false, false, false],
    thrown: null,
    throwId: 0,
    moveId: 0,
    last: null,
    forfeited: [],
    winner: null,
  };
}
/** One flat stick is 도, two 개, three 걸, four 윷, none 모; the marked stick alone is 빽도. */
export function resultOf(sticks: boolean[]): Result {
  const flat = sticks.filter(Boolean).length;
  if (flat === 0) return 5;
  if (flat === 1) return sticks[0] ? -1 : 1;
  return flat as Result;
}
/**
 * The station after `pos`. A move that starts on a corner or the centre
 * turns onto the short road; one that only passes keeps going straight.
 */
function next(pos: number, prev: number, first: boolean): number {
  if (pos === WAITING) return 1;
  if (pos === 0) return FINISHED;
  if (first && pos === 5) return 20;
  if (first && pos === 10) return 25;
  if (pos === 22) return first || prev !== 21 ? 27 : 23;
  if (pos === 19 || pos === 28) return 0;
  if (pos === 24) return 15;
  if (pos === 26) return 22;
  return pos + 1;
}
const BACK: Record<number, number> = { 0: 19, 1: 0, 20: 5, 25: 10, 27: 22 };
/** Stations passed by a piece at `pos` using `result`; empty when it cannot move. */
export function route(pos: number, result: Result): number[] {
  if (pos === FINISHED) return [];
  if (result === -1) return pos === WAITING ? [] : [BACK[pos] ?? pos - 1];
  const path: number[] = [];
  let at = pos,
    prev = WAITING;
  for (let i = 0; i < result && at !== FINISHED; i++) {
    const to = next(at, prev, i === 0);
    prev = at;
    at = to;
    path.push(at);
  }
  return path;
}
/** Throws still needed from `pos` if every later move began where the last one ended on the short road. */
export function remaining(pos: number): number {
  if (pos === FINISHED) return 0;
  let at = pos,
    prev = WAITING,
    steps = 0;
  while (at !== FINISHED) {
    const to = next(at, prev, steps === 0);
    prev = at;
    at = to;
    steps++;
  }
  return steps;
}
/** Every different move the player to move may make now. */
export function moves(state: State): Move[] {
  if (state.winner !== null || state.throwsLeft > 0) return [];
  const found: Move[] = [],
    mine = state.pieces[state.turn];
  for (const result of new Set(state.pending))
    mine.forEach((from, piece) => {
      if (from === FINISHED || mine.indexOf(from) !== piece) return;
      const path = route(from, result);
      if (path.length) found.push({ piece, result, from, to: path[path.length - 1], path });
    });
  return found;
}
/** Passes the turn when nothing more can be thrown or moved. */
function settle(state: State): State {
  if (state.winner !== null || state.throwsLeft > 0 || moves(state).length) return state;
  return {
    ...state,
    forfeited: state.pending,
    pending: [],
    turn: (state.turn + 1) % state.pieces.length,
    throwsLeft: 1,
  };
}
/** Throws the four sticks. 윷 and 모 keep the throw. */
export function throwSticks(state: State, random: Random): State | null {
  if (state.winner !== null || state.throwsLeft <= 0) return null;
  const sticks = Array.from({ length: 4 }, () => random() < 0.5),
    thrown = resultOf(sticks);
  return settle({
    ...state,
    sticks,
    thrown,
    throwId: state.throwId + 1,
    pending: [...state.pending, thrown],
    throwsLeft: state.throwsLeft - (thrown >= 4 ? 0 : 1),
    forfeited: [],
  });
}
/**
 * Moves `piece` (and the pieces stacked with it) by one pending `result`.
 * Landing on another player's pieces sends them back and earns a throw.
 */
export function move(state: State, piece: number, result: Result): State | null {
  const mine = state.pieces[state.turn],
    chosen = moves(state).find((m) => m.result === result && m.from === mine[piece]);
  if (!chosen) return null;
  const { from, to } = chosen,
    movers = from === WAITING ? [chosen.piece] : mine.flatMap((p, i) => (p === from ? [i] : [])),
    moved = mine.map((p, i) => (movers.includes(i) ? to : p)),
    pending = [...state.pending];
  // Every other player's pieces standing where the move ends go back to wait.
  let captured = 0;
  const pieces = state.pieces.map((list, player) =>
    player === state.turn
      ? moved
      : list.map((p) => {
          if (to === FINISHED || p !== to) return p;
          captured++;
          return WAITING;
        }),
  );
  pending.splice(pending.indexOf(result), 1);
  return settle({
    ...state,
    pieces,
    pending,
    throwsLeft: captured ? 1 : 0,
    moveId: state.moveId + 1,
    last: { player: state.turn, move: chosen, count: movers.length, captured },
    forfeited: [],
    winner: moved.every((p) => p === FINISHED) ? state.turn : null,
  });
}
