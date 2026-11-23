import type { SetResult } from "../../ui/chrome";
import type { State } from "./rules";

/**
 * A game of the match won or lost, for the person at the screen (side 0; over Wi-Fi the device's `seat`, and one
 * watching hears the colour that took it): `n게임 승리` or `n게임 패배`, with the game's score and the games so far
 * under it. Nothing in the middle of a game, and nothing for the game that ends the match (the finale tells that).
 */
export function gameResult(before: State, state: State, seat: number | null = 0): SetResult | null {
  if (state.winner !== null || state.done.length <= before.done.length) return null;
  const n = state.done.length,
    [red, blue] = state.done[n - 1],
    took = red > blue ? 0 : 1,
    detail = `${red} : ${blue} · 게임 ${state.games[0]} : ${state.games[1]}`;
  if (seat !== 0 && seat !== 1) return { outcome: "win", word: `${n}게임 · ${took === 0 ? "빨강" : "파랑"}`, detail };
  const won = took === seat;
  return { outcome: won ? "win" : "lose", word: `${n}게임 ${won ? "승리" : "패배"}`, detail };
}
