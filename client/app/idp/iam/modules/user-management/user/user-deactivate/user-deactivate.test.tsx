import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

const mutateAsync = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/iam/hooks/use-account", () => ({
  useAccountDeactivate: () => ({ mutateAsync, isPending }),
}));

const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

import { UserDeactivate } from "./user-deactivate";

afterEach(() => {
  vi.clearAllMocks();
  isPending = false;
});

function renderComp() {
  const setOpen = vi.fn();
  render(<UserDeactivate userId="u1" open setOpen={setOpen} />);
  return { setOpen };
}

describe("UserDeactivate", () => {
  it("renders the confirmation dialog when open", () => {
    renderComp();
    expect(
      screen.getByText("Are you sure you want to deactivate this user?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
  });

  it("deactivates the user and shows a success toast on success", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: true });
    const { setOpen } = renderComp();

    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ projectKey: "tenant-1", userId: "u1" }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
    await waitFor(() => expect(setOpen).toHaveBeenCalledWith(false));
  });

  it("shows an error toast when the API reports failure", async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: { u: "bad" } });
    renderComp();
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: { u: "bad" } }));
  });

  it("shows a fallback error toast when the request throws", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue("weird");
    const { setOpen } = renderComp();
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something went wrong" }),
    );
    await waitFor(() => expect(setOpen).toHaveBeenCalledWith(false));
  });
});
