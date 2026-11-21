import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/reversi-evaluation.ts", "tests/reversi-performance.ts"],
    fileParallelism: false,
    testTimeout: 600000,
  },
});
