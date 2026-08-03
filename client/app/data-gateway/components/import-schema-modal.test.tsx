import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui-kits/dialog/dialog";

const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
const getPresignedUrl = vi.fn();
const uploadFileMutate = vi.fn();
const uploadSchemaFile = vi.fn();
const getFileByFileId = vi.fn();
let runtimeUrl = "";

vi.mock("@/data-gateway/hooks/use-configuration", () => ({
  useImportSchemaFile: () => ({ mutateAsync: uploadSchemaFile, isPending: false }),
}));

vi.mock("@/storage/hooks/use-storage-file", () => ({
  useGetPreSignedUrlForUpload: () => ({ mutateAsync: getPresignedUrl, isPending: false }),
  useUploadFile: () => ({ mutateAsync: uploadFileMutate, isPending: false }),
}));

vi.mock("@/storage/services/storage.service", () => ({
  storageService: { file: { getFileByFileId: (...a: unknown[]) => getFileByFileId(...a) } },
}));

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));

vi.mock("@/lib/runtime-env", () => ({ getRuntimeEnv: () => runtimeUrl }));

import ImportSchemaModal from "./import-schema-modal";

function renderModal() {
  const onClose = vi.fn();
  const { container } = render(
    <Dialog open onOpenChange={vi.fn()}>
      <ImportSchemaModal projectKey="pk" onClose={onClose} />
    </Dialog>,
  );
  return { onClose, container };
}

async function selectFile(user: ReturnType<typeof userEvent.setup>, _container: HTMLElement) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['{"a":1}'], "schema.json", { type: "application/json" });
  await user.upload(input, file);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Upload" })).not.toBeDisabled(),
  );
}

describe("ImportSchemaModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeUrl = "";
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

  it("downloads the JSON template when a URL is configured", async () => {
    runtimeUrl = "https://example.com/template.json";
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, blob: async () => new Blob(["{}"]) } as Response);
    const createObjectURL = vi.fn(() => "blob:x");
    const revokeObjectURL = vi.fn();
    (window.URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (window.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    renderModal();
    await user.click(screen.getByRole("button", { name: /Template/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
    fetchSpy.mockRestore();
    clickSpy.mockRestore();
  });

  it("uploads a selected file and shows a success toast", async () => {
    const user = userEvent.setup();
    getPresignedUrl.mockResolvedValue({ isSuccess: true, fileId: "f1", uploadUrl: "u" });
    uploadFileMutate.mockResolvedValue(undefined);
    getFileByFileId.mockResolvedValue({ itemId: "f1", url: "url" });
    uploadSchemaFile.mockResolvedValue(undefined);
    const { onClose, container } = renderModal();

    await selectFile(user, container);
    await user.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(showSuccessToast).toHaveBeenCalledWith({
        description: "Processing schema upload",
      }),
    );
    expect(getPresignedUrl).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error toast when the presigned URL request fails", async () => {
    const user = userEvent.setup();
    getPresignedUrl.mockResolvedValue({ isSuccess: false });
    const { container } = renderModal();

    await selectFile(user, container);
    await user.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({
        errors: "Something went wrong during upload",
      }),
    );
  });
});
