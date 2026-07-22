import { test, expect } from "../../support/test-base";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

test.describe("Authentication", () => {
  test.beforeAll(() => {
    if (!username || !password) {
      throw new Error(
        "E2E_USERNAME / E2E_PASSWORD are not set. Fill them in e2e/.env.e2e before running.",
      );
    }
  });

  test("logs in and lands on the console", async ({ page }) => {
    await page.goto("/login");
    await page
      .getByRole("button", { name: "Log in to your account" })
      .click();

    const emailField = page.locator("#oidc-email");
    await emailField.waitFor({ timeout: 30_000 });
    await emailField.fill(username!);
    await page.locator("#oidc-password").fill(password!);
    await page.getByRole("button", { name: "Login", exact: true }).click();

    await page.waitForURL("**/app/console", { timeout: 45_000 });
    await expect(page).toHaveURL(/\/app\/console/);
    await expect(
      page.getByRole("heading", { name: "Your Blocks Projects" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.context().storageState({ path: "fixtures/auth.json" });
  });
});
