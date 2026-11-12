import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  // Software WebGL rendering in cloud can make the complete multi-step flow exceed 30s.
  timeout: 60000,
  // Spec files run side by side (tests inside one file still run in order). One at a time took 40 minutes;
  // PW_WORKERS=1 goes back to that when a failure has to be told apart from a crowded machine.
  fullyParallel: false,
  workers: Number(process.env.PW_WORKERS) || 3,
  // Tests that measure timing (@alone) run only when nothing runs beside them: `npm run e2e` does both passes.
  grepInvert: Number(process.env.PW_WORKERS) === 1 ? undefined : /@alone/,
  // Software WebGL under load can be late once; a real failure fails twice.
  retries: 1,
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
