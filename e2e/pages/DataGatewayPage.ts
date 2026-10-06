import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base/BasePage";

export class DataGatewayPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(projectId?: string): Promise<void> {
    if (projectId) {
      await this.page.goto(
        `${this.page.url().split("/").slice(0, 3).join("/")}/app/${projectId}/data-gateway`,
        { waitUntil: "domcontentloaded" },
      );
    } else {
      const link = this.page.getByRole("link", { name: "Data Gateway" }).first();
      await link.click();
      await this.waitForURL(/\/data-gateway/, 30_000);
    }
  }

  async openFresh(projectId?: string): Promise<void> {
    if (projectId) {
      await this.page.goto(
        `${this.page.url().split("/").slice(0, 3).join("/")}/app/${projectId}/data-gateway`,
        { waitUntil: "domcontentloaded" },
      );
    } else {
      const url = new URL(this.page.url());
      const id = url.pathname.split("/")[2];
      if (id) {
        await this.page.goto(`${url.origin}/app/${id}/data-gateway`, {
          waitUntil: "domcontentloaded",
        });
      } else {
        await this.page.getByRole("link", { name: "Data Gateway" }).first().click();
      }
    }
    await this.waitForURL(/\/data-gateway/, 30_000);
    await expect(
      this.page.getByRole("main").getByText("Data Gateway", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
  }

  getMain(): Locator {
    return this.page.getByRole("main");
  }

  getHeading(): Locator {
    return this.page.locator("h1, h2").filter({ hasText: "Data Gateway" }).first();
  }

  getSecurityAssessmentHeading(): Locator {
    return this.page.getByRole("heading", { name: "Security Assessment" });
  }

  getEmptyState(): Locator {
    return this.page.getByText("No schemas yet", { exact: true });
  }

  /** The Schemas tab in the page bar; it replaced the breadcrumb back-link. */
  getSchemasTab(): Locator {
    return this.page.getByRole("link", { name: "Schemas" });
  }

  getSecurityTab(): Locator {
    return this.page.getByRole("link", { name: "Security" });
  }

  /** The schemas view, which is what /data-gateway opens now. */
  async waitForSchemasReady(timeout = 30_000): Promise<void> {
    await expect(this.page.getByPlaceholder("Search schemas…")).toBeVisible({ timeout });
  }

  /** The security table, now behind its own route. */
  async waitForLandingReady(timeout = 30_000): Promise<void> {
    await this.getSecurityTab().click();
    await expect(this.getSecurityAssessmentHeading().or(this.getEmptyState()).first()).toBeVisible({
      timeout,
    });
  }

  getApiDocsButton(): Locator {
    return this.page.getByRole("button", { name: "API Docs" });
  }

  getImportButton(): Locator {
    return this.page.getByRole("button", { name: "Import" });
  }

  getExportButton(): Locator {
    return this.page.getByRole("button", { name: "Export" });
  }

  getPlaygroundButton(): Locator {
    return this.page.getByRole("link", { name: "Playground" });
  }

  getConfigureButton(): Locator {
    return this.page.getByRole("button", { name: "Configure" });
  }

  /** The pending count in the page bar; it replaced the standalone red banner. */
  getUnadaptedAlert(): Locator {
    return this.page.getByText(/\d+ unpublished/);
  }

  getPublishButton(): Locator {
    return this.page.getByRole("button", { name: "Publish" });
  }

  hasUnadaptedChanges(timeout = 5_000): Promise<boolean> {
    return this.getUnadaptedAlert()
      .isVisible({ timeout })
      .catch(() => false);
  }

  async openConfiguration(): Promise<void> {
    await this.getConfigureButton().click();
    await this.waitForURL(/\/configuration/, 30_000);
  }

  async openPlayground(): Promise<void> {
    await this.getPlaygroundButton().click();
    await this.waitForURL(/\/playground/, 10_000);
  }

  async assertApiDocsOpensSwagger(): Promise<void> {
    const [popup] = await Promise.all([
      this.page.context().waitForEvent("page", { timeout: 15_000 }),
      this.getApiDocsButton().click(),
    ]);
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).toContain("/swagger");
    await popup.close();
  }

  isSchemaView(): boolean {
    return Boolean(this.page.url().includes("?type=all") || this.page.url().includes("schemaId="));
  }

  getSchemaNameHeading(schemaName: string): Locator {
    return this.page.getByRole("heading", { name: schemaName }).first();
  }
}
