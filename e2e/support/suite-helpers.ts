import { expect, type Page } from "@playwright/test"
import { openNamedProjectDashboard } from "./create-and-delete-project"
import { readDataProject } from "./data-project"

/** Open the shared suite project dashboard from the setup fixture. */
export async function openSharedProjectDashboard(page: Page) {
  const fixture = readDataProject()
  if (!fixture) {
    throw new Error(
      "Missing fixtures/data-project.json — run the data-setup project first " +
        "(suite.setup.spec.ts).",
    )
  }

  await openNamedProjectDashboard(page, fixture.projectName, {
    dashboardUrl: fixture.dashboardUrl,
  })
  await expect(
    page
      .getByRole("heading", { name: "Project Details" })
      .or(page.getByText("X-Blocks-Key", { exact: true }))
      .first(),
  ).toBeVisible({ timeout: 30_000 })
}
