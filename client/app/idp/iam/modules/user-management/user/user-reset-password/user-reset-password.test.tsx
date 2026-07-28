import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const useGetUserById = vi.fn();
const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: (...a: unknown[]) => useGetUserById(...a),
}));
vi.mock("@blocks-idp/iam/hooks/use-account", () => ({
  useAccountRecover: () => ({ mutateAsync, isPending }),
}));
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

import { UserResetPassword } from "./user-reset-password";

function renderComp() {
  const setOpen = vi.fn();
  render(<UserResetPassword userId="u1" projectKey="pk" open setOpen={setOpen} />);
  return { setOpen };
}

afterEach(() => {
  vi.clearAllMocks();
  isPending = false;
});

describe("UserResetPassword", () => {
  it("renders the reset-password confirmation", () => {
    useGetUserById.mockReturnValue({ data: { data: { email: "a@b.com" } } });
    renderComp();
    expect(
      screen.getByText("Are you sure you want to reset the password for this user?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("sends the recovery email and shows success on success", async () => {
    const user = userEvent.setup();
    useGetUserById.mockReturnValue({ data: { data: { email: "a@b.com" } } });
    mutateAsync.mockResolvedValue({ isSuccess: true });
    const { setOpen } = renderComp();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        projectKey: "pk",
        email: "a@b.com",
        captchaCode: "",
      }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
    await waitFor(() => expect(setOpen).toHaveBeenCalledWith(false));
  });

  it("shows a fallback error toast when no email is available", async () => {
    const user = userEvent.setup();
    useGetUserById.mockReturnValue({ data: { data: { email: "" } } });
    renderComp();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows an error toast when the API reports failure", async () => {
    const user = userEvent.setup();
    useGetUserById.mockReturnValue({ data: { data: { email: "a@b.com" } } });
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { email: "bad" } });
    renderComp();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { email: "bad" } }));
  });
});
