import { test as base, expect, type Page } from "@playwright/test";

// Shared `test` for the whole suite. Specs import from here instead of
// "@playwright/test" so the pause below applies everywhere automatically.
//
// Headed runs hold the browser open for a moment after each test finishes, so
// the end state is actually watchable instead of vanishing the instant the
// assertions pass. Headless runs (CI, plain `npm test`) are untouched.
//
//   E2E_PAUSE_MS=0      disable
//   E2E_PAUSE_MS=30000  hold longer
//   E2E_PAUSE_MS=3000 npm test   force it on in headless too

function pauseMs(isHeaded: boolean): number {
  const configured = process.env.E2E_PAUSE_MS;

  if (configured !== undefined && configured !== "") {
    const parsed = Number(configured);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  return isHeaded ? 10_000 : 0;
}

export const test = base.extend<{ pauseAfterEachTest: void }>({
  pauseAfterEachTest: [
    async ({ page }, use, testInfo) => {
      // `--headed` flips headless to false on the resolved project config.
      const isHeaded = testInfo.project.use.headless === false;
      const ms = pauseMs(isHeaded);

      // The pause runs inside the test's time budget, so give it back.
      if (ms > 0) testInfo.setTimeout(testInfo.timeout + ms);

      await use();

      // Teardown: runs after the test body, before `page` is disposed.
      if (ms > 0 && !page.isClosed()) {
        await page.waitForTimeout(ms);
      }
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Toast helper: the project's use-toast hook renders the same description
 * twice — once in the visible card and once in a hidden aria-live
 * `<span role="status">` for screen readers. Plain `getByText(...)` blows
 * up under strict mode because both elements match.
 *
 * Scope to the visible toast card by class. Use `exact: true` because
 * "Configuration updated successfully" is a substring of "Configuration
 * updated successfully X" only if someone prepended text (rare).
 */
export const TOAST_VISIBLE = "div.text-sm.opacity-90";

export async function expectToast(
  page: Page,
  description: string,
  timeout = 20_000,
): Promise<void> {
  await expect(
    page
      .locator(TOAST_VISIBLE, { hasText: description })
      .first(),
  ).toBeVisible({ timeout });
}

/**
 * Build a session-unique identifier for any record created during a test
 * (storage configuration name, schema name, folder name, rule-set name, etc.).
 * Combines a caller-supplied prefix with `Date.now()` and a random integer so
 * parallel runs within the same millisecond do not collide on the dev backend.
 *
 * Always prefer this over hand-rolled `${prefix}-${Date.now()}` strings —
 * `Date.now()` alone is predictable and can clash if two suites run back-to-back.
 */
export function uniqueName(prefix: string): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1e9);
  return `${prefix}_${ts}_${rand}`;
}
