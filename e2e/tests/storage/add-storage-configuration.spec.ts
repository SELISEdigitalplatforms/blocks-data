import { expect, expectToast, test, uniqueName } from "../../support/test-base";
import type { Page } from "@playwright/test";
import { login } from "../../support/auth";

/**
 * "Add Configuration" flow on the Storage page.
 *
 * Storage is project-scoped. The route registers under `:itemId` so
 * ProjectGuard (client/app/guards/project-guard.tsx) redirects to
 * /app/console whenever `useProjectStore().selectedProject` is null.
 * Therefore the spec must walk through a project dashboard to set
 * `selectedProject` first, then exercise the Storage sidebar.
 *
 * Path under test:
 *   /app/console (ProjectCard chips) -> Development env chip -> dashboard
 *   -> sidebar Storage link -> /app/<itemId>/storage toolbar "Add"
 *   -> "Add Configuration" menu item -> SaveStorageConfiguration dialog
 *   -> provider in Storage Provider Select -> provider-specific fields
 *   -> "Save" -> success toast.
 *
 * Provider field matrix (client/app/storage/pages/.../save-storage-configuration.tsx):
 *   "Azure"        -> Connection String
 *   "Amazon" (AWS) -> Access Key, Secret Key, Region Endpoint
 *   "S3Compatible" -> Access Key, Secret Key, Host URL
 *   "SftpStorage"  -> Host, Port, User Name, Password, Remote Base Path
 *
 * Submitting Save calls useSaveStorageConfiguration against the dev backend,
 * which persists a real record on the shared dev environment (see
 * e2e/README.md:27-30). Cleanup is left to whoever prunes dev data.
 */

async function goToStorage(page: Page): Promise<boolean> {
  await page.goto("/app/console");

  await expect(
    page.getByRole("heading", { name: "Your Blocks Projects" }),
  ).toBeVisible({ timeout: 20_000 });

  const devChip = page.getByRole("button", { name: /^Development$/ }).first();
  if (!(await devChip.isVisible().catch(() => false))) {
    test.skip(true, "Tenant has no projects; cannot reach the storage page.");
    return false;
  }
  await devChip.click();

  await page.waitForURL("**/app/**/dashboard", { timeout: 20_000 });
  await expect(page).toHaveURL(/\/app\/[^/]+\/dashboard$/);

  // Sidebar Storage link from navigationMenus.ts entry id "service-storage".
  await page.getByRole("link", { name: "Storage", exact: true }).click();
  await page.waitForURL((url) => /\/storage(?:\b|\/)/.test(url.pathname), {
    timeout: 20_000,
  });

  // The StorageToolbar's "Add" trigger renders as a <button> with text "Add"
  // and the chevron icon (storage-filters-toolbar.tsx:73-77). Wait for it
  // before opening the dropdown so we don't race with hydration.
  await expect(page.getByRole("button", { name: /^Add$/ })).toBeVisible({
    timeout: 20_000,
  });
  return true;
}

async function openAddConfigurationDialog(
  page: Page,
  providerName: string,
): Promise<void> {
  await page.getByRole("button", { name: /^Add$/ }).click();
  await page.getByRole("menuitem", { name: "Add Configuration" }).click();

  await expect(
    page.getByRole("heading", { name: "Add Storage Configuration" }),
  ).toBeVisible({ timeout: 10_000 });

  // Radix Select trigger has role="combobox".
  await page.getByRole("combobox").click();
  await page
    .getByRole("option", { name: providerName, exact: true })
    .click();
}

test.describe("Storage", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("adds an AWS S3 Compatible configuration", async ({ page }) => {
    test.setTimeout(90_000);
    if (!(await goToStorage(page))) return;
    await openAddConfigurationDialog(page, "AWS S3 Compatible");

    await page.getByRole("textbox", { name: "Name" }).fill(uniqueName("s3cfg"));
    await page.getByRole("textbox", { name: "Access Key" }).fill(uniqueName("s3ak"));
    await page.getByRole("textbox", { name: "Secret Key" }).fill(uniqueName("s3sk"));
    await page
      .getByRole("textbox", { name: "Host URL" })
      .fill(`https://${uniqueName("s3host")}.example.com`);

    await page.getByRole("button", { name: /^Save$/ }).click();

    await expectToast(page, "New configuration added successfully");
  });

  test("adds an Amazon (AWS) configuration", async ({ page }) => {
    test.setTimeout(90_000);
    if (!(await goToStorage(page))) return;
    await openAddConfigurationDialog(page, "AWS");

    // Amazon uses "Secret key" (lowercase k) as the accessible name; Region
    // Endpoint instead of Host URL. These come from <FormLabel> text in
    // save-storage-configuration.tsx:202, 213.
    await page.getByRole("textbox", { name: "Name" }).fill(uniqueName("awscfg"));
    await page
      .getByRole("textbox", { name: "Access Key" })
      .fill(uniqueName("awsak"));
    await page
      .getByRole("textbox", { name: "Secret key" })
      .fill(uniqueName("awssk"));
    await page
      .getByRole("textbox", { name: "Region Endpoint" })
      .fill(`${uniqueName("awsregion")}.example.com`);

    await page.getByRole("button", { name: /^Save$/ }).click();

    await expectToast(page, "New configuration added successfully");
  });
});
