import { expect, type Page } from "@playwright/test";
import { test } from "../../support/test-base";
import { openDataGateway } from "../../support/open-data-gateway";
import { confirmSchemaStructureSaved } from "../../support/confirm-schema-saved";
import { openEnvironment } from "../../support/navigation";

/**
 * Feature coverage for #353 — Enum property type.
 * Exercises: Type selector lists Enum, allowed-values editor, persist via Save/Update.
 */

async function createSchema(page: Page, schemaName: string) {
  await openDataGateway(page);
  const landingHeading = page.getByRole("heading", { name: "Security Assessment" });
  const emptyStateHeading = page.getByText("No schemas yet", { exact: true });
  const schemasReady = page.getByRole("heading", { name: "Schemas", exact: true });
  const pickSchema = page.getByText("Select a schema from the sidebar to view its details.");
  await expect(
    landingHeading.or(emptyStateHeading).or(schemasReady).or(pickSchema).first(),
  ).toBeVisible({ timeout: 30_000 });

  const addSchemaButton = page.getByRole("button", { name: /Add Schema|Add schema|\+/ }).first();
  // Prefer explicit Add Schema if present
  const labeled = page.getByRole("button", { name: /Add Schema/i });
  if (await labeled.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await labeled.click();
  } else {
    await addSchemaButton.click();
  }

  const dialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "Add New Schema" }),
  });
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  async function fillAndSubmit(): Promise<boolean> {
    const nameInput = dialog.getByLabel(/Schema name/);
    await nameInput.click();
    await nameInput.fill("");
    await nameInput.pressSequentially(schemaName, { delay: 15 });
    await nameInput.blur();
    const entityInput = dialog.locator("#entityName");
    if (await entityInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // Wait briefly for onChange-derived collection name, then backfill.
      await page.waitForTimeout(400);
      const entityVal = await entityInput.inputValue().catch(() => "");
      if (!entityVal.trim()) {
        await entityInput.fill(`sb_${schemaName}s`);
        await entityInput.blur();
      }
    }
    const addBtn = dialog.getByRole("button", { name: "Add", exact: true });
    await expect(addBtn).toBeEnabled({ timeout: 15_000 });
    await addBtn.click();

    const toast = page.getByText("Schema added successfully").first();
    const sidebar = page.getByRole("button", { name: schemaName }).first();
    const ok = await toast
      .or(sidebar)
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (ok) return true;
    const closed = await dialog
      .waitFor({ state: "hidden", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    return closed;
  }

  let ok = await fillAndSubmit();
  if (!ok && (await dialog.isVisible().catch(() => false))) {
    ok = await fillAndSubmit();
  }
  if (!ok) {
    throw new Error(`Add Schema stuck for "${schemaName}"`);
  }

  const sidebarItem = page.getByRole("button", { name: schemaName }).first();
  await expect(sidebarItem).toBeVisible({ timeout: 20_000 });
  await sidebarItem.click();
  await expect(page.getByRole("heading", { name: schemaName }).first()).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("feature: Enum property type (#353)", () => {
  test("can add an Enum field with allowed values and persist it", async ({ page }) => {
    test.setTimeout(360_000);

    const schemaName = `enum_feat_${Date.now()}`;
    const fieldName = `status_${Date.now().toString().slice(-6)}`;

    await openEnvironment(page);
    await createSchema(page, schemaName);

    await page.setViewportSize({ width: 1440, height: 900 });

    await test.step("Enter edit mode and add a property", async () => {
      const editButton = page.getByRole("button", { name: "Edit", exact: true });
      await expect(editButton).toBeVisible({ timeout: 15_000 });
      await editButton.click();
      await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: "+ Add property" }).click();
      const nameInput = page.locator("table").getByPlaceholder("Click to edit").last();
      await expect(nameInput).toBeVisible({ timeout: 15_000 });
      await nameInput.scrollIntoViewIfNeeded();
      await nameInput.fill(fieldName);
    });

    await test.step("Select Enum from primitive types and add allowed values", async () => {
      // New properties default to String; IsRequired combobox uses None/Insert/Update/Both.
      const typeCombo = page
        .locator("table")
        .getByRole("combobox")
        .filter({ hasText: /Select type|^String$|^Enum$/i })
        .last();
      await expect(typeCombo).toBeVisible({ timeout: 15_000 });
      await typeCombo.click();

      await expect(page.getByText("Primitive Types")).toBeVisible({ timeout: 10_000 });
      const enumItem = page.locator("[cmdk-item], [role='option']").filter({ hasText: /^Enum$/ }).first();
      if (await enumItem.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await enumItem.click();
      } else {
        await page.getByText("Enum", { exact: true }).click();
      }

      await expect(page.getByText("Allowed values").first()).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText("Add at least one allowed value for Enum.").first(),
      ).toBeVisible({ timeout: 5_000 });

      // Desktop table only — mobile EnumValuesEditor is outside <table>.
      await page.keyboard.press("Escape").catch(() => {});
      const valueInput = page.locator("table").getByLabel("New enum value").last();
      const addValue = page.locator("table").getByLabel("Add enum value").last();
      await expect(valueInput).toBeVisible({ timeout: 15_000 });
      await valueInput.fill("Active");
      await addValue.click();
      await expect(page.locator("table").getByText("Active", { exact: true }).last()).toBeVisible();

      await valueInput.fill("Closed");
      await addValue.click();
      await expect(page.locator("table").getByText("Closed", { exact: true }).last()).toBeVisible();

      // Invalid value should surface editor error (does not add)
      await valueInput.fill("1Bad");
      await addValue.click();
      await expect(page.getByText(/Only letters, numbers/i).first()).toBeVisible({ timeout: 5_000 });
    });

    await test.step("Save and confirm Enum field persists", async () => {
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("button", { name: "Update" }).click();
      await confirmSchemaStructureSaved(page);

      // Persistence signal: field name + allowed values remain on the page.
      // Type cell "Enum" can be truncated/virtualized away after Publish/adapt.
      const nameMatched = await page.evaluate((name) => {
        const inputs = Array.from(document.querySelectorAll("table input")) as HTMLInputElement[];
        return inputs.some((i) => i.value === name) || document.body.innerText.includes(name);
      }, fieldName);
      expect(nameMatched).toBe(true);
      await expect(page.getByText("Active", { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible({
        timeout: 20_000,
      });
    });
  });
});
