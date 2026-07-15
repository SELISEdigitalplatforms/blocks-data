import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { TEST_TENANT_ID } from "@/test-utils/__mocks__";
import {
  mockGetFileByIdResponse,
  mockGetFilesInfoResponse,
  mockPreSignedUrlResponse,
  mockPreSignedUrlPayload,
  mockGetFilePayload,
  mockGetFilesInfoPayload,
  mockDeleteFilePayload,
  mockGetDmsFileAndFolderResponse,
  mockGetDmsPayload,
  mockUploadDmsFileResponse,
  mockUploadDmsFilePayload,
  mockCreateDmsFolderPayload,
  mockSuccessResponse,
  mockDeleteSuccessResponse,
} from "../test-utils/__mocks__";
import { storageService } from "../services/storage.service";
import {
  useGetPreSignedUrlForUpload,
  useUploadFile,
  useUploadFileToLocalStorage,
  useGetFile,
  useLazyGetFile,
  useDeleteFile,
  useDeleteFolder,
  useGetFilesInfo,
  useGetFilesDownload,
  usePublicCertificateFile,
  useGetDmsFileAndFolder,
  useUploadDmsFile,
  useCreateDmsFolder,
} from "./use-storage-file";

const mockGetState = vi.fn(() => ({
  selectedProject: { tenantId: TEST_TENANT_ID },
}));
vi.mock("@seliseblocks/blocks-kit", () => ({
  useProjectStore: { getState: () => mockGetState() },
}));

vi.mock("../services/storage.service", () => ({
  storageService: {
    file: {
      getFileByFileId: vi.fn(),
      deleteFileByFileId: vi.fn(),
      deleteFolderByFileId: vi.fn(),
      getPreSignedUrlForUpload: vi.fn(),
      getFilesInfoUrlForUpload: vi.fn(),
      getFilesDownloadUrl: vi.fn(),
    },
    uploadFile: vi.fn(),
    uploadFileToLocalStorage: vi.fn(),
    uploadPublicCertificateFile: vi.fn(),
    getFilesAndFolders: vi.fn(),
    uploadDmsFile: vi.fn(),
    createDmsFolder: vi.fn(),
  },
}));

