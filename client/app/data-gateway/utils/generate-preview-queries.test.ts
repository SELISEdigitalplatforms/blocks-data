import { describe, expect, it } from "vitest";
import {
  resolveBaseTypeName,
  resolveTypeName,
  buildInputValue,
  buildSelectionSet,
  generateGraphQLQuery,
  buildPreviewSections,
  type TypeRef,
  type IntrospectionType,
  type SchemaField,
} from "./generate-preview-queries";

// ─── TypeRef helpers ────────────────────────────────────────────────────────
const scalar = (name: string): TypeRef => ({ kind: "SCALAR", name, ofType: null });
const nn = (ofType: TypeRef): TypeRef => ({ kind: "NON_NULL", name: null, ofType });
const list = (ofType: TypeRef): TypeRef => ({ kind: "LIST", name: null, ofType });
const ref = (kind: string, name: string): TypeRef => ({ kind, name, ofType: null });

// ─── IntrospectionType helper ───────────────────────────────────────────────
const makeType = (partial: Partial<IntrospectionType>): IntrospectionType => ({
  kind: "OBJECT",
  name: "",
  description: null,
  fields: null,
  inputFields: null,
  interfaces: null,
  enumValues: null,
  possibleTypes: null,
  ...partial,
});

const sf = (name: string, type: TypeRef, args: SchemaField["args"] = []): SchemaField => ({
  name,
  description: null,
  args,
  type,
  isDeprecated: false,
  deprecationReason: null,
});

const arg = (name: string, type: TypeRef) => ({
  name,
  description: null,
  type,
  defaultValue: null,
});

