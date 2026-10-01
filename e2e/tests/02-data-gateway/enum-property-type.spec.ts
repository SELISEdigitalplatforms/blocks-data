import { expect, type Page } from "@playwright/test";
import { test } from "../../support/test-base";
import { openEnvironment } from "../../support/navigation";
import { dismissSessionConflictIfPresent } from "../../support/session-conflict";

/**
 * Feature coverage for #353 — Enum property type.
 * Exercises: Type selector lists Enum, allowed-values editor, persist via Save/Update.
 */

async function openDataGateway(page: Page) {
  const url = new URL(page.url());
  const projectId = url.pathname.split("/")[2];
  if (projectId) {
    await page.goto(`${url.origin}/app/${projectId}/data-gateway`, {
      waitUntil: "domcontentloaded",
    });
  } else {
    await page.getByRole("link", { name: "Data Gateway" }).first().click();
  }
  await dismissSessionConflictIfPresent(page);
  await expect(page.getByRole("main").getByText("Data Gateway", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

async function createSchema(page: Page, schemaName: string) {
  await openDataGateway(page);
  const landingHeading = page.getByRole("heading", { name: "Security Assessment" });
  const emptyStateHeading = page.getByText("No schemas yet", { exact: true });
  await expect(landingHeading.or(emptyStateHeading).first()).toBeVisible({ timeout: 30_000 });

  const addSchemaButton = page.getByRole("button", { name: /Add Schema|Add schema|\+/ }).first();
  // Prefer explicit Add Schema if present
  const labeled = page.getByRole("button", { name: /Add Schema/i });
  if (await labeled.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await labeled.click();
  } else {
    await addSchemaButton.click();
  }

  await expect(page.getByRole("heading", { name: "Add New Schema" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel(/Schema name/).fill(schemaName);
  await page.getByRole("button", { name: "Add" }).last().click();
  await expect(page.getByText("Schema added successfully").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: schemaName }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("feature: Enum property type (#353)", () => {
  test("can add an Enum field with allowed values and persist it", async ({ page }) => {
    test.setTimeout(240_000);

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
      // Prefer the Property type combobox — IsRequired is also a combobox (None/Insert/…).
      const typeRow = page
        .locator("table tr")
        .filter({ has: page.locator(`input[value="${fieldName}"]`) })
        .first();
      const typeCombo = typeRow
        .getByRole("combobox")
        .filter({ hasText: /Select type|String|Boolean|Int|Float|Long|Decimal|DateTime|Date|ObjectId|Byte|Short|Enum|GeoJson|UUID|Binary/ })
        .first()
        .or(typeRow.getByRole("combobox").first());
      await expect(typeCombo).toBeVisible({ timeout: 10_000 });
      await typeCombo.click();

      await expect(page.getByText("Primitive Types")).toBeVisible({ timeout: 10_000 });
      const enumItem = page.locator("[cmdk-item], [role='option']").filter({ hasText: /^Enum$/ }).first();
      if (await enumItem.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await enumItem.click();
      } else {
        await page.getByText("Enum", { exact: true }).click();
      }

      await expect(page.getByText("Allowed values")).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText("Add at least one allowed value for Enum."),
      ).toBeVisible({ timeout: 5_000 });

      const valueInput = page.getByLabel("New enum value");
      await valueInput.fill("Active");
      await page.getByLabel("Add enum value").click();
      await expect(page.getByText("Active", { exact: true })).toBeVisible();

      await valueInput.fill("Closed");
      await page.getByLabel("Add enum value").click();
      await expect(page.getByText("Closed", { exact: true })).toBeVisible();

      // Invalid value should surface editor error (does not add)
      await valueInput.fill("1Bad");
      await page.getByLabel("Add enum value").click();
      await expect(page.getByText(/Only letters, numbers/i)).toBeVisible({ timeout: 5_000 });
    });

    await test.step("Save and confirm Enum field persists", async () => {
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("button", { name: "Update" }).click();
      await expect(page.getByText("Schema updated successfully").first()).toBeVisible({
        timeout: 15_000,
      });

      // After save, edit mode exits — type shows as read-only label
      await expect(page.getByText("Enum", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Active", { exact: true })).toBeVisible();
      await expect(page.getByText("Closed", { exact: true })).toBeVisible();

      const nameMatched = await page.evaluate((name) => {
        const inputs = Array.from(document.querySelectorAll("table input")) as HTMLInputElement[];
        return inputs.some((i) => i.value === name) || document.body.innerText.includes(name);
      }, fieldName);
      expect(nameMatched).toBe(true);
    });
  });
});
