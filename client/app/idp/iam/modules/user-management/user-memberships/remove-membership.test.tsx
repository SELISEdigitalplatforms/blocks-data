import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IMembership } from "@blocks-idp/iam/models/user";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const mutateAsync = vi.fn();
let isErr = false;
let userData: unknown;

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: () => ({ data: userData }),
  useUpdateUser: () => ({ mutateAsync, isPending: false }),
}));

import { RemoveMembership } from "./remove-membership";

const props = () => ({
  open: true,
  onOpenChange: vi.fn(),
  membership: { organizationId: "org-2" } as IMembership,
  organizationName: "Beta Org",
  userId: "user-1",
  projectKey: "tenant-1",
  onSuccess: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  userData = {
    data: {
      itemId: "user-1",
      memberships: [{ organizationId: "org-1" }, { organizationId: "org-2" }],
    },
  };
  mutateAsync.mockResolvedValue({ isSuccess: true });
});

describe("RemoveMembership", () => {
  it("shows the organization name in the confirmation", () => {
    render(<RemoveMembership {...props()} />);
    expect(screen.getByText(/Beta Org/)).toBeInTheDocument();
  });

  it("cancels without mutating", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<RemoveMembership {...p} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("removes the targeted membership and reports success", async () => {
    const user = userEvent.setup();
    const p = props();
    render(<RemoveMembership {...p} />);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.memberships).toEqual([{ organizationId: "org-1" }]);
    expect(payload.itemId).toBe("user-1");
    expect(showSuccessToast).toHaveBeenCalled();
    expect(p.onSuccess).toHaveBeenCalled();
  });

  it("shows an error toast when the update is unsuccessful", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup();
    render(<RemoveMembership {...props()} />);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("maps a thrown error with an errors field", async () => {
    isErr = true;
    mutateAsync.mockRejectedValue({ errors: "boom" });
    const user = userEvent.setup();
    render(<RemoveMembership {...props()} />);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "boom" }));
  });

  it("falls back to a generic error otherwise", async () => {
    mutateAsync.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<RemoveMembership {...props()} />);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }),
    );
  });
});
