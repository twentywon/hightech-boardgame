import type { SetResult } from "../../ui/chrome";
import type { State } from "./rules";

/**
 * A set of the Olympic match shot, with the match going on: for the person at the screen `n세트 승리`, `n세트 패배` or
 * `n세트 무승부` (against the computer), or the colour that took it (`n세트 · 빨강`) when two shoot at one screen, with
 * the set's arrow totals and the set points so far under it (and 슛오프 when they now stand at 5 all). A shoot-off
 * arrow each that came out exactly as close is told as `슛오프 동점`. The end that wins the match (a set or the
 * shoot-off) is told by the finale alone; the solo rounds have no sets and tell nothing.
 */
export function setResult(before: State, state: State, mode: "local" | "ai", sides: readonly [string, string] = ["빨강", "파랑"]): SetResult | null {
  if (state.format !== "match" || state.winner !== null || state.history.length <= before.history.length) return null;
  const end = state.history[state.history.length - 1],
    [a, b] = end.totals,
    standing = `세트점 ${state.setPoints[0]} : ${state.setPoints[1]}`;
  if (end.shootOff) {
    const near = (side: 0 | 1) => Math.min(...end.arrows.filter((x) => x.side === side).map((x) => x.r)).toFixed(1);
    return { outcome: "draw", word: "슛오프 동점", detail: `${near(0)}mm : ${near(1)}mm · 한 발씩 더` };
  }
  const n = state.history.filter((e) => !e.shootOff).length,
    taker: 0 | 1 | null = end.points[0] > end.points[1] ? 0 : end.points[1] > end.points[0] ? 1 : null,
    word =
      taker === null ? `${n}세트 무승부` : mode === "local" ? `${n}세트 · ${sides[taker]}` : `${n}세트 ${taker === 0 ? "승리" : "패배"}`,
    // Two at one screen always count as a win, as the finale does.
    outcome = taker === null ? "draw" : mode === "local" || taker === 0 ? "win" : "lose";
  return { outcome, word, detail: `${a} : ${b} · ${standing}${state.shootOff ? " · 슛오프" : ""}` };
}
