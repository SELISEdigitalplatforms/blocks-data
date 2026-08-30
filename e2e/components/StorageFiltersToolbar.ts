import { type Page, type Locator, expect } from "@playwright/test";

export class StorageFiltersToolbar {
  constructor(private page: Page) {}

  getSearchInput(): Locator {
    return this.page.getByPlaceholder(/search/i).first();
  }

  getProviderFilterButton(): Locator {
    return this.page.getByRole("button", { name: /Provider/i });
  }

  getResetButton(): Locator {
    return this.page.getByRole("button", { name: /Reset/i });
  }

  getAddButton(): Locator {
    return this.page.getByRole("button", { name: "Add" });
  }

  getAddConfigurationMenuItem(): Locator {
    return this.page.getByRole("menuitem", { name: "Add Configuration" });
  }

  async search(term: string): Promise<void> {
    const input = this.getSearchInput();
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill(term);
  }

  async assertSearchResultsEmpty(): Promise<void> {
    await expect(this.page.getByText("No storage configurations found.")).toBeVisible({
      timeout: 5_000,
    });
  }

  async reset(): Promise<void> {
    await this.getResetButton().click();
  }

  async clearSearch(): Promise<void> {
    await this.getSearchInput().fill("");
  }

  async assertSearchInputEmpty(): Promise<void> {
    await expect(this.getSearchInput()).toHaveValue("");
  }

  async filterByProvider(provider: "AWS" | "Azure" | "SFTP" | "AWS S3 Compatible"): Promise<void> {
    await this.getProviderFilterButton().click();
    await this.page.getByRole("option", { name: provider, exact: true }).click();
    await this.page.keyboard.press("Escape");
  }

  async assertNoConfigurationsFound(): Promise<void> {
    await this.assertSearchResultsEmpty();
  }
}
