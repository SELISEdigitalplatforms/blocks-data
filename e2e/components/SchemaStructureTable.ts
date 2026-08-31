import { type Page, type Locator, expect } from "@playwright/test";

export class SchemaStructureTable {
  constructor(private page: Page) {}

  getTable(): Locator {
    return this.page.locator("table").first();
  }

  getTabs(): Locator {
    return this.page.getByRole("tab");
  }

  getAttributeTab(): Locator {
    return this.page.getByRole("tab", { name: "Attribute" });
  }

  getDataTab(): Locator {
    return this.page.getByRole("tab", { name: "Data" });
  }

  getDefaultPropertiesRow(): Locator {
    return this.page.getByRole("button", { name: /Default Properties/ });
  }

  getAddPropertyButton(): Locator {
    return this.page.getByRole("button", { name: "+ Add property" });
  }

  getPropertyNameInput(row?: Locator): Locator {
    const scope = row ?? this.page;
    return scope
      .locator("input[placeholder='Click to edit']")
      .filter({ hasNot: this.page.locator('input[type="checkbox"]') });
  }

  getSaveButton(): Locator {
    return this.page.getByRole("button", { name: "Save", exact: true }).first();
  }

  getEditButton(): Locator {
    return this.page.getByRole("button", { name: "Edit", exact: true });
  }

  getCancelButton(): Locator {
    return this.page.getByRole("button", { name: "Cancel", exact: true }).first();
  }

  getUpdateDialogButton(): Locator {
    return this.page.getByRole("button", { name: "Update" });
  }

  getFieldRow(fieldName: string): Locator {
    return this.page
      .locator("tr")
      .filter({ has: this.page.locator(`input[value="${fieldName}"]`) })
      .first();
  }

  getFieldRowByName(name: string): Locator {
    return this.page.locator("tr").filter({ hasText: name }).first();
  }

  getRowActionsButton(fieldName: string): Locator {
    return this.getFieldRowByName(fieldName).getByRole("button").last();
  }

  getFieldMenuAction(fieldName: string, actionName: "Duplicate" | "Delete"): Locator {
    return this.page.getByRole("menuitem", { name: actionName });
  }

  getValidationTrigger(fieldName: string): Locator {
    return this.page
      .locator("table [aria-label^='Manage validations for']")
      .filter({ hasText: fieldName })
      .first();
  }

  getPreviewButton(): Locator {
    return this.page.getByRole("button", { name: "Preview" });
  }

  async enterEditMode(): Promise<void> {
    await expect(this.getEditButton()).toBeVisible({ timeout: 15_000 });
    await this.getEditButton().click();
    await expect(this.getCancelButton()).toBeVisible({ timeout: 15_000 });
  }

  async exitEditMode(): Promise<void> {
    await this.getCancelButton().click();
  }

  async addProperty(name: string, viewport = { width: 1440, height: 900 }): Promise<void> {
    await this.page.setViewportSize(viewport);
    await this.enterEditMode();
    await this.getAddPropertyButton().click();
    const input = this.getPropertyNameInput();
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.scrollIntoViewIfNeeded();
    await input.fill(name);
    await this.getSaveButton().click();
    await this.getUpdateDialogButton().click();
    await expect(this.page.getByText("Schema updated successfully").first()).toBeVisible({
      timeout: 15_000,
    });
  }

  async duplicateField(fieldName: string): Promise<void> {
    await this.enterEditMode();
    const actionsButton = this.getRowActionsButton(fieldName);
    await actionsButton.click();
    await this.page.getByRole("menuitem", { name: "Duplicate" }).click();
  }

  async deleteField(fieldName: string): Promise<void> {
    const actionsButton = this.getRowActionsButton(fieldName);
    await actionsButton.click();
    await this.page.getByRole("menuitem", { name: "Delete" }).click();
  }

  async addRegexValidation(fieldName: string, pattern: string): Promise<void> {
    await this.page.setViewportSize({ width: 1440, height: 900 });
    const trigger = this.getValidationTrigger(fieldName);
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await trigger.click();
    await this.page.getByText("Add validation").first().click();
    const patternInput = this.page.getByPlaceholder("e.g. ^[a-zA-Z]+$");
    await expect(patternInput).toBeVisible({ timeout: 15_000 });
    await patternInput.fill(pattern);
    await this.page.getByRole("button", { name: "Add" }).last().click();
    await expect(patternInput).toHaveCount(0);
  }

  async openValidationDrawer(fieldName: string): Promise<void> {
    const trigger = this.getValidationTrigger(fieldName);
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await trigger.click();
  }

  async openPreviewDrawer(): Promise<void> {
    await this.page.setViewportSize({ width: 1440, height: 900 });
    await expect(this.getPreviewButton()).toBeVisible({ timeout: 15_000 });
    await this.getPreviewButton().click();
  }

  async openFieldAccessDrawer(fieldName: string): Promise<void> {
    await this.page.setViewportSize({ width: 1440, height: 900 });
    const row = this.page
      .locator("table:visible button[aria-label^='View access for']")
      .filter({ hasText: fieldName })
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
  }

  getDataTabToolbarButtons(): {
    filter: Locator;
    sort: Locator;
    column: Locator;
    refresh: Locator;
  } {
    return {
      filter: this.page.locator("button[title='Filter']"),
      sort: this.page.locator("button[title='Sort']"),
      column: this.page.locator("button[title='Column']"),
      refresh: this.page.locator("button[title='Refresh data']"),
    };
  }

  getTableViewButton(): Locator {
    return this.page.getByRole("button", { name: "Table view" });
  }

  getJsonViewButton(): Locator {
    return this.page.getByRole("button", { name: "JSON view" });
  }

  getListViewButton(): Locator {
    return this.page.getByRole("button", { name: "List view" });
  }

  async cycleViewModes(): Promise<void> {
    const listBtn = this.getListViewButton();
    const jsonBtn = this.getJsonViewButton();
    const tableBtn = this.getTableViewButton();

    await listBtn.click();
    await expect(listBtn).toHaveClass(/bg-background/);
    await expect(tableBtn).not.toHaveClass(/bg-background/);

    await jsonBtn.click();
    await expect(jsonBtn).toHaveClass(/bg-background/);
    await expect(listBtn).not.toHaveClass(/bg-background/);

    await tableBtn.click();
    await expect(tableBtn).toHaveClass(/bg-background/);
    await expect(jsonBtn).not.toHaveClass(/bg-background/);
  }
}
