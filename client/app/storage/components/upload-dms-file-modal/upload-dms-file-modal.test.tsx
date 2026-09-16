import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const presignedMutate = vi.fn();
const uploadfileMutate = vi.fn();
const completeUploadMutate = vi.fn();
const showSuccessToast = vi.fn();
const showErrorToast = vi.fn();

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: () => ({ selectedProject: { tenantId: "tenant-1" } }),
}));
vi.mock("@/hooks/use-toast", () => ({
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));
vi.mock("@/storage/hooks/use-storage-file", () => ({
  useGetPreSignedUrlForUpload: () => ({ mutateAsync: presignedMutate }),
  useUploadFile: () => ({ mutateAsync: uploadfileMutate }),
  useCompleteUpload: () => ({ mutateAsync: completeUploadMutate }),
}));

import { UploadDmsFileModal } from "./upload-dms-file-modal";

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  configurationName: "cfg",
  name: "cfg-name",
  parentId: "parent-1",
  dmsWorkspaceId: "ws-1",
  dmsWorkspaceName: "ws-name",
};

function addFile(name = "doc.txt") {
  // Dialog content is portaled to document.body, not inside `container`.
  const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["data"], name, { type: "text/plain" });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as unknown as { URL: { createObjectURL: unknown; revokeObjectURL: unknown } }
  ).URL.createObjectURL = vi.fn(() => "blob:url");
  (globalThis as unknown as { URL: { revokeObjectURL: unknown } }).URL.revokeObjectURL = vi.fn();
  presignedMutate.mockResolvedValue({
    isSuccess: true,
    uploadUrl: "https://upload",
    fileId: "file-1",
    fileVersionId: "version-1",
    uploadCompletionRequired: false,
  });
  uploadfileMutate.mockResolvedValue({});
  completeUploadMutate.mockResolvedValue({ verificationStatus: "Verified" });
});

describe("UploadDmsFileModal", () => {
  it("renders the header and disabled Upload button with no files", () => {
    render(<UploadDmsFileModal {...baseProps} />);
    expect(screen.getByText("Upload File")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("enables Upload and shows a preview once a file is added", async () => {
    render(<UploadDmsFileModal {...baseProps} />);
    addFile();
    await waitFor(() => expect(screen.getByText("doc.txt")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
  });

  it("removes an added file via its remove button", async () => {
    render(<UploadDmsFileModal {...baseProps} />);
    addFile();
    await waitFor(() => expect(screen.getByText("doc.txt")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Remove doc.txt" }));
    await waitFor(() => expect(screen.queryByText("doc.txt")).not.toBeInTheDocument());
  });

  it("runs the presigned + PUT pipeline and reports success", async () => {
    const onOpenChange = vi.fn();
    const onUploadSuccess = vi.fn();
    render(
      <UploadDmsFileModal
        {...baseProps}
        onOpenChange={onOpenChange}
        onUploadSuccess={onUploadSuccess}
      />,
    );
    addFile();
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(presignedMutate).toHaveBeenCalled());
    await waitFor(() => expect(uploadfileMutate).toHaveBeenCalled());
    expect(presignedMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "doc.txt", projectKey: "tenant-1" }),
    );
    expect(showSuccessToast).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onUploadSuccess).toHaveBeenCalled();
    // completion was not required for this upload, so it must not be called
    expect(completeUploadMutate).not.toHaveBeenCalled();
  });

  it("throws and surfaces an error when the presigned URL request fails", async () => {
    presignedMutate.mockResolvedValue({ isSuccess: false });
    render(<UploadDmsFileModal {...baseProps} />);
    addFile();
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
    expect(uploadfileMutate).not.toHaveBeenCalled();
  });

  it("defaults storage access to Private and sends it in the presigned-URL request", async () => {
    render(<UploadDmsFileModal {...baseProps} />);
    expect(screen.getByRole("button", { name: "Private" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    addFile();
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() =>
      expect(presignedMutate).toHaveBeenCalledWith(
        expect.objectContaining({ accessModifier: "Private" }),
      ),
    );
  });

  it("sends Public when the Public storage-access option is selected", async () => {
    render(<UploadDmsFileModal {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Public" }));
    addFile();
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() =>
      expect(presignedMutate).toHaveBeenCalledWith(
        expect.objectContaining({ accessModifier: "Public" }),
      ),
    );
  });

  it("calls complete-upload and reports success only when completion is required and Verified", async () => {
    presignedMutate.mockResolvedValue({
      isSuccess: true,
      uploadUrl: "https://upload",
      fileId: "file-1",
      fileVersionId: "version-1",
      uploadCompletionRequired: true,
      requiredHeaders: { "x-ms-blob-type": "BlockBlob" },
    });
    completeUploadMutate.mockResolvedValue({ verificationStatus: "Verified" });

    render(<UploadDmsFileModal {...baseProps} />);
    addFile();
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(completeUploadMutate).toHaveBeenCalledWith({
        fileId: "file-1",
        fileVersionId: "version-1",
      }),
    );
    expect(uploadfileMutate).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { "x-ms-blob-type": "BlockBlob" } }),
    );
    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
  });

  it("surfaces a rejection distinctly from an upload failure and does not report success", async () => {
    presignedMutate.mockResolvedValue({
      isSuccess: true,
      uploadUrl: "https://upload",
      fileId: "file-1",
      fileVersionId: "version-1",
      uploadCompletionRequired: true,
    });
    completeUploadMutate.mockResolvedValue({
      verificationStatus: "Rejected",
      rejectionReason: "real_file_type_does_not_match_extension",
    });

    render(<UploadDmsFileModal {...baseProps} />);
    addFile();
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: expect.stringContaining("real_file_type_does_not_match_extension"),
        }),
      ),
    );
    expect(showSuccessToast).not.toHaveBeenCalled();
  });

  it("uploads every file independently: one rejection does not hide another file's success", async () => {
    presignedMutate.mockImplementation(({ name: fileName }: { name: string }) =>
      Promise.resolve({
        isSuccess: true,
        uploadUrl: "https://upload",
        fileId: fileName,
        fileVersionId: `${fileName}-v1`,
        uploadCompletionRequired: true,
      }),
    );
    completeUploadMutate.mockImplementation(({ fileId }: { fileId: string }) =>
      Promise.resolve(
        fileId === "bad.txt"
          ? { verificationStatus: "Rejected", rejectionReason: "checksum_mismatch" }
          : { verificationStatus: "Verified" },
      ),
    );

    render(<UploadDmsFileModal {...baseProps} />);
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    const good = new File(["ok"], "good.txt", { type: "text/plain" });
    const bad = new File(["bad"], "bad.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [good, bad] } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith(
        expect.objectContaining({ errors: expect.stringContaining("bad.txt") }),
      ),
    );
  });
});
