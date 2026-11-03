import { describe, expect, it } from "vitest";
import en from "@/i18n/data.gateway.schema.en.json";
import type { EntityShape, ShapeField } from "./entity-shape";
import {
  buildBodyJsonSchema,
  buildRestRequests,
  templateDescriptionKey,
  templateTitleKey,
  type RestTemplateId,
} from "./request-templates";
import { sampleValue } from "./sample-values";

/** The part of a draft-07 JSON Schema these tests read. */
type Schema = {
  $schema?: string;
  type?: string;
  format?: string;
  enum?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
};

const f = (name: string, type: string, opts: Partial<ShapeField> = {}): ShapeField => ({
  name,
  type,
  isArray: false,
  isBase: false,
  ...opts,
});

const shape: EntityShape = {
  name: "RT_Blocklist",
  fields: [
    f("Name", "String"),
    f("Score", "Int"),
    f("ValidUntil", "DateTime"),
    f("Kind", "Enum", { enumValues: ["A", "B"] }),
    f("Address", "AddressDto", { children: [f("City", "String")] }),
    f("ItemId", "String", { isBase: true }),
    f("Tags", "String", { isArray: true, isBase: true }),
  ],
};

const templates = buildRestRequests(shape);
const byId = (id: RestTemplateId) => templates.find((t) => t.id === id)!;

describe("buildRestRequests", () => {
  it("returns the ten routes in order", () =>
    expect(templates.map((t) => `${t.method} ${t.path}`)).toEqual([
      "GET /RT_Blocklist",
      "POST /RT_Blocklist",
      "GET /RT_Blocklist/item/{itemId}",
      "POST /RT_Blocklist/item",
      "POST /RT_Blocklist/items",
      "PATCH /RT_Blocklist/item/{itemId}",
      "PUT /RT_Blocklist/item/{itemId}",
      "PATCH /RT_Blocklist/items",
      "DELETE /RT_Blocklist/item/{itemId}",
      "DELETE /RT_Blocklist/items",
    ]));

  it("assigns the four groups", () =>
    expect(templates.map((t) => t.group)).toEqual([
      "query",
      "query",
      "query",
      "insert",
      "insert",
      "update",
      "update",
      "update",
      "delete",
      "delete",
    ]));

  it("list query", () =>
    expect(byId("list").query).toEqual([
      ["pageNo", "1"],
      ["pageSize", "10"],
      ["order", "Name:ASC"],
      ["includeTotalCount", "true"],
    ]));

  it("listByBody body", () =>
    expect(byId("listByBody").body).toEqual({
      where: { Name: { eq: "Sample text" } },
      order: [{ field: "Name", direction: "ASC" }],
      paging: { pageNo: 1, pageSize: 10 },
      includeTotalCount: true,
    }));

  it("insert body", () =>
    expect(byId("insert").body).toEqual({
      Name: "Sample text",
      Score: 1,
      ValidUntil: "2026-11-03T10:00:00Z",
      Kind: "A",
      Address: { City: "Sample text" },
      Tags: [],
    }));

  it("update and upsert share the record body", () => {
    expect(byId("update").body).toEqual(byId("insert").body);
    expect(byId("upsert").body).toEqual(byId("insert").body);
  });

  it("insertMany has two records", () => {
    expect(byId("insertMany").body).toHaveLength(2);
    expect((byId("insertMany").body as unknown[])[0]).toEqual(byId("insert").body);
  });

  it("where uses the first String field", () =>
    expect(byId("deleteMany").body).toEqual({ where: { Name: { eq: "Sample text" } } }));

  it("updateMany has where and input", () => {
    expect(Object.keys(byId("updateMany").body as object)).toEqual(["where", "input"]);
    expect((byId("updateMany").body as { input: unknown }).input).toEqual(byId("insert").body);
  });

  it("getOne selects up to five scalars", () =>
    expect(byId("getOne").query).toEqual([["select", "Name,Score,ValidUntil,Kind"]]));

  it("getOne caps the select list at five names", () => {
    const wide: EntityShape = {
      name: "W",
      fields: ["A", "B", "C", "D", "E", "F", "G"].map((n) => f(n, "String")),
    };
    const t = buildRestRequests(wide).find((x) => x.id === "getOne")!;
    expect(t.query).toEqual([["select", "A,B,C,D,E"]]);
  });

  it("GET item, item deletes and the plain routes have no body", () => {
    for (const id of ["list", "getOne", "delete"] as const) {
      expect(byId(id).body).toBeUndefined();
    }
  });

  it("where falls back to the first scalar when there is no String", () => {
    const t = buildRestRequests({ name: "E", fields: [f("Score", "Int"), f("Active", "Boolean")] });
    expect(t.find((x) => x.id === "deleteMany")!.body).toEqual({ where: { Score: { eq: 1 } } });
  });

  it("where and order skip array fields", () => {
    const t = buildRestRequests({
      name: "E",
      fields: [f("Names", "String", { isArray: true }), f("Score", "Int")],
    });
    expect(t.find((x) => x.id === "deleteMany")!.body).toEqual({ where: { Score: { eq: 1 } } });
    expect(t.find((x) => x.id === "list")!.query).toContainEqual(["order", "Score:ASC"]);
  });

  it("entity without own scalars falls back to ItemId and Tags-only bodies", () => {
    const t = buildRestRequests({
      name: "E",
      fields: [
        f("ItemId", "String", { isBase: true }),
        f("Tags", "String", { isArray: true, isBase: true }),
      ],
    });
    expect(t.find((x) => x.id === "deleteMany")!.body).toEqual({
      where: { ItemId: { eq: "{itemId}" } },
    });
    expect(t.find((x) => x.id === "insert")!.body).toEqual({ Tags: [] });
    expect(t.find((x) => x.id === "list")!.query.some(([k]) => k === "order")).toBe(false);
    expect(t.find((x) => x.id === "getOne")!.query).toEqual([]);
    expect(Object.keys(t.find((x) => x.id === "listByBody")!.body as object)).not.toContain(
      "order",
    );
  });
});

