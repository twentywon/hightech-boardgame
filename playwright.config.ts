import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  // Software WebGL rendering in cloud can make the complete multi-step flow exceed 30s.
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4174",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: [
        "--no-sandbox",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    // Phones play in landscape (a phone held upright is asked to turn).
    { name: "mobile", use: { ...devices["Pixel 7 landscape"] } },
  ],
});
