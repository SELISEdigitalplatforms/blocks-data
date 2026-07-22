import { test, expect } from "../../support/test-base";

test.describe("Service navigation", () => {
  test("switches environment and opens the Data app from the app switcher", async ({
    page,
  }) => {
    await page.goto("/app/console");

    await expect(page).toHaveURL(/\/app\/console/);
    await expect(
      page.getByRole("heading", { name: "Your Blocks Projects" }),
    ).toBeVisible({ timeout: 20_000 });

    // Environment switch: "Development" in the environment picker.
    await page.getByRole("button", { name: "Development" }).click();
    await expect(
      page.getByRole("button", { name: "Back to console" }),
    ).toBeVisible();

    // Return to the console.
    await page.getByRole("button", { name: "Back to console" }).click();
    await expect(page).toHaveURL(/\/app\/console/);

    // Open the "SELISE Blocks apps" menu (the app switcher trigger inside main).
    await page
      .getByRole("main")
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .click();
    await expect(
      page.getByRole("button", { name: "SELISE Blocks apps" }),
    ).toBeVisible();

    // Navigate to the Data app via the switcher.
    await page.getByRole("button", { name: "SELISE Blocks apps" }).click();
    await page.getByRole("link", { name: "Data Data" }).click();

    // Land on the Data overview/project area.
    await page.waitForURL("**/app/**", { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/app\/console$/);
  });
});
