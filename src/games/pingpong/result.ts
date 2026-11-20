import type { SetResult } from "../../ui/chrome";
import type { State } from "./rules";

/**
 * A game of the match won or lost, for the person at the screen (side 0): `n게임 승리` or `n게임 패배`, with the game's
 * score and the games so far under it. Nothing in the middle of a game, and nothing for the game that ends the match
 * (the finale tells that).
 */
export function gameResult(before: State, state: State): SetResult | null {
  if (state.winner !== null || state.done.length <= before.done.length) return null;
  const n = state.done.length,
    [mine, theirs] = state.done[n - 1],
    won = mine > theirs;
  return { outcome: won ? "win" : "lose", word: `${n}게임 ${won ? "승리" : "패배"}`, detail: `${mine} : ${theirs} · 게임 ${state.games[0]} : ${state.games[1]}` };
}
