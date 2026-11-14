import type { State, Point } from "./rules";
import { search, type SearchOptions } from "./ai/search";
import type { Difficulty } from "./ai/difficulty";
export { search } from "./ai/search";
// Compatibility entry point. The UI calls the Worker client, never this synchronous API.
export function chooseMove(
  state: State,
  difficulty: Difficulty = "easy",
  options: SearchOptions = {},
): Point | null {
  return search(state, difficulty, options).move;
}
