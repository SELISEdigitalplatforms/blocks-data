import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctxValue = vi.hoisted(() => ({
  projectKey: "t1",
  userId: "u1",
  enableTotpModal: true,
  showTotpModal: vi.fn(),
}));
vi.mock("../user-mfa", async () => {
  const React = await import("react");
  return { userMfaContext: React.createContext(ctxValue) };
});

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useConfigureUserMFA: () => ({ isPending, mutateAsync }),
}));

let userData: Record<string, unknown> | undefined;
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: () => ({ data: userData, isLoading: false, isFetching: false }),
}));

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  toast: (...a: unknown[]) => toast(...a),
}));

vi.mock("./user-mfa-methods-list", () => ({
  UserMFAMethodList: ({ setSelected }: { setSelected: (n: number) => void }) => (
    <button type="button" data-testid="pick" onClick={() => setSelected(1)}>
      pick
    </button>
  ),
}));

import { UserMFAConfirmationEnable } from "./user-mfa-confirmation-enable";

beforeEach(() => {
  isPending = false;
  userData = { data: { isVarified: true, active: true } };
});
afterEach(() => vi.clearAllMocks());

describe("UserMFAConfirmationEnable", () => {
  it("shows an info toast when the user is not verified", async () => {
    const user = userEvent.setup();
    userData = { data: { isVarified: false, active: true } };
    render(<UserMFAConfirmationEnable />);
    await user.click(screen.getByRole("button", { name: "Enable" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Please verify the user first" }));
  });

  it("shows an info toast when the user is not active", async () => {
    const user = userEvent.setup();
    userData = { data: { isVarified: true, active: false } };
    render(<UserMFAConfirmationEnable />);
    await user.click(screen.getByRole("button", { name: "Enable" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Please active the user first" }));
  });

  it("opens the dialog for a verified active user", async () => {
    const user = userEvent.setup();
    render(<UserMFAConfirmationEnable />);
    await user.click(screen.getByRole("button", { name: "Enable" }));
    expect(await screen.findByText("Enable MFA?")).toBeInTheDocument();
  });

  it("enables MFA, shows success and opens the totp modal", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    render(<UserMFAConfirmationEnable />);
    await user.click(screen.getByRole("button", { name: "Enable" }));
    await user.click(await screen.findByTestId("pick"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ mfaEnabled: true, projectKey: "t1", userId: "u1", userMfaType: 1 }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
    expect(ctxValue.showTotpModal).toHaveBeenCalledWith(1);
  });

  it("shows an error toast when the save is unsuccessful", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { x: "bad" } });
    render(<UserMFAConfirmationEnable />);
    await user.click(screen.getByRole("button", { name: "Enable" }));
    await user.click(await screen.findByTestId("pick"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { x: "bad" } }));
  });

  it("shows an error toast when the save throws", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue({ errors: { y: "boom" } });
    render(<UserMFAConfirmationEnable />);
    await user.click(screen.getByRole("button", { name: "Enable" }));
    await user.click(await screen.findByTestId("pick"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { y: "boom" } }));
  });
});
