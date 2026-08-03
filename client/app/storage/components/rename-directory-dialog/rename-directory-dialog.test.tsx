import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateDirectory = vi.fn();
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

vi.mock("@/storage/hooks/use-dms", () => ({
  useUpdateDmsDirectory: () => ({ mutateAsync: updateDirectory, isPending: false }),
}));

import { RenameDirectoryDialog } from "./rename-directory-dialog";

const directory = {
  itemId: "dir-1",
  name: "Old Name",
  type: "directory",
  inheritsParentAccess: true,
  isArchived: false,
  isActive: true,
  childDirectoryCount: 0,
  childFileCount: 0,
  sizeInBytes: 0,
  permissions: {
    canView: true,
    canDownload: true,
    canEdit: true,
    canDelete: true,
    canManage: true,
    canOwner: true,
  },
} as never;

describe("RenameDirectoryDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateDirectory.mockResolvedValue({ directoryId: "dir-1" });
  });

  it("seeds the input with the current name", () => {
    render(
      <RenameDirectoryDialog open onOpenChange={vi.fn()} directory={directory} />,
    );

    const input = screen.getByDisplayValue("Old Name") as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it("disables Save when the name is unchanged", () => {
    render(
      <RenameDirectoryDialog open onOpenChange={vi.fn()} directory={directory} />,
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("submits the rename and reports success", async () => {
    const onOpenChange = vi.fn();
    const onDone = vi.fn();
    render(
      <RenameDirectoryDialog open onOpenChange={onOpenChange} directory={directory} onDone={onDone} />,
    );

    const input = screen.getByDisplayValue("Old Name");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateDirectory).toHaveBeenCalledWith({ directoryId: "dir-1", name: "New Name" }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDone).toHaveBeenCalled();
  });

  it("reports an error when the rename fails", async () => {
    updateDirectory.mockRejectedValue(new Error("boom"));
    render(
      <RenameDirectoryDialog open onOpenChange={vi.fn()} directory={directory} />,
    );

    const input = screen.getByDisplayValue("Old Name");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });
});
