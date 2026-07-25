import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let userData: { data: { mfaEnabled: boolean; active: boolean } } | undefined;
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: () => ({ data: userData }),
}));

vi.mock("./user-reset-password", () => ({
  UserResetPassword: ({ open }: { open: boolean }) =>
    open ? <div data-testid="reset-password" /> : null,
}));
vi.mock("./user-resend-activation/user-resend-activation", () => ({
  UserResendActivationMail: ({ open }: { open: boolean }) =>
    open ? <div data-testid="resend-activation" /> : null,
}));
vi.mock("./user-deactivate/user-deactivate", () => ({
  UserDeactivate: ({ open }: { open: boolean }) =>
    open ? <div data-testid="deactivate" /> : null,
}));
vi.mock("../update-user", () => ({
  UpdateUser: () => <div data-testid="update-user" />,
}));
vi.mock("./user-disable-mfa", () => ({
  UserDisableMFA: ({ open }: { open: boolean }) =>
    open ? <div data-testid="disable-mfa" /> : null,
}));

import { UserActionMenu } from "./user-action-menu";

beforeEach(() => {
  // jsdom lacks the Pointer Capture APIs that Radix menus call on open.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  vi.clearAllMocks();
  userData = { data: { mfaEnabled: true, active: true } };
});

describe("UserActionMenu", () => {
  it("renders the trigger and update-user action", () => {
    render(<UserActionMenu id="u1" projectKey="t1" />);
    expect(screen.getByTestId("update-user")).toBeInTheDocument();
  });

  it("opens the resend-activation modal from the menu", async () => {
    const user = userEvent.setup();
    render(<UserActionMenu id="u1" projectKey="t1" />);
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Resend Activation"));
    expect(await screen.findByTestId("resend-activation")).toBeInTheDocument();
  });

  it("opens the reset-password modal from the menu", async () => {
    const user = userEvent.setup();
    render(<UserActionMenu id="u1" projectKey="t1" />);
    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByText("Reset Password"));
    expect(await screen.findByTestId("reset-password")).toBeInTheDocument();
  });
});
