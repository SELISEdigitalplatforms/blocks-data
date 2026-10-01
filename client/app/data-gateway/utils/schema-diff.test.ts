import { describe, expect, it } from "vitest";

import { describeChange, diffSchemaFields, type DiffRow } from "./schema-diff";

const field = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  type: "String",
  requiredOn: "None" as const,
  isArray: false,
  isPIIData: false,
  isUniqueData: false,
  description: "",
  ...over,
});

const row = (id: string, name: string, over: Record<string, unknown> = {}): DiffRow => ({
  id,
  ...field(name, over),
});

describe("diffSchemaFields", () => {
  it("reports nothing when nothing moved", () => {
    const diff = diffSchemaFields({
      originalById: { a: field("Email"), b: field("Phone") },
      rows: [row("a", "Email"), row("b", "Phone")],
    });

    expect(diff.changes).toEqual([]);
    expect(diff.count).toBe(0);
    expect(diff.losesData).toBe(false);
  });

  // A row with no id on record did not exist when editing began.
  it("counts a new row as an addition", () => {
    const diff = diffSchemaFields({
      originalById: { a: field("Email") },
      rows: [row("a", "Email"), row("new-1", "Nickname")],
    });

    expect(diff.changes).toEqual([{ kind: "added", name: "Nickname" }]);
  });

  it("counts a missing id as a removal, by the name it had", () => {
    const diff = diffSchemaFields({
      originalById: { a: field("Email"), b: field("Phone") },
      rows: [row("a", "Email")],
    });

    expect(diff.changes).toEqual([{ kind: "removed", name: "Phone" }]);
    expect(diff.losesData).toBe(true);
  });

  // The whole point of the phase: without a stable id this reads as a delete
  // plus an add, and nothing tells the user their column is going.
  it("recognises a rename rather than a delete plus an add", () => {
    const diff = diffSchemaFields({
      originalById: { a: field("Phone") },
      rows: [row("a", "PhoneNumber")],
    });

    expect(diff.changes).toEqual([
      { kind: "renamed", from: "Phone", to: "PhoneNumber", attributes: [] },
    ]);
    expect(diff.losesData).toBe(true);
  });

  it("names which attributes changed", () => {
    const diff = diffSchemaFields({
      originalById: { a: field("Email") },
      rows: [row("a", "Email", { isPIIData: true, type: "Int" })],
    });

    expect(diff.changes).toEqual([
      { kind: "modified", name: "Email", attributes: ["type", "PII"] },
    ]);
    expect(diff.losesData).toBe(false);
  });

  it("carries attribute changes alongside a rename", () => {
    const diff = diffSchemaFields({
      originalById: { a: field("Phone") },
      rows: [row("a", "PhoneNumber", { isPIIData: true })],
    });

    expect(diff.changes[0]).toEqual({
      kind: "renamed",
      from: "Phone",
      to: "PhoneNumber",
      attributes: ["PII"],
    });
  });

  // Identity is the RHF id, so removing an earlier row must not make every
  // later row look renamed.
  it("survives a removal shifting every later index", () => {
    const diff = diffSchemaFields({
      originalById: { a: field("Email"), b: field("Phone"), c: field("City") },
      rows: [row("b", "Phone"), row("c", "City")],
    });

    expect(diff.changes).toEqual([{ kind: "removed", name: "Email" }]);
  });

  // A duplicate gets a fresh id from useFieldArray, so it is an addition.
  it("treats a duplicated row as an addition, not a rename", () => {
    const diff = diffSchemaFields({
      originalById: { a: field("Email") },
      rows: [row("a", "Email"), row("dup-1", "Email")],
    });

    expect(diff.changes).toEqual([{ kind: "added", name: "Email" }]);
  });

  it("treats an absent value and an empty one as the same", () => {
    const diff = diffSchemaFields({
      originalById: { a: { name: "Email", type: "String" } },
      rows: [{ id: "a", name: "Email", type: "String", description: "" }],
    });

    expect(diff.changes).toEqual([]);
  });
});

describe("describeChange", () => {
  it("writes each kind as a phrase", () => {
    expect(describeChange({ kind: "added", name: "Nickname" })).toBe("Nickname added");
    expect(describeChange({ kind: "removed", name: "Phone" })).toBe("Phone removed");
    expect(
      describeChange({ kind: "renamed", from: "Phone", to: "Mobile", attributes: [] }),
    ).toBe("Phone renamed to Mobile");
    expect(
      describeChange({ kind: "modified", name: "Email", attributes: ["type", "PII"] }),
    ).toBe("Email type, PII changed");
  });

  it("falls back to a label for an unnamed new row", () => {
    expect(describeChange({ kind: "added", name: "" })).toBe("New field added");
  });
});
