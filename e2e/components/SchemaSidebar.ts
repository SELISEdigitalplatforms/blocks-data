import { type Page, type Locator, expect } from "@playwright/test";

export class SchemaSidebar {
  constructor(private page: Page) {}

  getContainer(): Locator {
    return this.page
      .locator("div")
      .filter({ has: this.page.getByText("Schemas", { exact: true }) });
  }

  getSearchInput(): Locator {
    return this.page.getByPlaceholder("Search schemas…");
  }

  getAddButton(): Locator {
    return this.page.getByRole("button", { name: "Add" });
  }

  getPublishButton(): Locator {
    return this.page.getByRole("button", { name: "Publish" });
  }

  getTabs(): Locator {
    return this.page.getByRole("tab");
  }

  getAllTab(): Locator {
    return this.page.getByRole("tab", { name: "All" });
  }

  getEntityTab(): Locator {
    return this.page.getByRole("tab", { name: "Entity" });
  }

  getChildTab(): Locator {
    return this.page.getByRole("tab", { name: "Child" });
  }

  getPaginationInfo(): Locator {
    return this.page.locator("text=/\\d+\\u2013\\d+ of \\d+/");
  }

  getPreviousPageButton(): Locator {
    return this.page.getByRole("button", { name: "Previous page" });
  }

  getNextPageButton(): Locator {
    return this.page.getByRole("button", { name: "Next page" });
  }

  getFirstPageButton(): Locator {
    return this.page.getByRole("button", { name: "First page" });
  }

  getLastPageButton(): Locator {
    return this.page.getByRole("button", { name: "Last page" });
  }

  getSchemaRow(schemaName: string): Locator {
    return this.page
      .locator('[class*="cursor-pointer"]')
      .filter({ has: this.page.getByText(schemaName, { exact: true }) })
      .first();
  }

  getEmptyState(): Locator {
    return this.page.getByText("No schemas found");
  }

  async search(text: string): Promise<void> {
    const input = this.getSearchInput();
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill(text);
  }

  async filterTab(tabName: "All" | "Entity" | "Child"): Promise<void> {
    let tab: Locator;
    switch (tabName) {
      case "All":
        tab = this.getAllTab();
        break;
      case "Entity":
        tab = this.getEntityTab();
        break;
      case "Child":
        tab = this.getChildTab();
        break;
    }
    await expect(tab).toBeVisible({ timeout: 10_000 });
    await tab.click();
    await expect(tab).toHaveAttribute("data-state", "active");
  }

  async addSchema(): Promise<void> {
    await this.getAddButton().click();
  }

  async publish(): Promise<void> {
    await this.getPublishButton().click();
    await expect(this.page.getByText("Schemas published successfully")).toBeVisible({
      timeout: 15_000,
    });
  }

  async selectSchema(schemaName: string): Promise<boolean> {
    if (
      await this.getSchemaRow(schemaName)
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    ) {
      await this.getSchemaRow(schemaName).click();
      return true;
    }

    if (
      await this.getLastPageButton()
        .isVisible({ timeout: 1_000 })
        .catch(() => false)
    ) {
      await this.getLastPageButton().click();
      if (
        await this.getSchemaRow(schemaName)
          .isVisible({ timeout: 3_000 })
          .catch(() => false)
      ) {
        await this.getSchemaRow(schemaName).click();
        return true;
      }
    }

    for (let i = 0; i < 10; i++) {
      if (!(await this.clickNextPageIfNotDisabled())) break;
      if (
        await this.getSchemaRow(schemaName)
          .isVisible({ timeout: 3_000 })
          .catch(() => false)
      ) {
        await this.getSchemaRow(schemaName).click();
        return true;
      }
    }
    return false;
  }

  private async clickNextPageIfNotDisabled(): Promise<boolean> {
    const nextBtn = this.getNextPageButton();
    if (await nextBtn.isDisabled({ timeout: 1_000 }).catch(() => true)) return false;
    if (await nextBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await nextBtn.click();
      return true;
    }
    return false;
  }

  async waitForSearchCleared(timeout = 8_000): Promise<void> {
    await expect(this.getEmptyState()).toBeHidden({ timeout });
  }
}
