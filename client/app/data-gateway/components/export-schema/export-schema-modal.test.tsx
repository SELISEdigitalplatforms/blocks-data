import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui-kits/dialog/dialog";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { SchemaExportOption } from "../../models/data-service";

const exportMutateAsync = vi.fn();

vi.mock("../../hooks/use-configuration", () => ({
  useSchemaExport: () => ({
    mutateAsync: exportMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

let notificationHandler:
  | ((data: unknown) => void | Promise<void>)
  | undefined;
vi.mock("@/hooks/use-notification-listener", () => ({
  useNotificationListener: (_event: string, handler: typeof notificationHandler) => {
    notificationHandler = handler;
  },
}));

const toast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toast(...args),
  showErrorToast: (...args: unknown[]) => showErrorToast(...args),
}));

const getFilesDownloadUrl = vi.fn();
vi.mock("@/storage/services/storage.service", () => ({
  storageService: { file: { getFilesDownloadUrl: (...a: unknown[]) => getFilesDownloadUrl(...a) } },
}));

import ExportSchemaModal from "./export-schema-modal";

const notification = (fileId: unknown) => ({
  message: { denormalizedPayload: JSON.stringify({ Message: { FileId: fileId } }) },
});

function renderModal(onClose = vi.fn()) {
  const Wrapper = createWrapper();
  render(
    <Wrapper>
      <Dialog open onOpenChange={vi.fn()}>
        <ExportSchemaModal onClose={onClose} />
      </Dialog>
    </Wrapper>,
  );
  return { onClose };
}

describe("ExportSchemaModal", () => {
  beforeEach(() => {
    exportMutateAsync.mockReset();
    toast.mockReset();
    showErrorToast.mockReset();
    getFilesDownloadUrl.mockReset();
    notificationHandler = undefined;
  });

  it("renders the export option rows on the first step", () => {
    renderModal();
    expect(screen.getByText("Export Schema")).toBeInTheDocument();
    expect(screen.getByText("Access Policies")).toBeInTheDocument();
    expect(screen.getByText("Validation Rules")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select file type" }),
    ).toBeInTheDocument();
  });

  it("advances to the file-type step and back", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: "Select file type" }));
    expect(screen.getByText("JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("button", { name: "Select file type" }),
    ).toBeInTheDocument();
  });

  it("exports the Schema-only option by default and closes", async () => {
    const user = userEvent.setup();
    exportMutateAsync.mockResolvedValue({
      isSuccess: true,
      data: { itemId: "file-1" },
    });
    const { onClose } = renderModal();

    await user.click(screen.getByRole("button", { name: "Select file type" }));
    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(exportMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: "t1",
        exportOption: SchemaExportOption.Schema,
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("exports the combined 'All' option when both optional sections are selected", async () => {
    const user = userEvent.setup();
    exportMutateAsync.mockResolvedValue({
      isSuccess: true,
      data: { itemId: "file-2" },
    });
    renderModal();

    await user.click(screen.getByText("Access Policies"));
    await user.click(screen.getByText("Validation Rules"));
    await user.click(screen.getByRole("button", { name: "Select file type" }));
    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(exportMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ exportOption: SchemaExportOption.All }),
    );
  });

  it("surfaces an error toast when the export request is not successful", async () => {
    const user = userEvent.setup();
    exportMutateAsync.mockResolvedValue({ isSuccess: false, message: "nope" });
    renderModal();

    await user.click(screen.getByRole("button", { name: "Select file type" }));
    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(showErrorToast).toHaveBeenCalled();
  });

  it("toggles all optional sections via the select-all checkbox", async () => {
    const user = userEvent.setup();
    exportMutateAsync.mockResolvedValue({ isSuccess: true, data: { itemId: "f" } });
    renderModal();

    await user.click(screen.getByLabelText("Select all"));
    await user.click(screen.getByRole("button", { name: "Select file type" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(exportMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ exportOption: SchemaExportOption.All }),
    );
  });

  it("errors when the export succeeds but returns no file id", async () => {
    const user = userEvent.setup();
    exportMutateAsync.mockResolvedValue({ isSuccess: true, data: {} });
    renderModal();

    await user.click(screen.getByRole("button", { name: "Select file type" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(showErrorToast).toHaveBeenCalled();
  });

  it("downloads the exported file when its completion notification arrives", async () => {
    const user = userEvent.setup();
    exportMutateAsync.mockResolvedValue({ isSuccess: true, data: { itemId: "file-1" } });
    getFilesDownloadUrl.mockResolvedValue({
      isSuccess: true,
      url: "https://example.com/f.json",
      name: "export.json",
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    renderModal();

    await user.click(screen.getByRole("button", { name: "Select file type" }));
    await user.click(screen.getByRole("button", { name: "Export" }));

    await notificationHandler?.(notification("file-1"));
    expect(getFilesDownloadUrl).toHaveBeenCalledWith({
      fileId: "file-1",
      projectKey: "t1",
    });
    expect(clickSpy).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "success" }),
    );
    clickSpy.mockRestore();
  });

  it("shows a destructive toast when the download lookup fails", async () => {
    const user = userEvent.setup();
    exportMutateAsync.mockResolvedValue({ isSuccess: true, data: { itemId: "file-9" } });
    getFilesDownloadUrl.mockRejectedValue(new Error("boom"));
    renderModal();

    await user.click(screen.getByRole("button", { name: "Select file type" }));
    await user.click(screen.getByRole("button", { name: "Export" }));

    await notificationHandler?.(notification("file-9"));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });

  it("ignores notifications for file ids it is not tracking", async () => {
    renderModal();
    await notificationHandler?.(notification("unknown-id"));
    expect(getFilesDownloadUrl).not.toHaveBeenCalled();
  });
});
