import { type Page, type Locator, expect } from "@playwright/test";

export class ThemeToggle {
  constructor(private page: Page) {}

  getTablist(): Locator {
    return this.page.getByRole("tablist").first();
  }

  getDarkTab(): Locator {
    return this.getTablist().locator('[aria-controls$="-content-dark"]');
  }

  getLightTab(): Locator {
    return this.getTablist().locator('[aria-controls$="-content-light"]');
  }

  getAutoTab(): Locator {
    return this.getTablist().locator('[aria-controls$="-content-system"]');
  }

  async setDark(): Promise<void> {
    await this.getTablist().waitFor({ state: "visible", timeout: 30_000 });
    await this.getDarkTab().click();
    await expect(this.page.locator("html")).toHaveClass(/dark/);
  }

  async setLight(): Promise<void> {
    await this.getTablist().waitFor({ state: "visible", timeout: 30_000 });
    await this.getLightTab().click();
    await expect(this.page.locator("html")).not.toHaveClass(/dark/);
  }

  async assertDarkApplied(): Promise<void> {
    await expect(this.page.locator("html")).toHaveClass(/dark/);
  }

  async assertLightApplied(): Promise<void> {
    await expect(this.page.locator("html")).not.toHaveClass(/dark/);
  }
}

export class NotificationBell {
  constructor(private page: Page) {}

  getBell(): Locator {
    return this.page.getByTestId("notification-bell");
  }

  getPopover(): Locator {
    return this.page.getByText("Notifications", { exact: true });
  }

  async openPopover(): Promise<void> {
    await this.getBell().click();
    await expect(this.getPopover()).toBeVisible({ timeout: 10_000 });
  }

  async closePopover(): Promise<void> {
    await this.page.mouse.click(20, 20);
    await expect(this.getPopover()).toHaveCount(0);
  }

  getMarkAllAsReadButton(): Locator {
    return this.page.getByRole("button", { name: "Mark all as read" });
  }

  getNotificationRows(): Locator {
    return this.page
      .locator('[class*="cursor-pointer"]')
      .filter({ has: this.page.locator('[class*="items-start"]') });
  }

  async markAllAsRead(): Promise<void> {
    await this.openPopover();
    const markAll = this.getMarkAllAsReadButton();
    await expect(markAll).toBeVisible({ timeout: 10_000 });
    await markAll.click({ force: true, timeout: 10_000 });
    await expect(this.getPopover()).toHaveCount(0);
  }

  async assertUnreadRowMarkedReadOnHover(): Promise<void> {
    await this.openPopover();
    const rows = this.getNotificationRows();
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    const firstRow = rows.first();
    const initialClass = (await firstRow.getAttribute("class")) ?? "";
    await firstRow.hover();
    if (initialClass.includes("bg-muted")) {
      await expect(firstRow).not.toHaveClass(/bg-muted/, { timeout: 10_000 });
    }
  }
}

export class AppSwitcher {
  constructor(private page: Page) {}

  getTrigger(): Locator {
    return this.page.getByRole("button", { name: "SELISE Blocks apps" });
  }

  getPopoverContent(): Locator {
    return this.page.locator("text=SELISE Blocks");
  }

  async open(): Promise<void> {
    await this.getTrigger().click();
    await expect(this.getPopoverContent()).toBeVisible({ timeout: 10_000 });
  }

  async close(): Promise<void> {
    await this.page.mouse.click(20, 20);
    await expect(this.getPopoverContent()).toHaveCount(0);
  }

  getAppTile(label: string): Locator {
    return this.page.locator("button").filter({ has: this.page.getByText(label, { exact: true }) });
  }

  async assertAppsListVisible(): Promise<void> {
    await this.open();
    await expect(this.page.getByText("Your favourites")).toBeVisible({ timeout: 10_000 });
    await expect(this.page.getByText("More from SELISE Blocks")).toBeVisible({ timeout: 5_000 });
    await this.close();
  }
}

export class UserDropdown {
  constructor(private page: Page) {}

  getTrigger(): Locator {
    return this.page.getByRole("button", { name: "Open user menu" });
  }

  async open(): Promise<void> {
    await expect(this.getTrigger()).toBeVisible({ timeout: 10_000 });
    await this.getTrigger().click();
  }

  getProfileItem(): Locator {
    return this.page.getByRole("menuitem", { name: "My Profile" });
  }

  getLogoutItem(): Locator {
    return this.page.getByRole("menuitem", { name: "Logout" });
  }

  getLogoutButton(): Locator {
    return this.page.getByRole("button", { name: "Logout" });
  }

  async clickProfile(): Promise<void> {
    await this.open();
    await this.getProfileItem().click();
  }

  async assertDropdownContents(): Promise<void> {
    await this.open();
    await expect(this.getProfileItem()).toBeVisible();
    await expect(this.getLogoutItem()).toBeVisible();
  }
}
