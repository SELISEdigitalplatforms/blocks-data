import { type Page, type Locator, expect } from "@playwright/test";

export type StorageProvider = "AWS" | "Azure" | "SFTP" | "AWS S3 Compatible";

const REQUIRED_FIELD_MESSAGES: Record<StorageProvider, string[]> = {
  AWS: ["Access key is required", "Secret key is required", "Region endpoint is required"],
  Azure: ["Connection string is required"],
  SFTP: [
    "Host is required",
    "Username is required",
    "Password is required",
    "Remote base path is required",
  ],
  "AWS S3 Compatible": ["Access key is required", "Secret key is required", "Host URL is required"],
};

export class StorageConfigurationForm {
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
    return this.page.getByRole("heading", { name: /Add|Edit Storage Configuration/ });
  }

  getNameInput(): Locator {
    return this.page.getByPlaceholder("Enter name");
  }

  getProviderSelect(): Locator {
    return this.page.getByRole("combobox").first();
  }

  getSaveButton(): Locator {
    return this.page.getByRole("button", { name: "Save" });
  }

  getCancelButton(): Locator {
    return this.page.getByRole("button", { name: "Cancel" });
  }

  getAccessKeyInput(): Locator {
    return this.page.locator('input[placeholder="Enter access key"]');
  }

  getSecretKeyInput(): Locator {
    return this.page.locator('input[placeholder="Enter secret key"]');
  }

  getRegionEndpointInput(): Locator {
    return this.page.locator('input[placeholder="Enter region endpoint"]');
  }

  getConnectionStringInput(): Locator {
    return this.page.locator('input[placeholder="Enter connection string"]');
  }

  getHostInput(): Locator {
    return this.page.locator(
      'input[placeholder="Enter host URL"], input[placeholder="Enter host"]',
    );
  }

  getPortInput(): Locator {
    return this.page.locator('input[placeholder="Enter port"]');
  }

  getUsernameInput(): Locator {
    return this.page.locator('input[placeholder="Enter username"]');
  }

  getPasswordInput(): Locator {
    return this.page.locator('input[placeholder="Enter password"]');
  }

  getRemoteBasePathInput(): Locator {
    return this.page.locator('input[placeholder="Enter remote base path"]');
  }

  async selectProvider(provider: StorageProvider): Promise<void> {
    await this.getProviderSelect().click();
    await this.page.getByRole("option", { name: provider, exact: true }).click();
  }

  async fillName(name: string): Promise<void> {
    await this.getNameInput().fill(name);
  }

  async fillAwsFields(accessKey: string, secretKey: string, region: string): Promise<void> {
    await this.getAccessKeyInput().fill(accessKey);
    await this.getSecretKeyInput().fill(secretKey);
    await this.getRegionEndpointInput().fill(region);
  }

  async fillAzureFields(connectionString: string): Promise<void> {
    await this.getConnectionStringInput().fill(connectionString);
  }

  async fillS3CompatibleFields(accessKey: string, secretKey: string, host: string): Promise<void> {
    await this.getAccessKeyInput().fill(accessKey);
    await this.getSecretKeyInput().fill(secretKey);
    await this.getHostInput().fill(host);
  }

  async fillSftpFields(
    host: string,
    port: string,
    username: string,
    password: string,
    basePath: string,
  ): Promise<void> {
    await this.getHostInput().fill(host);
    await this.getPortInput().fill(port);
    await this.getUsernameInput().fill(username);
    await this.getPasswordInput().fill(password);
    await this.getRemoteBasePathInput().fill(basePath);
  }

  async assertProviderValidationErrors(provider: StorageProvider): Promise<void> {
    const messages = REQUIRED_FIELD_MESSAGES[provider];
    for (const message of messages) {
      await expect(this.page.getByText(message)).toBeVisible({ timeout: 10_000 });
    }
  }

  getRequiredMessagesForProvider(provider: StorageProvider): string[] {
    return REQUIRED_FIELD_MESSAGES[provider];
  }

  async save(): Promise<void> {
    await this.getSaveButton().click();
  }

  async cancel(): Promise<void> {
    await this.getCancelButton().click();
    await expect(this.getHeading()).toBeHidden({ timeout: 10_000 });
  }

  async assertHeading(
    title: "Add Storage Configuration" | "Edit Storage Configuration",
  ): Promise<void> {
    await expect(this.page.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 });
  }
}
