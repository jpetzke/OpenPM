/**
 * J/K/L smoke tests:
 *   J — BriefingPanel: token count badge + amber "gekürzt" pill
 *   K — Usage page: page loads, cost > 0, period selector, by-model + by-purpose tables;
 *        StatusPanel footer "Verbrauch heute" pill in cockpit
 *   L — DocumentsPanel rows render; format icons present; DropZone accept includes new types
 *
 * Target project: Erasmus (7a72567e-55c1-48b5-a270-4d7ef47856a4)
 *
 * Uses API-level auth injection to avoid button-click auth which breaks when the
 * Next.js dev overlay intercepts pointer events.
 */
import { expect, test } from "@playwright/test";
import * as path from "path";

const PROJECT_ID = "7a72567e-55c1-48b5-a270-4d7ef47856a4";
const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";
const EMAIL = process.env.E2E_USER_EMAIL ?? "demo@openmp.ai";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "passwort";

/** Inject JWT into localStorage via API call so no button clicks are needed. */
async function injectAuth(page: import("@playwright/test").Page) {
  const resp = await page.request.post(`${BACKEND_URL}/api/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  const body = await resp.json();
  const token = body.access_token as string;
  const user = body.user as object;
  // Navigate to root to establish origin, then inject auth into the "openpm-auth" key
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(({ tok, usr }) => {
    // OpenPM's authStore persists to localStorage under the key "openpm-auth"
    const state = { state: { user: usr, token: tok, hasHydrated: true } };
    localStorage.setItem("openpm-auth", JSON.stringify(state));
  }, { tok: token, usr: user });
}

/** Dismiss Next.js dev overlay if present by pressing Escape. */
async function dismissOverlay(page: import("@playwright/test").Page) {
  try {
    const dialog = page.locator('dialog:has-text("Build Error"), dialog:has-text("Module not found")');
    const count = await dialog.count();
    if (count > 0) {
      await page.keyboard.press("Escape");
    }
  } catch {
    // ignore — overlay wasn't there
  }
}

test.describe("Section J — Briefing panel", () => {
  test("token count badge and 'gekürzt' pill are visible", async ({ page }) => {
    await injectAuth(page);
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("load");
    await dismissOverlay(page);

    // Wait for the Briefing section header to appear
    await expect(page.getByText(/^Briefing$/i).first()).toBeVisible({ timeout: 15_000 });

    // Token count badge: matches e.g. "1269 Token"
    await expect(
      page.locator("span", { hasText: /\d+\s*Token/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Amber "gekürzt" pill
    await expect(
      page.locator("span", { hasText: /^gekürzt$/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Screenshot of cockpit with all panels
    await page.screenshot({
      path: path.join("test-results", "cockpit-jkl.png"),
      fullPage: false,
    });
  });
});

test.describe("Section K — Usage page and StatusPanel footer", () => {
  test("StatusPanel footer 'Verbrauch heute' pill visible in cockpit", async ({ page }) => {
    await injectAuth(page);
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("load");
    await dismissOverlay(page);

    // "Verbrauch heute" is rendered only when todayCost !== null (API returns usage)
    await expect(
      page.getByText(/Verbrauch heute/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("usage page loads with period selector, total cost card, by-model + by-purpose tables", async ({ page }) => {
    await injectAuth(page);
    await page.goto(`/projects/${PROJECT_ID}/usage`);
    await page.waitForLoadState("load");

    // Check if there's a Build Error (recharts missing in container)
    const hasBuildError = await page.locator('text="Module not found"').count();
    expect(
      hasBuildError,
      "BUG K-USAGE: Usage page fails with \"Module not found: Can't resolve 'recharts'\". " +
      "recharts@^3.8.1 is listed in package.json but is missing from the running container's node_modules. " +
      "Fix: run `npm install` inside the container or rebuild the image."
    ).toBe(0);

    // Page heading
    await expect(page.getByText(/Token-Verbrauch & Kosten/i)).toBeVisible({ timeout: 15_000 });

    // Period selector — "30 Tage" button must be present (default selection)
    await expect(page.getByRole("button", { name: "30 Tage" })).toBeVisible();

    // Wait for data to load (spinner disappears)
    await expect(page.getByText(/Lade Daten…/i)).not.toBeVisible({ timeout: 15_000 });

    // "Gesamtkosten" summary card must be present
    await expect(page.getByText("Gesamtkosten")).toBeVisible({ timeout: 10_000 });

    // By-model table heading
    await expect(page.getByText("Nach Modell")).toBeVisible();

    // By-purpose table heading
    await expect(page.getByText("Nach Zweck")).toBeVisible();

    // Screenshot of usage page
    await page.screenshot({
      path: path.join("test-results", "usage-jkl.png"),
      fullPage: false,
    });
  });

  test("usage page total cost > $0", async ({ page }) => {
    await injectAuth(page);
    await page.goto(`/projects/${PROJECT_ID}/usage`);
    await page.waitForLoadState("load");

    const hasBuildError = await page.locator('text="Module not found"').count();
    if (hasBuildError > 0) {
      // Already reported as bug in the sibling test — skip rather than double-fail
      test.skip(true, "recharts missing in container — see 'usage page loads' test for bug details");
      return;
    }

    // Wait for data to load
    await expect(page.getByText(/Lade Daten…/i)).not.toBeVisible({ timeout: 15_000 });

    // Cost value must not be $0.000000 — any non-zero $ amount in the Gesamtkosten card
    const costEl = page.locator("p.text-xl").first();
    await expect(costEl).toBeVisible({ timeout: 10_000 });
    const costText = await costEl.textContent();
    expect(costText).toMatch(/\$\d/);
    expect(costText).not.toBe("$0.000000");
  });
});

test.describe("Section L — Documents panel + DropZone accept", () => {
  test("DocumentsPanel rows render with at least one icon", async ({ page }) => {
    await injectAuth(page);
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("load");
    await dismissOverlay(page);

    // Wait for the documents list
    const docList = page.locator('[data-testid="documents-list"]');
    await expect(docList).toBeVisible({ timeout: 15_000 });

    // At least one document row
    const rows = docList.locator('[data-testid="document-row"]');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Each done row shows a lucide icon (svg) — just verify at least one svg in the list
    const svgs = docList.locator("svg");
    const svgCount = await svgs.count();
    expect(svgCount).toBeGreaterThan(0);
  });

  test("DropZone accept attribute includes .eml, .png, .jpg, .mp3", async ({ page }) => {
    await injectAuth(page);
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("load");
    await dismissOverlay(page);

    // Open the upload zone by clicking the "+" button in DocumentsPanel.
    // Use force:true to bypass the Next.js dev overlay (nextjs-portal) which can
    // intercept pointer events in dev mode.
    const uploadToggle = page.getByRole("button", { name: /Upload öffnen/i });
    await expect(uploadToggle).toBeVisible({ timeout: 10_000 });
    await uploadToggle.click({ force: true });

    // Wait a moment for the DropZone to render after toggle click
    await page.waitForTimeout(1000);

    // The DropZone's file input has `multiple` attribute (DocumentRow replace inputs don't).
    // Target the multiple input — this is the DropZone's actual picker.
    const dropZoneInput = page.locator('input[type="file"][multiple]').first();
    await expect(dropZoneInput).toBeAttached({ timeout: 8_000 });

    const accept = await dropZoneInput.getAttribute("accept");
    // Source code (DropZone.tsx:202) has the full list including .eml, .png, .jpg, .mp3.
    // If stale build is running in the container this assertion will fail — that is a real bug.
    expect(accept, `DropZone accept="${accept}" — expected .eml (BUG: container has stale DropZone build)`).toContain(".eml");
    expect(accept, `DropZone accept="${accept}" — expected .png`).toContain(".png");
    expect(accept, `DropZone accept="${accept}" — expected .jpg`).toContain(".jpg");
    expect(accept, `DropZone accept="${accept}" — expected .mp3`).toContain(".mp3");
  });
});
