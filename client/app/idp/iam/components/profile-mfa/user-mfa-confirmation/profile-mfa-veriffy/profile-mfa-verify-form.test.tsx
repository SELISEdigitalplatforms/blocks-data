import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui-kits/dialog/dialog";

const ctxValue = vi.hoisted(() => ({
  projectKey: "t1",
  userId: "u1",
  mfaMethodType: 2,
  setIsVerifyModalOpen: vi.fn(),
}));
vi.mock("../../profile-mfa", async () => {
  const React = await import("react");
  return { profileMfaContext: React.createContext(ctxValue) };
});

const mutateAsync = vi.fn();
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useVerifyMfaOTP: () => ({ mutateAsync, isPending: false }),
}));

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

import { ProfileMfaVerifyForm } from "./profile-mfa-verify-form";

const renderForm = () =>
  render(
    <Dialog open>
      <ProfileMfaVerifyForm mfaId="m1" />
    </Dialog>,
  );

beforeEach(() => {
  (document as unknown as { elementFromPoint: () => null }).elementFromPoint = () => null;
});
afterEach(() => vi.clearAllMocks());

describe("ProfileMfaVerifyForm", () => {
  it("verifies a valid OTP and shows success", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true, isValid: true });
    renderForm();
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
    expect(ctxValue.setIsVerifyModalOpen).toHaveBeenCalledWith(false);
  });

  it("shows an error when the response is unsuccessful", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { code: "bad" } });
    renderForm();
    await user.type(screen.getByRole("textbox"), "12345");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { code: "bad" } }));
  });

  it("shows an error when the code is not valid", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true, isValid: false });
    renderForm();
    await user.type(screen.getByRole("textbox"), "12345");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "Code is not valid" }));
  });

  it("shows a generic error when the mutation throws without errors", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error("network"));
    renderForm();
    await user.type(screen.getByRole("textbox"), "12345");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }));
  });
});
