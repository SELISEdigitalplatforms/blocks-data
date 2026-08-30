import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base/BasePage";
import { type EnvironmentOption } from "./ConsolePage";

export class DashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  getHeading(): Locator {
    return this.page.getByRole("heading", { name: "Environment Overview" });
  }

  getProjectDetailsHeading(): Locator {
    return this.page.getByRole("heading", { name: "Project Details" });
  }

  getMain(): Locator {
    return this.page.getByRole("main");
  }

  getNameField(): Locator {
    return this.getMain().getByText("Name", { exact: true });
  }

  getXBlocksKeyLabel(): Locator {
    return this.getMain().getByText("X-Blocks-Key", { exact: true });
  }

  getXBlocksKeyRow(): Locator {
    return this.getXBlocksKeyLabel().locator("..");
  }

  isXBlocksKeyMasked(): Promise<boolean> {
    return this.getXBlocksKeyRow().evaluate((el) => {
      const text = el.textContent ?? "";
      const input = el.querySelector("input");
      if (input) {
        return input.type === "password" || input.value === "***" || input.value.includes("*");
      }
      return text.includes("*");
    });
  }

  getXBlocksKeyCopyButton(): Locator {
    return this.getXBlocksKeyRow().getByRole("button");
  }

  getEnvironmentBadge(): Locator {
    const envValues = [
      "Development",
      "Production",
      "Testing",
      "Staging",
      "IAT",
      "UAT",
      "Pre-Prod",
      "Prod Shadow",
    ];
    return this.getMain().getByRole("button", {
      name: new RegExp(`^(${envValues.join("|")})$`),
    });
  }

  getCoreApisHeading(): Locator {
    return this.page.getByRole("heading", { name: "Core APIs" });
  }

  getApiGroups(): Locator {
    return this.page.getByRole("button", { name: /^[A-Za-z]+\s+\d+$/ });
  }

  async expandApiGroup(index = 0): Promise<void> {
    const group = this.getApiGroups().nth(index);
    await expect(group).toBeVisible({ timeout: 15_000 });
    for (let attempt = 0; attempt < 5; attempt++) {
      if ((await group.getAttribute("aria-expanded")) === "true") return;
      await group.scrollIntoViewIfNeeded();
      await group.click({ timeout: 10_000 });
    }
    await expect(group).toHaveAttribute("aria-expanded", "true", { timeout: 15_000 });
  }

  getEndpointRow(): Locator {
    return this.page.locator("tr").filter({ has: this.page.getByText("curl") });
  }

  getCopyCurlButton(): Locator {
    return this.page.getByText("Copy as cURL").first().locator("..").getByRole("button");
  }

  getSidebarProjectWidget(): Locator {
    return this.page.getByRole("button", { name: /^Project/ });
  }

  getSidebarEnvironmentWidget(): Locator {
    return this.page.getByRole("button", { name: /^Environment/ });
  }

  async assertProjectDetailsReady(timeout = 30_000): Promise<void> {
    await Promise.all([
      this.getProjectDetailsHeading().waitFor({ state: "visible", timeout }),
      this.getXBlocksKeyLabel().waitFor({ state: "visible", timeout }),
    ]);
  }

  async assertProjectCardVisible(projectName: string, timeout = 30_000): Promise<void> {
    await expect(this.page.getByText(projectName, { exact: true }).first()).toBeVisible({
      timeout,
    });
  }

  async assertEnvironmentBadgeVisible(expectedEnv?: EnvironmentOption): Promise<void> {
    const badge = this.getEnvironmentBadge();
    await expect(badge).toBeVisible({ timeout: 10_000 });
    if (expectedEnv) {
      await expect(badge).toHaveText(expectedEnv, { timeout: 5_000 });
    }
  }
}
