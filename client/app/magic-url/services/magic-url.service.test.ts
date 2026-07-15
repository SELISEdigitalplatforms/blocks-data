import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { MagicUrlService } from "./magic-url.service";
import { MAGIC_URL_ENDPOINTS } from "@/magic-url/constants/endpoint.constant";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

describe("MagicUrlService", () => {
  let service: MagicUrlService;

  beforeEach(() => {
    service = new MagicUrlService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── getMagicUrl ────────────────────────────────────────────────────────────
  describe("getMagicUrl", () => {
    it("should GET the link endpoint and unwrap response.data", async () => {
      const magicUrl = { itemId: "item-1", uri: "https://example.com" };
      vi.mocked(http.get).mockResolvedValue({ data: magicUrl });

      const result = await service.getMagicUrl({
        ItemId: "item-1",
        projectKey: "pk",
      } as never);

      expect(http.get).toHaveBeenCalledWith(
        `${MAGIC_URL_ENDPOINTS.GET_LINK}?ItemId=item-1&ProjectKey=pk`,
      );
      expect(result).toEqual(magicUrl);
    });

    it("should throw when the API call fails", async () => {
      vi.mocked(http.get).mockRejectedValue(new Error("Network error"));
      await expect(
        service.getMagicUrl({ ItemId: "item-1", projectKey: "pk" } as never),
      ).rejects.toThrow("Network error");
    });
  });

  // ─── getMagicUrls ───────────────────────────────────────────────────────────
  describe("getMagicUrls", () => {
    it("should GET the links endpoint with only the required params", async () => {
      vi.mocked(http.get).mockResolvedValue({
        data: [{ itemId: "1" }],
        errors: [],
        totalCount: 1,
      });

      const result = await service.getMagicUrls({
        page: 1,
        pageSize: 10,
        projectKey: "pk",
      } as never);

      const params = new URLSearchParams({
        PageSize: "10",
        PageNumber: "1",
        ProjectKey: "pk",
      });
      expect(http.get).toHaveBeenCalledWith(
        `${MAGIC_URL_ENDPOINTS.GET_LINKS}?${params.toString()}`,
      );
      expect(result).toEqual({
        data: [{ itemId: "1" }],
        errors: [],
        totalCount: 1,
      });
    });

    it("should append optional filter params when provided", async () => {
      vi.mocked(http.get).mockResolvedValue({ data: [] });

      await service.getMagicUrls({
        page: 2,
        pageSize: 20,
        projectKey: "pk",
        searchText: "hello",
        status: "Active",
        requestMethod: "GET",
        type: "Redirect",
        expiryDateRangeStartDate: "2026-01-01",
        expiryDateRangeEndDate: "2026-12-31",
      } as never);

      const params = new URLSearchParams({
        PageSize: "20",
        PageNumber: "2",
        ProjectKey: "pk",
      });
      params.append("SearchText", "hello");
      params.append("Status", "Active");
      params.append("RequestMethod", "GET");
      params.append("Type", "Redirect");
      params.append("ExpiryDateRange.StartDate", "2026-01-01");
      params.append("ExpiryDateRange.EndDate", "2026-12-31");

      expect(http.get).toHaveBeenCalledWith(
        `${MAGIC_URL_ENDPOINTS.GET_LINKS}?${params.toString()}`,
      );
    });

    it("should default errors and totalCount when absent from the response", async () => {
      vi.mocked(http.get).mockResolvedValue({ data: [] });

      const result = await service.getMagicUrls({
        page: 1,
        pageSize: 10,
        projectKey: "pk",
      } as never);

      expect(result).toEqual({ data: [], errors: [], totalCount: 0 });
    });
  });

  // ─── createMagicUrl ─────────────────────────────────────────────────────────
  describe("createMagicUrl", () => {
    it("should POST the payload to the create endpoint", async () => {
      const created = { itemId: "new-1" };
      const payload = { uri: "https://example.com", name: "Test" } as never;
      vi.mocked(http.post).mockResolvedValue(created);

      const result = await service.createMagicUrl(payload);

      expect(http.post).toHaveBeenCalledWith(
        MAGIC_URL_ENDPOINTS.CREATE_LINK,
        payload,
      );
      expect(result).toEqual(created);
    });
  });

  // ─── saveMagicUrlConfig ─────────────────────────────────────────────────────
  describe("saveMagicUrlConfig", () => {
    it("should POST the payload to the save-config endpoint", async () => {
      const response = { isSuccess: true };
      const payload = { enabled: true } as never;
      vi.mocked(http.post).mockResolvedValue(response);

      const result = await service.saveMagicUrlConfig(payload);

      expect(http.post).toHaveBeenCalledWith(
        MAGIC_URL_ENDPOINTS.SAVE_CONFIG,
        payload,
      );
      expect(result).toEqual(response);
    });
  });

  // ─── getMagicUrlConfig ──────────────────────────────────────────────────────
  describe("getMagicUrlConfig", () => {
    it("should GET the config endpoint with a ProjectKey query param", async () => {
      const response = { enabled: true };
      vi.mocked(http.get).mockResolvedValue(response);

      const result = await service.getMagicUrlConfig("pk");

      expect(http.get).toHaveBeenCalledWith(
        `${MAGIC_URL_ENDPOINTS.GET_CONFIG}?ProjectKey=pk`,
      );
      expect(result).toEqual(response);
    });
  });

  // ─── deactivateMagicLinks ───────────────────────────────────────────────────
  describe("deactivateMagicLinks", () => {
    it("should POST the payload to the remove-links endpoint", async () => {
      vi.mocked(http.post).mockResolvedValue(undefined);
      const payload = { linkIds: ["1", "2"], projectKey: "pk" };

      await service.deactivateMagicLinks(payload);

      expect(http.post).toHaveBeenCalledWith(
        MAGIC_URL_ENDPOINTS.REMOVE_LINKS,
        payload,
      );
    });

    it("should throw when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("remove failed"));
      await expect(
        service.deactivateMagicLinks({ linkIds: ["1"], projectKey: "pk" }),
      ).rejects.toThrow("remove failed");
    });
  });
});
