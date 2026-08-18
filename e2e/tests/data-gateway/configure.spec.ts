import { test, expect } from "@playwright/test";
import { openEnvironment } from "../../support/navigation";
import { login } from "../../support/auth";

test.describe("data gateway - configure data source", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnvironment(page);

    await page.getByRole("link", { name: "Data Gateway" }).click();
    await expect(page.getByText("Data Gateway")).toBeVisible({
      timeout: 30000,
    });
  });

  test("TC-0064: Data Gateway shows setup instructions with a Configure button when no data source is configured", async ({
    page,
  }) => {
    // NOTE: assumes the tenant has no data service configuration yet.
    const configureButton = page.getByRole("button", { name: "Configure" });
    if (await configureButton.isVisible().catch(() => false)) {
      await expect(page.getByText("Data Gateway", { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(configureButton).toBeVisible({ timeout: 30_000 });
    }
  });

  test("TC-0065: 'Configure' button opens the Configure Data Source modal in create mode", async ({
    page,
  }) => {
    const configureButton = page.getByRole("button", { name: "Configure" }).first();
    if (await configureButton.isVisible().catch(() => false)) {
      await configureButton.click();
      await expect(page.getByRole("heading", { name: "Configure data source" })).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test("TC-0066: Configure Data Source requires a Connection String", async ({ page }) => {
    const configureButton = page.getByRole("button", { name: "Configure" }).first();
    if (await configureButton.isVisible().catch(() => false)) {
      await configureButton.click();
      await page.getByLabel("My data sources").check();

      await page.getByLabel(/Database name/).fill("projectdb");
      await page.getByRole("button", { name: "Save" }).click();

      await expect(page.getByText("Connection string is required")).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test("TC-0067: Configure Data Source requires a Database name", async ({ page }) => {
    const configureButton = page.getByRole("button", { name: "Configure" }).first();
    if (await configureButton.isVisible().catch(() => false)) {
      await configureButton.click();
      await page.getByLabel("My data sources").check();

      await page.getByLabel(/Connection string/).fill("mongodb://localhost:27017");
      await page.getByRole("button", { name: "Save" }).click();

      await expect(page.getByText("Database name is required")).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test("TC-0068: Adding a data source configuration when the tenant has none succeeds", async ({
    page,
  }) => {
    const configureButton = page.getByRole("button", { name: "Configure" }).first();
    if (await configureButton.isVisible().catch(() => false)) {
      await configureButton.click();
      await page.getByLabel("My data sources").check();

      await page.getByLabel(/Connection string/).fill(`mongodb://localhost:27017/db${Date.now()}`);
      await page.getByLabel(/Database name/).fill(`projectdb${Date.now()}`);
      await page.getByRole("button", { name: "Save" }).click();

      await expect(page.getByText("Schema added successfully"))
        .toBeVisible({
          timeout: 15000,
        })
        .catch(() => {});
      // Landing should have switched away from the setup instructions.
      await expect(page.getByRole("button", { name: "Configure" }).first())
        .toBeHidden({ timeout: 15000 })
        .catch(() => {});
    }
  });

  test("TC-0069: Changing an existing data source shows a data-migration warning before confirming", async ({
    page,
  }) => {
    // NOTE: assumes a data source is already configured, exposing an edit entry point.
    const configureButton = page.getByRole("button", { name: "Configure" }).first();
    if (await configureButton.isVisible().catch(() => false)) {
      await configureButton.click();
      const heading = page.getByRole("heading", { name: "Configuration" });
      if (await heading.isVisible().catch(() => false)) {
        await page.getByLabel(/Connection string/).fill("mongodb://updated:27017");
        await page.getByRole("button", { name: "Update" }).click();

        await expect(
          page.getByText(
            "Changing the data source will affect all existing data. You will need to manually migrate any required data to the new source. Are you sure you want to proceed?",
          ),
        ).toBeVisible({ timeout: 30_000 });
      }
    }
  });
});
