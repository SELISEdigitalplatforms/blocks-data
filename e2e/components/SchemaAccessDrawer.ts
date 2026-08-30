import { type Page, type Locator, expect } from "@playwright/test";

export class SchemaAccessDrawer {
  constructor(private page: Page) {}

  getSchemaAccessButton(): Locator {
    return this.page.getByRole("button", { name: "Schema Access" });
  }

  getTabs(): Locator {
    return this.page.getByRole("tab");
  }

  getViewTab(): Locator {
    return this.page.getByRole("tab", { name: "View" });
  }

  getEditTab(): Locator {
    return this.page.getByRole("tab", { name: "Edit" });
  }

  getDeleteTab(): Locator {
    return this.page.getByRole("tab", { name: "Delete" });
  }

  getChangePolicySelect(): Locator {
    return this.page
      .getByRole("combobox")
      .filter({ hasText: /Change Policy|Inherited|All logged in|Public|Custom/i })
      .first();
  }

  getPolicyOption(policy: "Public" | "Custom" | "All logged in" | "Inherited"): Locator {
    return this.page.getByRole("option", { name: policy });
  }

  getConfirmPolicyButton(): Locator {
    return this.page.getByRole("button", { name: "Confirm" }).first();
  }

  getRuleSetAddButton(): Locator {
    return this.page.getByRole("button", { name: "Add", exact: true }).first();
  }

  getAddRuleSetButton(): Locator {
    return this.page.getByRole("button", { name: /Add Rule/ });
  }

  getCloseButton(): Locator {
    return this.page.getByRole("button", { name: "Close schema access drawer" });
  }

  getPrincipalButton(principal: "User" | "Role" | "Organization" | "Everyone"): Locator {
    return this.page.getByRole("button", { name: principal, exact: true });
  }

  getPermissionSelect(): Locator {
    return this.page.locator('[aria-label="Permission"]');
  }

  getEffectSelect(): Locator {
    return this.page.locator('[aria-label="Effect"]');
  }

  getAddAccessRuleButton(): Locator {
    return this.page.getByRole("button", { name: /Add access rule/i });
  }

  getRulePreviewSection(): Locator {
    return this.page
      .locator("section")
      .filter({ has: this.page.getByText("Rule preview", { exact: true }) });
  }

  async open(): Promise<void> {
    await expect(this.getSchemaAccessButton()).toBeVisible({ timeout: 15_000 });
    await this.getSchemaAccessButton().click();
  }

  async close(): Promise<void> {
    await this.getCloseButton().click();
  }

  async walkTabs(): Promise<void> {
    const tabs = this.getTabs();
    const count = await tabs.count();
    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toBeVisible();
    }
    await this.getViewTab().click();
  }

  async selectPolicyAndAddRuleSet(policy: "Custom"): Promise<void> {
    const select = this.getChangePolicySelect();
    await expect(select).toBeVisible({ timeout: 10_000 });
    await select.click();
    await this.getPolicyOption(policy).click();
    await this.getConfirmPolicyButton().click();
    await this.getRuleSetAddButton().click();
    await this.getAddRuleSetButton().click();
  }

  async assertPrincipalButtonsVisible(): Promise<void> {
    for (const principal of ["User", "Role", "Organization", "Everyone"] as const) {
      await expect(this.getPrincipalButton(principal)).toBeVisible();
    }
  }

  async assertDefaultState(): Promise<void> {
    const userButton = this.getPrincipalButton("User");
    const everyoneButton = this.getPrincipalButton("Everyone");
    await expect(userButton).toHaveAttribute("aria-pressed", "true");
    await expect(everyoneButton).toHaveAttribute("aria-pressed", "false");

    const permissionSelect = this.getPermissionSelect();
    const effectSelect = this.getEffectSelect();
    await expect(permissionSelect).toBeVisible();
    await expect(effectSelect).toBeVisible();
    await expect(permissionSelect).toContainText("View");
    await expect(effectSelect).toContainText("Allow");

    await expect(this.getAddAccessRuleButton()).toBeDisabled();
  }

  async switchPrincipalAndVerify(principal: "Everyone" | "Role" | "Organization"): Promise<void> {
    await this.getPrincipalButton(principal).click();
    await expect(this.getPrincipalButton(principal)).toHaveAttribute("aria-pressed", "true");

    if (principal === "Everyone") {
      await expect(this.getAddAccessRuleButton()).toBeEnabled();
    } else {
      await expect(this.getAddAccessRuleButton()).toBeDisabled();
    }
  }

  async changePermissionTo(value: string): Promise<void> {
    await this.getPermissionSelect().click();
    await this.page.getByRole("option", { name: value, exact: true }).click();
    await expect(this.getPermissionSelect()).toContainText(value);
  }

  async changeEffectTo(value: "Allow" | "Deny"): Promise<void> {
    await this.getEffectSelect().click();
    await this.page.getByRole("option", { name: value, exact: true }).click();
    await expect(this.getEffectSelect()).toContainText(value);
  }
}
