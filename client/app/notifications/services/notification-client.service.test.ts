import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── SignalR mock ──────────────────────────────────────────────────────────
// Defined via vi.hoisted so the shared fakes exist before the service module's
// top-level singleton instantiates during import (imports run before top-level consts).
const h = vi.hoisted(() => {
  const fakeConnection = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onclose: vi.fn(),
    state: "Connected",
  };
  const builder = {
    withUrl: vi.fn().mockReturnThis(),
    withAutomaticReconnect: vi.fn().mockReturnThis(),
    build: vi.fn(() => fakeConnection),
  };
  return { fakeConnection, builder, getNotifications: vi.fn() };
});
const { fakeConnection, builder } = h;

vi.mock("@microsoft/signalr", () => ({
  HttpTransportType: { WebSockets: 1 },
  HubConnection: class {},
  // Must be a regular (constructable) function: the service uses `new HubConnectionBuilder()`.
  HubConnectionBuilder: vi.fn(function () {
    return h.builder;
  }),
}));

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: vi.fn(() => "test-blocks-key"),
}));

vi.mock("./notification.service", () => ({
  notificationService: { getNotifications: h.getNotifications },
}));

import { HubConnectionBuilder, HttpTransportType } from "@microsoft/signalr";
import { BLOCKS_LOGIC_SITE_ORIGIN } from "@/constants/endpoint.constant";
import {
  NotificationClientService,
  notificationClientService,
} from "./notification-client.service";

// Every instance is stopped after each test, so no window listener leaks into the next one.
const created: NotificationClientService[] = [];
const make = () => {
  const service = new NotificationClientService();
  created.push(service);
  return service;
};

describe("NotificationClientService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeConnection.state = "Connected";
  });

  afterEach(async () => {
    await Promise.all(created.splice(0).map((service) => service.disconnect()));
    vi.clearAllMocks();
  });

  it("exports a shared singleton created at module load", () => {
    expect(notificationClientService).toBeInstanceOf(NotificationClientService);
    expect(notificationClientService.connection).toBe(fakeConnection);
  });

  it("builds the hub connection with the NotificationHub URL, WebSocket transport and auto-reconnect", () => {
    make();

    expect(HubConnectionBuilder).toHaveBeenCalled();
    expect(builder.withUrl).toHaveBeenCalledWith(
      `${BLOCKS_LOGIC_SITE_ORIGIN}/NotificationHub?x-blocks-key=test-blocks-key`,
      { transport: HttpTransportType.WebSockets },
    );
    expect(builder.withAutomaticReconnect).toHaveBeenCalled();
    expect(builder.build).toHaveBeenCalled();
  });

  it("starts the shared connection when the module loads", async () => {
    fakeConnection.state = "Disconnected";
    fakeConnection.start.mockClear();
    vi.resetModules();

    const module = await import("./notification-client.service");

    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
    await module.notificationClientService.disconnect();
  });

  it("connect() starts the connection", async () => {
    fakeConnection.state = "Disconnected";
    const service = make();

    await service.connect();

    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
  });

  it("disconnect() stops the connection when it is not already disconnected", async () => {
    const service = make();
    fakeConnection.state = "Connected";

    await service.disconnect();

    expect(fakeConnection.stop).toHaveBeenCalledTimes(1);
  });

  it("disconnect() does nothing when the connection is already disconnected", async () => {
    const service = make();
    fakeConnection.state = "Disconnected";

    await service.disconnect();

    expect(fakeConnection.stop).not.toHaveBeenCalled();
  });
});

const refused = () => Object.assign(new Error("Session expired"), { status: 401 });

// Runs the close handler the service registered on the connection.
const closeConnection = () => {
  fakeConnection.state = "Disconnected";
  const onClose = fakeConnection.onclose.mock.calls.at(-1)?.[0] as () => void;
  onClose();
};

