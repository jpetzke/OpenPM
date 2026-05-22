import { test } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

test("screenshot landing", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/cockpit-landing.png", fullPage: false });
});

test("screenshot conversation", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
  // Click first suggestion to enter conversation mode
  await page.getByText("Was sind die offenen Tasks?").click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/cockpit-conversation.png", fullPage: false });
});

test("screenshot docs open", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");
  await page.getByRole("button", { name: /Upload öffnen/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/cockpit-docs-open.png", fullPage: false });
});
