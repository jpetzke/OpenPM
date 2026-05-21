import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";
const LOCAL_CHROMIUM =
  process.env.E2E_CHROMIUM_PATH ??
  "/home/jonas/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    extraHTTPHeaders: {
      "X-E2E-Backend": BACKEND_URL,
    },
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { executablePath: LOCAL_CHROMIUM },
      },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/user.json",
        launchOptions: { executablePath: LOCAL_CHROMIUM },
      },
    },
  ],
});
