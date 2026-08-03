import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { useEffect } from "react";

const navigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: (key: string) => (key === "BLOCKS_GOOGLE_SITE_KEY" ? "gsk" : "x-key"),
}));

const resetCaptcha = vi.fn();
vi.mock("@blocks-idp/captcha/hooks/use-captcha", () => ({
  useCaptcha: () => ({ captcha: {}, code: "captcha-code", reset: resetCaptcha }),
}));

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/iam/hooks/use-account", () => ({
  useAccountActivation: () => ({ isPending, mutateAsync }),
}));

const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ showErrorToast: (...a: unknown[]) => showErrorToast(...a) }));
vi.mock("@/components/captcha", () => ({ Captcha: () => <div>captcha</div> }));

vi.mock("../../components/password-strength-checker/password-strength-checker", () => ({
  PasswordStrengthChecker: ({
    onRequirementsMet,
  }: {
    onRequirementsMet: (v: boolean) => void;
  }) => {
    useEffect(() => onRequirementsMet(true), [onRequirementsMet]);
    return <div>strength-checker</div>;
  },
}));

import { ActivationForm } from "./activation-form";

const renderForm = (code = "activation-code") =>
  render(
    <MemoryRouter>
      <ActivationForm code={code} />
    </MemoryRouter>,
  );

beforeEach(() => {
  isPending = false;
});
afterEach(() => vi.clearAllMocks());

describe("ActivationForm", () => {
  it("renders the name and password fields", () => {
    renderForm();
    expect(screen.getByText("First Name")).toBeInTheDocument();
    expect(screen.getByText("Last Name")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Confirm Password")).toBeInTheDocument();
    expect(screen.getByText("strength-checker")).toBeInTheDocument();
  });

  it("redirects to login when there is no activation code", () => {
    renderForm("");
    expect(navigate).toHaveBeenCalledWith("/login");
  });

  it("activates the account and navigates to the success page", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    const { container } = renderForm();
    await user.type(screen.getByRole("textbox", { name: /First Name/i }), "Jane");
    await user.type(screen.getByRole("textbox", { name: /Last Name/i }), "Doe");
    const passwords = container.querySelectorAll("input[type='password']");
    await user.type(passwords[0] as HTMLElement, "Passw0rd1");
    await user.type(passwords[1] as HTMLElement, "Passw0rd1");

    const button = screen.getByRole("button", { name: "Activate BTN" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "activation-code",
          firstname: "Jane",
          lastname: "Doe",
          password: "Passw0rd1",
          captchaCode: "captcha-code",
          projectKey: "x-key",
        }),
      ),
    );
    expect(navigate).toHaveBeenCalledWith("/activate-success");
  });

  it("resets the captcha and shows an error toast when activation fails", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { code: "expired" } });
    const { container } = renderForm();
    await user.type(screen.getByRole("textbox", { name: /First Name/i }), "Jane");
    await user.type(screen.getByRole("textbox", { name: /Last Name/i }), "Doe");
    const passwords = container.querySelectorAll("input[type='password']");
    await user.type(passwords[0] as HTMLElement, "Passw0rd1");
    await user.type(passwords[1] as HTMLElement, "Passw0rd1");

    const button = screen.getByRole("button", { name: "Activate BTN" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { code: "expired" } }));
    expect(resetCaptcha).toHaveBeenCalled();
  });
});
