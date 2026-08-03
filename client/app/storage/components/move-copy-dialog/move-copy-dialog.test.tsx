import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  folders: [] as unknown[],
  lastFolderId: undefined as string | undefined,
  folderDetail: null as { fullPath: string; ancestorIds: string[] } | null,
  moveFile: vi.fn(),
  copyFile: vi.fn(),
  moveFolder: vi.fn(),
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
  useDmsChildren: (folderId?: string) => {
    mocks.lastFolderId = folderId;
    return {
      data: { pages: [{ items: mocks.folders, totalChildCount: mocks.folders.length, hasMore: false }] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    };
  },
  useDmsFolder: (folderId?: string) => ({
    data: mocks.folderDetail
      ? {
          ...mocks.folderDetail,
          itemId: folderId,
        }
      : undefined,
  }),
  useMoveFile: () => ({ mutateAsync: mocks.moveFile, isPending: false }),
  useCopyFile: () => ({ mutateAsync: mocks.copyFile, isPending: false }),
  useMoveDmsFolder: () => ({ mutateAsync: mocks.moveFolder, isPending: false }),
}));

import { MoveCopyDialog } from "./move-copy-dialog";

const folder = (over: Record<string, unknown> = {}) => ({
  itemId: "dir-2",
  name: "Archive",
  type: "folder",
  inheritsParentAccess: true,
  isArchived: false,
  isActive: true,
  childFolderCount: 0,
  childFileCount: 0,
  sizeInBytes: 0,
  permissions: { canView: true, canDownload: true, canEdit: true, canDelete: true, canManage: true, canOwner: true },
  ...over,
});

const fileItem = { ...folder({ itemId: "file-1", name: "report.pdf", type: "file", parentDirectoryId: "dir-1" }) } as never;

describe("MoveCopyDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.folders = [folder()];
    mocks.folderDetail = null;
  });

  it("browses folders only", () => {
    render(<MoveCopyDialog open onOpenChange={vi.fn()} item={fileItem} mode="move" startFolderId="dir-1" />);

    expect(screen.getByText("Archive")).toBeInTheDocument();
  });

  it("cannot confirm into the folder the item already sits in", () => {
    // Moving somewhere it already is would be a no-op dressed up as an action.
    render(<MoveCopyDialog open onOpenChange={vi.fn()} item={fileItem} mode="move" startFolderId="dir-1" />);

    expect(screen.getByRole("button", { name: "Move here" })).toBeDisabled();
  });

  it("moves a file into the folder that is open", async () => {
    const user = userEvent.setup();
    mocks.moveFile.mockResolvedValue({ fileId: "file-1" });
    render(<MoveCopyDialog open onOpenChange={vi.fn()} item={fileItem} mode="move" startFolderId="dir-1" />);

    await user.click(screen.getByRole("button", { name: /Archive/ }));
    await user.click(screen.getByRole("button", { name: "Move here" }));

    await waitFor(() =>
      expect(mocks.moveFile).toHaveBeenCalledWith({ fileId: "file-1", targetFolderId: "dir-2" }),
    );
  });

  it("copies rather than moves in copy mode", async () => {
    const user = userEvent.setup();
    mocks.copyFile.mockResolvedValue({ fileId: "new" });
    render(<MoveCopyDialog open onOpenChange={vi.fn()} item={fileItem} mode="copy" startFolderId="dir-1" />);

    await user.click(screen.getByRole("button", { name: /Archive/ }));
    await user.click(screen.getByRole("button", { name: "Copy here" }));

    await waitFor(() =>
      expect(mocks.copyFile).toHaveBeenCalledWith({ fileId: "file-1", targetFolderId: "dir-2" }),
    );
    expect(mocks.moveFile).not.toHaveBeenCalled();
  });

  it("uses the folder endpoint when the item is a folder", async () => {
    const user = userEvent.setup();
    mocks.moveFolder.mockResolvedValue({ folderId: "dir-9" });
    const folderItem = folder({ itemId: "dir-9", name: "Docs", parentDirectoryId: "dir-1" }) as never;
    render(<MoveCopyDialog open onOpenChange={vi.fn()} item={folderItem} mode="move" startFolderId="dir-1" />);

    await user.click(screen.getByRole("button", { name: /Archive/ }));
    await user.click(screen.getByRole("button", { name: "Move here" }));

    await waitFor(() =>
      expect(mocks.moveFolder).toHaveBeenCalledWith({ folderId: "dir-9", targetFolderId: "dir-2" }),
    );
    expect(mocks.moveFile).not.toHaveBeenCalled();
  });

  it("will not let a folder be moved into itself", async () => {
    const user = userEvent.setup();
    const folderItem = folder({ itemId: "dir-2", name: "Archive", parentDirectoryId: "dir-1" }) as never;
    render(<MoveCopyDialog open onOpenChange={vi.fn()} item={folderItem} mode="move" startFolderId="dir-1" />);

    // The row for the item itself is not navigable.
    const selfRow = screen.getByRole("button", { name: /Archive/ });
    expect(selfRow).toBeDisabled();
    await user.click(selfRow);
    expect(mocks.moveFolder).not.toHaveBeenCalled();
  });

  it("reports a failure rather than closing as if it worked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mocks.moveFile.mockRejectedValue(new Error("nope"));
    render(<MoveCopyDialog open onOpenChange={onOpenChange} item={fileItem} mode="move" startFolderId="dir-1" />);

    await user.click(screen.getByRole("button", { name: /Archive/ }));
    await user.click(screen.getByRole("button", { name: "Move here" }));

    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("seeds the breadcrumb trail from the folder detail so ancestors are reachable", async () => {
    // f3 sits at /f1/f2/f3. The picker must let the caller navigate up to f1 or f2,
    // not only down into children.
    mocks.folderDetail = { fullPath: "/f1/f2/f3", ancestorIds: ["f1", "f2"] };

    const user = userEvent.setup();
    mocks.moveFile.mockResolvedValue({ fileId: "file-1" });
    render(
      <MoveCopyDialog
        open
        onOpenChange={vi.fn()}
        item={fileItem}
        mode="move"
        startFolderId="f3"
      />,
    );

    // The breadcrumb buttons for the ancestors render before the children list.
    await waitFor(() => expect(screen.getByRole("button", { name: "f1" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "f2" })).toBeInTheDocument();

    // Navigate up to f1 and move the file there.
    await user.click(screen.getByRole("button", { name: "f1" }));
    await user.click(screen.getByRole("button", { name: "Move here" }));

    await waitFor(() =>
      expect(mocks.moveFile).toHaveBeenCalledWith({ fileId: "file-1", targetFolderId: "f1" }),
    );
  });
});
