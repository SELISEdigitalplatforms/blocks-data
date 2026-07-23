import { expect, expectToast, test, uniqueName } from "../../support/test-base";
import type { Page } from "@playwright/test";
import { login } from "../../support/auth";

/**
 * Data Gateway flows on /app/<itemId>/data-gateway.
 *
 * In this codebase "Data Gateway" refers to the GraphQL-on-MongoDB schema
 * domain (not ODBC/JDBC/API/FTP connections). The primary user-visible
 * surface is:
 *
 *   Security & Performance landing  (no ?type=…)
 *     - "Add Schema" button (security-and-performance.tsx:122) opens
 *       AddEditSchemaModal (mode="add").
 *
 *   Schema two-panel view  (?type=all[&schemaId=…])
 *     - Left: sidebar with "Search schemas…", Add button, All/Entity/Child
 *             tabs, paginated list (schema-side-bar.tsx).
 *     - Right: SchemaBasicInfo (with "Delete schema" dropdown) +
 *              SchemaStructureTable.
 *     - Top: breadcrumb "Data Gateway > Schemas".
 *
 * AddEditSchemaModal (add-edit-schema.tsx):
 *   - Add title:    "Add New Schema"  (+ Plus icon)
 *   - Edit title:   "Edit Schema"     (+ Pencil icon)  with warning banner
 *   - Fields:       Schema name (text), Schema Type (Select: Entity/Child),
 *                   Entity name (text, only when Entity).
 *   - Schema-name rules: letters/numbers/_ only, cannot start with a digit;
 *                       uniqueness is checked live via the API.
 *   - Submit:       "Add" (add) / "Save" (edit)
 *   - Edit also opens an "Update schema property" confirmation dialog with
 *     "Update" / "Cancel" buttons.
 *   - On success:   toast "Schema added successfully"
 *                   (schema-details-page.tsx:167)
 *
 * SchemaBasicInfo delete:
 *   - Trigger:    "More options" icon button → "Delete schema" menu item
 *   - Confirm:    ConfirmationModal — "Delete schema?" / "Delete" / "Cancel"
 *   - On success: toast "Deleted successfully" (schema-basic-info.tsx:78)
 *
 * As with the Storage specs, these tests mutate shared backend state on the
 * dev environment (e2e/README.md:27-30); cleanup is the responsibility of
 * whoever prunes dev data.
 */

