import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

let queryState: { mfa_id: string; mfa_type: number } = { mfa_id: "m1", mfa_type: 0 };
vi.mock("nuqs", () => ({
  useQueryStates: () => [queryState, vi.fn()],
  parseAsString: { withDefault: () => ({}) },
  parseAsInteger: { withDefault: () => ({}) },
}));

vi.mock("@blocks-idp/authentication/hooks/use-auth", () => ({
  useVerifyMfa: () => ({ isPending: false }),
}));

const resend = vi.fn();
let remainingTime = 0;
vi.mock("@blocks-idp/mfa/hooks/use-resend-otp", () => ({
  useResendOtp: () => ({ remainingTime, resend }),
}));

const setAuthenticated = vi.fn();
vi.mock("@/store/use-auth-store", () => ({
  useAuthStore: () => ({ setAuthenticated }),
}));

import { MfaCheckFrom } from "./mfa-check-form";

// jsdom lacks elementFromPoint; input-otp schedules a timer that calls it.
if (!document.elementFromPoint) {
  (document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint =
    () => null;
}

const renderForm = () =>
  render(
    <MemoryRouter>
      <MfaCheckFrom />
    </MemoryRouter>,
  );

afterEach(() => {
  vi.clearAllMocks();
  queryState = { mfa_id: "m1", mfa_type: 0 };
  remainingTime = 0;
});

describe("MfaCheckFrom", () => {
  it("renders the OTP input with a disabled verify button initially", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Resend Otp/ })).not.toBeInTheDocument();
  });

  it("shows the resend button for email OTP (type 2) with a countdown", () => {
    queryState = { mfa_id: "m1", mfa_type: 2 };
    remainingTime = 65;
    renderForm();
    const resendBtn = screen.getByRole("button", { name: /Resend Otp/ });
    expect(resendBtn).toBeDisabled();
    expect(resendBtn).toHaveTextContent("1:05");
  });

  it("resends the OTP when the countdown has elapsed", async () => {
    const user = userEvent.setup();
    queryState = { mfa_id: "m1", mfa_type: 2 };
    remainingTime = 0;
    renderForm();
    await user.click(screen.getByRole("button", { name: /Resend Otp/ }));
    expect(resend).toHaveBeenCalled();
  });

  it("authenticates and navigates to the console after entering a full code", async () => {
    const user = userEvent.setup();
    queryState = { mfa_id: "m1", mfa_type: 1 };
    const { container } = renderForm();
    const otpInput = container.querySelector("input");
    await user.type(otpInput as HTMLElement, "123456");
    const verify = screen.getByRole("button", { name: "Verify" });
    await waitFor(() => expect(verify).toBeEnabled());
    await user.click(verify);
    await waitFor(() => expect(setAuthenticated).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith("/console");
  });
});
