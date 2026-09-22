import { describe, expect, it } from "vitest";

import { schemaExposure } from "./schema-exposure";

/** SchemaAccessLevel: Inherited=0, User=1, Public=2, Custom=3. */
const levels = (read: number, write: number, edit: number, del: number) => ({
  readAccessLevel: read,
  writeAccessLevel: write,
  editAccessLevel: edit,
  deleteAccessLevel: del,
});

describe("schemaExposure", () => {
  it("says nothing about a schema behind custom rules", () => {
    expect(schemaExposure(levels(3, 3, 3, 3))).toBeNull();
  });

  // The product default. Dotting it would mark nearly every row.
  it("says nothing about signed-in read", () => {
    expect(schemaExposure(levels(1, 3, 3, 3))).toBeNull();
  });

  it("flags a publicly readable schema", () => {
    expect(schemaExposure(levels(2, 3, 3, 3))).toEqual({
      tier: "public",
      reason: "Anyone can read this schema",
    });
  });

  it("flags signed-in write, naming the verb", () => {
    expect(schemaExposure(levels(1, 1, 3, 3))).toEqual({
      tier: "user",
      reason: "Any signed-in user can create records in this schema",
    });
    expect(schemaExposure(levels(1, 3, 3, 1))?.reason).toBe(
      "Any signed-in user can delete from this schema",
    );
  });

  // Public write is worse than public read, so it must win the tooltip.
  it("reports public write ahead of public read", () => {
    expect(schemaExposure(levels(2, 2, 3, 3))).toEqual({
      tier: "public",
      reason: "Anyone can create records in this schema",
    });
  });

  it("reports public read ahead of signed-in write", () => {
    expect(schemaExposure(levels(2, 1, 3, 3))?.tier).toBe("public");
  });

  it("treats inherited as unremarkable", () => {
    expect(schemaExposure(levels(0, 0, 0, 0))).toBeNull();
  });
});
