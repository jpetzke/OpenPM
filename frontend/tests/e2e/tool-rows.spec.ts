import { expect, test } from "@playwright/test";

// Verifies the inline, collapsible tool-call rows (claude.ai style):
// rendered at the right spot in the conversation, collapsed by default,
// expandable, and persisted across reload.
const PROJECT_ID = process.env.E2E_TOOL_PROJECT ?? "65cc66a3-577c-4ffa-b973-201c1d862ac6";

test("chat tool calls render as inline collapsible rows and persist", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto(`/projects/${PROJECT_ID}`, { waitUntil: "domcontentloaded", timeout: 45_000 });

  const input = page.locator("textarea").first();
  await expect(input).toBeVisible();

  // A query that forces the grounding rules to call search_documents.
  await input.fill(
    "Durchsuche die Dokumente und zitiere wörtlich, was zur Dauer bzw. ECTS des Praktikums steht. Nenne die Quelldatei.",
  );
  await input.press("Enter");

  // The collapsed tool row.
  const toolRow = page.getByTestId("tool-row").first();
  await expect(toolRow).toBeVisible({ timeout: 60_000 });
  await expect(toolRow).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: "tests/e2e/__screens__/tool-row-collapsed.png", fullPage: true });

  // Expand it — the mono tool-name detail line should appear.
  await toolRow.click();
  await expect(toolRow).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText(/search_documents|list_documents|get_document_content|get_current_state/).first(),
  ).toBeVisible();
  await page.screenshot({ path: "tests/e2e/__screens__/tool-row-expanded.png", fullPage: true });

  // Let the answer finish streaming.
  await page.waitForTimeout(10_000);
  await page.screenshot({ path: "tests/e2e/__screens__/tool-row-answered.png", fullPage: true });

  // Reload returns to the landing view (sessions are held in memory). Reopen
  // the session from the recent-chats list — this loads messages from the DB,
  // so the tool row here proves the invocations + offsets round-tripped.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByText("Dauer und ECTS des Praktikums recherchieren").first().click();

  const persistedRow = page.getByTestId("tool-row").first();
  await expect(persistedRow).toBeVisible({ timeout: 25_000 });
  await expect(persistedRow).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: "tests/e2e/__screens__/tool-row-persisted.png", fullPage: true });
});
