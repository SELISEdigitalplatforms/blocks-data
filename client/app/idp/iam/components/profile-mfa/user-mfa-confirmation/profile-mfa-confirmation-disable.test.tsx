import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// profile-mfa reads the runtime environment on import, so the context is stubbed here
// rather than imported, matching the enable-side suite next to this one.
const ctxValue = vi.hoisted(() => ({
  projectKey: "tg-1",
  userId: "u1",
  isDisableModalOpen: true,
  setIsDisableModalOpen: vi.fn(),
}));
vi.mock("../profile-mfa", async () => {
  const React = await import("react");
  return { profileMfaContext: React.createContext(ctxValue) };
});

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useDisableMfa: () => ({ isPending, mutateAsync }),
}));

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

import { UserMFAConfirmationDisable } from "./profile-mfa-confirmation-disable";

const confirm = () => screen.getByRole("button", { name: "Yes" });

beforeEach(() => {
  isPending = false;
  ctxValue.isDisableModalOpen = true;
  mutateAsync.mockResolvedValue({ isSuccess: true });
});
afterEach(() => vi.clearAllMocks());

describe("UserMFAConfirmationDisable", () => {
  it("should warn that disabling reduces account security", () => {
    render(<UserMFAConfirmationDisable />);

    expect(screen.getByText("Disable MFA?")).toBeTruthy();
    expect(screen.getByText(/may reduce the security of this account/)).toBeTruthy();
  });

  it("should render nothing while closed", () => {
    ctxValue.isDisableModalOpen = false;

    render(<UserMFAConfirmationDisable />);

    expect(screen.queryByText("Disable MFA?")).toBeNull();
  });

  it("should disable MFA for the user in the current project and close on success", async () => {
    render(<UserMFAConfirmationDisable />);

    await userEvent.click(confirm());

    expect(mutateAsync).toHaveBeenCalledWith({ projectKey: "tg-1", userId: "u1" });
    expect(showSuccessToast).toHaveBeenCalledWith({
      description: "MFA disabled successfully",
    });
    expect(ctxValue.setIsDisableModalOpen).toHaveBeenCalledWith(false);
  });

  it("should keep the dialog open when the server refuses", async () => {
    // A refusal comes back as a normal response, not a rejection, so closing here would
    // tell the user MFA is off when it is still on.
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { mfa: ["still enrolled"] } });
    render(<UserMFAConfirmationDisable />);

    await userEvent.click(confirm());

    expect(showErrorToast).toHaveBeenCalledWith({ errors: { mfa: ["still enrolled"] } });
    expect(showSuccessToast).not.toHaveBeenCalled();
    expect(ctxValue.setIsDisableModalOpen).not.toHaveBeenCalled();
  });

  it("should report a thrown error that carries field errors", async () => {
    mutateAsync.mockRejectedValue({ errors: { mfa: ["network"] } });
    render(<UserMFAConfirmationDisable />);

    await userEvent.click(confirm());

    expect(showErrorToast).toHaveBeenCalledWith({ errors: { mfa: ["network"] } });
    expect(ctxValue.setIsDisableModalOpen).not.toHaveBeenCalled();
  });

  it("should swallow a thrown error with no field errors rather than surfacing an empty toast", async () => {
    mutateAsync.mockRejectedValue(new Error("boom"));
    render(<UserMFAConfirmationDisable />);

    await userEvent.click(confirm());

    expect(showErrorToast).not.toHaveBeenCalled();
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("should block both buttons while the request is in flight", () => {
    isPending = true;

    render(<UserMFAConfirmationDisable />);

    expect((screen.getByRole("button", { name: "Processing" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
