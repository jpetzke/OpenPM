import { expect, test as setup } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const STATE_PATH = "tests/e2e/.auth/user.json";

const EMAIL = process.env.E2E_USER_EMAIL ?? "demo@openmp.ai";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "passwort";

setup("authenticate demo user", async ({ page }) => {
  mkdirSync(dirname(STATE_PATH), { recursive: true });

  // Login page can take 15+s on first compile under Turbopack dev — give it room.
  await page.goto("/login", { timeout: 60_000 });
  const email = page.locator('input[type=email]');
  await email.waitFor({ state: "visible", timeout: 30_000 });
  await email.fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/projects/, { timeout: 30_000 });

  await page.context().storageState({ path: STATE_PATH });
});
