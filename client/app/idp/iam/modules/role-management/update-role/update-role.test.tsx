import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import type { IRole } from "@blocks-idp/iam/models/role";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const toast = vi.fn();
const mutateAsync = vi.fn();
let isErr = false;

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  useToast: () => ({ toast }),
}));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { itemId: "proj-1" } }),
}));
vi.mock("@blocks-idp/iam/hooks/use-roles", () => ({
  useUpdateRole: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));

import { UpdateRole } from "./update-role";

const role = { itemId: "role-1", name: "Admin", description: "Full access", slug: "admin" } as IRole;

const renderDialog = () =>
  render(
    <Dialog open onOpenChange={() => {}}>
      <UpdateRole role={role} isOpen onClose={vi.fn()} />
    </Dialog>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  mutateAsync.mockResolvedValue({ isSuccess: true });
});

describe("UpdateRole", () => {
  it("prefills the name and description from the role", () => {
    renderDialog();
    expect(screen.getByDisplayValue("Admin")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Full access")).toBeInTheDocument();
  });

  it("keeps Update disabled until the form is dirty", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();
  });

  it("submits the edited role and reports success", async () => {
    const user = userEvent.setup();
    renderDialog();
    const name = screen.getByPlaceholderText("Enter name");
    await user.clear(name);
    await user.type(name, "Editor");
    await user.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.name).toBe("Editor");
    expect(payload.projectKey).toBe("proj-1");
    expect(payload.itemId).toBe("role-1");
    expect(showSuccessToast).toHaveBeenCalledWith({ description: "Role updated successfully" });
  });

  it("shows an error toast when the update throws with an errors field", async () => {
    isErr = true;
    mutateAsync.mockRejectedValue({ errors: "boom" });
    const user = userEvent.setup();
    renderDialog();
    const name = screen.getByPlaceholderText("Enter name");
    await user.clear(name);
    await user.type(name, "Editor");
    await user.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "boom" }));
  });
});
