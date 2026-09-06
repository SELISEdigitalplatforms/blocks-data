import { describe, expect, it } from "vitest";
import { buildSchema, type GraphQLObjectType } from "graphql";
import {
  resolveFieldNameBeforeOpeningBrace,
  resolveTypeString,
  getQuerySuggestions,
  getMutationSuggestions,
  getFieldSuggestions,
  getArgumentSuggestions,
  getInputFieldSuggestions,
  detectOperationContext,
  detectCurrentFieldName,
  resolveInputBlockPath,
  resolveInputObjectTypeAtCursor,
  getFullQuerySnippets,
  getFullMutationSnippets,
  OMIT_PAGINATION_MIRROR_SELECTION_FIELDS,
} from "./introspection-utils";

const SDL = `
  scalar DateTime
  scalar JSON

  enum Status { ACTIVE INACTIVE }

  input StringFilter {
    eq: String
    in: [String]
    nin: [String]
  }

  input IntFilter {
    eq: Int
    gt: Int
  }

  input StringOperationFilterInput {
    eq: String
    neq: String
    contains: String
    in: [String]
  }

  input AddressFilterInput {
    streetNo: StringOperationFilterInput
  }

  input OrderInput {
    field: String
    direction: String
  }

  input NestedInput {
    city: String
    zip: Int
  }

  input ItemWhere {
    name: StringFilter
    amount: IntFilter
    address: AddressFilterInput
    filter: String
    sort: String
    or: [ItemWhere]
    and: [ItemWhere]
  }

  input PersonFilterInput {
    address: AddressFilterInput
  }

  input ItemInput {
    ItemId: String
    name: String
    count: Int
    price: Float
    active: Boolean
    status: Status
    createdAt: DateTime
    meta: JSON
    tags: [String]
    address: NestedInput
    addresses: [NestedInput]
    where: ItemWhere
    order: [OrderInput]
  }

  type NestedType {
    city: String
    zip: Int
  }

  type Item {
    id: String!
    name: String
    codes: [String!]!
    count: Int
    nested: NestedType
  }

  type ItemResult {
    items: [Item]
    totalCount: Int
    pageNo: Int
    pageSize: Int
    totalPages: Int
    hasNextPage: Boolean
    hasPreviousPage: Boolean
  }

  type MutationResult {
    acknowledged: Boolean
    totalImpactedData: Int
    itemId: String
  }

  type Query {
    getItems(where: ItemWhere, order: [OrderInput], filter: String, sort: String, pageNo: Int, pageSize: Int, input: ItemInput): ItemResult
    getScalar(id: String): String
    getByStatus(status: Status): ItemResult
  }

  type Mutation {
    insertItem(input: ItemInput): MutationResult
    updateItem(where: ItemWhere, filter: String, input: ItemInput): MutationResult
    deleteItem(where: ItemWhere, filter: String): MutationResult
    simpleMutation(name: String): String
  }
`;

const schema = buildSchema(SDL);

const QUERY_ONLY_SDL = `
  type Query {
    ping: String
  }
`;
const queryOnlySchema = buildSchema(QUERY_ONLY_SDL);

const byLabel = (list: { label: string }[], label: string) => list.find((s) => s.label === label);

