import { describe, expect, it } from "vitest";
import { isMockTaggedRoute, MOCK_DATA_TAG, tagMockData } from "./mock-data-tag";

describe("MOCK_DATA_TAG", () => {
  it("is mock-data", () => {
    expect(MOCK_DATA_TAG).toBe("mock-data");
  });
});

describe("isMockTaggedRoute", () => {
  it.each([
    ["POST", "/Entity/item"],
    ["POST", "/Entity/items"],
    ["POST", "/Entity/item/"],
    // The server routes case-insensitively on the decoded path.
    ["POST", "/E/Item"],
    ["POST", "/E/ITEMS"],
    ["POST", "/E/%69tem"],
    ["POST", "/E/%49TEMS"],
  ] as const)("matches %s %s", (method, path) => {
    expect(isMockTaggedRoute(method, path)).toBe(true);
  });

  it.each([
    ["GET", "/Entity/item/abc"],
    ["GET", "/Entity/item"],
    ["PATCH", "/Entity/items"],
    ["DELETE", "/Entity/items"],
    ["DELETE", "/Entity/item/abc"],
    ["POST", "/Entity/item/abc"],
    ["PUT", "/Entity/item"],
    ["PUT", "/Entity/items"],
    ["POST", "/item"],
    ["POST", "/Entity/other/item"],
    ["POST", "/Entity/itemsx"],
    ["PUT", "/Entity/item/abc/extra"],
    ["POST", "/"],
    ["POST", ""],
    // A segment that does not decode is not guessed at: the record is sent untagged.
    ["POST", "/E/%zz"],
    ["POST", "/E/%E0%A4%A"],
    // An upsert may replace a real record; tagging it would let Clean test data delete it (spec §4.3).
    ["PUT", "/Entity/item/abc"],
    ["PUT", "/Entity/item/abc/"],
    ["PUT", "/E/Item/abc"],
  ] as const)("does not match %s %s", (method, path) => {
    expect(isMockTaggedRoute(method, path)).toBe(false);
  });
});

describe("tagMockData", () => {
  it("adds Tags when missing on a single insert", () => {
    expect(tagMockData("POST", "/E/item", { Name: "a" })).toEqual({ Name: "a", Tags: ["mock-data"] });
  });

  it("replaces Tags that is not an array", () => {
    expect(tagMockData("POST", "/E/item", { Tags: "x" })).toEqual({ Tags: ["mock-data"] });
    expect(tagMockData("POST", "/E/item", { Tags: null })).toEqual({ Tags: ["mock-data"] });
  });

  it("appends to an existing Tags array", () => {
    expect(tagMockData("POST", "/E/item", { Tags: ["x"] })).toEqual({ Tags: ["x", "mock-data"] });
  });

  it("does not duplicate the tag", () => {
    expect(tagMockData("POST", "/E/item", { Tags: ["mock-data", "x"] })).toEqual({ Tags: ["mock-data", "x"] });
  });

  it("tags every object in an /items array and leaves other elements", () => {
    const out = tagMockData("POST", "/E/items", [{ A: 1 }, "str", null, 5, [1], { Tags: ["y"] }]);
    expect(out).toEqual([{ A: 1, Tags: ["mock-data"] }, "str", null, 5, [1], { Tags: ["y", "mock-data"] }]);
  });

  it("tags on a route written in another case or percent-encoded", () => {
    expect(tagMockData("POST", "/E/Item", { A: 1 })).toEqual({ A: 1, Tags: ["mock-data"] });
    expect(tagMockData("POST", "/E/%69tems", [{ A: 1 }])).toEqual([{ A: 1, Tags: ["mock-data"] }]);
  });

  it("returns the body unchanged on non-tagged routes", () => {
    const body = { Name: "a" };
    expect(tagMockData("GET", "/E/item/1", body)).toBe(body);
    expect(tagMockData("PATCH", "/E/items", body)).toBe(body);
    expect(tagMockData("PUT", "/E/item/1", body)).toBe(body);
  });

  it("returns other body shapes unchanged", () => {
    expect(tagMockData("POST", "/E/item", "text")).toBe("text");
    expect(tagMockData("POST", "/E/item", null)).toBeNull();
    const arr = [{ A: 1 }];
    expect(tagMockData("POST", "/E/item", arr)).toBe(arr);
    const obj = { A: 1 };
    expect(tagMockData("POST", "/E/items", obj)).toBe(obj);
    expect(tagMockData("POST", "/E/items", "x")).toBe("x");
  });

  it("does not mutate the input", () => {
    const record = { Tags: ["x"], Nested: { a: 1 } };
    const list = [record];
    const single = tagMockData("POST", "/E/item", record) as { Tags: string[] };
    const many = tagMockData("POST", "/E/items", list) as { Tags: string[] }[];
    expect(record.Tags).toEqual(["x"]);
    expect(list).toHaveLength(1);
    expect(list[0]).toBe(record);
    expect(single).not.toBe(record);
    expect(single.Tags).not.toBe(record.Tags);
    expect(many).not.toBe(list);
    expect(many[0]).not.toBe(record);
  });
});
