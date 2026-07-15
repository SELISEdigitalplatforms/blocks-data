import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockHttpClientFactory } from "@/test-utils/__mocks__";
import { http } from "@/lib/http-client";
import { API_BASES } from "@/constants/endpoint.constant";
import { NotificationService, notificationService } from "./notification.service";
import {
  NOTIFICATION_ENDPOINTS,
  NOTIFICATION_CONFIG_ENDPOINTS,
} from "../constants/endpoint.constant";

vi.mock("@/lib/http-client", () => mockHttpClientFactory());

describe("NotificationService", () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── getNotifications ────────────────────────────────────────────────────
  describe("getNotifications", () => {
    it("GETs the notifications endpoint with a zero-based page and absoluteUrl flag", async () => {
      const response = {
        unReadNotificationsCount: 2,
        totalNotificationsCount: 5,
        notifications: [],
      };
      vi.mocked(http.get).mockResolvedValue(response);

      const result = await service.getNotifications(2, 10);

      expect(http.get).toHaveBeenCalledWith(
        `${API_BASES.LOGIC}${NOTIFICATION_ENDPOINTS.GET_NOTIFICATIONS}?page=1&pageSize=10`,
        undefined,
        { absoluteUrl: true },
      );
      expect(result).toEqual(response);
    });

    it("throws when the API call fails", async () => {
      vi.mocked(http.get).mockRejectedValue(new Error("Network error"));
      await expect(service.getNotifications(1, 10)).rejects.toThrow("Network error");
    });
  });

  // ─── markAsRead ──────────────────────────────────────────────────────────
  describe("markAsRead", () => {
    it("POSTs the notification id to the mark-as-read endpoint with absoluteUrl flag", async () => {
      vi.mocked(http.post).mockResolvedValue({ errors: null, isSuccess: true });

      const result = await service.markAsRead("notif-1");

      expect(http.post).toHaveBeenCalledWith(
        `${API_BASES.LOGIC}${NOTIFICATION_ENDPOINTS.MARK_AS_READ}`,
        { id: "notif-1" },
        undefined,
        { absoluteUrl: true },
      );
      expect(result).toEqual({ errors: null, isSuccess: true });
    });
  });

  // ─── markAllNotificationsAsRead ──────────────────────────────────────────
  describe("markAllNotificationsAsRead", () => {
    it("POSTs an empty body to the mark-all-as-read endpoint with absoluteUrl flag", async () => {
      vi.mocked(http.post).mockResolvedValue({ errors: null, isSuccess: true });

      const result = await service.markAllNotificationsAsRead();

      expect(http.post).toHaveBeenCalledWith(
        `${API_BASES.LOGIC}${NOTIFICATION_ENDPOINTS.MARK_ALL_AS_READ}`,
        {},
        undefined,
        { absoluteUrl: true },
      );
      expect(result).toEqual({ errors: null, isSuccess: true });
    });
  });

  // ─── getNotificationConfig (window event dispatcher) ─────────────────────
  describe("getNotificationConfig", () => {
    const config = {
      notifyMethod: "onMessage",
    } as never;

    it("dispatches a CustomEvent with the parsed JSON message", () => {
      const handler = vi.fn();
      window.addEventListener("onMessage", handler);

      service.getNotificationConfig(config, JSON.stringify({ hello: "world" }));

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.method).toBe("onMessage");
      expect(event.detail.message).toEqual({ hello: "world" });
      expect(event.detail.config).toBe(config);
      expect(typeof event.detail.timestamp).toBe("string");

      window.removeEventListener("onMessage", handler);
    });

    it("keeps the raw string when the message is not valid JSON", () => {
      const handler = vi.fn();
      window.addEventListener("onMessage", handler);

      service.getNotificationConfig(config, "not-json");

      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.message).toBe("not-json");

      window.removeEventListener("onMessage", handler);
    });
  });

  // ─── getNotificationConfigs ──────────────────────────────────────────────
  describe("getNotificationConfigs", () => {
    it("GETs the configs endpoint with paging + project key and absoluteUrl flag", async () => {
      const response = { configurations: [], totalCount: 0, errors: null, isSuccess: true };
      vi.mocked(http.get).mockResolvedValue(response);

      const result = await service.getNotificationConfigs(1, 20, "pk-1");

      expect(http.get).toHaveBeenCalledWith(
        `${NOTIFICATION_CONFIG_ENDPOINTS.GET_CONFIGS}?page=1&pageSize=20&projectKey=pk-1`,
        undefined,
        { absoluteUrl: true },
      );
      expect(result).toEqual(response);
    });

    it("applies default page and pageSize when omitted", async () => {
      vi.mocked(http.get).mockResolvedValue({});

      await service.getNotificationConfigs(undefined as never, undefined as never, "pk-2");

      expect(http.get).toHaveBeenCalledWith(
        `${NOTIFICATION_CONFIG_ENDPOINTS.GET_CONFIGS}?page=0&pageSize=10&projectKey=pk-2`,
        undefined,
        { absoluteUrl: true },
      );
    });
  });

  // ─── saveNotificationConfig ──────────────────────────────────────────────
  describe("saveNotificationConfig", () => {
    it("POSTs the payload to the save-config endpoint", async () => {
      const payload = {
        name: "cfg",
        channelToNotify: 1,
        notificationType: 2,
        enablePersistence: true,
        notifyMethod: "onMessage",
        projectKey: "pk",
        isUpdateRequest: false,
      };
      vi.mocked(http.post).mockResolvedValue({ errors: null, isSuccess: true });

      const result = await service.saveNotificationConfig(payload);

      expect(http.post).toHaveBeenCalledWith(NOTIFICATION_CONFIG_ENDPOINTS.SAVE_CONFIG, payload);
      expect(result).toEqual({ errors: null, isSuccess: true });
    });

    it("throws when the API call fails", async () => {
      vi.mocked(http.post).mockRejectedValue(new Error("Network error"));
      await expect(
        service.saveNotificationConfig({} as never),
      ).rejects.toThrow("Network error");
    });
  });

  // ─── deleteNotificationConfig ────────────────────────────────────────────
  describe("deleteNotificationConfig", () => {
    it("DELETEs the config using itemId + project key query params", async () => {
      vi.mocked(http.delete).mockResolvedValue({ errors: null, isSuccess: true });

      const result = await service.deleteNotificationConfig({ itemId: "id-1", projectKey: "pk" });

      expect(http.delete).toHaveBeenCalledWith(
        `${NOTIFICATION_CONFIG_ENDPOINTS.DELETE_CONFIG}?itemId=id-1&projectKey=pk`,
      );
      expect(result).toEqual({ errors: null, isSuccess: true });
    });
  });

  // ─── singleton export ────────────────────────────────────────────────────
  it("exports a shared singleton instance", () => {
    expect(notificationService).toBeInstanceOf(NotificationService);
  });
});
