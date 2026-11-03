import { describe, expect, it } from "vitest";
import { entityRelativePath } from "./entity-relative-path";

describe("entityRelativePath", () => {
  it("drops the entity prefix from a path under the entity", () => {
    expect(entityRelativePath("/Item/item/{itemId}", "Item")).toBe("/item/{itemId}");
  });

  it("shows the entity's own route as /", () => {
    expect(entityRelativePath("/Item", "Item")).toBe("/");
  });

  it("leaves a path under a different entity that merely starts with the same letters", () => {
    expect(entityRelativePath("/Items/x", "Item")).toBe("/Items/x");
  });
});