describe("sampleValue", () => {
  it.each([
    [f("a", "String"), "Sample text"],
    [f("a", "Int"), 1],
    [f("a", "Integer"), 1],
    [f("a", "Long"), 1],
    [f("a", "Float"), 1.5],
    [f("a", "Boolean"), true],
    [f("a", "DateTime"), "2026-11-03T10:00:00Z"],
    [f("a", "Enum", { enumValues: ["X", "Y"] }), "X"],
    [f("a", "Enum"), "Sample text"],
    [f("a", "GeoJson"), { type: "Point", coordinates: [8.5417, 47.3769] }],
    [f("a", "SomeDto"), {}],
    [f("a", "SomeDto", { children: [f("N", "Int")] }), { N: 1 }],
    [f("a", "Int", { isArray: true }), [1]],
    [f("a", "SomeDto", { isArray: true, children: [f("N", "Int")] }), [{ N: 1 }]],
  ])("samples %j", (field, expected) => expect(sampleValue(field)).toEqual(expected));
});

describe("buildBodyJsonSchema", () => {
  it("is null for routes without a body", () => {
    for (const id of ["list", "getOne", "delete"] as const) {
      expect(buildBodyJsonSchema(shape, id)).toBeNull();
    }
  });

  it("describes a record with typed, closed properties", () => {
    const schema = buildBodyJsonSchema(shape, "insert") as Schema;
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties!)).toEqual([
      "Name",
      "Score",
      "ValidUntil",
      "Kind",
      "Address",
      "Tags",
    ]);
    expect(schema.properties!.Name).toEqual({ type: "string" });
    expect(schema.properties!.Score).toEqual({ type: "integer" });
    expect(schema.properties!.ValidUntil).toEqual({ type: "string", format: "date-time" });
    expect(schema.properties!.Kind).toEqual({ type: "string", enum: ["A", "B"] });
    expect(schema.properties!.Address.type).toBe("object");
    expect(schema.properties!.Address.properties!.City.type).toBe("string");
    expect(schema.properties!.Tags).toEqual({ type: "array", items: { type: "string" } });
  });

  it("maps the remaining types and arrays", () => {
    const schema = buildBodyJsonSchema(
      {
        name: "E",
        fields: [
          f("Ratio", "Float"),
          f("Big", "Long"),
          f("On", "Boolean"),
          f("Where", "GeoJson"),
          f("Nums", "Int", { isArray: true }),
          f("Free", "Enum"),
        ],
      },
      "update",
    ) as Schema;
    expect(schema.properties!.Ratio).toEqual({ type: "number" });
    expect(schema.properties!.Big).toEqual({ type: "integer" });
    expect(schema.properties!.On).toEqual({ type: "boolean" });
    expect(schema.properties!.Where).toEqual({ type: "object" });
    expect(schema.properties!.Nums).toEqual({ type: "array", items: { type: "integer" } });
    expect(schema.properties!.Free).toEqual({ type: "string" });
  });

  it("upsert matches insert and insertMany is an array of records", () => {
    expect(buildBodyJsonSchema(shape, "upsert")).toEqual(buildBodyJsonSchema(shape, "insert"));
    const many = buildBodyJsonSchema(shape, "insertMany") as Schema;
    expect(many.type).toBe("array");
    expect(many.items!.properties!.Name.type).toBe("string");
  });

  it("updateMany wraps where and a record input; deleteMany only where", () => {
    const um = buildBodyJsonSchema(shape, "updateMany") as Schema;
    expect(Object.keys(um.properties!)).toEqual(["where", "input"]);
    expect(um.properties!.where.type).toBe("object");
    expect(um.properties!.input.additionalProperties).toBe(false);
    expect(um.properties!.input.properties!.Score.type).toBe("integer");
    const dm = buildBodyJsonSchema(shape, "deleteMany") as Schema;
    expect(Object.keys(dm.properties!)).toEqual(["where"]);
  });

  it("listByBody describes the query body", () => {
    const schema = buildBodyJsonSchema(shape, "listByBody") as Schema;
    expect(Object.keys(schema.properties!)).toEqual([
      "where",
      "order",
      "select",
      "paging",
      "includeTotalCount",
    ]);
    expect(schema.properties!.order.type).toBe("array");
    expect(schema.properties!.select).toEqual({ type: "array", items: { type: "string" } });
    expect(schema.properties!.paging.properties!.pageNo.type).toBe("integer");
    expect(schema.properties!.includeTotalCount.type).toBe("boolean");
  });
});

