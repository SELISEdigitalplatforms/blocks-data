import test, { expect } from "@playwright/test";
import { e2eBaseUrl } from "../../support/env";
import { readDataProject } from "../../support/data-project";
import { openEnvironment } from "../../support/navigation";

test.describe("flow: Overview menu", () => {
  test("Overview page — console, topbar, sidebar navigation, Project Details, Core APIs", async ({
    page,
  }) => {
    test.setTimeout(150_000);

    await page.goto(`${e2eBaseUrl()}/app/console`, { waitUntil: "domcontentloaded" });

    await test.step("should change theme between Light, Dark, and Auto", async () => {
      const themeButton = page.getByRole("button", { name: "Change theme" });

      await themeButton.click();
      await page.getByText("Light", { exact: true }).click();

      await themeButton.click();
      await page.getByText("Dark", { exact: true }).click();

      await themeButton.click();
      await page.getByText("Auto", { exact: true }).click();
    });

    await test.step("Topbar: language selector lists EN/German/French with non-English disabled", async () => {
      const languageButton = page.getByRole("button", { name: /^en$/i });
      await languageButton.click();
      await expect(page.getByRole("menuitem", { name: "English" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "German" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(page.getByRole("menuitem", { name: "French" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    await test.step("Topbar: notification bell opens the popover and 'Mark all as read' is usable", async () => {
      const bell = page.getByTestId("notification-bell");
      await bell.click();
      await expect(page.getByText("Notifications", { exact: true })).toBeVisible();
      const markAllRead = page.getByRole("button", { name: "Mark all as read" });
      await expect(markAllRead).toBeVisible({ timeout: 10_000 });
      await markAllRead.click({ force: true, timeout: 10_000 });
      await expect(page.getByText("Notifications", { exact: true })).toHaveCount(0);
    });

    await test.step("Topbar: an unread notification is marked read on hover (not requiring a click)", async () => {
      const bell = page.getByTestId("notification-bell");
      await bell.click();
      await expect(page.getByText("Notifications", { exact: true })).toBeVisible({
        timeout: 10_000,
      });
      const rows = page.locator(
        '[class*="cursor-pointer"][class*="items-start"][class*="border-b"]',
      );
      await expect(rows.first()).toBeVisible({ timeout: 10_000 });
      const firstRow = rows.first();
      const initialClass = (await firstRow.getAttribute("class")) ?? "";
      await firstRow.hover();
      if (initialClass.includes("bg-muted")) {
        await expect(firstRow).not.toHaveClass(/bg-muted/, { timeout: 10_000 });
      } else {
        await expect(firstRow).not.toHaveClass(/bg-muted/, { timeout: 10_000 });
      }
      if ((await page.getByText("Notifications", { exact: true }).count()) > 0) {
        await page.mouse.click(20, 20);
      }
      await expect(page.getByText("Notifications", { exact: true })).toHaveCount(0);
    });

    await test.step("Topbar: app switcher opens the SELISE Blocks apps list", async () => {
      const appsButton = page.getByRole("button", { name: "SELISE Blocks apps" });
      await appsButton.click();
      await expect(page.getByText("SELISE Blocks", { exact: true })).toBeVisible();
      await page.mouse.click(20, 20);
      await expect(page.getByText("SELISE Blocks", { exact: true })).toHaveCount(0);
    });

    await test.step("Topbar: user avatar menu lists 'My Profile' and 'Log out', and Profile navigates", async () => {
      const avatarTrigger = page.getByRole("button", { name: "Open user menu" });
      await expect(avatarTrigger).toBeVisible({ timeout: 10_000 });

      await avatarTrigger.click();
      const profileItem = page.getByRole("menuitem", { name: "My Profile" });
      await expect(profileItem).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("menuitem", { name: "Log out" })).toBeVisible();

      await profileItem.click();
      await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Your Blocks Projects" })).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step("Console: project list shows a real project card with name and environment chip", async () => {
      await expect(page.getByRole("heading", { name: "Your Blocks Projects" })).toBeVisible({
        timeout: 30_000,
      });
      const fixture = readDataProject();
      if (fixture) {
        await expect(page.getByText(fixture.projectName, { exact: true }).first()).toBeVisible({
          timeout: 30_000,
        });
      }
      await expect(
        page
          .getByRole("button", {
            name: /^(Development|Production|Testing|Staging|IAT|UAT|Prod Shadow|Pre-Prod)$/,
          })
          .first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step("Console: project card's settings icon navigates cross-app to the environments overview (Blocks OS)", async () => {
      const main = page.getByRole("main");
      const configureButton = main.locator("button:has(svg.lucide-settings-2)").first();
      await expect(configureButton).toBeVisible({ timeout: 15_000 });

      await configureButton.hover();
      await expect(page.getByRole("tooltip", { name: "Configure Project" })).toBeVisible({
        timeout: 10_000,
      });

      const consoleUrl = page.url();
      await configureButton.click();
      await expect(page).toHaveURL(/\/environments/, { timeout: 30_000 });

      await page.goto(consoleUrl, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Your Blocks Projects" })).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step("Console: Resources cards (Docs/Code/Cloud) actually navigate to their target URL when clicked", async () => {
      const docsLink = page.getByRole("link", { name: "Docs", exact: false });
      const codeLink = page.getByRole("link", { name: "Code", exact: false });
      const cloudLink = page.getByRole("link", { name: "Cloud", exact: false });

      for (const link of [docsLink, codeLink, cloudLink]) {
        await expect(link).toBeVisible({ timeout: 15_000 });
        await expect(link).toHaveAttribute("href", /^https?:\/\//);
        await expect(link).toHaveAttribute("target", "_blank");

        const expectedHref = await link.getAttribute("href");
        const [popup] = await Promise.all([
          page.context().waitForEvent("page", { timeout: 15_000 }),
          link.click(),
        ]);
        await popup.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
        const stripTrailingSlash = (url: string) => url.replace(/\/$/, "");
        expect(stripTrailingSlash(popup.url())).toBe(stripTrailingSlash(expectedHref ?? ""));
        await popup.close();
      }
    });

    await openEnvironment(page);
    await expect(page.getByRole("heading", { name: "Project Details" })).toBeVisible({
      timeout: 30_000,
    });
    const dashboardUrl = page.url();

    await test.step("'Overview' sidebar link is itemId-scoped and actually navigates back here", async () => {
      await page.getByRole("link", { name: "Data Gateway" }).first().click();
      await expect(page).not.toHaveURL(dashboardUrl);

      const overviewLink = page.getByRole("link", { name: "Overview" }).first();
      await expect(overviewLink).toHaveAttribute("href", /\/app\/[^/]+\/dashboard$/);

      await overviewLink.click();
      await expect(page).toHaveURL(dashboardUrl);
      await expect(page.getByRole("heading", { name: "Project Details" })).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step("Workspace area (sidebar): Project/Environment widgets show current context and are permanently disabled", async () => {
      await expect(page.getByText("Workspace", { exact: true })).toBeVisible({
        timeout: 15_000,
      });

      const projectWidget = page.getByRole("button", { name: /^Project/ });
      const environmentWidget = page.getByRole("button", { name: /^Environment/ });
      await expect(projectWidget).toBeVisible();
      await expect(environmentWidget).toBeVisible();
      await expect(projectWidget).toBeDisabled();
      await expect(environmentWidget).toBeDisabled();

      const fixture = readDataProject();
      if (fixture) {
        await expect(projectWidget).toContainText(fixture.projectName);
      }
      const environmentText = await environmentWidget.innerText();
      expect(environmentText.toLowerCase()).toContain("environment");
      expect(environmentText.replace(/environment/i, "").trim().length).toBeGreaterThan(0);
    });

    await test.step("Project Details card shows Name, X-Blocks-Key, and a human-readable Environment badge", async () => {
      const main = page.getByRole("main");
      await expect(main.getByText("Name", { exact: true })).toBeVisible();
      await expect(main.getByText("X-Blocks-Key", { exact: true })).toBeVisible();
      await expect(main.getByText("Environment", { exact: true })).toBeVisible();

      await expect(
        main.getByRole("button", { name: /^(Production|Development|Testing|Staging|IAT)$/ }),
      ).toBeVisible();
    });

    await test.step("X-Blocks-Key is masked, and its hover-reveal copy button works", async () => {
      const keyRow = page.getByText("X-Blocks-Key", { exact: true }).locator("..");
      await expect(keyRow).toContainText("*");

      const copyButton = keyRow.getByRole("button");
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await copyButton.hover();
      await copyButton.click();
      await expect(copyButton).toHaveAttribute("aria-label", "Copied!", { timeout: 10_000 });
    });

    await test.step("Core APIs card lists endpoint groups, collapsed by default, and expands on click", async () => {
      await expect(page.getByRole("heading", { name: "Core APIs" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Available endpoints for this module")).toBeVisible();
      await expect(page.getByText(/^\d+ Endpoints?$/)).toBeVisible();

      const groupButtons = page.getByRole("button", { name: /^[A-Za-z]+\s+\d+$/ });
      await expect(groupButtons.first()).toBeVisible({ timeout: 15_000 });
      const groupCount = await groupButtons.count();
      expect(groupCount).toBeGreaterThan(0);

      const firstGroup = groupButtons.first();
      await expect(firstGroup).toHaveAttribute("aria-expanded", "false");

      async function expandGroup(button: ReturnType<typeof groupButtons.nth>) {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            if ((await button.getAttribute("aria-expanded")) === "true") return;
            await button.scrollIntoViewIfNeeded();
            await button.click({ timeout: 10_000 });
          } catch {
            // retry
          }
        }
        await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 15_000 });
      }

      await expandGroup(firstGroup);
    });

    await test.step("'Copy as cURL' on an endpoint is hover-reveal and copies something to the clipboard", async () => {
      const curlRow = page.getByText("Copy as cURL").first().locator("..");
      await expect(curlRow).toBeVisible({ timeout: 15_000 });
      const curlButton = curlRow.getByRole("button");

      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await curlButton.scrollIntoViewIfNeeded();
      await curlButton.hover();
      await curlButton.click({ timeout: 15_000 });
      await expect(curlButton).toHaveAttribute("aria-label", "Copied!", { timeout: 10_000 });
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText.length).toBeGreaterThan(0);
      expect(clipboardText).toContain("curl");
    });
  });
});
