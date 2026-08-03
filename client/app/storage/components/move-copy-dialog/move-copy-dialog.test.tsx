import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  directorys: [] as unknown[],
  lastDirectoryId: undefined as string | undefined,
  directoryDetail: null as { fullPath: string; ancestorIds: string[] } | null,
  hasNextPage: false,
  isFetchingNextPage: false,
  isError: false,
  fetchNextPage: vi.fn(),
  moveFile: vi.fn(),
  copyFile: vi.fn(),
  moveDirectory: vi.fn(),
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
  useDmsChildren: (directoryId?: string) => {
    mocks.lastDirectoryId = directoryId;
    return {
      data: {
        pages: [
          { items: mocks.directorys, totalChildCount: mocks.directorys.length, hasMore: false },
        ],
      },
      isLoading: false,
      hasNextPage: mocks.hasNextPage,
      isFetchingNextPage: mocks.isFetchingNextPage,
      isError: mocks.isError,
      fetchNextPage: mocks.fetchNextPage,
    };
  },
  useDmsDirectory: (directoryId?: string) => ({
    data: mocks.directoryDetail
      ? {
          ...mocks.directoryDetail,
          itemId: directoryId,
        }
      : undefined,
  }),
  useMoveFile: () => ({ mutateAsync: mocks.moveFile, isPending: false }),
  useCopyFile: () => ({ mutateAsync: mocks.copyFile, isPending: false }),
  useMoveDmsDirectory: () => ({ mutateAsync: mocks.moveDirectory, isPending: false }),
}));

import { MoveCopyDialog } from "./move-copy-dialog";

const directory = (over: Record<string, unknown> = {}) => ({
  itemId: "dir-2",
  name: "Archive",
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
  ...over,
});

const fileItem = {
  ...directory({ itemId: "file-1", name: "report.pdf", type: "file", parentDirectoryId: "dir-1" }),
} as never;

