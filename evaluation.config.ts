import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/ai-evaluation.ts", "tests/ai-performance.ts"],
    fileParallelism: false,
    testTimeout: 600000,
  },
});
