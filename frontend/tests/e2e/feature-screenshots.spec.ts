import { test, expect } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

// Screenshot harness for the 6 cockpit features. These drive the real app and
// seed live pipeline state via the dev-exposed store where a real upload would
// be too timing-dependent to capture mid-flight.

test("F1 pipeline strip", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(600);

  await page.evaluate((pid) => {
    const w = window as unknown as { __pipelineStore?: { getState: () => Record<string, (...a: unknown[]) => void> } };
    const st = w.__pipelineStore?.getState();
    if (!st) return;
    const doc = "demo-strip-doc";
    st.setPipelineStatus(doc, "processing", pid);
    st.recordDocName(doc, "Kickoff-Protokoll.pdf");
    st.pushPipelineEvent(
      doc,
      {
        step: 4,
        total: 9,
        label: "state_merge",
        status: "running",
        detail: "Mit Projektstatus zusammenführen",
        timestamp: new Date().toISOString(),
      },
      pid,
    );
  }, projectId);

  await expect(page.getByTestId("pipeline-strip")).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "test-results/f1-pipeline-strip.png", fullPage: false });
});

test("F2 glance cards", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/f2-glance-cards.png", fullPage: false });
  // Tight crop of the status panel.
  const panel = page.getByText("Offene Tasks").locator("..").locator("..").locator("..");
  await panel.screenshot({ path: "test-results/f2-glance-cards-crop.png" }).catch(() => {});
});

test("F3 kinetic briefing", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Vollständiges Briefing anzeigen/i }).click();
  await page.waitForTimeout(1100); // let the staggered reveal settle
  await page.screenshot({ path: "test-results/f3-briefing-modal.png", fullPage: false });
});

test("F4 diff timeline", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Vollständigen Status anzeigen/i }).click();
  await page.waitForTimeout(700);
  // Scroll the modal to the change history.
  await page.getByText("Verlauf der Änderungen").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/f4-timeline.png", fullPage: false });
  // Open the diff for the most recent version.
  await page.locator("ol li button").first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "test-results/f4-diff-modal.png", fullPage: false });
});

test("F6 command palette", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
  await page.keyboard.press("ControlOrMeta+k");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/f6-command-palette.png", fullPage: false });
  // And a filtered view.
  await page.keyboard.type("doc");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/f6-command-palette-filtered.png", fullPage: false });
});

test("chat markdown renders (GFM table via /help)", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);

  const input = page.locator("textarea").first();
  await input.click();
  await input.fill("/help");
  await page.keyboard.press("Enter");
  // The slash popover may capture the first Enter to select the command.
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");

  // A real <table> must now exist in the rendered assistant message.
  await expect(page.locator("table thead th").first()).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/chat-markdown.png", fullPage: false });
});
