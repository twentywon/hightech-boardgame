import { at, type State, type Side } from "../src/games/janggi/rules";

/**
 * A position from a list of "<piece><file><rank>" tokens: upper case Cho,
 * lower case Han, file 1–9 from Cho's left, rank 1–10 from Han's back rank.
 * "K59" is Cho's king on its starting point.
 */
export function position(tokens: string, turn: Side = "cho"): State {
  const cells = Array<string>(90).fill(".");
  for (const token of tokens.split(" ").filter(Boolean))
    cells[at(Number(token[1]) - 1, Number(token.slice(2)) - 1)] = token[0];
  const board = cells.join("");
  return {
    board,
    turn,
    moves: [],
    initial: board,
    keys: [board + turn[0]],
    bikjang: null,
    outcome: null,
  };
}
/** Index of the point at file (1–9) and rank (1–10). */
export const sq = (file: number, rank: number) => at(file - 1, rank - 1);
