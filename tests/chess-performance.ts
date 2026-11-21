import { it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { difficulties, type Difficulty } from "../src/core/ai";
import {
  createGame,
  createEngine,
  action,
  play,
  claimDraw,
} from "../src/games/chess/rules";
import { search, type SearchResult } from "../src/games/chess/ai";
import { profiles } from "../src/games/chess/difficulty";
it("measures single-position chess search budgets (no AI-vs-AI games)", () => {
  let middle = createGame();
  for (const san of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"]) {
    const g = createEngine(middle);
    middle = play(middle, action(g.move(san)))!;
  }
  const positions = [
    { name: "opening", state: createGame() },
    { name: "development", state: middle },
    {
      name: "rook ending",
      state: createGame("6k1/5pp1/7p/8/4P3/5K2/6PP/4R3 w - - 0 35"),
    },
  ];
  const samples: (SearchResult & {
    difficulty: Difficulty;
    position: string;
    budgetMs: number;
  })[] = [];
  for (const difficulty of difficulties)
    for (const { name, state } of positions) {
      const result = search(state, difficulty, { seed: 23 });
      expect(
        result.claim
          ? claimDraw(state, result.move ?? undefined)
          : result.move && play(state, result.move),
      ).toBeTruthy();
      samples.push({
        difficulty,
        position: name,
        budgetMs: profiles[difficulty].timeMs,
        ...result,
      });
    }
  const summary = difficulties.map((difficulty) => {
    const group = samples.filter((s) => s.difficulty === difficulty);
    return {
      difficulty,
      meanMs: group.reduce((a, s) => a + s.stats.elapsedMs, 0) / group.length,
      maxMs: Math.max(...group.map((s) => s.stats.elapsedMs)),
      depths: group.map((s) => s.stats.depth),
      nodes: group.map((s) => s.stats.nodes),
    };
  });
  mkdirSync("reports", { recursive: true });
  writeFileSync(
    "reports/chess-position-timings.json",
    JSON.stringify(
      {
        method:
          "Three individual positions at default budgets; synchronous search only; not a strength evaluation or tournament",
        summary,
        samples,
      },
      null,
      2,
    ) + "\n",
  );
});
