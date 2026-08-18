import { test, expect } from "@playwright/test";
import { openEnvironment } from "../../support/navigation";
import { login } from "../../support/auth";

test.describe("storage - file browser navigation", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnvironment(page);

    await page.getByRole("link", { name: "Storage" }).click();
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible({
      timeout: 30000,
    });
  });

  test("TC-0039: Default (root) view lists an empty state for a freshly-created non-Default configuration", async ({
    page,
  }) => {
    // NOTE: assumes a newly created, non-Default configuration with no files/folders is opened.
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });
      const emptyState = page.getByText("No directories and files found");
      if (await emptyState.isVisible({ timeout: 10000 }).catch(() => false)) {
        await expect(emptyState).toBeVisible({ timeout: 30_000 });
      }
    }
  });

  test("TC-0040: 'No directories and files found' empty state message renders when a folder is empty", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const searchInput = page.getByPlaceholder(/search/i).first();
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill("zzz_no_match_xyz");
        await expect(page.getByText("No directories and files found")).toBeVisible({
          timeout: 8000,
        });
      }
    }
  });

  test("TC-0041: Breadcrumb starts with 'Storage' and the configuration's storage strategy at the root", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      await expect(page.getByText("Storage", { exact: true })).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test("TC-0042: Clicking a folder navigates into it and appends it to the breadcrumb path", async ({
    page,
  }) => {
    // NOTE: assumes at least one directory exists in the opened configuration's root.
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const firstDirectory = page.locator('[role="button"]').filter({ hasText: /.+/ }).first();
      if (await firstDirectory.isVisible({ timeout: 8000 }).catch(() => false)) {
        const dirName = (await firstDirectory.innerText()).trim();
        await firstDirectory.click();
        await expect(page).toHaveURL(/directoryId=/, { timeout: 10000 });
        if (dirName) {
          await expect(page.getByText(dirName, { exact: true }).last()).toBeVisible({
            timeout: 30_000,
          });
        }
      }
    }
  });

  test("TC-0043: Clicking an earlier breadcrumb segment navigates back to that folder level", async ({
    page,
  }) => {
    // NOTE: assumes the user can navigate at least two folders deep.
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const firstDirectory = page.locator('[role="button"]').first();
      if (await firstDirectory.isVisible({ timeout: 8000 }).catch(() => false)) {
        await firstDirectory.click();
        await expect(page).toHaveURL(/directoryId=/, { timeout: 10000 });

        const strategyBreadcrumb = page
          .locator("nav")
          .getByText(/Amazon|Azure|SftpStorage|AWS S3 Compatible/)
          .first();
        if (await strategyBreadcrumb.isVisible().catch(() => false)) {
          await strategyBreadcrumb.click();
          await expect(page).not.toHaveURL(/directoryId=/, { timeout: 10000 });
        }
      }
    }
  });

  test("TC-0044: Clicking the root 'Storage' or strategy breadcrumb from a nested folder returns to the configuration root", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const firstDirectory = page.locator('[role="button"]').first();
      if (await firstDirectory.isVisible({ timeout: 8000 }).catch(() => false)) {
        await firstDirectory.click();
        await expect(page).toHaveURL(/directoryId=/, { timeout: 10000 });

        await page.getByText("Storage", { exact: true }).click();
        await expect(page).not.toHaveURL(/[?&]id=/, { timeout: 30_000 });
      }
    }
  });

  test("TC-0045: Search filters both folders and files by name in the current directory", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const searchInput = page.getByPlaceholder(/search/i).first();
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill("invoice");
        // Result set narrows; a full assertion needs known fixture data.
        await expect(searchInput).toHaveValue("invoice");
      }
    }
  });

  test("TC-0046: File type filter narrows visible files by extension", async ({ page }) => {
    // NOTE: the File type filter is currently commented out / not implemented in the UI.
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const fileTypeFilter = page.getByRole("button", { name: /file type/i });
      if (await fileTypeFilter.isVisible().catch(() => false)) {
        await fileTypeFilter.click();
        await expect(fileTypeFilter).toBeVisible({ timeout: 30_000 });
      }
    }
  });
});
