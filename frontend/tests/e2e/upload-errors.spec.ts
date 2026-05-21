import { expect, test } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getOrCreateProjectId } from "./fixtures";

test("rejects unsupported file type with an inline error row", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}/upload`);

  await page.locator('input[type=file]').first().setInputFiles({
    name: "trojan.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("MZ" + "A".repeat(64)),
  });

  // DropZone shows the filename + "Format nicht unterstützt" inline.
  await expect(page.getByText("Format nicht unterstützt").first()).toBeVisible({
    timeout: 8_000,
  });

  // No document card created.
  await expect(page.locator("article", { hasText: "trojan.exe" })).toHaveCount(0);
});

test("rejects oversized file with a toast", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}/upload`);

  // Playwright limits in-memory setInputFiles buffers to 50 MB. Write a 51 MB
  // file to disk and reference it by path so the size check still trips.
  const dir = mkdtempSync(join(tmpdir(), "e2e-huge-"));
  const huge = join(dir, "huge.txt");
  writeFileSync(huge, Buffer.alloc(51 * 1024 * 1024, "A"));

  await page.locator('input[type=file]').first().setInputFiles(huge);

  // DropZone fires a sonner toast: "<name>: zu groß (max. 50 MB)".
  await expect(page.getByText(/zu groß/i).first()).toBeVisible({ timeout: 8_000 });
});
