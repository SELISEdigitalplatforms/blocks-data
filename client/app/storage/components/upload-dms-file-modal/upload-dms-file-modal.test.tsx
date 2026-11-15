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

  const nameError =
    "Name must not be blank, contain a path separator or control characters, or have leading or trailing whitespace.";

  async function uploadOneFileExpectingFailure(fileName = "doc.txt") {
    render(<UploadDmsFileModal {...baseProps} />);
    addFile(fileName);
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledTimes(1));
    return showErrorToast.mock.calls[0][0] as { errors: string };
  }

  it("H8: shows the server's Name message in the per-file error toast and keeps the dialog open with the file", async () => {
    presignedMutate.mockResolvedValue({ isSuccess: false, errors: { Name: nameError } });

    const toast = await uploadOneFileExpectingFailure("e2e.txt");

    expect(toast.errors).toBe(`e2e.txt: ${nameError}`);
    expect(uploadfileMutate).not.toHaveBeenCalled();
    expect(showSuccessToast).not.toHaveBeenCalled();
    expect(baseProps.onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("e2e.txt")).toBeInTheDocument();
  });

  it("H8: shows the first message when the server returns several properties", async () => {
    presignedMutate.mockResolvedValue({ isSuccess: false, errors: { Name: "Name is required.", ConfigurationName: "other" } });

    const toast = await uploadOneFileExpectingFailure();

    expect(toast.errors).toBe("doc.txt: Name is required.");
  });

  it("H11: falls back to the translated generic message when the rejection has no Errors", async () => {
    presignedMutate.mockResolvedValue({ isSuccess: false });

    const toast = await uploadOneFileExpectingFailure();

    expect(toast.errors).toBe("doc.txt: Failed to get upload URL");
  });

  it("H11: falls back to the generic message when Errors holds no text", async () => {
    presignedMutate.mockResolvedValue({ isSuccess: false, errors: { Name: "" } });

    const toast = await uploadOneFileExpectingFailure();

    expect(toast.errors).toBe("doc.txt: Failed to get upload URL");
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
  describe("upload size limit (blocks-data#441)", () => {
    const MB = 1024 * 1024;

    /** A file whose reported size is `size` without allocating it. */
    function sizedFile(name: string, size: number) {
      const file = new File(["x"], name, { type: "text/plain" });
      Object.defineProperty(file, "size", { value: size });
      return file;
    }

    function selectFiles(...selected: File[]) {
      const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: selected } });
    }

    it("H4: describes the configured 100 MB limit", () => {
      render(<UploadDmsFileModal {...baseProps} maxFileSizeInBytes={100 * MB} />);
      expect(
        screen.getByText("Add up to 10 files to this directory. Each file can be up to 100 MB."),
      ).toBeInTheDocument();
    });

    it("H5: accepts a file of exactly the 100 MB limit and enables Upload", async () => {
      render(<UploadDmsFileModal {...baseProps} maxFileSizeInBytes={100 * MB} />);
      selectFiles(sizedFile("limit.bin", 100 * MB));
      await waitFor(() => expect(screen.getByText("limit.bin")).toBeInTheDocument());
      expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled();
      expect(showErrorToast).not.toHaveBeenCalled();
    });

    it("C1: refuses a file one byte over the limit with the size toast and sends no request", async () => {
      render(<UploadDmsFileModal {...baseProps} maxFileSizeInBytes={100 * MB} />);
      selectFiles(sizedFile("over.bin", 100 * MB + 1));
      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith({ errors: "File is too large. Max size is 100MB" }),
      );
      expect(screen.queryByText("over.bin")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
      expect(presignedMutate).not.toHaveBeenCalled();
    });

    it("C3: caps a configured limit above 100 MB at 100 MB in the description and the drop zone", async () => {
      render(<UploadDmsFileModal {...baseProps} maxFileSizeInBytes={200 * MB} />);
      expect(screen.getByText(/Each file can be up to 100 MB\./)).toBeInTheDocument();
      selectFiles(sizedFile("over.bin", 100 * MB + 1));
      await waitFor(() =>
        expect(showErrorToast).toHaveBeenCalledWith({ errors: "File is too large. Max size is 100MB" }),
      );
      expect(screen.queryByText("over.bin")).not.toBeInTheDocument();
    });

    it("keeps the 5 MB default when no limit is configured", () => {
      render(<UploadDmsFileModal {...baseProps} maxFileSizeInBytes={0} />);
      expect(screen.getByText(/Each file can be up to 5 MB\./)).toBeInTheDocument();
    });

    it("H6: declares the exact size in the presign request and PUTs with the returned headers", async () => {
      presignedMutate.mockResolvedValue({
        isSuccess: true,
        uploadUrl: "https://upload",
        fileId: "file-1",
        fileVersionId: "version-1",
        uploadCompletionRequired: false,
        requiredHeaders: { "x-ms-blob-type": "BlockBlob" },
      });
      render(<UploadDmsFileModal {...baseProps} maxFileSizeInBytes={100 * MB} />);
      const file = sizedFile("limit.bin", 100 * MB);
      selectFiles(file);
      await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Upload" }));
      await waitFor(() => expect(showSuccessToast).toHaveBeenCalled());
      expect(presignedMutate).toHaveBeenCalledWith(expect.objectContaining({ sizeInBytes: 100 * MB }));
      expect(uploadfileMutate).toHaveBeenCalledWith({
        url: "https://upload",
        file,
        headers: { "x-ms-blob-type": "BlockBlob" },
      });
    });

    it("C4: maps a declared-size refusal to an English message naming the file and keeps the dialog open", async () => {
      presignedMutate.mockResolvedValue({
        isSuccess: false,
        errors: { SizeInBytes: "declared_size_exceeds_maximum_allowed" },
      });
      render(<UploadDmsFileModal {...baseProps} maxFileSizeInBytes={100 * MB} />);
      selectFiles(sizedFile("big.bin", 10));
      await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Upload" }));
      await waitFor(() => expect(showErrorToast).toHaveBeenCalledTimes(1));

      const { errors } = showErrorToast.mock.calls[0][0] as { errors: string };
      expect(errors).toBe("big.bin: File is larger than the 100 MB upload limit");
      expect(errors).not.toContain("declared_size_exceeds_maximum_allowed");
      expect(uploadfileMutate).not.toHaveBeenCalled();
      expect(showSuccessToast).not.toHaveBeenCalled();
      expect(baseProps.onOpenChange).not.toHaveBeenCalledWith(false);
      expect(screen.getByText("big.bin")).toBeInTheDocument();
    });

    it("C5: maps a completion size rejection to an English message and does not report success", async () => {
      presignedMutate.mockResolvedValue({
        isSuccess: true,
        uploadUrl: "https://upload",
        fileId: "file-1",
        fileVersionId: "version-1",
        uploadCompletionRequired: true,
      });
      completeUploadMutate.mockResolvedValue({
        verificationStatus: "Rejected",
        rejectionReason: "actual_size_exceeds_maximum_allowed",
      });
      render(<UploadDmsFileModal {...baseProps} maxFileSizeInBytes={100 * MB} />);
      addFile("small.txt");
      await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Upload" }));
      await waitFor(() => expect(showErrorToast).toHaveBeenCalledTimes(1));

      const { errors } = showErrorToast.mock.calls[0][0] as { errors: string };
      expect(errors).toBe("small.txt: rejected (file is larger than the 100 MB upload limit)");
      expect(showSuccessToast).not.toHaveBeenCalled();
      expect(baseProps.onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it("H12: keeps at most two files in flight, starts them in selection order and reports each outcome", async () => {
      // A file starts when the dialog reads it for its checksum; it finishes when its PUT (or its refusal) settles.
      const started: string[] = [];
      const finish = new Map<string, () => void>();
      let inFlight = 0;
      let maxInFlight = 0;
      const trackedFile = (name: string) => {
        const file = sizedFile(name, 1);
        Object.defineProperty(file, "arrayBuffer", {
          value: () => {
            started.push(name);
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            return Promise.resolve(new ArrayBuffer(1));
          },
        });
        return file;
      };
      presignedMutate.mockImplementation(({ name: fileName }: { name: string }) => {
        if (fileName === "c.txt") {
          inFlight -= 1;
          return Promise.resolve({ isSuccess: false, errors: { Name: "bad name" } });
        }
        return Promise.resolve({ isSuccess: true, uploadUrl: "https://upload", fileId: fileName, uploadCompletionRequired: false });
      });
      uploadfileMutate.mockImplementation(
        ({ file }: { file: File }) =>
          new Promise<void>((resolve) => {
            finish.set(file.name, () => {
              inFlight -= 1;
              resolve();
            });
          }),
      );

      render(<UploadDmsFileModal {...baseProps} />);
      selectFiles(trackedFile("a.txt"), trackedFile("b.txt"), trackedFile("c.txt"));
      await waitFor(() => expect(screen.getByRole("button", { name: "Upload" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Upload" }));

      await waitFor(() => expect(finish.size).toBe(2));
      expect(started).toEqual(["a.txt", "b.txt"]);

      finish.get("b.txt")!();
      await waitFor(() => expect(started).toEqual(["a.txt", "b.txt", "c.txt"]));
      finish.get("a.txt")!();

      await waitFor(() => expect(showSuccessToast).toHaveBeenCalledTimes(1));
      expect(maxInFlight).toBe(2);
      expect(showSuccessToast).toHaveBeenCalledWith({ description: "2 file(s) uploaded successfully!" });
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "c.txt: bad name" });
    });
  });
});
