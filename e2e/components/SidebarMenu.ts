import { type Page, type Locator, expect } from "@playwright/test";

export class SidebarMenu {
  constructor(private page: Page) {}

  getWorkspaceLabel(): Locator {
    return this.page.getByText("Workspace", { exact: true });
  }

  getProjectWidget(): Locator {
    return this.page.getByRole("button", { name: /^Project/ });
  }

  getEnvironmentWidget(): Locator {
    return this.page.getByRole("button", { name: /^Environment/ });
  }

  getNavItem(name: string): Locator {
    return this.page
      .getByRole("link", { name, exact: true })
      .or(this.page.getByRole("button", { name, exact: true }));
  }

  async assertWorkspaceContext(timeout = 15_000): Promise<void> {
    await expect(this.getWorkspaceLabel()).toBeVisible({ timeout });
    await expect(this.getProjectWidget()).toBeVisible();
    await expect(this.getEnvironmentWidget()).toBeVisible();
    await expect(this.getProjectWidget()).toBeDisabled();
    await expect(this.getEnvironmentWidget()).toBeDisabled();
  }

  async assertProjectWidgetContains(projectName: string): Promise<void> {
    await expect(this.getProjectWidget()).toContainText(projectName);
  }

  async assertEnvironmentWidgetHasValue(): Promise<void> {
    const text = await this.getEnvironmentWidget().innerText();
    expect(text.toLowerCase()).toContain("environment");
    expect(text.replace(/environment/i, "").trim().length).toBeGreaterThan(0);
  }

  async navigateTo(name: string): Promise<void> {
    const item = this.getNavItem(name).first();
    await expect(item).toBeVisible({ timeout: 10_000 });
    await expect(item).toHaveAttribute("href", /\/app\/[^/]+\//);
    await item.click();
  }

  async assertNavItemHref(name: string, expectedPattern: RegExp): Promise<void> {
    const item = this.getNavItem(name).first();
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute("href", expectedPattern);
  }

  async openMobileSidebar(): Promise<void> {
    const hamburger = this.page
      .locator("button")
      .filter({ has: this.page.locator("svg.lucide-panel-left") });
    await expect(hamburger).toBeVisible({ timeout: 10_000 });
    await hamburger.click();
  }

  async assertContextSurvivesReload(): Promise<void> {
    const projectName = await this.getProjectWidget().innerText();
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expect(this.getProjectWidget()).toHaveText(projectName);
  }
}
