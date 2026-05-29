/**
 * M–R sweep smoke tests (lightweight DOM assertions).
 *   M — Sidebar: collapse toggle, New-Project modal; /onboarding reachable
 *   N — page-level paste handler present (compile-only; clipboard perms flaky)
 *   O — Slash-command popover + local-command message
 *   P — keyboard shortcuts (Cmd+B sidebar toggle, Cmd+N new chat)
 *   Q — refresh-token silent flow (presence of refresh on login response)
 *   R — Browser-notification opt-in button in settings
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

test.describe("Section M — sidebar + onboarding", () => {
  test("sidebar lists project and New-Project modal opens", async ({ page }) => {
    await injectAuth(page);
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("load");

    // "+ Neues Projekt" button opens a modal
    const newBtn = page.getByRole("button", { name: /Neues Projekt/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 15_000 });
    await newBtn.click();
    // modal with the project-name input
    await expect(page.getByPlaceholder(/Projektname/i)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
  });

  test("/onboarding route renders the wizard", async ({ page }) => {
    await injectAuth(page);
    await page.goto(`/onboarding`);
    await page.waitForLoadState("load");
    // Stepper / provider step text
    await expect(page.getByText(/Provider|Verbindung|Schritt|Onboarding/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("Section P — keyboard navigation", () => {
  test("Cmd/Ctrl+/ opens the shortcuts cheat-sheet", async ({ page }) => {
    await injectAuth(page);
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("load");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+/");
    await expect(page.getByText(/^Tastenkürzel$/).first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
  });

  test("Cmd/Ctrl+K opens the command palette", async ({ page }) => {
    await injectAuth(page);
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("load");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+k");
    await expect(page.getByPlaceholder(/Projekte, Chats, Dokumente/i)).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press("Escape");
  });

  test("Cmd/Ctrl+B toggles the sidebar", async ({ page }) => {
    await injectAuth(page);
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("load");
    const toggle = page.getByRole("button", { name: /Sidebar (ein|aus)klappen/i }).first();
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    const before = await toggle.getAttribute("aria-label");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+b");
    await expect(async () => {
      const after = await toggle.getAttribute("aria-label");
      expect(after).not.toEqual(before);
    }).toPass({ timeout: 5_000 });
  });
});

test.describe("Section Q — auth lifecycle", () => {
  test("UI login persists a refresh token in authStore", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.getByRole("button", { name: /Anmelden/i }).first().click();
    // After login we leave /login
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 });
    const stored = await page.evaluate(() => localStorage.getItem("openpm-auth"));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored as string);
    expect(parsed.state.token).toBeTruthy();
    expect(parsed.state.refreshToken).toBeTruthy();
  });

  test("/api/auth/refresh issues a fresh access token", async ({ page }) => {
    const login = await page.request.post(`${BACKEND_URL}/api/auth/login`, {
      data: { email: EMAIL, password: PASSWORD },
    });
    const { refresh_token } = await login.json();
    const refreshed = await page.request.post(`${BACKEND_URL}/api/auth/refresh`, {
      data: { refresh_token },
    });
    expect(refreshed.ok()).toBeTruthy();
    const body = await refreshed.json();
    expect(body.access_token).toBeTruthy();
  });
});

test.describe("Section O — slash commands", () => {
  test("typing /help opens popover and Enter renders a local message", async ({ page }) => {
    await injectAuth(page);
    await page.goto(`/projects/${PROJECT_ID}`);
    await page.waitForLoadState("load");

    const ta = page.locator("textarea").first();
    await expect(ta).toBeVisible({ timeout: 15_000 });
    await ta.click();
    // Typing just "/" lists all commands in the popover
    await ta.pressSequentially("/");
    await expect(page.getByRole("listbox", { name: /Slash-Befehle/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("/status").first()).toBeVisible();

    // Narrow to /help and execute
    await ta.pressSequentially("help");
    await expect(page.getByText("/help").first()).toBeVisible();
    await ta.press("Enter");
    // Local-command marker subline
    await expect(page.getByText(/lokal · 0 Token/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