describe("body JSON Schema strictness", () => {
  it("closes the wrapper objects", () => {
    for (const id of ["listByBody", "updateMany", "deleteMany"] as const) {
      expect((buildBodyJsonSchema(shape, id) as Schema).additionalProperties).toBe(false);
    }
  });

  it("closes paging", () =>
    expect(
      (buildBodyJsonSchema(shape, "listByBody") as Schema).properties!.paging.additionalProperties,
    ).toBe(false));

  it("describes a closed order item", () => {
    const item = (buildBodyJsonSchema(shape, "listByBody") as Schema).properties!.order.items!;
    expect(item.additionalProperties).toBe(false);
    expect(item.properties!.field).toEqual({ type: "string" });
    expect(item.properties!.direction).toEqual({ type: "string", enum: ["ASC", "DESC"] });
  });

  it("closes a DTO that has children", () =>
    expect(
      (buildBodyJsonSchema(shape, "insert") as Schema).properties!.Address.additionalProperties,
    ).toBe(false));

  it("keeps a DTO without children open", () => {
    const s = buildBodyJsonSchema(
      { name: "E", fields: [f("Loop", "LoopDto")] },
      "insert",
    ) as Schema;
    expect(s.properties!.Loop).toEqual({ type: "object" });
  });

  it("omits enum when enumValues is empty", () => {
    const s = buildBodyJsonSchema(
      { name: "E", fields: [f("Kind", "Enum", { enumValues: [] })] },
      "insert",
    ) as Schema;
    expect(s.properties!.Kind).toEqual({ type: "string" });
  });

  it("describes a DTO array and a nested DTO", () => {
    const s = buildBodyJsonSchema(
      {
        name: "E",
        fields: [
          f("Lines", "LineDto", { isArray: true, children: [f("Qty", "Int")] }),
          f("Outer", "OuterDto", {
            children: [f("Inner", "InnerDto", { children: [f("Deep", "Boolean")] })],
          }),
        ],
      },
      "insert",
    ) as Schema;
    expect(s.properties!.Lines.type).toBe("array");
    expect(s.properties!.Lines.items!.type).toBe("object");
    expect(s.properties!.Lines.items!.properties!.Qty).toEqual({ type: "integer" });
    expect(s.properties!.Outer.properties!.Inner.properties!.Deep).toEqual({ type: "boolean" });
  });
});

