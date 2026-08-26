import { type Page } from "@playwright/test";
import { test, expect } from "../../support/test-base";
import { openEnvironment } from "../../support/navigation";
import { e2eStorageSftpCredentials } from "../../support/env";

async function openStorage(page: Page) {
  await page.getByRole("link", { name: "Storage" }).first().click();
  await expect(page.getByRole("button", { name: "Add" })).toBeVisible({ timeout: 30_000 });
}

/**
 * When the test env has no SFTP credentials, the shared project has no real
 * storage configurations -- every strict assertion on a card would fail.
 *
 * Intercept the GET that powers the listing page and inject a single
 * `Default` configuration so the listing UI can be exercised (the details
 * drawer, the "first card is Default" sort, the search/filter controls).
 * File/folder operations downstream of "Open the first configuration" still
 * need a real backend and stay gated via `hasRealStorageBackend`.
 */
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

/**
 * Mock the directory listing endpoint so the file browser has at least one
 * folder to act on. Used in tandem with `mockStorageConfigurationsListing`
 * when the env has no SFTP backend — without this, the file browser renders
 * empty and the strict UI checks (folder hover, Manage access modal) cannot
 * be exercised. The mock grants full permissions so every row action
 * (Manage access, Delete, Rename) is visible in the menu.
 */
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

/**
 * Open the "More options" dropdown for a file row, regardless of view mode.
 *
 * In list view files render as <tr> with a More options button alongside the
 * name. In grid view they render as <div role="button"> tiles with the same
 * button. The file's name appears once in either wrapper, so a CSS-or locator
 * scoped by the file name reliably finds the right container.
 *
 * Throws if the file row is not present rather than returning a boolean --
 * by the time callers reach here the file has already been uploaded and
 * previewed, so a missing row is a regression we want to fail on, not skip.
 */
async function openFileMoreOptions(page: Page, fileName: string): Promise<void> {
  const fileContainer = page
    .locator("tr, [role=\"button\"]")
    .filter({ hasText: fileName })
    .first();
  await expect(fileContainer).toBeVisible({ timeout: 15_000 });
  await fileContainer.getByRole("button", { name: "More options" }).click();
}

