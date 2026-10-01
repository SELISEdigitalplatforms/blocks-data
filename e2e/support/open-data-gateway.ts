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

export function dataGatewaySettledLocator(page: Page) {
  return page
    .getByRole("heading", { name: "Security Assessment" })
    .or(page.getByText("No schemas yet", { exact: true }))
    .or(page.getByRole("heading", { name: "Schemas", exact: true }))
    .or(page.getByText("Select a schema from the sidebar to view its details."))
    .or(page.getByRole("button", { name: /^Add Schema$/i }))
    .or(page.getByPlaceholder("Search schemas…"))
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

async function enterSchemasSidebar(page: Page): Promise<boolean> {
  if (await page.getByPlaceholder("Search schemas…").isVisible({ timeout: 1_500 }).catch(() => false)) {
    return true
  }
  // Prefer SPA navigation via a landing-table row click (avoids brittle ?type=all remounts).
  const landing = page.getByRole("heading", { name: "Security Assessment" })
  if (await landing.isVisible().catch(() => false)) {
    const firstDataRow = page.locator("table tbody tr").first()
    if (await firstDataRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstDataRow.click()
      const search = page.getByPlaceholder("Search schemas…")
      const ok = await search
        .waitFor({ state: "visible", timeout: 20_000 })
        .then(() => true)
        .catch(() => false)
      if (ok) return true
    }
  }
  // Fallback: query-param navigation
  const url = new URL(page.url())
  url.searchParams.set("type", "all")
  url.searchParams.set("page", "1")
  url.searchParams.set("pageSize", "10")
  url.searchParams.delete("schemaId")
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" })
  await dismissSessionConflictIfPresent(page)
  await expect(
    page
      .getByPlaceholder("Search schemas…")
      .or(page.getByRole("heading", { name: "Schemas", exact: true }))
      .or(page.getByText("Select a schema from the sidebar to view its details."))
      .or(page.getByRole("heading", { name: "Security Assessment" }))
      .first(),
  ).toBeVisible({ timeout: 45_000 })
  if (await page.getByRole("heading", { name: "Security Assessment" }).isVisible().catch(() => false)) {
    const firstDataRow = page.locator("table tbody tr").first()
    if (await firstDataRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstDataRow.click()
    }
  }
  return page.getByPlaceholder("Search schemas…").isVisible({ timeout: 15_000 }).catch(() => false)
}

/**
 * Open Data Gateway and select a schema in the two-panel editor.
 */
export async function selectSchema(page: Page, schemaName: string): Promise<boolean> {
  await openDataGateway(page)

  async function confirmSelected(): Promise<boolean> {
    const selected = page.getByRole("heading", { name: schemaName, exact: true }).first()
    const emptyDetails = page.getByText(
      "Select a schema from the sidebar to view its details.",
    )
    try {
      await expect(selected).toBeVisible({ timeout: 12_000 })
      await expect(emptyDetails).toBeHidden({ timeout: 5_000 })
      return true
    } catch {
      return false
    }
  }

  // Landing Security Assessment table — paginate until the named row appears.
  const landingHeading = page.getByRole("heading", { name: "Security Assessment" })
  if (await landingHeading.isVisible().catch(() => false)) {
    for (let i = 0; i < 12; i++) {
      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: schemaName, exact: true }) })
        .first()
      if (await row.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await row.click()
        if (await confirmSelected()) return true
        break
      }
      const next = page.getByRole("button", { name: "Next page" })
      if (!(await next.isVisible({ timeout: 500 }).catch(() => false))) break
      if (await next.isDisabled().catch(() => false)) break
      await next.click()
    }
  }

  if (!(await enterSchemasSidebar(page))) return false

  const schemaRow = () =>
    page.getByRole("button", { name: new RegExp(`^${schemaName}\\b`) }).first()

  async function clickSidebar(): Promise<boolean> {
    const row = schemaRow()
    await row.scrollIntoViewIfNeeded().catch(() => {})
    await row.click()
    return confirmSelected()
  }

  const search = page.getByPlaceholder("Search schemas…")
  await search.fill("")
  await search.fill(schemaName)
  await page.waitForTimeout(600)
  if (await schemaRow().isVisible({ timeout: 8_000 }).catch(() => false)) {
    if (await clickSidebar()) return true
  }

  // Clear search and paginate sidebar as a last resort.
  await search.fill("")
  if (await schemaRow().isVisible({ timeout: 2_000 }).catch(() => false)) {
    if (await clickSidebar()) return true
  }
  for (let i = 0; i < 10; i++) {
    const next = page.getByRole("button", { name: "Next page" })
    if (!(await next.isVisible({ timeout: 500 }).catch(() => false))) break
    if (await next.isDisabled().catch(() => false)) break
    await next.click()
    if (await schemaRow().isVisible({ timeout: 2_000 }).catch(() => false)) {
      if (await clickSidebar()) return true
    }
  }

  return false
}
