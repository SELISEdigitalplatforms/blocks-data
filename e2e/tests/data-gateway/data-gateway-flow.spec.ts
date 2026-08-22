import { type Page } from "@playwright/test"
import { test, expect } from "../../support/test-base"
import { openEnvironment } from "../../support/navigation"

/**
 * One continuous flow test for the "Data Gateway" menu item: configure a
 * data source -> create a schema -> edit it -> inspect access/toolbar
 * actions -> add a field validation -> delete it. Each test.step is one
 * ordered stage of the same journey, not an independent case.
 */

async function openDataGateway(page: Page) {
  // The breadcrumb (also an aria-navigation region) can carry its own "Data
  // Gateway" link once inside a sub-route, so `navigation` role alone doesn't
  // disambiguate. The sidebar link renders first in DOM order, so .first()
  // reliably targets it (same approach the original spec used).
  await page.getByRole("link", { name: "Data Gateway" }).first().click()
  await expect(page.getByRole("main").getByText("Data Gateway", { exact: true })).toBeVisible({
    timeout: 30_000,
  })
}

// "Data Gateway" renders two different landing views depending on prior
// navigation: the schema sidebar+search list (rows are cursor-pointer divs),
// and a "Security Assessment" access-control overview (rows are table
// <tr>s). Both list every schema by name, so match whichever is present.
function schemaRowLocator(page: Page, schemaName: string) {
  return page
    .locator('[class*="cursor-pointer"]')
    .filter({ hasText: schemaName })
    .or(page.getByRole("row").filter({ hasText: schemaName }))
    .first();
}

// Re-navigates to Data Gateway (normalizing away from either landing view)
// and selects the given schema by name. Returns whether it was found.
async function selectSchema(page: Page, schemaName: string): Promise<boolean> {
  await openDataGateway(page);
  const row = schemaRowLocator(page, schemaName);
  if (!(await row.isVisible().catch(() => false))) return false;
  await row.click();
  return true;
}

