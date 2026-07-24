import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const resetCaptcha = vi.fn();
const mutateAsync = vi.fn();

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: (key: string) => (key === "BLOCKS_GOOGLE_SITE_KEY" ? "site-key" : "x-key"),
}));
vi.mock("@blocks-idp/captcha/hooks/use-captcha", () => ({
  useCaptcha: () => ({ captcha: {}, code: "", reset: resetCaptcha }),
}));
vi.mock("@blocks-idp/iam/hooks/use-account", () => ({
  useAccountResetPassword: () => ({ isPending: false, mutateAsync }),
}));
vi.mock("@blocks-idp/authentication/components/password-strength-checker/password-strength-checker", () => ({
  PasswordStrengthChecker: () => <div>strength-checker</div>,
}));
vi.mock("@/components/captcha", () => ({ Captcha: () => <div>captcha</div> }));

import { ResetPasswordForm } from "./reset-password-form";

const renderForm = () =>
  render(
    <MemoryRouter>
      <ResetPasswordForm code="reset-code" />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({ isSuccess: true });
});

describe("ResetPasswordForm", () => {
  it("renders the password fields and strength checker", () => {
    renderForm();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Confirm Password")).toBeInTheDocument();
    expect(screen.getByText("strength-checker")).toBeInTheDocument();
  });

  it("keeps the submit disabled until captcha and requirements are satisfied", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Reset Password" })).toBeDisabled();
  });

  it("accepts typing into the password inputs", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();
    const inputs = container.querySelectorAll("input[type='password']");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    await user.type(inputs[0] as HTMLElement, "Passw0rd!");
    expect((inputs[0] as HTMLInputElement).value).toBe("Passw0rd!");
  });
});
