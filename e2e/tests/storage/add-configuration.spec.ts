import { test, expect } from "@playwright/test";
import { openEnvironment } from "../../support/navigation";
import { login } from "../../support/auth";

test.describe("storage - add configuration", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openEnvironment(page);

    await page.getByRole("link", { name: "Storage" }).click();
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible({
      timeout: 30000,
    });
  });

  test("TC-0021: 'Add' dropdown → 'Add Configuration' opens the Add Storage Configuration dialog", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration").click();

    await expect(page.getByRole("heading", { name: "Add Storage Configuration" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText("Ensure you have selected a storage configuration provider to move forward."),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Storage Provider")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("TC-0022: Adding an Amazon (AWS) storage configuration succeeds with valid data", async ({
    page,
  }) => {
    test.skip(true, "Requires valid AWS credentials; test data is not currently available.");
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration", { exact: true }).click();

    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "AWS", exact: true }).click();

    const suffix = Date.now();

    await page.getByPlaceholder("Enter name").fill(`aws-test-${suffix}`);

    await page.getByPlaceholder("Enter access key").fill("AKIAIOSFODNN7EXAMPLE");

    await page
      .getByPlaceholder("Enter secret key")
      .fill("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");

    await page.getByPlaceholder("Enter region endpoint").fill("us-east-1");

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("New configuration added successfully")).toBeVisible({
      timeout: 15000,
    });
  });

  test("TC-0023: Adding an AWS S3 Compatible storage configuration succeeds with valid data", async ({
    page,
  }) => {
    test.skip(
      true,
      "Requires valid AWS S3-compatible test credentials; test data is not currently available.",
    );

    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration").click();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "AWS S3 Compatible" }).click();

    const suffix = Date.now();
    await page.getByPlaceholder("Enter name").fill(`s3-compatible-${suffix}`);
    await page.getByPlaceholder("Enter access key").fill("test-key");
    await page.getByPlaceholder("Enter secret key").fill("test-secret");
    await page.getByPlaceholder("Enter host URL").fill("https://s3.example.com");

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("New configuration added successfully")).toBeVisible({
      timeout: 15000,
    });
  });

  test("TC-0024: Adding an Azure storage configuration succeeds with valid data", async ({
    page,
  }) => {
    test.skip(true, "Requires valid Azure test credentials; test data is not currently available.");

    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration").click();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Azure" }).click();

    const suffix = Date.now();
    await page.getByPlaceholder("Enter name").fill(`azure-blob-${suffix}`);
    await page
      .getByPlaceholder("Enter connection string")
      .fill("DefaultEndpointsProtocol=https;AccountName=test;AccountKey=test;");

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("New configuration added successfully")).toBeVisible({
      timeout: 15000,
    });
  });

  test("TC-0025: Adding an SFTP storage configuration succeeds with valid data", async ({
    page,
  }) => {
    test.skip(true, "Requires valid SFTP test credentials; test data is not currently available.");

    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration").click();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "SFTP" }).click();

    const suffix = Date.now();
    await page.getByPlaceholder("Enter name").fill(`sftp-${suffix}`);
    await page.getByPlaceholder("Enter remote base path").fill("/data");
    await page.getByPlaceholder("Enter host").fill("10.0.0.5");
    await page.getByPlaceholder("Enter port").fill("22");
    await page.getByPlaceholder("Enter username").fill("ftpuser");
    await page.getByPlaceholder("Enter password").fill("test-password");

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("New configuration added successfully")).toBeVisible({
      timeout: 15000,
    });
  });

  test("TC-0026: Amazon configuration shows required-field errors when Access Key, Secret Key and Region Endpoint are empty", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration").click();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "AWS", exact: true }).click();
    await page.getByPlaceholder("Enter name").fill(`aws-req-${Date.now()}`);

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Access key is required")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Secret key is required")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Region endpoint is required")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("TC-0027: SFTP configuration shows required-field errors when Host, Port, Username, Password and Remote Base Path are empty", async ({
    page,
  }) => {
    test.fail(
      true,
      "Known bug: Port value 0 should display a validation message indicating that the port must be greater than 0.",
    );
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration").click();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "SFTP" }).click();
    await page.getByPlaceholder("Enter name").fill(`sftp-req-${Date.now()}`);

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Host is required")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Port must be is greater than 0.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Username is required")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Password is required")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Remote base path is required")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("TC-0028: Azure configuration requires a Connection String", async ({ page }) => {
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration").click();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Azure" }).click();
    await page.getByPlaceholder("Enter name").fill(`azure-req-${Date.now()}`);

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Connection string is required")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("TC-0029: AWS S3 Compatible configuration requires Access Key, Secret Key and Host URL", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration").click();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "AWS S3 Compatible" }).click();
    await page.getByPlaceholder("Enter name").fill(`s3-req-${Date.now()}`);

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Access key is required")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Secret key is required")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Host URL is required")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("TC-0030: Name field is required regardless of the selected provider", async ({ page }) => {
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration").click();

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Name is required")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("TC-0031: SFTP Port field only accepts a non-negative numeric value", async ({ page }) => {
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration").click();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "SFTP" }).click();

    await page.getByPlaceholder("Enter port").fill("-1");
    await page.getByRole("button", { name: "Save" }).click();

    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(saveButton).toBeVisible({ timeout: 30_000 });
    // Save remains blocked by the min(0) rule; no success toast should appear.
    await expect(page.getByText("New configuration added successfully")).toHaveCount(0);
  });

  test("TC-0032: Storage Provider select is disabled when editing an existing configuration", async ({
    page,
  }) => {
    test.skip(
      true,
      "Requires an existing storage configuration; no valid provider configuration is currently available.",
    );

    const moreButton = page
      .locator("button")
      .filter({
        has: page.locator("svg.lucide-ellipsis-vertical"),
      })
      .first();

    await expect(moreButton).toBeVisible({ timeout: 30_000 });
    await moreButton.click();

    await page.getByText("Edit", { exact: true }).click();

    const providerSelect = page.getByRole("combobox").first();

    await expect(providerSelect).toBeVisible({ timeout: 30_000 });
    await expect(providerSelect).toBeDisabled();
  });

  test("TC-0033: Cancel closes the Add Storage Configuration dialog without persisting changes", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration").click();

    await page.getByPlaceholder("Enter name").fill("temp-config");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("heading", { name: "Add Storage Configuration" })).toBeHidden();
  });

  test("TC-0034: Save button is disabled while the save request is pending, preventing duplicate submission", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByText("Add Configuration").click();

    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "AWS", exact: true }).click();

    const suffix = Date.now();
    await page.getByPlaceholder("Enter name").fill(`aws-pending-${suffix}`);
    await page.getByPlaceholder("Enter access key").fill("key");
    await page.getByPlaceholder("Enter secret key").fill("secret");
    await page.getByPlaceholder("Enter region endpoint").fill("us-east-1");

    const saveButton = page.getByRole("button", { name: "Save" });
    const cancelButton = page.getByRole("button", { name: "Cancel" });
    await saveButton.click();
    await expect(saveButton).toBeDisabled();
    await expect(cancelButton).toBeDisabled();
  });
});
