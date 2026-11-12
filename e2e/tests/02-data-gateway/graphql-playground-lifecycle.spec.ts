import { expect, type Page } from "@playwright/test";
import { test } from "../../support/test-base";
import { openDataGateway } from "../../support/open-data-gateway";
import { openEnvironment } from "../../support/navigation";
import { dismissSessionConflictIfPresent } from "../../support/session-conflict";

/**
 * blocks-data#421: the GraphQL playground registers its Monaco commands, shortcuts and
 * CodeLens with disposables instead of patching Monaco's shared command service.
 * Every remount here is an in-app navigation: a page reload would reset Monaco's
 * shared services and hide a leak.
 */

// The minimal Monaco surface the probes read in the browser (window.monaco is kept on purpose).
type MonacoProbe = {
  editor: {
    getEditors: () => Array<{
      getModel: () => { getLanguageId: () => string; getLineCount: () => number } | null;
      setValue: (value: string) => void;
      _commandService: object;
    }>;
  };
};

const graphqlEditor = (page: Page) =>
  page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: MonacoProbe }).monaco;
    return !!monaco?.editor.getEditors().find((e) => e.getModel()?.getLanguageId() === "graphql");
  });

const lineCount = (page: Page) =>
  page.evaluate(() => {
    const monaco = (window as unknown as { monaco: MonacoProbe }).monaco;
    const editor = monaco.editor.getEditors().find((e) => e.getModel()?.getLanguageId() === "graphql");
    return editor!.getModel()!.getLineCount();
  });

test.describe("feature: GraphQL playground Monaco lifecycle (#421)", () => {
  test("CodeLens, shortcuts and the shared command service survive 5 remounts", async ({ page }) => {
    test.setTimeout(300_000);

    // Gateway executions only: the page also POSTs introspection queries to /gateway.
    let gatewayRequests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname.endsWith("/gateway") &&
        !(request.postData() ?? "").includes("__schema")
      ) {
        gatewayRequests++;
      }
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    const sections = page.getByRole("navigation", { name: "Data Gateway sections" });
    const playgroundLink = sections.getByRole("link", { name: "Playground", exact: true });
    // The playground keeps the REST workspace mounted (hidden) beside the GraphQL one and opens
    // on REST, so only the visible editors are the GraphQL query and response editors.
    const graphqlTab = page
      .getByRole("radiogroup", { name: "Protocol" })
      .getByRole("radio", { name: /^GraphQL/ });
    const queryEditor = page.locator(".monaco-editor:visible").first();
    const responseEditor = page.locator(".monaco-editor:visible").nth(1);
    const openGraphqlTab = async () => {
      await graphqlTab.click();
      await expect(graphqlTab).toHaveAttribute("aria-checked", "true");
    };

    await test.step("Open the playground (H1)", async () => {
      await openEnvironment(page);
      await dismissSessionConflictIfPresent(page);
      await openDataGateway(page);
      await playgroundLink.click();
      await expect(page).toHaveURL(/\/playground/, { timeout: 15_000 });
      await openGraphqlTab();
      await expect(queryEditor).toBeVisible({ timeout: 30_000 });
    });

    await test.step("Remount 5 times through in-app navigation (C14)", async () => {
      for (let i = 0; i < 5; i++) {
        await sections.getByRole("link", { name: /^Schemas/ }).click();
        await expect(page).not.toHaveURL(/\/playground/, { timeout: 15_000 });
        await playgroundLink.click();
        await expect(page).toHaveURL(/\/playground/, { timeout: 15_000 });
        await openGraphqlTab();
        await expect(queryEditor).toBeVisible({ timeout: 30_000 });
        await expect.poll(() => page.evaluate(() => !!(window as unknown as { monaco?: unknown }).monaco)).toBe(true);
      }
      await expect.poll(() => graphqlEditor(page), { timeout: 15_000 }).toBe(true);
    });

    await test.step("The shared command service has no own executeCommand (C1)", async () => {
      const patched = await page.evaluate(() => {
        const monaco = (window as unknown as { monaco: MonacoProbe }).monaco;
        const editor = monaco.editor.getEditors().find((e) => e.getModel()?.getLanguageId() === "graphql");
        return Object.prototype.hasOwnProperty.call(editor!._commandService, "executeCommand");
      });
      expect(patched).toBe(false);
    });

    await test.step("CodeLens Run sends exactly one gateway request (H2, H3, H12, C10)", async () => {
      await page.evaluate(() => {
        const monaco = (window as unknown as { monaco: MonacoProbe }).monaco;
        const editor = monaco.editor.getEditors().find((e) => e.getModel()?.getLanguageId() === "graphql");
        // Multi-line on purpose: a one-line operation yields no CodeLens.
        editor!.setValue("query {\n  __typename\n}");
      });
      await queryEditor.locator(".view-lines").click();
      await page.keyboard.press("End");

      const runLens = queryEditor.locator(".codelens-decoration a", { hasText: "Run query" });
      await expect(runLens).toBeVisible({ timeout: 15_000 });
      const before = gatewayRequests;
      await runLens.click();
      await expect(page.locator("span").filter({ hasText: /^Response$/ }).first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("// Execute a query to see the response")).toBeHidden({ timeout: 15_000 });
      await page.waitForTimeout(1_500);
      expect(gatewayRequests - before).toBe(1);
    });

    await test.step("Ctrl/Cmd+Shift+E in the query editor executes (H6)", async () => {
      const before = gatewayRequests;
      await queryEditor.locator(".view-lines").click();
      await page.keyboard.press("ControlOrMeta+Shift+KeyE");
      await expect.poll(() => gatewayRequests - before, { timeout: 10_000 }).toBe(1);
    });

    await test.step("Shift+Enter in the query editor adds a line without executing (H5)", async () => {
      const lines = await lineCount(page);
      await queryEditor.locator(".view-lines").click();
      await page.keyboard.press("End");
      // Read the counter after the click, so a late response to the previous step is not counted.
      const before = gatewayRequests;
      await page.keyboard.press("Shift+Enter");
      await expect.poll(() => lineCount(page), { timeout: 5_000 }).toBe(lines + 1);
      await page.waitForTimeout(1_500);
      expect(gatewayRequests).toBe(before);
    });

    await test.step("The shortcuts do nothing in the response editor (C6)", async () => {
      const lines = await lineCount(page);
      const before = gatewayRequests;
      await responseEditor.locator(".view-lines").click();
      await page.keyboard.press("Shift+Enter");
      await page.keyboard.press("ControlOrMeta+Shift+KeyE");
      await page.waitForTimeout(1_500);
      expect(await lineCount(page)).toBe(lines);
      expect(gatewayRequests).toBe(before);
    });

    await test.step("No call stack overflow was reported (C13)", async () => {
      expect(errors.filter((message) => /Maximum call stack size exceeded/.test(message))).toEqual([]);
    });
  });
});
