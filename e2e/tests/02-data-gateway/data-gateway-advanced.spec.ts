import { expect, type Locator, type Page, type Route } from "@playwright/test";
import { test } from "../../support/test-base";
import {
  dataGatewaySettledLocator,
  openDataGateway,
  resolveDataProjectId,
  selectSchema,
} from "../../support/open-data-gateway";
import { confirmSchemaStructureSaved } from "../../support/confirm-schema-saved";
import { e2eBaseUrl } from "../../support/env";
import { waitVisible } from "../../support/wait-visible";
import { PlaygroundPage } from "../../pages/PlaygroundPage";

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

/**
 * Names of the schemas this file's tests created and still own. A test pushes
 * a name right after the schema's create succeeds; the afterEach residue
 * guard below empties the list and deletes each listed schema, in order.
 */
const createdSchemas: string[] = [];

test.describe("feature: Data Gateway advanced flows", () => {
  test.setTimeout(480_000);

  // Residue guard (blocks-data#423 §10 step 7, A15): every test in this file
  // pushes each schema name onto createdSchemas as soon as its create
  // succeeds, and the afterEach deletes every listed schema on every path —
  // the normal one and any earlier failure — so a mid-test crash cannot
  // leave a schema behind in the shared project. A test that creates
  // schemas which reference each other pushes the referencing one first,
  // because the list is deleted in order. Best-effort only: cleanup errors
  // are swallowed per name so they never mask the real test failure.
  // #417 and #420 append their names here too.
  test.afterEach(async ({ page }) => {
    const names = createdSchemas.splice(0);
    for (const name of names) {
      try {
        // A failure in a mobile step leaves the small viewport behind.
        await page.setViewportSize({ width: 1440, height: 900 });
        // A failure inside the access-inspector steps leaves the
        // "Save changes?" checkpoint up, which blocks schema selection —
        // discard it before navigating.
        const checkpoint = page.getByRole("heading", { name: "Save changes?" });
        if (await waitVisible(checkpoint, 3_000)) {
          await page.getByRole("button", { name: "Discard" }).click();
        }
        if (await selectSchema(page, name)) {
          await deleteCurrentSchema(page);
        }
      } catch {
        // environment cleanup is best-effort
      }
    }
  });

  async function createSchema(page: Page, name: string, schemaType: "Entity" | "Child" = "Entity") {
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

    if (schemaType === "Child") {
      // The dialog's type select defaults to Entity (AddEditSchemaModal.selectSchemaType).
      await dialog.locator("#schemaType").or(dialog.getByRole("combobox")).first().click();
      await page.getByRole("option", { name: "Child" }).click();
    }

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
      createdSchemas.push(schemaName);
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
      // This is an Entity schema, so indexes are supported and the button
      // must be enabled — an early return here would silently skip the
      // whole index lifecycle this step exists to cover.
      await expect(addIndexButton).toBeEnabled({ timeout: 10_000 });

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

      // Each include option renders a labelled Radix checkbox
      // (export-schema-modal.tsx pairs label htmlFor with export-opt-*
      // checkbox ids) — toggle Access Policies on and off for real.
      const policiesCheckbox = dialog.getByRole("checkbox", { name: "Access Policies" });
      await expect(policiesCheckbox).toBeVisible({ timeout: 10_000 });
      await policiesCheckbox.click();
      await expect(policiesCheckbox).toBeChecked();
      await policiesCheckbox.click();
      await expect(policiesCheckbox).not.toBeChecked();

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
      // The table lists risk-ranked attention items only, and a fresh schema
      // is deliberately not asserted to appear there — the sort control and
      // Exposure column above are this step's coverage.
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
    // The schema itself is deleted by the afterEach residue guard above —
    // on the happy path and after any earlier failure alike.
  });

  // ─── Shared helpers for the week's specs (blocks-data#417, #420, #423) ────

  /**
   * Open toasts. The app shows at most one at a time (use-toast TOAST_LIMIT 1). CSS, not a role
   * query: an open dialog marks the rest of the page aria-hidden, toast viewport included.
   */
  function toasts(page: Page): Locator {
    return page.locator("[role='region'][aria-label^='Notifications'] li[data-state='open']");
  }

  /**
   * Applies a colour scheme for a design screenshot. The account's theme is "Auto" (the overview
   * spec leaves it there), so emulating the media query is enough; when it is not, fall back to the
   * app's theme menu and report that, so the run shows which path took the screenshot.
   */
  async function applyColorScheme(page: Page, scheme: "light" | "dark"): Promise<void> {
    await page.emulateMedia({ colorScheme: scheme });
    const html = page.locator("html");
    const check = () =>
      scheme === "dark"
        ? expect(html).toHaveClass(/\bdark\b/, { timeout: 3_000 })
        : expect(html).not.toHaveClass(/\bdark\b/, { timeout: 3_000 });
    if (await check().then(() => true, () => false)) return;
    test.info().annotations.push({ type: "theme", description: `theme menu used for ${scheme}` });
    await page.getByRole("button", { name: "Change theme" }).click();
    await page.getByText(scheme === "dark" ? "Dark" : "Light", { exact: true }).click();
    await check();
  }

  /**
   * Screenshots one element in the light and the dark theme into this test's output folder (design
   * evidence for the specs' §4; kept with the run's reports, never in the repository). Hovering a
   * toast pauses its auto-dismiss timer, so it stays up for both shots.
   */
  async function screenshotBothThemes(page: Page, target: Locator, name: string): Promise<void> {
    for (const scheme of ["light", "dark"] as const) {
      await applyColorScheme(page, scheme);
      await target.hover().catch(() => {});
      await target.screenshot({ path: test.info().outputPath(`${name}-${scheme}.png`), animations: "disabled" });
    }
    await applyColorScheme(page, "light");
    await page.emulateMedia({ colorScheme: null });
  }

  /**
   * Enters edit mode and starts a new property row named `name`. A late schemaDetails.fields
   * refetch after a save or a create force-exits edit mode (schema-structure.tsx, see the PII step),
   * so retry until the new row holds the name while edit mode is still active.
   */
  async function startNewProperty(page: Page, name: string) {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Let the details refetch settle first: no schema details request for 3 s (at most 30 s).
    let lastDetails = Date.now();
    const onRequest = (request: { url(): string }) => {
      if (new URL(request.url()).pathname.endsWith("/schemas/get-by-id")) lastDetails = Date.now();
    };
    page.on("request", onRequest);
    try {
      await expect.poll(() => Date.now() - lastDetails, { timeout: 30_000, intervals: [500] }).toBeGreaterThan(3_000);
    } catch {
      // still noisy after 30 s: the retry below handles a dropped edit mode
    } finally {
      page.off("request", onRequest);
    }
    await expect(async () => {
      const cancel = page.getByRole("button", { name: "Cancel", exact: true });
      if (!(await cancel.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: "Edit", exact: true }).click();
        await expect(cancel).toBeVisible({ timeout: 10_000 });
      }
      const nameInputs = page.locator("table:visible").getByPlaceholder("Click to edit");
      const last = nameInputs.last();
      if ((await last.inputValue({ timeout: 1_000 }).catch(() => "x")) !== "") {
        await page.getByRole("button", { name: "+ Add property" }).click();
      }
      await expect(last).toBeVisible({ timeout: 5_000 });
      await last.scrollIntoViewIfNeeded();
      await last.fill(name);
      await expect(last).toHaveValue(name);
      await expect(cancel).toBeVisible();
    }).toPass({ timeout: 90_000 });
  }

  /** Adds a property row named `name` and saves it (Save, then Update), retrying a dropped edit mode. */
  async function saveNewProperty(page: Page, name: string) {
    await expect(async () => {
      await startNewProperty(page, name);
      await page.getByRole("button", { name: "Save", exact: true }).click({ timeout: 10_000 });
      await page.getByRole("button", { name: "Update" }).click({ timeout: 10_000 });
    }).toPass({ timeout: 180_000 });
  }

  /** Counts the requests for one schema's details (`/schemas/get-by-id?id=<id>`) until stopped. */
  function countDetailsRequests(page: Page, id: string) {
    let count = 0;
    const onRequest = (request: { url(): string }) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith("/schemas/get-by-id") && url.searchParams.get("id") === id) count++;
    };
    page.on("request", onRequest);
    return {
      stop: () => {
        page.off("request", onRequest);
        return count;
      },
    };
  }

  async function publishPendingSchemas(page: Page, name: string) {
    expect(await selectSchema(page, name)).toBe(true);
    // Publish publishes every pending draft in the shared project (accepted, #423 A15).
    // Exact: sidebar rows of schemas with drafts carry "Unpublished changes" in their name.
    const publishButton = page.getByRole("button", { name: "Publish", exact: true });
    const pendingCount = page.getByText(/\d+ unpublished/);
    await expect(pendingCount).toBeVisible({ timeout: 15_000 });
    await publishButton.click();
    await expect(page.getByText("Schemas published successfully").first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(pendingCount).toBeHidden({ timeout: 15_000 });
  }

  test("list queries read a bounded page: pageSize 0 and 1001 read the cap, invalid paging is refused (#423 H11, C1, C2, C13, C14)", async ({
    page,
  }) => {
    const pageSchema = `dg_page_${ts}`;
    const titleField = `pg_title_${ts}`;
    const playground = new PlaygroundPage(page);
    type GqlBody = {
      data?: Record<string, unknown> | null;
      errors?: Array<{ message?: string; extensions?: { code?: string } }>;
    };
    type ListPage = { items: Array<Record<string, unknown>>; pageSize: number; totalCount: number; hasNextPage: boolean };

    // Sends one query through the playground's own Execute: the next query POST to /gateway gets
    // this body instead of the editor's (introspection POSTs pass through), and the real server
    // answers it (§10 "How queries are sent").
    const send = async (query: string): Promise<{ status: number; body: GqlBody }> => {
      const rewrite = (route: Route) => {
        const request = route.request();
        if (request.method() !== "POST" || (request.postData() ?? "").includes("__schema")) {
          return route.fallback();
        }
        return route.continue({ postData: JSON.stringify({ query }) });
      };
      await page.route("**/gateway", rewrite);
      try {
        const response = await playground.executeQuery();
        return { status: response.status(), body: (await response.json()) as GqlBody };
      } finally {
        await page.unroute("**/gateway", rewrite);
      }
    };
    const statuses: string[] = [];
    let list = "";

    await test.step("Setup: create, add a String field and publish (§10 step 1)", async () => {
      await createSchema(page, pageSchema);
      createdSchemas.push(pageSchema);
      await addStringField(page, titleField);
      await publishPendingSchemas(page, pageSchema);
    });

    await test.step("Find the list and insert fields by introspection (§10 step 2)", async () => {
      await playground.goto(resolveDataProjectId(page) ?? undefined);
      await playground.selectGraphQL();
      const key = `dgpage${ts}`;
      // The gateway serves the published snapshot once it has reloaded it.
      await expect
        .poll(
          async () => {
            const { body } = await send('{ __type(name: "Query") { fields { name } } }');
            const type = body.data?.__type as { fields?: Array<{ name: string }> } | null | undefined;
            list =
              (type?.fields ?? [])
                .map((f) => f.name)
                .find((n) => n.startsWith("get") && n.toLowerCase().replace(/_/g, "").includes(key)) ?? "";
            return list;
          },
          { timeout: 60_000, intervals: [2_000, 5_000] },
        )
        .not.toBe("");
    });

    await test.step("Seed 3 rows tagged mock-data (§10 step 3)", async () => {
      const insert = `insert${list.slice(3, -1)}`;
      const rows = ["r1", "r2", "r3"]
        .map((v, i) => `${"abc"[i]}: ${insert}(input: { ${titleField}: "${v}", Tags: ["mock-data"] }) { acknowledged }`)
        .join(" ");
      const { body } = await send(`mutation { ${rows} }`);
      expect(body.errors).toBeUndefined();
    });

    const readPage = async (paging: string) => {
      const result = await send(`{ ${list}(paging: { ${paging} }) { items { ${titleField} } pageSize totalCount hasNextPage } }`);
      statuses.push(`${paging} -> HTTP ${result.status}`);
      return result;
    };

    await test.step("pageSize 0 and 1001 read the cap of 1000 (H11, C14)", async () => {
      const zero = await readPage("pageNo: 1, pageSize: 0");
      expect(zero.body.errors).toBeUndefined();
      const zeroPage = zero.body.data?.[list] as ListPage;
      expect(zeroPage.items).toHaveLength(3);
      expect(zeroPage.pageSize).toBe(1000);
      expect(zeroPage.totalCount).toBe(3);
      expect(zeroPage.hasNextPage).toBe(false);

      const above = await readPage("pageNo: 1, pageSize: 1001");
      expect(above.body.errors).toBeUndefined();
      const abovePage = above.body.data?.[list] as ListPage;
      expect(abovePage.items).toHaveLength(3);
      expect(abovePage.pageSize).toBe(1000);
    });

    await test.step("Invalid paging answers VALIDATION_ERROR, and the next valid read still works (C1, C2, C13)", async () => {
      const negative = await readPage("pageNo: 1, pageSize: -1");
      expect(negative.body.data?.[list]).toBeNull();
      expect(negative.body.errors?.[0]?.extensions?.code).toBe("VALIDATION_ERROR");
      expect(negative.body.errors?.[0]?.message).toBe("'pageSize' must be 0 or greater.");

      const pageZero = await readPage("pageNo: 0, pageSize: 10");
      expect(pageZero.body.data?.[list]).toBeNull();
      expect(pageZero.body.errors?.[0]?.extensions?.code).toBe("VALIDATION_ERROR");
      expect(pageZero.body.errors?.[0]?.message).toBe("'pageNo' must be 1 or greater.");

      const valid = await readPage("pageNo: 1, pageSize: 1000");
      expect(valid.body.errors).toBeUndefined();
      expect((valid.body.data?.[list] as ListPage).items).toHaveLength(3);

      // C5 evidence: the HTTP status the tenant GraphQL pipeline gives each answer.
      test.info().annotations.push({ type: "C5 observed HTTP status", description: statuses.join("; ") });
    });

    await test.step("Clean the rows through Clean test data, best-effort (§10 step 6)", async () => {
      try {
        await playground.openCleanTestDataModal();
        const dialog = page.getByRole("dialog");
        const row = dialog.locator("label").filter({ hasText: pageSchema }).filter({ hasText: "(3 records)" });
        if (await waitVisible(row, 15_000)) {
          await row.click();
          await dialog.getByRole("button", { name: "Delete" }).click();
          await expect(page.getByText(/Successfully deleted test data/).first()).toBeVisible({ timeout: 30_000 });
        } else {
          await playground.closeCleanTestDataModal();
        }
      } catch {
        // best-effort: the residue guard deletes the schema, which drops its rows too
      }
    });
  });

  test("schema not found: 404 contract, not-found panel, unavailable tree row, no refetch after delete (#420)", async ({
    page,
  }) => {
    const nfSchema = `dg_nf_${ts}`;
    const dtoSchema = `dg_nf_dto_${ts}`;
    const entSchema = `dg_nf_ent_${ts}`;
    const objField = `nf_obj_${ts}`;
    // §6.1: every schema-not-found endpoint answers this body with HTTP 404.
    const notFoundBody = { isSuccess: false, message: "Schema not found", httpStatusCode: 404, data: null, errors: null };
    const fulfillNotFound = (route: Route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify(notFoundBody) });
    // C2: no schema endpoint may answer 204 any more.
    const noContent: string[] = [];
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (url.pathname.includes("/api/schemas") && response.status() === 204) {
        noContent.push(`${response.request().method()} ${url.pathname}`);
      }
    });
    let schemaId = "";
    let origin = "";
    let replayHeaders: Record<string, string> = {};
    let fieldsBody: unknown;

    await test.step("Create the schema and capture its details request (H1)", async () => {
      await createSchema(page, nfSchema);
      createdSchemas.push(nfSchema);
      schemaId = new URL(page.url()).searchParams.get("schemaId") ?? "";
      expect(schemaId).not.toBe("");
      const [request] = await Promise.all([
        page.waitForRequest((r) => {
          const url = new URL(r.url());
          return url.pathname.endsWith("/schemas/get-by-id") && url.searchParams.get("id") === schemaId;
        }),
        page.reload(),
      ]);
      origin = new URL(request.url()).origin;
      // page.request sends the context cookies itself; never log these headers.
      replayHeaders = Object.fromEntries(
        Object.entries(await request.allHeaders()).filter(
          ([name]) => !["host", "cookie", "content-length"].includes(name) && !name.startsWith(":"),
        ),
      );
      const response = await request.response();
      expect(response?.status()).toBe(200);
      expect(((await response!.json()) as { data: { id: string } }).data.id).toBe(schemaId);
    });

    await test.step("A real save, keeping its body (H13)", async () => {
      const fieldsRequest = page.waitForRequest(
        (r) => r.method() === "POST" && new URL(r.url()).pathname.endsWith("/schemas/fields"),
      );
      await addStringField(page, `nf_field_${ts}`);
      fieldsBody = (await fieldsRequest).postDataJSON();
    });

    await test.step("A save answered 404 shows the no-longer-exists toast and leaves the schema (H9)", async () => {
      // The mocked 404 proves the client handling only; step 5 proves the server's.
      await page.route("**/api/schemas/fields", fulfillNotFound);
      try {
        await saveNewProperty(page, `nf_gone_${ts}`);
        const toast = toasts(page).filter({ hasText: "This schema no longer exists" });
        await expect(toast).toBeVisible({ timeout: 15_000 });
        await screenshotBothThemes(page, toast, "420-toast-schema-no-longer-exists");
        await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
        await expect(page).not.toHaveURL(/schemaId=/);
        await expect(dataGatewaySettledLocator(page)).toBeVisible({ timeout: 30_000 });
      } finally {
        await page.unroute("**/api/schemas/fields", fulfillNotFound);
      }
      expect(await selectSchema(page, nfSchema)).toBe(true);
    });

    await test.step("Delete does not refetch the deleted schema (H11, C9)", async () => {
      const details = countDetailsRequests(page, schemaId);
      await deleteCurrentSchema(page);
      // The absence of a refetch can only be observed over time; §10 step 4 fixes the window at 5 s.
      await page.waitForTimeout(5_000);
      expect(details.stop()).toBe(0);
      await expect(page).not.toHaveURL(/schemaId=/);
    });

    await test.step("The server answers 404 with the §6.1 body (H2, H3, C2)", async () => {
      const options = { headers: replayHeaders, failOnStatusCode: false };
      const started = Date.now();
      const get = await page.request.get(`${origin}/api/schemas/get-by-id?id=${encodeURIComponent(schemaId)}`, options);
      test.info().annotations.push({ type: "get-by-id 404 timing (informational)", description: `${Date.now() - started} ms` });
      const post = await page.request.post(`${origin}/api/schemas/fields`, { ...options, data: fieldsBody });
      const del = await page.request.delete(`${origin}/api/schemas?id=${encodeURIComponent(schemaId)}`, options);
      for (const [label, response] of [["GET get-by-id", get], ["POST fields", post], ["DELETE schemas", del]] as const) {
        expect(response.status(), label).toBe(404);
        expect(await response.json(), label).toEqual(notFoundBody);
      }
    });

    const notFoundUrl = () =>
      `${e2eBaseUrl()}/app/${resolveDataProjectId(page)}/data-gateway?type=all&schemaId=${schemaId}`;
    const panel = page.locator("output:visible").filter({ has: page.getByRole("heading", { name: "Schema not found" }) });
    const backToSchemas = page.getByRole("button", { name: "Back to schemas" });

    await test.step("A deleted schema's link shows the not-found panel after one request (H4, H5, C6)", async () => {
      const url = notFoundUrl();
      const details = countDetailsRequests(page, schemaId);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await expect(backToSchemas).toBeVisible();
      await expect(page.getByRole("button", { name: "More options" })).toHaveCount(0);
      // A 404 is not retried or refetched: exactly one request over §10 step 6's 5 s window.
      await page.waitForTimeout(5_000);
      expect(details.stop()).toBe(1);
      await screenshotBothThemes(page, panel, "420-not-found-panel-desktop");
      await backToSchemas.click();
      await expect(page).not.toHaveURL(/schemaId=/);
      await expect(dataGatewaySettledLocator(page)).toBeVisible({ timeout: 30_000 });
    });

    await test.step("Mobile: the panel, its button and the back arrow (H4)", async () => {
      const url = notFoundUrl();
      await page.setViewportSize({ width: 390, height: 844 });
      try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await expect(panel).toBeVisible({ timeout: 30_000 });
        await expect(backToSchemas).toBeVisible();
        await expect(page.getByRole("button", { name: "Back to schema list" })).toBeVisible();
        await screenshotBothThemes(page, panel, "420-not-found-panel-mobile");
      } finally {
        await page.setViewportSize({ width: 1440, height: 900 });
      }
    });

    await test.step("A child schema that is gone shows one unavailable row in the tree (H7)", async () => {
      // The entity references the DTO, so it is deleted first.
      createdSchemas.push(entSchema, dtoSchema);
      await createSchema(page, dtoSchema, "Child");
      // A Child schema with no fields opens edit mode with one empty row, which startNewProperty
      // fills (addStringField would add a second row and leave the empty one blocking Save).
      await saveNewProperty(page, `nf_dto_field_${ts}`);
      await confirmSchemaStructureSaved(page);
      await createSchema(page, entSchema);

      await startNewProperty(page, objField);
      const typeCombo = page
        .locator("table:visible")
        .getByRole("combobox")
        .filter({ hasText: /Select type|^String$/i })
        .last();
      await typeCombo.click();
      await expect(page.getByText("Child Types")).toBeVisible({ timeout: 10_000 });
      const search = page.getByPlaceholder("Search…");
      if (await waitVisible(search, 2_000)) await search.fill(dtoSchema);
      await page.locator("[cmdk-item], [role='option']").filter({ hasText: dtoSchema }).first().click();
      await page.getByRole("button", { name: "Save", exact: true }).click({ timeout: 15_000 });
      await page.getByRole("button", { name: "Update" }).click({ timeout: 15_000 });
      await confirmSchemaStructureSaved(page);

      const parentId = new URL(page.url()).searchParams.get("schemaId");
      expect(parentId).toBeTruthy();
      // A top-level property's toggle is named after its child schema ("Expand <schema> attributes",
      // SCHEMA_DESKTOP_ROW.EXPAND_SCHEMANAME_ATTRIBUTES); "Expand <path>" (§10 step 8) names nested rows.
      const expand = page.getByRole("button", { name: `Expand ${dtoSchema} attributes` });
      await expect(expand).toBeVisible({ timeout: 30_000 });
      const detailsExceptParent = (route: Route) =>
        new URL(route.request().url()).searchParams.get("id") === parentId ? route.fallback() : fulfillNotFound(route);
      await page.route("**/api/schemas/get-by-id**", detailsExceptParent);
      try {
        await expand.click();
        const unavailable = page.getByText("This schema no longer exists", { exact: true }).locator("visible=true");
        await expect(unavailable).toHaveCount(1, { timeout: 15_000 });
        await expect(page.getByText("Loading fields…").locator("visible=true")).toHaveCount(0);
        await screenshotBothThemes(page, page.locator("table:visible").first(), "420-tree-unavailable-row");
      } finally {
        await page.unroute("**/api/schemas/get-by-id**", detailsExceptParent);
      }
    });

    expect(noContent, "schema endpoints answered 204").toEqual([]);
  });

});
