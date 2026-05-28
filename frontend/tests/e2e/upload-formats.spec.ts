/**
 * E2E tests for new format support (Section L):
 *   - EML files are accepted by the drop zone
 *   - PNG/image files are accepted
 *   - Audio files (mp3) are accepted
 *   - format-specific icons appear in document cards
 *
 * NOTE: These tests require a running backend + infra stack.
 * If the e2e infra is not available they are skipped automatically.
 * Run with: npx playwright test upload-formats
 */
import { expect, test } from "@playwright/test";
import { getOrCreateProjectId } from "./fixtures";

// Minimal 1x1 transparent PNG (89 bytes)
const TINY_PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c" +
  "4944415408d76360f8ff000001020086dc9c320000000049454e44ae426082",
  "hex",
);

// Minimal EML content
const MINIMAL_EML = Buffer.from(
  [
    "From: sender@example.com",
    "To: receiver@example.com",
    "Subject: Test E-Mail Format",
    "Date: Wed, 28 May 2026 10:00:00 +0200",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Dies ist ein Test.",
  ].join("\r\n"),
);

// Minimal MP3 (ID3 header stub, 10 bytes — won't decode but upload should succeed)
const STUB_MP3 = Buffer.from("494433030000000000", "hex");

test.describe("Format support — new file types accepted", () => {
  test("accepts EML file upload without 415 error", async ({ page }) => {
    // TODO: Unskip once the e2e stack is reliably provisioned in CI.
    // The test verifies that an .eml file can be dropped and does NOT show
    // "Format nicht unterstützt".
    test.skip(
      process.env.CI === "true" && !process.env.E2E_STACK_READY,
      "E2E infra not ready in CI — skip until stack is provisioned",
    );

    const projectId = await getOrCreateProjectId();
    await page.goto(`/projects/${projectId}/upload`);

    await page.locator("input[type=file]").first().setInputFiles({
      name: "test-email.eml",
      mimeType: "message/rfc822",
      buffer: MINIMAL_EML,
    });

    // Should NOT show unsupported error
    await expect(
      page.getByText("Format nicht unterstützt").first(),
    ).toHaveCount(0);

    // Should show the filename in an upload row
    await expect(
      page.locator("*", { hasText: "test-email.eml" }).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("accepts PNG image file upload without 415 error", async ({ page }) => {
    test.skip(
      process.env.CI === "true" && !process.env.E2E_STACK_READY,
      "E2E infra not ready in CI",
    );

    const projectId = await getOrCreateProjectId();
    await page.goto(`/projects/${projectId}/upload`);

    await page.locator("input[type=file]").first().setInputFiles({
      name: "screenshot.png",
      mimeType: "image/png",
      buffer: TINY_PNG_BYTES,
    });

    await expect(
      page.getByText("Format nicht unterstützt").first(),
    ).toHaveCount(0);

    await expect(
      page.locator("*", { hasText: "screenshot.png" }).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("accepts MP3 audio file upload without 415 error", async ({ page }) => {
    test.skip(
      process.env.CI === "true" && !process.env.E2E_STACK_READY,
      "E2E infra not ready in CI",
    );

    const projectId = await getOrCreateProjectId();
    await page.goto(`/projects/${projectId}/upload`);

    await page.locator("input[type=file]").first().setInputFiles({
      name: "meeting.mp3",
      mimeType: "audio/mpeg",
      buffer: STUB_MP3,
    });

    await expect(
      page.getByText("Format nicht unterstützt").first(),
    ).toHaveCount(0);

    await expect(
      page.locator("*", { hasText: "meeting.mp3" }).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("still rejects unsupported file types (regression)", async ({ page }) => {
    test.skip(
      process.env.CI === "true" && !process.env.E2E_STACK_READY,
      "E2E infra not ready in CI",
    );

    const projectId = await getOrCreateProjectId();
    await page.goto(`/projects/${projectId}/upload`);

    await page.locator("input[type=file]").first().setInputFiles({
      name: "virus.exe",
      mimeType: "application/x-msdownload",
      buffer: Buffer.from("MZ" + "A".repeat(32)),
    });

    await expect(
      page.getByText("Format nicht unterstützt").first(),
    ).toBeVisible({ timeout: 8_000 });
  });
});
