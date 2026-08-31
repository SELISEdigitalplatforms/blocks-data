import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base/BasePage";

export class DataGatewayConfigurationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(projectId?: string): Promise<void> {
    const url = new URL(this.page.url());
    const id = projectId ?? url.pathname.split("/")[2];
    if (id) {
      await this.page.goto(`${url.origin}/app/${id}/data-gateway/configuration`, {
        waitUntil: "domcontentloaded",
      });
    } else {
      await this.navigateViaSidebar();
    }
  }

  async navigateViaSidebar(): Promise<void> {
    const link = this.page.getByRole("link", { name: "Data Gateway" }).first();
    await link.click();
    const configureBtn = this.page.getByRole("button", { name: "Configure" });
    await expect(configureBtn).toBeVisible({ timeout: 15_000 });
    await configureBtn.click();
    await this.waitForURL(/\/configuration/, 30_000);
  }

  getDataSourceHeading(): Locator {
    return this.page.getByRole("heading", { name: "Data Source" });
  }

  getCollectionSettingsHeading(): Locator {
    return this.page.getByRole("heading", { name: "Collection Settings" });
  }

  getCollectionNameEditableSwitch(): Locator {
    return this.page.getByRole("switch", { name: "Collection Name Editable" });
  }

  async waitForLoaded(timeout = 30_000): Promise<void> {
    await expect(this.getDataSourceHeading()).toBeVisible({ timeout });
    await expect(this.getCollectionSettingsHeading()).toBeVisible({ timeout: 10_000 });
    await expect(this.getCollectionNameEditableSwitch()).toBeVisible({ timeout: 15_000 });
  }

  async toggleCollectionNameEditable(): Promise<void> {
    const initial = await this.getCollectionNameEditableSwitch().getAttribute("aria-checked");
    await this.getCollectionNameEditableSwitch().click();
    await expect(this.getCollectionNameEditableSwitch()).not.toHaveAttribute(
      "aria-checked",
      initial ?? "",
    );
    await this.getCollectionNameEditableSwitch().click();
    await expect(this.getCollectionNameEditableSwitch()).toHaveAttribute(
      "aria-checked",
      initial ?? "",
    );
  }
}
