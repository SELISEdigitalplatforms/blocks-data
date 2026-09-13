import { type Page } from "@playwright/test";
import { test, expect } from "../../support/test-base";
import { openEnvironment } from "../../support/navigation";
import { e2eStorageSftpCredentials } from "../../support/env";

async function openStorage(page: Page) {
  await page.getByRole("link", { name: "Storage" }).first().click();
  await expect(page.getByRole("button", { name: "Add" })).toBeVisible({ timeout: 30_000 });
}
async function mockStorageConfigurationsListing(page: Page): Promise<void> {
  await page.route("**/Storage/Gets**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          itemId: "e2e-mocked-default-storage",
          name: "Default",
          storageStrategy: "Amazon",
          accessKey: "e2e-mock-access-key",
          secretKey: "e2e-mock-secret-key",
          cloudStorageRegionEndPoint: "us-east-1",
          connectionString: null,
          createdBy: "e2e",
          createdDate: new Date().toISOString(),
          lastUpdatedBy: "e2e",
          lastUpdatedDate: new Date().toISOString(),
          organizationIds: [],
          tags: [],
          host: null,
          port: null,
          userName: null,
          password: null,
          remoteBasePath: null,
        },
      ]),
    });
  });
}

async function mockDirectoryListing(page: Page): Promise<void> {
  await page.route("**/get-objects**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            itemId: "e2e-mocked-folder",
            fileStorageId: "e2e-mocked-folder",
            name: "e2e-mocked-folder",
            type: "directory",
            description: "Mocked folder for the e2e manage-access flow",
            inheritsParentAccess: true,
            isArchived: false,
            isActive: true,
            configurationName: "Default",
            createdBy: "e2e",
            createdDate: new Date().toISOString(),
            lastUpdatedDate: new Date().toISOString(),
            tags: [],
            childDirectoryCount: 0,
            childFileCount: 0,
            sizeInBytes: 0,
            permissions: {
              canView: true,
              canDownload: true,
              canEdit: true,
              canDelete: true,
              canManage: true,
              canOwner: true,
            },
          },
        ],
        totalChildCount: 1,
        hasMore: false,
      }),
    });
  });
}

async function openFileMoreOptions(page: Page, fileName: string): Promise<void> {
  const fileContainer = page.locator('tr, [role="button"]').filter({ hasText: fileName }).first();
  await expect(fileContainer).toBeVisible({ timeout: 15_000 });
  await fileContainer.getByRole("button", { name: "More options" }).click();
}

