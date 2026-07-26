import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));

const deletePermissions = vi.fn();
let isPending = false;
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useUserPermissions: () => ({ deletePermissions, isPending }),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import { DeleteUserPermission } from "./delete-user-permission";

const permission = { resource: "res-1" } as never;

function renderComp() {
  render(<DeleteUserPermission permission={permission} userId="u1" />);
}

afterEach(() => {
  vi.clearAllMocks();
  isPending = false;
});

describe("DeleteUserPermission", () => {
  it("opens the confirmation dialog from the remove icon", async () => {
    const user = userEvent.setup();
    renderComp();
    await user.click(document.querySelector("svg.lucide-x") as Element);
    expect(await screen.findByText("Exclude Permission")).toBeInTheDocument();
  });

  it("excludes the permission and shows a success toast", async () => {
    const user = userEvent.setup();
    deletePermissions.mockResolvedValue({ isSuccess: true });
    renderComp();
    await user.click(document.querySelector("svg.lucide-x") as Element);
    await user.click(await screen.findByRole("button", { name: "Yes" }));
    await waitFor(() => expect(deletePermissions).toHaveBeenCalledWith(["res-1"]));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("shows an error toast when the API reports failure", async () => {
    const user = userEvent.setup();
    deletePermissions.mockResolvedValue({ isSuccess: false });
    renderComp();
    await user.click(document.querySelector("svg.lucide-x") as Element);
    await user.click(await screen.findByRole("button", { name: "Yes" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });

  it("shows an error toast when the request throws", async () => {
    const user = userEvent.setup();
    deletePermissions.mockRejectedValue(new Error("boom"));
    renderComp();
    await user.click(document.querySelector("svg.lucide-x") as Element);
    await user.click(await screen.findByRole("button", { name: "Yes" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", title: "Error" }),
      ),
    );
  });
});
