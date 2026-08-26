import { expect, type Page } from "@playwright/test"
import { loginFresh as oidcLoginFresh } from "./login-helper"
import { openSharedProjectDashboard } from "./suite-helpers"

/**
 * Logs in a fresh (unauthenticated) page against Blocks Data via OIDC.
 * Prefer suite storageState + openSharedProjectDashboard for feature specs.
 */
export async function loginFresh(page: Page) {
  await oidcLoginFresh(page)
  await expect(
    page.getByRole("heading", {
      name: /Your Blocks Projects|Welcome to SELISE Blocks/,
    }),
  ).toBeVisible({ timeout: 30_000 })
}

/**
 * Opens the shared suite project (from data-setup fixture).
 * Falls back to the first Development environment chip when no fixture exists.
 */
export async function openFirstProject(page: Page) {
  try {
    await openSharedProjectDashboard(page)
    return
  } catch {
    // No fixture yet — open whatever Development chip is on the console.
  }

  await page
    .getByRole("button", { name: /Development|Testing|Staging|IAT|UAT|Production/ })
    .first()
    .click()
  await expect(page.getByText(/^workspace$/i).or(page.getByRole("heading", { name: "Project Details" }))).toBeVisible({
    timeout: 50_000,
  })
}

/** Sidebar nav item: rendered as either a link or a button by the shell. */
export function sidebarNavItem(
  page: Page,
  name:
    | "Overview"
    | "Create Payment"
    | "Payment List"
    | "Saved Cards"
    | "Payment Providers"
    | "Payments"
    | "Magic URL",
) {
  return page
    .getByRole("link", { name, exact: true })
    .or(page.getByRole("button", { name, exact: true }))
}

/** Expands the "Payments" sidebar group if its children aren't visible yet. */
export async function openPaymentsSubPage(
  page: Page,
  name: "Overview" | "Create Payment" | "Payment List" | "Saved Cards" | "Payment Providers",
) {
  const subLink = sidebarNavItem(page, name)
  if (
    !(await subLink
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await sidebarNavItem(page, "Payments").first().click()
    await expect(subLink.first()).toBeVisible()
  }
  await subLink.first().click()
}
