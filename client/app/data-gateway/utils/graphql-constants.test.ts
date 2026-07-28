import { describe, expect, it } from "vitest";
import {
  COLLAPSIBLE_FILTER_FIELD,
  COLLAPSIBLE_LIST_FIELDS,
  LOGICAL_OPERATOR_FIELDS,
  LIST_EMPTY_STRING_FIELDS,
  KNOWN_ARG_COMMENTS,
  MONGO_FILTER_SORT_LITERAL,
  KNOWN_STRING_DEFAULTS,
  KNOWN_INT_DEFAULTS,
  EXCLUDED_QUERY_ARG_NAMES,
  EXCLUDED_MUTATION_FILTER_ARG_NAMES,
  EXCLUDED_INPUT_SUBFIELDS,
  SYSTEM_INPUT_FIELDS,
  MUTATION_SAMPLE_STRING_LIKE_SCALAR_NAMES,
  mongoStringLiteralForField,
  paginationDefaultForField,
  formatGraphQLDateTimeSampleValue,
  getStringDefault,
  getIntDefault,
  getFloatDefault,
} from "./graphql-constants";

describe("graphql-constants", () => {
  describe("exported constant sets & records", () => {
    it("collapsible / logical field markers have the expected members", () => {
      expect(COLLAPSIBLE_FILTER_FIELD).toBe("where");
      expect(COLLAPSIBLE_LIST_FIELDS.has("order")).toBe(true);
      expect(COLLAPSIBLE_LIST_FIELDS.has("name")).toBe(false);
      expect(LOGICAL_OPERATOR_FIELDS.has("or")).toBe(true);
      expect(LOGICAL_OPERATOR_FIELDS.has("and")).toBe(true);
      expect(LIST_EMPTY_STRING_FIELDS.has("in")).toBe(true);
      expect(LIST_EMPTY_STRING_FIELDS.has("nin")).toBe(true);
    });

    it("known arg comments and literals", () => {
      expect(KNOWN_ARG_COMMENTS.filter).toContain("stringify mongo filter");
      expect(KNOWN_ARG_COMMENTS.sort).toContain("stringify mongo sorting");
      expect(MONGO_FILTER_SORT_LITERAL).toBe('"{}"');
      expect(KNOWN_STRING_DEFAULTS.where).toContain("stringify mongo filter");
      expect(KNOWN_STRING_DEFAULTS.order).toContain("stringify mongo sorting");
      expect(KNOWN_INT_DEFAULTS.pageNo).toBe("1");
      expect(KNOWN_INT_DEFAULTS.pageSize).toBe("10");
    });

    it("excluded arg sets", () => {
      expect(EXCLUDED_QUERY_ARG_NAMES.has("input")).toBe(true);
      expect(EXCLUDED_MUTATION_FILTER_ARG_NAMES.has("filter")).toBe(true);
      expect(EXCLUDED_INPUT_SUBFIELDS.size).toBe(0);
    });

    it("system input fields & string-like scalars", () => {
      expect(SYSTEM_INPUT_FIELDS.has("ItemId")).toBe(true);
      expect(SYSTEM_INPUT_FIELDS.has("OrganizationId")).toBe(true);
      expect(SYSTEM_INPUT_FIELDS.has("name")).toBe(false);
      expect(MUTATION_SAMPLE_STRING_LIKE_SCALAR_NAMES.has("DateTime")).toBe(true);
      expect(MUTATION_SAMPLE_STRING_LIKE_SCALAR_NAMES.has("Date")).toBe(true);
      expect(MUTATION_SAMPLE_STRING_LIKE_SCALAR_NAMES.has("String")).toBe(false);
    });
  });

  describe("mongoStringLiteralForField", () => {
    it("returns mongo literal for filter/sort when not a list", () => {
      expect(mongoStringLiteralForField("filter", false)).toBe('"{}"');
      expect(mongoStringLiteralForField("sort", false)).toBe('"{}"');
    });

    it("returns empty-string list literal for in/nin list fields", () => {
      expect(mongoStringLiteralForField("in", true)).toBe('[""]');
      expect(mongoStringLiteralForField("nin", true)).toBe('[""]');
    });

    it("returns null for unrelated fields and for list filter/sort", () => {
      expect(mongoStringLiteralForField("name", false)).toBeNull();
      expect(mongoStringLiteralForField("filter", true)).toBeNull();
      expect(mongoStringLiteralForField("other", true)).toBeNull();
    });
  });

  describe("paginationDefaultForField", () => {
    it("returns 1 / 10 for pageNo / pageSize (non-list)", () => {
      expect(paginationDefaultForField("pageNo", false)).toBe("1");
      expect(paginationDefaultForField("pageSize", false)).toBe("10");
    });

    it("returns null for lists or unrelated fields", () => {
      expect(paginationDefaultForField("pageNo", true)).toBeNull();
      expect(paginationDefaultForField("name", false)).toBeNull();
    });
  });

  describe("formatGraphQLDateTimeSampleValue", () => {
    it("strips fractional seconds and quotes the ISO instant", () => {
      const d = new Date("2026-04-29T12:34:56.789Z");
      expect(formatGraphQLDateTimeSampleValue(d)).toBe('"2026-04-29T12:34:56Z"');
    });

    it("handles instants without fractional seconds", () => {
      const d = new Date("2026-04-29T12:34:56Z");
      expect(formatGraphQLDateTimeSampleValue(d)).toBe('"2026-04-29T12:34:56Z"');
    });

    it("defaults to the current time in the expected shape", () => {
      expect(formatGraphQLDateTimeSampleValue()).toMatch(
        /^"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"$/,
      );
    });
  });

  describe("getStringDefault", () => {
    it("returns known defaults for where/order field names", () => {
      expect(getStringDefault("where")).toBe(KNOWN_STRING_DEFAULTS.where);
      expect(getStringDefault("order")).toBe(KNOWN_STRING_DEFAULTS.order);
    });

    it("returns sample text for mutation input, empty string otherwise", () => {
      expect(getStringDefault(undefined, true)).toBe('"Sample text"');
      expect(getStringDefault(undefined, false)).toBe('""');
      expect(getStringDefault("unknown", true)).toBe('"Sample text"');
      expect(getStringDefault("unknown")).toBe('""');
    });
  });

  describe("getIntDefault", () => {
    it("uses known pagination defaults", () => {
      expect(getIntDefault("pageNo")).toBe("1");
      expect(getIntDefault("pageSize")).toBe("10");
    });

    it("falls back to 1 for mutation input, 0 otherwise", () => {
      expect(getIntDefault(undefined, true)).toBe("1");
      expect(getIntDefault(undefined, false)).toBe("0");
      expect(getIntDefault("amount")).toBe("0");
    });
  });

  describe("getFloatDefault", () => {
    it("uses known pagination defaults", () => {
      expect(getFloatDefault("pageNo")).toBe("1");
      expect(getFloatDefault("pageSize")).toBe("10");
    });

    it("falls back to 1.0 for mutation input, 0 otherwise", () => {
      expect(getFloatDefault(undefined, true)).toBe("1.0");
      expect(getFloatDefault(undefined, false)).toBe("0");
      expect(getFloatDefault("price")).toBe("0");
    });
  });
});
