import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const navigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: (key: string) => (key === "BLOCKS_GOOGLE_SITE_KEY" ? "gsk" : "x-key"),
}));

const resetCaptcha = vi.fn();
let captchaCode = "captcha-code";
vi.mock("@blocks-idp/captcha/hooks/use-captcha", () => ({
  useCaptcha: () => ({ captcha: {}, code: captchaCode, reset: resetCaptcha }),
}));

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/iam/hooks/use-account", () => ({
  useAccountRecover: () => ({ isPending, mutateAsync }),
}));

const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ showErrorToast: (...a: unknown[]) => showErrorToast(...a) }));
vi.mock("@/components/captcha", () => ({ Captcha: () => <div>captcha</div> }));

import { ForgotPasswordForm } from "./forgot-password-form";

const renderForm = () =>
  render(
    <MemoryRouter>
      <ForgotPasswordForm />
    </MemoryRouter>,
  );

beforeEach(() => {
  isPending = false;
  captchaCode = "captcha-code";
});
afterEach(() => vi.clearAllMocks());

describe("ForgotPasswordForm", () => {
  it("renders the email field and login link", () => {
    renderForm();
    expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("submits the recovery request and navigates to the confirmation page", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    renderForm();
    await user.type(screen.getByPlaceholderText("Enter your email"), "user@test.com");
    const button = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "user@test.com",
          captchaCode: "captcha-code",
          projectKey: "x-key",
        }),
      ),
    );
    expect(navigate).toHaveBeenCalledWith("/forgot-email-sent?email=user@test.com");
  });

  it("resets the captcha and shows an error toast when the API reports failure", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { email: "unknown" } });
    renderForm();
    await user.type(screen.getByPlaceholderText("Enter your email"), "user@test.com");
    const button = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { email: "unknown" } }));
    expect(resetCaptcha).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
