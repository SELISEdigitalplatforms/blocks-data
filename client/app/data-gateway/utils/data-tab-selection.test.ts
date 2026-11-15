import { describe, expect, it } from "vitest";
import {
  buildResolvedSelectionLines,
  parseFieldDoesNotExistErrors,
  resolveDataTabSelection,
  type DataTabField,
  type DataTabSelection,
} from "./data-tab-selection";

type Ref = { kind: string; name: string | null; ofType: Ref | null };

const scalar = (name = "String"): Ref => ({ kind: "SCALAR", name, ofType: null });
const object = (name: string): Ref => ({ kind: "OBJECT", name, ofType: null });
const nonNull = (ofType: Ref): Ref => ({ kind: "NON_NULL", name: null, ofType });
const list = (ofType: Ref): Ref => ({ kind: "LIST", name: null, ofType });

const field = (name: string, type: Ref) => ({
  name,
  description: null,
  args: [],
  type,
  isDeprecated: false,
  deprecationReason: null,
});

const type = (kind: string, name: string, fields: ReturnType<typeof field>[] | null) => ({
  kind,
  name,
  description: null,
  fields: kind === "INPUT_OBJECT" ? null : fields,
  inputFields: kind === "INPUT_OBJECT" ? fields : null,
  interfaces: [],
  enumValues: null,
  possibleTypes: null,
});

/** `Query.getAttendances → AttendanceResult.items: [Attendance!]!`, as the gateway builds it. */
function introspection(
  itemFields: ReturnType<typeof field>[],
  extraTypes: ReturnType<typeof type>[] = [],
) {
  return {
    data: {
      __schema: {
        queryType: { name: "Query", kind: "OBJECT" },
        mutationType: null,
        subscriptionType: null,
        types: [
          type("OBJECT", "Query", [field("getAttendances", object("AttendanceResult"))]),
          type("OBJECT", "AttendanceResult", [
            field("totalCount", nonNull(scalar("Int"))),
            field("items", nonNull(list(nonNull(object("Attendance"))))),
          ]),
          type("OBJECT", "Attendance", itemFields),
          ...extraTypes,
        ],
        directives: [],
      },
    },
  };
}

const formFields = (...names: string[]): DataTabField[] =>
  names.map((name) => ({ name, isArray: false }));

function resolve(rawIntrospection: unknown, fields: DataTabField[], schemaName = "Attendance") {
  return resolveDataTabSelection({ rawIntrospection, schemaName, fields });
}

function resolved(selection: DataTabSelection) {
  if (selection.status !== "resolved") throw new Error(`expected resolved, got ${selection.status}`);
  return selection;
}

const trimmed = (lines: string[]) => lines.map((line) => line.trim());

