import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base/BasePage";

export class StoragePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(projectId?: string): Promise<void> {
    const url = new URL(this.page.url());
    const id = projectId ?? url.pathname.split("/")[2];
    if (id) {
      await this.page.goto(`${url.origin}/app/${id}/storage`, {
        waitUntil: "domcontentloaded",
      });
    } else {
      await this.page.getByRole("link", { name: "Storage" }).first().click();
      await this.waitForURL(/\/storage/, 30_000);
    }
  }

  async openViaSidebar(): Promise<void> {
    await this.page.getByRole("link", { name: "Storage" }).first().click();
    await this.waitForURL(/\/storage/, 30_000);
  }

  getAddButton(): Locator {
    return this.page.getByRole("button", { name: "Add" });
  }

  getAddConfigurationMenuItem(): Locator {
    return this.page.getByRole("menuitem", { name: "Add Configuration" });
  }

  getSearchInput(): Locator {
    return this.page.getByPlaceholder(/search/i).first();
  }

  getProviderFilterButton(): Locator {
    return this.page.getByRole("button", { name: /Provider/i });
  }

  getResetButton(): Locator {
    return this.page.getByRole("button", { name: /Reset/i });
  }

  getConfigurationCards(): Locator {
    return this.page.getByRole("main").locator('[class*="cursor-pointer"]');
  }

  getFirstCard(): Locator {
    return this.getConfigurationCards().first();
  }

  getDetailsDrawerCloseButton(): Locator {
    return this.page
      .getByRole("dialog")
      .filter({ has: this.page.getByRole("heading", { name: "Details" }) })
      .getByRole("button", { name: "Close" });
  }

  async openAddConfiguration(): Promise<void> {
    await this.getAddButton().click();
    await this.getAddConfigurationMenuItem().click();
  }

  async searchConfigurations(searchTerm: string): Promise<void> {
    await this.getSearchInput().fill(searchTerm);
  }

  async resetFilters(): Promise<void> {
    await this.getResetButton().click();
  }

  async filterByProvider(provider: "AWS" | "Azure" | "SFTP" | "AWS S3 Compatible"): Promise<void> {
    await this.getProviderFilterButton().click();
    await this.page.getByRole("option", { name: provider, exact: true }).click();
    await this.page.keyboard.press("Escape");
  }

  async openFirstCardDetailsDrawer(): Promise<void> {
    const card = this.getFirstCard();
    await expect(card).toBeVisible({ timeout: 15_000 });
    const moreButton = card.locator('button[aria-haspopup="menu"]').first();
    await expect(moreButton).toBeVisible({ timeout: 10_000 });
    await moreButton.click();
    await this.page.getByRole("menuitem", { name: "View Details", exact: true }).click();
  }

  async closeDetailsDrawer(): Promise<void> {
    await this.getDetailsDrawerCloseButton().click();
    await expect(this.page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
  }

  async waitForListingReady(timeout = 30_000): Promise<void> {
    await expect(this.getAddButton()).toBeVisible({ timeout });
  }

  assertNoConfigurationsFound(timeout = 5_000): Promise<void> {
    return expect(this.page.getByText("No storage configurations found.")).toBeVisible({ timeout });
  }

  assertConfigurationsFound(): Promise<void> {
    return expect(this.getFirstCard()).toBeVisible({ timeout: 30_000 });
  }

  getStorageBasePath(): string {
    const url = new URL(this.page.url());
    return url.origin + url.pathname.replace(/\/$/, "");
  }

  getTrashUrl(): string {
    return `${this.getStorageBasePath()}/trash`;
  }

  getSearchUrl(): string {
    return `${this.getStorageBasePath()}/search`;
  }
}