describe("Storage File Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue({
      selectedProject: { tenantId: TEST_TENANT_ID },
    });
  });

  describe("useGetPreSignedUrlForUpload", () => {
    it("should request a pre-signed url", async () => {
      vi.mocked(storageService.file.getPreSignedUrlForUpload).mockResolvedValue(
        mockPreSignedUrlResponse,
      );

      const { result } = renderHook(() => useGetPreSignedUrlForUpload(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockPreSignedUrlPayload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(
        storageService.file.getPreSignedUrlForUpload,
      ).toHaveBeenCalledWith(mockPreSignedUrlPayload, expect.anything());
      expect(result.current.data).toEqual(mockPreSignedUrlResponse);
    });

    it("should surface errors", async () => {
      vi.mocked(storageService.file.getPreSignedUrlForUpload).mockRejectedValue(
        new Error("failed"),
      );

      const { result } = renderHook(() => useGetPreSignedUrlForUpload(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockPreSignedUrlPayload);
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useUploadFile", () => {
    it("should upload a file to a pre-signed url", async () => {
      vi.mocked(storageService.uploadFile).mockResolvedValue({});
      const payload = { url: "https://s3/upload", file: new File(["x"], "a.txt") };

      const { result } = renderHook(() => useUploadFile(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(storageService.uploadFile).toHaveBeenCalledWith(
        payload,
        expect.anything(),
      );
    });
  });

  describe("useUploadFileToLocalStorage", () => {
    it("should upload a file to local storage", async () => {
      vi.mocked(storageService.uploadFileToLocalStorage).mockResolvedValue(
        mockSuccessResponse,
      );
      const payload = { file: new File(["x"], "a.txt"), projectKey: "p" };

      const { result } = renderHook(() => useUploadFileToLocalStorage(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(storageService.uploadFileToLocalStorage).toHaveBeenCalledWith(
        payload,
        expect.anything(),
      );
    });
  });

  describe("useGetFile", () => {
    it("should fetch a file by id", async () => {
      vi.mocked(storageService.file.getFileByFileId).mockResolvedValue(
        mockGetFileByIdResponse,
      );

      const { result } = renderHook(() => useGetFile(mockGetFilePayload), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockGetFileByIdResponse);
      expect(storageService.file.getFileByFileId).toHaveBeenCalledWith(
        mockGetFilePayload,
      );
    });
  });

  describe("useLazyGetFile", () => {
    it("should fetch a file on demand via fetchFile", async () => {
      vi.mocked(storageService.file.getFileByFileId).mockResolvedValue(
        mockGetFileByIdResponse,
      );

      const { result } = renderHook(() => useLazyGetFile(), {
        wrapper: createWrapper(),
      });

      const data = await result.current.fetchFile(mockGetFilePayload);
      expect(data).toEqual(mockGetFileByIdResponse);
      expect(storageService.file.getFileByFileId).toHaveBeenCalledWith(
        mockGetFilePayload,
      );
    });
  });

  describe("useDeleteFile", () => {
    it("should delete a file", async () => {
      vi.mocked(storageService.file.deleteFileByFileId).mockResolvedValue(
        mockDeleteSuccessResponse,
      );

      const { result } = renderHook(() => useDeleteFile(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockDeleteFilePayload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(storageService.file.deleteFileByFileId).toHaveBeenCalledWith(
        mockDeleteFilePayload,
        expect.anything(),
      );
    });
  });

  describe("useDeleteFolder", () => {
    it("should delete a folder", async () => {
      vi.mocked(storageService.file.deleteFolderByFileId).mockResolvedValue(
        mockDeleteSuccessResponse,
      );

      const { result } = renderHook(() => useDeleteFolder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockDeleteFilePayload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(storageService.file.deleteFolderByFileId).toHaveBeenCalledWith(
        mockDeleteFilePayload,
        expect.anything(),
      );
    });
  });

  describe("useGetFilesInfo", () => {
    it("should fetch files info using the payload projectKey", async () => {
      vi.mocked(storageService.file.getFilesInfoUrlForUpload).mockResolvedValue(
        mockGetFilesInfoResponse,
      );

      const { result } = renderHook(
        () => useGetFilesInfo(mockGetFilesInfoPayload),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockGetFilesInfoResponse);
      expect(
        storageService.file.getFilesInfoUrlForUpload,
      ).toHaveBeenCalledWith(mockGetFilesInfoPayload);
    });

    it("should fall back to the store projectKey when payload has none", async () => {
      vi.mocked(storageService.file.getFilesInfoUrlForUpload).mockResolvedValue(
        mockGetFilesInfoResponse,
      );
      const payload = { ...mockGetFilesInfoPayload, projectKey: "" };

      const { result } = renderHook(() => useGetFilesInfo(payload), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(
        storageService.file.getFilesInfoUrlForUpload,
      ).toHaveBeenCalledWith(payload);
    });
  });

  describe("useGetFilesDownload", () => {
    it("should fetch a download url when enabled", async () => {
      vi.mocked(storageService.file.getFilesDownloadUrl).mockResolvedValue({
        url: "https://download",
      } as never);

      const meta = { fileId: "f1", projectKey: "p1" };
      const { result } = renderHook(() => useGetFilesDownload(meta), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(storageService.file.getFilesDownloadUrl).toHaveBeenCalledWith(meta);
    });

    it("should not fetch when disabled", () => {
      const meta = { fileId: "f1", projectKey: "p1" };
      const { result } = renderHook(
        () => useGetFilesDownload(meta, { enabled: false }),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe("idle");
      expect(storageService.file.getFilesDownloadUrl).not.toHaveBeenCalled();
    });
  });

  describe("usePublicCertificateFile", () => {
    it("should upload a public certificate", async () => {
      vi.mocked(storageService.uploadPublicCertificateFile).mockResolvedValue(
        mockSuccessResponse,
      );
      const payload = { file: new File(["x"], "cert.pem") };

      const { result } = renderHook(() => usePublicCertificateFile(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload as never);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(storageService.uploadPublicCertificateFile).toHaveBeenCalledWith(
        payload,
        expect.anything(),
      );
    });
  });

  describe("useGetDmsFileAndFolder", () => {
    it("should fetch DMS files and folders", async () => {
      vi.mocked(storageService.getFilesAndFolders).mockResolvedValue(
        mockGetDmsFileAndFolderResponse,
      );

      const { result } = renderHook(() => useGetDmsFileAndFolder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockGetDmsPayload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(storageService.getFilesAndFolders).toHaveBeenCalledWith(
        mockGetDmsPayload,
      );
      expect(result.current.data).toEqual(mockGetDmsFileAndFolderResponse);
    });
  });

  describe("useUploadDmsFile", () => {
    it("should upload a DMS file", async () => {
      vi.mocked(storageService.uploadDmsFile).mockResolvedValue(
        mockUploadDmsFileResponse,
      );

      const { result } = renderHook(() => useUploadDmsFile(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockUploadDmsFilePayload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(storageService.uploadDmsFile).toHaveBeenCalledWith(
        mockUploadDmsFilePayload,
      );
    });
  });

  describe("useCreateDmsFolder", () => {
    it("should create a DMS folder", async () => {
      vi.mocked(storageService.createDmsFolder).mockResolvedValue(
        mockSuccessResponse,
      );

      const { result } = renderHook(() => useCreateDmsFolder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockCreateDmsFolderPayload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(storageService.createDmsFolder).toHaveBeenCalledWith(
        mockCreateDmsFolderPayload,
      );
    });

    it("should surface errors", async () => {
      vi.mocked(storageService.createDmsFolder).mockRejectedValue(
        new Error("create failed"),
      );

      const { result } = renderHook(() => useCreateDmsFolder(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockCreateDmsFolderPayload);
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
