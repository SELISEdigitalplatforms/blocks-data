import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctxValue = vi.hoisted(() => ({
  isTotpModalOpen: true,
  setIsTotpModalOpen: vi.fn(),
  mfaMethodType: 1,
  projectKey: "t1",
  userId: "u1",
}));
vi.mock("../../user-mfa", async () => {
  const React = await import("react");
  return { userMfaContext: React.createContext(ctxValue) };
});

const mutateAsync = vi.fn();
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useGenerateUserMfaOTP: () => ({ mutateAsync }),
}));

vi.mock("./user-mfa-verify-form", () => ({
  UserMfaVerifyForm: ({ mfaId }: { mfaId: string }) => <div data-testid="form">{mfaId}</div>,
}));
vi.mock("./user-mfa-verify-guideline-totp", () => ({
  UserMfaVerifyGuideLineTotp: () => <div data-testid="totp-guide" />,
}));
vi.mock("./user-mfa-verify-guideline-email", () => ({
  UserMfaVerifyGuideLineEmail: () => <div data-testid="email-guide" />,
}));

import { UserMFAVerify } from "./user-mfa-verify";

beforeEach(() => {
  ctxValue.isTotpModalOpen = true;
  ctxValue.mfaMethodType = 1;
});
afterEach(() => vi.clearAllMocks());

describe("UserMFAVerify", () => {
  it("generates an OTP on open and shows the totp guideline for type 1", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: true, mfaId: "mfa-123" });
    render(<UserMFAVerify />);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ projectKey: "t1", userId: "u1", mfaType: 1 }),
    );
    expect(screen.getByText("Set up your authenticator app")).toBeInTheDocument();
    expect(screen.getByTestId("totp-guide")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("form")).toHaveTextContent("mfa-123"));
  });

  it("shows the email guideline for non-authenticator types", async () => {
    ctxValue.mfaMethodType = 2;
    mutateAsync.mockResolvedValue({ isSuccess: true, mfaId: "mfa-2" });
    render(<UserMFAVerify />);
    await waitFor(() => expect(screen.getByTestId("email-guide")).toBeInTheDocument());
    expect(screen.queryByText("Set up your authenticator app")).not.toBeInTheDocument();
  });

  it("closes the modal when OTP generation is unsuccessful", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false });
    render(<UserMFAVerify />);
    await waitFor(() => expect(ctxValue.setIsTotpModalOpen).toHaveBeenCalledWith(false));
  });
});
