import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  items: [] as unknown[],
  restore: vi.fn(),
  permanentDelete: vi.fn(),
  fetchNextPage: vi.fn(),
  lastTrashQuery: {} as { type?: string },
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: mocks.showSuccessToast,
  showErrorToast: mocks.showErrorToast,
  showInfoToast: vi.fn(),
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("../../hooks/use-dms", () => ({
  useDmsTrash: (query: { type?: string } = {}) => {
    mocks.lastTrashQuery = query;
    return {
      data: { pages: [{ items: mocks.items, totalChildCount: mocks.items.length, hasMore: false }] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mocks.fetchNextPage,
    };
  },
  useRestoreFromTrash: () => ({ mutateAsync: mocks.restore, isPending: false }),
  useDeleteFromTrash: () => ({ mutateAsync: mocks.permanentDelete, isPending: false }),
}));

import { Trash } from "./trash";

const item = (over: Record<string, unknown> = {}) => ({
  itemId: "res-1",
  name: "old-report.pdf",
  type: "file",
  sizeInBytes: 2048,
  inheritsParentAccess: true,
  isArchived: true,
  isActive: true,
  permissions: {
    canView: true,
    canDownload: true,
    canEdit: true,
    canDelete: true,
    canManage: true,
    canOwner: true,
  },
  ...over,
});

describe("Trash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.items = [item()];
  });

  it("lists archived items", async () => {
    render(<Trash />);

    expect(await screen.findByText("old-report.pdf")).toBeInTheDocument();
  });

  it("shows an empty message when nothing is archived", async () => {
    mocks.items = [];
    render(<Trash />);

    expect(await screen.findByText("The trash is empty.")).toBeInTheDocument();
  });

  it("restores an item", async () => {
    const user = userEvent.setup();
    mocks.restore.mockResolvedValue({ resourceId: "res-1" });
    render(<Trash />);

    await user.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => expect(mocks.restore).toHaveBeenCalledWith("res-1"));
  });

  it("reports a failed restore rather than claiming success", async () => {
    const user = userEvent.setup();
    mocks.restore.mockRejectedValue(new Error("nope"));
    render(<Trash />);

    await user.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalled());
    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
  });

  it("asks for confirmation before deleting permanently", async () => {
    const user = userEvent.setup();
    render(<Trash />);

    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/will be removed for good/)).toBeInTheDocument();
    // Nothing is removed until the dialog is confirmed.
    expect(mocks.permanentDelete).not.toHaveBeenCalled();
  });

  it("deletes permanently once confirmed", async () => {
    const user = userEvent.setup();
    mocks.permanentDelete.mockResolvedValue({ resourceId: "res-1" });
    render(<Trash />);

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await screen.findByText(/will be removed for good/);
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(mocks.permanentDelete).toHaveBeenCalledWith("res-1"));
  });

  it("offers no actions on an item the caller cannot delete", async () => {
    // Restoring and purging are the same authority as having removed it, so an
    // item without delete gets neither button.
    mocks.items = [
      item({
        permissions: {
          canView: true,
          canDownload: false,
          canEdit: false,
          canDelete: false,
          canManage: false,
          canOwner: false,
        },
      }),
    ];
    render(<Trash />);

    await screen.findByText("old-report.pdf");
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("narrows the trash to one kind", async () => {
    const user = userEvent.setup();
    render(<Trash />);

    await user.click(screen.getByRole("button", { name: "Folders" }));

    await waitFor(() => expect(mocks.lastTrashQuery.type).toBe("folder"));
  });

  it("asks for everything again when the All filter is chosen", async () => {
    const user = userEvent.setup();
    render(<Trash />);

    await user.click(screen.getByRole("button", { name: "Files" }));
    await waitFor(() => expect(mocks.lastTrashQuery.type).toBe("file"));

    await user.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(mocks.lastTrashQuery.type).toBeUndefined());
  });
});
