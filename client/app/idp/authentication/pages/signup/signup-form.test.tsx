import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { GRANT_TYPES } from "@blocks-idp/authentication/constants/authentication.constant";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "gsk" }));

const resetCaptcha = vi.fn();
vi.mock("@blocks-idp/captcha/hooks/use-captcha", () => ({
  useCaptcha: () => ({ code: "captcha-code", captcha: {}, reset: resetCaptcha }),
}));

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/authentication/hooks/use-auth", () => ({
  useSignupByEmail: () => ({ isPending, mutateAsync }),
}));

const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ showErrorToast: (...a: unknown[]) => showErrorToast(...a) }));
vi.mock("@/components/captcha", () => ({ Captcha: () => <div>captcha</div> }));
vi.mock("../login/sso-signin", () => ({ SsoSignin: () => <div data-testid="sso-signin" /> }));

import { SignupForm } from "./signup-form";

const loginOption = { allowedGrantTypes: [GRANT_TYPES.social] } as never;

function renderForm(props: Partial<Parameters<typeof SignupForm>[0]> = {}) {
  return render(
    <MemoryRouter>
      <SignupForm
        loginOption={loginOption}
        emailSignUpEnabled
        ssoSignUpEnabled={false}
        {...props}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  isPending = false;
});
afterEach(() => vi.clearAllMocks());

describe("SignupForm", () => {
  it("renders the email signup form with a terms checkbox", () => {
    renderForm();
    expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
    expect(screen.getByText(/I agree to the/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("renders the SSO option when enabled and social grants are allowed", () => {
    renderForm({ ssoSignUpEnabled: true });
    expect(screen.getByTestId("sso-signin")).toBeInTheDocument();
  });

  it("submits after email, captcha and terms are satisfied", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    renderForm();
    await user.type(screen.getByPlaceholderText("Enter your email"), "new@test.com");
    await user.click(screen.getByRole("checkbox"));
    const button = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ email: "new@test.com", captchaCode: "captcha-code" }),
      ),
    );
    expect(navigate).toHaveBeenCalledWith("/signup-email-sent?email=new@test.com");
  });

  it("shows an error toast and resets captcha when signup fails", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { email: "taken" } });
    renderForm();
    await user.type(screen.getByPlaceholderText("Enter your email"), "new@test.com");
    await user.click(screen.getByRole("checkbox"));
    const button = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { email: "taken" } }));
    expect(resetCaptcha).toHaveBeenCalled();
  });
});