describe("NotificationClientService reconnect", () => {
  let service: NotificationClientService;

  beforeEach(async () => {
    // The module singleton listens to window events too; stop it so only this test's service reacts.
    await notificationClientService.disconnect();
    vi.useFakeTimers();
    vi.clearAllMocks();
    fakeConnection.state = "Disconnected";
    fakeConnection.start.mockImplementation(async () => {
      fakeConnection.state = "Connected";
    });
    fakeConnection.stop.mockImplementation(async () => {
      fakeConnection.state = "Disconnected";
    });
    h.getNotifications.mockResolvedValue({});
    service = make();
  });

  afterEach(async () => {
    await Promise.all(created.splice(0).map((s) => s.disconnect()));
    vi.useRealTimers();
  });

  it("connect() starts the connection without refreshing the login", async () => {
    await service.connect();

    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
    expect(h.getNotifications).not.toHaveBeenCalled();
  });

  it("refreshes the login and starts again when the connection closes", async () => {
    await service.connect();
    fakeConnection.start.mockClear();

    closeConnection();
    await vi.advanceTimersByTimeAsync(0);

    expect(h.getNotifications).toHaveBeenCalledTimes(1);
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
  });

  it("retries with backoff while the start fails", async () => {
    await service.connect();
    fakeConnection.start.mockClear();
    fakeConnection.start.mockRejectedValue(new Error("network"));

    closeConnection();
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1999);
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fakeConnection.start).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fakeConnection.start).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(15_000 + 30_000);
    expect(fakeConnection.start).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fakeConnection.start).toHaveBeenCalledTimes(6);
  });

  it("stops retrying quietly when the refresh is refused", async () => {
    await service.connect();
    fakeConnection.start.mockClear();
    h.getNotifications.mockRejectedValue(refused());

    closeConnection();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(h.getNotifications).toHaveBeenCalledTimes(1);
    expect(fakeConnection.start).not.toHaveBeenCalled();
  });

  it("still starts when the refresh GET fails with a status other than 401", async () => {
    await service.connect();
    fakeConnection.start.mockClear();
    h.getNotifications.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));

    closeConnection();
    await vi.advanceTimersByTimeAsync(0);

    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
  });

  it("does not retry after disconnect()", async () => {
    await service.connect();
    fakeConnection.start.mockClear();
    fakeConnection.start.mockRejectedValue(new Error("network"));
    closeConnection();
    await vi.advanceTimersByTimeAsync(0);

    await service.disconnect();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
  });

  it("does not reconnect after an intentional disconnect() closes the connection", async () => {
    await service.connect();
    fakeConnection.start.mockClear();

    await service.disconnect();
    closeConnection();
    await vi.advanceTimersByTimeAsync(0);

    expect(h.getNotifications).not.toHaveBeenCalled();
    expect(fakeConnection.start).not.toHaveBeenCalled();
  });

  it("never runs two starts in parallel", async () => {
    await service.connect();
    fakeConnection.start.mockClear();
    let finishStart: () => void = () => {};
    fakeConnection.start.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishStart = () => {
            fakeConnection.state = "Connected";
            resolve();
          };
        }),
    );

    closeConnection();
    await vi.advanceTimersByTimeAsync(0);
    globalThis.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
    finishStart();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("tries at once on the online event while disconnected", async () => {
    await service.connect();
    fakeConnection.start.mockClear();
    fakeConnection.state = "Disconnected";

    globalThis.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(h.getNotifications).toHaveBeenCalledTimes(1);
    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
  });

  it("tries at once when the tab becomes visible while disconnected", async () => {
    await service.connect();
    fakeConnection.start.mockClear();
    fakeConnection.state = "Disconnected";

    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
  });

  it("ignores the online event while connected", async () => {
    await service.connect();
    fakeConnection.start.mockClear();

    globalThis.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(fakeConnection.start).not.toHaveBeenCalled();
  });

  it("does not listen to the online event after disconnect()", async () => {
    await service.connect();
    await service.disconnect();
    fakeConnection.start.mockClear();

    globalThis.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(fakeConnection.start).not.toHaveBeenCalled();
  });

  it("disconnect() stops a connection that is not disconnected", async () => {
    await service.connect();

    await service.disconnect();

    expect(fakeConnection.stop).toHaveBeenCalledTimes(1);
  });
});
