import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const runtimeEnv = vi.hoisted(() => ({
  values: {
    BLOCKS_DATA_BASE_URL: "https://api.example.com/",
    BLOCKS_X_BLOCKS_KEY: "key-123",
  } as Record<string, string>,
}));

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: (key: string) => runtimeEnv.values[key] ?? "",
}));

const getMockData = vi.hoisted(() => vi.fn());
vi.mock("../services/configuration.service", () => ({
  configurationService: { getMockData },
}));

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/lib/http-client", () => ({ http, HttpClient: vi.fn() }));

import { RestPathError, gatewayBaseUrl, sendRestRequest } from "./rest-client";

const BASE = "https://api.example.com/api/gateway";

const reply = (
  status: number,
  body = "",
  init: { statusText?: string; headers?: Record<string, string> } = {},
) => new Response(body, { status, statusText: init.statusText ?? "", headers: init.headers });

const fetchMock = vi.fn();

beforeEach(() => {
  runtimeEnv.values = {
    BLOCKS_DATA_BASE_URL: "https://api.example.com/",
    BLOCKS_X_BLOCKS_KEY: "key-123",
  };
  fetchMock.mockReset();
  getMockData.mockReset();
  Object.values(http).forEach((fn) => fn.mockReset());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gatewayBaseUrl", () => {
  it("strips trailing slashes and appends the gateway endpoint", () => {
    expect(gatewayBaseUrl()).toBe(BASE);
  });

  it("uses the relative-base fallback when BLOCKS_DATA_BASE_URL is empty", () => {
    runtimeEnv.values.BLOCKS_DATA_BASE_URL = "";
    expect(gatewayBaseUrl()).toBe(`${window.location.origin}/api/gateway`);
  });
});

