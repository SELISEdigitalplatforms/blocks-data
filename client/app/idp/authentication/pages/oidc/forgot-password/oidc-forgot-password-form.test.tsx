import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const navigate = vi.fn();
const showErrorToast = vi.fn();
const accountRecover = vi.fn();
let isErr = false;

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("@/layouts/oidc-layout", () => ({
  useOIDCContext: () => ({ themeColor: "#123456", projectKey: "proj-1" }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("@blocks-idp/authentication/utils/oidc-utils", () => ({
  buildOIDCNavigationUrl: (p: string) => `${p}?ctx=1`,
}));
vi.mock("@blocks-idp/authentication/services/oidc-auth-flow.service", () => ({
  accountRecover: (...a: unknown[]) => accountRecover(...a),
}));

import { OidcForgotPasswordForm } from "./oidc-forgot-password-form";

const renderForm = () =>
  render(
    <MemoryRouter>
      <OidcForgotPasswordForm />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  accountRecover.mockResolvedValue({ isSuccess: true });
});

describe("OidcForgotPasswordForm", () => {
  it("renders the email field and login link", () => {
    renderForm();
    expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
  });

  it("keeps Continue disabled until a valid email is entered", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.type(screen.getByPlaceholderText("Enter your email"), "user@example.com");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
  });

  it("recovers the account and navigates to the confirmation page", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByPlaceholderText("Enter your email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(accountRecover).toHaveBeenCalledWith({
        email: "user@example.com",
        projectKey: "proj-1",
      }),
    );
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining("email=user%40example.com"),
    );
  });

  it("shows an error toast when recovery is unsuccessful", async () => {
    accountRecover.mockResolvedValue({ isSuccess: false, error: "nope" });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByPlaceholderText("Enter your email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "nope" }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("maps a thrown error with an errors field", async () => {
    isErr = true;
    accountRecover.mockRejectedValue({ errors: "boom" });
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByPlaceholderText("Enter your email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "boom" }));
  });
});
