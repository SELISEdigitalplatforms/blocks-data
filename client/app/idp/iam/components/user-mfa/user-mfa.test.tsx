import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const useGetMFAConfig = vi.fn();
const useConfigureUserMFA = vi.fn();
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useGetMFAConfig: (...a: unknown[]) => useGetMFAConfig(...a),
  useConfigureUserMFA: (...a: unknown[]) => useConfigureUserMFA(...a),
}));

const useGetUserById = vi.fn();
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: (...a: unknown[]) => useGetUserById(...a),
}));

vi.mock("./user-mfa-detail", () => ({ UserMFADetails: () => <div data-testid="mfa-details" /> }));

const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

import { UserMFA } from "./user-mfa";

const renderMfa = () =>
  render(
    <MemoryRouter>
      <UserMFA userId="u1" projectKey="pk" />
    </MemoryRouter>,
  );

afterEach(() => vi.clearAllMocks());

describe("UserMFA", () => {
  it("renders a loading skeleton while the config loads", () => {
    useGetMFAConfig.mockReturnValue({ isLoading: true, data: undefined });
    useGetUserById.mockReturnValue({ isLoading: false, isFetching: false, data: undefined });
    renderMfa();
    expect(screen.getByText("Multi-factor Authentication")).toBeInTheDocument();
    expect(screen.queryByTestId("mfa-details")).not.toBeInTheDocument();
  });

  it("prompts to enable MFA at the project level when disabled", () => {
    useGetMFAConfig.mockReturnValue({ isLoading: false, data: { enableMfa: false } });
    useGetUserById.mockReturnValue({ isLoading: false, isFetching: false, data: undefined });
    renderMfa();
    expect(screen.getByRole("link", { name: "Go to MFA Settings" })).toBeInTheDocument();
  });

  it("renders the user config and a Disable action when MFA is enabled for the user", () => {
    useGetMFAConfig.mockReturnValue({ isLoading: false, data: { enableMfa: true } });
    useGetUserById.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: { data: { mfaEnabled: true } },
    });
    useConfigureUserMFA.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
    renderMfa();
    expect(screen.getByTestId("mfa-details")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disable" })).toBeInTheDocument();
  });

  it("disables MFA and shows a success toast through the confirmation dialog", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({ isSuccess: true });
    useGetMFAConfig.mockReturnValue({ isLoading: false, data: { enableMfa: true } });
    useGetUserById.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: { data: { mfaEnabled: true } },
    });
    useConfigureUserMFA.mockReturnValue({ isPending: false, mutateAsync });
    renderMfa();

    await user.click(screen.getByRole("button", { name: "Disable" }));
    await user.click(await screen.findByRole("button", { name: "Yes" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        mfaEnabled: false,
        projectKey: "pk",
        userId: "u1",
        userMfaType: 0,
      }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("surfaces an error toast when disabling MFA fails", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({ isSuccess: false, errors: { m: "bad" } });
    useGetMFAConfig.mockReturnValue({ isLoading: false, data: { enableMfa: true } });
    useGetUserById.mockReturnValue({
      isLoading: false,
      isFetching: false,
      data: { data: { mfaEnabled: true } },
    });
    useConfigureUserMFA.mockReturnValue({ isPending: false, mutateAsync });
    renderMfa();

    await user.click(screen.getByRole("button", { name: "Disable" }));
    await user.click(await screen.findByRole("button", { name: "Yes" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { m: "bad" } }));
  });
});
