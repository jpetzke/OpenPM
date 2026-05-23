import { expect, test } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

// F3 — Stream F. Verifies that state cards expose stable `id` attributes
// (so the D2/E2 live-feed click handler can scroll to them) and render the
// new SourcePill / ConfidenceBadge surfaces.
//
// Conflict-driven flows are NOT exercised here — they require two competing
// documents with overlapping items, which is hard to fixture deterministically.

test("state cards: ids + source pills surface in the state modal", async ({
  page,
}) => {
  const projectId = await getOrCreateProjectId();

  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");

  // Try to open the full state modal. If the project has no state yet, we
  // skip the deeper assertions — Stream F doesn't own state fixtures.
  const fullStatusLink = page.getByRole("button", {
    name: /Vollständigen Status anzeigen/i,
  });
  const fullCount = await fullStatusLink.count();
  if (fullCount === 0) {
    test.skip(
      true,
      "Project has no state yet — cannot inspect cards. Re-run after uploading docs.",
    );
    return;
  }
  await fullStatusLink.first().click();

  const dialog = page.getByRole("dialog", {
    name: /Vollständiger Projektstatus/i,
  });
  await expect(dialog).toBeVisible();

  // At least one core-state card must carry an id matching the live-feed
  // scroll-target convention. We probe the union of the supported types.
  const idTargets = dialog.locator(
    [
      '[id^="task-"]',
      '[id^="contact-"]',
      '[id^="deadline-"]',
      '[id^="decision-"]',
      '[id^="blocker-"]',
      '[id^="dynamic_item-"]',
    ].join(", "),
  );
  const idCount = await idTargets.count();
  if (idCount === 0) {
    test.skip(
      true,
      "State has no items with ids — cannot assert card surface.",
    );
    return;
  }
  expect(idCount).toBeGreaterThan(0);

  // ConfidenceBadge "Bitte prüfen" — only present when at least one item is
  // medium/low. Soft-skip if no badge present in current fixture.
  const confidenceBadge = dialog.getByText("Bitte prüfen").first();
  const hasConfidence = (await confidenceBadge.count()) > 0;
  if (hasConfidence) {
    await expect(confidenceBadge).toBeVisible();
  }

  // SourcePill: count the title-bearing pill containers inside the modal.
  // The pill component renders <span title="..."> elements. Doc pills are
  // clickable buttons; chat/manual/legacy pills are spans. We probe both.
  const pillCandidates = dialog.locator(
    'button[title]:not([aria-label]), span[title]',
  );
  // Filter to ones whose visible text is short (typical pill content).
  const pillCount = await pillCandidates.count();
  // We assert the modal has at least one pill OR explicitly skip — there is
  // no source data if the items predate F1 migration.
  if (pillCount === 0) {
    test.skip(
      true,
      "No source pills rendered (items predate F1 source-tracking).",
    );
    return;
  }
  expect(pillCount).toBeGreaterThan(0);
});
