import { expect, test } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

test("cockpit: 3-column layout renders with chat input and right panels", async ({ page }) => {
  const projectId = await getOrCreateProjectId();

  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");

  // No tab bar / nav with old route labels
  await expect(page.locator("nav").filter({ hasText: "Upload" })).not.toBeVisible();
  await expect(page.locator("nav").filter({ hasText: "State" })).not.toBeVisible();

  // Chat input is present at the bottom of the center column
  const chatInput = page.locator("textarea").first();
  await expect(chatInput).toBeVisible();

  // Right panels visible
  await expect(page.getByText(/Status$/i).first()).toBeVisible();
  await expect(page.getByText(/Dokumente · \d+/i)).toBeVisible();
  await expect(page.getByText(/Briefing/i).first()).toBeVisible();
});

test("cockpit: old upload route redirects to cockpit", async ({ page }) => {
  const projectId = await getOrCreateProjectId();

  await page.goto(`/projects/${projectId}/upload`);
  await page.waitForLoadState("load");

  // Should end up on cockpit page
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));

  // Chat input must still be visible (confirms cockpit rendered)
  await expect(page.locator("textarea").first()).toBeVisible();
});

test("cockpit: landing view shows suggestions and recent chats", async ({ page }) => {
  const projectId = await getOrCreateProjectId();

  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");

  // Suggestion cards
  await expect(page.getByText("Was sind die offenen Tasks?")).toBeVisible();
  await expect(page.getByText("Welche Deadlines stehen an?")).toBeVisible();
  await expect(page.getByText("Fasse den aktuellen Status zusammen")).toBeVisible();

  // Letzte Chats heading present
  await expect(page.getByText("Letzte Chats")).toBeVisible();
});

test("cockpit: documents panel exposes upload toggle", async ({ page }) => {
  const projectId = await getOrCreateProjectId();

  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");

  // The "+" button next to "Dokumente · N"
  const uploadToggle = page.getByRole("button", { name: /Upload öffnen/i });
  await expect(uploadToggle).toBeVisible();

  // Clicking it reveals the DropZone
  await uploadToggle.click();
  await expect(
    page.getByRole("button", { name: "Dokumente hochladen" }),
  ).toBeVisible();
});

test("cockpit: status panel opens state detail view", async ({ page }) => {
  const projectId = await getOrCreateProjectId();

  await page.goto(`/projects/${projectId}`);
  await page.waitForLoadState("load");

  // The status panel is on the right column. If the project has state, a
  // "Vollständigen Status anzeigen →" link is shown. If not, the "Status"
  // header itself is the trigger but disabled. We probe both paths.
  const fullStatusLink = page.getByRole("button", {
    name: /Vollständigen Status anzeigen/i,
  });
  const statusHeader = page.getByRole("button", {
    name: /Vollständigen Status öffnen|^Status$/i,
  });

  const fullCount = await fullStatusLink.count();
  if (fullCount > 0) {
    await fullStatusLink.first().click();
  } else {
    // No state yet — the header button is disabled. Just assert the panel
    // is rendered so the test still verifies wiring.
    await expect(statusHeader.first()).toBeVisible();
    return;
  }

  // Modal is visible
  const dialog = page.getByRole("dialog", {
    name: /Vollständiger Projektstatus/i,
  });
  await expect(dialog).toBeVisible();

  // Close via the X button
  await dialog.getByRole("button", { name: "Schließen" }).click();
  await expect(dialog).not.toBeVisible();
});
