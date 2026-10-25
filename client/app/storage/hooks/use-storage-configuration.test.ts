import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { TEST_TENANT_ID } from "@/test-utils/__mocks__";
import {
  mockStorageConfigList,
} from "../test-utils/__mocks__";
import { storageService } from "../services/storage.service";
import {
  useGetStorageConfigurations,
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
});
