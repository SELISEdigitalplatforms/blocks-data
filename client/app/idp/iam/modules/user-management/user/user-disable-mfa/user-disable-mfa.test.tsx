import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
vi.mock("@blocks-idp/mfa/hooks/use-mfa-config", () => ({
  useDisableMfa: () => ({ mutateAsync, isPending: false }),
}));

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

import { UserDisableMFA } from "./user-disable-mfa";

afterEach(() => vi.clearAllMocks());

describe("UserDisableMFA", () => {
  it("renders the disable-MFA confirmation when open", () => {
    render(<UserDisableMFA userId="u1" projectKey="t1" open setOpen={vi.fn()} />);
    expect(screen.getByText("Disable MFA?")).toBeInTheDocument();
  });

  it("disables MFA and shows success", async () => {
    const user = userEvent.setup();
    const setOpen = vi.fn();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    render(<UserDisableMFA userId="u1" projectKey="t1" open setOpen={setOpen} />);
    await user.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ projectKey: "t1", userId: "u1" }));
    expect(showSuccessToast).toHaveBeenCalled();
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("shows an error toast when the disable is unsuccessful", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { mfa: "bad" } });
    render(<UserDisableMFA userId="u1" projectKey="t1" open setOpen={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { mfa: "bad" } }));
  });

  it("shows an error toast when the mutation throws with errors", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue({ errors: { mfa: "boom" } });
    render(<UserDisableMFA userId="u1" projectKey="t1" open setOpen={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { mfa: "boom" } }));
  });
});
