/**
 * Minimal Playwright config for J/K/L smoke tests only.
 * Uses stored auth state directly — no login setup step needed.
 */
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const LOCAL_CHROMIUM =
  process.env.E2E_CHROMIUM_PATH ??
  "/home/jonas/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/jkl-smoke.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/user.json",
        launchOptions: { executablePath: LOCAL_CHROMIUM },
      },
    },
  ],
});