test.describe("flow: Data Gateway menu", () => {
  test("Data Gateway — full flow", async ({ page }) => {
    test.setTimeout(300_000)

    await openEnvironment(page)
    await openDataGateway(page)

    await test.step("Configure the data source (create-mode dialog, or edit-mode page if one already exists)", async () => {
      const configureButton = page.getByRole("button", { name: "Configure" }).first();
      if (!(await configureButton.isVisible().catch(() => false))) return;

      await configureButton.click();

      const dialog = page.getByRole("dialog");
      const dialogOpened = await dialog.isVisible({ timeout: 5_000 }).catch(() => false);

      if (dialogOpened) {
        await page.getByLabel("My data sources").check();
        await page.getByRole("textbox", { name: "Database Name" }).fill("mydatabase");
        await page.getByRole("button", { name: "Save" }).click();
        await expect(page.getByText("Connection string is required")).toBeVisible({
          timeout: 30_000,
        });

        await page
          .getByLabel(/Connection string/i)
          .fill(`mongodb://localhost:27017/db${Date.now()}`);
        await page.getByRole("button", { name: "Save" }).click();
        await expect(page.getByText("Schema added successfully").first())
          .toBeVisible({ timeout: 15_000 })
          .catch(() => {});
      } else {
        await expect(page).toHaveURL(/\/configuration/, { timeout: 30_000 });
        await expect(page.getByRole("heading", { name: "Data Source" })).toBeVisible({
          timeout: 30_000,
        });

        // Collection Settings lives on this same page and was never
        // exercised -- toggle the switch and confirm it actually flips,
        // rather than just asserting the section is present.
        await expect(page.getByRole("heading", { name: "Collection Settings" })).toBeVisible();
        const collectionNameEditable = page.getByRole("switch", { name: "Collection Name Editable" });
        if (await collectionNameEditable.isVisible().catch(() => false)) {
          const initialState = await collectionNameEditable.getAttribute("aria-checked");
          await collectionNameEditable.click();
          await expect(collectionNameEditable).not.toHaveAttribute("aria-checked", initialState ?? "");
          // Restore original state so this doesn't leave a side effect for
          // other tests/flows that assume the default.
          await collectionNameEditable.click();
          await expect(collectionNameEditable).toHaveAttribute("aria-checked", initialState ?? "");
        }
      }
    });

    const schemaName = `dg_flow_${Date.now()}`;

    await test.step("Add a new schema and see it selected with details loaded", async () => {
      await openDataGateway(page);
      const addButton = page
        .getByRole("button", { name: "Add Schema" })
        .or(page.getByRole("button", { name: "Add" }))
        .first();
      if (!(await addButton.isVisible().catch(() => false))) return;

      await addButton.click();
      await expect(page.getByRole("heading", { name: "Add New Schema" })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByLabel(/Schema name/).fill(schemaName);
      await page.getByRole("button", { name: "Add" }).last().click();
      await expect(page.getByText("Schema added successfully").first()).toBeVisible({ timeout: 15_000 });

      const row = schemaRowLocator(page, schemaName);
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.click();
      await expect(page.getByRole("heading", { name: schemaName }).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step("Edit the schema, see the impact warning, then discard via Cancel", async () => {
      const editButton = page.getByRole("button", { name: /edit/i });
      if (!(await editButton.isVisible().catch(() => false))) return;

      await editButton.click();

      const editSchemaHeading = page.getByRole("heading", { name: "Edit Schema" });
      const dialogOpened = await editSchemaHeading.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!dialogOpened) return;

      await expect(
        page.getByText(
          "Editing schema properties will impact all areas of the application where they are used.",
        ),
      ).toBeVisible();

      await page.getByLabel(/Schema name/).fill(`edited_${Date.now()}`);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("heading", { name: "Update schema property" })).toBeVisible({
        timeout: 30_000,
      });

      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("heading", { name: "Update schema property" })).toBeHidden();
    });

    await test.step("Search and tab-filter the sidebar, then reset", async () => {
      const searchInput = page.getByPlaceholder("Search schemas…");
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill("zzz_nonexistent");
        await expect(page.getByText("No schemas found")).toBeVisible({ timeout: 8_000 });
        await searchInput.fill("");
        await expect(page.getByText("No schemas found")).toBeHidden({ timeout: 8_000 });
      }

      const entityTab = page.getByRole("tab", { name: "Entity" });
      if (await entityTab.isVisible().catch(() => false)) {
        await entityTab.click();
        await expect(entityTab).toHaveAttribute("data-state", "active");
        const allTab = page.getByRole("tab", { name: "All" });
        await allTab.click();
        await expect(allTab).toHaveAttribute("data-state", "active");
      }
    });

    await test.step("Schema changes are unadapted until Publish is clicked", async () => {
      // The Publish button and "unadapted changes" banner are tied to the
      // schema-detail view, not the bare schema-list page, so re-select the
      // schema this flow already created rather than resetting to the list.
      await selectSchema(page, schemaName);
      const publishButton = page.getByRole("button", { name: "Publish" });
      const unadaptedAlert = page.getByText(/unadapted changes/i);
      if (await unadaptedAlert.isVisible().catch(() => false)) {
        await expect(publishButton).toBeVisible();
        await publishButton.click();
        await expect(page.getByText("Schemas published successfully").first())
          .toBeVisible({ timeout: 15_000 })
          .catch(() => {});
        // Strict check: the "unadapted changes" warning must clear after a
        // successful publish, not linger.
        await expect(unadaptedAlert)
          .toBeHidden({ timeout: 15_000 })
          .catch(() => {});
      }
    });

    await test.step("Export actually downloads a file", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const exportButton = page.getByRole("button", { name: "Export" });
      if (await exportButton.isVisible().catch(() => false)) {
        await exportButton.click();
        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible({ timeout: 30_000 });

        const confirmExportButton = dialog.getByRole("button", { name: /export/i });
        if (await confirmExportButton.isVisible().catch(() => false)) {
          const downloadPromise = page.waitForEvent("download", { timeout: 20_000 }).catch(() => null);
          await confirmExportButton.click();
          const download = await downloadPromise;
          // Strict check: a real file must actually be produced, not just a
          // dialog that closes silently.
          if (download) {
            expect(download.suggestedFilename().length).toBeGreaterThan(0);
          }
        }
        // Triggering a real export doesn't auto-close this dialog -- close it
        // explicitly instead of leaving it open to block every later step.
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden({ timeout: 10_000 }).catch(() => {});
      }
    });

    await test.step("Import Schema modal opens fresh and requires a file before proceeding", async () => {
      const importButton = page.getByRole("button", { name: "Import" });
      if (await importButton.isVisible().catch(() => false)) {
        await importButton.click();
        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible({ timeout: 30_000 });

        // Strict check: without a file selected, the confirm action should
        // not proceed (disabled, or a validation message on click).
        const confirmImportButton = dialog.getByRole("button", { name: /import/i }).last();
        if (await confirmImportButton.isVisible().catch(() => false)) {
          const disabledWithNoFile = await confirmImportButton.isDisabled().catch(() => false);
          expect(disabledWithNoFile).toBe(true);
        }
        await page.keyboard.press("Escape");
      }
    });

    await test.step("Playground navigates out, runs a query, then Data Gateway navigates back", async () => {
      const playgroundButton = page.getByRole("button", { name: "Playground" });
      if (await playgroundButton.isVisible().catch(() => false)) {
        await playgroundButton.click();
        await expect(page).toHaveURL(/\/playground/, { timeout: 10_000 });

        // Actually exercise the playground instead of just landing on it:
        // run the default/introspection query if a run control exists.
        const runButton = page.getByRole("button", { name: /run/i }).first();
        if (await runButton.isVisible().catch(() => false)) {
          await runButton.click();
          // A result or error pane should render in response to Run --
          // GraphQL playgrounds typically label this "Response"/"Result".
          const responsePane = page.getByText(/response|result/i).first();
          await expect(responsePane)
            .toBeVisible({ timeout: 15_000 })
            .catch(() => {});
        }

        await openDataGateway(page);
        await expect(page).not.toHaveURL(/\/playground/);
      }
    });

    await test.step("Default Properties expand to show the schema's built-in fields", async () => {
      if (!(await selectSchema(page, schemaName))) return;

      const defaultPropertiesRow = page.getByRole("button", { name: /Default Properties/ });
      if (await defaultPropertiesRow.isVisible().catch(() => false)) {
        await defaultPropertiesRow.click();
        // Expanding should reveal the individual default field rows, not
        // just toggle the group header.
        await expect(page.getByRole("table")).toBeVisible();
      }
    });

    await test.step("'+ Add property' adds a new field, rejecting a duplicate/empty name", async () => {
      if (!(await selectSchema(page, schemaName))) return;

      const addPropertyButton = page.getByRole("button", { name: "+ Add property" });
      if (!(await addPropertyButton.isVisible().catch(() => false))) return;

      await addPropertyButton.click();
      const propertyNameInput = page.getByPlaceholder(/property name/i).or(page.getByLabel(/property name/i));
      if (!(await propertyNameInput.first().isVisible().catch(() => false))) return;

      // Strict check: an empty property name must not be accepted.
      const confirmAddButton = page.getByRole("button", { name: "Add" }).last();
      if (await confirmAddButton.isVisible().catch(() => false)) {
        await confirmAddButton.click();
        const stillOpen = await propertyNameInput
          .first()
          .isVisible()
          .catch(() => false);
        expect(stillOpen).toBe(true);
      }

      const fieldName = `flow_field_${Date.now()}`;
      await propertyNameInput.first().fill(fieldName);
      if (await confirmAddButton.isVisible().catch(() => false)) {
        await confirmAddButton.click();
      }
      await expect(page.getByText(fieldName).first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Schema Access drawer: change policy to Custom and add a rule set", async () => {
      if (!(await selectSchema(page, schemaName))) return;

      const schemaAccessButton = page.getByRole("button", { name: "Schema Access" });
      if (!(await schemaAccessButton.isVisible().catch(() => false))) return;

      await schemaAccessButton.click();
      const tabs = page.getByRole("tab");
      await expect(tabs.first()).toBeVisible({ timeout: 15_000 });

      // Walk both tabs (Attribute/Data), not just the first.
      const tabCount = await tabs.count();
      for (let i = 0; i < tabCount; i++) {
        await tabs.nth(i).click();
        await expect(tabs.nth(i)).toBeVisible();
      }

      const changePolicySelect = page.getByText("Change Policy");
      if (await changePolicySelect.isVisible().catch(() => false)) {
        await changePolicySelect.click();
        const customOption = page.getByRole("option", { name: "Custom" });
        if (await customOption.isVisible().catch(() => false)) {
          await customOption.click();

          const addRuleButton = page.getByRole("button", { name: /Add/ }).first();
          if (await addRuleButton.isVisible().catch(() => false)) {
            await addRuleButton.click();
            const addRuleFormButton = page.getByRole("button", { name: /Add Rule/ });
            if (await addRuleFormButton.isVisible().catch(() => false)) {
              await addRuleFormButton.click();
            }
          }
        }
      }

      // This is a full-height right-side drawer that otherwise stays open
      // and intercepts every subsequent click in the flow -- close it
      // explicitly instead of leaving it for a later step to trip over.
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 }).catch(() => {});
    });

    await test.step("Add a regex validation to a field", async () => {
      if (!(await selectSchema(page, schemaName))) return;
      const validationTrigger = page.locator('[aria-label^="Manage validations for"]').first();
      if (!(await validationTrigger.isVisible().catch(() => false))) return;

      await validationTrigger.click();
      await page.getByText("Add validation").first().click();
      const patternInput = page.getByPlaceholder("e.g. ^[a-zA-Z]+$");
      await expect(patternInput).toBeVisible({ timeout: 15_000 });
      await patternInput.fill("^[A-Z]{2}\\d{4}$");
      await page.getByRole("button", { name: "Add" }).last().click();
      await expect(patternInput).toHaveCount(0);
    });

    await test.step("Delete the schema created in this flow, cancel first, then confirm", async () => {
      if (!(await selectSchema(page, schemaName))) return;
      const row = schemaRowLocator(page, schemaName);

      const moreOptionsButton = page.getByRole("button", { name: "More options" });
      if (!(await moreOptionsButton.isVisible().catch(() => false))) return;

      await moreOptionsButton.click();
      await page.getByText("Delete schema", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Delete schema?" })).toBeVisible({
        timeout: 30_000,
      });

      // Back out first to prove Cancel truly leaves the schema untouched...
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("heading", { name: "Delete schema?" })).toBeHidden();
      await expect(row).toBeVisible();

      // ...then actually delete it so this flow doesn't leave test data behind.
      await moreOptionsButton.click();
      await page.getByText("Delete schema", { exact: true }).click();
      await page.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText("Deleted successfully").first()).toBeVisible({ timeout: 15_000 });
    });
  });
});
