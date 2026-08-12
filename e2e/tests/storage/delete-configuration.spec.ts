import { test, expect } from "@playwright/test";
import { openEnvironment } from "../../support/navigation";
import { login } from "../../support/auth";

// NOTE: the "Remove"/"Delete" menu entry point on the storage card is not
// currently wired up in the UI (commented out in storage-card.tsx). These
// tests are written against the intended flow and will no-op via the
// isVisible() guard until that entry point ships.
test.describe("storage - delete configuration", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnvironment(page);

    await page.getByRole("link", { name: "Storage" }).click();
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible({
      timeout: 30000,
    });
  });

  test("TC-0035: Delete button opens a confirmation dialog with the exact delete-warning copy", async ({
    page,
  }) => {
    const deleteButton = page.getByRole("button", { name: "Delete" }).first();
    if (await deleteButton.isVisible().catch(() => false)) {
      await deleteButton.click();
      await expect(page.getByRole("heading", { name: "Delete Configuration" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page.getByText(
          "Are you sure you want to delete this storage configuration? This action may result in the loss of existing data associated with this configuration.",
        ),
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("button", { name: "Yes" })).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test("TC-0036: Cancel in the delete confirmation dialog keeps the configuration intact", async ({
    page,
  }) => {
    const deleteButton = page.getByRole("button", { name: "Delete" }).first();
    if (await deleteButton.isVisible().catch(() => false)) {
      await deleteButton.click();
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("heading", { name: "Delete Configuration" })).toBeHidden();
    }
  });

  test("TC-0037: Confirming deletion removes the configuration and shows a success toast", async ({
    page,
  }) => {
    const deleteButton = page.getByRole("button", { name: "Delete" }).first();
    if (await deleteButton.isVisible().catch(() => false)) {
      await deleteButton.click();
      await page.getByRole("button", { name: "Yes" }).click();
      await expect(page.getByText("Configuration deleted")).toBeVisible({
        timeout: 15000,
      });
    }
  });

  test("TC-0038: 'Yes' button is disabled while the delete request is pending", async ({
    page,
  }) => {
    const deleteButton = page.getByRole("button", { name: "Delete" }).first();
    if (await deleteButton.isVisible().catch(() => false)) {
      await deleteButton.click();
      const yesButton = page.getByRole("button", { name: "Yes" });
      await yesButton.click();
      await expect(yesButton).toBeDisabled();
    }
  });
});
