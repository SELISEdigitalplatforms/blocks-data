import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui-kits/dialog/dialog";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();

vi.mock("@/data-gateway/hooks/use-configuration", () => ({
  useImportSchemaFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/storage/hooks/use-storage-file", () => ({
  useGetPreSignedUrlForUpload: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/storage/services/storage.service", () => ({
  storageService: { file: { getFileByFileId: vi.fn() } },
}));

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

// No configured template URL -> downloadTemplate takes the error path.
vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => "" }));

import ImportSchemaModal from "./import-schema-modal";

function renderModal() {
  const onClose = vi.fn();
  render(
    <Dialog open onOpenChange={vi.fn()}>
      <ImportSchemaModal projectKey="pk" onClose={onClose} />
    </Dialog>,
  );
  return { onClose };
}

describe("ImportSchemaModal", () => {
  beforeEach(() => {
    showErrorToast.mockReset();
    showSuccessToast.mockReset();
  });

  it("renders the uploader, warning and a disabled Upload button", () => {
    renderModal();
    expect(screen.getByText("Import")).toBeInTheDocument();
    expect(screen.getByText("JSON Format")).toBeInTheDocument();
    expect(screen.getByText(/Click to upload/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("calls onClose from the Cancel button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error toast when the template cannot be downloaded", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: /Template/ }));
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: "Failed to download template",
      }),
    );
  });
});
