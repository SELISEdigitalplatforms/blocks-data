import { describe, expect, it } from "vitest";
import type { IField, ISchemaDetails } from "../models/data-service";
import {
  EVERYTHING_EXPANDED,
  NOTHING_EXPANDED,
  isPathExpanded,
  nestedRows,
  selfReferenceReason,
  togglePath,
  type TreeContext,
} from "./nested-tree.util";

const field = (name: string, type = "String", extra: Partial<IField> = {}): IField => ({ name, type, isArray: false, ...extra });
const schema = (schemaName: string, fields: IField[]): ISchemaDetails => ({ id: schemaName, schemaName, fields }) as ISchemaDetails;

// Address { Street, City, Geo: GeoPoint { Lat, Lng } }
const geoPoint = schema("GeoPoint", [field("Lat", "Float"), field("Lng", "Float")]);
const address = schema("Address", [field("Street"), field("City"), field("Geo", "GeoPoint")]);
const schemas: Record<string, ISchemaDetails> = { GeoPoint: geoPoint, Address: address };

function contextWith(open: string[], loaded: Record<string, IField[] | null> = {}): TreeContext {
  return {
    isExpanded: (path) => open.includes(path),
    findChild: (type) => (type ? schemas[type] : undefined),
    fieldsOf: (s) => (s.schemaName in loaded ? loaded[s.schemaName] : s.fields),
  };
}

const summary = (rows: ReturnType<typeof nestedRows>) => rows.map((r) => `${r.path} ${r.guides.join("/")}`);

describe("nestedRows", () => {
  it("lists an open object's fields as branches, the last one closing the line", () => {
    const rows = nestedRows({ path: "Home", field: undefined, childSchema: address }, ["Employee"], contextWith([]));
    expect(summary(rows)).toEqual(["Home.Street tee", "Home.City tee", "Home.Geo end"]);
    expect(rows[2]).toMatchObject({ childSchema: geoPoint, isExpanded: false, depth: 1 });
  });

  it("puts an open grandchild's rows right after it, its parent's line carried only while siblings follow", () => {
    const rows = nestedRows({ path: "Home", field: undefined, childSchema: address }, ["Employee"], contextWith(["Home.Geo"]));
    // Geo is Address's last field, so nothing passes down beside Lat and Lng.
    expect(summary(rows)).toEqual(["Home.Street tee", "Home.City tee", "Home.Geo end", "Home.Geo.Lat none/tee", "Home.Geo.Lng none/end"]);

    const middle = schema("Address", [field("Geo", "GeoPoint"), field("Zip")]);
    const withSibling = nestedRows({ path: "Home", field: undefined, childSchema: middle }, ["Employee"], contextWith(["Home.Geo"]));
    // Zip follows Geo, so Geo's line runs past Lat and Lng.
    expect(summary(withSibling)).toEqual(["Home.Geo tee", "Home.Geo.Lat through/tee", "Home.Geo.Lng through/end", "Home.Zip end"]);
  });

  it("shows a loading row while the child's fields are on their way, and an empty row when it has none", () => {
    expect(nestedRows({ path: "Home", field: undefined, childSchema: address }, ["Employee"], contextWith([], { Address: null }))).toMatchObject([
      { kind: "loading", depth: 1, guides: ["end"] },
    ]);
    expect(nestedRows({ path: "Home", field: undefined, childSchema: address }, ["Employee"], contextWith([], { Address: [] }))).toMatchObject([
      { kind: "empty" },
    ]);
  });

  it("carries the entity's nested data (rules, defaults) over the child schema's fields", () => {
    const parent = field("Home", "Address", {
      fields: [{ name: "City", type: "String", isArray: false, defaultValue: { kind: "Static", value: "Dhaka" }, totalValidationRules: 2 }],
    });
    const rows = nestedRows({ path: "Home", field: parent, childSchema: address }, ["Employee"], contextWith([]));
    expect(rows.find((r) => r.path === "Home.City")?.field).toMatchObject({ defaultValue: { kind: "Static", value: "Dhaka" }, totalValidationRules: 2 });
  });

  it("shows a property whose type contains itself, but never opens it", () => {
    const person = schema("Person", [field("Name"), field("Manager", "Person")]);
    schemas.Person = person;
    const rows = nestedRows({ path: "Owner", field: undefined, childSchema: person }, ["Employee"], contextWith(["Owner.Manager"]));
    expect(rows.map((r) => r.path)).toEqual(["Owner.Name", "Owner.Manager"]);
    expect(rows[1]).toMatchObject({ isExpanded: false, blockedReason: "Person contains itself, so it isn't opened again here" });
  });
});

describe("selfReferenceReason", () => {
  it("matches a type against its branch, ignoring case", () => {
    expect(selfReferenceReason(schema("employee", []), ["Employee"])).not.toBeNull();
    expect(selfReferenceReason(address, ["Employee"])).toBeNull();
  });
});

describe("tree expansion", () => {
  it("opens and closes paths one at a time", () => {
    const opened = togglePath(NOTHING_EXPANDED, "Home");
    expect(isPathExpanded(opened, "Home")).toBe(true);
    expect(isPathExpanded(togglePath(opened, "Home"), "Home")).toBe(false);
  });

  it("opens everything after Expand all, including paths it has not seen, until one is closed", () => {
    expect(isPathExpanded(EVERYTHING_EXPANDED, "Home.Geo")).toBe(true);
    const closed = togglePath(EVERYTHING_EXPANDED, "Home.Geo");
    expect(isPathExpanded(closed, "Home.Geo")).toBe(false);
    expect(isPathExpanded(closed, "Home")).toBe(true);
  });
});
