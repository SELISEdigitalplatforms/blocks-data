import { buildSchema, GraphQLSchema } from "graphql";
import { describe, expect, it } from "vitest";
import {
  getQuerySuggestions,
  getMutationSuggestions,
  getArgumentSuggestions,
  getInputFieldSuggestions,
  getFullMutationSnippets,
  getFullQuerySnippets,
  resolveInputObjectTypeAtCursor,
  resolveInputBlockPath,
} from "./introspection-utils";

// A schema whose input object exercises every sample-value branch of the
// snippet builders (collapsible where/order, logical or/and, mongo filter,
// pagination, scalar/enum/boolean/datetime, list and nested input objects,
// plus a system field that must be stripped from insert inputs).
const richSchema = `
  scalar DateTime
  enum Color { RED GREEN }
  input WhereInput { eq: String }
  input NestedInput { deep: String }
  input ItemInput {
    where: WhereInput
    order: [String]
    or: [WhereInput]
    and: [WhereInput]
    name: String
    filter: String
    count: Int
    pageNo: Int
    pageSize: Int
    ratio: Float
    active: Boolean
    color: Color
    createdAt: DateTime
    tags: [String]
    dates: [DateTime]
    nested: NestedInput
    items: [NestedInput]
    ItemId: String
  }
  type Widget { id: ID name: String }
  type WidgetResult { items: [Widget] totalCount: Int }
  type Query {
    getWidgets(where: WhereInput, order: [String], pageNo: Int, input: String): WidgetResult
    ping: String
  }
  type Mutation {
    insertWidget(input: ItemInput): Widget
    updateWidget(filter: String, where: WhereInput, input: ItemInput): Widget
    deleteWidget(filter: String, where: WhereInput): Widget
  }
`;

const schema: GraphQLSchema = buildSchema(richSchema);

describe("introspection-utils sample-value branches", () => {
  it("expands an insert mutation input with sample values for each field kind", () => {
    const suggestions = getMutationSuggestions(schema);
    const insert = suggestions.find((s) => s.label === "insertWidget")!;
    const text = insert.insertText;
    expect(text).toContain("where: {}");
    expect(text).toContain("order: []");
    expect(text).toContain("or: [{}]");
    expect(text).toContain('name: "Sample text"');
    expect(text).toContain("pageNo: 1");
    expect(text).toContain("pageSize: 10");
    expect(text).toContain("ratio: 1.0");
    expect(text).toContain("active: false");
    expect(text).toContain("color: RED");
    expect(text).toContain("nested: {");
    expect(text).toContain("items: [{");
    // System fields are stripped from insert inputs.
    expect(text).not.toContain("ItemId:");
  });

  it("excludes the redundant filter arg from update and delete mutations", () => {
    const suggestions = getMutationSuggestions(schema);
    const update = suggestions.find((s) => s.label === "updateWidget")!;
    const del = suggestions.find((s) => s.label === "deleteWidget")!;
    // update keeps where + input; delete keeps where only.
    expect(update.insertText).toContain("where: {}");
    expect(update.insertText).toContain("input:");
    expect(del.insertText).toContain("where: {}");
    expect(del.insertText).not.toContain("input:");
  });

  it("collapses query args and omits the input arg", () => {
    const suggestions = getQuerySuggestions(schema);
    const getWidgets = suggestions.find((s) => s.label === "getWidgets")!;
    expect(getWidgets.insertText).toContain("where: {}");
    expect(getWidgets.insertText).toContain("order: []");
    expect(getWidgets.insertText).toContain("pageNo: 1");
    // input arg is excluded for list queries.
    expect(getWidgets.insertText).not.toContain("input:");
    // Field selection snippet expands the result type.
    expect(getWidgets.insertText).toContain("items");
    expect(getWidgets.insertText).toContain("totalCount");
  });

  it("builds argument suggestions with an expanded insert input", () => {
    const args = getArgumentSuggestions("insertWidget", "Mutation", schema);
    const input = args.find((a) => a.label === "input")!;
    expect(input.insertText).toContain("name:");
    expect(input.isSnippet).toBe(true);
  });

  it("suggests input object fields with mongo, pagination and datetime handling", () => {
    const fields = getInputFieldSuggestions("ItemInput", schema);
    const byLabel = (l: string) => fields.find((f) => f.label === l)!;
    expect(byLabel("filter").insertText).toContain('"{');
    expect(byLabel("pageNo").insertText).toContain("1");
    expect(byLabel("createdAt").insertText).toContain('"');
    expect(byLabel("or").insertText).toContain("[{}]");
    expect(byLabel("nested").insertText).toContain("{");
  });

  it("resolves nested input object types along a block path", () => {
    const resolved = resolveInputObjectTypeAtCursor({
      schema,
      operationContext: "mutation",
      operationFieldName: "insertWidget",
      blockPath: ["input", "nested"],
    });
    expect(resolved?.name).toBe("NestedInput");
  });

  it("returns null when the block path leaves the input object graph", () => {
    const resolved = resolveInputObjectTypeAtCursor({
      schema,
      operationContext: "mutation",
      operationFieldName: "insertWidget",
      blockPath: ["input", "name"],
    });
    expect(resolved).toBeNull();
  });

  it("traces a nested block path from editor text", () => {
    const path = resolveInputBlockPath("mutation {\n  insertWidget(input: {\n    nested: {\n      ");
    expect(path).toEqual(["input", "nested"]);
  });

  it("returns full-operation snippets for queries and mutations", () => {
    expect(getFullQuerySnippets(schema).length).toBeGreaterThan(0);
    expect(getFullMutationSnippets(schema).length).toBeGreaterThan(0);
  });

  it("returns no mutation suggestions when the schema has no mutation type", () => {
    const queryOnly = buildSchema(`type Query { ping: String }`);
    expect(getMutationSuggestions(queryOnly)).toEqual([]);
    expect(getFullMutationSnippets(queryOnly)).toEqual([]);
  });
});
