import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DmsItemType,
  type IDmsFileAndFolderInfo,
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
  deleteFolder: vi.fn(),
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
  useGetDmsFileAndFolder: () => ({
    mutate: (
      _payload: unknown,
      opts?: {
        onSuccess?: (d: unknown) => void;
        onError?: (e: unknown) => void;
      },
    ) => {
      if (mocks.dmsState.failFetch) opts?.onError?.(mocks.dmsState.error);
      else opts?.onSuccess?.(mocks.dmsState.response);
    },
    isPending: mocks.dmsState.isPending,
  }),
  useDeleteFile: () => ({ mutateAsync: mocks.deleteFile, isPending: false }),
  useDeleteFolder: () => ({ mutateAsync: mocks.deleteFolder, isPending: false }),
  useLazyGetFile: () => ({ fetchFile: mocks.fetchFile }),
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
  "@/storage/components/create-new-folder-modal/create-dms-new-folder",
  () => ({
    CreateDmsNewFolder: ({ open }: { open: boolean }) => (
      <div data-testid="create-folder-modal" data-open={String(open)} />
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

function makeFolder(
  overrides: Partial<IDmsFileAndFolderInfo> = {},
): IDmsFileAndFolderInfo {
  return {
    parentId: "",
    type: DmsItemType.Folder,
    name: "Documents",
    fileStorageId: "fs-fold",
    extension: "",
    sizeInBytes: "0",
    version: 1,
    description: "Folder creation",
    itemId: "fold-1",
    lastUpdatedDate: "2024-01-02T10:00:00.000Z",
    ...overrides,
  };
}

function makeFile(
  overrides: Partial<IDmsFileAndFolderInfo> = {},
): IDmsFileAndFolderInfo {
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
    mocks.dmsState.response = { dmsFileAndFolderInfos: [], totalCount: 0 };
    renderDetail();
    expect(
      screen.getByRole("heading", { name: "AWS S3 Compatible" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "API Docs" })).toBeInTheDocument();
  });

  it("opens API docs in a new tab", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    mocks.dmsState.response = { dmsFileAndFolderInfos: [], totalCount: 0 };
    renderDetail();

    await user.click(screen.getByRole("button", { name: "API Docs" }));

    expect(openSpy).toHaveBeenCalledWith("/swagger/index.html", "_blank");
    openSpy.mockRestore();
  });

  it("renders folder and file rows from the DMS data", async () => {
    mocks.dmsState.response = {
      dmsFileAndFolderInfos: [
        makeFolder({ name: "Documents", itemId: "fold-1" }),
        makeFile({ name: "report.pdf", fileStorageId: "f1" }),
      ],
      totalCount: 2,
    };
    renderDetail();

    expect(await screen.findByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("Folders")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
  });

  it("shows the empty state when there are no folders or files", () => {
    mocks.dmsState.response = { dmsFileAndFolderInfos: [], totalCount: 0 };
    renderDetail();
    expect(
      screen.getByText("No folders and files found"),
    ).toBeInTheDocument();
  });

  it("renders skeletons while the DMS data is loading", () => {
    mocks.dmsState.isPending = true;
    mocks.dmsState.response = {
      dmsFileAndFolderInfos: [makeFolder({ name: "HiddenFolder" })],
      totalCount: 1,
    };
    const { container } = renderDetail();

    expect(screen.queryByText("HiddenFolder")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No folders and files found"),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
  });

  it("navigates back to the storage list from the breadcrumb", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = { dmsFileAndFolderInfos: [], totalCount: 0 };
    renderDetail();

    await user.click(screen.getByText("Storage"));
    expect(mocks.navigate).toHaveBeenCalledWith("/storage");
  });

  it("navigates into a folder when a folder row is clicked", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = {
      dmsFileAndFolderInfos: [makeFolder({ name: "Reports", itemId: "fold-9" })],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByText("Reports"));
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.stringContaining("folderId=fold-9"),
    );
  });

  it("renders breadcrumb entries from the path query param", () => {
    const path = encodeURIComponent(
      JSON.stringify([{ id: "fold-1", name: "Invoices" }]),
    );
    setLocation(`/?id=cfg-1&folderId=fold-1&path=${path}`);
    mocks.dmsState.response = { dmsFileAndFolderInfos: [], totalCount: 0 };
    renderDetail();

    expect(screen.getByText("Invoices")).toBeInTheDocument();
    // The strategy becomes a clickable link (not the current page) once nested.
    expect(screen.getByText("S3Compatible")).toBeInTheDocument();
  });

  it("switches to the list view and shows table headers", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = {
      dmsFileAndFolderInfos: [makeFile({ name: "data.csv", extension: ".csv" })],
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

  it("filters folders by the search input", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = {
      dmsFileAndFolderInfos: [
        makeFolder({ name: "Alpha", itemId: "a", fileStorageId: "fa" }),
        makeFolder({ name: "Beta", itemId: "b", fileStorageId: "fb" }),
      ],
      totalCount: 2,
    };
    renderDetail();

    expect(await screen.findByText("Beta")).toBeInTheDocument();
    const searchInput = screen.getAllByPlaceholderText("Search...")[0];
    await user.type(searchInput, "Alph");

    await waitFor(() =>
      expect(screen.queryByText("Beta")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("opens the upload modal from the Add New menu", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = { dmsFileAndFolderInfos: [], totalCount: 0 };
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

  it("opens the create-folder modal from the Add New menu", async () => {
    const user = userEvent.setup();
    mocks.dmsState.response = { dmsFileAndFolderInfos: [], totalCount: 0 };
    renderDetail();

    await user.click(screen.getByRole("button", { name: /Add New/i }));
    await user.click(await screen.findByText("Create new folder"));

    await waitFor(() =>
      expect(screen.getByTestId("create-folder-modal")).toHaveAttribute(
        "data-open",
        "true",
      ),
    );
  });

  it("previews a file and forwards the request to fetchFile", async () => {
    const user = userEvent.setup();
    mocks.fetchFile.mockResolvedValue({ url: "https://files/report.pdf" });
    mocks.dmsState.response = {
      dmsFileAndFolderInfos: [
        makeFile({ name: "preview.pdf", fileStorageId: "fs-9" }),
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
      dmsFileAndFolderInfos: [
        makeFile({ name: "old.pdf", fileStorageId: "file-del" }),
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

  it("deletes a folder after confirmation", async () => {
    const user = userEvent.setup();
    mocks.deleteFolder.mockResolvedValue({ isSuccess: true });
    mocks.dmsState.response = {
      dmsFileAndFolderInfos: [
        makeFolder({
          name: "trash",
          itemId: "fold-del",
          description: "Folder creation",
        }),
      ],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete"));

    expect(await screen.findByText("Delete Folder")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() =>
      expect(mocks.deleteFolder).toHaveBeenCalledWith({
        folderId: "fold-del",
        configurationName: "MyStore",
        projectKey: "t1",
      }),
    );
    await waitFor(() =>
      expect(mocks.showSuccessToast).toHaveBeenCalledWith({
        description: "Folder Deleted successfully",
      }),
    );
  });

  it("surfaces an error toast when a fetch fails", () => {
    mocks.dmsState.failFetch = true;
    mocks.dmsState.error = "network down";
    renderDetail();
    expect(mocks.showErrorToast).toHaveBeenCalledWith({ errors: "network down" });
  });

  it("renders icons for image, video, audio, spreadsheet and unknown files", async () => {
    mocks.dmsState.response = {
      dmsFileAndFolderInfos: [
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
      dmsFileAndFolderInfos: [
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
      dmsFileAndFolderInfos: [
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
      dmsFileAndFolderInfos: [
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

  it("shows an error toast when folder delete reports failure", async () => {
    const user = userEvent.setup();
    mocks.deleteFolder.mockResolvedValue({ isSuccess: false });
    mocks.dmsState.response = {
      dmsFileAndFolderInfos: [
        makeFolder({ name: "keepdir", itemId: "fold-keep" }),
      ],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete"));
    await screen.findByText("Delete Folder");
    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() =>
      expect(mocks.showErrorToast).toHaveBeenCalledWith({
        errors: "Something went wrong",
      }),
    );
  });

  it("shows an error toast when folder delete throws", async () => {
    const user = userEvent.setup();
    mocks.deleteFolder.mockRejectedValue(new Error("folder boom"));
    mocks.dmsState.response = {
      dmsFileAndFolderInfos: [
        makeFolder({ name: "boomdir", itemId: "fold-boom" }),
      ],
      totalCount: 1,
    };
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByText("Delete"));
    await screen.findByText("Delete Folder");
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
    setLocation(`/?id=cfg-1&folderId=f2&path=${path}`);
    mocks.dmsState.response = { dmsFileAndFolderInfos: [], totalCount: 0 };
    renderDetail();

    // Clicking the strategy root resets folder navigation to the top level.
    await user.click(screen.getByText("S3Compatible"));
    expect(mocks.navigate).toHaveBeenCalledWith("?id=cfg-1");

    // Clicking an intermediate crumb navigates to that folder level.
    mocks.navigate.mockClear();
    await user.click(screen.getByText("Level1"));
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.stringContaining("folderId=f1"),
    );
  });

  it("deletes a folder from the list view", async () => {
    const user = userEvent.setup();
    mocks.deleteFolder.mockResolvedValue({ isSuccess: true });
    mocks.dmsState.response = {
      dmsFileAndFolderInfos: [
        makeFolder({ name: "listdir", itemId: "fold-list" }),
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
    await screen.findByText("Delete Folder");
    await user.click(screen.getByRole("button", { name: /^yes$/i }));

    await waitFor(() =>
      expect(mocks.deleteFolder).toHaveBeenCalledWith({
        folderId: "fold-list",
        configurationName: "MyStore",
        projectKey: "t1",
      }),
    );
  });

  it("deletes a file from the list view and shows its size", async () => {
    const user = userEvent.setup();
    mocks.deleteFile.mockResolvedValue({ isSuccess: true });
    mocks.dmsState.response = {
      dmsFileAndFolderInfos: [
        makeFile({
          name: "listfile.csv",
          extension: ".csv",
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
});
