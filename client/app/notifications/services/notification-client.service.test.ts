import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── SignalR mock ──────────────────────────────────────────────────────────
// Defined via vi.hoisted so the shared fakes exist before the service module's
// top-level singleton instantiates during import (imports run before top-level consts).
const { fakeConnection, builder } = vi.hoisted(() => {
  const fakeConnection = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    state: "Connected",
  };
  const builder = {
    withUrl: vi.fn().mockReturnThis(),
    withAutomaticReconnect: vi.fn().mockReturnThis(),
    build: vi.fn(() => fakeConnection),
  };
  return { fakeConnection, builder };
});

vi.mock("@microsoft/signalr", () => ({
  HttpTransportType: { WebSockets: 1 },
  HubConnection: class {},
  // Must be a regular (constructable) function: the service uses `new HubConnectionBuilder()`.
  HubConnectionBuilder: vi.fn(function () {
    return builder;
  }),
}));

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: vi.fn(() => "test-blocks-key"),
}));

import { HubConnectionBuilder, HttpTransportType } from "@microsoft/signalr";
import { BLOCKS_LOGIC_SITE_ORIGIN } from "@/constants/endpoint.constant";
import {
  NotificationClientService,
  notificationClientService,
} from "./notification-client.service";

describe("NotificationClientService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeConnection.state = "Connected";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exports a shared singleton created at module load", () => {
    expect(notificationClientService).toBeInstanceOf(NotificationClientService);
    expect(notificationClientService.connection).toBe(fakeConnection);
  });

  it("builds the hub connection with the NotificationHub URL, WebSocket transport and auto-reconnect", () => {
    new NotificationClientService();

    expect(HubConnectionBuilder).toHaveBeenCalled();
    expect(builder.withUrl).toHaveBeenCalledWith(
      `${BLOCKS_LOGIC_SITE_ORIGIN}/NotificationHub?x-blocks-key=test-blocks-key`,
      { transport: HttpTransportType.WebSockets },
    );
    expect(builder.withAutomaticReconnect).toHaveBeenCalled();
    expect(builder.build).toHaveBeenCalled();
  });

  it("starts the connection on construction (via connect)", () => {
    new NotificationClientService();
    expect(fakeConnection.start).toHaveBeenCalled();
  });

  it("connect() starts the connection", async () => {
    const service = new NotificationClientService();
    fakeConnection.start.mockClear();

    await service.connect();

    expect(fakeConnection.start).toHaveBeenCalledTimes(1);
  });

  it("disconnect() stops the connection when it is not already disconnected", async () => {
    const service = new NotificationClientService();
    fakeConnection.state = "Connected";

    await service.disconnect();

    expect(fakeConnection.stop).toHaveBeenCalledTimes(1);
  });

  it("disconnect() does nothing when the connection is already disconnected", async () => {
    const service = new NotificationClientService();
    fakeConnection.state = "Disconnected";

    await service.disconnect();

    expect(fakeConnection.stop).not.toHaveBeenCalled();
  });
});