describe("where, order and select candidates", () => {
  const geoFirst: EntityShape = {
    name: "G",
    fields: [f("Place", "GeoJson"), f("Score", "Int"), f("Kind", "Enum", { enumValues: ["A"] })],
  };
  const geoOnly: EntityShape = { name: "G", fields: [f("Place", "GeoJson")] };
  const get = (s: EntityShape, id: RestTemplateId) =>
    buildRestRequests(s).find((t) => t.id === id)!;

  it("skips GeoJson when the first own scalar is GeoJson", () => {
    expect(get(geoFirst, "deleteMany").body).toEqual({ where: { Score: { eq: 1 } } });
    expect(get(geoFirst, "list").query).toContainEqual(["order", "Score:ASC"]);
    expect(get(geoFirst, "getOne").query).toEqual([["select", "Score,Kind"]]);
  });

  it("falls back to ItemId and omits order and select when only GeoJson exists", () => {
    expect(get(geoOnly, "deleteMany").body).toEqual({ where: { ItemId: { eq: "{itemId}" } } });
    expect(get(geoOnly, "list").query.some(([k]) => k === "order")).toBe(false);
    expect(get(geoOnly, "getOne").query).toEqual([]);
  });

  it("keeps Enum as a candidate", () => {
    const t = buildRestRequests({ name: "E", fields: [f("Kind", "Enum", { enumValues: ["A"] })] });
    expect(t.find((x) => x.id === "deleteMany")!.body).toEqual({ where: { Kind: { eq: "A" } } });
  });

  it("does not share one where object across bodies", () => {
    const wheres = (["listByBody", "updateMany", "deleteMany"] as const).map(
      (id) => (byId(id).body as { where: unknown }).where,
    );
    expect(wheres[0]).not.toBe(wheres[1]);
    expect(wheres[1]).not.toBe(wheres[2]);
    expect(wheres[0]).not.toBe(wheres[2]);
  });
});

describe("template i18n keys", () => {
  it("uses SCREAMING_SNAKE ids", () => {
    expect(templateTitleKey("list")).toBe("REST_TEMPLATES.LIST_TITLE");
    expect(templateDescriptionKey("insertMany")).toBe("REST_TEMPLATES.INSERT_MANY_DESCRIPTION");
    expect(templateTitleKey("listByBody")).toBe("REST_TEMPLATES.LIST_BY_BODY_TITLE");
  });

  it("has an English string for every template", () => {
    for (const t of templates) {
      expect(en).toHaveProperty([templateTitleKey(t.id)]);
      expect(en).toHaveProperty([templateDescriptionKey(t.id)]);
    }
  });
});
