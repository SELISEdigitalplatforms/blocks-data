import { describe, expect, it } from "vitest";
import { entityRelativePath } from "./entity-relative-path";

describe("entityRelativePath", () => {
  it("shows the entity's own route as /", () => {
    expect(entityRelativePath("/Item", "Item")).toBe("/");
  });

  it("drops the entity prefix from a record path", () => {
    expect(entityRelativePath("/Item/{itemId}", "Item")).toBe("/{itemId}");
  });

  it.each(["query", "insertMany", "updateMany", "deleteMany"])("shows the custom method %s as :verb", (verb) => {
    expect(entityRelativePath(`/RT_Blocklist:${verb}`, "RT_Blocklist")).toBe(`:${verb}`);
  });

  it("leaves a path under a different entity that merely starts with the same letters", () => {
    expect(entityRelativePath("/Items/x", "Item")).toBe("/Items/x");
    expect(entityRelativePath("/Items:query", "Item")).toBe("/Items:query");
  });
});