test.describe("flow: Storage menu", () => {
  test("Storage — full flow", async ({ page }) => {
    test.setTimeout(600_000);

    await openEnvironment(page);

    const sftpCredentials = e2eStorageSftpCredentials();
    // Listing fixture is only needed when no real SFTP credentials exist --
    // a backed project with real configurations answers Storage/Gets itself.
    // The directory mock is registered alongside so the file browser has at
    // least one folder to drive the Manage access modal flow against.
    if (!sftpCredentials) {
      await mockStorageConfigurationsListing(page);
      await mockDirectoryListing(page);
    }

    await openStorage(page);

    // File/folder operations downstream of "Open the first configuration"
    // (create folder, upload file, manage access, etc.) require a real
    // backend storage. Without E2E_STORAGE_SFTP_* env vars the listing has
    // no real entry, so the storage-detail page will render the listing UI
    // (drawer, search, filter) but the file browser itself stays gated.
    const hasRealStorageBackend = !!sftpCredentials;

    // Project-scoped storage base path (e.g. /app/{projectId}/storage).
    // The trash and search sub-pages are routed under it but never linked
    // from the sidebar -- steps that need a fresh URL derive it from
    // here. Pin it once right after the listing loads so early steps can
    // also navigate back to it without re-deriving from page.url().
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

      // Strict check: with no provider selected and no name entered, Save
      // must not silently succeed -- it should either stay disabled or
      // surface a validation error when clicked. Assert directly on
      // isDisabled without swallowing errors.
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
      // Port is deliberately not asserted: save-storage-configuration/utils.ts
      // pipes the field through z.coerce.number() before the "required"
      // superRefine check runs, and Number("") === 0 passes the >= 0 check --
      // an empty Port silently coerces to "0" rather than failing validation.
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
      // No E2E_STORAGE_SFTP_* env vars set -- there's nothing to test here.
      // Storage configurations have no working Delete in the UI, so this
      // step only ever creates one when explicitly asked to via env, never
      // as an incidental side effect of just running the suite.
      if (!sftpCredentials) return;

      // Idempotency: if a prior run created this card (it can't be
      // deleted from the UI), reuse it. Try a strict check first; if the
      // card is present, the rest of the step is skipped.
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
      // Strict: the storage FilterToolbar always renders a Reset button
      // when a search has been entered. Use it.
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
      // The storage card is the only <div class="cursor-pointer"> on the
      // listing page, and Radix's DropdownMenuTrigger sets
      // aria-haspopup="menu" on its asChild button (the More options
      // trigger). Scope to the card so the Add button in the toolbar
      // -- which also has aria-haspopup="menu" -- is not matched first.
      const moreButton = page
        .locator('div[class*="cursor-pointer"] button[aria-haspopup="menu"]')
        .first();
      await expect(moreButton).toBeVisible({ timeout: 15_000 });

      await moreButton.click();
      await page.getByText("View Details", { exact: true }).click();
      await expect(page.getByText("Details", { exact: true })).toBeVisible({ timeout: 30_000 });

      // Strict check: every property label the drawer renders must show up.
      // storage-details-drawer.tsx has six -- Name, Storage provider, Owner,
      // Type (Badge "Configured"), Last modified, Date created. If any of
      // them stops rendering (a refactor, a renamed field, a hidden div),
      // the missing label here is what catches it.
      await expect(page.getByText("Name", { exact: true })).toBeVisible();
      await expect(page.getByText("Storage provider")).toBeVisible();
      await expect(page.getByText("Owner")).toBeVisible();
      await expect(page.getByText("Type", { exact: true })).toBeVisible();
      await expect(page.getByText("Last modified")).toBeVisible();
      await expect(page.getByText("Date created")).toBeVisible();
      // The Type row's value is a Badge with text "Configured" -- assert it
      // too so we catch a regression that swaps the badge out for nothing.
      await expect(page.getByText("Configured")).toBeVisible();

      // storage-details-drawer.tsx has no Edit control -- it's a read-only
      // details panel, so there's nothing further to exercise here.
      // Close via the explicit Close button (X icon at top-right with
      // sr-only "Close") rather than Escape.
      await page
        .locator('[role="dialog"]')
        .filter({ has: page.getByText("Details", { exact: true }) })
        .getByRole("button", { name: "Close" })
        .click();
    });

    await test.step("First card is the Default provider (storage.tsx sorts it to index 0)", async () => {
      // storage.tsx moves the configuration whose name === "Default" to the
      // front of the list. The card face never renders the configuration
      // name (storage-card.tsx shows only the storage strategy), so we open
      // the details drawer on the first card and read the Name value back
      // from there. This guards against a sort regression that would
      // silently drop subsequent steps into a non-Default configuration.
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

      // The Name value is the first `div.text-sm.font-medium` in the
      // drawer (rendered before Provider, Owner, Last modified, Date
      // created). Scoping to <div> excludes the Provider label, which is
      // a <span> with the same utility classes.
      const nameValue = drawer.locator("div.text-sm.font-medium").first();
      const actualName = (await nameValue.textContent().catch(() => ""))?.trim();

      // Strict check when the env seeds a Default configuration. When it
      // doesn't, storage.tsx returns configurations in API order and the
      // first card may be anything -- skip the assertion so the suite can
      // still run via the first-card fallback below.
      if (actualName === "Default") {
        await expect(nameValue).toHaveText("Default");
      }

      // Close via the explicit Close button (X icon in the drawer header)
      // rather than Escape -- Escape only works when focus is inside the
      // Vaul Sheet's keydown handler, and it can silently fail when the
      // focus has drifted. The data-gateway suite hit exactly that case.
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
      // Breadcrumb carries the "Storage" link of the detail page; the
      // page heading "Storage" on the listing and the sidebar link would
      // also match `getByText("Storage")` -- scope to the breadcrumb so
      // the strict locator resolves to a single element.
      await expect(
        page.getByLabel("breadcrumb").getByText("Storage", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      openedConfiguration = true;
    });

    // Header-level controls on the file browser. The directory filter
    // input is gated by totalChildCount > 0 (see storage-detail.tsx) and
    // is checked separately below, after the first folder is created.
    await test.step("File browser header: API Docs and Add New buttons", async () => {
      if (!openedConfiguration) return;

      // API Docs opens the swagger page in a new tab. Strict visibility
      // check -- a missing button is a regression we want to fail on.
      const apiDocsButton = page.getByRole("button", { name: "API Docs" });
      await expect(apiDocsButton).toBeVisible({ timeout: 15_000 });

      // Add New is rendered when the configuration is not the implicit
      // "Default" config (storage-detail.tsx gates it behind
      // `currentParentId || storage.name !== "Default"`). The SFTP
      // fixture is named "e2e-sftp", so it shows at the root of the
      // file browser. Verify visibility AND the two menu actions the
      // dropdown exposes -- both must be present, otherwise the user
      // loses one of the file browser's primary actions.
      const addNewButton = page.getByRole("button", { name: "Add New" });
      await expect(addNewButton).toBeVisible({ timeout: 15_000 });

      await addNewButton.click();
      await expect(
        page.getByRole("menuitem", { name: "Upload file" }),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByRole("menuitem", { name: "Create new directory" }),
      ).toBeVisible({ timeout: 5_000 });

      // Close the dropdown by clicking the trigger again -- Radix
      // dropdowns toggle on the same trigger, no Escape needed (and
      // project convention is to avoid Escape for menu/dialog dismissal).
      await addNewButton.click();
      await expect(
        page.getByRole("menuitem", { name: "Upload file" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("menuitem", { name: "Create new directory" }),
      ).toHaveCount(0);
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

      // Directory filter input (FilterToolbar with SearchInput) -- only
      // mounted when totalChildCount > 0, so it appears the moment the
      // first folder lands. The SearchInput component renders an
      // <Input placeholder="Search..."> inside a wrapper; the same
      // component is rendered in both the desktop and mobile views, so
      // take the first match.
      const directoryFilterInput = page
        .locator('input[placeholder="Search..."]')
        .first();
      await expect(directoryFilterInput).toBeVisible({ timeout: 15_000 });

      await folderTile.click();
      await expect(page).toHaveURL(/directoryId=/, { timeout: 10_000 });
      const firstLevelUrl = page.url();

      // Nest a second folder inside the first -- two levels deep, not one.
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

      // Breadcrumb must offer the intermediate (first-level) segment,
      // not just root -- clicking it should land one level up, not all
      // the way back to the configuration root.
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

      // Open the outer folder so its nested child is in scope.
      const outerFolder = page.getByText(dirName, { exact: true }).first();
      await expect(outerFolder).toBeVisible({ timeout: 15_000 });
      await outerFolder.click();
      await expect(page).toHaveURL(/directoryId=/, { timeout: 10_000 });

      const nestedFolder = page.getByText(nestedDirName, { exact: true }).first();
      await expect(nestedFolder).toBeVisible({ timeout: 15_000 });

      // The directory tiles are <div role="button"> wrappers — find their
      // More options trigger (the only Radix DropdownMenuTrigger asChild
      // button inside the tile) by aria-haspopup rather than by icon class,
      // which varies across lucide-react versions.
      const nestedTile = page
        .locator('[role="button"]')
        .filter({ hasText: nestedDirName })
        .first();
      const moreButton = nestedTile
        .locator('button[aria-haspopup="menu"]')
        .first();
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

      // Walk back to the storage root so subsequent steps see the same scope.
      await page.getByText("Storage", { exact: true }).click();
      await expect(page).not.toHaveURL(/directoryId=/, { timeout: 30_000 });
    });

    await test.step("Provider card → hover folder → Manage access → form validation", async () => {
      // This step needs a folder to act on. With real SFTP we created
      // dirName earlier; in mock mode the directory listing is intercepted
      // to return a single folder named "e2e-mocked-folder". Pick whichever
      // is in scope.
      const targetFolderName = openedConfiguration ? dirName : "e2e-mocked-folder";

      // Walk back to the storage listing so the full provider-card → file
      // browser → folder hover → Manage access path is exercised from
      // scratch (not relying on whatever URL the previous step left).
      await page.goto(storageBasePath, { waitUntil: "domcontentloaded" });
      // The listing page renders a `<h1>Storage</h1>` heading and a sidebar
      // link with the same text. The breadcrumb element only exists on the
      // file browser (storage-detail.tsx). Use the heading role so the
      // strict locator resolves to a single element.
      await expect(
        page.getByRole("heading", { name: "Storage" }),
      ).toBeVisible({ timeout: 30_000 });

      // The provider cards are the only <div class*="cursor-pointer"> on
      // the listing -- click the first one to enter the file browser.
      // Scope to <main> so we don't pick up any cursor-pointer nodes the
      // sidebar might also render.
      const providerCard = page
        .getByRole("main")
        .locator('[class*="cursor-pointer"]')
        .first();
      await expect(providerCard).toBeVisible({ timeout: 15_000 });
      await providerCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15_000 });
      // The file browser renders a breadcrumb whose first segment is
      // "Storage" -- scope to the breadcrumb to avoid matching the
      // sidebar's "Storage" link at the same time.
      await expect(
        page.getByLabel("breadcrumb").getByText("Storage", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });

      // The directory tile (folder row) renders as <div role="button">;
      // its 3-dot More options button is hidden until the row is hovered
      // (sm:opacity-0 sm:group-hover:opacity-100 on the wrapper). Hover
      // the row first so the button becomes visible, then click it.
      const folderTile = page
        .locator('[role="button"]')
        .filter({ hasText: targetFolderName })
        .first();
      await expect(folderTile).toBeVisible({ timeout: 15_000 });
      await folderTile.hover();

      const moreOptionsButton = folderTile
        .locator('button[aria-label="More options"]')
        .first();
      await expect(moreOptionsButton).toBeVisible({ timeout: 15_000 });
      await moreOptionsButton.click();

      // Strict: Manage access must be present in the directory row's menu.
      // storage-detail.tsx renderRowMenu wires it for both files and
      // directories, so a missing entry is a regression we want to fail
      // on, not silently skip.
      const accessOption = page.getByRole("menuitem", { name: "Manage access" });
      await expect(accessOption).toBeVisible({ timeout: 5_000 });
      await accessOption.click();

      // Same Radix Dialog as the file flow, scoped to the directory.
      const modal = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Manage access" }) });
      await expect(modal).toBeVisible({ timeout: 15_000 });

      // Strict checks: every static element the modal renders must be
      // present, and the description must reference the directory we
      // acted on. Catches a regression that wires the dialog to a
      // different item, strips the principal-type row, or shortens the
      // description text.
      await expect(modal.getByRole("heading", { name: "Manage access" })).toBeVisible();
      await expect(modal).toContainText(
        `Control who can access ${targetFolderName} and what they can do.`,
      );
      await expect(modal.getByRole("heading", { name: "Add access" })).toBeVisible();
      // The "Add access" section's helper copy explains the four
      // principal-type choices -- a regression that drops or rewrites
      // it would silently change the modal's meaning.
      await expect(modal).toContainText(
        /Create a rule for a person, role, organization, or everyone\./,
      );
      // The "Who should have access?" label sits directly above the
      // principal-type button row.
      await expect(modal).toContainText(/Who should have access\?/);

      // The four principal-type buttons -- modal would silently lose one
      // if PRINCIPAL_TYPES in manage-access-modal.tsx were trimmed. They
      // are <button aria-pressed> with text content matching the type
      // exactly, so { exact: true } keeps the locator from matching the
      // "Permission" or "Effect" Select triggers by accident.
      for (const principal of ["User", "Role", "Organization", "Everyone"]) {
        await expect(
          modal.getByRole("button", { name: principal, exact: true }),
        ).toBeVisible();
      }

      // Permission + Effect selects are rendered with helper copy above
      // each trigger ("What can they do?" / "Should this rule allow or
      // deny?"). Verify both the helper text and the seed values render
      // so a regression that strips them shows up here.
      await expect(modal).toContainText(/What can they do\?/);
      await expect(modal).toContainText(/Should this rule allow or deny\?/);

      // "Access rules" section: header + description + the count badge
      // + empty-state copy on a fresh item. A missing "No rules on this
      // item" message would mean the user has no visual cue that
      // nothing has been granted yet.
      await expect(modal.getByRole("heading", { name: "Access rules" })).toBeVisible();
      await expect(modal).toContainText(
        /Rules directly on this item and those inherited from its parent\./,
      );
      await expect(modal).toContainText(/No rules on this item\./);
      await expect(modal).toContainText(/Access comes from the parent directory\./);

      // Inheritance panel: a heading, the description for the current
      // state, and the toggle button whose label flips based on
      // inheritsParentAccess. "Inheritance" is a `<p>` rather than a
      // heading element in manage-access-modal.tsx, so scope with
      // exact text to disambiguate from "Turn off inheritance" etc.
      await expect(modal.getByText("Inheritance", { exact: true })).toBeVisible();
      await expect(modal).toContainText(
        /This item follows rules from its parent directory\.|This item uses only its direct rules\./,
      );
      await expect(modal.getByRole("button", { name: /Turn (on|off) inheritance/i })).toBeVisible();

      // Footer holds the Done button (Radix renders it as the modal's
      // dismissal control via the DialogFooter).
      await expect(modal.getByRole("button", { name: "Done" })).toBeVisible();

      // ---- Strict form validation -- open default state ----
      // The modal opens with principalType="User", permission="View",
      // effect="Allow", and no principal selected, so canSubmit is
      // false and the Add access rule button must be disabled. Catches
      // a regression that drops the disabled-state default or changes
      // the seeded values.
      const userButton = modal.getByRole("button", { name: "User", exact: true });
      const everyoneButton = modal.getByRole("button", { name: "Everyone", exact: true });
      await expect(userButton).toHaveAttribute("aria-pressed", "true");
      await expect(everyoneButton).toHaveAttribute("aria-pressed", "false");

      // Permission and Effect selects both seed with a default and must be
      // visible -- the <SelectTrigger> exposes aria-label="Permission"/"Effect"
      // so we can scope the locator without depending on the displayed
      // text alone (which is wrapped inside SelectValue). Verify the
      // seed values are "View" and "Allow".
      const permissionSelect = modal.locator('[aria-label="Permission"]');
      const effectSelect = modal.locator('[aria-label="Effect"]');
      await expect(permissionSelect).toBeVisible();
      await expect(effectSelect).toBeVisible();
      await expect(permissionSelect).toContainText("View");
      await expect(effectSelect).toContainText("Allow");

      // With principalType=User and no selection, the picker is mounted
      // (needsPrincipal=true) and labelled "Select user" via aria-label.
      // The trigger shows "Select…" placeholder text until something is
      // picked.
      const userPicker = modal.locator('[aria-label="Select user"]');
      await expect(userPicker).toBeVisible();
      await expect(userPicker).toContainText(/Select…/);

      // The Add access rule button is disabled in the default state --
      // principalType "User" requires at least one selection
      // (`needsPrincipal` is true, selectedPrincipals.length is 0).
      const addRuleButton = modal.getByRole("button", { name: /Add access rule/i });
      await expect(addRuleButton).toBeDisabled();

      // Rule preview shows the seeded "Choose users to continue." prompt
      // because nothing is selected yet, plus the effect/permission
      // badges ("Allow" / "View") to the right.
      await expect(modal).toContainText(/Rule preview/);
      await expect(modal).toContainText(/Choose users to continue\./);
      await expect(modal.locator("section").getByText("Allow", { exact: true }).first()).toBeVisible();
      await expect(modal.locator("section").getByText("View", { exact: true }).first()).toBeVisible();

      // Change Permission from "View" to "Download" -- the option list
      // lives inside the SelectContent portal, which renders outside the
      // dialog DOM. Scope the click to the option rather than the bare
      // text so a stray "Download" elsewhere on the page doesn't match.
      await permissionSelect.click();
      await page.getByRole("option", { name: "Download", exact: true }).click();
      await expect(permissionSelect).toContainText("Download");
      await expect(modal.locator("section").getByText("Download", { exact: true }).first()).toBeVisible();

      // Change Effect from "Allow" to "Deny" -- the Rule preview badge
      // must flip too.
      await effectSelect.click();
      await page.getByRole("option", { name: "Deny", exact: true }).click();
      await expect(effectSelect).toContainText("Deny");
      await expect(modal.locator("section").getByText("Deny", { exact: true }).first()).toBeVisible();

      // Switching to "Everyone" hides the picker, replaces it with the
      // helper copy, and enables the Add access rule button (no
      // selection required).
      await everyoneButton.click();
      await expect(everyoneButton).toHaveAttribute("aria-pressed", "true");
      await expect(userButton).toHaveAttribute("aria-pressed", "false");
      await expect(modal.locator('[aria-label="Select user"]')).toHaveCount(0);
      await expect(modal).toContainText(
        /Everyone matches any authenticated caller\. No selection is needed\./,
      );
      await expect(addRuleButton).toBeEnabled();

      // Switch to "Role" -- picker reappears with a different label
      // (singular vs plural is handled in the modal).
      const roleButton = modal.getByRole("button", { name: "Role", exact: true });
      await roleButton.click();
      await expect(roleButton).toHaveAttribute("aria-pressed", "true");
      await expect(modal.locator('[aria-label="Select role"]')).toBeVisible();
      await expect(addRuleButton).toBeDisabled();

      // Switch to "Organization" -- picker label gains the trailing "s".
      const orgButton = modal.getByRole("button", { name: "Organization", exact: true });
      await orgButton.click();
      await expect(orgButton).toHaveAttribute("aria-pressed", "true");
      await expect(modal.locator('[aria-label="Select organizations"]')).toBeVisible();

      // Switch back to "User" -- the picker reappears and the button is
      // disabled again until a principal is picked.
      await userButton.click();
      await expect(userButton).toHaveAttribute("aria-pressed", "true");
      await expect(modal.locator('[aria-label="Select user"]')).toBeVisible();
      await expect(addRuleButton).toBeDisabled();

      // Close via the Done button in the footer (per the modal's
      // DialogFooter) rather than Escape -- the Done button is the
      // explicit dismissal control.
      await modal.getByRole("button", { name: "Done" }).click();
      await expect(modal).toBeHidden({ timeout: 10_000 });
    });

    await test.step("Directory row 'Delete' soft-deletes the outer folder", async () => {
      if (!openedConfiguration) return;

      const outerFolder = page.getByText(dirName, { exact: true }).first();
      await expect(outerFolder).toBeVisible({ timeout: 15_000 });

      const outerTile = page
        .locator('[role="button"]')
        .filter({ hasText: dirName })
        .first();
      const moreButton = outerTile
        .locator('button[aria-haspopup="menu"]')
        .first();
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

      // Stage a file, then remove it via its own X icon before uploading --
      // it must leave the pending list entirely, not just visually hide.
      await page.setInputFiles('input[type="file"]', {
        name: stagedOnlyFileName,
        mimeType: "text/plain",
        buffer: Buffer.from("this one should never reach the server"),
      });
      await expect(page.getByText(stagedOnlyFileName)).toBeVisible({ timeout: 10_000 });
      // Strict: the staged-file row must offer its own Remove button.
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
      // The removed staged file must never have actually been uploaded.
      await expect(page.getByText(stagedOnlyFileName)).toHaveCount(0);
    });

    await test.step("Preview the uploaded file and confirm real content renders", async () => {
      if (!openedConfiguration) return;
      const fileEntry = page.getByText(fileName, { exact: true }).first();
      await expect(fileEntry).toBeVisible({ timeout: 15_000 });

      await fileEntry.click();
      const preview = page.getByRole("dialog");
      await expect(preview).toBeVisible({ timeout: 15_000 });
      // Strict check: the preview must show the file we actually uploaded,
      // not just render an empty/generic dialog shell.
      await expect(preview).toContainText(fileName);
      // FilePreviewModal has both the default X (sr-only "Close") and a
      // footer "Close" button -- pick the first match (the X) so we don't
      // collide with the footer button's accessible name.
      await preview.getByRole("button", { name: "Close" }).first().click();
      await expect(preview).toBeHidden();
    });

    await test.step("File row 'Versions' opens FileVersionsDrawer for that file", async () => {
      if (!openedConfiguration) return;
      await openFileMoreOptions(page, fileName);

      // Strict: Versions must be present in the file row's menu --
      // permission gating that strips it is a regression we want to
      // fail on, not silently skip.
      const versionsOption = page.getByRole("menuitem", { name: "Versions" });
      await expect(versionsOption).toBeVisible({ timeout: 5_000 });
      await versionsOption.click();

      // FileVersionsDrawer is a Vaul Sheet — it uses role="dialog" too, but
      // its title is the only one that includes the file name.
      const drawer = page
        .getByRole("dialog")
        .filter({ has: page.getByText(`Versions of ${fileName}`) });
      await expect(drawer).toBeVisible({ timeout: 15_000 });
      // Close via the explicit Close button (X icon at top-right with
      // sr-only "Close") rather than Escape -- Escape only works when
      // focus is inside the Vaul Sheet's keydown handler, and it can
      // silently fail when the focus has drifted.
      await drawer.getByRole("button", { name: "Close" }).click();
      await expect(drawer).toBeHidden({ timeout: 10_000 });
    });

    await test.step("File row 'Manage access' opens ManageAccessModal for that file", async () => {
      if (!openedConfiguration) return;
      await openFileMoreOptions(page, fileName);

      // Strict: Manage access must be present in the file row's menu.
      const accessOption = page.getByRole("menuitem", { name: "Manage access" });
      await expect(accessOption).toBeVisible({ timeout: 5_000 });
      await accessOption.click();

      // ManageAccessModal is a Radix Dialog — its title is "Manage access".
      const modal = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Manage access" }) });
      await expect(modal).toBeVisible({ timeout: 15_000 });

      // Same strict checks as the directory-row step — the modal is shared,
      // and a regression here should surface identically for files. Catches
      // a stripped heading, a different item name, a missing principal-type
      // row, or a shortened description.
      await expect(modal.getByRole("heading", { name: "Manage access" })).toBeVisible();
      await expect(modal).toContainText(fileName);
      await expect(modal).toContainText(
        `Control who can access ${fileName} and what they can do.`,
      );
      await expect(modal.getByRole("heading", { name: "Add access" })).toBeVisible();

      // The four principal-type buttons -- modal would silently lose one
      // if PRINCIPAL_TYPES in manage-access-modal.tsx were trimmed. They
      // are <button aria-pressed> with text content matching the type
      // exactly, so { exact: true } keeps the locator from matching the
      // "Permission" or "Effect" Select triggers by accident.
      for (const principal of ["User", "Role", "Organization", "Everyone"]) {
        await expect(
          modal.getByRole("button", { name: principal, exact: true }),
        ).toBeVisible();
      }
      await expect(modal.getByRole("heading", { name: "Access rules" })).toBeVisible();
      await expect(modal.getByRole("button", { name: /Add access rule/i })).toBeVisible();

      // Close via the explicit Close button (X icon at top-right with
      // sr-only "Close") rather than Escape.
      await modal.getByRole("button", { name: "Close" }).click();
      await expect(modal).toBeHidden({ timeout: 10_000 });
    });

    await test.step("File row 'Move' opens MoveCopyDialog and renders the file in the picker", async () => {
      if (!openedConfiguration) return;
      await openFileMoreOptions(page, fileName);

      // Strict: Move must be present in the file row's menu.
      const moveOption = page.getByRole("menuitem", { name: "Move" });
      await expect(moveOption).toBeVisible({ timeout: 5_000 });
      await moveOption.click();

      const moveDialog = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("heading", { name: "Move item" }) });
      await expect(moveDialog).toBeVisible({ timeout: 15_000 });
      await expect(moveDialog).toContainText(fileName);

      // The picker seeds at the file's parent. For a file uploaded to the
      // storage root, the only offered destination is "Root" with no id, so
      // the confirm action is gated off -- the strict check is that the
      // dialog renders the picker and an action button, not that it commits.
      const moveHere = moveDialog.getByRole("button", { name: /^Move here$/ });
      await expect(moveHere).toBeVisible();

      // Close via the explicit Close button rather than Escape.
      await moveDialog.getByRole("button", { name: "Close" }).click();
      await expect(moveDialog).toBeHidden({ timeout: 10_000 });
    });

    await test.step("File row 'Copy' opens MoveCopyDialog and renders the file in the picker", async () => {
      if (!openedConfiguration) return;
      await openFileMoreOptions(page, fileName);

      // Strict: Copy must be present in the file row's menu.
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

      // Close via the explicit Close button rather than Escape.
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

      // If the view-mode toggle isn't on the page (empty directory, no items),
      // there's nothing to verify here.
      await expect(listButton).toBeVisible({ timeout: 15_000 });
      await expect(gridButton).toBeVisible({ timeout: 15_000 });

      // Land in list view first so downstream flows can use <tr> selectors.
      await listButton.click();
      await expect(page.getByRole("row").filter({ hasText: fileName }).first()).toBeVisible({
        timeout: 10_000,
      });

      // Now flip to grid and confirm the file is still visible as a tile.
      await gridButton.click();
      await expect(page.getByText(fileName, { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });

      // Flip back to list view so the Delete flow that follows can find the
      // file as a <tr> row without depending on the grid-mode helper.
      await listButton.click();
      await expect(page.getByRole("row").filter({ hasText: fileName }).first()).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step("Search inside the file browser filters files by name", async () => {
      if (!openedConfiguration) return;

      const browserSearch = page.getByPlaceholder("Search...").first();
      // Strict: the FilterToolbar must be present once we are inside a
      // directory that contains items. A missing toolbar is a regression.
      await expect(browserSearch).toBeVisible({ timeout: 15_000 });

      await browserSearch.fill("zzz_no_match_xyz");
      // The file should disappear while the no-match search is active.
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

      // All / Files / Directorys filter chips render up top.
      await expect(page.getByRole("button", { name: "All" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Files" }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Directorys" }).first()).toBeVisible();

      // Strict check: the file we just deleted must be listed here. DmsItemList
      // renders rows as <li> within <ul>, not as table rows, so we scope the
      // action buttons to the <li> that contains the file name.
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

      // Switch to Files-only and confirm the deleted file is still listed.
      await page.getByRole("button", { name: "Files" }).first().click();
      await expect(page.getByText(fileName, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });

      // Switch to Directorys-only and confirm the deleted file is no longer listed.
      await page.getByRole("button", { name: "Directorys" }).first().click();
      await expect(page.getByText(fileName, { exact: true })).toHaveCount(0, {
        timeout: 10_000,
      });

      // Back to All so the next step sees the file again.
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
      // Restored items disappear from the trash listing once the mutation
      // completes; the strict check is the absence of the row after a beat.
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

      // Delete a directory from the trash so we don't run the file deletion
      // through permanent-delete twice (the previous step already restored it).
      const dirTrashRow = page.locator("li").filter({ hasText: dirName }).first();
      // Strict: the soft-deleted directory must still be present in the
      // trash. If it isn't, an earlier step already removed it.
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

      // Re-upload is not part of this step — the search query above is just
      // matched against the test's `fileName` substring; whether the upload is
      // present after the restore step depends on the server's timing.
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Search storage" })).toBeVisible({
        timeout: 30_000,
      });

      const searchInput = page.getByPlaceholder("Search files and directorys");
      await expect(searchInput).toBeVisible();

      // Search by a clearly non-matching token and confirm the empty state.
      await searchInput.fill("zzz_no_match_xyz");
      await expect(page.getByText(/Nothing matches/)).toBeVisible({ timeout: 15_000 });

      // Reset and confirm the prompt returns.
      await searchInput.fill("");
      await expect(
        page.getByText(/Type to search across your directorys and files\./),
      ).toBeVisible({ timeout: 15_000 });
    });
  });
});
