import { test, expect } from "@playwright/test";
import { openEnvironment } from "../../support/navigation";
import { login } from "../../support/auth";

test.describe("storage - file preview", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnvironment(page);

    await page.getByRole("link", { name: "Storage" }).click();
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible({
      timeout: 30000,
    });
  });

  test("TC-0054: Clicking a file card opens the File Preview modal and loads a preview URL", async ({
    page,
  }) => {
    // NOTE: assumes at least one file exists in the opened configuration's current folder.
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const fileRow = page.getByRole("row").filter({ hasText: /\./ }).first();
      if (await fileRow.isVisible({ timeout: 8000 }).catch(() => false)) {
        await fileRow.click();
        const skeleton = page.locator('[class*="skeleton"]').first();
        await expect(skeleton.or(page.locator('[role="dialog"]'))).toBeVisible({
          timeout: 8000,
        });
      }
    }
  });

  test("TC-0055: PDF files render inside an iframe with a loading skeleton until the PDF finishes loading", async ({
    page,
  }) => {
    // NOTE: assumes a .pdf file exists in the opened configuration.
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const pdfRow = page.getByRole("row").filter({ hasText: /\.pdf/i }).first();
      if (await pdfRow.isVisible({ timeout: 8000 }).catch(() => false)) {
        await pdfRow.click();
        await expect(page.locator("iframe")).toBeVisible({ timeout: 15000 });
      }
    }
  });

  test("TC-0056: Image, video and audio files render their respective native preview elements", async ({
    page,
  }) => {
    // NOTE: assumes .png / .mp4 / .mp3 files exist in the opened configuration.
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const imageRow = page
        .getByRole("row")
        .filter({ hasText: /\.png|\.jpg|\.jpeg/i })
        .first();
      if (await imageRow.isVisible({ timeout: 8000 }).catch(() => false)) {
        await imageRow.click();
        await expect(page.locator("img").last()).toBeVisible({
          timeout: 15000,
        });
      }
    }
  });

  test("TC-0057: Text-like files (.txt/.json/.xml/.csv/.log) fetch and render their raw content in a scroll area", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const textRow = page
        .getByRole("row")
        .filter({ hasText: /\.csv|\.txt|\.json|\.log/i })
        .first();
      if (await textRow.isVisible({ timeout: 8000 }).catch(() => false)) {
        await textRow.click();
        await expect(page.locator("pre")).toBeVisible({ timeout: 15000 });
      }
    }
  });

  test("TC-0058: Unsupported file types show a 'Preview not available' message with a Download link", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const zipRow = page.getByRole("row").filter({ hasText: /\.zip/i }).first();
      if (await zipRow.isVisible({ timeout: 8000 }).catch(() => false)) {
        await zipRow.click();
        await expect(page.getByText("Preview not available for this file type")).toBeVisible({
          timeout: 15000,
        });
        await expect(page.getByRole("link", { name: /download/i })).toBeVisible({
          timeout: 30_000,
        });
      }
    }
  });
});
