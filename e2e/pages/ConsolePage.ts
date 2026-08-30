import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base/BasePage";
import { e2eBaseUrl } from "../support/env";

export type EnvironmentOption =
  "Development" | "Testing" | "Staging" | "IAT" | "UAT" | "Production" | "Pre-Prod" | "Prod Shadow";

const ENV_PATTERN = /Development|Testing|Staging|IAT|UAT|Production|Pre-Prod|Prod Shadow/;

export class ConsolePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(`${e2eBaseUrl()}/app/console`, {
      waitUntil: "domcontentloaded",
    });
  }

  getHeading(): Locator {
    return this.page.getByRole("heading", {
      name: /Your Blocks Projects|Welcome to SELISE Blocks/,
    });
  }

  getAddProjectButton(): Locator {
    return this.page.getByText("Add Project", { exact: true }).first();
  }

  getCreateProjectButton(): Locator {
    return this.page.getByRole("button", { name: "Create a project" });
  }

  getProjectCard(projectName: string): Locator {
    return this.page
      .locator("div")
      .filter({ has: this.page.getByText(projectName, { exact: true }) })
      .filter({ has: this.page.getByRole("button", { name: ENV_PATTERN }) })
      .last();
  }

  getEnvironmentChip(envName: EnvironmentOption | RegExp = /Development/): Locator {
    return this.page.getByRole("button", { name: envName }).first();
  }

  openEnvironment(envName: EnvironmentOption | RegExp = /Development/): Promise<void> {
    return this.clickEnvironmentChip(envName);
  }

  async clickEnvironmentChip(envName: EnvironmentOption | RegExp = /Development/): Promise<void> {
    await this.waitForConsoleReady(20_000);
    const chip = this.getEnvironmentChip(envName);
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await chip.click({ force: true });
  }

  getConfigureProjectButton(): Locator {
    const main = this.page.getByRole("main");
    const configureButton = main.locator("button:has(svg.lucide-settings-2)").first();
    return configureButton;
  }

  getResourcesLink(label: "Docs" | "Code" | "Cloud"): Locator {
    return this.page.getByRole("link", { name: label, exact: false });
  }

  async waitForConsoleReady(timeout = 20_000): Promise<void> {
    await Promise.race([
      this.getAddProjectButton().waitFor({ state: "visible", timeout }),
      this.getEnvironmentChip().waitFor({ state: "visible", timeout }),
    ]);
  }

  async assertConsoleReady(timeout = 30_000): Promise<void> {
    await expect(this.getHeading()).toBeVisible({ timeout });
  }

  async assertProjectCardVisible(projectName: string, timeout = 30_000): Promise<void> {
    const fixture = await import("../support/data-project").then((m) => m.readDataProject());
    if (fixture?.projectName === projectName) {
      await expect(this.page.getByText(projectName, { exact: true }).first()).toBeVisible({
        timeout,
      });
    }
  }

  assertEnvChipVisible(envName: EnvironmentOption = "Development"): Promise<void> {
    return expect(this.getEnvironmentChip(envName)).toBeVisible({ timeout: 30_000 });
  }
}
