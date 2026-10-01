import { expect, type Page } from "@playwright/test"
import { openEnvironment } from "./navigation"
import { dismissSessionConflictIfPresent, isConsoleUrl } from "./session-conflict"
import { readDataProject } from "./data-project"
import { e2eBaseUrl } from "./env"

export function resolveDataProjectId(page: Page): string | null {
  const fixture = readDataProject()
  if (fixture?.itemId) return fixture.itemId
  try {
    const id = new URL(page.url()).pathname.split("/")[2]
    if (id && id !== "console") return id
  } catch {
    /* ignore */
  }
  return null
}

/** Locators that prove Data Gateway route body rendered (not blank main). */
export function dataGatewayReadyLocator(page: Page) {
  return page
    .getByRole("main")
    .getByText("Data Gateway", { exact: true })
    .or(page.getByRole("heading", { name: "Schemas", exact: true }))
    .or(page.getByRole("heading", { name: "Security Assessment" }))
    .or(page.getByText("No schemas yet", { exact: true }))
    .or(page.getByRole("button", { name: "More actions" }))
    .or(page.getByRole("button", { name: "Actions" }))
    .or(page.getByTestId("data-service-loading"))
    .first()
}

/** Settled body — never treat Configure (instructions/error) as ready. */
export function dataGatewaySettledLocator(page: Page) {
  return page
    .getByRole("heading", { name: "Security Assessment" })
    .or(page.getByText("No schemas yet", { exact: true }))
    .or(page.getByRole("heading", { name: "Schemas", exact: true }))
    .or(page.getByText("Select a schema from the sidebar to view its details."))
    .or(page.getByRole("button", { name: /^Add Schema$/i }))
    .first()
}

export async function openDataGateway(page: Page) {
  const projectId = resolveDataProjectId(page)
  const target = projectId
    ? `${e2eBaseUrl()}/app/${projectId}/data-gateway`
    : null

  const ready = () => dataGatewayReadyLocator(page)
  const settled = () => dataGatewaySettledLocator(page)

  for (let attempt = 0; attempt < 6; attempt++) {
    if (target) {
      await page.goto(target, { waitUntil: "domcontentloaded" })
    } else {
      await page.getByRole("link", { name: "Data Gateway" }).first().click()
    }
    await dismissSessionConflictIfPresent(page)

    if (isConsoleUrl(page.url()) && projectId) {
      await openEnvironment(page)
      continue
    }

    if (!/\/data-gateway(\/|$)/i.test(new URL(page.url()).pathname)) {
      const nav = page.getByRole("link", { name: "Data Gateway" }).first()
      if (await nav.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await nav.click()
        await dismissSessionConflictIfPresent(page)
      }
    }

    if (!/\/data-gateway(\/|$)/i.test(new URL(page.url()).pathname)) {
      continue
    }

    const ok = await ready()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    if (ok) {
      const settledOk = await settled()
        .waitFor({ state: "visible", timeout: 45_000 })
        .then(() => true)
        .catch(() => false)
      if (settledOk) return
    }

    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {})
    await dismissSessionConflictIfPresent(page)
  }

  await expect(page).toHaveURL(/\/data-gateway(\/|$)/i, { timeout: 10_000 })
  await expect(ready()).toBeVisible({ timeout: 30_000 })
  await expect(settled()).toBeVisible({ timeout: 60_000 })
}

/**
 * Open Data Gateway and select a schema in the two-panel editor.
 * Landing Security Assessment table rows are not role=button — click the row
 * or switch to Schemas view before using the sidebar.
 */
export async function selectSchema(page: Page, schemaName: string): Promise<boolean> {
  await openDataGateway(page)

  const landingHeading = page.getByRole("heading", { name: "Security Assessment" })
  const emptyStateHeading = page.getByText("No schemas yet", { exact: true })
  const schemasReady = page.getByRole("heading", { name: "Schemas", exact: true })
  const pickSchema = page.getByText("Select a schema from the sidebar to view its details.")
  await expect(
    landingHeading.or(emptyStateHeading).or(schemasReady).or(pickSchema).first(),
  ).toBeVisible({ timeout: 45_000 })

  async function confirmSelected(): Promise<boolean> {
    const selected = page.getByRole("heading", { name: schemaName, exact: true }).first()
    const emptyDetails = page.getByText(
      "Select a schema from the sidebar to view its details.",
    )
    try {
      await expect(selected).toBeVisible({ timeout: 10_000 })
      await expect(emptyDetails).toBeHidden({ timeout: 5_000 })
      return true
    } catch {
      return false
    }
  }

  // Landing table row (role=row, not button)
  if (await landingHeading.isVisible().catch(() => false)) {
    const row = page
      .getByRole("row")
      .filter({ hasText: new RegExp(`^\\s*${schemaName}\\b`) })
      .first()
    if (await row.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await row.click()
      if (await confirmSelected()) return true
    }
    const goSchemas = page.getByRole("button", { name: /Go to Schemas/i })
    if (await goSchemas.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await goSchemas.click()
      await expect(pickSchema.or(schemasReady).first()).toBeVisible({ timeout: 15_000 }).catch(() => {})
    } else {
      const url = new URL(page.url())
      url.searchParams.set("type", "all")
      url.searchParams.set("page", "1")
      url.searchParams.set("pageSize", "10")
      url.searchParams.delete("schemaId")
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" })
      await dismissSessionConflictIfPresent(page)
      await expect(pickSchema.or(schemasReady).or(landingHeading).first()).toBeVisible({
        timeout: 20_000,
      }).catch(() => {})
    }
  }

  const schemaRow = () =>
    page.getByRole("button", { name: new RegExp(`^${schemaName}\\b`) }).first()

  async function clickSidebar(): Promise<boolean> {
    const row = schemaRow()
    await row.scrollIntoViewIfNeeded().catch(() => {})
    await row.click()
    return confirmSelected()
  }

  if (await schemaRow().isVisible({ timeout: 3_000 }).catch(() => false)) {
    if (await clickSidebar()) return true
  }

  for (const name of ["Last page", "Next page"] as const) {
    const button = page.getByRole("button", { name })
    if (!(await button.isVisible({ timeout: 800 }).catch(() => false))) continue
    if (await button.isDisabled().catch(() => false)) continue
    await button.click()
    if (await schemaRow().isVisible({ timeout: 2_000 }).catch(() => false)) {
      if (await clickSidebar()) return true
    }
    if (name === "Next page") {
      for (let i = 0; i < 8; i++) {
        const next = page.getByRole("button", { name: "Next page" })
        if (!(await next.isVisible({ timeout: 500 }).catch(() => false))) break
        if (await next.isDisabled().catch(() => false)) break
        await next.click()
        if (await schemaRow().isVisible({ timeout: 2_000 }).catch(() => false)) {
          if (await clickSidebar()) return true
        }
      }
    }
  }

  const search = page.getByPlaceholder("Search schemas…")
  if (await search.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await search.fill(schemaName)
    if (await schemaRow().isVisible({ timeout: 3_000 }).catch(() => false)) {
      if (await clickSidebar()) return true
    }
    await search.fill("")
  }

  return false
}
