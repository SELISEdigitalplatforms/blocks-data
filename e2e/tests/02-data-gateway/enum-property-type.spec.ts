import { expect, type Page } from "@playwright/test";
import { test } from "../../support/test-base";
import { openEnvironment } from "../../support/navigation";
import { dismissSessionConflictIfPresent, isConsoleUrl } from "../../support/session-conflict";
import { readDataProject } from "../../support/data-project";
import { e2eBaseUrl } from "../../support/env";

/**
 * Feature coverage for #353 — Enum property type.
 * Exercises: Type selector lists Enum, allowed-values editor, persist via Save/Update.
 */


function resolveProjectId(page: Page): string | null {
  const fixture = readDataProject();
  if (fixture?.itemId) return fixture.itemId;
  try {
    const id = new URL(page.url()).pathname.split("/")[2];
    if (id && id !== "console") return id;
  } catch {
    /* ignore */
  }
  return null;
}

async function openDataGateway(page: Page) {
  const projectId = resolveProjectId(page);
  const target = projectId
    ? `${e2eBaseUrl()}/app/${projectId}/data-gateway`
    : null;

  const ready = () =>
    page
      .getByRole("main")
      .getByText("Data Gateway", { exact: true })
      .or(page.getByRole("heading", { name: "Schemas", exact: true }))
      .or(page.getByRole("heading", { name: "Security Assessment" }))
      .or(page.getByText("No schemas yet", { exact: true }))
      .or(page.getByRole("button", { name: "More actions" }))
      .first();

  for (let attempt = 0; attempt < 5; attempt++) {
    if (target) {
      await page.goto(target, { waitUntil: "domcontentloaded" });
    } else {
      await page.getByRole("link", { name: "Data Gateway" }).first().click();
    }
    await dismissSessionConflictIfPresent(page);

    if (isConsoleUrl(page.url()) && projectId) {
      await openEnvironment(page);
      continue;
    }

    if (!/\/data-gateway(\/|$)/i.test(new URL(page.url()).pathname)) {
      const nav = page.getByRole("link", { name: "Data Gateway" }).first();
      if (await nav.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await nav.click();
        await dismissSessionConflictIfPresent(page);
      }
    }

    if (!/\/data-gateway(\/|$)/i.test(new URL(page.url()).pathname)) {
      continue;
    }

    const ok = await ready()
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    if (ok) return;

    // Blank main content after a deploy roll — hard reload once per attempt.
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await dismissSessionConflictIfPresent(page);
  }

  await expect(page).toHaveURL(/\/data-gateway(\/|$)/i, { timeout: 10_000 });
  await expect(ready()).toBeVisible({ timeout: 30_000 });
}

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
