import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base/BasePage";

export class PlaygroundPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(projectId?: string): Promise<void> {
    const url = new URL(this.page.url());
    const id = projectId ?? url.pathname.split("/")[2];
    if (id) {
      await this.page.goto(`${url.origin}/app/${id}/data-gateway/playground`, {
        waitUntil: "domcontentloaded",
      });
    } else {
      const navLink = this.page.getByRole("link", { name: "Data Gateway" }).first();
      await navLink.click();
      await this.waitForURL(/\/data-gateway/, 30_000);
      const playgroundBtn = this.page.getByRole("button", { name: "Playground" });
      await expect(playgroundBtn).toBeVisible({ timeout: 15_000 });
      await playgroundBtn.click();
      await this.waitForURL(/\/playground/, 10_000);
    }
  }

  getExecuteButton(): Locator {
    return this.page.getByRole("button", { name: /execute/i }).first();
  }

  getResponseHeader(): Locator {
    return this.page
      .locator("span")
      .filter({ hasText: /^Response$/ })
      .first();
  }

  getEmptyResponsePlaceholder(): Locator {
    return this.page.getByText("// Execute a query to see the response");
  }

  getOpenSchemasDrawerButton(): Locator {
    return this.page.getByRole("button", { name: "Schemas" });
  }

  getSchemaSearchInput(): Locator {
    return this.page.getByPlaceholder("Search types, fields...");
  }

  getCloseSchemasDrawerButton(): Locator {
    return this.page.getByRole("button", { name: "Close schemas drawer" });
  }

  getCleanTestDataButton(): Locator {
    return this.page.getByRole("button", { name: "Clean Test Data" });
  }

  async executeQuery(): Promise<void> {
    await expect(this.getExecuteButton()).toBeVisible({ timeout: 10_000 });
    await expect(this.getExecuteButton()).toBeEnabled({ timeout: 10_000 });
    await this.getExecuteButton().click();
    await expect(this.getResponseHeader()).toBeVisible({ timeout: 15_000 });
    await expect(this.getEmptyResponsePlaceholder()).toBeHidden({ timeout: 15_000 });
  }

  async openSchemasDrawer(): Promise<void> {
    await this.getOpenSchemasDrawerButton().click();
    const drawer = this.page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await expect(drawer.getByText("Schemas", { exact: true }).first()).toBeVisible();
    await expect(this.getSchemaSearchInput()).toBeVisible();
  }

  async closeSchemasDrawer(): Promise<void> {
    await this.getCloseSchemasDrawerButton().click();
    await expect(this.page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
  }

  async openCleanTestDataModal(): Promise<void> {
    await this.getCleanTestDataButton().click();
    const dialog = this.page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole("heading", { name: "Clean Test Data" })).toBeVisible();
  }

  async closeCleanTestDataModal(): Promise<void> {
    await this.page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(this.page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
  }

  assertCleanTestDataContent(): Promise<void> {
    return expect(this.page.getByText(/select schemas to delete/i)).toBeVisible({
      timeout: 10_000,
    });
  }

  assertCleanTestDataDisabledState(): Promise<void> {
    const dialog = this.page.getByRole("dialog");
    return expect(dialog.getByRole("button", { name: "Delete" }).first()).toBeDisabled();
  }
}
