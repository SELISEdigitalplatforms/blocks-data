import { type Page, type Locator, expect } from "@playwright/test";

export class ConfigureDataSourceModal {
  constructor(private page: Page) {}

  isDialogOpen(timeout = 5_000): Promise<boolean> {
    return this.page
      .getByRole("dialog")
      .isVisible({ timeout })
      .catch(() => false);
  }

  getBlocksRadio(): Locator {
    return this.page.getByRole("radio", { name: /Blocks database/ });
  }

  getOthersRadio(): Locator {
    return this.page.getByRole("radio", { name: /My data sources/ });
  }

  getSaveButton(): Locator {
    return this.page.getByRole("button", { name: "Save" });
  }

  getUpdateSourceConfirmButton(): Locator {
    return this.page.getByRole("button", { name: "Update" });
  }

  getConnectionInput(): Locator {
    return this.page.getByRole("textbox", { name: "Connection String" });
  }

  getDatabaseInput(): Locator {
    return this.page.getByRole("textbox", { name: "Database Name" });
  }

  getConfirmHeading(): Locator {
    return this.page.getByRole("heading", { name: "Confirm data source update?" });
  }

  getConfirmButton(): Locator {
    return this.page.getByRole("button", { name: "Confirm" });
  }

  async selectSource(source: "blocks" | "others"): Promise<void> {
    if (source === "blocks") {
      await this.getBlocksRadio().check();
    } else {
      await this.getOthersRadio().check();
    }
  }

  async setMyDataSource(connectionString: string, databaseName: string): Promise<void> {
    await this.selectSource("others");
    await this.getConnectionInput().fill(connectionString);
    await this.getDatabaseInput().fill(databaseName);
    await this.saveAndConfirm();
  }

  async saveAndConfirm(): Promise<void> {
    await this.getSaveButton().click();
    await expect(this.getConfirmHeading()).toBeVisible({ timeout: 15_000 });
    await expect(
      this.page.getByText("Changing the data source will affect all existing data."),
    ).toBeVisible();
    await this.getConfirmButton().click();
    await expect(this.page.getByText("Data source saved successfully").first()).toBeVisible({
      timeout: 15_000,
    });
  }

  async selectExistingSource(source: "blocks" | "others"): Promise<void> {
    if (source === "blocks") {
      await this.getBlocksRadio().check();
    } else {
      await this.getOthersRadio().check();
    }
    await this.getSaveButton().click();
    await expect(this.getConfirmHeading()).toBeVisible({ timeout: 15_000 });
    await this.getConfirmButton().click();
    await expect(this.page.getByText("Data source updated successfully").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(this.getConfirmHeading()).toBeHidden({ timeout: 10_000 });
  }

  async assertMyDataSourceFieldsDisabled(): Promise<void> {
    await expect(this.getConnectionInput()).toHaveValue("");
    await expect(this.getDatabaseInput()).toHaveValue("");
  }

  async restoreOriginal(
    wasBlocks: boolean,
    originalConnectionString: string | null,
    originalDatabaseName: string | null,
  ): Promise<void> {
    if (wasBlocks) {
      await this.getBlocksRadio().check();
    } else {
      await this.getOthersRadio().check();
      if (originalConnectionString) {
        await this.getConnectionInput().fill(originalConnectionString);
      }
      if (originalDatabaseName) {
        await this.getDatabaseInput().fill(originalDatabaseName);
      }
    }
    await this.getSaveButton().click();
    await expect(this.getConfirmHeading()).toBeVisible({ timeout: 15_000 });
    await this.getConfirmButton().click();
    await expect(this.page.getByText("Data source updated successfully").first()).toBeVisible({
      timeout: 20_000,
    });
  }

  async getIsBlocksSelected(): Promise<boolean> {
    return (await this.getBlocksRadio().getAttribute("aria-checked")) === "true";
  }
}
