import { describe, expect, it } from "vitest";
import { checkGatewayPath, encodePathSegment, hasItemIdPlaceholder } from "./path-guard";

const BASE = "https://api.example.com/api/gateway";

describe("checkGatewayPath: a path may only reach the gateway it is based on", () => {
  it.each([
    ["RT/1", "not-relative"],
    ["http:x", "not-relative"],
    ["//evil.com/x", "double-slash"],
    ["/a//b", "double-slash"],
    ["/a\\b", "backslash"],
    ["/a/../b", "dot-segment"],
    ["/./a", "dot-segment"],
    ["/http:/x", "scheme"],
    // One colon in the first segment is allowed only between an entity name and a verb.
    ["/E:", "scheme"],
    ["/E:query:x", "scheme"],
    ["/:query", "scheme"],
    ["/E%3A", "scheme"],
    ["/E%3Aquery%3Ax", "scheme"],
    ["/E-1:query", "scheme"],
    ["/E:query1", "scheme"],
    ["/E%3A%2F%2Fevil.com", "scheme"],
    ["/E%3Aquery%2F..", "scheme"],
    ["/E:x@evil.com", "scheme"],
    ["/E:query%0A", "scheme"],
    [`/${"A".repeat(51)}:query`, "scheme"],
    ["/a b", "control-or-space"],
    ["/a\u0000", "control-or-space"],
    ["/a\tb", "control-or-space"],
    ["/a\nb", "control-or-space"],
    ["/a\u007fb", "control-or-space"],
    ["/a?b=1", "query-or-fragment"],
    ["/a#b", "query-or-fragment"],
    ["/E/1#", "query-or-fragment"],
    // Order: control-or-space wins over query-or-fragment, which wins over double-slash.
    ["/a #b", "control-or-space"],
    ["/a#//b", "query-or-fragment"],
    // Percent-encoded dot segments: WHATWG URL resolves them, so they are refused like plain ones.
    ["/E/%2e/1", "dot-segment"],
    ["/X/%2E%2e/E:deleteMany", "dot-segment"],
    ["/a/%2e%2e/%2e%2e/x", "dot-segment"],
    ["/E/.%2E", "dot-segment"],
    // A segment that does not decode cannot be checked, so it is refused.
    ["/E/%zz", "bad-escape"],
    ["/E/%", "bad-escape"],
    // Checked before the colon rule.
    ["/E%3A%zz", "bad-escape"],
    ["/E/%E0%A4%A", "bad-escape"],
  ])("refuses %s as %s", (path, refusal) => {
    expect(checkGatewayPath(path, BASE)).toEqual({ ok: false, refusal });
  });

  it.each([
    "/RT_Blocklist",
    "/RT_Blocklist/abc-1",
    "/RT_Blocklist/a%20b",
    "/RT_Blocklist/a%2Eb",
    "/RT_Blocklist/%2e%2e%2e",
    "/RT_Blocklist/%25",
    "/",
    "/E/{itemId}",
    // A custom method: one colon between an entity name and a verb, written plainly or encoded.
    "/E:query",
    "/RT_Blocklist:insertMany",
    "/RT_Blocklist:updateMany",
    "/E%3AdeleteMany",
    "/E%3adeleteMany",
    `/${"A".repeat(50)}:query`,
    // The server answers another casing with UNKNOWN_METHOD; the confirm gate still asks first.
    "/E:DELETEMANY",
    "/E:DeleteMany/",
    // Any verb of letters reaches the server, which answers UNKNOWN_METHOD (spec §5 shape).
    "/E:unknown",
    "/http:x",
    // An encoded backslash stays inside the path; the host does not change.
    "/E/%5Cx",
    // "@" only matters in an authority; here it stays on the host.
    "/a@evil.com",
    // A colon is checked only in the first segment.
    "/E/a:b",
    "/E/http:x",
  ])(
    "accepts %s",
    (path) => {
      expect(checkGatewayPath(path, BASE)).toEqual({ ok: true });
    },
  );

  it("refuses a path whose URL does not keep the base as written", () => {
    // Encoded dot segments are refused before this check; it stays as the last line of defence.
    expect(checkGatewayPath("/a", "https://API.example.com/api/gateway")).toEqual({
      ok: false,
      refusal: "escapes-base",
    });
  });
});

describe("path helpers", () => {
  it("detects the placeholder", () => {
    expect(hasItemIdPlaceholder("/E/{itemId}")).toBe(true);
    expect(hasItemIdPlaceholder("/E/1")).toBe(false);
  });

  it("encodes a segment", () => {
    expect(encodePathSegment("a b/c")).toBe("a%20b%2Fc");
  });
});
