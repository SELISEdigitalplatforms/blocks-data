import { expect, type Page } from "@playwright/test";

/**
 * Click an environment card on the console (e.g. "Development") and land on
 * its Project Details page.
 *
 * The button can render before its click handler is wired up (a hydration
 * race on this shared, occasionally-slow dev host), so the click can be a
 * no-op. Retry a few times before failing outright, the same pattern used
 * for the login CTA in tests/auth/login.spec.ts.
 */
export async function openEnvironment(page: Page, name: string | RegExp = /Development/): Promise<void> {
  const envButton = page.getByRole("button", { name }).first();
  const detailsHeading = page.getByRole("heading", { name: "Project Details" });

  let reached = false;
  for (let attempt = 0; attempt < 3 && !reached; attempt++) {
    await envButton.click();
    reached = await detailsHeading
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
  }

  await expect(detailsHeading).toBeVisible({ timeout: 10_000 });
}
