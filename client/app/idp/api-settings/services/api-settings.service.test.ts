import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { apiSettingsService } from "./api-settings.service";
import { API_SETTINGS_ENDPOINTS } from "../constants/endpoint.constant";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

describe("apiSettingsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── getEndpoints ──────────────────────────────────────────────────────────
  describe("getEndpoints", () => {
    it("POSTs to GET_LIST applying default page/pageSize/filter", async () => {
      vi.mocked(http.post).mockResolvedValue({ data: [], totalCount: 0 });

      await apiSettingsService.getEndpoints({ projectKey: "pk" });

      expect(http.post).toHaveBeenCalledWith(API_SETTINGS_ENDPOINTS.GET_LIST, {
        projectKey: "pk",
        page: 0,
        pageSize: 100,
        filter: {},
      });
    });

    it("forwards explicit paging + filter values", async () => {
      vi.mocked(http.post).mockResolvedValue({ data: [] });

      await apiSettingsService.getEndpoints({
        projectKey: "pk",
        page: 3,
        pageSize: 25,
        filter: { service: "Iam" },
      });

      expect(http.post).toHaveBeenCalledWith(API_SETTINGS_ENDPOINTS.GET_LIST, {
        projectKey: "pk",
        page: 3,
        pageSize: 25,
        filter: { service: "Iam" },
      });
    });

    it("maps a camelCase response and capitalizes the controller", async () => {
      vi.mocked(http.post).mockResolvedValue({
        page: 0,
        pageSize: 100,
        totalPages: 1,
        totalCount: 1,
        data: [
          {
            itemId: "id-1",
            service: "Iam",
            method: "getUser",
            controller: "user",
            description: "Get a user",
            isCaptchaRequired: true,
            captchaProvider: "google",
            isMFARequired: false,
            mfaType: "",
            baseUrl: "/api",
            version: "v1",
          },
        ],
        errors: null,
      });

      const result = await apiSettingsService.getEndpoints({ projectKey: "pk" });

      expect(result.totalCount).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        itemId: "id-1",
        service: "Iam",
        method: "getUser",
        controller: "User", // capitalized
        isCaptchaRequired: true,
        captchaProvider: "google",
        baseUrl: "/api",
        version: "v1",
      });
      // `errors: null || Errors(undefined)` collapses to undefined via the `||` fallback
      expect(result.errors).toBeUndefined();
    });

    it("maps a PascalCase response from the backend", async () => {
      vi.mocked(http.post).mockResolvedValue({
        Page: 2,
        PageSize: 50,
        TotalPages: 4,
        TotalCount: 7,
        Data: [
          {
            ItemId: "id-2",
            Service: "Storage",
            Method: "upload",
            Controller: "bucket",
            Description: "Upload",
            IsCaptchaRequired: false,
            CaptchaProvider: "",
            IsMFARequired: true,
            MfaType: "totp",
            BaseUrl: "/api",
            Version: "v2",
          },
        ],
        Errors: null,
      });

      const result = await apiSettingsService.getEndpoints({ projectKey: "pk" });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(50);
      expect(result.totalPages).toBe(4);
      expect(result.totalCount).toBe(7);
      expect(result.data[0]).toMatchObject({
        itemId: "id-2",
        service: "Storage",
        controller: "Bucket",
        isMFARequired: true,
        mfaType: "totp",
        version: "v2",
      });
    });

    it("returns an empty data array with default numeric fields when the response has no data", async () => {
      vi.mocked(http.post).mockResolvedValue({});

      const result = await apiSettingsService.getEndpoints({ projectKey: "pk" });

      expect(result.data).toEqual([]);
      expect(result.page).toBe(0);
      expect(result.pageSize).toBe(100);
      expect(result.totalPages).toBe(0);
      expect(result.totalCount).toBe(0);
    });

    it("leaves the controller empty when the field is missing", async () => {
      vi.mocked(http.post).mockResolvedValue({ data: [{ itemId: "id-3" }] });

      const result = await apiSettingsService.getEndpoints({ projectKey: "pk" });

      expect(result.data[0].controller).toBe("");
      expect(result.data[0].itemId).toBe("id-3");
      // defaults applied for missing fields
      expect(result.data[0].isCaptchaRequired).toBe(false);
      expect(result.data[0].tags).toEqual([]);
    });

    it("throws when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("Network error"));
      await expect(apiSettingsService.getEndpoints({ projectKey: "pk" })).rejects.toThrow(
        "Network error",
      );
    });
  });

  // ─── updateEndpoint ────────────────────────────────────────────────────────
  describe("updateEndpoint", () => {
    it("POSTs the payload to the UPDATE endpoint and passes through the result", async () => {
      const payload = {
        projectKey: "pk",
        itemId: "id-1",
        service: "Iam",
        method: "getUser",
        controller: "User",
        description: "d",
        isCaptchaRequired: true,
        captchaProvider: "google",
        isMFARequired: false,
        mfaType: "",
      };
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      const result = await apiSettingsService.updateEndpoint(payload);

      expect(http.post).toHaveBeenCalledWith(API_SETTINGS_ENDPOINTS.UPDATE, payload);
      expect(result).toEqual({ isSuccess: true });
    });

    it("throws when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("Network error"));
      await expect(apiSettingsService.updateEndpoint({} as never)).rejects.toThrow("Network error");
    });
  });

  // ─── bulkUpdate ────────────────────────────────────────────────────────────
  describe("bulkUpdate", () => {
    it("POSTs the payload to the BULK_UPDATE endpoint", async () => {
      const payload = { projectKey: "pk", itemIds: ["a", "b"], isMFARequired: true };
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      const result = await apiSettingsService.bulkUpdate(payload);

      expect(http.post).toHaveBeenCalledWith(API_SETTINGS_ENDPOINTS.BULK_UPDATE, payload);
      expect(result).toEqual({ isSuccess: true });
    });
  });

  // ─── removeEndpoints ───────────────────────────────────────────────────────
  describe("removeEndpoints", () => {
    it("POSTs the payload to the REMOVE endpoint", async () => {
      const payload = { projectKey: "pk", itemIds: ["a"] };
      vi.mocked(http.post).mockResolvedValue({ isSuccess: true });

      const result = await apiSettingsService.removeEndpoints(payload);

      expect(http.post).toHaveBeenCalledWith(API_SETTINGS_ENDPOINTS.REMOVE, payload);
      expect(result).toEqual({ isSuccess: true });
    });

    it("throws when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("Network error"));
      await expect(apiSettingsService.removeEndpoints({} as never)).rejects.toThrow("Network error");
    });
  });
});
