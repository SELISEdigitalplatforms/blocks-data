import { expect, type Page } from "@playwright/test";

const username = process.env.E2E_USERNAME;
const password = process.env.E2E_PASSWORD;

/**
 * Ensure the page is authenticated against E2E_USERNAME/E2E_PASSWORD.
 *
 * The chromium project reuses a session saved to fixtures/auth.json by the
 * "setup" project (playwright.config.ts). This helper is therefore idempotent:
 * when that session is still valid it returns as soon as the console renders,
 * and only drives the login form when it isn't (a cold start, or a session
 * that expired partway through a long suite run).
 */
export async function login(page: Page): Promise<void> {
  if (!username || !password) {
    throw new Error(
      "E2E_USERNAME / E2E_PASSWORD are not set. Fill them in e2e/.env.e2e before running.",
    );
  }

  await page.goto("/");

  const loginCta = page.getByRole("button", { name: "Log in to your account" });
  const consoleHeading = page.getByRole("heading", { name: "Your Blocks Projects" });

  const needsLogin = await Promise.race([
    loginCta.waitFor({ state: "visible", timeout: 30_000 }).then(() => true),
    consoleHeading.waitFor({ state: "visible", timeout: 30_000 }).then(() => false),
  ]);

  if (!needsLogin) {
    return;
  }

  await loginCta.click();
  await page.getByRole("textbox", { name: "Work Email" }).fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();

  await expect(consoleHeading).toBeVisible({ timeout: 50_000 });
}
