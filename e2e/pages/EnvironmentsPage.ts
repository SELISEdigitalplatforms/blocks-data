import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base/BasePage";

export class EnvironmentsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(projectId?: string): Promise<void> {
    const url = new URL(this.page.url());
    const id = projectId ?? url.pathname.split("/")[2] ?? "project";
    await this.page.goto(`${url.origin}/app/${id}/project/environments`, {
      waitUntil: "domcontentloaded",
    });
  }

  getHeading(): Locator {
    return this.page.getByRole("heading", { name: "Environments" });
  }

  getAddEnvironmentButton(): Locator {
    return this.page.getByRole("button", { name: "New Environment" });
  }

  getEnvironmentCard(projectName: string): Locator {
    return this.page
      .locator("div")
      .filter({ has: this.page.getByText(projectName, { exact: true }) });
  }

  getEmptyState(): Locator {
    return this.page.getByText("No environments found in this project.");
  }

  async waitForLoaded(timeout = 30_000): Promise<void> {
    await Promise.all([
      this.getHeading().waitFor({ state: "visible", timeout }),
      this.page.locator("body").waitFor({ state: "visible", timeout }),
    ]);
  }

  async assertEnvironmentsVisible(): Promise<void> {
    await expect(this.getHeading()).toBeVisible({ timeout: 30_000 });
    const firstCard = this.page.getByRole("main").locator('[class*="cursor-pointer"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
  }

  async assertEmptyState(timeout = 5_000): Promise<void> {
    await expect(this.getEmptyState()).toBeVisible({ timeout });
  }
}
