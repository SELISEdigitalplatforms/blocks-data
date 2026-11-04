import { describe, expect, it } from "vitest";
import { toCurl, toFetch, toHttp } from "./snippets";
import type { RestRequestTemplate } from "./request-templates";

const patch: RestRequestTemplate = {
  group: "update",
  id: "update",
  method: "PATCH",
  path: "/E/{itemId}",
  query: [],
  body: { Name: "x" },
};

const list: RestRequestTemplate = {
  group: "query",
  id: "list",
  method: "GET",
  path: "/E",
  query: [
    ["order", "Name:ASC"],
    ["select", "Name,Age"],
  ],
};

const BASE = "https://h/api/gateway";

describe("toHttp", () => {
  it("writes the request line, a blank line and the indented body", () => {
    expect(toHttp(patch)).toBe('PATCH /E/{itemId}\n\n{\n  "Name": "x"\n}');
  });

  it("returns the first line only when there is no body", () => {
    expect(toHttp(list)).toBe("GET /E?order=Name:ASC&select=Name,Age");
  });

  it("drops query pairs with an empty key", () => {
    expect(toHttp({ ...list, query: [["", "x"], ["a", "1"]] })).toBe("GET /E?a=1");
  });
});

describe("toCurl", () => {
  it("builds method, URL, both headers and a compact body on continuation lines", () => {
    const out = toCurl(patch, BASE, "k");
    expect(out).toBe(
      [
        "curl -X PATCH 'https://h/api/gateway/E/{itemId}' \\",
        "  -H 'x-blocks-key: k' \\",
        "  -H 'Content-Type: application/json' \\",
        `  --data '{"Name":"x"}'`,
      ].join("\n"),
    );
  });

  it("omits Content-Type and --data without a body", () => {
    const out = toCurl(list, BASE, "k");
    expect(out).toBe(
      ["curl -X GET 'https://h/api/gateway/E?order=Name:ASC&select=Name,Age' \\", "  -H 'x-blocks-key: k'"].join("\n"),
    );
    expect(out).not.toContain("Content-Type");
    expect(out).not.toContain("--data");
  });

  it("escapes a single quote and leaves $ literal inside the quotes", () => {
    const out = toCurl({ ...patch, body: { Name: "O'Brien $HOME" } }, BASE, "k");
    expect(out).toContain(`--data '{"Name":"O'\\''Brien $HOME"}'`);
  });

  it("escapes single quotes in the key and the URL", () => {
    const out = toCurl({ ...patch, path: "/E/it'em" }, BASE, "a'b");
    expect(out).toContain(`'https://h/api/gateway/E/it'\\''em'`);
    expect(out).toContain(`-H 'x-blocks-key: a'\\''b'`);
  });

  it("keeps newlines in a value as the JSON escape, on one line", () => {
    const out = toCurl({ ...patch, body: { Name: "a\nb" } }, BASE, "k");
    expect(out).toContain(`--data '{"Name":"a\\nb"}'`);
    expect(out.split("\n")).toHaveLength(4);
  });

  it("strips one trailing slash from the base", () => {
    expect(toCurl(list, `${BASE}/`, "k")).toContain("'https://h/api/gateway/E?");
  });

  it("URL-encodes query values", () => {
    expect(toCurl(list, BASE, "k")).toContain("order=Name:ASC");
  });
});

describe("toFetch", () => {
  it("builds a fetch call with method, headers and a pretty body", () => {
    expect(toFetch(patch, BASE, "k")).toBe(
      [
        'await fetch("https://h/api/gateway/E/{itemId}", {',
        '  method: "PATCH",',
        "  headers: {",
        '    "x-blocks-key": "k",',
        '    "Content-Type": "application/json",',
        "  },",
        "  body: JSON.stringify({",
        '    "Name": "x"',
        "  }),",
        "});",
      ].join("\n"),
    );
  });

  it("omits Content-Type and body for a GET and encodes the query", () => {
    expect(toFetch(list, BASE, "k")).toBe(
      [
        'await fetch("https://h/api/gateway/E?order=Name:ASC&select=Name,Age", {',
        '  method: "GET",',
        "  headers: {",
        '    "x-blocks-key": "k",',
        "  },",
        "});",
      ].join("\n"),
    );
  });

  it("escapes quotes and backslashes in the key", () => {
    expect(toFetch(list, BASE, 'a"b\\c')).toContain('"x-blocks-key": "a\\"b\\\\c"');
  });

  it("never adds credentials", () => {
    expect(toFetch(patch, BASE, "k")).not.toContain("credentials");
    expect(toFetch(list, BASE, "k")).not.toContain("credentials");
  });

  it("strips one trailing slash from the base", () => {
    expect(toFetch(list, `${BASE}/`, "k")).toContain('fetch("https://h/api/gateway/E?');
  });
});
