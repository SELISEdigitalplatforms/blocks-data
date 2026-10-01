import { type Page } from "@playwright/test"

/**
 * Genesis-OS shows a full-page block when the same tenant session is claimed
 * in another tab/window ("The project is open in another window…").
 * Dismiss via the primary Leave button so later steps can interact.
 */
export async function dismissSessionConflictIfPresent(page: Page): Promise<boolean> {
  const conflictCopy = page.getByText(/project is open in another window|session can only be in one place/i)
  const visible = await conflictCopy.isVisible({ timeout: 1_500 }).catch(() => false)
  if (!visible) return false

  const leave = page
    .getByRole("button", { name: /^Leave(\s|$)/i })
    .or(page.getByRole("button", { name: /Leave the project/i }))
    .or(page.getByRole("button", { name: /Leave .+/i }))
    .first()

  if (await leave.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await leave.click()
  }

  await conflictCopy.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {})
  return true
}
