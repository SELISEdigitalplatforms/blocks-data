import { describe, expect, it } from "vitest";
import { parseGatewayRoute, routedSegments, type GatewayRoute } from "./route-segments";

describe("routedSegments: path segments as the server routes them", () => {
  it("splits on /, drops empty segments, decodes and lower-cases", () => {
    expect(routedSegments("/Employee/AB%20c")).toEqual(["employee", "ab c"]);
    expect(routedSegments("/E%3ADeleteMany")).toEqual(["e:deletemany"]);
    expect(routedSegments("/E//X/")).toEqual(["e", "x"]);
    expect(routedSegments("/")).toEqual([]);
    expect(routedSegments("")).toEqual([]);
  });

  it("gives null for a segment that does not decode", () => {
    expect(routedSegments("/E/%zz/1")).toEqual(["e", null, "1"]);
    expect(routedSegments("/E/%E0%A4%A")).toEqual(["e", null]);
  });
});

describe("parseGatewayRoute: the spec §2 shape of a path", () => {
  it.each<[string, GatewayRoute]>([
    ["/Employee", { entity: "Employee" }],
    ["/Employee/abc-1", { entity: "Employee", id: "abc-1" }],
    ["/Employee:query", { entity: "Employee", verb: "query" }],
    ["/Employee:insertMany", { entity: "Employee", verb: "insertMany" }],
    ["/Employee:updateMany", { entity: "Employee", verb: "updateMany" }],
    ["/Employee:deleteMany", { entity: "Employee", verb: "deleteMany" }],
  ])("%s", (path, route) => {
    expect(parseGatewayRoute(path)).toEqual(route);
  });

  it("percent-decodes, keeping the entity's case", () => {
    expect(parseGatewayRoute("/E%3AdeleteMany")).toEqual({ entity: "E", verb: "deleteMany" });
    expect(parseGatewayRoute("/E%3adeleteMany")).toEqual({ entity: "E", verb: "deleteMany" });
    expect(parseGatewayRoute("/RT_Blocklist/a%20b")).toEqual({ entity: "RT_Blocklist", id: "a b" });
    expect(parseGatewayRoute("/%45mployee")).toEqual({ entity: "Employee" });
  });

  it("keeps the {itemId} placeholder as an id", () => {
    expect(parseGatewayRoute("/Employee/{itemId}")).toEqual({ entity: "Employee", id: "{itemId}" });
  });

  it("reads a verb only after the entity: a second segment is an id", () => {
    expect(parseGatewayRoute("/E/query")).toEqual({ entity: "E", id: "query" });
    expect(parseGatewayRoute("/E/a:b")).toEqual({ entity: "E", id: "a:b" });
  });

  it("reads 'item' and 'items' as ids, since the old routes are gone", () => {
    expect(parseGatewayRoute("/E/item")).toEqual({ entity: "E", id: "item" });
    expect(parseGatewayRoute("/E/items")).toEqual({ entity: "E", id: "items" });
  });

  it("ignores one trailing slash", () => {
    expect(parseGatewayRoute("/Employee/")).toEqual({ entity: "Employee" });
    expect(parseGatewayRoute("/Employee:query/")).toEqual({ entity: "Employee", verb: "query" });
  });

  it.each([
    // Verbs match exactly.
    "/E:DeleteMany",
    "/E:DELETEMANY",
    "/E:Query",
    "/E:unknown",
    "/E:",
    "/:query",
    "/E:query:x",
    "/E%3A",
    "/E:query/1",
    "/E/1:query/x",
    "/E/1/extra",
    "/E//1",
    "//E",
    "/",
    "",
    "Employee",
    "/E/%zz",
    "/%E0%A4%A",
  ])("%s is not a gateway route", (path) => {
    expect(parseGatewayRoute(path)).toBeNull();
  });
});
