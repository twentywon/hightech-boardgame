import { FINISHED, WAITING, moves, remaining, route, type Move, type Result, type State } from "./rules";

/** Chance of each throw with evenly weighted sticks. */
const CHANCE: [Result, number][] = [
  [-1, 1 / 16],
  [1, 3 / 16],
  [2, 6 / 16],
  [3, 4 / 16],
  [4, 1 / 16],
  [5, 1 / 16],
];
const START = remaining(WAITING);
/** Chance that one of `rivals` lands on `station` with its next throw. */
function threat(rivals: number[], station: number) {
  if (station === FINISHED || station === WAITING) return 0;
  let safe = 1;
  for (const [result, chance] of CHANCE)
    if (rivals.some((pos) => route(pos, result).at(-1) === station)) safe -= chance;
  return 1 - safe;
}
/** How good `m` looks one move deep: progress, captures, stacking and exposure. */
export function value(state: State, m: Move): number {
  const mine = state.pieces[state.turn],
    theirs = state.pieces.flatMap((list, player) => (player === state.turn ? [] : list)),
    count = m.from === WAITING ? 1 : mine.filter((p) => p === m.from).length,
    joined = m.to === FINISHED ? 0 : mine.filter((p) => p === m.to).length,
    worth = (pos: number, n: number) => n * (START - remaining(pos)) + (n - 1) * 3;
  let score = (remaining(m.from) - remaining(m.to)) * count;
  if (m.to === FINISHED) return score + 4 * count;
  const captured = theirs.filter((p) => p === m.to);
  // A capture undoes their progress and earns another throw.
  if (captured.length) score += worth(m.to, captured.length) + 7;
  if (joined) score += 2;
  const rivals = theirs.filter((p) => p !== FINISHED && p !== m.to);
  score -= threat(rivals, m.to) * worth(m.to, count + joined) * 0.9;
  if (m.from !== WAITING) score += threat(rivals, m.from) * worth(m.from, count) * 0.9;
  return score;
}
/** The move the computer makes, or null when there is none. */
export function choose(state: State): Move | null {
  let best: Move | null = null,
    top = -Infinity;
  for (const m of moves(state)) {
    const v = value(state, m);
    if (v > top) {
      top = v;
      best = m;
    }
  }
  return best;
}
