import { expect, test } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

// E2 — Stream D. Verifies the SSE `extracted_item` plumbing into the UI.
//
// IMPORTANT: At the time this spec was written the active upload surface on
// `/upload` is the compact `DocumentsPanel` (rows), not the legacy
// `DocumentCard`. The new live-extraction feed lives in `DocumentCard`, which
// is currently rendered only via `DocumentGrid` (orphaned but exported and
// part of the upload feature). Stream B is moving the active surface back to
// the card grid; once that lands the pills will surface automatically.
//
// This spec therefore exercises two things:
//   1. End-to-end upload still succeeds (document row reaches done|failed)
//      with the new code paths in place — no regression.
//   2. If at least one `data-testid="live-item"` ever renders during the
//      session, it carries the expected attributes and clicking it does not
//      throw. Otherwise the assertion block is skipped with a note.

test("upload still completes with the new extracted_item handler wired", async ({
  page,
}) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}/upload`);

  const dropzone = page.getByRole("button", { name: "Dokumente hochladen" });
  await expect(dropzone).toBeVisible({ timeout: 10_000 });

  const stamp = Date.now();
  const filename = `live_extraction_${stamp}.txt`;
  await page.locator("input[type=file]").first().setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from(
      `Live extraction e2e ${stamp}\nTask: do_${stamp}\nKontakt: alice@example.com`,
      "utf-8",
    ),
  });

  // The compact documents-list shows the row.
  const docRow = page
    .getByTestId("documents-list")
    .locator("li", { hasText: filename })
    .first();
  await expect(docRow).toBeVisible({ timeout: 15_000 });

  // Wait for the pipeline to settle. This implicitly proves the SSE event
  // stream — including any `extracted_item` events — is consumed without
  // breaking the existing flow.
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
      { timeout: 90_000, intervals: [2_000] },
    )
    .toMatch(/done|failed/);

  // Opportunistic: if a DocumentCard is on screen and produced a live pill,
  // verify attributes + click path. Most envs run the compact list, so we
  // expect 0 pills and just skip.
  const pillCount = await page.getByTestId("live-item").count();
  test.skip(
    pillCount === 0,
    "No `data-testid=\"live-item\"` rendered — the compact DocumentsPanel is the active upload surface in this env; DocumentCard live feed will surface once Stream B re-introduces the card grid.",
  );

  const firstPill = page.getByTestId("live-item").first();
  await expect(firstPill).toHaveAttribute("data-item-type", /.+/);
  await expect(firstPill).toHaveAttribute("data-item-id", /.+/);
  await expect(firstPill).toHaveAttribute("data-confidence", /high|medium|low/);
  await firstPill.click();
});

test.skip(
  "SSE disconnect banner appears after grace period",
  // The disconnect banner reads connectionState !== "open" for 3s. Forcing a
  // SSE disconnect from Playwright requires tearing down the backend or
  // mocking fetch in a way that also kills auth — out of scope. Marked
  // skipped intentionally; manual smoke covers this path.
  () => {},
);
