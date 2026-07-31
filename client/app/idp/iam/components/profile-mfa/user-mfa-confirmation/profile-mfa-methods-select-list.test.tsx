import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctxValue = vi.hoisted(() => ({
  userId: "u1",
  projectKey: "t1",
  showVerifyModal: vi.fn(),
  setIsDisableModalOpen: vi.fn(),
}));
vi.mock("../profile-mfa", async () => {
  const React = await import("react");
  return { profileMfaContext: React.createContext(ctxValue) };
});

let config: { data?: { userMfaType: number[] } };
let userData: { data: { userMfaType: number; isMfaVerified: boolean } } | undefined;
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useGetMFAConfig: () => config,
}));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: () => ({ data: userData }),
}));
vi.mock("./profile-mfa-veriffy", () => ({ ProfileMFAVerify: () => <div data-testid="verify" /> }));
vi.mock("./profile-mfa-confirmation-disable", () => ({
  UserMFAConfirmationDisable: () => <div data-testid="disable" />,
}));

import { ProfileMfaMethodSelectList } from "./profile-mfa-methods-select-list";

beforeEach(() => {
  config = { data: { userMfaType: [1, 2] } };
  userData = { data: { userMfaType: 2, isMfaVerified: true } };
});
afterEach(() => vi.clearAllMocks());

describe("ProfileMfaMethodSelectList", () => {
  it("renders the None option plus the available methods", () => {
    render(<ProfileMfaMethodSelectList />);
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Authenticator app")).toBeInTheDocument();
    expect(screen.getByTestId("verify")).toBeInTheDocument();
    expect(screen.getByTestId("disable")).toBeInTheDocument();
  });

  it("marks the active verified method with an Active badge", () => {
    render(<ProfileMfaMethodSelectList />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("opens the verify modal when enabling an inactive method", async () => {
    const user = userEvent.setup();
    render(<ProfileMfaMethodSelectList />);
    await user.click(screen.getByRole("button", { name: "Enable" }));
    expect(ctxValue.showVerifyModal).toHaveBeenCalledWith(1);
  });

  it("opens the disable modal from the None option", async () => {
    const user = userEvent.setup();
    render(<ProfileMfaMethodSelectList />);
    await user.click(screen.getByRole("button", { name: "Disable" }));
    expect(ctxValue.setIsDisableModalOpen).toHaveBeenCalledWith(true);
  });
});
