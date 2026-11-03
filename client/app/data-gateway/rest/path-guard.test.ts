import { describe, expect, it } from "vitest";
import { checkGatewayPath, encodePathSegment, hasItemIdPlaceholder } from "./path-guard";

const BASE = "https://api.example.com/api/gateway";

describe("checkGatewayPath: a path may only reach the gateway it is based on", () => {
  it.each([
    ["RT/item/1", "not-relative"],
    ["//evil.com/x", "double-slash"],
    ["/a//b", "double-slash"],
    ["/a\\b", "backslash"],
    ["/a/../b", "dot-segment"],
    ["/./a", "dot-segment"],
    ["/http:/x", "scheme"],
    ["/a b", "control-or-space"],
    ["/a\u0000", "control-or-space"],
    ["/a\tb", "control-or-space"],
    ["/a\nb", "control-or-space"],
    ["/a\u007fb", "control-or-space"],
    ["/a?b=1", "query-or-fragment"],
    ["/a#b", "query-or-fragment"],
    ["/E/item/1#", "query-or-fragment"],
    // Order: control-or-space wins over query-or-fragment, which wins over double-slash.
    ["/a #b", "control-or-space"],
    ["/a#//b", "query-or-fragment"],
    // Percent-encoded dot segments: WHATWG URL resolves them, so they are refused like plain ones.
    ["/E/%2e/items", "dot-segment"],
    ["/X/%2E%2e/E/items", "dot-segment"],
    ["/a/%2e%2e/%2e%2e/x", "dot-segment"],
    ["/E/.%2E", "dot-segment"],
    // A segment that does not decode cannot be checked, so it is refused.
    ["/E/%zz", "bad-escape"],
    ["/E/item/%", "bad-escape"],
    ["/E/%E0%A4%A", "bad-escape"],
  ])("refuses %s as %s", (path, refusal) => {
    expect(checkGatewayPath(path, BASE)).toEqual({ ok: false, refusal });
  });

  it.each([
    "/RT_Blocklist",
    "/RT_Blocklist/item/abc-1",
    "/RT_Blocklist/items",
    "/RT_Blocklist/item/a%20b",
    "/RT_Blocklist/item/a%2Eb",
    "/RT_Blocklist/item/%2e%2e%2e",
    "/RT_Blocklist/item/%25",
    "/",
    "/E/item/{itemId}",
    // An encoded backslash stays inside the path; the host does not change.
    "/E/%5Cx",
    // "@" only matters in an authority; here it stays on the host.
    "/a@evil.com",
    // A colon is refused only in the first segment.
    "/E/item/a:b",
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
    expect(hasItemIdPlaceholder("/E/item/{itemId}")).toBe(true);
    expect(hasItemIdPlaceholder("/E/item/1")).toBe(false);
  });

  it("encodes a segment", () => {
    expect(encodePathSegment("a b/c")).toBe("a%20b%2Fc");
  });
});
