import { expect, type Page } from "@playwright/test";
import { test } from "../../support/test-base";
import { openEnvironment } from "../../support/navigation";
import { dismissSessionConflictIfPresent } from "../../support/session-conflict";

/**
 * Advanced Storage coverage that runs WITHOUT real SFTP credentials:
 * the "Configure in Blocks OS" entry point (configurations moved to Blocks OS
 * in 6fdac347) and the storage-detail UI states (breadcrumb, view toggle, dialogs, search) driven
 * behind the same route mocks the main flow spec uses. Destructive or
 * backend-mutating actions are deliberately NOT exercised here — the full
 * file/folder chain lives in storage-flow.spec.ts behind E2E_STORAGE_SFTP_*.
 *
 * Locators are derived from client/app/storage sources:
 * storage-filters-toolbar.tsx ("Configure in Blocks OS"),
 * storage-detail.tsx (breadcrumb, icon-only view toggles, "Add New" menu),
 * trash.tsx (filter chip labels).
 */

async function openStorage(page: Page) {
  // The Storage sidebar link only exists inside the project shell.
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
  // The real backend filters server-side via the `search` query param
  // (dms-directory.service sends ?search=, storage-detail passes
  // filters.search to useDmsChildren) — honour it so the search step can
  // assert a genuine no-match listing instead of a decorative refetch.
  await page.route("**/get-objects**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("search")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], totalChildCount: 0, hasMore: false }),
      });
      return;
    }
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
            description: "Mocked folder for the e2e advanced flow",
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

