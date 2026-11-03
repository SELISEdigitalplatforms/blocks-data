import { describe, expect, it } from "vitest";
import { routedSegments } from "./route-segments";

describe("routedSegments: path segments as the server routes them", () => {
  it("splits on /, drops empty segments, decodes and lower-cases", () => {
    expect(routedSegments("/Employee/Item/AB%20c")).toEqual(["employee", "item", "ab c"]);
    expect(routedSegments("/E/%69tem")).toEqual(["e", "item"]);
    expect(routedSegments("/E//ITEMS/")).toEqual(["e", "items"]);
    expect(routedSegments("/")).toEqual([]);
    expect(routedSegments("")).toEqual([]);
  });

  it("gives null for a segment that does not decode", () => {
    expect(routedSegments("/E/%zz/1")).toEqual(["e", null, "1"]);
    expect(routedSegments("/E/%E0%A4%A")).toEqual(["e", null]);
  });
});
