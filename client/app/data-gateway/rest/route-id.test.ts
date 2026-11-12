import { describe, expect, it } from "vitest";
import type { RestMethod, RestTemplateId } from "./request-templates";
import { routeIdFor } from "./route-id";

describe("routeIdFor: which REST route a method and path name", () => {
  it.each<[RestMethod, string, RestTemplateId]>([
    ["GET", "/Employee", "list"],
    ["POST", "/Employee:query", "listByBody"],
    ["GET", "/Employee/abc-1", "getOne"],
    ["POST", "/Employee", "insert"],
    ["POST", "/Employee:insertMany", "insertMany"],
    ["PATCH", "/Employee/abc-1", "update"],
    ["PUT", "/Employee/abc-1", "upsert"],
    ["POST", "/Employee:updateMany", "updateMany"],
    ["DELETE", "/Employee/abc-1", "delete"],
    ["POST", "/Employee:deleteMany", "deleteMany"],
  ])("%s %s is %s", (method, path, id) => {
    expect(routeIdFor(method, path)).toEqual({ entity: "Employee", id });
  });

  it("ignores a trailing slash", () => {
    expect(routeIdFor("GET", "/Employee/")).toEqual({ entity: "Employee", id: "list" });
    expect(routeIdFor("POST", "/Employee:updateMany/")).toEqual({ entity: "Employee", id: "updateMany" });
  });

  it("decodes an encoded colon", () => {
    expect(routeIdFor("POST", "/Employee%3AdeleteMany")).toEqual({ entity: "Employee", id: "deleteMany" });
  });

  it("reads 'item' and 'items' as record ids, since the old routes are gone", () => {
    expect(routeIdFor("GET", "/Employee/item")).toEqual({ entity: "Employee", id: "getOne" });
    expect(routeIdFor("DELETE", "/Employee/items")).toEqual({ entity: "Employee", id: "delete" });
    expect(routeIdFor("PATCH", "/Employee/items")).toEqual({ entity: "Employee", id: "update" });
  });

  it("keeps the {itemId} placeholder as an id", () => {
    expect(routeIdFor("GET", "/Employee/{itemId}")).toEqual({ entity: "Employee", id: "getOne" });
  });

  it.each<[RestMethod, string]>([
    ["GET", ""],
    ["GET", "/"],
    ["GET", "Employee"],
    ["PUT", "/Employee"],
    ["PATCH", "/Employee"],
    ["DELETE", "/Employee"],
    ["POST", "/Employee/abc-1"],
    ["GET", "/Employee:query"],
    ["PATCH", "/Employee:updateMany"],
    ["DELETE", "/Employee:deleteMany"],
    ["PUT", "/Employee:insertMany"],
    ["POST", "/Employee:DeleteMany"],
    ["POST", "/Employee:unknown"],
    ["GET", "/Employee/abc-1/extra"],
    ["GET", "/Employee//abc-1"],
    ["GET", "//Employee"],
    // The old routes are gone.
    ["GET", "/Employee/item/abc-1"],
    ["PATCH", "/Employee/items/x"],
  ])("%s %s is not a known route", (method, path) => {
    expect(routeIdFor(method, path)).toBeNull();
  });
});
