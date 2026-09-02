import { type Page, type Locator, expect } from "@playwright/test";

export class ImportSchemaModal {
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

  getUploadButton(): Locator {
    return this.page.getByRole("button", { name: "Upload" });
  }

  getCancelButton(): Locator {
    return this.page.getByRole("button", { name: "Cancel" });
  }

  getTemplateDownloadButton(): Locator {
    return this.page.getByRole("button", { name: "Template" });
  }

  getFileInput(): Locator {
    return this.page.locator('input[type="file"]');
  }

  async assertUploadButtonDisabled(): Promise<void> {
    await expect(this.getUploadButton()).toBeDisabled();
  }

  async uploadFile(filePath: string): Promise<void> {
    await this.page.setInputFiles('input[type="file"]', filePath);
    await expect(this.getUploadButton()).toBeEnabled({ timeout: 10_000 });
    await this.getUploadButton().click();
  }

  async cancel(): Promise<void> {
    await this.getCancelButton().click();
    await expect(this.getDialog()).toBeHidden({ timeout: 10_000 });
  }

  async downloadTemplate(): Promise<string> {
    const [download] = await Promise.all([
      this.page.waitForEvent("download"),
      this.getTemplateDownloadButton().click(),
    ]);
    return download.path();
  }

  async assertRequiresFileBeforeProceeding(): Promise<void> {
    await expect(this.getUploadButton()).toBeDisabled();
    await this.cancel();
  }
}
