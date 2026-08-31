import { type Page, type Locator, expect } from "@playwright/test";

export class DataGatewayActions {
  constructor(private page: Page) {}

  getImportButton(): Locator {
    return this.page.getByRole("button", { name: "Import" });
  }

  getExportButton(): Locator {
    return this.page.getByRole("button", { name: "Export" });
  }

  getPlaygroundButton(): Locator {
    return this.page.getByRole("button", { name: "Playground" });
  }

  getConfigureButton(): Locator {
    return this.page.getByRole("button", { name: "Configure" });
  }

  openActionsMenu(): Locator {
    return this.page.getByRole("button", { name: "Actions", exact: true });
  }

  async assertAllActionsVisible(): Promise<void> {
    for (const action of [
      this.getImportButton(),
      this.getExportButton(),
      this.getPlaygroundButton(),
      this.getConfigureButton(),
    ]) {
      await expect(action).toBeVisible({ timeout: 15_000 });
    }
  }

  async openImportModal(): Promise<void> {
    await this.getImportButton().click();
    await expect(this.page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
  }

  async openExportModal(): Promise<void> {
    await this.getExportButton().click();
    await expect(this.page.getByRole("dialog")).toBeVisible({ timeout: 30_000 });
  }

  async navigateToPlayground(): Promise<void> {
    await this.getPlaygroundButton().click();
    await expect(this.page).toHaveURL(/\/playground/, { timeout: 10_000 });
  }

  async navigateToConfiguration(): Promise<void> {
    await this.getConfigureButton().click();
    await expect(this.page).toHaveURL(/\/configuration/, { timeout: 30_000 });
  }
}
