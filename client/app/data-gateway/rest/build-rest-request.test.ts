import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRestRequest, type RestDraft } from "./build-rest-request";

const BASE = "https://api.test/api/gateway";
const build = (method: RestDraft["method"], requestLine: string, bodyText = "") =>
  buildRestRequest({ method, requestLine, bodyText }, BASE);

afterEach(() => vi.restoreAllMocks());

describe("buildRestRequest: the request it builds", () => {
  it("splits the request line into path and query and sends the body text as typed", () => {
    expect(build("PATCH", "/Employee/item/1?trace=1", '{ "Name": "Ann" }')).toEqual({
      ok: true,
      req: { method: "PATCH", path: "/Employee/item/1", query: [["trace", "1"]], body: '{ "Name": "Ann" }' },
      tagged: false,
    });
  });

  it("sends no body for GET, even when there is body text", () => {
    expect(build("GET", "/Employee", '{"x":1}')).toEqual({
      ok: true,
      req: { method: "GET", path: "/Employee", query: [] },
      tagged: false,
    });
  });

  it("sends no body when the body text is blank, and does not check it", () => {
    expect(build("DELETE", "/Employee/item/1", "  \n")).toEqual({
      ok: true,
      req: { method: "DELETE", path: "/Employee/item/1", query: [] },
      tagged: false,
    });
  });

  it("tags the body of POST /E/item and keeps every number as typed", () => {
    const result = build("POST", "/Employee/item", '{ "Id": 9007199254740993, "Price": 1.0, "Huge": 1e400 }');
    expect(result).toEqual({
      ok: true,
      req: {
        method: "POST",
        path: "/Employee/item",
        query: [],
        body: '{"Id":9007199254740993,"Price":1.0,"Huge":1e400,"Tags":["mock-data"]}',
      },
      tagged: true,
    });
  });

  it("tags each record of POST /E/items", () => {
    const result = build("POST", "/Employee/items", '[{ "Name": "a" }, { "Name": "b", "Tags": ["x"] }]');
    expect(result.ok && result.req.body).toBe(
      '[{"Name":"a","Tags":["mock-data"]},{"Name":"b","Tags":["x","mock-data"]}]',
    );
  });

  it("sends a tagged route's body unchanged when tagging does not apply to it", () => {
    expect(build("POST", "/Employee/item", "[1, 2.0]")).toEqual({
      ok: true,
      req: { method: "POST", path: "/Employee/item", query: [], body: "[1, 2.0]" },
      tagged: false,
    });
  });
});

describe("buildRestRequest: refusals", () => {
  it.each([
    ["Employee", "not-relative", "NOT_RELATIVE"],
    ["/Employee//item", "double-slash", "DOUBLE_SLASH"],
    ["/Employee\\item", "backslash", "BACKSLASH"],
    ["/Employee/%2e/items", "dot-segment", "DOT_SEGMENT"],
    ["/Employee/item/%zz", "bad-escape", "BAD_ESCAPE"],
    ["/https:x", "scheme", "SCHEME"],
    ["/Employee item", "control-or-space", "CONTROL_OR_SPACE"],
    ["/Employee#top", "query-or-fragment", "QUERY_OR_FRAGMENT"],
  ])("refuses %j on the path (%s)", (line, _refusal, key) => {
    expect(build("GET", line)).toEqual({ ok: false, target: "path", key: `REST_PLAYGROUND.PATH_REFUSAL_${key}` });
  });

  it("checks the path against the base it is given", () => {
    expect(buildRestRequest({ method: "GET", requestLine: "/Employee", bodyText: "" }, "not a url")).toEqual({
      ok: false,
      target: "path",
      key: "REST_PLAYGROUND.PATH_REFUSAL_ESCAPES_BASE",
    });
  });

  it("refuses a path that still holds {itemId}", () => {
    expect(build("GET", "/Employee/item/{itemId}?select=Name")).toEqual({
      ok: false,
      target: "path",
      key: "REST_PLAYGROUND.ERROR_ITEM_ID",
    });
  });

  it("checks the path before the body", () => {
    expect(build("POST", "Employee/item/{itemId}", "{")).toMatchObject({
      target: "path",
      key: "REST_PLAYGROUND.PATH_REFUSAL_NOT_RELATIVE",
    });
  });

  it("refuses invalid JSON with its line, on any method that sends a body", () => {
    expect(build("PUT", "/Employee/item", '{\n  "Name": }')).toEqual({
      ok: false,
      target: "body",
      key: "REST_PLAYGROUND.ERROR_INVALID_JSON",
      params: { line: 2 },
    });
  });

  it.each([
    ["/Employee/item", '{"Name":"a","Age":1,"Age":2}', "Age"],
    ["/Employee/items", '[{"A":{"x":1},"A":{"y":"s"}}]', "A"],
  ])("refuses a duplicate key on tagged POST %s", (line, bodyText, key) => {
    expect(build("POST", line, bodyText)).toEqual({
      ok: false,
      target: "body",
      key: "REST_PLAYGROUND.ERROR_DUPLICATE_KEY",
      params: { key },
    });
  });

  it("sends a duplicate key unchanged on a route that is not tagged", () => {
    expect(build("PATCH", "/Employee/item/1", '{"A":1,"A":2}')).toMatchObject({
      ok: true,
      req: { body: '{"A":1,"A":2}' },
    });
  });

  it("refuses a body nested too deeply to tag", () => {
    const bodyText = `[${'{"a":'.repeat(20_000)}1${"}".repeat(20_000)}]`;
    expect(build("POST", "/Employee/items", bodyText)).toEqual({
      ok: false,
      target: "body",
      key: "REST_PLAYGROUND.ERROR_TOO_DEEP",
    });
  });

  it("refuses a body it could not tag for any other reason", () => {
    // Every nonce drawn is the same, and the body holds it, so no sentinel is safe to use.
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T) => {
      (array as unknown as Uint32Array).fill(1);
      return array;
    });
    expect(build("POST", "/Employee/item", '{ "Note": "1111" }')).toEqual({
      ok: false,
      target: "body",
      key: "REST_PLAYGROUND.ERROR_NOT_TAGGED",
    });
  });
});
