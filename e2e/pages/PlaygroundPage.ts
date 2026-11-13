import { type Page, type Locator, type Response, expect } from "@playwright/test";
import { BasePage } from "./base/BasePage";

export class PlaygroundPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(projectId?: string): Promise<void> {
    const url = new URL(this.page.url());
    const id = projectId ?? url.pathname.split("/")[2];
    if (id) {
      await this.page.goto(`${url.origin}/app/${id}/data-gateway/playground`, {
        waitUntil: "domcontentloaded",
      });
    } else {
      const navLink = this.page.getByRole("link", { name: "Data Gateway" }).first();
      await navLink.click();
      await this.waitForURL(/\/data-gateway/, 30_000);
      const playgroundBtn = this.page.getByRole("button", { name: "Playground" });
      await expect(playgroundBtn).toBeVisible({ timeout: 15_000 });
      await playgroundBtn.click();
      await this.waitForURL(/\/playground/, 10_000);
    }
  }

  // The playground keeps the REST and GraphQL workspaces both mounted and hides the inactive one
  // (playground-page.tsx); both render an "Execute"-like control and a "Response" label. Scope to
  // visible elements so a locator never resolves to the hidden workspace (blocks-data#423 A14).
  getExecuteButton(): Locator {
    return this.page.locator("button:visible", { hasText: /execute/i }).first();
  }

  getResponseHeader(): Locator {
    return this.page.locator("span:visible", { hasText: /^Response$/ }).first();
  }

  getGraphQLTab(): Locator {
    return this.page
      .getByRole("radiogroup", { name: "Protocol" })
      .getByRole("radio", { name: /GraphQL/ });
  }

  /** Switches the playground to its GraphQL workspace; it opens on REST (blocks-data#423 A14). */
  async selectGraphQL(): Promise<void> {
    const tab = this.getGraphQLTab();
    await expect(tab).toBeVisible({ timeout: 30_000 });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-checked", "true");
  }

  getEmptyResponsePlaceholder(): Locator {
    return this.page.getByText("// Execute a query to see the response");
  }

  getOpenSchemasDrawerButton(): Locator {
    return this.page.getByRole("button", { name: "Schemas" });
  }

  getSchemaSearchInput(): Locator {
    return this.page.getByPlaceholder("Search types, fields...");
  }

  getCloseSchemasDrawerButton(): Locator {
    return this.page.getByRole("button", { name: "Close schemas drawer" });
  }

  getCleanTestDataButton(): Locator {
    return this.page.getByRole("button", { name: "Clean test data" });
  }

  /**
   * Clicks the visible Execute button of the GraphQL workspace and returns the response to the
   * query POST it sends to `/gateway` (introspection POSTs, which carry `__schema`, are skipped).
   */
  async executeQuery(): Promise<Response> {
    await expect(this.getExecuteButton()).toBeVisible({ timeout: 10_000 });
    await expect(this.getExecuteButton()).toBeEnabled({ timeout: 10_000 });
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          new URL(r.url()).pathname.endsWith("/gateway") &&
          !(r.request().postData() ?? "").includes("__schema"),
        { timeout: 30_000 },
      ),
      this.getExecuteButton().click(),
    ]);
    // A 2xx answer opens a "Response" tab; a non-2xx one (the client throws) opens an "Error" tab.
    const resultTab = response.ok()
      ? this.getResponseHeader()
      : this.page.locator("span:visible", { hasText: /^Error$/ }).first();
    await expect(resultTab).toBeVisible({ timeout: 15_000 });
    await expect(this.getEmptyResponsePlaceholder()).toBeHidden({ timeout: 15_000 });
    return response;
  }

  async openSchemasDrawer(): Promise<void> {
    await this.getOpenSchemasDrawerButton().click();
    const drawer = this.page.getByRole("dialog");
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await expect(drawer.getByText("Schemas", { exact: true }).first()).toBeVisible();
    await expect(this.getSchemaSearchInput()).toBeVisible();
  }

  async closeSchemasDrawer(): Promise<void> {
    await this.getCloseSchemasDrawerButton().click();
    await expect(this.page.getByRole("dialog")).toBeHidden({ timeout: 10_000 });
  }

  async openCleanTestDataModal(): Promise<void> {
    await this.getCleanTestDataButton().click();
    const dialog = this.page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole("heading", { name: "Clean test data" })).toBeVisible();
  }

  async closeCleanTestDataModal(): Promise<void> {
    await this.page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(this.page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });
  }

  assertCleanTestDataContent(): Promise<void> {
    return expect(this.page.getByText(/select schemas to delete/i)).toBeVisible({
      timeout: 10_000,
    });
  }

  assertCleanTestDataDisabledState(): Promise<void> {
    const dialog = this.page.getByRole("dialog");
    return expect(dialog.getByRole("button", { name: "Delete" }).first()).toBeDisabled();
  }
}
