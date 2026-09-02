import { type Page, type Locator, expect } from "@playwright/test";

export class AddEditSchemaModal {
  constructor(private page: Page) {}

  isDialogOpen(timeout = 5_000): Promise<boolean> {
    return this.page
      .getByRole("dialog")
      .isVisible({ timeout })
      .catch(() => false);
  }

  getDialog(): Locator {
    return this.page.getByRole("dialog");
  }

  getHeading(): Locator {
    return this.page.getByRole("heading", { name: /Add New Schema|Edit Schema/ });
  }

  getSchemaNameInput(): Locator {
    return this.page.locator('input[id="schemaName"]');
  }

  getSchemaTypeTrigger(): Locator {
    return this.page.locator('button[role="combobox"]').or(this.page.locator("#schemaType"));
  }

  getSchemaTypeOption(value: "Entity" | "Child"): Locator {
    return this.page.getByRole("option", { name: value });
  }

  getEntityNameInput(): Locator {
    return this.page.locator('input[id="entityName"]');
  }

  getAddButton(): Locator {
    return this.page.getByRole("button", { name: "Add" }).last();
  }

  getSaveButton(): Locator {
    return this.page.getByRole("button", { name: "Save" }).last();
  }

  getCancelButton(): Locator {
    return this.page.getByRole("button", { name: "Cancel" }).first();
  }

  getEditConfirmationHeading(): Locator {
    return this.page.getByRole("heading", { name: "Update schema property" });
  }

  getEditConfirmButton(): Locator {
    return this.page.getByRole("button", { name: "Update" });
  }

  async fillSchemaName(name: string): Promise<void> {
    await this.getSchemaNameInput().fill(name);
  }

  async selectSchemaType(type: "Entity" | "Child"): Promise<void> {
    const trigger = this.getSchemaTypeTrigger();
    await trigger.click();
    await expect(this.page.getByRole("option", { name: type })).toBeVisible({ timeout: 5_000 });
    await this.page.getByRole("option", { name: type }).click();
  }

  async createSchema(name: string): Promise<void> {
    await expect(this.getHeading()).toBeVisible({ timeout: 30_000 });
    await this.getSchemaNameInput().fill(name);
    await this.getAddButton().click();
    await expect(this.page.getByText("Schema added successfully").first()).toBeVisible({
      timeout: 15_000,
    });
  }

  async editSchema(newName: string, originalName?: string): Promise<void> {
    if (originalName) {
      await this.getSchemaNameInput().fill(originalName);
    }
    await this.getSchemaNameInput().fill(newName);
    await this.getSaveButton().click();
    await expect(this.getEditConfirmationHeading()).toBeVisible({ timeout: 10_000 });
    await this.getEditConfirmButton().click();
  }

  async cancelEdit(): Promise<void> {
    await this.getCancelButton().click();
  }

  async assertDuplicateNameError(name: string): Promise<void> {
    await this.getSchemaNameInput().fill(name);
    await expect(this.page.getByText("Schema with this name already exists")).toBeVisible({
      timeout: 10_000,
    });
  }

  async assertEmptyNameError(): Promise<void> {
    await this.getSchemaNameInput().clear();
    await this.getAddButton().click();
    await expect(this.page.getByText("Schema name is required")).toBeVisible({
      timeout: 10_000,
    });
  }
}
