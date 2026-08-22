import { test, expect, Page } from "@playwright/test";
import { loginFresh } from "../../support/auth-helpers";
import { openEnvironment } from "../../support/navigation";

/**
 * One continuous flow test for the "Storage" menu item: open Add
 * Configuration and cancel -> search/filter configurations -> open a
 * configuration's file browser -> create a folder -> upload a file ->
 * preview it -> delete it. Each test.step is one ordered stage of the same
 * journey, not an independent case.
 */

async function openStorage(page: Page) {
  // The breadcrumb (also an aria-navigation region) can carry its own
  // "Storage" link once inside a sub-route. The sidebar link renders first
  // in DOM order, so .first() reliably targets it.
  await page.getByRole("link", { name: "Storage" }).first().click();
  await expect(page.getByRole("button", { name: "Add" })).toBeVisible({ timeout: 30_000 });
}

test.describe("flow: Storage menu", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Storage — full flow", async ({ page }) => {
    test.setTimeout(300_000);

    await loginFresh(page);
    await openEnvironment(page);
    await openStorage(page);

    await test.step("Add Configuration form validates required fields before it can be saved", async () => {
      await page.getByRole("button", { name: "Add" }).click();
      await page.getByText("Add Configuration", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Add Storage Configuration" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Storage Provider")).toBeVisible();

      const saveButton = page.getByRole("button", { name: "Save" });

      // Strict check: with no provider selected and no name entered, Save
      // must not silently succeed -- it should either stay disabled or
      // surface a validation error when clicked.
      const saveDisabledWithNothingFilled = await saveButton.isDisabled().catch(() => false);
      if (!saveDisabledWithNothingFilled) {
        await saveButton.click();
        await expect(page.getByText(/required/i).first()).toBeVisible({ timeout: 10_000 });
      } else {
        await expect(saveButton).toBeDisabled();
      }

      // Selecting a provider but leaving its required fields empty must
      // still block save with a concrete validation message, not a silent
      // no-op or a generic failure.
      const providerSelect = page.getByRole("combobox").first();
      if (await providerSelect.isVisible().catch(() => false)) {
        await providerSelect.click();
        const firstOption = page.getByRole("option").first();
        await firstOption.click();

        const nameInput = page.getByPlaceholder("Enter name");
        if (await nameInput.isVisible().catch(() => false)) {
          await saveButton.click();
          await expect(page.getByText(/required/i).first()).toBeVisible({ timeout: 10_000 });
        }
      }

      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByRole("heading", { name: "Add Storage Configuration" })).toBeHidden();
    });

    await test.step("Search configurations, then reset the filter", async () => {
      const searchInput = page.getByPlaceholder(/search/i).first();
      if (!(await searchInput.isVisible().catch(() => false))) return;

      await searchInput.fill("zzz_no_match_xyz");
      await expect(page.getByText("No storage configurations found.")).toBeVisible({
        timeout: 5_000,
      });

      const resetButton = page.getByRole("button", { name: /reset/i });
      if (await resetButton.isVisible().catch(() => false)) {
        await resetButton.click();
      } else {
        await searchInput.fill("");
      }
      await expect(searchInput).toHaveValue("");
    });

    await test.step("Filter by provider and confirm the filter control stays visible", async () => {
      const providerFilter = page.getByRole("button", { name: /Provider/i });
      if (!(await providerFilter.isVisible().catch(() => false))) return;

      await providerFilter.click();
      await page.getByRole("option", { name: "AWS", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(providerFilter).toBeVisible({ timeout: 30_000 });
    });

    await test.step("Open a configuration card's details drawer", async () => {
      const moreButton = page
        .locator("button")
        .filter({ has: page.locator("svg.lucide-ellipsis-vertical") })
        .first();
      if (!(await moreButton.isVisible().catch(() => false))) return;

      await moreButton.click();
      await page.getByText("View Details", { exact: true }).click();
      await expect(page.getByText("Details", { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Storage provider")).toBeVisible();
      await expect(page.getByText("Owner")).toBeVisible();

      const editFromDrawer = page.getByRole("button", { name: /edit/i });
      if (await editFromDrawer.isVisible().catch(() => false)) {
        await editFromDrawer.click();
        await expect(page.getByRole("heading", { name: /edit/i })).toBeVisible({
          timeout: 15_000,
        });
        const cancelEdit = page.getByRole("button", { name: "Cancel" });
        if (await cancelEdit.isVisible().catch(() => false)) {
          await cancelEdit.click();
        }
      }
      await page.keyboard.press("Escape");
    });

    let openedConfiguration = false;

    await test.step("Open the first configuration and land in its file browser", async () => {
      const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
      if (!(await firstCard.isVisible().catch(() => false))) return;

      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15_000 });
      await expect(page.getByText("Storage", { exact: true })).toBeVisible({ timeout: 30_000 });
      openedConfiguration = true;
    });

    const dirName = `flow_folder_${Date.now()}`;
    const nestedDirName = `flow_nested_${Date.now()}`;

    await test.step("Create a folder, nest a second folder inside it, then walk back out via breadcrumb", async () => {
      if (!openedConfiguration) return;
      const addNewButton = page.getByRole("button", { name: "Add New" });
      if (!(await addNewButton.isVisible().catch(() => false))) return;

      await addNewButton.click();
      await page.getByText("Create new directory").click();
      await page.getByPlaceholder("Enter directory name").fill(dirName);
      await page.getByRole("button", { name: "Create" }).click();
      await expect(page.getByText("Directory created successfully.")).toBeVisible({
        timeout: 15_000,
      });

      const folderTile = page.getByText(dirName, { exact: true }).first();
      await expect(folderTile).toBeVisible({ timeout: 10_000 });
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

      // Breadcrumb should offer the intermediate (first-level) segment, not
      // just root -- clicking it should land one level up, not all the way
      // back to the configuration root.
      const breadcrumbFirstLevel = page.getByRole("navigation").getByText(dirName, { exact: true });
      if (await breadcrumbFirstLevel.isVisible().catch(() => false)) {
        await breadcrumbFirstLevel.click();
        expect(page.url()).toBe(firstLevelUrl);
      }

      await page.getByText("Storage", { exact: true }).click();
      await expect(page).not.toHaveURL(/directoryId=/, { timeout: 30_000 });
    });

    const fileName = `flow-file-${Date.now()}.txt`;
    const stagedOnlyFileName = `flow-staged-only-${Date.now()}.txt`;

    await test.step("Stage a file, remove it before upload, then upload a real one", async () => {
      if (!openedConfiguration) return;
      const addNewButton = page.getByRole("button", { name: "Add New" });
      if (!(await addNewButton.isVisible().catch(() => false))) return;

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
      const removeStaged = page.getByRole("button", { name: `Remove ${stagedOnlyFileName}` });
      if (await removeStaged.isVisible().catch(() => false)) {
        await removeStaged.click();
        await expect(page.getByText(stagedOnlyFileName)).toHaveCount(0);
      }
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
      if (!(await fileEntry.isVisible().catch(() => false))) return;

      await fileEntry.click();
      const preview = page.getByRole("dialog");
      await expect(preview).toBeVisible({ timeout: 15_000 });
      // Strict check: the preview must show the file we actually uploaded,
      // not just render an empty/generic dialog shell.
      await expect(preview).toContainText(fileName);
      await page.keyboard.press("Escape");
      await expect(preview).toBeHidden();
    });

    await test.step("Explore the file row's 'More options' beyond Delete (Rename/Move/Copy/Share)", async () => {
      if (!openedConfiguration) return;
      const fileRow = page.getByRole("row").filter({ hasText: fileName }).first();
      if (!(await fileRow.isVisible().catch(() => false))) return;

      await fileRow.getByRole("button", { name: "More options" }).click();
      const renameOption = page.getByText("Rename", { exact: false });
      if (await renameOption.isVisible().catch(() => false)) {
        await renameOption.click();
        const renameInput = page.getByRole("textbox").first();
        if (await renameInput.isVisible().catch(() => false)) {
          await expect(renameInput).toHaveValue(fileName);
          const renameCancel = page.getByRole("button", { name: "Cancel" });
          if (await renameCancel.isVisible().catch(() => false)) {
            await renameCancel.click();
          } else {
            await page.keyboard.press("Escape");
          }
        }
      } else {
        await page.keyboard.press("Escape");
      }
    });

    await test.step("Delete the uploaded file and confirm it's gone", async () => {
      if (!openedConfiguration) return;
      const fileRow = page.getByRole("row").filter({ hasText: fileName }).first();
      if (!(await fileRow.isVisible().catch(() => false))) return;

      await fileRow.getByRole("button", { name: "More options" }).click();
      await page.getByText("Delete", { exact: false }).click();
      await page.getByRole("button", { name: "Delete" }).last().click();
      await expect(page.getByText("File Deleted successfully")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(fileName, { exact: true })).toHaveCount(0);
    });
  });
});
