import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DmsItemType,
  type IDmsFileAndDirectoryInfo,
  type IStorageConfiguration,
} from "@/storage/models/storage.model";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  configState: { data: undefined as unknown, isLoading: false },
  dmsState: {
    response: null as unknown,
    isPending: false,
    error: undefined as unknown,
    failFetch: false,
  },
  deleteFile: vi.fn(),
  deleteDirectory: vi.fn(),
  fetchNextPage: vi.fn(),
  lastChildrenQuery: {} as { directoryId?: string; search?: string },
  currentDirectory: undefined as unknown,
  permissions: {
    canView: true,
    canDownload: true,
    canEdit: true,
    canDelete: true,
    canManage: true,
    canOwner: true,
  },
  fetchFile: vi.fn(),
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/hooks/use-scoped-path", () => ({
  useStoragePath: () => "/storage",
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
  showSuccessToast: mocks.showSuccessToast,
  showInfoToast: vi.fn(),
  showErrorToast: mocks.showErrorToast,
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({
    selectedProject: {
      itemId: "p1",
      tenantId: "t1",
      tenantSlug: "slug1",
      name: "Proj",
    },
    setSelectedProject: vi.fn(),
  }),
  HttpClient: class {
    get() {}
    post() {}
    put() {}
    patch() {}
    delete() {}
    stream() {}
  },
}));

vi.mock("@/storage/hooks/use-storage-configuration", () => ({
  useGetStorageConfigurations: () => mocks.configState,
}));

vi.mock("@/storage/hooks/use-storage-file", () => ({
  useDeleteFile: () => ({ mutateAsync: mocks.deleteFile, isPending: false }),
  useLazyGetFile: () => ({ fetchFile: mocks.fetchFile }),
}));

// The listing moved to a cursor query. The fixtures below still author the old
// response shape, so it is translated here rather than rewritten in every test:
// what each case is actually about is the rendering, not the payload envelope.
vi.mock("@/storage/hooks/use-dms", () => ({
  useDmsChildren: (directoryId?: string, options?: { search?: string }) => {
    mocks.lastChildrenQuery = { directoryId, search: options?.search };

    const legacy = (mocks.dmsState.response ?? null) as {
      dmsFileAndDirectoryInfos?: IDmsFileAndDirectoryInfo[];
      totalCount?: number;
    } | null;

    const items = (legacy?.dmsFileAndDirectoryInfos ?? []).map((item) => ({
      itemId: item.itemId,
      name: item.name,
      type: item.type === DmsItemType.Directory ? "directory" : "file",
      parentDirectoryId: item.parentId,
      extension: item.extension,
      sizeInBytes: Number(item.sizeInBytes ?? 0),
      currentVersion: item.version,
      description: item.description,
      lastUpdatedDate: item.lastUpdatedDate,
      inheritsParentAccess: true,
      isArchived: false,
      isActive: true,
      permissions: mocks.permissions,
    }));

    return {
      data: { pages: [{ items, totalChildCount: legacy?.totalCount ?? items.length, hasMore: false }] },
      isLoading: mocks.dmsState.isPending,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mocks.fetchNextPage,
      refetch: vi.fn(),
    };
  },
  useDmsDirectory: () => ({ data: mocks.currentDirectory }),
  useDeleteDmsDirectory: () => ({ mutateAsync: mocks.deleteDirectory, isPending: false }),
}));

vi.mock("@/storage/components/manage-access-modal/manage-access-modal", () => ({
  ManageAccessModal: ({ open }: { open: boolean }) => (
    <div data-testid="manage-access-modal" data-open={String(open)} />
  ),
}));

vi.mock("@/storage/components/file-versions-drawer/file-versions-drawer", () => ({
  FileVersionsDrawer: ({ open }: { open: boolean }) => (
    <div data-testid="versions-drawer" data-open={String(open)} />
  ),
}));

vi.mock("@/storage/components/move-copy-dialog/move-copy-dialog", () => ({
  MoveCopyDialog: ({ open, mode }: { open: boolean; mode: string }) => (
    <div data-testid="move-copy-dialog" data-open={String(open)} data-mode={mode} />
  ),
}));

