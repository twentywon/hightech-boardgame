import { it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createGame, play, counts } from "../src/games/reversi/rules";
import { search, profiles } from "../src/games/reversi/ai";
import { difficulties } from "../src/core/ai";
import { playout } from "./reversi-fixtures";
it("Reversi full-budget opening, middle and exact-endgame measurements", () => {
  const samples: unknown[] = [];
  for (const state of [createGame(), playout(5, 40), playout(3, 6)])
    for (const d of difficulties) {
      const result = search(state, d, { seed: 17 });
      expect(result.move && play(state, result.move)).toBeTruthy();
      samples.push({
        difficulty: d,
        discs: 64 - counts(state.board).empty,
        budgetMs: profiles[d].timeMs,
        ...result.stats,
      });
    }
  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/reversi-default-budget.json",
    JSON.stringify({ runtime: process.version, samples }, null, 2),
  );
  console.table(samples);
}, 60000);

it("expert budgets at 8 and 10 empty cells", () => {
  const samples = [];
  for (const empty of [8, 10]) {
    const state = playout(8, empty);
    expect(state.winner).toBeNull();
    const result = search(state, "expert", { seed: 17 });
    expect(result.move && play(state, result.move)).toBeTruthy();
    samples.push({
      empty: counts(state.board).empty,
      budgetMs: profiles.expert.timeMs,
      ...result.stats,
    });
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/reversi-endgame-budget.json",
    JSON.stringify({ runtime: process.version, samples }, null, 2),
  );
}, 15000);
