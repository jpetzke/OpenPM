import { expect, test } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

test("delete-with-undo: row disappears, undo restores it", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  const stamp = Date.now();
  const filename = `e2e_delete_${stamp}.txt`;

  // /upload redirects into cockpit with the upload zone open.
  await page.goto(`/projects/${projectId}/upload`);
  await expect(
    page.getByRole("button", { name: "Dokumente hochladen" }),
  ).toBeVisible({ timeout: 8_000 });

  await page.locator('input[type=file]').first().setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from(`Delete e2e ${stamp}. Task: t. Deadline: 2026-12-31.`),
  });

  const row = page
    .getByTestId("documents-list")
    .locator("li", { hasText: filename })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });

  // Hover to reveal the delete button, then click it.
  await row.hover();
  await row.getByRole("button", { name: "Dokument löschen" }).click();

  // Row vanishes from the panel.
  await expect(
    page.getByTestId("documents-list").locator("li", { hasText: filename }),
  ).toHaveCount(0, { timeout: 5_000 });

  // Undo via toast brings it back.
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(
    page.getByTestId("documents-list").locator("li", { hasText: filename }),
  ).toHaveCount(1, { timeout: 5_000 });
});