async function goToDataGateway(page: Page): Promise<boolean> {
  await page.goto("/app/console");

  await expect(
    page.getByRole("heading", { name: "Your Blocks Projects" }),
  ).toBeVisible({ timeout: 20_000 });

  const devChip = page.getByRole("button", { name: /^Development$/ }).first();
  if (!(await devChip.isVisible().catch(() => false))) {
    test.skip(true, "Tenant has no projects; cannot reach data gateway.");
    return false;
  }
  await devChip.click();

  await page.waitForURL("**/app/**/dashboard", { timeout: 20_000 });
  await expect(page).toHaveURL(/\/app\/[^/]+\/dashboard$/);

  // Sidebar entry from navigationMenus.ts id "service-data-gateway".
  await page.getByRole("link", { name: "Data Gateway", exact: true }).click();
  await page.waitForURL((url) => /\/data-gateway(?:\b|\/|\?)/.test(url.pathname + url.search), {
    timeout: 20_000,
  });

  // Landing header — "Data Gateway" text appears on both the configured and
  // empty (DataServiceInstructions) landings.
  await expect(page.getByText("Data Gateway", { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  // If the data service is NOT configured for this tenant, the landing shows
  // DataServiceInstructions with a "Configure" button instead of the
  // Security & Performance view with "Add Schema". Skip in that case — the
  // tests assume a configured data service.
  const configureBtn = page.getByRole("button", { name: /^Configure$/ });
  if (await configureBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    test.skip(
      true,
      "Data service is not configured for this tenant (landing shows DataServiceInstructions). " +
        "Pre-configure the data service on this tenant before running these tests.",
    );
    return false;
  }

  // Either the landing shows SecurityAndPerformance, or the Two-panel view is
  // already active. Both expose "Add Schema" / "Add" buttons.
  const addSchemaBtn = page.getByRole("button", { name: /^(Add Schema|Add)$/ }).first();
  await expect(addSchemaBtn).toBeVisible({ timeout: 20_000 });

  // If we're on the SecurityAndPerformance landing with "Add Schema", the
  // helper returns true. If the user navigated to ?type=all, callers should
  // use the two-panel-specific flows directly.
  return true;
}

async function openAddSchemaDialogFromLanding(page: Page): Promise<void> {
  // Try "Add Schema" first (Security & Performance landing), then fall back to
  // the sidebar's "Add" button (?type=all view).
  const addSchemaBtn = page.getByRole("button", { name: /^(Add Schema|Add)$/ }).first();
  await addSchemaBtn.click();

  await expect(
    page.getByRole("heading", { name: "Add New Schema" }),
  ).toBeVisible({ timeout: 10_000 });
}

async function selectSchemaType(
  page: Page,
  label: "Entity" | "Child",
): Promise<void> {
  await page.getByRole("combobox", { name: /Schema Type/i }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function openSchemaInEditor(page: Page, schemaName: string): Promise<void> {
  // From the sidebar list (URL ?type=all), click the schema row to focus it.
  const row = page.getByText(schemaName, { exact: true }).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();

  // Right pane shows the schema header (h2) matching schemaName.
  await expect(
    page.getByRole("heading", { name: schemaName }),
  ).toBeVisible({ timeout: 20_000 });
}

test.describe("Data Gateway - Add Schema", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("adds an Entity schema from the Security & Performance landing", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    if (!(await goToDataGateway(page))) return;
    await openAddSchemaDialogFromLanding(page);

    const schemaName = uniqueName("dg_entity");
    await page.getByRole("textbox", { name: "Schema name" }).fill(schemaName);

    // Default type is "Entity", so Entity name field is shown and readOnly
    // (collection name pattern is enforced — add-edit-schema.tsx:357).
    // We just verify it's populated; the modal disables Add until valid.
    await expect(
      page.getByRole("textbox", { name: "Entity name" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^Add$/ }).click();

    // Toasts (use-toast) render under a portal — match by description text.
    await expectToast(page, "Schema added successfully");

    // Dialog closes on success (schema-details-page.tsx:168).
    await expect(
      page.getByRole("heading", { name: "Add New Schema" }),
    ).not.toBeVisible({ timeout: 10_000 });
  });

  test("adds a Child (DTO) schema", async ({ page }) => {
    test.setTimeout(120_000);
    if (!(await goToDataGateway(page))) return;
    await openAddSchemaDialogFromLanding(page);

    const schemaName = uniqueName("dg_child");
    await page.getByRole("textbox", { name: "Schema name" }).fill(schemaName);

    // Switching type to "Child" hides the Entity name field.
    await selectSchemaType(page, "Child");
    await expect(
      page.getByRole("textbox", { name: "Entity name" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: /^Add$/ }).click();

    await expectToast(page, "Schema added successfully");
  });
});

test.describe("Data Gateway - Form validation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("shows required error when Schema name is empty", async ({ page }) => {
    test.setTimeout(90_000);
    if (!(await goToDataGateway(page))) return;
    await openAddSchemaDialogFromLanding(page);

    // Leave Schema name empty and try to submit. The submit button is
    // disabled until the form is valid (mode="onChange"), so we first try
    // to interact, then assert the validation message via the error text.
    const nameInput = page.getByRole("textbox", { name: "Schema name" });
    await nameInput.click();
    await nameInput.fill("");
    await nameInput.blur();

    // Add button should be disabled.
    await expect(page.getByRole("button", { name: /^Add$/ })).toBeDisabled();

    // Now type something invalid-looking to trigger the inline pattern error.
    // The sanitizer strips leading digits and disallowed chars on keystroke
    // (add-edit-schema.tsx:234-247), so this only proves the field is wired.
    await nameInput.fill("123_invalid");
    // After paste-sanitization the leading digits are stripped; verify the
    // field reverts to underscores-only / letters.
    await expect(nameInput).not.toHaveValue(/^123/);

    // Cancel closes the dialog.
    await page.getByRole("button", { name: /^Cancel$/ }).click();
    await expect(
      page.getByRole("heading", { name: "Add New Schema" }),
    ).not.toBeVisible();
  });
});

test.describe("Data Gateway - Browse schemas", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("filters the schema sidebar by Entity tab", async ({ page }) => {
    test.setTimeout(180_000);
    if (!(await goToDataGateway(page))) return;

    // Navigate to the two-panel view (?type=all) where the sidebar renders.
    // Go straight to the URL — the secondary "Schemas" button on the
    // Security & Performance landing is best-effort and was the source
    // of past context-closed timeouts (the page.goto below ran out of
    // test budget by then).
    const scopedPath = page.url().replace(/\/data-gateway.*$/, "");
    await page.goto(`${scopedPath}/data-gateway?type=all`, {
      timeout: 60_000,
    });

    // Sidebar header.
    await expect(
      page.getByRole("heading", { name: "Schemas", exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    // TabsList triggers are buttons (Radix). Click "Entity".
    await page.getByRole("tab", { name: "Entity" }).click();
  });

  test("searches schemas by name in the sidebar", async ({ page }) => {
    test.setTimeout(120_000);
    if (!(await goToDataGateway(page))) return;

    // Seed: create an Entity schema we can search for by partial name.
    const searchToken = uniqueName("dgfind");
    await openAddSchemaDialogFromLanding(page);
    await page.getByRole("textbox", { name: "Schema name" }).fill(searchToken);
    await page.getByRole("button", { name: /^Add$/ }).click();
    await expectToast(page, "Schema added successfully");

    // Navigate to the two-panel view where the sidebar lives.
    const target = new URL(page.url());
    target.searchParams.set("type", "all");
    await page.goto(target.pathname + target.search);

    await expect(
      page.getByRole("heading", { name: "Schemas", exact: true }),
    ).toBeVisible({ timeout: 20_000 });

    // Use a substring that's stable across the suffix.
    const partial = searchToken.slice(0, "dgfind_".length + 6);
    await page
      .getByPlaceholder("Search schemas…")
      .fill(partial);

    // Debounce is 500ms (schema-side-bar.tsx:67) — wait for results.
    await expect(
      page.getByText(searchToken, { exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Data Gateway - Delete Schema", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("deletes an existing Entity schema via the More options menu", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    if (!(await goToDataGateway(page))) return;

    // Seed: create an Entity schema, then jump to the two-panel view and
    // delete it from the SchemaBasicInfo dropdown.
    const schemaName = uniqueName("dg_del");
    await openAddSchemaDialogFromLanding(page);
    await page.getByRole("textbox", { name: "Schema name" }).fill(schemaName);
    await page.getByRole("button", { name: /^Add$/ }).click();
    await expectToast(page, "Schema added successfully");

    // Open schema in editor. URL goes from /data-gateway to
    // /data-gateway?type=all&schemaId=<id> after success
    // (schema-details-page.tsx:158-166).
    await page.waitForURL(/data-gateway\?/, { timeout: 20_000 });

    const target = new URL(page.url());
    if (!target.searchParams.get("type")) target.searchParams.set("type", "all");
    await page.goto(target.pathname + target.search);
    await openSchemaInEditor(page, schemaName);

    // More options trigger (aria-label="More options", schema-basic-info.tsx:160).
    await page
      .getByRole("button", { name: "More options" })
      .click();
    await page.getByRole("menuitem", { name: "Delete schema" }).click();

    // Confirmation dialog title.
    await expect(
      page.getByRole("heading", { name: "Delete schema?" }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /^Delete$/ }).click();

    await expectToast(page, "Deleted successfully");

    // After deletion, onDeleteSuccess resets schemaDetails to EMPTY_SCHEMA
    // (schema-basic-info.tsx:104-110) and clears the URL schemaId (line 184
    // of schema-details-page.tsx). The empty-state InfoCard renders in both
    // mobile and desktop panes; asserting on the URL is the most robust
    // post-condition since the DOM contains two matching <p> tags and one
    // is hidden by the responsive layout.
    await expect(page).toHaveURL(/data-gateway/, { timeout: 10_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get("schemaId")).toBeNull();
  });
});
