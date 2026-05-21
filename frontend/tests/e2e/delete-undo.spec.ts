import { expect, test } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

test("delete-with-undo: card disappears, undo restores it", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  const stamp = Date.now();
  const filename = `e2e_delete_${stamp}.txt`;

  await page.goto(`/projects/${projectId}/upload`);
  await page.locator('input[type=file]').first().setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from(`Delete e2e ${stamp}. Task: t. Deadline: 2026-12-31.`),
  });

  const card = page.locator("article", { hasText: filename }).first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  // Wait for processing to settle so reprocess buttons exist.
  await expect(card).toContainText("fertig", { timeout: 30_000 });

  await card.getByRole("button", { name: "Dokument löschen" }).click();

  // Card vanishes from DOM.
  await expect(
    page.locator("article", { hasText: filename }),
  ).toHaveCount(0, { timeout: 2_000 });

  // Undo toast restores the card.
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(
    page.locator("article", { hasText: filename }),
  ).toHaveCount(1, { timeout: 5_000 });
});
