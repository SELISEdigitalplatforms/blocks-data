import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

const mutateAsync = vi.fn();
vi.mock("@blocks-idp/iam/hooks/use-account", () => ({
  useAccountResendActivation: () => ({ mutateAsync, isPending: false }),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { UserResendActivationMail } from "./user-resend-activation";

afterEach(() => vi.clearAllMocks());

describe("UserResendActivationMail", () => {
  it("renders the confirmation dialog when open", () => {
    render(<UserResendActivationMail userId="u1" open setOpen={vi.fn()} />);
    expect(screen.getByText(/resend the activation email/i)).toBeInTheDocument();
  });

  it("resends the activation email and shows a success toast", async () => {
    const user = userEvent.setup();
    const setOpen = vi.fn();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    render(<UserResendActivationMail userId="u1" open setOpen={setOpen} />);
    await user.click(screen.getByRole("button", { name: "Resend" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ projectKey: "t1", userId: "u1" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("shows an error toast when resending throws", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error("boom"));
    render(<UserResendActivationMail userId="u1" open setOpen={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Resend" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
  });
});
