import { type Page, type Locator, expect } from "@playwright/test";

export class StorageCard {
  constructor(
    private page: Page,
    private cardLocator: Locator,
  ) {}

  static first(page: Page): StorageCard {
    const card = page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    return new StorageCard(page, card);
  }

  static byName(page: Page, name: string): StorageCard {
    const card = page
      .locator("div")
      .filter({ has: page.getByText(name, { exact: true }) })
      .filter({ has: page.locator('[class*="cursor-pointer"]') })
      .first();
    return new StorageCard(page, card);
  }

  getLocator(): Locator {
    return this.cardLocator;
  }

  getTitle(): Locator {
    return this.cardLocator.locator('[class*="font-semibold"]').first();
  }

  getProviderBadge(): Locator {
    return this.cardLocator.locator('[class*="text-sm"]');
  }

  getMoreOptionsButton(): Locator {
    return this.cardLocator.locator('button[aria-haspopup="menu"]').first();
  }

  async open(): Promise<void> {
    await expect(this.cardLocator).toBeVisible({ timeout: 15_000 });
    await this.cardLocator.click();
    await this.page.waitForURL(/[?&]id=/, { timeout: 15_000 });
  }

  async openDetailsDrawer(): Promise<void> {
    await this.getMoreOptionsButton().click();
    await this.page.getByRole("menuitem", { name: "View Details", exact: true }).click();
    await expect(this.page.getByText("Details", { exact: true })).toBeVisible({ timeout: 30_000 });
  }

  async assertDetailsDrawerContents(): Promise<void> {
    const drawer = this.page
      .getByRole("dialog")
      .filter({ has: this.page.getByText("Details", { exact: true }) });

    await expect(drawer.getByText("Name", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Storage provider")).toBeVisible();
    await expect(drawer.getByText("Owner")).toBeVisible();
    await expect(drawer.getByText("Type", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Last modified")).toBeVisible();
    await expect(drawer.getByText("Date created")).toBeVisible();
    await expect(drawer.getByText("Configured")).toBeVisible();
  }

  async closeDetailsDrawer(): Promise<void> {
    const drawer = this.page
      .getByRole("dialog")
      .filter({ has: this.page.getByText("Details", { exact: true }) });
    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(drawer).toBeHidden({ timeout: 10_000 });
  }
}
