import { type Page, type Locator, expect } from "@playwright/test";

export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  getPage(): Page {
    return this.page;
  }

  async waitForLoadState(
    state: "load" | "domcontentloaded" | "networkidle" = "domcontentloaded",
  ): Promise<void> {
    await this.page.waitForLoadState(state);
  }

  async waitForURL(urlOrRegExp: string | RegExp, timeout = 30_000): Promise<void> {
    await this.page.waitForURL(urlOrRegExp, { timeout });
  }

  async assertURL(urlOrRegExp: string | RegExp, timeout = 10_000): Promise<void> {
    await expect(this.page).toHaveURL(urlOrRegExp, { timeout });
  }

  protected $(selector: string): Locator {
    return this.page.locator(selector);
  }
}
