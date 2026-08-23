import { expect, type Page } from "@playwright/test"
import { loginFresh as loginThroughOidcFresh, ensureAuthenticated } from "./login-helper"

/**
 * Ensure the page is authenticated against E2E_USERNAME/E2E_PASSWORD.
 *
 * Prefer the suite `storageState` from fixtures/data-session.json. This helper
 * is idempotent: when that session is still valid it returns as soon as the
 * console renders, and only drives OIDC when it isn't.
 */
export async function login(page: Page): Promise<void> {
  await ensureAuthenticated(page)
}

/** Fresh OIDC login (no saved session). Prefer suite setup for feature specs. */
export async function loginFresh(page: Page): Promise<void> {
  await loginThroughOidcFresh(page)
  await expect(
    page.getByRole("heading", {
      name: /Your Blocks Projects|Welcome to SELISE Blocks/,
    }),
  ).toBeVisible({ timeout: 30_000 })
}
