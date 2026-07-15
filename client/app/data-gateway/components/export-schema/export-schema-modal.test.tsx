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

vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "t1" } }),
}));

vi.mock("@/hooks/use-notification-listener", () => ({
  useNotificationListener: vi.fn(),
}));

const toast = vi.fn();
const showErrorToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toast(...args),
  showErrorToast: (...args: unknown[]) => showErrorToast(...args),
}));

vi.mock("@/storage/services/storage.service", () => ({
  storageService: { file: { getFilesDownloadUrl: vi.fn() } },
}));

import ExportSchemaModal from "./export-schema-modal";

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
});