vi.mock("@/storage/components/rename-directory-dialog", () => ({
  RenameDirectoryDialog: ({ open }: { open: boolean }) => (
    <div data-testid="rename-dialog" data-open={String(open)} />
  ),
}));

// Replace heavy child modals with lightweight prop-reflecting stubs.
vi.mock("@/storage/components/upload-dms-file-modal", () => ({
  UploadDmsFileModal: ({ open }: { open: boolean }) => (
    <div data-testid="upload-modal" data-open={String(open)} />
  ),
}));

vi.mock("@/storage/components/file-preview-modal", () => ({
  FilePreviewModal: ({
    open,
    fileName,
  }: {
    open: boolean;
    fileName: string;
  }) => (
    <div data-testid="preview-modal" data-open={String(open)}>
      {fileName}
    </div>
  ),
}));

vi.mock(
  "@/storage/components/create-new-directory-modal/create-dms-new-directory",
  () => ({
    CreateDmsNewDirectory: ({ open }: { open: boolean }) => (
      <div data-testid="create-directory-modal" data-open={String(open)} />
    ),
  }),
);

import { StorageDetail } from "./storage-detail";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= vi.fn(() => false) as never;
  Element.prototype.setPointerCapture ??= vi.fn() as never;
  Element.prototype.releasePointerCapture ??= vi.fn() as never;
  Element.prototype.scrollIntoView ??= vi.fn() as never;
});

function makeConfig(
  overrides: Partial<IStorageConfiguration> = {},
): IStorageConfiguration {
  return {
    storageStrategy: "S3Compatible",
    accessKey: "AK",
    cloudStorageRegionEndPoint: null,
    connectionString: null,
    createdBy: "me",
    createdDate: "2024-01-01",
    itemId: "cfg-1",
    lastUpdatedBy: "me",
    lastUpdatedDate: "2024-01-02",
    name: "MyStore",
    organizationIds: [],
    secretKey: "SK",
    tags: [],
    host: "https://minio.local",
    port: null,
    userName: null,
    password: null,
    remoteBasePath: null,
    ...overrides,
  };
}

function makeDirectory(
  overrides: Partial<IDmsFileAndDirectoryInfo> = {},
): IDmsFileAndDirectoryInfo {
  return {
    parentId: "",
    type: DmsItemType.Directory,
    name: "Documents",
    fileStorageId: "fs-fold",
    extension: "",
    sizeInBytes: "0",
    version: 1,
    description: "Directory creation",
    itemId: "fold-1",
    lastUpdatedDate: "2024-01-02T10:00:00.000Z",
    ...overrides,
  };
}

function makeFile(
  overrides: Partial<IDmsFileAndDirectoryInfo> = {},
): IDmsFileAndDirectoryInfo {
  return {
    parentId: "",
    type: DmsItemType.File,
    name: "report.pdf",
    fileStorageId: "f1",
    extension: ".pdf",
    sizeInBytes: "2048",
    version: 1,
    description: "",
    itemId: "file-1",
    lastUpdatedDate: "2024-01-02T10:00:00.000Z",
    ...overrides,
  };
}

function setLocation(search: string) {
  window.history.replaceState({}, "", search);
}

function renderDetail() {
  return render(<StorageDetail />);
}

beforeEach(() => {
    mocks.currentDirectory = undefined;
    mocks.permissions = {
      canView: true,
      canDownload: true,
      canEdit: true,
      canDelete: true,
      canManage: true,
      canOwner: true,
    };
  vi.clearAllMocks();
  mocks.configState = { data: [makeConfig()], isLoading: false };
  mocks.dmsState = {
    response: null,
    isPending: false,
    error: undefined,
    failFetch: false,
  };
  setLocation("/?id=cfg-1");
});

