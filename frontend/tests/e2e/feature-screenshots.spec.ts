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
