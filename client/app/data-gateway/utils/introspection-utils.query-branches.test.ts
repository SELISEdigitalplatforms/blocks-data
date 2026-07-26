import { describe, expect, it } from "vitest";
import { buildSchema, type GraphQLSchema } from "graphql";
import {
  getQuerySuggestions,
  getMutationSuggestions,
  getArgumentSuggestions,
  resolveInputObjectTypeAtCursor,
  getFullQuerySnippets,
} from "./introspection-utils";

// A schema purpose-built to reach the argument/snippet branches the other two
// introspection-utils suites do not: query-side input-object expansion with
// tab-stop placeholders, mutation sample values for list custom scalars, a
// system-only insert input, top-level scalar args, and the cursor-path
// resolver's list-unwrap / scalar-descent / missing-field edges.
const SDL = `
  scalar DateTime
  scalar Custom

  enum Color { RED GREEN }

  input SubWhere {
    eq: String
    or: [SubWhere]
    and: [SubWhere]
  }

  input OrderInput {
    field: String
    direction: String
  }

  type Nested {
    city: String
  }

  # Mixes preferred result fields with a custom one so the field-selection
  # sort comparator hits both one-sided branches.
  type MixedResult {
    items: [Nested]
    customField: String
    totalCount: Int
  }

  # After SYSTEM_INPUT_FIELDS filtering this has zero remaining fields.
  input SystemOnlyInput {
    ItemId: String
    CreatedBy: String
  }

  # Drives buildNestedInputFieldLine sample-value branches for list / single
  # custom scalars and a NonNull field.
  input SampleInput {
    customs: [Custom]
    custom: Custom
    req: String!
  }

  # Drives the query-side (tab-stop) input-object expansion branches.
  input CriteriaInput {
    where: SubWhere
    order: [OrderInput]
    or: [SubWhere]
    filter: String
    in: [String]
    tags: [String]
    title: String
    pageNo: Int
    count: Int
    ratio: Float
    color: Color
    active: Boolean
    customs: [Custom]
    custom: Custom
  }

  type Query {
    search(criteria: CriteriaInput): MixedResult
    onlyInput(input: SampleInput): String
    scalars(limit: Int, flag: Boolean, id2: Custom): String
  }

  type Mutation {
    insertSample(input: SampleInput): MixedResult
    insertEmpty(input: SystemOnlyInput): String
  }
`;

const schema = buildSchema(SDL);
const QUERY_ONLY = buildSchema(`type Query { ping: String }`);

describe("introspection-utils query-side branch coverage", () => {
  describe("getQuerySuggestions - input-object argument expansion", () => {
    const suggestions = getQuerySuggestions(schema);
    const search = suggestions.find((s) => s.label === "search")!;

    it("expands a non-input-named object arg with tab-stop field snippets", () => {
      const text = search.insertText;
      expect(text).toContain("where: {}");
      expect(text).toContain("order: []");
      expect(text).toContain("or: [{}]");
      expect(text).toContain('filter: "{');
      expect(text).toContain('in: ["${');
      expect(text).toContain('tags: ["${');
      expect(text).toContain('title: "${');
      expect(text).toContain("pageNo: 1");
      expect(text).toMatch(/count: \$\{\d+:0\}/);
      expect(text).toMatch(/ratio: \$\{\d+:0\}/);
      expect(text).toContain("RED,GREEN");
      expect(text).toContain("true,false");
      expect(text).toContain("customs: []");
      expect(text).toMatch(/custom: \$\{\d+\}/);
    });

    it("mixes preferred and custom fields in the result selection", () => {
      expect(search.insertText).toContain("items {");
      expect(search.insertText).toContain("customField");
      expect(search.insertText).toContain("totalCount");
    });

    it("emits no argument list when every arg is filtered out", () => {
      const onlyInput = suggestions.find((s) => s.label === "onlyInput")!;
      expect(onlyInput.insertText).toBe("onlyInput");
    });

    it("renders top-level scalar args (int / boolean / custom)", () => {
      const scalars = suggestions.find((s) => s.label === "scalars")!;
      expect(scalars.insertText).toMatch(/limit: \$\{\d+:0\}/);
      expect(scalars.insertText).toContain("true,false");
      expect(scalars.insertText).toMatch(/id2: \$\{\d+\}/);
    });
  });

  describe("getMutationSuggestions - custom scalar sample values", () => {
    it("collapses list custom scalars and tab-stops single ones", () => {
      const insertSample = getMutationSuggestions(schema).find(
        (s) => s.label === "insertSample",
      )!;
      const text = insertSample.insertText;
      expect(text).toContain("customs: []");
      expect(text).toMatch(/custom: \$\{\d+\}/);
      // NonNull string resolves through isDeepListType's NonNull unwrap.
      expect(text).toContain('req: "Sample text"');
    });
  });

  describe("getArgumentSuggestions - empty input + missing parent", () => {
    it("emits a placeholder body when the input has only system fields", () => {
      const args = getArgumentSuggestions("insertEmpty", "Mutation", schema);
      const input = args.find((a) => a.label === "input")!;
      expect(input.insertText).toBe("input: {\n  ${1}\n}");
    });

    it("returns [] when the requested parent root type is absent", () => {
      expect(getArgumentSuggestions("ping", "Mutation", QUERY_ONLY)).toEqual([]);
    });
  });

  describe("resolveInputObjectTypeAtCursor - path edge cases", () => {
    const base = {
      schema,
      operationContext: "query" as const,
      operationFieldName: "search",
    };

    it("unwraps a list-typed nested input to its element type", () => {
      const t = resolveInputObjectTypeAtCursor({
        ...base,
        blockPath: ["criteria", "order"],
      });
      expect(t?.name).toBe("OrderInput");
    });

    it("returns null when a path segment is not a field of the input", () => {
      expect(
        resolveInputObjectTypeAtCursor({ ...base, blockPath: ["criteria", "nope"] }),
      ).toBeNull();
    });

    it("returns null when descending through a scalar field", () => {
      expect(
        resolveInputObjectTypeAtCursor({
          ...base,
          blockPath: ["criteria", "title", "eq"],
        }),
      ).toBeNull();
    });
  });

  describe("full-query snippets without a query root", () => {
    it("returns [] when the schema exposes no query type", () => {
      const noQuery = { getQueryType: () => null } as unknown as GraphQLSchema;
      expect(getFullQuerySnippets(noQuery)).toEqual([]);
      expect(getQuerySuggestions(noQuery)).toEqual([]);
    });
  });
});
