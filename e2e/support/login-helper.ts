import { expect, type Page } from "@playwright/test"
import { dismissSessionConflictIfPresent } from "./session-conflict"
import { e2eBaseUrl, e2eCredentials } from "./env"

function oidcEmailField(page: Page) {
  return page.locator("#oidc-email").or(page.getByRole("textbox", { name: "Work Email" }))
}

function oidcPasswordField(page: Page) {
  return page.locator("#oidc-password").or(page.getByRole("textbox", { name: "Password" }))
}

const consoleHeading = (page: Page) =>
  page.getByRole("heading", {
    name: /Your Blocks Projects|Welcome to SELISE Blocks/,
  })

const authenticatingButton = (page: Page) =>
  page.getByRole("button", { name: /Authenticating/i })

/** True when the page is the product login gate or OIDC credential form. */
export async function isLoginSurface(page: Page): Promise<boolean> {
  if (
    await page
      .getByRole("button", { name: "Log in to your account" })
      .isVisible({ timeout: 500 })
      .catch(() => false)
  ) {
    return true
  }

  if (await oidcEmailField(page).isVisible({ timeout: 500 }).catch(() => false)) {
    return true
  }

  try {
    if (/\/login\/?$/i.test(new URL(page.url()).pathname)) return true
  } catch {
    // ignore invalid URL
  }

  return false
}

async function fillCredentialsAndSubmit(page: Page) {
  const { email, password } = e2eCredentials()
  const emailField = oidcEmailField(page)
  await emailField.fill(email)
  const passwordField = oidcPasswordField(page)
  await expect(passwordField).toBeVisible({ timeout: 10_000 })
  await passwordField.fill(password)
  const login = page.getByRole("button", { name: "Login", exact: true })
  await expect(login).toBeEnabled({ timeout: 10_000 })
  await login.click()
}

async function waitForConsoleAfterOidc(page: Page, timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await consoleHeading(page).isVisible({ timeout: 500 }).catch(() => false)) {
      return true
    }
    try {
      if (/\/app\/console\/?$/i.test(new URL(page.url()).pathname)) {
        if (await consoleHeading(page).isVisible({ timeout: 5_000 }).catch(() => false)) {
          return true
        }
      }
    } catch {
      // ignore
    }

    // IAM sometimes sticks on "Authenticating…" / Validating Credentials.
    const stuck = await authenticatingButton(page)
      .isVisible({ timeout: 400 })
      .catch(() => false)
    if (stuck && Date.now() + 25_000 < deadline) {
      // Give a short grace, then abort and let caller retry.
      const cleared = await authenticatingButton(page)
        .waitFor({ state: "hidden", timeout: 25_000 })
        .then(() => true)
        .catch(() => false)
      if (!cleared) return false
      continue
    }

    await page.waitForTimeout(500)
  }
  return false
}

export async function loginThroughOidc(page: Page, options?: { loginPath?: string }) {
  // When loginPath is an absolute OS (or other) URL, keep retries on that origin.
  // Falling back to e2eBaseUrl() mid-flow sent OS teardown to the Data landing page.
  const base = options?.loginPath?.startsWith("http")
    ? new URL(options.loginPath).origin
    : e2eBaseUrl()
  const loginPath = options?.loginPath ?? `${base}/login`

  await page.goto(loginPath, { waitUntil: "domcontentloaded" })

  for (let attempt = 0; attempt < 4; attempt++) {
    if (await consoleHeading(page).isVisible({ timeout: 3_000 }).catch(() => false)) {
      return
    }

    const loginButton = page.getByRole("button", { name: "Log in to your account" })
    if (await loginButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      try {
        await loginButton.click({ timeout: 8_000 })
      } catch {
        if (await consoleHeading(page).isVisible({ timeout: 3_000 }).catch(() => false)) return
        await page.goto(`${base}/app/console`, { waitUntil: "domcontentloaded" })
        continue
      }

      const emailField = oidcEmailField(page)
      await Promise.race([
        emailField.waitFor({ state: "visible", timeout: 30_000 }),
        consoleHeading(page).waitFor({ state: "visible", timeout: 30_000 }),
        page.waitForURL(/\/app\/console/, { timeout: 30_000, waitUntil: "domcontentloaded" }),
      ]).catch(() => {})

      if (await consoleHeading(page).isVisible().catch(() => false)) {
        return
      }

      if (await emailField.isVisible().catch(() => false)) {
        await fillCredentialsAndSubmit(page)
        if (await waitForConsoleAfterOidc(page, 60_000)) return
        // Stuck authenticating — hard reload the login flow and retry.
        await page.goto(loginPath, { waitUntil: "domcontentloaded" })
        continue
      }

      await page.goto(`${base}/app/console`, { waitUntil: "domcontentloaded" })
      continue
    }

    // Already on OIDC form (no gate button).
    if (await oidcEmailField(page).isVisible({ timeout: 1_500 }).catch(() => false)) {
      await fillCredentialsAndSubmit(page)
      if (await waitForConsoleAfterOidc(page, 60_000)) return
      await page.goto(loginPath, { waitUntil: "domcontentloaded" })
      continue
    }

    await page.goto(`${base}/app/console`, { waitUntil: "domcontentloaded" })
  }

  await page.goto(`${base}/app/console`, { waitUntil: "domcontentloaded" })
  await expect(consoleHeading(page)).toBeVisible({ timeout: 30_000 })
}

/**
 * Land on the product console; re-run OIDC when the saved session expired.
 * Idempotent when already authenticated.
 */
export async function ensureAuthenticated(page: Page) {
  const base = e2eBaseUrl()
  await page.goto(`${base}/app/console`, { waitUntil: "domcontentloaded" })
  await dismissSessionConflictIfPresent(page)

  if (await consoleHeading(page).isVisible({ timeout: 15_000 }).catch(() => false)) {
    return
  }

  await loginThroughOidc(page)
  await dismissSessionConflictIfPresent(page)
  await expect(consoleHeading(page)).toBeVisible({ timeout: 30_000 })
}

export async function ensureAuthenticatedOnCurrentOrigin(page: Page) {
  const href = page.url()
  if (!/^https?:/.test(href)) {
    await ensureAuthenticated(page)
    return
  }

  const origin = new URL(href).origin
  await page.goto(`${origin}/app/console`, { waitUntil: "domcontentloaded" })
  await dismissSessionConflictIfPresent(page)

  if (await consoleHeading(page).isVisible({ timeout: 15_000 }).catch(() => false)) {
    return
  }

  await loginThroughOidc(page, { loginPath: `${origin}/login` })
  await dismissSessionConflictIfPresent(page)
  await expect(consoleHeading(page)).toBeVisible({ timeout: 30_000 })
}

export async function loginFresh(page: Page) {
  await loginThroughOidc(page, { loginPath: e2eBaseUrl() })
}
