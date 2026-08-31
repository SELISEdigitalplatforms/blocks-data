import { type Page, type Locator, expect } from "@playwright/test";
import { BasePage } from "./base/BasePage";
import { e2eBaseUrl, e2eCredentials } from "../support/env";

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(`${e2eBaseUrl()}/login`, { waitUntil: "domcontentloaded" });
  }

  getLoginButton(): Locator {
    return this.page.getByRole("button", { name: "Log in to your account" });
  }

  getEmailInput(): Locator {
    return this.page
      .locator("#oidc-email")
      .or(this.page.getByRole("textbox", { name: "Work Email" }));
  }

  getPasswordInput(): Locator {
    return this.page
      .locator("#oidc-password")
      .or(this.page.getByRole("textbox", { name: "Password" }));
  }

  getSubmitButton(): Locator {
    return this.page.getByRole("button", { name: "Login", exact: true });
  }

  getConsoleHeading(): Locator {
    return this.page.getByRole("heading", {
      name: /Your Blocks Projects|Welcome to SELISE Blocks/,
    });
  }

  async login(email?: string, password?: string): Promise<void> {
    const creds = e2eCredentials();
    const userEmail = email ?? creds.email;
    const userPassword = password ?? creds.password;

    await this.goto();

    const loginButton = this.getLoginButton();
    if (await loginButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await loginButton.click({ timeout: 8_000 });
    }

    const emailField = this.getEmailInput();
    await Promise.race([
      emailField.waitFor({ state: "visible", timeout: 30_000 }),
      this.getConsoleHeading().waitFor({ state: "visible", timeout: 30_000 }),
      this.page.waitForURL(/\/app\/console/, { timeout: 30_000 }),
    ]);

    const consoleVisible = await this.getConsoleHeading()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    if (consoleVisible) return;

    const emailVisible = await emailField.isVisible({ timeout: 5_000 }).catch(() => false);
    if (emailVisible) {
      await emailField.fill(userEmail);
      await this.getPasswordInput().fill(userPassword);
      await this.getSubmitButton().click();
      await this.waitForURL(/\/app\/console/, 45_000);
    }

    await expect(this.getConsoleHeading()).toBeVisible({ timeout: 30_000 });
  }

  isLoginSurface = async (): Promise<boolean> => {
    if (
      await this.getLoginButton()
        .isVisible({ timeout: 500 })
        .catch(() => false)
    ) {
      return true;
    }
    if (
      await this.getEmailInput()
        .isVisible({ timeout: 500 })
        .catch(() => false)
    ) {
      return true;
    }
    try {
      if (/\/login\/?$/i.test(new URL(this.page.url()).pathname)) return true;
    } catch {
      // ignore invalid URL
    }
    return false;
  };
}
