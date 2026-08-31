import { type Page, type Locator, expect } from "@playwright/test";

export class ManageAccessModal {
  constructor(private page: Page) {}

  isDialogOpen(timeout = 5_000): Promise<boolean> {
    return this.page
      .getByRole("dialog")
      .isVisible({ timeout })
      .catch(() => false);
  }

  getDialog(): Locator {
    return this.page
      .getByRole("dialog")
      .filter({ has: this.page.getByRole("heading", { name: "Manage access" }) });
  }

  getHeading(): Locator {
    return this.page.getByRole("heading", { name: "Manage access" });
  }

  getAddAccessHeading(): Locator {
    return this.getDialog().getByRole("heading", { name: "Add access" });
  }

  getAccessRulesHeading(): Locator {
    return this.getDialog().getByRole("heading", { name: "Access rules" });
  }

  getInheritanceLabel(): Locator {
    return this.getDialog().getByText("Inheritance", { exact: true });
  }

  getDoneButton(): Locator {
    return this.getDialog().getByRole("button", { name: "Done" });
  }

  getPrincipalButton(principal: "User" | "Role" | "Organization" | "Everyone"): Locator {
    return this.getDialog().getByRole("button", { name: principal, exact: true });
  }

  getPermissionSelect(): Locator {
    return this.getDialog().locator('[aria-label="Permission"]');
  }

  getEffectSelect(): Locator {
    return this.getDialog().locator('[aria-label="Effect"]');
  }

  getRulePreview(): Locator {
    return this.getDialog()
      .locator("section")
      .filter({ has: this.page.getByText("Rule preview") });
  }

  getAddAccessRuleButton(): Locator {
    return this.getDialog().getByRole("button", { name: /Add access rule/i });
  }

  getToggleInheritanceButton(): Locator {
    return this.getDialog().getByRole("button", { name: /Turn (on|off) inheritance/i });
  }

  async waitForOpen(timeout = 15_000): Promise<void> {
    await expect(this.getHeading()).toBeVisible({ timeout });
  }

  async assertContents(itemName: string): Promise<void> {
    await expect(this.getHeading()).toBeVisible();
    await expect(this.getDialog()).toContainText(
      `Control who can access ${itemName} and what they can do.`,
    );
    await this.getAddAccessHeading().toBeVisible();
    await expect(this.getDialog()).toContainText(
      /Create a rule for a person, role, organization, or everyone\./,
    );
    await expect(this.getDialog()).toContainText(/Who should have access\?/);
    await this.getAccessRulesHeading().toBeVisible();
    await expect(this.getDialog()).toContainText(
      /Rules directly on this item and those inherited from its parent\./,
    );
    await expect(this.getDialog()).toContainText(/No rules on this item\./);
    await expect(this.getDialog()).toContainText(/Access comes from the parent directory\./);
    await this.getInheritanceLabel().toBeVisible();
    await this.getToggleInheritanceButton().toBeVisible();
    await this.getDoneButton().toBeVisible();

    for (const principal of ["User", "Role", "Organization", "Everyone"] as const) {
      await expect(this.getPrincipalButton(principal)).toBeVisible();
    }

    await expect(this.getDialog()).toContainText(/What can they do\?/);
    await expect(this.getDialog()).toContainText(/Should this rule allow or deny\?/);
    await expect(this.getPermissionSelect()).toBeVisible();
    await expect(this.getEffectSelect()).toBeVisible();
    await expect(this.getPermissionSelect()).toContainText("View");
    await expect(this.getEffectSelect()).toContainText("Allow");
  }

  async assertDefaultState(): Promise<void> {
    await expect(this.getPrincipalButton("User")).toHaveAttribute("aria-pressed", "true");
    await expect(this.getPrincipalButton("Everyone")).toHaveAttribute("aria-pressed", "false");
    await expect(this.getPermissionSelect()).toContainText("View");
    await expect(this.getEffectSelect()).toContainText("Allow");
    await expect(this.getAddAccessRuleButton()).toBeDisabled();
    await expect(this.getDialog()).toContainText(/Choose users to continue\./);
  }

  async switchPrincipal(principal: "User" | "Role" | "Organization" | "Everyone"): Promise<void> {
    await this.getPrincipalButton(principal).click();
    await expect(this.getPrincipalButton(principal)).toHaveAttribute("aria-pressed", "true");
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

  async close(): Promise<void> {
    await this.getDoneButton().click();
    await expect(this.getDialog()).toBeHidden({ timeout: 10_000 });
  }
}
