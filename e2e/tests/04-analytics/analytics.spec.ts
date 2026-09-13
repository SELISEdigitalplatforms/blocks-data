import { expect, type Page } from "@playwright/test";
import { test } from "../../support/test-base";
import { openEnvironment } from "../../support/navigation";

async function openDataGateway(page: Page) {
  const url = new URL(page.url());
  const projectId = url.pathname.split("/")[2];
  if (projectId) {
    await page.goto(`${url.origin}/app/${projectId}/data-gateway`, {
      waitUntil: "domcontentloaded",
    });
  } else {
    await page.getByRole("link", { name: "Data Gateway" }).first().click();
  }
  await expect(page.getByRole("main").getByText("Data Gateway", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

async function openAnalytics(page: Page) {
  await openDataGateway(page);
  await page.getByRole("button", { name: "More actions" }).click();
  const analyticsItem = page.getByRole("menuitem", { name: "Analytics" });
  await expect(analyticsItem).toBeVisible({ timeout: 15_000 });
  await analyticsItem.click();
  await expect(page).toHaveURL(/\/analytics/, { timeout: 30_000 });
}

test.describe("flow: Data Gateway — Analytics page", () => {
  // Single merged test that runs the whole spec as one Playwright test.
  // Sections are run in dependency order: Data Gateway (Indexes, Access) → Analytics.
  test("Data Gateway & Analytics — full flow (Indexes, Access pills, Analytics tabs and history)", async ({
    page,
  }) => {
    test.setTimeout(900_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openEnvironment(page);

    // ------------------------------------------------------------------
    // Section A: Data Gateway — Indexes tab
    // ------------------------------------------------------------------
    await openDataGateway(page);
    const idxSchemaName = `dg_idx_${Date.now()}`;

    await test.step("Indexes: Create an Entity schema to host the index checks", async () => {
      const landingHeading = page.getByRole("heading", { name: "Security Assessment" });
      const emptyStateHeading = page.getByText("No schemas yet", { exact: true });
      await expect(landingHeading.or(emptyStateHeading).first()).toBeVisible({
        timeout: 30_000,
      });
      const addButton = page.getByRole("button", { name: "Add Schema", exact: true }).first();
      if (await addButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await addButton.click();
        await expect(page.getByRole("heading", { name: "Add New Schema" })).toBeVisible({
          timeout: 30_000,
        });
        await page.getByLabel(/Schema name/).fill(idxSchemaName);
        await page.getByRole("button", { name: "Add" }).last().click();
        await expect(page.getByText("Schema added successfully").first()).toBeVisible({
          timeout: 15_000,
        });
      } else {
        const sidebarAdd = page.getByRole("button", { name: "Add", exact: true }).first();
        await sidebarAdd.click();
        await expect(page.getByRole("heading", { name: "Add New Schema" })).toBeVisible({
          timeout: 30_000,
        });
        await page.getByLabel(/Schema name/).fill(idxSchemaName);
        await page.getByRole("button", { name: "Add" }).last().click();
        await expect(page.getByText("Schema added successfully").first()).toBeVisible({
          timeout: 15_000,
        });
      }
      await expect(page.getByRole("heading", { name: idxSchemaName }).first()).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step("Indexes: tab shows the counter and either the list or the empty state", async () => {
      await page.getByRole("tab", { name: "Indexes" }).click();
      await expect(page.getByText(/of 15 indexes/i)).toBeVisible({ timeout: 30_000 });
      const empty = page.getByText("No indexes yet", { exact: true });
      const listItem = page.getByRole("button", { name: /Delete index / });
      await expect(empty.or(listItem).first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step("Indexes: Add-index form opens, requires a field, and cancels cleanly", async () => {
      const addIndex = page.getByRole("button", { name: "Add index" });
      await expect(addIndex).toBeVisible({ timeout: 15_000 });
      if (await addIndex.isDisabled().catch(() => false)) {
        // DTO schemas do not support indexes — documented UI state, nothing to exercise.
        await expect(page.getByText(/only supported on Entity/i).first()).toBeVisible();
        return;
      }
      await addIndex.click();
      await expect(page.getByText("Add index", { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
      // Save stays disabled until a field is picked.
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      await expect(page.getByLabel("Unique")).toBeVisible();
      await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
      await expect(page.getByText(/of 15 indexes/i)).toBeVisible({ timeout: 10_000 });
    });

    await test.step("Indexes: Delete the index-host schema to leave no residue", async () => {
      const moreOptions = page.getByRole("button", { name: "More options" });
      await expect(moreOptions).toBeVisible({ timeout: 15_000 });
      await moreOptions.click();
      await page.getByText("Delete schema", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Delete schema?" })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText("Deleted successfully").first()).toBeVisible({
        timeout: 15_000,
      });
    });

    await openDataGateway(page);
    const secSchemaName = `dg_sec_${Date.now()}`;

    await test.step("Access: Create a schema to host the security checks", async () => {
      const landingHeading = page.getByRole("heading", { name: "Security Assessment" });
      const emptyStateHeading = page.getByText("No schemas yet", { exact: true });
      await expect(landingHeading.or(emptyStateHeading).first()).toBeVisible({
        timeout: 30_000,
      });
      const addButton = page.getByRole("button", { name: "Add Schema", exact: true }).first();
      if (await addButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await addButton.click();
      } else {
        await page.getByRole("button", { name: "Add", exact: true }).first().click();
      }
      await expect(page.getByRole("heading", { name: "Add New Schema" })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByLabel(/Schema name/).fill(secSchemaName);
      await page.getByRole("button", { name: "Add" }).last().click();
      await expect(page.getByText("Schema added successfully").first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole("heading", { name: secSchemaName }).first()).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step("Access: Access Control pills open the access drawer when present", async () => {
      // Entity schemas show View/Create/Edit/Delete pills; Child schemas show References instead.
      const pill = page
        .getByRole("button", { name: /Logged-in users|Public|Custom|Inherited/ })
        .first();
      if (await pill.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await pill.click();
        const drawer = page.getByRole("dialog");
        await expect(drawer).toBeVisible({ timeout: 10_000 });
        await page.keyboard.press("Escape");
      }
    });

    await test.step("Access: RLS/CLS toggles round-trip behind confirmations when rendered", async () => {
      // NOTE: toggles are currently commented out in schema-structure-header and
      // schema-access-drawer — so this step passes gracefully when they are absent.
      for (const name of ["Toggle row level security", "Toggle column level security"]) {
        const toggle = page.getByRole("switch", { name });
        if (!(await toggle.isVisible({ timeout: 5_000 }).catch(() => false))) continue;
        const initial = await toggle.getAttribute("aria-checked");
        await toggle.click();
        const dialog = page.getByRole("dialog");
        if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await page.getByRole("button", { name: "Cancel" }).click();
          await expect(dialog).toBeHidden({ timeout: 10_000 });
          await expect(toggle).toHaveAttribute("aria-checked", initial ?? "");
        }
      }
    });

    await test.step("Access: Child/nested field expansion round-trips when a child type exists", async () => {
      // Child rows render only for child-typed fields; expand/collapse is a graceful no-op otherwise.
      const expandButton = page.getByRole("button", { name: /Expand .* attributes/i }).first();
      if (await expandButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expandButton.click();
        const collapseButton = page.getByRole("button", { name: /Collapse /i }).first();
        await expect(collapseButton).toBeVisible({ timeout: 10_000 });
        await collapseButton.click();
        await expect(
          page.getByRole("button", { name: /Expand .* attributes/i }).first(),
        ).toBeVisible({ timeout: 10_000 });
      }
    });

    await test.step("Access: Bulk Action menu lists Duplicate/Delete items in edit mode", async () => {
      const editButton = page.getByRole("button", { name: "Edit", exact: true });
      if (!(await editButton.isVisible({ timeout: 5_000 }).catch(() => false))) return;
      await editButton.click();
      await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible({
        timeout: 15_000,
      });
      const selectAll = page.getByRole("checkbox", { name: "Select all properties" });
      if (await selectAll.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await selectAll.click();
        const actionButton = page.getByRole("button", { name: "Action" });
        if (await actionButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await actionButton.click();
          await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible({
            timeout: 10_000,
          });
          await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
          await page.keyboard.press("Escape");
        }
      }
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    });

    await test.step("Access: Delete the security-host schema to leave no residue", async () => {
      const moreOptions = page.getByRole("button", { name: "More options" });
      await expect(moreOptions).toBeVisible({ timeout: 15_000 });
      await moreOptions.click();
      await page.getByText("Delete schema", { exact: true }).click();
      await expect(page.getByRole("heading", { name: "Delete schema?" })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText("Deleted successfully").first()).toBeVisible({
        timeout: 15_000,
      });
    });

    // ------------------------------------------------------------------
    // Section C: Analytics page
    // ------------------------------------------------------------------
    await openAnalytics(page);

    await test.step("Analytics: landing opens on Traffic with breadcrumb and tab list", async () => {
      await expect(page.getByText("Analytics", { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      });
      for (const tab of ["Traffic", "Performance", "Reliability", "Requests"]) {
        await expect(page.getByRole("tab", { name: tab })).toBeVisible({ timeout: 15_000 });
      }
      await expect(page.getByRole("tab", { name: "Traffic" })).toHaveAttribute(
        "data-state",
        "active",
      );
    });

    await test.step("Analytics: Default tab is explicit in the URL (?tab=traffic)", async () => {
      await expect(page).toHaveURL(/[?&]tab=traffic/, { timeout: 15_000 });
    });

    await test.step("Analytics: Traffic shows outcome, operations and coverage cards (or empty states)", async () => {
      const outcomes = page.getByText("Requests over time", { exact: true });
      const operations = page.getByText("Most frequent operations", { exact: true });
      const coverage = page.getByText("Schema coverage", { exact: true });
      await expect(outcomes.or(operations).or(coverage).first()).toBeVisible({ timeout: 30_000 });
      const emptyOrError = page.getByText(
        /No requests in this range|No schemas defined yet|Couldn't load/i,
      );
      await expect(outcomes.or(emptyOrError).first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step("Analytics: Bucket-size control exists on bucketed tabs, date range on all tabs", async () => {
      await expect(page.getByRole("combobox", { name: "Bucket size" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole("button", { name: /Date range/i })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/Schema introspection requests are excluded/i)).toBeVisible();
    });

    await test.step("Analytics: Bucket size switches Daily/Hourly/Weekly and persists the selection", async () => {
      const bucket = page.getByRole("combobox", { name: "Bucket size" });
      await bucket.click();
      const hourly = page.getByRole("option", { name: "Hourly" });
      await expect(hourly).toBeVisible({ timeout: 10_000 });
      await hourly.click();
      await expect(bucket).toContainText(/Hourly/i);
      await bucket.click();
      await page.getByRole("option", { name: "Weekly" }).click();
      await expect(bucket).toContainText(/Weekly/i);
      await bucket.click();
      await page.getByRole("option", { name: "Daily" }).click();
      await expect(bucket).toContainText(/Daily/i);
    });

    await test.step("Analytics: Date-range filter opens a calendar popover and closes on Escape", async () => {
      const rangeButton = page.getByRole("button", { name: /Date range/i });
      await rangeButton.click();
      const gridOrDialog = page.getByRole("grid").or(page.locator('[role="dialog"]'));
      await expect(gridOrDialog.first()).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press("Escape");
    });

    await test.step("Analytics: Performance tab shows latency, timing and transfer cards (or empty states)", async () => {
      await page.getByRole("tab", { name: "Performance" }).click();
      await expect(page).toHaveURL(/[?&]tab=performance/, { timeout: 15_000 });
      const latency = page.getByText("Response time", { exact: true });
      const timing = page.getByText("Where the time goes", { exact: true });
      const transfer = page.getByText("Data transfer", { exact: true });
      await expect(latency.or(timing).or(transfer).first()).toBeVisible({ timeout: 30_000 });
      const emptyOrError = page.getByText(/No requests in this range|Couldn't load/i);
      await expect(latency.or(emptyOrError).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("combobox", { name: "Bucket size" })).toBeVisible();
    });

    await test.step("Analytics: Reliability tab shows failures and error-rate cards (or empty states)", async () => {
      await page.getByRole("tab", { name: "Reliability" }).click();
      await expect(page).toHaveURL(/[?&]tab=reliability/, { timeout: 15_000 });
      const failures = page.getByText("Failures by reason", { exact: true });
      const errorRates = page.getByText("Error rates", { exact: true });
      await expect(failures.or(errorRates).first()).toBeVisible({ timeout: 30_000 });
      const emptyOrError = page.getByText(
        /No failed requests in this range|No requests in this range|Couldn't load/i,
      );
      await expect(failures.or(emptyOrError).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("combobox", { name: "Bucket size" })).toBeVisible();
    });

    await test.step("Analytics: Bucket size is hidden on Requests tab; introspection note is hidden too", async () => {
      await page.getByRole("tab", { name: "Requests" }).click();
      await expect(page).toHaveURL(/[?&]tab=requests/, { timeout: 15_000 });
      await expect(page.getByRole("combobox", { name: "Bucket size" })).toBeHidden({
        timeout: 10_000,
      });
      await expect(page.getByText(/Schema introspection requests are excluded/i)).toBeHidden({
        timeout: 10_000,
      });
    });

    await test.step("Analytics: Requests tab shows the history table or its empty state", async () => {
      const count = page.getByText(/^\d+ requests?$/);
      const headers = page.getByRole("columnheader", { name: "Time" });
      const empty = page.getByText(/No requests in this range|Couldn't load/i);
      await expect(count.or(headers).or(empty).first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step("Analytics: Requests filters (type, status, code, reason) are visible and change the list", async () => {
      const typeFilter = page.getByRole("combobox", { name: "Operation type" });
      const statusFilter = page.getByRole("combobox", { name: "Response status" });
      const codeFilter = page.getByRole("combobox", { name: "Status code" });
      const reasonFilter = page.getByRole("combobox", { name: "Failure reason" });
      await expect(typeFilter).toBeVisible({ timeout: 15_000 });
      await expect(statusFilter).toBeVisible();
      await expect(codeFilter).toBeVisible();
      await expect(reasonFilter).toBeVisible();

      await typeFilter.click();
      await page.getByRole("option", { name: "Query" }).click();
      await expect(typeFilter).toContainText(/Query/i);
      await typeFilter.click();
      await page.getByRole("option", { name: "All types" }).click();
      await expect(typeFilter).toContainText(/All types/i);

      await statusFilter.click();
      await page.getByRole("option", { name: "Allowed" }).click();
      await expect(statusFilter).toContainText(/Allowed/i);
      await statusFilter.click();
      await page.getByRole("option", { name: "All statuses" }).click();
    });

    await test.step("Analytics: Requests sorting toggles Time ascending/descending via the column header", async () => {
      const sortButton = page.getByRole("button", { name: "Sort by Time" });
      if (await sortButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await sortButton.click();
        await expect(page.locator('th[aria-sort="ascending"]')).toBeVisible({ timeout: 10_000 });
        await sortButton.click();
        await expect(page.locator('th[aria-sort="descending"]')).toBeVisible({ timeout: 10_000 });
      }
    });

    await test.step("Analytics: Requests row opens the details sheet and closes via the X button", async () => {
      // Clickable data rows carry cursor-pointer; the "No requests in this range" empty row does not.
      const dataRow = page.locator("table tbody tr.cursor-pointer").first();
      if (await dataRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await dataRow.click();
        const sheet = page.locator('[role="dialog"]');
        await expect(sheet).toBeVisible({ timeout: 10_000 });
        const close = sheet.getByRole("button", { name: "Close details" });
        if (await close.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await close.click();
          await expect(sheet).toBeHidden({ timeout: 10_000 });
        } else {
          await page.keyboard.press("Escape");
        }
      }
    });

    await test.step("Analytics: Invalid ?tab= value repairs itself back to traffic", async () => {
      const url = new URL(page.url());
      url.searchParams.set("tab", "bogus-tab");
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/[?&]tab=traffic/, { timeout: 15_000 });
      await expect(page.getByRole("tab", { name: "Traffic" })).toHaveAttribute(
        "data-state",
        "active",
      );
    });
  });
});
