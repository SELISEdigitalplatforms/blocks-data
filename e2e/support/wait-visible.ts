import { expect, type Locator } from "@playwright/test";

/**
 * `locator.isVisible({ timeout })` does NOT wait — the options bag exists for
 * API symmetry, but the check is a single immediate probe, so callers that
 * pass a timeout to "wait for it" get a false result on slow renders. For
 * optional elements that must genuinely be awaited, use this helper: it runs
 * the strict `expect(locator).toBeVisible()` assertion (auto-retrying, and
 * reported properly in traces/errors) up to `timeout` and resolves the
 * outcome to a boolean. Elements that MUST be present should use
 * `expect(...).toBeVisible()` directly instead.
 */
export async function waitVisible(locator: Locator, timeout: number): Promise<boolean> {
  try {
    await expect(locator).toBeVisible({ timeout });
    return true;
  } catch {
    return false;
  }
}
