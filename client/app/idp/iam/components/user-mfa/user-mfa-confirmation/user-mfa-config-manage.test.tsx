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

const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

vi.mock("./user-mfa-methods-list", () => ({
  UserMFAMethodList: ({
    setSelected,
  }: {
    selected: number;
    setSelected: (v: number) => void;
  }) => (
    <button data-testid="pick-method" onClick={() => setSelected(2)}>
      pick
    </button>
  ),
}));

import { UserMFAConfigManage } from "./user-mfa-config-manage";
import { userMfaContext } from "../user-mfa";

const contextValue = {
  projectKey: "pk",
  userId: "u1",
  isTotpModalOpen: false,
  setIsTotpModalOpen: vi.fn(),
  showTotpModal: vi.fn(),
  mfaMethodType: 0,
};

const renderManage = () =>
  render(
    <userMfaContext.Provider value={contextValue}>
      <UserMFAConfigManage />
    </userMfaContext.Provider>,
  );

afterEach(() => vi.clearAllMocks());

describe("UserMFAConfigManage", () => {
  it("hides the Save button while the selected type matches the saved type", () => {
    useConfigureUserMFA.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
    useGetUserById.mockReturnValue({
      data: { data: { userMfaType: 0 } },
      isLoading: false,
      isFetching: false,
    });
    renderManage();
    expect(screen.getByTestId("pick-method")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("saves the newly selected MFA method and shows success", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({ isSuccess: true });
    useConfigureUserMFA.mockReturnValue({ isPending: false, mutateAsync });
    useGetUserById.mockReturnValue({
      data: { data: { userMfaType: 1 } },
      isLoading: false,
      isFetching: false,
    });
    renderManage();

    await user.click(screen.getByTestId("pick-method"));
    const save = await screen.findByRole("button", { name: "Save" });
    await user.click(save);

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        mfaEnabled: true,
        projectKey: "pk",
        userId: "u1",
        userMfaType: 2,
      }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("shows an error toast when the save fails", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({ isSuccess: false, errors: { t: "bad" } });
    useConfigureUserMFA.mockReturnValue({ isPending: false, mutateAsync });
    useGetUserById.mockReturnValue({
      data: { data: { userMfaType: 1 } },
      isLoading: false,
      isFetching: false,
    });
    renderManage();
    await user.click(screen.getByTestId("pick-method"));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { t: "bad" } }));
  });
});