describe("MoveCopyDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.directorys = [directory()];
    mocks.directoryDetail = null;
    mocks.hasNextPage = false;
    mocks.isFetchingNextPage = false;
    mocks.isError = false;
  });

  it("browses directorys only", () => {
    render(
      <MoveCopyDialog
        open
        onOpenChange={vi.fn()}
        item={fileItem}
        mode="move"
        startDirectoryId="dir-1"
      />,
    );

    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Move item" })).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("loads more destination folders when the listing has another page", async () => {
    const user = userEvent.setup();
    mocks.hasNextPage = true;
    render(
      <MoveCopyDialog
        open
        onOpenChange={vi.fn()}
        item={fileItem}
        mode="move"
        startDirectoryId="dir-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Show more folders" }));

    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("explains a destination-loading failure without offering an empty picker", () => {
    mocks.isError = true;
    render(
      <MoveCopyDialog
        open
        onOpenChange={vi.fn()}
        item={fileItem}
        mode="move"
        startDirectoryId="dir-1"
      />,
    );

    expect(
      screen.getByText("Could not load folders. Try again from the main storage view."),
    ).toBeInTheDocument();
  });

  it("cannot confirm into the directory the item already sits in", () => {
    // Moving somewhere it already is would be a no-op dressed up as an action.
    render(
      <MoveCopyDialog
        open
        onOpenChange={vi.fn()}
        item={fileItem}
        mode="move"
        startDirectoryId="dir-1"
      />,
    );

    expect(screen.getByRole("button", { name: "Move here" })).toBeDisabled();
  });

  it("moves a file into the directory that is open", async () => {
    const user = userEvent.setup();
    mocks.moveFile.mockResolvedValue({ fileId: "file-1" });
    render(
      <MoveCopyDialog
        open
        onOpenChange={vi.fn()}
        item={fileItem}
        mode="move"
        startDirectoryId="dir-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: /Archive/ }));
    await user.click(screen.getByRole("button", { name: "Move here" }));

    await waitFor(() =>
      expect(mocks.moveFile).toHaveBeenCalledWith({ fileId: "file-1", targetDirectoryId: "dir-2" }),
    );
  });

  it("copies rather than moves in copy mode", async () => {
    const user = userEvent.setup();
    mocks.copyFile.mockResolvedValue({ fileId: "new" });
    render(
      <MoveCopyDialog
        open
        onOpenChange={vi.fn()}
        item={fileItem}
        mode="copy"
        startDirectoryId="dir-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: /Archive/ }));
    await user.click(screen.getByRole("button", { name: "Copy here" }));

    await waitFor(() =>
      expect(mocks.copyFile).toHaveBeenCalledWith({ fileId: "file-1", targetDirectoryId: "dir-2" }),
    );
    expect(mocks.moveFile).not.toHaveBeenCalled();
  });

  it("uses the directory endpoint when the item is a directory", async () => {
    const user = userEvent.setup();
    mocks.moveDirectory.mockResolvedValue({ directoryId: "dir-9" });
    const directoryItem = directory({
      itemId: "dir-9",
      name: "Docs",
      parentDirectoryId: "dir-1",
    }) as never;
    render(
      <MoveCopyDialog
        open
        onOpenChange={vi.fn()}
        item={directoryItem}
        mode="move"
        startDirectoryId="dir-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: /Archive/ }));
    await user.click(screen.getByRole("button", { name: "Move here" }));

    await waitFor(() =>
      expect(mocks.moveDirectory).toHaveBeenCalledWith({
        directoryId: "dir-9",
        targetDirectoryId: "dir-2",
      }),
    );
    expect(mocks.moveFile).not.toHaveBeenCalled();
  });

  it("will not let a directory be moved into itself", async () => {
    const user = userEvent.setup();
    const directoryItem = directory({
      itemId: "dir-2",
      name: "Archive",
      parentDirectoryId: "dir-1",
    }) as never;
    render(
      <MoveCopyDialog
        open
        onOpenChange={vi.fn()}
        item={directoryItem}
        mode="move"
        startDirectoryId="dir-1"
      />,
    );

    // The row for the item itself is not navigable.
    const selfRow = screen.getByRole("button", { name: /Archive/ });
    expect(selfRow).toBeDisabled();
    await user.click(selfRow);
    expect(mocks.moveDirectory).not.toHaveBeenCalled();
  });

  it("reports a failure rather than closing as if it worked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mocks.moveFile.mockRejectedValue(new Error("nope"));
    render(
      <MoveCopyDialog
        open
        onOpenChange={onOpenChange}
        item={fileItem}
        mode="move"
        startDirectoryId="dir-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: /Archive/ }));
    await user.click(screen.getByRole("button", { name: "Move here" }));

    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("seeds the breadcrumb trail from the directory detail so ancestors are reachable", async () => {
    // f3 sits at /f1/f2/f3. The picker must let the caller navigate up to f1 or f2,
    // not only down into children.
    mocks.directoryDetail = { fullPath: "/f1/f2/f3", ancestorIds: ["f1", "f2"] };

    const user = userEvent.setup();
    mocks.moveFile.mockResolvedValue({ fileId: "file-1" });
    render(
      <MoveCopyDialog
        open
        onOpenChange={vi.fn()}
        item={fileItem}
        mode="move"
        startDirectoryId="f3"
      />,
    );

    // The breadcrumb buttons for the ancestors render before the children list.
    await waitFor(() => expect(screen.getByRole("button", { name: "f1" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "f2" })).toBeInTheDocument();

    // Navigate up to f1 and move the file there.
    await user.click(screen.getByRole("button", { name: "f1" }));
    await user.click(screen.getByRole("button", { name: "Move here" }));

    await waitFor(() =>
      expect(mocks.moveFile).toHaveBeenCalledWith({ fileId: "file-1", targetDirectoryId: "f1" }),
    );
  });
});
