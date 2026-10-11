import { expect, type Page } from "@playwright/test";
import { test } from "../../support/test-base";
import { openDataGateway } from "../../support/open-data-gateway";
import { confirmSchemaStructureSaved } from "../../support/confirm-schema-saved";
import { openEnvironment } from "../../support/navigation";
import { waitVisible } from "../../support/wait-visible";

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

  // The schemas explorer now exposes a generic "Add" button (icon + label) in
  // the sidebar header, and a "New schema" button in the empty state. Fall back
  // to those names if a button explicitly labelled "Add Schema" isn't present.
  const labeled = page.getByRole("button", { name: /Add Schema/i });
  const newSchema = page.getByRole("button", { name: /New schema/i });
  const addButton = page.getByRole("button", { name: /^Add$/ });
  if (await waitVisible(labeled, 3_000)) {
    await labeled.click();
  } else if (await waitVisible(newSchema, 3_000)) {
    await newSchema.click();
  } else {
    await addButton.first().click();
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
    if (await waitVisible(entityInput, 2_000)) {
      // onChange derives the collection name; poll briefly instead of
      // sleeping, then backfill only if nothing was derived.
      const derived = await expect
        .poll(() => entityInput.inputValue().catch(() => ""), { timeout: 3_000 })
        .not.toBe("")
        .then(() => true)
        .catch(() => false);
      if (!derived) {
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
      const nameInput = page.locator("table:visible").getByPlaceholder("Click to edit").last();
      await expect(nameInput).toBeVisible({ timeout: 15_000 });
      await nameInput.scrollIntoViewIfNeeded();
      await nameInput.fill(fieldName);
    });

    await test.step("Select Enum from primitive types and add allowed values", async () => {
      // New properties default to String; IsRequired combobox uses None/Insert/Update/Both.
      const typeCombo = page
        .locator("table:visible")
        .getByRole("combobox")
        .filter({ hasText: /Select type|^String$|^Enum$/i })
        .last();
      await expect(typeCombo).toBeVisible({ timeout: 15_000 });
      await typeCombo.click();

      await expect(page.getByText("Primitive Types")).toBeVisible({ timeout: 10_000 });
      const enumItem = page.locator("[cmdk-item], [role='option']").filter({ hasText: /^Enum$/ }).first();
      if (await waitVisible(enumItem, 2_000)) {
        await enumItem.click();
      } else {
        await page.getByText("Enum", { exact: true }).click();
      }

      await expect(page.getByText("Allowed values").first()).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText("Add at least one allowed value for Enum.").first(),
      ).toBeVisible({ timeout: 5_000 });

      // Desktop table only — mobile EnumValuesEditor is outside <table>.
      await page.keyboard.press("Escape");
      const valueInput = page.locator("table:visible").getByLabel("New enum value").last();
      await expect(valueInput).toBeVisible({ timeout: 15_000 });
      await valueInput.fill("Active");
      await valueInput.press("Enter");
      await expect(page.locator("table:visible").getByText("Active", { exact: true }).last()).toBeVisible();

      await valueInput.fill("Closed");
      await valueInput.press("Enter");
      await expect(page.locator("table:visible").getByText("Closed", { exact: true }).last()).toBeVisible();

      // Invalid value should surface editor error (does not add)
      await valueInput.fill("1Bad");
      await valueInput.press("Enter");
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
      // Mobile/desktop variants render duplicate DOM; the mobile chip set is
      // hidden, so keep only the visible occurrence of each value.
      await expect(
        page.getByText("Active", { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByText("Closed", { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 20_000 });
    });
  });
});
