/**
 * Shared mock factory functions for storage tests.
 *
 * IMPORTANT: vi.mock() is hoisted by Vitest and MUST be called directly in each
 * test file — it cannot be imported from a shared file. These factories provide
 * the mock return values to reduce duplication across test files.
 *
 * Factory names use the `mock` prefix so Vitest's hoisting allows referencing them.
 *
 * Usage in test files (vi.mock calls must be at the top level of the test file):
 *
 *   vi.mock("@/modules/identifier/state/use-project-store", () => mockProjectStoreFactory());
 *   vi.mock("@/lib/http-client", () => mockHttpClientFactory());
 *   vi.mock("@/storage/services/storage.service", () => mockStorageServiceFactory());
 */
import { vi } from "vitest";

export const mockStorageServiceFactory = () => ({
  storageService: {
    configuration: {
      gets: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    },
    file: {
      getFileByFileId: vi.fn(),
      deleteFileByFileId: vi.fn(),
      getPreSignedUrlForUpload: vi.fn(),
      getFilesInfoUrlForUpload: vi.fn(),
      updateFileAdditionalInfo: vi.fn(),
      getFilesDownloadUrl: vi.fn(),
    },
    uploadFile: vi.fn(),
    uploadFileToLocalStorage: vi.fn(),
    uploadPublicCertificateFile: vi.fn(),
    getFilesAndFolders: vi.fn(),
    uploadDmsFile: vi.fn(),
    createDmsFolder: vi.fn(),
  },
});
