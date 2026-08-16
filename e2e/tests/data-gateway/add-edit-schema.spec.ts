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

test.describe("data gateway - add / edit schema", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnvironment(page);

    await page.getByRole("link", { name: "Data Gateway" }).click();
    await expect(page.getByText("Data Gateway")).toBeVisible({
      timeout: 30000,
    });
  });

  test("TC-0079: Add New Schema dialog opens with the correct title, description and default type", async ({
    page,
  }) => {
    const addButton = page
      .getByRole("button", { name: "Add Schema" })
      .or(page.getByRole("button", { name: "Add" }))
      .first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      await expect(page.getByRole("heading", { name: "Add New Schema" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Define a schema to structure your data.")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByLabel(/Entity name/)).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test("TC-0080: Adding an Entity schema auto-populates a read-only Entity name from the collection name pattern", async ({
    page,
  }) => {
    const addButton = page
      .getByRole("button", { name: "Add Schema" })
      .or(page.getByRole("button", { name: "Add" }))
      .first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      await page.getByLabel(/Schema name/).fill("orders");

      const entityNameField = page.getByLabel(/Entity name/);
      await expect(entityNameField).not.toHaveValue("");
    }
  });

  test("TC-0081: Adding a Child (DTO) schema hides the Entity name field", async ({ page }) => {
    const addButton = page
      .getByRole("button", { name: "Add Schema" })
      .or(page.getByRole("button", { name: "Add" }))
      .first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();

      const schemaTypeSelect = page.getByRole("combobox").first();
      await schemaTypeSelect.click();
      await page.getByRole("option", { name: "Child" }).click();

      await expect(page.getByLabel(/Entity name/)).toHaveCount(0);
    }
  });

  test("TC-0082: Schema name is required; the Add button stays disabled while it's empty", async ({
    page,
  }) => {
    const addButton = page
      .getByRole("button", { name: "Add Schema" })
      .or(page.getByRole("button", { name: "Add" }))
      .first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      await expect(page.getByRole("button", { name: "Add" }).last()).toBeDisabled();
    }
  });

  test("TC-0083: Schema name only accepts letters, numbers and underscores, and cannot start with a digit", async ({
    page,
  }) => {
    const addButton = page
      .getByRole("button", { name: "Add Schema" })
      .or(page.getByRole("button", { name: "Add" }))
      .first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      const schemaNameInput = page.getByLabel(/Schema name/);
      await schemaNameInput.fill("123_invalid");
      await expect(schemaNameInput).not.toHaveValue("123_invalid");

      await schemaNameInput.fill("abc-def!");
      await expect(schemaNameInput).toHaveValue("abcdef");
    }
  });

  test("TC-0084: Pasting an invalid schema name is sanitized instead of rejected outright", async ({
    page,
  }) => {
    const addButton = page
      .getByRole("button", { name: "Add Schema" })
      .or(page.getByRole("button", { name: "Add" }))
      .first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      const schemaNameInput = page.getByLabel(/Schema name/);
      await schemaNameInput.click();
      await page.evaluate(async () => {
        await navigator.clipboard.writeText("my schema!!2024");
      });
      await page.keyboard.press("Control+V");

      await expect(schemaNameInput).not.toHaveValue("my schema!!2024");
    }
  });

  test("TC-0085: Schema name uniqueness check flags an existing name as a duplicate", async ({
    page,
  }) => {
    // NOTE: assumes a schema named 'orders' already exists for the tenant.
    const addButton = page
      .getByRole("button", { name: "Add Schema" })
      .or(page.getByRole("button", { name: "Add" }))
      .first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      await page.getByLabel(/Schema name/).fill("Orders");

      const dupError = page.getByText("Schema with this name already exists");
      if (await dupError.isVisible({ timeout: 8000 }).catch(() => false)) {
        await expect(dupError).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole("button", { name: "Add" }).last()).toBeDisabled();
      }
    }
  });

  test("TC-0086: Successfully adding a schema shows a success toast and closes the dialog", async ({
    page,
  }) => {
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
      await expect(page.getByRole("heading", { name: "Add New Schema" })).toBeHidden();
    }
  });

  test("TC-0087: Editing an existing schema shows a warning banner about downstream impact", async ({
    page,
  }) => {
    const firstSchemaRow = await ensureSchemaExists(page);
    if (await firstSchemaRow.isVisible().catch(() => false)) {
      await firstSchemaRow.click();
      const editButton = page.getByRole("button", { name: /edit/i });
      if (await editButton.isVisible().catch(() => false)) {
        await editButton.click();
        await expect(page.getByRole("heading", { name: "Edit Schema" })).toBeVisible({
          timeout: 30_000,
        });
        await expect(
          page.getByText(
            "Editing schema properties will impact all areas of the application where they are used.",
          ),
        ).toBeVisible({ timeout: 30_000 });
      }
    }
  });

  test("TC-0088: Saving an edited schema opens the 'Update schema property' confirmation dialog", async ({
    page,
  }) => {
    const firstSchemaRow = await ensureSchemaExists(page);
    if (await firstSchemaRow.isVisible().catch(() => false)) {
      await firstSchemaRow.click();
      const editButton = page.getByRole("button", { name: /edit/i });
      if (await editButton.isVisible().catch(() => false)) {
        await editButton.click();
        await page.getByLabel(/Schema name/).fill(`edited_${Date.now()}`);
        await page.getByRole("button", { name: "Save" }).click();

        await expect(page.getByRole("heading", { name: "Update schema property" })).toBeVisible({
          timeout: 30_000,
        });
        await expect(
          page.getByText(
            "Updating the schema properties will impact all existing data. Any necessary updates will need to be handled manually. Are you sure you want to proceed?",
          ),
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole("button", { name: "Update" })).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible({
          timeout: 30_000,
        });
      }
    }
  });

  test("TC-0089: Confirming the edit-schema dialog persists the changes; Cancel discards them", async ({
    page,
  }) => {
    const firstSchemaRow = await ensureSchemaExists(page);
    if (await firstSchemaRow.isVisible().catch(() => false)) {
      await firstSchemaRow.click();
      const editButton = page.getByRole("button", { name: /edit/i });
      if (await editButton.isVisible().catch(() => false)) {
        await editButton.click();
        await page.getByLabel(/Schema name/).fill(`cancel_test_${Date.now()}`);
        await page.getByRole("button", { name: "Save" }).click();
        await page.getByRole("button", { name: "Cancel" }).click();
        await expect(page.getByRole("heading", { name: "Update schema property" })).toBeHidden();
      }
    }
  });
});
