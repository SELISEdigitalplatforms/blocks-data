import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ theme: "light" }) }));

let runtime: Record<string, string> = {};
vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: (key: string) => runtime[key],
}));

const setAuthenticated = vi.fn();
const setTokens = vi.fn();
vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: () => ({ setAuthenticated, setTokens }),
}));

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/authentication/hooks/use-auth", () => ({
  useSigninByEmail: () => ({ isPending, mutateAsync }),
}));

const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ showErrorToast: (...a: unknown[]) => showErrorToast(...a) }));
vi.mock("@/components/captcha", () => ({ Captcha: () => <div>captcha</div> }));

import { SigninForm } from "./signin-form";

const renderForm = () =>
  render(
    <MemoryRouter>
      <SigninForm />
    </MemoryRouter>,
  );

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("Enter your email"), "user@test.com");
  await user.type(screen.getByPlaceholderText("Enter your password"), "secret");
}

beforeEach(() => {
  runtime = { BLOCKS_DATA_BASE_URL: "https://api.test", BLOCKS_GOOGLE_SITE_KEY: "gsk" };
  isPending = false;
});
afterEach(() => vi.clearAllMocks());

describe("SigninForm", () => {
  it("renders the email/password fields and forgot-password link", () => {
    renderForm();
    expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your password")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("authenticates and navigates to the console on success", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ enable_mfa: false });
    renderForm();
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ username: "user@test.com", password: "secret" }),
    );
    expect(setAuthenticated).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/console");
  });

  it("stores tokens on localhost before navigating", async () => {
    const user = userEvent.setup();
    runtime.BLOCKS_DATA_BASE_URL = "http://localhost:4000";
    mutateAsync.mockResolvedValue({
      enable_mfa: false,
      access_token: "at",
      refresh_token: "rt",
    });
    renderForm();
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(setTokens).toHaveBeenCalledWith("at", "rt"));
  });

  it("redirects to the MFA check when MFA is enabled", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ enable_mfa: true, mfaId: "m1", mfaType: "totp" });
    renderForm();
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/mfa-check?mfa_id=m1&mfa_type=totp"),
    );
    expect(setAuthenticated).not.toHaveBeenCalled();
  });

  it("surfaces a server error description via toast", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue({ errors: { error_description: "Bad credentials" } });
    renderForm();
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Bad credentials" }),
    );
  });
});
