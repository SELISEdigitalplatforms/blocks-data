import { test, expect } from "../../support/test-base";
import { login } from "../../support/auth";

test.describe("Data overview page", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("enters the Dashboard via a Development env chip and returns to the console", async ({
    page,
  }) => {
    await page.goto("/app/console");

    await expect(
      page.getByRole("heading", { name: "Your Blocks Projects" }),
    ).toBeVisible({ timeout: 20_000 });

    // ProjectCard exposes <button> env chips named after constants in
    // environment-options.ts ("Development", "Staging", "Production").
    // Clicking routes to /app/<itemId>/dashboard (project-card.tsx:31).
    const devChip = page.getByRole("button", { name: /^Development$/ }).first();
    if (!(await devChip.isVisible().catch(() => false))) {
      test.skip(true, "Tenant has no projects; cannot reach the dashboard.");
      return;
    }
    await devChip.click();

    // DashboardOverview lives at /app/<itemId>/dashboard.
    await page.waitForURL("**/app/**/dashboard", { timeout: 20_000 });
    await expect(page).toHaveURL(/\/app\/[^/]+\/dashboard$/);

    // DashboardHeader (different from the console header) renders the
    // BackToConsoleNavigator — a <Link to="/console"> wrapping a Button whose
    // visible text is "Back to console" (md+) or "Console" (mobile).
    const back = page.getByRole("link", { name: /^(Back to console|Console)$/ });
    await expect(back).toBeVisible({ timeout: 20_000 });

    await back.click();

    await page.waitForURL("**/app/console", { timeout: 20_000 });
    await expect(page).toHaveURL(/\/app\/console$/);
    await expect(
      page.getByRole("heading", { name: "Your Blocks Projects" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
