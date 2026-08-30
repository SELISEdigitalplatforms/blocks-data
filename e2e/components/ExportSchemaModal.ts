import { type Page, type Locator, expect } from "@playwright/test";

export class ExportSchemaModal {
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

  getSelectFileTypeButton(): Locator {
    return this.getDialog().getByRole("button", { name: "Select file type" });
  }

  getDownloadCheckbox(): Locator {
    return this.getDialog().getByLabel("Download");
  }

  getConfirmExportButton(): Locator {
    return this.getDialog().getByRole("button", { name: "Export", exact: true });
  }

  async assertTwoStepWizard(): Promise<void> {
    await expect(this.getSelectFileTypeButton()).toBeVisible({ timeout: 10_000 });
  }

  async exportWithDefaultOptions(): Promise<void> {
    const selectButton = this.getSelectFileTypeButton();
    if (await selectButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await selectButton.click();
    }

    const downloadCheckbox = this.getDownloadCheckbox();
    await expect(downloadCheckbox).toBeVisible({ timeout: 10_000 });
    await expect(downloadCheckbox).toBeChecked();

    const exportButton = this.getConfirmExportButton();
    await expect(exportButton).toBeEnabled({ timeout: 10_000 });
    await exportButton.click();
  }

  async assertExportInProgress(): Promise<void> {
    await expect(this.page.getByText("Export in progress").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(this.getDialog()).toBeHidden({ timeout: 10_000 });
  }
}
