import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { INotificationConfig } from "../models/notification.model";

const toast = vi.fn();
const deleteNotificationConfig = vi.fn();
let configData: unknown;
let isLoading = false;

vi.mock("../hooks/use-notifications", () => ({
  useGetNotificationConfigs: () => ({ data: configData, isLoading }),
  useDeleteNotificationConfig: () => ({ mutateAsync: deleteNotificationConfig, isPending: false }),
}));
vi.mock("../modals/new-notification-configuration", () => ({
  default: ({ dialogTitle }: { dialogTitle: string }) => <div>{dialogTitle}</div>,
}));
vi.mock("@/components/confirmation-modal/confirmation-modal", () => ({
  default: ({ onConfirm }: { onConfirm: () => void }) => (
    <button onClick={onConfirm}>confirm-delete</button>
  ),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import NotificationConfigurationList from "./notification-configuration-list";

const config = (over: Partial<INotificationConfig> = {}): INotificationConfig =>
  ({
    itemId: "c1",
    name: "Order alerts",
    channelToNotify: 0,
    notificationType: 1,
    enablePersistence: true,
    ...over,
  }) as INotificationConfig;

beforeEach(() => {
  vi.clearAllMocks();
  isLoading = false;
  configData = { configurations: [config()], totalCount: 1 };
  deleteNotificationConfig.mockResolvedValue({ isSuccess: true });
});

describe("NotificationConfigurationList", () => {
  it("renders a loading skeleton while loading", () => {
    isLoading = true;
    const { container } = render(<NotificationConfigurationList />);
    expect(container.querySelectorAll(".rounded").length).toBeGreaterThan(0);
  });

  it("shows the empty placeholder when there are no configurations", () => {
    configData = { configurations: [], totalCount: 0 };
    render(<NotificationConfigurationList />);
    expect(
      screen.getByText("No notification configurations found."),
    ).toBeInTheDocument();
  });

  it("renders a configuration row with mapped channel and type labels", () => {
    render(<NotificationConfigurationList />);
    expect(screen.getByText("Order alerts")).toBeInTheDocument();
    expect(screen.getByText("SignalR")).toBeInTheDocument();
    expect(screen.getByText("BroadcastReceiverType")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("renders No when persistence is disabled", () => {
    configData = { configurations: [config({ enablePersistence: false })], totalCount: 1 };
    render(<NotificationConfigurationList />);
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("opens the edit dialog from the row menu", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<NotificationConfigurationList />);
    await user.click(screen.getByRole("button", { name: "" }));
    await user.click(await screen.findByText("Edit"));
    expect(await screen.findByText("Edit Configuration")).toBeInTheDocument();
  });

  it("deletes a configuration and shows a success toast", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<NotificationConfigurationList />);
    await user.click(screen.getByRole("button", { name: "" }));
    await user.click(await screen.findByText("Delete"));
    await user.click(await screen.findByText("confirm-delete"));
    await waitFor(() => expect(deleteNotificationConfig).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "success", description: "Configuration deleted successfully" }),
    );
  });

  it("reports a destructive toast when the delete responds unsuccessful", async () => {
    deleteNotificationConfig.mockResolvedValue({ isSuccess: false, errors: "nope" });
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<NotificationConfigurationList />);
    await user.click(screen.getByRole("button", { name: "" }));
    await user.click(await screen.findByText("Delete"));
    await user.click(await screen.findByText("confirm-delete"));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });
});
