import { test } from "@playwright/test"
import { deleteCreatedProject } from "../../support/create-and-delete-project"
import { ensureAuthenticated } from "../../support/login-helper"
import {
  clearDataProject,
  clearDataSession,
  readDataProject,
} from "../../support/data-project"
import { shouldDeleteSharedProject } from "../../support/run-outcome"

test.describe("data suite teardown", () => {
  test("delete shared project when all suite tests passed", async ({ page }) => {
    test.setTimeout(120_000)

    const fixture = readDataProject()
    if (!fixture) return

    if (!shouldDeleteSharedProject()) {
      console.log(
        `[e2e] Keeping project "${fixture.projectName}" on the console ` +
          "(a test failed or E2E_KEEP_PROJECT=1).",
      )
      return
    }

    await ensureAuthenticated(page)
    const deleted = await deleteCreatedProject(page, fixture.projectName, {
      itemId: fixture.itemId,
    })

    clearDataProject()
    clearDataSession()

    if (!deleted) {
      console.log(
        `[e2e] Project "${fixture.projectName}" was not deleted automatically — ` +
          "remove it manually from the console if needed.",
      )
    }
  })
})
