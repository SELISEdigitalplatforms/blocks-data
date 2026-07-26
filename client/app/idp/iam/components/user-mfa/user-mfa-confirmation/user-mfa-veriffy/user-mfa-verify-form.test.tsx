import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctxValue = vi.hoisted(() => ({
  projectKey: "t1",
  userId: "u1",
  mfaMethodType: 2,
  setIsTotpModalOpen: vi.fn(),
}));
vi.mock("../../user-mfa", async () => {
  const React = await import("react");
  return { userMfaContext: React.createContext(ctxValue) };
});

const mutateAsync = vi.fn();
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useVerifyMfaOTP: () => ({ mutateAsync }),
}));

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

import { UserMfaVerifyForm } from "./user-mfa-verify-form";

beforeEach(() => {
  ctxValue.mfaMethodType = 2;
  // jsdom lacks elementFromPoint, which input-otp calls on focus.
  (document as unknown as { elementFromPoint: () => null }).elementFromPoint = () => null;
});
afterEach(() => vi.clearAllMocks());

describe("UserMfaVerifyForm", () => {
  it("renders the OTP inputs and action buttons", () => {
    render(<UserMfaVerifyForm mfaId="m1" />);
    expect(screen.getByRole("button", { name: "Verify" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("closes the modal when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<UserMfaVerifyForm mfaId="m1" />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(ctxValue.setIsTotpModalOpen).toHaveBeenCalledWith(false);
  });

  it("verifies the OTP and shows success on a valid code", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    render(<UserMfaVerifyForm mfaId="m1" />);
    await user.type(screen.getByRole("textbox"), "12345");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        mfaId: "m1",
        verificationCode: "12345",
        authType: 2,
        projectKey: "t1",
      }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
    expect(ctxValue.setIsTotpModalOpen).toHaveBeenCalledWith(false);
  });

  it("shows an error toast when verification is unsuccessful", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { code: "bad" } });
    render(<UserMfaVerifyForm mfaId="m1" />);
    await user.type(screen.getByRole("textbox"), "12345");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { code: "bad" } }));
  });

  it("renders six slots for authenticator (type 1)", () => {
    ctxValue.mfaMethodType = 1;
    const { container } = render(<UserMfaVerifyForm mfaId="m1" />);
    expect(container.querySelectorAll("input").length).toBeGreaterThan(0);
  });
});
