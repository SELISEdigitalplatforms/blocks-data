import { describe, expect, it } from "vitest";
import { isMockTaggedRoute, MOCK_DATA_TAG, tagMockData } from "./mock-data-tag";

describe("MOCK_DATA_TAG", () => {
  it("is mock-data", () => {
    expect(MOCK_DATA_TAG).toBe("mock-data");
  });
});

describe("isMockTaggedRoute", () => {
  it.each([
    ["POST", "/Entity"],
    ["POST", "/Entity:insertMany"],
    ["POST", "/Entity/"],
    ["POST", "/Entity:insertMany/"],
    // The server decodes the path before routing.
    ["POST", "/E%3AinsertMany"],
    ["POST", "/%45"],
  ] as const)("matches %s %s", (method, path) => {
    expect(isMockTaggedRoute(method, path)).toBe(true);
  });

  it.each([
    ["GET", "/Entity"],
    ["GET", "/Entity/abc"],
    ["PATCH", "/Entity/abc"],
    ["DELETE", "/Entity/abc"],
    ["POST", "/Entity/abc"],
    ["POST", "/Entity:query"],
    ["POST", "/Entity:updateMany"],
    ["POST", "/Entity:deleteMany"],
    // The server refuses another casing (UNKNOWN_METHOD), so nothing is inserted.
    ["POST", "/Entity:InsertMany"],
    ["POST", "/Entity:insertmany"],
    ["POST", "/Entity:insertManyx"],
    ["PUT", "/Entity:insertMany"],
    ["GET", "/Entity:insertMany"],
    ["POST", "/Entity/insertMany"],
    ["POST", "/Entity/abc/extra"],
    ["POST", "/"],
    ["POST", ""],
    // The old routes are gone.
    ["POST", "/Entity/item/x"],
    // A segment that does not decode is not guessed at: the record is sent untagged.
    ["POST", "/%zz"],
    ["POST", "/E%3A%E0%A4%A"],
    // An upsert may replace a real record; tagging it would let Clean test data delete it (spec §4.3).
    ["PUT", "/Entity/abc"],
    ["PUT", "/Entity/abc/"],
  ] as const)("does not match %s %s", (method, path) => {
    expect(isMockTaggedRoute(method, path)).toBe(false);
  });
});

describe("tagMockData", () => {
  it("adds Tags when missing on a single insert", () => {
    expect(tagMockData("POST", "/E", { Name: "a" })).toEqual({ Name: "a", Tags: ["mock-data"] });
  });

  it("replaces Tags that is not an array", () => {
    expect(tagMockData("POST", "/E", { Tags: "x" })).toEqual({ Tags: ["mock-data"] });
    expect(tagMockData("POST", "/E", { Tags: null })).toEqual({ Tags: ["mock-data"] });
  });

  it("appends to an existing Tags array", () => {
    expect(tagMockData("POST", "/E", { Tags: ["x"] })).toEqual({ Tags: ["x", "mock-data"] });
  });

  it("does not duplicate the tag", () => {
    expect(tagMockData("POST", "/E", { Tags: ["mock-data", "x"] })).toEqual({ Tags: ["mock-data", "x"] });
  });

  it("tags every object in a :insertMany array and leaves other elements", () => {
    const out = tagMockData("POST", "/E:insertMany", [{ A: 1 }, "str", null, 5, [1], { Tags: ["y"] }]);
    expect(out).toEqual([{ A: 1, Tags: ["mock-data"] }, "str", null, 5, [1], { Tags: ["y", "mock-data"] }]);
  });

  it("tags on a percent-encoded route", () => {
    expect(tagMockData("POST", "/%45", { A: 1 })).toEqual({ A: 1, Tags: ["mock-data"] });
    expect(tagMockData("POST", "/E%3AinsertMany", [{ A: 1 }])).toEqual([{ A: 1, Tags: ["mock-data"] }]);
  });

  it("returns the body unchanged on non-tagged routes", () => {
    const body = { Name: "a" };
    expect(tagMockData("GET", "/E/1", body)).toBe(body);
    expect(tagMockData("POST", "/E:updateMany", body)).toBe(body);
    expect(tagMockData("PUT", "/E/1", body)).toBe(body);
  });

  it("returns other body shapes unchanged", () => {
    expect(tagMockData("POST", "/E", "text")).toBe("text");
    expect(tagMockData("POST", "/E", null)).toBeNull();
    const arr = [{ A: 1 }];
    expect(tagMockData("POST", "/E", arr)).toBe(arr);
    const obj = { A: 1 };
    expect(tagMockData("POST", "/E:insertMany", obj)).toBe(obj);
    expect(tagMockData("POST", "/E:insertMany", "x")).toBe("x");
  });

  it("does not mutate the input", () => {
    const record = { Tags: ["x"], Nested: { a: 1 } };
    const list = [record];
    const single = tagMockData("POST", "/E", record) as { Tags: string[] };
    const many = tagMockData("POST", "/E:insertMany", list) as { Tags: string[] }[];
    expect(record.Tags).toEqual(["x"]);
    expect(list).toHaveLength(1);
    expect(list[0]).toBe(record);
    expect(single).not.toBe(record);
    expect(single.Tags).not.toBe(record.Tags);
    expect(many).not.toBe(list);
    expect(many[0]).not.toBe(record);
  });
});
