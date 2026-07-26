import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const useConfigureUserMFA = vi.fn();
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useConfigureUserMFA: (...a: unknown[]) => useConfigureUserMFA(...a),
}));

const useGetUserById = vi.fn();
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: (...a: unknown[]) => useGetUserById(...a),
}));

const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ showErrorToast: (...a: unknown[]) => showErrorToast(...a) }));

vi.mock("./profile-mfa-methods-list", () => ({
  ProfileMFAMethodList: ({ setSelected }: { setSelected: (v: number) => void }) => (
    <button data-testid="pick-method" onClick={() => setSelected(2)}>
      pick
    </button>
  ),
}));

import { ProfileMFAConfigManage } from "./profile-mfa-config-manage";
import { profileMfaContext } from "../profile-mfa";

const showVerifyModal = vi.fn();
const contextValue = {
  projectKey: "pk",
  userId: "u1",
  isVerifyModalOpen: false,
  setIsVerifyModalOpen: vi.fn(),
  isDisableModalOpen: false,
  setIsDisableModalOpen: vi.fn(),
  showVerifyModal,
  mfaMethodType: 0,
};

function renderManage() {
  render(
    <profileMfaContext.Provider value={contextValue}>
      <ProfileMFAConfigManage />
    </profileMfaContext.Provider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("ProfileMFAConfigManage", () => {
  it("opens the switch dialog from the Switch trigger", async () => {
    const user = userEvent.setup();
    useConfigureUserMFA.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
    useGetUserById.mockReturnValue({
      data: { data: { userMfaType: 1, isMfaVerified: true } },
      isLoading: false,
      isFetching: false,
    });
    renderManage();
    await user.click(screen.getByRole("button", { name: /Switch/ }));
    expect(await screen.findByText("Switch MFA?")).toBeInTheDocument();
  });

  it("saves the newly selected method and opens the verify modal", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({ isSuccess: true });
    useConfigureUserMFA.mockReturnValue({ isPending: false, mutateAsync });
    useGetUserById.mockReturnValue({
      data: { data: { userMfaType: 1, isMfaVerified: true } },
      isLoading: false,
      isFetching: false,
    });
    renderManage();
    await user.click(screen.getByRole("button", { name: /Switch/ }));
    await user.click(await screen.findByTestId("pick-method"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        mfaEnabled: true,
        projectKey: "pk",
        userId: "u1",
        userMfaType: 2,
      }),
    );
    expect(showVerifyModal).toHaveBeenCalledWith(2);
  });

  it("shows an error toast when the switch fails", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({ isSuccess: false, errors: { t: "bad" } });
    useConfigureUserMFA.mockReturnValue({ isPending: false, mutateAsync });
    useGetUserById.mockReturnValue({
      data: { data: { userMfaType: 1, isMfaVerified: true } },
      isLoading: false,
      isFetching: false,
    });
    renderManage();
    await user.click(screen.getByRole("button", { name: /Switch/ }));
    await user.click(await screen.findByTestId("pick-method"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { t: "bad" } }));
  });
});
