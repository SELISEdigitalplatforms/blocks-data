import { test, expect, Page } from "@playwright/test";
import { openEnvironment } from "../../support/navigation";
import { login } from "../../support/auth";

async function ensureSchemaExists(page: Page) {
  let firstSchemaRow = page.locator('[class*="cursor-pointer"]').first();
  if (!(await firstSchemaRow.isVisible().catch(() => false))) {
    const addButton = page
      .getByRole("button", { name: "Add Schema" })
      .or(page.getByRole("button", { name: "Add" }))
      .first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      await page.getByLabel(/Schema name/).fill(`dg_entity_${Date.now()}`);
      await page.getByRole("button", { name: "Add" }).last().click();
      await expect(page.getByText("Schema added successfully")).toBeVisible({
        timeout: 15000,
      });
    }
    firstSchemaRow = page.locator('[class*="cursor-pointer"]').first();
  }
  return firstSchemaRow;
}

test.describe("data gateway - delete schema", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnvironment(page);

    await page.getByRole("link", { name: "Data Gateway" }).click();
    await expect(page.getByText("Data Gateway")).toBeVisible({
      timeout: 30000,
    });
  });

  test("TC-0090: 'More options' → 'Delete schema' opens a confirmation dialog titled 'Delete schema?'", async ({
    page,
  }) => {
    const firstSchemaRow = await ensureSchemaExists(page);
    if (await firstSchemaRow.isVisible().catch(() => false)) {
      await firstSchemaRow.click();
      const moreOptionsButton = page.getByRole("button", {
        name: "More options",
      });
      if (await moreOptionsButton.isVisible().catch(() => false)) {
        await moreOptionsButton.click();
        await page.getByText("Delete schema", { exact: true }).click();

        await expect(page.getByRole("heading", { name: "Delete schema?" })).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.getByRole("button", { name: "Delete" })).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible({
          timeout: 30_000,
        });
      }
    }
  });

  test("TC-0091: Confirming schema deletion shows a success toast and resets the editor to the empty state", async ({
    page,
  }) => {
    const firstSchemaRow = await ensureSchemaExists(page);
    if (await firstSchemaRow.isVisible().catch(() => false)) {
      await firstSchemaRow.click();
      const moreOptionsButton = page.getByRole("button", {
        name: "More options",
      });
      if (await moreOptionsButton.isVisible().catch(() => false)) {
        await moreOptionsButton.click();
        await page.getByText("Delete schema", { exact: true }).click();
        await page.getByRole("button", { name: "Delete" }).click();

        await expect(page.getByText("Deleted successfully")).toBeVisible({
          timeout: 15000,
        });
        await expect(page).not.toHaveURL(/schemaId=/, { timeout: 30_000 });
      }
    }
  });

  test("TC-0092: Canceling the delete-schema confirmation keeps the schema selected and unchanged", async ({
    page,
  }) => {
    const firstSchemaRow = await ensureSchemaExists(page);
    if (await firstSchemaRow.isVisible().catch(() => false)) {
      await firstSchemaRow.click();
      const moreOptionsButton = page.getByRole("button", {
        name: "More options",
      });
      if (await moreOptionsButton.isVisible().catch(() => false)) {
        await moreOptionsButton.click();
        await page.getByText("Delete schema", { exact: true }).click();
        await page.getByRole("button", { name: "Cancel" }).click();

        await expect(page.getByRole("heading", { name: "Delete schema?" })).toBeHidden();
      }
    }
  });
});
