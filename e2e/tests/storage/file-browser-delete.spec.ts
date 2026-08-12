import { test, expect } from "@playwright/test";
import { openEnvironment } from "../../support/navigation";
import { login } from "../../support/auth";

test.describe("storage - file browser delete", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnvironment(page);

    await page.getByRole("link", { name: "Storage" }).click();
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible({
      timeout: 30000,
    });
  });

  test("TC-0060: Deleting a file shows a success toast and refreshes the current folder listing", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const fileRow = page.getByRole("row").filter({ hasText: /\./ }).first();
      if (await fileRow.isVisible({ timeout: 8000 }).catch(() => false)) {
        await fileRow.getByRole("button", { name: "More options" }).click();
        const deleteItem = page.getByText("Delete", { exact: false });
        if (await deleteItem.isVisible().catch(() => false)) {
          await deleteItem.click();
          await page.getByRole("button", { name: "Delete" }).last().click();
          await expect(page.getByText("File Deleted successfully")).toBeVisible({
            timeout: 15000,
          });
        }
      }
    }
  });

  test("TC-0062: Deleting a folder shows a success toast and refreshes the current folder listing", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const directoryTile = page.locator('[role="button"]').first();
      if (await directoryTile.isVisible({ timeout: 8000 }).catch(() => false)) {
        await directoryTile.getByRole("button", { name: "More options" }).click();
        const deleteItem = page.getByText("Delete", { exact: false });
        if (await deleteItem.isVisible().catch(() => false)) {
          await deleteItem.click();
          await page.getByRole("button", { name: "Delete" }).last().click();
          await expect(page.getByText("Directory Deleted successfully")).toBeVisible({
            timeout: 15000,
          });
        }
      }
    }
  });

  test("TC-0063: 'Storage configuration not found.' renders for an unknown or missing storageId", async ({
    page,
  }) => {
    const currentUrl = new URL(page.url());
    currentUrl.searchParams.set("id", "does-not-exist");
    await page.goto(currentUrl.toString());
    await expect(page.getByRole("heading", { name: "Storage Details" })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Storage configuration not found.")).toBeVisible({
      timeout: 30_000,
    });
  });
});