describe("StorageDetail", () => {
  it("renders the configuration-loading skeleton", () => {
    mocks.configState = { data: undefined, isLoading: true };
    const { container } = renderDetail();
    expect(
      screen.queryByRole("button", { name: "API Docs" }),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
  });

  it("shows a not-found message when the configuration is missing", () => {
    mocks.configState = { data: [], isLoading: false };
    renderDetail();
    expect(
      screen.getByRole("heading", { name: "Storage Details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Storage configuration not found."),
    ).toBeInTheDocument();
  });

  it("renders the mapped provider title and API Docs button", () => {
    mocks.dmsState.response = { dmsFileAndDirectoryInfos: [], totalCount: 0 };
    renderDetail();
    expect(
      screen.getByRole("heading", { name: "AWS S3 Compatible" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "API Docs" })).toBeInTheDocument();
  });

  it("opens API docs in a new tab", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    mocks.dmsState.response = { dmsFileAndDirectoryInfos: [], totalCount: 0 };
    renderDetail();

    await user.click(screen.getByRole("button", { name: "API Docs" }));

    expect(openSpy).toHaveBeenCalledWith("/swagger/index.html", "_blank");
    openSpy.mockRestore();
  });

  it("renders directory and file rows from the DMS data", async () => {
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeDirectory({ name: "Documents", itemId: "fold-1" }),
        makeFile({ name: "report.pdf", fileStorageId: "f1" }),
      ],
      totalCount: 2,
    };
    renderDetail();

    expect(await screen.findByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("Directorys")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
  });

  it("shows the empty state when there are no directorys or files", () => {
    mocks.dmsState.response = { dmsFileAndDirectoryInfos: [], totalCount: 0 };
    renderDetail();
    expect(
      screen.getByText("No directorys and files found"),
    ).toBeInTheDocument();
  });

  it("renders skeletons while the DMS data is loading", () => {
    mocks.dmsState.isPending = true;
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [makeDirectory({ name: "HiddenDirectory" })],
      totalCount: 1,
    };
    const { container } = renderDetail();

    expect(screen.queryByText("HiddenDirectory")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No directorys and files found"),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
  });

  it("navigates back to the storage list from the breadcrumb", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = { dmsFileAndDirectoryInfos: [], totalCount: 0 };
    renderDetail();

    await user.click(screen.getByText("Storage"));
    expect(mocks.navigate).toHaveBeenCalledWith("/storage");
  });

  it("navigates into a directory when a directory row is clicked", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [makeDirectory({ name: "Reports", itemId: "fold-9" })],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByText("Reports"));
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.stringContaining("directoryId=fold-9"),
    );
  });

  it.each([["{Enter}"], [" "]])(
    "navigates into a directory when %s is pressed on the directory card",
    async (key) => {
      const user = userEvent.setup();
      mocks.dmsState.response = {
        dmsFileAndDirectoryInfos: [makeDirectory({ name: "Reports", itemId: "fold-9" })],
        totalCount: 1,
      };
      renderDetail();

      const card = (await screen.findByText("Reports")).closest(
        '[role="button"]',
      ) as HTMLElement;
      card.focus();
      await user.keyboard(key);

      expect(mocks.navigate).toHaveBeenCalledWith(
        expect.stringContaining("directoryId=fold-9"),
      );
    },
  );

  it("renders breadcrumb entries from the path query param", () => {
    const path = encodeURIComponent(
      JSON.stringify([{ id: "fold-1", name: "Invoices" }]),
    );
    setLocation(`/?id=cfg-1&directoryId=fold-1&path=${path}`);
    mocks.dmsState.response = { dmsFileAndDirectoryInfos: [], totalCount: 0 };
    renderDetail();

    expect(screen.getByText("Invoices")).toBeInTheDocument();
    // The strategy becomes a clickable link (not the current page) once nested.
    expect(screen.getByText("S3Compatible")).toBeInTheDocument();
  });

  it("switches to the list view and shows table headers", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [makeFile({ name: "data.csv", extension: ".csv" })],
      totalCount: 1,
    };
    const { container } = renderDetail();

    // grid view: no table headers yet
    expect(screen.queryByText("Size")).not.toBeInTheDocument();

    const toggle = container.querySelector(
      "div.gap-1.rounded-md.border.p-1",
    ) as HTMLElement;
    const listButton = toggle.querySelectorAll("button")[0];
    await user.click(listButton);

    expect(await screen.findByText("Size")).toBeInTheDocument();
    expect(screen.getByText("Last modified")).toBeInTheDocument();
  });

  it("sends the search term to the server rather than filtering the page", async () => {
    // Filtering locally would only ever search the page already loaded, so a
    // match on a later page would look like no match at all. The term is passed
    // to the listing query instead.
    const user = userEvent.setup();
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeDirectory({ name: "Alpha", itemId: "a", fileStorageId: "fa" }),
        makeDirectory({ name: "Beta", itemId: "b", fileStorageId: "fb" }),
      ],
      totalCount: 2,
    };
    renderDetail();

    expect(await screen.findByText("Beta")).toBeInTheDocument();
    const searchInput = screen.getAllByPlaceholderText("Search...")[0];
    await user.type(searchInput, "Alph");

    await waitFor(() => expect(mocks.lastChildrenQuery.search).toBe("Alph"));
  });

  it("opens the upload modal from the Add New menu", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = { dmsFileAndDirectoryInfos: [], totalCount: 0 };
    renderDetail();

    expect(screen.getByTestId("upload-modal")).toHaveAttribute(
      "data-open",
      "false",
    );

    await user.click(screen.getByRole("button", { name: /Add New/i }));
    await user.click(await screen.findByText("Upload file"));

    await waitFor(() =>
      expect(screen.getByTestId("upload-modal")).toHaveAttribute(
        "data-open",
        "true",
      ),
    );
  });

  it("opens the create-directory modal from the Add New menu", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = { dmsFileAndDirectoryInfos: [], totalCount: 0 };
    renderDetail();

    await user.click(screen.getByRole("button", { name: /Add New/i }));
    await user.click(await screen.findByText("Create new directory"));

    await waitFor(() =>
      expect(screen.getByTestId("create-directory-modal")).toHaveAttribute(
        "data-open",
        "true",
      ),
    );
  });

  it.each([["{Enter}"], [" "]])(
    "previews a file when %s is pressed on the file card",
    async (key) => {
      const user = userEvent.setup();
      mocks.fetchFile.mockResolvedValue({ url: "https://files/report.pdf" });
      mocks.dmsState.response = {
        dmsFileAndDirectoryInfos: [
          makeFile({ name: "preview.pdf", itemId: "fs-9", fileStorageId: "fs-9" }),
        ],
        totalCount: 1,
      };
      renderDetail();

      const card = (await screen.findByText("preview.pdf")).closest(
        '[role="button"]',
      ) as HTMLElement;
      card.focus();
      await user.keyboard(key);

      await waitFor(() =>
        expect(mocks.fetchFile).toHaveBeenCalledWith({
          itemId: "fs-9",
          projectKey: "t1",
          configurationName: "MyStore",
        }),
      );
    },
  );

  it("previews a file and forwards the request to fetchFile", async () => {
    const user = userEvent.setup();
    mocks.fetchFile.mockResolvedValue({ url: "https://files/report.pdf" });
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeFile({ name: "preview.pdf", itemId: "fs-9", fileStorageId: "fs-9" }),
      ],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByText("preview.pdf"));

    await waitFor(() =>
      expect(mocks.fetchFile).toHaveBeenCalledWith({
        itemId: "fs-9",
        projectKey: "t1",
        configurationName: "MyStore",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("preview-modal")).toHaveAttribute(
        "data-open",
        "true",
      ),
    );
  });

  it("deletes a file after confirmation", async () => {
    const user = userEvent.setup();
    mocks.deleteFile.mockResolvedValue({ isSuccess: true });
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeFile({ name: "old.pdf", itemId: "file-del", fileStorageId: "file-del" }),
      ],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete"));

    const dialog = await screen.findByText("Delete File");
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() =>
      expect(mocks.deleteFile).toHaveBeenCalledWith({
        fileId: "file-del",
        configurationName: "MyStore",
        projectKey: "t1",
      }),
    );
    await waitFor(() =>
      expect(mocks.showSuccessToast).toHaveBeenCalledWith({
        description: "File Deleted successfully",
      }),
    );
  });

  it("deletes a directory after confirmation", async () => {
    const user = userEvent.setup();
    mocks.deleteDirectory.mockResolvedValue({ isSuccess: true });
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeDirectory({
          name: "trash",
          itemId: "fold-del",
          description: "Directory creation",
        }),
      ],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete"));

    expect(await screen.findByText("Delete Directory")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() =>
      expect(mocks.deleteDirectory).toHaveBeenCalledWith({ directoryId: "fold-del" }),
    );
    await waitFor(() =>
      expect(mocks.showSuccessToast).toHaveBeenCalledWith({
        description: "Directory Deleted successfully",
      }),
    );
  });

  it("does not raise its own toast when the listing fails", () => {
    // Fetching moved to a query, which owns retry and error state. Raising a
    // toast from the page as well would double-report a single failure.
    mocks.dmsState.failFetch = true;
    mocks.dmsState.error = "network down";
    renderDetail();
    expect(mocks.showErrorToast).not.toHaveBeenCalledWith({ errors: "network down" });
  });

  it("renders icons for image, video, audio, spreadsheet and unknown files", async () => {
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeFile({ name: "pic.png", extension: ".png", fileStorageId: "p" }),
        makeFile({ name: "clip.mp4", extension: ".mp4", fileStorageId: "v" }),
        makeFile({ name: "song.mp3", extension: ".mp3", fileStorageId: "a" }),
        makeFile({ name: "sheet.xlsx", extension: ".xlsx", fileStorageId: "x" }),
        makeFile({ name: "notes.txt", extension: ".txt", fileStorageId: "t" }),
      ],
      totalCount: 5,
    };
    renderDetail();

    expect(await screen.findByText("pic.png")).toBeInTheDocument();
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.getByText("song.mp3")).toBeInTheDocument();
    expect(screen.getByText("sheet.xlsx")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
  });

  it("shows an error toast when file preview fails to load", async () => {
    const user = userEvent.setup();
    mocks.fetchFile.mockRejectedValue(new Error("preview boom"));
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeFile({ name: "broken.pdf", fileStorageId: "fs-x" }),
      ],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByText("broken.pdf"));
    await waitFor(() =>
      expect(mocks.showErrorToast).toHaveBeenCalledWith({
        errors: expect.any(Error),
      }),
    );
  });

  it("shows an error toast when file delete reports failure", async () => {
    const user = userEvent.setup();
    mocks.deleteFile.mockResolvedValue({ isSuccess: false });
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeFile({ name: "keep.pdf", fileStorageId: "file-keep" }),
      ],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete"));
    await screen.findByText("Delete File");
    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() =>
      expect(mocks.showErrorToast).toHaveBeenCalledWith({
        errors: "Something went wrong",
      }),
    );
  });

  it("shows an error toast when file delete throws", async () => {
    const user = userEvent.setup();
    mocks.deleteFile.mockRejectedValue(new Error("delete boom"));
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeFile({ name: "boom.pdf", fileStorageId: "file-boom" }),
      ],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete"));
    await screen.findByText("Delete File");
    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() =>
      expect(mocks.showErrorToast).toHaveBeenCalledWith({
        errors: expect.any(Error),
      }),
    );
  });

  it("shows an error toast when directory delete reports failure", async () => {
    const user = userEvent.setup();
    mocks.deleteDirectory.mockRejectedValue("Something went wrong");
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeDirectory({ name: "keepdir", itemId: "fold-keep" }),
      ],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete"));
    await screen.findByText("Delete Directory");
    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() =>
      expect(mocks.showErrorToast).toHaveBeenCalledWith({
        errors: "Something went wrong",
      }),
    );
  });

  it("shows an error toast when directory delete throws", async () => {
    const user = userEvent.setup();
    mocks.deleteDirectory.mockRejectedValue(new Error("directory boom"));
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeDirectory({ name: "boomdir", itemId: "fold-boom" }),
      ],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete"));
    await screen.findByText("Delete Directory");
    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() =>
      expect(mocks.showErrorToast).toHaveBeenCalledWith({
        errors: expect.any(Error),
      }),
    );
  });

  it("navigates through nested breadcrumb links", async () => {
    const user = userEvent.setup();
    const path = encodeURIComponent(
      JSON.stringify([
        { id: "f1", name: "Level1" },
        { id: "f2", name: "Level2" },
      ]),
    );
    setLocation(`/?id=cfg-1&directoryId=f2&path=${path}`);
    mocks.dmsState.response = { dmsFileAndDirectoryInfos: [], totalCount: 0 };
    renderDetail();

    // Clicking the strategy root resets directory navigation to the top level.
    await user.click(screen.getByText("S3Compatible"));
    expect(mocks.navigate).toHaveBeenCalledWith("?id=cfg-1");

    // Clicking an intermediate crumb navigates to that directory level.
    mocks.navigate.mockClear();
    await user.click(screen.getByText("Level1"));
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.stringContaining("directoryId=f1"),
    );
  });

  it("deletes a directory from the list view", async () => {
    const user = userEvent.setup();
    mocks.deleteDirectory.mockResolvedValue({ isSuccess: true });
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeDirectory({ name: "listdir", itemId: "fold-list" }),
      ],
      totalCount: 1,
    };
    const { container } = renderDetail();

    await screen.findByText("listdir");
    const toggle = container.querySelector(
      "div.gap-1.rounded-md.border.p-1",
    ) as HTMLElement;
    await user.click(toggle.querySelectorAll("button")[0]);

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete"));
    await screen.findByText("Delete Directory");
    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() =>
      expect(mocks.deleteDirectory).toHaveBeenCalledWith({ directoryId: "fold-list" }),
    );
  });

  it("deletes a file from the list view and shows its size", async () => {
    const user = userEvent.setup();
    mocks.deleteFile.mockResolvedValue({ isSuccess: true });
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [
        makeFile({
          name: "listfile.csv",
          extension: ".csv",
          itemId: "file-list",
          fileStorageId: "file-list",
          sizeInBytes: "4096",
        }),
      ],
      totalCount: 1,
    };
    const { container } = renderDetail();

    await screen.findByText("listfile.csv");
    const toggle = container.querySelector(
      "div.gap-1.rounded-md.border.p-1",
    ) as HTMLElement;
    await user.click(toggle.querySelectorAll("button")[0]);

    // List view formats the size in KB.
    expect(await screen.findByText("4.00 KB")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete"));
    await screen.findByText("Delete File");
    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() =>
      expect(mocks.deleteFile).toHaveBeenCalledWith({
        fileId: "file-list",
        configurationName: "MyStore",
        projectKey: "t1",
      }),
    );
  });

  it("opens manage access from the row menu", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [makeDirectory({ name: "Reports", itemId: "dir-9" })],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Manage access"));

    await waitFor(() =>
      expect(screen.getByTestId("manage-access-modal")).toHaveAttribute("data-open", "true"),
    );
  });

  it("opens the versions drawer for a file", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [makeFile({ name: "report.pdf", itemId: "file-9" })],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Versions"));

    await waitFor(() =>
      expect(screen.getByTestId("versions-drawer")).toHaveAttribute("data-open", "true"),
    );
  });

  it("offers no Versions entry on a directory, which has no history", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [makeDirectory({ name: "Reports", itemId: "dir-9" })],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await screen.findByText("Move");

    expect(screen.queryByText("Versions")).not.toBeInTheDocument();
  });

  it("opens the transfer dialog in copy mode from Copy", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [makeFile({ name: "report.pdf", itemId: "file-9" })],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Copy"));

    await waitFor(() =>
      expect(screen.getByTestId("move-copy-dialog")).toHaveAttribute("data-mode", "copy"),
    );
  });

  it("hides every gated action when the caller may only view", async () => {
    // The whole menu collapses to nothing rather than offering actions the
    // server will refuse.
    const user = userEvent.setup();
    mocks.permissions = {
      canView: true,
      canDownload: false,
      canEdit: false,
      canDelete: false,
      canManage: false,
      canOwner: false,
    };
    mocks.dmsState.response = {
      dmsFileAndDirectoryInfos: [makeFile({ name: "report.pdf", itemId: "file-9" })],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));

    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage access")).not.toBeInTheDocument();
    expect(screen.queryByText("Versions")).not.toBeInTheDocument();
    expect(screen.queryByText("Move")).not.toBeInTheDocument();
  });

  it("hides Add New when the directory cannot be written to", async () => {
    mocks.currentDirectory = {
      itemId: "dir-1",
      permissions: {
        canView: true,
        canDownload: true,
        canEdit: false,
        canDelete: false,
        canManage: false,
        canOwner: false,
      },
    };
    mocks.dmsState.response = { dmsFileAndDirectoryInfos: [], totalCount: 0 };
    renderDetail();

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Add New/ })).not.toBeInTheDocument(),
    );
  });
});
