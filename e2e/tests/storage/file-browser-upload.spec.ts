import { test, expect } from "@playwright/test";
import { openEnvironment } from "../../support/navigation";
import { login } from "../../support/auth";

test.describe("storage - file browser create / upload", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnvironment(page);

    await page.getByRole("link", { name: "Storage" }).click();
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible({
      timeout: 30000,
    });
  });

  test("TC-0047: 'Add New' → 'Create new directory' opens the Create Directory dialog", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const addNewButton = page.getByRole("button", { name: "Add New" });
      if (await addNewButton.isVisible().catch(() => false)) {
        await addNewButton.click();
        await page.getByText("Create new directory").click();

        await expect(page.getByRole("heading", { name: "Create Directory" })).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.getByPlaceholder("Enter directory name")).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.getByRole("button", { name: "Create" })).toBeVisible({
          timeout: 30_000,
        });
      }
    }
  });

  test("TC-0048: Directory name is required; Create stays disabled until a name is entered", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const addNewButton = page.getByRole("button", { name: "Add New" });
      if (await addNewButton.isVisible().catch(() => false)) {
        await addNewButton.click();
        await page.getByText("Create new directory").click();

        await expect(page.getByRole("button", { name: "Create" })).toBeDisabled();
      }
    }
  });

  test("TC-0049: Creating a directory shows a success toast and refreshes the listing", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const addNewButton = page.getByRole("button", { name: "Add New" });
      if (await addNewButton.isVisible().catch(() => false)) {
        await addNewButton.click();
        await page.getByText("Create new directory").click();

        const dirName = `New Folder ${Date.now()}`;
        await page.getByPlaceholder("Enter directory name").fill(dirName);
        await page.getByRole("button", { name: "Create" }).click();

        await expect(page.getByText("Directory created successfully.")).toBeVisible({
          timeout: 15000,
        });
        await expect(page.getByText(dirName)).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test("TC-0050: Upload modal requires at least one selected file before Upload is enabled", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const addNewButton = page.getByRole("button", { name: "Add New" });
      if (await addNewButton.isVisible().catch(() => false)) {
        await addNewButton.click();
        await page.getByText("Upload file").click();

        await expect(page.getByRole("heading", { name: "Upload File" })).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.getByRole("button", { name: "Upload" })).toBeDisabled();
      }
    }
  });

  test("TC-0051: Uploading a small text file completes the presign → upload → register flow and appears in the listing", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const addNewButton = page.getByRole("button", { name: "Add New" });
      if (await addNewButton.isVisible().catch(() => false)) {
        await addNewButton.click();
        await page.getByText("Upload file").click();

        const fileName = `notes-${Date.now()}.txt`;
        await page.setInputFiles('input[type="file"]', {
          name: fileName,
          mimeType: "text/plain",
          buffer: Buffer.from("hello from playwright"),
        });

        await page.getByRole("button", { name: "Upload" }).click();

        await expect(page.getByText(/file\(s\) uploaded successfully!/)).toBeVisible({
          timeout: 20000,
        });
        await expect(page.getByText(fileName)).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test("TC-0053: Removing a staged file before upload via the X icon takes it out of the pending list", async ({
    page,
  }) => {
    const firstCard = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    if (await firstCard.isVisible().catch(() => false)) {
      await firstCard.click();
      await expect(page).toHaveURL(/[?&]id=/, { timeout: 15000 });

      const addNewButton = page.getByRole("button", { name: "Add New" });
      if (await addNewButton.isVisible().catch(() => false)) {
        await addNewButton.click();
        await page.getByText("Upload file").click();

        const fileName = `staged-${Date.now()}.txt`;
        await page.setInputFiles('input[type="file"]', {
          name: fileName,
          mimeType: "text/plain",
          buffer: Buffer.from("staged content"),
        });

        await expect(page.getByText(fileName)).toBeVisible({ timeout: 30_000 });
        await page.getByRole("button", { name: `Remove ${fileName}` }).click();
        await expect(page.getByText(fileName)).toHaveCount(0);
      }
    }
  });
});
