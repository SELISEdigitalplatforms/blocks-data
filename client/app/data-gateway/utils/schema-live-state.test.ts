import { describe, expect, it } from "vitest";
import { schemaLiveState } from "./schema-live-state";

describe("schemaLiveState", () => {
  const pending = new Set(["changed"]);

  it("is not-live when the live version doesn't contain the schema", () => {
    expect(schemaLiveState({ id: "new", isLive: false }, pending)).toBe("not-live");
  });

  it("prefers not-live over unpublished changes", () => {
    expect(schemaLiveState({ id: "changed", isLive: false }, pending)).toBe("not-live");
  });

  it("is unpublished when a live schema has pending changes", () => {
    expect(schemaLiveState({ id: "changed", isLive: true }, pending)).toBe("unpublished");
  });

  it("is nothing when a live schema matches the live version", () => {
    expect(schemaLiveState({ id: "same", isLive: true }, pending)).toBeNull();
  });

  it("is nothing while the live version is unknown", () => {
    expect(schemaLiveState({ id: "changed", isLive: null }, pending)).toBeNull();
    expect(schemaLiveState({ id: "changed" }, pending)).toBeNull();
  });
});
