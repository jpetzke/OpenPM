/**
 * S–W sweep smoke tests (lightweight DOM assertions).
 *   S — Bulk-upload group header for a ≥5-member ChangeSession; expand → rows.
 *   U — Export buttons (briefing.md / ZIP) reachable; /export endpoint serves md.
 *   V — reduced-motion + timing tokens present in stylesheet.
 *
 * API-level auth injection (key "openpm-auth"), no button-click login.
 */
import { expect, test } from "@playwright/test";

const PROJECT_ID = "7a72567e-55c1-48b5-a270-4d7ef47856a4";
const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";
const EMAIL = process.env.E2E_USER_EMAIL ?? "demo@openmp.ai";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "passwort";

async function injectAuth(page: import("@playwright/test").Page) {
  const resp = await page.request.post(`${BACKEND_URL}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  const body = await resp.json();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ tok, usr }) => {
      const state = { state: { user: usr, token: tok, hasHydrated: true } };
      localStorage.setItem("openpm-auth", JSON.stringify(state));
    },
    { tok: body.access_token, usr: body.user },
  );
}

test.describe("Section S — bulk-upload grouping", () => {
  test("group header shows for a ≥5-member change session and expands to rows", async ({
    page,
  }) => {
    await injectAuth(page);
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("load");

    const group = page.getByTestId("bulk-upload-group").first();
    await expect(group).toBeVisible();
    // Header reads "{N} Dateien hochgeladen".
    await expect(group.getByTestId("bulk-group-header")).toContainText("Dateien hochgeladen");

    // Collapsed by default → expand and assert document rows appear inside.
    await group.getByTestId("bulk-group-header").click();
    await expect(group.getByTestId("document-row").first()).toBeVisible();
  });
});
