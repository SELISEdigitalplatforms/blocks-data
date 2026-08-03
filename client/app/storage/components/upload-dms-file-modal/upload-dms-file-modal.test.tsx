import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const presignedMutate = vi.fn();
const uploadfileMutate = vi.fn();
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
  (globalThis as unknown as { URL: { createObjectURL: unknown; revokeObjectURL: unknown } }).URL.createObjectURL =
    vi.fn(() => "blob:url");
  (globalThis as unknown as { URL: { revokeObjectURL: unknown } }).URL.revokeObjectURL = vi.fn();
  presignedMutate.mockResolvedValue({
    isSuccess: true,
    uploadUrl: "https://upload",
    fileId: "file-1",
  });
  uploadfileMutate.mockResolvedValue({});
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
    const removeBtn = document.body.querySelector(".rounded-full") as HTMLButtonElement;
    fireEvent.click(removeBtn);
    await waitFor(() => expect(screen.queryByText("doc.txt")).not.toBeInTheDocument());
  });

  it("runs the presigned + PUT pipeline and reports success", async () => {
    const onOpenChange = vi.fn();
    const onUploadSuccess = vi.fn();
    render(
      <UploadDmsFileModal {...baseProps} onOpenChange={onOpenChange} onUploadSuccess={onUploadSuccess} />,
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
});
