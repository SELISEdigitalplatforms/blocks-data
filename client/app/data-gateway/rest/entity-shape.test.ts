import { describe, expect, it } from "vitest";
import type { IField } from "../models/data-service";
import { BASE_FIELD_NAMES, buildEntityShape, isScalarType } from "./entity-shape";

const field = (name: string, type: string, extra: Partial<IField> = {}): IField => ({
  name,
  type,
  isArray: false,
  ...extra,
});
const schema = (schemaName: string, fields: IField[]) => ({ schemaName, fields });

describe("buildEntityShape", () => {
  it("resolves a DTO field's children from allSchemas", () => {
    const address = schema("Address", [field("City", "String")]);
    const person = schema("Person", [field("Name", "String"), field("Home", "Address")]);

    const shape = buildEntityShape(person, [person, address]);

    expect(shape.name).toBe("Person");
    expect(shape.fields[0]).toEqual({
      name: "Name",
      type: "String",
      isArray: false,
      isBase: false,
    });
    expect(shape.fields[1]).toEqual({
      name: "Home",
      type: "Address",
      isArray: false,
      isBase: false,
      children: [{ name: "City", type: "String", isArray: false, isBase: false }],
    });
  });

  it("keeps isArray and enumValues", () => {
    const item = schema("Item", [
      field("Colors", "Enum", { isArray: true, enumValues: ["Red", "Green"] }),
      field("Names", "String", { isArray: true }),
    ]);

    const shape = buildEntityShape(item, [item]);

    expect(shape.fields[0]).toMatchObject({ isArray: true, enumValues: ["Red", "Green"] });
    expect(shape.fields[1].isArray).toBe(true);
    expect(shape.fields[1]).not.toHaveProperty("enumValues");
  });

  it("marks base fields isBase", () => {
    const item = schema("Item", [
      ...[...BASE_FIELD_NAMES].map((name) => field(name, "String")),
      field("Title", "String"),
    ]);

    const shape = buildEntityShape(item, [item]);

    expect(shape.fields.filter((f) => f.isBase).map((f) => f.name)).toEqual([...BASE_FIELD_NAMES]);
    expect(shape.fields.find((f) => f.name === "Title")?.isBase).toBe(false);
  });

  it("lists the base field names", () => {
    expect([...BASE_FIELD_NAMES]).toEqual([
      "ItemId",
      "CreatedDate",
      "CreatedBy",
      "LastUpdatedDate",
      "LastUpdatedBy",
      "IsDeleted",
      "DeletedDate",
      "OrganizationId",
      "Tags",
      "Language",
    ]);
  });

  it("does not expand a DTO already on the path (cycle A→B→A gives B.children with A lacking children)", () => {
    const a = schema("A", [field("B", "B")]);
    const b = schema("B", [field("A", "A")]);

    const shape = buildEntityShape(a, [a, b]);

    const bField = shape.fields[0];
    expect(bField.children).toHaveLength(1);
    const aField = bField.children![0];
    expect(aField).toMatchObject({ name: "A", type: "A" });
    expect(aField).not.toHaveProperty("children");
  });

  it("stops at depth 30", () => {
    const all = Array.from({ length: 40 }, (_, i) => schema(`S${i}`, [field("Next", `S${i + 1}`)]));

    const shape = buildEntityShape(all[0], all);

    let current = shape.fields[0];
    let depth = 1;
    while (current.children) {
      current = current.children[0];
      depth += 1;
    }
    expect(depth).toBe(30);
    expect(current).not.toHaveProperty("children");
  });

  it("treats an unknown type as String without children", () => {
    const item = schema("Item", [field("Mystery", "NoSuchType")]);

    const shape = buildEntityShape(item, [item]);

    expect(shape.fields[0]).toEqual({
      name: "Mystery",
      type: "String",
      isArray: false,
      isBase: false,
    });
  });

  it("uses inline fields when the type is not a known schema", () => {
    const item = schema("Item", [
      field("Read", "ReadRule", {
        fields: [field("Roles", "String", { isArray: true }), field("Tags", "String")],
      }),
    ]);

    const shape = buildEntityShape(item, [item]);

    expect(shape.fields[0].type).toBe("ReadRule");
    expect(shape.fields[0].children).toEqual([
      { name: "Roles", type: "String", isArray: true, isBase: false },
      { name: "Tags", type: "String", isArray: false, isBase: true },
    ]);
  });

  it("prefers the DTO schema over inline fields", () => {
    const address = schema("Address", [field("City", "String")]);
    const person = schema("Person", [
      field("Home", "Address", { fields: [field("Street", "String")] }),
    ]);

    const shape = buildEntityShape(person, [person, address]);

    expect(shape.fields[0].children?.map((c) => c.name)).toEqual(["City"]);
  });

  it("resolves a DTO named inside inline fields", () => {
    const address = schema("Address", [field("City", "String")]);
    const person = schema("Person", [
      field("Wrapper", "Custom", { fields: [field("Home", "Address")] }),
    ]);

    const shape = buildEntityShape(person, [person, address]);

    expect(shape.fields[0].children?.[0]).toMatchObject({
      name: "Home",
      type: "Address",
      children: [{ name: "City", type: "String" }],
    });
  });

  it("gives a DTO schema with no fields an empty children list", () => {
    const empty = schema("Empty", []);
    const item = schema("Item", [field("E", "Empty")]);

    const shape = buildEntityShape(item, [item, empty]);

    expect(shape.fields[0].children).toEqual([]);
  });

  it("treats inline fields that are empty, with an unknown type, as a String without children", () => {
    const item = schema("Item", [field("Odd", "NoSuchType", { fields: [] })]);

    const shape = buildEntityShape(item, [item]);

    expect(shape.fields[0]).toEqual({ name: "Odd", type: "String", isArray: false, isBase: false });
  });

  it("does not expand a DTO that refers to itself", () => {
    const node = schema("Node", [field("Parent", "Node"), field("Name", "String")]);
    const item = schema("Item", [field("Root", "Node")]);

    const shape = buildEntityShape(item, [item, node]);

    const parent = shape.fields[0].children![0];
    expect(parent).toMatchObject({ name: "Parent", type: "Node" });
    expect(parent).not.toHaveProperty("children");
  });

  it("expands one DTO used by two sibling fields in both places", () => {
    const address = schema("Address", [field("City", "String")]);
    const person = schema("Person", [field("Home", "Address"), field("Work", "Address")]);

    const shape = buildEntityShape(person, [person, address]);

    expect(shape.fields[0].children?.map((c) => c.name)).toEqual(["City"]);
    expect(shape.fields[1].children?.map((c) => c.name)).toEqual(["City"]);
  });

  it("copies enumValues instead of sharing the schema's array", () => {
    const values = ["Red", "Green"];
    const item = schema("Item", [field("Color", "Enum", { enumValues: values })]);

    const shape = buildEntityShape(item, [item]);

    expect(shape.fields[0].enumValues).toEqual(values);
    expect(shape.fields[0].enumValues).not.toBe(values);
  });

  it("keeps a scalar type's own spelling", () => {
    const item = schema("Item", [field("When", "DateTime"), field("Count", "int")]);

    const shape = buildEntityShape(item, [item]);

    expect(shape.fields.map((f) => f.type)).toEqual(["DateTime", "int"]);
  });
});

describe("isScalarType", () => {
  it.each([
    "String",
    "Int",
    "Integer",
    "Long",
    "Float",
    "Boolean",
    "DateTime",
    "Enum",
    "GeoJson",
    "string",
    "DATETIME",
  ])("accepts %s", (type) => {
    expect(isScalarType(type)).toBe(true);
  });

  it.each(["Address", "", "Guid"])("rejects %s", (type) => {
    expect(isScalarType(type)).toBe(false);
  });
});
