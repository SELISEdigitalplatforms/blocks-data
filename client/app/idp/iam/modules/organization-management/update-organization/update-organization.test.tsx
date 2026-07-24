import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import type { IOrganization } from "@blocks-idp/iam/models/organization";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const mutateAsync = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/store/use-project-store", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-abc" } }),
}));
vi.mock("@blocks-idp/iam/hooks/use-organization", () => ({
  useSaveOrganization: () => ({ mutateAsync, isPending: false }),
}));

import { UpdateOrganization } from "./update-organization";

const org = { itemId: "org-1", name: "Alpha", isEnable: true } as IOrganization;

const renderDialog = () =>
  render(
    <Dialog open onOpenChange={() => {}}>
      <UpdateOrganization organization={org} isOpen />
    </Dialog>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({ isSuccess: true });
});

describe("UpdateOrganization", () => {
  it("prefills the current organization name", () => {
    renderDialog();
    expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument();
  });

  it("keeps Save disabled until the name is changed", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("renames the organization and reports success", async () => {
    const user = userEvent.setup();
    renderDialog();
    const name = screen.getByPlaceholderText("Enter organization name");
    await user.clear(name);
    await user.type(name, "Beta");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        projectKey: "tenant-abc",
        name: "Beta",
        itemId: "org-1",
        isEnable: true,
      }),
    );
    expect(showSuccessToast).toHaveBeenCalledWith({
      description: "Organization renamed successfully",
    });
  });

  it("shows an error toast when the save is unsuccessful", async () => {
    mutateAsync.mockResolvedValue({ isSuccess: false, errors: "bad" });
    const user = userEvent.setup();
    renderDialog();
    const name = screen.getByPlaceholderText("Enter organization name");
    await user.clear(name);
    await user.type(name, "Beta");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "bad" }));
  });

  it("maps a thrown error with an errors field", async () => {
    mutateAsync.mockRejectedValue({ errors: "boom" });
    const user = userEvent.setup();
    renderDialog();
    const name = screen.getByPlaceholderText("Enter organization name");
    await user.clear(name);
    await user.type(name, "Beta");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "boom" }));
  });
});