test.describe("feature: Storage advanced flows", () => {
  test.setTimeout(360_000);

  test("configuration form expiry/max-size fields and mocked detail-page states", async ({
    page,
  }) => {
    // Drift (6fdac347, 2026-10-15): the in-app configuration form, with its URL expiry and max
    // file size fields, was removed; "Configure in Blocks OS" opens the OS secret-management page
    // for storage in a new tab instead (storage.tsx onAddConfiguration, use-scoped-path.ts).
    await test.step("Add menu: 'Configure in Blocks OS' opens the OS storage configuration page", async () => {
      await openEnvironment(page);
      await dismissSessionConflictIfPresent(page);
      await openStorage(page);
      await page.setViewportSize({ width: 1440, height: 900 });

      await page.getByRole("button", { name: "Add", exact: true }).first().click();
      const configureItem = page.getByRole("menuitem", { name: "Configure in Blocks OS" });
      await expect(configureItem).toBeVisible({ timeout: 30_000 });

      const popupPromise = page.waitForEvent("popup");
      await configureItem.click();
      const popup = await popupPromise;
      await popup.waitForURL(/\/secret-management\/storage$/, { waitUntil: "commit" });
      await popup.close();
    });

    await test.step("Detail page (mocked): card opens ?id=, strategy heading and mocked folder listed", async () => {
      await mockStorageConfigurationsListing(page);
      await mockDirectoryListing(page);

      // Step 1 already put us on /storage — clicking the Storage link again
      // is a same-route trip that never refetches, so the route mocks would
      // stay idle and the real listing would show. Reload to fetch through
      // the mocks.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: "Add" })).toBeVisible({
        timeout: 30_000,
      });
      // The list card shows the provider label, not the configuration name —
      // a "Default" configuration renders no name at all
      // (storage-configuration-list.tsx). Our mocked config is Amazon → "AWS".
      const providerCard = page
        .getByRole("main")
        .getByText("AWS", { exact: true })
        .first();
      await expect(providerCard).toBeVisible({ timeout: 15_000 });
      await providerCard.click();

      await expect(page).toHaveURL(/storage\?id=/, { timeout: 15_000 });
      // The detail header shows the raw strategy for non-S3 providers
      // (storage-detail.tsx) — our mocked configuration is Amazon.
      await expect(page.getByRole("heading", { name: "Amazon" })).toBeVisible({
        timeout: 15_000,
      });
      const mockedFolder = page
        .getByText("e2e-mocked-folder", { exact: true })
        .first();
      await expect(mockedFolder).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Detail page: breadcrumb renders and grid/list toggles switch the listing markup", async () => {
      // The breadcrumb renders unconditionally on the detail page
      // (storage-detail.tsx renders <Breadcrumb> above the header).
      await expect(page.locator("nav[aria-label='breadcrumb']").first()).toBeVisible({
        timeout: 10_000,
      });

      // The view toggles are icon-only buttons holding lucide List /
      // LayoutGrid icons (storage-detail.tsx); they render once the mocked
      // listing has a child (totalChildCount > 0). The default view is grid:
      // each directory renders as a role=button card.
      const listToggle = page.locator("button:has(svg.lucide-list)").first();
      const gridToggle = page.locator("button:has(svg.lucide-layout-grid)").first();
      await expect(listToggle).toBeVisible({ timeout: 10_000 });
      await expect(gridToggle).toBeVisible();
      const folderCard = page
        .locator('div[role="button"]')
        .filter({ has: page.getByText("e2e-mocked-folder", { exact: true }) })
        .first();
      await expect(folderCard).toBeVisible({ timeout: 10_000 });

      // List view swaps the card grid for a typed table — the "File type"
      // column header renders only in list mode (storage-detail.tsx).
      await listToggle.click();
      await expect(page.getByRole("columnheader", { name: "File type" }).first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole("cell", { name: "e2e-mocked-folder" }).first()).toBeVisible({
        timeout: 10_000,
      });

      // Grid view restores the cards and drops the table.
      await gridToggle.click();
      await expect(folderCard).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("columnheader", { name: "File type" })).toBeHidden();
    });

    await test.step("Detail page: 'Add New' menu offers Upload file and Create new directory dialogs", async () => {
      // At the root of the "Default" configuration the Add-New button is
      // hidden (storage-detail.tsx renders it only for sub-directories or
      // non-default configurations), so enter the mocked folder first.
      await page.getByText("e2e-mocked-folder", { exact: true }).first().click();

      const addNew = page.getByRole("button", { name: "Add New" }).first();
      // Inside a sub-directory the button always renders (storage-detail.tsx).
      await expect(addNew).toBeVisible({ timeout: 10_000 });
      await addNew.click();

      const uploadItem = page.getByRole("menuitem", { name: "Upload file" });
      await expect(uploadItem).toBeVisible({ timeout: 10_000 });
      await uploadItem.click();
      const uploadDialog = page.getByRole("dialog").first();
      await expect(uploadDialog).toBeVisible({ timeout: 10_000 });
      const cancel = uploadDialog.getByRole("button", { name: /Cancel/i }).first();
      await cancel.click();
      await expect(uploadDialog).toBeHidden({ timeout: 10_000 });

      await addNew.click();
      const directoryItem = page.getByRole("menuitem", { name: "Create new directory" });
      await expect(directoryItem).toBeVisible({ timeout: 10_000 });
      await directoryItem.click();
      const directoryDialog = page.getByRole("dialog").first();
      await expect(directoryDialog).toBeVisible({ timeout: 10_000 });
      const directoryCancel = directoryDialog
        .getByRole("button", { name: /Cancel/i })
        .first();
      await expect(directoryCancel).toBeVisible({ timeout: 10_000 });
      await directoryCancel.click();
      await expect(directoryDialog).toBeHidden({ timeout: 10_000 });
    });

    await test.step("Detail page: server-side search narrows to the no-match empty listing", async () => {
      const searchInput = page
        .getByPlaceholder(/search/i)
        .first();
      await expect(searchInput).toBeVisible({ timeout: 10_000 });

      // The mocked get-objects returns an empty list whenever a search term
      // is present, mirroring the real server-side filter. Arm the response
      // wait BEFORE typing — the SearchFilter onChange already fires the
      // get-objects refetch, Enter is only a safety.
      const searchSettled = page.waitForResponse(
        (resp) =>
          resp.url().includes("get-objects") &&
          new URL(resp.url()).searchParams.has("search"),
        { timeout: 10_000 },
      );
      await searchInput.fill(`zzz-no-match-${Date.now()}`);
      await searchSettled;

      // The detail page renders the server result verbatim
      // (storage-detail.tsx: filteredDirectorys = directorys), so a no-match
      // response must remove the folder from the listing entirely. The
      // breadcrumb is excluded on purpose: its current-page crumb keeps
      // showing the folder name even when the listing is empty, so the
      // no-match check scopes to the listing markup itself (grid card or
      // table row).
      const listingMatches = page
        .locator('div[role="button"], table tbody tr')
        .filter({ has: page.getByText("e2e-mocked-folder", { exact: true }) });
      await expect(listingMatches).toHaveCount(0, { timeout: 10_000 });

      // Clearing drops the search param (the react-query key changes back),
      // so the unfiltered listing — and the folder — returns, in whichever
      // view mode the page is in.
      await searchInput.fill("");
      await expect(listingMatches.first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Trash page: filter chips render over the real backend without destructive actions", async () => {
      const trashLink = page.getByRole("link", { name: /Trash/i }).first();
      const trashLinkShown = await trashLink
        .waitFor({ state: "visible", timeout: 3_000 })
        .then(
          () => true,
          () => false,
        );
      if (trashLinkShown) {
        await trashLink.click();
      } else {
        const currentUrl = new URL(page.url());
        const projectId = currentUrl.pathname.split("/")[2];
        await page.goto(
          `${currentUrl.origin}/app/${projectId}/storage/trash`,
          { waitUntil: "domcontentloaded" },
        );
      }

      await expect(page).toHaveURL(/storage\/trash/, { timeout: 30_000 });

      // Chip labels come from the app verbatim — including the "Directorys"
      // typo (client search/trash filter chips). Client-team note: when the
      // typo is fixed in the app, update this string.
      for (const chip of ["All", "Directorys", "Files"]) {
        const chipButton = page
          .getByRole("button", { name: chip, exact: true })
          .first();
        await expect(chipButton).toBeVisible({ timeout: 10_000 });
        await chipButton.click();
      }
      // Read-only: no Restore, no Delete permanently.
    });
  });
});
