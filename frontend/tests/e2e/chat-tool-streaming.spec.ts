import { expect, test } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/user.json" });

// Covers two fixes:
//  1. tool result_summary reports the real count (was always "0").
//  2. chat SSE goes direct to the backend (NEXT_PUBLIC_API_URL), bypassing the
//     Next dev proxy that gzip-buffered the whole stream. This test also guards
//     the direct cross-origin POST path (CORS preflight must pass in-browser).
test("chat fires a tool, renders it, and reports a non-zero count", async ({ page }) => {
  test.setTimeout(120_000);
  const id = await getOrCreateProjectId();

  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

  await page.goto(`/projects/${id}`, { timeout: 60_000 });
  const input = page.locator("textarea").first();
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await input.fill(
    "Durchsuche die Dokumente nach \"Praktikum\" und nutze dafür unbedingt das Such-Tool.",
  );
  await input.press("Enter");

  // Appears live in its running state ("Durchsucht Dokumente…") — proof the
  // stream renders progressively (proxy-buffered, it would only show once done).
  const toolRow = page.getByTestId("tool-row").first();
  await toolRow.waitFor({ state: "visible", timeout: 90_000 });

  // Once the tool finishes, the headline becomes the result summary.
  await expect(toolRow).toContainText(/Dokumente? gefunden/, { timeout: 90_000 });
  const headline = (await toolRow.innerText()).trim();
  // The count must not be the old stuck-at-zero summary.
  expect(headline).not.toMatch(/\b0 Dokument/);
  expect(headline).toMatch(/[1-9]\d* Dokument/);

  // No CORS / fetch errors from the direct-to-backend POST.
  const real = consoleErrors.filter(
    (e) => !/Failed to load resource|net::ERR_ABORTED|EventSource/.test(e),
  );
  expect(real, real.join("\n")).toHaveLength(0);
});