describe("sendRestRequest", () => {
  it("passes a 201 through with Location", async () => {
    fetchMock.mockResolvedValue(
      reply(201, '{"itemId":"1"}', {
        statusText: "Created",
        headers: { Location: "/api/gateway/RT/item/1", "Content-Type": "application/json" },
      }),
    );

    const result = await sendRestRequest({
      method: "POST",
      path: "/RT/item",
      query: [],
      body: '{"a":1}',
    });

    expect(result).toMatchObject({
      kind: "response",
      status: 201,
      statusText: "Created",
      contentType: "application/json",
      bodyText: '{"itemId":"1"}',
      sizeBytes: 14,
    });
    if (result.kind !== "response") throw new Error("unreachable");
    expect(result.headers).toContainEqual(["location", "/api/gateway/RT/item/1"]);
    expect(Number.isInteger(result.durationMs)).toBe(true);
  });

  it("passes a 400 problem body through", async () => {
    const problem = '{"title":"Bad Request","status":400}';
    fetchMock.mockResolvedValue(
      reply(400, problem, { headers: { "Content-Type": "application/problem+json" } }),
    );

    const result = await sendRestRequest({ method: "GET", path: "/RT/item", query: [] });

    expect(result).toMatchObject({
      kind: "response",
      status: 400,
      contentType: "application/problem+json",
      bodyText: problem,
    });
  });

  it("returns an empty content type when the response has none", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await sendRestRequest({ method: "DELETE", path: "/RT/item/1", query: [] });

    expect(result).toMatchObject({
      kind: "response",
      status: 204,
      contentType: "",
      bodyText: "",
      sizeBytes: 0,
    });
  });

  it("builds the URL from the base, path and query", async () => {
    fetchMock.mockResolvedValue(reply(200));

    await sendRestRequest({
      method: "GET",
      path: "/RT/item",
      query: [
        ["page", "1"],
        ["", "dropped"],
        ["filter", "a b"],
      ],
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/RT/item?page=1&filter=a%20b`);
  });

  it("sends a body on DELETE", async () => {
    fetchMock.mockResolvedValue(reply(200));

    await sendRestRequest({
      method: "DELETE",
      path: "/RT/items",
      query: [],
      body: '{"ids":["1"]}',
    });

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("DELETE");
    expect(init.body).toBe('{"ids":["1"]}');
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("sends x-blocks-key and credentials include", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(reply(200));

    await sendRestRequest({ method: "GET", path: "/RT/item", query: [] }, controller.signal);

    const init = fetchMock.mock.calls[0][1];
    expect(init.credentials).toBe("include");
    expect(init.headers["x-blocks-key"]).toBe("key-123");
    expect(init.signal).toBe(controller.signal);
  });

  it("omits Content-Type without a body", async () => {
    fetchMock.mockResolvedValue(reply(200));

    await sendRestRequest({ method: "POST", path: "/RT/item", query: [], body: "" });
    await sendRestRequest({ method: "GET", path: "/RT/item", query: [], body: '{"ignored":true}' });

    for (const [, init] of fetchMock.mock.calls) {
      expect(init.body).toBeUndefined();
      expect(Object.keys(init.headers)).toEqual(["x-blocks-key"]);
    }
  });

  it("throws RestPathError for //evil.com before any network call", async () => {
    const attempt = sendRestRequest({ method: "GET", path: "//evil.com/x", query: [] });

    await expect(attempt).rejects.toBeInstanceOf(RestPathError);
    await expect(attempt).rejects.toMatchObject({ refusal: "double-slash" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getMockData).not.toHaveBeenCalled();
  });

  it("uses the relative-base fallback when BLOCKS_DATA_BASE_URL is empty", async () => {
    runtimeEnv.values.BLOCKS_DATA_BASE_URL = "";
    fetchMock.mockResolvedValue(reply(200));

    await sendRestRequest({ method: "GET", path: "/RT/item", query: [] });

    expect(fetchMock.mock.calls[0][0]).toBe(`${window.location.origin}/api/gateway/RT/item`);
  });

  describe("401 handling", () => {
    it("on 401 calls getMockData once then retries once", async () => {
      fetchMock.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200, "ok"));
      getMockData.mockResolvedValue({});

      const result = await sendRestRequest({ method: "GET", path: "/RT/item", query: [] });

      expect(getMockData).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[0][0]);
      expect(result).toMatchObject({ kind: "response", status: 200, bodyText: "ok" });
    });

    it("shows a second 401", async () => {
      fetchMock.mockImplementation(async () => reply(401, "again"));
      getMockData.mockResolvedValue({});

      const result = await sendRestRequest({ method: "GET", path: "/RT/item", query: [] });

      expect(result).toMatchObject({ kind: "response", status: 401, bodyText: "again" });
    });

    it("does not refresh more than once when the retry is also 401", async () => {
      fetchMock.mockImplementation(async () => reply(401));
      getMockData.mockResolvedValue({});

      await sendRestRequest({ method: "GET", path: "/RT/item", query: [] });

      expect(getMockData).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("returns the 401 as is when the refresh throws", async () => {
      fetchMock.mockResolvedValue(reply(401, "nope"));
      getMockData.mockRejectedValue(new Error("refresh failed"));

      const result = await sendRestRequest({ method: "GET", path: "/RT/item", query: [] });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ kind: "response", status: 401, bodyText: "nope" });
    });

    it("does not refresh on other statuses", async () => {
      fetchMock.mockResolvedValue(reply(403));

      await sendRestRequest({ method: "GET", path: "/RT/item", query: [] });

      expect(getMockData).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("aborts during the retry", async () => {
      const controller = new AbortController();
      fetchMock.mockResolvedValueOnce(reply(401)).mockImplementationOnce(async () => {
        controller.abort();
        throw new DOMException("The operation was aborted.", "AbortError");
      });
      getMockData.mockResolvedValue({});

      const result = await sendRestRequest(
        { method: "GET", path: "/RT/item", query: [] },
        controller.signal,
      );

      expect(result).toEqual({ kind: "aborted" });
    });

    it("turns a rejection during the retry into no-response", async () => {
      fetchMock
        .mockResolvedValueOnce(reply(401))
        .mockRejectedValueOnce(new TypeError("Failed to fetch"));
      getMockData.mockResolvedValue({});

      const result = await sendRestRequest({ method: "GET", path: "/RT/item", query: [] });

      expect(result).toMatchObject({ kind: "no-response", reason: "Failed to fetch" });
    });
  });

  it("turns a fetch rejection into no-response", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await sendRestRequest({ method: "GET", path: "/RT/item", query: [] });

    expect(result).toMatchObject({ kind: "no-response", reason: "Failed to fetch" });
    if (result.kind !== "no-response") throw new Error("unreachable");
    expect(Number.isInteger(result.durationMs)).toBe(true);
  });

  it("falls back to String(error) when the rejection has no message", async () => {
    fetchMock.mockRejectedValue("boom");

    const result = await sendRestRequest({ method: "GET", path: "/RT/item", query: [] });

    expect(result).toMatchObject({ kind: "no-response", reason: "boom" });
  });

  it("turns an abort into aborted", async () => {
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));

    const result = await sendRestRequest({ method: "GET", path: "/RT/item", query: [] });

    expect(result).toEqual({ kind: "aborted" });
  });

  it("treats any rejection after signal.aborted as aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new Error("something else"));

    const result = await sendRestRequest(
      { method: "GET", path: "/RT/item", query: [] },
      controller.signal,
    );

    expect(result).toEqual({ kind: "aborted" });
  });

  it("does not send the request through http", async () => {
    fetchMock.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200));
    getMockData.mockResolvedValue({});

    await sendRestRequest({ method: "DELETE", path: "/RT/items", query: [], body: "{}" });

    for (const fn of Object.values(http)) expect(fn).not.toHaveBeenCalled();
  });
});
