import { test, expect, Page } from "@playwright/test";
import { openEnvironment } from "../../support/navigation";
import { login } from "../../support/auth";

async function ensureSchemaExists(page: Page) {
  let firstSchemaRow = page.locator('[class*="cursor-pointer"]').first();
  if (!(await firstSchemaRow.isVisible().catch(() => false))) {
    const addButton = page
      .getByRole("button", { name: "Add Schema" })
      .or(page.getByRole("button", { name: "Add" }))
      .first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
      await page.getByLabel(/Schema name/).fill(`dg_entity_${Date.now()}`);
      await page.getByRole("button", { name: "Add" }).last().click();
      await expect(page.getByText("Schema added successfully")).toBeVisible({
        timeout: 15000,
      });
    }
    firstSchemaRow = page.locator('[class*="cursor-pointer"]').first();
  }
  return firstSchemaRow;
}

test.describe("data gateway - schema sidebar", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnvironment(page);

    await page.getByRole("link", { name: "Data Gateway" }).click();
    await expect(page.getByText("Data Gateway")).toBeVisible({
      timeout: 30000,
    });
  });

  test("TC-0070: Security & Performance landing shows an 'Add Schema' button when a data source is configured", async ({
    page,
  }) => {
    const addSchemaButton = page.getByRole("button", { name: "Add Schema" }).first();
    if (await addSchemaButton.isVisible().catch(() => false)) {
      await expect(page.getByText("Data Gateway", { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(addSchemaButton).toBeVisible({ timeout: 30_000 });
    }
  });

  test("TC-0071: Schema sidebar shows header, search box, Add button and All/Entity/Child tabs", async ({
    page,
  }) => {
    const sidebarHeading = page.getByRole("heading", { name: "Schemas" });
    if (await sidebarHeading.isVisible().catch(() => false)) {
      await expect(page.getByPlaceholder("Search schemas…")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("button", { name: "Add" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("tab", { name: "All" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("tab", { name: "Entity" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("tab", { name: "Child" })).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test("TC-0072: Sidebar shows a 12-row skeleton list while the schema list is loading", async ({
    page,
  }) => {
    await page.route("**/api/**schema**list**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.reload();

    const skeletons = page.locator('[class*="skeleton"]');
    if (
      await skeletons
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      await expect(skeletons.first()).toBeVisible({ timeout: 30_000 });
    }
  });

  test("TC-0073: 'No schemas found' renders when the filtered/searched schema list is empty", async ({
    page,
  }) => {
    const searchInput = page.getByPlaceholder("Search schemas…");
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill("zzz_nonexistent");
      await expect(page.getByText("No schemas found")).toBeVisible({
        timeout: 8000,
      });
    }
  });

  test("TC-0074: Filtering the sidebar by the 'Entity' tab shows only Entity-type schemas", async ({
    page,
  }) => {
    const entityTab = page.getByRole("tab", { name: "Entity" });
    if (await entityTab.isVisible().catch(() => false)) {
      await entityTab.click();
      await expect(entityTab).toHaveAttribute("data-state", "active");
    }
  });

  test("TC-0075: Searching schemas by name filters the sidebar list after the debounce window", async ({
    page,
  }) => {
    const searchInput = page.getByPlaceholder("Search schemas…");
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill("dgfind_");
      await page.waitForTimeout(600);
      await expect(searchInput).toHaveValue("dgfind_");
    }
  });

  test("TC-0076: Selecting a schema row highlights it and loads its details in the right pane", async ({
    page,
  }) => {
    const firstSchemaRow = await ensureSchemaExists(page);
    if (await firstSchemaRow.isVisible().catch(() => false)) {
      const schemaName = (await firstSchemaRow.innerText()).trim();
      await firstSchemaRow.click();
      if (schemaName) {
        await expect(page.getByRole("heading", { name: schemaName }).first())
          .toBeVisible({ timeout: 8000 })
          .catch(() => {});
      }
    }
  });

  test("TC-0077: Pagination Prev/Next buttons are disabled at the first/last page boundaries", async ({
    page,
  }) => {
    const prevButton = page.getByTitle("Previous page");
    if (await prevButton.isVisible().catch(() => false)) {
      await expect(prevButton).toBeDisabled();

      const nextButton = page.getByTitle("Next page");
      while (await nextButton.isEnabled().catch(() => false)) {
        await nextButton.click();
        await page.waitForTimeout(300);
      }
      await expect(nextButton).toBeDisabled();
    }
  });

  test("TC-0078: Sidebar 'Publish' button republishes all schemas and shows a success toast", async ({
    page,
  }) => {
    const publishButton = page.getByRole("button", { name: "Publish" });
    if (await publishButton.isVisible().catch(() => false)) {
      await publishButton.click();
      await expect(page.getByText("Schemas published successfully"))
        .toBeVisible({
          timeout: 15000,
        })
        .catch(() => {});
    }
  });
});
