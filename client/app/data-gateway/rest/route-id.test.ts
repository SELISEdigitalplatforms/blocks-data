import { describe, expect, it } from "vitest";
import type { RestMethod, RestTemplateId } from "./request-templates";
import { routeIdFor } from "./route-id";

describe("routeIdFor: which REST route a method and path name", () => {
  it.each<[RestMethod, string, RestTemplateId]>([
    ["GET", "/Employee", "list"],
    ["POST", "/Employee", "listByBody"],
    ["GET", "/Employee/item/abc-1", "getOne"],
    ["POST", "/Employee/item", "insert"],
    ["POST", "/Employee/items", "insertMany"],
    ["PATCH", "/Employee/item/abc-1", "update"],
    ["PUT", "/Employee/item/abc-1", "upsert"],
    ["PATCH", "/Employee/items", "updateMany"],
    ["DELETE", "/Employee/item/abc-1", "delete"],
    ["DELETE", "/Employee/items", "deleteMany"],
  ])("%s %s is %s", (method, path, id) => {
    expect(routeIdFor(method, path)).toEqual({ entity: "Employee", id });
  });

  it("ignores a trailing slash", () => {
    expect(routeIdFor("GET", "/Employee/")).toEqual({ entity: "Employee", id: "list" });
    expect(routeIdFor("PATCH", "/Employee/items/")).toEqual({ entity: "Employee", id: "updateMany" });
  });

  it("keeps the {itemId} placeholder as an id", () => {
    expect(routeIdFor("GET", "/Employee/item/{itemId}")).toEqual({ entity: "Employee", id: "getOne" });
  });

  it.each<[RestMethod, string]>([
    ["GET", ""],
    ["GET", "/"],
    ["GET", "Employee"],
    ["PUT", "/Employee"],
    ["PATCH", "/Employee"],
    ["DELETE", "/Employee"],
    ["GET", "/Employee/item"],
    ["GET", "/Employee/items"],
    ["PUT", "/Employee/item"],
    ["PUT", "/Employee/items"],
    ["POST", "/Employee/item/abc-1"],
    ["GET", "/Employee/record/abc-1"],
    ["GET", "/Employee/item/abc-1/extra"],
    ["GET", "/Employee//item/abc-1"],
    ["GET", "/Employee/Item/abc-1"],
    ["GET", "//Employee"],
  ])("%s %s is not a known route", (method, path) => {
    expect(routeIdFor(method, path)).toBeNull();
  });
});
