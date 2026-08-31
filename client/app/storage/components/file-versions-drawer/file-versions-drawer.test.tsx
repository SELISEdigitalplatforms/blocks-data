import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  versions: [] as unknown[],
  isLoading: false,
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  lastFileId: undefined as string | undefined,
  // Controls what the uploader-id resolver queries report, in the same order
  // as the deduped uploader ids the component derives from `versions`.
  userQueries: [] as unknown[],
}));

vi.mock("../../hooks/use-dms", () => ({
  useFileVersions: (fileId?: string) => {
    mocks.lastFileId = fileId;
    return {
      data: { pages: [{ items: mocks.versions, hasMore: mocks.hasNextPage }] },
      isLoading: mocks.isLoading,
      hasNextPage: mocks.hasNextPage,
      isFetchingNextPage: false,
      fetchNextPage: mocks.fetchNextPage,
    };
  },
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({
    selectedProject: { itemId: "p1", tenantId: "t1", tenantSlug: "slug1", name: "Proj" },
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueries: () => mocks.userQueries,
}));

vi.mock("@blocks-idp/iam/services/user.service", () => ({
  userService: { getUserById: vi.fn() },
}));

import { FileVersionsDrawer } from "./file-versions-drawer";

const file = { itemId: "file-1", name: "report.pdf", type: "file" } as never;

const version = (over: Record<string, unknown> = {}) => ({
  itemId: "v1",
  no: 2,
  sizeInBytes: 4096,
  uploadedBy: "user-1",
  createdDate: "2026-07-01T10:00:00Z",
  ...over,
});

describe("FileVersionsDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.versions = [];
    mocks.isLoading = false;
    mocks.hasNextPage = false;
    mocks.userQueries = [];
  });

  it("does not query until it is opened", () => {
    render(<FileVersionsDrawer open={false} onOpenChange={vi.fn()} file={file} />);

    expect(mocks.lastFileId).toBeUndefined();
  });

  it("queries the file once opened", () => {
    render(<FileVersionsDrawer open onOpenChange={vi.fn()} file={file} />);

    expect(mocks.lastFileId).toBe("file-1");
  });

  it("lists a version with its number, uploader and size", async () => {
    mocks.versions = [version()];
    render(<FileVersionsDrawer open onOpenChange={vi.fn()} file={file} />);

    expect(await screen.findByText("v2")).toBeInTheDocument();
    expect(screen.getByText("by user-1")).toBeInTheDocument();
    expect(screen.getByText("4.0 KB")).toBeInTheDocument();
  });

  it("resolves the uploader id to a display name and email", async () => {
    mocks.versions = [version({ uploadedBy: "user-1" })];
    mocks.userQueries = [
      {
        data: {
          data: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", userName: "ada" },
        },
      },
    ];
    render(<FileVersionsDrawer open onOpenChange={vi.fn()} file={file} />);

    expect(await screen.findByText("by Ada Lovelace (ada@example.com)")).toBeInTheDocument();
  });

  it("says so when a file has no recorded versions", async () => {
    render(<FileVersionsDrawer open onOpenChange={vi.fn()} file={file} />);

    expect(await screen.findByText(/no recorded versions/)).toBeInTheDocument();
  });

  it("offers download only when a handler is supplied", async () => {
    mocks.versions = [version()];
    const { rerender } = render(
      <FileVersionsDrawer open onOpenChange={vi.fn()} file={file} />,
    );
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();

    const onDownload = vi.fn();
    rerender(
      <FileVersionsDrawer
        open
        onOpenChange={vi.fn()}
        file={file}
        onDownloadVersion={onDownload}
      />,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Download" }));
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ no: 2 }));
  });

  it("pages when the server reports more", async () => {
    mocks.versions = [version()];
    mocks.hasNextPage = true;
    render(<FileVersionsDrawer open onOpenChange={vi.fn()} file={file} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Load more" }));

    expect(mocks.fetchNextPage).toHaveBeenCalled();
  });
});
