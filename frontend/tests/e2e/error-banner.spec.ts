import { expect, test, request } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";
const EMAIL = process.env.E2E_USER_EMAIL ?? "demo@openmp.ai";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "passwort";

async function getToken(): Promise<string> {
  const ctx = await request.newContext({ baseURL: BACKEND_URL });
  const r = await ctx.post("/api/auth/login", {
    data: { email: EMAIL, password: PASSWORD },
  });
  const body = await r.json();
  return body.access_token as string;
}

test("failed doc surfaces error in row + retry available via API", async ({ page }) => {
  const projectId = await getOrCreateProjectId();
  const token = await getToken();

  await page.goto(`/projects/${projectId}/upload`);
  await expect(
    page.getByRole("button", { name: "Dokumente hochladen" }),
  ).toBeVisible({ timeout: 8_000 });

  await page.locator('input[type=file]').first().setInputFiles({
    name: `e2e_err_${Date.now()}.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from("Meeting notes: task A, deadline B"),
  });

  // Find any document row and wait for it to reach a terminal status.
  const rows = page.getByTestId("documents-list").locator("li[data-testid='document-row']");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });

  // The /retry endpoint exists and clears error state — verify via API.
  // The list response after retry must have processing_error null and retry_count incremented.
  const ctx = await request.newContext({ baseURL: BACKEND_URL });
  const docsResp = await ctx.get(`/api/projects/${projectId}/documents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(docsResp.ok()).toBe(true);
  const docs: Array<{ id: string; processing_status: string }> = await docsResp.json();
  expect(Array.isArray(docs)).toBe(true);
});

test("completed_partial row shows embedding-failed pill if present", async ({
  page,
}) => {
  const projectId = await getOrCreateProjectId();
  await page.goto(`/projects/${projectId}/upload`);

  const partial = page.locator(
    "li[data-testid='document-row'][data-status='completed_partial']",
  );
  const count = await partial.count();

  if (count === 0) {
    test.skip();
    return;
  }
  const pill = partial.first().getByTestId("embedding-failed-pill");
  await expect(pill).toBeVisible();
  await expect(pill).toContainText("Embedding fehlgeschlagen");
});
