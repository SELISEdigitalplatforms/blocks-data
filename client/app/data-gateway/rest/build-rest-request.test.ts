import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRestRequest, type RestDraft } from "./build-rest-request";

const BASE = "https://api.test/api/gateway";
const build = (method: RestDraft["method"], requestLine: string, bodyText = "") =>
  buildRestRequest({ method, requestLine, bodyText }, BASE);

afterEach(() => vi.restoreAllMocks());

describe("buildRestRequest: the request it builds", () => {
  it("splits the request line into path and query and sends the body text as typed", () => {
    expect(build("PATCH", "/Employee/1?trace=1", '{ "Name": "Ann" }')).toEqual({
      ok: true,
      req: { method: "PATCH", path: "/Employee/1", query: [["trace", "1"]], body: '{ "Name": "Ann" }' },
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
    expect(build("DELETE", "/Employee/1", "  \n")).toEqual({
      ok: true,
      req: { method: "DELETE", path: "/Employee/1", query: [] },
      tagged: false,
    });
  });

  it("tags the body of POST /E and keeps every number as typed", () => {
    const result = build("POST", "/Employee", '{ "Id": 9007199254740993, "Price": 1.0, "Huge": 1e400 }');
    expect(result).toEqual({
      ok: true,
      req: {
        method: "POST",
        path: "/Employee",
        query: [],
        body: '{"Id":9007199254740993,"Price":1.0,"Huge":1e400,"Tags":["mock-data"]}',
      },
      tagged: true,
    });
  });

  it("tags each record of POST /E:insertMany", () => {
    const result = build("POST", "/Employee:insertMany", '[{ "Name": "a" }, { "Name": "b", "Tags": ["x"] }]');
    expect(result.ok && result.req.body).toBe(
      '[{"Name":"a","Tags":["mock-data"]},{"Name":"b","Tags":["x","mock-data"]}]',
    );
  });

  it("sends a custom method other than :insertMany untagged, an encoded colon included", () => {
    expect(build("POST", "/Employee:deleteMany?hardDelete=true", '{ "where": {} }')).toEqual({
      ok: true,
      req: { method: "POST", path: "/Employee:deleteMany", query: [["hardDelete", "true"]], body: '{ "where": {} }' },
      tagged: false,
    });
    expect(build("POST", "/Employee%3AinsertMany", '[{ "Name": "a" }]')).toMatchObject({
      ok: true,
      req: { path: "/Employee%3AinsertMany", body: '[{"Name":"a","Tags":["mock-data"]}]' },
      tagged: true,
    });
  });

  it("sends a tagged route's body unchanged when tagging does not apply to it", () => {
    expect(build("POST", "/Employee", "[1, 2.0]")).toEqual({
      ok: true,
      req: { method: "POST", path: "/Employee", query: [], body: "[1, 2.0]" },
      tagged: false,
    });
  });
});

describe("buildRestRequest: refusals", () => {
  it.each([
    ["Employee", "not-relative", "NOT_RELATIVE"],
    ["/Employee//1", "double-slash", "DOUBLE_SLASH"],
    ["/Employee\\1", "backslash", "BACKSLASH"],
    ["/Employee/%2e/1", "dot-segment", "DOT_SEGMENT"],
    ["/Employee/%zz", "bad-escape", "BAD_ESCAPE"],
    ["/https:/x", "scheme", "SCHEME"],
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
    expect(build("GET", "/Employee/{itemId}?select=Name")).toEqual({
      ok: false,
      target: "path",
      key: "REST_PLAYGROUND.ERROR_ITEM_ID",
    });
  });

  it("checks the path before the body", () => {
    expect(build("POST", "Employee/{itemId}", "{")).toMatchObject({
      target: "path",
      key: "REST_PLAYGROUND.PATH_REFUSAL_NOT_RELATIVE",
    });
  });

  it("refuses invalid JSON with its line, on any method that sends a body", () => {
    expect(build("PUT", "/Employee/1", '{\n  "Name": }')).toEqual({
      ok: false,
      target: "body",
      key: "REST_PLAYGROUND.ERROR_INVALID_JSON",
      params: { line: 2 },
    });
  });

  it.each([
    ["/Employee", '{"Name":"a","Age":1,"Age":2}', "Age"],
    ["/Employee:insertMany", '[{"A":{"x":1},"A":{"y":"s"}}]', "A"],
  ])("refuses a duplicate key on tagged POST %s", (line, bodyText, key) => {
    expect(build("POST", line, bodyText)).toEqual({
      ok: false,
      target: "body",
      key: "REST_PLAYGROUND.ERROR_DUPLICATE_KEY",
      params: { key },
    });
  });

  it("sends a duplicate key unchanged on a route that is not tagged", () => {
    expect(build("PATCH", "/Employee/1", '{"A":1,"A":2}')).toMatchObject({
      ok: true,
      req: { body: '{"A":1,"A":2}' },
    });
  });

  it("refuses a body nested too deeply to tag", () => {
    const bodyText = `[${'{"a":'.repeat(20_000)}1${"}".repeat(20_000)}]`;
    expect(build("POST", "/Employee:insertMany", bodyText)).toEqual({
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
    expect(build("POST", "/Employee", '{ "Note": "1111" }')).toEqual({
      ok: false,
      target: "body",
      key: "REST_PLAYGROUND.ERROR_NOT_TAGGED",
    });
  });
});
