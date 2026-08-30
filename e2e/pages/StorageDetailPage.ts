import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base/BasePage";

export class StorageDetailPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  getBreadcrumb(): Locator {
    return this.page.getByLabel("breadcrumb");
  }

  getBreadcrumbStorageLink(): Locator {
    return this.getBreadcrumb().getByText("Storage", { exact: true });
  }

  getBreadcrumbSegment(name: string): Locator {
    return this.getBreadcrumb().getByText(name, { exact: true });
  }

  getHeading(): Locator {
    return this.page.locator("h1").filter({ hasText: "Storage" });
  }

  getApiDocsButton(): Locator {
    return this.page.getByRole("button", { name: "API Docs" });
  }

  getAddNewButton(): Locator {
    return this.page.getByRole("button", { name: "Add New" });
  }

  getUploadFileMenuItem(): Locator {
    return this.page.getByRole("menuitem", { name: "Upload file" });
  }

  getCreateDirectoryMenuItem(): Locator {
    return this.page.getByRole("menuitem", { name: "Create new directory" });
  }

  getDirectoryNameInput(): Locator {
    return this.page.getByPlaceholder("Enter directory name");
  }

  getCreateButton(): Locator {
    return this.page.getByRole("button", { name: "Create" });
  }

  getDirectoryFilterInput(): Locator {
    return this.page.locator('input[placeholder="Search..."]').first();
  }

  getViewToggleButton(icon: "list" | "grid"): Locator {
    return this.page
      .locator("button")
      .filter({ has: this.page.locator(`svg.lucide-${icon}`) })
      .first();
  }

  async openAddNewMenu(): Promise<void> {
    await expect(this.getAddNewButton()).toBeVisible({ timeout: 15_000 });
    await this.getAddNewButton().click();
  }

  async createDirectory(name: string): Promise<void> {
    await this.openAddNewMenu();
    await this.getCreateDirectoryMenuItem().click();
    await this.getDirectoryNameInput().fill(name);
    await this.getCreateButton().click();
    await expect(this.page.getByText("Directory created successfully.")).toBeVisible({
      timeout: 15_000,
    });
  }

  async navigateToDirectory(name: string): Promise<void> {
    const tile = this.page.locator('[role="button"]').filter({ hasText: name }).first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await tile.click();
    await this.waitForURL(/directoryId=/, 10_000);
  }

  async clickBreadcrumbSegment(name: string): Promise<void> {
    const segment = this.getBreadcrumbSegment(name);
    await expect(segment).toBeVisible({ timeout: 10_000 });
    await segment.click();
  }

  getFolderTile(name: string): Locator {
    return this.page.locator('[role="button"]').filter({ hasText: name }).first();
  }

  getFileTile(name: string): Locator {
    return this.page.locator('tr, [role="button"]').filter({ hasText: name }).first();
  }

  async openFileMoreOptions(fileName: string): Promise<void> {
    const container = this.page
      .locator("tr, [role='button']")
      .filter({ hasText: fileName })
      .first();
    await expect(container).toBeVisible({ timeout: 15_000 });
    await container.getByRole("button", { name: "More options" }).click();
  }

  async previewFile(fileName: string): Promise<void> {
    const entry = this.page.getByText(fileName, { exact: true }).first();
    await expect(entry).toBeVisible({ timeout: 15_000 });
    await entry.click();
    await expect(this.page.getByRole("dialog")).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByRole("dialog").locator("pre, img")).toBeVisible({
      timeout: 10_000,
    });
  }

  closePreviewModal(): Promise<void> {
    return this.page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();
  }

  async toggleViewMode(mode: "list" | "grid"): Promise<void> {
    const button = this.getViewToggleButton(mode);
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();
  }

  async searchInDirectory(searchTerm: string): Promise<void> {
    const input = this.getDirectoryFilterInput();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill(searchTerm);
  }

  async openManageAccess(fileName: string): Promise<void> {
    await this.openFileMoreOptions(fileName);
    await this.page.getByRole("menuitem", { name: "Manage access" }).click();
    await expect(this.page.getByRole("heading", { name: "Manage access" })).toBeVisible({
      timeout: 15_000,
    });
  }

  async deleteDirectory(name: string): Promise<void> {
    const tile = this.getFolderTile(name);
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await tile.locator('button[aria-haspopup="menu"]').first().click();
    await this.page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = this.page
      .getByRole("dialog")
      .filter({ has: this.page.getByRole("heading", { name: "Delete Directory" }) });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(this.page.getByText("Directory Deleted successfully")).toBeVisible({
      timeout: 15_000,
    });
  }

  async deleteFile(fileName: string): Promise<void> {
    await this.openFileMoreOptions(fileName);
    await this.page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = this.page
      .getByRole("dialog")
      .filter({ has: this.page.getByRole("heading", { name: "Delete File" }) });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(this.page.getByText("File Deleted successfully")).toBeVisible({
      timeout: 15_000,
    });
    await expect(this.page.getByText(fileName)).toHaveCount(0);
  }

  async assertBreadcrumbVisible(): Promise<void> {
    await expect(this.page.getByLabel("breadcrumb")).toBeVisible({ timeout: 30_000 });
  }
}
