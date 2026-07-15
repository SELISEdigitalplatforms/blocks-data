import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { magicUrlService } from "@/magic-url/services/magic-url.service";
import {
  useGetMagicUrls,
  useGetMagicUrlById,
  useCreateMagicUrl,
  useSaveMagicUrlConfig,
  useGetMagicUrlConfig,
  useRemoveMagicUrl,
} from "./use-magic-url";

vi.mock("@/magic-url/services/magic-url.service", () => ({
  magicUrlService: {
    getMagicUrl: vi.fn(),
    getMagicUrls: vi.fn(),
    createMagicUrl: vi.fn(),
    saveMagicUrlConfig: vi.fn(),
    getMagicUrlConfig: vi.fn(),
    deactivateMagicLinks: vi.fn(),
  },
}));

describe("use-magic-url hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── useGetMagicUrls ────────────────────────────────────────────────────────
  describe("useGetMagicUrls", () => {
    const option = { projectKey: "pk", page: 1, pageSize: 10 } as never;

    it("should fetch magic urls successfully", async () => {
      const response = { data: [{ itemId: "1" }], errors: [], totalCount: 1 };
      vi.mocked(magicUrlService.getMagicUrls).mockResolvedValue(response as never);

      const { result } = renderHook(() => useGetMagicUrls(option), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(response);
      expect(magicUrlService.getMagicUrls).toHaveBeenCalledWith(option);
    });

    it("should stay disabled when there is no projectKey", () => {
      const { result } = renderHook(
        () => useGetMagicUrls({ projectKey: "", page: 1, pageSize: 10 } as never),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe("idle");
      expect(magicUrlService.getMagicUrls).not.toHaveBeenCalled();
    });

    it("should expose the error state when the request fails", async () => {
      vi.mocked(magicUrlService.getMagicUrls).mockRejectedValue(
        new Error("network"),
      );

      const { result } = renderHook(() => useGetMagicUrls(option), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  // ─── useGetMagicUrlById ─────────────────────────────────────────────────────
  describe("useGetMagicUrlById", () => {
    const option = { ItemId: "item-1", projectKey: "pk" } as never;

    it("should fetch a magic url by id successfully", async () => {
      const magicUrl = { itemId: "item-1", uri: "https://example.com" };
      vi.mocked(magicUrlService.getMagicUrl).mockResolvedValue(magicUrl as never);

      const { result } = renderHook(() => useGetMagicUrlById(option), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(magicUrl);
      expect(magicUrlService.getMagicUrl).toHaveBeenCalledWith(option);
    });

    it("should stay disabled without an ItemId", () => {
      const { result } = renderHook(
        () => useGetMagicUrlById({ ItemId: "", projectKey: "pk" } as never),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe("idle");
      expect(magicUrlService.getMagicUrl).not.toHaveBeenCalled();
    });
  });

  // ─── useCreateMagicUrl ──────────────────────────────────────────────────────
  describe("useCreateMagicUrl", () => {
    it("should create a magic url successfully", async () => {
      const payload = { uri: "https://example.com", name: "Test" } as never;
      const created = { itemId: "new-1" };
      vi.mocked(magicUrlService.createMagicUrl).mockResolvedValue(created as never);

      const { result } = renderHook(() => useCreateMagicUrl(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      // mutationFn wraps the service call, so it is invoked with only the payload.
      expect(magicUrlService.createMagicUrl).toHaveBeenCalledWith(payload);
      expect(result.current.data).toEqual(created);
    });

    it("should surface creation errors", async () => {
      vi.mocked(magicUrlService.createMagicUrl).mockRejectedValue(
        new Error("create failed"),
      );

      const { result } = renderHook(() => useCreateMagicUrl(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ uri: "https://example.com", name: "x" } as never);
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  // ─── useSaveMagicUrlConfig ──────────────────────────────────────────────────
  describe("useSaveMagicUrlConfig", () => {
    it("should save the config successfully", async () => {
      const payload = { enabled: true } as never;
      vi.mocked(magicUrlService.saveMagicUrlConfig).mockResolvedValue({
        isSuccess: true,
      } as never);

      const { result } = renderHook(() => useSaveMagicUrlConfig(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(magicUrlService.saveMagicUrlConfig).toHaveBeenCalledWith(payload);
    });
  });

  // ─── useGetMagicUrlConfig ───────────────────────────────────────────────────
  describe("useGetMagicUrlConfig", () => {
    it("should fetch the config successfully", async () => {
      const config = { enabled: true };
      vi.mocked(magicUrlService.getMagicUrlConfig).mockResolvedValue(
        config as never,
      );

      const { result } = renderHook(() => useGetMagicUrlConfig("pk"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(config);
      expect(magicUrlService.getMagicUrlConfig).toHaveBeenCalledWith("pk");
    });

    it("should stay disabled without a projectKey", () => {
      const { result } = renderHook(() => useGetMagicUrlConfig(""), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(magicUrlService.getMagicUrlConfig).not.toHaveBeenCalled();
    });

    it("should respect an explicit enabled=false option", () => {
      const { result } = renderHook(
        () => useGetMagicUrlConfig("pk", { enabled: false }),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe("idle");
      expect(magicUrlService.getMagicUrlConfig).not.toHaveBeenCalled();
    });
  });

  // ─── useRemoveMagicUrl ──────────────────────────────────────────────────────
  describe("useRemoveMagicUrl", () => {
    it("should deactivate magic links successfully", async () => {
      const payload = { linkIds: ["1"], projectKey: "pk" };
      vi.mocked(magicUrlService.deactivateMagicLinks).mockResolvedValue(
        undefined as never,
      );

      const { result } = renderHook(() => useRemoveMagicUrl(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(magicUrlService.deactivateMagicLinks).toHaveBeenCalledWith(payload);
    });

    it("should surface deactivation errors", async () => {
      vi.mocked(magicUrlService.deactivateMagicLinks).mockRejectedValue(
        new Error("remove failed"),
      );

      const { result } = renderHook(() => useRemoveMagicUrl(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ linkIds: ["1"], projectKey: "pk" });
      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
