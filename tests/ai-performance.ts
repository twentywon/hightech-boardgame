import { it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { createGame, play, type Point } from "../src/games/gomoku/rules";
import { search } from "../src/games/gomoku/ai/search";
import { difficulties, profiles } from "../src/games/gomoku/ai/difficulty";
it("measures default budgets on early and developed positions", () => {
  const points: Point[] = [
    { row: 7, col: 7 },
    { row: 6, col: 7 },
    { row: 8, col: 8 },
    { row: 8, col: 7 },
    { row: 6, col: 6 },
    { row: 9, col: 9 },
    { row: 5, col: 7 },
    { row: 9, col: 6 },
    { row: 6, col: 8 },
    { row: 7, col: 9 },
    { row: 8, col: 5 },
    { row: 9, col: 8 },
  ];
  const rows: unknown[] = [];
  for (const count of [2, 8, 12]) {
    let state = createGame();
    for (const p of points.slice(0, count)) state = play(state, p)!;
    for (const d of difficulties) {
      const result = search(state, d, { seed: 101 });
      expect(result.move && play(state, result.move)).toBeTruthy();
      rows.push({
        difficulty: d,
        positionMoves: count,
        budgetMs: profiles[d].timeMs,
        move: result.move,
        ...result.stats,
      });
    }
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/ai-default-budget.json",
    JSON.stringify({ runtime: process.version, samples: rows }, null, 2),
  );
  console.table(rows);
}, 60000);
