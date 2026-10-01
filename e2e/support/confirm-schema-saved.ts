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

  // Publish/adapt path — banner or Publish CTA without toast.
  if (await publish.isVisible().catch(() => false)) {
    await publish.click()
    await expect(
      page.getByText(/Schemas published successfully|Schema updated successfully/i).first(),
    ).toBeVisible({ timeout: 20_000 })
  }

  if (await unadapted.isVisible().catch(() => false)) {
    await expect(unadapted).toBeHidden({ timeout: 20_000 })
  }
}
