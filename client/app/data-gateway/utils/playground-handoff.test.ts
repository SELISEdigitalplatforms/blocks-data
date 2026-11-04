import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: (key: string) => (key === "BLOCKS_DATA_BASE_URL" ? "https://api.example.com" : ""),
}));

import {
  clearPlaygroundHandoff,
  peekPlaygroundHandoff,
  writePlaygroundHandoff,
} from "./playground-handoff";

const NEW_KEY = "data-gateway-playground-handoff";
const LEGACY_KEY = "graphql-playground-query";

/** Consumes the handoff the way a caller does: peek, then clear. */
const consume = () => {
  const handoff = peekPlaygroundHandoff();
  clearPlaygroundHandoff();
  return handoff;
};

const store = (value: unknown) => localStorage.setItem(NEW_KEY, JSON.stringify(value));

const validRest = {
  protocol: "rest",
  method: "POST",
  path: "/RT",
  query: [["a", "1"]],
  body: '{"x":1}',
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("playground handoff", () => {
  it("round-trips a rest handoff and clears the key", () => {
    writePlaygroundHandoff({
      protocol: "rest",
      method: "PATCH",
      path: "/RT/1",
      query: [["k", "v"]],
      body: "{}",
    });

    expect(consume()).toEqual({
      protocol: "rest",
      method: "PATCH",
      path: "/RT/1",
      query: [["k", "v"]],
      body: "{}",
    });
    expect(localStorage.getItem(NEW_KEY)).toBeNull();
    expect(consume()).toBeNull();
  });

  it("round-trips a graphql handoff", () => {
    writePlaygroundHandoff({ protocol: "graphql", query: "{ a }" });

    expect(consume()).toEqual({ protocol: "graphql", query: "{ a }" });
  });

  it("accepts a rest handoff without a body", () => {
    store({ protocol: "rest", method: "GET", path: "/RT", query: [] });

    expect(consume()).toEqual({
      protocol: "rest",
      method: "GET",
      path: "/RT",
      query: [],
    });
  });

  it("drops a handoff with method TRACE", () => {
    store({ ...validRest, method: "TRACE" });

    expect(consume()).toBeNull();
    expect(localStorage.getItem(NEW_KEY)).toBeNull();
  });

  it("drops a lowercase method", () => {
    store({ ...validRest, method: "post" });

    expect(consume()).toBeNull();
  });

  it.each(["//evil.com/x", "/a/../b", "RT", "/a\\b"])(
    "drops path %s that fails the guard",
    (path) => {
      store({ ...validRest, path });

      expect(consume()).toBeNull();
    },
  );

  it.each([
    ["path", { path: 5 }],
    ["method", { method: 5 }],
    ["body", { body: 5 }],
    ["query not an array", { query: "a=1" }],
    ["query pair of wrong length", { query: [["a"]] }],
    ["query pair with a non-string", { query: [["a", 1]] }],
    ["query entry not an array", { query: ["a"] }],
  ])("drops non-string fields: %s", (_label, override) => {
    store({ ...validRest, ...override });

    expect(consume()).toBeNull();
  });

  it("drops a graphql handoff whose query is not a string", () => {
    store({ protocol: "graphql", query: 1 });

    expect(consume()).toBeNull();
  });

  it("drops an unknown protocol, malformed JSON and non-objects", () => {
    store({ protocol: "soap" });
    expect(consume()).toBeNull();

    localStorage.setItem(NEW_KEY, "{not json");
    expect(consume()).toBeNull();

    store(null);
    expect(consume()).toBeNull();

    store("rest");
    expect(consume()).toBeNull();
  });

  it("drops extra properties", () => {
    store({ ...validRest, extra: "x", headers: { a: "b" } });

    const result = consume();

    expect(result).toEqual(validRest);
    expect(Object.keys(result as object).sort()).toEqual([
      "body",
      "method",
      "path",
      "protocol",
      "query",
    ]);
  });

  it("reads the legacy key as graphql", () => {
    localStorage.setItem(LEGACY_KEY, "{ legacy }");

    expect(consume()).toEqual({ protocol: "graphql", query: "{ legacy }" });
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("ignores an empty legacy value but still clears it", () => {
    localStorage.setItem(LEGACY_KEY, "");

    expect(consume()).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it.each(["", "   ", "\n\t"])("drops a new-key graphql handoff with query %j and falls back to the legacy value", (query) => {
    store({ protocol: "graphql", query });
    localStorage.setItem(LEGACY_KEY, "{ legacy }");

    expect(consume()).toEqual({ protocol: "graphql", query: "{ legacy }" });
    expect(localStorage.getItem(NEW_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("returns null for a blank new-key graphql handoff with no legacy value", () => {
    store({ protocol: "graphql", query: "  " });

    expect(consume()).toBeNull();
    expect(localStorage.getItem(NEW_KEY)).toBeNull();
  });

  it("prefers the new key and clears both", () => {
    store(validRest);
    localStorage.setItem(LEGACY_KEY, "{ legacy }");

    expect(consume()).toEqual(validRest);
    expect(localStorage.getItem(NEW_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("falls back to the legacy key when the new value is invalid, clearing both", () => {
    store({ ...validRest, method: "TRACE" });
    localStorage.setItem(LEGACY_KEY, "{ legacy }");

    expect(consume()).toEqual({ protocol: "graphql", query: "{ legacy }" });
    expect(localStorage.getItem(NEW_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("returns null when storage throws on read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(consume()).toBeNull();
  });

  it("still returns a valid handoff when removal throws", () => {
    store(validRest);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(consume()).toEqual(validRest);
  });

  it("does not throw when storage throws on write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() => writePlaygroundHandoff({ protocol: "graphql", query: "{ a }" })).not.toThrow();
  });

  describe("peek and clear", () => {
    it("peek returns the handoff without removing either key", () => {
      store(validRest);
      localStorage.setItem(LEGACY_KEY, "{ legacy }");

      expect(peekPlaygroundHandoff()).toEqual(validRest);
      expect(peekPlaygroundHandoff()).toEqual(validRest);
      expect(localStorage.getItem(NEW_KEY)).not.toBeNull();
      expect(localStorage.getItem(LEGACY_KEY)).toBe("{ legacy }");
    });

    it("peek applies the same validation and legacy fallback as consuming", () => {
      store({ ...validRest, method: "TRACE" });
      localStorage.setItem(LEGACY_KEY, "{ legacy }");
      expect(peekPlaygroundHandoff()).toEqual({ protocol: "graphql", query: "{ legacy }" });

      localStorage.clear();
      store({ protocol: "rest" });
      expect(peekPlaygroundHandoff()).toBeNull();

      localStorage.clear();
      localStorage.setItem(NEW_KEY, "{not json");
      expect(peekPlaygroundHandoff()).toBeNull();

      localStorage.clear();
      expect(peekPlaygroundHandoff()).toBeNull();
    });

    it("peek returns null when storage throws", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });

      expect(peekPlaygroundHandoff()).toBeNull();
    });

    it("clear removes both keys, valid or not", () => {
      store(validRest);
      localStorage.setItem(LEGACY_KEY, "{ legacy }");
      clearPlaygroundHandoff();
      expect(localStorage.getItem(NEW_KEY)).toBeNull();
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();

      localStorage.setItem(NEW_KEY, "{not json");
      clearPlaygroundHandoff();
      expect(localStorage.getItem(NEW_KEY)).toBeNull();
    });

    it("clear does not throw when removal throws, and is harmless when nothing is stored", () => {
      expect(() => clearPlaygroundHandoff()).not.toThrow();

      store(validRest);
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("denied");
      });
      expect(() => clearPlaygroundHandoff()).not.toThrow();
    });

    it("peek then clear leaves the next peek empty", () => {
      store(validRest);
      expect(peekPlaygroundHandoff()).toEqual(validRest);
      clearPlaygroundHandoff();
      expect(peekPlaygroundHandoff()).toBeNull();
    });
  });
});
