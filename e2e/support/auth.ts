import { expect, type Page } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

/**
 * Drive the app's login flow against the configured E2E_USERNAME/E2E_PASSWORD.
 * Lives in support/ so specs call it from `test.beforeEach` (avoids the
 * storageState handoff a separate "setup" project would otherwise require).
 */
export async function login(page: Page): Promise<void> {
  if (!username || !password) {
    throw new Error(
      "E2E_USERNAME / E2E_PASSWORD are not set. Fill them in e2e/.env.e2e before running.",
    );
  }

  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Log in to your account" }).click();

  const emailField = page.locator("#oidc-email");
  // Dev-iam cross-origin redirect can take >30s in CI/slow networks. Bumped to 60s.
  await emailField.waitFor({ timeout: 60_000 });
  await emailField.fill(username);
  await page.locator("#oidc-password").fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();

  await page.waitForURL("**/app/console", { timeout: 45_000 });
  await expect(page).toHaveURL(/\/app\/console/);
  await expect(page.getByRole("heading", { name: "Your Blocks Projects" })).toBeVisible({ timeout: 20_000 });
}
