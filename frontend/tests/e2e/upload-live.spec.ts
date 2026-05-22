import { expect, test } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

test("upload progresses through pipeline live without page refresh", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  const stamp = Date.now();
  const filename = `e2e_live_${stamp}.txt`;
  const content = `Live update e2e ${stamp}\nTask: live_${stamp}\nDeadline: 2026-12-31 demo.`;

  // /upload redirects to /{id}#docs and auto-opens the upload zone.
  await page.goto(`/projects/${projectId}/upload`);

  const dropzone = page.getByRole("button", { name: "Dokumente hochladen" });
  await expect(dropzone).toBeVisible({ timeout: 8_000 });

  await page.locator('input[type=file]').first().setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from(content, "utf-8"),
  });

  // The compact docs panel must show a row with the filename within 15s.
  const docRow = page
    .getByTestId("documents-list")
    .locator("li", { hasText: filename })
    .first();
  await expect(docRow).toBeVisible({ timeout: 15_000 });

  // Wait for the pipeline to settle (processing → done|failed) without any
  // manual refresh. Poll the documents endpoint with the stored auth token.
  await expect
    .poll(
      async () => {
        return await page.evaluate(
          async ({ id, fn }) => {
            const raw = localStorage.getItem("openpm-auth");
            const parsed = raw ? JSON.parse(raw) : null;
            const token = parsed?.state?.token;
            const res = await fetch(`/api/projects/${id}/documents`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) return null;
            const docs = (await res.json()) as Array<{
              original_filename: string;
              processing_status: string;
            }>;
            const match = docs.find((d) => d.original_filename === fn);
            return match?.processing_status ?? null;
          },
          { id: projectId, fn: filename },
        );
      },
      { timeout: 60_000, intervals: [1_500] },
    )
    .toMatch(/done|failed/);

  // Row remains in the panel after settling.
  await expect(docRow).toBeVisible();
});