describe("resolveDataTabSelection", () => {
  it("E1: selects the form fields that exist on the item type, in form order", () => {
    const selection = resolved(
      resolve(
        introspection([
          field("CreatedDate", scalar()),
          field("Name", scalar()),
          field("ItemId", nonNull(scalar("ID"))),
        ]),
        formFields("ItemId", "Name"),
      ),
    );
    expect(selection.itemTypeName).toBe("Attendance");
    expect(selection.queryTypeName).toBe("Query");
    expect(selection.missingFields).toEqual([]);
    expect(buildResolvedSelectionLines(selection)).toEqual(["      ItemId", "      Name"]);
  });

  it("E2: leaves out a field the item type lacks and lists it as missing", () => {
    const selection = resolved(
      resolve(
        introspection([field("ItemId", scalar()), field("Name", scalar())]),
        formFields("ItemId", "Name", "StartTimeUtc"),
      ),
    );
    expect(trimmed(buildResolvedSelectionLines(selection))).toEqual(["ItemId", "Name"]);
    expect(selection.missingFields).toEqual(["StartTimeUtc"]);
  });

  it("E3: builds a nested selection from the introspected object type, not the saved child", () => {
    const selection = resolved(
      resolve(
        introspection(
          [field("Breaks", nonNull(list(nonNull(object("AttendanceBreak")))))],
          [type("OBJECT", "AttendanceBreak", [field("End", scalar())])],
        ),
        [{ name: "Breaks", type: "AttendanceBreak", isArray: true }],
      ),
    );
    expect(selection.missingFields).toEqual([]);
    expect(buildResolvedSelectionLines(selection)).toEqual([
      "      Breaks {",
      "        End",
      "      }",
    ]);
  });

  it("E4/C6: never uses the input type, so an input-only field is missing", () => {
    const selection = resolved(
      resolve(
        introspection(
          [field("Name", scalar())],
          [type("INPUT_OBJECT", "AttendanceInput", [field("Name", scalar()), field("Secret", scalar())])],
        ),
        formFields("Name", "Secret"),
      ),
    );
    expect(trimmed(buildResolvedSelectionLines(selection))).toEqual(["Name"]);
    expect(selection.missingFields).toEqual(["Secret"]);
  });

  it("E8: selects ItemId when no form field is on the item type", () => {
    const selection = resolved(
      resolve(introspection([field("Name", scalar()), field("ItemId", scalar())]), formFields("Foo")),
    );
    expect(trimmed(buildResolvedSelectionLines(selection))).toEqual(["ItemId"]);
    expect(selection.missingFields).toEqual(["Foo"]);
  });

  it("A7: falls back to the first non-object field when the item type has no ItemId", () => {
    const selection = resolved(
      resolve(
        introspection(
          [field("Owner", object("Person")), field("Code", scalar())],
          [type("OBJECT", "Person", [field("Name", scalar())])],
        ),
        formFields("Foo", "Bar"),
      ),
    );
    expect(trimmed(buildResolvedSelectionLines(selection))).toEqual(["Code"]);
    expect(selection.missingFields).toEqual(["Foo", "Bar"]);
  });

  it("A7: selects __typename when the item type has only object fields", () => {
    const selection = resolved(
      resolve(
        introspection(
          [field("Owner", object("Person"))],
          [type("OBJECT", "Person", [field("Name", scalar())])],
        ),
        formFields("Foo"),
      ),
    );
    expect(trimmed(buildResolvedSelectionLines(selection))).toEqual(["__typename"]);
  });

  it("E9/C5: stops a cyclic type with __typename instead of an empty selection", () => {
    const selection = resolved(
      resolve(
        introspection(
          [field("Tree", object("Category"))],
          [type("OBJECT", "Category", [field("Name", scalar()), field("Children", list(object("Category")))])],
        ),
        formFields("Tree"),
      ),
    );
    expect(trimmed(buildResolvedSelectionLines(selection))).toEqual([
      "Tree {",
      "Name",
      "Children {",
      "__typename",
      "}",
      "}",
    ]);
  });

  it("C5: stops a 31-level chain at the nesting limit with __typename", () => {
    const levels = Array.from({ length: 31 }, (_, i) =>
      type("OBJECT", `Level${i}`, [field("Value", scalar()), field("Next", object(`Level${i + 1}`))]),
    );
    levels.push(type("OBJECT", "Level31", [field("Value", scalar())]));
    const selection = resolved(
      resolve(introspection([field("Root", object("Level0"))], levels), formFields("Root")),
    );
    const lines = trimmed(buildResolvedSelectionLines(selection));
    expect(lines).toContain("__typename");
    expect(lines.join(" ")).not.toMatch(/\{\s*\}/);
    // Every opened selection set is closed and none is empty.
    expect(lines.filter((line) => line.endsWith("{"))).toHaveLength(
      lines.filter((line) => line === "}").length,
    );
    expect(lines.filter((line) => line.startsWith("Next {")).length).toBeLessThan(31);
  });

  it("ignores blank names and lists each missing field once, in form order", () => {
    const selection = resolved(
      resolve(
        introspection([field("Name", scalar())]),
        formFields("Zed", "", "  ", " Name ", "Alpha", "Zed", "Name"),
      ),
    );
    expect(trimmed(buildResolvedSelectionLines(selection))).toEqual(["Name"]);
    expect(selection.selectable.map((f) => f.name)).toEqual(["Name"]);
    expect(selection.missingFields).toEqual(["Zed", "Alpha"]);
  });

  it("keeps the form's PII flag on a selectable field", () => {
    const selection = resolved(
      resolve(introspection([field("Email", scalar())]), [
        { name: "Email", isArray: false, isPIIData: true },
      ]),
    );
    expect(selection.selectable[0]).toMatchObject({ name: "Email", isPIIData: true });
  });

  it("tolerates a type or array mismatch between the form and the item type", () => {
    const selection = resolved(
      resolve(introspection([field("Tags", list(scalar()))]), [
        { name: "Tags", type: "Int", isArray: false },
      ]),
    );
    expect(selection.missingFields).toEqual([]);
    expect(trimmed(buildResolvedSelectionLines(selection))).toEqual(["Tags"]);
  });

  it("E6: reports a schema the query root doesn't serve as not on the gateway", () => {
    expect(resolve(introspection([field("Name", scalar())]), formFields("Name"), "DraftThing")).toEqual({
      status: "not-on-gateway",
      queryTypeName: "Query",
    });
  });

  it("matches the list field name exactly (case-sensitive)", () => {
    expect(resolve(introspection([field("Name", scalar())]), formFields("Name"), "attendance").status).toBe(
      "not-on-gateway",
    );
  });

  describe("C3: unexpected introspection shapes are unresolved and never throw", () => {
    const valid = introspection([field("Name", scalar())]);
    const withSchema = (schema: unknown) => ({ data: { __schema: schema } });
    const cases: [string, unknown][] = [
      ["undefined", undefined],
      ["null", null],
      ["a string", "nope"],
      ["no data", {}],
      ["no __schema", { data: {} }],
      ["non-array types", withSchema({ ...valid.data.__schema, types: {} })],
      ["no queryType", withSchema({ ...valid.data.__schema, queryType: null })],
      ["queryType without a name", withSchema({ ...valid.data.__schema, queryType: { kind: "OBJECT" } })],
      [
        "result type missing",
        withSchema({
          ...valid.data.__schema,
          types: valid.data.__schema.types.filter((t) => t.name !== "AttendanceResult"),
        }),
      ],
      [
        "item type missing",
        withSchema({
          ...valid.data.__schema,
          types: valid.data.__schema.types.filter((t) => t.name !== "Attendance"),
        }),
      ],
      [
        "item type without fields",
        withSchema({
          ...valid.data.__schema,
          types: valid.data.__schema.types.map((t) => (t.name === "Attendance" ? { ...t, fields: null } : t)),
        }),
      ],
      [
        "item type that is an input object",
        withSchema({
          ...valid.data.__schema,
          types: valid.data.__schema.types.map((t) =>
            t.name === "Attendance" ? { ...t, kind: "INPUT_OBJECT" } : t,
          ),
        }),
      ],
      [
        "result type without items",
        withSchema({
          ...valid.data.__schema,
          types: valid.data.__schema.types.map((t) =>
            t.name === "AttendanceResult" ? { ...t, fields: [field("totalCount", scalar("Int"))] } : t,
          ),
        }),
      ],
      ["junk entries in types", withSchema({ ...valid.data.__schema, types: [null, 1, "x", { kind: "OBJECT" }] })],
    ];

    it.each(cases)("%s", (_label, raw) => {
      expect(() => resolve(raw, formFields("Name"))).not.toThrow();
      expect(resolve(raw, formFields("Name"))).toEqual({ status: "unresolved" });
    });

    it("is unresolved without a schema name", () => {
      expect(resolve(valid, formFields("Name"), "")).toEqual({ status: "unresolved" });
    });

    it("skips malformed form entries and item fields", () => {
      const raw = introspection([field("Name", scalar()), { name: 5 } as unknown as ReturnType<typeof field>]);
      const selection = resolved(
        resolve(raw, [null, { name: 3 }, { name: "Name", isArray: false }] as unknown as DataTabField[]),
      );
      expect(selection.selectable.map((f) => f.name)).toEqual(["Name"]);
      expect(resolved(resolve(raw, undefined as unknown as DataTabField[])).selectable).toHaveLength(1);
    });
  });
});

