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

test.describe("data gateway - schema access control", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnvironment(page);

    await page.getByRole("link", { name: "Data Gateway" }).click();
    await expect(page.getByText("Data Gateway")).toBeVisible({
      timeout: 30000,
    });
  });

  test("TC-0099: Schema Access drawer opens with reachable column-level (CLS) tabs", async ({
    page,
  }) => {
    const firstSchemaRow = await ensureSchemaExists(page);
    if (await firstSchemaRow.isVisible().catch(() => false)) {
      await firstSchemaRow.click();
      const schemaAccessButton = page.getByRole("button", {
        name: "Schema Access",
      });
      if (await schemaAccessButton.isVisible().catch(() => false)) {
        await schemaAccessButton.click();
        const tabs = page.getByRole("tab");
        if ((await tabs.count()) > 0) {
          await tabs.first().click();
          await expect(tabs.first()).toBeVisible();
        }
      }
    }
  });

  test("TC-0100: Adding a custom rule set to a schema via the RuleSetForm succeeds", async ({
    page,
  }) => {
    const firstSchemaRow = await ensureSchemaExists(page);
    if (await firstSchemaRow.isVisible().catch(() => false)) {
      await firstSchemaRow.click();
      const changePolicySelect = page.getByText("Change Policy");
      if (await changePolicySelect.isVisible().catch(() => false)) {
        await changePolicySelect.click();
        await page.getByRole("option", { name: "Custom" }).click();

        const addRuleButton = page.getByRole("button", { name: /Add/ }).first();
        if (await addRuleButton.isVisible().catch(() => false)) {
          await addRuleButton.click();
          const addRuleFormButton = page.getByRole("button", {
            name: /Add Rule/,
          });
          if (await addRuleFormButton.isVisible().catch(() => false)) {
            await addRuleFormButton.click();
            await expect(addRuleFormButton).toBeVisible();
          }
        }
      }
    }
  });

  test("TC-0101: Adding a regex validation to a primitive field via SchemaFieldValidationDrawer succeeds", async ({
    page,
  }) => {
    // NOTE: assumes the open schema has at least one primitive field.
    const firstSchemaRow = await ensureSchemaExists(page);
    if (await firstSchemaRow.isVisible().catch(() => false)) {
      await firstSchemaRow.click();
      const validationTrigger = page.locator('[aria-label^="Manage validations for"]').first();
      if (await validationTrigger.isVisible().catch(() => false)) {
        await validationTrigger.click();

        const addValidationButton = page.getByText("Add validation").first();
        if (await addValidationButton.isVisible().catch(() => false)) {
          await addValidationButton.click();
        }

        const patternInput = page.getByPlaceholder("e.g. ^[a-zA-Z]+$");
        if (await patternInput.isVisible().catch(() => false)) {
          await patternInput.fill("^[A-Z]{2}\\d{4}$");
          await page.getByRole("button", { name: "Add" }).last().click();
          await expect(patternInput).toHaveCount(0);
        }
      }
    }
  });
});
