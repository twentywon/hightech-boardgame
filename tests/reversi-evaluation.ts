import { it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  createGame,
  play,
  legalMoves,
  point,
  counts,
  indexOf,
} from "../src/games/reversi/rules";
import { search, profiles } from "../src/games/reversi/ai";
import { difficulties, seededRandom } from "../src/core/ai";
it("Reversi seeded paired-color round robin", () => {
  const scale = Number(process.env.REVERSI_BUDGET_SCALE ?? ".05"),
    rounds = Number(process.env.REVERSI_ROUNDS ?? "2"),
    limit = Number(process.env.REVERSI_MOVE_LIMIT ?? "60");
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isInteger(rounds) ||
    rounds < 2 ||
    !Number.isInteger(limit) ||
    limit < 4 ||
    limit > 60
  )
    throw Error("Invalid evaluation settings");
  const summary = Object.fromEntries(
    difficulties.map((d) => [
      d,
      {
        games: 0,
        blackGames: 0,
        whiteGames: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        unfinished: 0,
        moves: 0,
        totalMs: 0,
        maxMs: 0,
        depthTotal: 0,
        deadlineReturns: 0,
        illegal: 0,
        aborted: 0,
        forcedPasses: 0,
        exactReturns: 0,
      },
    ]),
  );
  const games: unknown[] = [];
  for (let a = 0; a < 5; a++)
    for (let b = a + 1; b < 5; b++)
      for (let round = 0; round < rounds; round++)
        for (let swap = 0; swap < 2; swap++) {
          const black = difficulties[swap ? b : a],
            white = difficulties[swap ? a : b],
            rng = seededRandom(100 + round);
          let state = createGame();
          for (let k = 0; k < 4; k++) {
            const legal = legalMoves(state.board, state.turn);
            state = play(
              state,
              point(legal[Math.floor(rng() * legal.length)].index),
            )!;
          }
          const opening = state.moves.map(indexOf);
          let illegal = false,
            error: string | null = null;
          while (!state.winner && state.moves.length < limit) {
            const d = state.turn === 1 ? black : white,
              s = summary[d];
            let result;
            try {
              result = search(state, d, {
                seed: round * 7919 + state.moves.length,
                timeMs: profiles[d].timeMs * scale,
              });
            } catch (e) {
              error = String(e);
              summary[black].aborted++;
              summary[white].aborted++;
              break;
            }
            s.moves++;
            s.totalMs += result.stats.elapsedMs;
            s.maxMs = Math.max(s.maxMs, result.stats.elapsedMs);
            s.depthTotal += result.stats.depth;
            if (result.stats.timedOut) s.deadlineReturns++;
            if (result.stats.solved) s.exactReturns++;
            const next = result.move && play(state, result.move);
            if (!next || result.pass) {
              s.illegal++;
              illegal = true;
              break;
            }
            for (const event of next.passes.slice(state.passes.length))
              summary[event.player === 1 ? black : white].forcedPasses++;
            state = next;
          }
          for (const d of [black, white]) summary[d].games++;
          summary[black].blackGames++;
          summary[white].whiteGames++;
          if (state.winner === "draw") {
            summary[black].draws++;
            summary[white].draws++;
          } else if (state.winner) {
            summary[state.winner === 1 ? black : white].wins++;
            summary[state.winner === 1 ? white : black].losses++;
          } else {
            summary[black].unfinished++;
            summary[white].unfinished++;
          }
          games.push({
            black,
            white,
            round,
            opening,
            winner: state.winner,
            counts: counts(state.board),
            placements: state.moves.length,
            passes: state.passes,
            moveIndices: state.moves.map(indexOf),
            stopReason: error
              ? "error"
              : illegal
                ? "illegal"
                : state.winner
                  ? "completed"
                  : "move-limit",
            error,
            illegal,
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
    "reports/reversi-round-robin.json",
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        runtime: process.version,
        scale,
        rounds,
        limit,
        profiles,
        notes:
          "Paired colors with two seeded four-move openings. Reduced budgets when scale<1. Small sample, not a strength rating. Deadline fallback is not a failed game. Unfinished is not a draw.",
        summary: rows,
        games,
      },
      null,
      2,
    ),
  );
  console.table(
    rows.map((s) => ({
      difficulty: s.difficulty,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      unfinished: s.unfinished,
      meanMs: s.meanMs.toFixed(2),
      maxMs: s.maxMs.toFixed(2),
      meanDepth: s.meanDepth.toFixed(2),
      passes: s.forcedPasses,
      deadlineReturns: s.deadlineReturns,
      illegal: s.illegal,
      aborted: s.aborted,
    })),
  );
  expect(games.length).toBeGreaterThanOrEqual(40);
  expect(
    rows.every(
      (s) =>
        s.illegal === 0 && s.aborted === 0 && s.blackGames === s.whiteGames,
    ),
  ).toBe(true);
}, 600000);