describe("buildResolvedSelectionLines with a projection (A12)", () => {
  const selection = resolved(
    resolve(
      introspection([field("ItemId", scalar()), field("Name", scalar()), field("Age", scalar("Int"))]),
      formFields("ItemId", "Name", "Age", "Missing"),
    ),
  );

  it("narrows the selectable fields to the projection and ignores missing ones", () => {
    expect(trimmed(buildResolvedSelectionLines(selection, ["Name", "Missing"]))).toEqual(["Name"]);
  });

  it("uses every selectable field when nothing selectable is projected", () => {
    expect(trimmed(buildResolvedSelectionLines(selection, ["Missing"]))).toEqual(["ItemId", "Name", "Age"]);
  });
});

describe("parseFieldDoesNotExistErrors", () => {
  it("reads every field-does-not-exist error once", () => {
    expect(
      parseFieldDoesNotExistErrors([
        { message: "Field `Start` does not exist on type `AttendanceBreak`." },
        { message: "Field `Start` does not exist on type `AttendanceBreak`." },
        { message: "Field `StartTimeUtc` does not exist on type `Attendance`" },
      ]),
    ).toEqual([
      { field: "Start", type: "AttendanceBreak" },
      { field: "StartTimeUtc", type: "Attendance" },
    ]);
  });

  it("E11: gives null for a mixed list", () => {
    expect(
      parseFieldDoesNotExistErrors([
        { message: "Field `X` does not exist on type `A`." },
        { message: "Unexpected Execution Error" },
      ]),
    ).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["an object", { general: "Something went wrong" }],
    ["an empty array", []],
    ["entries without a message", [{}]],
    ["non-object entries", ["Field `X` does not exist on type `A`."]],
    ["a message with extra text", [{ message: "Oops: Field `X` does not exist on type `A`." }]],
  ])("gives null for %s", (_label, errors) => {
    expect(parseFieldDoesNotExistErrors(errors)).toBeNull();
  });
});
