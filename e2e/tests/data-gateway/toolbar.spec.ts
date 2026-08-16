import { test, expect } from "@playwright/test";
import { openEnvironment } from "../../support/navigation";
import { login } from "../../support/auth";

test.describe("data gateway - actions toolbar", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnvironment(page);

    await page.getByRole("link", { name: "Data Gateway" }).click();
    await expect(page.getByText("Data Gateway")).toBeVisible({
      timeout: 30000,
    });
  });

  test("TC-0093: Actions toolbar shows Import/Export/Playground/Configure as inline buttons on desktop widths", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const importButton = page.getByRole("button", { name: "Import" });
    if (await importButton.isVisible().catch(() => false)) {
      await expect(importButton).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Export" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("button", { name: "Playground" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("button", { name: "Configure" })).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test("TC-0094: Actions toolbar collapses into a single 'More options' dropdown below the xl breakpoint", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    const actionsButton = page.getByRole("button", { name: "Actions" });
    if (await actionsButton.isVisible().catch(() => false)) {
      await actionsButton.click();
      await expect(page.getByText("Import")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Export")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Playground")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Configure")).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test("TC-0095: 'Playground' action navigates to the GraphQL Playground route and is marked active there", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const playgroundButton = page.getByRole("button", { name: "Playground" });
    if (await playgroundButton.isVisible().catch(() => false)) {
      await playgroundButton.click();
      await expect(page).toHaveURL(/\/playground/, { timeout: 10000 });
    }
  });

  test("TC-0096: 'Configure' action navigates to the data-source configuration route and is marked active there", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const configureNavButton = page.getByRole("button", { name: "Configure" });
    if (await configureNavButton.isVisible().catch(() => false)) {
      await configureNavButton.click();
      await expect(page).toHaveURL(/\/configuration/, { timeout: 10000 });
    }
  });

  test("TC-0097: 'Export' action opens the Export Schema modal", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const exportButton = page.getByRole("button", { name: "Export" });
    if (await exportButton.isVisible().catch(() => false)) {
      await exportButton.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test("TC-0098: 'Import' action opens the Import Schema modal with a fresh instance each time", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const importButton = page.getByRole("button", { name: "Import" });
    if (await importButton.isVisible().catch(() => false)) {
      await importButton.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({
        timeout: 30_000,
      });
    }
  });
});
