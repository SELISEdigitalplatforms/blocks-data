import { expect, type Page } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

/**
 * Ensure the page is authenticated against E2E_USERNAME/E2E_PASSWORD.
 *
 * The chromium project reuses a session saved to fixtures/auth.json by the
 * "setup" project (playwright.config.ts). This helper is therefore idempotent:
 * when a session is already active it returns after confirming the console
 * rendered, and only drives the full cross-origin OIDC login on a cold start.
 */
export async function login(page: Page): Promise<void> {
  if (!username || !password) {
    throw new Error(
      "E2E_USERNAME / E2E_PASSWORD are not set. Fill them in e2e/.env.e2e before running.",
    );
  }

  await page.goto("/login");
  await page.waitForLoadState("domcontentloaded");

  // With a reused session the PublicGuard redirects /login straight to
  // /app/console, so the login CTA flashes and is detached mid-flow. Detect
  // the redirect and return early instead of clicking the vanishing button.
  const reused = await page
    .waitForURL("**/app/console", { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (reused) {
    await expect(
      page.getByRole("heading", { name: "Your Blocks Projects" }),
    ).toBeVisible({ timeout: 20_000 });
    return;
  }

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
