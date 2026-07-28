import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctxValue = vi.hoisted(() => ({
  isVerifyModalOpen: true,
  setIsVerifyModalOpen: vi.fn(),
  mfaMethodType: 1,
  projectKey: "t1",
  userId: "u1",
}));
vi.mock("../../profile-mfa", async () => {
  const React = await import("react");
  return { profileMfaContext: React.createContext(ctxValue) };
});

const mutateAsync = vi.fn();
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useGenerateUserMfaOTP: () => ({ mutateAsync }),
}));

vi.mock("./profile-mfa-verify-form", () => ({
  ProfileMfaVerifyForm: ({ mfaId }: { mfaId: string }) => <div data-testid="form">{mfaId}</div>,
}));
vi.mock("./profile-mfa-verify-guideline-totp", () => ({
  ProfileMfaVerifyGuideLineTotp: () => <div data-testid="totp-guide" />,
}));
vi.mock("./profile-mfa-verify-guideline-email", () => ({
  ProfileMfaVerifyGuideLineEmail: () => <div data-testid="email-guide" />,
}));

import { ProfileMFAVerify } from "./profile-mfa-verify";

beforeEach(() => {
  ctxValue.isVerifyModalOpen = true;
  ctxValue.mfaMethodType = 1;
});
afterEach(() => vi.clearAllMocks());

describe("ProfileMFAVerify", () => {
  it("generates an OTP on open and shows the totp guideline for type 1", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: true, mfaId: "mfa-1" });
    render(<ProfileMFAVerify />);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ projectKey: "t1", userId: "u1", mfaType: 1 }),
    );
    expect(screen.getByText("Set up your authenticator app")).toBeInTheDocument();
    expect(screen.getByTestId("totp-guide")).toBeInTheDocument();
  });

  it("shows the email guideline for non-authenticator types", async () => {
    ctxValue.mfaMethodType = 2;
    mutateAsync.mockResolvedValue({ isSuccess: true, mfaId: "mfa-2" });
    render(<ProfileMFAVerify />);
    await waitFor(() => expect(screen.getByTestId("email-guide")).toBeInTheDocument());
  });

  it("closes the modal when OTP generation is unsuccessful", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false, mfaId: "" });
    render(<ProfileMFAVerify />);
    await waitFor(() => expect(ctxValue.setIsVerifyModalOpen).toHaveBeenCalledWith(false));
  });
});
