import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";
import { notificationService } from "../services/notification.service";
import { useProjectStore } from "@seliseblocks/genesis-os";
import {
  useGetNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  useGetBlocksNotificationConfig,
  useGetNotificationConfigs,
  useSaveNotificationConfig,
  useDeleteNotificationConfig,
} from "./use-notifications";

vi.mock("../services/notification.service", () => ({
  notificationService: {
    getNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllNotificationsAsRead: vi.fn(),
    getNotificationConfigs: vi.fn(),
    saveNotificationConfig: vi.fn(),
    deleteNotificationConfig: vi.fn(),
  },
}));

vi.mock("@seliseblocks/genesis-os", () => ({
  useProjectStore: vi.fn(() => ({ selectedProject: { tenantId: "tenant-1" } })),
}));

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: vi.fn(() => "blocks-key"),
}));

describe("use-notifications hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProjectStore).mockReturnValue({
      selectedProject: { tenantId: "tenant-1" },
    } as never);
  });

  describe("useGetNotifications", () => {
    it("fetches notifications with the given paging", async () => {
      const response = {
        unReadNotificationsCount: 1,
        totalNotificationsCount: 3,
        notifications: [],
      };
      vi.mocked(notificationService.getNotifications).mockResolvedValue(response);

      const { result } = renderHook(() => useGetNotifications(1, 10), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(response);
      expect(notificationService.getNotifications).toHaveBeenCalledWith(1, 10);
    });

    it("surfaces an error when the service rejects", async () => {
      vi.mocked(notificationService.getNotifications).mockRejectedValue(new Error("boom"));

      const { result } = renderHook(() => useGetNotifications(1, 10), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useMarkAsRead", () => {
    it("marks a notification as read (by-reference mutationFn -> two args)", async () => {
      vi.mocked(notificationService.markAsRead).mockResolvedValue({
        errors: null,
        isSuccess: true,
      });

      const { result } = renderHook(() => useMarkAsRead(), { wrapper: createWrapper() });

      result.current.mutate("notif-1");
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(notificationService.markAsRead).toHaveBeenCalledWith("notif-1", expect.anything());
    });
  });

  describe("useMarkAllAsRead", () => {
    it("marks all notifications as read", async () => {
      vi.mocked(notificationService.markAllNotificationsAsRead).mockResolvedValue({
        errors: null,
        isSuccess: true,
      });

      const { result } = renderHook(() => useMarkAllAsRead(), { wrapper: createWrapper() });

      result.current.mutate();
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(notificationService.markAllNotificationsAsRead).toHaveBeenCalledWith(
        undefined,
        expect.anything(),
      );
    });
  });

  describe("useGetBlocksNotificationConfig", () => {
    it("fetches configs using the runtime blocks key as project key", async () => {
      const response = { configurations: [], totalCount: 0, errors: null, isSuccess: true };
      vi.mocked(notificationService.getNotificationConfigs).mockResolvedValue(response);

      const { result } = renderHook(() => useGetBlocksNotificationConfig(0, 50), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(notificationService.getNotificationConfigs).toHaveBeenCalledWith(0, 50, "blocks-key");
    });
  });

  describe("useGetNotificationConfigs", () => {
    it("fetches configs scoped to the selected project's tenantId", async () => {
      const response = { configurations: [], totalCount: 0, errors: null, isSuccess: true };
      vi.mocked(notificationService.getNotificationConfigs).mockResolvedValue(response);

      const { result } = renderHook(() => useGetNotificationConfigs(0, 10), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(notificationService.getNotificationConfigs).toHaveBeenCalledWith(0, 10, "tenant-1");
    });

    it("stays disabled when there is no selected project", async () => {
      vi.mocked(useProjectStore).mockReturnValue({ selectedProject: undefined } as never);
      vi.mocked(notificationService.getNotificationConfigs).mockResolvedValue({} as never);

      const { result } = renderHook(() => useGetNotificationConfigs(0, 10), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe("idle");
      expect(notificationService.getNotificationConfigs).not.toHaveBeenCalled();
    });
  });

  describe("useSaveNotificationConfig", () => {
    it("saves a config (by-reference mutationFn -> two args)", async () => {
      vi.mocked(notificationService.saveNotificationConfig).mockResolvedValue({
        errors: null,
        isSuccess: true,
      });

      const { result } = renderHook(() => useSaveNotificationConfig(), {
        wrapper: createWrapper(),
      });

      const payload = {
        name: "cfg",
        channelToNotify: 1,
        notificationType: 2,
        enablePersistence: true,
        notifyMethod: "onMessage",
        projectKey: "pk",
        isUpdateRequest: false,
      };
      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(notificationService.saveNotificationConfig).toHaveBeenCalledWith(
        payload,
        expect.anything(),
      );
    });
  });

  describe("useDeleteNotificationConfig", () => {
    it("deletes a config (by-reference mutationFn -> two args)", async () => {
      vi.mocked(notificationService.deleteNotificationConfig).mockResolvedValue({
        errors: null,
        isSuccess: true,
      });

      const { result } = renderHook(() => useDeleteNotificationConfig(), {
        wrapper: createWrapper(),
      });

      const payload = { itemId: "id-1", projectKey: "pk" };
      result.current.mutate(payload);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(notificationService.deleteNotificationConfig).toHaveBeenCalledWith(
        payload,
        expect.anything(),
      );
    });
  });
});
