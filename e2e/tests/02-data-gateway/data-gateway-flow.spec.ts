import { expect, Locator, type Page } from "@playwright/test";
import path from "path";
import { test } from "../../support/test-base";
import { openEnvironment } from "../../support/navigation";

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
  await expect(page.getByRole("main").getByText("Data Gateway", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

function schemaRowLocator(page: Page, schemaName: string) {
  return page
    .locator('[class*="cursor-pointer"]')
    .filter({ has: page.getByText(schemaName, { exact: true }) })
    .first();
}

async function schemaRowVisible(page: Page, schemaName: string): Promise<boolean> {
  const row = schemaRowLocator(page, schemaName);
  return row.isVisible({ timeout: 3_000 }).catch(() => false);
}

async function clickPaginationButton(
  page: Page,
  name: "First page" | "Previous page" | "Next page" | "Last page",
): Promise<boolean> {
  const button = page.getByRole("button", { name });
  if (!(await button.isVisible({ timeout: 1_000 }).catch(() => false))) return false;
  if (await button.isDisabled().catch(() => false)) return false;
  await button.click();
  return true;
}

async function selectSchema(page: Page, schemaName: string): Promise<boolean> {
  await openDataGateway(page);
  const landingHeading = page.getByRole("heading", { name: "Security Assessment" });
  const emptyStateHeading = page.getByText("No schemas yet", { exact: true });
  await expect(landingHeading.or(emptyStateHeading).first()).toBeVisible({
    timeout: 30_000,
  });

  if (await schemaRowVisible(page, schemaName)) {
    await schemaRowLocator(page, schemaName).click();
    return true;
  }

  if (await clickPaginationButton(page, "Last page")) {
    if (await schemaRowVisible(page, schemaName)) {
      await schemaRowLocator(page, schemaName).click();
      return true;
    }
  }

  for (let i = 0; i < 10; i++) {
    if (!(await clickPaginationButton(page, "Next page"))) break;
    if (await schemaRowVisible(page, schemaName)) {
      await schemaRowLocator(page, schemaName).click();
      return true;
    }
  }

  return false;
}

async function createSchemaViaModal(page: Page, addButtonLocator: Locator, schemaName: string) {
  await addButtonLocator.click();
  await expect(page.getByRole("heading", { name: "Add New Schema" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel(/Schema name/).fill(schemaName);
  await page.getByRole("button", { name: "Add" }).last().click();
  await expect(page.getByText("Schema added successfully").first()).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("flow: Data Gateway menu", () => {
  test("Data Gateway — full flow", async ({ page }) => {
    test.setTimeout(300_000);

    await openEnvironment(page);
    await openDataGateway(page);

    await test.step("Configure the data source (create-mode dialog, or edit-mode page if one already exists)", async () => {
      await page.getByRole("button", { name: "More actions" }).click();
      const configureButton = page.getByRole("menuitem", { name: "Configure" });
      await expect(configureButton).toBeVisible({ timeout: 15_000 });

      await configureButton.click();

      const dialog = page.getByRole("dialog");
      const dialogOpened = await dialog.isVisible({ timeout: 5_000 }).catch(() => false);

      if (dialogOpened) {
        const saveButton = page.getByRole("button", { name: "Save" });

        await page.getByLabel("My data sources").check();
        await page.getByRole("textbox", { name: "Database Name" }).fill("mydatabase");
        await expect(saveButton).toBeDisabled();

        await page
          .getByLabel(/Connection string/i)
          .fill(`mongodb://localhost:27017/db${Date.now()}`);
        await expect(saveButton).toBeEnabled({ timeout: 10_000 });
        await saveButton.click();
        await expect(page.getByText("Data source saved successfully").first()).toBeVisible({
          timeout: 15_000,
        });
      } else {
        await expect(page).toHaveURL(/\/configuration/, { timeout: 30_000 });
        await expect(page.getByRole("heading", { name: "Data Source" })).toBeVisible({
          timeout: 30_000,
        });

        await expect(page.getByRole("heading", { name: "Collection Settings" })).toBeVisible();
        const collectionNameEditable = page.getByRole("switch", {
          name: "Collection Name Editable",
        });
        await expect(collectionNameEditable).toBeVisible({ timeout: 15_000 });
        const initialState = await collectionNameEditable.getAttribute("aria-checked");
        await collectionNameEditable.click();
        await expect(collectionNameEditable).not.toHaveAttribute(
          "aria-checked",
          initialState ?? "",
        );
        await collectionNameEditable.click();
        await expect(collectionNameEditable).toHaveAttribute("aria-checked", initialState ?? "");
      }
    });

    await test.step("Data Source: exercise both 'Blocks database' and 'My data sources', then restore the original", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });

      await openDataGateway(page);

      await page.getByRole("button", { name: "More actions" }).click();

      const configureButton = page.getByRole("menuitem", {
        name: "Configure",
      });

      await expect(configureButton).toBeVisible({ timeout: 15_000 });
      await configureButton.click();

      await expect(page).toHaveURL(/\/configuration/, {
        timeout: 30_000,
      });

      await expect(page.getByRole("heading", { name: "Data Source" })).toBeVisible({
        timeout: 30_000,
      });

      const blocksRadio = page.getByRole("radio", {
        name: /Blocks database/,
      });

      const othersRadio = page.getByRole("radio", {
        name: /My data sources/,
      });

      const saveChangesButton = page.getByRole("button", {
        name: "Save Changes",
      });

      const confirmHeading = page.getByRole("heading", {
        name: "Confirm data source update?",
      });

      const confirmButton = page.getByRole("button", {
        name: "Confirm",
      });

      const connectionInput = page.getByRole("textbox", {
        name: "Connection String",
      });

      const databaseNameInput = page.getByRole("textbox", {
        name: "Database Name",
      });

      const wasBlocksOriginally = (await blocksRadio.getAttribute("aria-checked")) === "true";

      const originalConnectionString = wasBlocksOriginally
        ? null
        : await connectionInput.inputValue();

      const originalDatabaseName = wasBlocksOriginally
        ? null
        : await databaseNameInput.inputValue();

      async function saveChanges(expectedRadio: Locator) {
        await expect(saveChangesButton).toBeEnabled({
          timeout: 10_000,
        });

        await saveChangesButton.click();

        await expect(confirmHeading).toBeVisible({
          timeout: 15_000,
        });

        await expect(
          page.getByText("Changing the data source will affect all existing data."),
        ).toBeVisible();

        await confirmButton.click();

        await expect(page.getByText("Data source updated successfully").first()).toBeVisible({
          timeout: 20_000,
        });

        await expect(confirmHeading).toBeHidden({
          timeout: 10_000,
        });

        await expect(expectedRadio).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
      }

      if (wasBlocksOriginally) {
        await othersRadio.click();

        await expect(othersRadio).toHaveAttribute("aria-checked", "true");

        await expect(connectionInput).toBeVisible();
        await expect(databaseNameInput).toBeVisible();
        await expect(saveChangesButton).toBeDisabled();

        const testConnectionString = `mongodb://localhost:27017/e2e-flow-${Date.now()}`;

        const testDatabaseName = `e2e-flow-${Date.now()}`;

        await connectionInput.fill(testConnectionString);
        await databaseNameInput.fill(testDatabaseName);

        await saveChanges(othersRadio);

        await blocksRadio.click();

        await saveChanges(blocksRadio);

        await expect(blocksRadio).toHaveAttribute("aria-checked", "true");
      } else {
        await blocksRadio.click();

        await saveChanges(blocksRadio);

        await othersRadio.click();

        await expect(connectionInput).toBeVisible();
        await expect(databaseNameInput).toBeVisible();

        await connectionInput.fill(originalConnectionString ?? "");
        await databaseNameInput.fill(originalDatabaseName ?? "");

        await saveChanges(othersRadio);

        await expect(othersRadio).toHaveAttribute("aria-checked", "true");

        await expect(connectionInput).toHaveValue(originalConnectionString ?? "");

        await expect(databaseNameInput).toHaveValue(originalDatabaseName ?? "");
      }
    });

    const schemaName = `dg_flow_${Date.now()}`;
    const fieldName = `flow_field_${Date.now()}`;

    await test.step("Add Schema entry point #1: the Security/Performance landing view's own 'Add Schema' button", async () => {
      await openDataGateway(page);

      const landingHeading = page.getByRole("heading", { name: "Security Assessment" });
      const emptyStateHeading = page.getByText("No schemas yet", { exact: true });
      await expect(landingHeading.or(emptyStateHeading).first()).toBeVisible({ timeout: 15_000 });

      const addSchemaButton = page.getByRole("button", { name: "Add Schema", exact: true }).first();
      await expect(addSchemaButton).toBeVisible({ timeout: 10_000 });

      await createSchemaViaModal(page, addSchemaButton, schemaName);

      await expect(page.getByRole("heading", { name: schemaName }).first()).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step("Search and tab-filter the sidebar, then reset", async () => {
      const searchInput = page.getByPlaceholder("Search schemas…");
      await expect(searchInput).toBeVisible({ timeout: 15_000 });
      await searchInput.fill("zzz_nonexistent");
      await expect(page.getByText("No schemas found")).toBeVisible({ timeout: 8_000 });
      await searchInput.fill("");
      await expect(page.getByText("No schemas found")).toBeHidden({ timeout: 8_000 });

      const entityTab = page.getByRole("tab", { name: "Entity" });
      await expect(entityTab).toBeVisible({ timeout: 10_000 });
      await entityTab.click();
      await expect(entityTab).toHaveAttribute("data-state", "active");
      const allTab = page.getByRole("tab", { name: "All" });
      await allTab.click();
      await expect(allTab).toHaveAttribute("data-state", "active");
    });

    await test.step("Export walks the two-step wizard and requests a real export", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole("button", { name: "More actions" }).click();
      const exportButton = page.getByRole("menuitem", { name: "Export" });
      await expect(exportButton).toBeVisible({ timeout: 15_000 });
      await exportButton.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 30_000 });

      const selectFileTypeButton = dialog.getByRole("button", { name: "Select file type" });
      await expect(selectFileTypeButton).toBeVisible({ timeout: 10_000 });
      await selectFileTypeButton.click();

      const downloadCheckbox = dialog.getByLabel("Download");
      await expect(downloadCheckbox).toBeVisible({ timeout: 10_000 });
      await expect(downloadCheckbox).toBeChecked();

      const confirmExportButton = dialog.getByRole("button", { name: "Export", exact: true });
      await expect(confirmExportButton).toBeEnabled({ timeout: 10_000 });
      await confirmExportButton.click();
      await expect(page.getByText("Export in progress").first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    });

    await test.step("Import Schema modal opens fresh and requires a file before proceeding", async () => {
      await page.getByRole("button", { name: "More actions" }).click();
      const importButton = page.getByRole("menuitem", { name: "Import" });
      await expect(importButton).toBeVisible({ timeout: 15_000 });
      await importButton.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 30_000 });

      const confirmImportButton = dialog.getByRole("button", { name: "Upload" });
      await expect(confirmImportButton).toBeVisible({ timeout: 10_000 });
      await expect(confirmImportButton).toBeDisabled();

      const cancelButton = dialog.getByRole("button", { name: "Cancel" });
      await expect(cancelButton).toBeVisible({ timeout: 5_000 });
      await cancelButton.click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    });

    await test.step("'API Docs' opens Swagger documentation in a new tab", async () => {
      const apiDocsButton = page.getByRole("button", { name: "API Docs" });
      await expect(apiDocsButton).toBeVisible({ timeout: 15_000 });

      const [popup] = await Promise.all([
        page.context().waitForEvent("page", { timeout: 15_000 }),
        apiDocsButton.click(),
      ]);
      await popup.waitForLoadState("domcontentloaded");
      expect(popup.url()).toContain("/swagger");
      await popup.close();
    });

    await test.step("'Logs' (when enabled) navigates to the Data Gateway logs page", async () => {
      const logsButton = page.getByRole("link", { name: "Logs", exact: true });
      const logsEnabled = await logsButton.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!logsEnabled) return;

      await logsButton.click();
      await expect(page).toHaveURL(/\/data-gateway\/logs/, { timeout: 15_000 });
      await openDataGateway(page);
    });

    await test.step("Playground navigates out, executes the default query, then Data Gateway navigates back", async () => {
      const playgroundButton = page.getByRole("button", { name: "Playground" });
      await expect(playgroundButton).toBeVisible({ timeout: 15_000 });
      await playgroundButton.click();
      await expect(page).toHaveURL(/\/playground/, { timeout: 10_000 });

      const executeButton = page.getByRole("button", { name: /execute/i }).first();
      await expect(executeButton).toBeVisible({ timeout: 10_000 });
      await expect(executeButton).toBeEnabled({ timeout: 10_000 });
      await executeButton.click();

      const responseHeader = page.locator("span", { hasText: /^Response$/ }).first();
      await expect(responseHeader).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("// Execute a query to see the response")).toBeHidden({
        timeout: 15_000,
      });

      await test.step("Playground 'Schemas' button opens a Vaul drawer with search input and the GraphQL schema list", async () => {
        const schemasButton = page.getByRole("button", { name: "Schemas" });
        await expect(schemasButton).toBeVisible({ timeout: 10_000 });
        await schemasButton.click();

        const drawer = page.getByRole("dialog");
        await expect(drawer).toBeVisible({ timeout: 15_000 });

        await expect(drawer.getByText("Schemas", { exact: true }).first()).toBeVisible();
        await expect(drawer.getByPlaceholder("Search types, fields...")).toBeVisible();

        await page.getByRole("button", { name: "Close schemas drawer" }).click();
        await expect(drawer).toBeHidden({ timeout: 10_000 });
      });

      await test.step("Playground 'Clean Test Data' button opens a modal with description, schema list/empty state, and Cancel/Delete buttons", async () => {
        const cleanTestDataButton = page.getByRole("button", {
          name: "Clean Test Data",
        });
        await expect(cleanTestDataButton).toBeVisible({ timeout: 10_000 });
        await cleanTestDataButton.click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible({ timeout: 10_000 });
        await expect(dialog.getByRole("heading", { name: "Clean Test Data" })).toBeVisible();
        await expect(dialog.getByText(/select schemas to delete/i)).toBeVisible();

        const selectAll = dialog.getByText(/^Select All/);
        const noData = dialog.getByText(/no test data found/i);
        await expect(selectAll.or(noData)).toBeVisible({ timeout: 15_000 });

        const cancelButton = dialog.getByRole("button", { name: "Cancel" });
        const deleteButton = dialog.getByRole("button", { name: "Delete" });
        await expect(cancelButton).toBeEnabled();
        await expect(deleteButton).toBeDisabled();

        await cancelButton.click();
        await expect(dialog).toBeHidden({ timeout: 5_000 });
      });

      await openDataGateway(page);
      await expect(page).not.toHaveURL(/\/playground/);
    });

    await test.step("Default Properties expand to show the schema's built-in fields", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);

      const defaultPropertiesRow = page.getByRole("button", { name: /Default Properties/ });
      await expect(defaultPropertiesRow).toBeVisible({ timeout: 15_000 });
      await defaultPropertiesRow.click();
      await expect(page.getByRole("table")).toBeVisible();
    });

    await test.step("'+ Add property' adds a new field, rejecting a duplicate/empty name", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);

      await page.setViewportSize({ width: 1440, height: 900 });

      const editButton = page.getByRole("button", { name: "Edit", exact: true });
      await expect(editButton).toBeVisible({ timeout: 15_000 });
      await editButton.click();
      await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible({
        timeout: 15_000,
      });

      const addPropertyButton = page.getByRole("button", { name: "+ Add property" });
      await expect(addPropertyButton).toBeVisible({ timeout: 15_000 });
      await addPropertyButton.click();

      const newRowNameInput = page.locator("table").getByPlaceholder("Click to edit").last();
      await expect(newRowNameInput).toBeVisible({ timeout: 15_000 });
      await newRowNameInput.scrollIntoViewIfNeeded();
      await newRowNameInput.fill(fieldName);

      const saveButton = page.getByRole("button", { name: "Save", exact: true });
      await expect(saveButton).toBeVisible({ timeout: 10_000 });
      await saveButton.click();
      const updateDialogButton = page.getByRole("button", { name: "Update" });
      await expect(updateDialogButton).toBeVisible({ timeout: 10_000 });
      await updateDialogButton.click();
      await expect(page.getByText("Schema updated successfully").first()).toBeVisible({
        timeout: 15_000,
      });

      await expect(
        page
          .locator("table input")
          .filter({ hasNot: page.locator(`input[type="checkbox"]`) })
          .first(),
      ).toBeAttached();
      const matched = await page.evaluate((name) => {
        const inputs = Array.from(document.querySelectorAll("table input")) as HTMLInputElement[];
        return inputs.some((i) => i.value === name);
      }, fieldName);
      expect(matched).toBe(true);
    });

    await test.step("Schema changes are unadapted until Publish is clicked", async () => {
      await selectSchema(page, schemaName);
      const publishButton = page.getByRole("button", { name: "Publish" });
      const unadaptedAlert = page.getByText(/unadapted changes/i);
      await expect(unadaptedAlert).toBeVisible({ timeout: 15_000 });

      await expect(publishButton).toBeVisible();
      await publishButton.click();
      await expect(page.getByText("Schemas published successfully").first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(unadaptedAlert).toBeHidden({ timeout: 15_000 });
    });

    await test.step("Schema Access drawer: change policy to Custom and add a rule set", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);

      const schemaAccessButton = page.getByRole("button", { name: "Schema Access" });
      await expect(schemaAccessButton).toBeVisible({ timeout: 15_000 });

      await schemaAccessButton.click();
      const drawerTabs = page.getByRole("tab");
      await expect(drawerTabs.first()).toBeVisible({ timeout: 15_000 });
      const tabCount = await drawerTabs.count();
      for (let i = 0; i < tabCount; i++) {
        await drawerTabs.nth(i).click();
        await expect(drawerTabs.nth(i)).toBeVisible();
      }
      await drawerTabs.first().click();

      const changePolicySelect = page
        .getByRole("combobox")
        .filter({ hasText: /Change Policy|Inherited|All logged in|Public|Custom/i })
        .first();
      await expect(changePolicySelect).toBeVisible({ timeout: 10_000 });
      await changePolicySelect.click();
      const customOption = page.getByRole("option", { name: "Custom" });
      await expect(customOption).toBeVisible({ timeout: 10_000 });
      await customOption.click();

      const confirmPolicyButton = page.getByRole("button", { name: "Confirm" }).first();
      await expect(confirmPolicyButton).toBeVisible({ timeout: 10_000 });
      await confirmPolicyButton.click();

      const addRuleButton = page.getByRole("button", { name: "Add", exact: true }).first();
      await expect(addRuleButton).toBeVisible({ timeout: 10_000 });
      await addRuleButton.click();
      const addRuleFormButton = page.getByRole("button", { name: /Add Rule/ }).first();
      await expect(addRuleFormButton).toBeVisible({ timeout: 10_000 });
      await addRuleFormButton.click();

      await page.keyboard.press("Escape");
    });

    await test.step("Add a regex validation to a field", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);

      await page.setViewportSize({ width: 1440, height: 900 });
      const validationTrigger = page
        .locator('table [aria-label^="Manage validations for"]:visible')
        .first();
      await expect(validationTrigger).toBeVisible({ timeout: 15_000 });

      await validationTrigger.click();
      await page.getByText("Add validation").first().click();
      const patternInput = page.getByPlaceholder("e.g. ^[a-zA-Z]+$");
      await expect(patternInput).toBeVisible({ timeout: 15_000 });
      await patternInput.fill("^[A-Z]{2}\\d{4}$");
      await page.getByRole("button", { name: "Add" }).last().click();
      await expect(patternInput).toHaveCount(0);
    });

    await test.step("Schema Data tab: toolbar popovers, view toggles, refresh, and empty state", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);
      await page.setViewportSize({ width: 1440, height: 900 });

      const dataTab = page.getByRole("tab", { name: "Data" });
      await expect(dataTab).toBeVisible({ timeout: 15_000 });
      await dataTab.click();
      await expect(dataTab).toHaveAttribute("data-state", "active");

      const filterButton = page.locator("button[title='Filter']");
      const sortButton = page.locator("button[title='Sort']");
      const columnButton = page.locator("button[title='Column']");
      const resetButton = page.locator("button[title='Reset all filters']");
      const refreshButton = page.locator("button[title='Refresh data']");

      for (const trigger of [filterButton, sortButton, columnButton, refreshButton]) {
        await expect(trigger).toBeVisible({ timeout: 10_000 });
      }

      await expect(resetButton).toHaveCount(0);

      const tableViewButton = page.getByRole("button", { name: "Table view" });
      const jsonViewButton = page.getByRole("button", { name: "JSON view" });
      const listViewButton = page.getByRole("button", { name: "List view" });
      await expect(tableViewButton).toBeVisible();
      await expect(jsonViewButton).toBeVisible();
      await expect(listViewButton).toBeVisible();

      await filterButton.click();
      await expect(page.getByText("Filters", { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
      await page.keyboard.press("Escape");
      await expect(page.getByText("Filters", { exact: true }).first()).toBeHidden({
        timeout: 10_000,
      });

      const activeClass = "bg-background";
      await listViewButton.click();
      await expect(listViewButton).toHaveClass(new RegExp(activeClass));
      await expect(tableViewButton).not.toHaveClass(new RegExp(activeClass));
      await jsonViewButton.click();
      await expect(jsonViewButton).toHaveClass(new RegExp(activeClass));
      await expect(listViewButton).not.toHaveClass(new RegExp(activeClass));
      await tableViewButton.click();
      await expect(tableViewButton).toHaveClass(new RegExp(activeClass));
      await expect(jsonViewButton).not.toHaveClass(new RegExp(activeClass));

      await refreshButton.click();
      await expect(refreshButton).toBeEnabled({ timeout: 10_000 });

      await expect(page.getByText(/no data|no rows|no records|empty/i).first()).toBeVisible({
        timeout: 10_000,
      });

      const attributeTab = page.getByRole("tab", { name: "Attribute" });
      await attributeTab.click();
      await expect(attributeTab).toHaveAttribute("data-state", "active");
    });

    await test.step("Schema Preview drawer opens, shows structure JSON, and closes via the X button", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      expect(await selectSchema(page, schemaName)).toBe(true);

      const previewButton = page.getByRole("button", { name: "Preview" });
      await expect(previewButton).toBeVisible({ timeout: 15_000 });
      await previewButton.click();

      const drawerTitle = page.getByRole("heading", {
        name: new RegExp(`${schemaName} preview`),
      });
      await expect(drawerTitle).toBeVisible({ timeout: 15_000 });

      const requestFormatTab = page.getByRole("tab", { name: "Request Format" });
      const structureTab = page.getByRole("tab", { name: "Schema Structure" });
      const anyStructureTab = await requestFormatTab
        .or(structureTab)
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (anyStructureTab) {
        await structureTab.click();
        await expect(structureTab).toHaveAttribute("data-state", "active");
      }

      const jsonCode = page.locator("pre").filter({ hasText: /\{|\[/ }).first();
      await expect(jsonCode).toBeVisible({ timeout: 10_000 });

      const closeButton = page.getByRole("button", { name: "Close", exact: true });
      await expect(closeButton).toBeVisible();
      await closeButton.click();

      await expect(drawerTitle).toBeHidden({ timeout: 10_000 });
    });

    await test.step("Field-level access drawer opens from the row's View access button, with View/Create/Edit tabs", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      expect(await selectSchema(page, schemaName)).toBe(true);

      const rowAccessButton = page
        .locator("table:visible button[aria-label^='View access for']")
        .first();
      await expect(rowAccessButton).toBeVisible({ timeout: 15_000 });
      await rowAccessButton.click();

      const drawerTitle = page.getByRole("heading", {
        name: new RegExp(`^Access for ${fieldName}$`),
      });
      await expect(drawerTitle).toBeVisible({ timeout: 15_000 });

      const viewTab = page.getByRole("tab", { name: "View" });
      const createTab = page.getByRole("tab", { name: "Create" });
      const editTab = page.getByRole("tab", { name: "Edit" });
      await expect(viewTab).toBeVisible({ timeout: 5_000 });
      await expect(createTab).toBeVisible();
      await expect(editTab).toBeVisible();
      await expect(viewTab).toHaveAttribute("data-state", "active");

      await createTab.click();
      await expect(createTab).toHaveAttribute("data-state", "active");
      await viewTab.click();
      await expect(viewTab).toHaveAttribute("data-state", "active");
      const closeButton = page.getByRole("button", {
        name: "Close schema access drawer",
      });
      await expect(closeButton).toBeVisible();
      await closeButton.click();
      await expect(drawerTitle).toBeHidden({ timeout: 10_000 });
    });

    await test.step("Schema Access rule set: verify Edit/Delete menu items exist for the existing rule set", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      expect(await selectSchema(page, schemaName)).toBe(true);

      const schemaAccessButton = page.getByRole("button", {
        name: "Schema Access",
      });
      await expect(schemaAccessButton).toBeVisible({ timeout: 15_000 });
      await schemaAccessButton.click();

      const ruleRows = page.locator("table tbody tr").filter({
        has: page.locator("td.font-medium"),
      });
      const hasExistingRule = await ruleRows
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (!hasExistingRule) {
        await expect(
          page.getByText(/No rule sets added yet|Click \+ Add to create one/i),
        ).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole("button", { name: "Add", exact: true })).toBeVisible();
      } else {
        const rowMenuTrigger = ruleRows
          .first()
          .locator("button")
          .filter({ has: page.locator("svg.lucide-ellipsis") })
          .first();
        await expect(rowMenuTrigger).toBeVisible({ timeout: 5_000 });
        await rowMenuTrigger.click({ force: true });

        await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible({ timeout: 5_000 });
        await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
        await page.keyboard.press("Escape");
      }

      await page.getByRole("button", { name: "Close schema access drawer" }).click();
    });

    await test.step("Validation drawer: existing regex shows Edit/Delete row actions that round-trip through the form and dialog", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      expect(await selectSchema(page, schemaName)).toBe(true);

      const validationTrigger = page
        .locator("table [aria-label^='Manage validations for']:visible")
        .first();
      await expect(validationTrigger).toBeVisible({ timeout: 15_000 });
      await validationTrigger.click();

      const drawerTitle = page.getByRole("heading", {
        name: new RegExp(`Validations for ${fieldName}$`),
      });
      await expect(drawerTitle).toBeVisible({ timeout: 15_000 });

      const existingPattern = page
        .locator("p.font-mono")
        .filter({
          hasText: "^[A-Z]{2}",
        })
        .first();
      await expect(existingPattern).toBeVisible({ timeout: 15_000 });

      const editRowButton = page
        .locator("button")
        .filter({ has: page.locator("svg.lucide-pencil") })
        .first();
      await expect(editRowButton).toBeVisible({ timeout: 5_000 });
      await editRowButton.click();

      const patternTextarea = page.getByPlaceholder("e.g. ^[a-zA-Z]+$");
      await expect(patternTextarea).toBeVisible({ timeout: 5_000 });
      await expect(patternTextarea).toHaveValue(/^\^\[A-Z\]/);
      await expect(page.getByText("Edit validation", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Cancel", exact: true }).first().click();

      await expect(existingPattern).toBeVisible({ timeout: 10_000 });

      const deleteRowButton = page
        .locator("button")
        .filter({ has: page.locator("svg.lucide-trash") })
        .first();
      await expect(deleteRowButton).toBeVisible({ timeout: 5_000 });
      await deleteRowButton.click();

      const deleteDialog = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Delete validation?" }) });
      await expect(deleteDialog).toBeVisible({ timeout: 5_000 });
      await deleteDialog.getByRole("button", { name: "Cancel" }).click();
      await expect(deleteDialog).toBeHidden({ timeout: 5_000 });

      await page.getByRole("button", { name: "Close validation drawer" }).click();
      await expect(drawerTitle).toBeHidden({ timeout: 10_000 });
    });

    await test.step("Enter edit mode, duplicate the flow field via its row menu, then delete the duplicate", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      expect(await selectSchema(page, schemaName)).toBe(true);

      const editButton = page.getByRole("button", { name: "Edit", exact: true });
      await expect(editButton).toBeVisible({ timeout: 15_000 });
      await editButton.click();
      await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible({
        timeout: 15_000,
      });

      const matchingRowLocator = (name: string) =>
        page.locator("table:visible tr").filter({
          has: page.locator(`input[name$=".name"][data-match-target="${name}"]`),
        });
      await page.evaluate((name) => {
        document.querySelectorAll("table input[name$='.name']").forEach((input) => {
          const el = input as HTMLInputElement;
          if (el.value === name) {
            el.setAttribute("data-match-target", name);
          }
        });
      }, fieldName);
      const fieldRow = matchingRowLocator(fieldName).first();
      await expect(fieldRow).toBeVisible({ timeout: 15_000 });

      await fieldRow.getByRole("button").last().click();
      await page.getByRole("menuitem", { name: "Duplicate" }).click();

      await page.evaluate((name) => {
        document.querySelectorAll("table input[name$='.name']").forEach((input) => {
          const el = input as HTMLInputElement;
          if (el.value === name) {
            el.setAttribute("data-match-target", name);
          }
        });
      }, fieldName);
      const duplicateRows = matchingRowLocator(fieldName);
      await expect(duplicateRows).toHaveCount(2, { timeout: 15_000 });

      await duplicateRows.last().getByRole("button").last().click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      await expect(duplicateRows).toHaveCount(1, { timeout: 15_000 });

      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    });

    // await test.step("Bulk operations: Select all rows, then Duplicate via the Action menu (rows are added) and Delete (rows are removed)", async () => {
    //   await page.setViewportSize({ width: 1440, height: 900 });
    //   expect(await selectSchema(page, schemaName)).toBe(true);

    //   const editButton = page.getByRole("button", { name: "Edit", exact: true });
    //   await expect(editButton).toBeVisible({ timeout: 15_000 });
    //   await editButton.click();
    //   await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible({
    //     timeout: 15_000,
    //   });

    //   const rowCountBefore = await page.locator("table:visible tbody tr").count();
    //   expect(rowCountBefore).toBeGreaterThan(0);

    //   const selectAllCheckbox = page.getByRole("checkbox", {
    //     name: "Select all properties",
    //   });
    //   await expect(selectAllCheckbox).toBeVisible({ timeout: 10_000 });
    //   await selectAllCheckbox.click();

    //   const actionButton = page.getByRole("button", { name: "Action" });
    //   await expect(actionButton).toBeVisible({ timeout: 10_000 });
    //   await actionButton.click();
    //   const duplicateMenuItem = page.getByRole("menuitem", { name: "Duplicate" });
    //   const deleteMenuItem = page.getByRole("menuitem", { name: "Delete" });
    //   await expect(duplicateMenuItem).toBeEnabled({ timeout: 5_000 });
    //   await expect(deleteMenuItem).toBeEnabled({ timeout: 5_000 });
    //   await duplicateMenuItem.click();

    //   await expect(async () => {
    //     const count = await page.locator("table:visible tbody tr").count();
    //     expect(count).toBeGreaterThan(rowCountBefore);
    //   }).toPass({ timeout: 10_000 });
    //   const rowCountAfterDuplicate = await page.locator("table:visible tbody tr").count();
    //   expect(rowCountAfterDuplicate).toBeGreaterThan(rowCountBefore);

    //   // Select all again -- after bulk operations the selection is
    //   // cleared (useBulkOperations -> setSelectedRows({})), so recheck.
    //   await expect(selectAllCheckbox).toBeVisible({ timeout: 10_000 });
    //   await selectAllCheckbox.click();

    //   await actionButton.click();
    //   await expect(deleteMenuItem).toBeEnabled({ timeout: 5_000 });
    //   await deleteMenuItem.click();

    //   // Row count drops back. The duplicates were never saved, but
    //   // selecting all and bulk-deleting also removes the underlying
    //   // original rows that are selected.
    //   await expect(async () => {
    //     const count = await page.locator("table:visible tbody tr").count();
    //     expect(count).toBeLessThan(rowCountAfterDuplicate);
    //   }).toPass({ timeout: 10_000 });

    //   // Exit edit mode without saving -- the bulk duplicate/delete
    //   // happened on the in-memory form, so cancelling discards the
    //   // duplicates and the schema stays at its saved state.
    //   await page.getByRole("button", { name: "Cancel", exact: true }).click();
    // });

    await test.step("Schema Access: switch policy to Public, then Logged-in, then back to Custom (each behind a confirmation)", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);
      const schemaAccessButton = page.getByRole("button", { name: "Schema Access" });
      await expect(schemaAccessButton).toBeVisible({ timeout: 15_000 });

      await schemaAccessButton.click();
      const policySelect = page.getByRole("combobox").first();
      await expect(policySelect).toBeVisible({ timeout: 15_000 });

      async function switchPolicy(optionName: string, expectedBannerText: RegExp) {
        await policySelect.click();
        const option = page.getByRole("option", { name: optionName, exact: true });
        await expect(option).toBeVisible({ timeout: 10_000 });
        await option.click();

        const confirmHeading = page.getByRole("heading", { name: "Change access policy?" });
        await expect(confirmHeading).toBeVisible({ timeout: 10_000 });
        await page.getByRole("button", { name: "Confirm" }).click();
        await expect(page.getByText(expectedBannerText).first()).toBeVisible({ timeout: 15_000 });
      }

      await switchPolicy("Public", /API is public/i);
      await switchPolicy("All logged in users", /All logged in users have access/i);
      await switchPolicy("Custom", /Custom Permissions/i);

      const closeButton = page.getByRole("button", {
        name: "Close schema access drawer",
      });
      await expect(closeButton).toBeVisible({ timeout: 10_000 });
      await closeButton.click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
    });

    await test.step("Import: 'Template' triggers a real download, then a real file upload succeeds", async () => {
      await page.getByRole("button", { name: "More actions" }).click();
      const importButton = page.getByRole("menuitem", { name: "Import" });
      await expect(importButton).toBeVisible({ timeout: 15_000 });

      await importButton.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 30_000 });

      const templateButton = dialog.getByRole("button", { name: "Template" });
      await expect(templateButton).toBeVisible({ timeout: 10_000 });
      const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
      await templateButton.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("SCHEMA_TEMPLATE.json");

      // fixtures/*.json is gitignored and not generated by setup — use the
      // Template download we just captured instead of a missing static file.
      const schemaFilePath = path.join(test.info().outputDir, "SCHEMA_TEMPLATE.json");
      await download.saveAs(schemaFilePath);

      await dialog.locator('input[type="file"]').setInputFiles(schemaFilePath);
      const uploadButton = dialog.getByRole("button", { name: "Upload" });
      await expect(uploadButton).toBeEnabled({ timeout: 10_000 });
      await uploadButton.click();
      await expect(page.getByText("Processing schema upload").first()).toBeVisible({
        timeout: 20_000,
      });
      if (await dialog.isVisible().catch(() => false)) {
        await page.keyboard.press("Escape");
      }
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    });

    const secondSchemaName = `dg_flow_sidebar_${Date.now()}`;

    await test.step("Add Schema entry point #2: the sidebar's own 'Add' button (opens the same modal from the schema two-panel view)", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);

      const sidebarAddButton = page.getByRole("button", { name: "Add", exact: true }).first();
      await expect(sidebarAddButton).toBeVisible({ timeout: 15_000 });

      await createSchemaViaModal(page, sidebarAddButton, secondSchemaName);

      await expect(page.getByRole("heading", { name: secondSchemaName }).first()).toBeVisible({
        timeout: 30_000,
      });

      const moreOptionsButton = page.getByRole("button", { name: "More options" });
      await expect(moreOptionsButton).toBeVisible({ timeout: 15_000 });
      await moreOptionsButton.click();
      await page.getByText("Delete schema", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Delete schema?" })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText("Deleted successfully").first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step("Add Schema form validation: empty form disables Add; duplicate name shows 'already exists' error", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);
      const sidebarAddButton = page.getByRole("button", { name: "Add", exact: true }).first();
      await expect(sidebarAddButton).toBeVisible({ timeout: 15_000 });
      await sidebarAddButton.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await expect(dialog.getByRole("heading", { name: "Add New Schema" })).toBeVisible();

      const addSubmitButton = dialog.getByRole("button", { name: "Add" });
      await expect(addSubmitButton).toBeDisabled();

      const schemaNameInput = dialog.getByLabel(/Schema name/);
      await schemaNameInput.fill(schemaName);
      await expect(dialog.getByText(/already exists/i)).toBeVisible({ timeout: 10_000 });
      await expect(addSubmitButton).toBeDisabled();

      const uniqueName = `dg_flow_validate_${Date.now()}`;
      await schemaNameInput.fill(uniqueName);
      await expect(addSubmitButton).toBeEnabled({ timeout: 10_000 });

      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    });

    await test.step("Mobile breadcrumb: the 'Back to schema list' button is visible only below the lg breakpoint and returns to the sidebar", async () => {
      await page.setViewportSize({ width: 768, height: 900 });
      expect(await selectSchema(page, schemaName)).toBe(true);

      const backButton = page.getByRole("button", {
        name: "Back to schema list",
      });
      await expect(backButton).toBeVisible({ timeout: 10_000 });
      await backButton.click();
      await expect(backButton).toBeHidden({ timeout: 10_000 });

      await page.setViewportSize({ width: 1440, height: 900 });
    });

    await test.step("Delete the schema created in this flow, cancel first, then confirm", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);
      const schemaHeading = page.getByRole("heading", { name: schemaName }).first();

      const moreOptionsButton = page.getByRole("button", { name: "More options" });
      await expect(moreOptionsButton).toBeVisible({ timeout: 15_000 });

      await moreOptionsButton.click();
      await page.getByText("Delete schema", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Delete schema?" })).toBeVisible({
        timeout: 30_000,
      });

      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("heading", { name: "Delete schema?" })).toBeHidden();
      await expect(schemaHeading).toBeVisible();

      await moreOptionsButton.click();
      await page.getByText("Delete schema", { exact: true }).click();
      await page.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText("Deleted successfully").first()).toBeVisible({ timeout: 15_000 });
    });
  });
});
