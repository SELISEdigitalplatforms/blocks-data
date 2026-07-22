import { test, expect } from "../../support/test-base";

test.describe("Data overview page", () => {
  test("renders the Data overview heading and primary actions", async ({
    page,
  }) => {
    // The service-navigation spec lands here after the app switcher. This spec
    // assumes the user is already authenticated and the Data app is the active
    // project via fixtures/auth.json (set up by tests/auth/login.spec.ts).
    await page.goto("/app/console");

    await expect(
      page.getByRole("heading", { name: "Your Blocks Projects" }),
    ).toBeVisible({ timeout: 20_000 });

    // The Data project card / overview CTA. The text "Data" is reused as both
    // the card title and link name, so anchor on the visible heading or card.
    const dataCard = page.getByRole("link", { name: /Data/ }).first();
    await expect(dataCard).toBeVisible();
    await dataCard.click();

    // After opening the Data app, the overview page should show the project
    // name and a primary content area. Headings in blocks-kit/data-overview are
    // project-scoped, so wait for the URL to leave the console route.
    await page.waitForURL((url) => !/\/app\/console$/.test(url.pathname), {
      timeout: 30_000,
    });

    // The Data overview shell renders inside <main>; assert it is present and
    // at least one Data-scoped heading or action is reachable.
    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("heading").filter({ hasText: /Data/ }).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
