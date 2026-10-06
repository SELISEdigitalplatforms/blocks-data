import { describe, expect, it } from "vitest";

import { accessPresets, pickOwnerField } from "./access-presets";

const fields = (...names: string[]) => names.map((name) => ({ name }));

describe("pickOwnerField", () => {
  it("prefers an explicit ownership column over the default one", () => {
    expect(pickOwnerField(fields("CreatedBy", "OwnerId", "Status"))).toBe("OwnerId");
  });

  // CreatedBy is a default property on every entity schema.
  it("falls back to CreatedBy", () => {
    expect(pickOwnerField(fields("CreatedBy", "Status"))).toBe("CreatedBy");
  });

  it("reports none when the schema has no ownership column", () => {
    expect(pickOwnerField(fields("Status", "Total"))).toBeNull();
  });
});

describe("accessPresets", () => {
  it("points the owner rule at the column it found", () => {
    const [owner] = accessPresets(fields("OwnerId"));

    expect(owner.ruleSets[0].rules[0]).toMatchObject({
      field: "OwnerId",
      operator: "EQUAL",
      compareValue: "userId",
    });
  });

  // Offering a rule against a field that is not there would save and then never
  // match anything.
  it("drops the ownership presets when there is no ownership column", () => {
    const presets = accessPresets(fields("Status"));

    expect(presets.map((p) => p.id)).toEqual(["roles"]);
  });

  it("gives the override preset two sets, since either one grants access", () => {
    const presets = accessPresets(fields("OwnerId"));
    const combined = presets.find((p) => p.id === "owner-plus-support")!;

    expect(combined.ruleSets).toHaveLength(2);
    expect(combined.ruleSets.map((s) => s.name)).toEqual([
      "Owner access",
      "Support override",
    ]);
  });

  // Which roles is the project's decision; a plausible default gets saved unread.
  it("leaves the role list empty for the reader to fill in", () => {
    const roles = accessPresets(fields("Status"))[0];
    expect(roles.ruleSets[0].rules[0].compareValue).toBe("");
  });
});
