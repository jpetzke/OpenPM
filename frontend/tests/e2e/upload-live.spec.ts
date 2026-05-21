import { expect, test } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

test("upload progresses through pipeline live without page refresh", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  const stamp = Date.now();
  const filename = `e2e_live_${stamp}.txt`;
  const content = `Live update e2e ${stamp}\nTask: live_${stamp}\nDeadline: 2026-12-31 demo.`;

  await page.goto(`/projects/${projectId}/upload`);

  // DropZone must be present.
  const dropzone = page.getByRole("button", { name: "Dokumente hochladen" });
  await expect(dropzone).toBeVisible();

  // Drive the underlying file input (no real drag — equivalent code path).
  await page.locator('input[type=file]').first().setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from(content, "utf-8"),
  });

  const card = page.locator("article", { hasText: filename }).first();
  await expect(card).toBeVisible({ timeout: 5_000 });

  // While processing, the status row must reach an in-flight label at least
  // once. Pipeline step labels: parsing / LLM / Embeddings & Briefing.
  await expect(card).toContainText(/(Parsen|LLM|Embeddings & Briefing|eingereiht)/, {
    timeout: 8_000,
  });

  // Finally the card must show "fertig" without a manual refresh.
  await expect(card).toContainText("fertig", { timeout: 30_000 });

  // The live extraction panel reflects the new extraction.
  await expect(page.getByText("Letzte Extraktion")).toBeVisible();
});