describe("introspection-utils", () => {
  describe("resolveFieldNameBeforeOpeningBrace", () => {
    it("resolves the field name preceding a brace across whitespace/newlines", () => {
      expect(resolveFieldNameBeforeOpeningBrace("input:\n  ")).toBe("input");
      expect(resolveFieldNameBeforeOpeningBrace("  foo: ")).toBe("foo");
      expect(resolveFieldNameBeforeOpeningBrace("where: { amount: ")).toBe("amount");
    });

    it("returns null when there is no `name:` prelude", () => {
      expect(resolveFieldNameBeforeOpeningBrace("no colon")).toBeNull();
      expect(resolveFieldNameBeforeOpeningBrace("")).toBeNull();
    });
  });

  describe("resolveTypeString", () => {
    const item = schema.getType("Item") as GraphQLObjectType;
    const fields = item.getFields();

    it("renders NonNull and List wrappers", () => {
      expect(resolveTypeString(fields.id.type)).toBe("String!");
      expect(resolveTypeString(fields.codes.type)).toBe("[String!]!");
      expect(resolveTypeString(fields.name.type)).toBe("String");
    });
  });

  describe("getQuerySuggestions", () => {
    const suggestions = getQuerySuggestions(schema);

    it("returns one suggestion per query field", () => {
      const labels = suggestions.map((s) => s.label);
      expect(labels).toEqual(expect.arrayContaining(["getItems", "getScalar", "getByStatus"]));
    });

    it("builds a collapsed argument snippet + field selection for list queries", () => {
      const getItems = byLabel(suggestions, "getItems")!;
      expect(getItems.detail).toBe("Query → ItemResult");
      expect(getItems.kind).toBe("function");
      expect(getItems.isSnippet).toBe(true);
      expect(getItems.sortText).toBe("0_getItems");
      expect(getItems.insertText).toContain("getItems(");
      expect(getItems.insertText).toContain("where: {}");
      expect(getItems.insertText).toContain("order: []");
      expect(getItems.insertText).toContain('filter: "{}"');
      expect(getItems.insertText).not.toContain("#");
      expect(getItems.insertText).toContain("pageNo: 1");
      expect(getItems.insertText).toContain("pageSize: 10");
      expect(getItems.insertText).toContain("items");
      // `input` is excluded from query arg snippets.
      expect(getItems.insertText).not.toContain("input:");
    });

    it("omits the field selection for scalar-returning queries", () => {
      const getScalar = byLabel(suggestions, "getScalar")!;
      expect(getScalar.detail).toBe("Query → String");
      expect(getScalar.insertText).toBe('getScalar(\n  id: "${1}"\n)');
      // No trailing selection block (the `{` present is only the snippet placeholder).
      expect(getScalar.insertText).not.toMatch(/\)\s*\{/);
    });

    it("returns [] when the schema has no query type", () => {
      // A schema always has a Query, but the guard is still exercised for mutation below.
      expect(getMutationSuggestions(queryOnlySchema)).toEqual([]);
    });
  });

  describe("getMutationSuggestions", () => {
    const suggestions = getMutationSuggestions(schema);

    it("returns one suggestion per mutation field", () => {
      expect(suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(["insertItem", "updateItem", "deleteItem", "simpleMutation"]),
      );
    });

    it("expands insert input with sample values and drops system fields", () => {
      const insert = byLabel(suggestions, "insertItem")!;
      expect(insert.detail).toBe("Mutation → MutationResult");
      const t = insert.insertText;
      expect(t).toContain('name: "Sample text"');
      expect(t).toContain("count: 1");
      expect(t).toContain("price: 1.0");
      expect(t).toContain("active: false");
      expect(t).toContain("status: ACTIVE");
      expect(t).toMatch(/createdAt: "\d{4}-\d{2}-\d{2}T/);
      expect(t).toContain('tags: ["Sample text"]');
      expect(t).toContain('meta: "Sample text"');
      expect(t).toContain("where: {}");
      expect(t).toContain("order: []");
      expect(t).toContain("address: {");
      expect(t).toContain("addresses: [{");
      expect(t).not.toContain("ItemId");
    });

    it("excludes the redundant string filter arg for update mutations", () => {
      const update = byLabel(suggestions, "updateItem")!;
      expect(update.insertText).toContain("where: {}");
      expect(update.insertText).not.toContain("filter:");
    });

    it("keeps only where for delete mutations", () => {
      const del = byLabel(suggestions, "deleteItem")!;
      expect(del.insertText).toContain("deleteItem(");
      expect(del.insertText).toContain("where: {}");
      expect(del.insertText).not.toContain("filter:");
    });

    it("returns [] for a schema without a mutation type", () => {
      expect(getMutationSuggestions(queryOnlySchema)).toEqual([]);
    });
  });

  describe("getFieldSuggestions", () => {
    it("marks nested object fields as snippet class items", () => {
      const suggestions = getFieldSuggestions("ItemResult", schema);
      const items = byLabel(suggestions, "items")!;
      expect(items.kind).toBe("class");
      expect(items.isSnippet).toBe(true);
      expect(items.insertText).toContain("items {");
      const totalCount = byLabel(suggestions, "totalCount")!;
      expect(totalCount.kind).toBe("field");
      expect(totalCount.isSnippet).toBe(false);
    });

    it("lists scalar leaf fields as plain field items", () => {
      const suggestions = getFieldSuggestions("Item", schema);
      const id = byLabel(suggestions, "id")!;
      expect(id.detail).toBe("String!");
      expect(id.kind).toBe("field");
      const nested = byLabel(suggestions, "nested")!;
      expect(nested.kind).toBe("class");
    });

    it("returns [] for unknown or non-object types", () => {
      expect(getFieldSuggestions("Nonexistent", schema)).toEqual([]);
      expect(getFieldSuggestions("String", schema)).toEqual([]);
      expect(getFieldSuggestions("ItemInput", schema)).toEqual([]);
    });

    it("honors the omitPaginationMirrorFields option branch", () => {
      const withOption = getFieldSuggestions("ItemResult", schema, {
        omitPaginationMirrorFields: true,
      });
      // OMIT set is currently empty, so field count is unchanged.
      expect(withOption).toHaveLength(getFieldSuggestions("ItemResult", schema).length);
    });
  });

  describe("getArgumentSuggestions", () => {
    it("expands the mutation input argument with sample values", () => {
      const args = getArgumentSuggestions("insertItem", "Mutation", schema);
      const input = byLabel(args, "input")!;
      expect(input.kind).toBe("variable");
      expect(input.sortText).toBe("000_input");
      expect(input.isSnippet).toBe(true);
      expect(input.insertText).toContain("input: {");
      expect(input.insertText).toContain('name: "Sample text"');
      expect(input.insertText).not.toContain("ItemId");
    });

    it("returns all args (including input) for queries with collapsed inputs", () => {
      const args = getArgumentSuggestions("getItems", "Query", schema);
      const labels = args.map((a) => a.label);
      expect(labels).toEqual(
        expect.arrayContaining(["where", "order", "filter", "sort", "pageNo", "pageSize", "input"]),
      );
      expect(byLabel(args, "where")!.insertText).toBe("where: {}");
      expect(byLabel(args, "filter")!.insertText).toContain('filter: "');
      expect(byLabel(args, "input")!.insertText).toContain("input: {");
    });

    it("renders enum args with a choice placeholder", () => {
      const args = getArgumentSuggestions("getByStatus", "Query", schema);
      expect(byLabel(args, "status")!.insertText).toContain("ACTIVE,INACTIVE");
    });

    it("drops the redundant filter arg for update mutations", () => {
      const args = getArgumentSuggestions("updateItem", "Mutation", schema);
      const labels = args.map((a) => a.label);
      expect(labels).toContain("where");
      expect(labels).toContain("input");
      expect(labels).not.toContain("filter");
    });

    it("returns [] for an unknown field", () => {
      expect(getArgumentSuggestions("nope", "Query", schema)).toEqual([]);
    });
  });

  describe("getInputFieldSuggestions", () => {
    it("renders the many field-type branches for an input object", () => {
      const suggestions = getInputFieldSuggestions("ItemInput", schema);
      const get = (label: string) => byLabel(suggestions, label)!;
      expect(get("name").insertText).toBe('name: "${1}"');
      expect(get("count").insertText).toBe("count: ${1}");
      expect(get("meta").insertText).toBe('meta: "${1}"');
      expect(get("tags").insertText).toBe('tags: ["${1}"]');
      expect(get("createdAt").insertText).toMatch(/createdAt: "\d{4}-/);
      expect(get("createdAt").isSnippet).toBe(false);
      expect(get("address").insertText).toContain("address: {");
      expect(get("addresses").insertText).toContain("addresses: [{");
      expect(get("where").insertText).toContain("where: {");
      expect(get("order").insertText).toContain("order: [{");
    });

    it("collapses logical operators and expands filter inputs", () => {
      const suggestions = getInputFieldSuggestions("ItemWhere", schema);
      const get = (label: string) => byLabel(suggestions, label)!;
      expect(get("or").insertText).toBe("or: [{}]");
      expect(get("and").insertText).toBe("and: [{}]");
      expect(get("name").insertText).toContain("name: {");
      expect(get("filter").insertText).toContain('filter: "{');
    });

    it("wraps list mongo-literal fields with a cursor", () => {
      const suggestions = getInputFieldSuggestions("StringFilter", schema);
      expect(byLabel(suggestions, "in")!.insertText).toContain('in: ["${1}"]');
      expect(byLabel(suggestions, "eq")!.insertText).toBe('eq: "${1}"');
    });

    it("offers explicit null completions for child filters and equality operators", () => {
      const whereSuggestions = getInputFieldSuggestions("PersonFilterInput", schema);
      expect(byLabel(whereSuggestions, "address: null")!.insertText).toBe("address: null");

      const addressSuggestions = getInputFieldSuggestions("AddressFilterInput", schema);
      expect(byLabel(addressSuggestions, "streetNo")!.insertText).toBe(
        'streetNo: {\n  eq: "${1}"\n}',
      );

      const operationSuggestions = getInputFieldSuggestions("StringOperationFilterInput", schema);
      expect(byLabel(operationSuggestions, "eq: null")!.insertText).toBe("eq: null");
      expect(byLabel(operationSuggestions, "neq: null")!.insertText).toBe("neq: null");
    });

    it("keeps string-array leaf operators type-correct", () => {
      // GraphQL exposes a String[] schema leaf through the same operation input:
      // eq compares one array element, while in accepts a list of candidates.
      const addressSuggestions = getInputFieldSuggestions("AddressFilterInput", schema);
      const streetNo = byLabel(addressSuggestions, "streetNo")!;
      expect(streetNo.insertText).toBe('streetNo: {\n  eq: "${1}"\n}');
      expect(streetNo.insertText).not.toContain("eq: [");

      const operators = getInputFieldSuggestions("StringOperationFilterInput", schema);
      expect(byLabel(operators, "eq")!.insertText).toBe('eq: "${1}"');
      expect(byLabel(operators, "contains")!.insertText).toBe('contains: "${1}"');
      expect(byLabel(operators, "in")!.insertText).toContain('in: ["${1}"]');
    });

    it("returns [] for unknown or non-input types", () => {
      expect(getInputFieldSuggestions("Nonexistent", schema)).toEqual([]);
      expect(getInputFieldSuggestions("Item", schema)).toEqual([]);
    });
  });

  describe("detectOperationContext", () => {
    it("detects query and mutation keywords in both spellings", () => {
      expect(detectOperationContext("query { getItems")).toBe("query");
      expect(detectOperationContext("query{")).toBe("query");
      expect(detectOperationContext("mutation { insertItem")).toBe("mutation");
      expect(detectOperationContext("mutation{")).toBe("mutation");
    });

    it("returns the most recent keyword when both are present", () => {
      expect(detectOperationContext("query x mutation y")).toBe("mutation");
      expect(detectOperationContext("mutation x query y")).toBe("query");
    });

    it("returns null when no operation keyword is present", () => {
      expect(detectOperationContext("")).toBeNull();
      expect(detectOperationContext("just some text")).toBeNull();
    });
  });

  describe("detectCurrentFieldName", () => {
    it("finds the field name opening the current block", () => {
      expect(detectCurrentFieldName("query {\n  getItems(where: {")).toBe("getItems");
      expect(detectCurrentFieldName("  getScalar(")).toBe("getScalar");
    });

    it("falls back to the regex match when no line opens a block", () => {
      expect(detectCurrentFieldName("a.getItems(")).toBe("getItems");
    });

    it("returns null when nothing matches", () => {
      expect(detectCurrentFieldName("hello world")).toBeNull();
    });
  });

  describe("resolveInputBlockPath", () => {
    it("traces nested open blocks back to a path", () => {
      expect(resolveInputBlockPath("where: { amount: {")).toEqual(["where", "amount"]);
      expect(resolveInputBlockPath("input: {\n  address: {")).toEqual(["input", "address"]);
    });

    it("skips fully-closed sibling blocks", () => {
      expect(resolveInputBlockPath("where: { done: {} name: {")).toEqual(["where", "name"]);
    });

    it("returns an empty path for text with no open blocks", () => {
      expect(resolveInputBlockPath("")).toEqual([]);
    });
  });

  describe("resolveInputObjectTypeAtCursor", () => {
    it("resolves the top-level input arg type", () => {
      const t = resolveInputObjectTypeAtCursor({
        schema,
        operationContext: "mutation",
        operationFieldName: "insertItem",
        blockPath: ["input"],
      });
      expect(t?.name).toBe("ItemInput");
    });

    it("walks nested input object fields", () => {
      expect(
        resolveInputObjectTypeAtCursor({
          schema,
          operationContext: "mutation",
          operationFieldName: "insertItem",
          blockPath: ["input", "address"],
        })?.name,
      ).toBe("NestedInput");
      expect(
        resolveInputObjectTypeAtCursor({
          schema,
          operationContext: "mutation",
          operationFieldName: "insertItem",
          blockPath: ["input", "where"],
        })?.name,
      ).toBe("ItemWhere");
    });

    it("handles array indices in the path", () => {
      expect(
        resolveInputObjectTypeAtCursor({
          schema,
          operationContext: "mutation",
          operationFieldName: "insertItem",
          blockPath: ["input", "where", "or", "0"],
        })?.name,
      ).toBe("ItemWhere");
    });

    it("resolves query operation args", () => {
      expect(
        resolveInputObjectTypeAtCursor({
          schema,
          operationContext: "query",
          operationFieldName: "getItems",
          blockPath: ["where"],
        })?.name,
      ).toBe("ItemWhere");
    });

    it("returns null for empty path, unknown field/arg, or non-input segments", () => {
      expect(
        resolveInputObjectTypeAtCursor({
          schema,
          operationContext: "mutation",
          operationFieldName: "insertItem",
          blockPath: [],
        }),
      ).toBeNull();
      expect(
        resolveInputObjectTypeAtCursor({
          schema,
          operationContext: "mutation",
          operationFieldName: "nope",
          blockPath: ["input"],
        }),
      ).toBeNull();
      expect(
        resolveInputObjectTypeAtCursor({
          schema,
          operationContext: "mutation",
          operationFieldName: "insertItem",
          blockPath: ["nope"],
        }),
      ).toBeNull();
      // tags is a list of scalars — an index into it is not an input object.
      expect(
        resolveInputObjectTypeAtCursor({
          schema,
          operationContext: "mutation",
          operationFieldName: "insertItem",
          blockPath: ["input", "tags", "0"],
        }),
      ).toBeNull();
    });

    it("returns null when the operation root type is missing", () => {
      expect(
        resolveInputObjectTypeAtCursor({
          schema: queryOnlySchema,
          operationContext: "mutation",
          operationFieldName: "insertItem",
          blockPath: ["input"],
        }),
      ).toBeNull();
    });
  });

  describe("full-operation snippets", () => {
    it("wraps each query field in a full query block", () => {
      const snippets = getFullQuerySnippets(schema);
      expect(snippets.map((s) => s.label)).toEqual(
        expect.arrayContaining(["getItems", "getScalar", "getByStatus"]),
      );
      const getItems = byLabel(snippets, "getItems")!;
      expect(getItems.detail).toBe("Full Query → ItemResult");
      expect(getItems.insertText.startsWith("query {\n")).toBe(true);
      expect(getItems.insertText).toContain("getItems(");
    });

    it("wraps each mutation field in a full mutation block", () => {
      const snippets = getFullMutationSnippets(schema);
      expect(snippets).toHaveLength(4);
      const insert = byLabel(snippets, "insertItem")!;
      expect(insert.detail).toBe("Full Mutation → MutationResult");
      expect(insert.insertText.startsWith("mutation {\n")).toBe(true);
    });

    it("returns [] when the corresponding root type is missing", () => {
      expect(getFullMutationSnippets(queryOnlySchema)).toEqual([]);
    });
  });

  describe("OMIT_PAGINATION_MIRROR_SELECTION_FIELDS", () => {
    it("is currently an empty set", () => {
      expect(OMIT_PAGINATION_MIRROR_SELECTION_FIELDS.size).toBe(0);
    });
  });
});