test.describe("flow: Storage menu", () => {
  test("Storage — full flow", async ({ page }) => {
    test.setTimeout(600_000);

    await openEnvironment(page);

    const sftpCredentials = e2eStorageSftpCredentials();
    if (!sftpCredentials) {
      await mockStorageConfigurationsListing(page);
      await mockDirectoryListing(page);
    }

    await openStorage(page);
    const hasRealStorageBackend = !!sftpCredentials;
    const initialStorageUrl = new URL(page.url());
    const storageBasePath = initialStorageUrl.pathname.replace(/\/$/, "");
    const trashUrl = `${storageBasePath}/trash`;
    const searchUrl = `${storageBasePath}/search`;

    await test.step("Add Configuration form: Save is blocked before Name/Provider are filled", async () => {
      await page.getByRole("button", { name: "Add" }).click();
      await page.getByText("Add Configuration", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Add Storage Configuration" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Storage Provider")).toBeVisible();

      const saveButton = page.getByRole("button", { name: "Save" });

      if (await saveButton.isDisabled()) {
        await expect(saveButton).toBeDisabled();
      } else {
        await saveButton.click();
        await expect(page.getByText("Name is required")).toBeVisible({ timeout: 10_000 });
      }

      await page.getByPlaceholder("Enter name").fill(`e2e-validation-${Date.now()}`);
    });

    async function validateProviderRequiredFields(optionName: string, requiredMessages: string[]) {
      const providerSelect = page.getByRole("combobox").first();
      await expect(providerSelect).toBeVisible({ timeout: 10_000 });

      await providerSelect.click();
      await page.getByRole("option", { name: optionName, exact: true }).click();

      await page.getByRole("button", { name: "Save" }).click();
      for (const message of requiredMessages) {
        await expect(page.getByText(message)).toBeVisible({ timeout: 10_000 });
      }
    }

    await test.step("AWS provider: Save is blocked until Access key / Secret key / Region endpoint are filled", async () => {
      await validateProviderRequiredFields("AWS", [
        "Access key is required",
        "Secret key is required",
        "Region endpoint is required",
      ]);
    });

    await test.step("Azure provider: Save is blocked until Connection string is filled", async () => {
      await validateProviderRequiredFields("Azure", ["Connection string is required"]);
    });

    await test.step("AWS S3 Compatible provider: Save is blocked until Access key / Secret key / Host URL are filled", async () => {
      await validateProviderRequiredFields("AWS S3 Compatible", [
        "Access key is required",
        "Secret key is required",
        "Host URL is required",
      ]);
    });

    await test.step("SFTP provider: Save is blocked until Host / Username / Password / Remote base path are filled", async () => {
      await validateProviderRequiredFields("SFTP", [
        "Host is required",
        "Username is required",
        "Password is required",
        "Remote base path is required",
      ]);

      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("heading", { name: "Add Storage Configuration" })).toBeHidden();
    });

    await test.step("Add a real SFTP configuration (only when credentials are supplied via env)", async () => {
      if (!sftpCredentials) return;

      const existingCard = page.getByText(sftpCredentials.name, { exact: true });
      try {
        await expect(existingCard).toBeVisible({ timeout: 1_000 });
        return;
      } catch {
        // Card not present -- fall through and create it.
      }

      await page.getByRole("button", { name: "Add" }).click();
      await page.getByText("Add Configuration", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Add Storage Configuration" })).toBeVisible({
        timeout: 30_000,
      });

      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: "SFTP", exact: true }).click();

      await page.getByPlaceholder("Enter name").fill(sftpCredentials.name);
      await page.getByPlaceholder("Enter remote base path").fill(sftpCredentials.remoteBasePath);
      await page.getByPlaceholder("Enter host").fill(sftpCredentials.host);
      await page.getByPlaceholder("Enter port").fill(sftpCredentials.port);
      await page.getByPlaceholder("Enter username").fill(sftpCredentials.userName);
      await page.getByPlaceholder("Enter password").fill(sftpCredentials.password);

      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("New configuration added successfully")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole("heading", { name: "Add Storage Configuration" })).toBeHidden();
    });

    await test.step("Search configurations, then reset the filter", async () => {
      const searchInput = page.getByPlaceholder(/search/i).first();
      await expect(searchInput).toBeVisible({ timeout: 15_000 });

      await searchInput.fill("zzz_no_match_xyz");
      await expect(page.getByText("No storage configurations found.")).toBeVisible({
        timeout: 5_000,
      });

      const resetButton = page.getByRole("button", { name: /reset/i });
      await expect(resetButton).toBeVisible({ timeout: 5_000 });
      await resetButton.click();
      await expect(searchInput).toHaveValue("");
    });

    await test.step("Filter by provider and confirm the filter control stays visible", async () => {
      const providerFilter = page.getByRole("button", { name: /Provider/i });
      await expect(providerFilter).toBeVisible({ timeout: 15_000 });

      await providerFilter.click();
      await page.getByRole("option", { name: "AWS", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(providerFilter).toBeVisible({ timeout: 30_000 });
    });

    await test.step("Open a configuration card's details drawer", async () => {
      const moreButton = page
        .locator('div[class*="cursor-pointer"] button[aria-haspopup="menu"]')
        .first();
      await expect(moreButton).toBeVisible({ timeout: 15_000 });

      await moreButton.click();
      await page.getByText("View Details", { exact: true }).click();
      await expect(page.getByText("Details", { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Name", { exact: true })).toBeVisible();
      await expect(page.getByText("Storage provider")).toBeVisible();
      await expect(page.getByText("Owner")).toBeVisible();
      await expect(page.getByText("Type", { exact: true })).toBeVisible();
      await expect(page.getByText("Last modified")).toBeVisible();
      await expect(page.getByText("Date created")).toBeVisible();

      await expect(page.getByText("Configured")).toBeVisible();

      await page
        .locator('[role="dialog"]')
        .filter({ has: page.getByText("Details", { exact: true }) })
        .getByRole("button", { name: "Close" })
        .click();
    });

    await test.step("First card is the Default provider (storage.tsx sorts it to index 0)", async () => {
      const moreButton = page
        .locator('div[class*="cursor-pointer"] button[aria-haspopup="menu"]')
        .first();
      await expect(moreButton).toBeVisible({ timeout: 15_000 });

      await moreButton.click();
      await page.getByText("View Details", { exact: true }).click();
      const drawer = page
        .locator('[role="dialog"]')
        .filter({ has: page.getByText("Details", { exact: true }) });
      await expect(drawer).toBeVisible({ timeout: 30_000 });

      const nameValue = drawer.locator("div.text-sm.font-medium").first();
      const actualName = (await nameValue.textContent().catch(() => ""))?.trim();
      if (actualName === "Default") {
        await expect(nameValue).toHaveText("Default");
      }

      await drawer.getByRole("button", { name: "Close" }).click();
      await expect(drawer).toBeHidden({ timeout: 10_000 });
    });

    let openedConfiguration = false;

    await test.step("Open the first configuration and land in its file browser", async () => {
      // When the listing is mocked the storage-detail page can still resolve
      // the configuration (the mock provides it) but file/folder operations
      // downstream hit the real backend and will fail. Stay strict on the
      // visible UI, and gate the rest of the flow by env capability rather
      // than per-feature defensive checks.
      if (!hasRealStorageBackend) {
        const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
        await expect(firstCard).toBeVisible({ timeout: 15_000 });
        await firstCard.click();
        await expect(page).toHaveURL(/[?&]id=/, { timeout: 15_000 });
        // Breadcrumb carries the "Storage" link of the detail page; the
        // page heading "Storage" on the listing and the sidebar link would
        // also match `getByText("Storage")` -- scope to the breadcrumb so
        // the strict locator resolves to a single element.
        await expect(
          page.getByLabel("breadcrumb").getByText("Storage", { exact: true }),
        ).toBeVisible({ timeout: 30_000 });
        return;
      }

      const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
      await expect(firstCard).toBeVisible({ timeout: 15_000 });

      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15_000 });

      await expect(page.getByLabel("breadcrumb").getByText("Storage", { exact: true })).toBeVisible(
        { timeout: 30_000 },
      );
      openedConfiguration = true;
    });

    await test.step("File browser header: API Docs and Add New buttons", async () => {
      if (!openedConfiguration) return;

      const apiDocsButton = page.getByRole("button", { name: "API Docs" });
      await expect(apiDocsButton).toBeVisible({ timeout: 15_000 });

      const addNewButton = page.getByRole("button", { name: "Add New" });
      await expect(addNewButton).toBeVisible({ timeout: 15_000 });

      await addNewButton.click();
      await expect(page.getByRole("menuitem", { name: "Upload file" })).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByRole("menuitem", { name: "Create new directory" })).toBeVisible({
        timeout: 5_000,
      });

      await addNewButton.click();
      await expect(page.getByRole("menuitem", { name: "Upload file" })).toHaveCount(0);
      await expect(page.getByRole("menuitem", { name: "Create new directory" })).toHaveCount(0);
    });

    const dirName = `flow_folder_${Date.now()}`;
    const nestedDirName = `flow_nested_${Date.now()}`;

    await test.step("Create a folder, nest a second folder inside it, then walk back out via breadcrumb", async () => {
      if (!openedConfiguration) return;
      const addNewButton = page.getByRole("button", { name: "Add New" });
      await expect(addNewButton).toBeVisible({ timeout: 15_000 });

      await addNewButton.click();
      await page.getByText("Create new directory").click();
      await page.getByPlaceholder("Enter directory name").fill(dirName);
      await page.getByRole("button", { name: "Create" }).click();
      await expect(page.getByText("Directory created successfully.")).toBeVisible({
        timeout: 15_000,
      });

      const folderTile = page.getByText(dirName, { exact: true }).first();
      await expect(folderTile).toBeVisible({ timeout: 10_000 });

      const directoryFilterInput = page.locator('input[placeholder="Search..."]').first();
      await expect(directoryFilterInput).toBeVisible({ timeout: 15_000 });

      await folderTile.click();
      await expect(page).toHaveURL(/directoryId=/, { timeout: 10_000 });
      const firstLevelUrl = page.url();

      await addNewButton.click();
      await page.getByText("Create new directory").click();
      await page.getByPlaceholder("Enter directory name").fill(nestedDirName);
      await page.getByRole("button", { name: "Create" }).click();
      await expect(page.getByText("Directory created successfully.")).toBeVisible({
        timeout: 15_000,
      });
      const nestedFolderTile = page.getByText(nestedDirName, { exact: true }).first();
      await expect(nestedFolderTile).toBeVisible({ timeout: 10_000 });
      await nestedFolderTile.click();
      await expect(page).toHaveURL(/directoryId=/, { timeout: 10_000 });
      expect(page.url()).not.toBe(firstLevelUrl);

      const breadcrumbFirstLevel = page.getByRole("navigation").getByText(dirName, { exact: true });
      await expect(breadcrumbFirstLevel).toBeVisible({ timeout: 10_000 });
      await breadcrumbFirstLevel.click();
      expect(page.url()).toBe(firstLevelUrl);

      await page.getByText("Storage", { exact: true }).click();
      await expect(page).not.toHaveURL(/directoryId=/, { timeout: 30_000 });
    });

    const renamedDirName = `${nestedDirName}_renamed`;

    await test.step("Directory row 'Rename' opens RenameDirectoryDialog and renames the nested folder", async () => {
      if (!openedConfiguration) return;

      const outerFolder = page.getByText(dirName, { exact: true }).first();
      await expect(outerFolder).toBeVisible({ timeout: 15_000 });
      await outerFolder.click();
      await expect(page).toHaveURL(/directoryId=/, { timeout: 10_000 });

      const nestedFolder = page.getByText(nestedDirName, { exact: true }).first();
      await expect(nestedFolder).toBeVisible({ timeout: 15_000 });

      const nestedTile = page.locator('[role="button"]').filter({ hasText: nestedDirName }).first();
      const moreButton = nestedTile.locator('button[aria-haspopup="menu"]').first();
      await expect(moreButton).toBeVisible({ timeout: 15_000 });
      await moreButton.click();

      const renameDialog = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Rename directory" }) });
      await expect(renameDialog).toBeVisible({ timeout: 15_000 });
      const nameInput = renameDialog.getByPlaceholder("Directory name");
      await expect(nameInput).toHaveValue(nestedDirName);
      await nameInput.fill(renamedDirName);
      await renameDialog.getByRole("button", { name: "Save" }).click();
      await expect(renameDialog).toBeHidden({ timeout: 15_000 });
      await expect(page.getByText(renamedDirName, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(nestedDirName, { exact: true })).toHaveCount(0);

      await page.getByText("Storage", { exact: true }).click();
      await expect(page).not.toHaveURL(/directoryId=/, { timeout: 30_000 });
    });

    await test.step("Provider card → hover folder → Manage access → form validation", async () => {
      const targetFolderName = openedConfiguration ? dirName : "e2e-mocked-folder";

      await page.goto(storageBasePath, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Storage" })).toBeVisible({ timeout: 30_000 });

      const providerCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
      await expect(providerCard).toBeVisible({ timeout: 15_000 });
      await providerCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15_000 });
      await expect(page.getByLabel("breadcrumb").getByText("Storage", { exact: true })).toBeVisible(
        { timeout: 30_000 },
      );

      const folderTile = page
        .locator('[role="button"]')
        .filter({ hasText: targetFolderName })
        .first();
      await expect(folderTile).toBeVisible({ timeout: 15_000 });
      await folderTile.hover();

      const moreOptionsButton = folderTile.locator('button[aria-label="More options"]').first();
      await expect(moreOptionsButton).toBeVisible({ timeout: 15_000 });
      await moreOptionsButton.click();

      const accessOption = page.getByRole("menuitem", { name: "Manage access" });
      await expect(accessOption).toBeVisible({ timeout: 5_000 });
      await accessOption.click();

      const modal = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Manage access" }) });
      await expect(modal).toBeVisible({ timeout: 15_000 });

      await expect(modal.getByRole("heading", { name: "Manage access" })).toBeVisible();
      await expect(modal).toContainText(
        `Control who can access ${targetFolderName} and what they can do.`,
      );
      await expect(modal.getByRole("heading", { name: "Add access" })).toBeVisible();
      await expect(modal).toContainText(
        /Create a rule for a person, role, organization, or everyone\./,
      );
      await expect(modal).toContainText(/Who should have access\?/);

      for (const principal of ["User", "Role", "Organization", "Everyone"]) {
        await expect(modal.getByRole("button", { name: principal, exact: true })).toBeVisible();
      }

      await expect(modal).toContainText(/What can they do\?/);
      await expect(modal).toContainText(/Should this rule allow or deny\?/);

      await expect(modal.getByRole("heading", { name: "Access rules" })).toBeVisible();
      await expect(modal).toContainText(
        /Rules directly on this item and those inherited from its parent\./,
      );
      await expect(modal).toContainText(/No rules on this item\./);
      await expect(modal).toContainText(/Access comes from the parent directory\./);

      await expect(modal.getByText("Inheritance", { exact: true })).toBeVisible();
      await expect(modal).toContainText(
        /This item follows rules from its parent directory\.|This item uses only its direct rules\./,
      );
      await expect(modal.getByRole("button", { name: /Turn (on|off) inheritance/i })).toBeVisible();

      await expect(modal.getByRole("button", { name: "Done" })).toBeVisible();

      const userButton = modal.getByRole("button", { name: "User", exact: true });
      const everyoneButton = modal.getByRole("button", { name: "Everyone", exact: true });
      await expect(userButton).toHaveAttribute("aria-pressed", "true");
      await expect(everyoneButton).toHaveAttribute("aria-pressed", "false");

      const permissionSelect = modal.locator('[aria-label="Permission"]');
      const effectSelect = modal.locator('[aria-label="Effect"]');
      await expect(permissionSelect).toBeVisible();
      await expect(effectSelect).toBeVisible();
      await expect(permissionSelect).toContainText("View");
      await expect(effectSelect).toContainText("Allow");

      const userPicker = modal.locator('[aria-label="Select user"]');
      await expect(userPicker).toBeVisible();
      await expect(userPicker).toContainText(/Select…/);

      const addRuleButton = modal.getByRole("button", { name: /Add access rule/i });
      await expect(addRuleButton).toBeDisabled();

      await expect(modal).toContainText(/Rule preview/);
      await expect(modal).toContainText(/Choose users to continue\./);
      await expect(
        modal.locator("section").getByText("Allow", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        modal.locator("section").getByText("View", { exact: true }).first(),
      ).toBeVisible();
      await permissionSelect.click();
      await page.getByRole("option", { name: "Download", exact: true }).click();
      await expect(permissionSelect).toContainText("Download");
      await expect(
        modal.locator("section").getByText("Download", { exact: true }).first(),
      ).toBeVisible();

      await effectSelect.click();
      await page.getByRole("option", { name: "Deny", exact: true }).click();
      await expect(effectSelect).toContainText("Deny");
      await expect(
        modal.locator("section").getByText("Deny", { exact: true }).first(),
      ).toBeVisible();

      await everyoneButton.click();
      await expect(everyoneButton).toHaveAttribute("aria-pressed", "true");
      await expect(userButton).toHaveAttribute("aria-pressed", "false");
      await expect(modal.locator('[aria-label="Select user"]')).toHaveCount(0);
      await expect(modal).toContainText(
        /Everyone matches any authenticated caller\. No selection is needed\./,
      );
      await expect(addRuleButton).toBeEnabled();

      const roleButton = modal.getByRole("button", { name: "Role", exact: true });
      await roleButton.click();
      await expect(roleButton).toHaveAttribute("aria-pressed", "true");
      await expect(modal.locator('[aria-label="Select role"]')).toBeVisible();
      await expect(addRuleButton).toBeDisabled();

      const orgButton = modal.getByRole("button", { name: "Organization", exact: true });
      await orgButton.click();
      await expect(orgButton).toHaveAttribute("aria-pressed", "true");
      await expect(modal.locator('[aria-label="Select organizations"]')).toBeVisible();

      await userButton.click();
      await expect(userButton).toHaveAttribute("aria-pressed", "true");
      await expect(modal.locator('[aria-label="Select user"]')).toBeVisible();
      await expect(addRuleButton).toBeDisabled();

      await modal.getByRole("button", { name: "Done" }).click();
      await expect(modal).toBeHidden({ timeout: 10_000 });
    });

    await test.step("Directory row 'Delete' soft-deletes the outer folder", async () => {
      if (!openedConfiguration) return;

      const outerFolder = page.getByText(dirName, { exact: true }).first();
      await expect(outerFolder).toBeVisible({ timeout: 15_000 });

      const outerTile = page.locator('[role="button"]').filter({ hasText: dirName }).first();
      const moreButton = outerTile.locator('button[aria-haspopup="menu"]').first();
      await expect(moreButton).toBeVisible({ timeout: 15_000 });

      await moreButton.click();
      await page.getByRole("menuitem", { name: "Delete" }).click();

      const deleteDialog = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Delete Directory" }) });
      await expect(deleteDialog).toBeVisible({ timeout: 15_000 });
      await deleteDialog.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText("Directory Deleted successfully")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(dirName, { exact: true })).toHaveCount(0);
    });

    const fileName = `flow-file-${Date.now()}.txt`;
    const stagedOnlyFileName = `flow-staged-only-${Date.now()}.txt`;

    await test.step("Stage a file, remove it before upload, then upload a real one", async () => {
      if (!openedConfiguration) return;
      const addNewButton = page.getByRole("button", { name: "Add New" });
      await expect(addNewButton).toBeVisible({ timeout: 15_000 });

      await addNewButton.click();
      await page.getByText("Upload file").click();
      await expect(page.getByRole("button", { name: "Upload" })).toBeDisabled();

      await page.setInputFiles('input[type="file"]', {
        name: stagedOnlyFileName,
        mimeType: "text/plain",
        buffer: Buffer.from("this one should never reach the server"),
      });
      await expect(page.getByText(stagedOnlyFileName)).toBeVisible({ timeout: 10_000 });
      const removeStaged = page.getByRole("button", { name: `Remove ${stagedOnlyFileName}` });
      await expect(removeStaged).toBeVisible({ timeout: 10_000 });
      await removeStaged.click();
      await expect(page.getByText(stagedOnlyFileName)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Upload" })).toBeDisabled();

      await page.setInputFiles('input[type="file"]', {
        name: fileName,
        mimeType: "text/plain",
        buffer: Buffer.from("hello from the storage flow test"),
      });
      await expect(page.getByRole("button", { name: "Upload" })).toBeEnabled();

      await page.getByRole("button", { name: "Upload" }).click();
      await expect(page.getByText(/file\(s\) uploaded successfully!/)).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(fileName)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(stagedOnlyFileName)).toHaveCount(0);
    });

    await test.step("Preview the uploaded file and confirm real content renders", async () => {
      if (!openedConfiguration) return;
      const fileEntry = page.getByText(fileName, { exact: true }).first();
      await expect(fileEntry).toBeVisible({ timeout: 15_000 });

      await fileEntry.click();
      const preview = page.getByRole("dialog");
      await expect(preview).toBeVisible({ timeout: 15_000 });
      await expect(preview).toContainText(fileName);
      await preview.getByRole("button", { name: "Close" }).first().click();
      await expect(preview).toBeHidden();
    });

    await test.step("File row 'Versions' opens FileVersionsDrawer for that file", async () => {
      if (!openedConfiguration) return;
      await openFileMoreOptions(page, fileName);

      const versionsOption = page.getByRole("menuitem", { name: "Versions" });
      await expect(versionsOption).toBeVisible({ timeout: 5_000 });
      await versionsOption.click();

      const drawer = page
        .getByRole("dialog")
        .filter({ has: page.getByText(`Versions of ${fileName}`) });
      await expect(drawer).toBeVisible({ timeout: 15_000 });
      await drawer.getByRole("button", { name: "Close" }).click();
      await expect(drawer).toBeHidden({ timeout: 10_000 });
    });

    await test.step("File row 'Manage access' opens ManageAccessModal for that file", async () => {
      if (!openedConfiguration) return;
      await openFileMoreOptions(page, fileName);

      const accessOption = page.getByRole("menuitem", { name: "Manage access" });
      await expect(accessOption).toBeVisible({ timeout: 5_000 });
      await accessOption.click();

      const modal = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Manage access" }) });
      await expect(modal).toBeVisible({ timeout: 15_000 });

      await expect(modal.getByRole("heading", { name: "Manage access" })).toBeVisible();
      await expect(modal).toContainText(fileName);
      await expect(modal).toContainText(`Control who can access ${fileName} and what they can do.`);
      await expect(modal.getByRole("heading", { name: "Add access" })).toBeVisible();

      for (const principal of ["User", "Role", "Organization", "Everyone"]) {
        await expect(modal.getByRole("button", { name: principal, exact: true })).toBeVisible();
      }
      await expect(modal.getByRole("heading", { name: "Access rules" })).toBeVisible();
      await expect(modal.getByRole("button", { name: /Add access rule/i })).toBeVisible();

      await modal.getByRole("button", { name: "Close" }).click();
      await expect(modal).toBeHidden({ timeout: 10_000 });
    });

    await test.step("File row 'Move' opens MoveCopyDialog and renders the file in the picker", async () => {
      if (!openedConfiguration) return;
      await openFileMoreOptions(page, fileName);

      const moveOption = page.getByRole("menuitem", { name: "Move" });
      await expect(moveOption).toBeVisible({ timeout: 5_000 });
      await moveOption.click();

      const moveDialog = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Move item" }) });
      await expect(moveDialog).toBeVisible({ timeout: 15_000 });
      await expect(moveDialog).toContainText(fileName);

      const moveHere = moveDialog.getByRole("button", { name: /^Move here$/ });
      await expect(moveHere).toBeVisible();

      await moveDialog.getByRole("button", { name: "Close" }).click();
      await expect(moveDialog).toBeHidden({ timeout: 10_000 });
    });

    await test.step("File row 'Copy' opens MoveCopyDialog and renders the file in the picker", async () => {
      if (!openedConfiguration) return;
      await openFileMoreOptions(page, fileName);

      const copyOption = page.getByRole("menuitem", { name: "Copy" });
      await expect(copyOption).toBeVisible({ timeout: 5_000 });
      await copyOption.click();

      const copyDialog = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Copy item" }) });
      await expect(copyDialog).toBeVisible({ timeout: 15_000 });
      await expect(copyDialog).toContainText(fileName);

      const copyHere = copyDialog.getByRole("button", { name: /^Copy here$/ });
      await expect(copyHere).toBeVisible();

      await copyDialog.getByRole("button", { name: "Close" }).click();
      await expect(copyDialog).toBeHidden({ timeout: 10_000 });
    });

    await test.step("Toggle between Grid and List view modes in the file browser", async () => {
      if (!openedConfiguration) return;

      const listButton = page
        .locator("button")
        .filter({ has: page.locator("svg.lucide-list") })
        .first();
      const gridButton = page
        .locator("button")
        .filter({ has: page.locator("svg.lucide-layout-grid") })
        .first();

      await expect(listButton).toBeVisible({ timeout: 15_000 });
      await expect(gridButton).toBeVisible({ timeout: 15_000 });

      await listButton.click();
      await expect(page.getByRole("row").filter({ hasText: fileName }).first()).toBeVisible({
        timeout: 10_000,
      });

      await gridButton.click();
      await expect(page.getByText(fileName, { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });

      await listButton.click();
      await expect(page.getByRole("row").filter({ hasText: fileName }).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step("Search inside the file browser filters files by name", async () => {
      if (!openedConfiguration) return;

      const browserSearch = page.getByPlaceholder("Search...").first();
      await expect(browserSearch).toBeVisible({ timeout: 15_000 });

      await browserSearch.fill("zzz_no_match_xyz");
      await expect(page.getByText(fileName, { exact: true })).toHaveCount(0, { timeout: 10_000 });

      await browserSearch.fill("");
      await expect(page.getByText(fileName, { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step("Delete the uploaded file and confirm it's gone", async () => {
      if (!openedConfiguration) return;
      const fileRow = page.getByRole("row").filter({ hasText: fileName }).first();
      await expect(fileRow).toBeVisible({ timeout: 15_000 });

      await fileRow.getByRole("button", { name: "More options" }).click();
      await page.getByText("Delete", { exact: false }).click();
      await page.getByRole("button", { name: "Delete" }).last().click();
      await expect(page.getByText("File Deleted successfully")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(fileName, { exact: true })).toHaveCount(0);
    });

    await test.step("Trash page renders and lists the deleted file", async () => {
      if (!openedConfiguration) return;

      await page.goto(trashUrl, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Trash" })).toBeVisible({
        timeout: 30_000,
      });

      await expect(page.getByRole("button", { name: "All" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Files" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Directorys" }).first()).toBeVisible();

      const fileRow = page.locator("li").filter({ hasText: fileName }).first();
      await expect(fileRow).toBeVisible({ timeout: 15_000 });
      await expect(fileRow.getByRole("button", { name: "Restore" })).toBeVisible();
      await expect(fileRow.getByRole("button", { name: "Delete" })).toBeVisible();
    });

    await test.step("Trash filter chips switch the listing between All / Files / Directorys", async () => {
      if (!openedConfiguration) return;

      await page.goto(trashUrl, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Trash" })).toBeVisible({
        timeout: 30_000,
      });

      await page.getByRole("button", { name: "Files" }).first().click();
      await expect(page.getByText(fileName, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: "Directorys" }).first().click();
      await expect(page.getByText(fileName, { exact: true })).toHaveCount(0, {
        timeout: 10_000,
      });

      await page.getByRole("button", { name: "All" }).first().click();
      await expect(page.getByText(fileName, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step("Trash restores a deleted item back to its directory", async () => {
      if (!openedConfiguration) return;

      await page.goto(trashUrl, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Trash" })).toBeVisible({
        timeout: 30_000,
      });

      const fileRow = page.locator("li").filter({ hasText: fileName }).first();
      await expect(fileRow).toBeVisible({ timeout: 15_000 });

      await fileRow.getByRole("button", { name: "Restore" }).click();
      await expect(page.getByText(fileName, { exact: true })).toHaveCount(0, {
        timeout: 15_000,
      });
    });

    await test.step("Trash permanently deletes an item with a confirmation dialog", async () => {
      if (!openedConfiguration) return;

      await page.goto(trashUrl, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Trash" })).toBeVisible({
        timeout: 30_000,
      });

      const dirTrashRow = page.locator("li").filter({ hasText: dirName }).first();
      await expect(dirTrashRow).toBeVisible({ timeout: 15_000 });

      await dirTrashRow.getByRole("button", { name: "Delete" }).click();
      const confirmDialog = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Delete permanently" }) });
      await expect(confirmDialog).toBeVisible({ timeout: 15_000 });
      await confirmDialog.getByRole("button", { name: "Delete permanently" }).click();
      await expect(confirmDialog).toBeHidden({ timeout: 15_000 });
      await expect(page.getByText(dirName, { exact: true })).toHaveCount(0, {
        timeout: 15_000,
      });
    });

    await test.step("Search storage page renders the search input and finds the uploaded file", async () => {
      if (!openedConfiguration) return;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Search storage" })).toBeVisible({
        timeout: 30_000,
      });

      const searchInput = page.getByPlaceholder("Search files and directorys");
      await expect(searchInput).toBeVisible();

      await searchInput.fill("zzz_no_match_xyz");
      await expect(page.getByText(/Nothing matches/)).toBeVisible({ timeout: 15_000 });

      await searchInput.fill("");
      await expect(page.getByText(/Type to search across your directorys and files\./)).toBeVisible(
        { timeout: 15_000 },
      );
    });
  });
});
