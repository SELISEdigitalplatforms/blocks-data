import { expect, type Page } from "@playwright/test"

/**
 * Genesis-OS ImpersonationBlocked overlay when the tenant session is claimed
 * elsewhere. Copy variants:
 *   - heading: "Your session is in {ProjectName}"
 *   - body: "The project is open in another window…"
 *   - primary: "Leave {ProjectName}" / "Leave the project"
 *
 * Returns true when an overlay was dismissed. Callers that need project
 * context should re-open the shared project if the URL is /app/console.
 */
export async function dismissSessionConflictIfPresent(page: Page): Promise<boolean> {
  const heading = page.getByRole("heading", { name: /Your session is in/i })
  const body = page.getByText(
    /project is open in another window|session can only be in one place|session moved to .+ in another window/i,
  )
  const overlay = heading.or(body)

  const appeared = await overlay
    .first()
    .waitFor({ state: "visible", timeout: 4_000 })
    .then(() => true)
    .catch(() => false)
  if (!appeared) return false

  const leave = page.getByRole("button", { name: /^Leave(\s| the project)/i })
  await expect(leave).toBeVisible({ timeout: 10_000 })
  await leave.click()
  await expect(overlay.first()).toBeHidden({ timeout: 20_000 })
  await page.waitForLoadState("domcontentloaded").catch(() => {})
  return true
}

export function isConsoleUrl(url: string): boolean {
  try {
    // Global console OR project-scoped "/app/{itemId}/console" (Back to console).
    return /\/app\/(?:[^/]+\/)?console\/?$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}
