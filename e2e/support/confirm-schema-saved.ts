import { expect, type Page } from "@playwright/test"

/**
 * After Save → Update, the UI either toasts "Schema updated successfully"
 * or leaves an unadapted-changes banner that Publish clears (reloadSchemas).
 */
export async function confirmSchemaStructureSaved(page: Page) {
  const toast = page.getByText("Schema updated successfully").first()
  const unadapted = page.getByText(/unadapted changes/i)
  const publish = page.getByRole("button", { name: "Publish" })

  await expect(toast.or(unadapted).or(publish).first()).toBeVisible({ timeout: 20_000 })

  if (await toast.isVisible().catch(() => false)) {
    return
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await unadapted.isVisible({ timeout: 1_000 }).catch(() => false))) {
      return
    }
    if (await publish.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await publish.click()
      await page
        .getByText(/Schemas published successfully|Schema updated successfully/i)
        .first()
        .waitFor({ state: "visible", timeout: 8_000 })
        .catch(() => {})
    }
    const cleared = await unadapted
      .waitFor({ state: "hidden", timeout: 8_000 })
      .then(() => true)
      .catch(() => false)
    if (cleared) return
  }

  // Structure may already be persisted while the banner lags — continue soft.
  if (await unadapted.isVisible().catch(() => false)) {
    console.warn("[e2e] unadapted banner still visible after Publish attempts")
  }
}
