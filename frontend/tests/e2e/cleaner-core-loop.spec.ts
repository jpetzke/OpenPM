import { expect, test } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("cleaner core loop (WS1 settings + WS2 cockpit)", () => {
  test("dead legacy routes are gone (no redirect page)", async ({ page }) => {
    const id = await getOrCreateProjectId();
    // These routes were deleted — Next should 404, not render a redirect shell.
    const resp = await page.goto(`/projects/${id}/upload`, { timeout: 60_000 });
    expect(resp?.status()).toBe(404);
  });

  test("settings gear opens the project settings modal", async ({ page }) => {
    const id = await getOrCreateProjectId();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page.goto(`/projects/${id}`, { timeout: 60_000 });
    const gear = page.getByTestId("project-settings-button");
    await gear.waitFor({ state: "visible", timeout: 30_000 });
    await gear.click();

    const dialog = page.getByRole("dialog", { name: "Projekteinstellungen" });
    await expect(dialog).toBeVisible();
    // custom-instructions textarea present
    await expect(dialog.getByPlaceholder(/Antworte immer auf Englisch/)).toBeVisible();

    // ignore benign SSE/network noise; fail only on real React/runtime errors
    const real = errors.filter(
      (e) => !/Failed to load resource|net::ERR|EventSource|SSE/.test(e),
    );
    expect(real, real.join("\n")).toHaveLength(0);
  });

  test("briefing panel is collapsed by default and expands on click", async ({ page }) => {
    const id = await getOrCreateProjectId();
    await page.goto(`/projects/${id}`, { timeout: 60_000 });

    const toggle = page.getByRole("button", { name: "Briefing aufklappen" });
    await toggle.waitFor({ state: "visible", timeout: 30_000 });
    // collapsed → expand
    await toggle.click();
    await expect(
      page.getByRole("button", { name: "Briefing zuklappen" }),
    ).toBeVisible();
  });
});
