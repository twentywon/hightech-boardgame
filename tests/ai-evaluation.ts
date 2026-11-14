import { it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { createGame, play } from "../src/games/gomoku/rules";
import { search } from "../src/games/gomoku/ai/search";
import { difficulties, profiles } from "../src/games/gomoku/ai/difficulty";
it("seeded round robin with paired colors and measured time budgets", () => {
  const scale = Number(process.env.AI_BUDGET_SCALE ?? ".05"),
    rounds = Number(process.env.AI_ROUNDS ?? "2"),
    moveLimit = Number(process.env.AI_MOVE_LIMIT ?? "120");
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isInteger(rounds) ||
    rounds < 1 ||
    !Number.isInteger(moveLimit) ||
    moveLimit < 3 ||
    moveLimit > 225
  )
    throw new Error("Invalid evaluation budget, rounds or move limit");
  const summary = Object.fromEntries(
    difficulties.map((d) => [
      d,
      {
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        unfinished: 0,
        moves: 0,
        totalMs: 0,
        maxMs: 0,
        deadlineReturns: 0,
        illegal: 0,
        depthTotal: 0,
        maxBudgetOverrunMs: 0,
        aborted: 0,
        blackGames: 0,
        whiteGames: 0,
      },
    ]),
  );
  const games: unknown[] = [];
  for (let a = 0; a < difficulties.length; a++)
    for (let b = a + 1; b < difficulties.length; b++)
      for (let round = 0; round < rounds; round++)
        for (let swap = 0; swap < 2; swap++) {
          const black = difficulties[swap ? b : a],
            white = difficulties[swap ? a : b];
          let state = createGame();
          // The exact same neutral opening is used in each color-reversed pair.
          state = play(state, { row: 7, col: 7 })!;
          state = play(state, { row: 6 + (round % 3), col: 8 })!;
          let illegal = false,
            aborted = false,
            error: string | null = null;
          const times: number[] = [];
          while (!state.winner && state.moves.length < moveLimit) {
            const d = state.turn === 1 ? black : white;
            let result;
            try {
              result = search(state, d, {
                seed: round * 1000 + state.moves.length,
                timeMs: profiles[d].timeMs * scale,
              });
            } catch (failure) {
              aborted = true;
              error = String(failure);
              summary[black].aborted++;
              summary[white].aborted++;
              break;
            }
            const s = summary[d];
            s.moves++;
            s.totalMs += result.stats.elapsedMs;
            s.maxMs = Math.max(s.maxMs, result.stats.elapsedMs);
            s.depthTotal += result.stats.depth;
            s.maxBudgetOverrunMs = Math.max(
              s.maxBudgetOverrunMs,
              result.stats.elapsedMs - profiles[d].timeMs * scale,
            );
            if (result.stats.timedOut) s.deadlineReturns++;
            times.push(result.stats.elapsedMs);
            const next = result.move && play(state, result.move);
            if (!next) {
              s.illegal++;
              illegal = true;
              break;
            }
            state = next;
          }
          for (const d of [black, white]) summary[d].games++;
          summary[black].blackGames++;
          summary[white].whiteGames++;
          if (state.winner === "draw") {
            summary[black].draws++;
            summary[white].draws++;
          } else if (state.winner) {
            const win = state.winner === 1 ? black : white,
              lose = state.winner === 1 ? white : black;
            summary[win].wins++;
            summary[lose].losses++;
          } else {
            summary[black].unfinished++;
            summary[white].unfinished++;
          }
          games.push({
            black,
            white,
            round,
            moves: state.moves.length,
            winner: state.winner,
            error,
            stopReason: aborted
              ? "error"
              : illegal
                ? "illegal"
                : state.winner
                  ? "completed"
                  : "move-limit",
            illegal,
            maxMs: Math.max(...times),
          });
        }
  const rows = difficulties.map((d) => ({
    difficulty: d,
    ...summary[d],
    winRate: summary[d].wins / summary[d].games,
    meanMs: summary[d].totalMs / summary[d].moves,
    meanDepth: summary[d].depthTotal / summary[d].moves,
  }));
  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/ai-round-robin.json",
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        runtime: process.version,
        scale,
        rounds,
        moveLimit,
        engineProfile: profiles,
        notes:
          "Reduced wall-clock budgets; small sample, not a strength rating. Deadline returns use best completed iteration, not failed games. Unfinished means move cap, not a draw.",
        summary: rows,
        games,
      },
      null,
      2,
    ),
  );
  console.table(
    rows.map(
      ({
        difficulty,
        wins,
        losses,
        unfinished,
        meanMs,
        maxMs,
        meanDepth,
        deadlineReturns,
        illegal,
      }) => ({
        difficulty,
        wins,
        losses,
        unfinished,
        meanMs: meanMs.toFixed(2),
        maxMs: maxMs.toFixed(2),
        meanDepth: meanDepth.toFixed(2),
        deadlineReturns,
        illegal,
      }),
    ),
  );
  expect(
    rows.every(
      (r) =>
        r.illegal === 0 && r.aborted === 0 && r.blackGames === r.whiteGames,
    ),
  ).toBe(true);
}, 600000);
