import { defineConfig } from "vitest/config";
export default defineConfig({
  base: process.env.BASE_PATH || "./",
  // The light of real places (HDRI, Radiance .hdr), inlined like the pictures (`src/engine/lifelike.ts`).
  assetsInclude: ["**/*.hdr", "**/*.glb"],
  test: { include: ["tests/**/*.test.ts"] },
});
