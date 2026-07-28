import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test-utils/test-providers/query-client";

const useGetBlocksNotificationConfig = vi.fn();
const useGetNotifications = vi.fn();
const markAsReadMutate = vi.fn();
const markAllAsReadMutate = vi.fn();
const connectionOn = vi.fn();

vi.mock("@/notifications/hooks/use-notifications", () => ({
  useGetBlocksNotificationConfig: (...a: unknown[]) => useGetBlocksNotificationConfig(...a),
  useGetNotifications: (...a: unknown[]) => useGetNotifications(...a),
  useMarkAsRead: () => ({ mutate: markAsReadMutate }),
  useMarkAllAsRead: () => ({ mutate: markAllAsReadMutate }),
}));
vi.mock("@/notifications/services/notification-client.service", () => ({
  notificationClientService: { connection: { on: (...a: unknown[]) => connectionOn(...a) } },
}));
vi.mock("@/notifications/services/notification.service", () => ({
  notificationService: { getNotificationConfig: vi.fn() },
}));

import { Notification } from "./notification";

const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    title: "agent_kb_processing_status",
    description: "desc",
    redirectPath: "",
    toastable: false,
    meta: JSON.stringify({ status: "completed", kb_id: "abcd-1234-xyz" }),
    ...over,
  });

const notif = (over: Record<string, unknown> = {}) => ({
  id: "n1",
  isRead: false,
  denormalizedPayload: payload(),
  createdTime: "2026-07-01T10:00:00Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  useGetBlocksNotificationConfig.mockReturnValue({
    data: { configurations: [{ notifyMethod: "OnNotify" }] },
  });
  useGetNotifications.mockReturnValue({
    data: {
      notifications: [notif()],
      unReadNotificationsCount: 3,
      totalNotificationsCount: 1,
    },
    isLoading: false,
    isFetching: false,
  });
  markAsReadMutate.mockImplementation((_id, opts) => opts?.onSuccess?.());
  markAllAsReadMutate.mockImplementation((_u, opts) => opts?.onSuccess?.());
});

const renderComp = () => render(<Notification />, { wrapper: createWrapper() });

describe("Notification", () => {
  it("registers signalr listeners for each configured notify method", () => {
    renderComp();
    expect(connectionOn).toHaveBeenCalledWith("OnNotify", expect.any(Function));
  });

  it("shows the unread badge count on the bell", () => {
    renderComp();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("caps the unread badge at 99+", () => {
    useGetNotifications.mockReturnValue({
      data: { notifications: [], unReadNotificationsCount: 150, totalNotificationsCount: 0 },
      isLoading: false,
      isFetching: false,
    });
    renderComp();
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("opens the panel and renders a formatted KB notification", async () => {
    const user = userEvent.setup();
    renderComp();
    await user.click(screen.getByTestId("notification-bell"));
    // formatKBTitle maps the special key.
    expect(await screen.findByText("AI Agent Knowledge Update Status")).toBeInTheDocument();
    // formatKBMetaDescription builds status + kb id (first segment).
    expect(screen.getByText(/Status: Completed \| KB Id: abcd/)).toBeInTheDocument();
  });

  it("marks a single notification read on hover", async () => {
    const user = userEvent.setup();
    renderComp();
    await user.click(screen.getByTestId("notification-bell"));
    const item = await screen.findByText("AI Agent Knowledge Update Status");
    await user.hover(item.closest("div[class*='cursor-pointer']") as HTMLElement);
    await waitFor(() => expect(markAsReadMutate).toHaveBeenCalledWith("n1", expect.any(Object)));
  });

  it("marks all notifications as read", async () => {
    const user = userEvent.setup();
    renderComp();
    await user.click(screen.getByTestId("notification-bell"));
    await user.click(await screen.findByRole("button", { name: "Mark all as read" }));
    expect(markAllAsReadMutate).toHaveBeenCalled();
  });

  it("shows the empty state when there are no notifications", async () => {
    useGetNotifications.mockReturnValue({
      data: { notifications: [], unReadNotificationsCount: 0, totalNotificationsCount: 0 },
      isLoading: false,
      isFetching: false,
    });
    const user = userEvent.setup();
    renderComp();
    await user.click(screen.getByTestId("notification-bell"));
    expect(await screen.findByText("No notifications")).toBeInTheDocument();
  });

  it("handles an incoming signalr message with a valid denormalized payload", () => {
    renderComp();
    const handler = connectionOn.mock.calls[0][1] as (m: string) => void;
    // Should not throw for a well-formed payload.
    expect(() =>
      handler(
        JSON.stringify({
          denormalizedPayload: JSON.stringify({ title: "t", description: "d" }),
        }),
      ),
    ).not.toThrow();
  });

  it("logs and swallows a malformed signalr message", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    renderComp();
    const handler = connectionOn.mock.calls[0][1] as (m: string) => void;
    handler("{not valid json");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("formats a plain title and a status-only meta description", async () => {
    useGetNotifications.mockReturnValue({
      data: {
        notifications: [
          notif({
            id: "n2",
            denormalizedPayload: JSON.stringify({
              title: "custom_event_name",
              description: "fallback",
              meta: JSON.stringify({ status: "pending" }),
            }),
          }),
        ],
        unReadNotificationsCount: 0,
        totalNotificationsCount: 1,
      },
      isLoading: false,
      isFetching: false,
    });
    const user = userEvent.setup();
    renderComp();
    await user.click(screen.getByTestId("notification-bell"));
    expect(await screen.findByText("Custom Event Name")).toBeInTheDocument();
    expect(screen.getByText("Status: Pending")).toBeInTheDocument();
  });

  it("falls back to the description when meta has no status or kb id", async () => {
    useGetNotifications.mockReturnValue({
      data: {
        notifications: [
          notif({
            id: "n3",
            denormalizedPayload: JSON.stringify({
              title: "another_event",
              description: "plain description",
              meta: JSON.stringify({}),
            }),
          }),
        ],
        unReadNotificationsCount: 0,
        totalNotificationsCount: 1,
      },
      isLoading: false,
      isFetching: false,
    });
    const user = userEvent.setup();
    renderComp();
    await user.click(screen.getByTestId("notification-bell"));
    expect(await screen.findByText("plain description")).toBeInTheDocument();
  });

  it("renders a fallback title when the denormalized payload is unparseable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    useGetNotifications.mockReturnValue({
      data: {
        notifications: [notif({ id: "n4", denormalizedPayload: "{broken" })],
        unReadNotificationsCount: 0,
        totalNotificationsCount: 1,
      },
      isLoading: false,
      isFetching: false,
    });
    const user = userEvent.setup();
    renderComp();
    await user.click(screen.getByTestId("notification-bell"));
    expect(await screen.findByText("No Title")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
