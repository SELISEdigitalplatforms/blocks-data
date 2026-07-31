import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { TEST_TENANT_ID } from "@/test-utils/__mocks__";
import {
  mockStorageConfigList,
  mockSaveAmazonConfigPayload,
  mockDeleteConfigPayload,
  mockSuccessResponse,
  mockDeleteSuccessResponse,
} from "../test-utils/__mocks__";
import { storageService } from "../services/storage.service";
import {
  useGetStorageConfigurations,
  useSaveStorageConfiguration,
  useDeleteStorageConfiguration,
} from "./use-storage-configuration";

const mockGetState = vi.fn(() => ({
  selectedProject: { tenantId: TEST_TENANT_ID },
}));
vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: { getState: () => mockGetState() },
}));

vi.mock("../services/storage.service", () => ({
  storageService: {
    configuration: {
      gets: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("Storage Configuration Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue({
      selectedProject: { tenantId: TEST_TENANT_ID },
    });
  });

  describe("useGetStorageConfigurations", () => {
    it("should fetch storage configurations successfully", async () => {
      vi.mocked(storageService.configuration.gets).mockResolvedValue(
        mockStorageConfigList,
      );

      const { result } = renderHook(() => useGetStorageConfigurations(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockStorageConfigList);
      expect(storageService.configuration.gets).toHaveBeenCalledWith(
        TEST_TENANT_ID,
      );
    });

    it("should fall back to an empty projectKey when no project is selected", async () => {
      mockGetState.mockReturnValue({ selectedProject: undefined } as never);
      vi.mocked(storageService.configuration.gets).mockResolvedValue([]);

      const { result } = renderHook(() => useGetStorageConfigurations(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(storageService.configuration.gets).toHaveBeenCalledWith("");
    });

    it("should expose the error state when the request fails", async () => {
      vi.mocked(storageService.configuration.gets).mockRejectedValue(
        new Error("network"),
      );

      const { result } = renderHook(() => useGetStorageConfigurations(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  describe("useSaveStorageConfiguration", () => {
    it("should save a configuration successfully", async () => {
      vi.mocked(storageService.configuration.save).mockResolvedValue(
        mockSuccessResponse,
      );

      const { result } = renderHook(() => useSaveStorageConfiguration(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockSaveAmazonConfigPayload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(storageService.configuration.save).toHaveBeenCalledWith(
        mockSaveAmazonConfigPayload,
        expect.anything(),
      );
      expect(result.current.data).toEqual(mockSuccessResponse);
    });

    it("should still resolve when the API reports isSuccess=false", async () => {
      vi.mocked(storageService.configuration.save).mockResolvedValue({
        errors: { name: "duplicate" },
        isSuccess: false,
      });

      const { result } = renderHook(() => useSaveStorageConfiguration(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockSaveAmazonConfigPayload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.isSuccess).toBe(false);
    });

    it("should surface mutation errors", async () => {
      vi.mocked(storageService.configuration.save).mockRejectedValue(
        new Error("save failed"),
      );

      const { result } = renderHook(() => useSaveStorageConfiguration(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockSaveAmazonConfigPayload);
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useDeleteStorageConfiguration", () => {
    it("should delete a configuration successfully", async () => {
      vi.mocked(storageService.configuration.delete).mockResolvedValue(
        mockDeleteSuccessResponse,
      );

      const { result } = renderHook(() => useDeleteStorageConfiguration(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockDeleteConfigPayload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(storageService.configuration.delete).toHaveBeenCalledWith(
        mockDeleteConfigPayload,
        expect.anything(),
      );
    });

    it("should surface delete errors", async () => {
      vi.mocked(storageService.configuration.delete).mockRejectedValue(
        new Error("delete failed"),
      );

      const { result } = renderHook(() => useDeleteStorageConfiguration(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(mockDeleteConfigPayload);
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
