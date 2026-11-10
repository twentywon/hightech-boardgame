import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/chess-performance.ts"],
    testTimeout: 90000,
    fileParallelism: false,
  },
});
