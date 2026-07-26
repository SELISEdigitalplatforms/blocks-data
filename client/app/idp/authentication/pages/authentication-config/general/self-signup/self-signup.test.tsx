import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

const useGetAuthConfig = vi.fn();
const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/authentication/hooks/use-auth-config", () => ({
  useGetAuthConfig: (...a: unknown[]) => useGetAuthConfig(...a),
  useSaveAuthConfig: () => ({ mutateAsync, isPending }),
}));

const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

import { SelfSignup } from "./self-signup";

afterEach(() => {
  vi.clearAllMocks();
  isPending = false;
});

describe("SelfSignup", () => {
  it("renders a loading skeleton while the config loads", () => {
    useGetAuthConfig.mockReturnValue({ data: undefined, isLoading: true });
    render(<SelfSignup />);
    expect(screen.getByText("Self Sign-Up")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders the checkbox and disabled save once loaded", () => {
    useGetAuthConfig.mockReturnValue({ data: { isSelfSignUpAllowed: false }, isLoading: false });
    render(<SelfSignup />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves the setting and shows success after toggling", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    useGetAuthConfig.mockReturnValue({ data: { isSelfSignUpAllowed: false }, isLoading: false });
    render(<SelfSignup />);
    await user.click(screen.getByRole("checkbox"));
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ isSelfSignUpAllowed: true, projectKey: "tenant-1" }),
      ),
    );
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("shows an error toast when the save fails", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { x: "bad" } });
    useGetAuthConfig.mockReturnValue({ data: { isSelfSignUpAllowed: false }, isLoading: false });
    render(<SelfSignup />);
    await user.click(screen.getByRole("checkbox"));
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { x: "bad" } }));
  });
});
