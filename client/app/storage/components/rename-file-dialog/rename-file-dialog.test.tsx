import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const renameFile = vi.fn();
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));

vi.mock("@/storage/hooks/use-dms", () => ({
  useRenameFile: () => ({ mutateAsync: renameFile, isPending: false }),
}));

import { RenameFileDialog } from "./rename-file-dialog";

const file = {
  itemId: "file-1",
  name: "old.txt",
  type: "file",
  inheritsParentAccess: true,
  isArchived: false,
  isActive: true,
  extension: "txt",
  sizeInBytes: 0,
  currentVersion: 1,
  permissions: {
    canView: true,
    canDownload: true,
    canEdit: true,
    canDelete: true,
    canManage: true,
    canOwner: true,
  },
} as never;

describe("RenameFileDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renameFile.mockResolvedValue({ fileId: "file-1" });
  });

  it("seeds the input with the current name", () => {
    render(<RenameFileDialog open onOpenChange={vi.fn()} file={file} />);

    const input = screen.getByDisplayValue("old.txt") as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it("disables Save when the name is unchanged", () => {
    render(<RenameFileDialog open onOpenChange={vi.fn()} file={file} />);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("submits the rename and reports success", async () => {
    const onOpenChange = vi.fn();
    const onDone = vi.fn();
    render(
      <RenameFileDialog open onOpenChange={onOpenChange} file={file} onDone={onDone} />,
    );

    const input = screen.getByDisplayValue("old.txt");
    fireEvent.change(input, { target: { value: "new.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(renameFile).toHaveBeenCalledWith({ fileId: "file-1", name: "new.txt" }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDone).toHaveBeenCalled();
  });

  it("reports an error when the rename fails", async () => {
    renameFile.mockRejectedValue(new Error("boom"));
    render(<RenameFileDialog open onOpenChange={vi.fn()} file={file} />);

    const input = screen.getByDisplayValue("old.txt");
    fireEvent.change(input, { target: { value: "new.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
  });
});
