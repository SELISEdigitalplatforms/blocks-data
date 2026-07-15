import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { apiSettingsService } from "../services/api-settings.service";
import {
  useGetApiEndpoints,
  useUpdateApiEndpoint,
  useBulkUpdateApiEndpoints,
  useRemoveApiEndpoints,
} from "./use-api-settings";

vi.mock("../services/api-settings.service", () => ({
  apiSettingsService: {
    getEndpoints: vi.fn(),
    updateEndpoint: vi.fn(),
    bulkUpdate: vi.fn(),
    removeEndpoints: vi.fn(),
  },
}));

const getEndpointsResponse = {
  page: 0,
  pageSize: 100,
  totalPages: 1,
  totalCount: 1,
  data: [{ itemId: "id-1" }],
  errors: null,
};

describe("use-api-settings hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useGetApiEndpoints", () => {
    it("fetches endpoints when a project key is provided", async () => {
      vi.mocked(apiSettingsService.getEndpoints).mockResolvedValue(getEndpointsResponse as never);

      const options = { projectKey: "pk", page: 0, pageSize: 100 };
      const { result } = renderHook(() => useGetApiEndpoints(options), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(getEndpointsResponse);
      expect(apiSettingsService.getEndpoints).toHaveBeenCalledWith(options);
    });

    it("stays disabled (does not call the service) when project key is empty", async () => {
      vi.mocked(apiSettingsService.getEndpoints).mockResolvedValue(getEndpointsResponse as never);

      const { result } = renderHook(() => useGetApiEndpoints({ projectKey: "" }), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(apiSettingsService.getEndpoints).not.toHaveBeenCalled();
    });

    it("surfaces an error when the service rejects", async () => {
      vi.mocked(apiSettingsService.getEndpoints).mockRejectedValue(new Error("boom"));

      const { result } = renderHook(() => useGetApiEndpoints({ projectKey: "pk" }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toEqual(new Error("boom"));
    });
  });

  describe("useUpdateApiEndpoint", () => {
    it("updates an endpoint successfully (wrapped mutationFn -> single arg)", async () => {
      vi.mocked(apiSettingsService.updateEndpoint).mockResolvedValue({ isSuccess: true } as never);

      const { result } = renderHook(() => useUpdateApiEndpoint(), { wrapper: createWrapper() });

      const payload = { projectKey: "pk", itemId: "id-1" } as never;
      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSettingsService.updateEndpoint).toHaveBeenCalledWith(payload);
    });

    it("reports an error when the update fails", async () => {
      vi.mocked(apiSettingsService.updateEndpoint).mockRejectedValue(new Error("fail"));

      const { result } = renderHook(() => useUpdateApiEndpoint(), { wrapper: createWrapper() });

      result.current.mutate({} as never);
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useBulkUpdateApiEndpoints", () => {
    it("bulk-updates endpoints successfully", async () => {
      vi.mocked(apiSettingsService.bulkUpdate).mockResolvedValue({ isSuccess: true } as never);

      const { result } = renderHook(() => useBulkUpdateApiEndpoints(), { wrapper: createWrapper() });

      const payload = { projectKey: "pk", itemIds: ["a", "b"] } as never;
      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSettingsService.bulkUpdate).toHaveBeenCalledWith(payload);
    });
  });

  describe("useRemoveApiEndpoints", () => {
    it("removes endpoints successfully", async () => {
      vi.mocked(apiSettingsService.removeEndpoints).mockResolvedValue({ isSuccess: true } as never);

      const { result } = renderHook(() => useRemoveApiEndpoints(), { wrapper: createWrapper() });

      const payload = { projectKey: "pk", itemIds: ["a"] } as never;
      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(apiSettingsService.removeEndpoints).toHaveBeenCalledWith(payload);
    });
  });
});
