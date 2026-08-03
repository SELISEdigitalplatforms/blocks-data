import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateFolder = vi.fn();
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

vi.mock("@/storage/hooks/use-dms", () => ({
  useUpdateDmsFolder: () => ({ mutateAsync: updateFolder, isPending: false }),
}));

import { RenameFolderDialog } from "./rename-folder-dialog";

const folder = {
  itemId: "dir-1",
  name: "Old Name",
  type: "folder",
  inheritsParentAccess: true,
  isArchived: false,
  isActive: true,
  childFolderCount: 0,
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

describe("RenameFolderDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateFolder.mockResolvedValue({ folderId: "dir-1" });
  });

  it("seeds the input with the current name", () => {
    render(
      <RenameFolderDialog open onOpenChange={vi.fn()} folder={folder} />,
    );

    const input = screen.getByDisplayValue("Old Name") as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it("disables Save when the name is unchanged", () => {
    render(
      <RenameFolderDialog open onOpenChange={vi.fn()} folder={folder} />,
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("submits the rename and reports success", async () => {
    const onOpenChange = vi.fn();
    const onDone = vi.fn();
    render(
      <RenameFolderDialog open onOpenChange={onOpenChange} folder={folder} onDone={onDone} />,
    );

    const input = screen.getByDisplayValue("Old Name");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateFolder).toHaveBeenCalledWith({ folderId: "dir-1", name: "New Name" }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDone).toHaveBeenCalled();
  });

  it("reports an error when the rename fails", async () => {
    updateFolder.mockRejectedValue(new Error("boom"));
    render(
      <RenameFolderDialog open onOpenChange={vi.fn()} folder={folder} />,
    );

    const input = screen.getByDisplayValue("Old Name");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });
});
