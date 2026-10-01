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

export async function openDataGateway(page: Page) {
  const projectId = resolveDataProjectId(page)
  const target = projectId
    ? `${e2eBaseUrl()}/app/${projectId}/data-gateway`
    : null

  const ready = () => dataGatewayReadyLocator(page)

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
      // Prefer settled Security Assessment / empty / schemas over loading chrome alone.
      const settled = page
        .getByRole("heading", { name: "Security Assessment" })
        .or(page.getByText("No schemas yet", { exact: true }))
        .or(page.getByRole("heading", { name: "Schemas", exact: true }))
        .or(page.getByText("Select a schema from the sidebar to view its details."))
        .or(page.getByRole("button", { name: "Configure" }))
        .first()
      const settledOk = await settled
        .waitFor({ state: "visible", timeout: 20_000 })
        .then(() => true)
        .catch(() => false)
      if (settledOk) return
      // Loading chrome counts as progress; give one more reload if stuck on skeleton.
    }

    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {})
    await dismissSessionConflictIfPresent(page)
  }

  await expect(page).toHaveURL(/\/data-gateway(\/|$)/i, { timeout: 10_000 })
  await expect(ready()).toBeVisible({ timeout: 30_000 })
  await expect(
    page
      .getByRole("heading", { name: "Security Assessment" })
      .or(page.getByText("No schemas yet", { exact: true }))
      .or(page.getByRole("heading", { name: "Schemas", exact: true }))
      .or(page.getByText("Select a schema from the sidebar to view its details."))
      .or(page.getByRole("button", { name: "Configure" }))
      .first(),
  ).toBeVisible({ timeout: 45_000 })
}