describe("generate-preview-queries", () => {
  describe("resolveBaseTypeName", () => {
    it("returns null for a null ref", () => {
      expect(resolveBaseTypeName(null)).toBeNull();
    });

    it("returns the scalar name directly", () => {
      expect(resolveBaseTypeName(scalar("String"))).toBe("String");
    });

    it("unwraps NON_NULL and LIST wrappers", () => {
      expect(resolveBaseTypeName(nn(scalar("Int")))).toBe("Int");
      expect(resolveBaseTypeName(list(nn(scalar("Boolean"))))).toBe("Boolean");
    });
  });

  describe("resolveTypeName", () => {
    it("returns 'unknown' for null or nameless refs", () => {
      expect(resolveTypeName(null)).toBe("unknown");
      expect(resolveTypeName(scalar(null as unknown as string))).toBe("unknown");
    });

    it("renders wrappers with GraphQL syntax", () => {
      expect(resolveTypeName(scalar("String"))).toBe("String");
      expect(resolveTypeName(nn(scalar("Int")))).toBe("Int!");
      expect(resolveTypeName(list(scalar("String")))).toBe("[String]");
      expect(resolveTypeName(nn(list(nn(scalar("String")))))).toBe("[String!]!");
    });
  });

  describe("buildInputValue", () => {
    const empty = new Map<string, IntrospectionType>();

    it("produces scalar defaults", () => {
      expect(buildInputValue(scalar("Int"), empty, 0, "", new Set())).toBe("0");
      expect(buildInputValue(scalar("Float"), empty, 0, "", new Set())).toBe("0");
      expect(buildInputValue(scalar("Boolean"), empty, 0, "", new Set())).toBe("false");
      expect(buildInputValue(scalar("String"), empty, 0, "", new Set())).toBe('""');
    });

    it("uses pagination + mutation-input scalar overrides", () => {
      expect(buildInputValue(scalar("Int"), empty, 0, "", new Set(), "pageNo")).toBe("1");
      expect(buildInputValue(scalar("String"), empty, 0, "", new Set(), "title", true)).toBe(
        '"Sample text"',
      );
    });

    it("unwraps NON_NULL scalars", () => {
      expect(buildInputValue(nn(scalar("Int")), empty, 0, "", new Set())).toBe("0");
    });

    it("emits a DateTime sample for date-like scalars", () => {
      expect(buildInputValue(scalar("DateTime"), empty, 0, "", new Set())).toMatch(
        /^"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"$/,
      );
    });

    it("handles lists including collapsed and logical fields", () => {
      expect(buildInputValue(list(scalar("String")), empty, 0, "", new Set())).toBe('[""]');
      expect(buildInputValue(list(scalar("String")), empty, 0, "", new Set(), "order")).toBe("[]");
      expect(buildInputValue(list(ref("INPUT_OBJECT", "W")), empty, 0, "", new Set(), "or")).toBe(
        "[{}]",
      );
    });

    it("falls back to a string default when the base name is null", () => {
      expect(buildInputValue(scalar(null as unknown as string), empty, 0, "", new Set())).toBe('""');
    });

    it("returns the first enum value or empty quotes", () => {
      const map = new Map<string, IntrospectionType>([
        ["Status", makeType({ kind: "ENUM", name: "Status", enumValues: [{ name: "ACTIVE", description: null, isDeprecated: false, deprecationReason: null }] })],
        ["Empty", makeType({ kind: "ENUM", name: "Empty", enumValues: [] })],
      ]);
      expect(buildInputValue(ref("ENUM", "Status"), map, 0, "", new Set())).toBe("ACTIVE");
      expect(buildInputValue(ref("ENUM", "Empty"), map, 0, "", new Set())).toBe('""');
    });

    it("expands input objects and collapses where/depth/visited", () => {
      const map = new Map<string, IntrospectionType>([
        [
          "Foo",
          makeType({
            kind: "INPUT_OBJECT",
            name: "Foo",
            inputFields: [
              { name: "ItemId", description: null, type: scalar("String"), defaultValue: null },
              { name: "a", description: null, type: scalar("String"), defaultValue: null },
            ],
          }),
        ],
        ["Empty", makeType({ kind: "INPUT_OBJECT", name: "Empty", inputFields: [] })],
      ]);

      const expanded = buildInputValue(ref("INPUT_OBJECT", "Foo"), map, 0, "", new Set());
      expect(expanded).toContain("ItemId:");
      expect(expanded).toContain('a: ""');

      // Mutation input drops system fields.
      const mut = buildInputValue(ref("INPUT_OBJECT", "Foo"), map, 0, "", new Set(), "input", true);
      expect(mut).not.toContain("ItemId:");
      expect(mut).toContain('a: "Sample text"');

      // where collapses regardless of type.
      expect(buildInputValue(ref("INPUT_OBJECT", "Foo"), map, 0, "", new Set(), "where")).toBe("{}");
      // depth guard collapses.
      expect(buildInputValue(ref("INPUT_OBJECT", "Foo"), map, 6, "", new Set())).toBe("{}");
      expect(buildInputValue(ref("INPUT_OBJECT", "Foo"), map, 0, "", new Set(["Foo"]))).toBe("{}");
      // empty input object collapses.
      expect(buildInputValue(ref("INPUT_OBJECT", "Empty"), map, 0, "", new Set())).toBe("{}");
    });
  });

  describe("buildSelectionSet", () => {
    const map = new Map<string, IntrospectionType>([
      [
        "Item",
        makeType({
          kind: "OBJECT",
          name: "Item",
          fields: [sf("id", scalar("String")), sf("nested", ref("OBJECT", "Nested"))],
        }),
      ],
      [
        "Nested",
        makeType({ kind: "OBJECT", name: "Nested", fields: [sf("city", scalar("String"))] }),
      ],
    ]);

    it("returns [] for an unknown type or a type with no fields", () => {
      expect(buildSelectionSet("Missing", map, 0, "  ", new Set())).toEqual([]);
    });

    it("emits a comment when depth or recursion guards trip", () => {
      expect(buildSelectionSet("Item", map, 6, "  ", new Set())).toEqual(["  # ..."]);
      expect(buildSelectionSet("Item", map, 0, "  ", new Set(["Item"]))).toEqual(["  # ..."]);
    });

    it("recurses into nested object fields", () => {
      expect(buildSelectionSet("Item", map, 0, "  ", new Set())).toEqual([
        "  id",
        "  nested {",
        "    city",
        "  }",
      ]);
    });

    it("orders known result fields by the preferred order", () => {
      const resultMap = new Map<string, IntrospectionType>([
        [
          "Result",
          makeType({
            kind: "OBJECT",
            name: "Result",
            fields: [sf("custom", scalar("String")), sf("totalCount", scalar("Int")), sf("items", scalar("String"))],
          }),
        ],
      ]);
      expect(buildSelectionSet("Result", resultMap, 0, "  ", new Set())).toEqual([
        "  items",
        "  totalCount",
        "  custom",
      ]);
    });
  });

  // ─── Full introspection fixture for query generation ────────────────────────
  const introspection = {
    data: {
      __schema: {
        queryType: { name: "Query", kind: "OBJECT" },
        mutationType: { name: "Mutation", kind: "OBJECT" },
        subscriptionType: null,
        directives: [],
        types: [
          makeType({
            kind: "OBJECT",
            name: "Query",
            fields: [
              sf("getProducts", ref("OBJECT", "ProductResult"), [
                arg("where", ref("INPUT_OBJECT", "ProductWhere")),
                arg("order", list(scalar("String"))),
                arg("paging", ref("INPUT_OBJECT", "ProductPaging")),
              ]),
            ],
          }),
          makeType({
            kind: "INPUT_OBJECT",
            name: "ProductPaging",
            inputFields: [
              { name: "pageNo", description: null, type: scalar("Int"), defaultValue: null },
              { name: "pageSize", description: null, type: scalar("Int"), defaultValue: null },
            ],
          }),
          makeType({
            kind: "OBJECT",
            name: "Mutation",
            fields: [
              sf("insertProduct", ref("OBJECT", "MutationResult"), [
                arg("input", ref("INPUT_OBJECT", "ProductInput")),
              ]),
              sf("updateProduct", ref("OBJECT", "MutationResult"), [
                arg("where", ref("INPUT_OBJECT", "ProductWhere")),
                arg("filter", scalar("String")),
                arg("input", ref("INPUT_OBJECT", "ProductInput")),
              ]),
              sf("deleteProduct", ref("OBJECT", "MutationResult"), [
                arg("where", ref("INPUT_OBJECT", "ProductWhere")),
                arg("filter", scalar("String")),
              ]),
            ],
          }),
          makeType({
            kind: "OBJECT",
            name: "ProductResult",
            fields: [
              sf("items", list(ref("OBJECT", "Product"))),
              sf("totalCount", scalar("Int")),
              sf("pageNo", scalar("Int")),
            ],
          }),
          makeType({
            kind: "OBJECT",
            name: "Product",
            fields: [sf("id", scalar("String")), sf("title", scalar("String"))],
          }),
          makeType({
            kind: "OBJECT",
            name: "MutationResult",
            fields: [sf("acknowledged", scalar("Boolean")), sf("itemId", scalar("String"))],
          }),
          makeType({
            kind: "INPUT_OBJECT",
            name: "ProductInput",
            inputFields: [
              { name: "ItemId", description: null, type: scalar("String"), defaultValue: null },
              { name: "title", description: null, type: scalar("String"), defaultValue: null },
              { name: "count", description: null, type: scalar("Int"), defaultValue: null },
              { name: "active", description: null, type: scalar("Boolean"), defaultValue: null },
              { name: "status", description: null, type: ref("ENUM", "Status"), defaultValue: null },
              { name: "where", description: null, type: ref("INPUT_OBJECT", "ProductWhere"), defaultValue: null },
            ],
          }),
          makeType({
            kind: "INPUT_OBJECT",
            name: "ProductWhere",
            inputFields: [
              { name: "title", description: null, type: scalar("String"), defaultValue: null },
            ],
          }),
          makeType({
            kind: "ENUM",
            name: "Status",
            enumValues: [
              { name: "ACTIVE", description: null, isDeprecated: false, deprecationReason: null },
            ],
          }),
        ],
      },
    },
  };

  const buildMap = () => {
    const m = new Map<string, IntrospectionType>();
    for (const t of introspection.data.__schema.types) m.set(t.name, t);
    return m;
  };

  describe("generateGraphQLQuery", () => {
    it("builds a query, excluding the redundant `input` arg", () => {
      const map = buildMap();
      const field = map.get("Query")!.fields!.find((f) => f.name === "getProducts")!;
      const out = generateGraphQLQuery(field, map, "query");
      expect(out).toContain("query {");
      expect(out).toContain("getProducts(");
      expect(out).toContain("where: {}");
      expect(out).toContain("order: []");
      expect(out).toContain("paging: {");
      expect(out).toContain("pageNo: 1");
      expect(out).toContain("pageSize: 10");
      expect(out).toContain("items {");
      expect(out).toContain("id");
      // `input` is filtered out of query arg lines.
      expect(out).not.toContain("input:");
      expect(out).not.toContain("filter:");
      expect(out).not.toContain("sort:");
    });

    it("expands mutation input with sample values and drops system fields", () => {
      const map = buildMap();
      const field = map.get("Mutation")!.fields!.find((f) => f.name === "insertProduct")!;
      const out = generateGraphQLQuery(field, map, "mutation");
      expect(out).toContain("insertProduct(");
      expect(out).toContain('title: "Sample text"');
      expect(out).toContain("count: 1");
      expect(out).toContain("active: false");
      expect(out).toContain("status: ACTIVE");
      expect(out).toContain("where: {}");
      expect(out).not.toContain("ItemId:");
    });

    it("drops the redundant `filter` arg for update mutations", () => {
      const map = buildMap();
      const field = map.get("Mutation")!.fields!.find((f) => f.name === "updateProduct")!;
      const out = generateGraphQLQuery(field, map, "mutation");
      expect(out).toContain("updateProduct(");
      expect(out).toContain("where: {}");
      expect(out).not.toContain("filter:");
    });

    it("builds a delete mutation with only the where arg", () => {
      const map = buildMap();
      const field = map.get("Mutation")!.fields!.find((f) => f.name === "deleteProduct")!;
      const out = generateGraphQLQuery(field, map, "mutation");
      expect(out).toContain("deleteProduct(");
      expect(out).toContain("where: {}");
      expect(out).not.toContain("filter:");
    });
  });

  describe("buildPreviewSections", () => {
    it("returns the CRUD sections present in the schema", () => {
      const sections = buildPreviewSections(introspection, "Product");
      expect(sections.map((s) => s.title)).toEqual(["Query", "Insert", "Update", "Delete"]);
      expect(sections[0].code).toContain("getProducts(");
      expect(sections[1].code).toContain("insertProduct(");
    });

    it("omits operations that do not exist in the schema", () => {
      const sections = buildPreviewSections(introspection, "Unknown");
      expect(sections).toEqual([]);
    });

    it("returns [] for missing / malformed introspection", () => {
      expect(buildPreviewSections(null, "Product")).toEqual([]);
      expect(buildPreviewSections({}, "Product")).toEqual([]);
      expect(buildPreviewSections({ data: {} }, "Product")).toEqual([]);
    });

    it("matches case-insensitively when the schema name casing differs", () => {
      const lowerIntrospection = {
        data: {
          __schema: {
            queryType: { name: "Query", kind: "OBJECT" },
            mutationType: { name: "Mutation", kind: "OBJECT" },
            subscriptionType: null,
            directives: [],
            types: [
              makeType({
                kind: "OBJECT",
                name: "Query",
                fields: [
                  sf("getproducts", ref("OBJECT", "ProductResult"), []),
                ],
              }),
              makeType({
                kind: "OBJECT",
                name: "Mutation",
                fields: [
                  sf("insertproduct", ref("OBJECT", "MutationResult"), []),
                  sf("updateproduct", ref("OBJECT", "MutationResult"), []),
                  sf("deleteproduct", ref("OBJECT", "MutationResult"), []),
                ],
              }),
            ],
          },
        },
      };
      const sections = buildPreviewSections(lowerIntrospection, "Product");
      expect(sections.map((s) => s.title)).toEqual(["Query", "Insert", "Update", "Delete"]);
    });

    it("matches operations without the trailing 's' suffix for queries", () => {
      const noSuffixIntrospection = {
        data: {
          __schema: {
            queryType: { name: "Query", kind: "OBJECT" },
            mutationType: { name: "Mutation", kind: "OBJECT" },
            subscriptionType: null,
            directives: [],
            types: [
              makeType({
                kind: "OBJECT",
                name: "Query",
                fields: [
                  sf("getProduct", ref("OBJECT", "ProductResult"), []),
                ],
              }),
              makeType({
                kind: "OBJECT",
                name: "Mutation",
                fields: [
                  sf("insertProduct", ref("OBJECT", "MutationResult"), []),
                  sf("updateProduct", ref("OBJECT", "MutationResult"), []),
                  sf("deleteProduct", ref("OBJECT", "MutationResult"), []),
                ],
              }),
            ],
          },
        },
      };
      const sections = buildPreviewSections(noSuffixIntrospection, "Product");
      expect(sections.map((s) => s.title)).toEqual(["Query", "Insert", "Update", "Delete"]);
    });
  });

  describe("generateGraphQLQuery legacy normalization", () => {
    it("transforms a legacy `input` arg with filter/sort/pageNo/pageSize into where/order/paging", () => {
      const legacyMap = new Map<string, IntrospectionType>();
      legacyMap.set(
        "Query",
        makeType({
          kind: "OBJECT",
          name: "Query",
          fields: [
            sf("getProducts", ref("OBJECT", "ProductResult"), [
              arg("input", ref("INPUT_OBJECT", "ProductInput")),
            ]),
          ],
        }),
      );
      legacyMap.set(
        "ProductInput",
        makeType({
          kind: "INPUT_OBJECT",
          name: "ProductInput",
          inputFields: [
            { name: "filter", description: null, type: scalar("String"), defaultValue: null },
            { name: "sort", description: null, type: scalar("String"), defaultValue: null },
            { name: "pageNo", description: null, type: scalar("Int"), defaultValue: null },
            { name: "pageSize", description: null, type: scalar("Int"), defaultValue: null },
          ],
        }),
      );
      legacyMap.set(
        "ProductResult",
        makeType({
          kind: "OBJECT",
          name: "ProductResult",
          fields: [sf("items", scalar("String"))],
        }),
      );

      const field = legacyMap.get("Query")!.fields!.find((f) => f.name === "getProducts")!;
      const out = generateGraphQLQuery(field, legacyMap, "query");
      expect(out).toContain("where:");
      expect(out).toContain("order:");
      expect(out).toContain("paging:");
      expect(out).toContain("pageNo: 1");
      expect(out).toContain("pageSize: 10");
      expect(out).not.toContain("input:");
      expect(out).not.toContain("filter:");
      expect(out).not.toContain("sort:");
    });

    it("excludes legacy top-level filter/sort/pageNo/pageSize when paired with a legacy `input` arg", () => {
      const legacyMap = new Map<string, IntrospectionType>();
      legacyMap.set(
        "Query",
        makeType({
          kind: "OBJECT",
          name: "Query",
          fields: [
            sf("getProducts", ref("OBJECT", "ProductResult"), [
              arg("filter", scalar("String")),
              arg("sort", scalar("String")),
              arg("pageNo", scalar("Int")),
              arg("pageSize", scalar("Int")),
              arg("input", ref("INPUT_OBJECT", "ProductInput")),
            ]),
          ],
        }),
      );
      legacyMap.set(
        "ProductInput",
        makeType({
          kind: "INPUT_OBJECT",
          name: "ProductInput",
          inputFields: [
            { name: "filter", description: null, type: scalar("String"), defaultValue: null },
            { name: "sort", description: null, type: scalar("String"), defaultValue: null },
            { name: "pageNo", description: null, type: scalar("Int"), defaultValue: null },
            { name: "pageSize", description: null, type: scalar("Int"), defaultValue: null },
          ],
        }),
      );
      legacyMap.set(
        "ProductResult",
        makeType({
          kind: "OBJECT",
          name: "ProductResult",
          fields: [sf("items", scalar("String"))],
        }),
      );

      const field = legacyMap.get("Query")!.fields!.find((f) => f.name === "getProducts")!;
      const out = generateGraphQLQuery(field, legacyMap, "query");
      expect(out).toContain("where:");
      expect(out).toContain("order:");
      expect(out).toContain("paging:");
      const whereCount = (out.match(/where:/g) || []).length;
      const orderCount = (out.match(/order:/g) || []).length;
      const pageNoCount = (out.match(/pageNo:/g) || []).length;
      expect(whereCount).toBe(1);
      expect(orderCount).toBe(1);
      expect(pageNoCount).toBe(1);
    });
  });
});
