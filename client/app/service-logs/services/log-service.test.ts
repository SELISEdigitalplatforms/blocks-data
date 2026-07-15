import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { LogService } from "./log-service";
import { LOG_ENDPOINTS } from "../constants/lmt-log-endpoints";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

describe("LogService", () => {
  let service: LogService;

  beforeEach(() => {
    service = new LogService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const logResponse = {
    data: [{ timestamp: "2025-01-01T00:00:00Z", level: "Error", message: "boom", traceId: "t1" }],
    totalCount: 1,
    errors: null,
  };

  // ─── getLogs ─────────────────────────────────────────────────────────────
  describe("getLogs", () => {
    it("POSTs the payload to the GetLogs endpoint", async () => {
      const payload = { page: 0, pageSize: 20, serviceName: "svc", projectKey: "pk" };
      vi.mocked(http.post).mockResolvedValue(logResponse);

      const result = await service.getLogs(payload);

      expect(http.post).toHaveBeenCalledWith(LOG_ENDPOINTS.GET_LOGS, payload);
      expect(result).toEqual(logResponse);
    });

    it("throws when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("Network error"));
      await expect(
        service.getLogs({ page: 0, pageSize: 20, serviceName: "svc", projectKey: "pk" }),
      ).rejects.toThrow("Network error");
    });
  });

  // ─── getLogsByDate ───────────────────────────────────────────────────────
  describe("getLogsByDate", () => {
    it("POSTs the payload to the GetLogsByDate endpoint", async () => {
      const payload = { pageSize: 20, serviceName: "svc", projectKey: "pk" };
      vi.mocked(http.post).mockResolvedValue(logResponse);

      const result = await service.getLogsByDate(payload);

      expect(http.post).toHaveBeenCalledWith(LOG_ENDPOINTS.GET_LOGS_BY_DATE, payload);
      expect(result).toEqual(logResponse);
    });

    it("throws when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("Network error"));
      await expect(
        service.getLogsByDate({ pageSize: 20, serviceName: "svc", projectKey: "pk" }),
      ).rejects.toThrow("Network error");
    });
  });

  // ─── getLiveLog ──────────────────────────────────────────────────────────
  describe("getLiveLog", () => {
    it("GETs the Live endpoint with name, lastDate and project key query params", async () => {
      vi.mocked(http.get).mockResolvedValue(logResponse);

      const result = await service.getLiveLog({
        serviceName: "svc",
        lastDate: "2025-01-01T00:00:00Z",
        projectKey: "pk",
      });

      expect(http.get).toHaveBeenCalledWith(
        `${LOG_ENDPOINTS.LIVE}?Name=svc&LastDate=2025-01-01T00:00:00Z&ProjectKey=pk`,
      );
      expect(result).toEqual(logResponse);
    });

    it("throws when the API call fails", async () => {
      vi.mocked(http.get).mockRejectedValue(new Error("Network error"));
      await expect(
        service.getLiveLog({ serviceName: "svc", lastDate: "d", projectKey: "pk" }),
      ).rejects.toThrow("Network error");
    });
  });
});
