import { expect, test } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

test("replace doc: kebab → Ersetzen → diff modal → confirm → toast", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  const stamp = Date.now();
  const filename = `e2e_replace_v1_${stamp}.txt`;
  const filenameV2 = `e2e_replace_v2_${stamp}.txt`;

  await page.goto(`/projects/${projectId}/upload`);
  await expect(
    page.getByRole("button", { name: "Dokumente hochladen" }),
  ).toBeVisible({ timeout: 8_000 });

  await page.locator('input[type=file]').first().setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from(`V1 document ${stamp}. Task: initial task.`),
  });

  const row = page
    .getByTestId("documents-list")
    .locator("li", { hasText: filename })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });

  await row.hover();
  await row.getByRole("button", { name: "Weitere Aktionen" }).click();

  const ersetzen = page.getByRole("button", { name: "Ersetzen…" });
  await expect(ersetzen).toBeVisible({ timeout: 3_000 });

  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    ersetzen.click(),
  ]);

  await fileChooser.setFiles({
    name: filenameV2,
    mimeType: "text/plain",
    buffer: Buffer.from(`V2 document ${stamp}. Task: updated task.`),
  });

  await expect(
    page.getByRole("heading", { name: "Vorschau der Änderungen" }),
  ).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Ersetzen bestätigen" }).click();

  await expect(
    page.getByRole("heading", { name: "Vorschau der Änderungen" }),
  ).toHaveCount(0, { timeout: 5_000 });

  await expect(page.getByText("Dokument ersetzt").first()).toBeVisible({ timeout: 10_000 });
});
