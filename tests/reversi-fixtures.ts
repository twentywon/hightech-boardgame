import {
  createGame,
  play,
  legalMoves,
  point,
  counts,
  type State,
} from "../src/games/reversi/rules";
import { seededRandom } from "../src/core/ai";
export function playout(seed = 1, emptyTarget = 0): State {
  const rng = seededRandom(seed);
  let state = createGame();
  while (!state.winner && counts(state.board).empty > emptyTarget) {
    const moves = legalMoves(state.board, state.turn);
    const next = play(
      state,
      point(moves[Math.floor(rng() * moves.length)].index),
    );
    if (!next) throw new Error("Invalid fixture playout");
    state = next;
  }
  return state;
}
export function findPassHistory() {
  for (let seed = 1; seed < 100; seed++) {
    const rng = seededRandom(seed);
    let state = createGame();
    while (!state.winner) {
      const legal = legalMoves(state.board, state.turn);
      state = play(
        state,
        point(legal[Math.floor(rng() * legal.length)].index),
      )!;
      if (state.lastPassed && !state.winner) return state;
    }
  }
  throw Error("No pass fixture");
}
