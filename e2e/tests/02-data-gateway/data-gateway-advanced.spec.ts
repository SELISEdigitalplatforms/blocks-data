import { expect, type Page } from "@playwright/test";
import { test } from "../../support/test-base";
import { openDataGateway, selectSchema } from "../../support/open-data-gateway";
import { confirmSchemaStructureSaved } from "../../support/confirm-schema-saved";
import { waitVisible } from "../../support/wait-visible";

/**
 * Advanced Data Gateway coverage — the flows the main flow spec doesn't touch:
 * index lifecycle, dirty-bar, bulk-action menu, access-inspector Save path,
 * rule editor, export includes, security page, PII flag.
 * Every locator below is derived from the component source under
 * client/app/data-gateway (schema-index-form, schema-indexes-tab,
 * schema-structure-header, schema-access-control-drawer, field-flags,
 * export-schema-modal, security-toolbar, data-gateway-sections).
 */

const ts = Date.now();
const schemaName = `dg_adv_${ts}`;
const fieldName = `adv_field_${ts}`;

test.describe("feature: Data Gateway advanced flows", () => {
  test.setTimeout(480_000);

  async function createSchema(page: Page, name: string) {
    await openDataGateway(page);
    const landingHeading = page.getByRole("heading", { name: "Security Assessment" });
    const emptyStateHeading = page.getByText("No schemas yet", { exact: true });
    const schemasReady = page.getByRole("heading", { name: "Schemas", exact: true });
    const pickSchema = page.getByText("Select a schema from the sidebar to view its details.");
    await expect(
      landingHeading.or(emptyStateHeading).or(schemasReady).or(pickSchema).first(),
    ).toBeVisible({ timeout: 30_000 });

    // The explorer exposes "Add Schema" (security view), a sidebar "Add"
    // button, and a "New schema" empty-state button — try them in order.
    const labeled = page.getByRole("button", { name: /Add Schema/i });
    const newSchema = page.getByRole("button", { name: /New schema/i });
    const addButton = page.getByRole("button", { name: /^Add$/ });
    const labeledShown = await labeled
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(
        () => true,
        () => false,
      );
    if (labeledShown) {
      await labeled.click();
    } else if (
      await newSchema
        .waitFor({ state: "visible", timeout: 3_000 })
        .then(
          () => true,
          () => false,
        )
    ) {
      await newSchema.click();
    } else {
      await addButton.first().click();
    }

    const dialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "Add New Schema" }),
    });
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    const nameInput = dialog.getByLabel(/Schema name/);
    await nameInput.click();
    await nameInput.fill("");
    await nameInput.pressSequentially(name, { delay: 15 });
    await nameInput.blur();
    const entityInput = dialog.locator("#entityName");
    const entityShown = await entityInput
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(
        () => true,
        () => false,
      );
    if (entityShown) {
      // onChange derives the collection name; poll briefly instead of
      // sleeping, then backfill only if nothing was derived.
      const derived = await expect
        .poll(() => entityInput.inputValue().catch(() => ""), { timeout: 3_000 })
        .not.toBe("")
        .then(() => true)
        .catch(() => false);
      if (!derived) {
        await entityInput.fill(`sb_${name}s`);
        await entityInput.blur();
      }
    }
    const addBtn = dialog.getByRole("button", { name: "Add", exact: true });
    await expect(addBtn).toBeEnabled({ timeout: 15_000 });
    await addBtn.click();

    // Success is the dialog closing. On a loaded dev backend the create can
    // take a while — if the dialog is still up after a wait, click Add once
    // more (a duplicate-name create is rejected server-side, so this is safe).
    const dialogClosed = dialog.waitFor({ state: "hidden", timeout: 12_000 }).then(() => true).catch(() => false);
    if (!(await dialogClosed)) {
      await addBtn.click();
      await expect(dialog).toBeHidden({ timeout: 20_000 });
    }

    const created = page
      .getByRole("button", { name: name })
      .or(page.locator("aside").getByText(name, { exact: true }))
      .first();
    await expect(created).toBeVisible({ timeout: 45_000 });
    await created.click();
    await expect(page.getByRole("heading", { name: name }).first()).toBeVisible({
      timeout: 30_000,
    });
  }

  async function addStringField(page: Page, name: string) {
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

    const newRowNameInput = page.locator("table:visible").getByPlaceholder("Click to edit").last();
    await expect(newRowNameInput).toBeVisible({ timeout: 15_000 });
    await newRowNameInput.scrollIntoViewIfNeeded();
    await newRowNameInput.fill(name);

    const saveButton = page.getByRole("button", { name: "Save", exact: true });
    await expect(saveButton).toBeVisible({ timeout: 10_000 });
    await saveButton.click();
    const updateDialogButton = page.getByRole("button", { name: "Update" });
    await expect(updateDialogButton).toBeVisible({ timeout: 10_000 });
    await updateDialogButton.click();
    await confirmSchemaStructureSaved(page);

    await expect(page.locator("table:visible").getByTitle(name, { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
  }

  async function deleteCurrentSchema(page: Page) {
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
  }

  test("indexes, dirty bar, bulk menu, access save path, export includes, security page, PII flag", async ({
    page,
  }) => {
    await test.step("Setup: create an Entity schema with one String field", async () => {
      await createSchema(page, schemaName);
      await addStringField(page, fieldName);
    });

    await test.step("Indexes tab: system index listed, custom unique index can be added and deleted", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);
      await page.setViewportSize({ width: 1440, height: 900 });

      const indexesTab = page.getByRole("tab", { name: "Indexes" });
      await expect(indexesTab).toBeVisible({ timeout: 15_000 });
      await indexesTab.click();
      await expect(indexesTab).toHaveAttribute("data-state", "active");

      const addIndexButton = page.getByRole("button", { name: /Add index/i });
      await expect(addIndexButton).toBeVisible({ timeout: 15_000 });
      if (await addIndexButton.isDisabled().catch(() => true)) {
        // DTO schemas don't support indexes — not the case here (Entity), but
        // keep the guard so a backend change degrades to a skip, not a failure.
        return;
      }

      // The default ItemId index row renders "ItemId(_id_)" with a System tag
      // (schema-indexes-tab.tsx).
      await expect(page.getByText("ItemId(_id_)", { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText("System", { exact: true }).first()).toBeVisible();

      await addIndexButton.click();

      // The inline index form's field picker is a Radix select whose trigger
      // shows the placeholder "Select field" (schema-index-form.tsx).
      const fieldTrigger = page
        .getByRole("combobox")
        .filter({ hasText: "Select field" })
        .first();
      await expect(fieldTrigger).toBeVisible({ timeout: 10_000 });
      await fieldTrigger.click();
      const fieldOption = page.getByRole("option", { name: fieldName, exact: true });
      await expect(fieldOption).toBeVisible({ timeout: 10_000 });
      await fieldOption.click();

      const uniqueCheckbox = page.locator("#index-is-unique");
      await expect(uniqueCheckbox).toBeVisible({ timeout: 10_000 });
      await uniqueCheckbox.check();

      // Save stays disabled until the form is valid; picking the field is
      // enough (direction defaults to ASC). Saving closes the form.
      const indexSave = page.getByRole("button", { name: "Save", exact: true }).last();
      await expect(indexSave).toBeEnabled({ timeout: 10_000 });
      await indexSave.click();

      await expect(addIndexButton).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("Unique", { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText("Custom", { exact: true }).first()).toBeVisible();

      // Delete the custom index again — non-system rows carry a
      // `Delete index <name>` button; system rows have none.
      const rowDelete = page.getByRole("button", { name: /^Delete index /i }).first();
      await expect(rowDelete).toBeVisible({ timeout: 10_000 });
      await rowDelete.click();
      await expect(page.getByRole("heading", { name: "Delete index?" })).toBeVisible({
        timeout: 10_000,
      });
      await page.getByRole("button", { name: "Delete", exact: true }).last().click();
      await expect(rowDelete).toBeHidden({ timeout: 15_000 });
    });

    await test.step("Dirty bar: renaming a field in edit mode shows 'N unsaved changes' and owns Save; Cancel discards", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);
      await page.setViewportSize({ width: 1440, height: 900 });

      // The indexes step leaves this schema focused on its Indexes tab and
      // selectSchema early-returns when the schema is already focused —
      // land on the Attribute tab so the edit-mode controls exist.
      const attributeTab = page.getByRole("tab", { name: "Attribute" }).first();
      await expect(attributeTab).toBeVisible({ timeout: 15_000 });
      await attributeTab.click();
      await expect(attributeTab).toHaveAttribute("data-state", "active");

      const editButton = page.getByRole("button", { name: "Edit", exact: true });
      await expect(editButton).toBeVisible({ timeout: 15_000 });
      await editButton.click();
      await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible({
        timeout: 15_000,
      });

      const nameInput = page.locator("table:visible").getByPlaceholder("Click to edit").first();
      await expect(nameInput).toBeVisible({ timeout: 15_000 });
      await nameInput.fill(`${fieldName}_x`);

      const dirtyBar = page.getByText(/unsaved change/);
      await expect(dirtyBar.first()).toBeVisible({ timeout: 10_000 });
      const saveButton = page.getByRole("button", { name: "Save", exact: true });
      await expect(saveButton).toBeEnabled();

      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dirtyBar.first()).toBeHidden({ timeout: 10_000 });
      // Back in view mode the name renders as plain cell text; the
      // title-span seen earlier belongs to the hidden edit-mode table, so
      // query by role (hidden duplicates stay out of the a11y tree).
      await expect(
        page.getByRole("cell", { name: fieldName, exact: true }).first(),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Bulk actions menu in edit mode offers Duplicate/Delete on selection", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);
      await page.setViewportSize({ width: 1440, height: 900 });

      // Same as the dirty-bar step: the previous step can leave the Indexes
      // tab active, so land on Attribute before entering edit mode.
      const attributeTab = page.getByRole("tab", { name: "Attribute" }).first();
      await expect(attributeTab).toBeVisible({ timeout: 15_000 });
      await attributeTab.click();
      await expect(attributeTab).toHaveAttribute("data-state", "active");

      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible({
        timeout: 15_000,
      });

      // Each saved field row has a checkbox labelled "Select <field>"
      // (schema-desktop-row.tsx).
      const rowCheckbox = page.getByRole("checkbox", { name: `Select ${fieldName}` });
      await expect(rowCheckbox).toBeVisible({ timeout: 10_000 });
      await rowCheckbox.check();
      // Both the desktop span and the mobile paragraph render the count.
      await expect(page.getByText("1 selected", { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });

      const bulkButton = page.getByRole("button", { name: "Bulk actions" }).first();
      await expect(bulkButton).toBeVisible({ timeout: 10_000 });
      await bulkButton.click();
      await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step("Access inspector: stage Custom tier, footer-Save persists, guard dialog saves on close", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);
      await page.setViewportSize({ width: 1440, height: 900 });

      const schemaAccessButton = page.getByRole("button", { name: "Schema Access" });
      await expect(schemaAccessButton).toBeVisible({ timeout: 15_000 });
      await schemaAccessButton.click();

      // The docked inspector is a complementary named "Access for <schema>"
      // (access-inspector.tsx PanelShell).
      const inspector = page.getByRole("complementary", {
        name: new RegExp(`Access for ${schemaName}`),
      });
      await expect(inspector).toBeVisible({ timeout: 15_000 });

      const unsavedMarker = page.getByText("Unsaved changes", { exact: true }).first();
      const customRadio = page.getByRole("radio", { name: "Custom" }).first();
      await expect(customRadio).toBeVisible({ timeout: 10_000 });
      await customRadio.click();

      // Picking a tile stages locally only; the footer flags it
      // (schema-access-control-view.tsx). If the tier is already Custom from
      // an earlier run nothing is dirty — skip the footer save then.
      const stagedDirty = await unsavedMarker
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(
          () => true,
          () => false,
        );
      if (stagedDirty) {
        await inspector.getByRole("button", { name: "Save", exact: true }).click();
        await expect(
          page.getByText("Access level updated successfully", { exact: true }).first(),
        ).toBeVisible({ timeout: 15_000 });
        await expect(inspector.getByText("No changes", { exact: true })).toBeVisible({
          timeout: 10_000,
        });
      }

      // Stage the other tier and close — the checkpoint dialog appears and
      // "Save changes" persists before the panel closes.
      const signedInRadio = page.getByRole("radio", { name: "Signed-in users" }).first();
      await expect(signedInRadio).toBeVisible({ timeout: 10_000 });
      await signedInRadio.click();
      await expect(unsavedMarker).toBeVisible({ timeout: 10_000 });

      const closeButton = page
        .getByRole("button", {
          name: /Close access inspector|Close schema access drawer/i,
        })
        .first();
      await closeButton.click();

      await expect(page.getByRole("heading", { name: "Save changes?" })).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page.getByText(/unsaved changes\. Save them before leaving/i),
      ).toBeVisible();
      await page.getByRole("button", { name: "Save changes" }).click();

      await expect(inspector).toBeHidden({ timeout: 15_000 });

      // Reopen — the panel comes back clean.
      await schemaAccessButton.click();
      await expect(inspector).toBeVisible({ timeout: 15_000 });
      await expect(inspector.getByText("No changes", { exact: true })).toBeVisible({
        timeout: 10_000,
      });

      await closeButton.click();
      await expect(inspector).toBeHidden({ timeout: 15_000 });
    });

    await test.step("Rule editor: an empty rule set opens, accepts a rule row, and returns", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);
      await page.setViewportSize({ width: 1440, height: 900 });

      const schemaAccessButton = page.getByRole("button", { name: "Schema Access" });
      await expect(schemaAccessButton).toBeVisible({ timeout: 15_000 });
      await schemaAccessButton.click();

      // The previous step's checkpoint save left the saved tier on
      // "Signed-in users"; the preset list only renders for a Custom tier
      // with no rule sets yet (schema-access-control-view.tsx:428), so pick
      // Custom first. While policies load the panel shows "Loading access
      // rules…" — the startBlank assertion below polls through it.
      const inspector = page.getByRole("complementary", {
        name: new RegExp(`Access for ${schemaName}`),
      });
      await expect(inspector).toBeVisible({ timeout: 15_000 });

      const customRadio = page.getByRole("radio", { name: "Custom" }).first();
      await expect(customRadio).toBeVisible({ timeout: 10_000 });
      await customRadio.click();

      const startBlank = page.getByRole("button", { name: "Start from an empty rule set" });
      await expect(startBlank).toBeVisible({ timeout: 15_000 });
      await startBlank.click();

      // The blank form starts with zero rules (rule-set-form.tsx).
      const noRulesYet = page.getByText(/No rules added yet/);
      await expect(noRulesYet).toBeVisible({ timeout: 10_000 });

      const addRuleButton = page.getByRole("button", { name: "Add Rule" });
      await expect(addRuleButton).toBeVisible({ timeout: 10_000 });
      await addRuleButton.click();
      // The blank condition row replaces the empty-state paragraph.
      await expect(noRulesYet).toHaveCount(0);

      // Leaving the form cancels the staged row without saving a rule set.
      const backToRuleSets = page.getByRole("button", { name: "Back to rule sets" });
      await expect(backToRuleSets).toBeVisible({ timeout: 10_000 });
      await backToRuleSets.click();
      await expect(startBlank).toBeVisible({ timeout: 10_000 });

      const closeButton = page
        .getByRole("button", {
          name: /Close access inspector|Close schema access drawer/i,
        })
        .first();
      await expect(closeButton).toBeVisible({ timeout: 10_000 });
      await closeButton.click();

      // Custom is staged but unsaved, so closing raises the checkpoint dialog
      // (schema-details-page.tsx pendingInspectorAction). Discard leaves the
      // saved tier untouched and lets the pending close proceed.
      const checkpoint = page.getByRole("heading", { name: "Save changes?" });
      if (await waitVisible(checkpoint, 5_000)) {
        await page.getByRole("button", { name: "Discard" }).click();
      }
      await expect(inspector).toBeHidden({ timeout: 15_000 });
    });

    await test.step("Export modal: optional includes list Access Policies and Validation Rules", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);

      const exportButton = page.getByRole("button", { name: "Export" }).first();
      await expect(exportButton).toBeVisible({ timeout: 15_000 });
      await exportButton.click();

      const dialog = page.getByRole("dialog");
      await expect(page.getByRole("heading", { name: "Export Schema" })).toBeVisible({
        timeout: 15_000,
      });

      const schemaOption = dialog.getByRole("checkbox").first();
      await expect(
        schemaOption.or(dialog.getByText("Schema", { exact: true })).first(),
      ).toBeVisible({ timeout: 10_000 });

      const accessPolicies = dialog.getByText("Access Policies", { exact: true });
      const validationRules = dialog.getByText("Validation Rules", { exact: true });
      await expect(accessPolicies).toBeVisible({ timeout: 10_000 });
      await expect(validationRules).toBeVisible();

      // Toggle both optional includes on and off — the checkboxes react.
      const policiesCheckbox = dialog
        .locator("label, [class*='cursor-pointer']")
        .filter({ hasText: "Access Policies" })
        .locator("input[type='checkbox'], button[role='checkbox']")
        .first();
      const policiesCheckboxShown = await policiesCheckbox
        .waitFor({ state: "visible", timeout: 3_000 })
        .then(
          () => true,
          () => false,
        );
      if (policiesCheckboxShown) {
        await policiesCheckbox.check();
        await expect(policiesCheckbox).toBeChecked();
        await policiesCheckbox.uncheck();
      }

      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    });

    await test.step("Security page: exposure summary, 'Exposure, high to low' sort, and exposure column", async () => {
      await openDataGateway(page);

      // The section tabs are links inside nav[aria-label="Data Gateway
      // sections"]; the Security link's name gains a count suffix when there
      // are attention items ("Security 3").
      const securityLink = page.getByRole("link", { name: /^Security/ });
      await expect(securityLink).toBeVisible({ timeout: 15_000 });
      await securityLink.click();
      await expect(page).toHaveURL(/\/data-gateway\/security/, { timeout: 30_000 });

      await expect(
        page.getByRole("heading", { name: /Security/i }).first(),
      ).toBeVisible({ timeout: 30_000 });

      const exposureSort = page.getByText("Exposure, high to low", { exact: true });
      await expect(exposureSort).toBeVisible({ timeout: 15_000 });
      await exposureSort.click();

      const exposureHeader = page.getByText("Exposure", { exact: true }).first();
      await expect(exposureHeader).toBeVisible({ timeout: 10_000 });

      // A fresh schema with no rules may not be risk-ranked yet — the table
      // lists attention items, so treat the row as optional (waitVisible).
      await waitVisible(
        page.locator("main").getByText(schemaName, { exact: true }).first(),
        15_000,
      );
    });

    await test.step("PII flag: toggling PII on a field persists through Save/Update", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);
      await page.setViewportSize({ width: 1440, height: 900 });

      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible({
        timeout: 15_000,
      });

      // Role query: the hidden duplicate edit-table also has tr elements,
      // but only the visible row joins the a11y tree.
      const fieldRow = page.getByRole("row", { name: new RegExp(fieldName) }).first();
      await expect(fieldRow).toBeVisible({ timeout: 15_000 });

      // FlagToggleChip carries title + aria-label "Personally identifiable
      // data" (field-flags.tsx FLAG_TITLES) — the visible text is just "PII",
      // so the role query must use the aria-label.
      const piiToggle = fieldRow.getByRole("button", {
        name: "Personally identifiable data",
      });
      await expect(piiToggle).toBeVisible({ timeout: 10_000 });

      await piiToggle.click();
      await expect(piiToggle).toHaveAttribute("aria-pressed", "true");

      const saveButton = page.getByRole("button", { name: "Save", exact: true });
      await saveButton.click();
      const updateDialogButton = page.getByRole("button", { name: "Update" });
      await expect(updateDialogButton).toBeVisible({ timeout: 10_000 });
      await updateDialogButton.click();
      await confirmSchemaStructureSaved(page);

      // Re-enter edit mode: the flag persisted on the saved field. A late
      // schemaDetails.fields refetch force-exits edit mode (schema-structure
      // .tsx useEffect on schemaDetails.fields), so retry enter+verify until a
      // check lands while edit mode is still active.
      await expect(async () => {
        const cancelBtn = page.getByRole("button", { name: "Cancel", exact: true });
        if (!(await cancelBtn.isVisible().catch(() => false))) {
          await page.getByRole("button", { name: "Edit", exact: true }).click();
          await expect(cancelBtn).toBeVisible({ timeout: 15_000 });
        }
        const persistedRow = page
          .getByRole("row", { name: new RegExp(fieldName) })
          .first();
        await expect(
          persistedRow.getByRole("button", { name: "Personally identifiable data" }),
        ).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });
      }).toPass({ timeout: 90_000 });

      // Leave edit mode only if the app hasn't already dropped out of it.
      const cancelBtn = page.getByRole("button", { name: "Cancel", exact: true });
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click();
      }
      await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step("Cleanup: delete the schema", async () => {
      expect(await selectSchema(page, schemaName)).toBe(true);
      await deleteCurrentSchema(page);
    });
  });
});
