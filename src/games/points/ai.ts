import type { Move, PointGame } from "./types";

const WIN = 1e6;
/**
 * The move a computer plays: an alpha-beta search that deepens until `budget`
 * milliseconds have passed or `maxDepth` is reached. `now` is injected so
 * tests can search to a fixed depth.
 */
export function choose<S>(
  game: PointGame<S>,
  state: S,
  budget = 350,
  maxDepth = 6,
  now: () => number = () => performance.now(),
): Move | null {
  const legal = game.moves(state);
  if (!legal.length) return null;
  const me = game.turn(state),
    deadline = now() + budget;
  let out = false;
  const search = (s: S, depth: number, alpha: number, beta: number): number => {
    const winner = game.winner(s),
      side = game.turn(s);
    if (winner !== null) return winner === "draw" ? 0 : (winner === side ? WIN : -WIN) + (winner === side ? depth : -depth);
    if (depth === 0) return game.evaluate(s, side);
    if (now() > deadline) {
      out = true;
      return 0;
    }
    let best = -Infinity;
    for (const m of game.moves(s)) {
      const next = game.play(s, m)!,
        // The same side may move again in games where a turn can be kept.
        value = game.turn(next) === side ? search(next, depth - 1, alpha, beta) : -search(next, depth - 1, -beta, -alpha);
      if (out) return 0;
      if (value > best) best = value;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  };
  let choice = legal[0],
    order = legal;
  for (let depth = 1; depth <= maxDepth; depth++) {
    let best = -Infinity,
      pick = order[0];
    const scored: [Move, number][] = [];
    for (const m of order) {
      const next = game.play(state, m)!,
        value = game.turn(next) === me ? search(next, depth - 1, -Infinity, Infinity) : -search(next, depth - 1, -Infinity, -best);
      if (out) break;
      scored.push([m, value]);
      if (value > best) {
        best = value;
        pick = m;
      }
    }
    if (out) break;
    choice = pick;
    // Search the most promising moves first on the next, deeper pass.
    order = scored.sort((a, b) => b[1] - a[1]).map(([m]) => m);
    if (best >= WIN) break;
  }
  return choice;
}
